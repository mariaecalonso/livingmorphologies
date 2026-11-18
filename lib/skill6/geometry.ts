import type { Mat3, PatchId, Quarter, Skill6Pose, Vec3 } from "./contract";

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function normalize(a: Vec3): Vec3 {
  const span = length(a) || 1;
  return scale(a, 1 / span);
}

/** Mirror across local X, then a quarter turn about vertical Z. */
export function basisOf(quarter: Quarter, mirrorX: boolean): Mat3 {
  const angle = quarter * Math.PI / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const mx = mirrorX ? -1 : 1;
  return [
    cosine * mx, sine * mx, 0,
    -sine, cosine, 0,
    0, 0, 1,
  ];
}

export function poseOf(quarter: Quarter, mirrorX: boolean, translation: Vec3): Skill6Pose {
  return { quarterZ: quarter, mirrorX, basis: basisOf(quarter, mirrorX), translation };
}

export function poseWithBasis(quarter: Quarter, mirrorX: boolean, basis: Mat3, translation: Vec3): Skill6Pose {
  return { quarterZ: quarter, mirrorX, basis, translation };
}

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Apply `right` first, then `left`. Both are column-major. */
export function multiplyBasis(left: Mat3, right: Mat3): Mat3 {
  const columns: Vec3[] = [];
  for (let column = 0; column < 3; column += 1) {
    const start = column * 3;
    columns.push(applyBasis(left, [right[start], right[start + 1], right[start + 2]]));
  }
  return [
    columns[0][0], columns[0][1], columns[0][2],
    columns[1][0], columns[1][1], columns[1][2],
    columns[2][0], columns[2][1], columns[2][2],
  ];
}

export function rotationAbout(axis: Vec3, angle: number): Mat3 {
  const [x, y, z] = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const tilt = 1 - cosine;
  const column = (vx: number, vy: number, vz: number): Vec3 => [
    (tilt * x * x + cosine) * vx + (tilt * x * y - sine * z) * vy + (tilt * x * z + sine * y) * vz,
    (tilt * x * y + sine * z) * vx + (tilt * y * y + cosine) * vy + (tilt * y * z - sine * x) * vz,
    (tilt * x * z - sine * y) * vx + (tilt * y * z + sine * x) * vy + (tilt * z * z + cosine) * vz,
  ];
  const xColumn = column(1, 0, 0);
  const yColumn = column(0, 1, 0);
  const zColumn = column(0, 0, 1);
  return [xColumn[0], xColumn[1], xColumn[2], yColumn[0], yColumn[1], yColumn[2], zColumn[0], zColumn[1], zColumn[2]];
}

/** Shortest rotation taking `from` onto `to`. */
export function rotationFromTo(from: Vec3, to: Vec3): Mat3 {
  const start = normalize(from);
  const end = normalize(to);
  const alignment = dot(start, end);
  if (alignment > 1 - 1e-8) return IDENTITY;
  if (alignment < -1 + 1e-8) {
    const helper: Vec3 = Math.abs(start[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    return rotationAbout(cross(start, helper), Math.PI);
  }
  return rotationAbout(cross(start, end), Math.acos(Math.max(-1, Math.min(1, alignment))));
}

export const QUARTERS: readonly Quarter[] = [0, 1, 2, 3];

export function applyBasis(basis: Mat3, point: Vec3): Vec3 {
  return [
    basis[0] * point[0] + basis[3] * point[1] + basis[6] * point[2],
    basis[1] * point[0] + basis[4] * point[1] + basis[7] * point[2],
    basis[2] * point[0] + basis[5] * point[1] + basis[8] * point[2],
  ];
}

export function applyPose(pose: Skill6Pose, point: Vec3): Vec3 {
  const turned = applyBasis(pose.basis, point);
  return add(turned, pose.translation);
}

export function invertPose(pose: Skill6Pose, point: Vec3): Vec3 {
  const basis = pose.basis;
  const x = point[0] - pose.translation[0];
  const y = point[1] - pose.translation[1];
  const z = point[2] - pose.translation[2];
  return [
    basis[0] * x + basis[1] * y + basis[2] * z,
    basis[3] * x + basis[4] * y + basis[5] * z,
    basis[6] * x + basis[7] * y + basis[8] * z,
  ];
}

export function determinant(basis: Mat3): number {
  return basis[0] * (basis[4] * basis[8] - basis[7] * basis[5])
    - basis[3] * (basis[1] * basis[8] - basis[7] * basis[2])
    + basis[6] * (basis[1] * basis[5] - basis[4] * basis[2]);
}

export type Bounds = { min: Vec3; max: Vec3 };

export function emptyBounds(): Bounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

export function include(bounds: Bounds, point: Vec3) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (point[axis] < bounds.min[axis]) bounds.min[axis] = point[axis];
    if (point[axis] > bounds.max[axis]) bounds.max[axis] = point[axis];
  }
}

