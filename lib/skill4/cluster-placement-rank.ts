import { readClusterCriteria } from "./cluster-criteria-reading";
import type { FinishedIteration } from "./finished-catalog";
import type { AreaStanding } from "./program-area";
import { CLIENT_ACTIVITY_SEED } from "@/lib/skill5/client-compatibility";
import type { ZoneKind } from "@/lib/skill5/zoning";

export type PlacementCluster = {
  id: string;
  iteration: number;
  tileCount: number;
  habitableArea: number;
  targetMin: number;
  targetMax: number;
  areaStatus: AreaStanding;
  /** Share of weighted program criteria this cluster meets, 0–100. */
  score: number;
  meets: number;
  measured: number;
  recommended: boolean;
};

export type PlacementRank = {
  programId: string;
  name: string;
  zoneKind: ZoneKind | null;
  clusters: PlacementCluster[];
};

function zoneKindOf(programId: string): ZoneKind | null {
  const context = CLIENT_ACTIVITY_SEED.activities.find((item) => item.id === programId)?.contexts[0];
  if (context === "lobby" || context === "workspace" || context === "gathering") return context;
  return null;
}

/**
 * Order saved clusters for one program.
 * The score reads the existing criteria survey. It does not rewrite a cluster.
 */
export function rankProgramClusters(programId: string, name: string, iterations: readonly FinishedIteration[]): PlacementRank {
  const activity = CLIENT_ACTIVITY_SEED.activities.find((item) => item.id === programId);
  const weights = new Map(activity?.desires.map((desire) => [desire.criterionId, desire.weight]) ?? []);
  const clusters = iterations.map((item) => {
    const reading = readClusterCriteria(programId, item);
    let weight = 0;
    let earned = 0;
    let meets = 0;
    let measured = 0;
    for (const criterion of reading.criteria) {
      if (criterion.relation === "unmeasured") continue;
      const criterionWeight = weights.get(criterion.id) ?? 1;
      measured += 1;
      weight += criterionWeight;
      if (criterion.relation === "meets") {
        meets += 1;
        earned += criterionWeight;
      }
    }
    return {
      id: item.id,
      iteration: item.iteration,
      tileCount: item.tileCount,
      habitableArea: item.habitableArea,
      targetMin: item.targetMin,
      targetMax: item.targetMax,
      areaStatus: item.areaStatus,
      score: weight === 0 ? 0 : Math.round((earned / weight) * 100),
      meets,
      measured,
      recommended: false,
      within: item.areaStatus === "within" ? 1 : 0,
    };
  });
  clusters.sort((left, right) => right.score - left.score || right.within - left.within || left.iteration - right.iteration);
  if (clusters[0]) clusters[0].recommended = true;
  return {
    programId,
    name,
    zoneKind: zoneKindOf(programId),
    clusters: clusters.map(({ within: _within, ...cluster }) => cluster),
  };
}
