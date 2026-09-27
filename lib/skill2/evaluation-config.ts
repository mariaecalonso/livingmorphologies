/**
 * Skill 2 evaluation calibration.
 *
 * Every numeric value in this file is PROVISIONAL / CALIBRATABLE.
 * None of these are architectural Low / Medium / High meanings (those live
 * only in `lib/catalog.ts`). They only locate a measured condition on a
 * criterion-specific [0, 1] axis and convert distance-to-target into 0–100.
 *
 * Do not treat these as scientifically fitted thresholds. They exist so the
 * correspondence machinery can run and be verified. They were not tuned to
 * make Void Field pass.
 */
export const EVALUATION_CALIBRATION = {
  status: "provisional" as const,
  sharedCriterionWeight: 1.0,
  /** PROVISIONAL modest typology emphasis. Not a final multiplier. */
  typologySpecificCriterionWeight: 1.15,
  /** PROVISIONAL weighted overall minimum for acceptability. */
  overallMinimum: 55,
  /** PROVISIONAL individual-criterion floor. Extremely poor = below this. */
  individualFloor: 30,
  /**
   * Default expected locations of Low / Medium / High on a criterion axis
   * whose 0 and 1 meanings are defined per criterion (not universally
   * “little / some / much”).
   */
  defaultTargetPeaks: [0.2, 0.5, 0.8] as const,
  /** PROVISIONAL triangular falloff width on the [0, 1] axis. */
  defaultTolerance: 0.65,
  complexityConcentrationCap: 7,
  complexityBranchingCap: 5,
  complexityComponentCap: 6,
  connectivityBridgeCap: 6,
  variationCap: 1,
  densityVariationCap: 0.45,
} as const;

export type EvaluationCalibration = typeof EVALUATION_CALIBRATION;

export function resolveEvaluationCalibration(
  overrides?: Partial<EvaluationCalibration>,
): EvaluationCalibration {
  return { ...EVALUATION_CALIBRATION, ...overrides };
}
