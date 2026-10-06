import { semanticIdentity } from "./identity";
import { selectDiversityRescue, selectDiversityTags, type DistancePoint } from "./diversity";
import { frontCrowding, paretoFront } from "./pareto";
import { selectSemanticSpecialists } from "./specialists";
import { preservationEligible } from "./fidelity";
import type { SemanticCandidate, SemanticSearchConfig } from "./types";
import type { SpecialistIds } from "../specialists";

export type PreservationResult = {
  eligibleIds: number[];
  paretoIds: number[];
  crowding: Map<number, "boundary" | number>;
  specialistIds: SpecialistIds;
  diversityStatus: "applied" | "uncalibrated" | "no-represented-seed";
  diversityTagIds: number[];
  diversityRescueIds: number[];
};

export function recomputePreservation(
  candidates: readonly SemanticCandidate[],
  purpose: SemanticSearchConfig["purpose"],
  specialists: boolean,
  diversity: SemanticSearchConfig["diversity"],
): PreservationResult {
  const eligible = candidates.filter((candidate) => preservationEligible(candidate, purpose));
  const ranked = eligible.map((candidate) => ({ feasible: true, objectives: candidate.objectives }));
  const front = paretoFront(ranked);
  const paretoIds = front.map((index) => eligible[index].id);
  const crowdingByIndex = frontCrowding(ranked, front);
  const crowding = new Map<number, "boundary" | number>();
  for (const index of front) crowding.set(eligible[index].id, crowdingByIndex.get(index) ?? 0);
  const specialistIds = specialists
    ? selectSemanticSpecialists(
        eligible.map((candidate) => ({
          id: candidate.id,
          objectives: candidate.objectives,
          identity: semanticIdentity(candidate.plan, candidate.state),
        })),
        paretoIds,
      )
    : { formal: [], spatial: [], atmospheric: [] };
  const specialistIdList = [...specialistIds.formal, ...specialistIds.spatial, ...specialistIds.atmospheric];
  const representedIds = [...paretoIds, ...specialistIdList];
  if (!diversity) {
    return {
      eligibleIds: eligible.map((candidate) => candidate.id),
      paretoIds,
      crowding,
      specialistIds,
      diversityStatus: "uncalibrated",
      diversityTagIds: [],
      diversityRescueIds: [],
    };
  }
  const point = (id: number): DistancePoint => {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) throw new Error(`missing candidate ${id}`);
    return { id, phenotype: candidate.phenotype };
  };
  const represented = representedIds.map(point);
  const tags =
    diversity.tagThreshold == null ? [] : selectDiversityTags(represented, diversity.distance, diversity.tagThreshold);
  const remaining = eligible.filter((candidate) => !representedIds.includes(candidate.id)).map((candidate) => point(candidate.id));
  const rescue = selectDiversityRescue(represented, remaining, diversity.distance, diversity.rescueThreshold);
  return {
    eligibleIds: eligible.map((candidate) => candidate.id),
    paretoIds,
    crowding,
    specialistIds,
    diversityStatus: rescue.status,
    diversityTagIds: tags,
    diversityRescueIds: rescue.rescuedIds,
  };
}

export function roleNames(candidate: Pick<SemanticCandidate, "current">): string[] {
  const roles: string[] = [];
  if (candidate.current.pareto) roles.push("pareto");
  if (candidate.current.specialist) roles.push(`specialist-${candidate.current.specialist}`);
  if (candidate.current.diversity !== "none") roles.push("diversity");
  return roles;
}
