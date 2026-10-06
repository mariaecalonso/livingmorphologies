import { columnHeight } from "../scan/isomesh";
import { VIEW_SCAN } from "./contract";
import {
  ADJACENCY_TOLERANCE,
  connectionBlocked,
  connectionInputSignature,
  connectionPairLabel,
  connectionSummaryLabel,
  detectAdjacencies,
  reconcileConnections,
} from "./connections";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { envelopeWidth, initialTiles, loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const width = envelopeWidth();
const depth = 1;
const height = columnHeight(VIEW_SCAN.spacing, VIEW_SCAN.yaw);

function moved(tiles: TileInstance[], index: number, transform: TileInstance["transform"]) {
  return tiles.map((tile, tileIndex) => (tileIndex === index ? { ...tile, transform } : tile));
}

const adjacent = initialTiles(loaded);
const detected = detectAdjacencies(adjacent);
assert(detected.length === 1, "default placement has one adjacency");
assert(detected[0].tileAId === "A" && detected[0].tileBId === "B", "the adjacency is A-B");
assert(detected[0].faceA === "E" && detected[0].faceB === "W", "suggested faces follow the eastward placement");
assert(detectAdjacencies(adjacent.slice(0, 1)).length === 0, "a tile is not connected to itself");

assert(detectAdjacencies(moved(adjacent, 1, { x: width + 0.05, y: 0, z: 0 })).length === 0, "a separated envelope is not adjacent");
assert(
  detectAdjacencies(moved(adjacent, 1, { x: width, y: 0, z: depth })).length === 0,
  "edge-only contact is not a connection",
);
assert(
  detectAdjacencies(moved(adjacent, 1, { x: width, y: height, z: depth })).length === 0,
  "corner-only contact is not a connection",
);
assert(ADJACENCY_TOLERANCE < 1 / 20, "tolerance stays below one field cell");

let connections = reconcileConnections([], adjacent, loaded);
const createdId = connections[0].id;
const createdSignature = connections[0].signature;
assert(connections[0].origin === "detected" && connections[0].generationStatus === "not-generated", "new connection is detected and not generated");
assert(connections[0].faceSelection === "suggested", "initial faces are suggestions");
assert(connectionPairLabel(connections[0]) === "A:E ↔ B:W", "pair label");
assert(connectionSummaryLabel(connections[0], false) === "A:E → pending hybrid → B:W", "pending summary");
assert(!connectionBlocked(connections[0], adjacent, loaded), "both default meshes can generate");

connections = connections.map((connection) => {
  const next = { ...connection, faceA: "T" as const, faceSelection: "user" as const };
  const signature = connectionInputSignature(next, adjacent, loaded);
  return { ...next, signature, inputsChanged: signature !== connection.signature };
});
assert(connections[0].signature !== createdSignature, "a face change changes the input signature");
const signed = connections[0].signature;
connections = reconcileConnections(connections, adjacent, loaded);
connections = reconcileConnections(connections, adjacent, loaded);
assert(connections[0].id === createdId && connections[0].faceA === "T" && connections[0].faceB === "W", "reconciliation keeps the connection and the selected faces");
assert(connections[0].signature === signed, "repeated reconciliation keeps the signature");
assert(connectionInputSignature(connections[0], adjacent, loaded) === signed, "camera and selection are not part of the signature");

const sameArchetype = adjacent.map((tile) => {
  const handoff = resolveTileModule("linear-gallery", loaded);
  return { ...tile, archetypeId: "linear-gallery", moduleId: handoff.moduleId };
});
assert(sameArchetype[0].instanceId !== sameArchetype[1].instanceId, "instances stay distinct");
assert(detectAdjacencies(sameArchetype).length === 1, "two copies of one archetype still have one adjacency");
const sameConnections = reconcileConnections(connections, sameArchetype, loaded);
assert(sameConnections[0].tileAId === "A" && sameConnections[0].faceA === "T", "archetype change keeps the instance and the face");
assert(sameConnections[0].inputsChanged, "archetype change marks generation inputs");
assert(sameConnections[0].signature !== signed, "the changed module enters only this connection signature");

const blockedTiles = adjacent.map((tile, index) => {
  if (index !== 0) return tile;
  const handoff = resolveTileModule("vertical-void", loaded);
  return { ...tile, archetypeId: "vertical-void", moduleId: handoff.moduleId };
});
const blocked = reconcileConnections(connections, blockedTiles, loaded);
assert(blocked[0].faceA === "T", "unavailable geometry keeps the face choice");
assert(connectionBlocked(blocked[0], blockedTiles, loaded), "unavailable geometry blocks generation");
assert(blocked[0].signature.includes("skill03:vertical-void"), "the blocked tile keeps its own module id");
assert(resolveTileModule("vertical-void", loaded).geometry === null, "no mesh is substituted");

const bystander = {
  instanceId: "C",
  archetypeId: "linear-gallery",
  moduleId: resolveTileModule("linear-gallery", loaded).moduleId,
  transform: { x: width * 4, y: 0, z: 0 },
  rotationQuarter: 0 as const,
  mirror: null,
};
const withBystander = reconcileConnections(connections, [...adjacent, bystander], loaded);
assert(withBystander.length === 1 && withBystander[0].signature === signed, "a non-neighbor does not change this connection");

console.log(`skill4 connections ok · tolerance ${ADJACENCY_TOLERANCE} · ${connectionPairLabel(detected[0])}`);
