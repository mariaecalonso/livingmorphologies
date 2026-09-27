import type { Rating } from "../types";
import { EVALUATION_CALIBRATION } from "./evaluation-config";

export const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

export const saturate = (value: number, cap: number) =>
  cap <= 0 ? 0 : clamp01(value / cap);

/**
 * Rating-specific correspondence: how close an observed [0, 1] condition is
 * to the peak expected for the catalog Low / Medium / High target.
 *
 * The same observed value yields different scores for different targets.
 * This is not “more = better”.
 */
export function correspondenceScore(
  observed: number,
  target: Rating,
  peaks: readonly [number, number, number] = EVALUATION_CALIBRATION.defaultTargetPeaks,
  tolerance: number = EVALUATION_CALIBRATION.defaultTolerance,
): number {
  const peak = peaks[target];
  const width = tolerance > 0 ? tolerance : 1;
  const closeness = 1 - Math.abs(clamp01(observed) - peak) / width;
  return Math.max(0, Math.min(100, 100 * closeness));
}

export function weightedMean(values: number[], weights: number[]) {
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const weight = weights[i] ?? 0;
    sum += (values[i] ?? 0) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}
