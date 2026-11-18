/**
 * Diagnostic comparison of the posed source archetypes with the refined assembly.
 * Measurements are reported. None of them is an acceptance threshold.
 * Small joint pockets may be filled. An original void or opening that changes is flagged for review.
 */
import { CLUSTER_REFINEMENT } from "./refine-mesh";
import { applyPose, closestOnTriangle, hashTriangles, length, pointInsideMesh, queryHash, readTriangle, sub } from "./geometry";
import type { PatchMesh } from "./patch";
import type { ArchetypeMesh } from "./source";
import type { Skill6Pose, Vec3 } from "./contract";

export type PreservationTile = {
  instanceId: string;
  archetypeId: string;
  /** Source area still within 0.02 of the refined surface, after excluding buried area. */
  retained: number;
  /** Still on the union, but 0.02 to 0.1 off the refined surface. */
  slight: number;
  /** Still on the union, and more than 0.1 off the refined surface. */
  moved: number;
  /** Source area more than 0.02 inside the raw union, so it is no longer boundary. */
  buried: number;
  maxDeviation: number;
};

export type SilhouetteView = {
  plane: "plan" | "elevation-x" | "elevation-y";
  cell: number;
  intersection: number;
  union: number;
  /** 1 − intersection / union. Null when both outlines are empty. */
  deviation: number | null;
  /** Largest distance from a cell in one outline to the other outline. */
  maxGap: number;
};

export type VoidBody = { volume: number; centroid: Vec3; min: Vec3; max: Vec3 };

export type PreservationReport = {
  tiles: PreservationTile[];
  silhouettes: SilhouetteView[];
  /** Sealed negative-volume shells in the source meshes, posed into the assembly. */
  originalVoids: { instanceId: string; archetypeId: string; voids: VoidBody[] }[];
  /** Original sealed voids with no remaining cavity in the refined mesh. */
  originalVoidsAltered: { instanceId: string; archetypeId: string; volume: number; centroid: Vec3 }[];
  originalVoidAltered: boolean;
  openings: {
    step: number;
    samples: number;
    /** Samples outside the source solid and inside its tight bounds. */
    voidSamples: number;
    /** Those samples that lie inside the refined solid. */
    filled: number;
    /** Filled samples within the seam reach of a patch. */
    filledNearJoint: number;
    filledRemote: number;
    /** Filled samples that lie inside another posed archetype. They are not opened volume. */
    occupiedByAnotherTile: number;
    /** Filled samples that no source archetype occupies. */
    altered: number;
    alteredNearJoint: number;
    alteredRemote: number;
  };
  originalOpeningAltered: boolean;
  patches: { volume: number | null; hostOverlap: number | null; guestOverlap: number | null; outside: number | null }[];
  /** Patch volume that is in neither source solid. */
  patchVolumeOutside: number;
  /** Raw-union cavities under the existing fill limit that are not original voids and are gone after refinement. */
  jointPocketsFilled: { volume: number; centroid: Vec3 }[];
  jointPocketVolumeFilled: number;
  /** The refiner's own filled-cavity count, kept beside this classification. */
  refinerFilled: number;
  review: string[];
};

const SURFACE_CELL = 0.55;
const OUTLINE_CELL = 0.5;
const MATCH_PAD = 0.12;

function decodeReady(mesh: PatchMesh) {
  return hashTriangles(mesh.positions, mesh.indices, mesh.indices.length / 3, SURFACE_CELL);
}

function nearest(mesh: PatchMesh, hash: ReturnType<typeof hashTriangles>, point: Vec3): number {
  let best = Infinity;
  for (const radius of [0.3, 1.2, 4]) {
    for (const triangle of queryHash(hash, point, radius)) {
      const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
      best = Math.min(best, length(sub(point, closestOnTriangle(point, a, b, c))));
    }
    if (best < Infinity) break;
  }
  return best;
}

