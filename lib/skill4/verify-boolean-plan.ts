import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { evaluateAggregation } from "./aggregation";
import { sectionCenter } from "./assembly-hybrid";
import { layoutTiles } from "./assembly-layout";
import { BOOLEAN_PLAN_SETTINGS, buildBooleanPlan } from "./boolean-plan";
import type { HybridCandidate } from "./candidate-field";
import { reconcileConnections, type TileConnection } from "./connections";
import type { Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridCandidate, type GeneratedHybridField } from "./generated-hybrid-field";
import { connectorFrame } from "./hybrid-deformation";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { buildInterlocks, type InterlockConnection, type InterlockResult } from "./interlock";
import { loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const SAMPLES = 4;
const STEPS = HYBRID_GENERATOR_SETTINGS.loftSteps;
const DEPTH = HYBRID_GENERATOR_SETTINGS.sectionDepth;

function loftMesh(centerA: Vec3, centerB: Vec3): IsoMesh {
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
      positions.push(
        axis.x + frame.tangent.x * Math.cos(angle) * 0.08 + frame.bitangent.x * Math.sin(angle) * 0.08,
        axis.y + frame.tangent.y * Math.cos(angle) * 0.08 + frame.bitangent.y * Math.sin(angle) * 0.08,
        axis.z + frame.tangent.z * Math.cos(angle) * 0.08 + frame.bitangent.z * Math.sin(angle) * 0.08,
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

function field(signature: string, geometry: IsoMesh | null, status: GeneratedHybridCandidate["status"]): GeneratedHybridField {
  const candidates = Array.from({ length: 25 }, (_, index) => {
    const candidateId = `H${String(index + 1).padStart(2, "0")}`;
    const chosen = candidateId === "H05";
    const mesh = chosen ? geometry : null;
    return {
      candidateId,
      candidate: { id: candidateId } as HybridCandidate,
      status: chosen ? status : "empty" as const,
      geometry: mesh,
      vertexCount: mesh ? mesh.positions.length / 3 : 0,
      triangleCount: mesh?.triangles ?? 0,
      reason: "",
      branches: 0,
      openings: 0,
    };
  });
  return {
    version: GENERATED_HYBRID_FIELD_SETTINGS.version,
    status: "partial",
    connectionSignature: signature,
    candidates,
    readyCount: candidates.filter((item) => item.status === "ready").length,
    blockedCount: 0,
    emptyCount: candidates.filter((item) => item.status === "empty").length,
    invalidCount: candidates.filter((item) => item.status === "invalid").length,
  };
}

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const tiles = layoutTiles(4, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
const links = reconcileConnections([], tiles, loaded);

function moduleFor(tile: TileInstance): ReadyModule {
  const handoff = resolveTileModule(tile.archetypeId, loaded);
  if (handoff.status !== "ready") throw new Error(`${tile.instanceId} is not ready`);
  return handoff;
}

function readyLink(connection: TileConnection) {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) throw new Error("tiles are missing");
  const mesh = loftMesh(sectionCenter(moduleFor(tileA).faces[connection.faceA], DEPTH), sectionCenter(moduleFor(tileB).faces[connection.faceB], DEPTH));
  return { ...connection, selectedMockId: "H05", generatedHybridField: field(connection.signature, mesh, "ready") };
}

const readyLinks = links.map(readyLink);
const storedFields = readyLinks.map((connection) => Float32Array.from(connection.generatedHybridField?.candidates.find((item) => item.candidateId === "H05")?.geometry?.positions ?? []));
const storedTiles = tiles.map((tile) => Float32Array.from(moduleFor(tile).geometry.positions));
const interlocks = buildInterlocks(evaluateAggregation(readyLinks, tiles, loaded), tiles);
const beforeInsertions = interlocks.connections.map((connection) => ({
  a: Float32Array.from(connection.insertionA?.positions ?? []),
  b: Float32Array.from(connection.insertionB?.positions ?? []),
  connector: Float32Array.from(connection.connectorGeometry?.positions ?? []),
}));
const plan = buildBooleanPlan(interlocks);
assert(plan.status === "ready" && plan.readyConnectionCount === 4 && plan.failedConnectionCount === 0, "four ready interlocks make a ready boolean plan");
assert(plan.connections.every((item) => item.participants.map((participant) => participant.role).join() === BOOLEAN_PLAN_SETTINGS.connectionOrder.join()), "each ready connection records parent A, the closed hybrid, and parent B");
assert(plan.requiredParticipantCount === 12, "four connections require twelve participants");

const east = plan.connections.find((item) => item.connectionId.endsWith(":A:B"));
const eastInterlock = interlocks.connections.find((item) => item.connectionId.endsWith(":A:B"));
if (!east || !eastInterlock?.connectorGeometry) throw new Error("A-B plan is missing");
assert(east.tileAId === "A" && east.tileBId === "B", "the plan names both parents");
assert(east.candidateId === "H05" && east.participants[1]?.id === "H05", "the plan names the selected hybrid");
assert(east.faceA === eastInterlock.interfaceA?.face && east.faceB === eastInterlock.interfaceB?.face, "the plan keeps the transformed faces");
assert(east.inwardA !== null && east.inwardB !== null, "the plan keeps both inward directions");
assert(east.connectorGeometry === eastInterlock.connectorGeometry, "the plan keeps the placed connector");
assert(east.validation.accepted && east.validation.failures.length === 0, "a valid interlock passes the boolean checks");
assert(!("tileAOperation" in east) && !("cutVolumeA" in east), "the plan does not record a subtraction");

const tileA = plan.tiles.find((tile) => tile.tileId === "A");
if (!tileA) throw new Error("tile A is missing");
assert(tileA.connectionIds.length === 2, "tile A is required by two connections");
assert(tileA.connectionIds.join() === [...tileA.connectionIds].sort().join(), "tile A connections are sorted");
for (const tileId of ["A", "B", "C", "D"]) {
  const tile = plan.tiles.find((item) => item.tileId === tileId);
  if (!tile) throw new Error(`${tileId} is missing`);
  assert(tile.connectionIds.length === 2, `${tileId} is required twice`);
}

const invalid = blankResult(interlocks.connections[0], "invalid");
const invalidPlan = buildBooleanPlan(invalid);
assert(invalidPlan.status === "not-ready" && invalidPlan.readyConnectionCount === 0 && invalidPlan.tiles.length === 0, "an invalid interlock creates no ready boolean plan");
assert(invalidPlan.connections[0].status === "invalid" && invalidPlan.connections[0].participants.length === 0, "an invalid interlock records no participants");

const mixed = {
  ...interlocks,
  connections: [interlocks.connections[0], { ...interlocks.connections[1], status: "not-ready" as const, insertionA: null, insertionB: null, connectorGeometry: null }],
  readyCount: 1,
  failedCount: 1,
  status: "partial" as const,
};
const mixedPlan = buildBooleanPlan(mixed);
assert(mixedPlan.status === "partial" && mixedPlan.readyConnectionCount === 1 && mixedPlan.failedConnectionCount === 1, "a mixed interlock set is a partial boolean plan");

const none = buildBooleanPlan({ connections: links.map((connection) => ({
  connectionId: connection.id,
  candidateId: connection.selectedMockId,
  status: "not-ready" as const,
  connectorGeometry: null,
  interfaceA: null,
  interfaceB: null,
  insertionA: null,
  insertionB: null,
  attachmentDepthA: null,
  attachmentDepthB: null,
  overlapA: null,
  overlapB: null,
})), readyCount: 0, failedCount: links.length, status: "not-ready" });
assert(none.status === "not-ready" && none.readyConnectionCount === 0 && none.connections.every((item) => item.participants.length === 0), "an unready interlock set has no boolean participants");

const shared = buildBooleanPlan({
  connections: [interlocks.connections[0], { ...interlocks.connections[0], connectionId: `${interlocks.connections[0].connectionId}:shared` }],
  readyCount: 2,
  failedCount: 0,
  status: "ready",
});
const sharedTile = shared.tiles.find((tile) => tile.tileId === "A");
assert(sharedTile !== undefined && sharedTile.connectionIds.length === 2, "a parent required twice keeps both connection ids");

readyLinks.forEach((connection, index) => {
  const positions = connection.generatedHybridField?.candidates.find((item) => item.candidateId === "H05")?.geometry?.positions;
  if (!positions) throw new Error("stored field is missing");
  for (let offset = 0; offset < positions.length; offset += 1) assert(positions[offset] === storedFields[index][offset], "stored hybrid fields stay unchanged");
});
tiles.forEach((tile, index) => {
  const positions = moduleFor(tile).geometry.positions;
  for (let offset = 0; offset < positions.length; offset += 1) assert(positions[offset] === storedTiles[index][offset], `${tile.instanceId} mesh stays unchanged`);
});
interlocks.connections.forEach((connection, index) => {
  const before = beforeInsertions[index];
  assert(same(connection.insertionA?.positions, before.a) && same(connection.insertionB?.positions, before.b) && same(connection.connectorGeometry?.positions, before.connector), "interlock meshes stay unchanged");
});

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "boolean-plan.ts"), "utf8");
assert(!/manifold|three-bvh-csg|unionMesh|differenceMesh|performBoolean/.test(source), "the plan does not call a boolean engine");

function same(mesh: Float32Array | undefined, before: Float32Array) {
  if (!mesh || mesh.length !== before.length) return false;
  for (let index = 0; index < mesh.length; index += 1) if (mesh[index] !== before[index]) return false;
  return true;
}

function blankResult(connection: InterlockConnection, status: InterlockConnection["status"]): InterlockResult {
  return {
    connections: [{ ...connection, status, insertionA: null, insertionB: null, connectorGeometry: null, interfaceA: null, interfaceB: null }],
    readyCount: 0,
    failedCount: 1,
    status: "not-ready",
  };
}

console.log(`skill4 boolean plan ok · ready ${plan.readyConnectionCount}/4 · tile A connections ${tileA.connectionIds.length}`);
