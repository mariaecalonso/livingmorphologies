import { ratingDescription } from "../catalog";
import type { Rating } from "../types";
import { adaptModule } from "./adapt";
import { inspectBooleanReadiness } from "./boolean-conditioning";
import { FACE_IDS, VIEW_SCAN, fieldToMesh, registrationEnvelope, type FaceFrame, type Vec3 } from "./contract";
import { PROVISIONAL_MOCK_IDS, loadProvisionalMock, readProvisionalMock } from "./fixtures";
import { initialTiles, loadModuleMap, resolveTileModule } from "./tiles";
import { sliceSpacing } from "../scan/isomesh";
import { FIELD_SIZE } from "../skill1/maps";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;

function assertFrame(frame: FaceFrame) {
  assert(near(dot(frame.normal, frame.normal), 1), `${frame.id} normal is unit length`);
  assert(near(dot(frame.u, frame.u), 1), `${frame.id} u is unit length`);
  assert(near(dot(frame.v, frame.v), 1), `${frame.id} v is unit length`);
  assert(near(dot(frame.normal, frame.u), 0), `${frame.id} u leaves the face plane`);
  assert(near(dot(frame.normal, frame.v), 0), `${frame.id} v leaves the face plane`);
  const handed = cross(frame.u, frame.v);
  assert(near(handed.x, frame.normal.x) && near(handed.y, frame.normal.y) && near(handed.z, frame.normal.z), `${frame.id} is right-handed`);
  assert(frame.extent.u > 0 && frame.extent.v > 0, `${frame.id} has a positive interface extent`);
}

const EXPECTED = {
  "topographic-ground-field": {
    name: "Topographic Ground Field",
    descriptors: { formal: "Sculpted Ground", spatial: "Distributed Flow", atmospheric: "Shared Engagement" },
    ratings: { complexity: 2, proportionality: 2, centrality: 0, openness: 2, connectivity: 2, directionality: 1, immersive: 2, visibility: 2, receptivity: 2 },
  },
  "linear-gallery": {
    name: "Linear Gallery",
    descriptors: { formal: "Linear Fragmentation", spatial: "Connected Progression", atmospheric: "Intuitive Guidance" },
    ratings: { complexity: 2, proportionality: 1, centrality: 2, openness: 1, connectivity: 2, directionality: 2, immersive: 1, visibility: 1, receptivity: 1 },
  },
} as const;

const ready = PROVISIONAL_MOCK_IDS.map((id) => {
  const handoff = loadProvisionalMock(id);
  assert(handoff.status === "ready", `${id} did not pass the adapter`);
  if (handoff.status !== "ready") throw new Error("unreachable");
  const expected = EXPECTED[id];
  assert(handoff.identity.name === expected.name, `${id} name`);
  assert(handoff.identity.typologyId === "lobby", `${id} typology`);
  assert(handoff.identity.descriptors.formal === expected.descriptors.formal, `${id} formal descriptor`);
  assert(handoff.identity.descriptors.spatial === expected.descriptors.spatial, `${id} spatial descriptor`);
  assert(handoff.identity.descriptors.atmospheric === expected.descriptors.atmospheric, `${id} atmospheric descriptor`);
  assert(handoff.provisional && handoff.source === "mock" && handoff.selectedFinal === false, `${id} is marked as a provisional mock`);
  assert(handoff.provenance.role === "provisional-mock", `${id} provenance`);
  assert(handoff.provenance.note.includes("Not a selected Skill 03 output."), `${id} note`);
  const ratings = Object.fromEntries(handoff.identity.criteria.flatMap((group) => group.criteria.map((item) => [item.id, item.rating])));
  for (const [criterion, rating] of Object.entries(expected.ratings)) {
    assert(ratings[criterion] === rating, `${id} ${criterion} rating`);
  }
  const complexity = handoff.identity.criteria.flatMap((group) => group.criteria).find((item) => item.id === "complexity");
  assert(complexity !== undefined, `${id} complexity criterion`);
  if (complexity) {
    assert(
      complexity.definition.levels[complexity.rating].description === ratingDescription(complexity.definition, complexity.rating as Rating),
      `${id} rating text comes from the catalog`,
    );
  }
  assert(FACE_IDS.every((face) => handoff.faces[face].id === face), `${id} has six faces`);
  for (const face of FACE_IDS) assertFrame(handoff.faces[face]);
  const box = handoff.registration;
  assert(near(handoff.faces.N.origin.z, box.max.z) && near(handoff.faces.S.origin.z, box.min.z), `${id} north and south sit on the envelope`);
  assert(near(handoff.faces.E.origin.x, box.max.x) && near(handoff.faces.W.origin.x, box.min.x), `${id} east and west sit on the envelope`);
  assert(near(handoff.faces.T.origin.y, box.max.y) && near(handoff.faces.B.origin.y, box.min.y), `${id} top and bottom sit on the envelope`);
  assert(handoff.geometry.triangles > 0, `${id} has mesh triangles`);
  assert(handoff.coordinates.planLattice.feet === null, "feet stay undefined");
  assert(handoff.coordinates.planLattice.cells === FIELD_SIZE, "plan lattice is the 20-cell field");
  return handoff;
});