function surfaceOf(tiles: readonly { instanceId: string; archetypeId: string; mesh: ArchetypeMesh; pose: Skill6Pose }[], raw: PatchMesh, refined: PatchMesh): PreservationTile[] {
  const rawHash = decodeReady(raw);
  const refinedHash = decodeReady(refined);
  return tiles.map((tile) => {
    let area = 0;
    let retained = 0;
    let slight = 0;
    let moved = 0;
    let buried = 0;
    let maxDeviation = 0;
    const stride = Math.max(1, Math.floor(tile.mesh.triangles / 4000));
    for (let triangle = 0; triangle < tile.mesh.triangles; triangle += stride) {
      const [a, b, c] = readTriangle(tile.mesh.positions, tile.mesh.indices, triangle);
      const span = length([
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ]);
      const weight = span * 0.5 * stride;
      const point = applyPose(tile.pose, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
      area += weight;
      const toRaw = nearest(raw, rawHash, point);
      if (toRaw > 0.02) {
        buried += weight;
        continue;
      }
      const toRefined = nearest(refined, refinedHash, point);
      if (toRefined <= 0.02) retained += weight;
      else if (toRefined <= 0.1) slight += weight;
      else moved += weight;
      if (Number.isFinite(toRefined)) maxDeviation = Math.max(maxDeviation, toRefined);
    }
    const share = (value: number) => (area > 0 ? value / area : 0);
    return {
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      retained: share(retained),
      slight: share(slight),
      moved: share(moved),
      buried: share(buried),
      maxDeviation,
    };
  });
}

type Plane = "plan" | "elevation-x" | "elevation-y";

function project(point: Vec3, plane: Plane): [number, number] {
  if (plane === "plan") return [point[0], point[1]];
  if (plane === "elevation-x") return [point[0], point[2]];
  return [point[1], point[2]];
}

function fillTriangle(cells: Set<string>, corners: [number, number][], cell: number) {
  const minX = Math.min(corners[0][0], corners[1][0], corners[2][0]);
  const maxX = Math.max(corners[0][0], corners[1][0], corners[2][0]);
  const minY = Math.min(corners[0][1], corners[1][1], corners[2][1]);
  const maxY = Math.max(corners[0][1], corners[1][1], corners[2][1]);
  const edge = (p: [number, number], a: [number, number], b: [number, number]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const area = edge(corners[0], corners[1], corners[2]);
  if (Math.abs(area) < 1e-8) return;
  for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x += 1) {
    for (let y = Math.floor(minY / cell); y <= Math.floor(maxY / cell); y += 1) {
      const center: [number, number] = [(x + 0.5) * cell, (y + 0.5) * cell];
      const w0 = edge(center, corners[1], corners[2]) / area;
      const w1 = edge(center, corners[2], corners[0]) / area;
      const w2 = edge(center, corners[0], corners[1]) / area;
      if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) cells.add(`${x}:${y}`);
    }
  }
}

function outline(mesh: PatchMesh, plane: Plane, cell: number): Set<string> {
  const cells = new Set<string>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [0, 1, 2].map((corner) => {
      const vertex = mesh.indices[index + corner] * 3;
      return project([mesh.positions[vertex], mesh.positions[vertex + 1], mesh.positions[vertex + 2]], plane);
    }) as [number, number][];
    fillTriangle(cells, corners, cell);
  }
  return cells;
}

function poseMesh(mesh: ArchetypeMesh, pose: Skill6Pose): PatchMesh {
  const positions = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const world = applyPose(pose, [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]]);
    positions[index] = world[0];
    positions[index + 1] = world[1];
    positions[index + 2] = world[2];
  }
  return { positions, indices: mesh.indices };
}

function silhouettes(source: PatchMesh, refined: PatchMesh): SilhouetteView[] {
  return (["plan", "elevation-x", "elevation-y"] as const).map((plane) => {
    const left = outline(source, plane, OUTLINE_CELL);
    const right = outline(refined, plane, OUTLINE_CELL);
    let intersection = 0;
    for (const cell of left) if (right.has(cell)) intersection += 1;
    const union = left.size + right.size - intersection;
    const gapOf = (from: Set<string>, to: Set<string>) => {
      let max = 0;
      const points = [...to].map((cell) => cell.split(":").map(Number));
      for (const cell of from) {
        if (to.has(cell)) continue;
        const [x, y] = cell.split(":").map(Number);
        let nearest = Infinity;
        for (const [ox, oy] of points) nearest = Math.min(nearest, Math.hypot(x - ox, y - oy));
        if (points.length === 0) return Infinity;
        max = Math.max(max, nearest * OUTLINE_CELL);
      }
      return max;
    };
    return {
      plane,
      cell: OUTLINE_CELL,
      intersection,
      union,
      deviation: union > 0 ? 1 - intersection / union : null,
      maxGap: Math.max(gapOf(left, right), gapOf(right, left)),
    };
  });
}

type ManifoldLike = {
  volume: () => number;
  status: () => string;
  decompose: () => ManifoldLike[];
  delete: () => void;
  getMesh?: () => { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };
};

let manifoldWasm: Promise<{ Manifold: new (mesh: unknown) => ManifoldLike; Mesh: new (mesh: unknown) => unknown; setup: () => void }> | null = null;

function loadManifold() {
  manifoldWasm ??= (async () => {
    const wasm = await (await import("manifold-3d/manifold")).default();
    wasm.setup();
    return wasm as unknown as { Manifold: new (mesh: unknown) => ManifoldLike; Mesh: new (mesh: unknown) => unknown; setup: () => void };
  })();
  return manifoldWasm;
}

