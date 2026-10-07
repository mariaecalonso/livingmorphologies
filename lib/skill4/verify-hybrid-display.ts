import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { generateCandidateField } from "./candidate-field";
import { reconcileConnections, generateConnectionHybridField, type TileConnection } from "./connections";
import type { Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { generateHybridField, type GeneratedHybridCandidate, type GeneratedHybridField } from "./generated-hybrid-field";
import { generationStatusLabel, hybridDisplay } from "./hybrid-display";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { layoutTiles } from "./assembly-layout";
import { loadModuleMap, resolveTileModule } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function boxMesh(bounds: { min: Vec3; max: Vec3 }): IsoMesh {
  const { min, max } = bounds;
  const coordinates = [
    min.x, min.y, min.z, max.x, min.y, min.z, max.x, max.y, min.z, min.x, max.y, min.z,
    min.x, min.y, max.z, max.x, min.y, max.z, max.x, max.y, max.z, min.x, max.y, max.z,
  ];
  const faces = [
    [0, 1, 2, 0, 2, 3],
    [4, 6, 5, 4, 7, 6],
    [0, 4, 5, 0, 5, 1],
    [1, 5, 6, 1, 6, 2],
    [2, 6, 7, 2, 7, 3],
    [3, 7, 4, 3, 4, 0],
  ];
  return {
    positions: Float32Array.from(coordinates),
    normals: new Float32Array(coordinates.length),
    indices: Uint32Array.from(faces.flat()),
    triangles: 12,
  };
}

function view(signature: string, selectedMockId: string, generatedHybridField: GeneratedHybridField | null) {
  return hybridDisplay({ signature, selectedMockId, generatedHybridField });
}

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const moduleA = resolveTileModule("topographic-ground-field", loaded);
const moduleB = resolveTileModule("linear-gallery", loaded);
assert(moduleA.status === "ready" && moduleB.status === "ready", "source modules are ready");
if (moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("unreachable");
const sourceA = Float32Array.from(moduleA.geometry.positions);
const sourceB = Float32Array.from(moduleB.geometry.positions);

const pending = view("before-generation", "H13", null);
assert(pending.source === "mock" && pending.slots.length === 25, "a connection without a field keeps the pre-generation matrix");
assert(pending.slots.every((slot) => slot.source === "mock" && slot.mesh !== null), "pre-generation cards use mock meshes");
assert(pending.selected.id === "H13" && pending.selected.mesh !== null, "the pre-generation preview uses the selected mock");
assert(generationStatusLabel("not-generated") === "Not generated", "the header can say not generated");

const tiles = layoutTiles(2, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
const [connection] = reconcileConnections([], tiles, loaded);
const candidates = generateCandidateField({
  signature: connection.signature,
  faceA: "E",
  faceB: "W",
  moduleA,
  moduleB,
});
assert(candidates.ok, "candidate inputs exist");
if (!candidates.ok) throw new Error("unreachable");
const box = boxMesh(moduleA.registration);
const shaped = (module: ReadyModule) => ({ ...module, geometry: box });
const readyField = generateHybridField({
  moduleA: shaped(moduleA),
  moduleB: shaped(moduleB),
  faceA: "E",
  faceB: "W",
  candidateField: candidates.field,
  settings: HYBRID_GENERATOR_SETTINGS,
});
assert(readyField.readyCount === 25, "the display test field is ready");
const beforeField = JSON.stringify(readyField.candidates.map((item) => item.candidateId));
const beforeMesh = Float32Array.from(readyField.candidates[0].geometry?.positions ?? []);
const east = view(connection.signature, "H05", readyField);
assert(east.source === "generated" && east.slots.map((slot) => slot.id).join() === readyField.candidates.map((item) => item.candidateId).join(), "ready cards stay H01 through H25");
assert(east.slots.every((slot) => slot.source === "ready" && slot.mesh !== null), "ready cards use real meshes");
assert(east.selected.id === "H05" && east.selected.mesh === readyField.candidates[4].geometry, "the selected preview uses the selected real mesh");
assert(east.slots.every((slot) => slot.mesh !== pending.slots[0].mesh), "real meshes are not the mock tubes");

const northField: GeneratedHybridField = {
  ...readyField,
  connectionSignature: "north-signature",
  candidates: readyField.candidates.map((candidate) => ({ ...candidate, geometry: candidate.geometry ? {
    positions: Float32Array.from(candidate.geometry.positions),
    normals: Float32Array.from(candidate.geometry.normals),
    indices: Uint32Array.from(candidate.geometry.indices),
    triangles: candidate.geometry.triangles,
  } : null })),
};
const north = view("north-signature", "H17", northField);
assert(north.selected.id === "H17" && east.selected.id === "H05", "selection stays on its own connection");
assert(north.selected.mesh !== east.selected.mesh, "A-B and A-C display different generated meshes");

const mixedCandidates: GeneratedHybridCandidate[] = readyField.candidates.map((candidate, index) => {
  if (index === 1) return { ...candidate, status: "empty", geometry: null, vertexCount: 0, triangleCount: 0, reason: "empty" };
  if (index === 2) return { ...candidate, status: "blocked", geometry: null, vertexCount: 0, triangleCount: 0, reason: "blocked" };
  if (index === 3) return { ...candidate, status: "invalid", geometry: null, vertexCount: 0, triangleCount: 0, reason: "invalid" };
  return candidate;
});
const mixed = view(connection.signature, "H02", { ...readyField, status: "partial", candidates: mixedCandidates, readyCount: 22, emptyCount: 1, blockedCount: 1, invalidCount: 1 });
assert(mixed.source === "generated", "a partial field stays on the real source");
assert(mixed.slots[1].source === "empty" && mixed.slots[1].mesh === null, "an empty candidate has no mesh");
assert(mixed.slots[2].source === "blocked" && mixed.slots[2].mesh === null, "a blocked candidate has no mesh");
assert(mixed.slots[3].source === "invalid" && mixed.slots[3].mesh === null, "an invalid candidate has no mesh");
assert(mixed.selected.source === "empty" && mixed.selected.mesh === null, "the selected empty preview does not use a mock");
assert(mixed.slots.filter((slot) => slot.source !== "ready").every((slot) => slot.mesh === null), "failed real candidates do not fall back to mock geometry");

const board = layoutTiles(4, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
const links = reconcileConnections([], board, loaded);
const find = (tileAId: string, tileBId: string) => {
  const found = links.find((item) => item.tileAId === tileAId && item.tileBId === tileBId);
  if (!found) throw new Error(`missing ${tileAId}-${tileBId}`);
  return found;
};
function withInputs(item: TileConnection) {
  const result = generateCandidateField({
    signature: item.signature,
    faceA: item.faceA,
    faceB: item.faceB,
    moduleA: resolveTileModule(board.find((tile) => tile.instanceId === item.tileAId)?.archetypeId ?? "", loaded),
    moduleB: resolveTileModule(board.find((tile) => tile.instanceId === item.tileBId)?.archetypeId ?? "", loaded),
  });
  assert(result.ok, "board candidate inputs exist");
  if (!result.ok) throw new Error("unreachable");
  return { ...item, candidateField: result.field };
}
const generatedEast = generateConnectionHybridField({ ...withInputs(find("A", "B")), selectedMockId: "H05" }, board, loaded);
const generatedNorth = generateConnectionHybridField({ ...withInputs(find("A", "C")), selectedMockId: "H17" }, board, loaded);
assert(generatedEast.ok && generatedNorth.ok, "both board connections generate");
if (!generatedEast.ok || !generatedNorth.ok) throw new Error("unreachable");
const shownEast = hybridDisplay(generatedEast.connection);
const shownNorth = hybridDisplay(generatedNorth.connection);
assert(shownEast.source === "generated" && shownNorth.source === "generated", "both connections display generated fields");
assert(shownEast.selected.id === "H05" && shownNorth.selected.id === "H17", "displayed selection stays per connection");
const again = generateConnectionHybridField(generatedEast.connection, board, loaded);
assert(again.ok && again.reused, "repeating A-B reuses its field");
assert(hybridDisplay(generatedNorth.connection).selected.id === "H17", "generating A-B leaves A-C selection in place");
assert(generatedNorth.connection.generatedHybridField !== generatedEast.connection.generatedHybridField, "A-B generation does not replace the A-C field");

assert(JSON.stringify(readyField.candidates.map((item) => item.candidateId)) === beforeField, "display does not rewrite candidate ids");
const afterMesh = readyField.candidates[0].geometry?.positions;
assert(afterMesh !== undefined && afterMesh.length === beforeMesh.length, "display does not replace the mesh buffer");
for (let index = 0; index < beforeMesh.length; index += 1) {
  assert(afterMesh[index] === beforeMesh[index], "display does not write source geometry");
}
assert(sameCopied(moduleA.geometry.positions, sourceA), "source module A is not rewritten");
assert(sameCopied(moduleB.geometry.positions, sourceB), "source module B is not rewritten");

function sameCopied(mesh: Float32Array, before: Float32Array) {
  if (mesh.length !== before.length) return false;
  for (let index = 0; index < before.length; index += 1) {
    if (mesh[index] !== before[index]) return false;
  }
  return true;
}

console.log(`skill4 hybrid display ok · mock ${pending.slots.length} · ready ${east.slots.filter((slot) => slot.source === "ready").length} · selected ${east.selected.id}`);
