/**
 * Dense geometric audit of poses the compatibility study marked as promising.
 * Does not change the catalog, the rule search, or the acceptance thresholds.
 *
 * Run: npx tsx lib/skill6/compatibility-audit.ts
 */
import type { Mat3, Vec3 } from "./contract";
import { SKILL6_PARAMETERS } from "./contract";
import {
  add,
  applyBasis,
  applyPose,
  closestOnTriangle,
  crossingPenetration,
  cross,
  dot,
  length,
  multiplyBasis,
  poseWithBasis,
  queryHash,
  rayHitsTriangle,
  readTriangle,
  rotationAbout,
  scale,
  sub,
} from "./geometry";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

type Sample = { point: Vec3; area: number };

const CASES = [
  { host: "flat-deep-plan", guest: "inserted-horizontal-plate", yaw: 180, pitch: 0, roll: 0, axis: [-1, 0, 0] as Vec3, gap: 0.1, label: "plate support" },
  { host: "flat-deep-plan", guest: "flat-deep-plan", yaw: 180, pitch: -40, roll: 0, axis: [-1, 0, 0] as Vec3, gap: 0.1, label: "flat self support" },
  { host: "vertical-void", guest: "open-hall", yaw: 0, pitch: 0, roll: 0, axis: [1, 0, 0] as Vec3, gap: -0.12, label: "void nest control" },
];

function euler(yaw: number, pitch: number, roll: number): Mat3 {
  const aboutZ = rotationAbout([0, 0, 1], yaw * Math.PI / 180);
  const aboutX = rotationAbout([1, 0, 0], pitch * Math.PI / 180);
  const aboutY = rotationAbout([0, 1, 0], roll * Math.PI / 180);
  return multiplyBasis(aboutZ, multiplyBasis(aboutX, aboutY));
}

