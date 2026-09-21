/**
 * Morphological extraction parameters.
 *
 * These values only distinguish dense concentration, thin trail, and empty
 * space on a Physarum field. They are NOT architectural Low / Medium / High
 * evaluation thresholds and are not tuned for any archetype score.
 */
export type MorphologicalExtractionConfig = {
  /**
   * Peak-relative trail intensity below this is void (little / no activity).
   * Domain: [0, 1], relative to max(trails).
   */
  voidMaxRelative: number;
  /**
   * Peak-relative trail intensity at or above this is mass / concentration.
   * Must be > voidMaxRelative. Between the two is thin connection.
   */
  massMinRelative: number;
  /** Drop concentrations smaller than this area (occupancy-cell units). */
  minConcentrationArea: number;
  /** Void components at or above this area (occupancy-cell units) are significant. */
  minSignificantVoidArea: number;
  /** Ignore corridor components shorter than this (occupancy-cell units). */
  minBridgeLength: number;
  /** Horizontal mass runs shorter than this are not support (occupancy-cell units). */
  minSupportLength: number;
  /**
   * Fraction of a candidate support run that must have void in the +y cell
   * (Skill 1 y increases away from the bottom source).
   */
  minSupportClearanceFraction: number;
};

export const DEFAULT_MORPHOLOGICAL_EXTRACTION: MorphologicalExtractionConfig = {
  voidMaxRelative: 0.08,
  massMinRelative: 0.4,
  minConcentrationArea: 1,
  minSignificantVoidArea: 2,
  minBridgeLength: 0.5,
  minSupportLength: 2,
  minSupportClearanceFraction: 0.5,
};

export function resolveExtractionConfig(
  overrides?: Partial<MorphologicalExtractionConfig>,
): MorphologicalExtractionConfig {
  const merged = { ...DEFAULT_MORPHOLOGICAL_EXTRACTION, ...overrides };
  if (merged.massMinRelative <= merged.voidMaxRelative) {
    throw new Error(
      "Morphological extraction: massMinRelative must be greater than voidMaxRelative",
    );
  }
  return merged;
}