export function boundsOfPositions(positions: Float32Array): Bounds {
  const bounds = emptyBounds();
  for (let index = 0; index < positions.length; index += 3) {
    include(bounds, [positions[index], positions[index + 1], positions[index + 2]]);
  }
  return bounds;
}

export function boundsVolume(bounds: Bounds): number {
  const span = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  if (span.some((value) => !(value > 0))) return 0;
  return span[0] * span[1] * span[2];
}

export function expandBounds(bounds: Bounds, pad: number): Bounds {
  return {
    min: [bounds.min[0] - pad, bounds.min[1] - pad, bounds.min[2] - pad],
    max: [bounds.max[0] + pad, bounds.max[1] + pad, bounds.max[2] + pad],
  };
}

export function boundsOverlap(a: Bounds, b: Bounds, pad = 0): boolean {
  return a.min[0] <= b.max[0] + pad && b.min[0] <= a.max[0] + pad
    && a.min[1] <= b.max[1] + pad && b.min[1] <= a.max[1] + pad
    && a.min[2] <= b.max[2] + pad && b.min[2] <= a.max[2] + pad;
}

export function boundsRelation(a: Bounds, b: Bounds, touch: number): "separated" | "touch" | "overlap" {
  const gap = [
    Math.max(a.min[0], b.min[0]) - Math.min(a.max[0], b.max[0]),
    Math.max(a.min[1], b.min[1]) - Math.min(a.max[1], b.max[1]),
    Math.max(a.min[2], b.min[2]) - Math.min(a.max[2], b.max[2]),
  ];
  if (gap.some((value) => value > touch)) return "separated";
  if (gap.some((value) => value > -1e-6)) return "touch";
  return "overlap";
}

export function poseBounds(bounds: Bounds, pose: Skill6Pose): Bounds {
  const world = emptyBounds();
  const xs = [bounds.min[0], bounds.max[0]];
  const ys = [bounds.min[1], bounds.max[1]];
  const zs = [bounds.min[2], bounds.max[2]];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) include(world, applyPose(pose, [x, y, z]));
    }
  }
  return world;
}

const PATCH_AXIS: Record<PatchId, { axis: 0 | 1 | 2; sign: 1 | -1 }> = {
  px: { axis: 0, sign: 1 },
  nx: { axis: 0, sign: -1 },
  py: { axis: 1, sign: 1 },
  ny: { axis: 1, sign: -1 },
  pz: { axis: 2, sign: 1 },
  nz: { axis: 2, sign: -1 },
};

export const PATCH_IDS = Object.keys(PATCH_AXIS) as PatchId[];

export function patchNormal(id: PatchId): Vec3 {
  const spec = PATCH_AXIS[id];
  const normal: Vec3 = [0, 0, 0];
  normal[spec.axis] = spec.sign;
  return normal;
}

export function readTriangle(positions: Float32Array, indices: Uint32Array, triangle: number): [Vec3, Vec3, Vec3] {
  const a = indices[triangle * 3] * 3;
  const b = indices[triangle * 3 + 1] * 3;
  const c = indices[triangle * 3 + 2] * 3;
  return [
    [positions[a], positions[a + 1], positions[a + 2]],
    [positions[b], positions[b + 1], positions[b + 2]],
    [positions[c], positions[c + 1], positions[c + 2]],
  ];
}

export function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return length(cross(sub(b, a), sub(c, a))) * 0.5;
}

export function signedVolume(positions: Float32Array, indices: Uint32Array, triangles: number): number {
  let volume = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const [a, b, c] = readTriangle(positions, indices, triangle);
    volume += dot(a, cross(b, c));
  }
  return volume / 6;
}

export function surfaceArea(positions: Float32Array, indices: Uint32Array, triangles: number): number {
  let area = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const [a, b, c] = readTriangle(positions, indices, triangle);
    area += triangleArea(a, b, c);
  }
  return area;
}

/** Closest point on a triangle. Real-Time Collision Detection, §5.1.5. */
export function closestOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return add(b, scale(sub(c, b), w));
  }
  const denom = va + vb + vc || 1;
  return add(a, add(scale(ab, vb / denom), scale(ac, vc / denom)));
}

export function pointTriangleDistance(point: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  return dist(point, closestOnTriangle(point, a, b, c));
}

const EPS = 1e-8;

function sameSide(a: number, b: number, c: number): boolean {
  return (a > EPS && b > EPS && c > EPS) || (a < -EPS && b < -EPS && c < -EPS);
}

