import type { AcceptedSample } from "./events";

/**
 * Absolute references. A future is scored from its own samples only.
 * Nothing here is rescaled against the other futures in a batch.
 * `densityReference` is the Skill 1 trail cap. `highDensity` is a fixed trail level.
 * `trailEpsilon` matches the event sampler's empty-cell floor.
 */
export const DEFAULT_OBJECTIVE_CONFIG = {
  trailEpsilon: 0.003,
  densityReference: 1.8,
  highDensity: 0.45,
  weights: {
    continuity: {
      persistence: 0.4,
      connectivityRetention: 0.25,
      inverseFragmentation: 0.2,
      inverseDisappearance: 0.15,
    },
    transformation: {
      migration: 0.3,
      emergence: 0.25,
      disappearance: 0.2,
      differenceFromZ0: 0.25,
    },
    concentration: {
      reinforcement: 0.4,
      densityAccumulation: 0.3,
      highDensityPersistence: 0.3,
    },
  },
} as const;

export type ObjectiveConfig = {
  trailEpsilon: number;
  densityReference: number;
  highDensity: number;
  weights: {
    continuity: {
      persistence: number;
      connectivityRetention: number;
      inverseFragmentation: number;
      inverseDisappearance: number;
    };
    transformation: {
      migration: number;
      emergence: number;
      disappearance: number;
      differenceFromZ0: number;
    };
    concentration: {
      reinforcement: number;
      densityAccumulation: number;
      highDensityPersistence: number;
    };
  };
};

export type ContinuityComponents = {
  persistence: number;
  connectivityRetention: number;
  inverseFragmentation: number;
  inverseDisappearance: number;
};

export type TransformationComponents = {
  migration: number;
  emergence: number;
  disappearance: number;
  differenceFromZ0: number;
};

export type ConcentrationComponents = {
  reinforcement: number;
  densityAccumulation: number;
  highDensityPersistence: number;
};

export type ObjectiveComponents = {
  continuity: ContinuityComponents;
  transformation: TransformationComponents;
  concentration: ConcentrationComponents;
};

/** Three scores in [0, 1], plus the measurements that produced them. */
export type FutureObjectives = {
  futureId: string;
  sampleCount: number;
  continuity: number;
  transformation: number;
  concentration: number;
  components: ObjectiveComponents;
};

