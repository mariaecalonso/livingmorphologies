/**
 * Prototype local patches for a measured near-contact.
 * The rigid pose and the source meshes stay unchanged.
 */
import { SKILL6_PARAMETERS, type Skill6Pose, type Vec3 } from "./contract";
import {
  add,
  applyBasis,
  applyPose,
  closestOnTriangle,
  cross,
  dist,
  dot,
  hashTriangles,
  invertPose,
  length,
  normalize,
  queryHash,
  readTriangle,
  scale,
  sub,
  crossingPenetration,
} from "./geometry";
import type { ArchetypeMesh } from "./source";
import { placeSolid } from "./world-solid";

export type InterfaceSample = { host: Vec3; guest: Vec3; gap: number; area: number };

export type PatchMesh = {
  positions: Float32Array;
  indices: Uint32Array;
};

export type PatchBuild = {
  method: "surface-loft" | "implicit-blend";
  mesh: PatchMesh | null;
  milliseconds: number;
  samples: number;
  note: string;
};

const HOME: Skill6Pose = { quarterZ: 0, mirrorX: false, basis: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };

export function lowestVertexZ(mesh: ArchetypeMesh, pose: Skill6Pose): number {
  let lowest = Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const world = applyPose(pose, [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]]);
    if (world[2] < lowest) lowest = world[2];
  }
  return lowest;
}

/** A rigid lift. Downward seating stops at the ground plane. */
export function poseAboveGround(pose: Skill6Pose, lowestZ: number): Skill6Pose {
  if (lowestZ >= 0) return pose;
  return { ...pose, translation: [pose.translation[0], pose.translation[1], pose.translation[2] - lowestZ] };
}

/** `regionMinArea` keeps every contact region at or above that area. Without it, only the largest region is kept. */
export function collectInterface(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose, regionMinArea?: number): InterfaceSample[] {
  const hits: InterfaceSample[] = [];
  const stride = Math.max(1, Math.floor(guest.triangles / 4000));
  for (let triangle = 0; triangle < guest.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    const world = applyPose(guestPose, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    const local = invertPose(hostPose, world);
    const triangles = queryHash(host.hash, local, 0.7);
    let best: { distance: number; point: Vec3; normal: Vec3 } | null = null;
    for (const other of triangles) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const point = closestOnTriangle(local, d, e, f);
      const distance = length(sub(local, point));
      if (best && distance >= best.distance) continue;
      const face = cross(sub(e, d), sub(f, d));
      const faceSpan = length(face);
      best = { distance, point, normal: faceSpan > 1e-8 ? scale(face, 1 / faceSpan) : [0, 0, 1] };
    }
    if (!best || best.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const guestNormal = applyBasis(guestPose.basis, scale(raw, 1 / span));
    const hostNormal = applyBasis(hostPose.basis, best.normal);
    if (dot(hostNormal, guestNormal) > -0.5) continue;
    hits.push({ host: applyPose(hostPose, best.point), guest: world, gap: best.distance, area: span * 0.5 * stride });
  }
  return largestRegion(hits, regionMinArea);
}

function largestRegion(hits: InterfaceSample[], minArea?: number): InterfaceSample[] {
  if (hits.length === 0) return [];
  const parent = hits.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  const nearest = hits.map(() => Infinity);
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      const span = dist(hits[left].guest, hits[right].guest);
      if (span < nearest[left]) nearest[left] = span;
      if (span < nearest[right]) nearest[right] = span;
    }
  }
  const finite = nearest.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const reach = Math.max(1.6, (finite[Math.floor(finite.length / 2)] ?? 1.6) * 1.45);
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      if (dist(hits[left].guest, hits[right].guest) <= reach) parent[find(right)] = find(left);
    }
  }
  const groups = new Map<number, InterfaceSample[]>();
  hits.forEach((hit, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(hit);
    groups.set(root, group);
  });
  if (minArea !== undefined) {
    return [...groups.values()].filter((group) => group.reduce((total, hit) => total + hit.area, 0) >= minArea).flat();
  }
  let best: InterfaceSample[] = [];
  let area = 0;
  for (const group of groups.values()) {
    const sum = group.reduce((total, hit) => total + hit.area, 0);
    if (sum > area) {
      area = sum;
      best = group;
    }
  }
  return best;
}

