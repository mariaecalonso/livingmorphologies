import { generateCandidateField } from "./candidate-field";
import { catalogDna, HYBRID_GENERATOR_SETTINGS, pendingHybridGenerator } from "./hybrid-generator";
import { reconcileConnections } from "./connections";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { initialTiles, loadModuleMap, resolveTileModule } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

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
const beforeA = moduleA.geometry.positions.length;
const beforeB = moduleB.geometry.positions.length;

const request = {
  moduleA,
  moduleB,
  catalogA: catalogDna(moduleA),
  catalogB: catalogDna(moduleB),
  faceA: connection.faceA,
  faceB: connection.faceB,
  frameA: moduleA.faces[connection.faceA],
  frameB: moduleB.faces[connection.faceB],
  observationA: field.field.faceA,
  observationB: field.field.faceB,
  candidate,
  settings: HYBRID_GENERATOR_SETTINGS,
};

const first = pendingHybridGenerator.generate(request);
const second = pendingHybridGenerator.generate(request);
assert(JSON.stringify(first) === JSON.stringify(second), "the pending generator is deterministic");
assert(first.geometry === null && first.status === "pending", "empty interfaces do not emit a connector");
assert(first.reason.includes("no transition volume"), "no transition volume is emitted");
assert(HYBRID_GENERATOR_SETTINGS.connectorDepth === null, "connector depth is not chosen silently");
assert(moduleA.geometry.positions.length === beforeA && moduleB.geometry.positions.length === beforeB, "source meshes stay unchanged");
assert(Object.values(request.catalogA.ratings).every((value) => value === 0 || value === 1 || value === 2), "catalog DNA stays on discrete rankings");
assert(
  field.field.candidates.some((item) => item.criteria.some((criterion) => criterion.role === "blended" && !Number.isInteger(criterion.value))),
  "continuous DNA is not rounded away",
);
assert(connection.signature.includes(HYBRID_GENERATOR_SETTINGS.version), "the connection signature names the generator contract");

const missing = resolveTileModule("vertical-void", loaded);
assert(missing.status !== "ready", "a missing module is not ready");

console.log(`skill4 generator ok · ${first.status} · ${first.candidateId}`);
