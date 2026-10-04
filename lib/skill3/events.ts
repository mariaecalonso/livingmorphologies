import { mulberry32 } from "../physarum";
import { stepMany } from "../skill1/engine";
import type { SimulationState } from "../skill1/types";
import { stateChecksum, type Skill2HandoffRecord } from "../skill2/handoff";
import type { Skill2Handoff } from "../skill2/types";
import { loadValidatedSkill2Handoff, type Skill3SourceRequest } from "./source";
import { cloneSimulationState, openContinuation, posedTranslation } from "./z0";

/**
 * Explicit sampling controls. Morphological Change Δ is a weighted mix of
 * persistence loss, agent migration, trail reinforcement, and connectivity change.
 * Weights are used as written. The defaults sum to 1, so Δ sits in [0, 1].
 */
export type EventSampleConfig = {
  horizon: number;
  /** Minimum iterations between accepted samples. */
  minGap: number;
  /** Accept even when Δ is quiet once this many iterations have passed. */
  maxGap: number;
  /** Accept once the gap is at least `minGap` and Δ reaches this value. */
  deltaThreshold: number;
  weights: {
    persistence: number;
    migration: number;
    reinforcement: number;
    connectivity: number;
  };
  /** Trail values at or below this are empty. Matches the engine fade floor. */
  trailEpsilon: number;
  /** Side length of the mask used for component counts. */
  connectivityResolution: number;
};

export const DEFAULT_EVENT_CONFIG: EventSampleConfig = {
  horizon: 64,
  minGap: 8,
  maxGap: 24,
  deltaThreshold: 0.08,
  weights: {
    persistence: 0.35,
    migration: 0.25,
    reinforcement: 0.2,
    connectivity: 0.2,
  },
  trailEpsilon: 0.003,
  connectivityResolution: 32,
};

export type SampleReason = "z0" | "threshold" | "max-gap";

export type AgentSnapshot = {
  x: number;
  y: number;
  heading: number;
};

export type MorphologicalMeasures = {
  /** Occupied-cell overlap with the reference. 1 means the same support. */
  persistence: number;
  /** Mean agent displacement divided by the field size, clamped to [0, 1]. */
  migration: number;
  /** New trail mass on cells the reference already occupied, clamped to [0, 1]. */
  reinforcement: number;
  /** Relative change in connected-component count. */
  connectivityChange: number;
  components: number;
  /** Weighted morphological change. Higher means the field moved on. */
  delta: number;
};

export type AcceptedSample = {
  index: number;
  iteration: number;
  reason: SampleReason;
  /** Iteration of the sample this one was compared against. Null for Z0. */
  referenceIteration: number | null;
  measures: MorphologicalMeasures;
  trailSize: number;
  trails: number[];
  agents: AgentSnapshot[];
  attractor: { x: number; y: number };
  seed: number;
};

export type EventSamplingResult = {
  record: Skill2HandoffRecord;
  z0: SimulationState;
  future: SimulationState;
  samples: AcceptedSample[];
  startChecksum: string;
  config: EventSampleConfig;
};

type SampleReference = {
  iteration: number;
  trailSize: number;
  trails: ArrayLike<number>;
  agents: readonly AgentSnapshot[];
};

export function assertEventConfig(config: EventSampleConfig) {
  if (!Number.isInteger(config.horizon) || config.horizon < 1) throw new Error(`horizon ${config.horizon} is not a positive integer`);
  if (!Number.isInteger(config.minGap) || config.minGap < 1) throw new Error(`minGap ${config.minGap} is not a positive integer`);
  if (!Number.isInteger(config.maxGap) || config.maxGap < config.minGap) {
    throw new Error(`maxGap ${config.maxGap} must be an integer at least minGap ${config.minGap}`);
  }
  if (!Number.isFinite(config.deltaThreshold) || config.deltaThreshold < 0) {
    throw new Error(`deltaThreshold ${config.deltaThreshold} must be a non-negative number`);
  }
  if (!Number.isInteger(config.connectivityResolution) || config.connectivityResolution < 2) {
    throw new Error(`connectivityResolution ${config.connectivityResolution} must be an integer of at least 2`);
  }
  for (const [key, weight] of Object.entries(config.weights)) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`weight ${key} must be a non-negative number`);
  }
}

