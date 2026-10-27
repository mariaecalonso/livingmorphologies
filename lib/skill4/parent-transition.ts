import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import type { FaceFrame, FaceId, Vec3 } from "./contract";
import { loftSectionRings } from "./hybrid-spine";
import { connectionProcess, type ProcessSection } from "./section-hybrid";
import type { TileInstance } from "./tiles";
import { rotateByBasis, tileBasis } from "./tile-basis";

/**
 * Rebuilds only the parent skin inside the connection zone.
 * Vertices outside that zone are copied unchanged. The H13 core rings are not moved.
 */
export type PatchQuality = {
  vertices: number;
  triangles: number;
  removedTriangles: number;
  boundaryLoops: number;
  loopLengths: number[];
  rings: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  degenerate: number;
  maxEdgeRatio: number;
  components: number;
  unchangedVertices: number;
  spanHits: number;
  tangentMismatch: number;
  turnAngles: number[];
  patchWidth: number;
  terminalWidth: number;
  widthRatio: number;
  insufficientWidth: boolean;
  excessiveWidth: boolean;
  widthOutsidePreferred: boolean;
  cappedLoopAreas: number[];
  capFraction: number;
  majorTopologyLoss: boolean;
  character: "mass" | "plate" | "rib" | "sheet" | "intermediate";
  localThickness: number;
  characterConfidence: number;
  thicknessMin: number;
  thicknessMax: number;
  thicknessVariance: number;
  pairedCoverage: number;
  oppositionAngle: number;
  pcaExtents: number[];
  searchRadius: number;
};

export type PatchStage = {
  mesh: IsoMesh;
  zoneMesh: IsoMesh;
  openMesh: IsoMesh;
  patchMesh: IsoMesh;
  rings: Vec3[][];
  sheet: { U: Vec3; V: Vec3; N: Vec3; partner: number[]; roles: ("sheet" | "rim" | "other")[]; throughPairs: number; gapPairs: number; rimRatio: number } | null;
  guideMesh: IsoMesh | null;
  shells: { sideA: IsoMesh; sideB: IsoMesh; walls: IsoMesh } | null;
  attachment: {
    center: Vec3;
    radius: number;
    area: number;
    onSheet: number;
    terminalArea: number;
    rimDistance: number;
    removedTriangles: number;
    segments: { sheetAdjacent: number; sideWall: number; rimClosure: number; passive: number };
    legacyRing: Vec3[];
    legacyRoles: ("sheet-adjacent" | "side-wall" | "rim-closure" | "passive")[];
    terminalRing: Vec3[];
    receivingCenter?: Vec3;
    receivingNormal?: Vec3;
    receivingArea?: number;
    receivingRatio?: number;
    totalTurn?: number;
    receivingLoop?: Vec3[];
    thicknessSamples?: number[];
  } | null;
  voidBearing: {
    rank: "meaningful" | "primary";
    score: number;
    persistence: number;
    fraction: number;
    cuts: string[];
    sectionAreas: number[];
    aspects: number[];
    orientations: number[];
    centroids: Vec3[];
    innerRings: Vec3[][];
    stationAreas: number[];
    closureStation: number | null;
    endScale: number;
  } | null;
  quality: PatchQuality;
};

export type GrownConnection = {
  parentA: IsoMesh;
  parentB: IsoMesh;
  connector: IsoMesh;
  stageA: PatchStage;
  stageB: PatchStage;
  qualityA: PatchQuality;
  qualityB: PatchQuality;
};

const SAMPLES = 36;

export function growConnectionPair(
  connector: IsoMesh,
  tileA: TileInstance,
  tileB: TileInstance,
  moduleA: ReadyModule,
  moduleB: ReadyModule,
  faceA: FaceId,
  faceB: FaceId,
): GrownConnection | null {
  const record = connectionProcess(moduleA, faceA, moduleB, faceB);
  const worldRings = loftRings(connector);
  if (!record || !moduleA.geometry || !moduleB.geometry || !worldRings) return null;
  const strongA = dominant(record.a.map((section) => section.worldContour));
  const strongB = dominant(record.b.map((section) => section.worldContour));
  if (strongA.length < 3 || strongB.length < 3) return null;
  const localA = worldRings.map((ring) => ring.map((point) => unpose(tileA, point)));
  const localB = worldRings.map((ring) => ring.map((point) => unpose(tileB, point)));
  const terminalA = faceTerminal(localA, moduleA.faces[faceA]);
  const terminalB = faceTerminal(localB, moduleB.faces[faceB]);
  const stageA = rebuildSide(moduleA.geometry, moduleA.faces[faceA], localA, terminalA, strongA, record.a);
  const stageB = rebuildSide(moduleB.geometry, moduleB.faces[faceB], localB, terminalB, strongB, record.b);
  const from = Math.min(terminalA, terminalB);
  const to = Math.max(terminalA, terminalB);
  const core = loftSectionRings(worldRings.slice(from, to + 1));
  return {
    parentA: stageA.mesh,
    parentB: stageB.mesh,
    connector: core,
    stageA,
    stageB,
    qualityA: stageA.quality,
    qualityB: stageB.quality,
  };
}

/** Drops a detached shell only when it is both tiny in volume and tiny in triangle count. */
export function dropNegligibleShells(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  const next: number[][] = Array.from({ length: count }, () => []);
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) next[ids[edge]].push(ids[(edge + 1) % 3]);
  }
  const groupOf = new Int32Array(count).fill(-1);
  let parts = 0;
  for (let start = 0; start < count; start += 1) {
    if (groupOf[start] >= 0 || next[start].length === 0) continue;
    const id = parts;
    parts += 1;
    const stack = [start];
    groupOf[start] = id;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      next[current].forEach((neighbor) => {
        if (groupOf[neighbor] >= 0) return;
        groupOf[neighbor] = id;
        stack.push(neighbor);
      });
    }
  }
  const buckets: number[][] = Array.from({ length: parts }, () => []);
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const group = groupOf[mesh.indices[triangle * 3]];
    if (group >= 0) buckets[group].push(triangle);
  }
  const shells = buckets.filter((bucket) => bucket.length > 0).map((bucket) => {
    const used = new Map<number, number>();
    const positions: number[] = [];
    const indices: number[] = [];
    bucket.forEach((triangle) => {
      for (let corner = 0; corner < 3; corner += 1) {
        const source = mesh.indices[triangle * 3 + corner];
        let local = used.get(source);
        if (local === undefined) {
          local = positions.length / 3;
          used.set(source, local);
          positions.push(mesh.positions[source * 3], mesh.positions[source * 3 + 1], mesh.positions[source * 3 + 2]);
        }
        indices.push(local);
      }
    });
    return shade({ positions: Float32Array.from(positions), normals: new Float32Array(positions.length), indices: Uint32Array.from(indices), triangles: indices.length / 3 });
  }).sort((a, b) => b.triangles - a.triangles);
  if (shells.length <= 1) return { mesh, dropped: [] as { triangles: number; volume: number }[] };
  const mainVolume = Math.abs(signedVolume(shells[0]));
  const kept = [shells[0]];
  const dropped: { triangles: number; volume: number }[] = [];
  shells.slice(1).forEach((shell) => {
    const volume = Math.abs(signedVolume(shell));
    const thin = thinnestAxis(shell);
    const smallVolume = mainVolume > 0 && volume < mainVolume * 0.001;
    const smallMesh = shell.triangles < Math.max(80, shells[0].triangles * 0.005);
    if (smallVolume && smallMesh && thin < 1.25) dropped.push({ triangles: shell.triangles, volume: Number(volume.toFixed(4)) });
    else kept.push(shell);
  });
  if (dropped.length === 0) return { mesh, dropped };
  let positionCount = 0;
  let indexCount = 0;
  kept.forEach((shell) => {
    positionCount += shell.positions.length;
    indexCount += shell.indices.length;
  });
  const positions = new Float32Array(positionCount);
  const indices = new Uint32Array(indexCount);
  let positionCursor = 0;
  let indexCursor = 0;
  let vertexOffset = 0;
  kept.forEach((shell) => {
    positions.set(shell.positions, positionCursor);
    shell.indices.forEach((index, offset) => {
      indices[indexCursor + offset] = index + vertexOffset;
    });
    positionCursor += shell.positions.length;
    indexCursor += shell.indices.length;
    vertexOffset += shell.positions.length / 3;
  });
  return {
    mesh: shade({ positions, normals: new Float32Array(positions.length), indices, triangles: indices.length / 3 }),
    dropped,
  };
}

function thinnestAxis(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    minY = Math.min(minY, mesh.positions[index + 1]);
    minZ = Math.min(minZ, mesh.positions[index + 2]);
    maxX = Math.max(maxX, mesh.positions[index]);
    maxY = Math.max(maxY, mesh.positions[index + 1]);
    maxZ = Math.max(maxZ, mesh.positions[index + 2]);
  }
  return Math.min(maxX - minX, maxY - minY, maxZ - minZ);
}

function signedVolume(mesh: IsoMesh) {
  let volume = 0;
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const a = read(mesh.positions, mesh.indices[triangle * 3]);
    const b = read(mesh.positions, mesh.indices[triangle * 3 + 1]);
    const c = read(mesh.positions, mesh.indices[triangle * 3 + 2]);
    volume += dot(a, cross(b, c));
  }
  return volume / 6;
}

function classifyParent(mesh: IsoMesh, loop: number[], removed: Set<number>, patchWidth: number, face: FaceFrame) {
  const faces = surfaceFaces(mesh);
  const normals = vertexNormals(mesh, removed);
  const step = Math.max(1, Math.floor(loop.length / 32));
  const picked: number[] = [];
  for (let index = 0; index < loop.length; index += step) picked.push(index);
  const radii: number[] = [];
  const hits: { thickness: number; opposition: number; axis: Vec3 }[] = [];
  const cloud: Vec3[] = [];
  const seen = new Set<number>();
  picked.forEach((sample) => {
    const vertex = loop[sample];
    const point = read(mesh.positions, vertex);
    const previous = read(mesh.positions, loop[(sample + loop.length - 1) % loop.length]);
    const next = read(mesh.positions, loop[(sample + 1) % loop.length]);
    const edge = (length(sub(point, previous)) + length(sub(point, next))) / 2;
    const radius = Math.min(2.2, Math.max(1.2, edge * 8));
    radii.push(radius);
    const normal = normals.get(vertex) ?? face.normal;
    const tangent = normalize(sub(next, previous));
    const binormal = cross(normal, tangent);
    const directions = [normal];
    if (length(binormal) > 1e-5) directions.push(normalize(binormal));
    const hit = nearestOpposed(faces, point, directions, radius, vertex);
    if (hit) hits.push(hit);
    for (let index = 0; index < mesh.positions.length / 3; index += 1) {
      if (seen.has(index) || length(sub(read(mesh.positions, index), point)) > radius) continue;
      seen.add(index);
      cloud.push(read(mesh.positions, index));
    }
  });
  hits.sort((a, b) => a.thickness - b.thickness);
  const thickness = hits.length > 0 ? hits[Math.floor(hits.length / 2)].thickness : 0;
  const thicknessMin = hits[0]?.thickness ?? 0;
  const thicknessMax = hits[hits.length - 1]?.thickness ?? 0;
  const mean = hits.length > 0 ? hits.reduce((sum, hit) => sum + hit.thickness, 0) / hits.length : 0;
  const variance = hits.length > 0 ? hits.reduce((sum, hit) => sum + (hit.thickness - mean) ** 2, 0) / hits.length : 0;
  const opposition = hits.length > 0 ? hits.reduce((sum, hit) => sum + hit.opposition, 0) / hits.length : 0;
  const coverage = hits.length / Math.max(1, picked.length);
  const ratio = thickness / Math.max(0.2, patchWidth);
  const spread = thickness > 1e-6 ? Math.sqrt(variance) / thickness : 1;
  const pca = principalExtents(cloud.length > 8 ? cloud : picked.map((sample) => read(mesh.positions, loop[sample])));
  const thin = pca.extents[0];
  const mid = pca.extents[1];
  const long = pca.extents[2];
  const plateShape = thin > 0.02 && mid / thin > 2.2 && long / thin > 2.2;
  const ribShape = long > 0.2 && mid / long < 0.34 && thin / long < 0.22 && mid < 1.6;
  const opposed = opposition > 120;
  const consistent = spread < 0.6;
  const thinSheet = thickness > 0.08 && thickness < 2.15 && ratio < 0.42;
  const plateScore = clamp01(coverage / 0.2) * 0.25
    + clamp01((opposition - 100) / 80) * 0.25
    + clamp01(1 - spread) * 0.25
    + clamp01(1 - ratio / 0.45) * 0.25;
  let character: PatchQuality["character"] = "intermediate";
  let confidence = Number(plateScore.toFixed(3));
  if (coverage >= 0.1 && thinSheet && opposed && consistent && spread < 0.45) {
    character = "plate";
    confidence = Number(plateScore.toFixed(3));
  } else if (ribShape && thickness > 0 && thickness < 1.6 && coverage >= 0.35) {
    character = "rib";
    confidence = Number(clamp01(1 - mid / Math.max(long, 0.2)).toFixed(3));
  } else if (coverage < 0.1 || thickness === 0 || ratio > 0.5) {
    character = "mass";
    confidence = Number(clamp01((1 - coverage) * 0.75 + (plateShape ? 0 : 0.2)).toFixed(3));
  }
  const coreHits = hits.filter((hit) => Math.abs(hit.thickness - thickness) <= Math.max(0.25, thickness * 0.35));
  const pairedAxis = (coreHits.length > 0 ? coreHits : hits).reduce((sum, hit) => add(sum, scale(hit.axis, dot(hit.axis, sum) < 0 ? -1 : 1)), { x: 0, y: 0, z: 0 });
  const normal = length(pairedAxis) > 1e-5 ? normalize(pairedAxis) : (length(pca.axes[0]) > 1e-5 ? pca.axes[0] : { x: 0, y: 1, z: 0 });
  const projected = sub(face.normal, scale(normal, dot(face.normal, normal)));
  const fallback = length(pca.axes[2]) > 1e-5 ? pca.axes[2] : { x: 1, y: 0, z: 0 };
  const along = length(projected) > 0.35 ? normalize(projected) : fallback;
  const plateNormal = normalize(normal);
  const plateAlong = normalize(sub(along, scale(plateNormal, dot(along, plateNormal))));
  const width = cross(plateNormal, length(plateAlong) > 1e-5 ? plateAlong : { x: 1, y: 0, z: 0 });
  const frame = {
    N: plateNormal,
    U: length(plateAlong) > 1e-5 ? plateAlong : normalize(cross({ x: 0, y: 1, z: 0 }, plateNormal)),
    V: length(width) > 1e-5 ? normalize(width) : { x: 0, y: 0, z: 1 },
  };
  const searchRadius = radii.length > 0 ? radii.sort((a, b) => a - b)[Math.floor(radii.length / 2)] : 0;
  return {
    character,
    confidence,
    thickness: Number(thickness.toFixed(3)),
    thicknessMin: Number(thicknessMin.toFixed(3)),
    thicknessMax: Number(thicknessMax.toFixed(3)),
    thicknessVariance: Number(variance.toFixed(4)),
    coverage: Number(coverage.toFixed(3)),
    opposition: Number(opposition.toFixed(2)),
    pca: pca.extents.map((extent) => Number(extent.toFixed(3))) as [number, number, number],
    frame,
    searchRadius: Number(searchRadius.toFixed(3)),
  };
}

function surfaceFaces(mesh: IsoMesh) {
  const faces: { ids: number[]; centroid: Vec3; normal: Vec3; a: Vec3; b: Vec3; c: Vec3 }[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const a = read(mesh.positions, ids[0]);
    const b = read(mesh.positions, ids[1]);
    const c = read(mesh.positions, ids[2]);
    const raw = cross(sub(b, a), sub(c, a));
    if (length(raw) < 1e-10) continue;
    faces.push({ ids, a, b, c, centroid: centroid([a, b, c]), normal: normalize(raw) });
  }
  return faces;
}

function nearestOpposed(
  faces: { ids: number[]; centroid: Vec3; normal: Vec3; a: Vec3; b: Vec3; c: Vec3 }[],
  point: Vec3,
  directions: Vec3[],
  radius: number,
  self: number,
) {
  let best = Infinity;
  let facing = { x: 0, y: 1, z: 0 };
  let axis = directions[0];
  directions.forEach((direction) => {
    [1, -1].forEach((sign) => {
      const ray = scale(direction, sign);
      faces.forEach((triangle) => {
        if (triangle.ids.includes(self)) return;
        if (length(sub(triangle.centroid, point)) > radius + 0.75) return;
        if (dot(ray, triangle.normal) < 0.35) return;
        const ab = sub(triangle.b, triangle.a);
        const ac = sub(triangle.c, triangle.a);
        const pvec = cross(ray, ac);
        const det = dot(ab, pvec);
        if (Math.abs(det) < 1e-8) return;
        const inverse = 1 / det;
        const tvec = sub(point, triangle.a);
        const u = dot(tvec, pvec) * inverse;
        if (u < -0.02 || u > 1.02) return;
        const qvec = cross(tvec, ab);
        const v = dot(ray, qvec) * inverse;
        if (v < -0.02 || u + v > 1.04) return;
        const distance = dot(ac, qvec) * inverse;
        if (distance < 0.08 || distance > radius || distance >= best) return;
        best = distance;
        facing = triangle.normal;
        axis = ray;
      });
    });
  });
  if (best === Infinity) return null;
  return { thickness: best, opposition: angleBetween(scale(axis, -1), facing), axis };
}

