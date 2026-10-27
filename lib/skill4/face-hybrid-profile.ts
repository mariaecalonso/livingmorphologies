import type { IsoMesh } from "../scan/isomesh";
import type { FaceProfile, ProfileLoop } from "./face-profile";

/**
 * Raw face-hybrid profiles for the 5×5.
 * Each cell is its own outline, blended from the two selected face loops.
 * No loft, no shared envelope, no criteria.
 */

export const PROFILE_SAMPLES = 96;
export const COLUMN_B_WEIGHT = [0.02, 0.25, 0.5, 0.75, 0.98] as const;

const MIN_ADJACENT = 0.06;
const MIN_COLUMN_ENDS = 0.22;
const MIN_ROW_ENDS = 0.1;
const MIN_OPPOSITE = 0.28;
const MIN_CENTER_PARENT = 0.08;

type Point = { x: number; y: number };

export type HybridProfile = {
  id: string;
  column: number;
  row: number;
  points: Point[];
  area: number;
  perimeter: number;
  aspect: number;
  curvature: number;
  centroid: Point;
  direction: number;
  openings: number;
  concavities: number;
  voidRatio: number;
  hullRatio: number;
};

export type ProfileDiversity = {
  accepted: boolean;
  reason: string;
  adjacent: number;
  closest: string;
  h01h05: number;
  h01h21: number;
  h01h25: number;
  h13fromA: number;
  h13fromB: number;
};

export function faceOutline(profile: FaceProfile): Point[] | null {
  const loop = largest(profile);
  if (!loop) return null;
  const outer = loop.points.map((point) => ({ x: point.u, y: point.v }));
  const center = centroid(outer);
  const inners = profile.loops
    .filter((item) => item !== loop && item.closed && item.points.length >= 3)
    .map((item) => item.points.map((point) => ({ x: point.u, y: point.v })));
  const resampled = resample(outer, PROFILE_SAMPLES);
  const punched = inners.length === 0 ? resampled : resampled.map((point) => pinchVoid(point, center, inners));
  return orient(punched);
}

export function hybridProfile(outlineA: readonly Point[], outlineB: readonly Point[], column: number, row: number): Point[] {
  const weightB = COLUMN_B_WEIGHT[Math.min(4, Math.max(0, column))] ?? 0.5;
  const matched = outlineMatch(outlineA, outlineB).points;
  const blended = outlineA.map((point, index) => ({
    x: point.x * (1 - weightB) + matched[index].x * weightB,
    y: point.y * (1 - weightB) + matched[index].y * weightB,
  }));
  return rowTransform(blended, outlineDistance(outlineA, matched), row);
}

export function profilesForCells(outlineA: readonly Point[], outlineB: readonly Point[], ids: readonly string[]) {
  return ids.map((id, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const points = hybridProfile(outlineA, outlineB, column, row);
    return { id, column, row, ...measure(points) };
  });
}

export function assessProfiles(profiles: readonly HybridProfile[], outlineA: readonly Point[], outlineB: readonly Point[]): ProfileDiversity {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const distance = (left?: HybridProfile, right?: HybridProfile) => (left && right ? outlineDistance(left.points, right.points) : 0);
  const h01 = byId.get("H01");
  const h05 = byId.get("H05");
  const h13 = byId.get("H13");
  const h21 = byId.get("H21");
  const h25 = byId.get("H25");
  const parentA = measure(outlineA);
  const parentB = measure(outlineMatch(outlineA, outlineB).points);
  let adjacent = Infinity;
  let closest = "";
  for (let index = 0; index < profiles.length; index += 1) {
    const row = Math.floor(index / 5);
    const column = index % 5;
    if (column < 4) {
      const gap = outlineDistance(profiles[index].points, profiles[index + 1].points);
      if (gap < adjacent) {
        adjacent = gap;
        closest = `${profiles[index].id}-${profiles[index + 1].id}`;
      }
    }
    if (row < 4) {
      const gap = outlineDistance(profiles[index].points, profiles[index + 5].points);
      if (gap < adjacent) {
        adjacent = gap;
        closest = `${profiles[index].id}-${profiles[index + 5].id}`;
      }
    }
  }
  const h01h05 = distance(h01, h05);
  const h01h21 = distance(h01, h21);
  const h01h25 = distance(h01, h25);
  const h13fromA = h13 ? outlineDistance(h13.points, parentA.points) : 0;
  const h13fromB = h13 ? outlineDistance(h13.points, parentB.points) : 0;
  const faceGap = outlineDistance(parentA.points, parentB.points);
  const facesDiffer = faceGap >= MIN_COLUMN_ENDS;
  const columnNeed = faceGap < 0.35 ? 0.08 : Math.min(0.55, Math.max(MIN_COLUMN_ENDS, faceGap * 0.28));
  const oppositeNeed = faceGap < 0.35 ? 0.12 : Math.min(0.75, Math.max(MIN_OPPOSITE, faceGap * 0.4));
  const adjacentNeed = Math.min(MIN_ADJACENT, Math.max(0.03, columnNeed * 0.22));
  const accepted = (!facesDiffer || adjacent >= adjacentNeed)
    && (!facesDiffer || h01h05 >= columnNeed)
    && h01h21 >= MIN_ROW_ENDS
    && (!facesDiffer || h01h25 >= oppositeNeed)
    && (!facesDiffer || (h13fromA >= MIN_CENTER_PARENT && h13fromB >= MIN_CENTER_PARENT));
  return {
    accepted,
    adjacent,
    closest,
    h01h05,
    h01h21,
    h01h25,
    h13fromA,
    h13fromB,
    reason: accepted ? "" : "The face-hybrid profiles are still too alike. No connector was lofted.",
  };
}

