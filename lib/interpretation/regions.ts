/**
 * Connected surface regions for Milestone 2.
 * Triangles join only when they share an edge, keep the same facing class, and bend
 * by less than 35 degrees at that edge. Shared elevation or a shared grid cell is not a reason to merge.
 */
import type { Vec3 } from "./building";

const UP_NORMAL = 0.85;
const DOWN_NORMAL = -0.85;
const VERTICAL_NORMAL = 0.2;
const LOCAL_CONTINUITY = Math.cos(35 * Math.PI / 180);
const WELD = 0.001;

export type Facing = "up" | "down" | "vertical" | "oblique";

export type SurfaceRegion = {
  id: string;
  clusterId: string;
  meshFile: string;
  facing: Facing;
  triangles: number;
  /** Triangle offsets in the cluster index buffer. Used to mark the real region. */
  triangleIds: number[];
  area: number;
  minZ: number;
  maxZ: number;
  zSpan: number;
  centroid: Vec3;
  normal: Vec3;
  slopeDeg: number;
  /** Smallest dot product between a member normal and the seed normal. 1 is flat. */
  seedAgreement: number;
  plan: { minX: number; maxX: number; minY: number; maxY: number };
};

export type RegionRelation = {
  id: string;
  kind: "stacked" | "plan-adjacent" | "cross-cluster";
  regionIds: [string, string];
  clusterIds: string[];
  measurements: Record<string, number | string | null>;
  note: string;
};

function facingOf(nz: number): Facing {
  if (nz >= UP_NORMAL) return "up";
  if (nz <= DOWN_NORMAL) return "down";
  if (Math.abs(nz) <= VERTICAL_NORMAL) return "vertical";
  return "oblique";
}

function slopeFromHorizontal(nz: number): number {
  return Math.acos(Math.max(-1, Math.min(1, Math.abs(nz)))) * 180 / Math.PI;
}

function weldIds(positions: Float32Array): Int32Array {
  const map = new Map<string, number>();
  const ids = new Int32Array(positions.length / 3);
  let next = 0;
  for (let vertex = 0; vertex < ids.length; vertex += 1) {
    const key = [
      Math.round(positions[vertex * 3] / WELD),
      Math.round(positions[vertex * 3 + 1] / WELD),
      Math.round(positions[vertex * 3 + 2] / WELD),
    ].join(":");
    let id = map.get(key);
    if (id == null) {
      id = next;
      next += 1;
      map.set(key, id);
    }
    ids[vertex] = id;
  }
  return ids;
}

/** Connected components. Non-adjacent coplanar triangles stay apart. */
export function connectedRegions(
  clusterId: string,
  meshFile: string,
  positions: Float32Array,
  indices: Uint32Array,
): SurfaceRegion[] {
  const triangleCount = indices.length / 3;
  const areas = new Float32Array(triangleCount);
  const normals = new Float32Array(triangleCount * 3);
  const centroids = new Float32Array(triangleCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = indices[triangle * 3] * 3;
    const ib = indices[triangle * 3 + 1] * 3;
    const ic = indices[triangle * 3 + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    areas[triangle] = length / 2;
    centroids[triangle * 3] = (ax + bx + cx) / 3;
    centroids[triangle * 3 + 1] = (ay + by + cy) / 3;
    centroids[triangle * 3 + 2] = (az + bz + cz) / 3;
    if (length < 1e-8) continue;
    normals[triangle * 3] = nx / length;
    normals[triangle * 3 + 1] = ny / length;
    normals[triangle * 3 + 2] = nz / length;
  }

  const weld = weldIds(positions);
  const edges = new Map<number, number[]>();
  const weldCount = weld.reduce((max, id) => Math.max(max, id), 0) + 1;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const a = weld[indices[triangle * 3 + corner]];
      const b = weld[indices[triangle * 3 + ((corner + 1) % 3)]];
      if (a === b) continue;
      const key = Math.min(a, b) * weldCount + Math.max(a, b);
      const list = edges.get(key);
      if (list) list.push(triangle);
      else edges.set(key, [triangle]);
    }
  }
  const neighbors: number[][] = Array.from({ length: triangleCount }, () => []);
  for (const list of edges.values()) {
    if (list.length < 2) continue;
    for (let left = 0; left < list.length; left += 1) {
      for (let right = left + 1; right < list.length; right += 1) {
        neighbors[list[left]].push(list[right]);
        neighbors[list[right]].push(list[left]);
      }
    }
  }

  const order = [...areas].map((area, triangle) => ({ area, triangle })).filter((item) => item.area > 0).sort((left, right) => right.area - left.area);
  const visited = new Uint8Array(triangleCount);
  const regions: SurfaceRegion[] = [];
  for (const seed of order) {
    if (visited[seed.triangle]) continue;
    const sx = normals[seed.triangle * 3];
    const sy = normals[seed.triangle * 3 + 1];
    const sz = normals[seed.triangle * 3 + 2];
    if (sx === 0 && sy === 0 && sz === 0) continue;
    const facing = facingOf(sz);
    const members: number[] = [];
    const queue = [seed.triangle];
    visited[seed.triangle] = 1;
    let area = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let agreement = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const triangle = queue[head];
      members.push(triangle);
      const triArea = areas[triangle];
      area += triArea;
      const tx = centroids[triangle * 3];
      const ty = centroids[triangle * 3 + 1];
      const tz = centroids[triangle * 3 + 2];
      cx += tx * triArea;
      cy += ty * triArea;
      cz += tz * triArea;
      nx += normals[triangle * 3] * triArea;
      ny += normals[triangle * 3 + 1] * triArea;
      nz += normals[triangle * 3 + 2] * triArea;
      minZ = Math.min(minZ, tz);
      maxZ = Math.max(maxZ, tz);
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indices[triangle * 3 + corner] * 3;
        minX = Math.min(minX, positions[vertex]);
        maxX = Math.max(maxX, positions[vertex]);
        minY = Math.min(minY, positions[vertex + 1]);
        maxY = Math.max(maxY, positions[vertex + 1]);
        minZ = Math.min(minZ, positions[vertex + 2]);
        maxZ = Math.max(maxZ, positions[vertex + 2]);
      }
      for (const next of neighbors[triangle]) {
        if (visited[next]) continue;
        const nnx = normals[next * 3];
        const nny = normals[next * 3 + 1];
        const nnz = normals[next * 3 + 2];
        if (facingOf(nnz) !== facing) continue;
        const px = normals[triangle * 3];
        const py = normals[triangle * 3 + 1];
        const pz = normals[triangle * 3 + 2];
        if (nnx * px + nny * py + nnz * pz < LOCAL_CONTINUITY) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    const meanX = nx / length;
    const meanY = ny / length;
    const meanZ = nz / length;
    agreement = 1;
    for (const triangle of members) {
      const dot = normals[triangle * 3] * meanX + normals[triangle * 3 + 1] * meanY + normals[triangle * 3 + 2] * meanZ;
      if (dot < agreement) agreement = dot;
    }
    regions.push({
      id: `${clusterId}:region:${regions.length}`,
      clusterId,
      meshFile,
      facing,
      triangles: members.length,
      triangleIds: members,
      area,
      minZ,
      maxZ,
      zSpan: maxZ - minZ,
      centroid: [cx / area, cy / area, cz / area],
      normal: [nx / length, ny / length, nz / length],
      slopeDeg: slopeFromHorizontal(nz / length),
      seedAgreement: agreement,
      plan: { minX, maxX, minY, maxY },
    });
  }
  return regions;
}

