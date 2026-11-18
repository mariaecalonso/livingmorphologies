import { TYPOLOGIES } from "@/lib/catalog";
import { readFinalSelection } from "@/lib/skill3/final-selection";
import { readSolidifiedMesh, readSolidifiedReading } from "@/lib/skill3/solidified-catalogue";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import {
  REGISTRATION_HALF,
  REGISTRATION_VOLUME,
  SKILL6_PARAMETERS,
  sourcePointToSkill6,
  type Vec3,
} from "./contract";
import {
  add,
  boundsOfPositions,
  cross,
  dot,
  hashTriangles,
  length,
  normalize,
  readTriangle,
  scale,
  signedVolume,
  sub,
  surfaceArea,
  type Bounds,
  type TriangleHash,
} from "./geometry";

export type { Bounds };

export type PatchSample = {
  point: Vec3;
  normal: Vec3;
  area: number;
};

/** A continuous run of similarly facing triangles, cut into local pads. */
export type SurfacePatch = {
  id: string;
  normal: Vec3;
  centroid: Vec3;
  area: number;
  /** Radius of the pad in its tangent plane. */
  radius: number;
  samples: PatchSample[];
};

export type ArchetypeMesh = {
  archetypeId: string;
  name: string;
  typologyId: string;
  moduleId: string;
  candidateId: number;
  continuationId: string;
  triangles: number;
  positions: Float32Array;
  indices: Uint32Array;
  tight: Bounds;
  solidVolume: number;
  solidVolumeSource: "stored-report" | "repaired-mesh";
  cellVoidFraction: number | null;
  cellVoidSource: "stored-report" | "repaired-mesh";
  surfaceArea: number;
  registration: Bounds;
  proportions: Vec3;
  patches: SurfacePatch[];
  hash: TriangleHash;
};

function identityOf(archetypeId: string) {
  for (const typology of TYPOLOGIES) {
    const archetype = typology.archetypes.find((item) => item.id === archetypeId);
    if (archetype) return { name: archetype.name, typologyId: typology.id };
  }
  return { name: archetypeId, typologyId: "unassigned" };
}

function convertMesh(sourcePositions: Float32Array, sourceIndices: Uint32Array) {
  const positions = new Float32Array(sourcePositions.length);
  for (let index = 0; index < sourcePositions.length; index += 3) {
    const [x, y, z] = sourcePointToSkill6(sourcePositions[index], sourcePositions[index + 1], sourcePositions[index + 2]);
    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = z;
  }
  return { positions, indices: new Uint32Array(sourceIndices) };
}

const REGION_COS = 0.96;
const CELL = 0.9;
const WINDOW = 3;
const PATCH_CAP = 10;

function tangentsOf(normal: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(normal, helper));
  return [u, normalize(cross(normal, u))];
}

type Bin = { iu: number; iv: number; point: Vec3; normal: Vec3; area: number };

/**
 * Attachment pads from the mesh itself.
 * Triangles join a region only when they share an edge and their normals stay within about 16°.
 * A large region is cut into local windows so a curved or long face is not treated as one plane.
 * Windows whose normals fan out are dropped. Bounding-box faces are not used.
 */
