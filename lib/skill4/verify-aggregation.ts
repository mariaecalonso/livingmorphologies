import type { IsoMesh } from "../scan/isomesh";
import { AGGREGATION_SETTINGS, evaluateAggregation } from "./aggregation";
import { placedFaceFrame, sectionCenter } from "./assembly-hybrid";
import { layoutTiles } from "./assembly-layout";
import type { HybridCandidate } from "./candidate-field";
import { reconcileConnections, type TileConnection } from "./connections";
import type { FaceId, Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridCandidate, type GeneratedHybridField } from "./generated-hybrid-field";
import { connectorFrame } from "./hybrid-deformation";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";
import type { ReadyModule } from "./adapt";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const SAMPLES = 4;
const STEPS = HYBRID_GENERATOR_SETTINGS.loftSteps;
const DEPTH = HYBRID_GENERATOR_SETTINGS.sectionDepth;

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

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const tiles = layoutTiles(4, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
const links = reconcileConnections([], tiles, loaded);
assert(links.length === 4, "a 2x2 has four connections");
const pair = (a: string, b: string) => {
  const found = links.find((item) => item.tileAId === a && item.tileBId === b);
  if (!found) throw new Error(`missing ${a}-${b}`);
  return found;
};
const east = pair("A", "B");
const north = pair("A", "C");
const eastSouth = pair("B", "D");
const northSouth = pair("C", "D");

function moduleFor(tile: TileInstance): ReadyModule {
  const handoff = resolveTileModule(tile.archetypeId, loaded);
  if (handoff.status !== "ready") throw new Error(`${tile.instanceId} is not ready`);
  return handoff;
}

function connectorMesh(connection: TileConnection, bulge: number) {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) throw new Error("tiles are missing");
  const moduleA = moduleFor(tileA);
  const moduleB = moduleFor(tileB);
  return loftMesh(
    sectionCenter(moduleA.faces[connection.faceA], DEPTH),
    sectionCenter(moduleB.faces[connection.faceB], DEPTH),
    bulge,
  );
}

function withCandidate(connection: TileConnection, status: GeneratedHybridCandidate["status"], geometry: IsoMesh | null, selected = "H05"): TileConnection {
  return {
    ...connection,
    selectedMockId: selected,
    generatedHybridField: field(connection.signature, new Map([[selected, { status, geometry }]])),
  };
}

const stored = new Map<string, IsoMesh>();
const readyLinks = [east, north, eastSouth, northSouth].map((connection) => {
  const mesh = connectorMesh(connection, 0.04);
  stored.set(connection.id, mesh);
  return withCandidate(connection, "ready", mesh);
});
const beforeFields = readyLinks.map((connection) => Float32Array.from(connection.generatedHybridField?.candidates.find((item) => item.candidateId === "H05")?.geometry?.positions ?? []));
const beforeModules = tiles.map((tile) => Float32Array.from(moduleFor(tile).geometry.positions));

const ready = evaluateAggregation(readyLinks, tiles, loaded);
assert(ready.status === "ready" && ready.readyCount === 4 && ready.failedCount === 0 && ready.unresolvedCount === 0, "four attached connections make the assembly ready");
const eastResult = ready.connections.find((item) => item.connectionId === east.id);
if (!eastResult?.geometry || !eastResult.contactA || !eastResult.contactB) throw new Error("A-B did not aggregate");
assert(eastResult.status === "ready" && eastResult.candidateId === "H05", "a placed real hybrid is a ready aggregation connection");
assert(eastResult.attachmentErrorA !== null && eastResult.attachmentErrorA <= AGGREGATION_SETTINGS.attachmentTolerance, "attachment error A is within tolerance");
assert(eastResult.attachmentErrorB !== null && eastResult.attachmentErrorB <= AGGREGATION_SETTINGS.attachmentTolerance, "attachment error B is within tolerance");
const tileA = tiles.find((tile) => tile.instanceId === "A");
const tileB = tiles.find((tile) => tile.instanceId === "B");
if (!tileA || !tileB) throw new Error("tiles are missing");
const expectedSpan = distance(
  sectionCenter(placedFaceFrame(moduleFor(tileA).faces[east.faceA as FaceId], tileA), DEPTH),
  sectionCenter(placedFaceFrame(moduleFor(tileB).faces[east.faceB as FaceId], tileB), DEPTH),
);
assert(eastResult.span !== null && Math.abs(eastResult.span - expectedSpan) < 1e-9, "span is the distance between the placed section centers");
assert(eastResult.contactA.tileId === "A" && eastResult.contactA.face === east.faceA, "contact A names the selected tile face");
assert(eastResult.contactB.tileId === "B" && eastResult.contactB.face === east.faceB, "contact B names the selected tile face");
assert(eastResult.geometry.positions !== stored.get(east.id)?.positions, "the aggregation mesh is a display copy");
assert(ready.connections.map((item) => item.connectionId).join() === readyLinks.map((item) => item.id).join(), "each adjacency is evaluated on its own");