function planOverlap(left: SurfaceRegion, right: SurfaceRegion): number {
  const x = Math.min(left.plan.maxX, right.plan.maxX) - Math.max(left.plan.minX, right.plan.minX);
  const y = Math.min(left.plan.maxY, right.plan.maxY) - Math.max(left.plan.minY, right.plan.minY);
  if (x <= 0 || y <= 0) return 0;
  return x * y;
}

function planGap(left: SurfaceRegion, right: SurfaceRegion): number {
  const x = Math.max(0, Math.max(left.plan.minX, right.plan.minX) - Math.min(left.plan.maxX, right.plan.maxX));
  const y = Math.max(0, Math.max(left.plan.minY, right.plan.minY) - Math.min(left.plan.maxY, right.plan.maxY));
  return Math.hypot(x, y);
}

/** Relationships that require measured overlap, separation, or cross-cluster proximity. */
export function relateRegions(regions: readonly SurfaceRegion[]): RegionRelation[] {
  const relations: RegionRelation[] = [];
  for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
      const left = regions[leftIndex];
      const right = regions[rightIndex];
      if (left.area < 12 || right.area < 12) continue;
      const overlap = planOverlap(left, right);
      const gap = planGap(left, right);
      const rise = Math.abs(left.centroid[2] - right.centroid[2]);
      if (left.clusterId === right.clusterId && overlap > 0 && rise >= 2) {
        relations.push({
          id: `${left.id}__${right.id}:stacked`,
          kind: "stacked",
          regionIds: [left.id, right.id],
          clusterIds: [left.clusterId],
          measurements: {
            planOverlap: Number(overlap.toFixed(1)),
            riseFeet: Number(rise.toFixed(2)),
            upper: left.centroid[2] > right.centroid[2] ? left.id : right.id,
          },
          note: "The regions overlap in plan and their centroids are at different heights. Overlap is not enclosure.",
        });
      } else if (left.clusterId === right.clusterId && left.facing === right.facing && overlap === 0 && gap > 0 && gap <= 6 && rise < 2) {
        relations.push({
          id: `${left.id}__${right.id}:adjacent`,
          kind: "plan-adjacent",
          regionIds: [left.id, right.id],
          clusterIds: [left.clusterId],
          measurements: { planGapFeet: Number(gap.toFixed(2)), riseFeet: Number(rise.toFixed(2)) },
          note: "Same facing and a short plan gap. They do not share an edge, so they were not merged.",
        });
      }
    }
  }
  const clusterIds = [...new Set(regions.map((region) => region.clusterId))];
  for (let leftIndex = 0; leftIndex < clusterIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < clusterIds.length; rightIndex += 1) {
      const leftRegions = regions.filter((region) => region.clusterId === clusterIds[leftIndex] && region.area >= 12);
      const rightRegions = regions.filter((region) => region.clusterId === clusterIds[rightIndex] && region.area >= 12);
      let best: { left: SurfaceRegion; right: SurfaceRegion; gap: number; rise: number } | null = null;
      for (const left of leftRegions) {
        for (const right of rightRegions) {
          const gap = planGap(left, right);
          const rise = Math.abs(left.centroid[2] - right.centroid[2]);
          if (!best || gap < best.gap) best = { left, right, gap, rise };
        }
      }
      if (!best) continue;
      relations.push({
        id: `${clusterIds[leftIndex]}__${clusterIds[rightIndex]}:closest-regions`,
        kind: "cross-cluster",
        regionIds: [best.left.id, best.right.id],
        clusterIds: [clusterIds[leftIndex], clusterIds[rightIndex]],
        measurements: {
          planGapFeet: Number(best.gap.toFixed(2)),
          riseFeet: Number(best.rise.toFixed(2)),
          facingPair: `${best.left.facing}/${best.right.facing}`,
        },
        note: "Closest pair of substantial regions between these clusters. The gap is not a joint or a corridor.",
      });
    }
  }
  return relations;
}