function buildPatches(positions: Float32Array, indices: Uint32Array, triangles: number): SurfacePatch[] {
  const areaOf: number[] = [];
  const normalOf: Vec3[] = [];
  const centroidOf: Vec3[] = [];
  const edges = new Map<string, number[]>();
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const [a, b, c] = readTriangle(positions, indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    areaOf.push(span * 0.5);
    normalOf.push(span > 1e-8 ? scale(raw, 1 / span) : [0, 0, 0]);
    centroidOf.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    const ids = [indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const left = ids[edge];
      const right = ids[(edge + 1) % 3];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const list = edges.get(key);
      if (list) list.push(triangle);
      else edges.set(key, [triangle]);
    }
  }
  const neighbors: number[][] = Array.from({ length: triangles }, () => []);
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    neighbors[list[0]].push(list[1]);
    neighbors[list[1]].push(list[0]);
  }
  const seen = new Uint8Array(triangles);
  const windows = new Map<string, Bin[]>();
  let region = 0;
  for (let start = 0; start < triangles; start += 1) {
    if (seen[start] || areaOf[start] < 1e-6) continue;
    const seed = normalOf[start];
    const member: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const current = stack.pop() ?? start;
      member.push(current);
      for (const next of neighbors[current]) {
        if (seen[next] || areaOf[next] < 1e-6) continue;
        if (dot(seed, normalOf[next]) < REGION_COS) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    let area = 0;
    const mean: Vec3 = [0, 0, 0];
    for (const triangle of member) {
      area += areaOf[triangle];
      mean[0] += normalOf[triangle][0] * areaOf[triangle];
      mean[1] += normalOf[triangle][1] * areaOf[triangle];
      mean[2] += normalOf[triangle][2] * areaOf[triangle];
    }
    if (area < SKILL6_PARAMETERS.minPatchArea || length(mean) / area < 0.94) continue;
    const normal = normalize(mean);
    const [tangentU, tangentV] = tangentsOf(normal);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const triangle of member) {
      const centroid = centroidOf[triangle];
      const u = dot(centroid, tangentU);
      const v = dot(centroid, tangentV);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const whole = maxU - minU <= CELL * WINDOW && maxV - minV <= CELL * WINDOW;
    const bins = new Map<string, Bin>();
    for (const triangle of member) {
      const centroid = centroidOf[triangle];
      const iu = Math.floor(dot(centroid, tangentU) / CELL);
      const iv = Math.floor(dot(centroid, tangentV) / CELL);
      const key = whole ? `${iu}:${iv}` : `${Math.floor(iu / WINDOW)}:${Math.floor(iv / WINDOW)}:${iu}:${iv}`;
      const weight = areaOf[triangle];
      const bin = bins.get(key);
      if (bin) {
        bin.area += weight;
        bin.point = add(bin.point, scale(centroid, weight));
        bin.normal = add(bin.normal, scale(normalOf[triangle], weight));
      } else {
        bins.set(key, { iu, iv, point: scale(centroid, weight), normal: scale(normalOf[triangle], weight), area: weight });
      }
    }
    const regionId = region;
    region += 1;
    for (const bin of bins.values()) {
      const windowKey = whole ? `${regionId}` : `${regionId}:${Math.floor(bin.iu / WINDOW)}:${Math.floor(bin.iv / WINDOW)}`;
      const group = windows.get(windowKey) ?? [];
      group.push({
        iu: bin.iu,
        iv: bin.iv,
        area: bin.area,
        point: scale(bin.point, 1 / bin.area),
        normal: normalize(bin.normal),
      });
      windows.set(windowKey, group);
    }
  }
  const patches: SurfacePatch[] = [];
  for (const group of windows.values()) {
    let area = 0;
    const centroid: Vec3 = [0, 0, 0];
    const normalSum: Vec3 = [0, 0, 0];
    for (const bin of group) {
      area += bin.area;
      centroid[0] += bin.point[0] * bin.area;
      centroid[1] += bin.point[1] * bin.area;
      centroid[2] += bin.point[2] * bin.area;
      normalSum[0] += bin.normal[0] * bin.area;
      normalSum[1] += bin.normal[1] * bin.area;
      normalSum[2] += bin.normal[2] * bin.area;
    }
    if (area < SKILL6_PARAMETERS.minPatchArea || length(normalSum) / area < 0.94) continue;
    const normal = normalize(normalSum);
    const center: Vec3 = [centroid[0] / area, centroid[1] / area, centroid[2] / area];
    let radius = 0;
    for (const bin of group) radius = Math.max(radius, Math.hypot(bin.point[0] - center[0], bin.point[1] - center[1], bin.point[2] - center[2]));
    patches.push({
      id: `r${String(patches.length).padStart(2, "0")}`,
      normal,
      centroid: center,
      area,
      radius,
      samples: group.map((bin) => ({ point: bin.point, normal: bin.normal, area: bin.area })),
    });
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const patch of patches) {
    minX = Math.min(minX, patch.centroid[0]);
    minY = Math.min(minY, patch.centroid[1]);
    minZ = Math.min(minZ, patch.centroid[2]);
    maxX = Math.max(maxX, patch.centroid[0]);
    maxY = Math.max(maxY, patch.centroid[1]);
    maxZ = Math.max(maxZ, patch.centroid[2]);
  }
  const middle: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const kept: SurfacePatch[] = [];
  const pool = patches.filter((patch) => dot(patch.normal, sub(patch.centroid, middle)) > 0).sort((left, right) => right.area - left.area);
  while (kept.length < PATCH_CAP && pool.length > 0) {
    pool.sort((left, right) => {
      const leftAlign = kept.reduce((max, patch) => Math.max(max, Math.abs(dot(left.normal, patch.normal))), 0);
      const rightAlign = kept.reduce((max, patch) => Math.max(max, Math.abs(dot(right.normal, patch.normal))), 0);
      if (Math.abs(leftAlign - rightAlign) > 0.2) return leftAlign - rightAlign;
      return right.area - left.area;
    });
    const next = pool.shift();
    if (next) kept.push(next);
  }
  return kept.map((patch, index) => ({ ...patch, id: `r${String(index).padStart(2, "0")}` }));
}

