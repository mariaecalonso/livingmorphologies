import { FINAL_CLUSTER_PAIRS } from "@/lib/skill4/final-cluster-pairs";
import { CLIENT_ACTIVITY_SEED } from "@/lib/skill5/client-compatibility";
import { pointInRing } from "@/lib/skill5/placement";
import type { XZ } from "@/lib/skill5/site-model";
import { polygonCentroid, type ZoneKind, type ZoningRegion } from "@/lib/skill5/zoning";

/** Modeled bay surface in site feet (+Y up). Matches the water slab in the site viewport. */
export const BAY_WATER_SURFACE_FT = 0;

/**
 * PlacedCluster occupancy for Cluster Assembly. A zone may hold multiple manual placements.
 * Do not coerce these records into PlacedModule tiles.
 */
export const CLUSTER_ASSEMBLY_CONTRACT = "skill5-cluster-assemblies-v1" as const;

export type OccupancyProvenance = "manual" | "assisted" | "automatic-initial";

/** Site pose in feet. +X east, +Y up, +Z north. Rotations are degrees. Yaw matches packing. Pitch and roll are optional and are not reset when absent. */
export type ClusterSitePose = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  rotationX?: number;
  rotationZ?: number;
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

/** Final Cluster pair ids and legacy client activities accepted by Placement. */
export function placementProgramKinds(programId: string, activities = CLIENT_ACTIVITY_SEED): readonly ZoneKind[] {
  const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === programId);
  if (pair) return pair.id === "mixed" ? ["lobby", "workspace", "gathering"] : pair.a === pair.b ? [pair.a] : [pair.a, pair.b];
  const kind = programZoneKind(programId, activities);
  return kind ? [kind] : [];
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

let occupancySerial = 0;

/** Unique id for one placed instance. Repeats of the same catalog cluster each get their own id. */
export function newOccupancyId(zoneId: string, _records: readonly PlacedCluster[] = []) {
  occupancySerial += 1;
  return `${occupancyIdForZone(zoneId)}--${occupancySerial.toString(36)}`;
}

/** Pose for another cluster in the same zone — click point, else a clear seat near the centroid. */
export function poseForAddedCluster(
  zone: Pick<ZoningRegion, "id" | "points" | "baseFt">,
  records: readonly PlacedCluster[],
  at?: { x: number; z: number },
): ClusterSitePose {
  const ring = zone.points.map((point) => [point.x, point.z] as [number, number]);
  if (at && pointInRing(at.x, at.z, ring)) {
    return { x: at.x, y: zone.baseFt, z: at.z, rotationY: 0 };
  }
  const center = defaultClusterPose(zone);
  const inZone = occupanciesInZone(records, zone.id);
  if (inZone.length === 0) return center;
  const taken = (x: number, z: number) => inZone.some((item) => Math.hypot(item.transform.x - x, item.transform.z - z) < 10);
  for (let step = 0; step < 16; step += 1) {
    const radius = 12 + Math.floor(step / 8) * 12;
    const angle = step * 0.9;
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;
    if (!taken(x, z) && pointInRing(x, z, ring)) return { x, y: zone.baseFt, z, rotationY: 0 };
  }
  const nudge = inZone.length * 8;
  return { x: center.x + nudge, y: zone.baseFt, z: center.z + nudge, rotationY: 0 };
}

export function replaceZoneOccupancy(records: readonly PlacedCluster[], next: PlacedCluster): PlacedCluster[] {
  return [...records.filter((item) => item.zoneId !== next.zoneId), next];
}

/** Keep every occupancy in the zone; replace only when the occupancy id matches. */
export function upsertOccupancy(records: readonly PlacedCluster[], next: PlacedCluster): PlacedCluster[] {
  return [...records.filter((item) => item.occupancyId !== next.occupancyId), next];
}

