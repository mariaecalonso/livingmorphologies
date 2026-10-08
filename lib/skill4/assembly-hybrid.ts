import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff, ReadyModule } from "./adapt";
import { mockPlacementSupported } from "./assembly-layout";
import { detectAdjacencies, type TileConnection } from "./connections";
import type { FaceFrame, Vec3 } from "./contract";
import { connectorFrame } from "./hybrid-deformation";
import { currentGeneratedField } from "./hybrid-display";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { mockHybridField } from "./mock-hybrids";
import type { TileInstance } from "./tiles";

/**
 * A stored connector is lofted between unplaced registration frames.
 * Display placement rebuilds a mesh so ring 0 sits on tile A's placed
 * section and the last ring sits on tile B's placed section.
 * Tile rotation, mirror, and translation follow the assembly shader:
 * mirror, then a quarter-turn yaw, then translation.
 */
export type AssemblyHybridSource = "real" | "mock" | "none";

export type AssemblyHybridStatus = "ready" | "empty" | "blocked" | "invalid" | "mock" | "not-generated" | "unresolved";

export type AssemblyHybridPlacement = "placed-faces" | "contact-marker" | "none";

export type AssemblyHybrid = {
  source: AssemblyHybridSource;
  candidateId: string | null;
  geometry: IsoMesh | null;
  status: AssemblyHybridStatus;
  placement: AssemblyHybridPlacement;
  translate: Vec3;
  spin: number;
};

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** Placed face frame. Same order as the assembly preview: mirror, yaw, translation. */
export function placedFaceFrame(
  frame: FaceFrame,
  tile: Pick<TileInstance, "transform" | "rotationQuarter" | "mirror">,
): FaceFrame {
  const turned = {
    origin: yaw(mirrorVec(frame.origin, tile.mirror), tile.rotationQuarter),
    normal: yaw(mirrorVec(frame.normal, tile.mirror), tile.rotationQuarter),
    u: yaw(mirrorVec(frame.u, tile.mirror), tile.rotationQuarter),
    v: yaw(mirrorVec(frame.v, tile.mirror), tile.rotationQuarter),
  };
  return { ...frame, ...turned, origin: add(turned.origin, tile.transform) };
}

export function sectionCenter(frame: FaceFrame, depth: number, shift: Vec3 = ORIGIN): Vec3 {
  return {
    x: frame.origin.x + shift.x - frame.normal.x * depth,
    y: frame.origin.y + shift.y - frame.normal.y * depth,
    z: frame.origin.z + shift.z - frame.normal.z * depth,
  };
}

