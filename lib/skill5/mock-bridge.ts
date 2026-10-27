import { composeAssemblyPose } from "@/lib/skill5/assembly";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { isSkill5MockAssembly } from "@/lib/skill5/mock-assemblies";

export type BridgeCloud = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

type End = { east: number; up: number; north: number };

function hash(value: string) {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function unit(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/** A provisional join between two mock modules. Not a Skill 4 connector mesh. */
export function demonstrationBridge(a: End, b: End, seedKey: string): BridgeCloud {
  const seed = hash(seedKey);
  const phase = (seed % 360) * Math.PI / 180;
  const dx = b.east - a.east;
  const dy = b.up - a.up;
  const dz = b.north - a.north;
  const span = Math.hypot(dx, dy, dz) || 1;
  const dir = unit(dx, dy, dz);
  const helper = Math.abs(dir.y) > 0.75 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const side = unit(
    dir.y * helper.z - dir.z * helper.y,
    dir.z * helper.x - dir.x * helper.z,
    dir.x * helper.y - dir.y * helper.x,
  );
  const lift = unit(
    dir.y * side.z - dir.z * side.y,
    dir.z * side.x - dir.x * side.z,
    dir.x * side.y - dir.y * side.x,
  );
  const inset = Math.min(2.2, span * 0.08);
  const start = {
    east: a.east + dir.x * inset,
    up: a.up + 7 + dir.y * inset,
    north: a.north + dir.z * inset,
  };
  const end = {
    east: b.east - dir.x * inset,
    up: b.up + 7 - dir.y * inset,
    north: b.north - dir.z * inset,
  };
  const along = 11;
  const around = 8;
  const positions = new Float32Array((along + 1) * around * 3);
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array(along * around * 6);
  const bulge = 2.4 + (seed % 5) * 0.35;
  for (let step = 0; step <= along; step += 1) {
    const t = step / along;
    const neck = Math.sin(t * Math.PI);
    const center = {
      east: start.east + (end.east - start.east) * t + side.x * neck * bulge + lift.x * Math.sin(t * Math.PI * 2 + phase) * 1.1,
      up: start.up + (end.up - start.up) * t + Math.sin(t * Math.PI) * 2.6 + side.y * neck * 0.6,
      north: start.north + (end.north - start.north) * t + side.z * neck * bulge + lift.z * Math.sin(t * Math.PI * 2 + phase) * 1.1,
    };
    const radius = 6.2 - neck * 3.5;
    for (let spoke = 0; spoke < around; spoke += 1) {
      const angle = spoke / around * Math.PI * 2;
      const wobble = 1 + 0.2 * Math.sin(angle * 2 + phase) + 0.1 * Math.sin(angle * 3 + t * 5);
      const radial = radius * wobble;
      const east = center.east + (side.x * Math.cos(angle) + lift.x * Math.sin(angle) * 0.72) * radial;
      const up = center.up + (side.y * Math.cos(angle) + lift.y * Math.sin(angle) * 0.72) * radial;
      const north = center.north + (side.z * Math.cos(angle) + lift.z * Math.sin(angle) * 0.72) * radial;
      const write = (step * around + spoke) * 3;
      positions[write] = east;
      positions[write + 1] = up;
      positions[write + 2] = north;
      const normal = unit(east - center.east, up - center.up, north - center.north);
      normals[write] = normal.x;
      normals[write + 1] = normal.y;
      normals[write + 2] = normal.z;
    }
  }
  let index = 0;
  for (let step = 0; step < along; step += 1) {
    for (let spoke = 0; spoke < around; spoke += 1) {
      const next = (spoke + 1) % around;
      const a0 = step * around + spoke;
      const a1 = step * around + next;
      const b0 = (step + 1) * around + spoke;
      const b1 = (step + 1) * around + next;
      indices[index] = a0;
      indices[index + 1] = b0;
      indices[index + 2] = a1;
      indices[index + 3] = a1;
      indices[index + 4] = b0;
      indices[index + 5] = b1;
      index += 6;
    }
  }
  return { positions, normals, indices };
}

export function combineBridges(parts: BridgeCloud[]): BridgeCloud | null {
  if (parts.length === 0) return null;
  let vertices = 0;
  let indexes = 0;
  for (const part of parts) {
    vertices += part.positions.length;
    indexes += part.indices.length;
  }
  const positions = new Float32Array(vertices);
  const normals = new Float32Array(vertices);
  const indices = new Uint32Array(indexes);
  let vertexWrite = 0;
  let indexWrite = 0;
  let base = 0;
  for (const part of parts) {
    positions.set(part.positions, vertexWrite);
    normals.set(part.normals, vertexWrite);
    for (let index = 0; index < part.indices.length; index += 1) indices[indexWrite + index] = part.indices[index] + base;
    base += part.positions.length / 3;
    vertexWrite += part.positions.length;
    indexWrite += part.indices.length;
  }
  return { positions, normals, indices };
}

export function localDemonstrationBridge(assembly: {
  assemblyId: string;
  members: { tileId: string; local: { x: number; y: number; z: number } }[];
  connectors: { id: string; tileAId: string; tileBId: string }[];
}): BridgeCloud | null {
  if (!isSkill5MockAssembly(assembly.assemblyId)) return null;
  const byTile = new Map(assembly.members.map((member) => [member.tileId, member]));
  const parts = assembly.connectors.flatMap((link) => {
    const start = byTile.get(link.tileAId);
    const end = byTile.get(link.tileBId);
    if (!start || !end) return [];
    return [demonstrationBridge(
      { east: start.local.x, up: start.local.y, north: start.local.z },
      { east: end.local.x, up: end.local.y, north: end.local.z },
      `${assembly.assemblyId}:${link.id}`,
    )];
  });
  return combineBridges(parts);
}

export function worldSourceBridge(cloud: BridgeCloud, group: { x: number; z: number; rotationY: number }): IsoMesh {
  const positions = new Float32Array(cloud.positions.length);
  const normals = new Float32Array(cloud.normals.length);
  for (let index = 0; index < cloud.positions.length; index += 3) {
    const pose = composeAssemblyPose(group, { x: cloud.positions[index], z: cloud.positions[index + 2], rotationY: 0 });
    positions[index] = pose.x;
    positions[index + 1] = pose.z;
    positions[index + 2] = cloud.positions[index + 1];
    const turned = composeAssemblyPose({ x: 0, z: 0, rotationY: group.rotationY }, {
      x: cloud.normals[index],
      z: cloud.normals[index + 2],
      rotationY: 0,
    });
    normals[index] = turned.x;
    normals[index + 1] = turned.z;
    normals[index + 2] = cloud.normals[index + 1];
  }
  return { positions, normals, indices: cloud.indices, triangles: cloud.indices.length / 3 };
}