function bodyOf(solid: ManifoldLike): VoidBody | null {
  const volume = -solid.volume();
  const raw = solid.getMesh?.();
  if (!raw || volume < 1e-3) return null;
  const stride = raw.numProp || 3;
  const count = raw.vertProperties.length / stride;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const centroid: Vec3 = [0, 0, 0];
  for (let vertex = 0; vertex < count; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = raw.vertProperties[vertex * stride + axis];
      centroid[axis] += value;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  if (count === 0) return null;
  return { volume, centroid: [centroid[0] / count, centroid[1] / count, centroid[2] / count], min, max };
}

export async function sealedVoids(mesh: PatchMesh): Promise<VoidBody[]> {
  return cavitiesOf(mesh);
}

async function cavitiesOf(mesh: PatchMesh): Promise<VoidBody[]> {
  const wasm = await loadManifold();
  const make = (indices: Uint32Array) => new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: indices }));
  let solid = make(mesh.indices);
  if (solid.status() !== "NoError") {
    solid.delete();
    return [];
  }
  if (solid.volume() < 0) {
    solid.delete();
    const flipped = new Uint32Array(mesh.indices);
    for (let index = 0; index < flipped.length; index += 3) {
      const swap = flipped[index + 1];
      flipped[index + 1] = flipped[index + 2];
      flipped[index + 2] = swap;
    }
    solid = make(flipped);
    if (solid.status() !== "NoError") {
      solid.delete();
      return [];
    }
  }
  const found: VoidBody[] = [];
  for (const piece of solid.decompose()) {
    if (piece.volume() <= -1e-3) {
      const body = bodyOf(piece);
      if (body) found.push(body);
    }
    piece.delete();
  }
  solid.delete();
  return found;
}

function worldVoid(body: VoidBody, pose: Skill6Pose): VoidBody {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [body.min[0], body.max[0]]) {
    for (const y of [body.min[1], body.max[1]]) {
      for (const z of [body.min[2], body.max[2]]) {
        const world = applyPose(pose, [x, y, z]);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], world[axis]);
          max[axis] = Math.max(max[axis], world[axis]);
        }
      }
    }
  }
  return { volume: body.volume, centroid: applyPose(pose, body.centroid), min, max };
}

function contains(body: VoidBody, point: Vec3, pad = MATCH_PAD): boolean {
  return point[0] >= body.min[0] - pad && point[0] <= body.max[0] + pad
    && point[1] >= body.min[1] - pad && point[1] <= body.max[1] + pad
    && point[2] >= body.min[2] - pad && point[2] <= body.max[2] + pad;
}

function openingsOf(
  tiles: readonly { mesh: ArchetypeMesh; pose: Skill6Pose }[],
  refined: PatchMesh,
  patches: readonly PatchMesh[],
) {
  const seam = CLUSTER_REFINEMENT.seamReach;
  const patchPoints: Vec3[] = [];
  for (const patch of patches) {
    const stride = Math.max(1, Math.floor(patch.positions.length / 3 / 400));
    for (let index = 0; index < patch.positions.length; index += stride * 3) {
      patchPoints.push([patch.positions[index], patch.positions[index + 1], patch.positions[index + 2]]);
    }
  }
  let samples = 0;
  let voidSamples = 0;
  let filled = 0;
  let filledNearJoint = 0;
  let occupiedByAnotherTile = 0;
  let alteredNearJoint = 0;
  let stepUsed = 0;
  const posed = tiles.map((tile) => poseMesh(tile.mesh, tile.pose));
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    const tile = tiles[tileIndex];
    const size: Vec3 = [
      tile.mesh.tight.max[0] - tile.mesh.tight.min[0],
      tile.mesh.tight.max[1] - tile.mesh.tight.min[1],
      tile.mesh.tight.max[2] - tile.mesh.tight.min[2],
    ];
    const step = Math.max(2, Math.max(...size) / 5);
    stepUsed = Math.max(stepUsed, step);
    for (let x = tile.mesh.tight.min[0] + step / 2; x < tile.mesh.tight.max[0]; x += step) {
      for (let y = tile.mesh.tight.min[1] + step / 2; y < tile.mesh.tight.max[1]; y += step) {
        for (let z = tile.mesh.tight.min[2] + step / 2; z < tile.mesh.tight.max[2]; z += step) {
          samples += 1;
          if (pointInsideMesh([x, y, z], tile.mesh.positions, tile.mesh.indices, tile.mesh.triangles)) continue;
          voidSamples += 1;
          const world = applyPose(tile.pose, [x, y, z]);
          if (!pointInsideMesh(world, refined.positions, refined.indices, refined.indices.length / 3)) continue;
          filled += 1;
          const near = patchPoints.some((point) => Math.hypot(point[0] - world[0], point[1] - world[1], point[2] - world[2]) <= seam);
          if (near) filledNearJoint += 1;
          const occupied = posed.some((other, index) => index !== tileIndex && pointInsideMesh(world, other.positions, other.indices, other.indices.length / 3));
          if (occupied) occupiedByAnotherTile += 1;
          else if (near) alteredNearJoint += 1;
        }
      }
    }
  }
  const altered = filled - occupiedByAnotherTile;
  return {
    step: stepUsed,
    samples,
    voidSamples,
    filled,
    filledNearJoint,
    filledRemote: filled - filledNearJoint,
    occupiedByAnotherTile,
    altered,
    alteredNearJoint,
    alteredRemote: altered - alteredNearJoint,
  };
}

