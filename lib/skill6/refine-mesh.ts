/**
 * Derived architectural surface for an assembled cluster.
 * The raw union is not written. Smoothing is strongest at patch seams and fades to a light pass on tile surfaces.
 */
import { SKILL6_PARAMETERS, type Vec3 } from "./contract";
import { crossingPenetration } from "./geometry";
import type { PatchMesh } from "./patch";

export const CLUSTER_REFINEMENT = {
  method: "seam fillet (Laplacian at patches, Taubin elsewhere, rim pass)",
  iterations: 24,
  lambda: 0.5,
  /** Applied in full away from seams. At a seam it fades out, so the groove between two tiles fills. */
  mu: -0.53,
  /** Full strength within this distance of a patch. */
  seamReach: 1.2,
  /** Strength falls to `baseWeight` over this distance. */
  seamFade: 2,
  baseWeight: 0.1,
  /** Largest move near a seam. Tile surfaces far from a seam move at most `floorShift`. */
  maxShift: 0.9,
  floorShift: 0.04,
  /** Dihedral angle that counts as a visible crease. */
  sharpDegrees: 35,
  /** Sealed pockets smaller than this are filled before smoothing. Smoothing would turn them inside out. */
  fillCavityVolume: 1,
  /** A second Laplacian pass on the patch rim, where the voxel steps meet the tile surface. */
  rimIterations: 20,
  rimLambda: 0.6,
  rimReach: 0.45,
  rimFade: 0.3,
} as const;

export type CavityShell = { volume: number; centroid: Vec3 };

/**
 * Remove closed inner shells with negative volume below `limit`. The raw union keeps them.
 * `allow` defaults to every such shell. A caller can refuse shells that are not joint pockets.
 */
export function fillSmallCavities(mesh: PatchMesh, limit: number, allow?: (shell: CavityShell) => boolean): { mesh: PatchMesh; filled: number; cavity: Uint8Array } {
  const triangles = mesh.indices.length / 3;
  const parent = new Int32Array(mesh.positions.length / 3).map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = find(mesh.indices[index]);
    parent[find(mesh.indices[index + 1])] = a;
    parent[find(mesh.indices[index + 2])] = a;
  }
  const volume = new Map<number, number>();
  const moment = new Map<number, { weight: number; x: number; y: number; z: number }>();
  const p = mesh.positions;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const a = mesh.indices[triangle * 3] * 3;
    const b = mesh.indices[triangle * 3 + 1] * 3;
    const c = mesh.indices[triangle * 3 + 2] * 3;
    const signed = (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
    const root = find(mesh.indices[triangle * 3]);
    volume.set(root, (volume.get(root) ?? 0) + signed);
    const weight = Math.abs(signed);
    const prior = moment.get(root) ?? { weight: 0, x: 0, y: 0, z: 0 };
    prior.weight += weight;
    prior.x += weight * (p[a] + p[b] + p[c]) / 3;
    prior.y += weight * (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
    prior.z += weight * (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
    moment.set(root, prior);
  }
  const drop = new Set<number>();
  for (const [root, value] of volume) {
    if (!(value < 0 && -value < limit)) continue;
    const body = moment.get(root);
    const centroid: Vec3 = body && body.weight > 0
      ? [body.x / body.weight, body.y / body.weight, body.z / body.weight]
      : [0, 0, 0];
    if (allow && !allow({ volume: -value, centroid })) continue;
    drop.add(root);
  }
  const hollow = (vertex: number) => (volume.get(find(vertex)) ?? 0) < 0;
  if (drop.size === 0) {
    const cavity = new Uint8Array(mesh.positions.length / 3);
    for (let vertex = 0; vertex < cavity.length; vertex += 1) if (hollow(vertex)) cavity[vertex] = 1;
    return { mesh, filled: 0, cavity };
  }
  const remap = new Int32Array(mesh.positions.length / 3).fill(-1);
  const positions: number[] = [];
  const kept: number[] = [];
  const cavity: number[] = [];
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    if (drop.has(find(mesh.indices[triangle * 3]))) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = mesh.indices[triangle * 3 + corner];
      if (remap[vertex] < 0) {
        remap[vertex] = positions.length / 3;
        positions.push(p[vertex * 3], p[vertex * 3 + 1], p[vertex * 3 + 2]);
        cavity.push(hollow(vertex) ? 1 : 0);
      }
      kept.push(remap[vertex]);
    }
  }
  return { mesh: { positions: Float32Array.from(positions), indices: Uint32Array.from(kept) }, filled: drop.size, cavity: Uint8Array.from(cavity) };
}