function principalExtents(points: Vec3[]) {
  const middle = centroid(points);
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  points.forEach((point) => {
    const d = sub(point, middle);
    xx += d.x * d.x; yy += d.y * d.y; zz += d.z * d.z;
    xy += d.x * d.y; xz += d.x * d.z; yz += d.y * d.z;
  });
  const count = Math.max(1, points.length);
  const matrix = [
    [xx / count, xy / count, xz / count],
    [xy / count, yy / count, yz / count],
    [xz / count, yz / count, zz / count],
  ];
  const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let iter = 0; iter < 16; iter += 1) {
    const pairs = [[0, 1], [0, 2], [1, 2]];
    let p = 0;
    let q = 1;
    let best = Math.abs(matrix[0][1]);
    pairs.forEach(([left, right]) => {
      if (Math.abs(matrix[left][right]) > best) {
        best = Math.abs(matrix[left][right]);
        p = left;
        q = right;
      }
    });
    if (best < 1e-12) break;
    const app = matrix[p][p];
    const aqq = matrix[q][q];
    const apq = matrix[p][q];
    const tau = (aqq - app) / (2 * apq || 1e-12);
    const root = Math.sqrt(1 + tau * tau);
    const t = Math.sign(tau || 1) / (Math.abs(tau) + root);
    const cosine = 1 / Math.sqrt(1 + t * t);
    const sine = t * cosine;
    for (let k = 0; k < 3; k += 1) {
      if (k === p || k === q) continue;
      const mik = matrix[k][p];
      const mkq = matrix[k][q];
      matrix[k][p] = cosine * mik - sine * mkq;
      matrix[p][k] = matrix[k][p];
      matrix[k][q] = sine * mik + cosine * mkq;
      matrix[q][k] = matrix[k][q];
    }
    matrix[p][p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    matrix[q][q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    matrix[p][q] = 0;
    matrix[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      const vip = vectors[k][p];
      const viq = vectors[k][q];
      vectors[k][p] = cosine * vip - sine * viq;
      vectors[k][q] = sine * vip + cosine * viq;
    }
  }
  const order = [0, 1, 2].sort((a, b) => matrix[a][a] - matrix[b][b]);
  return {
    extents: order.map((axis) => Number((2 * Math.sqrt(Math.max(0, matrix[axis][axis]))).toFixed(4))),
    axes: order.map((axis) => normalize({ x: vectors[0][axis], y: vectors[1][axis], z: vectors[2][axis] })),
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function rankSectionVoids(sections: ProcessSection[]) {
  const cuts = sections.map((section) => ({
    label: section.label,
    openings: section.openings.map((loop) => ({
      area: loopArea(loop),
      ratio: loopArea(loop) / Math.max(loopArea(section.outer), 1e-6),
      centroid: centroid(loop),
      aspect: openingAspect(loop, section),
      orientation: openingOrientation(loop, section),
    })),
  }));
  const tracks: { hits: { label: string; opening: (typeof cuts)[number]["openings"][number] }[] }[] = [];
  cuts.forEach((cut) => {
    cut.openings.forEach((opening) => {
      let best: { track: (typeof tracks)[number]; score: number } | null = null;
      for (const track of tracks) {
        const previous = track.hits[track.hits.length - 1].opening;
        const gap = length(sub(opening.centroid, previous.centroid));
        const areaScore = 1 - Math.min(1, Math.abs(opening.area - previous.area) / Math.max(opening.area, previous.area, 1));
        const score = Math.exp(-gap / 4) * 0.55 + areaScore * 0.45;
        if (!best || score > best.score) best = { track, score };
      }
      if (best && best.score > 0.45) best.track.hits.push({ label: cut.label, opening });
      else tracks.push({ hits: [{ label: cut.label, opening }] });
    });
  });
  return tracks.map((track) => {
    const areas = track.hits.map((hit) => hit.opening.area);
    const mean = areas.reduce((sum, area) => sum + area, 0) / areas.length;
    const variance = areas.reduce((sum, area) => sum + (area - mean) ** 2, 0) / areas.length;
    const consistency = 1 - Math.min(1, Math.sqrt(variance) / Math.max(mean, 1e-6));
    const fraction = track.hits.length / Math.max(1, sections.length);
    const ratio = track.hits.reduce((sum, hit) => sum + hit.opening.ratio, 0) / track.hits.length;
    const score = Math.max(0, Math.min(1, ratio * 0.4 + fraction * 0.3 + consistency * 0.15 + 0.15));
    const rank = score >= 0.5 ? "primary" as const : score >= 0.2 ? "meaningful" as const : "minor" as const;
    return {
      rank,
      score: Number(score.toFixed(3)),
      persistence: track.hits.length,
      fraction: Number(fraction.toFixed(3)),
      cuts: track.hits.map((hit) => hit.label),
      sectionAreas: areas.map((area) => Number(area.toFixed(2))),
      aspects: track.hits.map((hit) => hit.opening.aspect),
      orientations: track.hits.map((hit) => hit.opening.orientation),
      centroids: track.hits.map((hit) => hit.opening.centroid),
      matchArea: areas[areas.length - 1],
      matchCentroid: track.hits[track.hits.length - 1].opening.centroid,
    };
  });
}

function openingAspect(loop: Vec3[], section: ProcessSection) {
  const middle = centroid(loop);
  let uu = 0;
  let vv = 0;
  let uv = 0;
  loop.forEach((point) => {
    const delta = sub(point, middle);
    const u = dot(delta, section.planeU);
    const v = dot(delta, section.planeV);
    uu += u * u;
    vv += v * v;
    uv += u * v;
  });
  const trace = uu + vv;
  const gap = Math.sqrt(Math.max(0, trace * trace / 4 - (uu * vv - uv * uv)));
  const major = trace / 2 + gap;
  const minor = Math.max(1e-8, trace / 2 - gap);
  return Number(Math.sqrt(minor / Math.max(major, 1e-8)).toFixed(3));
}

function openingOrientation(loop: Vec3[], section: ProcessSection) {
  const middle = centroid(loop);
  let uu = 0;
  let vv = 0;
  let uv = 0;
  loop.forEach((point) => {
    const delta = sub(point, middle);
    const u = dot(delta, section.planeU);
    const v = dot(delta, section.planeV);
    uu += u * u;
    vv += v * v;
    uv += u * v;
  });
  return Number((0.5 * Math.atan2(2 * uv, uu - vv) * 180 / Math.PI).toFixed(1));
}

function matchVoidLoop(loops: number[][], mesh: IsoMesh, sections: ProcessSection[]) {
  const ranked = rankSectionVoids(sections).filter((opening): opening is ReturnType<typeof rankSectionVoids>[number] & { rank: "meaningful" | "primary" } => opening.rank !== "minor");
  let chosen: { ids: number[]; track: (typeof ranked)[number] } | null = null;
  for (const ids of loops) {
    const points = ids.map((index) => read(mesh.positions, index));
    const area = loopArea(points);
    const middle = centroid(points);
    for (const track of ranked) {
      const areaFit = Math.abs(area - track.matchArea) / Math.max(area, track.matchArea, 1);
      if (areaFit > 0.25 || length(sub(middle, track.matchCentroid)) > 6) continue;
      if (!chosen || track.score > chosen.track.score) chosen = { ids, track };
    }
  }
  return chosen;
}

function carryMatchedVoid(chosen: NonNullable<ReturnType<typeof matchVoidLoop>>, mesh: IsoMesh, outerRings: Vec3[][]): PatchStage["voidBearing"] & { ids: number[]; rings: Vec3[][] } | null {
  if (outerRings.length < 2) return null;
  const opening = chosen.ids.map((index) => read(mesh.positions, index));
  const endScale = chosen.track.rank === "primary" ? 0.86 : 0.78;
  const rings = propagateOpening(opening, outerRings, endScale);
  return {
    ids: chosen.ids,
    rings,
    rank: chosen.track.rank,
    score: chosen.track.score,
    persistence: chosen.track.persistence,
    fraction: chosen.track.fraction,
    cuts: chosen.track.cuts,
    sectionAreas: chosen.track.sectionAreas,
    aspects: chosen.track.aspects,
    orientations: chosen.track.orientations,
    centroids: chosen.track.centroids,
    innerRings: rings,
    stationAreas: rings.map((ring) => Number(loopArea(ring).toFixed(2))),
    closureStation: rings.length - 1,
    endScale,
  };
}

function propagateOpening(opening: Vec3[], outerRings: Vec3[][], endScale: number) {
  const origin = centroid(opening);
  const offset = sub(origin, centroid(outerRings[0]));
  return outerRings.map((ring, station) => {
    if (station === 0) return opening.map((point) => ({ ...point }));
    const fade = station / (outerRings.length - 1);
    const ease = fade * fade * (3 - 2 * fade);
    const scaleNow = 1 - (1 - endScale) * ease;
    const center = add(centroid(ring), scale(offset, 1 - ease * 0.4));
    const placed = opening.map((point) => add(center, scale(sub(point, origin), scaleNow)));
    return clearOfOuter(placed, ring, 0.28);
  });
}

function clearOfOuter(points: Vec3[], outer: Vec3[], gap: number) {
  const middle = centroid(points);
  return points.map((point) => {
    let nearest = Infinity;
    outer.forEach((sample) => { nearest = Math.min(nearest, length(sub(point, sample))); });
    if (nearest >= gap) return point;
    const inward = sub(middle, point);
    const magnitude = length(inward);
    if (magnitude < gap) return point;
    return add(point, scale(normalize(inward), gap - nearest));
  });
}

function rebuildSide(mesh: IsoMesh, face: FaceFrame, rings: Vec3[][], terminalIndex: number, footprint: Vec3[], sections: ProcessSection[] = []): PatchStage {
  const empty = emptyStage(mesh);
  if (terminalIndex < 0 || rings.length < 3 || footprint.length < 3) return empty;
  const depthOf = (point: Vec3) => dot(sub(point, face.origin), face.normal);
  const inner = depthOf(centroid(footprint));
  const openedCut = zoneTriangles(mesh, face, footprint, rings[terminalIndex], inner, depthOf);
  const openedLoops = boundaryLoops(mesh, openedCut);
  if (openedLoops.length === 0) return { ...empty, quality: { ...empty.quality, removedTriangles: openedCut.size } };
  const classLoop = openedLoops[0];
  const classBoundary = classLoop.map((index) => read(mesh.positions, index));
  const patchWidth = classBoundary.reduce((sum, point) => sum + length(sub(point, centroid(classBoundary))), 0) / classBoundary.length;
  const reading = classifyParent(mesh, classLoop, openedCut, patchWidth, face);
  const opened = reading.character === "plate" ? readOpenSheet(mesh, classLoop, face) : null;
  const character = opened?.open ? "sheet" : reading.character;
  const anchor = character === "sheet" && opened ? cutSheetAnchor(mesh, opened.guide, opened.frame, rings[terminalIndex], classBoundary, opened.roles) : null;
  const removed = anchor?.removed ?? openedCut;
  const loops = anchor ? boundaryLoops(mesh, removed) : openedLoops;
  if (loops.length === 0) return { ...empty, quality: { ...empty.quality, removedTriangles: removed.size } };
  const outer = loops[0];
  const boundary = outer.map((index) => read(mesh.positions, index));
  const capped = loops.filter((loop) => loop !== outer);
  const toward = towardCore(rings, terminalIndex, depthOf);
  const aligned = alignLoops(boundary, rings[terminalIndex], rings[toward]);
  const target = aligned.primary.map((point, index) => lerp(point, aligned.secondary[index], 0.3));
  const start = leaveDirections(mesh, outer, removed, face);
  const behind = behindPoints(mesh, outer, removed, start);
  const end = target.map((point, index) => sub(aligned.secondary[index], point));
  const ringCount = transitionCount(boundary, target, start, end);
  if (anchor && opened) {
    const grid = openSheetSurface(opened.frame, anchor.center, anchor.radius, anchor.area, rings[terminalIndex]);
    const sheetThickness = medianAttachmentThickness(mesh, opened.frame, anchor.center, anchor.radius);
    const solid = thickenOpenGrid(grid.rows, opened.frame.N, sheetThickness);
    const bare = measure(mesh, solid.mesh, anchor.removed.size, 1, [], grid.rows.length, 0);
    return {
      mesh,
      zoneMesh: subsetMesh(mesh, anchor.removed, true),
      openMesh: openGridMesh(grid.rows),
      patchMesh: solid.mesh,
      rings: grid.rows,
      sheet: { ...opened.frame, partner: outer.map(() => -1), roles: outer.map(() => "sheet" as const), throughPairs: opened.throughPairs, gapPairs: opened.gapPairs, rimRatio: opened.rimRatio },
      guideMesh: opened.guide,
      attachment: {
        center: anchor.center,
        radius: anchor.radius,
        area: anchor.area,
        onSheet: anchor.onSheet,
        terminalArea: anchor.terminalArea,
        rimDistance: anchor.rimDistance,
        removedTriangles: anchor.removed.size,
        segments: anchor.segments,
        legacyRing: classBoundary,
        legacyRoles: anchor.legacyRoles,
        terminalRing: rings[terminalIndex],
        receivingCenter: grid.receiving.center,
        receivingNormal: grid.receiving.normal,
        receivingArea: grid.receiving.area,
        receivingRatio: grid.receiving.ratio,
        totalTurn: grid.totalTurn,
        receivingLoop: grid.receiving.loop,
        thicknessSamples: solid.samples,
      },
      shells: { sideA: solid.sideA, sideB: solid.sideB, walls: solid.walls },
      voidBearing: null,
      quality: {
        ...bare,
        character: "sheet",
        characterConfidence: reading.confidence,
        localThickness: reading.thickness,
        thicknessMin: reading.thicknessMin,
        thicknessMax: reading.thicknessMax,
        thicknessVariance: reading.thicknessVariance,
        pairedCoverage: reading.coverage,
        oppositionAngle: reading.opposition,
        pcaExtents: reading.pca,
        searchRadius: reading.searchRadius,
      },
    };
  }
  const sheetRings = reading.character === "plate"
      ? plateSheetRings(boundary, target, start, behind, ringCount, reading.frame, reading.thickness)
      : null;
  const matchedVoid = matchVoidLoop(capped, mesh, sections);
  const corresponded = matchedVoid
    ? calmVoidRings(continueThenTurn(boundary, target, start, end, behind, ringCount, reading.character))
    : null;
  const carried = matchedVoid && corresponded ? carryMatchedVoid(matchedVoid, mesh, corresponded) : null;
  const outerRings = carried && corresponded
    ? guideVoidOuter(fairVoidSurface(corresponded, carried.rings), carried.rings)
    : corresponded ?? sheetRings?.rings ?? continueThenTurn(boundary, target, start, end, behind, ringCount, reading.character);
  const extras = carried ? capped.filter((loop) => loop !== carried.ids) : capped;
  const stitched = carried
    ? stitch(mesh, removed, outer, carried.ids, extras, outerRings, carried.rings)
    : stitch(mesh, removed, outer, null, capped, outerRings, null);
  const zoneMesh = subsetMesh(mesh, removed, true);
  const openMesh = subsetMesh(mesh, removed, false);
  const patchMesh = loftSectionRings(outerRings);
  return {
    mesh: stitched.mesh,
    zoneMesh,
    openMesh,
    patchMesh,
    rings: outerRings,
    sheet: opened?.open
      ? { ...opened.frame, partner: outer.map(() => -1), roles: anchor ? outer.map(() => "sheet" as const) : opened.roles, throughPairs: opened.throughPairs, gapPairs: opened.gapPairs, rimRatio: opened.rimRatio }
      : sheetRings && "partner" in sheetRings
        ? { ...reading.frame, partner: sheetRings.partner, roles: [], throughPairs: 0, gapPairs: 0, rimRatio: 0 }
        : null,
    guideMesh: opened?.open ? opened.guide : null,
    shells: null,
    voidBearing: carried,
    attachment: anchor ? {
      center: anchor.center,
      radius: anchor.radius,
      area: anchor.area,
      onSheet: anchor.onSheet,
      terminalArea: anchor.terminalArea,
      rimDistance: anchor.rimDistance,
      removedTriangles: anchor.removed.size,
      segments: anchor.segments,
      legacyRing: classBoundary,
      legacyRoles: anchor.legacyRoles,
      terminalRing: rings[terminalIndex],
    } : null,
    quality: {
      ...continuity(measure(mesh, stitched.mesh, removed.size, loops.length, loops.map((loop) => Number(loopLength(loop, mesh).toFixed(2))), outerRings.length, stitched.spanHits), outerRings, start, aligned.primary, extras.map((loop) => loopArea(loop.map((index) => read(mesh.positions, index)))), loopArea(footprint), character, reading.thickness),
      characterConfidence: reading.confidence,
      thicknessMin: reading.thicknessMin,
      thicknessMax: reading.thicknessMax,
      thicknessVariance: reading.thicknessVariance,
      pairedCoverage: reading.coverage,
      oppositionAngle: reading.opposition,
      pcaExtents: reading.pca,
      searchRadius: reading.searchRadius,
    },
  };
}

function zoneTriangles(mesh: IsoMesh, face: FaceFrame, footprint: Vec3[], terminal: Vec3[], inner: number, depthOf: (point: Vec3) => number) {
  const outside = (point: Vec3) => (insideLoop(point, terminal, face, 0) ? 0 : loopDistance(point, terminal, face));
  const collect = (margin: number) => {
    const removed = new Set<number>();
    for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
      const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
      const middle = centroid(ids.map((index) => read(mesh.positions, index)));
      const depth = depthOf(middle);
      if (depth <= inner + 0.12 || depth > depthOf(centroid(terminal)) + 1) continue;
      if (outside(middle) > margin) continue;
      removed.add(triangle);
    }
    return removed;
  };
  let low = 0;
  let high = 2.8;
  let best = new Set<number>();
  for (let step = 0; step < 8; step += 1) {
    const margin = (low + high) / 2;
    const removed = collect(margin);
    const open = subsetMesh(mesh, removed, false);
    const loops = boundaryLoops(mesh, removed);
    if (removed.size > 20 && loops.length >= 1 && loops.length <= 6 && componentCount(open) === 1) {
      best = removed;
      low = margin;
    } else high = margin;
  }
  if (best.size > 0) return best;
  const origin = centroid(footprint);
  const target = centroid(terminal);
  let corridorLow = 0.8;
  let corridorHigh = 6;
  for (let step = 0; step < 6; step += 1) {
    const radius = (corridorLow + corridorHigh) / 2;
    const removed = new Set<number>();
    for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
      const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
      const middle = centroid(ids.map((index) => read(mesh.positions, index)));
      const depth = depthOf(middle);
      if (depth <= inner + 0.12 || depth > depthOf(target) + 0.45) continue;
      if (!insideLoop(middle, footprint, face, 0.8)) continue;
      const span = sub(target, origin);
      const along = Math.min(1, Math.max(0, dot(sub(middle, origin), span) / (length(span) ** 2 || 1)));
      if (length(sub(middle, lerp(origin, target, along))) > radius) continue;
      removed.add(triangle);
    }
    const loops = boundaryLoops(mesh, removed);
    if (removed.size > 20 && loops.length >= 1 && loops.length <= 4 && componentCount(subsetMesh(mesh, removed, false)) === 1) {
      best = removed;
      corridorLow = radius;
    } else corridorHigh = radius;
  }
  return best;
}

function loopDistance(point: Vec3, loop: Vec3[], face: FaceFrame) {
  const flat = (value: Vec3) => ({ u: dot(sub(value, face.origin), face.u), v: dot(sub(value, face.origin), face.v) });
  const site = flat(point);
  let distance = Infinity;
  for (let index = 0; index < loop.length; index += 1) {
    const a = flat(loop[index]);
    const b = flat(loop[(index + 1) % loop.length]);
    const ab = { u: b.u - a.u, v: b.v - a.v };
    const lengthSq = ab.u * ab.u + ab.v * ab.v || 1;
    const t = Math.min(1, Math.max(0, ((site.u - a.u) * ab.u + (site.v - a.v) * ab.v) / lengthSq));
    distance = Math.min(distance, Math.hypot(site.u - (a.u + ab.u * t), site.v - (a.v + ab.v * t)));
  }
  return distance;
}

function boundaryLoops(mesh: IsoMesh, removed: Set<number>) {
  const forward = new Set<string>();
  removed.forEach((triangle) => {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) forward.add(`${ids[edge]}>${ids[(edge + 1) % 3]}`);
  });
  const next = new Map<number, number[]>();
  forward.forEach((key) => {
    const [from, to] = key.split(">").map(Number);
    const back = `${to}>${from}`;
    if (forward.has(back)) return;
    const list = next.get(from) ?? [];
    list.push(to);
    next.set(from, list);
  });
  const unused = new Set<string>();
  next.forEach((targets, from) => targets.forEach((to) => unused.add(`${from}>${to}`)));
  const loops: number[][] = [];
  const blocked = new Set<string>();
  while (unused.size > 0) {
    const seed = [...unused].find((edge) => !blocked.has(edge));
    if (!seed) break;
    const [start, first] = seed.split(">").map(Number);
    const loop = [start];
    const seen = new Map<number, number>([[start, 0]]);
    let previous = start;
    let current = first;
    const taken = [seed];
    unused.delete(seed);
    let guard = 0;
    let closeAt = -1;
    while (guard < mesh.positions.length) {
      guard += 1;
      if (current === start) { closeAt = 0; break; }
      const revisit = seen.get(current);
      if (revisit !== undefined) { closeAt = revisit; break; }
      seen.set(current, loop.length);
      loop.push(current);
      const options = (next.get(current) ?? []).filter((candidate) => unused.has(`${current}>${candidate}`));
      if (options.length === 0) break;
      const incoming = sub(read(mesh.positions, current), read(mesh.positions, previous));
      options.sort((left, right) => Math.abs(turnPast(incoming, sub(read(mesh.positions, left), read(mesh.positions, current)))) - Math.abs(turnPast(incoming, sub(read(mesh.positions, right), read(mesh.positions, current)))));
      const choice = options[0];
      const key = `${current}>${choice}`;
      unused.delete(key);
      taken.push(key);
      previous = current;
      current = choice;
    }
    if (closeAt >= 0) {
      for (let index = 0; index < closeAt; index += 1) unused.add(taken[index]);
      const cycle = loop.slice(closeAt);
      if (cycle.length >= 3) loops.push(cycle);
    } else {
      taken.forEach((edge) => unused.add(edge));
      blocked.add(seed);
    }
  }
  return loops.sort((a, b) => loopLength(b, mesh) - loopLength(a, mesh));
}

