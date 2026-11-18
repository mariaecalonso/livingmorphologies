import { existsSync, statSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { readFinalSelection } from "@/lib/skill3/final-selection";
import { SKILL6_COVERAGE_ALGORITHM, SKILL6_PARAMETERS, sourcePointToSkill6 } from "./contract";
import { poseOf } from "./geometry";
import { readPair } from "./contact";
import { aggregateRule } from "./aggregate";
import { aggregateCoverage, aggregateTranslated } from "./grow";
import { compatibilityTable, readCompatibility } from "./compatibility";
import { poseBlocked, scanCrossings, validateSpec } from "./envelope";
import { placeSolid, scanPlaced } from "./world-solid";
import { loadTranslatedTable } from "./shifts";
import { measureCluster } from "./metrics";
import { assembleArchetype, loadArchetypeMeshes, type ArchetypeMesh } from "./source";

function box(min: [number, number, number], max: [number, number, number]): { positions: number[]; indices: number[] } {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1, 0, 3, 2],
    [4, 5, 6, 4, 6, 7],
    [0, 1, 5, 0, 5, 4],
    [3, 6, 2, 3, 7, 6],
    [0, 4, 7, 0, 7, 3],
    [1, 2, 6, 1, 6, 5],
  ];
  const positions = corners.flat();
  const indices = faces.flat();
  return { positions, indices };
}

function merge(parts: { positions: number[]; indices: number[] }[]) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.positions);
    indices.push(...part.indices.map((index) => index + offset));
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function solidBox(id: string, min: [number, number, number], max: [number, number, number]): ArchetypeMesh {
  const part = box(min, max);
  return assembleArchetype({
    archetypeId: id,
    name: id,
    typologyId: "lobby",
    moduleId: id,
    candidateId: 1,
    continuationId: "N00",
    positions: new Float32Array(part.positions),
    indices: new Uint32Array(part.indices),
  });
}

function assertVerdict(label: string, actual: string, expected: string) {
  assert.equal(actual, expected, label);
}

const touching = solidBox("a", [-2, -2, -2], [2, 2, 2]);
const beside = solidBox("b", [-2, -2, -2], [2, 2, 2]);
const home = poseOf(0, false, [0, 0, 0]);
const wide = readPair(touching, beside, home, poseOf(0, false, [4.35, 0, 0]), SKILL6_PARAMETERS.contactTolerance);
assert.ok(wide.verdict !== "surface-contact" && wide.verdict !== "near-contact", `a 0.35 gap is not a joint, got ${wide.verdict}`);
const seated = readPair(touching, beside, home, poseOf(0, false, [4.06, 0, 0]), SKILL6_PARAMETERS.contactTolerance);
assert.ok(seated.verdict === "surface-contact" || seated.verdict === "near-contact", `facing boxes inside the residual limit connect, got ${seated.verdict}`);
assert.ok(seated.residualGap != null && seated.residualGap <= SKILL6_PARAMETERS.contactTolerance, "residual stays inside the documented limit");
assert.ok(seated.contactArea >= SKILL6_PARAMETERS.minContactArea, "the coherent face area is recorded");
assert.equal(seated.coherentRegions, 1, "one connected region is required");
assert.equal(seated.intersectingTriangles, 0, "a separated pair does not report triangle crossings");
assert.equal(seated.registrationOverlap, true, "registration cells may overlap while the meshes only meet at the surface");

const far = readPair(touching, beside, home, poseOf(0, false, [8, 0, 0]), SKILL6_PARAMETERS.contactTolerance);
assertVerdict("distant boxes are a gap", far.verdict, "gap");

const overlapPose = poseOf(0, false, [2, 0, 0]);
const overlap = readPair(touching, beside, home, overlapPose, SKILL6_PARAMETERS.contactTolerance);
assertVerdict("penetrating boxes are an intersection", overlap.verdict, "intersection");
assert.ok(overlap.intersectingTriangles > 0, "penetration has triangle evidence");

const elbowA = merge([box([0, 0, 0], [6, 2, 2]), box([0, 0, 0], [2, 6, 2])]);
const elbowB = merge([box([3.4, 3.4, 0], [5.8, 5.8, 2])]);
const leftL = assembleArchetype({
  archetypeId: "left",
  name: "left",
  typologyId: "lobby",
  moduleId: "left",
  candidateId: 1,
  continuationId: "N00",
  positions: elbowA.positions,
  indices: elbowA.indices,
});
const rightL = assembleArchetype({
  archetypeId: "right",
  name: "right",
  typologyId: "lobby",
  moduleId: "right",
  candidateId: 1,
  continuationId: "N00",
  positions: elbowB.positions,
  indices: elbowB.indices,
});
const falseBox = readPair(leftL, rightL, home, poseOf(0, false, [0, 0, 0]), SKILL6_PARAMETERS.contactTolerance);
assert.equal(falseBox.tightBox, "overlap", "the L bounding boxes overlap");
assert.notEqual(falseBox.verdict, "surface-contact", "box overlap is not accepted as surface contact");
assert.notEqual(falseBox.verdict, "near-contact", "box overlap is not accepted as near contact");