type TrailPair = {
  disappearance: number;
  emergence: number;
  difference: number;
  highDensityPersistence: number;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mean(values: readonly number[]) {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function weighted(parts: object, weights: object) {
  const values = parts as Record<string, number>;
  const scales = weights as Record<string, number>;
  let sum = 0;
  for (const key of Object.keys(scales)) sum += clamp01(values[key] ?? 0) * scales[key];
  return clamp01(sum);
}

export function assertObjectiveConfig(config: ObjectiveConfig) {
  if (!Number.isFinite(config.trailEpsilon) || config.trailEpsilon < 0) {
    throw new Error(`trailEpsilon ${config.trailEpsilon} must be a non-negative number`);
  }
  if (!Number.isFinite(config.densityReference) || config.densityReference <= 0) {
    throw new Error(`densityReference ${config.densityReference} must be a positive number`);
  }
  if (!Number.isFinite(config.highDensity) || config.highDensity <= config.trailEpsilon) {
    throw new Error(`highDensity ${config.highDensity} must be above the empty-cell floor`);
  }
  for (const [group, weights] of Object.entries(config.weights)) {
    let sum = 0;
    for (const [key, weight] of Object.entries(weights)) {
      if (!Number.isFinite(weight) || weight < 0) throw new Error(`${group}.${key} weight must be a non-negative number`);
      sum += weight;
    }
    if (Math.abs(sum - 1) > 1e-9) throw new Error(`${group} weights must sum to 1`);
  }
}

function pairTrails(previous: readonly number[], current: readonly number[], config: ObjectiveConfig): TrailPair {
  if (previous.length !== current.length) throw new Error("accepted samples do not share a trail field");
  const { trailEpsilon, highDensity } = config;
  let previousOn = 0;
  let currentOn = 0;
  let stayed = 0;
  let disappeared = 0;
  let emerged = 0;
  let previousHigh = 0;
  let currentHigh = 0;
  let retainedHigh = 0;
  for (let i = 0; i < current.length; i += 1) {
    const before = previous[i];
    const after = current[i];
    const beforeOn = before > trailEpsilon;
    const afterOn = after > trailEpsilon;
    if (beforeOn) previousOn += 1;
    if (afterOn) currentOn += 1;
    if (beforeOn && afterOn) stayed += 1;
    else if (beforeOn) disappeared += 1;
    else if (afterOn) emerged += 1;
    const beforeHigh = before >= highDensity;
    const afterHigh = after >= highDensity;
    if (beforeHigh) previousHigh += 1;
    if (afterHigh) currentHigh += 1;
    if (beforeHigh && afterHigh) retainedHigh += 1;
  }
  const union = stayed + disappeared + emerged;
  return {
    disappearance: previousOn === 0 ? 0 : disappeared / previousOn,
    emergence: currentOn === 0 ? 0 : emerged / currentOn,
    difference: union === 0 ? 0 : 1 - stayed / union,
    highDensityPersistence: previousHigh === 0 && currentHigh === 0 ? 1 : previousHigh === 0 ? 0 : retainedHigh / previousHigh,
  };
}

function densityLevel(trails: readonly number[], config: ObjectiveConfig) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < trails.length; i += 1) {
    const value = trails[i];
    if (value <= config.trailEpsilon) continue;
    sum += clamp01(value / config.densityReference);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Scores one future from its accepted samples. Z0 is sample 0.
 * Later samples contribute change. The batch this future belongs to is not an input.
 */
export function scoreFuture(
  samples: readonly AcceptedSample[],
  futureId = "",
  config: ObjectiveConfig = DEFAULT_OBJECTIVE_CONFIG,
): FutureObjectives {
  assertObjectiveConfig(config);
  if (samples.length === 0) throw new Error("a future needs at least the Z0 sample");
  const z0 = samples[0];
  if (z0.reason !== "z0") throw new Error("sample 0 is not Z0");
  const later = samples.slice(1);
  const steps = later.map((sample, index) => pairTrails(samples[index].trails, sample.trails, config));
  const againstZ0 = later.map((sample) => pairTrails(z0.trails, sample.trails, config));
  const z0Components = Math.max(0, z0.measures.components);

  const continuity: ContinuityComponents = {
    persistence: later.length === 0 ? 1 : mean(later.map((sample) => clamp01(sample.measures.persistence))),
    connectivityRetention: later.length === 0 ? 1 : mean(later.map((sample) => 1 - clamp01(sample.measures.connectivityChange))),
    inverseFragmentation:
      later.length === 0
        ? 1
        : 1 -
          mean(
            later.map((sample) => clamp01((sample.measures.components - z0Components) / Math.max(z0Components, 1))),
          ),
    inverseDisappearance: later.length === 0 ? 1 : 1 - mean(steps.map((step) => step.disappearance)),
  };
  const transformation: TransformationComponents = {
    migration: mean(later.map((sample) => clamp01(sample.measures.migration))),
    emergence: mean(steps.map((step) => step.emergence)),
    disappearance: mean(steps.map((step) => step.disappearance)),
    differenceFromZ0: mean(againstZ0.map((step) => step.difference)),
  };
  const concentration: ConcentrationComponents = {
    reinforcement: mean(later.map((sample) => clamp01(sample.measures.reinforcement))),
    densityAccumulation: mean(samples.map((sample) => densityLevel(sample.trails, config))),
    highDensityPersistence: steps.length === 0 ? 1 : mean(steps.map((step) => step.highDensityPersistence)),
  };

  return {
    futureId,
    sampleCount: samples.length,
    continuity: weighted(continuity, config.weights.continuity),
    transformation: weighted(transformation, config.weights.transformation),
    concentration: weighted(concentration, config.weights.concentration),
    components: { continuity, transformation, concentration },
  };
}

/** Scores each future on its own. Order follows the input. */
export function scoreFutures(
  futures: readonly { id: string; samples: readonly AcceptedSample[] }[],
  config: ObjectiveConfig = DEFAULT_OBJECTIVE_CONFIG,
): FutureObjectives[] {
  return futures.map((future) => scoreFuture(future.samples, future.id, config));
}