function pushTriangle(positions: number[], indices: number[], a: Vec3, b: Vec3, c: Vec3) {
  const area = length(cross(sub(b, a), sub(c, a)));
  if (area < 1e-5) return;
  const start = positions.length / 3;
  positions.push(...a, ...b, ...c);
  indices.push(start, start + 1, start + 2);
}

function quad(positions: number[], indices: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  pushTriangle(positions, indices, a, b, c);
  pushTriangle(positions, indices, a, c, d);
}

type Bin = { i: number; j: number; host: Vec3; guest: Vec3; count: number };

/** A slab between the two measured surfaces, inset slightly into each mesh. */
export function loftPatch(samples: readonly InterfaceSample[], inset = 0.06): PatchBuild {
  const started = Date.now();
  if (samples.length < 4) {
    return { method: "surface-loft", mesh: null, milliseconds: Date.now() - started, samples: samples.length, note: "The contact region has too few samples to loft." };
  }
  const gap = normalize(samples.reduce<Vec3>((sum, sample) => add(sum, sub(sample.guest, sample.host)), [0, 0, 0]));
  const helper: Vec3 = Math.abs(gap[2]) < 0.85 ? [0, 0, 1] : [1, 0, 0];
  const tangentU = normalize(cross(helper, gap));
  const tangentV = normalize(cross(gap, tangentU));
  const projected = samples.map((sample) => ({
    sample,
    u: dot(sample.host, tangentU),
    v: dot(sample.host, tangentV),
  }));
  const spacing = projected.map((item) => {
    let nearest = Infinity;
    for (const other of projected) {
      if (other === item) continue;
      nearest = Math.min(nearest, Math.hypot(item.u - other.u, item.v - other.v));
    }
    return nearest;
  }).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const cell = Math.max(0.35, (spacing[Math.floor(spacing.length / 2)] ?? 0.5) * 1.35);
  const bins = new Map<string, Bin>();
  for (const item of projected) {
    const i = Math.round(item.u / cell);
    const j = Math.round(item.v / cell);
    const key = `${i}:${j}`;
    const bin = bins.get(key) ?? { i, j, host: [0, 0, 0], guest: [0, 0, 0], count: 0 };
    bin.host = add(bin.host, item.sample.host);
    bin.guest = add(bin.guest, item.sample.guest);
    bin.count += 1;
    bins.set(key, bin);
  }
  const occupied = new Map<string, { host: Vec3; guest: Vec3 }>();
  for (const bin of bins.values()) {
    const host = scale(bin.host, 1 / bin.count);
    const guest = scale(bin.guest, 1 / bin.count);
    const direction = normalize(sub(guest, host));
    occupied.set(`${bin.i}:${bin.j}`, {
      host: sub(host, scale(direction, inset)),
      guest: add(guest, scale(direction, inset)),
    });
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const at = (i: number, j: number) => occupied.get(`${i}:${j}`);
  let cells = 0;
  for (const bin of bins.values()) {
    const a = at(bin.i, bin.j);
    const b = at(bin.i + 1, bin.j);
    const c = at(bin.i + 1, bin.j + 1);
    const d = at(bin.i, bin.j + 1);
    if (!a || !b || !c || !d) continue;
    cells += 1;
    quad(positions, indices, a.host, d.host, c.host, b.host);
    quad(positions, indices, a.guest, b.guest, c.guest, d.guest);
  }
  const cellAt = (i: number, j: number) => Boolean(at(i, j) && at(i + 1, j) && at(i + 1, j + 1) && at(i, j + 1));
  const wall = (a: { host: Vec3; guest: Vec3 }, b: { host: Vec3; guest: Vec3 }) => {
    quad(positions, indices, a.host, b.host, b.guest, a.guest);
  };
  for (const bin of bins.values()) {
    if (!cellAt(bin.i, bin.j)) continue;
    const a = at(bin.i, bin.j)!;
    const b = at(bin.i + 1, bin.j)!;
    const c = at(bin.i + 1, bin.j + 1)!;
    const d = at(bin.i, bin.j + 1)!;
    if (!cellAt(bin.i, bin.j - 1)) wall(a, b);
    if (!cellAt(bin.i, bin.j + 1)) wall(c, d);
    if (!cellAt(bin.i - 1, bin.j)) wall(d, a);
    if (!cellAt(bin.i + 1, bin.j)) wall(b, c);
  }
  if (cells === 0) {
    return { method: "surface-loft", mesh: null, milliseconds: Date.now() - started, samples: samples.length, note: "The contact samples do not form a continuous surface grid." };
  }
  return {
    method: "surface-loft",
    mesh: weldMesh({ positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }),
    milliseconds: Date.now() - started,
    samples: samples.length,
    note: `${cells} surface cells, inset ${inset}, vertices welded.`,
  };
}

export function weldMesh(mesh: PatchMesh, tolerance = 1e-4): PatchMesh {
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap: number[] = [];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const key = [0, 1, 2].map((axis) => Math.round(mesh.positions[index + axis] / tolerance)).join(":");
    let id = map.get(key);
    if (id == null) {
      id = positions.length / 3;
      map.set(key, id);
      positions.push(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
    }
    remap.push(id);
  }
  const indices: number[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = remap[mesh.indices[index]];
    const b = remap[mesh.indices[index + 1]];
    const c = remap[mesh.indices[index + 2]];
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

function smoothMin(a: number, b: number, radius: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / radius));
  return a * h + b * (1 - h) - radius * h * (1 - h);
}

function signedDistance(mesh: ArchetypeMesh, pose: Skill6Pose, world: Vec3): number {
  const local = invertPose(pose, world);
  let triangles = queryHash(mesh.hash, local, 0.9);
  if (triangles.length === 0) triangles = queryHash(mesh.hash, local, 2.4);
  let best = Infinity;
  let sign = 1;
  for (const triangle of triangles) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    const point = closestOnTriangle(local, a, b, c);
    const distance = length(sub(local, point));
    if (distance >= best) continue;
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    const normal = span > 1e-8 ? scale(raw, 1 / span) : [0, 0, 1] as Vec3;
    best = distance;
    sign = dot(sub(local, point), normal) >= 0 ? 1 : -1;
  }
  return Number.isFinite(best) ? sign * best : 4;
}

