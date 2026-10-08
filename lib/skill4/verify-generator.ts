import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { generateCandidateField } from "./candidate-field";
import { catalogDna, HYBRID_GENERATOR_SETTINGS, pendingHybridGenerator, type HybridGeneratorRequest } from "./hybrid-generator";
import { reconcileConnections } from "./connections";
import type { Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
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

function sameRing(a: IsoMesh, b: IsoMesh, ring: number, sampleCount: number) {
  const start = ring * sampleCount * 3;
  for (let index = 0; index < sampleCount * 3; index += 1) {
    if (a.positions[start + index] !== b.positions[start + index]) return false;
  }
  return true;
}

function ringMoved(a: IsoMesh, b: IsoMesh, ring: number, sampleCount: number) {
  return !sameRing(a, b, ring, sampleCount);
}

function sameMesh(a: IsoMesh, b: IsoMesh) {
  if (a.triangles !== b.triangles || a.positions.length !== b.positions.length || a.indices.length !== b.indices.length) return false;
  for (let index = 0; index < a.positions.length; index += 1) {
    if (a.positions[index] !== b.positions[index] || a.normals[index] !== b.normals[index]) return false;
  }
  for (let index = 0; index < a.indices.length; index += 1) {
    if (a.indices[index] !== b.indices[index]) return false;
  }
  return true;
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

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const tiles = initialTiles(loaded);
const [connection] = reconcileConnections([], tiles, loaded);
const moduleA = resolveTileModule(tiles[0].archetypeId, loaded);
const moduleB = resolveTileModule(tiles[1].archetypeId, loaded);
assert(moduleA.status === "ready" && moduleB.status === "ready", "modules come from adaptModule");
if (moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("unreachable");

const field = generateCandidateField({
  signature: connection.signature,
  faceA: connection.faceA,
  faceB: connection.faceB,
  moduleA,
  moduleB,
});
assert(field.ok, "candidate field is available");
if (!field.ok) throw new Error("unreachable");
const candidate = field.field.candidates[0];
const otherCandidate = field.field.candidates[field.field.candidates.length - 1];
const candidateBefore = JSON.stringify(candidate);
const otherBefore = JSON.stringify(otherCandidate);

const box = boxMesh(moduleA.registration);
const boxBefore = snapshot(box);
const sourceA = snapshot(moduleA.geometry);
const sourceB = snapshot(moduleB.geometry);
const shapedA = withGeometry(moduleA, box);
const shapedB = withGeometry(moduleB, box);

const request: HybridGeneratorRequest = {
  moduleA: shapedA,
  moduleB: shapedB,
  catalogA: catalogDna(moduleA),
  catalogB: catalogDna(moduleB),
  faceA: "E",
  faceB: "W",
  frameA: moduleA.faces.E,
  frameB: moduleB.faces.W,
  observationA: field.field.faceA,
  observationB: field.field.faceB,
  candidate,
  settings: HYBRID_GENERATOR_SETTINGS,
};

const first = pendingHybridGenerator.generate(request);
const second = pendingHybridGenerator.generate(request);
assert(first.status === "ready" && first.geometry !== null, "a cut pair produces a connector");
if (!first.geometry || !second.geometry) throw new Error("unreachable");
assert(first.vertexCount === 80 && first.triangleCount === 128, "counts follow 16 samples and 5 rings");
assert(first.geometry.positions.length === first.vertexCount * 3, "positions match the vertex count");
assert(first.geometry.triangles === first.triangleCount, "triangle count is stored on the mesh");
assert(first.candidateId === candidate.id, "the result keeps the candidate id");
for (let index = 0; index < first.geometry.positions.length; index += 1) {
  assert(Number.isFinite(first.geometry.positions[index]), "connector positions are finite");
  assert(Number.isFinite(first.geometry.normals[index]), "connector normals are finite");
}
for (let index = 0; index < first.geometry.indices.length; index += 1) {
  const vertex = first.geometry.indices[index];
  assert(vertex >= 0 && vertex < first.vertexCount, "connector indices address a vertex");
}
assert(sameMesh(first.geometry, second.geometry), "repeated generation is identical");
assert(first.geometry.positions !== box.positions && first.geometry.positions !== moduleA.geometry.positions, "the connector buffer is new");
unchanged(box, boxBefore, "section mesh");
unchanged(moduleA.geometry, sourceA, "source module A");
unchanged(moduleB.geometry, sourceB, "source module B");
assert(JSON.stringify(candidate) === candidateBefore, "candidate DNA is not rewritten");

const varied = pendingHybridGenerator.generate({ ...request, candidate: otherCandidate });
assert(varied.status === "ready" && varied.geometry !== null && varied.candidateId === otherCandidate.id, "another candidate still identifies itself");
if (!varied.geometry) throw new Error("unreachable");
const samples = HYBRID_GENERATOR_SETTINGS.profileSamples;
const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
assert(sameRing(first.geometry, varied.geometry, 0, samples), "the first ring stays on profile A");
assert(sameRing(first.geometry, varied.geometry, steps - 1, samples), "the last ring stays on profile B");
assert(ringMoved(first.geometry, varied.geometry, Math.floor(steps / 2), samples), "different candidate DNA moves the middle ring");
assert(JSON.stringify(otherCandidate) === otherBefore, "the second candidate is not rewritten");

const renamed = pendingHybridGenerator.generate({
  ...request,
  moduleA: {
    ...shapedA,
    identity: { ...moduleA.identity, archetypeId: "sample-archetype-a", name: "Sample A" },
  },
  catalogA: { ...request.catalogA, archetypeId: "sample-archetype-a" },
});
assert(renamed.status === "ready" && renamed.geometry !== null, "a renamed archetype still lofts");
if (!renamed.geometry) throw new Error("unreachable");
assert(sameMesh(first.geometry, renamed.geometry), "the generator does not branch on archetype name");

const missed = centerMesh();
const missedBefore = snapshot(missed);
const empty = pendingHybridGenerator.generate({
  ...request,
  moduleA: withGeometry(moduleA, missed),
});
assert(empty.status === "empty" && empty.geometry === null && empty.triangleCount === 0, "a missed section creates no connector");
assert(empty.candidateId === candidate.id, "an empty section still carries the candidate id");
unchanged(missed, missedBefore, "missed mesh");

const broken = boxMesh(moduleA.registration);
broken.positions[0] = Number.NaN;
const invalid = pendingHybridGenerator.generate({
  ...request,
  moduleB: withGeometry(moduleB, broken),
});
assert(invalid.status === "invalid" && invalid.geometry === null, "a non-finite section creates no connector");

assert(HYBRID_GENERATOR_SETTINGS.connectorDepth === null, "connector depth is not chosen silently");
assert(HYBRID_GENERATOR_SETTINGS.sectionDepth === 0.15, "section depth is an explicit provisional setting");
assert(HYBRID_GENERATOR_SETTINGS.profileSamples === 16 && HYBRID_GENERATOR_SETTINGS.loftSteps === 5, "sample count and loft steps are explicit");
assert(Object.values(request.catalogA.ratings).every((value) => value === 0 || value === 1 || value === 2), "catalog DNA stays on discrete rankings");
assert(
  field.field.candidates.some((item) => item.criteria.some((criterion) => criterion.role === "blended" && !Number.isInteger(criterion.value))),
  "continuous DNA is not rounded away",
);
assert(connection.signature.includes(HYBRID_GENERATOR_SETTINGS.version), "the connection signature names the generator contract");

const absent = resolveTileModule("vertical-void", loaded);
assert(absent.status !== "ready", "a missing module is not ready");

console.log(`skill4 generator ok · ${first.status} · ${first.vertexCount} vertices · ${first.triangleCount} triangles · ${first.candidateId}`);
