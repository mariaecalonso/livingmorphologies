import type { IsoMesh } from "../scan/isomesh";
import type { AggregationConnection, AggregationResult } from "./aggregation";
import type { FaceId, Vec3 } from "./contract";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import type { TileInstance } from "./tiles";

/**
 * Separate insertion volumes for a ready aggregation connection.
 * Each volume continues the end ring into its tile along the inward face normal.
 * Tile meshes and stored hybrids are not cut, unioned, or rewritten.
 */
export const INTERLOCK_SETTINGS = {
  version: "skill4-interlock-v1",
  attachmentDepth: 0.08,
} as const;

export type InterlockStatus = "ready" | "not-ready" | "blocked" | "invalid" | "unresolved";

export type InterlockAssemblyStatus = "ready" | "partial" | "not-ready";

export type InterlockInterface = {
  tileId: string;
  face: FaceId;
  center: Vec3;
  normal: Vec3;
  inward: Vec3;
};

export type InterlockOverlap = {
  attachmentDepth: number;
  insertionSpan: number;
  pointsIntoTile: boolean;
};

export type InterlockConnection = {
  connectionId: string;
  candidateId: string | null;
  status: InterlockStatus;
  connectorGeometry: IsoMesh | null;
  interfaceA: InterlockInterface | null;
  interfaceB: InterlockInterface | null;
  insertionA: IsoMesh | null;
  insertionB: IsoMesh | null;
  attachmentDepthA: number | null;
  attachmentDepthB: number | null;
  overlapA: InterlockOverlap | null;
  overlapB: InterlockOverlap | null;
};

export type InterlockResult = {
  connections: InterlockConnection[];
  readyCount: number;
  failedCount: number;
  status: InterlockAssemblyStatus;
};

export function interlockAssemblyLabel(status: InterlockAssemblyStatus) {
  if (status === "ready") return "READY";
  if (status === "partial") return "PARTIAL";
  return "NOT READY";
}

export function buildInterlocks(aggregation: AggregationResult, tiles: readonly TileInstance[]): InterlockResult {
  const connections = aggregation.connections.map((connection) => buildConnection(connection, tiles));
  const readyCount = connections.filter((item) => item.status === "ready").length;
  const failedCount = connections.length - readyCount;
  const status: InterlockAssemblyStatus = connections.length > 0 && readyCount === connections.length
    ? "ready"
    : readyCount > 0
      ? "partial"
      : "not-ready";
  return { connections, readyCount, failedCount, status };
}

function buildConnection(connection: AggregationConnection, tiles: readonly TileInstance[]): InterlockConnection {
  const blank = empty(connection);
  if (connection.status === "blocked") return { ...blank, status: "blocked" };
  if (connection.status === "invalid") return { ...blank, status: "invalid" };
  if (connection.status !== "ready" || !connection.geometry || !connection.contactA || !connection.contactB) {
    return { ...blank, status: "not-ready" };
  }
  const layout = ringLayout(connection.geometry);
  const sideA = endVolume(connection.geometry, 0, layout, connection.contactA, connection.tileA, tiles);
  const sideB = endVolume(connection.geometry, layout ? layout.steps - 1 : 0, layout, connection.contactB, connection.tileB, tiles);
  if (!sideA || !sideB) return { ...blank, status: "unresolved" };
  return {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status: "ready",
    connectorGeometry: copyMesh(connection.geometry),
    interfaceA: sideA.face,
    interfaceB: sideB.face,
    insertionA: sideA.mesh,
    insertionB: sideB.mesh,
    attachmentDepthA: sideA.overlap.attachmentDepth,
    attachmentDepthB: sideB.overlap.attachmentDepth,
    overlapA: sideA.overlap,
    overlapB: sideB.overlap,
  };
}

function endVolume(
  connector: IsoMesh,
  ring: number,
  layout: { sampleCount: number; steps: number } | null,
  contact: NonNullable<AggregationConnection["contactA"]>,
  tileId: string,
  tiles: readonly TileInstance[],
) {
  if (!layout) return null;
  const inward = inwardDirection(contact.normal);
  const tile = tiles.find((item) => item.instanceId === tileId);
  if (!inward || !tile) return null;
  const towardTile = sub(tile.transform, contact.center);
  if (dot(inward, towardTile) <= 1e-4) return null;
  const ringPoints = readRing(connector, ring, layout.sampleCount);
  const depth = INTERLOCK_SETTINGS.attachmentDepth;
  const mesh = insertionVolume(ringPoints, inward, depth);
  const interfaceCenter = centroid(ringPoints);
  const innerCenter = centroid(ringPoints.map((point) => add(point, scale(inward, depth))));
  const insertionSpan = distance(interfaceCenter, innerCenter);
  return {
    face: {
      tileId,
      face: contact.face,
      center: { ...contact.center },
      normal: { ...contact.normal },
      inward,
    },
    mesh,
    overlap: {
      attachmentDepth: depth,
      insertionSpan,
      pointsIntoTile: true,
    },
  };
}