const empty = evaluateAggregation([withCandidate(east, "empty", null)], tiles, loaded);
assert(empty.connections[0].status === "empty" && empty.connections[0].geometry === null, "an empty candidate stays empty");
const invalid = evaluateAggregation([withCandidate(east, "invalid", null)], tiles, loaded);
assert(invalid.connections[0].status === "invalid" && invalid.connections[0].geometry === null, "an invalid candidate stays invalid");
const missing = evaluateAggregation([east], tiles, loaded);
assert(missing.connections[0].status === "not-generated" && missing.status === "not-ready", "a missing field stays not-generated");

const mixedLinks = [
  readyLinks[0],
  readyLinks[1],
  eastSouth,
  withCandidate(northSouth, "empty", null),
];
const mixed = evaluateAggregation(mixedLinks, tiles, loaded);
assert(mixed.status === "partial" && mixed.readyCount === 2 && mixed.failedCount === 2 && mixed.unresolvedCount === 0, "a mixed assembly is partial");
assert(mixed.connections.map((item) => item.status).join() === "ready,ready,not-generated,empty", "each mixed connection keeps its own status");

const none = evaluateAggregation(links, tiles, loaded);
assert(none.status === "not-ready" && none.readyCount === 0 && none.connections.every((item) => item.status === "not-generated"), "an ungenerated assembly is not ready");

const alternate = connectorMesh(east, 0.09);
const switchedLinks = readyLinks.map((connection) => connection.id === east.id ? withCandidate(connection, "ready", alternate, "H17") : connection);
const switched = evaluateAggregation(switchedLinks, tiles, loaded);
const switchedEast = switched.connections.find((item) => item.connectionId === east.id);
assert(switchedEast?.candidateId === "H17" && switchedEast.geometry !== eastResult.geometry, "A-B follows its own selected hybrid");
for (const other of [north.id, eastSouth.id, northSouth.id]) {
  const before = ready.connections.find((item) => item.connectionId === other);
  const after = switched.connections.find((item) => item.connectionId === other);
  assert(before?.candidateId === after?.candidateId && before?.status === after?.status, `${other} keeps its candidate`);
  assert(before?.geometry?.positions !== after?.geometry?.positions, `${other} is evaluated on its own buffers`);
  const left = before?.geometry?.positions;
  const right = after?.geometry?.positions;
  assert(left !== undefined && right !== undefined && left.length === right.length, `${other} still has a connector`);
  if (!left || !right) throw new Error("unreachable");
  for (let index = 0; index < left.length; index += 1) assert(left[index] === right[index], `${other} geometry is unchanged`);
}

readyLinks.forEach((connection, index) => {
  const positions = connection.generatedHybridField?.candidates.find((item) => item.candidateId === "H05")?.geometry?.positions;
  assert(positions !== undefined, "stored geometry remains");
  if (!positions) throw new Error("unreachable");
  for (let offset = 0; offset < positions.length; offset += 1) assert(positions[offset] === beforeFields[index][offset], "the stored hybrid field is not rewritten");
});
tiles.forEach((tile, index) => {
  const positions = moduleFor(tile).geometry.positions;
  for (let offset = 0; offset < positions.length; offset += 1) assert(positions[offset] === beforeModules[index][offset], `${tile.instanceId} mesh is unchanged`);
});

console.log(`skill4 aggregation ok · ready ${ready.readyCount}/4 · span ${eastResult.span?.toFixed(3)} · partial ${mixed.readyCount}/4`);
