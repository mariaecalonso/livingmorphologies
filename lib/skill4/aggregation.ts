import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff } from "./adapt";
import { placedFaceFrame, resolveAssemblyHybrid, sectionCenter } from "./assembly-hybrid";
import { detectAdjacencies, type TileConnection } from "./connections";
import type { FaceId, Vec3 } from "./contract";
import { currentGeneratedField } from "./hybrid-display";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import type { TileInstance } from "./tiles";

/**
 * Relational fit for one selected hybrid.
 * A connection is ready when the tiles meet on the selected faces and the
 * placed connector's end rings sit on those section centers.
 * Meshes are not unioned or cut.
 */
export const AGGREGATION_SETTINGS = {
  version: "skill4-aggregation-v1",
  attachmentTolerance: 1e-4,
} as const;

export type AggregationStatus = "ready" | "not-generated" | "empty" | "blocked" | "invalid" | "unresolved";

export type AggregationAssemblyStatus = "ready" | "partial" | "not-ready";

export type AggregationContact = {
  tileId: string;
  face: FaceId;
  center: Vec3;
  normal: Vec3;
};

export type AggregationConnection = {
  connectionId: string;
  candidateId: string | null;
  status: AggregationStatus;
  tileA: string;
  tileB: string;
  faceA: FaceId;
  faceB: FaceId;
  geometry: IsoMesh | null;
  contactA: AggregationContact | null;
  contactB: AggregationContact | null;
  span: number | null;
  attachmentErrorA: number | null;
  attachmentErrorB: number | null;
};

export type AggregationResult = {
  connections: AggregationConnection[];
  readyCount: number;
  unresolvedCount: number;
  failedCount: number;
  status: AggregationAssemblyStatus;
};

export function aggregationStatusLabel(status: AggregationStatus) {
  if (status === "ready") return "READY";
  if (status === "not-generated") return "NOT GENERATED";
  if (status === "empty") return "EMPTY";
  if (status === "blocked") return "BLOCKED";
  if (status === "invalid") return "INVALID";
  return "UNRESOLVED";
}

export function aggregationAssemblyLabel(status: AggregationAssemblyStatus) {
  if (status === "ready") return "READY";
  if (status === "partial") return "PARTIAL";
  return "NOT READY";
}

export function evaluateAggregation(
  connections: readonly TileConnection[],
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): AggregationResult {
  const evaluated = connections.map((connection) => evaluateConnection(connection, tiles, loaded));
  const readyCount = evaluated.filter((item) => item.status === "ready").length;
  const unresolvedCount = evaluated.filter((item) => item.status === "unresolved").length;
  const failedCount = evaluated.length - readyCount - unresolvedCount;
  const status: AggregationAssemblyStatus = evaluated.length > 0 && readyCount === evaluated.length
    ? "ready"
    : readyCount > 0
      ? "partial"
      : "not-ready";
  return { connections: evaluated, readyCount, unresolvedCount, failedCount, status };
}

function evaluateConnection(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): AggregationConnection {
  const contactA = contactFor(connection.tileAId, connection.faceA, tiles, loaded);
  const contactB = contactFor(connection.tileBId, connection.faceB, tiles, loaded);
  const span = contactA && contactB ? distance(contactA.center, contactB.center) : null;
  const base = {
    connectionId: connection.id,
    candidateId: connection.selectedMockId,
    tileA: connection.tileAId,
    tileB: connection.tileBId,
    faceA: connection.faceA,
    faceB: connection.faceB,
    contactA,
    contactB,
    span,
  };
  const field = currentGeneratedField(connection);
  if (!field) {
    return { ...base, status: "not-generated", geometry: null, attachmentErrorA: null, attachmentErrorB: null };
  }
  const candidate = field.candidates.find((item) => item.candidateId === connection.selectedMockId) ?? null;
  if (!candidate) {
    return { ...base, status: "invalid", geometry: null, attachmentErrorA: null, attachmentErrorB: null };
  }
  if (candidate.status !== "ready" || !candidate.geometry) {
    return { ...base, status: candidate.status, geometry: null, attachmentErrorA: null, attachmentErrorB: null };
  }
  const placed = resolveAssemblyHybrid(connection, tiles, loaded);
  const geometry = placed.source === "real" ? placed.geometry : null;
  const samples = geometry ? ringSampleCount(geometry) : null;
  const errorA = geometry && samples && contactA ? distance(ringCentroid(geometry, 0, samples), contactA.center) : null;
  const errorB = geometry && samples && contactB ? distance(ringCentroid(geometry, samples.steps - 1, samples), contactB.center) : null;
  const tolerance = AGGREGATION_SETTINGS.attachmentTolerance;
  const attached = errorA !== null && errorB !== null && errorA <= tolerance && errorB <= tolerance;
  const detected = detectAdjacencies(tiles).find((item) => item.id === connection.id);
  const facesMeet = detected?.faceA === connection.faceA && detected?.faceB === connection.faceB;
  return {
    ...base,
    status: attached && facesMeet ? "ready" : "unresolved",
    geometry,
    attachmentErrorA: errorA,
    attachmentErrorB: errorB,
  };
}

function contactFor(
  tileId: string,
  face: FaceId,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): AggregationContact | null {
  const tile = tiles.find((item) => item.instanceId === tileId);
  if (!tile) return null;
  const handoff = loaded.get(tile.archetypeId);
  if (!handoff || handoff.status !== "ready") return null;
  const source = handoff.faces[face];
  if (!source) return null;
  const placed = placedFaceFrame(source, tile);
  return {
    tileId,
    face,
    center: sectionCenter(placed, HYBRID_GENERATOR_SETTINGS.sectionDepth),
    normal: { x: placed.normal.x, y: placed.normal.y, z: placed.normal.z },
  };
}

function ringSampleCount(mesh: IsoMesh) {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount % steps !== 0) return null;
  return { sampleCount: vertexCount / steps, steps };
}

function ringCentroid(mesh: IsoMesh, ring: number, layout: { sampleCount: number; steps: number }): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let sample = 0; sample < layout.sampleCount; sample += 1) {
    const offset = (ring * layout.sampleCount + sample) * 3;
    x += mesh.positions[offset];
    y += mesh.positions[offset + 1];
    z += mesh.positions[offset + 2];
  }
  return { x: x / layout.sampleCount, y: y / layout.sampleCount, z: z / layout.sampleCount };
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