export function occupanciesInZone(records: readonly PlacedCluster[], zoneId: string) {
  return records.filter((item) => item.zoneId === zoneId);
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

/** Flip the plan mirror axis for a stacked twin: null → x → z → null. */
export function mirrorClusterCopyTransform(transform: ClusterSitePose): ClusterSitePose {
  const mirror = transform.mirror === "x" ? "z" : transform.mirror === "z" ? null : "x";
  return { ...transform, mirror };
}

export function planPositionNear(
  a: Pick<ClusterSitePose, "x" | "z">,
  b: Pick<ClusterSitePose, "x" | "z">,
  epsilon = 0.15,
) {
  return Math.hypot(a.x - b.x, a.z - b.z) <= epsilon;
}

/** Mirrored plan pose seated on the supporter’s top at the same east / north anchor. */
export function mirrorStackPose(
  positions: ArrayLike<number>,
  sourcePose: ClusterSitePose,
  groundY: number,
): ClusterSitePose {
  return stackClusterOn(
    positions,
    mirrorClusterCopyTransform(sourcePose),
    groundY,
    { positions, pose: sourcePose },
  );
}

/**
 * Rigid follow for a group: the member keeps its offset from the primary while the primary moves or rotates
 * (plan yaw orbits about the primary anchor).
 */
export function rigidGroupMemberPose(
  memberBase: ClusterSitePose,
  primaryBase: ClusterSitePose,
  primaryNext: ClusterSitePose,
): ClusterSitePose {
  const dYaw = primaryNext.rotationY - primaryBase.rotationY;
  const rad = -dYaw * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const ox = memberBase.x - primaryBase.x;
  const oz = memberBase.z - primaryBase.z;
  return {
    ...memberBase,
    x: primaryNext.x + ox * c - oz * s,
    z: primaryNext.z + ox * s + oz * c,
    y: memberBase.y + (primaryNext.y - primaryBase.y),
    rotationY: memberBase.rotationY + dYaw,
    rotationX: (memberBase.rotationX ?? 0) + ((primaryNext.rotationX ?? 0) - (primaryBase.rotationX ?? 0)),
    rotationZ: (memberBase.rotationZ ?? 0) + ((primaryNext.rotationZ ?? 0) - (primaryBase.rotationZ ?? 0)),
  };
}

/** Seat a cluster on top of another at the supporter’s plan position. */
export function stackClusterOn(
  positions: ArrayLike<number>,
  pose: ClusterSitePose,
  groundY: number,
  under: ClusterSupport,
): ClusterSitePose {
  const top = posedExtents(under.positions, under.pose).maxY;
  const ground = Number.isFinite(groundY) ? groundY : 0;
  const support = Math.max(ground, top);
  const drop = positions.length >= 3 ? rotatedPoseDrop(positions, pose) : 0;
  return {
    ...pose,
    x: under.pose.x,
    z: under.pose.z,
    y: support - drop,
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

export function readPose(value: unknown): ClusterSitePose | null {
  if (!isRecord(value)) return null;
  const mirror = value.mirror === "x" || value.mirror === "z" ? value.mirror : value.mirror === null ? null : undefined;
  return {
    x: readNumber(value.x),
    y: readNumber(value.y),
    z: readNumber(value.z),
    rotationY: readNumber(value.rotationY),
    ...(typeof value.rotationX === "number" && Number.isFinite(value.rotationX) ? { rotationX: value.rotationX } : {}),
    ...(typeof value.rotationZ === "number" && Number.isFinite(value.rotationZ) ? { rotationZ: value.rotationZ } : {}),
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
    if (!record || seen.has(record.occupancyId)) continue;
    seen.add(record.occupancyId);
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
 * The mesh is the shrink wrap of the parent tiles and connectors, so one pose moves all of them.
 * Mirror first, then roll and pitch about the horizontal axes, then yaw about the site vertical.
 * Yaw is outermost, so a plan turn stays horizontal and does not add tilt.
 * transform.y is the zone base plus the lift that seats the rotated bottom on that ground.
 */
export function poseFinishedMesh(positions: ArrayLike<number>, transform: ClusterSitePose): Float32Array {
  const local = centerFinishedMesh(positions);
  const rx = (transform.rotationX ?? 0) * Math.PI / 180;
  const ry = -transform.rotationY * Math.PI / 180;
  const rz = (transform.rotationZ ?? 0) * Math.PI / 180;
  const mx = transform.mirror === "x" ? -1 : 1;
  const mz = transform.mirror === "z" ? -1 : 1;
  const out = new Float32Array(local.length);
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  for (let index = 0; index < local.length; index += 3) {
    const x = local[index] * mx;
    const y = local[index + 1];
    const z = local[index + 2] * mz;
    const x1 = x * cz - y * sz;
    const y1 = x * sz + y * cz;
    const z1 = z;
    const y2 = y1 * cx - z1 * sx;
    const z2 = y1 * sx + z1 * cx;
    const x2 = x1;
    const x3 = x2 * cy + z2 * sy;
    const y3 = y2;
    const z3 = -x2 * sy + z2 * cy;
    out[index] = transform.x + x3;
    out[index + 1] = transform.y + y3;
    out[index + 2] = transform.z + z3;
  }
  return out;
}

const rotatedDropCache = new WeakMap<object, Map<string, number>>();

/** How far the rotated shrink-wrap extends below the pose origin. Upright and centered, this is 0. */
export function rotatedPoseDrop(positions: ArrayLike<number>, pose: ClusterSitePose) {
  const cacheKey = positions as object;
  let table = rotatedDropCache.get(cacheKey);
  if (!table) {
    table = new Map();
    rotatedDropCache.set(cacheKey, table);
  }
  const key = `${pose.rotationX ?? 0}|${pose.rotationY}|${pose.rotationZ ?? 0}|${pose.mirror ?? ""}`;
  const cached = table.get(key);
  if (cached !== undefined) return cached;
  const posed = poseFinishedMesh(positions, { ...pose, x: 0, y: 0, z: 0 });
  let min = Infinity;
  for (let index = 1; index < posed.length; index += 3) {
    const y = posed[index];
    if (y < min) min = y;
  }
  const drop = Number.isFinite(min) ? min : 0;
  table.set(key, drop);
  return drop;
}

/**
 * Put the lowest point of the rotated cluster on the site ground.
 * groundY is the zone base used at placement, not the raised drawing height of the zone fill.
 */
export function seatPoseOnGround(
  positions: ArrayLike<number> | null | undefined,
  pose: ClusterSitePose,
  groundY: number,
): ClusterSitePose {
  const ground = Number.isFinite(groundY) ? groundY : 0;
  const drop = positions && positions.length >= 3 ? rotatedPoseDrop(positions, pose) : 0;
  return { ...pose, y: ground - drop };
}

export type PlacedExtents = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/** Axis-aligned bounds of a posed finished-cluster mesh in site coordinates. Plan overlap ignores height. */
export function posedExtents(positions: ArrayLike<number>, pose: ClusterSitePose): PlacedExtents {
  const posed = poseFinishedMesh(positions, pose);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < posed.length; index += 3) {
    const x = posed[index];
    const y = posed[index + 1];
    const z = posed[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function planOverlaps(a: PlacedExtents, b: PlacedExtents, gap = 0.75) {
  return a.minX <= b.maxX + gap
    && a.maxX + gap >= b.minX
    && a.minZ <= b.maxZ + gap
    && a.maxZ + gap >= b.minZ;
}

export type ClusterSupport = {
  positions: ArrayLike<number>;
  pose: ClusterSitePose;
};

/** Highest surface under this plan footprint: zone base or the top of an overlapping cluster. */
export function supportElevationForCluster(
  positions: ArrayLike<number>,
  pose: ClusterSitePose,
  groundY: number,
  supporters: readonly ClusterSupport[],
): number {
  const ground = Number.isFinite(groundY) ? groundY : 0;
  if (positions.length < 3) return ground;
  const drop = rotatedPoseDrop(positions, pose);
  const probe = posedExtents(positions, { ...pose, y: ground - drop });
  let support = ground;
  for (const other of supporters) {
    if (other.positions.length < 3) continue;
    const their = posedExtents(other.positions, other.pose);
    if (planOverlaps(probe, their)) support = Math.max(support, their.maxY);
  }
  return support;
}

/** Seat the cluster bottom on the site ground or on top of overlapping clusters below. */
export function seatPoseOnSupport(
  positions: ArrayLike<number> | null | undefined,
  pose: ClusterSitePose,
  groundY: number,
  supporters: readonly ClusterSupport[],
): ClusterSitePose {
  if (!positions || positions.length < 3) return seatPoseOnGround(null, pose, groundY);
  const support = supportElevationForCluster(positions, pose, groundY, supporters);
  const drop = rotatedPoseDrop(positions, pose);
  return { ...pose, y: support - drop };
}

/** Plan samples for a posed cluster — centroid and corners of the XZ footprint. */
export function clusterPlanFootprintSamples(positions: ArrayLike<number>, pose: ClusterSitePose) {
  const ext = posedExtents(positions, pose);
  const cx = (ext.minX + ext.maxX) / 2;
  const cz = (ext.minZ + ext.maxZ) / 2;
  return [
    { x: cx, z: cz },
    { x: ext.minX, z: ext.minZ },
    { x: ext.maxX, z: ext.minZ },
    { x: ext.minX, z: ext.maxZ },
    { x: ext.maxX, z: ext.maxZ },
  ];
}

/** True when any footprint sample lies in the mapped bay ring. */
export function clusterOverWater(
  positions: ArrayLike<number> | null | undefined,
  pose: ClusterSitePose,
  water: readonly XZ[],
  surfaceFt = BAY_WATER_SURFACE_FT,
): boolean {
  if (!positions || positions.length < 3 || water.length < 3) return false;
  const samples = clusterPlanFootprintSamples(positions, pose);
  return samples.some((point) => pointInRing(point.x, point.z, water));
}

/**
 * Lowest allowed pose.y when sinking in the bay — most of the mass may sit below the water surface.
 * Returns null when the footprint is not over water.
 */
export function clusterSinkMinPoseY(
  positions: ArrayLike<number> | null | undefined,
  pose: ClusterSitePose,
  water: readonly XZ[],
  surfaceFt = BAY_WATER_SURFACE_FT,
): number | null {
  if (!positions || positions.length < 3 || !clusterOverWater(positions, pose, water)) return null;
  const drop = rotatedPoseDrop(positions, pose);
  const ext = posedExtents(positions, { ...pose, y: 0 });
  const height = Math.max(1, ext.maxY - ext.minY);
  return surfaceFt - drop - height * 0.92;
}

