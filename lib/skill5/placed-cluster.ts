import { CLIENT_ACTIVITY_SEED } from "@/lib/skill5/client-compatibility";
import { polygonCentroid, type ZoneKind, type ZoningRegion } from "@/lib/skill5/zoning";

/**
 * One designer zone → one finished program cluster → one site pose.
 * This is the Cluster Assembly occupancy contract.
 * Do not coerce these records into PlacedModule tiles.
 */
export const CLUSTER_ASSEMBLY_CONTRACT = "skill5-cluster-assemblies-v1" as const;

export type OccupancyProvenance = "manual" | "assisted" | "automatic-initial";

/** Site pose in feet. +X east, +Y up, +Z north. rotationY is yaw in degrees, matching packing. */
export type ClusterSitePose = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /** Plan mirror before yaw. East = x, north = z. */
  mirror?: "x" | "z" | null;
};

export type SourceModuleIdentity = {
  moduleId: string;
  archetypeId: string;
  candidateId: number | null;
  continuationId: string | null;
};

export type FinishedClusterSource = {
  finishedClusterId: string;
  programId: string;
  iteration: number | null;
  modules: SourceModuleIdentity[];
};

export type PlacedCluster = {
  occupancyId: string;
  zoneId: string;
  programId: string;
  finishedClusterId: string;
  transform: ClusterSitePose;
  selectedNetworkId: string;
  zoningSignature: string;
  source: FinishedClusterSource;
  provenance: OccupancyProvenance;
};

export type AssemblyConnectionRecord = {
  id: string;
  fromOccupancyId?: string;
  toOccupancyId?: string;
  fromZoneId?: string;
  toZoneId?: string;
  mode?: "direct" | "hybrid";
  note?: string;
};

export type ClusterAssemblyRecord = {
  assemblyId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  selectedNetworkId: string;
  zoningSignature: string;
  zones: ZoningRegion[];
  occupancy: PlacedCluster[];
  sourceFinishedClusterIds: string[];
  sourceModuleIds: string[];
  connections: AssemblyConnectionRecord[];
  provenance: {
    modes: OccupancyProvenance[];
    savedFrom: "placement" | "auto-initial" | "catalog";
  };
};

export type ClusterAssemblyDocument = {
  contract: typeof CLUSTER_ASSEMBLY_CONTRACT;
  siteId: string;
  selectedAssemblyId: string | null;
  assemblies: ClusterAssemblyRecord[];
};

export function occupancyIdForZone(zoneId: string) {
  return `occ-${zoneId}`;
}

export function programZoneKind(programId: string, activities = CLIENT_ACTIVITY_SEED): ZoneKind | null {
  const context = activities.activities.find((item) => item.id === programId)?.contexts[0];
  if (context === "lobby" || context === "workspace" || context === "gathering") return context;
  return null;
}

/** Finished clusters occupy designer zones that came from network pockets. */
export function isPocketBoundZone(zone: Pick<ZoningRegion, "pocketId" | "sourcePocketIds">) {
  return Boolean(zone.pocketId) || Boolean(zone.sourcePocketIds && zone.sourcePocketIds.length > 0);
}

export function programsForZoneKind(kind: ZoneKind) {
  return CLIENT_ACTIVITY_SEED.activities
    .filter((item) => item.contexts[0] === kind)
    .map((item) => item.id);
}

export function defaultClusterPose(zone: Pick<ZoningRegion, "points" | "baseFt">): ClusterSitePose {
  const center = polygonCentroid(zone.points);
  return { x: center.x, y: zone.baseFt, z: center.z, rotationY: 0 };
}

export function replaceZoneOccupancy(records: readonly PlacedCluster[], next: PlacedCluster): PlacedCluster[] {
  return [...records.filter((item) => item.zoneId !== next.zoneId), next];
}

export function occupancyInZone(records: readonly PlacedCluster[], zoneId: string) {
  return records.find((item) => item.zoneId === zoneId) ?? null;
}

export function rotateOccupancy(record: PlacedCluster, degrees = 90): PlacedCluster {
  const yaw = ((record.transform.rotationY + degrees) % 360 + 360) % 360;
  return { ...record, transform: { ...record.transform, rotationY: yaw } };
}

export function translateOccupancy(record: PlacedCluster, east: number, north: number): PlacedCluster {
  return {
    ...record,
    transform: { ...record.transform, x: record.transform.x + east, z: record.transform.z + north },
  };
}

