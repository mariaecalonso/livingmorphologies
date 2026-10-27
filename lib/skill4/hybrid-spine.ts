import type { IsoMesh } from "../scan/isomesh";
import { chooseConnectionSpan, preferredConnectionSpan, sectionInset } from "./connection-span";
import type { Vec3 } from "./contract";
import type { FaceProfile, ProfileLoop } from "./face-profile";
import { hybridProfile, outlineMatch, PROFILE_SAMPLES } from "./face-hybrid-profile";
import { connectorFrame } from "./hybrid-deformation";
import { HYBRID_GAP } from "./tiles";

/**
 * Develops one face-hybrid profile through a 3D spine.
 * The profile stays the cross-section. It is not the connector mesh.
 */

const SPATIAL = [0.18, 0.4, 0.62, 0.82, 1] as const;
const THIN_LIMIT = 0.12;

type Point = { x: number; y: number };

export type SpineReport = {
  thinRatio: number;
  bend: number;
  twist: number;
  span: number;
  collapsed: boolean;
};

export function buildHybridSpine(args: {
  profileA: FaceProfile;
  profileB: FaceProfile;
  outlineA: readonly Point[];
  outlineB: readonly Point[];
  column: number;
  row: number;
  intensity: number;
  steps: number;
}): { mesh: IsoMesh; report: SpineReport } | { mesh: null; reason: string } {
  const loopA = largest(args.profileA);
  const loopB = largest(args.profileB);
  const frameA = args.profileA.frame;
  const frameB = args.profileB.frame;
  if (!loopA || !loopB || !frameA || !frameB) return { mesh: null, reason: "A selected face has no closed section." };
  const worldA = resampleLoop(loopA);
  const seated = seat(resampleLoop(loopB), worldA, frameA.extent, frameB.extent, args.row, args.intensity);
  if (!seated) return { mesh: null, reason: "The two sections do not form a connection span." };
  const match = outlineMatch(args.outlineA, args.outlineB);
  const worldB = match.source.map((index) => seated.points[index]);
  const section = hybridProfile(args.outlineA, args.outlineB, args.column, args.row);
  const axis = normalize(sub(seated.centerB, seated.centerA));
  const majorA = majorAxis(worldA, frameA.u, frameA.v);
  const majorB = majorAxis(worldB, frameB.u, frameB.v);
  const twist = Math.atan2(dot(cross(majorA, majorB), axis), dot(reject(majorA, axis), reject(majorB, axis)) || 1);
  const spatial = SPATIAL[Math.min(4, Math.max(0, args.row))] ?? 0.6;
  const bow = bowVector(axis, frameA.normal, frameB.normal, worldA, worldB, seated.centerA, seated.centerB, majorA, majorB, seated.span, spatial);
  const steps = Math.max(2, args.steps);
  const rings: Vec3[][] = [];
  for (let station = 0; station < steps; station += 1) {
    const t = station / (steps - 1);
    const envelope = Math.sin(Math.PI * t);
    const center = add(lerp(seated.centerA, seated.centerB, t), scale(bow, envelope));
    const tangent = spineTangent(seated.centerA, seated.centerB, bow, t);
    const turned = rotateAround(slerp(majorA, majorB, t), tangent, envelope * twist * Math.max(0, spatial - 0.18) * 0.55);
    const sectionX = normalize(reject(turned, tangent));
    const sectionY = normalize(cross(tangent, sectionX));
    const pulse = 1 + envelope * spatial * 0.1;
    const inherited = worldA.map((point, index) => lerp(point, worldB[index], t));
    let shaped = section.map((point) => add(center, add(scale(sectionX, point.x * pulse), scale(sectionY, point.y * pulse))));
    if (dot(ringNormal(shaped), ringNormal(inherited)) < 0) {
      shaped = section.map((point) => add(center, add(scale(sectionX, point.x * pulse), scale(sectionY, -point.y * pulse))));
    }
    rings.push(inherited.map((point, index) => lerp(point, shaped[index], envelope)));
  }
  const mesh = loft(rings);
  const report = measureSpine(mesh, seated.centerA, seated.centerB, bow, twist, frameA.normal, frameB.normal);
  if (report.collapsed) return { mesh: null, reason: "PLANAR COLLAPSE. The connector has no spatial depth." };
  return { mesh, report };
}