/** `largestOnly` keeps the single connected voxel body that forms the bridge and drops detached islands. */
export type BlendSettings = { radius?: number; cell?: number; maxCells?: number; largestOnly?: boolean; spacingReach?: boolean; bodyFraction?: number };

/** Median distance from each footprint point to its nearest neighbour. */
function footprintSpacing(points: readonly Vec3[]): number {
  if (points.length < 2) return 0;
  const nearest = points.map((point, index) => {
    let best = Infinity;
    for (let other = 0; other < points.length; other += 1) if (other !== index) best = Math.min(best, dist(point, points[other]));
    return best;
  });
  nearest.sort((left, right) => left - right);
  return nearest[Math.floor(nearest.length / 2)];
}

/** Smooth blend of the two signed distances, limited to the measured contact footprint. */
export function blendPatch(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose, samples: readonly InterfaceSample[], settings: BlendSettings = {}): PatchBuild {
  const started = Date.now();
  if (samples.length < 4) {
    return { method: "implicit-blend", mesh: null, milliseconds: Date.now() - started, samples: samples.length, note: "The contact region has too few samples to blend." };
  }
  const residual = samples.reduce((max, sample) => Math.max(max, sample.gap), 0);
  const radius = settings.radius ?? Math.max(0.42, residual * 2.5);
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const sample of samples) {
    for (const point of [sample.host, sample.guest]) {
      min = [Math.min(min[0], point[0]), Math.min(min[1], point[1]), Math.min(min[2], point[2])];
      max = [Math.max(max[0], point[0]), Math.max(max[1], point[1]), Math.max(max[2], point[2])];
    }
  }
  const footprint = samples.map((sample) => scale(add(sample.host, sample.guest), 0.5));
  const reach = settings.spacingReach ? Math.max(radius * 0.65, footprintSpacing(footprint) * 0.75) : radius * 0.65;
  const pad = reach + radius * 0.35 + 0.2;
  min = [min[0] - pad, min[1] - pad, min[2] - pad];
  max = [max[0] + pad, max[1] + pad, max[2] + pad];
  const cell = settings.cell ?? 0.22;
  const cap = settings.maxCells ?? 72;
  const nx = Math.min(cap, Math.max(8, Math.ceil((max[0] - min[0]) / cell)));
  const ny = Math.min(cap, Math.max(8, Math.ceil((max[1] - min[1]) / cell)));
  const nz = Math.min(cap, Math.max(8, Math.ceil((max[2] - min[2]) / cell)));
  const field = new Float32Array(nx * ny * nz);
  const at = (x: number, y: number, z: number) => field[x + nx * (y + ny * z)];
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const world: Vec3 = [min[0] + x * cell, min[1] + y * cell, min[2] + z * cell];
        let nearest = Infinity;
        for (const sample of footprint) nearest = Math.min(nearest, dist(world, sample));
        const index = x + nx * (y + ny * z);
        if (nearest > reach + radius * 0.35 + cell) {
          field[index] = 1;
          continue;
        }
        const blended = smoothMin(signedDistance(host, hostPose, world), signedDistance(guest, guestPose, world), radius);
        const fade = Math.max(0, nearest - reach);
        field[index] = blended + fade;
      }
    }
  }
  const mesh = voxelizeField(field, nx, ny, nz, min, cell, at, settings.largestOnly ?? false, settings.bodyFraction ?? 1);
  return {
    method: "implicit-blend",
    mesh,
    milliseconds: Date.now() - started,
    samples: samples.length,
    note: mesh ? `Voxelized blend, radius ${radius.toFixed(2)}, grid ${nx}×${ny}×${nz}, cell ${cell}${settings.largestOnly ? ", largest body only" : ""}.` : "The blend field did not cross zero inside the contact footprint.",
  };
}

