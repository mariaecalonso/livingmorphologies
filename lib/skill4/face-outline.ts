import type { IsoMesh } from "../scan/isomesh";
import type { FaceFrame, Vec3 } from "./contract";

/**
 * Display-only coat of the mesh triangles that form one registration face.
 * The triangles are copied from the source mesh and shifted slightly outward.
 * The source mesh is not rewritten.
 */
export const FACE_HIGHLIGHT_COLOR: [number, number, number] = [0.42, 0.46, 0.5];
export const FACE_HIGHLIGHT_OPACITY = 0.68;

const cache = new WeakMap<IsoMesh, Map<string, IsoMesh | null>>();

export function faceSurfaceHighlight(mesh: IsoMesh, frame: FaceFrame): IsoMesh | null {
  let stored = cache.get(mesh);
  if (!stored) {
    stored = new Map();
    cache.set(mesh, stored);
  }
  const hit = stored.get(frame.id);
  if (hit !== undefined) return hit;
  const built = buildHighlight(mesh, frame);
  stored.set(frame.id, built);
  return built;
}

function buildHighlight(mesh: IsoMesh, frame: FaceFrame): IsoMesh | null {
  const positions = mesh.positions;
  const indices = mesh.indices;
  if (positions.length < 9 || indices.length < 3) return null;
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const along = positions[index] * frame.normal.x + positions[index + 1] * frame.normal.y + positions[index + 2] * frame.normal.z;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
  }
  const span = Math.max(1e-4, maxAlong - minAlong);
  const halfU = frame.extent.u * 0.5;
  const halfV = frame.extent.v * 0.5;
  const broad = selectCap(positions, indices, frame, maxAlong, span, halfU, halfV, 0.34, 0.48);
  const kept = broad.length >= 18 ? broad : selectCap(positions, indices, frame, maxAlong, span, halfU, halfV, 0.5, 0.2);
  if (kept.length < 3) return null;
  const remap = new Map<number, { index: number; nx: number; ny: number; nz: number }>();
  const outIndices: number[] = [];
  for (let index = 0; index < kept.length; index += 6) {
    const corners = [kept[index], kept[index + 1], kept[index + 2]];
    const nx = kept[index + 3];
    const ny = kept[index + 4];
    const nz = kept[index + 5];
    for (const vertex of corners) {
      let slot = remap.get(vertex);
      if (!slot) {
        slot = { index: remap.size, nx: 0, ny: 0, nz: 0 };
        remap.set(vertex, slot);
      }
      slot.nx += nx;
      slot.ny += ny;
      slot.nz += nz;
      outIndices.push(slot.index);
    }
  }
  const outPositions = new Float32Array(remap.size * 3);
  const outNormals = new Float32Array(remap.size * 3);
  const lift = Math.min(0.02, Math.max(0.004, span * 0.003));
  for (const [vertex, slot] of remap) {
    const offset = vertex * 3;
    const length = Math.hypot(slot.nx, slot.ny, slot.nz) || 1;
    const nx = slot.nx / length;
    const ny = slot.ny / length;
    const nz = slot.nz / length;
    const base = slot.index * 3;
    outPositions[base] = positions[offset] + nx * lift;
    outPositions[base + 1] = positions[offset + 1] + ny * lift;
    outPositions[base + 2] = positions[offset + 2] + nz * lift;
    outNormals[base] = nx;
    outNormals[base + 1] = ny;
    outNormals[base + 2] = nz;
  }
  return {
    positions: outPositions,
    normals: outNormals,
    indices: Uint32Array.from(outIndices),
    triangles: outIndices.length / 3,
  };
}

function selectCap(
  positions: Float32Array,
  indices: Uint32Array,
  frame: FaceFrame,
  maxAlong: number,
  span: number,
  halfU: number,
  halfV: number,
  shellShare: number,
  align: number,
) {
  const shell = Math.max(0.08, span * shellShare);
  const kept: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const ax = positions[a];
    const ay = positions[a + 1];
    const az = positions[a + 2];
    const bx = positions[b];
    const by = positions[b + 1];
    const bz = positions[b + 2];
    const cx = positions[c];
    const cy = positions[c + 1];
    const cz = positions[c + 2];
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const fx = cx - ax;
    const fy = cy - ay;
    const fz = cz - az;
    let nx = ey * fz - ez * fy;
    let ny = ez * fx - ex * fz;
    let nz = ex * fy - ey * fx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-8) continue;
    nx /= length;
    ny /= length;
    nz /= length;
    if (nx * frame.normal.x + ny * frame.normal.y + nz * frame.normal.z < align) continue;
    const px = (ax + bx + cx) / 3;
    const py = (ay + by + cy) / 3;
    const pz = (az + bz + cz) / 3;
    const along = px * frame.normal.x + py * frame.normal.y + pz * frame.normal.z;
    if (along < maxAlong - shell) continue;
    const dx = px - frame.origin.x;
    const dy = py - frame.origin.y;
    const dz = pz - frame.origin.z;
    const u = dx * frame.u.x + dy * frame.u.y + dz * frame.u.z;
    const v = dx * frame.v.x + dy * frame.v.y + dz * frame.v.z;
    if (Math.abs(u) > halfU || Math.abs(v) > halfV) continue;
    kept.push(indices[index], indices[index + 1], indices[index + 2], nx, ny, nz);
  }
  return kept;
}

