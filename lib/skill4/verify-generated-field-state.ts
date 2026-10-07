import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff } from "./adapt";
import { layoutTiles } from "./assembly-layout";
import { generateCandidateField } from "./candidate-field";
import {
  assignGeneratedHybridField,
  connectionInputSignature,
  generateConnectionHybridField,
  reconcileConnections,
  syncConnectionInputs,
  type TileConnection,
} from "./connections";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function pair(connections: readonly TileConnection[], tileAId: string, tileBId: string) {
  const found = connections.find((connection) => connection.tileAId === tileAId && connection.tileBId === tileBId);
  if (!found) throw new Error(`missing connection ${tileAId}-${tileBId}`);
  return found;
}

function withCandidates(connection: TileConnection, tiles: readonly TileInstance[], loaded: ReadonlyMap<string, ModuleHandoff>) {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) throw new Error("connection tiles are missing");
  const moduleA = resolveTileModule(tileA.archetypeId, loaded);
  const moduleB = resolveTileModule(tileB.archetypeId, loaded);
  const result = generateCandidateField({
    signature: connection.signature,
    faceA: connection.faceA,
    faceB: connection.faceB,
    moduleA,
    moduleB,
  });
  assert(result.ok, "candidate inputs are available");
  if (!result.ok) throw new Error("unreachable");
  return { ...connection, candidateField: result.field, inputsChanged: false };
}

function snapshot(mesh: IsoMesh) {
  return Float32Array.from(mesh.positions);
}

function sameBuffer(mesh: IsoMesh, before: Float32Array, label: string) {
  assert(mesh.positions.length === before.length, `${label} length changed`);
  for (let index = 0; index < before.length; index += 1) {
    assert(mesh.positions[index] === before[index], `${label} positions were written`);
  }
}

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const moduleA = resolveTileModule("topographic-ground-field", loaded);
const moduleB = resolveTileModule("linear-gallery", loaded);
assert(moduleA.status === "ready" && moduleB.status === "ready", "source modules are ready");
if (moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("unreachable");
const sourceA = snapshot(moduleA.geometry);
const sourceB = snapshot(moduleB.geometry);
const framesBefore = JSON.stringify({ a: moduleA.faces, b: moduleB.faces });

const tiles = layoutTiles(4, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
let connections = reconcileConnections([], tiles, loaded);
assert(connections.length === 4, "the 2x2 board has four connections");
const missing = generateConnectionHybridField(pair(connections, "A", "B"), tiles, loaded);
assert(!missing.ok, "generation waits for candidate inputs");

let north = withCandidates({ ...pair(connections, "A", "C"), selectedMockId: "H21" }, tiles, loaded);
let east = withCandidates({ ...pair(connections, "A", "B"), selectedMockId: "H02" }, tiles, loaded);
const eastCandidates = JSON.stringify(east.candidateField);
const northCandidates = JSON.stringify(north.candidateField);

const eastGenerated = generateConnectionHybridField(east, tiles, loaded);
const northGenerated = generateConnectionHybridField(north, tiles, loaded);
assert(eastGenerated.ok && northGenerated.ok, "each connection can generate its own field");
if (!eastGenerated.ok || !northGenerated.ok) throw new Error("unreachable");
east = eastGenerated.connection;
north = northGenerated.connection;
const eastField = east.generatedHybridField;
const northField = north.generatedHybridField;
assert(eastField !== null && northField !== null, "both connections store a generated field");
if (!eastField || !northField) throw new Error("unreachable");
assert(eastField.candidates.length === 25 && northField.candidates.length === 25, "each stored field has 25 candidates");
assert(eastField.candidates.map((item) => item.candidateId).join() === Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`).join(), "stored ids stay H01 through H25");
assert(eastField !== northField && eastField.connectionSignature !== northField.connectionSignature, "the two connections store different fields");
assert(east.generationStatus === eastField.status && north.generationStatus === northField.status, "connection status follows the stored field");
assert(east.selectedMockId === "H02" && north.selectedMockId === "H21", "selected hybrid ids stay on their own connections");
assert(eastGenerated.reused === false && northGenerated.reused === false, "the first generation builds the field");

const eastAgain = generateConnectionHybridField(east, tiles, loaded);
assert(eastAgain.ok && eastAgain.reused && eastAgain.connection.generatedHybridField === eastField, "a matching signature reuses the stored field");
assert(north.generatedHybridField === northField, "generating A-B does not replace A-C");

const turned = syncConnectionInputs(
  { ...east, faceA: "T", faceSelection: "user" },
  connectionInputSignature({ ...east, faceA: "T" }, tiles, loaded),
);
assert(turned.signature !== east.signature, "a face change changes the A-B signature");
assert(turned.generatedHybridField === null && turned.candidateField === null && turned.generationStatus === "not-generated", "the A-B field is cleared");
assert(turned.selectedMockId === "H02", "clearing A-B keeps its selected hybrid id");
assert(north.generatedHybridField === northField && north.signature === northField.connectionSignature, "A-C remains stored");

const reconciled = reconcileConnections([turned, north], tiles, loaded);
const reconciledEast = pair(reconciled, "A", "B");
const reconciledNorth = pair(reconciled, "A", "C");
assert(reconciledEast.generatedHybridField === null, "reconciliation keeps A-B invalidated");
assert(reconciledNorth.generatedHybridField === northField, "reconciliation keeps A-C");

const replaced = assignGeneratedHybridField(east, {
  ...eastField,
  candidates: eastField.candidates.filter((candidate) => candidate.candidateId !== "H02"),
});
assert(replaced.selectedMockId === "H13", "a missing selected id returns to H13");
assert(north.selectedMockId === "H21", "the other connection keeps its own selection");
const foreign = assignGeneratedHybridField(north, eastField);
assert(foreign.generatedHybridField === northField, "a field from another signature is not stored");

sameBuffer(moduleA.geometry, sourceA, "source module A");
sameBuffer(moduleB.geometry, sourceB, "source module B");
assert(JSON.stringify({ a: moduleA.faces, b: moduleB.faces }) === framesBefore, "face frames are not rewritten");
assert(JSON.stringify(east.candidateField) === eastCandidates, "the A-B candidate field is not rewritten");
assert(JSON.stringify(north.candidateField) === northCandidates, "the A-C candidate field is not rewritten");

console.log(`skill4 generated field state ok · A-B ${east.generationStatus} ${eastField.readyCount}/${eastField.candidates.length} · A-C ${north.generationStatus} ${northField.readyCount}/${northField.candidates.length}`);