const stacked = readPair(touching, beside, home, poseOf(0, false, [0, 0, 4.06]), SKILL6_PARAMETERS.contactTolerance);
assert.ok(stacked.verdict === "surface-contact" || stacked.verdict === "near-contact", `vertical faces within tolerance connect, got ${stacked.verdict}`);
const stackedGap = readPair(touching, beside, home, poseOf(0, false, [0, 0, 4.5]), SKILL6_PARAMETERS.contactTolerance);
assert.ok(stackedGap.verdict !== "surface-contact" && stackedGap.verdict !== "near-contact", "a tall gap is not a stack");

const turned = readPair(touching, beside, home, poseOf(1, false, [0, 4.06, 0]), SKILL6_PARAMETERS.contactTolerance);
assert.ok(turned.verdict === "surface-contact" || turned.verdict === "near-contact", `a quarter turn still exposes a face, got ${turned.verdict}`);

const mirrored = readPair(touching, beside, home, poseOf(0, true, [4.06, 0, 0]), SKILL6_PARAMETERS.contactTolerance);
assert.ok(mirrored.verdict === "surface-contact" || mirrored.verdict === "near-contact", `an X reflection still exposes a face, got ${mirrored.verdict}`);

const repeated = aggregateRule([touching], { id: "repeat", seed: 3, tiles: 2, attemptsPerTile: 8 });
assert.equal(repeated.status, "accepted", repeated.reason ?? "repeated archetype should attach");
assert.equal(repeated.tiles.length, 2);
assert.equal(repeated.tiles[0].archetypeId, repeated.tiles[1].archetypeId);
assert.equal(repeated.components.length, 1);
assert.ok(repeated.contacts.every((contact) => contact.verdict === "surface-contact" || contact.verdict === "near-contact"));
assert.ok(repeated.contacts.every((contact) => contact.coherentRegions === 1 && contact.contactArea >= SKILL6_PARAMETERS.minContactArea));
assert.ok(repeated.contacts.every((contact) => contact.residualGap != null && contact.residualGap <= SKILL6_PARAMETERS.contactTolerance));

const disconnected = readPair(touching, beside, home, poseOf(0, false, [30, 0, 0]), SKILL6_PARAMETERS.contactTolerance);
assertVerdict("a disconnected pair stays a gap", disconnected.verdict, "gap");

const measured = measureCluster(repeated.tiles, repeated.contacts, new Map([[touching.archetypeId, touching]]));
assert.equal(measured.tileCount, 2);
assert.equal(measured.connected, true);
assert.ok(measured.solidVolume > 0);
assert.equal(measured.overlapVolume, 0);
assert.ok(measured.boundingVolume > measured.solidVolume);

const selection = readFinalSelection();
assert.equal(selection.selections.length, 15);
const before = selection.selections.map((entry) => {
  const file = path.join(process.cwd(), "data", "experiments", "carved-mass-solidified", `${entry.archetypeId}-${entry.candidateId}-${entry.continuationId}.json`);
  assert.equal(existsSync(file), true, file);
  return { file, size: statSync(file).size, mtime: statSync(file).mtimeMs };
});
const loaded = loadArchetypeMeshes();
assert.equal(loaded.length, 15);
for (const mesh of loaded) {
  assert.ok(Array.isArray(mesh.patches), `${mesh.archetypeId} records its attachment pads`);
  assert.ok(mesh.solidVolume > 0, `${mesh.archetypeId} has a solid volume`);
  const probe = sourcePointToSkill6(0, 1, 2);
  assert.deepEqual(probe, [0, 2, 1]);
}
const plate = loaded.find((mesh) => mesh.archetypeId === "inserted-horizontal-plate");
assert.ok(plate, "N47 is loaded");
assert.equal(plate?.solidVolumeSource, "repaired-mesh");
assert.equal(plate?.cellVoidSource, "repaired-mesh");
assert.ok((plate?.cellVoidFraction ?? 1) < 1);

