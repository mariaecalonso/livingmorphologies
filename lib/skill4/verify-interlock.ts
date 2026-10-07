import type { IsoMesh } from "../scan/isomesh";
import { evaluateAggregation } from "./aggregation";
import { sectionCenter } from "./assembly-hybrid";
import { layoutTiles } from "./assembly-layout";
import type { HybridCandidate } from "./candidate-field";
import { reconcileConnections, type TileConnection } from "./connections";
import { registrationEnvelope, VIEW_SCAN, type Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridCandidate, type GeneratedHybridField } from "./generated-hybrid-field";
import { connectorFrame } from "./hybrid-deformation";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { INTERLOCK_SETTINGS, buildInterlocks } from "./interlock";
import { loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";
import type { ReadyModule } from "./adapt";

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
      const extra = ring === Math.floor(STEPS / 2) && sample === 0 ? 0.05 : 0;
      positions.push(
        axis.x + frame.tangent.x * Math.cos(angle) * 0.08 + frame.bitangent.x * (Math.sin(angle) * 0.08 + extra),
        axis.y + frame.tangent.y * Math.cos(angle) * 0.08 + frame.bitangent.y * (Math.sin(angle) * 0.08 + extra),
        axis.z + frame.tangent.z * Math.cos(angle) * 0.08 + frame.bitangent.z * (Math.sin(angle) * 0.08 + extra),
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

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function read(mesh: IsoMesh, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] };
}

function centroid(mesh: IsoMesh, start: number, count: number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let sample = 0; sample < count; sample += 1) {
    const point = read(mesh, start + sample);
    x += point.x;
    y += point.y;
    z += point.z;
  }
  return { x: x / count, y: y / count, z: z / count };
}

function assertClosed(mesh: IsoMesh, label: string) {
  assert(mesh.triangles > 0 && mesh.indices.length === mesh.triangles * 3, `${label} has triangle topology`);
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (const corner of corners) assert(corner >= 0 && corner < mesh.positions.length / 3, `${label} indices stay in range`);
    assert(new Set(corners).size === 3, `${label} triangles are non-degenerate`);
    for (let edge = 0; edge < 3; edge += 1) {
      const left = corners[edge];
      const right = corners[(edge + 1) % 3];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) assert(count === 2, `${label} is closed`);
  for (let index = 0; index < mesh.positions.length; index += 1) assert(Number.isFinite(mesh.positions[index]), `${label} positions are finite`);
  for (let index = 0; index < mesh.normals.length; index += 1) assert(Number.isFinite(mesh.normals[index]), `${label} normals are finite`);
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

function readyLink(connection: TileConnection, board: readonly TileInstance[]) {
  const tileA = board.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = board.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) throw new Error("tiles are missing");
  const mesh = loftMesh(
    sectionCenter(moduleFor(tileA).faces[connection.faceA], DEPTH),
    sectionCenter(moduleFor(tileB).faces[connection.faceB], DEPTH),
  );
  return { connection: { ...connection, selectedMockId: "H05", generatedHybridField: field(connection.signature, mesh, "ready") }, mesh };
}

const prepared = links.map((connection) => readyLink(connection, tiles));
const beforeFields = prepared.map((item) => Float32Array.from(item.mesh.positions));
const beforeTiles = tiles.map((tile) => Float32Array.from(moduleFor(tile).geometry.positions));
const aggregation = evaluateAggregation(prepared.map((item) => item.connection), tiles, loaded);
const beforeConnector = Float32Array.from(aggregation.connections[0].geometry?.positions ?? []);
const interlocks = buildInterlocks(aggregation, tiles);
assert(interlocks.status === "ready" && interlocks.readyCount === 4 && interlocks.failedCount === 0, "four ready connections interlock independently");

