import type { IsoMesh } from "../scan/isomesh";
import { placeGeneratedHybrid, resolveAssemblyHybrid, sectionCenter } from "./assembly-hybrid";
import { layoutTiles } from "./assembly-layout";
import type { HybridCandidate } from "./candidate-field";
import { reconcileConnections, type TileConnection } from "./connections";
import type { FaceFrame, Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridCandidate, type GeneratedHybridField } from "./generated-hybrid-field";
import { connectorFrame } from "./hybrid-deformation";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const SAMPLES = 4;
const STEPS = HYBRID_GENERATOR_SETTINGS.loftSteps;
const DEPTH = HYBRID_GENERATOR_SETTINGS.sectionDepth;
const TOLERANCE = 1e-4;

function loftMesh(centerA: Vec3, centerB: Vec3, bulge: number): IsoMesh {
  const frame = connectorFrame(centerA, centerB);
  if (!frame) throw new Error("test centers are separated");
  const positions: number[] = [];
  const normals: number[] = [];
  for (let ring = 0; ring < STEPS; ring += 1) {
    const t = ring / (STEPS - 1);
    const axis = {
      x: centerA.x + (centerB.x - centerA.x) * t,
      y: centerA.y + (centerB.y - centerA.y) * t,
      z: centerA.z + (centerB.z - centerA.z) * t,
    };
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const angle = (sample / SAMPLES) * Math.PI * 2;
      const radius = 0.08;
      const extra = ring === Math.floor(STEPS / 2) && sample === 0 ? bulge : 0;
      positions.push(
        axis.x + frame.tangent.x * Math.cos(angle) * radius + frame.bitangent.x * (Math.sin(angle) * radius + extra),
        axis.y + frame.tangent.y * Math.cos(angle) * radius + frame.bitangent.y * (Math.sin(angle) * radius + extra),
        axis.z + frame.tangent.z * Math.cos(angle) * radius + frame.bitangent.z * (Math.sin(angle) * radius + extra),
      );
      normals.push(frame.bitangent.x, frame.bitangent.y, frame.bitangent.z);
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from({ length: SAMPLES * (STEPS - 1) * 6 }, (_, index) => index % (SAMPLES * STEPS)),
    triangles: SAMPLES * (STEPS - 1) * 2,
  };
}

function ringCenter(mesh: IsoMesh, ring: number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const offset = (ring * SAMPLES + sample) * 3;
    x += mesh.positions[offset];
    y += mesh.positions[offset + 1];
    z += mesh.positions[offset + 2];
  }
  return { x: x / SAMPLES, y: y / SAMPLES, z: z / SAMPLES };
}

