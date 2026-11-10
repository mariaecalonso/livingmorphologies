import assert from "node:assert/strict";
import { decodeSolidifiedMesh } from "../../lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "../../lib/skill3/solidified-catalogue";
import { loadSkill3HandoffRecords } from "../../lib/skill4/skill3-handoff";
import { loadModuleMap } from "../../lib/skill4/tiles";
import { SITE_ARCHETYPES } from "../../lib/skill5/catalog";
import { proposeDirectJoin } from "../../lib/skill5/direct-join";
import { buildHybridOffer, placedRawVertex, readStoredHybrids, placeHybridCandidate, registrationShift, suggestedSiteFaces } from "../../lib/skill5/hybrid-join";
import type { PlacedModule } from "../../lib/skill5/placement";

function tile(id: string, archetypeId: string, moduleId: string, x: number, y: number, z: number): PlacedModule {
  return {
    instanceId: id,
    kind: "archetype",
    name: archetypeId,
    status: "Validated",
    geometryState: "available",
    program: "gathering",
    programSource: "suggested",
    provenance: { moduleId, archetypeId, source: "skill3", candidateId: 1, continuationId: "c" },
    transform: { position: { x, y, z }, rotationY: 0 },
  };
}

function rawOf(archetypeId: string) {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  assert.ok(entry, archetypeId);
  const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
  assert.ok(stored);
  return decodeSolidifiedMesh(stored.geometry);
}

const gallery = SITE_ARCHETYPES.find((item) => item.archetypeId === "linear-gallery");
const hall = SITE_ARCHETYPES.find((item) => item.archetypeId === "open-hall");
const field = SITE_ARCHETYPES.find((item) => item.archetypeId === "topographic-ground-field");
assert.ok(gallery && hall && field);
const rawGallery = rawOf(gallery.archetypeId);
const rawHall = rawOf(hall.archetypeId);
const rawField = rawOf(field.archetypeId);
const galleryCopy = Float32Array.from(rawGallery.positions);
const hallCopy = Float32Array.from(rawHall.positions);
const loaded = loadModuleMap(loadSkill3HandoffRecords());

const shift = registrationShift(rawHall.positions);
assert.ok(shift);
let minZ = Infinity;
for (let index = 2; index < rawHall.positions.length; index += 3) minZ = Math.min(minZ, rawHall.positions[index]);
const hallTile = tile("hall", hall.archetypeId, hall.moduleId, 90, 0.7, -170);
const placed = placedRawVertex(rawHall.positions, 0, hallTile);
assert.ok(placed);
assert.ok(Math.abs(placed.x - (90 + rawHall.positions[0])) < 1e-4);
assert.ok(Math.abs(placed.y - (0.7 + rawHall.positions[2] - minZ)) < 1e-4);
assert.ok(Math.abs(placed.z - (-170 + rawHall.positions[1])) < 1e-4);

const sideA = tile("hall", hall.archetypeId, hall.moduleId, 0, 0.7, 0);
const sideB = tile("gallery", gallery.archetypeId, gallery.moduleId, 20, 0.7, 0);
assert.deepEqual(suggestedSiteFaces(sideA, sideB), ["E", "W"]);
const side = buildHybridOffer({ tileA: sideA, tileB: sideB, faceA: "E", faceB: "W", rawA: rawHall.positions, rawB: rawGallery.positions, loaded });
assert.equal(side.ok, true, side.ok ? "" : side.reason);
if (side.ok) {
  const ready = side.offer.candidates.find((candidate) => candidate.status === "ready");
  if (!ready) {
    assert.ok(side.offer.candidates.some((candidate) => candidate.reason.length > 0));
  } else {
    const placedHybrid = placeHybridCandidate(side.offer, ready.id);
    assert.equal(placedHybrid.ok, true, placedHybrid.ok ? "" : placedHybrid.reason);
    if (placedHybrid.ok) {
      assert.ok(placedHybrid.placement.passage.indices.length >= 12);
      assert.equal(placedHybrid.placement.faceA, "E");
      assert.equal(placedHybrid.placement.faceB, "W");
      const saved = readStoredHybrids([{ ...placedHybrid.placement, id: "c1", tileA: "hall", tileB: "gallery", integrity: "closed" }]);
      assert.equal(saved[0]?.candidateId, ready.id);
      assert.equal(saved[0]?.passage.indices.length, placedHybrid.placement.passage.indices.length);
    }
  }
}

const lower = tile("lower", field.archetypeId, field.moduleId, 40, 0.7, 0);
const upper = tile("upper", gallery.archetypeId, gallery.moduleId, 40, 20.7, 0);
assert.deepEqual(suggestedSiteFaces(lower, upper), ["T", "B"]);
const stack = buildHybridOffer({ tileA: lower, tileB: upper, faceA: "T", faceB: "B", rawA: rawField.positions, rawB: rawGallery.positions, loaded });
assert.equal(stack.ok, true, stack.ok ? "" : stack.reason);
if (stack.ok) {
  const ready = stack.offer.candidates.find((candidate) => candidate.status === "ready");
  assert.ok(ready || stack.offer.candidates[0]?.reason, "a vertical pair either places a hybrid or explains the refusal");
  if (ready) {
    const placedHybrid = placeHybridCandidate(stack.offer, ready.id);
    assert.equal(placedHybrid.ok, true, placedHybrid.ok ? "" : placedHybrid.reason);
    if (placedHybrid.ok) assert.equal(placedHybrid.placement.joinType, "stack");
  }
}

const blocked = buildHybridOffer({
  tileA: sideA,
  tileB: sideB,
  faceA: "E",
  faceB: "E",
  rawA: rawHall.positions,
  rawB: rawGallery.positions,
  loaded,
});
if (blocked.ok) {
  const refused = blocked.offer.candidates.filter((candidate) => candidate.status === "ready")
    .map((candidate) => placeHybridCandidate(blocked.offer, candidate.id))
    .filter((result) => result.ok);
  if (refused.length === 0) {
    const reason = blocked.offer.candidates.find((candidate) => candidate.reason)?.reason ?? "No hybrid was added.";
    assert.match(reason, /./);
  }
} else {
  assert.match(blocked.reason, /./);
}

const direct = proposeDirectJoin(sideA, sideB, rawHall.positions, rawGallery.positions);
assert.equal(direct.valid, false);
assert.equal(direct.passage, null);
assert.match(direct.issues[0] ?? "", /No passage was cut|do not share|opening/);

assert.deepEqual(Array.from(rawHall.positions), Array.from(hallCopy));
assert.deepEqual(Array.from(rawGallery.positions), Array.from(galleryCopy));
assert.equal(readStoredHybrids([{ id: "c2", tileA: "hall", tileB: "gallery" }]).length, 0);

console.log("hybrid join checks passed");