function turnPast(incoming: Vec3, outgoing: Vec3) {
  return Math.atan2(length(cross(incoming, outgoing)), dot(incoming, outgoing));
}

function leaveDirections(mesh: IsoMesh, loop: number[], removed: Set<number>, face: FaceFrame) {
  const normals = vertexNormals(mesh, removed);
  const raw = loop.map((index, sample) => {
    const point = read(mesh.positions, index);
    const previous = read(mesh.positions, loop[(sample + loop.length - 1) % loop.length]);
    const next = read(mesh.positions, loop[(sample + 1) % loop.length]);
    const edge = normalize(sub(next, previous));
    const normal = normals.get(index) ?? face.normal;
    let leave = cross(normal, edge);
    if (length(leave) < 1e-5) leave = { ...face.normal };
    if (dot(leave, face.normal) < 0) leave = scale(leave, -1);
    return normalize(leave);
  });
  return raw.map((direction, index) => normalize(add(add(raw[(index + raw.length - 1) % raw.length], scale(direction, 2)), raw[(index + 1) % raw.length])));
}

function hermiteRings(from: Vec3[], to: Vec3[], start: Vec3[], end: Vec3[], count: number) {
  return Array.from({ length: count }, (_, station) => {
    const t = station / (count - 1);
    return from.map((point, index) => {
      const chord = Math.max(0.2, length(sub(to[index], point)));
      return hermite(point, to[index], scale(start[index], chord * 0.62), scale(normalize(end[index]), chord * 0.62), t);
    });
  });
}

function behindPoints(mesh: IsoMesh, loop: number[], removed: Set<number>, leave: Vec3[]) {
  const onLoop = new Set(loop);
  const neighbors = new Map<number, number[]>();
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    if (removed.has(triangle)) continue;
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const list = neighbors.get(a) ?? [];
      if (!list.includes(b)) list.push(b);
      neighbors.set(a, list);
    }
  }
  return loop.map((index, sample) => {
    const point = read(mesh.positions, index);
    let best = add(point, scale(leave[sample], -0.35));
    let bestScore = -Infinity;
    (neighbors.get(index) ?? []).forEach((other) => {
      if (onLoop.has(other)) return;
      const candidate = read(mesh.positions, other);
      const score = dot(sub(point, candidate), leave[sample]);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    return best;
  });
}

function readOpenSheet(mesh: IsoMesh, loop: number[], face: FaceFrame) {
  const loopPoints = loop.map((index) => read(mesh.positions, index));
  const nearDistance = (point: Vec3) => {
    let best = Infinity;
    loopPoints.forEach((sample) => { best = Math.min(best, length(sub(point, sample))); });
    return best;
  };
  const records: { ids: number[]; normal: Vec3; centroid: Vec3 }[] = [];
  const recordIndex = new Map<number, number>();
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const corners = ids.map((index) => read(mesh.positions, index));
    const centroidPoint = centroid(corners);
    if (nearDistance(centroidPoint) > 3.2) continue;
    const raw = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
    if (length(raw) < 1e-10) continue;
    recordIndex.set(triangle, records.length);
    records.push({ ids, centroid: centroidPoint, normal: normalize(raw) });
  }
  const neighbors: number[][] = records.map(() => []);
  const edgeMap = new Map<string, number[]>();
  records.forEach((record, index) => {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = record.ids[edge];
      const b = record.ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = edgeMap.get(key) ?? [];
      list.push(index);
      edgeMap.set(key, list);
    }
  });
  edgeMap.forEach((tris) => {
    if (tris.length === 2) {
      neighbors[tris[0]].push(tris[1]);
      neighbors[tris[1]].push(tris[0]);
    }
  });
  const owner = new Int32Array(records.length).fill(-1);
  const patches: number[][] = [];
  records.forEach((record, seed) => {
    if (owner[seed] >= 0 || nearDistance(record.centroid) > 1.2) return;
    const id = patches.length;
    const patch: number[] = [];
    const stack = [seed];
    owner[seed] = id;
    while (stack.length) {
      const current = stack.pop() as number;
      patch.push(current);
      neighbors[current].forEach((next) => {
        if (owner[next] >= 0) return;
        if (dot(records[seed].normal, records[next].normal) < 0.72) return;
        owner[next] = id;
        stack.push(next);
      });
    }
    if (patch.length >= 12) patches.push(patch);
  });
  const faceNormal = face.normal;
  const ranked = patches.map((patch, index) => {
    const mean = normalize(patch.reduce((sum, record) => add(sum, records[record].normal), { x: 0, y: 0, z: 0 }));
    return { index, mean, triangles: patch.length };
  }).filter((patch) => Math.abs(dot(patch.mean, faceNormal)) < 0.45 && patch.triangles > 40);
  ranked.sort((a, b) => Math.max(Math.abs(b.mean.x), Math.abs(b.mean.y), Math.abs(b.mean.z)) - Math.max(Math.abs(a.mean.x), Math.abs(a.mean.y), Math.abs(a.mean.z)));
  const broad = ranked[0] ?? null;
  const empty = {
    open: false,
    roles: loop.map(() => "rim" as const),
    frame: { U: face.normal, V: { x: 0, y: 1, z: 0 }, N: { x: 0, y: 0, z: 1 } },
    throughPairs: 0,
    gapPairs: 0,
    rimRatio: 1,
    guide: blankMesh(mesh),
  };
  if (!broad) return empty;
  const sheetIds = new Set<number>();
  patches.forEach((patch, index) => {
    const mean = normalize(patch.reduce((sum, record) => add(sum, records[record].normal), { x: 0, y: 0, z: 0 }));
    if (index === broad.index || dot(mean, broad.mean) > 0.92) patch.forEach((record) => sheetIds.add(record));
  });
  let throughPairs = 0;
  let gapPairs = 0;
  const otherIds = new Set<number>();
  const sheetList = [...sheetIds];
  const step = Math.max(1, Math.floor(sheetList.length / 18));
  for (let cursor = 0; cursor < sheetList.length; cursor += step) {
    const record = records[sheetList[cursor]];
    let hit: { record: number; distance: number; point: Vec3 } | null = null;
    for (const [index, other] of records.entries()) {
      if (sheetIds.has(index) || dot(broad.mean, other.normal) > -0.35) continue;
      if (length(sub(other.centroid, record.centroid)) > 2.6) continue;
      const along = rayHit(record.centroid, scale(broad.mean, -1), other.ids.map((id) => read(mesh.positions, id)))
        ?? rayHit(record.centroid, broad.mean, other.ids.map((id) => read(mesh.positions, id)));
      if (!along || along.distance > 2.3) continue;
      const nextHit = { record: index, distance: along.distance, point: along.point };
      if (!hit || nextHit.distance < hit.distance) hit = nextHit;
    }
    if (!hit) continue;
    otherIds.add(hit.record);
    const midpoint = add(record.centroid, scale(sub(hit.point, record.centroid), 0.5));
    if (pointInside(mesh, midpoint)) throughPairs += 1;
    else gapPairs += 1;
  }
  const sheetVertices = new Set<number>();
  const otherVertices = new Set<number>();
  sheetIds.forEach((index) => records[index].ids.forEach((id) => sheetVertices.add(id)));
  otherIds.forEach((index) => records[index].ids.forEach((id) => otherVertices.add(id)));
  const roles = loop.map((index) => sheetVertices.has(index) ? "sheet" as const : otherVertices.has(index) ? "other" as const : "rim" as const);
  const rimRatio = roles.filter((role) => role === "rim").length / Math.max(1, roles.length);
  const open = rimRatio > 0.5 || gapPairs > throughPairs;
  const normal = broad.mean;
  const projected = sub(face.normal, scale(normal, dot(face.normal, normal)));
  const along = length(projected) > 0.3 ? normalize(projected) : { x: 1, y: 0, z: 0 };
  const plateNormal = normalize(normal);
  const plateAlong = normalize(sub(along, scale(plateNormal, dot(along, plateNormal))));
  const width = cross(plateNormal, plateAlong);
  const guide = meshFromRecords(mesh, [...sheetIds].map((index) => records[index].ids));
  return {
    open: open || gapPairs > throughPairs,
    roles,
    frame: { N: plateNormal, U: plateAlong, V: length(width) > 1e-5 ? normalize(width) : { x: 0, y: 1, z: 0 } },
    throughPairs,
    gapPairs,
    rimRatio,
    guide,
  };
}

function legacySegmentRoles(roles: ("sheet" | "rim" | "other")[]) {
  const labels = roles.map(() => "passive" as "sheet-adjacent" | "side-wall" | "rim-closure" | "passive");
  const sheet = roles.map((role, index) => (role === "sheet" ? index : -1)).filter((index) => index >= 0);
  sheet.forEach((index) => { labels[index] = "sheet-adjacent"; });
  if (sheet.length === 0) return labels;
  const start = sheet[0];
  const end = sheet[sheet.length - 1];
  const count = roles.length;
  for (let step = 1; step <= 18; step += 1) {
    const name = step <= 8 ? "side-wall" as const : "rim-closure" as const;
    const before = (start - step + count) % count;
    const after = (end + step) % count;
    if (labels[before] === "passive") labels[before] = name;
    if (labels[after] === "passive") labels[after] = name;
  }
  return labels;
}

function cutSheetAnchor(
  mesh: IsoMesh,
  guide: IsoMesh,
  frame: { U: Vec3; V: Vec3; N: Vec3 },
  terminal: Vec3[],
  legacyBoundary: Vec3[],
  legacy: ("sheet" | "rim" | "other")[],
) {
  const keys = new Map<string, number>();
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]].sort((a, b) => a - b);
    keys.set(ids.join(":"), triangle);
  }
  const records: { triangle: number; mid: Vec3; area: number }[] = [];
  for (let triangle = 0; triangle < guide.triangles; triangle += 1) {
    const ids = [guide.indices[triangle * 3], guide.indices[triangle * 3 + 1], guide.indices[triangle * 3 + 2]];
    const source = keys.get([...ids].sort((a, b) => a - b).join(":"));
    if (source === undefined) continue;
    const corners = ids.map((index) => read(mesh.positions, index));
    const area = length(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]))) * 0.5;
    if (area < 1e-10) continue;
    records.push({ triangle: source, mid: centroid(corners), area });
  }
  if (records.length < 30) return null;
  const origin = centroid(records.map((record) => record.mid));
  const uv = (point: Vec3) => ({ u: dot(sub(point, origin), frame.U), v: dot(sub(point, origin), frame.V) });
  const terminalCenter = centroid(terminal);
  const terminalUV = uv(terminalCenter);
  let nearest = records[0];
  let nearestDistance = Infinity;
  records.forEach((record) => {
    const site = uv(record.mid);
    const distance = Math.hypot(site.u - terminalUV.u, site.v - terminalUV.v);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = record;
    }
  });
  const nearestUV = uv(nearest.mid);
  const inwardLength = Math.hypot(nearestUV.u, nearestUV.v) || 1;
  const inward = { u: -nearestUV.u / inwardLength, v: -nearestUV.v / inwardLength };
  let choice: { radius: number; center: Vec3; records: typeof records; area: number; onSheet: number } | null = null;
  for (const radius of [1, 1.15, 1.3]) {
    const centerUV = { u: nearestUV.u + inward.u * radius * 0.85, v: nearestUV.v + inward.v * radius * 0.85 };
    const inside = records.filter((record) => {
      const site = uv(record.mid);
      return Math.hypot(site.u - centerUV.u, site.v - centerUV.v) <= radius;
    });
    const area = inside.reduce((sum, record) => sum + record.area, 0);
    const onSheet = area / (Math.PI * radius * radius);
    if (inside.length < 18 || onSheet < 0.9) continue;
    const center = add(origin, add(scale(frame.U, centerUV.u), scale(frame.V, centerUV.v)));
    const level = nearest.mid;
    choice = { radius, center: add(center, scale(frame.N, dot(sub(level, center), frame.N))), records: inside, area, onSheet };
  }
  if (!choice) return null;
  const selected = new Set(choice.records.map((record) => record.triangle));
  const neighbors = new Map<number, number[]>();
  const edgeMap = new Map<string, number[]>();
  choice.records.forEach((record) => {
    const ids = [mesh.indices[record.triangle * 3], mesh.indices[record.triangle * 3 + 1], mesh.indices[record.triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = edgeMap.get(key) ?? [];
      list.push(record.triangle);
      edgeMap.set(key, list);
    }
  });
  edgeMap.forEach((tris) => {
    if (tris.length !== 2) return;
    const [left, right] = tris;
    neighbors.set(left, [...(neighbors.get(left) ?? []), right]);
    neighbors.set(right, [...(neighbors.get(right) ?? []), left]);
  });
  const seen = new Set<number>();
  let bestComponent: number[] = [];
  let bestScore = Infinity;
  selected.forEach((seed) => {
    if (seen.has(seed)) return;
    const component: number[] = [];
    const stack = [seed];
    seen.add(seed);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      component.push(current);
      (neighbors.get(current) ?? []).forEach((next) => {
        if (seen.has(next)) return;
        seen.add(next);
        stack.push(next);
      });
    }
    const middle = centroid(component.map((triangle) => {
      const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
      return centroid(ids.map((index) => read(mesh.positions, index)));
    }));
    const score = length(sub(middle, choice!.center));
    if (score < bestScore) {
      bestScore = score;
      bestComponent = component;
    }
  });
  if (bestComponent.length < 18) return null;
  const removed = new Set(bestComponent);
  const area = bestComponent.reduce((sum, triangle) => {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const corners = ids.map((index) => read(mesh.positions, index));
    return sum + length(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]))) * 0.5;
  }, 0);
  const rim = legacyBoundary.filter((_, index) => legacy[index] !== "sheet");
  let rimDistance = Infinity;
  rim.forEach((point) => { rimDistance = Math.min(rimDistance, length(sub(point, choice!.center))); });
  const labels = legacySegmentRoles(legacy);
  const segments = {
    sheetAdjacent: labels.filter((label) => label === "sheet-adjacent").length,
    sideWall: labels.filter((label) => label === "side-wall").length,
    rimClosure: labels.filter((label) => label === "rim-closure").length,
    passive: labels.filter((label) => label === "passive").length,
  };
  return {
    removed,
    center: choice.center,
    radius: choice.radius,
    area: Number(area.toFixed(3)),
    onSheet: Number((area / (Math.PI * choice.radius * choice.radius)).toFixed(3)),
    terminalArea: Number(loopArea(terminal).toFixed(3)),
    rimDistance: Number(rimDistance.toFixed(3)),
    segments,
    legacyRoles: labels,
  };
}