export function placeGeneratedHybrid(
  mesh: IsoMesh,
  sourceA: FaceFrame,
  sourceB: FaceFrame,
  targetA: FaceFrame,
  targetB: FaceFrame,
  sampleCount: number,
  steps: number,
): IsoMesh | null {
  const depth = HYBRID_GENERATOR_SETTINGS.sectionDepth;
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(sampleCount) || sampleCount < 3 || !Number.isInteger(steps) || steps < 2) return null;
  if (vertexCount !== sampleCount * steps || mesh.normals.length !== mesh.positions.length) return null;
  const sourceStart = ringCentroid(mesh, 0, sampleCount);
  const sourceEnd = ringCentroid(mesh, steps - 1, sampleCount);
  const faceStart = sectionCenter(sourceA, depth);
  const faceEnd = sectionCenter(sourceB, depth);
  const targetStart = sectionCenter(targetA, depth);
  const targetEnd = sectionCenter(targetB, depth);
  const source = connectorFrame(sourceStart, sourceEnd);
  const face = connectorFrame(faceStart, faceEnd);
  const targetSpan = sub(targetEnd, targetStart);
  const targetLength = length(targetSpan);
  if (!source || !face || targetLength <= 1e-6) return null;
  if (Math.abs(dot(source.direction, face.direction)) < 0.999) return null;
  const targetDirection = scale(targetSpan, 1 / targetLength);
  const basisA = transportBasis(sourceA, targetA, source.tangent, source.bitangent);
  const basisB = transportBasis(sourceB, targetB, source.tangent, source.bitangent);
  if (!basisA || !basisB) return null;

  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const ring = Math.floor(vertex / sampleCount);
    const t = ring / (steps - 1);
    const sourceAxis = lerp(sourceStart, sourceEnd, t);
    const targetAxis = lerp(targetStart, targetEnd, t);
    const basis = sectionBasis(basisA, basisB, t);
    const point = read(mesh.positions, vertex);
    const delta = sub(point, sourceAxis);
    const along = dot(delta, source.direction);
    const sectionU = dot(delta, source.tangent);
    const sectionV = dot(delta, source.bitangent);
    write(positions, vertex, add(targetAxis, add(scale(targetDirection, along), add(scale(basis.u, sectionU), scale(basis.v, sectionV)))));
    const normal = read(mesh.normals, vertex);
    const turned = add(
      scale(targetDirection, dot(normal, source.direction)),
      add(scale(basis.u, dot(normal, source.tangent)), scale(basis.v, dot(normal, source.bitangent))),
    );
    const turnedLength = length(turned);
    write(normals, vertex, turnedLength > 1e-8 ? scale(turned, 1 / turnedLength) : { x: 0, y: 1, z: 0 });
  }
  return {
    positions,
    normals,
    indices: Uint32Array.from(mesh.indices),
    triangles: mesh.triangles,
  };
}

export function resolveAssemblyHybrid(
  connection: Pick<TileConnection, "id" | "tileAId" | "tileBId" | "faceA" | "faceB" | "signature" | "selectedMockId" | "generatedHybridField">,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): AssemblyHybrid {
  const field = currentGeneratedField(connection);
  if (field) {
    const candidate = field.candidates.find((item) => item.candidateId === connection.selectedMockId) ?? null;
    if (!candidate || candidate.status !== "ready" || !candidate.geometry) {
      return blank("none", candidate?.candidateId ?? connection.selectedMockId, candidate?.status ?? "invalid");
    }
    const placed = placeConnection(connection, tiles, loaded, candidate.geometry);
    if (!placed) return blank("none", candidate.candidateId, "unresolved");
    return {
      source: "real",
      candidateId: candidate.candidateId,
      geometry: placed,
      status: "ready",
      placement: "placed-faces",
      translate: ORIGIN,
      spin: 0,
    };
  }

  const detected = detectAdjacencies(tiles).find((item) => item.id === connection.id);
  if (!detected || !mockPlacementSupported(connection, tiles)) {
    return blank("none", connection.selectedMockId, "not-generated");
  }
  const mock = mockHybridField(connection.signature);
  const chosen = mock.candidates.find((item) => item.id === connection.selectedMockId) ?? mock.candidates[12];
  return {
    source: "mock",
    candidateId: chosen.id,
    geometry: chosen.mesh,
    status: "mock",
    placement: "contact-marker",
    translate: detected.marker,
    spin: detected.faceA === "N" || detected.faceA === "S" ? Math.PI / 2 : 0,
  };
}

function placeConnection(
  connection: Pick<TileConnection, "tileAId" | "tileBId" | "faceA" | "faceB">,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  mesh: IsoMesh,
): IsoMesh | null {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) return null;
  const moduleA = readyModule(tileA, loaded);
  const moduleB = readyModule(tileB, loaded);
  if (!moduleA || !moduleB) return null;
  const sourceA = moduleA.faces[connection.faceA];
  const sourceB = moduleB.faces[connection.faceB];
  if (!sourceA || !sourceB) return null;
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount % steps !== 0) return null;
  const sampleCount = vertexCount / steps;
  return placeGeneratedHybrid(
    mesh,
    sourceA,
    sourceB,
    placedFaceFrame(sourceA, tileA),
    placedFaceFrame(sourceB, tileB),
    sampleCount,
    steps,
  );
}