export type RefinedMesh = {
  mesh: PatchMesh;
  cavitiesFilled: number;
  maxShift: number;
  meanShift: number;
  sharpEdgesBefore: number;
  sharpEdgesAfter: number;
  seamSharpEdgesBefore: number;
  seamSharpEdgesAfter: number;
  minZ: number;
  /** Triangle pairs whose plane depth exceeds the seating tolerance. Shallower pairs are grazes. */
  penetrations: number;
  grazes: number;
  maxPenetration: number;
  verticesRestored: number;
  /** Vertices outside the seam fade, and how far they moved. */
  outsideMoved: number;
  outsideMax: number;
};

export type RefinementOptions = {
  /**
   * Keep the union position outside the seam fade.
   * Fill a small cavity only when it sits in that neighborhood and outside `protectedVoids`.
   */
  restrictToJoint?: boolean;
  protectedVoids?: { min: Vec3; max: Vec3 }[];
};

function neighborsOf(mesh: PatchMesh) {
  const count = mesh.positions.length / 3;
  const sets: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index];
    const b = mesh.indices[index + 1];
    const c = mesh.indices[index + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const offsets = new Uint32Array(count + 1);
  for (let vertex = 0; vertex < count; vertex += 1) offsets[vertex + 1] = offsets[vertex] + sets[vertex].size;
  const flat = new Uint32Array(offsets[count]);
  for (let vertex = 0; vertex < count; vertex += 1) {
    let cursor = offsets[vertex];
    for (const other of sets[vertex]) flat[cursor++] = other;
  }
  return { offsets, flat };
}

/** Weight 1 within `seamReach` of a patch, fading to the base weight. Patch vertices are thinned to one per `thinStep` cell first. */
function seamWeights(
  mesh: PatchMesh,
  patches: readonly PatchMesh[],
  seamReach: number = CLUSTER_REFINEMENT.seamReach,
  seamFade: number = CLUSTER_REFINEMENT.seamFade,
  baseWeight: number = CLUSTER_REFINEMENT.baseWeight,
  thinStep = 0.4,
) {
  const count = mesh.positions.length / 3;
  const weights = new Float32Array(count).fill(baseWeight);
  const thin = new Map<string, [number, number, number]>();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const patch of patches) {
    for (let index = 0; index < patch.positions.length; index += 3) {
      const point: [number, number, number] = [patch.positions[index], patch.positions[index + 1], patch.positions[index + 2]];
      const key = point.map((value) => Math.floor(value / thinStep)).join(":");
      if (!thin.has(key)) thin.set(key, point);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  if (thin.size === 0) return weights;
  const reach = seamReach + seamFade;
  const cell = 1;
  const buckets = new Map<string, [number, number, number][]>();
  for (const point of thin.values()) {
    const key = point.map((value) => Math.floor(value / cell)).join(":");
    const list = buckets.get(key) ?? [];
    list.push(point);
    buckets.set(key, list);
  }
  const span = Math.ceil(reach / cell);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const z = mesh.positions[vertex * 3 + 2];
    if (x < min[0] - reach || y < min[1] - reach || z < min[2] - reach || x > max[0] + reach || y > max[1] + reach || z > max[2] + reach) continue;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    let nearest = Infinity;
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dy = -span; dy <= span; dy += 1) {
        for (let dz = -span; dz <= span; dz += 1) {
          const list = buckets.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
          if (!list) continue;
          for (const point of list) nearest = Math.min(nearest, Math.hypot(point[0] - x, point[1] - y, point[2] - z));
        }
      }
    }
    if (nearest <= seamReach) weights[vertex] = 1;
    else if (nearest < reach) weights[vertex] = baseWeight + (1 - baseWeight) * (1 - (nearest - seamReach) / seamFade);
  }
  return weights;
}