function loopContains(point: Vec3, loop: Vec3[], origin: Vec3, axisU: Vec3, axisV: Vec3) {
  const site = { u: dot(sub(point, origin), axisU), v: dot(sub(point, origin), axisV) };
  let inside = false;
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index, index += 1) {
    const a = { u: dot(sub(loop[index], origin), axisU), v: dot(sub(loop[index], origin), axisV) };
    const b = { u: dot(sub(loop[previous], origin), axisU), v: dot(sub(loop[previous], origin), axisV) };
    if ((a.v > site.v) === (b.v > site.v)) continue;
    const crossU = (b.u - a.u) * (site.v - a.v) / (b.v - a.v || 1e-8) + a.u;
    if (site.u < crossU) inside = !inside;
  }
  return inside;
}

function openGridMesh(rows: Vec3[][]) {
  const across = rows[0]?.length ?? 0;
  const positions: number[] = [];
  rows.forEach((row) => row.forEach((point) => positions.push(point.x, point.y, point.z)));
  const indices: number[] = [];
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < across - 1; column += 1) {
      const a = row * across + column;
      const b = a + 1;
      const c = a + across;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return shade({ positions: Float32Array.from(positions), normals: new Float32Array(positions.length), indices: Uint32Array.from(indices), triangles: indices.length / 3 });
}

function medianAttachmentThickness(mesh: IsoMesh, frame: { U: Vec3; V: Vec3; N: Vec3 }, center: Vec3, reach: number) {
  const hits: number[] = [];
  const direction = scale(frame.N, -1);
  for (let across = -2; across <= 2; across += 1) {
    for (let along = -2; along <= 2; along += 1) {
      const site = add(center, add(scale(frame.U, across * reach * 0.28), scale(frame.V, along * reach * 0.28)));
      const origin = add(site, scale(frame.N, 0.08));
      let nearest = Infinity;
      for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
        const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
        const corners = ids.map((index) => read(mesh.positions, index));
        const hit = rayHit(origin, direction, corners);
        if (!hit || hit.distance > 2.4) continue;
        const face = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
        if (dot(direction, face) <= 0.35 * length(face)) continue;
        nearest = Math.min(nearest, hit.distance);
      }
      const span = nearest - 0.08;
      if (span > 0.05 && span < 2.2) hits.push(span);
    }
  }
  if (hits.length < 3) return 0.45;
  hits.sort((left, right) => left - right);
  return hits[Math.floor(hits.length / 2)];
}

function thickenOpenGrid(rows: Vec3[][], guide: Vec3, thickness: number) {
  const rowCount = rows.length;
  const columnCount = rows[0].length;
  let normals = rows.map(() => rows[0].map(() => ({ x: 0, y: 0, z: 0 })));
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (let column = 0; column < columnCount - 1; column += 1) {
      const face = cross(sub(rows[row][column + 1], rows[row][column]), sub(rows[row + 1][column], rows[row][column]));
      [[row, column], [row, column + 1], [row + 1, column], [row + 1, column + 1]].forEach(([rr, cc]) => {
        normals[rr][cc] = add(normals[rr][cc], face);
      });
    }
  }
  normals = normals.map((row) => row.map((normal) => (length(normal) > 1e-8 ? normalize(normal) : { ...guide })));
  for (let pass = 0; pass < 4; pass += 1) {
    normals = normals.map((row, rr) => row.map((normal, cc) => {
      let sum = scale(normal, 2);
      [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]].forEach(([nr, nc]) => {
        if (nr < 0 || nc < 0 || nr >= rowCount || nc >= columnCount) return;
        sum = add(sum, normals[nr][nc]);
      });
      return normalize(sum);
    }));
  }
  if (dot(normals[0][Math.floor(columnCount / 2)], guide) < 0) normals = normals.map((row) => row.map((normal) => scale(normal, -1)));
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const reference = column > 0 ? normals[row][column - 1] : row > 0 ? normals[row - 1][column] : guide;
      if (dot(normals[row][column], reference) < 0) normals[row][column] = scale(normals[row][column], -1);
    }
  }
  const radiusAt = (row: number) => {
    if (row <= 0 || row >= rowCount - 1) return Infinity;
    let radius = Infinity;
    for (let column = 0; column < columnCount; column += 1) {
      const before = sub(rows[row][column], rows[row - 1][column]);
      const after = sub(rows[row + 1][column], rows[row][column]);
      const left = length(before);
      const right = length(after);
      if (left < 1e-5 || right < 1e-5) continue;
      const cosine = Math.min(1, Math.max(-1, dot(before, after) / (left * right)));
      const angle = Math.acos(cosine);
      if (angle < 1e-4) continue;
      radius = Math.min(radius, ((left + right) * 0.5) / angle);
    }
    return radius;
  };
  const segmentHits = (origin: Vec3, end: Vec3, corners: Vec3[]) => {
    const edge = sub(end, origin);
    const hit = rayHit(origin, edge, corners);
    return !!hit && hit.distance > 1e-4 && hit.distance < 1 - 1e-4;
  };
  const skinCrosses = (points: Vec3[], indices: number[]) => {
    const tris: Vec3[][] = [];
    for (let index = 0; index < indices.length; index += 3) tris.push([points[indices[index]], points[indices[index + 1]], points[indices[index + 2]]]);
    for (let index = 0; index < tris.length; index += 1) {
      for (let other = index + 1; other < tris.length; other += 1) {
        const left = tris[index];
        const right = tris[other];
        if (left.some((point) => right.some((candidate) => length(sub(point, candidate)) < 1e-5))) continue;
        if (segmentHits(left[0], left[1], right) || segmentHits(left[1], left[2], right) || segmentHits(left[2], left[0], right)) return true;
      }
    }
    return false;
  };
  const assemble = (safety: number) => {
    const cap = rows.map((_, row) => Math.min(thickness, radiusAt(row) * safety));
    let field = cap.slice();
    for (let pass = 0; pass < 3; pass += 1) {
      field = field.map((value, row) => {
        const left = field[Math.max(0, row - 1)];
        const right = field[Math.min(rowCount - 1, row + 1)];
        return Math.min(cap[row], (left + value * 2 + right) / 4);
      });
    }
    const sideA = rows.map((row, rr) => row.map((point, cc) => add(point, scale(normals[rr][cc], field[rr] * 0.5))));
    const sideB = rows.map((row, rr) => row.map((point, cc) => add(point, scale(normals[rr][cc], -field[rr] * 0.5))));
    const points = [...sideA.flat(), ...sideB.flat()];
    const idA = sideA.map((row, rr) => row.map((_, cc) => rr * columnCount + cc));
    const idB = sideB.map((row, rr) => row.map((_, cc) => sideA.length * columnCount + rr * columnCount + cc));
    const skinA: number[] = [];
    const skinB: number[] = [];
    const walls: number[] = [];
    const face = (bucket: number[], a: number, b: number, c: number) => bucket.push(a, b, c);
    for (let row = 0; row < rowCount - 1; row += 1) {
      for (let column = 0; column < columnCount - 1; column += 1) {
        const a = idA[row][column];
        const b = idA[row][column + 1];
        const c = idA[row + 1][column];
        const d = idA[row + 1][column + 1];
        const wind = cross(sub(rows[row][column + 1], rows[row][column]), sub(rows[row + 1][column], rows[row][column]));
        const matched = dot(wind, normals[row][column]) >= 0;
        const e = idB[row][column];
        const f = idB[row][column + 1];
        const g = idB[row + 1][column];
        const h = idB[row + 1][column + 1];
        if (matched) {
          face(skinA, a, b, d);
          face(skinA, a, d, c);
          face(skinB, e, h, f);
          face(skinB, e, g, h);
        } else {
          face(skinA, a, d, b);
          face(skinA, a, c, d);
          face(skinB, e, f, h);
          face(skinB, e, h, g);
        }
      }
    }
    const opening = cross(sub(rows[0][1], rows[0][0]), sub(rows[1][0], rows[0][0]));
    const wallOut = dot(opening, normals[0][0]) >= 0;
    const link = (a0: number, a1: number, b0: number, b1: number) => {
      if (wallOut) {
        face(walls, a0, b1, a1);
        face(walls, a0, b0, b1);
      } else {
        face(walls, a0, a1, b1);
        face(walls, a0, b1, b0);
      }
    };
    for (let column = 0; column < columnCount - 1; column += 1) link(idA[0][column], idA[0][column + 1], idB[0][column], idB[0][column + 1]);
    for (let row = 0; row < rowCount - 1; row += 1) link(idA[row][columnCount - 1], idA[row + 1][columnCount - 1], idB[row][columnCount - 1], idB[row + 1][columnCount - 1]);
    for (let column = columnCount - 2; column >= 0; column -= 1) link(idA[rowCount - 1][column + 1], idA[rowCount - 1][column], idB[rowCount - 1][column + 1], idB[rowCount - 1][column]);
    for (let row = rowCount - 2; row >= 0; row -= 1) link(idA[row + 1][0], idA[row][0], idB[row + 1][0], idB[row][0]);
    return { points, skinA, skinB, walls, field };
  };
  let safety = 1.55;
  let solid = assemble(safety);
  while (safety > 0.35 && (skinCrosses(solid.points, solid.skinA) || skinCrosses(solid.points, solid.skinB))) {
    safety *= 0.82;
    solid = assemble(safety);
  }
  const positions = solid.points.flatMap((point) => [point.x, point.y, point.z]);
  const build = (indices: number[]) => shade({
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  });
  return {
    mesh: build([...solid.skinA, ...solid.skinB, ...solid.walls]),
    sideA: build(solid.skinA),
    sideB: build(solid.skinB),
    walls: build(solid.walls),
    samples: [0, 0.25, 0.5, 0.75, 1].map((t) => Number(solid.field[Math.round(t * (rowCount - 1))].toFixed(3))),
  };
}

function openSheetSurface(
  frame: { U: Vec3; V: Vec3; N: Vec3 },
  parentCenter: Vec3,
  parentRadius: number,
  parentArea: number,
  terminal: Vec3[],
) {
  const terminalCenter = centroid(terminal);
  let normal = normalize(loopNormal(terminal));
  if (length(normal) < 1e-5) normal = { x: 0, y: 1, z: 0 };
  if (dot(normal, sub(parentCenter, terminalCenter)) < 0) normal = scale(normal, -1);
  let across = sub(frame.V, scale(normal, dot(frame.V, normal)));
  if (length(across) < 0.25) across = sub(frame.U, scale(normal, dot(frame.U, normal)));
  across = normalize(across);
  let along = normalize(cross(normal, across));
  if (dot(along, sub(parentCenter, terminalCenter)) < 0) along = scale(along, -1);
  let center = sub(parentCenter, scale(normal, dot(sub(parentCenter, terminalCenter), normal)));
  const wanted = Math.sqrt(Math.max(parentArea, 0.5) * 1.15 / Math.PI);
  const clearance = (site: Vec3, radius: number) => {
    for (let step = 0; step < 20; step += 1) {
      const angle = step / 20 * Math.PI * 2;
      const sample = add(site, add(scale(across, Math.cos(angle) * radius), scale(along, Math.sin(angle) * radius)));
      if (!loopContains(sample, terminal, terminalCenter, across, along)) return false;
    }
    return loopContains(site, terminal, terminalCenter, across, along);
  };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2;
    if (clearance(lerp(center, terminalCenter, mid), wanted)) high = mid;
    else low = mid;
  }
  center = lerp(center, terminalCenter, clearance(lerp(center, terminalCenter, high), wanted) ? high : 1);
  let radius = wanted;
  while (radius > wanted * 0.55 && !clearance(center, radius)) radius *= 0.92;
  const loop = Array.from({ length: 28 }, (_, index) => {
    const angle = index / 28 * Math.PI * 2;
    return add(center, add(scale(across, Math.cos(angle) * radius), scale(along, Math.sin(angle) * radius)));
  });
  const area = Math.PI * radius * radius;
  const travelRaw = sub(center, parentCenter);
  const travel = normalize(sub(travelRaw, scale(frame.N, dot(travelRaw, frame.N))));
  const sheetAcross = normalize(cross(frame.N, length(travel) > 0.2 ? travel : frame.U));
  const reach = parentRadius * 0.88;
  const parentAt = (u: number, v: number) => add(parentCenter, add(scale(sheetAcross, u * reach), scale(travel, v * reach)));
  const hybridAt = (u: number, v: number) => add(center, add(scale(across, u * radius), scale(along, v * radius * 0.9)));
  const columns: number = 9;
  const rowCount = 18;
  const hold = 0.28;
  const land = 0.22;
  const rows = Array.from({ length: rowCount }, (_, row) => {
    const t = row / (rowCount - 1);
    return Array.from({ length: columns }, (__, column) => {
      const u = columns === 1 ? 0 : (column / (columns - 1)) * 2 - 1;
      if (t <= hold) return parentAt(u, -1 + 2 * (t / hold));
      if (t >= 1 - land) return hybridAt(u, 1 - 2 * ((t - (1 - land)) / land));
      const w = (t - hold) / (1 - hold - land);
      const eased = w * w * (3 - 2 * w);
      const from = parentAt(u, 1);
      const to = hybridAt(u, 1);
      const span = Math.max(0.4, length(sub(to, from)));
      const chord = normalize(sub(to, from));
      const sheetTangent = length(travel) > 0.2 ? travel : chord;
      const depart = normalize(add(scale(sheetTangent, 0.7), scale(chord, 0.3)));
      const flat = sub(chord, scale(normal, dot(chord, normal)));
      const arrive = normalize(length(flat) > 0.15 ? add(scale(normalize(flat), 0.75), scale(chord, 0.25)) : chord);
      const curved = hermite(from, to, scale(depart, span * 0.42), scale(arrive, span * 0.42), eased);
      const release = 0.82;
      if (w >= release) return curved;
      const fade = w / release;
      const blend = fade * 0.72 + (fade * fade * (3 - 2 * fade)) * 0.28;
      const advanced = Math.max(0, dot(sub(curved, from), sheetTangent));
      return lerp(add(from, scale(sheetTangent, advanced)), curved, blend);
    });
  });
  return {
    rows,
    totalTurn: Number(angleBetween(length(travel) > 0.2 ? travel : frame.U, normalize(sub(hybridAt(0, 1), parentAt(0, 1)))).toFixed(2)),
    receiving: {
      center,
      normal,
      area: Number(area.toFixed(3)),
      ratio: Number((area / Math.max(1e-6, parentArea)).toFixed(3)),
      loop,
    },
  };
}

function sheetAnchorRings(boundary: Vec3[], terminal: Vec3[], frame: { U: Vec3; V: Vec3; N: Vec3 }, center: Vec3) {
  const count = boundary.length;
  const { U, V, N } = frame;
  const toUV = (point: Vec3) => ({
    u: dot(sub(point, center), U),
    v: dot(sub(point, center), V),
    n: dot(sub(point, center), N),
  });
  const fromUV = (u: number, v: number, n: number) => add(center, add(scale(U, u), add(scale(V, v), scale(N, n))));
  const edge = boundary.map(toUV);
  const terminalCenter = toUV(centroid(terminal));
  const aligned = alignLoops(boundary, terminal, terminal).primary.map(toUV);
  const baseRadius = edge.reduce((sum, point) => sum + Math.hypot(point.u, point.v), 0) / Math.max(1, count);
  const stations = 12;
  const bendAt = 7;
  const rings: Vec3[][] = [];
  for (let station = 0; station < stations; station += 1) {
    if (station === 0) {
      rings.push(boundary.map((point) => ({ ...point })));
      continue;
    }
    const travelT = Math.min(1, station / bendAt);
    const travel = travelT * travelT * (3 - 2 * travelT);
    const dropT = station <= bendAt ? 0 : (station - bendAt) / (stations - 1 - bendAt);
    const drop = dropT * dropT * (3 - 2 * dropT);
    const interior = station > bendAt;
    const scaleShape = interior ? 0.94 - (station - bendAt) * 0.14 : 1 - 0.05 * travel;
    let shape = edge.map((point) => ({ u: point.u, v: point.v }));
    const passes = Math.min(4, station);
    for (let pass = 0; pass < passes; pass += 1) {
      shape = shape.map((point, index) => {
        const previous = shape[(index + count - 1) % count];
        const next = shape[(index + 1) % count];
        return { u: point.u * 0.62 + (previous.u + next.u) * 0.19, v: point.v * 0.62 + (previous.v + next.v) * 0.19 };
      });
    }
    const meanRadius = shape.reduce((sum, point) => sum + Math.hypot(point.u, point.v), 0) / Math.max(1, count);
    const gain = meanRadius > 1e-5 ? (baseRadius * scaleShape) / meanRadius : 1;
    const blend = drop * 0.08;
    const slideU = terminalCenter.u * travel;
    const slideV = terminalCenter.v * travel * 0.55;
    const slideN = terminalCenter.n * drop;
    rings.push(shape.map((point, index) => fromUV(
      slideU + point.u * gain * (1 - blend) + (aligned[index].u - terminalCenter.u) * blend,
      slideV + point.v * gain * (1 - blend) + (aligned[index].v - terminalCenter.v) * blend,
      slideN,
    )));
  }
  for (let station = 1; station < rings.length; station += 1) {
    const previous = rings[station - 1];
    const ring = rings[station];
    for (let index = 0; index < ring.length; index += 1) {
      const ahead = (index + 1) % ring.length;
      const span = length(cross(sub(previous[ahead], previous[index]), sub(ring[index], previous[index])));
      if (span > 1e-4) continue;
      const edgeDirection = sub(previous[ahead], previous[index]);
      const push = cross(length(edgeDirection) > 1e-8 ? normalize(edgeDirection) : U, N);
      ring[index] = add(ring[index], scale(length(push) > 1e-5 ? normalize(push) : V, 0.04));
    }
  }
  return { rings };
}