export async function measurePreservation(input: {
  tiles: readonly { instanceId: string; archetypeId: string; mesh: ArchetypeMesh; pose: Skill6Pose }[];
  raw: PatchMesh;
  refined: PatchMesh;
  patches: readonly PatchMesh[];
  patchStats: readonly { volume: number | null; hostOverlap: number | null; guestOverlap: number | null }[];
  refinerFilled: number;
}): Promise<PreservationReport> {
  const tiles = surfaceOf(input.tiles, input.raw, input.refined);
  const source: PatchMesh = {
    positions: Float32Array.from(input.tiles.flatMap((tile) => [...poseMesh(tile.mesh, tile.pose).positions])),
    indices: Uint32Array.from(input.tiles.flatMap((tile, index) => {
      const offset = input.tiles.slice(0, index).reduce((sum, item) => sum + item.mesh.positions.length / 3, 0);
      return [...poseMesh(tile.mesh, tile.pose).indices].map((vertex) => vertex + offset);
    })),
  };
  const views = silhouettes(source, input.refined);
  const originalVoids = [];
  for (const tile of input.tiles) {
    const local = await cavitiesOf({ positions: tile.mesh.positions, indices: tile.mesh.indices });
    originalVoids.push({
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      voids: local.map((body) => worldVoid(body, tile.pose)),
    });
  }
  const posedVoids = originalVoids.flatMap((tile) => tile.voids.map((body) => ({ ...body, instanceId: tile.instanceId, archetypeId: tile.archetypeId })));
  const rawCavities = await cavitiesOf(input.raw);
  const refinedCavities = await cavitiesOf(input.refined);
  const originalVoidsAltered = posedVoids.filter((body) => !refinedCavities.some((cavity) => contains(body, cavity.centroid))).map((body) => ({
    instanceId: body.instanceId,
    archetypeId: body.archetypeId,
    volume: body.volume,
    centroid: body.centroid,
  }));
  const jointPocketsFilled = rawCavities.filter((cavity) => cavity.volume < CLUSTER_REFINEMENT.fillCavityVolume
    && !posedVoids.some((body) => contains(body, cavity.centroid))
    && !refinedCavities.some((refinedCavity) => contains(cavity, refinedCavity.centroid)));
  const openings = openingsOf(input.tiles, input.refined, input.patches);
  const patches = input.patchStats.map((patch) => {
    const outside = patch.volume == null || patch.hostOverlap == null || patch.guestOverlap == null
      ? null
      : Math.max(0, patch.volume - patch.hostOverlap - patch.guestOverlap);
    return { ...patch, outside };
  });
  const review: string[] = [];
  if (originalVoidsAltered.length > 0) review.push(`${originalVoidsAltered.length} original sealed void${originalVoidsAltered.length === 1 ? "" : "s"} ${originalVoidsAltered.length === 1 ? "has" : "have"} no matching cavity after refinement.`);
  if (openings.altered > 0) review.push(`${openings.altered} of ${openings.voidSamples} original void samples lie inside the refined solid and outside every archetype (${openings.alteredNearJoint} near a joint, ${openings.alteredRemote} remote).`);
  return {
    tiles,
    silhouettes: views,
    originalVoids: originalVoids.map((tile) => ({ instanceId: tile.instanceId, archetypeId: tile.archetypeId, voids: tile.voids })),
    originalVoidsAltered,
    originalVoidAltered: originalVoidsAltered.length > 0,
    openings,
    originalOpeningAltered: openings.altered > 0,
    patches,
    patchVolumeOutside: patches.reduce((sum, patch) => sum + (patch.outside ?? 0), 0),
    jointPocketsFilled: jointPocketsFilled.map((cavity) => ({ volume: cavity.volume, centroid: cavity.centroid })),
    jointPocketVolumeFilled: jointPocketsFilled.reduce((sum, cavity) => sum + cavity.volume, 0),
    refinerFilled: input.refinerFilled,
    review,
  };
}