function samples(mesh: ArchetypeMesh, target: number): Sample[] {
  const stride = Math.max(1, Math.floor(mesh.triangles / target));
  const found: Sample[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    found.push({
      point: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      area: span * 0.5,
    });
  }
  return found;
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

function seat(host: ArchetypeMesh, guest: ArchetypeMesh, basis: Mat3, direction: Vec3, gap: number): Vec3 {
  const hostSamples = samples(host, 180);
  const guestSamples = samples(guest, 180);
  const hostFront = percentile(hostSamples.map((sample) => dot(sample.point, direction)), 0.9);
  const guestBack = percentile(guestSamples.map((sample) => dot(applyBasis(basis, sample.point), direction)), 0.1);
  return scale(direction, hostFront - guestBack + gap);
}

function cellsForBox(hashCell: number, min: Vec3, max: Vec3): number[] {
  const found: number[] = [];
  const seen = new Set<number>();
  const lo = min.map((value) => Math.floor(value / hashCell));
  const hi = max.map((value) => Math.floor(value / hashCell));
  for (let x = lo[0]; x <= hi[0]; x += 1) {
    for (let y = lo[1]; y <= hi[1]; y += 1) {
      for (let z = lo[2]; z <= hi[2]; z += 1) {
        const key = (x + 2048) + (y + 2048) * 4096 + (z + 2048) * 4096 * 4096;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(key);
      }
    }
  }
  return found;
}

function trianglesInBox(host: ArchetypeMesh, min: Vec3, max: Vec3): number[] {
  const triangles: number[] = [];
  const seen = new Set<number>();
  for (const key of cellsForBox(host.hash.cell, min, max)) {
    const list = host.hash.buckets.get(key);
    if (!list) continue;
    for (const triangle of list) {
      if (seen.has(triangle)) continue;
      seen.add(triangle);
      triangles.push(triangle);
    }
  }
  return triangles;
}

function audit(host: ArchetypeMesh, guest: ArchetypeMesh, basis: Mat3, translation: Vec3) {
  const pose = poseWithBasis(0, false, basis, translation);
  let deep = 0;
  let any = 0;
  let deepest = 0;
  let tested = 0;
  const hostMax = host.tight.max[2];
  let inside = 0;
  let outside = 0;
  let vertexSamples = 0;
  const vertexStride = Math.max(1, Math.floor(guest.positions.length / 3 / 800));
  for (let vertex = 0; vertex < guest.positions.length / 3; vertex += vertexStride) {
    const local: Vec3 = [
      guest.positions[vertex * 3],
      guest.positions[vertex * 3 + 1],
      guest.positions[vertex * 3 + 2],
    ];
    const world = applyPose(pose, local);
    if (world[2] > hostMax + 0.05) {
      outside += 1;
      vertexSamples += 1;
      continue;
    }
    let hits = 0;
    const origin = world;
    const direction: Vec3 = [0, 0, 1];
    const z0 = Math.floor(origin[2] / host.hash.cell);
    const z1 = Math.floor((hostMax + host.hash.cell) / host.hash.cell);
    const seen = new Set<number>();
    for (let z = z0; z <= z1; z += 1) {
      const x = Math.floor(origin[0] / host.hash.cell);
      const y = Math.floor(origin[1] / host.hash.cell);
      const key = (x + 2048) + (y + 2048) * 4096 + (z + 2048) * 4096 * 4096;
      const list = host.hash.buckets.get(key);
      if (!list) continue;
      for (const triangle of list) {
        if (seen.has(triangle)) continue;
        seen.add(triangle);
        const [a, b, c] = readTriangle(host.positions, host.indices, triangle);
        if (rayHitsTriangle(origin, direction, a, b, c)) hits += 1;
      }
    }
    if (hits % 2 === 1) inside += 1;
    else outside += 1;
    vertexSamples += 1;
  }
  for (let triangle = 0; triangle < guest.triangles; triangle += 1) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const worldA = applyPose(pose, a);
    const worldB = applyPose(pose, b);
    const worldC = applyPose(pose, c);
    const min: Vec3 = [
      Math.min(worldA[0], worldB[0], worldC[0]) - 0.02,
      Math.min(worldA[1], worldB[1], worldC[1]) - 0.02,
      Math.min(worldA[2], worldB[2], worldC[2]) - 0.02,
    ];
    const max: Vec3 = [
      Math.max(worldA[0], worldB[0], worldC[0]) + 0.02,
      Math.max(worldA[1], worldB[1], worldC[1]) + 0.02,
      Math.max(worldA[2], worldB[2], worldC[2]) + 0.02,
    ];
    for (const other of trianglesInBox(host, min, max)) {
      tested += 1;
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const depth = crossingPenetration(worldA, worldB, worldC, d, e, f);
      if (depth <= 1e-4) continue;
      any += 1;
      if (depth > deepest) deepest = depth;
      if (depth > SKILL6_PARAMETERS.maxPenetration) deep += 1;
      if (deep >= 80) return { deep, any, deepest, tested, inside, outside, vertexSamples, truncated: true };
    }
  }
  let minDistance = Infinity;
  let nearArea = 0;
  const stride = Math.max(1, Math.floor(guest.triangles / 1200));
  for (let triangle = 0; triangle < guest.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const center = applyPose(pose, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    for (const other of queryHash(host.hash, center, 1.4)) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const point = closestOnTriangle(center, d, e, f);
      const distance = length(sub(center, point));
      if (distance < minDistance) minDistance = distance;
      if (distance <= SKILL6_PARAMETERS.contactTolerance) {
        nearArea += length(cross(sub(b, a), sub(c, a))) * 0.5 * stride;
      }
    }
  }
  return {
    deep,
    any,
    deepest: Math.round(deepest * 1000) / 1000,
    tested,
    inside,
    outside,
    vertexSamples,
    truncated: false,
    minDistance: Number.isFinite(minDistance) ? Math.round(minDistance * 1000) / 1000 : null,
    nearArea: Math.round(nearArea * 100) / 100,
  };
}

const meshes = loadArchetypeMeshes();
const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
const started = Date.now();
const rows = CASES.map((item) => {
  const host = byId.get(item.host);
  const guest = byId.get(item.guest);
  if (!host || !guest) return { label: item.label, missing: true };
  const basis = euler(item.yaw, item.pitch, item.roll);
  const translation = seat(host, guest, basis, item.axis, item.gap);
  const mark = Date.now();
  const result = audit(host, guest, basis, translation);
  return {
    label: item.label,
    pair: `${item.host} × ${item.guest}`,
    hostTriangles: host.triangles,
    guestTriangles: guest.triangles,
    seconds: Math.round((Date.now() - mark) / 1000),
    ...result,
  };
});
console.log(JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), rows }, null, 2));