function inwardDirection(normal: Vec3): Vec3 | null {
  const span = length(normal);
  if (span < 0.999 || span > 1.001) return null;
  return scale(normal, -1 / span);
}

function insertionVolume(ring: readonly Vec3[], inward: Vec3, depth: number): IsoMesh {
  const count = ring.length;
  const center = centroid(ring);
  const positions: number[] = [];
  for (const point of ring) positions.push(point.x, point.y, point.z);
  for (const point of ring) {
    const inner = add(point, scale(inward, depth));
    positions.push(inner.x, inner.y, inner.z);
  }
  const indices: number[] = [];
  const back = scale(inward, -1);
  for (let sample = 1; sample < count - 1; sample += 1) {
    addTriangle(indices, positions, 0, sample, sample + 1, back);
    addTriangle(indices, positions, count, count + sample + 1, count + sample, inward);
  }
  for (let sample = 0; sample < count; sample += 1) {
    const next = (sample + 1) % count;
    const midpoint = lerp(ring[sample], ring[next], 0.5);
    let radial = sub(midpoint, center);
    radial = sub(radial, scale(inward, dot(radial, inward)));
    if (length(radial) <= 1e-8) radial = unitPerp(inward);
    addTriangle(indices, positions, sample, next, count + next, radial);
    addTriangle(indices, positions, sample, count + next, count + sample, radial);
  }
  const indexBuffer = Uint32Array.from(indices);
  return {
    positions: Float32Array.from(positions),
    normals: vertexNormals(positions, indexBuffer),
    indices: indexBuffer,
    triangles: indexBuffer.length / 3,
  };
}

function empty(connection: AggregationConnection): InterlockConnection {
  return {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status: "not-ready",
    connectorGeometry: null,
    interfaceA: null,
    interfaceB: null,
    insertionA: null,
    insertionB: null,
    attachmentDepthA: null,
    attachmentDepthB: null,
    overlapA: null,
    overlapB: null,
  };
}

function ringLayout(mesh: IsoMesh) {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount % steps !== 0) return null;
  const sampleCount = vertexCount / steps;
  if (sampleCount < 3) return null;
  return { sampleCount, steps };
}

function readRing(mesh: IsoMesh, ring: number, sampleCount: number): Vec3[] {
  const points: Vec3[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const offset = (ring * sampleCount + sample) * 3;
    points.push({ x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] });
  }
  return points;
}

function copyMesh(mesh: IsoMesh): IsoMesh {
  return {
    positions: Float32Array.from(mesh.positions),
    normals: Float32Array.from(mesh.normals),
    indices: Uint32Array.from(mesh.indices),
    triangles: mesh.triangles,
  };
}

function addTriangle(indices: number[], positions: number[], a: number, b: number, c: number, outward: Vec3) {
  const normal = cross(sub(at(positions, b), at(positions, a)), sub(at(positions, c), at(positions, a)));
  if (dot(normal, outward) < 0) indices.push(a, c, b);
  else indices.push(a, b, c);
}

function vertexNormals(positions: number[], indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    const normal = cross(sub(at(positions, b), at(positions, a)), sub(at(positions, c), at(positions, a)));
    addNormal(normals, a, normal);
    addNormal(normals, b, normal);
    addNormal(normals, c, normal);
  }
  for (let vertex = 0; vertex < normals.length; vertex += 3) {
    const span = Math.hypot(normals[vertex], normals[vertex + 1], normals[vertex + 2]);
    if (span > 1e-8) {
      normals[vertex] /= span;
      normals[vertex + 1] /= span;
      normals[vertex + 2] /= span;
    } else {
      normals[vertex + 1] = 1;
    }
  }
  return normals;
}

function addNormal(normals: Float32Array, vertex: number, normal: Vec3) {
  const offset = vertex * 3;
  normals[offset] += normal.x;
  normals[offset + 1] += normal.y;
  normals[offset + 2] += normal.z;
}

function at(positions: number[], vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}

function centroid(points: readonly Vec3[]): Vec3 {
  const total = points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 });
  return scale(total, 1 / Math.max(1, points.length));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function distance(a: Vec3, b: Vec3) {
  return length(sub(a, b));
}

function unitPerp(value: Vec3): Vec3 {
  const helper = Math.abs(value.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const perpendicular = cross(value, helper);
  return scale(perpendicular, 1 / length(perpendicular));
}