const [ground, gallery] = ready;
assert(ground.geometry.triangles !== gallery.geometry.triangles || ground.geometry.positions[0] !== gallery.geometry.positions[0], "fixtures are different meshes");
for (const face of FACE_IDS) {
  assert(near(ground.faces[face].extent.u, gallery.faces[face].extent.u), `${face} extent is the shared envelope`);
  assert(near(ground.faces[face].origin.x, gallery.faces[face].origin.x), `${face} origin x matches`);
  assert(near(ground.faces[face].origin.y, gallery.faces[face].origin.y), `${face} origin y matches`);
  assert(near(ground.faces[face].origin.z, gallery.faces[face].origin.z), `${face} origin z matches`);
}

const pitch = sliceSpacing(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
const corner = fieldToMesh(0, 0, 0, pitch);
const far = fieldToMesh(FIELD_SIZE, FIELD_SIZE, 0, pitch);
assert(near(corner.x, registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw).min.x), "field 0 maps to the west bound");
assert(near(corner.z, registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw).min.z), "field 0 maps to the south bound");
assert(near(far.x, registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw).max.x), "field 20 maps to the east bound");
assert(near(far.z, registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw).max.z), "field 20 maps to the north bound");

assert(readProvisionalMock("topographic-ground-field").scan.iso === 0.48, "Topographic Ground Field uses the view iso");
assert(readProvisionalMock("linear-gallery").scan.iso === 0.35, "Linear Gallery records the iso that actually extracts a mesh");

const stored = readProvisionalMock("topographic-ground-field");
const missingSkill03 = adaptModule({
  ...stored,
  moduleId: "skill03:topographic-ground-field@1",
  source: "skill03",
  provisional: true,
  selectedFinal: false,
  geometry: null,
  provenance: { role: "skill03-output", note: "No selected Skill 03 module is stored." },
});
if (missingSkill03.status !== "unavailable") throw new Error("missing Skill 03 geometry is unavailable");
assert(missingSkill03.geometry === null && missingSkill03.substituted === false, "missing Skill 03 geometry is not replaced");
assert(missingSkill03.reason.includes("Mock geometry was not substituted."), "unavailable state names the refusal");
assert(missingSkill03.identity?.name === "Topographic Ground Field", "unavailable Skill 03 record still resolves the catalog");

let rejected = false;
try {
  adaptModule({ ...stored, selectedFinal: true });
} catch {
  rejected = true;
}
assert(rejected, "a mock cannot be labeled as a selected final");

const loaded = loadModuleMap([
  readProvisionalMock("topographic-ground-field"),
  readProvisionalMock("linear-gallery"),
]);
const tiles = initialTiles(loaded);
assert(tiles[0].archetypeId === "topographic-ground-field" && tiles[1].archetypeId === "linear-gallery", "default tiles");
assert(tiles[0].transform.x === 0 && tiles[0].transform.y === 0 && tiles[0].transform.z === 0, "A stays at the registration origin");
assert(near(tiles[1].transform.x, 1) && tiles[1].transform.y === 0 && tiles[1].transform.z === 0, "B is the next envelope to the east");
const groundModule = resolveTileModule("topographic-ground-field", loaded);
const groundAgain = resolveTileModule("topographic-ground-field", loaded);
assert(groundModule.status === "ready" && groundAgain.status === "ready", "mock resolves");
if (groundModule.status === "ready" && groundAgain.status === "ready") {
  assert(groundModule.geometry === groundAgain.geometry, "fixture geometry is reused");
  const physical = inspectBooleanReadiness(groundModule.geometry);
  assert(physical.booleanReady === false && physical.status === "open" && physical.boundaryEdgeCount === 10 && physical.componentCount === 4, "an available module is not automatically boolean-ready");
}
const missing = resolveTileModule("vertical-void", loaded);
assert(missing.status === "unavailable" && missing.geometry === null && missing.substituted === false, "another archetype does not borrow a mesh");
assert(missing.identity?.name === "Vertical Void" && missing.identity.typologyLabel === "Lobby", "unavailable archetype keeps its catalog identity");
assert(missing.identity?.descriptors.formal === "Dynamic Core", "unavailable archetype keeps its formal descriptor");
const complexity = missing.identity?.criteria.flatMap((group) => group.criteria).find((item) => item.id === "complexity");
assert(complexity?.rating === 2, "Vertical Void complexity stays High");

console.log(
  `skill4 handoff ok · ${ground.identity.name} ${ground.geometry.triangles} triangles · ${gallery.identity.name} ${gallery.geometry.triangles} triangles · exceeds envelope ${ground.geometryExceedsEnvelope}/${gallery.geometryExceedsEnvelope}`,
);