export function profileMesh(points: readonly Point[]): IsoMesh {
  const flat = triangulate(points);
  const subdivided = subdivide(points, flat, 2);
  const positions = new Float32Array(subdivided.points.length * 3);
  const normals = new Float32Array(subdivided.points.length * 3);
  for (let index = 0; index < subdivided.points.length; index += 1) {
    positions[index * 3] = subdivided.points[index].x;
    positions[index * 3 + 1] = subdivided.points[index].y;
    normals[index * 3 + 2] = 1;
  }
  return {
    positions,
    normals,
    indices: Uint32Array.from(subdivided.indices),
    triangles: subdivided.indices.length / 3,
  };
}

function rowTransform(points: Point[], faceGap: number, row: number) {
  if (row <= 0) return points;
  const scale = meanRadius(points);
  const emphasis = faceGap < 0.35 ? 1 : Math.max(0.35, 1 - faceGap * 0.25);
  if (row === 1) return wave(points.map((point) => ({ x: point.x * (1 - 0.12 * emphasis), y: point.y * (1 + 0.16 * emphasis) })), 3, 0.16 * emphasis);
  if (row === 2) return notchArc(points, curvaturePeak(points), 18, 0.42 * scale * emphasis);
  if (row === 3) return notchArc(points.map((point) => ({ x: point.x * (1 - 0.26 * emphasis), y: point.y * (1 + 0.28 * emphasis) })), 8, 16, 0.36 * scale * emphasis);
  return notchArc(
    notchArc(wave(points.map((point) => ({ x: point.x * (1 - 0.34 * emphasis), y: point.y * (1 + 0.24 * emphasis) })), 5, 0.2 * emphasis), 4, 14, 0.48 * scale * emphasis),
    40,
    12,
    0.4 * scale * emphasis,
  );
}

function pinchVoid(point: Point, center: Point, holes: Point[][]) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const radius = Math.hypot(dx, dy);
  if (radius < 1e-6) return point;
  const angle = Math.atan2(dy, dx);
  let next = radius;
  for (const hole of holes) {
    const hit = rayHit(center, angle, hole);
    if (hit !== null && hit > 1e-4 && hit < next) next = Math.max(radius * 0.12, hit);
  }
  if (next === radius) return point;
  return { x: center.x + Math.cos(angle) * next, y: center.y + Math.sin(angle) * next };
}

function rayHit(origin: Point, angle: number, loop: readonly Point[]) {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  let nearest = Infinity;
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    const hit = segmentRay(origin, direction, a, b);
    if (hit !== null && hit < nearest) nearest = hit;
  }
  return Number.isFinite(nearest) ? nearest : null;
}

function segmentRay(origin: Point, direction: Point, a: Point, b: Point) {
  const edge = { x: b.x - a.x, y: b.y - a.y };
  const denom = direction.x * edge.y - direction.y * edge.x;
  if (Math.abs(denom) < 1e-8) return null;
  const offset = { x: a.x - origin.x, y: a.y - origin.y };
  const ray = (offset.x * edge.y - offset.y * edge.x) / denom;
  const edgeT = (offset.x * direction.y - offset.y * direction.x) / denom;
  if (ray <= 1e-4 || edgeT < 0 || edgeT > 1) return null;
  return ray;
}

function wave(points: readonly Point[], frequency: number, amount: number) {
  return points.map((point) => {
    const factor = 1 + amount * Math.sin(Math.atan2(point.y, point.x) * frequency);
    return { x: point.x * factor, y: point.y * factor };
  });
}