function rayHit(origin: Vec3, direction: Vec3, corners: Vec3[]) {
  const [a, b, c] = corners;
  const ab = sub(b, a);
  const ac = sub(c, a);
  const pvec = cross(direction, ac);
  const det = dot(ab, pvec);
  if (Math.abs(det) < 1e-8) return null;
  const inverse = 1 / det;
  const tvec = sub(origin, a);
  const u = dot(tvec, pvec) * inverse;
  if (u < -0.02 || u > 1.02) return null;
  const qvec = cross(tvec, ab);
  const v = dot(direction, qvec) * inverse;
  if (v < -0.02 || u + v > 1.04) return null;
  const distance = dot(ac, qvec) * inverse;
  if (distance < 0.05) return null;
  return { distance, point: add(origin, scale(direction, distance)) };
}

function pointInside(mesh: IsoMesh, point: Vec3) {
  const direction = { x: 0.91, y: 0.28, z: 0.31 };
  let hits = 0;
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    if (rayHit(point, direction, ids.map((index) => read(mesh.positions, index)))) hits += 1;
  }
  return hits % 2 === 1;
}

function meshFromRecords(mesh: IsoMesh, corners: number[][]) {
  const indices: number[] = [];
  corners.forEach((ids) => indices.push(ids[0], ids[1], ids[2]));
  return shade({ positions: Float32Array.from(mesh.positions), normals: new Float32Array(mesh.positions.length), indices: Uint32Array.from(indices), triangles: indices.length / 3 });
}

function plateSheetRings(
  from: Vec3[],
  to: Vec3[],
  start: Vec3[],
  behind: Vec3[],
  count: number,
  frame: { U: Vec3; V: Vec3; N: Vec3 },
  thickness: number,
) {
  const { U, V, N } = frame;
  const origin = centroid(from);
  const height = from.map((point) => dot(sub(point, origin), N));
  const partner = height.map((value, index) => {
    const u = dot(sub(from[index], origin), U);
    const v = dot(sub(from[index], origin), V);
    let best = index;
    let bestScore = Infinity;
    height.forEach((other, candidate) => {
      if (candidate === index) return;
      if (Math.abs(other - value) < Math.max(0.04, thickness * 0.45)) return;
      const du = dot(sub(from[candidate], origin), U) - u;
      const dv = dot(sub(from[candidate], origin), V) - v;
      const score = du * du + dv * dv;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    return best;
  });
  const planeDir = (direction: Vec3) => {
    const tangential = sub(direction, scale(N, dot(direction, N)));
    return length(tangential) > 0.25 ? normalize(tangential) : U;
  };
  const coupled = start.map((direction, index) => {
    const own = planeDir(direction);
    const neighbors = [own];
    [-2, -1, 1, 2].forEach((offset) => neighbors.push(planeDir(start[(index + offset + start.length) % start.length])));
    const summed = neighbors.reduce((sum, item) => add(sum, item), { x: 0, y: 0, z: 0 });
    return length(summed) > 0.4 ? normalize(summed) : own;
  });
  const hold = Math.max(3, Math.min(count - 3, Math.round(count * 0.3)));
  const coord = (point: Vec3) => ({
    u: dot(sub(point, origin), U),
    v: dot(sub(point, origin), V),
    n: dot(sub(point, origin), N),
  });
  const place = (u: number, v: number, n: number) => add(origin, add(scale(U, u), add(scale(V, v), scale(N, n))));
  const rings = Array.from({ length: count }, (_, station) => from.map((point, index) => {
    if (station === 0) return { ...point };
    const measured = length(sub(point, behind[index]));
    const spacing = Math.min(0.28, Math.max(0.08, measured));
    const marched = add(point, scale(coupled[index], spacing * Math.min(station, hold)));
    const locked = place(dot(sub(marched, origin), U), dot(sub(marched, origin), V), height[index]);
    if (station <= hold) return locked;
    const w = (station - hold) / Math.max(1, count - 1 - hold);
    const eased = w * w * (3 - 2 * w);
    const fromCoord = coord(locked);
    const toCoord = coord(to[index]);
    return place(
      fromCoord.u + (toCoord.u - fromCoord.u) * eased,
      fromCoord.v + (toCoord.v - fromCoord.v) * eased,
      fromCoord.n + (toCoord.n - fromCoord.n) * eased,
    );
  }));
  for (let station = 1; station < rings.length; station += 1) {
    const previous = rings[station - 1];
    const ring = rings[station];
    for (let index = 0; index < ring.length; index += 1) {
      const ahead = (index + 1) % ring.length;
      const span = length(cross(sub(previous[ahead], previous[index]), sub(ring[index], previous[index])));
      if (span > 1e-4) continue;
      const edge = sub(previous[ahead], previous[index]);
      const push = cross(length(edge) > 1e-8 ? normalize(edge) : U, N);
      ring[index] = add(ring[index], scale(length(push) > 1e-5 ? normalize(push) : V, 0.05));
    }
  }
  return { rings, partner };
}

function guideVoidOuter(rings: Vec3[][], inner: Vec3[][]) {
  const stations = rings.length;
  const count = rings[0]?.length ?? 0;
  if (stations < 8 || count < 16 || inner.length !== stations) return rings;
  const before = longitudinalSummary(rings);
  const startRead = readLoop(rings[0]);
  const endRead = readLoop(rings[stations - 1]);
  const startSpikes = spikeIndices(startRead.turns);
  const endSpikes = spikeIndices(endRead.turns);
  const startAnchors = featureAnchors(startRead.turns, startSpikes);
  const endAnchors = featureAnchors(endRead.turns, endSpikes);
  const anchors = new Set(startAnchors);
  endAnchors.forEach((index) => { if (!startSpikes.has(index)) anchors.add(index); });
  const startGuide = fairLoop(rings[0], startRead, startAnchors, startSpikes);
  const endGuide = fairLoop(rings[stations - 1], endRead, endAnchors, endSpikes);
  const columns = guideColumns(count, [...anchors], startGuide.guide);
  const startLow = columns.at.map((at) => sampleLoop(startGuide.guide, at));
  const endLow = columns.at.map((at) => sampleLoop(endGuide.guide, at));
  const guideArc = arcFraction(startGuide.guide);
  const bundled = (station: number, at: number) => {
    const center = Math.round(at) % count;
    let sum = { x: 0, y: 0, z: 0 };
    let weight = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const index = (center + offset + count) % count;
      const sampleWeight = offset === 0 ? 2 : 1;
      sum = add(sum, scale(sub(rings[station][index], rings[0][index]), sampleWeight));
      weight += sampleWeight;
    }
    return scale(sum, 1 / weight);
  };
  const morph = rings.map((_, station) => columns.at.map((at, index) => {
    const moved = add(startLow[index], bundled(station, at));
    const landed = add(startLow[index], bundled(stations - 1, at));
    return add(moved, scale(sub(endLow[index], landed), station / (stations - 1)));
  }));
  const steps = rings[0].map((point, index) => length(sub(rings[1][index], point))).sort((a, b) => a - b);
  const collarDepth = steps[Math.floor(steps.length / 2)] || 0.4;
  let entry = [morph[1].map((point) => ({ ...point }))];
  let entryQuality = collarQuality(rings[0], entry[0], guideArc, columns.at);
  if (entryQuality.minAngle < 10 || entryQuality.maxAspect > 12) {
    const dense = guideColumns(count, [...anchors], startGuide.guide, 3);
    const mid = dense.at.map((at, index) => add(sampleLoop(startGuide.guide, at), scale(bundled(1, at), 0.45)));
    entry = [mid, morph[1].map((point) => ({ ...point }))];
    const first = collarQuality(rings[0], mid, guideArc, dense.at);
    const second = collarQuality(mid, morph[1], arcFraction(mid), columns.at.map((_, index) => index));
    entryQuality = worseCollar(first, second);
  }
  const guided: Vec3[][] = [
    rings[0].map((point) => ({ ...point })),
    ...entry,
    ...morph.slice(2, stations - 1),
    rings[stations - 1].map((point) => ({ ...point })),
  ];
  for (let station = 1; station < guided.length - 1; station += 1) {
    const morphStation = station - (entry.length - 1);
    const innerRing = inner[Math.min(inner.length - 1, Math.max(0, morphStation))] ?? inner[0];
    guided[station] = guided[station].map((point) => outsideInner(point, innerRing, 1.407));
  }
  for (let pass = 0; pass < 3; pass += 1) {
    for (let station = 1; station < guided.length - 1; station += 1) {
      if (guided[station].length !== guided[station - 1].length) continue;
      guided[station] = orderRulings(guided[station - 1], uncrossRulings(guided[station - 1], guided[station]));
    }
  }
  guided[0] = rings[0].map((point) => ({ ...point }));
  guided[guided.length - 1] = rings[stations - 1].map((point) => ({ ...point }));
  const main = guided.filter((ring, station) => station > 0 && station < guided.length - 1 && ring.length === columns.at.length);
  const exitQuality = collarQuality(main[main.length - 1] ?? endLow, guided[guided.length - 1], arcFraction(main[main.length - 1] ?? endLow), columns.at.map((_, index) => index));
  const wallGaps = guided.map((ring) => {
    let nearest = Infinity;
    inner.forEach((loop) => loop.forEach((point) => { nearest = Math.min(nearest, loopDistancePoint(point, ring)); }));
    return nearest;
  });
  let crossings = 0;
  for (let station = 0; station < guided.length - 1; station += 1) {
    if (guided[station].length !== guided[station + 1].length) continue;
    const samples = guided[station].length;
    for (let index = 0; index < samples; index += 1) {
      const ahead = (index + 1) % samples;
      if (rulingCross(guided[station][index], guided[station + 1][index], guided[station][ahead], guided[station + 1][ahead])) crossings += 1;
    }
  }
  const loads = segmentLoads(count, columns.at);
  const collarFailed = entryQuality.minAngle < 8 || entryQuality.maxAspect > 20 || entryQuality.p95Dihedral > 80
    || exitQuality.minAngle < 8 || exitQuality.maxAspect > 20 || exitQuality.p95Dihedral > 80;
  const report = {
    collarFailed,
    anchors: [...anchors],
    startAnchors: [...startAnchors],
    startTurns: startRead.turns.map((turn) => Number(turn.toFixed(2))),
    startGuide: startGuide.guide,
    endGuide: endGuide.guide,
    lowStart: startLow,
    lowEnd: endLow,
    entry,
    exit: [main[main.length - 1] ?? endLow, guided[guided.length - 1]],
    main,
    ring0: loopReport(rings[0], startRead),
    guide: { ...loopReport(startGuide.guide, readLoop(startGuide.guide)), error: summarize(startGuide.error), shape: shapeDelta(rings[0], startGuide.guide) },
    terminal: { ...loopReport(endGuide.guide, readLoop(endGuide.guide)), error: summarize(endGuide.error), shape: shapeDelta(rings[stations - 1], endGuide.guide) },
    resolution: {
      stitch: count,
      anchors: startAnchors.size,
      guide: columns.at.length,
      terminal: count,
      collarDepth: Number(collarDepth.toFixed(3)),
      why: `${startAnchors.size} feature anchors kept, with extra samples so no guide edge carries more than about five exact vertices and guide edges stay near 1.65 long`,
    },
    loads: summarize(loads),
    loadMax: Math.max(...loads),
    entryQuality,
    exitQuality,
    before,
    after: collarFailed ? before : longitudinalSummary(main),
    crossings,
    wallMin: Number(Math.min(...wallGaps).toFixed(3)),
  };
  if (collarFailed) {
    (rings as Vec3[][] & { morphology?: unknown }).morphology = report;
    return rings;
  }
  (guided as Vec3[][] & { morphology?: unknown }).morphology = report;
  return guided;
}

function guideColumns(count: number, anchorList: number[], guide: Vec3[], exactPerEdge = 5) {
  const marks = [...new Set(anchorList.filter((index) => index >= 0 && index < count))].sort((a, b) => a - b);
  if (!marks.length || marks[0] !== 0) marks.unshift(0);
  const arc = arcLengths(guide);
  const total = arc[count] || 1;
  const at: number[] = [];
  for (let mark = 0; mark < marks.length; mark += 1) {
    const start = marks[mark];
    const end = marks[(mark + 1) % marks.length];
    const exact = end > start ? end - start : count - start + end;
    const span = end > start ? arc[end] - arc[start] : total - arc[start] + arc[end];
    const steps = Math.min(6, Math.max(1, Math.ceil(exact / exactPerEdge), Math.round(span / 1.65)));
    for (let step = 0; step < steps; step += 1) {
      const fraction = step / steps;
      at.push(end > start ? start + (end - start) * fraction : (start + exact * fraction) % count);
    }
  }
  return { at };
}

function segmentLoads(count: number, at: number[]) {
  return at.map((start, index) => {
    const end = at[(index + 1) % at.length];
    const raw = end - start;
    return raw > 0.2 ? raw : raw + count;
  });
}

function sampleLoop(loop: Vec3[], at: number) {
  const count = loop.length;
  const wrapped = ((at % count) + count) % count;
  const index = Math.floor(wrapped);
  return lerp(loop[index], loop[(index + 1) % count], wrapped - index);
}

function arcLengths(loop: Vec3[]) {
  const arc = [0];
  for (let index = 0; index < loop.length; index += 1) arc.push(arc[index] + length(sub(loop[(index + 1) % loop.length], loop[index])));
  return arc;
}

function arcFraction(loop: Vec3[]) {
  const arc = arcLengths(loop);
  const total = arc[loop.length] || 1;
  return arc.slice(0, loop.length).map((value) => value / total);
}

function loopDistancePoint(point: Vec3, ring: Vec3[]) {
  let nearest = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const edge = sub(ring[(index + 1) % ring.length], ring[index]);
    const span = dot(edge, edge) || 1;
    const t = Math.min(1, Math.max(0, dot(sub(point, ring[index]), edge) / span));
    nearest = Math.min(nearest, length(sub(point, add(ring[index], scale(edge, t)))));
  }
  return nearest;
}

function zipperWalk(from: Vec3[], to: Vec3[]) {
  const coarseIsTo = to.length <= from.length;
  const coarse = coarseIsTo ? to : from;
  const coarseU = arcFraction(coarse);
  const fromU = coarseIsTo ? projectOnto(from, coarse, coarseU) : coarseU;
  const toU = coarseIsTo ? coarseU : projectOnto(to, coarse, coarseU);
  const pairs: [number, number, "from" | "to"][] = [];
  let fromIndex = 0;
  let toIndex = 0;
  while (fromIndex < from.length || toIndex < to.length) {
    const fromDone = fromIndex >= from.length;
    const toDone = toIndex >= to.length;
    const fromNext = parameterOf(fromU, fromIndex + 1);
    const toNext = parameterOf(toU, toIndex + 1);
    const advanceTo = !toDone && (fromDone || toNext <= fromNext);
    if (advanceTo) {
      pairs.push([Math.min(fromIndex, from.length - 1), toIndex % to.length, "to"]);
      toIndex += 1;
    } else {
      pairs.push([fromIndex % from.length, Math.min(toIndex, to.length - 1) % to.length, "from"]);
      fromIndex += 1;
    }
  }
  return pairs;
}

function projectOnto(points: Vec3[], guide: Vec3[], guideU: number[]) {
  let hint = 0;
  return points.map((point) => {
    let best = hint;
    let bestDistance = Infinity;
    for (let index = 0; index < guide.length; index += 1) {
      const next = (index + 1) % guide.length;
      const edge = sub(guide[next], guide[index]);
      const span = dot(edge, edge) || 1;
      const t = Math.min(1, Math.max(0, dot(sub(point, guide[index]), edge) / span));
      const distance = length(sub(point, add(guide[index], scale(edge, t))));
      const end = next === 0 ? 1 : guideU[next];
      let parameter = guideU[index] + (end - guideU[index]) * t;
      if (parameter < hint - 0.5) parameter += 1;
      if (parameter + 1e-4 < hint) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = parameter;
      }
    }
    hint = best;
    return best;
  });
}

function parameterOf(fractions: number[], index: number) {
  if (index >= fractions.length) return 1 + (fractions[index % fractions.length] || 0);
  return fractions[index] || 0;
}

function collarQuality(from: Vec3[], to: Vec3[], fromParameter: number[], toAt: number[]) {
  void fromParameter;
  void toAt;
  const pairs = zipperWalk(from, to);
  const triangles = pairs.map(([fromIndex, toIndex, side]) => (side === "from"
    ? [from[fromIndex], from[(fromIndex + 1) % from.length], to[toIndex]]
    : [from[fromIndex], to[(toIndex + 1) % to.length], to[toIndex]]));
  const angles: number[] = [];
  const aspects: number[] = [];
  const areas: number[] = [];
  triangles.forEach((corners) => {
    const quality = triangleQuality(corners[0], corners[1], corners[2]);
    angles.push(quality.minAngle);
    aspects.push(quality.aspect);
    areas.push(quality.area);
  });
  const dihedral: number[] = [];
  for (let index = 0; index < triangles.length; index += 1) {
    const left = triangleNormal(triangles[index]);
    const right = triangleNormal(triangles[(index + 1) % triangles.length]);
    if (length(left) < 1e-8 || length(right) < 1e-8) continue;
    dihedral.push(angleBetween(left, right));
  }
  return {
    triangles: triangles.length,
    minAngle: Number((finiteAngles(angles)).toFixed(2)),
    maxAspect: Number((aspects.length ? Math.max(...aspects.filter((value) => Number.isFinite(value))) : 0).toFixed(2)),
    zeroArea: areas.filter((area) => area < 1e-6).length,
    maxDihedral: Number((dihedral.length ? Math.max(...dihedral) : 0).toFixed(2)),
    p95Dihedral: summarize(dihedral).p95,
  };
}

function finiteAngles(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.min(...finite) : 0;
}

