/**
 * Boolean volume and contact-span check for the two poses that survived
 * the triangle audit. Does not change the catalog or the thresholds.
 *
 * Run: npx tsx lib/skill6/compatibility-volume.ts
 */
import type { Mat3, Vec3 } from "./contract";
import { SKILL6_PARAMETERS } from "./contract";
import {
  add,
  applyBasis,
  applyPose,
  closestOnTriangle,
  cross,
  dot,
  length,
  multiplyBasis,
  poseWithBasis,
  queryHash,
  readTriangle,
  rotationAbout,
  scale,
  sub,
} from "./geometry";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

const CASES = [
  { host: "flat-deep-plan", guest: "inserted-horizontal-plate", yaw: 180, pitch: 0, roll: 0, axis: [-1, 0, 0] as Vec3, gap: 0.1 },
  { host: "flat-deep-plan", guest: "flat-deep-plan", yaw: 180, pitch: -40, roll: 0, axis: [-1, 0, 0] as Vec3, gap: 0.1 },
];

function euler(yaw: number, pitch: number, roll: number): Mat3 {
  return multiplyBasis(
    rotationAbout([0, 0, 1], yaw * Math.PI / 180),
    multiplyBasis(rotationAbout([1, 0, 0], pitch * Math.PI / 180), rotationAbout([0, 1, 0], roll * Math.PI / 180)),
  );
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

function centroids(mesh: ArchetypeMesh, target: number): Vec3[] {
  const stride = Math.max(1, Math.floor(mesh.triangles / target));
  const found: Vec3[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    found.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
  }
  return found;
}

function seat(host: ArchetypeMesh, guest: ArchetypeMesh, basis: Mat3, direction: Vec3, gap: number): Vec3 {
  const hostFront = percentile(centroids(host, 180).map((point) => dot(point, direction)), 0.9);
  const guestBack = percentile(centroids(guest, 180).map((point) => dot(applyBasis(basis, point), direction)), 0.1);
  return scale(direction, hostFront - guestBack + gap);
}

function spanOf(points: Vec3[]): Vec3 | null {
  if (points.length === 0) return null;
  const min: Vec3 = [...points[0]];
  const max: Vec3 = [...points[0]];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

function contact(host: ArchetypeMesh, guest: ArchetypeMesh, basis: Mat3, translation: Vec3) {
  const pose = poseWithBasis(0, false, basis, translation);
  const hits: Vec3[] = [];
  const stride = Math.max(1, Math.floor(guest.triangles / 2500));
  for (let triangle = 0; triangle < guest.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    const world = applyPose(pose, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    let best: { distance: number; normal: Vec3 } | null = null;
    for (const other of queryHash(host.hash, world, 0.7)) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const point = closestOnTriangle(world, d, e, f);
      const distance = length(sub(world, point));
      if (best && distance >= best.distance) continue;
      const normal = cross(sub(e, d), sub(f, d));
      const normalSpan = length(normal);
      best = { distance, normal: normalSpan > 1e-8 ? scale(normal, 1 / normalSpan) : [0, 0, 1] };
    }
    if (!best || best.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    if (dot(best.normal, applyBasis(basis, scale(raw, 1 / span))) > -0.5) continue;
    hits.push(world);
  }
  return { samples: hits.length, extent: spanOf(hits)?.map((value) => Math.round(value * 100) / 100) ?? null };
}

function posedPositions(mesh: ArchetypeMesh, basis: Mat3, translation: Vec3): Float32Array {
  const pose = poseWithBasis(0, false, basis, translation);
  const out = new Float32Array(mesh.positions.length);
  for (let vertex = 0; vertex < mesh.positions.length; vertex += 3) {
    const world = applyPose(pose, [mesh.positions[vertex], mesh.positions[vertex + 1], mesh.positions[vertex + 2]]);
    out[vertex] = world[0];
    out[vertex + 1] = world[1];
    out[vertex + 2] = world[2];
  }
  return out;
}

async function main() {
  const wasm = await (await import("manifold-3d/manifold")).default();
  wasm.setup();
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const rows = [];
  for (const item of CASES) {
    const host = byId.get(item.host);
    const guest = byId.get(item.guest);
    if (!host || !guest) continue;
    const basis = euler(item.yaw, item.pitch, item.roll);
    const translation = seat(host, guest, basis, item.axis, item.gap);
    const band = contact(host, guest, basis, translation);
    let volume: number | null = null;
    let status = "ok";
    try {
      const hostSolid = new wasm.Manifold(new wasm.Mesh({
        numProp: 3,
        vertProperties: host.positions,
        triVerts: host.indices,
      }));
      const guestSolid = new wasm.Manifold(new wasm.Mesh({
        numProp: 3,
        vertProperties: posedPositions(guest, basis, translation),
        triVerts: guest.indices,
      }));
      const overlap = hostSolid.intersect(guestSolid);
      volume = overlap.volume();
      hostSolid.delete();
      guestSolid.delete();
      overlap.delete();
    } catch (error) {
      status = error instanceof Error ? error.message : "manifold rejected the mesh";
    }
    rows.push({
      pair: `${item.host} × ${item.guest}`,
      pose: `${item.axis.join(",")} yaw ${item.yaw} pitch ${item.pitch} roll ${item.roll} gap ${item.gap}`,
      contactSamples: band.samples,
      contactExtent: band.extent,
      intersectionVolume: volume == null ? null : Math.round(volume * 1000) / 1000,
      manifold: status,
    });
  }
  console.log(JSON.stringify(rows, null, 2));
}

void main();
