/**
 * Milestone 2 checks: proximity fixture, connected regions, and opportunity readings.
 * Run: npx tsx lib/interpretation/verify-milestone2.ts
 */
import assert from "node:assert/strict";
import { IDENTITY_ROTATION, type BuildingRequest, type LoadedCluster, type Vec3 } from "./building";
import { controlSeparationFeet, loadControlBuilding, loadProximityBuilding } from "./fixtures";
import { compareReadings, readAssembly } from "./opportunities";
import { connectedRegions } from "./regions";

function quad(x0: number, y0: number, x1: number, y1: number, z: number): { positions: Float32Array; indices: Uint32Array } {
  return {
    positions: new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

function joinedPads(): { positions: Float32Array; indices: Uint32Array } {
  return {
    positions: new Float32Array([
      0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0,
      4, 0, 0, 4, 2, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]),
  };
}

function floorAndWall(): { positions: Float32Array; indices: Uint32Array } {
  return {
    positions: new Float32Array([
      0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0,
      2, 0, 2, 2, 2, 2,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]),
  };
}

function steppedPads(): { positions: Float32Array; indices: Uint32Array } {
  const lower = quad(0, 0, 6, 4, 0);
  const upper = quad(3, 0, 9, 4, 5);
  const positions = new Float32Array(lower.positions.length + upper.positions.length);
  positions.set(lower.positions, 0);
  positions.set(upper.positions, lower.positions.length);
  const indices = new Uint32Array(lower.indices.length + upper.indices.length);
  indices.set(lower.indices, 0);
  upper.indices.forEach((value, index) => {
    indices[lower.indices.length + index] = value + 4;
  });
  return { positions, indices };
}

function cluster(id: string, positions: Float32Array, indices: Uint32Array): LoadedCluster {
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
      note: "Synthetic mesh. Not a Skill 6 cluster.",
    },
  };
}

function request(id: string, mesh: { positions: Float32Array; indices: Uint32Array }, translation: Vec3 = [0, 0, 0]): BuildingRequest {
  const body = cluster(id, mesh.positions, mesh.indices);
  return {
    contract: "architectural-interpretation-assembly-v1",
    id,
    role: "temporary-fixture",
    disclaimer: "Synthetic check.",
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
    placementRule: { source: "temporary-fixture", description: "Synthetic.", separationFeet: null, order: [id] },
    placements: [{ clusterId: id, rotation: IDENTITY_ROTATION, scale: [1, 1, 1], translation }],
    clusters: [body],
  };
}

const separatedQuads = quad(0, 0, 2, 2, 1);
const far = quad(6, 0, 8, 2, 1);
const farPositions = new Float32Array(separatedQuads.positions.length + far.positions.length);
farPositions.set(separatedQuads.positions, 0);
farPositions.set(far.positions, separatedQuads.positions.length);
const farIndices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
const farRegions = connectedRegions("far", "synthetic://far", farPositions, farIndices).filter((region) => region.facing === "up");
assert.equal(farRegions.length, 2, "coplanar pads that do not touch stay separate");

const joined = connectedRegions("joined", "synthetic://joined", joinedPads().positions, joinedPads().indices);
assert.equal(joined.filter((region) => region.facing === "up").length, 1, "edge-connected coplanar pads merge");

const corner = connectedRegions("corner", "synthetic://corner", floorAndWall().positions, floorAndWall().indices);
assert.equal(corner.filter((region) => region.facing === "up").length, 1);
assert.equal(corner.filter((region) => region.facing === "vertical").length, 1);

const stepped = readAssembly(request("stepped", steppedPads()));
assert.equal(stepped.generatesGeometry, false);
assert.ok(stepped.opportunities.some((item) => item.type === "stepped-landscape" && item.status === "candidate"));
assert.ok(stepped.opportunities.some((item) => item.type === "vertical-connection" && item.status === "rejected"));
assert.ok(stepped.opportunities.every((item) => item.type !== "mezzanine" || item.status === "rejected"));
assert.ok(stepped.opportunities.some((item) => item.type === "preserve" && item.status === "candidate"));

const control = loadControlBuilding();
const proximity = loadProximityBuilding();
assert.equal(control.placementRule.separationFeet, controlSeparationFeet());
assert.equal(control.placementRule.separationFeet, 20);
assert.deepEqual(control.placements[0].translation, [0, 0, 0]);
for (const placement of control.placements) {
  assert.equal(placement.translation[1], 0);
  assert.equal(placement.translation[2], 0);
  assert.deepEqual(placement.scale, [1, 1, 1]);
}
assert.equal(proximity.placementRule.separationFeet, null);
assert.equal(proximity.clusters.length, 3);
assert.deepEqual(proximity.clusters.map((item) => item.id), control.clusters.map((item) => item.id));
for (let index = 0; index < 3; index += 1) {
  assert.equal(control.clusters[index].meshFile, proximity.clusters[index].meshFile);
  assert.equal(control.clusters[index].positions.length, proximity.clusters[index].positions.length);
  assert.equal(control.clusters[index].positions[0], proximity.clusters[index].positions[0]);
  assert.equal(control.clusters[index].positions[2], proximity.clusters[index].positions[2]);
  const placement = proximity.placements[index];
  assert.deepEqual(placement.rotation, IDENTITY_ROTATION);
  assert.deepEqual(placement.scale, [1, 1, 1]);
  assert.equal(placement.translation[2], 0);
}
const anchor = centroid(proximity.clusters[0].positions, proximity.placements[0].translation);
for (let index = 1; index < 3; index += 1) {
  const center = centroid(proximity.clusters[index].positions, proximity.placements[index].translation);
  assert.ok(Math.abs(center[1] - anchor[1]) < 1e-3, "centroids share Y");
  const previous = proximity.clusters[index - 1];
  const current = proximity.clusters[index];
  const previousBounds = shifted(previous.positions, proximity.placements[index - 1].translation);
  const currentBounds = shifted(current.positions, proximity.placements[index].translation);
  const gap = currentBounds.min[0] - previousBounds.max[0];
  const rule = proximity.placementRule.pairGaps?.[index - 1];
  assert.ok(rule);
  assert.ok(Math.abs(gap - rule.feet) < 1e-3);
  assert.ok(gap > 0.5 && gap < 12, `proximity gap ${gap}`);
  assert.ok(previousBounds.max[0] < currentBounds.min[0]);
}