export function assemblySourceIds(occupancy: readonly PlacedCluster[]) {
  const sourceFinishedClusterIds = [...new Set(occupancy.map((item) => item.finishedClusterId))];
  const sourceModuleIds = [...new Set(occupancy.flatMap((item) => item.source.modules.map((module) => module.moduleId)))];
  const modes = [...new Set(occupancy.map((item) => item.provenance))];
  return { sourceFinishedClusterIds, sourceModuleIds, modes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPose(value: unknown): ClusterSitePose | null {
  if (!isRecord(value)) return null;
  const mirror = value.mirror === "x" || value.mirror === "z" ? value.mirror : value.mirror === null ? null : undefined;
  return {
    x: readNumber(value.x),
    y: readNumber(value.y),
    z: readNumber(value.z),
    rotationY: readNumber(value.rotationY),
    ...(mirror !== undefined ? { mirror } : {}),
  };
}

function readModule(value: unknown): SourceModuleIdentity | null {
  if (!isRecord(value) || typeof value.moduleId !== "string" || typeof value.archetypeId !== "string") return null;
  return {
    moduleId: value.moduleId,
    archetypeId: value.archetypeId,
    candidateId: typeof value.candidateId === "number" ? value.candidateId : null,
    continuationId: typeof value.continuationId === "string" ? value.continuationId : null,
  };
}

function readSource(value: unknown, finishedClusterId: string, programId: string): FinishedClusterSource {
  if (!isRecord(value)) {
    return { finishedClusterId, programId, iteration: null, modules: [] };
  }
  const modules = Array.isArray(value.modules) ? value.modules.flatMap((item) => {
    const module = readModule(item);
    return module ? [module] : [];
  }) : [];
  return {
    finishedClusterId: typeof value.finishedClusterId === "string" ? value.finishedClusterId : finishedClusterId,
    programId: typeof value.programId === "string" ? value.programId : programId,
    iteration: typeof value.iteration === "number" && Number.isInteger(value.iteration) ? value.iteration : null,
    modules,
  };
}

function isProvenance(value: unknown): value is OccupancyProvenance {
  return value === "manual" || value === "assisted" || value === "automatic-initial";
}

export function readPlacedCluster(value: unknown): PlacedCluster | null {
  if (!isRecord(value)) return null;
  if (typeof value.zoneId !== "string" || typeof value.programId !== "string" || typeof value.finishedClusterId !== "string") return null;
  if (typeof value.selectedNetworkId !== "string") return null;
  const transform = readPose(value.transform);
  if (!transform) return null;
  const provenance = isProvenance(value.provenance) ? value.provenance : "manual";
  return {
    occupancyId: typeof value.occupancyId === "string" ? value.occupancyId : occupancyIdForZone(value.zoneId),
    zoneId: value.zoneId,
    programId: value.programId,
    finishedClusterId: value.finishedClusterId,
    transform,
    selectedNetworkId: value.selectedNetworkId,
    zoningSignature: typeof value.zoningSignature === "string" ? value.zoningSignature : "",
    source: readSource(value.source, value.finishedClusterId, value.programId),
    provenance,
  };
}

export function readOccupancyList(value: unknown): PlacedCluster[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: PlacedCluster[] = [];
  for (const item of value) {
    const record = readPlacedCluster(item);
    if (!record || seen.has(record.zoneId)) continue;
    seen.add(record.zoneId);
    records.push(record);
  }
  return records;
}

function readConnection(value: unknown): AssemblyConnectionRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    fromOccupancyId: typeof value.fromOccupancyId === "string" ? value.fromOccupancyId : undefined,
    toOccupancyId: typeof value.toOccupancyId === "string" ? value.toOccupancyId : undefined,
    fromZoneId: typeof value.fromZoneId === "string" ? value.fromZoneId : undefined,
    toZoneId: typeof value.toZoneId === "string" ? value.toZoneId : undefined,
    mode: value.mode === "direct" || value.mode === "hybrid" ? value.mode : undefined,
    note: typeof value.note === "string" ? value.note : undefined,
  };
}

export function readConnectionList(value: unknown): AssemblyConnectionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = readConnection(item);
    return record ? [record] : [];
  });
}

/**
 * Center a finished-cluster mesh: plan centroid at origin, minY at 0.
 * Pair with a site pose group (or poseFinishedMesh) for placement.
 */
export function centerFinishedMesh(positions: ArrayLike<number>): Float32Array {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const out = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    out[index] = positions[index] - cx;
    out[index + 1] = positions[index + 1] - minY;
    out[index + 2] = positions[index + 2] - cz;
  }
  return out;
}

/**
 * Pose a finished-cluster mesh into site coordinates.
 * Matches packing: optional plan mirror, yaw about vertical, plan centroid to transform x/z, mesh minY onto transform.y.
 */
export function poseFinishedMesh(positions: ArrayLike<number>, transform: ClusterSitePose): Float32Array {
  const local = centerFinishedMesh(positions);
  const radians = transform.rotationY * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const mx = transform.mirror === "x" ? -1 : 1;
  const mz = transform.mirror === "z" ? -1 : 1;
  const out = new Float32Array(local.length);
  for (let index = 0; index < local.length; index += 3) {
    const dx = local[index] * mx;
    const dz = local[index + 2] * mz;
    out[index] = transform.x + dx * cos - dz * sin;
    out[index + 1] = local[index + 1] + transform.y;
    out[index + 2] = transform.z + dx * sin + dz * cos;
  }
  return out;
}