/** Null when the step is not an accepted sample. Max-gap wins when both rules match. */
export function acceptReason(gap: number, delta: number, config: EventSampleConfig): Exclude<SampleReason, "z0"> | null {
  if (gap < config.minGap) return null;
  if (gap >= config.maxGap) return "max-gap";
  if (delta >= config.deltaThreshold) return "threshold";
  return null;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function occupancyMask(trails: ArrayLike<number>, trailSize: number, resolution: number, epsilon: number) {
  const mask = new Uint8Array(resolution * resolution);
  for (let y = 0; y < trailSize; y += 1) {
    const row = y * trailSize;
    const by = Math.min(resolution - 1, Math.floor((y * resolution) / trailSize));
    for (let x = 0; x < trailSize; x += 1) {
      if (trails[row + x] <= epsilon) continue;
      const bx = Math.min(resolution - 1, Math.floor((x * resolution) / trailSize));
      mask[by * resolution + bx] = 1;
    }
  }
  return mask;
}

function componentCount(mask: Uint8Array, resolution: number) {
  const seen = new Uint8Array(mask.length);
  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    count += 1;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const current = stack.pop() as number;
      const x = current % resolution;
      const y = Math.floor(current / resolution);
      if (x > 0) visit(current - 1);
      if (x + 1 < resolution) visit(current + 1);
      if (y > 0) visit(current - resolution);
      if (y + 1 < resolution) visit(current + resolution);
    }
  }
  return count;

  function visit(index: number) {
    if (!mask[index] || seen[index]) return;
    seen[index] = 1;
    stack.push(index);
  }
}

/** Change from one stored sample to the live state. The reference is that sample alone. */
export function measureChange(reference: SampleReference, state: SimulationState, config: EventSampleConfig): MorphologicalMeasures {
  const { trails, trailSize } = state;
  if (reference.trailSize !== trailSize || reference.trails.length !== trails.length) {
    throw new Error("sample trail field does not match the live state");
  }
  if (reference.agents.length !== state.agents.length) throw new Error("sample agents do not match the live state");
  const epsilon = config.trailEpsilon;
  let intersection = 0;
  let union = 0;
  let base = 0;
  let gain = 0;
  for (let i = 0; i < trails.length; i += 1) {
    const previous = reference.trails[i];
    const current = trails[i];
    const previousOn = previous > epsilon;
    const currentOn = current > epsilon;
    if (previousOn && currentOn) intersection += 1;
    if (previousOn || currentOn) union += 1;
    if (previousOn) {
      base += previous;
      if (current > previous) gain += current - previous;
    }
  }
  const persistence = union === 0 ? 1 : intersection / union;
  let shift = 0;
  for (let i = 0; i < state.agents.length; i += 1) {
    const agent = state.agents[i];
    const previous = reference.agents[i];
    shift += Math.hypot(agent.x - previous.x, agent.y - previous.y);
  }
  const migration = clamp01(shift / Math.max(1, state.agents.length) / Math.max(1, state.size));
  const reinforcement = clamp01(gain / Math.max(epsilon, base));
  const previousMask = occupancyMask(reference.trails, trailSize, config.connectivityResolution, epsilon);
  const currentMask = occupancyMask(trails, trailSize, config.connectivityResolution, epsilon);
  const previousComponents = componentCount(previousMask, config.connectivityResolution);
  const components = componentCount(currentMask, config.connectivityResolution);
  const connectivityChange = clamp01(
    Math.abs(components - previousComponents) / Math.max(previousComponents, components, 1),
  );
  const { weights } = config;
  const delta =
    weights.persistence * (1 - persistence) +
    weights.migration * migration +
    weights.reinforcement * reinforcement +
    weights.connectivity * connectivityChange;
  return { persistence, migration, reinforcement, connectivityChange, components, delta };
}

function snapshotAgents(state: SimulationState): AgentSnapshot[] {
  return state.agents.map((agent) => ({ x: agent.x, y: agent.y, heading: agent.heading }));
}