const triple = aggregateRule([touching], { id: "triple", seed: 5, tiles: 3, attemptsPerTile: 8 });
assert.equal(triple.status, "accepted", triple.reason ?? "three boxes should grow on a free axis");
assert.equal(triple.tiles.length, 3);
assert.equal(triple.contacts.length, 2);
const third = triple.tiles[2];
const earlier = triple.tiles.filter((tile) => tile.instanceId !== third.instanceId).map((tile) => ({ mesh: touching, pose: tile.pose }));
assert.equal(poseBlocked(earlier, touching, third.pose).blocked, false, "the third box stays clear of both earlier boxes");
const occupied = poseOf(0, false, [2, 0, 0]);
const stackedClear = poseOf(0, false, [0, 0, 4.06]);
assert.equal(poseBlocked([{ mesh: touching, pose: home }, { mesh: beside, pose: poseOf(0, false, [4.06, 0, 0]) }], beside, occupied).blocked, true, "a penetrating seat intersects the host and the side tile");
assert.equal(poseBlocked([{ mesh: touching, pose: home }, { mesh: beside, pose: poseOf(0, false, [4.06, 0, 0]) }], beside, stackedClear).blocked, false, "a stack on the free axis stays clear of the side tile");

const shiftedBoxes = aggregateTranslated([touching], { id: "shift-four", seed: 2, tiles: 4, budget: { evaluations: 40, backtracks: 8 } });
assert.equal(shiftedBoxes.status, "accepted", shiftedBoxes.reason ?? "translated growth should place four boxes");
assert.equal(shiftedBoxes.tiles.length, 4);
assert.equal(shiftedBoxes.metrics?.connected, true);
assert.equal(shiftedBoxes.search?.stop, "reached");
for (let later = 1; later < shiftedBoxes.tiles.length; later += 1) {
  for (let earlier = 0; earlier < later; earlier += 1) {
    assert.equal(
      poseBlocked([{ mesh: touching, pose: shiftedBoxes.tiles[earlier].pose }], touching, shiftedBoxes.tiles[later].pose).blocked,
      false,
      `${shiftedBoxes.tiles[later].instanceId} intersects ${shiftedBoxes.tiles[earlier].instanceId}`,
    );
  }
}

const flat = loaded.find((mesh) => mesh.archetypeId === "flat-deep-plan");
assert.ok(flat, "flat-deep-plan is loaded");
const selfJoint = validateSpec(flat, flat, { yaw: 180, pitch: -40, roll: 0, axis: [-1, 0, 0], axisName: "-X", gap: 0.1, mirrorX: false });
assert.equal(selfJoint.accepted, true, selfJoint.reason ?? "flat-deep-plan should seat on itself");
assert.equal(selfJoint.spec.pitch, -40);
assert.ok(selfJoint.contactArea >= 20, `self area ${selfJoint.contactArea}`);
assert.ok(selfJoint.residualGap != null && selfJoint.residualGap <= SKILL6_PARAMETERS.contactTolerance);
assert.ok((selfJoint.normalAlignment ?? 0) <= -SKILL6_PARAMETERS.normalOpposition);
assert.equal(selfJoint.coherentRegions, 1);
assert.ok(selfJoint.deepestCrossing <= SKILL6_PARAMETERS.maxPenetration);

const plateJoint = validateSpec(flat, plate, { yaw: 180, pitch: 0, roll: 0, axis: [-1, 0, 0], axisName: "-X", gap: 0.1, mirrorX: false });
assert.equal(plateJoint.accepted, true, plateJoint.reason ?? "the plate should seat on flat-deep-plan");
assert.equal(plateJoint.spec.pitch, 0);
assert.ok(plateJoint.contactArea >= 8, `plate area ${plateJoint.contactArea}`);
assert.ok(plateJoint.residualGap != null && plateJoint.residualGap <= SKILL6_PARAMETERS.contactTolerance);
assert.ok((plateJoint.normalAlignment ?? 0) <= -SKILL6_PARAMETERS.normalOpposition);
assert.equal(plateJoint.coherentRegions, 1);
assert.ok(plateJoint.deepestCrossing > 0 && plateJoint.deepestCrossing <= SKILL6_PARAMETERS.maxPenetration, `plate depth ${plateJoint.deepestCrossing}`);

const chain = aggregateRule([flat], { id: "flat-chain", seed: 1, tiles: 3, attemptsPerTile: 4 });
if (chain.status === "accepted") {
  assert.equal(chain.tiles.length, 3);
  assert.ok(chain.contacts.every((contact) => contact.attachment === "envelope" && contact.coherentRegions === 1 && contact.contactArea >= SKILL6_PARAMETERS.minContactArea));
  const last = chain.tiles[2];
  const prior = chain.tiles.slice(0, 2).map((tile) => ({ mesh: flat, pose: tile.pose }));
  assert.equal(poseBlocked(prior, flat, last.pose).blocked, false, "the third flat-deep-plan stays clear of both earlier tiles");
}

const grown = aggregateRule(loaded, { id: "real-pair", seed: 11, tiles: 2, attemptsPerTile: 1 });
assert.equal(grown.status, "unsuccessful", "a live search of all fifteen meshes is not the catalog path");

