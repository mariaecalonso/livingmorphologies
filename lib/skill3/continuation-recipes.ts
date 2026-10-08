import type { ArchitecturalIntentProfile } from "../architectural-intent";
import { architecturalIntentFor } from "./architectural-intent";
import { naturalContinuationId, naturalContinuationSeed } from "./continuations";

/**
 * Four-phase emphasis curve. This spreads the phase targets.
 * It is not the continuation horizon. `resolveAdaptiveHorizon` chooses that later.
 */
const EMPHASIS_CURVE = 64;

export type EmphasisFamily = "formal" | "spatial" | "atmospheric";

export type ContinuationFocus =
  | "formal"
  | "spatial"
  | "atmospheric"
  | "formal+spatial"
  | "formal+atmospheric"
  | "spatial+atmospheric"
  | "formal+spatial+atmospheric";

/** Four phase multipliers around the authored baseline. 1 leaves that family at baseline. */
export type PhaseTargets = readonly [number, number, number, number];

export type EmphasisSchedule = {
  formal: PhaseTargets;
  spatial: PhaseTargets;
  atmospheric: PhaseTargets;
};

/** Baseline operator strengths from the authored ratings. The same on every branch. */
export type OperatorStrengths = {
  formalBlend: number;
  formalCore: number;
  spatialBlend: number;
  spatialGain: number;
  protectBlend: number;
  redirectShare: number;
};

export type ContinuationRecipe = {
  id: string;
  index: number;
  archetypeId: string;
  candidateId: number;
  focus: ContinuationFocus;
  families: readonly EmphasisFamily[];
  variant: number;
  seed: number;
  schedule: EmphasisSchedule;
  strengths: OperatorStrengths;
  /** Step count is resolved by `resolveAdaptiveHorizon` when the continuation runs. */
  horizon: "adaptive";
};

export type ContinuationRecipeSet = {
  archetypeId: string;
  candidateId: number;
  descriptors: {
    formal: string;
    spatial: string;
    atmospheric: string;
  };
  ratings: {
    formal: { id: string; rating: number }[];
    spatial: { id: string; rating: number }[];
    atmospheric: { id: string; rating: number }[];
  };
  strengths: OperatorStrengths;
  recipes: ContinuationRecipe[];
};

const BASELINE: PhaseTargets = [1, 1, 1, 1];

/**
 * Canonical four-phase targets from the temporal-emphasis diagnostic.
 * Unlisted families stay at the baseline. Variants rotate or reverse these rows.
 */
const CANONICAL: Record<ContinuationFocus, EmphasisSchedule> = {
  formal: {
    formal: [1, 1.5, 0.72, 1.42],
    spatial: BASELINE,
    atmospheric: BASELINE,
  },
  spatial: {
    formal: BASELINE,
    spatial: [1, 1.48, 0.7, 1.4],
    atmospheric: BASELINE,
  },
  atmospheric: {
    formal: BASELINE,
    spatial: BASELINE,
    atmospheric: [1, 1.48, 0.7, 1.42],
  },
  "formal+spatial": {
    formal: [1.42, 1.1, 0.78, 1.18],
    spatial: [0.82, 1.12, 1.48, 1.16],
    atmospheric: BASELINE,
  },
  "formal+atmospheric": {
    formal: [1.4, 1.05, 0.8, 1.15],
    spatial: BASELINE,
    atmospheric: [0.85, 1.15, 1.48, 1.18],
  },
  "spatial+atmospheric": {
    formal: BASELINE,
    spatial: [1.4, 0.85, 1.15, 1.2],
    atmospheric: [0.82, 1.45, 1.05, 1.22],
  },
  "formal+spatial+atmospheric": {
    formal: [1.45, 0.95, 0.8, 1.22],
    spatial: [0.8, 1.45, 1, 1.18],
    atmospheric: [0.85, 0.9, 1.48, 1.25],
  },
};

const PLAN: readonly { focus: ContinuationFocus; count: number; families: readonly EmphasisFamily[] }[] = [
  { focus: "formal", count: 3, families: ["formal"] },
  { focus: "spatial", count: 3, families: ["spatial"] },
  { focus: "atmospheric", count: 3, families: ["atmospheric"] },
  { focus: "formal+spatial", count: 3, families: ["formal", "spatial"] },
  { focus: "formal+atmospheric", count: 3, families: ["formal", "atmospheric"] },
  { focus: "spatial+atmospheric", count: 3, families: ["spatial", "atmospheric"] },
  { focus: "formal+spatial+atmospheric", count: 6, families: ["formal", "spatial", "atmospheric"] },
];

