import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { filmWrapDistanceChunked } from "../lib/skill4/film-wrap";
import { loadPositionedCluster } from "../lib/skill5/network-void-assembly";

const catalogHash16 = createHash("sha256").update(readFileSync("data/skill4/final-clusters-catalog.json")).digest("hex").slice(0, 16);
const boxPositions = new Float32Array([
  0, 0, 0, 20, 0, 0, 20, 12, 0, 0, 12, 0,
  0, 0, 12, 20, 0, 12, 20, 12, 12, 0, 12, 12,
]);
const boxIndices = new Uint32Array([
  0, 2, 1, 0, 3, 2,
  4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4,
  1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6,
  3, 0, 4, 3, 4, 7,
]);

function run(label: string, meshes: { positions: Float32Array; indices: Uint32Array }[], cell: number, chunkCells: number) {
  const before = process.memoryUsage().heapUsed;
  const started = Date.now();
  const wrap = filmWrapDistanceChunked(meshes, cell, chunkCells);
  return {
    label,
    cell,
    ms: Date.now() - started,
    heapMb: Math.round((process.memoryUsage().heapUsed - before) / 1048576),
    chunks: wrap?.chunks ?? 0,
    triangles: wrap?.mesh.triangles ?? 0,
    openEdges: wrap?.openEdges ?? -1,
    degenerateEdges: wrap?.degenerateEdges ?? -1,
  };
}

const west = loadPositionedCluster("workspace-workspace", "workspace-workspace:0", { x: 0, y: 0, z: 0, rotationY: 0 });
const east = loadPositionedCluster("workspace-workspace", "workspace-workspace:0", { x: 28, y: 0, z: 0, rotationY: 0 });
const one = { positions: west.positions, indices: west.indices };
const two = [one, { positions: east.positions, indices: east.indices }];

function pointTriangle(p: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const d1 = ab.x * ap.x + ab.y * ap.y + ab.z * ap.z;
  const d2 = ac.x * ap.x + ac.y * ap.y + ac.z * ap.z;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(ap.x, ap.y, ap.z);
  const bp = { x: p.x - b.x, y: p.y - b.y, z: p.z - b.z };
  const d3 = ab.x * bp.x + ab.y * bp.y + ab.z * bp.z;
  const d4 = ac.x * bp.x + ac.y * bp.y + ac.z * bp.z;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bp.x, bp.y, bp.z);
  const cp = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
  const d5 = ab.x * cp.x + ab.y * cp.y + ab.z * cp.z;
  const d6 = ac.x * cp.x + ac.y * cp.y + ac.z * cp.z;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cp.x, cp.y, cp.z);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(a.x + ab.x * v - p.x, a.y + ab.y * v - p.y, a.z + ab.z * v - p.z);
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(a.x + ac.x * w - p.x, a.y + ac.y * w - p.y, a.z + ac.z * w - p.z);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(b.x + (c.x - b.x) * w - p.x, b.y + (c.y - b.y) * w - p.y, b.z + (c.z - b.z) * w - p.z);
  }
  const n = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  return Math.abs(ap.x * n.x + ap.y * n.y + ap.z * n.z) / length;
}

function deviation(mesh: { positions: Float32Array }, source: { positions: Float32Array; indices: Uint32Array }) {
  const samples = 240;
  const distances: number[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const index = Math.floor((sample + 0.5) * mesh.positions.length / 3 / samples) * 3;
    const point = { x: mesh.positions[index], y: mesh.positions[index + 1], z: mesh.positions[index + 2] };
    let best = 1e9;
    for (let triangle = 0; triangle < source.indices.length; triangle += 3) {
      const corner = (id: number) => ({ x: source.positions[id * 3], y: source.positions[id * 3 + 1], z: source.positions[id * 3 + 2] });
      const distance = pointTriangle(point, corner(source.indices[triangle]), corner(source.indices[triangle + 1]), corner(source.indices[triangle + 2]));
      if (distance < best) best = distance;
    }
    distances.push(best);
  }
  distances.sort((left, right) => left - right);
  const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  return { samples, meanFt: Number(mean.toFixed(3)), medianFt: Number(distances[Math.floor(distances.length / 2)].toFixed(3)), maxFt: Number(distances[distances.length - 1].toFixed(3)) };
}

const oneWrap = filmWrapDistanceChunked([one], 0.5, 96);
console.log(JSON.stringify({
  catalogHash16,
  box: run("box", [{ positions: boxPositions, indices: boxIndices }], 0.5, 16),
  oneCluster: run("one-cluster", [one], 0.5, 96),
  twoClusters: run("two-clusters", two, 0.5, 96),
  oneClusterDeviationFt: oneWrap ? deviation(oneWrap.mesh, one) : null,
}, null, 2));
