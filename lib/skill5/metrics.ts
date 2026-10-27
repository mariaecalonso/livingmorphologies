import type { SiteAssembly } from "./assembly";
import { assemblyWorldModules } from "./assembly";
import { SKILL5_MODULE_ENVELOPE_FEET, type Skill5Program } from "./contract";
import { footprintCorners, pointInRing, type PlacedModule } from "./placement";
import type { XZ } from "./site-model";

const HALF = SKILL5_MODULE_ENVELOPE_FEET / 2;

export type PlanPoint = { x: number; z: number };

/** Inverse of the footprint corner rotation. Positive contract yaw turns north toward west. */
export function planLocal(point: PlanPoint, origin: PlanPoint, rotationY: number): PlanPoint {
  const ry = -rotationY;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  };
}

export function boundsOfCorners(corners: readonly PlanPoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of corners) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, depth: 0 };
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

export function placedCorners(placed: PlacedModule) {
  return footprintCorners(placed.transform.position, placed.transform.rotationY);
}

/**
 * Nominal ground coverage inside the parcel.
 * Each module contributes its 20 ft square. Overlaps are counted once.
 * A cell is included when its center lies inside a footprint and inside the ring.
 * The shared edge belongs to the footprint on the positive local side, so two
 * squares that only touch do not share a cell.
 */
export function nominalUnionSqFt(placed: readonly PlacedModule[], ring: readonly XZ[], cell = 1) {
  const occupied = new Set<string>();
  for (const item of placed) {
    const corners = placedCorners(item);
    const bounds = boundsOfCorners(corners);
    const x0 = Math.floor(bounds.minX / cell);
    const x1 = Math.ceil(bounds.maxX / cell);
    const z0 = Math.floor(bounds.minZ / cell);
    const z1 = Math.ceil(bounds.maxZ / cell);
    for (let ix = x0; ix < x1; ix += 1) {
      for (let iz = z0; iz < z1; iz += 1) {
        const x = (ix + 0.5) * cell;
        const z = (iz + 0.5) * cell;
        const local = planLocal({ x, z }, item.transform.position, item.transform.rotationY);
        const inside = local.x > -HALF && local.x <= HALF && local.z > -HALF && local.z <= HALF;
        if (!inside || !pointInRing(x, z, ring)) continue;
        occupied.add(`${ix}:${iz}`);
      }
    }
  }
  return occupied.size * cell * cell;
}

export function nominalEnvelopeSqFt(count: number) {
  return count * SKILL5_MODULE_ENVELOPE_FEET * SKILL5_MODULE_ENVELOPE_FEET;
}

const EMPTY_PROGRAM: Record<Skill5Program, number> = {
  workspace: 0,
  lobby: 0,
  gathering: 0,
  unassigned: 0,
};

export function programDistribution(placed: readonly { program: Skill5Program }[]) {
  const counts = { ...EMPTY_PROGRAM };
  for (const item of placed) counts[item.program] += 1;
  return counts;
}

export function scenePlaced(modules: readonly PlacedModule[], assemblies: readonly SiteAssembly[]) {
  return [...modules, ...assemblies.flatMap((assembly) => assemblyWorldModules(assembly))];
}