function crossingInterval(p0: number, p1: number, p2: number, d0: number, d1: number, d2: number): [number, number] | null {
  const points = [p0, p1, p2];
  const distances = [d0, d1, d2];
  const hits: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const next = (index + 1) % 3;
    const here = distances[index];
    const there = distances[next];
    if (Math.abs(here) <= EPS) hits.push(points[index]);
    if (here * there < 0) {
      const t = here / (here - there);
      hits.push(points[index] + (points[next] - points[index]) * t);
    }
  }
  if (hits.length < 2) return null;
  return [Math.min(...hits), Math.max(...hits)];
}

function pointInTri(point: Vec3, a: Vec3, b: Vec3, c: Vec3, normal: Vec3): boolean {
  const area = dot(normal, cross(sub(b, a), sub(c, a)));
  const a1 = dot(normal, cross(sub(b, point), sub(c, point)));
  const a2 = dot(normal, cross(sub(c, point), sub(a, point)));
  const a3 = dot(normal, cross(sub(a, point), sub(b, point)));
  if (Math.abs(area) < EPS) return false;
  const s1 = a1 / area;
  const s2 = a2 / area;
  const s3 = a3 / area;
  return s1 >= -1e-6 && s2 >= -1e-6 && s3 >= -1e-6;
}

function segmentsCross2(a: Vec3, b: Vec3, c: Vec3, d: Vec3, drop: number): boolean {
  const axes = [0, 1, 2].filter((axis) => axis !== drop) as [number, number];
  const p = (point: Vec3) => [point[axes[0]], point[axes[1]]] as const;
  const orient = (i: readonly [number, number], j: readonly [number, number], k: readonly [number, number]) =>
    (j[0] - i[0]) * (k[1] - i[1]) - (j[1] - i[1]) * (k[0] - i[0]);
  const ab = p(a);
  const bb = p(b);
  const cc = p(c);
  const dd = p(d);
  const o1 = orient(ab, bb, cc);
  const o2 = orient(ab, bb, dd);
  const o3 = orient(cc, dd, ab);
  const o4 = orient(cc, dd, bb);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function coplanarOverlap(a: Vec3, b: Vec3, c: Vec3, d: Vec3, e: Vec3, f: Vec3): boolean {
  const normal = cross(sub(b, a), sub(c, a));
  const drop = Math.abs(normal[0]) > Math.abs(normal[1]) && Math.abs(normal[0]) > Math.abs(normal[2])
    ? 0
    : Math.abs(normal[1]) > Math.abs(normal[2]) ? 1 : 2;
  const edges: [Vec3, Vec3][] = [[a, b], [b, c], [c, a]];
  const other: [Vec3, Vec3][] = [[d, e], [e, f], [f, d]];
  for (const left of edges) {
    for (const right of other) {
      if (segmentsCross2(left[0], left[1], right[0], right[1], drop)) return true;
    }
  }
  return pointInTri(d, a, b, c, normal) || pointInTri(a, d, e, f, cross(sub(e, d), sub(f, d)));
}

/**
 * How far a crossing triangle reaches across the other plane.
 * Zero when the triangles do not meet. A shallow value is a graze.
 */
export function crossingPenetration(a: Vec3, b: Vec3, c: Vec3, d: Vec3, e: Vec3, f: Vec3): number {
  if (!trianglesIntersect(a, b, c, d, e, f)) return 0;
  const normal = cross(sub(e, d), sub(f, d));
  const span = length(normal) || 1;
  const signed = [a, b, c].map((point) => dot(normal, sub(point, d)) / span);
  const positive = Math.max(0, ...signed);
  const negative = Math.max(0, ...signed.map((value) => -value));
  return Math.min(positive, negative);
}

/** Triangle-triangle intersection. Non-coplanar pairs use the plane-line interval test. */
export function trianglesIntersect(a: Vec3, b: Vec3, c: Vec3, d: Vec3, e: Vec3, f: Vec3): boolean {
  const n1 = cross(sub(b, a), sub(c, a));
  const plane = dot(n1, a);
  const sd = dot(n1, d) - plane;
  const se = dot(n1, e) - plane;
  const sf = dot(n1, f) - plane;
  if (Math.abs(sd) <= EPS && Math.abs(se) <= EPS && Math.abs(sf) <= EPS) return coplanarOverlap(a, b, c, d, e, f);
  if (sameSide(sd, se, sf)) return false;
  const n2 = cross(sub(e, d), sub(f, d));
  const other = dot(n2, d);
  const sa = dot(n2, a) - other;
  const sb = dot(n2, b) - other;
  const sc = dot(n2, c) - other;
  if (sameSide(sa, sb, sc)) return false;
  const direction = cross(n1, n2);
  const first = crossingInterval(dot(direction, a), dot(direction, b), dot(direction, c), sa, sb, sc);
  const second = crossingInterval(dot(direction, d), dot(direction, e), dot(direction, f), sd, se, sf);
  if (!first || !second) return false;
  return first[0] <= second[1] + 1e-6 && second[0] <= first[1] + 1e-6;
}

export function rayHitsTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  const pvec = cross(direction, edge2);
  const det = dot(edge1, pvec);
  if (Math.abs(det) < EPS) return false;
  const inv = 1 / det;
  const tvec = sub(origin, a);
  const u = dot(tvec, pvec) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return false;
  const qvec = cross(tvec, edge1);
  const v = dot(direction, qvec) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return false;
  const t = dot(edge2, qvec) * inv;
  return t > 1e-5;
}