export function modulateEmphasis(offset: number, targets: readonly number[]) {
  const t = offset / EMPHASIS_CURVE;
  const x = Math.min(targets.length - 1, Math.max(0, t * targets.length - 0.5));
  const i = Math.min(targets.length - 2, Math.floor(x));
  const u = x - i;
  const s = u * u * (3 - 2 * u);
  return targets[i] + (targets[i + 1] - targets[i]) * s;
}

function rotate(targets: PhaseTargets, shift: number): PhaseTargets {
  const steps = ((shift % targets.length) + targets.length) % targets.length;
  return targets.map((_, index) => targets[(index + steps) % targets.length]) as unknown as PhaseTargets;
}

function reverse(targets: PhaseTargets): PhaseTargets {
  return [...targets].reverse() as unknown as PhaseTargets;
}

/** Deterministic phase order for one focus variant. Integrated branches 4 and 5 reverse the canonical curve. */
export function emphasisSchedule(focus: ContinuationFocus, variant: number): EmphasisSchedule {
  const plan = PLAN.find((item) => item.focus === focus);
  if (!plan) throw new Error(`unknown continuation focus ${focus}`);
  if (!Number.isInteger(variant) || variant < 0 || variant >= plan.count) {
    throw new Error(`variant ${variant} is outside ${focus}`);
  }
  const canonical = CANONICAL[focus];
  const reversed = plan.count === 6 && variant >= 4;
  const shift = reversed ? variant - 4 : variant;
  const turn = (targets: PhaseTargets) => rotate(reversed ? reverse(targets) : targets, shift);
  return {
    formal: turn(canonical.formal),
    spatial: turn(canonical.spatial),
    atmospheric: turn(canonical.atmospheric),
  };
}

function ratingUnit(profile: ArchitecturalIntentProfile, family: EmphasisFamily, index: number) {
  const criterion = profile[family].criteria[index];
  if (!criterion) throw new Error(`architectural intent is missing ${family} criterion ${index}`);
  return criterion.rating / 2;
}

/** Existing operator strengths. The third criterion of each family is whichever rating that typology authored. */
export function operatorStrengths(profile: ArchitecturalIntentProfile): OperatorStrengths {
  const complexity = ratingUnit(profile, "formal", 0);
  const proportionality = ratingUnit(profile, "formal", 1);
  const formalThird = ratingUnit(profile, "formal", 2);
  const openness = ratingUnit(profile, "spatial", 0);
  const connectivity = ratingUnit(profile, "spatial", 1);
  const spatialThird = ratingUnit(profile, "spatial", 2);
  const immersive = ratingUnit(profile, "atmospheric", 0);
  const atmosphericThird = ratingUnit(profile, "atmospheric", 2);
  return {
    formalBlend: complexity * (0.26 + 0.4 * proportionality),
    formalCore: 0.32 + 0.24 * formalThird,
    spatialBlend: 0.22 + 0.46 * connectivity * (0.65 + 0.35 * spatialThird),
    spatialGain: 1 + 0.55 * openness,
    protectBlend: 0.3 + 0.4 * immersive,
    redirectShare: 0.55 + 0.45 * atmosphericThird,
  };
}

function ratingsOf(profile: ArchitecturalIntentProfile, family: EmphasisFamily) {
  return profile[family].criteria.map((criterion) => ({ id: criterion.id, rating: criterion.rating }));
}

/** Twenty-four continuation recipes. No Z0 geometry and no resolved horizon. */
export function continuationRecipesFor(archetypeId: string, candidateId: number): ContinuationRecipeSet {
  if (!Number.isInteger(candidateId) || candidateId < 1) {
    throw new Error(`candidate ${candidateId} is not a positive integer`);
  }
  const profile = architecturalIntentFor(archetypeId);
  const strengths = operatorStrengths(profile);
  const recipes: ContinuationRecipe[] = [];
  for (const group of PLAN) {
    for (let variant = 0; variant < group.count; variant += 1) {
      const index = recipes.length + 1;
      recipes.push({
        id: naturalContinuationId(index),
        index,
        archetypeId,
        candidateId,
        focus: group.focus,
        families: group.families,
        variant,
        seed: naturalContinuationSeed({ archetypeId, candidateId }, index),
        schedule: emphasisSchedule(group.focus, variant),
        strengths: { ...strengths },
        horizon: "adaptive",
      });
    }
  }
  return {
    archetypeId,
    candidateId,
    descriptors: {
      formal: profile.formal.descriptor,
      spatial: profile.spatial.descriptor,
      atmospheric: profile.atmospheric.descriptor,
    },
    ratings: {
      formal: ratingsOf(profile, "formal"),
      spatial: ratingsOf(profile, "spatial"),
      atmospheric: ratingsOf(profile, "atmospheric"),
    },
    strengths,
    recipes,
  };
}