function near(a: Vec3, b: Vec3, label: string) {
  assert(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < TOLERANCE, label);
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function field(signature: string, meshes: Map<string, { status: GeneratedHybridCandidate["status"]; geometry: IsoMesh | null }>): GeneratedHybridField {
  const candidates = Array.from({ length: 25 }, (_, index) => {
    const candidateId = `H${String(index + 1).padStart(2, "0")}`;
    const chosen = meshes.get(candidateId) ?? { status: "empty" as const, geometry: null };
    return {
      candidateId,
      candidate: { id: candidateId } as HybridCandidate,
      status: chosen.status,
      geometry: chosen.geometry,
      vertexCount: chosen.geometry ? chosen.geometry.positions.length / 3 : 0,
      triangleCount: chosen.geometry?.triangles ?? 0,
      reason: "",
    };
  });
  return {
    version: GENERATED_HYBRID_FIELD_SETTINGS.version,
    status: "partial",
    connectionSignature: signature,
    candidates,
    readyCount: candidates.filter((item) => item.status === "ready").length,
    blockedCount: candidates.filter((item) => item.status === "blocked").length,
    emptyCount: candidates.filter((item) => item.status === "empty").length,
    invalidCount: candidates.filter((item) => item.status === "invalid").length,
  };
}

function withField(connection: TileConnection, generated: GeneratedHybridField | null, selectedMockId: string): TileConnection {
  return { ...connection, generatedHybridField: generated, selectedMockId };
}

function shift(frame: FaceFrame, extra: Vec3): FaceFrame {
  return { ...frame, origin: { x: frame.origin.x + extra.x, y: frame.origin.y + extra.y, z: frame.origin.z + extra.z } };
}

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const moduleA = resolveTileModule("topographic-ground-field", loaded);
const moduleB = resolveTileModule("linear-gallery", loaded);
assert(moduleA.status === "ready" && moduleB.status === "ready", "source modules are ready");
if (moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("unreachable");
const sourceA = Float32Array.from(moduleA.geometry.positions);
const sourceB = Float32Array.from(moduleB.geometry.positions);

const tiles = layoutTiles(4, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
const links = reconcileConnections([], tiles, loaded);
const east = links.find((item) => item.tileAId === "A" && item.tileBId === "B");
const north = links.find((item) => item.tileAId === "A" && item.tileBId === "C");
if (!east || !north) throw new Error("the 2x2 board is missing A-B or A-C");
const tileA = tiles.find((tile) => tile.instanceId === "A");
const tileB = tiles.find((tile) => tile.instanceId === "B");
const tileC = tiles.find((tile) => tile.instanceId === "C");
if (!tileA || !tileB || !tileC) throw new Error("tiles are missing");

const placeholder = resolveAssemblyHybrid(east, tiles, loaded);
assert(placeholder.source === "mock" && placeholder.geometry !== null && placeholder.placement === "contact-marker", "a connection without a field keeps the mock placeholder");
const northPlaceholder = resolveAssemblyHybrid(north, tiles, loaded);
assert(northPlaceholder.spin === Math.PI / 2, "the north-south placeholder still turns its local tube");

const eastSourceA = sectionCenter(moduleA.faces.E, DEPTH);
const eastSourceB = sectionCenter(moduleB.faces.W, DEPTH);
const eastTargetA = sectionCenter(moduleA.faces.E, DEPTH, tileA.transform);
const eastTargetB = sectionCenter(moduleB.faces.W, DEPTH, tileB.transform);
const eastMesh = loftMesh(eastSourceA, eastSourceB, 0.06);
const northMesh = loftMesh(sectionCenter(moduleA.faces.N, DEPTH), sectionCenter(moduleA.faces.S, DEPTH), 0.04);
const otherMesh = loftMesh(eastSourceA, eastSourceB, 0.02);
const eastField = field(east.signature, new Map([
  ["H05", { status: "ready", geometry: eastMesh }],
  ["H17", { status: "ready", geometry: otherMesh }],
]));
const northField = field(north.signature, new Map([
  ["H17", { status: "ready", geometry: northMesh }],
]));
const before = JSON.stringify(eastField.candidates.map((item) => [item.candidateId, item.status]));
const beforePositions = Float32Array.from(eastMesh.positions);

const placedEast = resolveAssemblyHybrid(withField(east, eastField, "H05"), tiles, loaded);
const placedNorth = resolveAssemblyHybrid(withField(north, northField, "H17"), tiles, loaded);
assert(placedEast.source === "real" && placedEast.geometry !== null && placedEast.candidateId === "H05" && placedEast.placement === "placed-faces", "A-B resolves a mapped real mesh");
assert(placedNorth.source === "real" && placedNorth.geometry !== null && placedNorth.candidateId === "H17", "A-C resolves its own real mesh");
assert(placedEast.translate.x === 0 && placedEast.translate.y === 0 && placedEast.translate.z === 0 && placedEast.spin === 0, "the mapped mesh is already in assembly coordinates");
if (!placedEast.geometry || !placedNorth.geometry) throw new Error("unreachable");
near(ringCenter(placedEast.geometry, 0), eastTargetA, "ring 0 lands on placed face A");
near(ringCenter(placedEast.geometry, STEPS - 1), eastTargetB, "the final ring lands on placed face B");
const placedSpan = distance(ringCenter(placedEast.geometry, 0), ringCenter(placedEast.geometry, STEPS - 1));
const faceSpan = distance(eastTargetA, eastTargetB);
assert(Math.abs(placedSpan - faceSpan) < TOLERANCE, "the connector span is the distance between the placed sections");
near(ringCenter(placedNorth.geometry, 0), sectionCenter(moduleA.faces.N, DEPTH, tileA.transform), "the north ring lands on placed face A");
near(ringCenter(placedNorth.geometry, STEPS - 1), sectionCenter(moduleA.faces.S, DEPTH, tileC.transform), "the south ring lands on placed face B");

const fartherTarget = shift(moduleB.faces.W, { x: tileB.transform.x + 1, y: tileB.transform.y, z: tileB.transform.z });
const farther = placeGeneratedHybrid(eastMesh, moduleA.faces.E, moduleB.faces.W, shift(moduleA.faces.E, tileA.transform), fartherTarget, SAMPLES, STEPS);
if (!farther) throw new Error("a wider placement is defined");
const fartherSpan = distance(ringCenter(farther, 0), ringCenter(farther, STEPS - 1));
assert(fartherSpan > placedSpan + 0.9, "moving the tiles apart lengthens the connector");

const middle = Math.floor(STEPS / 2);
const sourceMiddle = ringCenter(eastMesh, middle);
const placedMiddle = ringCenter(placedEast.geometry, middle);
const sourceBulge = distance(read(eastMesh, middle * SAMPLES), sourceMiddle);
const placedBulge = distance(read(placedEast.geometry, middle * SAMPLES), placedMiddle);
assert(Math.abs(sourceBulge - placedBulge) < TOLERANCE, "the middle-ring deformation keeps its section offset");

assert(placedEast.geometry.positions !== eastMesh.positions && placedEast.geometry.normals !== eastMesh.normals && placedEast.geometry.indices !== eastMesh.indices, "display geometry uses its own buffers");
for (let index = 0; index < beforePositions.length; index += 1) {
  assert(eastMesh.positions[index] === beforePositions[index], "the stored connector is not rewritten");
}
const switched = resolveAssemblyHybrid(withField(east, eastField, "H17"), tiles, loaded);
assert(switched.geometry !== placedNorth.geometry && placedNorth.candidateId === "H17", "changing A-B does not change A-C");

for (const status of ["empty", "blocked", "invalid"] as const) {
  const failed = field(east.signature, new Map([["H05", { status, geometry: null }]]));
  const resolved = resolveAssemblyHybrid(withField(east, failed, "H05"), tiles, loaded);
  assert(resolved.source === "none" && resolved.geometry === null && resolved.status === status, `${status} draws no connector`);
}

const turnedTiles = tiles.map((tile) => tile.instanceId === "A" ? { ...tile, rotationQuarter: 1 as const } : tile);
const mirroredTiles = tiles.map((tile) => tile.instanceId === "A" ? { ...tile, mirror: "x" as const } : tile);
const turned = resolveAssemblyHybrid(withField(east, eastField, "H05"), turnedTiles, loaded);
const mirrored = resolveAssemblyHybrid(withField(east, eastField, "H05"), mirroredTiles, loaded);
const vertical = resolveAssemblyHybrid(withField({ ...east, faceA: "T", faceB: "B" }, eastField, "H05"), tiles, loaded);
assert(turned.status === "unresolved" && mirrored.status === "unresolved" && vertical.status === "unresolved", "rotation, mirror, and vertical faces stay unresolved");
assert(turned.geometry === null && mirrored.geometry === null && vertical.geometry === null, "unsupported placements draw no connector");

assert(JSON.stringify(eastField.candidates.map((item) => [item.candidateId, item.status])) === before, "the generated field is not rewritten");
for (let index = 0; index < sourceA.length; index += 1) assert(moduleA.geometry.positions[index] === sourceA[index], "source module A is unchanged");
for (let index = 0; index < sourceB.length; index += 1) assert(moduleB.geometry.positions[index] === sourceB[index], "source module B is unchanged");

function read(mesh: IsoMesh, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] };
}

console.log(`skill4 assembly hybrid ok · span ${placedSpan.toFixed(3)} · wider ${fartherSpan.toFixed(3)} · ${placedEast.candidateId}/${placedNorth.candidateId}`);