export function proportionsOf(bounds: Bounds): Vec3 {
  const size: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const major = Math.max(size[0], size[1], size[2], 1e-6);
  return [size[0] / major, size[1] / major, size[2] / major];
}

export function assembleArchetype(input: {
  archetypeId: string;
  name: string;
  typologyId: string;
  moduleId: string;
  candidateId: number;
  continuationId: string;
  positions: Float32Array;
  indices: Uint32Array;
  solidVolume?: number;
  solidVolumeSource?: ArchetypeMesh["solidVolumeSource"];
  cellVoidFraction?: number | null;
  cellVoidSource?: ArchetypeMesh["cellVoidSource"];
  registration?: Bounds;
}): ArchetypeMesh {
  const triangles = input.indices.length / 3;
  const tight = boundsOfPositions(input.positions);
  const computed = Math.abs(signedVolume(input.positions, input.indices, triangles));
  const half = REGISTRATION_HALF;
  return {
    archetypeId: input.archetypeId,
    name: input.name,
    typologyId: input.typologyId,
    moduleId: input.moduleId,
    candidateId: input.candidateId,
    continuationId: input.continuationId,
    triangles,
    positions: input.positions,
    indices: input.indices,
    tight,
    solidVolume: input.solidVolume ?? computed,
    solidVolumeSource: input.solidVolumeSource ?? "repaired-mesh",
    cellVoidFraction: input.cellVoidFraction === undefined ? 1 - computed / REGISTRATION_VOLUME : input.cellVoidFraction,
    cellVoidSource: input.cellVoidSource ?? "repaired-mesh",
    surfaceArea: surfaceArea(input.positions, input.indices, triangles),
    registration: input.registration ?? {
      min: [-half, -half, -half],
      max: [half, half, half],
    },
    proportions: proportionsOf(tight),
    patches: buildPatches(input.positions, input.indices, triangles),
    hash: hashTriangles(input.positions, input.indices, triangles, 0.55),
  };
}

/** The 15 selected modules, copied into the Skill 6 frame. Source buffers are not written. */
export function loadArchetypeMeshes(): ArchetypeMesh[] {
  const selection = readFinalSelection();
  return selection.selections.map((entry) => {
    const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
    if (!stored || stored.moduleId !== entry.moduleId) {
      throw new Error(`Selected mesh missing for ${entry.moduleId}`);
    }
    const decoded = decodeSolidifiedMesh(stored.geometry);
    const converted = convertMesh(decoded.positions, decoded.indices);
    const tight = boundsOfPositions(converted.positions);
    const computed = Math.abs(signedVolume(converted.positions, converted.indices, decoded.triangles));
    const reading = readSolidifiedReading(entry.archetypeId, entry.candidateId, entry.continuationId);
    const storedVolume = reading?.signedVolume;
    const solidVolume = storedVolume != null && Number.isFinite(storedVolume) ? Math.abs(storedVolume) : computed;
    const storedFraction = reading?.solidFraction;
    const cellVoidFraction = storedFraction != null && Number.isFinite(storedFraction)
      ? 1 - storedFraction
      : 1 - solidVolume / REGISTRATION_VOLUME;
    const identity = identityOf(entry.archetypeId);
    return {
      archetypeId: entry.archetypeId,
      name: identity.name,
      typologyId: entry.category || identity.typologyId,
      moduleId: entry.moduleId,
      candidateId: entry.candidateId,
      continuationId: entry.continuationId,
      triangles: decoded.triangles,
      positions: converted.positions,
      indices: converted.indices,
      tight,
      solidVolume,
      solidVolumeSource: storedVolume != null ? "stored-report" : "repaired-mesh",
      cellVoidFraction,
      cellVoidSource: storedFraction != null ? "stored-report" : "repaired-mesh",
      surfaceArea: surfaceArea(converted.positions, converted.indices, decoded.triangles),
      registration: {
        min: [-REGISTRATION_HALF, -REGISTRATION_HALF, -REGISTRATION_HALF],
        max: [REGISTRATION_HALF, REGISTRATION_HALF, REGISTRATION_HALF],
      },
      proportions: proportionsOf(tight),
      patches: buildPatches(converted.positions, converted.indices, decoded.triangles),
      hash: hashTriangles(converted.positions, converted.indices, decoded.triangles, 0.55),
    };
  });
}
