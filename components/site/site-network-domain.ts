import { pointInRing } from "@/lib/skill5/placement";
import type { XZ } from "@/lib/skill5/site-model";

export type NetworkFootprint = {
  id: string | number;
  ring: readonly XZ[];
  holes?: readonly (readonly XZ[])[];
};

export type NetworkDomainInput = {
  parcel: readonly XZ[];
  water: readonly XZ[];
  /** Existing footprints. Proposed assemblies are not part of this list. */
  buildings?: readonly NetworkFootprint[];
  /**
   * Method 01 keeps the water closed.
   * A zone opens water only when its ring is an explicit, valid polygon.
   */
  overWater?: readonly XZ[] | null;
};

export type NetworkObstacle = {
  id: string;
  ring: XZ[];
  holes: XZ[][];
};

export type NetworkDomain = {
  valid: boolean;
  boundary: XZ[];
  water: XZ[] | null;
  overWater: XZ[] | null;
  obstacles: NetworkObstacle[];
  gaps: string[];
};

type MaskFrame = {
  minX: number;
  minZ: number;
  width: number;
  depth: number;
};

function copyRing(ring: readonly XZ[]): XZ[] {
  return ring.map((point) => [point[0], point[1]]);
}

function ringArea(ring: readonly XZ[]) {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x, z] = ring[index];
    const [nextX, nextZ] = ring[(index + 1) % ring.length];
    sum += x * nextZ - nextX * z;
  }
  return Math.abs(sum) / 2;
}

function crosses(a: XZ, b: XZ, c: XZ, d: XZ) {
  const side = (p: XZ, q: XZ, r: XZ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function selfCrossings(ring: readonly XZ[]) {
  let count = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (let j = i + 1; j < ring.length; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === ring.length - 1);
      if (adjacent) continue;
      const c = ring[j];
      const d = ring[(j + 1) % ring.length];
      if (crosses(a, b, c, d)) count += 1;
    }
  }
  return count;
}

function ringGap(ring: readonly XZ[] | null | undefined, name: string) {
  if (!ring || ring.length < 3) return `${name} is missing or has fewer than three corners.`;
  if (ring.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) return `${name} has a coordinate that is not a finite site foot.`;
  if (ringArea(ring) < 1) return `${name} has no area.`;
  if (selfCrossings(ring) > 0) return `${name} crosses itself, so a point inside it cannot be decided.`;
  return null;
}

function bounds(ring: readonly XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function ringsOverlap(ring: readonly XZ[], parcel: readonly XZ[]) {
  const box = bounds(parcel);
  const other = bounds(ring);
  if (other.maxX < box.minX || other.minX > box.maxX || other.maxZ < box.minZ || other.minZ > box.maxZ) return false;
  if (ring.some(([x, z]) => pointInRing(x, z, parcel))) return true;
  if (parcel.some(([x, z]) => pointInRing(x, z, ring))) return true;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (let j = 0; j < parcel.length; j += 1) {
      if (crosses(a, b, parcel[j], parcel[(j + 1) % parcel.length])) return true;
    }
  }
  return false;
}

/**
 * The simulation boundary is the project parcel.
 * Water stays closed unless `overWater` is a valid polygon.
 * Invalid geometry stays closed. There is no rectangle substitute.
 */
export function assessNetworkDomain(input: NetworkDomainInput): NetworkDomain {
  const gaps: string[] = [];
  const boundaryGap = ringGap(input.parcel, "The project parcel");
  const waterGap = ringGap(input.water, "The water polygon");
  if (boundaryGap) gaps.push(boundaryGap);
  if (waterGap) gaps.push(waterGap);
  const boundary = boundaryGap ? [] : copyRing(input.parcel);
  const water = waterGap ? null : copyRing(input.water);
  let overWater: XZ[] | null = null;
  if (input.overWater && input.overWater.length > 0) {
    const zoneGap = ringGap(input.overWater, "The over-water study zone");
    if (zoneGap) gaps.push(`${zoneGap} Water stays closed.`);
    else overWater = copyRing(input.overWater);
  }
  const obstacles: NetworkObstacle[] = [];
  if (boundary.length >= 3) {
    for (const building of input.buildings ?? []) {
      const footprintGap = ringGap(building.ring, `Building ${building.id}`);
      if (footprintGap) {
        gaps.push(`${footprintGap} It was not used as an obstacle.`);
        continue;
      }
      if (!ringsOverlap(building.ring, boundary)) continue;
      const holes: XZ[][] = [];
      for (const hole of building.holes ?? []) {
        const holeGap = ringGap(hole, `Building ${building.id} courtyard`);
        if (holeGap) {
          gaps.push(`${holeGap} That courtyard stays inside the footprint.`);
          continue;
        }
        holes.push(copyRing(hole));
      }
      obstacles.push({ id: String(building.id), ring: copyRing(building.ring), holes });
    }
  }
  return {
    valid: !boundaryGap && !waterGap,
    boundary,
    water,
    overWater,
    obstacles,
    gaps,
  };
}

function insideObstacle(east: number, north: number, obstacle: NetworkObstacle) {
  if (!pointInRing(east, north, obstacle.ring)) return false;
  return !obstacle.holes.some((hole) => pointInRing(east, north, hole));
}

/** One open flag per trail cell. Cell centers use the same site frame as the trail plane. */
export function rasterNetworkMask(frame: MaskFrame, domain: NetworkDomain, size: number) {
  const count = size * size;
  const open = new Uint8Array(count);
  const closed: number[] = [];
  if (!domain.valid || frame.width <= 0 || frame.depth <= 0 || size < 1) {
    for (let index = 0; index < count; index += 1) closed.push(index);
    return { open, closed: Uint32Array.from(closed), traversable: 0 };
  }
  let traversable = 0;
  for (let y = 0; y < size; y += 1) {
    const north = frame.minZ + ((y + 0.5) / size) * frame.depth;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const east = frame.minX + ((x + 0.5) / size) * frame.width;
      const index = row + x;
      const onParcel = pointInRing(east, north, domain.boundary);
      const onZone = domain.overWater ? pointInRing(east, north, domain.overWater) : false;
      const onWater = domain.water ? pointInRing(east, north, domain.water) : false;
      const allowed = (onParcel || onZone) && (!onWater || onZone);
      const blocked = allowed && domain.obstacles.some((obstacle) => insideObstacle(east, north, obstacle));
      if (allowed && !blocked) {
        open[index] = 1;
        traversable += 1;
      } else closed.push(index);
    }
  }
  return { open, closed: Uint32Array.from(closed), traversable };
}
