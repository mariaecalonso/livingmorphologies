import { mulberry32 } from "../physarum";
import { stepMany } from "../skill1/engine";
import type { SimulationState } from "../skill1/types";
import { stateChecksum, type Skill2HandoffRecord } from "../skill2/handoff";
import type { Skill2Handoff } from "../skill2/types";
import { deriveAdaptiveScale, scaleSample, type AdaptiveScaleConfig, DEFAULT_ADAPTIVE_SCALE } from "./adaptive-scale";
import { circularOpenings, fuseOpeningBoundaries, type BoundaryFusionConfig, DEFAULT_BOUNDARY_FUSION } from "./boundary-fusion";
import { DEFAULT_EVENT_CONFIG, futureContinuationSeed, sampleFromParent, type ContinuationTransform, type EventSampleConfig, type EventSamplingResult, type SampleTransform } from "./events";
import { loadValidatedSkill2Handoff, type Skill3SourceRequest } from "./source";
import { DEFAULT_TWIST, twistSample, type TwistConfig } from "./twist";
import { cloneSimulationState, openContinuation, posedTranslation } from "./z0";

/** First continuation length. Callers may pass any positive integer horizon. */
export const INITIAL_FUTURE_HORIZON = 64;

export type SingleFuture = {
  record: Skill2HandoffRecord;
  handoff: Skill2Handoff;
  /** Exact replay. Not stepped. */
  z0: SimulationState;
  /** The one clone, after `horizon` continuation steps. */
  future: SimulationState;
  horizon: number;
  /** Checksum of the clone before it was opened or stepped. */
  startChecksum: string;
};

function continuationSeed(record: Skill2HandoffRecord) {
  let hash = 0x811c9dc5;
  const text = `${record.identity.runKey}#${record.identity.candidateId}`;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/**
 * Opens one archived Skill 2 candidate and continues a single clone for `horizon` iterations.
 * Streak convergence on the clone is reopened so the requested horizon completes.
 * Z0 is left at the evaluated state.
 */
export function runSingleFuture(request: Skill3SourceRequest, horizon = INITIAL_FUTURE_HORIZON): SingleFuture {
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new Error(`future horizon ${horizon} is not a positive integer`);
  }
  const { record, handoff } = loadValidatedSkill2Handoff(request);
  const z0 = handoff.selected.simulationState;
  const future = cloneSimulationState(z0);
  const startChecksum = stateChecksum(future);
  const translation = posedTranslation(handoff.selected.source);
  if (JSON.stringify(translation.recipe) !== JSON.stringify(record.realization.recipe)) {
    throw new Error("continuation pose does not match the handoff recipe");
  }
  const rng = mulberry32(continuationSeed(record));
  const target = future.iteration + horizon;
  openContinuation(future, horizon);
  while (future.iteration < target) {
    if (future.converged || future.iteration >= future.maxIterations) {
      openContinuation(future, target - future.iteration);
    }
    const before = future.iteration;
    stepMany(
      future,
      translation,
      rng,
      target - future.iteration,
      record.realization.simulation.trailDecay,
      record.realization.slime,
      false,
    );
    if (future.iteration <= before) throw new Error("continuation made no progress");
  }
  return { record, handoff, z0, future, horizon, startChecksum };
}

/** First branched set. Each future is an independent continuation of the same Z0. */
export const BRANCHED_FUTURE_COUNT = 4;

export type BranchedFuture = {
  id: string;
  index: number;
  parentChecksum: string;
  continuationSeed: number;
  samples: EventSamplingResult["samples"];
  iterations: number[];
  endChecksum: string;
  sampling: EventSamplingResult;
};

export type BranchedFutures = {
  record: Skill2HandoffRecord;
  handoff: Skill2Handoff;
  /** The one validated Z0. Every future was cloned from this object. */
  z0: SimulationState;
  parentChecksum: string;
  futures: BranchedFuture[];
};

function futureId(index: number) {
  return `F${String(index + 1).padStart(2, "0")}`;
}

/**
 * Opens the selected candidate once, then runs the event sampler on a fresh
 * clone for each future. F01 is the baseline continuation. F02 applies Boundary
 * Fusion after each post-Z0 step. F03 rotates each accepted post-Z0 sample.
 * F04 scales each accepted post-Z0 sample from the archetype criteria.
 * The pose does not change.
 */
export function branchSampledFutures(
  request: Skill3SourceRequest,
  count = BRANCHED_FUTURE_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
  fusionConfig: BoundaryFusionConfig = DEFAULT_BOUNDARY_FUSION,
  twistConfig: TwistConfig = DEFAULT_TWIST,
  scaleConfig: AdaptiveScaleConfig = DEFAULT_ADAPTIVE_SCALE,
): BranchedFutures {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`future count ${count} is not a positive integer`);
  }
  const { record, handoff } = loadValidatedSkill2Handoff(request);
  const z0 = handoff.selected.simulationState;
  const parentChecksum = stateChecksum(z0);
  const futures: BranchedFuture[] = [];
  const fusion = fusionTransform(handoff, fusionConfig);
  const twist = twistTransform(twistConfig);
  const scale = scaleTransform(handoff, scaleConfig);
  for (let index = 0; index < count; index += 1) {
    const continuationSeed = futureContinuationSeed(record, index);
    const sampling = sampleFromParent(
      z0,
      handoff,
      record,
      continuationSeed,
      config,
      index === 1 ? fusion : undefined,
      index === 2 ? twist : index === 3 ? scale : undefined,
    );
    if (sampling.startChecksum !== parentChecksum) {
      throw new Error(`${futureId(index)} did not start from the replayed Z0`);
    }
    if (sampling.z0 !== z0) throw new Error(`${futureId(index)} does not share the parent Z0`);
    futures.push({
      id: futureId(index),
      index,
      parentChecksum,
      continuationSeed,
      samples: sampling.samples,
      iterations: sampling.samples.map((sample) => sample.iteration),
      endChecksum: stateChecksum(sampling.future),
      sampling,
    });
  }
  if (stateChecksum(z0) !== parentChecksum) throw new Error("Z0 changed while futures continued");
  return { record, handoff, z0, parentChecksum, futures };
}

/** F02 only. The disks come from the posed recipe and are not rewritten. */
function fusionTransform(handoff: Skill2Handoff, config: BoundaryFusionConfig): ContinuationTransform {
  const openings = circularOpenings(handoff.selected.source.recipe.attractors ?? []);
  return (state) => {
    fuseOpeningBoundaries(state.trails, state.trailSize, state.size, openings, config);
  };
}

/** F03 only. Rotates the stored sample. The clone the sampler steps stays unrotated. */
function twistTransform(config: TwistConfig): SampleTransform {
  return (sample, z0Iteration, horizon) => {
    twistSample(sample, z0Iteration, horizon, config);
  };
}

/** F04 only. Scales the stored sample. The clone the sampler steps stays at scale 1. */
function scaleTransform(handoff: Skill2Handoff, config: AdaptiveScaleConfig): SampleTransform {
  const source = handoff.selected.source;
  const plan = deriveAdaptiveScale(source.typologyId, source.ratings, config);
  return (sample, z0Iteration, horizon) => {
    scaleSample(sample, z0Iteration, horizon, plan, config);
  };
}