/** Creased edges overall, and those whose two ends both sit in the seam zone. */
function creases(mesh: PatchMesh, weights: Float32Array) {
  const limit = Math.cos((CLUSTER_REFINEMENT.sharpDegrees * Math.PI) / 180);
  const normals: number[] = [];
  const edges = new Map<string, number[]>();
  const p = mesh.positions;
  for (let triangle = 0; triangle < mesh.indices.length / 3; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const ux = p[ids[1] * 3] - p[ids[0] * 3];
    const uy = p[ids[1] * 3 + 1] - p[ids[0] * 3 + 1];
    const uz = p[ids[1] * 3 + 2] - p[ids[0] * 3 + 2];
    const vx = p[ids[2] * 3] - p[ids[0] * 3];
    const vy = p[ids[2] * 3 + 1] - p[ids[0] * 3 + 1];
    const vz = p[ids[2] * 3 + 2] - p[ids[0] * 3 + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const span = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / span, ny / span, nz / span);
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = edges.get(key) ?? [];
      list.push(triangle);
      edges.set(key, list);
    }
  }
  let sharp = 0;
  let seam = 0;
  for (const [key, list] of edges) {
    if (list.length !== 2) continue;
    const [left, right] = list;
    const cos = normals[left * 3] * normals[right * 3] + normals[left * 3 + 1] * normals[right * 3 + 1] + normals[left * 3 + 2] * normals[right * 3 + 2];
    if (cos > limit) continue;
    sharp += 1;
    const [a, b] = key.split(":").map(Number);
    if (weights[a] >= 0.5 && weights[b] >= 0.5) seam += 1;
  }
  return { sharp, seam };
}

export type CrossingReport = {
  penetrations: number;
  grazes: number;
  maxPenetration: number;
  /** Vertices of every pair deeper than the graze limit. */
  vertices: Uint8Array;
  pairs: { triangle: number; other: number; depth: number }[];
};

/**
 * Triangle pairs that cross. Depth is how far one triangle reaches past the other's plane.
 * A depth at or under the seating tolerance is a graze, the same allowance the contact rules use.
 */