function seat(points: Vec3[], worldA: Vec3[], extentA: { u: number; v: number }, extentB: { u: number; v: number }, row: number, intensity: number) {
  const centerA = average(worldA);
  const centerB0 = average(points);
  const initial = connectorFrame(centerA, centerB0);
  if (!initial) return null;
  const faceSpan = Math.min(extentA.u, extentA.v, extentB.u, extentB.v);
  const faceGap = chooseConnectionSpan(preferredConnectionSpan(row, intensity, faceSpan, 0), HYBRID_GAP);
  const span = faceGap + sectionInset(extentA) + sectionInset(extentB);
  const shift = scale(initial.direction, span - initial.span);
  const seated = points.map((point) => add(point, shift));
  return { points: seated, centerA, centerB: average(seated), span: length(sub(average(seated), centerA)) };
}

function bowVector(axis: Vec3, normalA: Vec3, normalB: Vec3, worldA: Vec3[], worldB: Vec3[], centerA: Vec3, centerB: Vec3, majorA: Vec3, majorB: Vec3, span: number, spatial: number) {
  const normalMismatch = reject(add(normalA, normalB), axis);
  const voidShift = reject(sub(voidDirection(worldB, centerB), voidDirection(worldA, centerA)), axis);
  const voidLean = reject(lerp(voidDirection(worldA, centerA), voidDirection(worldB, centerB), 0.5), axis);
  const principal = reject(cross(majorA, majorB), axis);
  const combined = add(add(scale(normalMismatch, span * 0.42), scale(voidShift, span * 0.22)), add(scale(voidLean, span * 0.16), scale(principal, span * 0.2)));
  const amount = length(combined);
  if (amount < 1e-5) return { x: 0, y: 0, z: 0 };
  return scale(combined, spatial);
}

function voidDirection(points: Vec3[], center: Vec3) {
  let best = sub(points[0], center);
  let bestLength = length(best);
  for (const point of points) {
    const delta = sub(point, center);
    const radius = length(delta);
    if (radius < bestLength) {
      best = delta;
      bestLength = radius;
    }
  }
  return bestLength > 1e-6 ? scale(best, 1 / bestLength) : unitPerp(sub(points[1] ?? points[0], points[0]));
}

function ringNormal(ring: readonly Vec3[]) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const next = ring[(index + 1) % ring.length];
    x += (ring[index].y - next.y) * (ring[index].z + next.z);
    y += (ring[index].z - next.z) * (ring[index].x + next.x);
    z += (ring[index].x - next.x) * (ring[index].y + next.y);
  }
  return { x, y, z };
}

function spineTangent(centerA: Vec3, centerB: Vec3, bow: Vec3, t: number) {
  const envelopeSlope = Math.PI * Math.cos(Math.PI * t);
  return normalize(add(sub(centerB, centerA), scale(bow, envelopeSlope)));
}

