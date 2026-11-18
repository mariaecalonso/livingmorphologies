/**
 * Whole-cluster morphology readings shared by the four engines.
 * These rank clusters that already passed geometric validation. They never accept a contact.
 */
import { REGISTRATION_CELL, type ClusterMorphology, type ClusterTile, type ContactRelation } from "../contract";
import { poseBounds } from "../geometry";
import { growthDirection } from "../grow";
import type { ArchetypeMesh } from "../source";

export type ShapeReading = {
  compact: number;
  branching: number;
  vertical: number;
  /** Joint substance, ground seams, and archetype variety. */
  quality: number;
  measures: {
    tiles: number;
    occupancy: number;
    extraEdges: number;
    gyration: number;
    leaves: number;
    branchPoints: number;
    depth: number;
    directions: string[];
    aspect: number;
    levels: number;
    stacked: number;
    upright: number;
    minJointArea: number;
    groundSeams: number;
    unique: number;
  };
};

const clip = (value: number) => Math.max(0, Math.min(1, value));
const QUALITY_WEIGHT = 0.35;

export function readShape(tiles: readonly ClusterTile[], contacts: readonly ContactRelation[], byId: ReadonlyMap<string, ArchetypeMesh>): ShapeReading {
  const n = tiles.length;
  const boxes = new Map(tiles.map((tile) => [tile.instanceId, poseBounds(byId.get(tile.archetypeId)!.tight, tile.pose)]));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let solid = 0;
  const centers: number[][] = [];
  for (const tile of tiles) {
    const box = boxes.get(tile.instanceId)!;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
    solid += Math.abs(byId.get(tile.archetypeId)?.solidVolume ?? 0);
    centers.push([0, 1, 2].map((axis) => (box.min[axis] + box.max[axis]) / 2));
  }
  const extent = [0, 1, 2].map((axis) => Math.max(1e-6, max[axis] - min[axis]));
  const occupancy = solid / (extent[0] * extent[1] * extent[2]);
  const mean = [0, 1, 2].map((axis) => centers.reduce((sum, center) => sum + center[axis], 0) / Math.max(1, n));
  const gyration = Math.sqrt(centers.reduce((sum, center) => sum + (center[0] - mean[0]) ** 2 + (center[1] - mean[1]) ** 2 + (center[2] - mean[2]) ** 2, 0) / Math.max(1, n)) / REGISTRATION_CELL;

  const parent = new Map<string, string>();
  const primary = new Set<ContactRelation>();
  for (const contact of contacts) {
    if (parent.has(contact.guestId)) continue;
    parent.set(contact.guestId, contact.hostId);
    primary.add(contact);
  }
  const children = new Map<string, number>();
  for (const host of parent.values()) children.set(host, (children.get(host) ?? 0) + 1);
  const generation = (id: string): number => {
    let depth = 0;
    let cursor = id;
    while (parent.has(cursor) && depth < n) {
      cursor = parent.get(cursor)!;
      depth += 1;
    }
    return depth;
  };
  const byInstance = new Map(tiles.map((tile) => [tile.instanceId, tile]));
  const directions = new Set<string>();
  let stacked = 0;
  for (const [guestId, hostId] of parent.entries()) {
    const host = byInstance.get(hostId);
    const guest = byInstance.get(guestId);
    if (!host || !guest) continue;
    const direction = growthDirection(byId.get(host.archetypeId)!, host.pose, byId.get(guest.archetypeId)!, guest.pose);
    directions.add(direction);
    if (direction === "+Z") stacked += 1;
  }
  const leaves = tiles.filter((tile) => tile.instanceId !== tiles[0]?.instanceId && !children.has(tile.instanceId)).length;
  const branchPoints = [...children.values()].filter((count) => count >= 2).length;
  const depth = tiles.reduce((deepest, tile) => Math.max(deepest, generation(tile.instanceId)), 0);
  const levels = new Set(tiles.map((tile) => Math.round(boxes.get(tile.instanceId)!.min[2] / (REGISTRATION_CELL / 2)))).size;
  const upright = tiles.reduce((sum, tile) => sum + Math.max(0, tile.pose.basis[8]), 0) / Math.max(1, n);
  const minJointArea = [...primary].reduce((low, contact) => Math.min(low, contact.contactArea), Infinity);
  const groundSeams = contacts.filter((contact) => contact.samples.length > 0 && Math.min(...contact.samples.map((sample) => sample.host[2])) < 0.6).length;
  const unique = new Set(tiles.map((tile) => tile.archetypeId)).size;
  const edges = Math.max(1, n - 1);
  const root = Math.cbrt(Math.max(1, n));

  const compact = 0.45 * clip(occupancy / 0.35) + 0.3 * clip((contacts.length - primary.size) / edges) + 0.25 * (1 - clip((gyration - 0.4 * root) / (0.8 * root)));
  const branching = 0.3 * clip(branchPoints / Math.max(1, Math.floor(edges / 2))) + 0.25 * (leaves / edges) + 0.25 * clip((depth - 1) / 2) + 0.2 * clip((directions.size - 1) / 3);
  const vertical = 0.4 * clip(extent[2] / Math.max(extent[0], extent[1]) / 1.2) + 0.3 * clip((levels - 1) / 2) + 0.15 * (stacked / edges) + 0.15 * upright;
  const quality = 0.4 * clip((Number.isFinite(minJointArea) ? minJointArea : 0) / 20) + 0.3 * (1 - clip(groundSeams / edges)) + 0.3 * (unique / Math.max(1, n));
  return {
    compact,
    branching,
    vertical,
    quality,
    measures: {
      tiles: n,
      occupancy,
      extraEdges: contacts.length - primary.size,
      gyration,
      leaves,
      branchPoints,
      depth,
      directions: [...directions].sort(),
      aspect: extent[2] / Math.max(extent[0], extent[1]),
      levels,
      stacked,
      upright,
      minJointArea: Number.isFinite(minJointArea) ? minJointArea : 0,
      groundSeams,
      unique,
    },
  };
}

