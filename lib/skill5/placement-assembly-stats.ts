import { FINAL_CLUSTER_PAIRS, type FinalClusterPairId } from "@/lib/skill4/final-cluster-pairs";
import { rotatedPoseDrop, type PlacedCluster } from "@/lib/skill5/placed-cluster";
import { ZONE_KIND_ORDER, type ZoneKind, type ZoningRegion } from "@/lib/skill5/zoning";

export const PLACEMENT_GROUND_TOLERANCE_FT = 2;

export type PlacementAssemblyMixes = Record<string, { lobby: number; workspace: number; gathering: number }>;

export type PlacementCategoryStat = {
  id: FinalClusterPairId;
  label: string;
  count: number;
  percent: number;
};

export type PlacementHostKindStat = {
  kind: ZoneKind;
  label: string;
  count: number;
  percent: number;
};

export type PlacementAssemblyStats = {
  clusterCount: number;
  occupiedZones: number;
  zoneCount: number;
  categories: PlacementCategoryStat[];
  hostKinds: PlacementHostKindStat[];
  constituentTiles: { lobby: number; workspace: number; gathering: number };
  constituentUnrecorded: number;
  groundCount: number;
  elevatedCount: number;
  pendingElevation: number;
  mirroredCount: number;
};

function percent(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/**
 * Ground-level: geometric seat on the zone base with the cluster origin at or below that zone’s base.
 * Elevated: any other seated pose (vertical stack, lift, or sink relative to first-tier seat).
 */
export function placementElevationClass(
  record: PlacedCluster,
  zone: Pick<ZoningRegion, "baseFt"> | undefined,
  positions: ArrayLike<number> | null | undefined,
  toleranceFt = PLACEMENT_GROUND_TOLERANCE_FT,
): "ground" | "elevated" | "pending" {
  if (!positions || positions.length < 3) return "pending";
  const groundY = zone?.baseFt ?? 0;
  const drop = rotatedPoseDrop(positions, record.transform);
  const seatedGroundY = groundY - drop;
  const atGroundSeat = Math.abs(record.transform.y - seatedGroundY) <= toleranceFt;
  const lowSiteY = record.transform.y <= groundY + toleranceFt;
  if (atGroundSeat && lowSiteY) return "ground";
  return "elevated";
}

export function computePlacementAssemblyStats(input: {
  occupancy: readonly PlacedCluster[];
  zones: readonly ZoningRegion[];
  meshes: Readonly<Record<string, { positions: Float32Array; indices: Uint32Array } | null>>;
  meshKey: (record: Pick<PlacedCluster, "programId" | "finishedClusterId">) => string;
  mixes: PlacementAssemblyMixes;
}): PlacementAssemblyStats {
  const { occupancy, zones, meshes, meshKey, mixes } = input;
  const clusterCount = occupancy.length;
  const occupiedZones = new Set(occupancy.map((item) => item.zoneId)).size;
  const zoneCount = zones.length;

  const categoryCounts = Object.fromEntries(
    FINAL_CLUSTER_PAIRS.map((pair) => [pair.id, 0]),
  ) as Record<FinalClusterPairId, number>;
  const hostCounts = Object.fromEntries(
    ZONE_KIND_ORDER.map((kind) => [kind.id, 0]),
  ) as Record<ZoneKind, number>;

  let mirroredCount = 0;
  let groundCount = 0;
  let elevatedCount = 0;
  let pendingElevation = 0;

  for (const record of occupancy) {
    categoryCounts[record.programId as FinalClusterPairId] =
      (categoryCounts[record.programId as FinalClusterPairId] ?? 0) + 1;
    const zone = zones.find((item) => item.id === record.zoneId);
    if (zone) hostCounts[zone.kind] += 1;
    if (record.transform.mirror === "x" || record.transform.mirror === "z") mirroredCount += 1;

    const positions = meshes[meshKey(record)]?.positions ?? null;
    const elevation = placementElevationClass(record, zone, positions);
    if (elevation === "ground") groundCount += 1;
    else if (elevation === "elevated") elevatedCount += 1;
    else pendingElevation += 1;
  }

  const categories: PlacementCategoryStat[] = FINAL_CLUSTER_PAIRS.map((pair) => ({
    id: pair.id,
    label: pair.label,
    count: categoryCounts[pair.id] ?? 0,
    percent: percent(categoryCounts[pair.id] ?? 0, clusterCount),
  }));

  const hostKinds: PlacementHostKindStat[] = ZONE_KIND_ORDER.map((kind) => ({
    kind: kind.id,
    label: kind.label,
    count: hostCounts[kind.id],
    percent: percent(hostCounts[kind.id], clusterCount),
  }));

  const constituentTiles = { lobby: 0, workspace: 0, gathering: 0 };
  let constituentUnrecorded = 0;
  for (const record of occupancy) {
    const mix = mixes[`${record.programId}:${record.finishedClusterId}`];
    if (!mix) {
      constituentUnrecorded += 1;
      continue;
    }
    constituentTiles.lobby += mix.lobby;
    constituentTiles.workspace += mix.workspace;
    constituentTiles.gathering += mix.gathering;
  }

  return {
    clusterCount,
    occupiedZones,
    zoneCount,
    categories,
    hostKinds,
    constituentTiles,
    constituentUnrecorded,
    groundCount,
    elevatedCount,
    pendingElevation,
    mirroredCount,
  };
}