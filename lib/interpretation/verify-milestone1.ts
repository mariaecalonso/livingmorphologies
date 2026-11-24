/**
 * Milestone 1 checks for the temporary multi-cluster assembly.
 * Run: npx tsx lib/interpretation/verify-milestone1.ts
 */
import assert from "node:assert/strict";
import { analyzeBuilding, type BuildingAnalysis, type Finding } from "./analyze-building";
import {
  FIXTURE_SEPARATION_FEET,
  IDENTITY_ROTATION,
  loadTemporaryBuilding,
  reviewCatalogSource,
  type BuildingRequest,
  type LoadedCluster,
  type Vec3,
} from "./building";

function finding(report: BuildingAnalysis, id: string): Finding {
  const match = report.findings.find((item) => item.id === id);
  assert.ok(match, `missing finding ${id}`);
  return match;
}

function numberValue(item: Finding, key: string): number {
  const value = item.values[key];
  assert.equal(typeof value, "number", `${item.id}.${key}`);
  return value as number;
}

function cubeMesh(size: number): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array([
    0, 0, 0, size, 0, 0, size, size, 0, 0, size, 0,
    0, 0, size, size, 0, size, size, size, size, 0, size, size,
  ]);
  const indices = new Uint32Array([
    0, 3, 2, 0, 2, 1,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ]);
  return { positions, indices };
}

function synthetic(id: string, positions: Float32Array, indices: Uint32Array): LoadedCluster {
  return {
    id,
    meshFile: `synthetic://${id}`,
    positions,
    indices,
    triangles: indices.length / 3,
    tiles: [],
    validation: {
      state: "synthetic",
      penetrations: null,
      maxPenetration: null,
      cavities: null,
      genus: null,
      volume: null,
      minZ: null,
      grazes: null,
      note: "Synthetic mesh for a check. Not a Skill 6 cluster.",
    },
  };
}

function requestOf(clusters: LoadedCluster[], translations: Vec3[], scale: Vec3 = [1, 1, 1]): BuildingRequest {
  return {
    contract: "architectural-interpretation-assembly-v1",
    id: "synthetic-check",
    role: "temporary-fixture",
    disclaimer: "Synthetic check. Not the site building.",
    frame: {
      horizontal: ["X", "Y"],
      vertical: "Z",
      unit: "foot",
      skill6UnitToFoot: 1,
      moduleRegistrationFeet: 20,
      moduleIsStoryCount: false,
      axisConversionApplied: false,
      scaleApplied: false,
    },
    placementRule: {
      source: "temporary-fixture",
      description: "Synthetic placements passed in directly.",
      separationFeet: null,
      order: clusters.map((cluster) => cluster.id),
    },
    placements: clusters.map((cluster, index) => ({
      clusterId: cluster.id,
      rotation: IDENTITY_ROTATION,
      scale,
      translation: translations[index],
    })),
    clusters,
  };
}

const archived = reviewCatalogSource("assembled-rule-small-04");
assert.equal(archived.state, "archived");
assert.match(archived.reason, /0\.02|penetration|self-intersection/i);
const missing = reviewCatalogSource("not-a-cluster");
assert.equal(missing.state, "missing");

const empty = analyzeBuilding(requestOf([synthetic("empty", new Float32Array(), new Uint32Array())], [[0, 0, 0]]));
assert.ok(empty.failures.some((failure) => failure.code === "empty-mesh"));
assert.equal(empty.findings.some((item) => item.topic === "candidate-surface" && item.support === "interpretation"), false);
assert.equal(empty.generatedArchitecture, false);

const broken = new Float32Array([0, 0, 0, 1, 0, 0, Number.NaN, 1, 0]);
const invalid = analyzeBuilding(requestOf([synthetic("nan", broken, new Uint32Array([0, 1, 2]))], [[0, 0, 0]]));
assert.ok(invalid.failures.some((failure) => failure.code === "non-finite"));
assert.equal(invalid.findings.some((item) => item.topic === "thickness" && item.values.medianFeet != null), false);

const scaled = analyzeBuilding(requestOf(
  [synthetic("scaled", cubeMesh(20).positions, cubeMesh(20).indices)],
  [[0, 0, 0]],
  [2, 1, 1],
));
assert.ok(scaled.failures.some((failure) => failure.code === "unexpected-scale"));