export type TriangleHash = {
  cell: number;
  buckets: Map<number, number[]>;
};

function packCell(x: number, y: number, z: number): number {
  return (x + 2048) + (y + 2048) * 4096 + (z + 2048) * 4096 * 4096;
}

export function hashTriangles(positions: Float32Array, indices: Uint32Array, triangles: number, cell: number): TriangleHash {
  const buckets = new Map<number, number[]>();
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const [a, b, c] = readTriangle(positions, indices, triangle);
    const min = [
      Math.floor(Math.min(a[0], b[0], c[0]) / cell),
      Math.floor(Math.min(a[1], b[1], c[1]) / cell),
      Math.floor(Math.min(a[2], b[2], c[2]) / cell),
    ];
    const max = [
      Math.floor(Math.max(a[0], b[0], c[0]) / cell),
      Math.floor(Math.max(a[1], b[1], c[1]) / cell),
      Math.floor(Math.max(a[2], b[2], c[2]) / cell),
    ];
    for (let x = min[0]; x <= max[0]; x += 1) {
      for (let y = min[1]; y <= max[1]; y += 1) {
        for (let z = min[2]; z <= max[2]; z += 1) {
          const key = packCell(x, y, z);
          const list = buckets.get(key);
          if (list) list.push(triangle);
          else buckets.set(key, [triangle]);
        }
      }
    }
  }
  return { cell, buckets };
}

/** Every triangle whose hash cell meets an axis-aligned box. */
export function queryHashBox(hash: TriangleHash, min: Vec3, max: Vec3): number[] {
  const found: number[] = [];
  const seen = new Set<number>();
  const lo = [
    Math.floor(min[0] / hash.cell),
    Math.floor(min[1] / hash.cell),
    Math.floor(min[2] / hash.cell),
  ];
  const hi = [
    Math.floor(max[0] / hash.cell),
    Math.floor(max[1] / hash.cell),
    Math.floor(max[2] / hash.cell),
  ];
  for (let x = lo[0]; x <= hi[0]; x += 1) {
    for (let y = lo[1]; y <= hi[1]; y += 1) {
      for (let z = lo[2]; z <= hi[2]; z += 1) {
        const list = hash.buckets.get(packCell(x, y, z));
        if (!list) continue;
        for (const triangle of list) {
          if (seen.has(triangle)) continue;
          seen.add(triangle);
          found.push(triangle);
        }
      }
    }
  }
  return found;
}

export function queryHash(hash: TriangleHash, point: Vec3, radius: number): number[] {
  const reach = Math.max(1, Math.ceil(radius / hash.cell));
  const origin = [
    Math.floor(point[0] / hash.cell),
    Math.floor(point[1] / hash.cell),
    Math.floor(point[2] / hash.cell),
  ];
  const found: number[] = [];
  const seen = new Set<number>();
  for (let x = origin[0] - reach; x <= origin[0] + reach; x += 1) {
    for (let y = origin[1] - reach; y <= origin[1] + reach; y += 1) {
      for (let z = origin[2] - reach; z <= origin[2] + reach; z += 1) {
        const list = hash.buckets.get(packCell(x, y, z));
        if (!list) continue;
        for (const triangle of list) {
          if (seen.has(triangle)) continue;
          seen.add(triangle);
          found.push(triangle);
        }
      }
    }
  }
  return found;
}

export function pointInsideMesh(
  point: Vec3,
  positions: Float32Array,
  indices: Uint32Array,
  triangles: number,
): boolean {
  const direction: Vec3 = [1, 0.0017, 0.0004];
  let hits = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const [a, b, c] = readTriangle(positions, indices, triangle);
    if (rayHitsTriangle(point, direction, a, b, c)) hits += 1;
  }
  return hits % 2 === 1;
}