export function crossingReport(mesh: PatchMesh, graze = SKILL6_PARAMETERS.maxPenetration): CrossingReport {
  const P = mesh.positions;
  const I = mesh.indices;
  const count = I.length / 3;
  const vertices = new Uint8Array(P.length / 3);
  const pairs: CrossingReport["pairs"] = [];
  if (count === 0) return { penetrations: 0, grazes: 0, maxPenetration: 0, vertices, pairs };
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < P.length; index += 3) {
    minX = Math.min(minX, P[index]); maxX = Math.max(maxX, P[index]);
    minY = Math.min(minY, P[index + 1]); maxY = Math.max(maxY, P[index + 1]);
    minZ = Math.min(minZ, P[index + 2]); maxZ = Math.max(maxZ, P[index + 2]);
  }
  const cell = Math.max(0.4, Math.cbrt(((maxX - minX) * (maxY - minY) * Math.max(1, maxZ - minZ)) / count) * 2);
  const low = new Float32Array(count * 3);
  const high = new Float32Array(count * 3);
  const buckets = new Map<number, number[]>();
  for (let triangle = 0; triangle < count; triangle += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const a = P[I[triangle * 3] * 3 + axis];
      const b = P[I[triangle * 3 + 1] * 3 + axis];
      const c = P[I[triangle * 3 + 2] * 3 + axis];
      low[triangle * 3 + axis] = Math.min(a, b, c);
      high[triangle * 3 + axis] = Math.max(a, b, c);
    }
    const from = [0, 1, 2].map((axis) => Math.floor(low[triangle * 3 + axis] / cell));
    const to = [0, 1, 2].map((axis) => Math.floor(high[triangle * 3 + axis] / cell));
    for (let x = from[0]; x <= to[0]; x += 1) for (let y = from[1]; y <= to[1]; y += 1) for (let z = from[2]; z <= to[2]; z += 1) {
      const key = (x + 4096) + (y + 4096) * 8192 + (z + 4096) * 8192 * 8192;
      const list = buckets.get(key);
      if (list) list.push(triangle);
      else buckets.set(key, [triangle]);
    }
  }
  const point = (index: number): Vec3 => [P[index * 3], P[index * 3 + 1], P[index * 3 + 2]];
  const seen = new Set<number>();
  let penetrations = 0;
  let grazes = 0;
  let maxPenetration = 0;
  for (const list of buckets.values()) {
    for (let left = 0; left < list.length; left += 1) {
      for (let right = left + 1; right < list.length; right += 1) {
        const triangle = list[left];
        const other = list[right];
        const pair = Math.min(triangle, other) * count + Math.max(triangle, other);
        if (seen.has(pair)) continue;
        let overlap = true;
        for (let axis = 0; axis < 3; axis += 1) {
          if (low[triangle * 3 + axis] > high[other * 3 + axis] || low[other * 3 + axis] > high[triangle * 3 + axis]) overlap = false;
        }
        if (!overlap) continue;
        seen.add(pair);
        const first = [I[triangle * 3], I[triangle * 3 + 1], I[triangle * 3 + 2]];
        const second = [I[other * 3], I[other * 3 + 1], I[other * 3 + 2]];
        if (first.some((vertex) => second.includes(vertex))) continue;
        const depth = crossingPenetration(point(first[0]), point(first[1]), point(first[2]), point(second[0]), point(second[1]), point(second[2]));
        if (depth <= 0) continue;
        maxPenetration = Math.max(maxPenetration, depth);
        if (depth <= graze) {
          grazes += 1;
          continue;
        }
        penetrations += 1;
        pairs.push({ triangle, other, depth });
        for (const vertex of [...first, ...second]) vertices[vertex] = 1;
      }
    }
  }
  return { penetrations, grazes, maxPenetration, vertices, pairs };
}

function patchPoints(patches: readonly PatchMesh[], step = 0.4): Vec3[] {
  const thin = new Map<string, Vec3>();
  for (const patch of patches) {
    for (let index = 0; index < patch.positions.length; index += 3) {
      const point: Vec3 = [patch.positions[index], patch.positions[index + 1], patch.positions[index + 2]];
      const key = point.map((value) => Math.floor(value / step)).join(":");
      if (!thin.has(key)) thin.set(key, point);
    }
  }
  return [...thin.values()];
}

function nearPatch(point: Vec3, points: readonly Vec3[], reach: number): boolean {
  const reach2 = reach * reach;
  for (const sample of points) {
    const dx = sample[0] - point[0];
    const dy = sample[1] - point[1];
    const dz = sample[2] - point[2];
    if (dx * dx + dy * dy + dz * dz <= reach2) return true;
  }
  return false;
}