const solid = cubeMesh(20);
const cubes = analyzeBuilding(requestOf(
  [
    synthetic("cube-a", solid.positions, solid.indices),
    synthetic("cube-b", solid.positions, solid.indices),
  ],
  [[0, 0, 0], [40, 0, 0]],
));
const cubeSlope = finding(cubes, "cube-a:slope");
assert.ok(Math.abs(numberValue(cubeSlope, "upArea") - 400) < 1);
const cubeThickness = finding(cubes, "cube-a:thickness");
assert.ok(Math.abs(numberValue(cubeThickness, "medianFeet") - 20) < 0.2);
const cubeElevation = finding(cubes, "cube-a:elevation");
assert.equal(numberValue(cubeElevation, "minZ"), 0);
assert.ok(Math.abs(numberValue(cubeElevation, "upwardMedian") - 20) < 0.05);
const cubeGap = finding(cubes, "cube-a__cube-b:clearance");
assert.ok(Math.abs(numberValue(cubeGap, "lowerFeet") - 20) < 0.05);
assert.ok(numberValue(cubeGap, "upperFeet") + 0.05 >= numberValue(cubeGap, "lowerFeet"));
assert.equal(cubes.findings.some((item) => item.summary.toLowerCase().includes("floor plate")), false);
assert.ok(cubes.findings.some((item) => item.topic === "candidate-surface" && item.support === "interpretation" && item.confidence === "unsupported"));
const cubeVoid = finding(cubes, "cube-a:void");
assert.equal(numberValue(cubeVoid, "enclosedCells"), 0);

const liftedMesh = cubeMesh(20);
const lifted = analyzeBuilding(requestOf(
  [synthetic("lifted", liftedMesh.positions, liftedMesh.indices)],
  [[0, 0, 3]],
));
const liftedElevation = finding(lifted, "lifted:elevation");
assert.ok(Math.abs(numberValue(liftedElevation, "upwardMedian") - 23) < 0.05, "elevation follows the mesh instead of a story rhythm");
assert.notEqual(numberValue(liftedElevation, "upwardMedian"), 24);
assert.notEqual(numberValue(liftedElevation, "minZ"), 0);

const building = loadTemporaryBuilding();
assert.equal(building.role, "temporary-fixture");
assert.equal(building.frame.axisConversionApplied, false);
assert.equal(building.frame.scaleApplied, false);
assert.equal(building.frame.skill6UnitToFoot, 1);
assert.equal(building.frame.moduleRegistrationFeet, 20);
assert.equal(building.frame.moduleIsStoryCount, false);
assert.deepEqual(building.placementRule.order, ["assembled-flat-self", "assembled-flat-plate", "assembled-rule-small-02"]);
assert.deepEqual(building.placements[0].translation, [0, 0, 0]);
for (const placement of building.placements) {
  assert.deepEqual(placement.rotation, IDENTITY_ROTATION);
  assert.deepEqual(placement.scale, [1, 1, 1]);
  assert.equal(placement.translation[1], 0);
  assert.equal(placement.translation[2], 0);
}

const report = analyzeBuilding(building);
assert.equal(report.generatedArchitecture, false);
assert.equal(report.predeterminedFloorElevations, false);
assert.equal(report.sources.length, 3);
assert.equal(report.failures.length, 0, JSON.stringify(report.failures));

for (const source of report.sources) {
  assert.equal(source.validation.state, "catalog-current");
  assert.equal(source.validation.penetrations, 0);
  assert.ok((source.validation.maxPenetration ?? 1) <= 0.02);
  assert.equal(source.validation.cavities, 0);
  assert.ok(source.tiles.length >= 2);
  assert.ok(source.tiles.every((tile) => tile.instanceId && tile.archetypeId && tile.moduleId));
  assert.ok(Math.abs(source.localBounds.min[2]) < 1e-3);
  assert.ok(Math.abs(source.worldBounds.min[2] - source.localBounds.min[2]) < 1e-6);
  const localSpan = source.localBounds.max.map((value, axis) => value - source.localBounds.min[axis]);
  const worldSpan = source.worldBounds.max.map((value, axis) => value - source.worldBounds.min[axis]);
  for (let axis = 0; axis < 3; axis += 1) assert.ok(Math.abs(localSpan[axis] - worldSpan[axis]) < 1e-4);
  assert.ok(localSpan.every((span) => span > 5), `${source.id} has a degenerate span`);
  const orientation = finding(report, `${source.id}:orientation`);
  assert.ok(numberValue(orientation, "signedVolume") > 0);
  const stored = orientation.values.storedVolume;
  assert.equal(typeof stored, "number");
  assert.ok(Math.abs(numberValue(orientation, "signedVolume") - (stored as number)) / (stored as number) < 0.02);
  assert.equal(finding(report, `${source.id}:elevation`).limitation?.includes("not story levels"), true);
  assert.ok(report.findings.some((item) => item.clusterIds.includes(source.id) && item.topic === "candidate-surface" && item.support === "measured"));
  assert.ok(report.findings.every((item) => item.topic !== "candidate-surface" || item.support !== "interpretation" || item.confidence === "unsupported" || !item.clusterIds.includes(source.id)));
}

