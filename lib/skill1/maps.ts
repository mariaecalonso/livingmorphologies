/**
 * Configurable Low / Medium / High → computational mappings.
 * Architectural ratings stay 0 / 1 / 2 in the catalog; these tables
 * only scale those ratings into biological intensities.
 */

export type RatingIndex = 0 | 1 | 2;

export const RATING_LABEL = ["Low", "Medium", "High"] as const;

/** Default intensity used by permeability, attraction, coupling, variation. */
export const INTENSITY_MAP: Record<RatingIndex, number> = {
  0: 0.2,
  1: 0.5,
  2: 0.8,
};

/** Influence / attraction radius in cells on the 20×20 field. */
export const RADIUS_MAP: Record<RatingIndex, number> = {
  0: 3,
  1: 6,
  2: 10,
};

/** Directional bias. Unused by the two gathering test archetypes (both 0). */
export const DIRECTIONALITY_MAP: Record<RatingIndex, number> = {
  0: 0,
  1: 0.5,
  2: 1,
};

/**
 * Social Proximity is inverted: higher proximity → closer node spacing.
 * LOW = 0.80 greater separation; HIGH = 0.20 closer spacing.
 */
export const SOCIAL_PROXIMITY_SPACING_MAP: Record<RatingIndex, number> = {
  0: 0.8,
  1: 0.5,
  2: 0.2,
};

export const GAMMA_MEDIUM = 0.5;

export const DECAY_PRESETS = {
  controlled: 0.042,
  aggressive: 0.09,
} as const;

export const RANDOMNESS_PRESETS = {
  low: 0.04,
  medium: 0.1,
  high: 0.22,
} as const;

export const FIELD_SIZE = 20;
export const SECTION_HEIGHT = 10;
export const DISPLAY_LEVELS = 6;
export const TRAIL_SCALE = 6;
export const PATH_LENGTH = 80;
export const DEFAULT_AGENT_COUNT = 1000;
export const DISPLAY_ITERATIONS = 600;
export const SNAPSHOT_ITERATIONS = [0, 100, 250, 400, 600] as const;
export const MIN_AGENT_COUNT = 1;
export const MAX_AGENT_COUNT = 2000;
export const MIN_DENSITY = 1;
export const MAX_DENSITY = 10;
export const DEFAULT_DENSITY = 5;
export const MAX_ITERATIONS = 1000;
export const CONVERGENCE_EPSILON = 0.012;
export const CONVERGENCE_STREAK = 24;
export const CONVERGENCE_MIN_ITERATIONS = 420;

export const SECONDARY_FLOOR = 0.085;
export const PERMEABILITY_CEIL = 1.55;

export function densityAmount(density: number) {
  return Math.min(1, Math.max(0, (density - MIN_DENSITY) / (MAX_DENSITY - MIN_DENSITY)));
}

/** Strong-trail cutoff so the colony follows the recipe instead of filling the 20×20 box. */
export function trailMaskCutoff(density: number) {
  return 0.38 - densityAmount(density) * 0.24;
}

export function asRatingIndex(value: number): RatingIndex {
  if (value <= 0) return 0;
  if (value >= 2) return 2;
  return 1;
}
