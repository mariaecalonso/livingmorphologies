import { pointInRing } from "@/lib/skill5/placement";
import type { XZ } from "@/lib/skill5/site-model";

export type ExposureMass = {
  ring: readonly XZ[];
  heightFeet: number;
};

/** A triangle of the drawn ramp deck, in site feet: x east, y up, z north. */
export type ExposureTriangle = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const RAY_LIMIT_FEET = 2500;

export type ExposureCell = {
  x: number;
  z: number;
  exposed: boolean;
};

export type ParcelExposure = {
  spacingFeet: number;
  cells: ExposureCell[];
  exposed: number;
  shaded: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

function rayEdge(ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number) {
  const sx = bx - ax;
  const sz = bz - az;
  const den = dx * sz - dz * sx;
  if (Math.abs(den) < 1e-8) return null;
  const t = ((ax - ox) * sz - (az - oz) * sx) / den;
  const u = ((ax - ox) * dz - (az - oz) * dx) / den;
  if (t > 0.05 && u >= -1e-6 && u <= 1 + 1e-6) return t;
  return null;
}

function firstEntry(ox: number, oz: number, dx: number, dz: number, ring: readonly XZ[], limit: number) {
  let best: number | null = null;
  const count = ring.length;
  for (let index = 0; index < count; index += 1) {
    const [ax, az] = ring[index];
    const [bx, bz] = ring[(index + 1) % count];
    const t = rayEdge(ox, oz, dx, dz, ax, az, bx, bz);
    if (t === null || t >= limit) continue;
    if (!pointInRing(ox + dx * (t + 0.2), oz + dz * (t + 0.2), ring)) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

function rayTriangle(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
) {
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const tx = ox - ax;
  const ty = oy - ay;
  const tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-5 || u > 1 + 1e-5) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-5 || u + v > 1 + 1e-5) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0.05 ? t : null;
}

function triangleBlocks(
  x: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  horizontal: number,
  triangles: readonly ExposureTriangle[],
) {
  for (const [a, b, c] of triangles) {
    const t = rayTriangle(x, 0, z, dx, dy, dz, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (t !== null && t * horizontal <= RAY_LIMIT_FEET) return true;
  }
  return false;
}

/**
 * Open parcel samples tested against surrounding masses and elevated ramp decks.
 * A cell is shaded when the geometric ray toward the sun meets a mass or a ramp slab.
 * This is not hours of sun and not a seasonal average.
 */
export function parcelSunExposure(
  parcel: readonly XZ[],
  masses: readonly ExposureMass[],
  toSun: readonly [number, number, number],
  spacingFeet = 40,
  triangles: readonly ExposureTriangle[] = [],
): ParcelExposure | null {
  if (parcel.length < 3 || !(spacingFeet > 0)) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of parcel) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX)) return null;
  const span = Math.max(maxX - minX, maxZ - minZ);
  const spacing = span > 0 ? Math.max(spacingFeet, span / 14) : spacingFeet;
  const horizontal = Math.hypot(toSun[0], toSun[2]);
  const up = toSun[1];
  const overhead = horizontal < 1e-4 && up > 0;
  const dx = overhead ? 0 : toSun[0] / horizontal;
  const dz = overhead ? 0 : toSun[2] / horizontal;
  const slope = overhead ? Infinity : up / horizontal;
  const tallest = masses.reduce((best, mass) => Math.max(best, mass.heightFeet), 0);
  const reach = overhead || !(slope > 0) ? 0 : Math.min(2500, tallest / slope + spacing);
  const solids = masses.filter((mass) => mass.heightFeet > 0 && mass.ring.length >= 3);
  const rayLength = Math.hypot(toSun[0], toSun[1], toSun[2]) || 1;
  const rayX = toSun[0] / rayLength;
  const rayY = toSun[1] / rayLength;
  const rayZ = toSun[2] / rayLength;
  const rayHorizontal = Math.hypot(rayX, rayZ);
  const deckSolids = triangles;
  const cells: ExposureCell[] = [];
  for (let x = minX + spacing / 2; x < maxX; x += spacing) {
    for (let z = minZ + spacing / 2; z < maxZ; z += spacing) {
      if (!pointInRing(x, z, parcel)) continue;
      if (solids.some((mass) => pointInRing(x, z, mass.ring))) continue;
      let exposed = up > 0;
      if (exposed && !overhead) {
        for (const mass of solids) {
          const entry = firstEntry(x, z, dx, dz, mass.ring, reach);
          if (entry !== null && entry * slope < mass.heightFeet) {
            exposed = false;
            break;
          }
        }
        if (exposed && triangleBlocks(x, z, rayX, rayY, rayZ, rayHorizontal, deckSolids)) exposed = false;
      }
      if (up <= 0) exposed = false;
      cells.push({ x, z, exposed });
    }
  }
  if (cells.length === 0) return null;
  const exposed = cells.filter((cell) => cell.exposed).length;
  return {
    spacingFeet: spacing,
    cells,
    exposed,
    shaded: cells.length - exposed,
    bounds: { minX, maxX, minZ, maxZ },
  };
}
