import type { GroupId, Rating } from "../types";
import { EVALUATION_CALIBRATION } from "./evaluation-config";

/**
 * Evolutionary search score. Distinct from the legacy audit `correspondenceScore`.
 * Version-1 prototype limitation: these criteria are still measured and
 * audited but omitted from search means. Spatial Permanence reads the same
 * fact as Circulation Integration; Modularity and Circulation Integration
 * wait for validation on the topology grid; Collaboration and Social
 * Proximity are dominated by seed variation after the extraction repair.
 */
const DEFERRED_SEARCH_CRITERIA = new Set([
  "spatial-permanence",
  "modularity",
  "circulation-integration",
  "collaboration",
  "social-proximity",
]);

export type SearchCriterion = {
  criterionId: string;
  category: GroupId;
  targetRating: Rating;
  observedCondition: number;
};

export type CriterionMatchResult = {
  criterionId: string;
  category: GroupId;
  included: boolean;
  criterionMatch: number;
};

export type SearchObjectives = {
  formalMatch: number;
  spatialMatch: number;
  atmosphericMatch: number;
  criteria: readonly CriterionMatchResult[];
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function criterionMatch(observed: number, targetRating: Rating) {
  const peak = EVALUATION_CALIBRATION.defaultTargetPeaks[targetRating];
  return clamp01(1 - Math.abs(clamp01(observed) - peak));
}

export function searchObjectives(criteria: readonly SearchCriterion[]): SearchObjectives {
  const scored = criteria.map((criterion) => {
    const included = !DEFERRED_SEARCH_CRITERIA.has(criterion.criterionId);
    return {
      criterionId: criterion.criterionId,
      category: criterion.category,
      included,
      criterionMatch: criterionMatch(criterion.observedCondition, criterion.targetRating),
    };
  });
  const categoryMean = (category: GroupId) =>
    mean(scored.filter((criterion) => criterion.included && criterion.category === category).map((criterion) => criterion.criterionMatch));
  return {
    formalMatch: categoryMean("formal"),
    spatialMatch: categoryMean("spatial"),
    atmosphericMatch: categoryMean("atmospheric"),
    criteria: scored,
  };
}
