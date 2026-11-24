/**
 * Milestone 1 geometric reading of an assembled building.
 * Measures the meshes it is given. It does not insert floors, walls, cores, columns, or bridges.
 */
import { boundsOf, type BuildingRequest, type ClusterPlacement, type LoadedCluster, type Vec3 } from "./building";

export const ANALYSIS_CONTRACT = "architectural-interpretation-analysis-v1" as const;

const UP_NORMAL = 0.85;
const DOWN_NORMAL = -0.85;
const VERTICAL_NORMAL = 0.2;
const REGION_XY = 8;
const REGION_Z = 4;
const REGION_MIN_AREA = 8;
const CANDIDATE_MIN_AREA = 24;
const THICKNESS_SAMPLES = 36;
const THICKNESS_OFFSET = 0.08;
const VOXEL = 4;
const CLEARANCE_SLAB = 4;

type Facing = "up" | "down" | "vertical" | "oblique";

export type Finding = {
  id: string;
  support: "measured" | "interpretation";
  topic: "frame" | "orientation" | "slope" | "curvature" | "elevation" | "thickness" | "candidate-surface" | "void" | "clearance" | "relationship" | "failure";
  clusterIds: string[];
  summary: string;
  values: Record<string, number | string | number[] | null>;
  geometryRefs: { clusterId: string; meshFile: string; regionId?: string; triangles?: number }[];
  confidence: "high" | "medium" | "low" | "unsupported";
  limitation: string | null;
};

export type BuildingAnalysis = {
  contract: typeof ANALYSIS_CONTRACT;
  milestone: 1;
  /** This milestone does not generate architectural elements. */
  generatedArchitecture: false;
  predeterminedFloorElevations: false;
  assemblyId: string;
  role: BuildingRequest["role"];
  disclaimer: string;
  frame: BuildingRequest["frame"];
  placementRule: BuildingRequest["placementRule"];
  placements: ClusterPlacement[];
  sources: {
    id: string;
    meshFile: string;
    triangles: number;
    tiles: { instanceId: string; archetypeId: string; moduleId: string; typologyId: string; name: string }[];
    validation: LoadedCluster["validation"];
    localBounds: { min: Vec3; max: Vec3 };
    worldBounds: { min: Vec3; max: Vec3 };
  }[];
  findings: Finding[];
  limitations: string[];
  failures: { clusterId: string | null; code: string; message: string }[];
};

type Accel = {
  cell: number;
  min: Vec3;
  dims: [number, number, number];
  buckets: Map<number, number[]>;
};

type MeshFailure = { code: string; message: string };

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function facingOf(nz: number): Facing {
  if (nz >= UP_NORMAL) return "up";
  if (nz <= DOWN_NORMAL) return "down";
  if (Math.abs(nz) <= VERTICAL_NORMAL) return "vertical";
  return "oblique";
}

function slopeFromHorizontal(nz: number): number {
  const clamped = Math.max(-1, Math.min(1, Math.abs(nz)));
  return Math.acos(clamped) * 180 / Math.PI;
}

function keyOf(x: number, y: number, z: number, dims: [number, number, number]): number {
  return x + dims[0] * (y + dims[1] * z);
}

function buildAccel(positions: Float32Array, indices: Uint32Array, cell: number): Accel {
  const bounds = boundsOf(positions);
  const min: Vec3 = [bounds.min[0] - cell, bounds.min[1] - cell, bounds.min[2] - cell];
  const max: Vec3 = [bounds.max[0] + cell, bounds.max[1] + cell, bounds.max[2] + cell];
  const dims: [number, number, number] = [0, 1, 2].map((axis) => Math.max(1, Math.ceil((max[axis] - min[axis]) / cell))) as [number, number, number];
  const buckets = new Map<number, number[]>();
  const triangleCount = indices.length / 3;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[triangle * 3 + corner] * 3;
      x0 = Math.min(x0, positions[vertex]);
      y0 = Math.min(y0, positions[vertex + 1]);
      z0 = Math.min(z0, positions[vertex + 2]);
      x1 = Math.max(x1, positions[vertex]);
      y1 = Math.max(y1, positions[vertex + 1]);
      z1 = Math.max(z1, positions[vertex + 2]);
    }
    const from = [x0, y0, z0].map((value, axis) => Math.max(0, Math.floor((value - min[axis]) / cell)));
    const to = [x1, y1, z1].map((value, axis) => Math.min(dims[axis] - 1, Math.floor((value - min[axis]) / cell)));
    for (let x = from[0]; x <= to[0]; x += 1) {
      for (let y = from[1]; y <= to[1]; y += 1) {
        for (let z = from[2]; z <= to[2]; z += 1) {
          const key = keyOf(x, y, z, dims);
          const list = buckets.get(key);
          if (list) list.push(triangle);
          else buckets.set(key, [triangle]);
        }
      }
    }
  }
  return { cell, min, dims, buckets };
}

function triangleHit(
  positions: Float32Array,
  indices: Uint32Array,
  triangle: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): number | null {
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
  const px = dy * vz - dz * vy;
  const py = dz * vx - dx * vz;
  const pz = dx * vy - dy * vx;
  const determinant = ux * px + uy * py + uz * pz;
  if (Math.abs(determinant) < 1e-12) return null;
  const inverse = 1 / determinant;
  const sx = ox - ax;
  const sy = oy - ay;
  const sz = oz - az;
  const u = (sx * px + sy * py + sz * pz) * inverse;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const qx = sy * uz - sz * uy;
  const qy = sz * ux - sx * uz;
  const qz = sx * uy - sy * ux;
  const v = (dx * qx + dy * qy + dz * qz) * inverse;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const t = (vx * qx + vy * qy + vz * qz) * inverse;
  return t > 1e-5 ? t : null;
}