function voxelizeField(
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  origin: Vec3,
  cell: number,
  at: (x: number, y: number, z: number) => number,
  largestOnly: boolean,
  bodyFraction: number,
): PatchMesh | null {
  const vx = nx - 1;
  const vy = ny - 1;
  const vz = nz - 1;
  const solid = new Uint8Array(vx * vy * vz);
  for (let z = 0; z < vz; z += 1) {
    for (let y = 0; y < vy; y += 1) {
      for (let x = 0; x < vx; x += 1) {
        let sum = 0;
        for (let dz = 0; dz < 2; dz += 1) {
          for (let dy = 0; dy < 2; dy += 1) {
            for (let dx = 0; dx < 2; dx += 1) sum += at(x + dx, y + dy, z + dz);
          }
        }
        if (sum < 0) solid[x + vx * (y + vy * z)] = 1;
      }
    }
  }
  if (largestOnly) {
    const label = new Int32Array(solid.length).fill(-1);
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let start = 0; start < solid.length; start += 1) {
      if (!solid[start] || label[start] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      label[start] = id;
      stack.push(start);
      while (stack.length) {
        const index = stack.pop() as number;
        size += 1;
        const x = index % vx;
        const y = Math.floor(index / vx) % vy;
        const z = Math.floor(index / (vx * vy));
        const next = [x > 0 ? index - 1 : -1, x < vx - 1 ? index + 1 : -1, y > 0 ? index - vx : -1, y < vy - 1 ? index + vx : -1, z > 0 ? index - vx * vy : -1, z < vz - 1 ? index + vx * vy : -1];
        for (const neighbor of next) {
          if (neighbor < 0 || !solid[neighbor] || label[neighbor] >= 0) continue;
          label[neighbor] = id;
          stack.push(neighbor);
        }
      }
      sizes.push(size);
    }
    const largest = Math.max(...sizes, 0);
    const keep = sizes.map((size) => size >= largest * bodyFraction);
    for (let index = 0; index < solid.length; index += 1) if (label[index] < 0 || !keep[label[index]]) solid[index] = 0;
  }
  const inside = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= vx || y >= vy || z >= vz) return false;
    return solid[x + vx * (y + vy * z)] === 1;
  };
  const positions: number[] = [];
  const ids = new Map<string, number>();
  const vertex = (x: number, y: number, z: number) => {
    const key = `${x}:${y}:${z}`;
    const found = ids.get(key);
    if (found != null) return found;
    const id = positions.length / 3;
    ids.set(key, id);
    positions.push(origin[0] + x * cell, origin[1] + y * cell, origin[2] + z * cell);
    return id;
  };
  const indices: number[] = [];
  const face = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  for (let z = 0; z < nz - 1; z += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
        if (!inside(x, y, z)) continue;
        if (!inside(x - 1, y, z)) face(vertex(x, y, z), vertex(x, y, z + 1), vertex(x, y + 1, z + 1), vertex(x, y + 1, z));
        if (!inside(x + 1, y, z)) face(vertex(x + 1, y, z), vertex(x + 1, y + 1, z), vertex(x + 1, y + 1, z + 1), vertex(x + 1, y, z + 1));
        if (!inside(x, y - 1, z)) face(vertex(x, y, z), vertex(x + 1, y, z), vertex(x + 1, y, z + 1), vertex(x, y, z + 1));
        if (!inside(x, y + 1, z)) face(vertex(x, y + 1, z), vertex(x, y + 1, z + 1), vertex(x + 1, y + 1, z + 1), vertex(x + 1, y + 1, z));
        if (!inside(x, y, z - 1)) face(vertex(x, y, z), vertex(x, y + 1, z), vertex(x + 1, y + 1, z), vertex(x + 1, y, z));
        if (!inside(x, y, z + 1)) face(vertex(x, y, z + 1), vertex(x + 1, y, z + 1), vertex(x + 1, y + 1, z + 1), vertex(x, y + 1, z + 1));
      }
    }
  }
  if (indices.length === 0) return null;
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