export function refineClusterMesh(union: PatchMesh, patches: readonly PatchMesh[], options?: RefinementOptions): RefinedMesh {
  const { iterations, lambda, mu, maxShift, floorShift, baseWeight } = CLUSTER_REFINEMENT;
  const jointReach = CLUSTER_REFINEMENT.seamReach + CLUSTER_REFINEMENT.seamFade;
  const samples = options?.restrictToJoint ? patchPoints(patches) : [];
  const protectedVoids = options?.protectedVoids ?? [];
  const { mesh: raw, filled, cavity } = fillSmallCavities(
    union,
    CLUSTER_REFINEMENT.fillCavityVolume,
    options?.restrictToJoint
      ? (shell) => nearPatch(shell.centroid, samples, jointReach)
        && !protectedVoids.some((body) => shell.centroid[0] >= body.min[0] && shell.centroid[0] <= body.max[0]
          && shell.centroid[1] >= body.min[1] && shell.centroid[1] <= body.max[1]
          && shell.centroid[2] >= body.min[2] && shell.centroid[2] <= body.max[2])
      : undefined,
  );
  const count = raw.positions.length / 3;
  const weights = seamWeights(raw, patches);
  const { offsets, flat } = neighborsOf(raw);
  const origin = raw.positions;
  let current = new Float32Array(origin);
  const pinned = new Uint8Array(count);
  const frozen = new Uint8Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (origin[vertex * 3 + 2] <= 1e-6) pinned[vertex] = 1;
    if (options?.restrictToJoint && weights[vertex] <= baseWeight + 1e-8) frozen[vertex] = 1;
  }
  const muWeights = new Float32Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const seam = Math.min(1, Math.max(0, (weights[vertex] - baseWeight) / (1 - baseWeight)));
    muWeights[vertex] = weights[vertex] * (1 - seam);
  }
  const snapshots: Float32Array[] = [new Float32Array(origin)];
  const pass = (factor: number, strength: Float32Array) => {
    const next = new Float32Array(current);
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (frozen[vertex]) continue;
      const start = offsets[vertex];
      const end = offsets[vertex + 1];
      if (end === start) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let cursor = start; cursor < end; cursor += 1) {
        const other = flat[cursor] * 3;
        sx += current[other];
        sy += current[other + 1];
        sz += current[other + 2];
      }
      const inverse = 1 / (end - start);
      const step = factor * strength[vertex];
      const at = vertex * 3;
      let x = current[at] + step * (sx * inverse - current[at]);
      let y = current[at + 1] + step * (sy * inverse - current[at + 1]);
      let z = current[at + 2] + step * (sz * inverse - current[at + 2]);
      const limit = floorShift + (maxShift - floorShift) * weights[vertex];
      const dx = x - origin[at];
      const dy = y - origin[at + 1];
      const dz = z - origin[at + 2];
      const moved = Math.hypot(dx, dy, dz);
      if (moved > limit) {
        const keep = limit / moved;
        x = origin[at] + dx * keep;
        y = origin[at + 1] + dy * keep;
        z = origin[at + 2] + dz * keep;
      }
      if (pinned[vertex]) z = 0;
      else if (z < 0) z = 0;
      next[at] = x;
      next[at + 1] = y;
      next[at + 2] = z;
    }
    current = next;
  };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    pass(lambda, weights);
    pass(mu, muWeights);
    snapshots.push(new Float32Array(current));
  }
  const { rimIterations, rimLambda, rimReach, rimFade } = CLUSTER_REFINEMENT;
  const rim = seamWeights(raw, patches, rimReach, rimFade, 0, 0.12);
  for (let vertex = 0; vertex < count; vertex += 1) if (cavity[vertex]) rim[vertex] = 0;
  for (let iteration = 0; iteration < rimIterations; iteration += 1) {
    pass(rimLambda, rim);
    snapshots.push(new Float32Array(current));
  }
  // Roll a penetrating vertex back to the latest smoothed position where the depth count falls.
  // Stopping when the count stops falling keeps the raw union's own intersections from returning.
  let restored = 0;
  let report = crossingReport({ positions: current, indices: raw.indices });
  for (let step = snapshots.length - 2; step >= 0 && report.penetrations > 0; step -= 1) {
    const before = report.penetrations;
    const prior = new Float32Array(current);
    let moved = 0;
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (!report.vertices[vertex] || frozen[vertex]) continue;
      const at = vertex * 3;
      current[at] = snapshots[step][at];
      current[at + 1] = snapshots[step][at + 1];
      current[at + 2] = Math.max(0, snapshots[step][at + 2]);
      moved += 1;
    }
    report = crossingReport({ positions: current, indices: raw.indices });
    if (report.penetrations >= before) {
      current = prior;
      report = crossingReport({ positions: current, indices: raw.indices });
      break;
    }
    restored += moved;
  }
  // What rollback cannot separate is pushed apart by its own depth. The move stops when the count stops falling.
  for (let round = 0; round < 12 && report.penetrations > 0; round += 1) {
    const before = report.penetrations;
    const prior = new Float32Array(current);
    const shift = new Float32Array(count * 3);
    const votes = new Float32Array(count);
    const idsOf = (triangle: number) => [raw.indices[triangle * 3], raw.indices[triangle * 3 + 1], raw.indices[triangle * 3 + 2]];
    const at = (vertex: number, axis: number) => current[vertex * 3 + axis];
    for (const pair of report.pairs) {
      const center = (triangle: number) => {
        const ids = idsOf(triangle);
        return [0, 1, 2].map((axis) => (at(ids[0], axis) + at(ids[1], axis) + at(ids[2], axis)) / 3);
      };
      const from = center(pair.triangle);
      const toward = center(pair.other);
      const delta = [toward[0] - from[0], toward[1] - from[1], toward[2] - from[2]];
      const span = Math.hypot(delta[0], delta[1], delta[2]) || 1;
      const push = Math.max(pair.depth, SKILL6_PARAMETERS.maxPenetration);
      const add = (triangle: number, sign: number) => {
        for (const vertex of idsOf(triangle)) {
          votes[vertex] += 1;
          for (let axis = 0; axis < 3; axis += 1) shift[vertex * 3 + axis] += sign * (delta[axis] / span) * push;
        }
      };
      add(pair.triangle, -1);
      add(pair.other, 1);
    }
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (!votes[vertex] || frozen[vertex]) continue;
      const at = vertex * 3;
      current[at] += shift[at] / votes[vertex];
      current[at + 1] += shift[at + 1] / votes[vertex];
      current[at + 2] = Math.max(0, current[at + 2] + shift[at + 2] / votes[vertex]);
      restored += 1;
    }
    report = crossingReport({ positions: current, indices: raw.indices });
    if (report.penetrations >= before) {
      current = prior;
      report = crossingReport({ positions: current, indices: raw.indices });
      break;
    }
  }
  const local = new Float32Array(count);
  for (let extra = 0; extra < 24 && report.penetrations > 0; extra += 1) {
    const before = report.penetrations;
    const prior = new Float32Array(current);
    local.fill(0);
    for (let vertex = 0; vertex < count; vertex += 1) if (report.vertices[vertex] && !frozen[vertex]) local[vertex] = 1;
    pass(lambda, local);
    report = crossingReport({ positions: current, indices: raw.indices });
    if (report.penetrations >= before) {
      current = prior;
      report = crossingReport({ positions: current, indices: raw.indices });
      break;
    }
    restored += 1;
  }
  for (let round = 0; round < 8 && report.penetrations > 0; round += 1) {
    let progressed = false;
    for (const pair of [...report.pairs]) {
      const ids = (triangle: number) => [raw.indices[triangle * 3], raw.indices[triangle * 3 + 1], raw.indices[triangle * 3 + 2]];
      const lift = (triangle: number, other: number) => {
        const base = ids(other);
        const ax = current[base[1] * 3] - current[base[0] * 3];
        const ay = current[base[1] * 3 + 1] - current[base[0] * 3 + 1];
        const az = current[base[1] * 3 + 2] - current[base[0] * 3 + 2];
        const bx = current[base[2] * 3] - current[base[0] * 3];
        const by = current[base[2] * 3 + 1] - current[base[0] * 3 + 1];
        const bz = current[base[2] * 3 + 2] - current[base[0] * 3 + 2];
        const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
        const span = Math.hypot(n[0], n[1], n[2]) || 1;
        const signed = ids(triangle).map((vertex) => n[0] * (current[vertex * 3] - current[base[0] * 3]) + n[1] * (current[vertex * 3 + 1] - current[base[0] * 3 + 1]) + n[2] * (current[vertex * 3 + 2] - current[base[0] * 3 + 2]));
        const positive = signed.filter((value) => value > 0).length;
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = ids(triangle)[corner];
          const wrong = positive >= 2 ? signed[corner] < 0 : signed[corner] > 0;
          if (!wrong || frozen[vertex]) continue;
          const distance = signed[corner] / span;
          const sign = distance >= 0 ? -1 : 1;
          current[vertex * 3] += sign * n[0] / span * (Math.abs(distance) + 0.002);
          current[vertex * 3 + 1] += sign * n[1] / span * (Math.abs(distance) + 0.002);
          current[vertex * 3 + 2] = Math.max(0, current[vertex * 3 + 2] + sign * n[2] / span * (Math.abs(distance) + 0.002));
          restored += 1;
        }
      };
      const prior = new Float32Array(current);
      const saved = report;
      lift(pair.triangle, pair.other);
      lift(pair.other, pair.triangle);
      const next = crossingReport({ positions: current, indices: raw.indices });
      if (next.penetrations >= saved.penetrations) current = prior;
      else { report = next; progressed = true; }
    }
    if (!progressed) break;
    report = crossingReport({ positions: current, indices: raw.indices });
  }
  for (const scale of [2, 4, 8]) {
    if (report.penetrations === 0) break;
    const prior = new Float32Array(current);
    const saved = report.penetrations;
    for (const pair of report.pairs) {
      const ids = (triangle: number) => [raw.indices[triangle * 3], raw.indices[triangle * 3 + 1], raw.indices[triangle * 3 + 2]];
      const center = (triangle: number) => [0, 1, 2].map((axis) => ids(triangle).reduce((sum, vertex) => sum + current[vertex * 3 + axis], 0) / 3);
      const from = center(pair.triangle);
      const toward = center(pair.other);
      const delta = [toward[0] - from[0], toward[1] - from[1], toward[2] - from[2]];
      const span = Math.hypot(...delta) || 1;
      const push = pair.depth * scale;
      const move = (triangle: number, sign: number) => {
        for (const vertex of ids(triangle)) {
          if (frozen[vertex]) continue;
          for (let axis = 0; axis < 3; axis += 1) current[vertex * 3 + axis] += sign * (delta[axis] / span) * push;
          current[vertex * 3 + 2] = Math.max(0, current[vertex * 3 + 2]);
        }
      };
      move(pair.triangle, -1);
      move(pair.other, 1);
    }
    const next = crossingReport({ positions: current, indices: raw.indices });
    if (next.penetrations < saved) { report = next; restored += 1; }
    else current = prior;
  }
  let maxMoved = 0;
  let sumMoved = 0;
  let minZ = Infinity;
  let outsideMoved = 0;
  let outsideMax = 0;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const at = vertex * 3;
    const moved = Math.hypot(current[at] - origin[at], current[at + 1] - origin[at + 1], current[at + 2] - origin[at + 2]);
    maxMoved = Math.max(maxMoved, moved);
    sumMoved += moved;
    minZ = Math.min(minZ, current[at + 2]);
    if (weights[vertex] <= baseWeight + 1e-8) {
      outsideMax = Math.max(outsideMax, moved);
      if (moved > 1e-4) outsideMoved += 1;
    }
  }
  const mesh = { positions: current, indices: raw.indices };
  const before = creases(raw, weights);
  const after = creases(mesh, weights);
  return {
    mesh,
    cavitiesFilled: filled,
    maxShift: maxMoved,
    meanShift: count ? sumMoved / count : 0,
    sharpEdgesBefore: before.sharp,
    sharpEdgesAfter: after.sharp,
    seamSharpEdgesBefore: before.seam,
    seamSharpEdgesAfter: after.seam,
    minZ,
    penetrations: report.penetrations,
    grazes: report.grazes,
    maxPenetration: report.maxPenetration,
    verticesRestored: restored,
    outsideMoved,
    outsideMax,
  };
}
