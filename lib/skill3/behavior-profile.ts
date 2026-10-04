/**
 * Descriptive readings for the process page. These are not quality scores.
 * `development-placeholder` is drawn, not measured.
 * `event-measures` averages the accepted samples of one continuation.
 */
export type BehaviorProfile = {
  source: "development-placeholder" | "event-measures";
  persistence: number;
  migration: number;
  reinforcement: number;
  connectivity: number;
  spatialExtent: number;
};

export const DEVELOPMENT_BEHAVIOR: BehaviorProfile = {
  source: "development-placeholder",
  persistence: 0.72,
  migration: 0.38,
  reinforcement: 0.44,
  connectivity: 0.31,
  spatialExtent: 0.46,
};