function majorAxis(points: Vec3[], u: Vec3, v: Vec3) {
  const center = average(points);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  const coords = points.map((point) => {
    const delta = sub(point, center);
    return { x: dot(delta, u), y: dot(delta, v) };
  });
  for (const point of coords) {
    xx += point.x * point.x;
    yy += point.y * point.y;
    xy += point.x * point.y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  let bias = 0;
  for (const point of coords) bias += (point.x * cosine + point.y * sine) ** 3;
  const sign = bias < 0 ? -1 : 1;
  return normalize(add(scale(u, sign * cosine), scale(v, sign * sine)));
}

/** Closed loft used by the sectional generator. Caps stay on the existing ring vertices. */
export function loftSectionRings(rings: Vec3[][]): IsoMesh {
  return loft(rings);
}

function loft(rings: Vec3[][]): IsoMesh {
  const count = rings[0].length;
  const positions = new Float32Array(rings.length * count * 3);
  const normals = new Float32Array(rings.length * count * 3);
  const indices: number[] = [];
  rings.forEach((ring, station) => {
    ring.forEach((point, sample) => {
      const offset = (station * count + sample) * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
    });
  });
  const center = average(rings[Math.floor(rings.length / 2)]);
  let flip = false;
  const a = 0;
  const b = 1;
  const probe = cross(sub(rings[0][b], rings[0][a]), sub(rings[1][0], rings[0][a]));
  if (dot(probe, sub(rings[0][a], center)) < 0) flip = true;
  for (let station = 0; station < rings.length - 1; station += 1) {
    for (let sample = 0; sample < count; sample += 1) {
      const next = (sample + 1) % count;
      const a0 = station * count + sample;
      const b0 = station * count + next;
      const c1 = (station + 1) * count + next;
      const d1 = (station + 1) * count + sample;
      indices.push(...(flip ? [a0, c1, b0, a0, d1, c1] : [a0, b0, c1, a0, c1, d1]));
    }
  }
  const wall = indices.slice();
  indices.push(...matchCapToWall(cap(rings[0], 0, count), wall, 0, count));
  indices.push(...matchCapToWall(cap(rings[rings.length - 1], (rings.length - 1) * count, count), wall, (rings.length - 1) * count, rings.length * count));
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const i0 = indices[triangle];
    const i1 = indices[triangle + 1];
    const i2 = indices[triangle + 2];
    const normal = cross(sub(read(positions, i1), read(positions, i0)), sub(read(positions, i2), read(positions, i0)));
    addNormal(normals, i0, normal);
    addNormal(normals, i1, normal);
    addNormal(normals, i2, normal);
  }
  for (let vertex = 0; vertex < normals.length / 3; vertex += 1) {
    const normal = read(normals, vertex);
    const magnitude = length(normal);
    write(normals, vertex, magnitude > 1e-8 ? scale(normal, 1 / magnitude) : { x: 0, y: 1, z: 0 });
  }
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

function cap(ring: Vec3[], offset: number, count: number) {
  const order = ring.map((_, index) => index);
  const normal = normalize(ringNormal(ring));
  const planeU = unitPerp(normal);
  const planeV = normalize(cross(normal, planeU));
  const flat = ring.map((point) => ({ x: dot(point, planeU), y: dot(point, planeV) }));
  const ccw = signedArea(flat) > 0;
  const triangles: number[] = [];
  let guard = 0;
  while (order.length > 3 && guard < count * count) {
    guard += 1;
    let clipped = false;
    for (let cursor = 0; cursor < order.length; cursor += 1) {
      const previous = order[(cursor + order.length - 1) % order.length];
      const current = order[cursor];
      const next = order[(cursor + 1) % order.length];
      if (!isEar(flat, order, previous, current, next, ccw)) continue;
      triangles.push(offset + previous, offset + current, offset + next);
      order.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) triangles.push(offset + order[0], offset + order[1], offset + order[2]);
  return coveredEdges(triangles, offset, count) === count ? triangles : fan(offset, count);
}

function fan(offset: number, count: number) {
  const triangles: number[] = [];
  for (let index = 1; index < count - 1; index += 1) triangles.push(offset, offset + index, offset + index + 1);
  return triangles;
}

function coveredEdges(triangles: number[], offset: number, count: number) {
  const edges = new Set<string>();
  for (let index = 0; index < triangles.length; index += 3) {
    const tri = [triangles[index] - offset, triangles[index + 1] - offset, triangles[index + 2] - offset];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = tri[edge];
      const b = tri[(edge + 1) % 3];
      if (Math.abs(a - b) === 1 || Math.abs(a - b) === count - 1) edges.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
  }
  return edges.size;
}

function matchCapToWall(triangles: number[], wall: number[], start: number, end: number) {
  if (triangles.length < 3) return triangles;
  const wallSign = boundarySign(wall, start, end);
  const capSign = boundarySign(triangles, start, end);
  if (wallSign === 0 || capSign === 0 || wallSign !== capSign) return triangles;
  const flipped: number[] = [];
  for (let index = 0; index < triangles.length; index += 3) flipped.push(triangles[index], triangles[index + 2], triangles[index + 1]);
  return flipped;
}

function boundarySign(triangles: number[], start: number, end: number) {
  const count = end - start;
  let forward = 0;
  let backward = 0;
  for (let index = 0; index < triangles.length; index += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const left = triangles[index + edge];
      const right = triangles[index + ((edge + 1) % 3)];
      if (left < start || left >= end || right < start || right >= end) continue;
      const a = left - start;
      const b = right - start;
      if ((a + 1) % count === b) forward += 1;
      if ((b + 1) % count === a) backward += 1;
    }
  }
  return Math.sign(forward - backward);
}

function measureSpine(mesh: IsoMesh, centerA: Vec3, centerB: Vec3, bow: Vec3, twist: number, normalA: Vec3, normalB: Vec3): SpineReport {
  const axis = normalize(sub(centerB, centerA));
  const side = unitPerp(axis);
  const lift = normalize(cross(axis, side));
  const extent = [0, 0, 0];
  const basis = [axis, side, lift];
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    let min = Infinity;
    let max = -Infinity;
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
      const projected = dot(read(mesh.positions, vertex), basis[axisIndex]);
      min = Math.min(min, projected);
      max = Math.max(max, projected);
    }
    extent[axisIndex] = max - min;
  }
  const largest = Math.max(...extent, 1e-6);
  const thinRatio = Math.min(...extent) / largest;
  const requiresPlane = Math.abs(dot(normalA, normalB)) > 0.85 && Math.abs(dot(normalA, axis)) < 0.25;
  return {
    thinRatio,
    bend: length(bow),
    twist: Math.abs(twist),
    span: length(sub(centerB, centerA)),
    collapsed: thinRatio < THIN_LIMIT && !requiresPlane,
  };
}

