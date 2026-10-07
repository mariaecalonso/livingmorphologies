import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { generateCandidateField, type HybridCandidate } from "./candidate-field";
import { reconcileConnections } from "./connections";
import type { Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { generateHybridField } from "./generated-hybrid-field";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { initialTiles, loadModuleMap, resolveTileModule } from "./tiles";

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

function centerMesh(): IsoMesh {
  return {
    positions: Float32Array.from([0, 0, 0, 0.02, 0, 0, 0, 0.02, 0]),
    normals: new Float32Array(9),
    indices: Uint32Array.from([0, 1, 2]),
    triangles: 1,
  };
}

function withGeometry(module: ReadyModule, geometry: IsoMesh): ReadyModule {
  return { ...module, geometry };
}

function snapshot(mesh: IsoMesh) {
  return { positions: Float32Array.from(mesh.positions), indices: Uint32Array.from(mesh.indices) };
}

function unchanged(mesh: IsoMesh, before: ReturnType<typeof snapshot>, label: string) {
  assert(mesh.positions.length === before.positions.length, `${label} length changed`);
  for (let index = 0; index < before.positions.length; index += 1) {
    assert(mesh.positions[index] === before.positions[index], `${label} positions were written`);
  }
  for (let index = 0; index < before.indices.length; index += 1) {
    assert(mesh.indices[index] === before.indices[index], `${label} indices were written`);
  }
}

function sameRing(a: IsoMesh, b: IsoMesh, ring: number, sampleCount: number) {
  const start = ring * sampleCount * 3;
  for (let index = 0; index < sampleCount * 3; index += 1) {
    if (a.positions[start + index] !== b.positions[start + index]) return false;
  }
  return true;
}

function countsMatch(field: { candidates: { status: string }[]; readyCount: number; blockedCount: number; emptyCount: number; invalidCount: number }) {
  const ready = field.candidates.filter((item) => item.status === "ready").length;
  const blocked = field.candidates.filter((item) => item.status === "blocked").length;
  const empty = field.candidates.filter((item) => item.status === "empty").length;
  const invalid = field.candidates.filter((item) => item.status === "invalid").length;
  return field.readyCount === ready
    && field.blockedCount === blocked
    && field.emptyCount === empty
    && field.invalidCount === invalid
    && ready + blocked + empty + invalid === field.candidates.length;
}

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const tiles = initialTiles(loaded);
const [connection] = reconcileConnections([], tiles, loaded);
const moduleA = resolveTileModule(tiles[0].archetypeId, loaded);
const moduleB = resolveTileModule(tiles[1].archetypeId, loaded);
assert(moduleA.status === "ready" && moduleB.status === "ready", "modules come from adaptModule");
if (moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("unreachable");

const built = generateCandidateField({
  signature: connection.signature,
  faceA: connection.faceA,
  faceB: connection.faceB,
  moduleA,
  moduleB,
});
assert(built.ok, "candidate field is available");
if (!built.ok) throw new Error("unreachable");

const box = boxMesh(moduleA.registration);
const boxBefore = snapshot(box);
const sourceA = snapshot(moduleA.geometry);
const sourceB = snapshot(moduleB.geometry);
const framesBefore = JSON.stringify({ a: moduleA.faces, b: moduleB.faces });
const fieldBefore = JSON.stringify(built.field);
const shapedA = withGeometry(moduleA, box);
const shapedB = withGeometry(moduleB, box);

const request = {
  moduleA: shapedA,
  moduleB: shapedB,
  faceA: "E" as const,
  faceB: "W" as const,
  candidateField: built.field,
  settings: HYBRID_GENERATOR_SETTINGS,
};

const first = generateHybridField(request);
const second = generateHybridField(request);
const expectedIds = Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`);

assert(first.candidates.length === 25, "a 25-candidate field returns 25 results");
assert(first.candidates.map((item) => item.candidateId).join() === expectedIds.join(), "candidate ids stay H01 through H25");
assert(first.connectionSignature === connection.signature, "the field keeps the connection signature");
assert(first.connectionSignature === built.field.signature, "the signature is the candidate field signature");
assert(first.status === "ready" && first.readyCount === 25, "every sectionable candidate is ready");
assert(first.blockedCount === 0 && first.emptyCount === 0 && first.invalidCount === 0, "the sectionable field has no failed candidates");
assert(countsMatch(first), "status counts equal the candidate count");

const samples = HYBRID_GENERATOR_SETTINGS.profileSamples;
const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
const buffers = new Set<Float32Array>();
for (const item of first.candidates) {
  assert(item.geometry !== null, `${item.candidateId} has a mesh`);
  if (!item.geometry) throw new Error("unreachable");
  assert(item.vertexCount === 80 && item.triangleCount === 128, `${item.candidateId} keeps the loft counts`);
  assert(!buffers.has(item.geometry.positions) && !buffers.has(item.geometry.normals) && !buffers.has(item.geometry.indices), `${item.candidateId} owns its buffers`);
  buffers.add(item.geometry.positions);
  for (let index = 0; index < item.geometry.positions.length; index += 1) {
    assert(Number.isFinite(item.geometry.positions[index]), `${item.candidateId} positions are finite`);
    assert(Number.isFinite(item.geometry.normals[index]), `${item.candidateId} normals are finite`);
  }
  for (let index = 0; index < item.geometry.indices.length; index += 1) {
    const vertex = item.geometry.indices[index];
    assert(vertex >= 0 && vertex < item.vertexCount, `${item.candidateId} indices address a vertex`);
  }
}

const opening = first.candidates[0].geometry;
const closing = first.candidates[24].geometry;
if (!opening || !closing) throw new Error("unreachable");
assert(sameRing(opening, closing, 0, samples), "different DNA keeps the first ring");
assert(sameRing(opening, closing, steps - 1, samples), "different DNA keeps the last ring");
assert(!sameRing(opening, closing, Math.floor(steps / 2), samples), "different DNA moves an intermediate ring");

assert(second.candidates.length === first.candidates.length, "a repeated field has the same length");
for (let index = 0; index < first.candidates.length; index += 1) {
  const left = first.candidates[index];
  const right = second.candidates[index];
  assert(left.candidateId === right.candidateId && left.status === right.status, "a repeated field keeps ids and status");
  assert(left.geometry !== null && right.geometry !== null && left.geometry.positions !== right.geometry.positions, "a repeated field allocates new buffers");
  if (!left.geometry || !right.geometry) throw new Error("unreachable");
  for (let coordinate = 0; coordinate < left.geometry.positions.length; coordinate += 1) {
    assert(left.geometry.positions[coordinate] === right.geometry.positions[coordinate], "a repeated field matches vertex positions");
  }
}

unchanged(box, boxBefore, "section mesh");
unchanged(moduleA.geometry, sourceA, "source module A");
unchanged(moduleB.geometry, sourceB, "source module B");
assert(JSON.stringify({ a: moduleA.faces, b: moduleB.faces }) === framesBefore, "face frames are not rewritten");
assert(JSON.stringify(built.field) === fieldBefore, "the candidate field is not rewritten");

const brokenCandidates = built.field.candidates.map((candidate, index) => (
  index === 2 ? { ...candidate, criteria: null as unknown as HybridCandidate["criteria"] } : candidate
));
const partial = generateHybridField({
  ...request,
  candidateField: { ...built.field, candidates: brokenCandidates },
});
assert(partial.candidates.length === 25, "a failed candidate leaves the field intact");
assert(partial.candidates[2].status === "invalid" && partial.candidates[2].geometry === null, "the failed candidate has no mesh");
assert(partial.readyCount === 24 && partial.invalidCount === 1 && partial.blockedCount === 0 && partial.emptyCount === 0, "the other candidates stay ready");
assert(partial.status === "partial" && countsMatch(partial), "partial counts still add up");
assert(partial.candidates[0].geometry !== null && partial.candidates[4].geometry !== null, "neighbors of the failure still have meshes");
assert(JSON.stringify(built.field) === fieldBefore, "the original candidate field stays unchanged after a partial failure");

const missed = generateHybridField({
  ...request,
  moduleA: withGeometry(moduleA, centerMesh()),
});
assert(missed.candidates.length === 25 && missed.status === "empty", "a missed section still returns the full field");
assert(missed.readyCount === 0 && missed.emptyCount === 25 && missed.blockedCount === 0 && missed.invalidCount === 0, "every missed candidate is empty");
assert(missed.candidates.every((item) => item.geometry === null), "an empty candidate has no invented mesh");
assert(countsMatch(missed), "empty counts equal the candidate count");

console.log(`skill4 generated hybrid field ok · ${first.status} · ready ${first.readyCount} · blocked ${first.blockedCount} · empty ${first.emptyCount} · invalid ${first.invalidCount} · partial ready ${partial.readyCount} invalid ${partial.invalidCount}`);