function worseCollar(left: ReturnType<typeof collarQuality>, right: ReturnType<typeof collarQuality>) {
  return left.minAngle <= right.minAngle ? left : right;
}

function triangleQuality(a: Vec3, b: Vec3, c: Vec3) {
  const ab = length(sub(b, a));
  const bc = length(sub(c, b));
  const ca = length(sub(a, c));
  const area = length(cross(sub(b, a), sub(c, a))) * 0.5;
  const longest = Math.max(ab, bc, ca);
  const shortest = Math.max(1e-8, Math.min(ab, bc, ca));
  const angleAt = (opposite: number, left: number, right: number) => Math.acos(Math.max(-1, Math.min(1, (left * left + right * right - opposite * opposite) / (2 * left * right || 1)))) * 180 / Math.PI;
  return { area, aspect: longest / shortest, minAngle: Math.min(angleAt(bc, ab, ca), angleAt(ca, ab, bc), angleAt(ab, bc, ca)) };
}

function triangleNormal(corners: Vec3[]) {
  return cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
}

function orderRulings(previous: Vec3[], ring: Vec3[]) {
  const next = ring.map((point) => ({ ...point }));
  const count = ring.length;
  for (let pass = 0; pass < 8; pass += 1) {
    for (let index = 0; index < count; index += 1) {
      const ahead = (index + 1) % count;
      if (!rulingCross(previous[index], next[index], previous[ahead], next[ahead])) continue;
      const edge = sub(previous[ahead], previous[index]);
      const mid = lerp(next[index], next[ahead], 0.5);
      const side = length(edge) > 1e-6 ? normalize(edge) : { x: 1, y: 0, z: 0 };
      next[index] = add(mid, scale(side, -0.06));
      next[ahead] = add(mid, scale(side, 0.06));
    }
  }
  return next;
}

function fairLoop(ring: Vec3[], read: LoopRead, anchors: Set<number>, spikes: Set<number>) {
  const count = ring.length;
  const base = read.flat.map((point) => ({ ...point }));
  const chord = base.map((point, index) => {
    const previous = base[(index + count - 1) % count];
    const next = base[(index + 1) % count];
    return Math.hypot(point.x - (previous.x + next.x) / 2, point.y - (previous.y + next.y) / 2);
  });
  let current = base.map((point) => ({ ...point }));
  const keepCorner = (index: number, turns: number[]) => {
    if (!anchors.has(index) || spikes.has(index)) return false;
    const turn = turns[index];
    if (Math.abs(turn) > 75 || Math.abs(turn) < 8) return false;
    const previous = turns[(index + count - 1) % count];
    const next = turns[(index + 1) % count];
    return turn * previous >= 0 && turn * next >= 0;
  };
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const turns = current.map((_, index) => signedTurn(current, index));
    current = current.map((point, index) => {
      if (keepCorner(index, turns)) return point;
      const turn = Math.abs(turns[index]);
      const previousTurn = turns[(index + count - 1) % count];
      const nextTurn = turns[(index + 1) % count];
      const reversal = turns[index] * previousTurn < 0 || turns[index] * nextTurn < 0;
      if (turn < 24 || (turn < 48 && !reversal && !spikes.has(index))) return point;
      const previous = current[(index + count - 1) % count];
      const next = current[(index + 1) % count];
      const weight = turn > 90 ? 0.74 : reversal ? 0.5 : 0.24;
      const target = {
        x: point.x * (1 - weight) + (previous.x + next.x) * weight * 0.5,
        y: point.y * (1 - weight) + (previous.y + next.y) * weight * 0.5,
      };
      const cap = turn > 110 || spikes.has(index) ? 3 : 0.9;
      const dx = target.x - base[index].x;
      const dy = target.y - base[index].y;
      const distance = Math.hypot(dx, dy) || 1;
      const factor = distance > cap ? cap / distance : 1;
      return { x: base[index].x + dx * factor, y: base[index].y + dy * factor };
    });
  }
  const kept = new Set<number>();
  anchors.forEach((index) => { if (Math.abs(signedTurn(current, index)) <= 75) kept.add(index); });
  const coarse = coarseIndices(current, kept, chord);
  let settled = projectToCoarse(current, coarse);
  for (let pass = 0; pass < 2; pass += 1) {
    settled = matchPlane(settled, base);
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const turns = settled.map((_, index) => signedTurn(settled, index));
      if (turns.every((turn) => Math.abs(turn) < 72)) break;
      settled = settled.map((point, index) => {
        const turn = Math.abs(turns[index]);
        if (turn < 72) return point;
        const previous = settled[(index + count - 1) % count];
        const next = settled[(index + 1) % count];
        const weight = turn > 120 ? 0.86 : 0.6;
        const target = {
          x: point.x * (1 - weight) + (previous.x + next.x) * weight * 0.5,
          y: point.y * (1 - weight) + (previous.y + next.y) * weight * 0.5,
        };
        const dx = target.x - base[index].x;
        const dy = target.y - base[index].y;
        const distance = Math.hypot(dx, dy) || 1;
        const cap = 3.2;
        const factor = distance > cap ? cap / distance : 1;
        return { x: base[index].x + dx * factor, y: base[index].y + dy * factor };
      });
    }
  }
  const matched = settled;
  return {
    guide: matched.map((point) => add(read.origin, add(scale(read.frame.U, point.x), scale(read.frame.V, point.y)))),
    error: matched.map((point, index) => Math.hypot(point.x - base[index].x, point.y - base[index].y)),
  };
}

function coarseIndices(flat: { x: number; y: number }[], anchors: Set<number>, chord: number[]) {
  const count = flat.length;
  const chosen = new Set<number>([0]);
  anchors.forEach((index) => chosen.add(index));
  const arc = planeArc(flat);
  let cursor = 0;
  while (cursor < count - 1) {
    const spacing = chord[cursor] > 0.45 ? 0.24 : 0.62;
    let next = cursor + 1;
    while (next < count - 1 && arc[next] - arc[cursor] < spacing && !chosen.has(next)) next += 1;
    chosen.add(Math.min(count - 1, next));
    if (next <= cursor) break;
    cursor = next;
  }
  const ordered = [...chosen].sort((a, b) => a - b);
  for (let pass = 0; pass < 2; pass += 1) {
    const marks = ordered.map((index) => index);
    for (let index = 0; index < count; index += 1) {
      if (chosen.has(index)) continue;
      const point = flat[index];
      const hit = planePoint(flat, marks, arc[index] / (arc[count] || 1));
      if (Math.hypot(point.x - hit.x, point.y - hit.y) > 0.2) chosen.add(index);
    }
    ordered.splice(0, ordered.length, ...[...chosen].sort((a, b) => a - b));
  }
  return [...chosen].sort((a, b) => a - b);
}

function projectToCoarse(flat: { x: number; y: number }[], coarse: number[]) {
  const arc = planeArc(flat);
  const total = arc[flat.length] || 1;
  const marks = coarse.map((index) => ({ u: arc[index] / total, point: flat[index] }));
  return flat.map((_, index) => planePoint(flat, coarse, arc[index] / total, marks));
}

function planePoint(flat: { x: number; y: number }[], coarse: number[], u: number, ready?: { u: number; point: { x: number; y: number } }[]) {
  const marks = ready ?? coarse.map((index) => ({ u: planeArc(flat)[index] / (planeArc(flat)[flat.length] || 1), point: flat[index] }));
  let high = 0;
  while (high < marks.length && marks[high].u < u - 1e-8) high += 1;
  const right = marks[high % marks.length];
  const left = marks[(high - 1 + marks.length) % marks.length];
  const span = ((right.u - left.u) % 1 + 1) % 1 || 1;
  const t = Math.min(1, (((u - left.u) % 1 + 1) % 1) / span);
  return { x: left.point.x + (right.point.x - left.point.x) * t, y: left.point.y + (right.point.y - left.point.y) * t };
}

function matchPlane(current: { x: number; y: number }[], base: { x: number; y: number }[]) {
  const from = planeCentroid(current);
  const to = planeCentroid(base);
  const shifted = current.map((point) => ({ x: point.x + to.x - from.x, y: point.y + to.y - from.y }));
  const areaBase = Math.abs(planeArea(base));
  const areaNow = Math.abs(planeArea(shifted));
  if (areaNow < 1e-6 || areaBase < 1e-6) return shifted;
  const factor = Math.min(1.2, Math.max(0.82, 1 + (areaBase / areaNow - 1) * 0.9));
  const middle = planeCentroid(shifted);
  return shifted.map((point) => ({ x: middle.x + (point.x - middle.x) * factor, y: middle.y + (point.y - middle.y) * factor }));
}

type LoopRead = { flat: { x: number; y: number }[]; turns: number[]; frame: { U: Vec3; V: Vec3; N: Vec3 }; origin: Vec3 };

function readLoop(ring: Vec3[]): LoopRead {
  const frame = sectionFrame(ring);
  const origin = centroid(ring);
  const flat = ring.map((point) => {
    const delta = sub(point, origin);
    return { x: dot(delta, frame.U), y: dot(delta, frame.V) };
  });
  const turns = flat.map((_, index) => signedTurn(flat, index));
  return { flat, turns, frame, origin };
}

function sectionFrame(ring: Vec3[]) {
  const N = normalize(loopNormal(ring));
  const U = unitPerp(length(N) > 1e-6 ? N : { x: 0, y: 0, z: 1 });
  const V = normalize(cross(length(N) > 1e-6 ? N : { x: 0, y: 0, z: 1 }, U));
  return { U, V, N };
}

function signedTurn(flat: { x: number; y: number }[], index: number) {
  const count = flat.length;
  const previous = flat[(index + count - 1) % count];
  const point = flat[index];
  const next = flat[(index + 1) % count];
  const incoming = { x: point.x - previous.x, y: point.y - previous.y };
  const outgoing = { x: next.x - point.x, y: next.y - point.y };
  if (incoming.x * incoming.x + incoming.y * incoming.y < 1e-10 || outgoing.x * outgoing.x + outgoing.y * outgoing.y < 1e-10) return 0;
  return Math.atan2(incoming.x * outgoing.y - incoming.y * outgoing.x, incoming.x * outgoing.x + incoming.y * outgoing.y) * 180 / Math.PI;
}

function spikeIndices(turns: number[]) {
  const spikes = new Set<number>();
  const count = turns.length;
  for (let index = 0; index < count; index += 1) {
    const previous = turns[(index + count - 1) % count];
    const next = turns[(index + 1) % count];
    if (Math.abs(turns[index]) > 110) {
      spikes.add(index);
      continue;
    }
    if (Math.abs(turns[index]) < 8) continue;
    const opposed = turns[index] * previous < 0 && turns[index] * next < 0;
    const taller = Math.abs(turns[index]) > 55 && Math.abs(turns[index]) > Math.abs(previous) * 2.4 && Math.abs(turns[index]) > Math.abs(next) * 2.4;
    if (opposed || taller) spikes.add(index);
  }
  return spikes;
}

function featureAnchors(turns: number[], spikes: Set<number>) {
  const count = turns.length;
  const smooth = turns.map((_, index) => {
    let sum = 0;
    for (let offset = -3; offset <= 3; offset += 1) sum += turns[(index + offset + count) % count];
    return sum / 7;
  });
  const anchors = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    if (spikes.has(index)) continue;
    const magnitude = Math.abs(smooth[index]);
    const extremum = magnitude >= Math.abs(smooth[(index + count - 1) % count]) && magnitude >= Math.abs(smooth[(index + 1) % count]) && magnitude > 8;
    const corner = Math.abs(turns[index]) > 30 && Math.sign(turns[index]) === Math.sign(smooth[index] || turns[index]);
    if (extremum || corner) anchors.add(index);
  }
  return anchors;
}

function planeArc(flat: { x: number; y: number }[]) {
  const arc = [0];
  for (let index = 0; index < flat.length; index += 1) {
    const next = flat[(index + 1) % flat.length];
    arc.push(arc[index] + Math.hypot(next.x - flat[index].x, next.y - flat[index].y));
  }
  return arc;
}

function planeCentroid(flat: { x: number; y: number }[]) {
  const sum = flat.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / Math.max(1, flat.length), y: sum.y / Math.max(1, flat.length) };
}