function surfaceNets(
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  origin: Vec3,
  cell: number,
  at: (x: number, y: number, z: number) => number,
): PatchMesh | null {
  const cellsX = nx - 1;
  const cellsY = ny - 1;
  const cellsZ = nz - 1;
  const vert = new Int32Array(cellsX * cellsY * cellsZ).fill(-1);
  const positions: number[] = [];
  const cellIndex = (x: number, y: number, z: number) => x + cellsX * (y + cellsY * z);
  const corner: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < cellsZ; z += 1) {
    for (let y = 0; y < cellsY; y += 1) {
      for (let x = 0; x < cellsX; x += 1) {
        const values = corner.map(([cx, cy, cz]) => at(x + cx, y + cy, z + cz));
        if (values.every((value) => value > 0) || values.every((value) => value <= 0)) continue;
        const accumulated: Vec3 = [0, 0, 0];
        let crossings = 0;
        for (const [left, right] of edges) {
          const a = values[left];
          const b = values[right];
          if (a > 0 === b > 0) continue;
          const t = a / (a - b);
          const p = corner[left];
          const q = corner[right];
          accumulated[0] += origin[0] + (x + p[0] + (q[0] - p[0]) * t) * cell;
          accumulated[1] += origin[1] + (y + p[1] + (q[1] - p[1]) * t) * cell;
          accumulated[2] += origin[2] + (z + p[2] + (q[2] - p[2]) * t) * cell;
          crossings += 1;
        }
        if (crossings === 0) continue;
        vert[cellIndex(x, y, z)] = positions.length / 3;
        positions.push(accumulated[0] / crossings, accumulated[1] / crossings, accumulated[2] / crossings);
      }
    }
  }
  const indices: number[] = [];
  const emit = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    indices.push(a, b, c, a, c, d);
  };
  const id = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= cellsX || y >= cellsY || z >= cellsZ) ? -1 : vert[cellIndex(x, y, z)];
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
        if (at(x, y, z) > 0 === at(x + 1, y, z) > 0) continue;
        emit(id(x, y - 1, z - 1), id(x, y, z - 1), id(x, y, z), id(x, y - 1, z));
      }
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (at(x, y, z) > 0 === at(x, y + 1, z) > 0) continue;
        emit(id(x - 1, y, z - 1), id(x - 1, y, z), id(x, y, z), id(x, y, z - 1));
      }
    }
  }
  for (let z = 0; z < nz - 1; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (at(x, y, z) > 0 === at(x, y, z + 1) > 0) continue;
        emit(id(x - 1, y - 1, z), id(x, y - 1, z), id(x, y, z), id(x - 1, y, z));
      }
    }
  }
  if (indices.length === 0) return null;
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

export type PatchMeasure = {
  triangles: number;
  area: number;
  volume: number | null;
  thickness: number | null;
  extent: Vec3;
  min: Vec3;
  lowestZ: number;
  patchStatus: string;
  hostOverlap: number | null;
  guestOverlap: number | null;
  joinedStatus: string;
  /** Solid bodies only. Sealed cavity shells are counted in `joinedCavities`. */
  joinedComponents: number | null;
  joinedCavities: number | null;
  joinedVolume: number | null;
  hostVolume: number | null;
  guestVolume: number | null;
  selfIntersections: number;
  joinsBoth: boolean;
  oneSolid: boolean;
  milliseconds: number;
};