/** Chebyshev balance: the weakest of the three objectives. Not their sum. */
export function balanced(reading: ShapeReading): number {
  return Math.min(reading.compact, reading.branching, reading.vertical);
}

/** One morphology's preference for a finished cluster. Integrated reads the weakest objective. */
export function morphologyScore(morphology: ClusterMorphology, reading: ShapeReading): number {
  const own = morphology === "integrated" ? balanced(reading) : reading[morphology];
  return own + QUALITY_WEIGHT * reading.quality;
}

export function dominates(left: ShapeReading, right: ShapeReading): boolean {
  const a = [left.compact, left.branching, left.vertical];
  const b = [right.compact, right.branching, right.vertical];
  return a.every((value, index) => value >= b[index]) && a.some((value, index) => value > b[index]);
}

/** Non-dominated sorting on compact, branching, and vertical. Rank 0 is the front. */
export function paretoRanks(readings: readonly ShapeReading[]): number[] {
  const ranks = readings.map(() => -1);
  let rank = 0;
  let left = readings.map((_, index) => index);
  while (left.length > 0) {
    const front = left.filter((index) => !left.some((other) => other !== index && dominates(readings[other], readings[index])));
    for (const index of front) ranks[index] = rank;
    left = left.filter((index) => ranks[index] < 0);
    rank += 1;
  }
  return ranks;
}

/** More tiles first. Then the morphology score, or for Integrated the Pareto front and its most balanced member. */
export function rankReadings(morphology: ClusterMorphology, readings: readonly ShapeReading[]): number[] {
  const ranks = morphology === "integrated" ? paretoRanks(readings) : readings.map(() => 0);
  return readings.map((_, index) => index).sort((left, right) => (
    readings[right].measures.tiles - readings[left].measures.tiles
    || ranks[left] - ranks[right]
    || morphologyScore(morphology, readings[right]) - morphologyScore(morphology, readings[left])
  ));
}

/** Display warning only. It does not accept or reject a contact. */
export const NARROW_JOINT_AREA = 8;
export const NARROW_GUEST_SHARE = 0.15;

export function narrowLargeGuest(area: number, guestSolid: number, clusterSolid: number): boolean {
  return clusterSolid > 0 && area < NARROW_JOINT_AREA && guestSolid / clusterSolid > NARROW_GUEST_SHARE;
}

export function shapeSummary(reading: ShapeReading) {
  const round = (value: number) => Number(value.toFixed(3));
  return {
    compact: round(reading.compact),
    branching: round(reading.branching),
    vertical: round(reading.vertical),
    quality: round(reading.quality),
    balanced: round(balanced(reading)),
    depth: reading.measures.depth,
    leaves: reading.measures.leaves,
    branchPoints: reading.measures.branchPoints,
    levels: reading.measures.levels,
    directions: reading.measures.directions,
    minJointArea: round(reading.measures.minJointArea),
    groundSeams: reading.measures.groundSeams,
    unique: reading.measures.unique,
  };
}