function planeArea(flat: { x: number; y: number }[]) {
  return flat.reduce((sum, point, index) => {
    const next = flat[(index + 1) % flat.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function loopReport(ring: Vec3[], read: LoopRead) {
  let flips = 0;
  let signed = 0;
  read.turns.forEach((turn, index) => {
    const previous = read.turns[(index + read.turns.length - 1) % read.turns.length];
    if (Math.abs(turn) < 0.5 || Math.abs(previous) < 0.5) return;
    signed += 1;
    if (turn * previous < 0) flips += 1;
  });
  const magnitude = read.turns.map((turn) => Math.abs(turn));
  return { signFlips: Number((flips / Math.max(1, signed)).toFixed(3)), turn: summarize(magnitude), samples: ring.length };
}

function shapeDelta(source: Vec3[], guide: Vec3[]) {
  const read = readLoop(source);
  const project = (ring: Vec3[]) => ring.map((point) => {
    const delta = sub(point, read.origin);
    return { x: dot(delta, read.frame.U), y: dot(delta, read.frame.V) };
  });
  const before = project(source);
  const after = project(guide);
  const box = (flat: { x: number; y: number }[]) => {
    const xs = flat.map((point) => point.x);
    const ys = flat.map((point) => point.y);
    return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  const axis = (flat: { x: number; y: number }[]) => {
    const center = planeCentroid(flat);
    let xx = 0;
    let xy = 0;
    let yy = 0;
    flat.forEach((point) => {
      const x = point.x - center.x;
      const y = point.y - center.y;
      xx += x * x;
      xy += x * y;
      yy += y * y;
    });
    return Number((Math.atan2(2 * xy, xx - yy) * 90 / Math.PI).toFixed(2));
  };
  const beforeBox = box(before);
  const afterBox = box(after);
  const middle = centroid(guide);
  return {
    centroid: Number(length(sub(middle, read.origin)).toFixed(3)),
    areaBefore: Number(Math.abs(planeArea(before)).toFixed(2)),
    areaAfter: Number(Math.abs(planeArea(after)).toFixed(2)),
    widthBefore: Number(beforeBox.width.toFixed(3)),
    widthAfter: Number(afterBox.width.toFixed(3)),
    heightBefore: Number(beforeBox.height.toFixed(3)),
    heightAfter: Number(afterBox.height.toFixed(3)),
    orientationBefore: axis(before),
    orientationAfter: axis(after),
  };
}

function longitudinalSummary(rings: Vec3[][]) {
  const dihedral: number[] = [];
  const ruling: number[] = [];
  const turns: number[] = [];
  const persistence = new Array(rings[0]?.length ?? 0).fill(0);
  for (let station = 0; station < rings.length - 1; station += 1) {
    const ring = rings[station];
    const next = rings[station + 1];
    const count = ring.length;
    for (let sample = 0; sample < count; sample += 1) {
      const ahead = (sample + 1) % count;
      const further = (sample + 2) % count;
      ruling.push(angleBetween(sub(next[sample], ring[sample]), sub(next[ahead], ring[ahead])));
      if (station === 0 || station >= rings.length - 2) continue;
      const left = add(cross(sub(ring[ahead], ring[sample]), sub(next[sample], ring[sample])), cross(sub(next[ahead], ring[ahead]), sub(next[sample], next[ahead])));
      const right = add(cross(sub(ring[further], ring[ahead]), sub(next[ahead], ring[ahead])), cross(sub(next[further], ring[further]), sub(next[ahead], next[further])));
      if (length(left) < 1e-8 || length(right) < 1e-8) continue;
      const hinge = angleBetween(left, right);
      dihedral.push(hinge);
      if (hinge > 35) persistence[ahead] += 1;
      const bend = angleBetween(sub(ring[sample], rings[station - 1][sample]), sub(rings[station + 1][sample], ring[sample]));
      turns.push(bend);
    }
  }
  return {
    dihedral: summarize(dihedral),
    ruling: summarize(ruling),
    turn: summarize(turns),
    columnsOver8: persistence.filter((value) => value >= 8).length,
    fold: dihedral.filter((value) => value > 90).length,
  };
}

function summarize(values: number[]) {
  if (!values.length) return { min: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return {
    min: Number(sorted[0].toFixed(3)),
    median: Number(at(0.5).toFixed(3)),
    p95: Number(at(0.95).toFixed(3)),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
  };
}

function fairVoidSurface(rings: Vec3[][], inner: Vec3[][]) {
  const stations = rings.length;
  const count = rings[0]?.length ?? 0;
  if (stations < 4 || count < 4 || inner.length !== stations) return rings;
  const clearance = 1.407;
  const profiles = rings.map((ring) => ({ middle: centroid(ring), radius: ring.reduce((sum, point) => sum + length(sub(point, centroid(ring))), 0) / count }));
  let current = rings.map((ring) => ring.map((point) => ({ ...point })));
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const next = current.map((ring) => ring.map((point) => ({ ...point })));
    for (let station = 1; station < stations - 1; station += 1) {
      for (let sample = 0; sample < count; sample += 1) {
        const point = current[station][sample];
        const behind = current[station][(sample + count - 1) % count];
        const ahead = current[station][(sample + 1) % count];
        const bend = angleBetween(sub(point, behind), sub(ahead, point));
        const turn = angleBetween(sub(point, current[station - 1][sample]), sub(current[station + 1][sample], point));
        if (turn < 28) continue;
        const through = scale(add(current[station - 1][sample], current[station + 1][sample]), 0.5);
        const step = bend > 45 ? 0.24 : turn > 70 ? 0.58 : 0.36;
        const proposed = outsideInner(add(point, scale(sub(through, point), step)), inner[station], clearance);
        next[station][sample] = proposed;
      }
      next[station] = softenSection(next[station], profiles[station], 0.16, 0.88);
      next[station] = next[station].map((point) => outsideInner(point, inner[station], clearance));
      next[station] = clearAgainst(next[station - 1], next[station], next[station + 1], current[station]);
    }
    next[0] = rings[0].map((point) => ({ ...point }));
    next[stations - 1] = rings[stations - 1].map((point) => ({ ...point }));
    current = next;
  }
  const faired = current.map((ring) => ring.map((point) => ({ ...point })));
  faired[0] = rings[0].map((point) => ({ ...point }));
  faired[stations - 1] = rings[stations - 1].map((point) => ({ ...point }));
  const moved = faired.flatMap((ring, station) => ring.map((point, sample) => length(sub(point, rings[station][sample]))));
  moved.sort((a, b) => a - b);
  (faired as Vec3[][] & { fairing?: { max: number; median: number; p95: number } }).fairing = {
    max: Number((moved[moved.length - 1] ?? 0).toFixed(3)),
    median: Number((moved[Math.floor(moved.length / 2)] ?? 0).toFixed(3)),
    p95: Number((moved[Math.floor(moved.length * 0.95)] ?? 0).toFixed(3)),
  };
  return faired;
}

function clearAgainst(before: Vec3[], ring: Vec3[], after: Vec3[], fallback: Vec3[]) {
  const next = ring.map((point) => ({ ...point }));
  const count = ring.length;
  const revert = (other: Vec3[], fromRing: boolean) => {
    for (let pass = 0; pass < 4; pass += 1) {
      for (let sample = 0; sample < count; sample += 1) {
        const ahead = (sample + 1) % count;
        const crossed = fromRing
          ? rulingCross(next[sample], other[sample], next[ahead], other[ahead])
          : rulingCross(other[sample], next[sample], other[ahead], next[ahead]);
        if (!crossed) continue;
        next[sample] = { ...fallback[sample] };
        next[ahead] = { ...fallback[ahead] };
      }
    }
  };
  revert(before, false);
  revert(after, true);
  return next;
}

function softenSection(ring: Vec3[], profile: { middle: Vec3; radius: number }, centroidWeight: number, radiusWeight: number) {
  const now = centroid(ring);
  const middle = add(scale(now, 1 - centroidWeight), scale(profile.middle, centroidWeight));
  const shifted = ring.map((point) => add(point, sub(middle, now)));
  const radius = shifted.reduce((sum, point) => sum + length(sub(point, middle)), 0) / Math.max(1, shifted.length);
  if (radius < 1e-6) return shifted;
  const factor = 1 + (profile.radius / radius - 1) * radiusWeight;
  return shifted.map((point) => add(middle, scale(sub(point, middle), factor)));
}

function outsideInner(point: Vec3, inner: Vec3[], clearance: number) {
  let nearest = Infinity;
  let hit = point;
  for (let index = 0; index < inner.length; index += 1) {
    const start = inner[index];
    const edge = sub(inner[(index + 1) % inner.length], start);
    const span = dot(edge, edge) || 1;
    const t = Math.min(1, Math.max(0, dot(sub(point, start), edge) / span));
    const candidate = add(start, scale(edge, t));
    const gap = length(sub(point, candidate));
    if (gap < nearest) {
      nearest = gap;
      hit = candidate;
    }
  }
  if (nearest >= clearance) return point;
  const away = sub(point, hit);
  const outward = length(away) > 1e-6 ? normalize(away) : normalize(sub(point, centroid(inner)));
  return add(hit, scale(outward, clearance));
}

function calmVoidRings(rings: Vec3[][]) {
  const spread = spreadVoidTravel(flowVoidRings(flowVoidRings(rings)));
  const settled: Vec3[][] = [spread[0].map((point) => ({ ...point }))];
  for (let station = 1; station < spread.length; station += 1) settled.push(uncrossRulings(settled[station - 1], spread[station]));
  return settled;
}

function spreadVoidTravel(rings: Vec3[][]) {
  if (rings.length < 3) return rings;
  const count = rings[0].length;
  const steps = rings.slice(1).map((ring, station) => ring.map((point, index) => sub(point, rings[station][index])));
  const smoothed = steps.map((step, station) => step.map((_, index) => {
    let sum = { x: 0, y: 0, z: 0 };
    let weight = 0;
    for (let offset = -3; offset <= 3; offset += 1) {
      const at = station + offset;
      if (at < 0 || at >= steps.length) continue;
      const sampleWeight = offset === 0 ? 2 : 1;
      sum = add(sum, scale(steps[at][index], sampleWeight));
      weight += sampleWeight;
    }
    return scale(sum, 1 / weight);
  }));
  const settled: Vec3[][] = [rings[0].map((point) => ({ ...point }))];
  smoothed.forEach((step) => {
    const previous = settled[settled.length - 1];
    settled.push(previous.map((point, index) => add(point, step[index])));
  });
  const last = rings.length - 1;
  const share = 1 / (rings.length - 1);
  return settled.map((ring, station) => ring.map((point, index) => add(point, scale(sub(rings[last][index], settled[last][index]), station * share))));
}

function flowVoidRings(rings: Vec3[][]) {
  if (rings.length < 2) return rings;
  const settled: Vec3[][] = [rings[0].map((point) => ({ ...point }))];
  for (let station = 1; station < rings.length; station += 1) {
    const step = rings[station].map((point, index) => sub(point, rings[station - 1][index]));
    const calmed = calmStep(step);
    const placed = settled[station - 1].map((point, index) => add(point, calmed[index]));
    settled.push(uncrossRulings(settled[station - 1], placed));
  }
  return settled;
}

function calmStep(step: Vec3[]) {
  const count = step.length;
  const lengths = step.map((vector) => length(vector));
  const ordered = [...lengths].sort((a, b) => a - b);
  const median = ordered[Math.floor(count / 2)] || 0.2;
  const cap = Math.max(0.2, median * 1.45);
  return step.map((vector, index) => {
    let sum = { x: 0, y: 0, z: 0 };
    for (let offset = -6; offset <= 6; offset += 1) {
      if (offset === 0) continue;
      sum = add(sum, step[(index + offset + count) % count]);
    }
    if (length(sum) < 1e-6) return vector;
    const mean = scale(sum, 1 / 12);
    const turn = angleBetween(vector, mean);
    const long = lengths[index] > cap;
    if (turn < 12 && !long) return vector;
    const amount = turn > 36 ? 1 : long ? 0.8 : Math.min(1, (turn - 12) / 24);
    const reach = long ? Math.min(lengths[index], cap) : Math.max(length(vector), 1e-6);
    const aimed = scale(normalize(mean), reach);
    return add(scale(vector, 1 - amount), scale(aimed, amount));
  });
}

function uncrossRulings(previous: Vec3[], ring: Vec3[]) {
  const next = ring.map((point) => ({ ...point }));
  const count = ring.length;
  for (let pass = 0; pass < 8; pass += 1) {
    for (let index = 0; index < count; index += 1) {
      const ahead = (index + 1) % count;
      if (!rulingCross(previous[index], next[index], previous[ahead], next[ahead])) continue;
      const left = next[index];
      const right = next[ahead];
      next[index] = lerp(left, right, 0.45);
      next[ahead] = lerp(right, left, 0.45);
    }
  }
  return next;
}

function rulingCross(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3) {
  const u = sub(a1, a0);
  const v = sub(b1, b0);
  const w = sub(a0, b0);
  const uu = dot(u, u);
  const uv = dot(u, v);
  const vv = dot(v, v);
  const denom = uu * vv - uv * uv;
  if (Math.abs(denom) < 1e-8) return false;
  const uw = dot(u, w);
  const vw = dot(v, w);
  const s = (uv * vw - vv * uw) / denom;
  const t = (uu * vw - uv * uw) / denom;
  if (s < 0.04 || s > 0.96 || t < 0.04 || t > 0.96) return false;
  return length(sub(add(a0, scale(u, s)), add(b0, scale(v, t)))) < 0.08;
}

function continueThenTurn(from: Vec3[], to: Vec3[], start: Vec3[], end: Vec3[], behind: Vec3[], count: number, kind: PatchQuality["character"]) {
  const hold = kind === "plate" || kind === "rib"
    ? Math.max(5, Math.min(count - 4, Math.round(count * 0.5)))
    : Math.max(3, Math.min(5, Math.round(count * 0.28)));
  const rings = Array.from({ length: count }, (_, station) => from.map((point, index) => {
    const measured = length(sub(point, behind[index]));
    const spacing = kind === "plate" ? Math.min(0.32, Math.max(0.1, measured)) : kind === "rib" ? Math.min(0.28, Math.max(0.1, measured)) : Math.min(0.85, Math.max(0.18, measured));
    const direction = start[index];
    const bridge = add(point, scale(direction, spacing * hold));
    if (station <= hold) return add(point, scale(direction, spacing * station));
    const span = Math.max(1, count - 1 - hold);
    const u = (station - hold) / span;
    const eased = u * u * (3 - 2 * u);
    const chord = Math.max(spacing, length(sub(to[index], bridge)));
    return hermite(bridge, to[index], scale(direction, chord * (kind === "mass" ? 0.9 : 0.7)), scale(normalize(end[index]), chord * 0.22 * eased), eased);
  }));
  for (let station = 1; station < rings.length; station += 1) rings[station] = reinforce(rings[station - 1], rings[station]);
  return rings;
}

function reinforce(previous: Vec3[], ring: Vec3[]) {
  const count = ring.length;
  const next = ring.map((point) => ({ ...point }));
  const span = (a: Vec3, b: Vec3, c: Vec3) => length(cross(sub(b, a), sub(c, a)));
  const perpendicular = (edge: Vec3) => {
    const reference = Math.abs(edge.y) < 0.85 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const axis = cross(length(edge) > 1e-8 ? edge : { x: 1, y: 0, z: 0 }, reference);
    return length(axis) > 1e-8 ? normalize(axis) : { x: 0, y: 0, z: 1 };
  };
  for (let pass = 0; pass < 8; pass += 1) {
    let moved = false;
    for (let index = 0; index < count; index += 1) {
      const ahead = (index + 1) % count;
      const behind = (index + count - 1) % count;
      const a = previous[index];
      const b = previous[ahead];
      const back = previous[behind];
      const here = next[index];
      if (span(a, b, here) > 1e-4 && span(back, a, here) > 1e-4 && span(a, here, next[ahead]) > 1e-4) continue;
      next[index] = add(here, scale(perpendicular(sub(b, a)), 0.08 * (pass + 1)));
      moved = true;
    }
    if (!moved) break;
  }
  return next;
}

function continuity(quality: PatchQuality, rings: Vec3[][], start: Vec3[], terminal: Vec3[], cappedLoopAreas: number[], footprintArea: number, character: PatchQuality["character"], localThickness: number): PatchQuality {
  const step = (ring: Vec3[], next: Vec3[]) => (next && ring.length === next.length ? ring.map((point, index) => sub(next[index], point)) : []);
  const meanAngle = (left: Vec3[], right: Vec3[]) => (left.length && left.length === right.length ? left.reduce((sum, vector, index) => sum + angleBetween(vector, right[index]), 0) / left.length : 0);
  let origin = 0;
  while (origin + 2 < rings.length && (rings[origin].length !== rings[origin + 1].length || rings[origin + 1].length !== rings[origin + 2].length)) origin += 1;
  const turns = [0, 1, 2].map((station) => (rings[origin + station + 2] ? Number(meanAngle(step(rings[origin + station], rings[origin + station + 1]), step(rings[origin + station + 1], rings[origin + station + 2])).toFixed(2)) : 0));
  const mismatch = rings[origin + 1] ? meanAngle(step(rings[origin], rings[origin + 1]), start) : 0;
  const radius = (loop: Vec3[]) => {
    const middle = centroid(loop);
    return loop.reduce((sum, point) => sum + length(sub(point, middle)), 0) / Math.max(1, loop.length);
  };
  const patchWidth = radius(rings[0] ?? []);
  const terminalWidth = radius(terminal);
  const widthRatio = terminalWidth > 1e-6 ? patchWidth / terminalWidth : 0;
  const capFraction = footprintArea > 1e-6 ? Math.max(0, ...cappedLoopAreas, 0) / footprintArea : 0;
  return {
    ...quality,
    tangentMismatch: Number(mismatch.toFixed(2)),
    turnAngles: turns,
    patchWidth: Number(patchWidth.toFixed(3)),
    terminalWidth: Number(terminalWidth.toFixed(3)),
    widthRatio: Number(widthRatio.toFixed(3)),
    insufficientWidth: widthRatio < 0.75,
    excessiveWidth: widthRatio > 2,
    widthOutsidePreferred: widthRatio < 0.75 || widthRatio > 1.35,
    cappedLoopAreas: cappedLoopAreas.map((area) => Number(area.toFixed(2))),
    capFraction,
    majorTopologyLoss: capFraction > 0.2,
    character,
    localThickness,
  };
}

function transitionCount(from: Vec3[], to: Vec3[], start: Vec3[], end: Vec3[]) {
  let distance = 0;
  let turn = 0;
  from.forEach((point, index) => {
    distance += length(sub(to[index], point));
    turn += angleBetween(start[index], end[index]);
  });
  const meanDistance = distance / Math.max(1, from.length);
  const meanTurn = turn / Math.max(1, from.length);
  return Math.min(22, Math.max(12, Math.round(meanDistance / 0.32 + meanTurn / 22)));
}

function stitch(
  mesh: IsoMesh,
  removed: Set<number>,
  outer: number[],
  opening: number[] | null,
  extras: number[][],
  outerRings: Vec3[][],
  innerRings: Vec3[][] | null,
) {
  const positions = Float32Array.from(mesh.positions);
  const kept: number[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    if (removed.has(triangle)) continue;
    kept.push(mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]);
  }
  const addRing = (ring: Vec3[], existing: number[] | null) => {
    if (existing) return existing;
    const ids: number[] = [];
    ring.forEach((point) => {
      ids.push(positions.length / 3);
      const grown = new Float32Array(positions.length + 3);
      grown.set(positions);
      grown[positions.length] = point.x;
      grown[positions.length + 1] = point.y;
      grown[positions.length + 2] = point.z;
      positions.set(grown);
      copyGrow(positions, grown);
    });
    return ids;
  };
  const append = (source: Vec3[]) => {
    const ids: number[] = [];
    const grown = new Float32Array(positions.length + source.length * 3);
    grown.set(positions);
    source.forEach((point, index) => {
      ids.push(grown.length / 3 + index);
      const offset = positions.length + index * 3;
      grown[offset] = point.x;
      grown[offset + 1] = point.y;
      grown[offset + 2] = point.z;
    });
    const next = grown;
    return { ids, positions: next };
  };
  let cursor = positions;
  const placeRings = (rings: Vec3[][], boundary: number[]) => {
    const ids = [boundary];
    for (let station = 1; station < rings.length; station += 1) {
      const placed = appendInto(cursor, rings[station]);
      cursor = placed.positions;
      ids.push(placed.ids);
    }
    return ids;
  };
  const outerIds = placeRings(outerRings, outer);
  const innerIds = innerRings && opening ? placeRings(innerRings, opening) : null;
  const skirt = loftIds(outerIds, true, cursor);
  const innerSkirt = innerIds ? loftIds(innerIds, true) : [];
  let cap: number[] = [];
  if (innerIds) {
    const outerEnd = capWithCenter(outerIds[outerIds.length - 1], cursor);
    cursor = outerEnd.positions;
    const innerEnd = capWithCenter(innerIds[innerIds.length - 1], cursor);
    cursor = innerEnd.positions;
    cap = [...outerEnd.triangles, ...innerEnd.triangles];
  } else {
    const capped = capWithCenter(outerIds[outerIds.length - 1], cursor);
    cursor = capped.positions;
    cap = capped.triangles;
  }
  const extraCaps: number[] = [];
  extras.forEach((loop) => {
    const capped = capWithCenter(loop, cursor);
    cursor = capped.positions;
    extraCaps.push(...capped.triangles);
  });
  const indices = Uint32Array.from([...kept, ...skirt, ...innerSkirt, ...cap, ...extraCaps]);
  const built = shade({ positions: cursor, normals: new Float32Array(cursor.length), indices, triangles: indices.length / 3 });
  const cleaned = dropDegenerate(built);
  return { mesh: cleaned, spanHits: spanHits(outerIds, cursor) };
  void addRing;
  void append;
}

function appendInto(positions: Float32Array, ring: Vec3[]) {
  const grown = new Float32Array(positions.length + ring.length * 3);
  grown.set(positions);
  const ids = ring.map((point, index) => {
    const vertex = positions.length / 3 + index;
    grown[vertex * 3] = point.x;
    grown[vertex * 3 + 1] = point.y;
    grown[vertex * 3 + 2] = point.z;
    return vertex;
  });
  return { positions: grown, ids };
}

function loftIds(ids: number[][], outward: boolean, positions?: Float32Array) {
  const triangles: number[] = [];
  for (let station = 0; station < ids.length - 1; station += 1) {
    const count = ids[station].length;
    if (positions && count !== ids[station + 1].length) {
      triangles.push(...zipperIds(ids[station], ids[station + 1], positions, outward));
      continue;
    }
    for (let sample = 0; sample < count; sample += 1) {
      const next = (sample + 1) % count;
      const a = ids[station][sample];
      const b = ids[station][next];
      const c = ids[station + 1][next];
      const d = ids[station + 1][sample];
      triangles.push(...(outward ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
    }
  }
  return triangles;
}

function zipperIds(from: number[], to: number[], positions: Float32Array, outward: boolean) {
  const pairs = zipperWalk(from.map((index) => read(positions, index)), to.map((index) => read(positions, index)));
  return pairs.flatMap(([fromIndex, toIndex, side]) => {
    if (side === "from") {
      const a = from[fromIndex];
      const b = from[(fromIndex + 1) % from.length];
      const c = to[toIndex];
      return outward ? [a, b, c] : [a, c, b];
    }
    const a = from[fromIndex];
    const c = to[toIndex];
    const d = to[(toIndex + 1) % to.length];
    return outward ? [a, d, c] : [a, c, d];
  });
}

function capWithCenter(ids: number[], positions: Float32Array) {
  const corners = ids.map((index) => read(positions, index));
  let center = centroid(corners);
  let sum = { x: 0, y: 0, z: 0 };
  corners.forEach((point, index) => {
    const next = corners[(index + 1) % corners.length];
    sum = add(sum, cross(point, next));
  });
  const normal = length(sum) > 1e-8 ? normalize(sum) : { x: 0, y: 1, z: 0 };
  const span = (a: Vec3, b: Vec3, c: Vec3) => length(cross(sub(b, a), sub(c, a)));
  if (corners.some((point, index) => span(point, corners[(index + 1) % corners.length], center) < 1e-4)) center = add(center, scale(normal, 0.04));
  const grown = new Float32Array(positions.length + 3);
  grown.set(positions);
  const centerId = positions.length / 3;
  grown[centerId * 3] = center.x;
  grown[centerId * 3 + 1] = center.y;
  grown[centerId * 3 + 2] = center.z;
  const triangles: number[] = [];
  for (let index = 0; index < ids.length; index += 1) triangles.push(ids[index], ids[(index + 1) % ids.length], centerId);
  return { positions: grown, triangles };
}

function capLoop(ids: number[], positions: Float32Array) {
  const order = ids.map((_, index) => index);
  const flat = project(ids, positions);
  const ccw = signedArea(flat) > 0;
  const triangles: number[] = [];
  let guard = 0;
  while (order.length > 3 && guard < ids.length * ids.length) {
    guard += 1;
    let clipped = false;
    for (let cursor = 0; cursor < order.length; cursor += 1) {
      const previous = order[(cursor + order.length - 1) % order.length];
      const current = order[cursor];
      const next = order[(cursor + 1) % order.length];
      if (!isEar(flat, order, previous, current, next, ccw)) continue;
      triangles.push(ids[previous], ids[current], ids[next]);
      order.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) triangles.push(ids[order[0]], ids[order[1]], ids[order[2]]);
  if (triangles.length < ids.length - 2) {
    const fan: number[] = [];
    for (let index = 1; index < ids.length - 1; index += 1) fan.push(ids[0], ids[index], ids[index + 1]);
    return fan;
  }
  return triangles;
}

function bridge(outer: number[], inner: number[], positions: Float32Array) {
  const innerOrder = rotateToNearest(inner, outer[0], positions);
  const triangles: number[] = [];
  let outerIndex = 0;
  let innerIndex = 0;
  while (outerIndex + innerIndex < outer.length + innerOrder.length) {
    const takeOuter = innerIndex === innerOrder.length || (outerIndex < outer.length && outerIndex / outer.length <= innerIndex / innerOrder.length);
    if (takeOuter) {
      triangles.push(outer[outerIndex % outer.length], outer[(outerIndex + 1) % outer.length], innerOrder[innerIndex % innerOrder.length]);
      outerIndex += 1;
    } else {
      triangles.push(outer[outerIndex % outer.length], innerOrder[(innerIndex + 1) % innerOrder.length], innerOrder[innerIndex % innerOrder.length]);
      innerIndex += 1;
    }
  }
  return triangles;
}

function rotateToNearest(loop: number[], target: number, positions: Float32Array) {
  let best = 0;
  let bestDistance = Infinity;
  loop.forEach((index, sample) => {
    const distance = length(sub(read(positions, index), read(positions, target)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = sample;
    }
  });
  return loop.map((_, sample) => loop[(sample + best) % loop.length]);
}

function pointAt(ids: number[], positions: Float32Array, distance: number, total: number) {
  let walked = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const next = ids[(index + 1) % ids.length];
    const span = length(sub(read(positions, next), read(positions, ids[index])));
    if (walked + span >= distance % total) return ids[index];
    walked += span;
  }
  return ids[0];
}

function faceTerminal(rings: Vec3[][], face: FaceFrame) {
  let best = 0;
  let bestDepth = Infinity;
  rings.forEach((ring, index) => {
    const depth = Math.abs(dot(sub(centroid(ring), face.origin), face.normal));
    if (depth < bestDepth) {
      bestDepth = depth;
      best = index;
    }
  });
  return best;
}

function towardCore(rings: Vec3[][], terminal: number, depthOf: (point: Vec3) => number) {
  const previous = terminal > 0 ? terminal - 1 : terminal;
  const next = terminal < rings.length - 1 ? terminal + 1 : terminal;
  return depthOf(centroid(rings[next])) > depthOf(centroid(rings[previous])) ? next : previous;
}

function alignLoops(boundary: Vec3[], primary: Vec3[], secondary: Vec3[]) {
  let bestCost = Infinity;
  let best = { primary: resample(primary, boundary.length, 0, false), secondary: resample(secondary, boundary.length, 0, false) };
  for (const reverse of [false, true]) {
    for (let step = 0; step < 36; step += 1) {
      const phase = step / 36;
      const alignedPrimary = resample(primary, boundary.length, phase, reverse);
      const alignedSecondary = resample(secondary, boundary.length, phase, reverse);
      let cost = 0;
      for (let index = 0; index < boundary.length; index += 1) {
        cost += length(sub(boundary[index], alignedPrimary[index]));
        const turn = angleBetween(sub(boundary[(index + 1) % boundary.length], boundary[index]), sub(alignedPrimary[(index + 1) % boundary.length], alignedPrimary[index]));
        cost += turn * 0.15;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = { primary: alignedPrimary, secondary: alignedSecondary };
      }
    }
  }
  return best;
}

function measure(original: IsoMesh, mesh: IsoMesh, removedTriangles: number, boundaryLoops: number, loopLengths: number[], rings: number, spanHits: number): PatchQuality {
  const edges = new Map<string, number>();
  let degenerate = 0;
  const lengths: number[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const area = length(cross(sub(read(mesh.positions, ids[1]), read(mesh.positions, ids[0])), sub(read(mesh.positions, ids[2]), read(mesh.positions, ids[0]))));
    if (area < 1e-8) degenerate += 1;
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
      lengths.push(length(sub(read(mesh.positions, a), read(mesh.positions, b))));
    }
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  edges.forEach((uses) => {
    if (uses === 1) boundaryEdges += 1;
    else if (uses !== 2) nonManifoldEdges += 1;
  });
  const originalCount = original.positions.length / 3;
  const patchLengths: number[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    if (ids.every((index) => index < originalCount)) continue;
    for (let edge = 0; edge < 3; edge += 1) patchLengths.push(length(sub(read(mesh.positions, ids[edge]), read(mesh.positions, ids[(edge + 1) % 3]))));
  }
  patchLengths.sort((a, b) => a - b);
  const patchMedian = patchLengths[Math.floor(patchLengths.length / 2)] || 1;
  lengths.sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] || 1;
  const limit = Math.min(original.positions.length, mesh.positions.length) / 3;
  let unchangedVertices = 0;
  for (let vertex = 0; vertex < limit; vertex += 1) {
    if (length(sub(read(mesh.positions, vertex), read(original.positions, vertex))) < 1e-6) unchangedVertices += 1;
  }
  return {
    vertices: mesh.positions.length / 3,
    triangles: mesh.triangles,
    removedTriangles,
    boundaryLoops,
    loopLengths,
    rings,
    boundaryEdges,
    nonManifoldEdges,
    degenerate,
    maxEdgeRatio: Number(((patchLengths[patchLengths.length - 1] || 0) / patchMedian).toFixed(3)),
    components: componentCount(mesh),
    unchangedVertices,
    spanHits,
    tangentMismatch: 0,
    turnAngles: [],
    patchWidth: 0,
    terminalWidth: 0,
    widthRatio: 0,
    insufficientWidth: false,
    excessiveWidth: false,
    widthOutsidePreferred: false,
    cappedLoopAreas: [],
    capFraction: 0,
    majorTopologyLoss: false,
    character: "intermediate",
    localThickness: 0,
    characterConfidence: 0,
    thicknessMin: 0,
    thicknessMax: 0,
    thicknessVariance: 0,
    pairedCoverage: 0,
    oppositionAngle: 0,
    pcaExtents: [0, 0, 0],
    searchRadius: 0,
  };
}

function spanHits(ids: number[][], positions: Float32Array) {
  let hits = 0;
  for (let station = 0; station < ids.length - 2; station += 1) {
    for (let sample = 0; sample < ids[station].length; sample += 1) {
      if (!ids[station + 2] || sample >= ids[station + 2].length) continue;
      const origin = read(positions, ids[station][sample]);
      const target = read(positions, ids[station + 2][sample]);
      const direction = sub(target, origin);
      for (let other = station + 2; other < ids.length - 1 && hits < 8; other += 1) {
        if (sample >= ids[other].length || sample >= ids[other + 1].length) continue;
        const next = (sample + 1) % ids[other].length;
        if (segmentHitsTriangle(origin, direction, read(positions, ids[other][sample]), read(positions, ids[other][next]), read(positions, ids[other + 1][sample]))) hits += 1;
      }
    }
  }
  return hits;
}

function segmentHitsTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const p = cross(direction, ac);
  const det = dot(ab, p);
  if (Math.abs(det) < 1e-8) return false;
  const inverse = 1 / det;
  const t = dot(sub(origin, a), p) * inverse;
  if (t < 0 || t > 1) return false;
  const q = cross(sub(origin, a), ab);
  const u = dot(direction, q) * inverse;
  if (u < 0 || t + u > 1) return false;
  const v = dot(ac, q) * inverse;
  return v > 0.02 && v < 0.98;
}

function dropDegenerate(mesh: IsoMesh): IsoMesh {
  const indices: number[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const area = length(cross(sub(read(mesh.positions, ids[1]), read(mesh.positions, ids[0])), sub(read(mesh.positions, ids[2]), read(mesh.positions, ids[0]))));
    if (area < 1e-8) continue;
    indices.push(...ids);
  }
  return shade({ ...mesh, indices: Uint32Array.from(indices), triangles: indices.length / 3 });
}

function subsetMesh(mesh: IsoMesh, removed: Set<number>, keepRemoved: boolean): IsoMesh {
  const indices: number[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    if (removed.has(triangle) !== keepRemoved) continue;
    indices.push(mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]);
  }
  return shade({ positions: Float32Array.from(mesh.positions), normals: Float32Array.from(mesh.normals), indices: Uint32Array.from(indices), triangles: indices.length / 3 });
}

function blankMesh(mesh: IsoMesh): IsoMesh {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), triangles: 0 };
  void mesh;
}

function emptyStage(mesh: IsoMesh): PatchStage {
  const quality = measure(mesh, mesh, 0, 0, [], 0, 0);
  return { mesh, zoneMesh: mesh, openMesh: mesh, patchMesh: mesh, rings: [], sheet: null, guideMesh: null, shells: null, attachment: null, voidBearing: null, quality };
}

function vertexNormals(mesh: IsoMesh, removed: Set<number>) {
  const sums = new Map<number, Vec3>();
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    if (removed.has(triangle)) continue;
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const normal = cross(sub(read(mesh.positions, ids[1]), read(mesh.positions, ids[0])), sub(read(mesh.positions, ids[2]), read(mesh.positions, ids[0])));
    ids.forEach((index) => sums.set(index, add(sums.get(index) ?? { x: 0, y: 0, z: 0 }, normal)));
  }
  const normals = new Map<number, Vec3>();
  sums.forEach((normal, index) => normals.set(index, normalize(normal)));
  return normals;
}

function shade(mesh: IsoMesh): IsoMesh {
  const normals = new Float32Array(mesh.positions.length);
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const normal = cross(sub(read(mesh.positions, ids[1]), read(mesh.positions, ids[0])), sub(read(mesh.positions, ids[2]), read(mesh.positions, ids[0])));
    ids.forEach((index) => {
      normals[index * 3] += normal.x;
      normals[index * 3 + 1] += normal.y;
      normals[index * 3 + 2] += normal.z;
    });
  }
  for (let vertex = 0; vertex < normals.length / 3; vertex += 1) {
    const normal = read(normals, vertex);
    const magnitude = length(normal);
    const unit = magnitude > 1e-8 ? scale(normal, 1 / magnitude) : { x: 0, y: 1, z: 0 };
    normals[vertex * 3] = unit.x;
    normals[vertex * 3 + 1] = unit.y;
    normals[vertex * 3 + 2] = unit.z;
  }
  return { ...mesh, normals };
}