function trace(
  accel: Accel,
  positions: Float32Array,
  indices: Uint32Array,
  origin: Vec3,
  direction: Vec3,
  maxT: number,
  mode: "nearest" | "parity",
): number {
  const { cell, min, dims, buckets } = accel;
  let x = Math.floor((origin[0] - min[0]) / cell);
  let y = Math.floor((origin[1] - min[1]) / cell);
  let z = Math.floor((origin[2] - min[2]) / cell);
  const stepX = direction[0] > 0 ? 1 : direction[0] < 0 ? -1 : 0;
  const stepY = direction[1] > 0 ? 1 : direction[1] < 0 ? -1 : 0;
  const stepZ = direction[2] > 0 ? 1 : direction[2] < 0 ? -1 : 0;
  const invX = direction[0] !== 0 ? 1 / direction[0] : Infinity;
  const invY = direction[1] !== 0 ? 1 / direction[1] : Infinity;
  const invZ = direction[2] !== 0 ? 1 / direction[2] : Infinity;
  let tMaxX = direction[0] !== 0 ? ((min[0] + (direction[0] > 0 ? x + 1 : x) * cell) - origin[0]) * invX : Infinity;
  let tMaxY = direction[1] !== 0 ? ((min[1] + (direction[1] > 0 ? y + 1 : y) * cell) - origin[1]) * invY : Infinity;
  let tMaxZ = direction[2] !== 0 ? ((min[2] + (direction[2] > 0 ? z + 1 : z) * cell) - origin[2]) * invZ : Infinity;
  const tDeltaX = direction[0] !== 0 ? Math.abs(cell * invX) : Infinity;
  const tDeltaY = direction[1] !== 0 ? Math.abs(cell * invY) : Infinity;
  const tDeltaZ = direction[2] !== 0 ? Math.abs(cell * invZ) : Infinity;
  let nearest = Infinity;
  const hitTimes: number[] = [];
  const limit = dims[0] + dims[1] + dims[2] + 4;
  for (let step = 0; step < limit; step += 1) {
    if (x >= 0 && y >= 0 && z >= 0 && x < dims[0] && y < dims[1] && z < dims[2]) {
      const list = buckets.get(keyOf(x, y, z, dims));
      if (list) {
        for (const triangle of list) {
          const t = triangleHit(positions, indices, triangle, origin[0], origin[1], origin[2], direction[0], direction[1], direction[2]);
          if (t == null || t > maxT) continue;
          if (mode === "nearest") {
            if (t < nearest) nearest = t;
          } else {
            hitTimes.push(t);
          }
        }
      }
    }
    const next = Math.min(tMaxX, tMaxY, tMaxZ);
    if (next > maxT) break;
    if (mode === "nearest" && next > nearest) break;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  if (mode === "nearest") return nearest;
  hitTimes.sort((left, right) => left - right);
  let count = 0;
  let last = -1;
  for (const time of hitTimes) {
    if (last >= 0 && Math.abs(time - last) < 1e-3) continue;
    count += 1;
    last = time;
  }
  return count;
}

function worldPositions(cluster: LoadedCluster, placement: ClusterPlacement): Float32Array {
  const out = new Float32Array(cluster.positions.length);
  const [tx, ty, tz] = placement.translation;
  for (let index = 0; index < cluster.positions.length; index += 3) {
    out[index] = cluster.positions[index] + tx;
    out[index + 1] = cluster.positions[index + 1] + ty;
    out[index + 2] = cluster.positions[index + 2] + tz;
  }
  return out;
}

function meshProblems(cluster: LoadedCluster): MeshFailure[] {
  const problems: MeshFailure[] = [];
  if (cluster.positions.length < 9 || cluster.indices.length < 3) {
    problems.push({ code: "empty-mesh", message: "The mesh does not contain a triangle." });
  }
  if (cluster.indices.length % 3 !== 0) {
    problems.push({ code: "bad-indices", message: "Triangle indices are not a multiple of three." });
  }
  for (let index = 0; index < cluster.positions.length; index += 1) {
    if (!Number.isFinite(cluster.positions[index])) {
      problems.push({ code: "non-finite", message: "A vertex coordinate is not finite." });
      break;
    }
  }
  const vertexCount = cluster.positions.length / 3;
  for (let index = 0; index < cluster.indices.length; index += 1) {
    if (cluster.indices[index] >= vertexCount) {
      problems.push({ code: "bad-indices", message: "A triangle index points past the vertex list." });
      break;
    }
  }
  return problems;
}

function signedVolume(positions: Float32Array, indices: Uint32Array): number {
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

type Region = {
  id: string;
  facing: Facing;
  triangles: number;
  area: number;
  variation: number;
  minZ: number;
  maxZ: number;
  centroid: Vec3;
  normal: Vec3;
};

function analyzeCluster(
  cluster: LoadedCluster,
  placement: ClusterPlacement,
  findings: Finding[],
  failures: BuildingAnalysis["failures"],
): { world: Float32Array; worldBounds: { min: Vec3; max: Vec3 }; accel: Accel | null } {
  const problems = meshProblems(cluster);
  const ref = { clusterId: cluster.id, meshFile: cluster.meshFile };
  if (problems.length > 0) {
    for (const problem of problems) {
      failures.push({ clusterId: cluster.id, code: problem.code, message: problem.message });
      findings.push({
        id: `${cluster.id}:${problem.code}`,
        support: "measured",
        topic: "failure",
        clusterIds: [cluster.id],
        summary: problem.message,
        values: { code: problem.code },
        geometryRefs: [ref],
        confidence: "high",
        limitation: "No surface, thickness, void, or clearance claim is made for this mesh.",
      });
    }
    return { world: worldPositions(cluster, placement), worldBounds: boundsOf(cluster.positions), accel: null };
  }

  const world = worldPositions(cluster, placement);
  const localBounds = boundsOf(cluster.positions);
  const worldBounds = boundsOf(world);
  const volume = signedVolume(world, cluster.indices);
  const triangleCount = cluster.indices.length / 3;
  const vertexNormals = new Float32Array(cluster.positions.length);
  const areas = new Float32Array(triangleCount);
  const normals = new Float32Array(triangleCount * 3);
  const centroids = new Float32Array(triangleCount * 3);
  let surfaceArea = 0;
  let zeroArea = 0;
  const slopeArea: Record<Facing, number> = { up: 0, down: 0, vertical: 0, oblique: 0 };
  const upwardZ: number[] = [];

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = cluster.indices[triangle * 3] * 3;
    const ib = cluster.indices[triangle * 3 + 1] * 3;
    const ic = cluster.indices[triangle * 3 + 2] * 3;
    const ax = world[ia];
    const ay = world[ia + 1];
    const az = world[ia + 2];
    const bx = world[ib];
    const by = world[ib + 1];
    const bz = world[ib + 2];
    const cx = world[ic];
    const cy = world[ic + 1];
    const cz = world[ic + 2];
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
    const area = length / 2;
    areas[triangle] = area;
    centroids[triangle * 3] = (ax + bx + cx) / 3;
    centroids[triangle * 3 + 1] = (ay + by + cy) / 3;
    centroids[triangle * 3 + 2] = (az + bz + cz) / 3;
    if (length < 1e-8) {
      zeroArea += 1;
      continue;
    }
    nx /= length;
    ny /= length;
    nz /= length;
    normals[triangle * 3] = nx;
    normals[triangle * 3 + 1] = ny;
    normals[triangle * 3 + 2] = nz;
    surfaceArea += area;
    slopeArea[facingOf(nz)] += area;
    if (nz >= UP_NORMAL) upwardZ.push(centroids[triangle * 3 + 2]);
    for (const vertex of [ia, ib, ic]) {
      vertexNormals[vertex] += nx * area;
      vertexNormals[vertex + 1] += ny * area;
      vertexNormals[vertex + 2] += nz * area;
    }
  }

  for (let vertex = 0; vertex < vertexNormals.length; vertex += 3) {
    const length = Math.hypot(vertexNormals[vertex], vertexNormals[vertex + 1], vertexNormals[vertex + 2]);
    if (length < 1e-8) continue;
    vertexNormals[vertex] /= length;
    vertexNormals[vertex + 1] /= length;
    vertexNormals[vertex + 2] /= length;
  }

  const regions = new Map<string, Region>();
  let variationSum = 0;
  let variationArea = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const area = areas[triangle];
    if (area <= 0) continue;
    const nx = normals[triangle * 3];
    const ny = normals[triangle * 3 + 1];
    const nz = normals[triangle * 3 + 2];
    let variation = 0;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = cluster.indices[triangle * 3 + corner] * 3;
      const dot = vertexNormals[vertex] * nx + vertexNormals[vertex + 1] * ny + vertexNormals[vertex + 2] * nz;
      variation += Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }
    variation /= 3;
    variationSum += variation * area;
    variationArea += area;
    const cx = centroids[triangle * 3];
    const cy = centroids[triangle * 3 + 1];
    const cz = centroids[triangle * 3 + 2];
    const facing = facingOf(nz);
    const id = `${cluster.id}:${facing}:${Math.floor(cx / REGION_XY)}:${Math.floor(cy / REGION_XY)}:${Math.floor(cz / REGION_Z)}`;
    const existing = regions.get(id);
    if (!existing) {
      regions.set(id, { id, facing, triangles: 1, area, variation: variation * area, minZ: cz, maxZ: cz, centroid: [cx * area, cy * area, cz * area], normal: [nx * area, ny * area, nz * area] });
    } else {
      existing.triangles += 1;
      existing.area += area;
      existing.variation += variation * area;
      existing.minZ = Math.min(existing.minZ, cz);
      existing.maxZ = Math.max(existing.maxZ, cz);
      existing.centroid[0] += cx * area;
      existing.centroid[1] += cy * area;
      existing.centroid[2] += cz * area;
      existing.normal[0] += nx * area;
      existing.normal[1] += ny * area;
      existing.normal[2] += nz * area;
    }
  }

  const kept = [...regions.values()].filter((region) => region.area >= REGION_MIN_AREA);
  for (const region of kept) {
    const area = region.area;
    region.variation /= area;
    region.centroid = [region.centroid[0] / area, region.centroid[1] / area, region.centroid[2] / area];
    const length = Math.hypot(region.normal[0], region.normal[1], region.normal[2]) || 1;
    region.normal = [region.normal[0] / length, region.normal[1] / length, region.normal[2] / length];
  }
  kept.sort((left, right) => right.area - left.area);

  findings.push({
    id: `${cluster.id}:orientation`,
    support: "measured",
    topic: "orientation",
    clusterIds: [cluster.id],
    summary: volume > 0
      ? "Signed volume is positive, which matches an outward right-handed winding in this frame."
      : "Signed volume is not positive, so winding cannot be treated as outward.",
    values: {
      signedVolume: round(volume, 2),
      storedVolume: cluster.validation.volume,
      zeroAreaTriangles: zeroArea,
      surfaceArea: round(surfaceArea, 1),
      minZ: round(worldBounds.min[2], 4),
      span: [round(worldBounds.max[0] - worldBounds.min[0]), round(worldBounds.max[1] - worldBounds.min[1]), round(worldBounds.max[2] - worldBounds.min[2])],
    },
    geometryRefs: [{ ...ref, triangles: triangleCount }],
    confidence: volume > 0 ? "high" : "low",
    limitation: "Agreement between a face normal and the direction away from the vertex centroid is not used. These meshes are concave, so that test does not prove winding.",
  });

  if (cluster.validation.volume != null && Math.abs(volume - cluster.validation.volume) / cluster.validation.volume > 0.02) {
    failures.push({
      clusterId: cluster.id,
      code: "volume-mismatch",
      message: `Signed volume ${volume.toFixed(2)} differs from the stored validation volume ${cluster.validation.volume}.`,
    });
  }

  const meanVariation = variationArea > 0 ? variationSum / variationArea : null;
  findings.push({
    id: `${cluster.id}:slope`,
    support: "measured",
    topic: "slope",
    clusterIds: [cluster.id],
    summary: "Surface area grouped by normal. Up and down require a normal within about 32 degrees of vertical. Vertical faces are within about 12 degrees of a vertical plane.",
    values: {
      upArea: round(slopeArea.up, 1),
      downArea: round(slopeArea.down, 1),
      verticalArea: round(slopeArea.vertical, 1),
      obliqueArea: round(slopeArea.oblique, 1),
      upFraction: surfaceArea > 0 ? round(slopeArea.up / surfaceArea, 3) : null,
    },
    geometryRefs: [{ ...ref, triangles: triangleCount }],
    confidence: surfaceArea > 0 ? "high" : "unsupported",
    limitation: "A horizontal triangle is a slope measurement. It is not evidence that the surface can be occupied.",
  });

  findings.push({
    id: `${cluster.id}:curvature`,
    support: "measured",
    topic: "curvature",
    clusterIds: [cluster.id],
    summary: "Local bending is the area-weighted mean angle between a face normal and the vertex normals around it.",
    values: { meanNormalVariationDeg: meanVariation == null ? null : round(meanVariation, 2), regionCount: kept.length },
    geometryRefs: [{ ...ref, triangles: triangleCount }],
    confidence: meanVariation == null ? "unsupported" : "medium",
    limitation: "This is normal variation in degrees, not a fitted curvature radius and not a structural stress.",
  });

  const upwardElevations = upwardZ.length > 0;
  findings.push({
    id: `${cluster.id}:elevation`,
    support: "measured",
    topic: "elevation",
    clusterIds: [cluster.id],
    summary: upwardElevations
      ? "Elevations are the vertical range of the mesh and the centroid heights of upward-facing triangles."
      : "The mesh has a vertical range. It does not have enough upward-facing area to describe a surface elevation.",
    values: {
      minZ: round(worldBounds.min[2], 3),
      maxZ: round(worldBounds.max[2], 3),
      upwardP10: percentile(upwardZ, 0.1) == null ? null : round(percentile(upwardZ, 0.1) as number, 2),
      upwardMedian: percentile(upwardZ, 0.5) == null ? null : round(percentile(upwardZ, 0.5) as number, 2),
      upwardP90: percentile(upwardZ, 0.9) == null ? null : round(percentile(upwardZ, 0.9) as number, 2),
      upwardTriangles: upwardZ.length,
    },
    geometryRefs: [{ ...ref, triangles: upwardZ.length }],
    confidence: upwardElevations ? "high" : "low",
    limitation: "These heights are not story levels. Nothing in this measurement sets a floor elevation.",
  });

  const accel = buildAccel(world, cluster.indices, VOXEL);
  const ranked = [...areas].map((area, triangle) => ({ area, triangle })).filter((item) => item.area > 0).sort((left, right) => right.area - left.area);
  const step = Math.max(1, Math.floor(ranked.length / THICKNESS_SAMPLES));
  const thicknesses: number[] = [];
  let thicknessMisses = 0;
  const diagonal = Math.hypot(worldBounds.max[0] - worldBounds.min[0], worldBounds.max[1] - worldBounds.min[1], worldBounds.max[2] - worldBounds.min[2]);
  for (let sample = 0; sample < ranked.length && thicknesses.length + thicknessMisses < THICKNESS_SAMPLES; sample += step) {
    const triangle = ranked[sample].triangle;
    const nx = normals[triangle * 3];
    const ny = normals[triangle * 3 + 1];
    const nz = normals[triangle * 3 + 2];
    if (nx === 0 && ny === 0 && nz === 0) continue;
    const origin: Vec3 = [
      centroids[triangle * 3] - nx * THICKNESS_OFFSET,
      centroids[triangle * 3 + 1] - ny * THICKNESS_OFFSET,
      centroids[triangle * 3 + 2] - nz * THICKNESS_OFFSET,
    ];
    const hit = trace(accel, world, cluster.indices, origin, [-nx, -ny, -nz], diagonal, "nearest");
    if (!Number.isFinite(hit)) thicknessMisses += 1;
    else thicknesses.push(hit + THICKNESS_OFFSET);
  }
  const medianThickness = percentile(thicknesses, 0.5);
  findings.push({
    id: `${cluster.id}:thickness`,
    support: "measured",
    topic: "thickness",
    clusterIds: [cluster.id],
    summary: thicknesses.length > 0
      ? "Thickness samples step inward along the face normal and stop at the next surface."
      : "Inward samples did not meet another surface, so thickness is not reported.",
    values: {
      samples: thicknesses.length + thicknessMisses,
      hits: thicknesses.length,
      misses: thicknessMisses,
      medianFeet: medianThickness == null ? null : round(medianThickness, 2),
      p10Feet: percentile(thicknesses, 0.1) == null ? null : round(percentile(thicknesses, 0.1) as number, 2),
      p90Feet: percentile(thicknesses, 0.9) == null ? null : round(percentile(thicknesses, 0.9) as number, 2),
      offsetFeet: THICKNESS_OFFSET,
    },
    geometryRefs: [{ ...ref, triangles: thicknesses.length }],
    confidence: thicknesses.length >= THICKNESS_SAMPLES * 0.6 ? "medium" : "low",
    limitation: "A miss can be a gap, a grazing angle, or a ray that leaves through an opening. Median thickness is not a wall or slab specification.",
  });

  const candidates = kept.filter((region) => region.facing === "up" && region.area >= CANDIDATE_MIN_AREA).slice(0, 8);
  if (candidates.length === 0) {
    findings.push({
      id: `${cluster.id}:candidates-none`,
      support: "measured",
      topic: "candidate-surface",
      clusterIds: [cluster.id],
      summary: "No upward region reached the area needed to record a candidate surface.",
      values: { minimumArea: CANDIDATE_MIN_AREA },
      geometryRefs: [ref],
      confidence: "high",
      limitation: "Absence of a candidate region is not a claim that the cluster has no usable space.",
    });
  }
  for (const region of candidates) {
    const zSpan = region.maxZ - region.minZ;
    const geometric: Finding["confidence"] = region.area >= 80 && zSpan <= 2 && region.variation <= 8
      ? "high"
      : region.area >= 40 && zSpan <= 4 && region.variation <= 15
        ? "medium"
        : "low";
    findings.push({
      id: `${region.id}:measured`,
      support: "measured",
      topic: "candidate-surface",
      clusterIds: [cluster.id],
      summary: "An upward local region large enough to inspect. The bin is 8 feet in plan and 4 feet vertically.",
      values: {
        area: round(region.area, 1),
        minZ: round(region.minZ, 2),
        maxZ: round(region.maxZ, 2),
        zSpan: round(zSpan, 2),
        slopeDeg: round(slopeFromHorizontal(region.normal[2]), 1),
        normalVariationDeg: round(region.variation, 2),
        centroid: region.centroid.map((value) => round(value, 2)),
        normal: region.normal.map((value) => round(value, 3)),
        triangles: region.triangles,
      },
      geometryRefs: [{ ...ref, regionId: region.id, triangles: region.triangles }],
      confidence: geometric,
      limitation: "The region is a spatial bin of similar triangles, not a traced surface boundary.",
    });
    findings.push({
      id: `${region.id}:interpretation`,
      support: "interpretation",
      topic: "candidate-surface",
      clusterIds: [cluster.id],
      summary: "This upward region could be read as a place that might accept occupation or adaptation. The mesh does not establish access, enclosure, load, or a floor.",
      values: { regionId: region.id, area: round(region.area, 1) },
      geometryRefs: [{ ...ref, regionId: region.id, triangles: region.triangles }],
      confidence: "unsupported",
      limitation: "Occupancy and adaptation remain unverified architectural readings.",
    });
  }

  const parity = probeVoids(cluster, world, cluster.indices, accel, worldBounds, findings);
  if (!parity) {
    failures.push({
      clusterId: cluster.id,
      code: "parity-unreliable",
      message: "Inside and outside samples disagreed, so enclosed-void and overhang counts were withheld.",
    });
  }

  return { world, worldBounds, accel };
}