function captureSample(
  state: SimulationState,
  index: number,
  reason: SampleReason,
  referenceIteration: number | null,
  measures: MorphologicalMeasures,
): AcceptedSample {
  return {
    index,
    iteration: state.iteration,
    reason,
    referenceIteration,
    measures,
    trailSize: state.trailSize,
    trails: state.trails.slice(),
    agents: snapshotAgents(state),
    attractor: { ...state.attractor },
    seed: state.seed,
  };
}

function z0Measures(state: SimulationState, config: EventSampleConfig): MorphologicalMeasures {
  const mask = occupancyMask(state.trails, state.trailSize, config.connectivityResolution, config.trailEpsilon);
  return {
    persistence: 1,
    migration: 0,
    reinforcement: 0,
    connectivityChange: 0,
    components: componentCount(mask, config.connectivityResolution),
    delta: 0,
  };
}

function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

function continuationSeed(record: Skill2HandoffRecord) {
  return hashText(`${record.identity.runKey}#${record.identity.candidateId}`);
}

/** Post-Z0 stream. The Skill 2 genome and evaluation seed stay untouched. */
export function futureContinuationSeed(record: Skill2HandoffRecord, futureIndex: number) {
  if (!Number.isInteger(futureIndex) || futureIndex < 0) {
    throw new Error(`future index ${futureIndex} is not a non-negative integer`);
  }
  return hashText(`${record.identity.runKey}#${record.identity.candidateId}#${futureIndex}`);
}

/** Applied to the clone after each post-Z0 step. Z0 has already been stored as sample 0. */
export type ContinuationTransform = (state: SimulationState) => void;

/**
 * Samples one clone of an already replayed Z0. Does not replay or reload the candidate.
 * Z0 is always sample 0. The continuation seed and an optional post-step transform are the
 * differences between futures. The state transform never sees the parent Z0.
 */
export function sampleFromParent(
  parent: SimulationState,
  handoff: Skill2Handoff,
  record: Skill2HandoffRecord,
  continuationSeedValue: number,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
  transform?: ContinuationTransform,
): EventSamplingResult {
  assertEventConfig(config);
  const future = cloneSimulationState(parent);
  const startChecksum = stateChecksum(future);
  const translation = posedTranslation(handoff.selected.source);
  if (JSON.stringify(translation.recipe) !== JSON.stringify(record.realization.recipe)) {
    throw new Error("continuation pose does not match the handoff recipe");
  }
  const samples = [captureSample(future, 0, "z0", null, z0Measures(future, config))];
  const rng = mulberry32(continuationSeedValue >>> 0);
  const target = future.iteration + config.horizon;
  openContinuation(future, config.horizon);
  while (future.iteration < target) {
    if (future.converged || future.iteration >= future.maxIterations) {
      openContinuation(future, target - future.iteration);
    }
    const before = future.iteration;
    stepMany(
      future,
      translation,
      rng,
      1,
      record.realization.simulation.trailDecay,
      record.realization.slime,
      false,
    );
    if (future.iteration <= before) throw new Error("continuation made no progress");
    transform?.(future);
    const reference = samples[samples.length - 1];
    const gap = future.iteration - reference.iteration;
    if (gap < config.minGap) continue;
    const measures = measureChange(reference, future, config);
    const reason = acceptReason(gap, measures.delta, config);
    if (!reason) continue;
    const sample = captureSample(future, samples.length, reason, reference.iteration, measures);
    samples.push(sample);
  }
  return { record, z0: parent, future, samples, startChecksum, config };
}

/**
 * Continues one clone of the replayed Z0 and keeps a sample when Δ crosses
 * the threshold, or when the max gap elapses. Z0 is always sample 0.
 */
export function sampleFutureEvents(request: Skill3SourceRequest, config: EventSampleConfig = DEFAULT_EVENT_CONFIG): EventSamplingResult {
  assertEventConfig(config);
  const { record, handoff } = loadValidatedSkill2Handoff(request);
  return sampleFromParent(handoff.selected.simulationState, handoff, record, continuationSeed(record), config);
}