for (let index = 1; index < report.sources.length; index += 1) {
  const previous = report.sources[index - 1].worldBounds;
  const current = report.sources[index].worldBounds;
  const gap = current.min[0] - previous.max[0];
  assert.ok(Math.abs(gap - FIXTURE_SEPARATION_FEET) < 1e-3, `gap ${gap}`);
}
const pair = finding(report, "assembled-flat-self__assembled-flat-plate:clearance");
assert.ok(Math.abs(numberValue(pair, "lowerFeet") - 20) < 0.05);
assert.ok(numberValue(pair, "upperFeet") + 0.05 >= 20);
assert.equal(finding(report, "assembled-flat-self__assembled-flat-plate:reading").confidence, "unsupported");
const outer = finding(report, "assembled-flat-self__assembled-rule-small-02:clearance");
assert.equal(outer.values.openInterval, 0);
assert.equal(outer.values.blockedBy, "assembled-flat-plate");
assert.equal(outer.values.lowerFeet, null);
assert.equal(report.findings.some((item) => /floor plate|story height|inserted slab/i.test(item.summary)), false);
assert.ok(report.sources.some((source) => source.worldBounds.max.some((value, axis) => Math.abs(value - source.worldBounds.min[axis] - 20) > 1)), "at least one cluster keeps a span the 20-foot module does not prescribe");

const lines = report.sources.map((source) => {
  const elevation = finding(report, `${source.id}:elevation`);
  const thickness = finding(report, `${source.id}:thickness`);
  const slope = finding(report, `${source.id}:slope`);
  const names = source.tiles.map((tile) => tile.name).join(" + ");
  return [
    source.id,
    names,
    `triangles ${source.triangles}`,
    `world min ${source.worldBounds.min.map((value) => value.toFixed(2)).join(", ")}`,
    `span ${source.worldBounds.max.map((value, axis) => (value - source.worldBounds.min[axis]).toFixed(2)).join(" × ")}`,
    `up ${numberValue(slope, "upArea")} / down ${numberValue(slope, "downArea")} / vertical ${numberValue(slope, "verticalArea")} / oblique ${numberValue(slope, "obliqueArea")}`,
    `thickness median ${thickness.values.medianFeet}`,
    `upward median z ${elevation.values.upwardMedian}`,
    `z ${elevation.values.minZ}–${elevation.values.maxZ}`,
  ].join(" | ");
});
console.log(lines.join("\n"));
console.log(report.findings.filter((item) => item.topic === "clearance" && item.support === "measured").map((item) => `${item.id} ${item.values.lowerFeet}–${item.values.upperFeet} (${item.confidence})`).join("\n"));
console.log(report.findings.filter((item) => item.topic === "void" && item.support === "measured").map((item) => `${item.id} enclosed ${item.values.enclosedCells} overhang ${item.values.overhangSamples} median ${item.values.overhangMedianFeet} min ${item.values.overhangMinFeet}`).join("\n"));
console.log(report.placements.map((item) => `${item.clusterId} t ${item.translation.map((value) => value.toFixed(3)).join(", ")}`).join("\n"));
console.log(report.findings.filter((item) => item.topic === "curvature").map((item) => `${item.id} ${item.values.meanNormalVariationDeg} regions ${item.values.regionCount}`).join("\n"));
console.log(report.findings.filter((item) => item.topic === "relationship" && item.support === "measured").map((item) => `${item.id} delta ${item.values.centroidDelta} overlapZ ${item.values.verticalOverlapFeet}`).join("\n"));
const candidates = report.findings.filter((item) => item.topic === "candidate-surface" && item.support === "measured" && item.values.area != null);
console.log(`candidate regions ${candidates.length}`);
console.log(candidates.slice(0, 9).map((item) => `${item.id} area ${item.values.area} z ${item.values.minZ}–${item.values.maxZ} slope ${item.values.slopeDeg} var ${item.values.normalVariationDeg} ${item.confidence}`).join("\n"));
console.log("milestone 1 checks passed");