function readyModule(tile: TileInstance, loaded: ReadonlyMap<string, ModuleHandoff>): ReadyModule | null {
  const handoff = loaded.get(tile.archetypeId);
  return handoff?.status === "ready" ? handoff : null;
}

function transportBasis(sourceFace: FaceFrame, targetFace: FaceFrame, tangent: Vec3, bitangent: Vec3): { u: Vec3; v: Vec3 } | null {
  const u = carry(sourceFace, targetFace, tangent);
  const v = carry(sourceFace, targetFace, bitangent);
  if (length(u) < 1e-6 || length(v) < 1e-6) return null;
  return { u, v };
}

function carry(sourceFace: FaceFrame, targetFace: FaceFrame, vector: Vec3): Vec3 {
  return add(
    scale(targetFace.u, dot(vector, sourceFace.u)),
    add(scale(targetFace.v, dot(vector, sourceFace.v)), scale(targetFace.normal, dot(vector, sourceFace.normal))),
  );
}

function sectionBasis(start: { u: Vec3; v: Vec3 }, end: { u: Vec3; v: Vec3 }, t: number) {
  if (t <= 0) return start;
  if (t >= 1) return end;
  return rigidize(slerp(start.u, end.u, t), slerp(start.v, end.v, t));
}

function rigidize(u: Vec3, v: Vec3) {
  const tangent = normalize(u);
  const projected = sub(v, scale(tangent, dot(v, tangent)));
  const bitangent = length(projected) > 1e-6 ? normalize(projected) : unitPerp(tangent);
  return { u: tangent, v: bitangent };
}

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const aligned = Math.min(1, Math.max(-1, dot(a, b)));
  if (aligned > 0.999999) return normalize(lerp(a, b, t));
  if (aligned < -0.999999) return rodrigues(a, unitPerp(a), Math.PI * t);
  const angle = Math.acos(aligned);
  const sine = Math.sin(angle);
  return add(scale(a, Math.sin((1 - t) * angle) / sine), scale(b, Math.sin(t * angle) / sine));
}

function rodrigues(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(add(scale(vector, cosine), scale(cross(axis, vector), sine)), scale(axis, dot(axis, vector) * (1 - cosine)));
}

function yaw(vector: Vec3, quarter: 0 | 1 | 2 | 3): Vec3 {
  const angle = quarter * Math.PI / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine + vector.z * sine, y: vector.y, z: -vector.x * sine + vector.z * cosine };
}

function mirrorVec(vector: Vec3, axis: TileInstance["mirror"]): Vec3 {
  if (axis === "x") return { x: -vector.x, y: vector.y, z: vector.z };
  if (axis === "y") return { x: vector.x, y: -vector.y, z: vector.z };
  if (axis === "z") return { x: vector.x, y: vector.y, z: -vector.z };
  return vector;
}

function blank(source: "none", candidateId: string | null, status: AssemblyHybridStatus): AssemblyHybrid {
  return {
    source,
    candidateId,
    geometry: null,
    status,
    placement: "none",
    translate: ORIGIN,
    spin: 0,
  };
}

function ringCentroid(mesh: IsoMesh, ring: number, sampleCount: number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const offset = (ring * sampleCount + sample) * 3;
    x += mesh.positions[offset];
    y += mesh.positions[offset + 1];
    z += mesh.positions[offset + 2];
  }
  return { x: x / sampleCount, y: y / sampleCount, z: z / sampleCount };
}

function read(buffer: Float32Array, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: buffer[offset], y: buffer[offset + 1], z: buffer[offset + 2] };
}

function write(buffer: Float32Array, vertex: number, value: Vec3) {
  const offset = vertex * 3;
  buffer[offset] = value.x;
  buffer[offset + 1] = value.y;
  buffer[offset + 2] = value.z;
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

function normalize(value: Vec3): Vec3 {
  return scale(value, 1 / length(value));
}

function unitPerp(value: Vec3): Vec3 {
  const helper = Math.abs(value.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(value, helper));
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}
