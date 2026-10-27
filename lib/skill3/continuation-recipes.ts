import type { ArchitecturalIntentProfile } from "../architectural-intent";
import { architecturalIntentFor } from "./architectural-intent";
import { naturalContinuationId, naturalContinuationSeed } from "./continuations";
import {
  EMPHASIS_PLAN,
  emphasisSchedule,
  type ContinuationFocus,
  type EmphasisFamily,
  type EmphasisSchedule,
} from "./emphasis-schedule";

export type { ContinuationFocus, EmphasisFamily, EmphasisSchedule, PhaseTargets } from "./emphasis-schedule";
export { branchEmphasis, emphasisSchedule, modulateEmphasis } from "./emphasis-schedule";

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
  for (const group of EMPHASIS_PLAN) {
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