const east = interlocks.connections[0];
if (!east.insertionA || !east.insertionB || !east.connectorGeometry || !east.interfaceA || !east.interfaceB || !east.overlapA || !east.overlapB) {
  throw new Error("A-B did not build insertion volumes");
}
assertClosed(east.insertionA, "insertion A");
assertClosed(east.insertionB, "insertion B");
for (let sample = 0; sample < SAMPLES; sample += 1) {
  const source = read(east.connectorGeometry, sample);
  const inserted = read(east.insertionA, sample);
  assert(length(sub(source, inserted)) < 1e-6, "insertion A starts at ring 0");
  const finalSource = read(east.connectorGeometry, (STEPS - 1) * SAMPLES + sample);
  const finalInserted = read(east.insertionB, sample);
  assert(length(sub(finalSource, finalInserted)) < 1e-6, "insertion B starts at the final ring");
}
const travelA = sub(centroid(east.insertionA, SAMPLES, SAMPLES), centroid(east.insertionA, 0, SAMPLES));
const travelB = sub(centroid(east.insertionB, SAMPLES, SAMPLES), centroid(east.insertionB, 0, SAMPLES));
assert(dot(travelA, east.interfaceA.inward) / length(travelA) > 0.999, "insertion A follows the inward normal");
assert(dot(travelB, east.interfaceB.inward) / length(travelB) > 0.999, "insertion B follows the inward normal");
assert(dot(east.interfaceA.inward, east.interfaceA.normal) < -0.999, "face A inward is opposite its placed normal");
assert(dot(east.interfaceB.inward, east.interfaceB.normal) < -0.999, "face B inward is opposite its placed normal");
assert(east.attachmentDepthA === INTERLOCK_SETTINGS.attachmentDepth && east.attachmentDepthB === INTERLOCK_SETTINGS.attachmentDepth, "attachment depth uses the configured value");
assert(Math.abs(east.overlapA.insertionSpan - INTERLOCK_SETTINGS.attachmentDepth) < 1e-5, "insertion A span matches the depth");
assert(Math.abs(east.overlapB.insertionSpan - INTERLOCK_SETTINGS.attachmentDepth) < 1e-5, "insertion B span matches the depth");
assert(east.overlapA.pointsIntoTile && east.overlapB.pointsIntoTile, "both insertions point into their tiles");
assert(east.connectorGeometry.positions !== aggregation.connections[0].geometry?.positions, "the interlock connector uses its own buffers");
for (let index = 0; index < beforeConnector.length; index += 1) {
  assert(aggregation.connections[0].geometry?.positions[index] === beforeConnector[index], "the placed connector is not rewritten");
  assert(east.connectorGeometry.positions[index] === beforeConnector[index], "the interlock connector keeps the placed shape");
}
const buffers = new Set(interlocks.connections.flatMap((item) => [item.insertionA?.positions, item.insertionB?.positions]));
assert(buffers.size === 8, "each connection keeps its own insertion buffers");

const skipped = evaluateAggregation(links.map((connection, index) => {
  if (index === 0) return { ...connection, selectedMockId: "H05", generatedHybridField: field(connection.signature, null, "empty") };
  if (index === 1) return { ...connection, selectedMockId: "H05", generatedHybridField: field(connection.signature, null, "invalid") };
  if (index === 2) return { ...connection, selectedMockId: "H05", generatedHybridField: field(connection.signature, null, "blocked") };
  return connection;
}), tiles, loaded);
const skippedInterlocks = buildInterlocks(skipped, tiles);
assert(skippedInterlocks.readyCount === 0 && skippedInterlocks.status === "not-ready", "non-ready connections do not interlock");
assert(skippedInterlocks.connections.map((item) => item.status).join() === "not-ready,invalid,blocked,not-ready", "empty, invalid, blocked, and missing fields stay out of insertion");
assert(skippedInterlocks.connections.every((item) => item.insertionA === null && item.insertionB === null), "non-ready connections create no insertion geometry");

function pose(board: TileInstance[]) {
  const next = reconcileConnections(links, board, loaded);
  const ready = next.map((connection) => readyLink(connection, board).connection);
  return buildInterlocks(evaluateAggregation(ready, board, loaded), board);
}

const turned = tiles.map((tile) => tile.instanceId === "A" ? { ...tile, rotationQuarter: 1 as const } : tile);
const mirrored = tiles.map((tile) => tile.instanceId === "A" ? { ...tile, mirror: "x" as const } : tile);
const height = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw).max.y - registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw).min.y;
const stacked = tiles.slice(0, 2).map((tile) => tile.instanceId === "B" ? { ...tile, transform: { x: 0, y: height, z: 0 } } : { ...tile, transform: { x: 0, y: 0, z: 0 } });
const stackedLinks = reconcileConnections([], stacked, loaded).map((connection) => readyLink(connection, stacked).connection);
const vertical = buildInterlocks(evaluateAggregation(stackedLinks, stacked, loaded), stacked);
for (const [label, result] of [["rotated", pose(turned)], ["mirrored", pose(mirrored)], ["vertical", vertical]] as const) {
  assert(result.readyCount === result.connections.length && result.connections.every((item) => item.insertionA && item.insertionB), `${label} frames still build insertions`);
  const first = result.connections[0];
  if (!first.insertionA || !first.interfaceA) throw new Error("unreachable");
  const travel = sub(centroid(first.insertionA, SAMPLES, SAMPLES), centroid(first.insertionA, 0, SAMPLES));
  assert(dot(travel, first.interfaceA.inward) / length(travel) > 0.999, `${label} insertion still follows the inward normal`);
}

prepared.forEach((item, index) => {
  for (let offset = 0; offset < item.mesh.positions.length; offset += 1) assert(item.mesh.positions[offset] === beforeFields[index][offset], "stored hybrid fields stay unchanged");
});
tiles.forEach((tile, index) => {
  const positions = moduleFor(tile).geometry.positions;
  for (let offset = 0; offset < positions.length; offset += 1) assert(positions[offset] === beforeTiles[index][offset], `${tile.instanceId} mesh stays unchanged`);
});

console.log(`skill4 interlock ok · ready ${interlocks.readyCount}/4 · depth ${INTERLOCK_SETTINGS.attachmentDepth}`);