function boundsOf(mesh: PatchMesh): { min: Vec3; max: Vec3; extent: Vec3; lowestZ: number } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], mesh.positions[index + axis]);
      max[axis] = Math.max(max[axis], mesh.positions[index + axis]);
    }
  }
  return { min, max, extent: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], lowestZ: min[2] };
}

function surfaceArea(mesh: PatchMesh): number {
  let area = 0;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index];
    const b = mesh.indices[index + 1];
    const c = mesh.indices[index + 2];
    const pa: Vec3 = [mesh.positions[a * 3], mesh.positions[a * 3 + 1], mesh.positions[a * 3 + 2]];
    const pb: Vec3 = [mesh.positions[b * 3], mesh.positions[b * 3 + 1], mesh.positions[b * 3 + 2]];
    const pc: Vec3 = [mesh.positions[c * 3], mesh.positions[c * 3 + 1], mesh.positions[c * 3 + 2]];
    area += length(cross(sub(pb, pa), sub(pc, pa))) * 0.5;
  }
  return area;
}

function selfIntersections(mesh: PatchMesh): number {
  const hash = hashTriangles(mesh.positions, mesh.indices, mesh.indices.length / 3, 0.45);
  let count = 0;
  const adjacent = new Set<string>();
  const edges = new Map<string, number[]>();
  for (let triangle = 0; triangle < mesh.indices.length / 3; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const key = [ids[edge], ids[(edge + 1) % 3]].sort((left, right) => left - right).join(":");
      const list = edges.get(key) ?? [];
      list.push(triangle);
      edges.set(key, list);
    }
  }
  for (const list of edges.values()) {
    for (const left of list) for (const right of list) adjacent.add(`${left}:${right}`);
  }
  for (let triangle = 0; triangle < mesh.indices.length / 3; triangle += 1) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    const min: Vec3 = [Math.min(a[0], b[0], c[0]) - 0.02, Math.min(a[1], b[1], c[1]) - 0.02, Math.min(a[2], b[2], c[2]) - 0.02];
    const max: Vec3 = [Math.max(a[0], b[0], c[0]) + 0.02, Math.max(a[1], b[1], c[1]) + 0.02, Math.max(a[2], b[2], c[2]) + 0.02];
    const lo = min.map((value) => Math.floor(value / hash.cell));
    const hi = max.map((value) => Math.floor(value / hash.cell));
    const seen = new Set<number>();
    for (let x = lo[0]; x <= hi[0]; x += 1) {
      for (let y = lo[1]; y <= hi[1]; y += 1) {
        for (let z = lo[2]; z <= hi[2]; z += 1) {
          const list = hash.buckets.get((x + 2048) + (y + 2048) * 4096 + (z + 2048) * 4096 * 4096);
          if (!list) continue;
          for (const other of list) {
            if (other <= triangle || seen.has(other) || adjacent.has(`${triangle}:${other}`)) continue;
            seen.add(other);
            const [d, e, f] = readTriangle(mesh.positions, mesh.indices, other);
            if (crossingPenetration(a, b, c, d, e, f) > 0.02) count += 1;
          }
        }
      }
    }
  }
  return count;
}

type ManifoldLike = {
  volume: () => number;
  status: () => string;
  intersect: (other: ManifoldLike) => ManifoldLike;
  add: (other: ManifoldLike) => ManifoldLike;
  decompose: () => ManifoldLike[];
  delete: () => void;
};

type ManifoldKernel = { Manifold: new (mesh: unknown) => ManifoldLike; Mesh: new (mesh: unknown) => unknown; setup: () => void };

let manifoldWasm: Promise<ManifoldKernel> | null = null;

function loadManifold(): Promise<ManifoldKernel> {
  manifoldWasm ??= (async () => {
    const wasm = await (await import("manifold-3d/manifold")).default();
    wasm.setup();
    return wasm as unknown as ManifoldKernel;
  })();
  return manifoldWasm;
}

/** `decompose` also returns the inner shell of a sealed cavity. Bodies have positive volume; cavities negative. */
/** Shells under 0.001 in volume are flattened pockets. They count as neither a body nor a cavity. */
function shellsOf(solid: ManifoldLike): { bodies: number; cavities: number } {
  let bodies = 0;
  let cavities = 0;
  for (const piece of solid.decompose()) {
    const volume = piece.volume();
    if (volume >= 1e-3) bodies += 1;
    else if (volume <= -1e-3) cavities += 1;
    piece.delete();
  }
  return { bodies, cavities };
}

