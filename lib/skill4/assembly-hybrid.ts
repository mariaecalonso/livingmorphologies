import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff, ReadyModule } from "./adapt";
import { mockPlacementSupported } from "./assembly-layout";
import { detectAdjacencies, type TileConnection } from "./connections";
import type { FaceFrame, FaceId, Vec3 } from "./contract";
import { connectorFrame } from "./hybrid-deformation";
import { currentGeneratedField } from "./hybrid-display";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { mockHybridField } from "./mock-hybrids";
import type { TileInstance } from "./tiles";

/**
 * A stored connector is lofted between unplaced registration frames.
 * Display placement rebuilds a mesh so ring 0 sits on tile A's placed
 * section and the last ring sits on tile B's placed section.
 * Rotation, mirror, and vertical faces stay unresolved.
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
const SIDE_FACES = new Set<FaceId>(["E", "W", "N", "S"]);

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
  const targetDirection = scale(targetSpan, 1 / targetLength);
  if (Math.abs(dot(source.direction, face.direction)) < 0.999) return null;
  if (Math.abs(dot(face.direction, targetDirection)) < 0.999) return null;

  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const ring = Math.floor(vertex / sampleCount);
    const t = ring / (steps - 1);
    const sourceAxis = lerp(sourceStart, sourceEnd, t);
    const targetAxis = lerp(targetStart, targetEnd, t);
    const point = read(mesh.positions, vertex);
    const delta = sub(point, sourceAxis);
    const placed = add(
      targetAxis,
      add(
        scale(targetDirection, dot(delta, source.direction)),
        add(scale(source.tangent, dot(delta, source.tangent)), scale(source.bitangent, dot(delta, source.bitangent))),
      ),
    );
    write(positions, vertex, placed);
    const normal = read(mesh.normals, vertex);
    const turned = add(
      scale(targetDirection, dot(normal, source.direction)),
      add(scale(source.tangent, dot(normal, source.tangent)), scale(source.bitangent, dot(normal, source.bitangent))),
    );
    const turnedLength = length(turned);
    write(normals, vertex, turnedLength > 1e-8 ? scale(turned, 1 / turnedLength) : turned);
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
  if (!SIDE_FACES.has(connection.faceA) || !SIDE_FACES.has(connection.faceB)) return null;
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) return null;
  if (tileA.rotationQuarter !== 0 || tileB.rotationQuarter !== 0 || tileA.mirror || tileB.mirror) return null;
  if (!mockPlacementSupported(connection, tiles)) return null;
  const moduleA = readyModule(tileA, loaded);
  const moduleB = readyModule(tileB, loaded);
  if (!moduleA || !moduleB) return null;
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount % steps !== 0) return null;
  const sampleCount = vertexCount / steps;
  return placeGeneratedHybrid(
    mesh,
    moduleA.faces[connection.faceA],
    moduleB.faces[connection.faceB],
    shiftFrame(moduleA.faces[connection.faceA], tileA.transform),
    shiftFrame(moduleB.faces[connection.faceB], tileB.transform),
    sampleCount,
    steps,
  );
}

function readyModule(tile: TileInstance, loaded: ReadonlyMap<string, ModuleHandoff>): ReadyModule | null {
  const handoff = loaded.get(tile.archetypeId);
  return handoff?.status === "ready" ? handoff : null;
}

function shiftFrame(frame: FaceFrame, translate: Vec3): FaceFrame {
  return { ...frame, origin: add(frame.origin, translate) };
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

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}