function componentCount(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  const next: number[][] = Array.from({ length: count }, () => []);
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const ids = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) next[ids[edge]].push(ids[(edge + 1) % 3]);
  }
  const seen = new Uint8Array(count);
  let parts = 0;
  for (let start = 0; start < count; start += 1) {
    if (seen[start] || next[start].length === 0) continue;
    parts += 1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      next[current].forEach((neighbor) => {
        if (seen[neighbor]) return;
        seen[neighbor] = 1;
        stack.push(neighbor);
      });
    }
  }
  return parts;
}

function loopInside(loop: number[], outer: number[], mesh: IsoMesh, face: FaceFrame) {
  return insideLoop(centroid(loop.map((index) => read(mesh.positions, index))), outer.map((index) => read(mesh.positions, index)), face, 0);
}

function insideLoop(point: Vec3, loop: Vec3[], face: FaceFrame, margin: number) {
  const flat = (value: Vec3) => ({ u: dot(sub(value, face.origin), face.u), v: dot(sub(value, face.origin), face.v) });
  const site = flat(point);
  const polygon = loop.map(flat);
  let inside = false;
  let distance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if ((a.v > site.v) !== (b.v > site.v)) {
      const crossU = a.u + ((site.v - a.v) / (b.v - a.v || 1e-8)) * (b.u - a.u);
      if (site.u < crossU) inside = !inside;
    }
    const ab = { u: b.u - a.u, v: b.v - a.v };
    const lengthSq = ab.u * ab.u + ab.v * ab.v || 1;
    const t = Math.min(1, Math.max(0, ((site.u - a.u) * ab.u + (site.v - a.v) * ab.v) / lengthSq));
    distance = Math.min(distance, Math.hypot(site.u - (a.u + ab.u * t), site.v - (a.v + ab.v * t)));
  }
  return inside || distance <= margin;
}

function project(ids: number[], positions: Float32Array) {
  const points = ids.map((index) => read(positions, index));
  const normal = normalize(loopNormal(points));
  const u = unitPerp(normal);
  const v = normalize(cross(normal, u));
  return points.map((point) => ({ x: dot(point, u), y: dot(point, v) }));
}

function isEar(flat: { x: number; y: number }[], order: number[], previous: number, current: number, next: number, ccw: boolean) {
  const a = flat[previous];
  const b = flat[current];
  const c = flat[next];
  const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (ccw ? crossZ <= 1e-8 : crossZ >= -1e-8) return false;
  return order.every((index) => {
    if (index === previous || index === current || index === next) return true;
    return !pointInTri(flat[index], a, b, c);
  });
}

function pointInTri(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const sign = (p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }) => (p0.x - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (p0.y - p2.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

function loopLength(loop: number[], mesh: IsoMesh) {
  return loop.reduce((sum, index, sample) => sum + length(sub(read(mesh.positions, loop[(sample + 1) % loop.length]), read(mesh.positions, index))), 0);
}

function loopLengthIds(ids: number[], positions: Float32Array) {
  return ids.reduce((sum, index, sample) => sum + length(sub(read(positions, ids[(sample + 1) % ids.length]), read(positions, index))), 0);
}

function loftRings(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  if (count % SAMPLES !== 0) return null;
  const stations = count / SAMPLES;
  return Array.from({ length: stations }, (_, station) => Array.from({ length: SAMPLES }, (__, sample) => read(mesh.positions, station * SAMPLES + sample)));
}

function dominant(loops: Vec3[][]) {
  return loops.reduce((best, loop) => (loopArea(loop) > loopArea(best) ? loop : best), loops[0] ?? []);
}

function loopArea(points: Vec3[]) {
  return length(loopNormal(points)) * 0.5;
}

function loopNormal(points: Vec3[]) {
  const middle = centroid(points);
  return points.reduce((normal, point, index) => add(normal, cross(sub(point, middle), sub(points[(index + 1) % points.length], middle))), { x: 0, y: 0, z: 0 });
}

function resample(loop: Vec3[], count: number, phase: number, reverse: boolean) {
  const source = reverse ? [...loop].reverse() : loop;
  const lengths = [0];
  for (let index = 0; index < source.length; index += 1) lengths.push(lengths[index] + length(sub(source[(index + 1) % source.length], source[index])));
  const total = lengths[lengths.length - 1] || 1;
  return Array.from({ length: count }, (_, sample) => {
    const distance = ((sample / count + phase) % 1) * total;
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index += 1;
    const span = lengths[index] - lengths[index - 1] || 1;
    return lerp(source[index - 1], source[index % source.length], (distance - lengths[index - 1]) / span);
  });
}

function translateLoop(loop: Vec3[], offset: Vec3) {
  return loop.map((point) => add(point, offset));
}

function hermite(p0: Vec3, p1: Vec3, t0: Vec3, t1: Vec3, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return add(
    add(scale(p0, 2 * t3 - 3 * t2 + 1), scale(t0, t3 - 2 * t2 + t)),
    add(scale(p1, -2 * t3 + 3 * t2), scale(t1, t3 - t2)),
  );
}

function unpose(tile: TileInstance, point: Vec3): Vec3 {
  const basis = tileBasis(tile);
  const delta = sub(point, tile.transform);
  return {
    x: basis[0] * delta.x + basis[1] * delta.y + basis[2] * delta.z,
    y: basis[3] * delta.x + basis[4] * delta.y + basis[5] * delta.z,
    z: basis[6] * delta.x + basis[7] * delta.y + basis[8] * delta.z,
  };
}

function copyGrow(positions: Float32Array, grown: Float32Array) {
  void positions;
  void grown;
}

function unitPerp(normal: Vec3): Vec3 {
  const axis = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(normal, axis));
}

function signedArea(points: { x: number; y: number }[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
}

function centroid(points: Vec3[]) {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
}

function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) * 180 / Math.PI;
}

function normalize(vector: Vec3) {
  const magnitude = length(vector);
  return magnitude > 1e-8 ? scale(vector, 1 / magnitude) : { x: 0, y: 0, z: 0 };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function read(positions: Float32Array, index: number): Vec3 {
  return { x: positions[index * 3] || 0, y: positions[index * 3 + 1] || 0, z: positions[index * 3 + 2] || 0 };
}
