/**
 * Prototype patches for the two verified near-contact joints.
 * Does not rewrite compatibility data, cluster records, or the rigid solver.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateSpec } from "./envelope";
import { blendPatch, collectInterface, loftPatch, lowestVertexZ, measurePatch, poseAboveGround, posedMesh, type InterfaceSample } from "./patch";
import { loadArchetypeMeshes } from "./source";
import { readFileSync, existsSync } from "node:fs";
import type { ClusterRecord, Skill6Pose, Vec3 } from "./contract";

const CASES = [
  { id: "flat-self", hostId: "flat-deep-plan", guestId: "flat-deep-plan", spec: { yaw: 180, pitch: -40, roll: 0, axis: [-1, 0, 0] as Vec3, axisName: "-X", gap: 0.1, mirrorX: false } },
  { id: "flat-plate", hostId: "flat-deep-plan", guestId: "inserted-horizontal-plate", spec: { yaw: 180, pitch: 0, roll: 0, axis: [-1, 0, 0] as Vec3, axisName: "-X", gap: 0.1, mirrorX: false } },
];

function pack(samples: InterfaceSample[]) {
  return samples.filter((_, index) => index % Math.ceil(samples.length / 800) === 0).map((sample) => ({
    host: sample.host,
    guest: sample.guest,
    gap: sample.gap,
  }));
}

function meshJson(mesh: { positions: Float32Array; indices: Uint32Array } | null) {
  if (!mesh) return null;
  return { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) };
}

async function main() {
const meshes = loadArchetypeMeshes();
const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
const views: Record<string, unknown> = {};
const results = [];

for (const item of CASES) {
  const host = byId.get(item.hostId);
  const guest = byId.get(item.guestId);
  if (!host || !guest) throw new Error(`Missing ${item.id}`);
  const reading = validateSpec(host, guest, item.spec);
  if (!reading.accepted) throw new Error(`${item.id} is no longer an accepted joint`);
  const home: Skill6Pose = { basis: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
  const samples = collectInterface(host, guest, home, reading.pose);
  const hostLow = lowestVertexZ(host, home);
  const guestLow = lowestVertexZ(guest, reading.pose);
  const clusterLow = Math.min(hostLow, guestLow);
  const loft = loftPatch(samples);
  const blend = blendPatch(host, guest, home, reading.pose, samples);
  const loftMeasure = loft.mesh ? await measurePatch(host, guest, home, reading.pose, loft.mesh) : null;
  const blendMeasure = blend.mesh ? await measurePatch(host, guest, home, reading.pose, blend.mesh) : null;
  const center = samples.reduce<Vec3>((sum, sample) => [sum[0] + sample.host[0], sum[1] + sample.host[1], sum[2] + sample.host[2]], [0, 0, 0])
    .map((value) => value / Math.max(1, samples.length)) as Vec3;
  views[item.id] = {
    host: meshJson(posedMesh(host, home)),
    guest: meshJson(posedMesh(guest, reading.pose)),
    samples: pack(samples),
    center,
    loft: meshJson(loft.mesh),
    blend: meshJson(blend.mesh),
  };
  results.push({
    id: item.id,
    hostId: item.hostId,
    guestId: item.guestId,
    spec: item.spec,
    contactArea: reading.contactArea,
    residualGap: reading.residualGap,
    normalAlignment: reading.normalAlignment,
    deepestCrossing: reading.deepestCrossing,
    overlapVolume: reading.overlapVolume,
    samples: samples.length,
    ground: { hostLowestZ: hostLow, guestLowestZ: guestLow, clusterLowestZ: clusterLow, aboveGround: clusterLow >= 0, lift: poseAboveGround(reading.pose, clusterLow).translation[2] - reading.pose.translation[2] },
    loft: { build: { ...loft, mesh: undefined }, measure: loftMeasure },
    blend: { build: { ...blend, mesh: undefined }, measure: blendMeasure },
  });
  console.log(item.id, "samples", samples.length, "loft", loftMeasure?.oneSolid, loftMeasure?.hostOverlap, "blend", blendMeasure?.oneSolid, blendMeasure?.hostOverlap);
}

const coveragePath = path.join(process.cwd(), "data", "skill6", "coverage-v2.1.json");
let savedCluster: { id: string; lowestZ: number; tiles: number } | null = null;
if (existsSync(coveragePath)) {
  const report = JSON.parse(readFileSync(coveragePath, "utf8")) as { catalogClusters?: ClusterRecord[] };
  const cluster = report.catalogClusters?.find((item) => item.tiles.length === 7 && item.status === "accepted");
  if (cluster) {
    let lowest = Infinity;
    for (const tile of cluster.tiles) {
      const mesh = byId.get(tile.archetypeId);
      if (!mesh) continue;
      lowest = Math.min(lowest, lowestVertexZ(mesh, tile.pose));
    }
    savedCluster = { id: cluster.id, lowestZ: lowest, tiles: cluster.tiles.length };
  }
}

const output = {
  version: 1,
  algorithm: "localized-patch-prototype",
  groundRule: "Final geometry stays at Z >= 0. Horizontal growth is +X, -X, +Y, -Y. Stacking is +Z. A local downward seat is allowed only while the result remains on or above the ground. The 20-unit cell is not a placement grid.",
  results,
  savedClusterGround: savedCluster,
};
const directory = path.join(process.cwd(), "data", "skill6");
mkdirSync(directory, { recursive: true });
writeFileSync(path.join(directory, "patch-prototype.json"), JSON.stringify(output, null, 2));
const viewDirectory = path.join(process.env.TEMP ?? directory, "skill6-patch-views");
mkdirSync(viewDirectory, { recursive: true });
writeFileSync(path.join(viewDirectory, "views.json"), JSON.stringify(views));
console.log(path.join(viewDirectory, "views.json"));
console.log("patch prototype stored");
}

main();
