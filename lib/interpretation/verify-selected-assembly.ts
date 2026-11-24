/**
 * Adapter checks: local Y-up to Z-up conversion, baked yaw, no merge.
 * Run: npx tsx lib/interpretation/verify-selected-assembly.ts
 */
import assert from "node:assert/strict";
import { poseFinishedMesh } from "@/lib/skill5/placed-cluster";
import { analysisPositionsFromSite, posedAnalysisPositions, sitePointToAnalysis } from "./selected-assembly";

const up = sitePointToAnalysis(1, 2, 3);
assert.deepEqual(up, [1, 3, 2]);

const site = new Float32Array([1, 4, 7, 2, 5, 8]);
const analysis = analysisPositionsFromSite(site);
assert.equal(analysis[0], 1);
assert.equal(analysis[1], 7);
assert.equal(analysis[2], 4);
assert.equal(analysis[3], 2);
assert.equal(analysis[4], 8);
assert.equal(analysis[5], 5);

const cube = new Float32Array([
  0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4,
  0, 2, 0, 4, 2, 0, 4, 2, 4, 0, 2, 4,
]);
const posed = poseFinishedMesh(cube, { x: 100, y: 5, z: -40, rotationY: 90 });
const converted = analysisPositionsFromSite(posed);
const adapted = posedAnalysisPositions(cube, { x: 100, y: 5, z: -40, rotationY: 90 });
assert.equal(adapted.length, converted.length);
for (let index = 0; index < adapted.length; index += 1) {
  assert.ok(Math.abs(adapted[index] - converted[index]) < 1e-9);
}

const unrotated = posedAnalysisPositions(cube, { x: 100, y: 5, z: -40, rotationY: 0 });
let yawChanged = false;
for (let index = 0; index < adapted.length; index += 1) {
  if (Math.abs(adapted[index] - unrotated[index]) > 1e-6) yawChanged = true;
}
assert.equal(yawChanged, true);

const separate = [posedAnalysisPositions(cube, { x: 0, y: 0, z: 0, rotationY: 0 }), posedAnalysisPositions(cube, { x: 40, y: 0, z: 0, rotationY: 0 })];
assert.equal(separate.length, 2);
assert.notEqual(separate[0].buffer, separate[1].buffer);

console.log("selected-assembly adapter checks passed");
