import {
  EMPHASIS_KEYS,
  SPECIALIST_LIMIT,
  emphasisScore,
  generalQuality,
  median,
  percentile,
  type Emphasis,
  type SpecialistIds,
} from "../specialists";
import type { Objectives } from "../nsga";

export type SpecialistInput = {
  id: number;
  objectives: Objectives;
  /** Exact semantic identity. Pose distance is not consulted. */
  identity: string;
};

/**
 * Provisional specialist qualification for a later A/B comparison.
 * Same median, 25th-percentile, single-emphasis, and cap-4 rules as the
 * pose-era selector. Exact semantic duplicates are skipped. Phenotype
 * distinctness is not decided here.
 */
export function selectSemanticSpecialists(candidates: readonly SpecialistInput[], paretoIds: readonly number[]): SpecialistIds {
  const pareto = new Set(paretoIds);
  const qualityMedian = median(candidates.map((candidate) => generalQuality(candidate.objectives)));
  const floor = {
    formal: percentile(candidates.map((candidate) => candidate.objectives.formal), 0.25),
    spatial: percentile(candidates.map((candidate) => candidate.objectives.spatial), 0.25),
    atmospheric: percentile(candidates.map((candidate) => candidate.objectives.atmospheric), 0.25),
  };
  const eligibleFor = (candidate: SpecialistInput, emphasis: Emphasis) => {
    if (pareto.has(candidate.id)) return false;
    if (generalQuality(candidate.objectives) < qualityMedian) return false;
    return EMPHASIS_KEYS.filter((key) => key !== emphasis).every((key) => candidate.objectives[key] >= floor[key]);
  };
  const assigned = candidates.flatMap((candidate) => {
    const homes = EMPHASIS_KEYS.filter((emphasis) => eligibleFor(candidate, emphasis));
    if (homes.length === 0) return [];
    homes.sort(
      (a, b) =>
        emphasisScore(candidate.objectives, b) -
          generalQuality(candidate.objectives) -
          (emphasisScore(candidate.objectives, a) - generalQuality(candidate.objectives)) ||
        emphasisScore(candidate.objectives, b) - emphasisScore(candidate.objectives, a),
    );
    return [{ candidate, emphasis: homes[0] }];
  });
  assigned.sort(
    (a, b) =>
      emphasisScore(b.candidate.objectives, b.emphasis) -
        generalQuality(b.candidate.objectives) -
        (emphasisScore(a.candidate.objectives, a.emphasis) - generalQuality(a.candidate.objectives)) ||
      emphasisScore(b.candidate.objectives, b.emphasis) - emphasisScore(a.candidate.objectives, a.emphasis) ||
      a.candidate.id - b.candidate.id,
  );
  const chosen: SpecialistIds = { formal: [], spatial: [], atmospheric: [] };
  const identities: string[] = [];
  for (const { candidate, emphasis } of assigned) {
    if (chosen[emphasis].length >= SPECIALIST_LIMIT) continue;
    if (identities.includes(candidate.identity)) continue;
    chosen[emphasis].push(candidate.id);
    identities.push(candidate.identity);
  }
  return chosen;
}