function notchArc(points: readonly Point[], index: number, width: number, depth: number) {
  const next = points.map((point) => ({ ...point }));
  const half = Math.floor(width / 2);
  for (let offset = -half; offset <= half; offset += 1) {
    const at = (index + offset + next.length) % next.length;
    const point = next[at];
    const length = Math.hypot(point.x, point.y) || 1;
    const share = 1 - Math.abs(offset) / (half + 1);
    next[at] = {
      x: point.x - (point.x / length) * depth * share,
      y: point.y - (point.y / length) * depth * share,
    };
  }
  return next;
}

export function outlineMatch(outlineA: readonly Point[], outlineB: readonly Point[]) {
  const count = outlineB.length;
  let best = outlineB.map((point) => ({ ...point }));
  let bestSource = outlineA.map((_, index) => index % count);
  let bestScore = Infinity;
  const kinds = ["identity", "turn", "reverse", "reverse-turn"] as const;
  for (const kind of kinds) {
    const variant = kind === "identity" ? outlineB
      : kind === "turn" ? rotate180(outlineB)
        : kind === "reverse" ? reverse(outlineB)
          : reverse(rotate180(outlineB));
    for (let shift = 0; shift < count; shift += 1) {
      let score = 0;
      for (let index = 0; index < outlineA.length; index += 1) {
        const point = variant[(index + shift) % count];
        score += (point.x - outlineA[index].x) ** 2 + (point.y - outlineA[index].y) ** 2;
      }
      if (score < bestScore) {
        bestScore = score;
        best = outlineA.map((_, index) => ({ ...variant[(index + shift) % count] }));
        bestSource = outlineA.map((_, index) => (kind === "reverse" || kind === "reverse-turn" ? count - 1 - ((index + shift) % count) : (index + shift) % count));
      }
    }
  }
  return { points: best, source: bestSource };
}

function orient(points: Point[]) {
  const center = centroid(points);
  const shifted = points.map((point) => ({ x: point.x - center.x, y: point.y - center.y }));
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of shifted) {
    xx += point.x * point.x;
    yy += point.y * point.y;
    xy += point.x * point.y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const rotated = shifted.map((point) => rotate(point, -angle));
  const bias = rotated.reduce((sum, point) => sum + point.x ** 3, 0);
  return bias < 0 ? rotated.map((point) => ({ x: -point.x, y: -point.y })) : rotated;
}

function resample(points: Point[], count: number) {
  if (points.length < 3) return points;
  const closed = [...points, points[0]];
  const lengths = [0];
  for (let index = 1; index < closed.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(closed[index].x - closed[index - 1].x, closed[index].y - closed[index - 1].y));
  }
  const total = lengths[lengths.length - 1] || 1;
  const samples: Point[] = [];
  let cursor = 1;
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / count;
    while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor += 1;
    const span = lengths[cursor] - lengths[cursor - 1] || 1;
    const t = (target - lengths[cursor - 1]) / span;
    samples.push({
      x: closed[cursor - 1].x + (closed[cursor].x - closed[cursor - 1].x) * t,
      y: closed[cursor - 1].y + (closed[cursor].y - closed[cursor - 1].y) * t,
    });
  }
  return samples;
}

function measure(points: readonly Point[]): Omit<HybridProfile, "id" | "column" | "row"> {
  let area = 0;
  let perimeter = 0;
  let turn = 0;
  let concavities = 0;
  const radii = points.map((point) => Math.hypot(point.x, point.y));
  const average = meanRadius(points);
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
    perimeter += Math.hypot(next.x - point.x, next.y - point.y);
    const angle = turning(previous, point, next);
    turn += Math.abs(angle);
    if (angle < -0.45) concavities += 1;
  }
  area = Math.abs(area) * 0.5;
  const hull = convexArea(points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const voids = radii.filter((radius) => radius < average * 0.72).length;
  return {
    points: points.map((point) => ({ ...point })),
    area,
    perimeter,
    aspect: Math.max(width, height) / Math.max(1e-4, Math.min(width, height)),
    curvature: turn / Math.max(1, points.length),
    centroid: centroid(points),
    direction: 0.5 * Math.atan2(
      2 * points.reduce((sum, point) => sum + point.x * point.y, 0),
      points.reduce((sum, point) => sum + point.x * point.x - point.y * point.y, 0),
    ),
    openings: countRuns(radii.map((radius) => radius < average * 0.72)),
    concavities,
    voidRatio: voids / Math.max(1, radii.length),
    hullRatio: area / Math.max(area, hull),
  };
}