function probeVoids(
  cluster: LoadedCluster,
  positions: Float32Array,
  indices: Uint32Array,
  accel: Accel,
  bounds: { min: Vec3; max: Vec3 },
  findings: Finding[],
): boolean {
  const inwardHits: boolean[] = [];
  let considered = 0;
  const triangleCount = indices.length / 3;
  for (let triangle = 0; triangle < triangleCount && considered < 6; triangle += Math.max(1, Math.floor(triangleCount / 6))) {
    const ia = indices[triangle * 3] * 3;
    const ib = indices[triangle * 3 + 1] * 3;
    const ic = indices[triangle * 3 + 2] * 3;
    const ux = positions[ib] - positions[ia];
    const uy = positions[ib + 1] - positions[ia + 1];
    const uz = positions[ib + 2] - positions[ia + 2];
    const vx = positions[ic] - positions[ia];
    const vy = positions[ic + 1] - positions[ia + 1];
    const vz = positions[ic + 2] - positions[ia + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-6) continue;
    nx /= length;
    ny /= length;
    nz /= length;
    const origin: Vec3 = [
      (positions[ia] + positions[ib] + positions[ic]) / 3 - nx * 0.35,
      (positions[ia + 1] + positions[ib + 1] + positions[ic + 1]) / 3 - ny * 0.35,
      (positions[ia + 2] + positions[ib + 2] + positions[ic + 2]) / 3 - nz * 0.35,
    ];
    const crossings = trace(accel, positions, indices, origin, [1, 0.017, 0.011], 1e6, "parity");
    inwardHits.push(crossings % 2 === 1);
    considered += 1;
  }
  const insideVotes = inwardHits.filter(Boolean).length;
  const reliable = inwardHits.length >= 4 && (insideVotes === inwardHits.length || insideVotes === 0);
  const ref = { clusterId: cluster.id, meshFile: cluster.meshFile };
  if (!reliable) {
    findings.push({
      id: `${cluster.id}:void-withheld`,
      support: "measured",
      topic: "void",
      clusterIds: [cluster.id],
      summary: "A short inward step did not agree on inside/outside parity, so void cells and overhang clearances are not counted.",
      values: { inwardSamples: inwardHits.length, insideVotes, storedCavities: cluster.validation.cavities },
      geometryRefs: [ref],
      confidence: "unsupported",
      limitation: "Stored Skill 6 cavity counts remain a separate record. They are not reclassified as rooms.",
    });
    return false;
  }
  if (insideVotes === 0) {
    findings.push({
      id: `${cluster.id}:winding-void`,
      support: "measured",
      topic: "void",
      clusterIds: [cluster.id],
      summary: "Inward samples read as outside. Normals may face inward, so void and clearance probes would be reversed and are withheld.",
      values: { inwardSamples: inwardHits.length, storedCavities: cluster.validation.cavities },
      geometryRefs: [ref],
      confidence: "low",
      limitation: "No enclosed room is inferred from this failure.",
    });
    return false;
  }

  const pitch = VOXEL;
  const origin: Vec3 = [bounds.min[0] + pitch * 0.5, bounds.min[1] + pitch * 0.5, bounds.min[2] + pitch * 0.5];
  const counts: [number, number, number] = [0, 1, 2].map((axis) => Math.max(1, Math.ceil((bounds.max[axis] - bounds.min[axis]) / pitch))) as [number, number, number];
  const outside: boolean[] = [];
  const clearances: number[] = [];
  for (let z = 0; z < counts[2]; z += 1) {
    for (let y = 0; y < counts[1]; y += 1) {
      for (let x = 0; x < counts[0]; x += 1) {
        const point: Vec3 = [origin[0] + x * pitch, origin[1] + y * pitch, origin[2] + z * pitch];
        const crossings = trace(accel, positions, indices, point, [1, 0.017, 0.011], 1e6, "parity");
        const isOutside = crossings % 2 === 0;
        outside.push(isOutside);
        if (!isOutside) continue;
        const above = trace(accel, positions, indices, point, [0, 0, 1], bounds.max[2] - point[2] + pitch, "nearest");
        if (Number.isFinite(above)) clearances.push(above);
      }
    }
  }
  const total = outside.length;
  const seen = new Uint8Array(total);
  const queue: number[] = [];
  const indexOf = (x: number, y: number, z: number) => x + counts[0] * (y + counts[1] * z);
  for (let z = 0; z < counts[2]; z += 1) {
    for (let y = 0; y < counts[1]; y += 1) {
      for (let x = 0; x < counts[0]; x += 1) {
        const edge = x === 0 || y === 0 || z === 0 || x === counts[0] - 1 || y === counts[1] - 1 || z === counts[2] - 1;
        const cell = indexOf(x, y, z);
        if (edge && outside[cell] && !seen[cell]) {
          seen[cell] = 1;
          queue.push(cell);
        }
      }
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    const z = Math.floor(cell / (counts[0] * counts[1]));
    const remainder = cell - z * counts[0] * counts[1];
    const y = Math.floor(remainder / counts[0]);
    const x = remainder - y * counts[0];
    const neighbors = [[x - 1, y, z], [x + 1, y, z], [x, y - 1, z], [x, y + 1, z], [x, y, z - 1], [x, y, z + 1]];
    for (const [nx, ny, nz] of neighbors) {
      if (nx < 0 || ny < 0 || nz < 0 || nx >= counts[0] || ny >= counts[1] || nz >= counts[2]) continue;
      const next = indexOf(nx, ny, nz);
      if (!outside[next] || seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  let enclosed = 0;
  outside.forEach((isOutside, cell) => {
    if (isOutside && !seen[cell]) enclosed += 1;
  });
  const grazing = clearances.filter((value) => value < 0.5);
  const usableClearances = clearances.filter((value) => value >= 0.5);
  const medianClearance = percentile(usableClearances, 0.5);
  findings.push({
    id: `${cluster.id}:void`,
    support: "measured",
    topic: "void",
    clusterIds: [cluster.id],
    summary: enclosed === 0
      ? "No probe cell inside the bounds was outside the mesh and sealed off from the grid boundary."
      : "Some probe cells are outside the mesh and disconnected from the grid boundary at this pitch.",
    values: {
      pitchFeet: pitch,
      cells: total,
      enclosedCells: enclosed,
      enclosedVolumeEstimate: enclosed * pitch ** 3,
      storedCavities: cluster.validation.cavities,
      overhangSamples: usableClearances.length,
      overhangGrazingRejected: grazing.length,
      overhangMedianFeet: medianClearance == null ? null : round(medianClearance, 2),
      overhangMinFeet: usableClearances.length === 0 ? null : round(Math.min(...usableClearances), 2),
    },
    geometryRefs: [ref],
    confidence: "low",
    limitation: "A 4-foot probe cannot see smaller pockets. An enclosed cell is a discretization candidate, not a room. Clearances under 0.5 feet are rejected as cells grazing the surface. A remaining clearance is not a floor-to-floor height. Empty space in the bounding box is not counted as enclosed volume.",
  });
  findings.push({
    id: `${cluster.id}:void-reading`,
    support: "interpretation",
    topic: "void",
    clusterIds: [cluster.id],
    summary: "Open exterior cells and any sealed probe cells can be read as recesses, overhangs, or pockets. The measurement does not identify a passage, a court, or a habitable void.",
    values: { enclosedCells: enclosed, overhangSamples: clearances.length },
    geometryRefs: [ref],
    confidence: "unsupported",
    limitation: "Spatial use of a void is not decided by the probe.",
  });
  return true;
}

function intervalBlocked(
  axis: "X" | "Y" | "Z",
  left: { min: Vec3; max: Vec3 },
  right: { min: Vec3; max: Vec3 },
  ids: string[],
  worlds: Map<string, { bounds: { min: Vec3; max: Vec3 } }>,
): string | null {
  const index = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
  const low = Math.min(left.max[index], right.max[index]);
  const high = Math.max(left.min[index], right.min[index]);
  for (const [id, world] of worlds) {
    if (ids.includes(id)) continue;
    if (world.bounds.max[index] > low + 1e-3 && world.bounds.min[index] < high - 1e-3) return id;
  }
  return null;
}

function aabbGap(left: { min: Vec3; max: Vec3 }, right: { min: Vec3; max: Vec3 }): { axis: "X" | "Y" | "Z" | null; gap: number; overlap: boolean } {
  const gaps: [number, "X" | "Y" | "Z"][] = [
    [right.min[0] - left.max[0], "X"],
    [left.min[0] - right.max[0], "X"],
    [right.min[1] - left.max[1], "Y"],
    [left.min[1] - right.max[1], "Y"],
    [right.min[2] - left.max[2], "Z"],
    [left.min[2] - right.max[2], "Z"],
  ];
  const positive = gaps.filter((item) => item[0] > 1e-4);
  if (positive.length === 0) return { axis: null, gap: 0, overlap: true };
  const strongest = positive.reduce((best, item) => item[0] > best[0] ? item : best);
  return { axis: strongest[1], gap: strongest[0], overlap: false };
}

function extremeVertices(positions: Float32Array, bounds: { min: Vec3; max: Vec3 }, axis: 0 | 1 | 2, highSide: boolean): number[] {
  const limit = highSide ? bounds.max[axis] - CLEARANCE_SLAB : bounds.min[axis] + CLEARANCE_SLAB;
  const found: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    const value = positions[index + axis];
    if (highSide ? value >= limit : value <= limit) found.push(index);
  }
  found.sort((left, right) => highSide ? positions[right + axis] - positions[left + axis] : positions[left + axis] - positions[right + axis]);
  return found.slice(0, 60);
}

/** Closest pair of vertices on the facing slabs. A vertex pair is farther than or equal to the surface clearance. */
function vertexUpperBound(
  left: Float32Array,
  leftBounds: { min: Vec3; max: Vec3 },
  right: Float32Array,
  rightBounds: { min: Vec3; max: Vec3 },
  axis: 0 | 1 | 2,
): number | null {
  const leftHigh = leftBounds.max[axis] <= rightBounds.min[axis];
  const leftVerts = extremeVertices(left, leftBounds, axis, leftHigh);
  const rightVerts = extremeVertices(right, rightBounds, axis, !leftHigh);
  if (leftVerts.length === 0 || rightVerts.length === 0) return null;
  let best = Infinity;
  for (const ia of leftVerts) {
    for (const ib of rightVerts) {
      const distance = Math.hypot(left[ia] - right[ib], left[ia + 1] - right[ib + 1], left[ia + 2] - right[ib + 2]);
      if (distance < best) best = distance;
    }
  }
  return Number.isFinite(best) ? best : null;
}

function relationships(
  request: BuildingRequest,
  worlds: Map<string, { positions: Float32Array; bounds: { min: Vec3; max: Vec3 } }>,
  findings: Finding[],
) {
  for (let leftIndex = 0; leftIndex < request.clusters.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < request.clusters.length; rightIndex += 1) {
      const left = request.clusters[leftIndex];
      const right = request.clusters[rightIndex];
      const leftWorld = worlds.get(left.id);
      const rightWorld = worlds.get(right.id);
      if (!leftWorld || !rightWorld) continue;
      if (![...leftWorld.bounds.min, ...leftWorld.bounds.max, ...rightWorld.bounds.min, ...rightWorld.bounds.max].every(Number.isFinite)) {
        findings.push({
          id: `${left.id}__${right.id}:clearance-skipped`,
          support: "measured",
          topic: "failure",
          clusterIds: [left.id, right.id],
          summary: "Clearance was not measured because a cluster bound is not finite.",
          values: {},
          geometryRefs: [],
          confidence: "high",
          limitation: "No gap was invented for invalid geometry.",
        });
        continue;
      }
      const gap = aabbGap(leftWorld.bounds, rightWorld.bounds);
      const leftCentroid = centroidOf(leftWorld.bounds);
      const rightCentroid = centroidOf(rightWorld.bounds);
      const delta: Vec3 = [rightCentroid[0] - leftCentroid[0], rightCentroid[1] - leftCentroid[1], rightCentroid[2] - leftCentroid[2]];
      const horizontal = Math.hypot(delta[0], delta[1]);
      const overlapZ = Math.min(leftWorld.bounds.max[2], rightWorld.bounds.max[2]) - Math.max(leftWorld.bounds.min[2], rightWorld.bounds.min[2]);
      const ids = [left.id, right.id];
      const blocker = !gap.overlap && gap.axis ? intervalBlocked(gap.axis, leftWorld.bounds, rightWorld.bounds, ids, worlds) : null;
      const open = !gap.overlap && blocker == null;
      let upper: number | null = null;
      if (open && gap.axis) {
        const axis = gap.axis === "X" ? 0 : gap.axis === "Y" ? 1 : 2;
        upper = vertexUpperBound(leftWorld.positions, leftWorld.bounds, rightWorld.positions, rightWorld.bounds, axis);
      }
      const refs = [left, right].map((cluster) => ({ clusterId: cluster.id, meshFile: cluster.meshFile }));
      findings.push({
        id: `${left.id}__${right.id}:relation`,
        support: "measured",
        topic: "relationship",
        clusterIds: ids,
        summary: "Centroid offset, shared vertical range, and axis-aligned separation between two clusters that remain separate meshes.",
        values: {
          centroidDelta: delta.map((value) => round(value, 2)),
          horizontalCentroidFeet: round(horizontal, 2),
          verticalOverlapFeet: round(overlapZ, 2),
          boundsOverlap: gap.overlap ? 1 : 0,
          separatingAxis: gap.axis,
          boundsGapFeet: round(gap.gap, 3),
        },
        geometryRefs: refs,
        confidence: "high",
        limitation: "Shared vertical range means the height intervals overlap. It does not mean the clusters share a floor or a structure.",
      });
      findings.push({
        id: `${left.id}__${right.id}:clearance`,
        support: "measured",
        topic: "clearance",
        clusterIds: ids,
        summary: gap.overlap
          ? "Axis-aligned bounds overlap, so the bounds gap is not a clearance. Surface clearance was not reduced to one number."
          : blocker
            ? `${blocker} occupies the interval between these bounds, so the separation is not an open clearance.`
            : "The bounds gap is a lower bound on open surface clearance. The upper bound is the closest sampled vertex pair on the facing 4-foot slabs.",
        values: {
          openInterval: open ? 1 : 0,
          blockedBy: blocker,
          boundsGapFeet: round(gap.gap, 3),
          lowerFeet: open ? round(gap.gap, 3) : null,
          upperFeet: open && upper != null ? round(upper, 2) : null,
          intervalFeet: open && upper != null ? round(upper - gap.gap, 2) : null,
        },
        geometryRefs: refs,
        confidence: blocker ? "high" : open && upper != null && upper - gap.gap < 2 ? "high" : open && upper != null ? "medium" : "low",
        limitation: gap.overlap
          ? "Overlapping bounds can still hide a surface gap. That gap is not claimed here."
          : blocker
            ? "Distance between the outer meshes is not reported as available clearance while another cluster sits between them."
            : "The upper bound samples vertices on a 4-foot slab. A closer point between samples would narrow the interval, not overturn the bounds gap.",
      });
      findings.push({
        id: `${left.id}__${right.id}:reading`,
        support: "interpretation",
        topic: "relationship",
        clusterIds: ids,
        summary: gap.overlap
          ? "Overlapping bounds can be read as a possible interlock, but this fixture does not establish contact, a joint, or a shared room."
          : blocker
            ? "The outer pair is separated by another morphology. That arrangement is not a passage through the middle cluster."
            : "The open interval can be read as separation between morphologies. It is not measured as a passage, a court, or a connector.",
        values: { boundsGapFeet: round(gap.gap, 3), openInterval: open ? 1 : 0 },
        geometryRefs: refs,
        confidence: "unsupported",
        limitation: "No architectural link is introduced to close or occupy this interval.",
      });
    }
  }
}

function centroidOf(bounds: { min: Vec3; max: Vec3 }): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function placementProblems(request: BuildingRequest): MeshFailure[] {
  const problems: MeshFailure[] = [];
  const ids = new Set(request.clusters.map((cluster) => cluster.id));
  if (request.placements.length !== request.clusters.length) {
    problems.push({ code: "placement-mismatch", message: "Each cluster needs one placement transform." });
  }
  for (const placement of request.placements) {
    if (!ids.has(placement.clusterId)) problems.push({ code: "placement-mismatch", message: `${placement.clusterId} is placed but not loaded.` });
    if (placement.scale.some((value) => value !== 1)) problems.push({ code: "unexpected-scale", message: `${placement.clusterId} is scaled. Milestone 1 does not rescale clusters.` });
  }
  return problems;
}

/** Median inward thickness, using the same sample as the assembly report. Null when the rays miss. */
export function medianInwardThickness(positions: Float32Array, indices: Uint32Array): number | null {
  const triangleCount = indices.length / 3;
  if (triangleCount < 1) return null;
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
  const accel = buildAccel(positions, indices, VOXEL);
  const ranked = [...areas].map((area, triangle) => ({ area, triangle })).filter((item) => item.area > 0).sort((left, right) => right.area - left.area);
  const step = Math.max(1, Math.floor(ranked.length / THICKNESS_SAMPLES));
  const thicknesses: number[] = [];
  const bounds = boundsOf(positions);
  const diagonal = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  for (let sample = 0; sample < ranked.length && thicknesses.length < THICKNESS_SAMPLES; sample += step) {
    const triangle = ranked[sample].triangle;
    const nx = normals[triangle * 3];
    const ny = normals[triangle * 3 + 1];
    const nz = normals[triangle * 3 + 2];
    if (nx === 0 && ny === 0 && nz === 0) continue;
    const origin: Vec3 = [
      centroids[triangle * 3] - nx * THICKNESS_OFFSET,
      centroids[triangle * 3 + 1] - ny * THICKNESS_OFFSET,
      centroids[triangle * 3 + 2] - nz * THICKNESS_OFFSET,
    ];
    const hit = trace(accel, positions, indices, origin, [-nx, -ny, -nz], diagonal, "nearest");
    if (Number.isFinite(hit)) thicknesses.push(hit + THICKNESS_OFFSET);
  }
  return percentile(thicknesses, 0.5);
}

/** True when a parity ray reads the point as inside. Null when the point is not finite. */
export function meshContains(positions: Float32Array, indices: Uint32Array, point: Vec3): boolean | null {
  if (!point.every(Number.isFinite)) return null;
  const accel = buildAccel(positions, indices, VOXEL);
  const crossings = trace(accel, positions, indices, point, [1, 0.017, 0.011], 1e6, "parity");
  return crossings % 2 === 1;
}

/** Reads a building request. Source meshes stay intact; world positions are a translated copy used only for measurement. */
export function analyzeBuilding(request: BuildingRequest): BuildingAnalysis {
  const findings: Finding[] = [];
  const failures: BuildingAnalysis["failures"] = [];
  for (const problem of placementProblems(request)) {
    failures.push({ clusterId: null, code: problem.code, message: problem.message });
    findings.push({
      id: problem.code,
      support: "measured",
      topic: "failure",
      clusterIds: [],
      summary: problem.message,
      values: { code: problem.code },
      geometryRefs: [],
      confidence: "high",
      limitation: "The building was not given a substitute arrangement.",
    });
  }
  findings.push({
    id: "frame",
    support: "measured",
    topic: "frame",
    clusterIds: request.clusters.map((cluster) => cluster.id),
    summary: "One analysis frame: X and Y horizontal, Z vertical, 1 Skill 6 unit = 1 foot. Stored Skill 6 meshes are already Z-up, so no axis conversion and no per-cluster scale are applied.",
    values: {
      skill6UnitToFoot: request.frame.skill6UnitToFoot,
      moduleRegistrationFeet: request.frame.moduleRegistrationFeet,
      axisConversionApplied: request.frame.axisConversionApplied ? 1 : 0,
      scaleApplied: request.frame.scaleApplied ? 1 : 0,
    },
    geometryRefs: request.clusters.map((cluster) => ({ clusterId: cluster.id, meshFile: cluster.meshFile })),
    confidence: "high",
    limitation: "The 20-foot module registers length. It does not prescribe a story count or a floor elevation.",
  });

  const worlds = new Map<string, { positions: Float32Array; bounds: { min: Vec3; max: Vec3 } }>();
  const sources: BuildingAnalysis["sources"] = [];
  for (const cluster of request.clusters) {
    const placement = request.placements.find((item) => item.clusterId === cluster.id) ?? {
      clusterId: cluster.id,
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as ClusterPlacement["rotation"],
      scale: [1, 1, 1] as Vec3,
      translation: [0, 0, 0] as Vec3,
    };
    const localBounds = boundsOf(cluster.positions);
    const analyzed = analyzeCluster(cluster, placement, findings, failures);
    worlds.set(cluster.id, { positions: analyzed.world, bounds: analyzed.worldBounds });
    sources.push({
      id: cluster.id,
      meshFile: cluster.meshFile,
      triangles: cluster.triangles,
      tiles: cluster.tiles.map((tile) => ({
        instanceId: tile.instanceId,
        archetypeId: tile.archetypeId,
        moduleId: tile.moduleId,
        typologyId: tile.typologyId,
        name: tile.name,
      })),
      validation: cluster.validation,
      localBounds,
      worldBounds: analyzed.worldBounds,
    });
  }
  relationships(request, worlds, findings);

  const limitations = [
    "Constituent tiles stay identifiable on the cluster record. The refined mesh does not label triangles by tile, and this analysis does not split it.",
    "Candidate surfaces, overhang clearances, and sealed probe cells are geometric observations. They are not floors, rooms, passages, or new architecture.",
    "The temporary placement is explicit and replaceable. It is not evidence of an official site arrangement.",
    request.disclaimer,
  ];
  return {
    contract: ANALYSIS_CONTRACT,
    milestone: 1,
    generatedArchitecture: false,
    predeterminedFloorElevations: false,
    assemblyId: request.id,
    role: request.role,
    disclaimer: request.disclaimer,
    frame: request.frame,
    placementRule: request.placementRule,
    placements: request.placements,
    sources,
    findings,
    limitations,
    failures,
  };
}