/** Closed outline of the whole highlighted face, resampled to a fixed station count. */
export function faceBoundarySamples(mesh: IsoMesh, frame: FaceFrame, count: number): Vec3[] | null {
  const coat = faceSurfaceHighlight(mesh, frame);
  if (!coat || count < 3) return null;
  const loops = coatBoundaries(coat.indices, coat.positions.length / 3);
  if (loops.length === 0) return null;
  const longest = loops
    .map((loop) => ({ loop, length: ringLength(loop, coat.positions) }))
    .sort((left, right) => right.length - left.length)[0];
  if (!longest || longest.loop.length < 3) return null;
  const points = longest.loop.map((index) => pointAt(coat.positions, index));
  return resampleRing(orientAgainst(points, frame.normal), count);
}

function coatBoundaries(indices: Uint32Array, vertexCount: number): number[][] {
  const uses = new Map<string, { a: number; b: number; count: number }>();
  for (let index = 0; index < indices.length; index += 3) {
    const corners = [indices[index], indices[index + 1], indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge];
      const b = corners[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const slot = uses.get(key) ?? { a, b, count: 0 };
      slot.count += 1;
      uses.set(key, slot);
    }
  }
  const neighbors = new Map<number, number[]>();
  for (const edge of uses.values()) {
    if (edge.count !== 1) continue;
    const left = neighbors.get(edge.a) ?? [];
    left.push(edge.b);
    neighbors.set(edge.a, left);
    const right = neighbors.get(edge.b) ?? [];
    right.push(edge.a);
    neighbors.set(edge.b, right);
  }
  const used = new Set<string>();
  const loops: number[][] = [];
  for (const start of neighbors.keys()) {
    const loop: number[] = [];
    let current = start;
    let previous = -1;
    while (neighbors.has(current)) {
      const next = (neighbors.get(current) ?? []).find((candidate) => (
        candidate !== previous && !used.has(`${Math.min(current, candidate)}:${Math.max(current, candidate)}`)
      ));
      if (next === undefined) break;
      used.add(`${Math.min(current, next)}:${Math.max(current, next)}`);
      loop.push(current);
      previous = current;
      current = next;
      if (current === start) break;
      if (loop.length > vertexCount) break;
    }
    if (loop.length >= 3 && current === start) loops.push(loop);
  }
  return loops;
}

function orientAgainst(points: Vec3[], normal: Vec3): Vec3[] {
  const origin = points.reduce((sum, point) => addVec(sum, point), { x: 0, y: 0, z: 0 });
  const center = scaleVec(origin, 1 / points.length);
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = subVec(points[index], center);
    const next = subVec(points[(index + 1) % points.length], center);
    area += (current.y * next.z - current.z * next.y) * normal.x
      + (current.z * next.x - current.x * next.z) * normal.y
      + (current.x * next.y - current.y * next.x) * normal.z;
  }
  return area < 0 ? [...points].reverse() : points;
}

function resampleRing(points: Vec3[], count: number): Vec3[] {
  const closed = [...points, points[0]];
  const lengths = [0];
  for (let index = 1; index < closed.length; index += 1) {
    lengths.push(lengths[index - 1] + distance(closed[index - 1], closed[index]));
  }
  const total = lengths[lengths.length - 1] || 1;
  const samples: Vec3[] = [];
  let cursor = 1;
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / count;
    while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor += 1;
    const span = lengths[cursor] - lengths[cursor - 1] || 1;
    const t = (target - lengths[cursor - 1]) / span;
    samples.push(lerpVec(closed[cursor - 1], closed[cursor], t));
  }
  return samples;
}

function ringLength(loop: number[], positions: Float32Array) {
  let total = 0;
  for (let index = 0; index < loop.length; index += 1) {
    total += distance(pointAt(positions, loop[index]), pointAt(positions, loop[(index + 1) % loop.length]));
  }
  return total;
}

function pointAt(positions: Float32Array, index: number): Vec3 {
  const offset = index * 3;
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scaleVec(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