function resampleLoop(loop: ProfileLoop) {
  const closed = [...loop.points, loop.points[0]];
  const lengths = [0];
  for (let index = 1; index < closed.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(closed[index].u - closed[index - 1].u, closed[index].v - closed[index - 1].v));
  }
  const total = lengths[lengths.length - 1] || 1;
  const samples: Vec3[] = [];
  let cursor = 1;
  for (let index = 0; index < PROFILE_SAMPLES; index += 1) {
    const target = (total * index) / PROFILE_SAMPLES;
    while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor += 1;
    const span = lengths[cursor] - lengths[cursor - 1] || 1;
    const t = (target - lengths[cursor - 1]) / span;
    samples.push(lerp(closed[cursor - 1].position, closed[cursor].position, t));
  }
  return samples;
}

function largest(profile: FaceProfile) {
  const loops = profile.loops.filter((loop) => loop.points.length >= 3);
  if (loops.length === 0) return null;
  return loops.reduce((best, loop) => (loop.points.length > best.points.length ? loop : best));
}

function isEar(points: Point[], ring: number[], previous: number, current: number, next: number, ccw: boolean) {
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

function signedArea(points: Point[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return area * 0.5;
}

function rotateAround(vector: Vec3, axis: Vec3, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(add(scale(vector, cosine), scale(cross(axis, vector), sine)), scale(axis, dot(axis, vector) * (1 - cosine)));
}

function slerp(a: Vec3, b: Vec3, t: number) {
  const aligned = Math.min(1, Math.max(-1, dot(normalize(a), normalize(b))));
  if (aligned > 0.999999) return normalize(lerp(a, b, t));
  if (aligned < -0.999999) return rotateAround(normalize(a), unitPerp(a), Math.PI * t);
  const angle = Math.acos(aligned);
  const sine = Math.sin(angle);
  return normalize(add(scale(a, Math.sin((1 - t) * angle) / sine), scale(b, Math.sin(t * angle) / sine)));
}

function reject(vector: Vec3, axis: Vec3) {
  return sub(vector, scale(axis, dot(vector, axis)));
}

function unitPerp(value: Vec3) {
  const helper = Math.abs(value.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(value, helper));
}

function addNormal(buffer: Float32Array, vertex: number, value: Vec3) {
  const offset = vertex * 3;
  buffer[offset] += value.x;
  buffer[offset + 1] += value.y;
  buffer[offset + 2] += value.z;
}

function read(buffer: Float32Array, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: buffer[offset], y: buffer[offset + 1], z: buffer[offset + 2] };
}

function write(buffer: Float32Array, vertex: number, value: Vec3) {
  const offset = vertex * 3;
  buffer[offset] = value.x;
  buffer[offset + 1] = value.y;
  buffer[offset + 2] = value.z;
}

function average(points: readonly Vec3[]) {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3) {
  return scale(value, 1 / Math.max(1e-8, length(value)));
}
