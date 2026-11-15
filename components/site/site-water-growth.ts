import { pointInRing } from "@/lib/skill5/placement";
import type { XZ } from "@/lib/skill5/site-model";

/** Width of the permitted over-water region. The solver still chooses the path. */
export const GROWTH_WIDTH_DEFAULT = 64;
export const GROWTH_WIDTH_MIN = 36;
export const GROWTH_WIDTH_MAX = 160;

export type WaterGrowth = {
  widthFt: number;
  landX: number;
  landZ: number;
};

export function clampGrowthWidth(value: number) {
  if (!Number.isFinite(value)) return GROWTH_WIDTH_DEFAULT;
  return Math.min(GROWTH_WIDTH_MAX, Math.max(GROWTH_WIDTH_MIN, value));
}

function closestOnSegment(east: number, north: number, a: XZ, b: XZ) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((east - a[0]) * dx + (north - a[1]) * dz) / length));
  return { x: a[0] + dx * t, z: a[1] + dz * t };
}

/**
 * The shore contact is the nearest parcel edge, then a step into open land
 * so the growth region overlaps the traversable network.
 */
export function shoreLanding(
  east: number,
  north: number,
  parcel: readonly XZ[],
  water: readonly XZ[] | null,
) {
  if (parcel.length < 3) return null;
  let best: { x: number; z: number; dist: number } | null = null;
  for (let index = 0; index < parcel.length; index += 1) {
    const point = closestOnSegment(east, north, parcel[index], parcel[(index + 1) % parcel.length]);
    const dist = Math.hypot(point.x - east, point.z - north);
    if (!best || dist < best.dist) best = { ...point, dist };
  }
  if (!best) return null;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of parcel) {
    cx += x;
    cz += z;
  }
  cx /= parcel.length;
  cz /= parcel.length;
  let dx = cx - best.x;
  let dz = cz - best.z;
  const span = Math.hypot(dx, dz) || 1;
  dx /= span;
  dz /= span;
  for (let step = 20; step <= 72; step += 4) {
    const x = best.x + dx * step;
    const z = best.z + dz * step;
    if (!pointInRing(x, z, parcel)) continue;
    if (water && pointInRing(x, z, water)) continue;
    return { x, z };
  }
  return { x: best.x + dx * 20, z: best.z + dz * 20 };
}

/** A corridor around the attractor and its land contact. This is a region, not a route. */
export function growthRing(east: number, north: number, landX: number, landZ: number, widthFt: number): XZ[] | null {
  const dx = landX - east;
  const dz = landZ - north;
  const length = Math.hypot(dx, dz);
  if (length < 1) return null;
  const ux = dx / length;
  const uz = dz / length;
  const width = clampGrowthWidth(widthFt);
  const px = -uz * width * 0.5;
  const pz = ux * width * 0.5;
  const pad = 12;
  const ax = east - ux * pad;
  const az = north - uz * pad;
  const bx = landX + ux * pad;
  const bz = landZ + uz * pad;
  return [
    [ax + px, az + pz],
    [bx + px, bz + pz],
    [bx - px, bz - pz],
    [ax - px, az - pz],
  ];
}
