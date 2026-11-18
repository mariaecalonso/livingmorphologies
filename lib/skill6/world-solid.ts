/**
 * World-space copy of a placed tile. Built once and reused while that tile stays put.
 * The triangle test is the same crossing measure as scanCrossings, in world coordinates.
 */
import { SKILL6_PARAMETERS, type Skill6Pose, type Vec3 } from "./contract";
import {
  applyPose,
  crossingPenetration,
  hashTriangles,
  poseBounds,
  queryHashBox,
  readTriangle,
  type Bounds,
  type TriangleHash,
} from "./geometry";
import type { ArchetypeMesh } from "./source";

export type PlacedSolid = {
  positions: Float32Array;
  indices: Uint32Array;
  triangles: number;
  hash: TriangleHash;
  bounds: Bounds;
};

export function placeSolid(mesh: ArchetypeMesh, pose: Skill6Pose): PlacedSolid {
  const positions = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const world = applyPose(pose, [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]]);
    positions[index] = world[0];
    positions[index + 1] = world[1];
    positions[index + 2] = world[2];
  }
  return {
    positions,
    indices: mesh.indices,
    triangles: mesh.triangles,
    hash: hashTriangles(positions, mesh.indices, mesh.triangles, mesh.hash.cell),
    bounds: poseBounds(mesh.tight, pose),
  };
}

/** Nine world coordinates per guest triangle, built once per candidate pose. */
export function guestWorldTriangles(guest: ArchetypeMesh, guestPose: Skill6Pose): Float32Array {
  const prepared = new Float32Array(guest.triangles * 9);
  for (let triangle = 0; triangle < guest.triangles; triangle += 1) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const worldA = applyPose(guestPose, a);
    const worldB = applyPose(guestPose, b);
    const worldC = applyPose(guestPose, c);
    const offset = triangle * 9;
    prepared[offset] = worldA[0];
    prepared[offset + 1] = worldA[1];
    prepared[offset + 2] = worldA[2];
    prepared[offset + 3] = worldB[0];
    prepared[offset + 4] = worldB[1];
    prepared[offset + 5] = worldB[2];
    prepared[offset + 6] = worldC[0];
    prepared[offset + 7] = worldC[1];
    prepared[offset + 8] = worldC[2];
  }
  return prepared;
}

function readPrepared(prepared: Float32Array, triangle: number): [Vec3, Vec3, Vec3] {
  const offset = triangle * 9;
  return [
    [prepared[offset], prepared[offset + 1], prepared[offset + 2]],
    [prepared[offset + 3], prepared[offset + 4], prepared[offset + 5]],
    [prepared[offset + 6], prepared[offset + 7], prepared[offset + 8]],
  ];
}

export function scanPrepared(host: PlacedSolid, prepared: Float32Array, triangles: number): { count: number; deepest: number } {
  let count = 0;
  let deepest = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const [worldA, worldB, worldC] = readPrepared(prepared, triangle);
    const min: Vec3 = [
      Math.min(worldA[0], worldB[0], worldC[0]) - 0.02,
      Math.min(worldA[1], worldB[1], worldC[1]) - 0.02,
      Math.min(worldA[2], worldB[2], worldC[2]) - 0.02,
    ];
    const max: Vec3 = [
      Math.max(worldA[0], worldB[0], worldC[0]) + 0.02,
      Math.max(worldA[1], worldB[1], worldC[1]) + 0.02,
      Math.max(worldA[2], worldB[2], worldC[2]) + 0.02,
    ];
    for (const other of queryHashBox(host.hash, min, max)) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const depth = crossingPenetration(worldA, worldB, worldC, d, e, f);
      if (depth <= 1e-4) continue;
      if (depth > deepest) deepest = depth;
      if (depth > SKILL6_PARAMETERS.maxPenetration) {
        count += 1;
        if (count >= 40) return { count, deepest };
      }
    }
  }
  return { count, deepest };
}

/** Guest triangles are transformed once. Host triangles are already in the placed hash. */
export function scanPlaced(host: PlacedSolid, guest: ArchetypeMesh, guestPose: Skill6Pose): { count: number; deepest: number } {
  return scanPrepared(host, guestWorldTriangles(guest, guestPose), guest.triangles);
}