const baselineTable = compatibilityTable(readCompatibility());
const translatedTable = loadTranslatedTable();
assert.ok(translatedTable.shiftPoses > 100, "tangent slides are stored apart from the baseline cache");
const baselineGrowth = aggregateRule(loaded, { id: "baseline-six", seed: 71, tiles: 6, attemptsPerTile: 6, compatibility: baselineTable });
const translatedGrowth = aggregateTranslated(loaded, {
  id: "translated-six",
  seed: 71,
  tiles: 6,
  compatibility: translatedTable,
  budget: { evaluations: 420, backtracks: 22 },
});
assert.ok(baselineGrowth.tiles.length < translatedGrowth.tiles.length, "translated search should outgrow the centered envelope search");
assert.equal(translatedGrowth.status, "accepted", translatedGrowth.reason ?? "six translated tiles");
assert.equal(translatedGrowth.tiles.length, 6);
assert.equal(translatedGrowth.metrics?.connected, true);
assert.equal(translatedGrowth.algorithm, "rule-based-envelope-v2");
assert.ok(translatedGrowth.contacts.every((contact) => contact.coherentRegions === 1 && contact.contactArea >= SKILL6_PARAMETERS.minContactArea));
assert.ok(translatedGrowth.contacts.every((contact) => contact.residualGap != null && contact.residualGap <= SKILL6_PARAMETERS.contactTolerance));
assert.ok(translatedGrowth.contacts.every((contact) => contact.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition));
assert.ok(translatedGrowth.contacts.every((contact) => contact.deepestCrossing <= SKILL6_PARAMETERS.maxPenetration));
for (let later = 1; later < translatedGrowth.tiles.length; later += 1) {
  for (let earlier = 0; earlier < later; earlier += 1) {
    const host = loaded.find((mesh) => mesh.archetypeId === translatedGrowth.tiles[earlier].archetypeId);
    const guest = loaded.find((mesh) => mesh.archetypeId === translatedGrowth.tiles[later].archetypeId);
    assert.ok(host && guest);
    assert.equal(poseBlocked([{ mesh: host, pose: translatedGrowth.tiles[earlier].pose }], guest, translatedGrowth.tiles[later].pose).blocked, false);
  }
}

for (const [host, guest, joint] of [[flat, flat, selfJoint], [flat, plate, plateJoint]] as const) {
  const local = scanCrossings(host, guest, home, joint.pose);
  const cached = scanPlaced(placeSolid(host, home), guest, joint.pose);
  assert.equal(local.count > SKILL6_PARAMETERS.maxIntersectingTriangles, cached.count > SKILL6_PARAMETERS.maxIntersectingTriangles);
  assert.ok(Math.abs(local.deepest - cached.deepest) < 1e-4, `cache depth ${cached.deepest} local ${local.deepest}`);
}
const coveredBoxes = aggregateCoverage([touching], { seed: 3, tiles: 4, id: "coverage-boxes" });
assert.equal(coveredBoxes.algorithm, SKILL6_COVERAGE_ALGORITHM);
assert.equal(coveredBoxes.status, "accepted");
assert.equal(coveredBoxes.tiles.length, 4);
assert.equal(coveredBoxes.search?.stop, "reached");

const after = before.map((entry) => ({ size: statSync(entry.file).size, mtime: statSync(entry.file).mtimeMs }));
assert.deepEqual(after, before.map((entry) => ({ size: entry.size, mtime: entry.mtime })));

console.log("skill6 verify passed");
console.log(JSON.stringify({
  self: {
    area: selfJoint.contactArea,
    residual: selfJoint.residualGap,
    alignment: selfJoint.normalAlignment,
    regions: selfJoint.coherentRegions,
    depth: selfJoint.deepestCrossing,
    pitch: selfJoint.spec.pitch,
  },
  plate: {
    area: plateJoint.contactArea,
    residual: plateJoint.residualGap,
    alignment: plateJoint.normalAlignment,
    regions: plateJoint.coherentRegions,
    depth: plateJoint.deepestCrossing,
    pitch: plateJoint.spec.pitch,
  },
  chain: { status: chain.status, tiles: chain.tiles.length, reason: chain.reason },
  triple: { status: triple.status, tiles: triple.tiles.length },
  shiftedBoxes: { status: shiftedBoxes.status, tiles: shiftedBoxes.tiles.length, contacts: shiftedBoxes.contacts.length, search: shiftedBoxes.search },
  baselineGrowth: { tiles: baselineGrowth.tiles.length, status: baselineGrowth.status },
  translatedGrowth: { tiles: translatedGrowth.tiles.length, status: translatedGrowth.status, contacts: translatedGrowth.contacts.length, search: translatedGrowth.search },
}, null, 2));
