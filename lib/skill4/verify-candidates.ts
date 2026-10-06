import type { IsoMesh } from "../scan/isomesh";
import { buildCandidateField, CANDIDATE_FIELD_SETTINGS, generateCandidateField } from "./candidate-field";
import { FACE_SAMPLE_SETTINGS, sampleFace } from "./face-sample";
import { faceFrames, registrationEnvelope, VIEW_SCAN } from "./contract";
import { connectionInputSignature, reconcileConnections } from "./connections";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { initialTiles, loadModuleMap, resolveTileModule } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const tiles = initialTiles(loaded);
const [connection] = reconcileConnections([], tiles, loaded);
const moduleA = resolveTileModule("topographic-ground-field", loaded);
const moduleB = resolveTileModule("linear-gallery", loaded);
assert(moduleA.status === "ready" && moduleB.status === "ready", "default modules are ready");
if (moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("unreachable");

const first = generateCandidateField({
  signature: connection.signature,
  faceA: connection.faceA,
  faceB: connection.faceB,
  moduleA,
  moduleB,
});
const second = generateCandidateField({
  signature: connection.signature,
  faceA: connection.faceA,
  faceB: connection.faceB,
  moduleA,
  moduleB,
});
assert(first.ok && second.ok, "eligible connections generate");
if (!first.ok || !second.ok) throw new Error("unreachable");
assert(first.field.candidates.length === 25, "exactly 25 candidates");
assert(first.field.candidates.map((item) => item.id).join() === Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`).join(), "stable H01–H25 ids");
assert(JSON.stringify(first.field.candidates.map((item) => item.criteria)) === JSON.stringify(second.field.candidates.map((item) => item.criteria)), "identical inputs repeat");
assert(first.field.candidates.every((item) => item.generationInput.physicalConnection === false), "face inputs do not claim a physical connection");
assert(connection.signature.includes(FACE_SAMPLE_SETTINGS.version) && connection.signature.includes(CANDIDATE_FIELD_SETTINGS.version), "signature records analysis and generator versions");

const shared = first.field.candidates[0].criteria.find((item) => item.criterionId === "complexity");
assert(shared?.role === "shared" && shared.value === 2, "shared complexity stays High");
assert(first.field.candidates.every((candidate) => candidate.criteria.find((item) => item.criterionId === "complexity")?.value === 2), "shared values do not vary");

const centrality = first.field.candidates.map((candidate) => candidate.criteria.find((item) => item.criterionId === "centrality")?.value);
assert(centrality[0] !== centrality[4], "differing centrality changes from A toward B");
assert(first.field.candidates.every((candidate) => candidate.criteria.every((item) => item.value >= 0 && item.value <= 2)), "values stay inside 0 to 2");
assert(!first.field.candidates.some((candidate) => candidate.criteria.some((item) => item.role === "blended" && item.value === 0 && item.catalogA === 2 && item.catalogB === 0 && candidate.column === 2)), "the center column is transitional");

const changedFace = { ...connection, faceA: "T" as const, faceSelection: "user" as const };
const changedSignature = connectionInputSignature(changedFace, tiles, loaded);
assert(changedSignature !== connection.signature, "a face change changes the generation signature");
const kept = reconcileConnections([{ ...connection, candidateField: first.field }], tiles, loaded);
assert(kept[0].candidateField?.signature === connection.signature, "an unchanged connection keeps its field");
const dropped = reconcileConnections([{ ...connection, faceA: "T", faceSelection: "user", candidateField: first.field, signature: connection.signature }], tiles, loaded);
assert(dropped[0].faceA === "T" && dropped[0].candidateField === null, "editing the face invalidates that field");

const missing = generateCandidateField({
  signature: "missing",
  faceA: "E",
  faceB: "W",
  moduleA: resolveTileModule("vertical-void", loaded),
  moduleB,
});
assert(!missing.ok && missing.ok === false && missing.reason.includes("unavailable"), "missing geometry blocks generation");

const envelope = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
const frames = faceFrames(envelope);
const far: IsoMesh = {
  positions: new Float32Array([0, 0, 0, 0.05, 0, 0, 0, 0.05, 0]),
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  triangles: 1,
};
const empty = sampleFace(far, "E", frames.E);
const absent = sampleFace(null, "E", null);
assert(empty.status === "empty-interface" && absent.status === "unavailable", "an empty interface is not unavailable geometry");

const manual = buildCandidateField({
  signature: "manual",
  ratingsA: new Map([["complexity", 2]]),
  ratingsB: new Map([["complexity", 2], ["openness", 1]]),
  faceA: empty,
  faceB: empty,
});
assert(manual.candidates.every((candidate) => candidate.criteria.find((item) => item.criterionId === "openness")?.role === "one-sided"), "a one-sided criterion is not invented for the other archetype");
assert(manual.candidates[0].criteria.find((item) => item.criterionId === "openness")?.value === 1, "the known rating is kept");

console.log(`skill4 candidates ok · ${first.field.candidates.length} · empty ${empty.status} · unavailable ${absent.status}`);