export function outlineDistance(left: readonly Point[], right: readonly Point[]) {
  const count = Math.min(left.length, right.length);
  if (count < 3) return 0;
  const scale = Math.max(1e-4, (meanRadius(left) + meanRadius(right)) * 0.5);
  let sum = 0;
  for (let index = 0; index < count; index += 1) sum += Math.hypot(left[index].x - right[index].x, left[index].y - right[index].y);
  return sum / count / scale;
}

function triangulate(points: readonly Point[]) {
  const index = points.map((_, item) => item);
  const triangles: number[] = [];
  const ccw = signedArea(points) > 0;
  let guard = 0;
  while (index.length > 3 && guard < points.length * points.length) {
    guard += 1;
    let clipped = false;
    for (let cursor = 0; cursor < index.length; cursor += 1) {
      const previous = index[(cursor + index.length - 1) % index.length];
      const current = index[cursor];
      const next = index[(cursor + 1) % index.length];
      if (!isEar(points, index, previous, current, next, ccw)) continue;
      triangles.push(previous, current, next);
      index.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (index.length === 3) triangles.push(index[0], index[1], index[2]);
  return triangles;
}

function subdivide(source: readonly Point[], indices: number[], times: number) {
  let points = source.map((point) => ({ ...point }));
  let triangles = indices;
  for (let pass = 0; pass < times; pass += 1) {
    const nextPoints = points.map((point) => ({ ...point }));
    const nextTriangles: number[] = [];
    const midpoint = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const found = midpoint.get(key);
      if (found !== undefined) return found;
      const index = nextPoints.length;
      nextPoints.push({ x: (points[a].x + points[b].x) * 0.5, y: (points[a].y + points[b].y) * 0.5 });
      midpoint.set(key, index);
      return index;
    };
    for (let triangle = 0; triangle < triangles.length; triangle += 3) {
      const a = triangles[triangle];
      const b = triangles[triangle + 1];
      const c = triangles[triangle + 2];
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      nextTriangles.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    points = nextPoints;
    triangles = nextTriangles;
  }
  return { points, indices: triangles };
}

function isEar(points: readonly Point[], ring: number[], previous: number, current: number, next: number, ccw: boolean) {
  const a = points[previous];
  const b = points[current];
  const c = points[next];
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (ccw ? cross <= 1e-8 : cross >= -1e-8) return false;
  for (const index of ring) {
    if (index === previous || index === current || index === next) continue;
    if (inside(points[index], a, b, c)) return false;
  }
  return true;
}

function inside(point: Point, a: Point, b: Point, c: Point) {
  const ab = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  const bc = (c.x - b.x) * (point.y - b.y) - (c.y - b.y) * (point.x - b.x);
  const ca = (a.x - c.x) * (point.y - c.y) - (a.y - c.y) * (point.x - c.x);
  return (ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0);
}

function largest(profile: FaceProfile): ProfileLoop | null {
  const loops = profile.loops.filter((loop) => loop.points.length >= 3);
  if (loops.length === 0) return null;
  return loops.reduce((best, loop) => (loop.points.length > best.points.length ? loop : best));
}

function curvaturePeak(points: readonly Point[]) {
  let best = 0;
  let peak = -Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const turn = turning(points[(index + points.length - 1) % points.length], points[index], points[(index + 1) % points.length]);
    if (turn > peak) {
      peak = turn;
      best = index;
    }
  }
  return best;
}

function countRuns(flags: boolean[]) {
  let runs = 0;
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] && !flags[(index + flags.length - 1) % flags.length]) runs += 1;
  }
  return flags.every(Boolean) ? 1 : runs;
}

function convexArea(points: readonly Point[]) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (origin: Point, left: Point, right: Point) => (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower: Point[] = [];
  for (const point of ordered) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const point = ordered[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return Math.max(1e-6, Math.abs(signedArea(hull)));
}

function turning(previous: Point, point: Point, next: Point) {
  const incoming = Math.atan2(point.y - previous.y, point.x - previous.x);
  const outgoing = Math.atan2(next.y - point.y, next.x - point.x);
  return Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
}

function rotate(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function rotate180(points: readonly Point[]) {
  return points.map((point) => ({ x: -point.x, y: -point.y }));
}

function reverse(points: readonly Point[]) {
  return [...points].reverse();
}

function centroid(points: readonly Point[]) {
  const count = Math.max(1, points.length);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count,
  };
}

function meanRadius(points: readonly Point[]) {
  return points.reduce((sum, point) => sum + Math.hypot(point.x, point.y), 0) / Math.max(1, points.length);
}

function signedArea(points: readonly Point[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return area * 0.5;
}