function outwardMesh(mesh: PatchMesh): PatchMesh {
  const indices = new Uint32Array(mesh.indices);
  for (let index = 0; index < indices.length; index += 3) {
    const swap = indices[index + 1];
    indices[index + 1] = indices[index + 2];
    indices[index + 2] = swap;
  }
  return { positions: mesh.positions, indices };
}

async function asManifold(mesh: PatchMesh): Promise<{ solid: ManifoldLike; status: string; mesh: PatchMesh }> {
  const wasm = await loadManifold();
  let solid = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
  let status = solid.status();
  let current = mesh;
  if (status === "NoError" && solid.volume() < 0) {
    solid.delete();
    current = outwardMesh(mesh);
    solid = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: current.positions, triVerts: current.indices }));
    status = solid.status();
  }
  return { solid, status, mesh: current };
}

export async function measurePatch(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose, patch: PatchMesh): Promise<PatchMeasure> {
  const started = Date.now();
  const box = boundsOf(patch);
  const area = surfaceArea(patch);
  const crossings = selfIntersections(patch);
  const hostSolid = placeSolid(host, hostPose);
  const guestSolid = placeSolid(guest, guestPose);
  let hostOverlap: number | null = null;
  let guestOverlap: number | null = null;
  let volume: number | null = null;
  let joinedStatus = "not-run";
  let joinedComponents: number | null = null;
  let joinedCavities: number | null = null;
  let joinedVolume: number | null = null;
  let hostVolume: number | null = null;
  let guestVolume: number | null = null;
  let patchStatus = "not-run";
  try {
    const built = await asManifold(patch);
    patchStatus = built.status;
    if (built.status !== "NoError") {
      built.solid.delete();
      throw new Error(built.status);
    }
    volume = Math.abs(built.solid.volume());
    const hostManifold = await asManifold({ positions: hostSolid.positions, indices: hostSolid.indices });
    const guestManifold = await asManifold({ positions: guestSolid.positions, indices: guestSolid.indices });
    hostVolume = hostManifold.solid.volume();
    guestVolume = guestManifold.solid.volume();
    hostOverlap = Math.abs(built.solid.intersect(hostManifold.solid).volume());
    guestOverlap = Math.abs(built.solid.intersect(guestManifold.solid).volume());
    const joined = hostManifold.solid.add(built.solid).add(guestManifold.solid);
    joinedStatus = joined.status();
    joinedVolume = Math.abs(joined.volume());
    const shells = shellsOf(joined);
    joinedComponents = shells.bodies;
    joinedCavities = shells.cavities;
    built.solid.delete();
    hostManifold.solid.delete();
    guestManifold.solid.delete();
    joined.delete();
  } catch (error) {
    patchStatus = error instanceof Error ? error.message : "manifold rejected the patch";
  }
  const thickness = volume != null && area > 1e-6 ? Math.abs(volume) / (area * 0.5) : null;
  const joinsBoth = (hostOverlap ?? 0) > 0.02 && (guestOverlap ?? 0) > 0.02;
  return {
    triangles: patch.indices.length / 3,
    area,
    volume,
    thickness,
    extent: box.extent,
    min: box.min,
    lowestZ: box.lowestZ,
    patchStatus,
    hostOverlap,
    guestOverlap,
    joinedStatus,
    joinedComponents,
    joinedCavities,
    joinedVolume,
    hostVolume,
    guestVolume,
    selfIntersections: crossings,
    joinsBoth,
    oneSolid: joinsBoth && joinedComponents === 1 && joinedStatus === "NoError",
    milliseconds: Date.now() - started,
  };
}

export function posedMesh(mesh: ArchetypeMesh, pose: Skill6Pose): PatchMesh {
  const solid = placeSolid(mesh, pose);
  return { positions: solid.positions, indices: solid.indices };
}

/** One Z translation for every part. Relative poses stay as they were. */
export function groundLift(meshes: readonly PatchMesh[]): number {
  let lowest = Infinity;
  for (const mesh of meshes) {
    for (let index = 2; index < mesh.positions.length; index += 3) lowest = Math.min(lowest, mesh.positions[index]);
  }
  return Number.isFinite(lowest) ? -lowest : 0;
}