function centroid(positions: Float32Array, translation: Vec3): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (let index = 0; index < positions.length; index += 3) {
    x += positions[index];
    y += positions[index + 1];
    z += positions[index + 2];
    count += 1;
  }
  return [x / count + translation[0], y / count + translation[1], z / count + translation[2]];
}

function shifted(positions: Float32Array, translation: Vec3) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index] + translation[0]);
    maxX = Math.max(maxX, positions[index] + translation[0]);
    minZ = Math.min(minZ, positions[index + 2] + translation[2]);
  }
  assert.ok(Math.abs(minZ) < 1e-3);
  return { min: [minX], max: [maxX] };
}

const controlReading = readAssembly(control);
const proximityReading = readAssembly(proximity);
assert.equal(controlReading.generatesGeometry, false);
assert.equal(proximityReading.generatesGeometry, false);
assert.ok(controlReading.opportunities.every((item) => item.generatesGeometry === false));
for (const reading of [controlReading, proximityReading]) {
  for (const cluster of reading.analysis.sources) {
    const regions = reading.regions.filter((region) => region.clusterId === cluster.id);
    assert.ok(regions.length > 8, `${cluster.id} regions ${regions.length}`);
    const total = regions.reduce((sum, region) => sum + region.area, 0);
    const largest = Math.max(...regions.map((region) => region.area));
    assert.ok(largest < total * 0.75, `${cluster.id} collapsed into one region`);
    assert.ok(reading.opportunities.some((item) => item.clusterIds.includes(cluster.id) && item.type === "preserve" && item.status === "candidate"));
  }
  assert.ok(reading.opportunities.every((item) => item.type !== "mezzanine" || item.status === "rejected"));
  assert.ok(reading.opportunities.every((item) => item.type !== "multi-height-volume" || item.status === "rejected"));
  assert.ok(reading.opportunities.some((item) => item.id.endsWith(":corridor") && item.status === "rejected"));
}
assert.equal(controlReading.opportunities.filter((item) => item.type === "lateral-connection" && item.status === "candidate").length, 0);
assert.ok(proximityReading.opportunities.some((item) => item.type === "lateral-connection" && item.status === "candidate"));
const compared = compareReadings(controlReading, proximityReading);
assert.equal(compared.generatesGeometry, false);
assert.equal(compared.controlLateralCandidates, 0);
assert.ok(compared.proximityLateralCandidates >= 1);
assert.equal(compared.mezzanineCandidates, 0);
for (const relation of controlReading.relations.filter((item) => item.kind === "cross-cluster")) {
  assert.ok(Number(relation.measurements.planGapFeet) > 15, `control gap ${relation.measurements.planGapFeet}`);
}
for (const relation of proximityReading.relations.filter((item) => item.kind === "cross-cluster")) {
  const controlMatch = controlReading.relations.find((item) => item.kind === "cross-cluster" && item.clusterIds.join() === relation.clusterIds.join());
  assert.ok(controlMatch);
  assert.ok(Number(relation.measurements.planGapFeet) < Number(controlMatch.measurements.planGapFeet));
}

const lines = proximity.placementRule.pairGaps?.map((gap) => `${gap.from} → ${gap.to}: ${gap.feet.toFixed(2)} ft`).join("\n") ?? "";
console.log(lines);
console.log(`regions control ${controlReading.regions.length}, proximity ${proximityReading.regions.length}`);
for (const cluster of proximity.clusters) {
  const regions = proximityReading.regions.filter((region) => region.clusterId === cluster.id && region.facing === "up" && region.area >= 12);
  console.log(cluster.id, "up", regions.map((region) => `${region.area.toFixed(1)}@${region.centroid[2].toFixed(1)}`).join(", "));
}
console.log(proximityReading.relations.filter((item) => item.kind === "cross-cluster").map((item) => `${item.clusterIds.join(" / ")} gap ${item.measurements.planGapFeet}`).join("\n"));
console.log(controlReading.relations.filter((item) => item.kind === "cross-cluster").map((item) => `control ${item.clusterIds.join(" / ")} gap ${item.measurements.planGapFeet}`).join("\n"));
console.log(`relations control ${controlReading.relations.length}, proximity ${proximityReading.relations.length}`);
const summary = (reading: typeof proximityReading) => {
  const rows = new Map<string, number>();
  for (const item of reading.opportunities) rows.set(`${item.status}:${item.type}`, (rows.get(`${item.status}:${item.type}`) ?? 0) + 1);
  return [...rows.entries()].map(([key, count]) => `${key} ${count}`).join("\n");
};
console.log("CONTROL\n" + summary(controlReading));
console.log("PROXIMITY\n" + summary(proximityReading));
const sample = proximityReading.opportunities.filter((item) => item.status === "candidate" || item.type === "stepped-landscape" || item.type === "partial-platform" || item.type === "sheltered-overhang");
console.log(sample.map((item) => `${item.status} ${item.type} ${item.clusterIds.join("+")} ${JSON.stringify(item.measurements)} flags ${item.flags.join(",")}`).join("\n"));
console.log("milestone 2 checks passed");
