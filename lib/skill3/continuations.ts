import { stateChecksum, type Skill2HandoffRecord } from "../skill2/handoff";
import type { Skill2Handoff } from "../skill2/types";
import { architecturalIntentFor } from "./architectural-intent";
import { continuationRecipesFor, type ContinuationFocus, type EmphasisFamily } from "./continuation-recipes";
import { createIntegratedEmphasis } from "./diagnostic-emphasis";
import { MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z } from "./envelope";
import {
  DEFAULT_EVENT_CONFIG,
  sampleFromParent,
  type EventSampleConfig,
  type SampleReason,
} from "./events";
import { loadValidatedSkill2Handoff, type Skill3SourceRequest } from "./source";
import { toVerticalViewerField, type VerticalViewerField } from "./viewer-field";

/** Natural continuations cloned from one validated Z0. Variation is the continuation seed only. */
export const NATURAL_CONTINUATION_COUNT = 24;

export type ContinuationEvent = {
  index: number;
  iteration: number;
  reason: SampleReason;
  /** Iteration of the sample this one was compared against. Null for Z0. */
  referenceIteration: number | null;
  delta: number;
  persistence: number;
  migration: number;
  reinforcement: number;
  connectivityChange: number;
};

/**
 * One untransformed continuation. `field` is the downsampled XYT sequence and
 * the source for a later network mesh. This record does not hold a mesh.
 */
export type NaturalContinuation = {
  id: string;
  /** 1-based. N01 is branch 1. */
  index: number;
  continuationSeed: number;
  typologyId: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  /** Descriptor family for this branch. Copied from the existing recipe. */
  focus?: ContinuationFocus;
  /** Families the recipe schedule modulates. Baseline families stay flat. */
  families?: readonly EmphasisFamily[];
  /** `${archetypeId}@${controllerSeed}` from the Skill 2 handoff. */
  runKey: string;
  z0Iteration: number;
  parentChecksum: string;
  acceptedIterations: number[];
  /** Accepted samples, including Z0. */
  sampleCount: number;
  /** Accepted samples after Z0. */
  eventCount: number;
  events: ContinuationEvent[];
  field: VerticalViewerField;
};

/** Shared by every branch of one candidate. Not a score. */
export type NaturalContinuationRules = {
  horizon: number;
  minGap: number;
  maxGap: number;
  deltaThreshold: number;
  weights: EventSampleConfig["weights"];
  trailEpsilon: number;
  connectivityResolution: number;
  envelope: { sizeX: number; sizeY: number; sizeZ: number };
  morphology: "network";
  transform: "none";
};

export type ContinuationOrigin = "handoff" | "development-fixture" | "provisional";

export type NaturalContinuationSet = {
  /** `handoff` passed exact Z0 validation. `development-fixture` and `provisional` did not. */
  origin: ContinuationOrigin;
  typologyId: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  runKey: string;
  z0Iteration: number;
  parentChecksum: string;
  /** Posed slime used for every branch. */
  slime: Skill2HandoffRecord["realization"]["slime"];
  rules: NaturalContinuationRules;
  continuations: NaturalContinuation[];
};

function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

export function naturalContinuationId(branchIndex: number) {
  return `N${String(branchIndex).padStart(2, "0")}`;
}

/**
 * Deterministic post-Z0 stream.
 * Identity is archetype id, Skill 2 candidate id, and the 1-based branch index.
 * The Skill 2 evaluation seed is not reused, and the result does not depend on clock time.
 */
export function naturalContinuationSeed(identity: { archetypeId: string; candidateId: number }, branchIndex: number) {
  if (!Number.isInteger(branchIndex) || branchIndex < 1) {
    throw new Error(`branch index ${branchIndex} is not a positive continuation index`);
  }
  return hashText(`${identity.archetypeId}#${identity.candidateId}#${branchIndex}`);
}

function rulesFrom(config: EventSampleConfig): NaturalContinuationRules {
  return {
    horizon: config.horizon,
    minGap: config.minGap,
    maxGap: config.maxGap,
    deltaThreshold: config.deltaThreshold,
    weights: { ...config.weights },
    trailEpsilon: config.trailEpsilon,
    connectivityResolution: config.connectivityResolution,
    envelope: { sizeX: MODULE_SIZE_X, sizeY: MODULE_SIZE_Y, sizeZ: MODULE_SIZE_Z },
    morphology: "network",
    transform: "none",
  };
}

