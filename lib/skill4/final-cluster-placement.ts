import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readFinalSelection } from "@/lib/skill3/final-selection";
import type { PlacementRank } from "./cluster-placement-rank";
import {
  FINAL_CLUSTER_GENERATOR,
  FINAL_CLUSTER_PAIRS,
  type FinalClusterPairId,
  type FinalClusterTilePose,
} from "./final-cluster-pairs";

/**
 * Site Placement reads the Final Cluster catalog.
 * Legacy finished-program ids still resolve through the finished-program files.
 * A stale selection hash is reported and does not delete or replace saved assemblies.
 */

type StoredCluster = {
  id: string;
  tileCount: number;
  generator?: string;
  validated?: boolean;
  tiles?: FinalClusterTilePose[];
  typologyMix?: { lobby: number; workspace: number; gathering: number };
  provenance?: {
    selectionHash?: string;
    modules?: { archetypeId: string; moduleId: string; candidateId: number | null; continuationId: string | null }[];
  };
};

type StoredPair = {
  clusters?: StoredCluster[];
};

export type FinalPlacement = PlacementRank & {
  stale: boolean;
  selectionHash: string;
};

export function currentSelectionHash() {
  const ids = readFinalSelection().selections.map((item) => item.moduleId).join("|");
  return createHash("sha256").update(ids).digest("hex").slice(0, 16);
}

export function isFinalClusterCategory(id: string): id is FinalClusterPairId {
  return FINAL_CLUSTER_PAIRS.some((pair) => pair.id === id);
}

function pairFile(pairId: string) {
  return path.join(process.cwd(), "data", "skill4", "final-clusters-pairs", `${pairId}.json`);
}

export function finalClusterMeshPath(programId: string, clusterId: string) {
  return path.join(process.cwd(), "data", "skill4", "final-clusters", programId, `${clusterId.replaceAll(":", "__")}.json`);
}

export function readFinalClusterRecord(programId: string, clusterId: string): StoredCluster | null {
  if (!isFinalClusterCategory(programId)) return null;
  if (!existsSync(pairFile(programId))) return null;
  const body = JSON.parse(readFileSync(pairFile(programId), "utf8")) as StoredPair;
  return body.clusters?.find((item) => item.id === clusterId) ?? null;
}

export function finalClusterPlacement(programId: string): FinalPlacement | null {
  if (!isFinalClusterCategory(programId)) return null;
  const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === programId);
  if (!pair) return null;
  const selectionHash = currentSelectionHash();
  const zoneKind = pair.a === pair.b ? pair.a : null;
  if (!existsSync(pairFile(programId))) {
    return { programId, name: pair.label, zoneKind, clusters: [], stale: false, selectionHash };
  }
  const body = JSON.parse(readFileSync(pairFile(programId), "utf8")) as StoredPair;
  const clusters = (body.clusters ?? []).filter((item) => item.validated !== false && item.generator === FINAL_CLUSTER_GENERATOR);
  const storedHash = clusters.find((item) => item.provenance?.selectionHash)?.provenance?.selectionHash ?? null;
  return {
    programId,
    name: pair.label,
    zoneKind,
    stale: storedHash != null && storedHash !== selectionHash,
    selectionHash,
    clusters: clusters.map((item, index) => ({
      id: item.id,
      iteration: index + 1,
      tileCount: item.tileCount,
      tiles: item.tiles,
      typologyMix: item.typologyMix,
      habitableArea: 0,
      targetMin: 0,
      targetMax: 0,
      areaStatus: "below" as const,
      score: 0,
      meets: 0,
      measured: 0,
      recommended: index === 0,
    })),
  };
}