export function translateMesh(mesh: PatchMesh, z: number): PatchMesh {
  const positions = new Float32Array(mesh.positions);
  for (let index = 2; index < positions.length; index += 3) positions[index] += z;
  return { positions, indices: mesh.indices };
}

export function elevatePose(pose: Skill6Pose, lift: number): Skill6Pose {
  return { ...pose, translation: [pose.translation[0], pose.translation[1], pose.translation[2] + lift] };
}

export async function joinedAssembly(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose, patch: PatchMesh): Promise<PatchMesh | null> {
  const hostSolid = placeSolid(host, hostPose);
  const guestSolid = placeSolid(guest, guestPose);
  const built = await asManifold(patch);
  const hostManifold = await asManifold({ positions: hostSolid.positions, indices: hostSolid.indices });
  const guestManifold = await asManifold({ positions: guestSolid.positions, indices: guestSolid.indices });
  if (built.status !== "NoError" || hostManifold.status !== "NoError" || guestManifold.status !== "NoError") return null;
  const joined = hostManifold.solid.add(built.solid).add(guestManifold.solid);
  const raw = (joined as ManifoldLike & { getMesh?: () => { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }).getMesh?.();
  built.solid.delete();
  hostManifold.solid.delete();
  guestManifold.solid.delete();
  joined.delete();
  if (!raw) return null;
  const stride = raw.numProp || 3;
  const positions = new Float32Array(raw.triVerts.length * 3);
  raw.triVerts.forEach((vertex, index) => {
    positions[index * 3] = raw.vertProperties[vertex * stride];
    positions[index * 3 + 1] = raw.vertProperties[vertex * stride + 1];
    positions[index * 3 + 2] = raw.vertProperties[vertex * stride + 2];
  });
  const indices = new Uint32Array(raw.triVerts.length);
  for (let index = 0; index < indices.length; index += 1) indices[index] = index;
  return { positions, indices };
}

type MeshOut = { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };

function indexedOut(solid: ManifoldLike): PatchMesh | null {
  const raw = (solid as ManifoldLike & { getMesh?: () => MeshOut }).getMesh?.();
  if (!raw) return null;
  const stride = raw.numProp || 3;
  const count = raw.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex += 1) {
    positions[vertex * 3] = raw.vertProperties[vertex * stride];
    positions[vertex * 3 + 1] = raw.vertProperties[vertex * stride + 1];
    positions[vertex * 3 + 2] = raw.vertProperties[vertex * stride + 2];
  }
  return { positions, indices: new Uint32Array(raw.triVerts) };
}

export type UnionResult = { mesh: PatchMesh | null; status: string; components: number | null; cavities: number | null; volume: number | null; rejected: number[] };

/** Boolean union of every part. A part the kernel refuses is listed in `rejected` and left out. */
export async function unionSolids(parts: readonly PatchMesh[]): Promise<UnionResult> {
  const rejected: number[] = [];
  let joined: ManifoldLike | null = null;
  for (let index = 0; index < parts.length; index += 1) {
    const built = await asManifold(parts[index]);
    if (built.status !== "NoError") {
      built.solid.delete();
      rejected.push(index);
      continue;
    }
    if (!joined) {
      joined = built.solid;
      continue;
    }
    const next: ManifoldLike = joined.add(built.solid);
    joined.delete();
    built.solid.delete();
    joined = next;
  }
  if (!joined) return { mesh: null, status: "empty", components: null, cavities: null, volume: null, rejected };
  const status = joined.status();
  const shells = shellsOf(joined);
  const volume = Math.abs(joined.volume());
  const mesh = indexedOut(joined);
  joined.delete();
  return { mesh: mesh ? weldMesh(mesh, 1e-6) : null, status, components: shells.bodies, cavities: shells.cavities, volume, rejected };
}

/** Kernel status, body and cavity counts, and volume of one closed mesh. */
export async function solidSummary(mesh: PatchMesh): Promise<{ status: string; components: number | null; cavities: number | null; volume: number | null }> {
  const built = await asManifold(mesh);
  if (built.status !== "NoError") {
    built.solid.delete();
    return { status: built.status, components: null, cavities: null, volume: null };
  }
  const shells = shellsOf(built.solid);
  const volume = Math.abs(built.solid.volume());
  built.solid.delete();
  return { status: built.status, components: shells.bodies, cavities: shells.cavities, volume };
}

export { HOME };