/**
 * Samples clones of an already opened Z0. Each branch keeps that Z0 and steps the same
 * simulation. The branch seed is only the sampler RNG. The descriptor schedule comes
 * from `continuationRecipesFor` and is applied by `createIntegratedEmphasis`.
 * No boundary, twist, or scale transform is applied. Full-resolution plates are
 * dropped after the viewer field is built.
 */
export function continuationsFromOpenedZ0(
  record: Skill2HandoffRecord,
  handoff: Skill2Handoff,
  origin: ContinuationOrigin,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`continuation count ${count} is not a positive integer`);
  }
  const z0 = handoff.selected.simulationState;
  const parentChecksum = stateChecksum(z0);
  if (parentChecksum !== record.z0.checksum || z0.iteration !== record.z0.iteration) {
    throw new Error("validated Z0 does not match the Skill 2 handoff");
  }
  const identity = {
    typologyId: record.identity.typologyId,
    archetypeId: record.identity.archetypeId,
    archetypeName: record.identity.archetypeName,
    candidateId: record.identity.candidateId,
    runKey: record.identity.runKey,
  };
  const profile = architecturalIntentFor(identity.archetypeId);
  const recipes = continuationRecipesFor(identity.archetypeId, identity.candidateId);
  const continuations: NaturalContinuation[] = [];
  for (let index = 1; index <= count; index += 1) {
    const continuationSeed = naturalContinuationSeed(identity, index);
    const recipe = recipes.recipes[index - 1];
    if (!recipe || recipe.index !== index || recipe.id !== naturalContinuationId(index) || recipe.seed !== continuationSeed) {
      throw new Error(`${naturalContinuationId(index)} recipe does not match this continuation`);
    }
    const { transform } = createIntegratedEmphasis(z0, profile, recipe.schedule);
    const sampling = sampleFromParent(z0, handoff, record, continuationSeed, config, transform);
    if (sampling.startChecksum !== parentChecksum || sampling.z0 !== z0) {
      throw new Error(`${naturalContinuationId(index)} did not start from the validated Z0`);
    }
    const events: ContinuationEvent[] = sampling.samples.map((sample) => ({
      index: sample.index,
      iteration: sample.iteration,
      reason: sample.reason,
      referenceIteration: sample.referenceIteration,
      delta: sample.measures.delta,
      persistence: sample.measures.persistence,
      migration: sample.measures.migration,
      reinforcement: sample.measures.reinforcement,
      connectivityChange: sample.measures.connectivityChange,
    }));
    const id = naturalContinuationId(index);
    continuations.push({
      id,
      index,
      continuationSeed,
      focus: recipe.focus,
      families: recipe.families,
      ...identity,
      z0Iteration: z0.iteration,
      parentChecksum,
      acceptedIterations: events.map((event) => event.iteration),
      sampleCount: events.length,
      eventCount: events.filter((event) => event.reason !== "z0").length,
      events,
      field: toVerticalViewerField(sampling, id),
    });
  }
  if (stateChecksum(z0) !== parentChecksum) throw new Error("Z0 changed while continuations were sampled");
  return {
    origin,
    ...identity,
    z0Iteration: z0.iteration,
    parentChecksum,
    slime: structuredClone(record.realization.slime),
    rules: rulesFrom(config),
    continuations,
  };
}

export function runNaturalContinuations(
  request: Skill3SourceRequest,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet {
  const { record, handoff } = loadValidatedSkill2Handoff(request);
  return continuationsFromOpenedZ0(record, handoff, "handoff", count, config);
}

const continuationCache = new Map<string, NaturalContinuationSet>();

function cacheKey(request: Skill3SourceRequest, count: number, config: EventSampleConfig) {
  const source = request.runKey ?? request.archetypeId ?? "";
  return `${source}#${request.candidateId}#${count}#${config.horizon}#${config.minGap}#${config.maxGap}#${config.deltaThreshold}`;
}

/** Cached bundle only. Does not start a replay. */
export function peekNaturalContinuations(
  request: Skill3SourceRequest,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet | null {
  return continuationCache.get(cacheKey(request, count, config)) ?? null;
}

/** One validated replay per request identity, then the cached N01–N24 bundle. */
export function loadNaturalContinuations(
  request: Skill3SourceRequest,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet {
  const key = cacheKey(request, count, config);
  const cached = continuationCache.get(key);
  if (cached) return cached;
  const set = runNaturalContinuations(request, count, config);
  continuationCache.set(key, set);
  return set;
}
