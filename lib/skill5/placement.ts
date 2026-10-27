import { SKILL5_MODULE_ENVELOPE_FEET, type Skill5GeometryState, type Skill5Instance, type Skill5Program, type Skill5ProgramSource } from "./contract";
import { SITE_GRID_FEET } from "./grid";
import type { XZ } from "./site-model";

/** Matches the raised site pad in the viewport. Instances stay on this plane. */
export const MODULE_GROUND_Y = 0.7;

export const MODULE_FOOTPRINT_FEET = SKILL5_MODULE_ENVELOPE_FEET;

/** A module occupies two grid squares on each side, so placement steps by 20 ft. */
export const MODULE_GRID_SPAN = 2;

export function snapModuleOrigin(x: number, z: number) {
  const step = SITE_GRID_FEET * MODULE_GRID_SPAN;
  const half = step / 2;
  const snap = (value: number) => Math.round((value - half) / step) * step + half;
  return { x: snap(x), z: snap(z) };
}

/** How close a bounding-box vertex must be before it catches another module's vertex. */
export const MODULE_SNAP_REACH_FEET = 5;

export type PlanExtent = { minX: number; maxX: number; minZ: number; maxZ: number };

export const NOMINAL_PLAN_EXTENT: PlanExtent = {
  minX: -MODULE_FOOTPRINT_FEET / 2,
  maxX: MODULE_FOOTPRINT_FEET / 2,
  minZ: -MODULE_FOOTPRINT_FEET / 2,
  maxZ: MODULE_FOOTPRINT_FEET / 2,
};

/**
 * Plan extent of a module mesh. The viewport stores plan north in the mesh's Y slot,
 * so the drawn footprint uses source X and source Y.
 */
export function modulePlanExtent(positions: ArrayLike<number> | null | undefined): PlanExtent {
  if (!positions || positions.length < 3) return NOMINAL_PLAN_EXTENT;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const z = positions[index + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return NOMINAL_PLAN_EXTENT;
  return { minX, maxX, minZ, maxZ };
}

export type PlacedModule = Skill5Instance & {
  name: string;
  status: "Validated" | "Review" | "Unavailable";
  geometryState: Skill5GeometryState;
  program: Skill5Program;
  programSource: Skill5ProgramSource;
  assemblyPlacementId?: string;
  mirror?: "x" | "y" | "z" | null;
};

export type ModuleWarning = {
  outside: boolean;
  overlap: boolean;
};

type PlanPoint = { x: number; z: number };

/** Even-odd test. Ring coordinates are east, north. */
export function pointInRing(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Corners of the nominal 20 × 20 ft footprint.
 * Yaw is the stored contract angle: positive turns north toward west.
 * The mesh group uses the opposite Three.js yaw, so these corners match the drawn box.
 */
export function extentCorners(extent: PlanExtent, position: PlanPoint, rotationY: number, mirror?: "x" | "y" | "z" | null): PlanPoint[] {
  let minX = extent.minX;
  let maxX = extent.maxX;
  let minZ = extent.minZ;
  let maxZ = extent.maxZ;
  if (mirror === "x") {
    minX = -extent.maxX;
    maxX = -extent.minX;
  }
  if (mirror === "z") {
    minZ = -extent.maxZ;
    maxZ = -extent.minZ;
  }
  const ry = -rotationY;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const local: Array<[number, number]> = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  return local.map(([east, north]) => ({
    x: position.x + east * cos + north * sin,
    z: position.z - east * sin + north * cos,
  }));
}

/**
 * Plan box used for snapping. It covers the drawn 20 ft envelope and, where the
 * mesh reaches past that square, the mesh as well. A tight mesh box alone lets
 * the envelope squares overlap.
 */
export function collisionExtent(mesh: PlanExtent): PlanExtent {
  return {
    minX: Math.min(mesh.minX, NOMINAL_PLAN_EXTENT.minX),
    maxX: Math.max(mesh.maxX, NOMINAL_PLAN_EXTENT.maxX),
    minZ: Math.min(mesh.minZ, NOMINAL_PLAN_EXTENT.minZ),
    maxZ: Math.max(mesh.maxZ, NOMINAL_PLAN_EXTENT.maxZ),
  };
}

export function footprintCorners(position: PlanPoint, rotationY: number): PlanPoint[] {
  return extentCorners(NOMINAL_PLAN_EXTENT, position, rotationY);
}

export function boundsOf(corners: readonly PlanPoint[]): PlanExtent {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of corners) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function shiftBounds(box: PlanExtent, dx: number, dz: number): PlanExtent {
  return { minX: box.minX + dx, maxX: box.maxX + dx, minZ: box.minZ + dz, maxZ: box.maxZ + dz };
}

/** Touching edges are allowed. A shared interior is not. */
export function boundsOverlap(first: PlanExtent, second: PlanExtent) {
  return first.minX < second.maxX - 0.05
    && first.maxX > second.minX + 0.05
    && first.minZ < second.maxZ - 0.05
    && first.maxZ > second.minZ + 0.05;
}

function groupOverlaps(movers: readonly PlanExtent[], still: readonly PlanExtent[], dx: number, dz: number) {
  return movers.some((box) => still.some((other) => boundsOverlap(shiftBounds(box, dx, dz), other)));
}

function spansMeet(first: PlanExtent, second: PlanExtent, axis: "x" | "z") {
  if (axis === "x") {
    const gap = Math.max(first.minX, second.minX) - Math.min(first.maxX, second.maxX);
    const share = Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ);
    return gap <= 0.05 && gap >= -0.05 && share > 0.05;
  }
  const gap = Math.max(first.minZ, second.minZ) - Math.min(first.maxZ, second.maxZ);
  const share = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
  return gap <= 0.05 && gap >= -0.05 && share > 0.05;
}

function separateGroup(movers: readonly PlanExtent[], still: readonly PlanExtent[]) {
  let dx = 0;
  let dz = 0;
  for (let pass = 0; pass < 48; pass += 1) {
    let worst: { overlapX: number; overlapZ: number; centerX: number; centerZ: number; pen: number } | null = null;
    for (const source of movers) {
      const box = shiftBounds(source, dx, dz);
      for (const other of still) {
        const overlapX = Math.min(box.maxX, other.maxX) - Math.max(box.minX, other.minX);
        const overlapZ = Math.min(box.maxZ, other.maxZ) - Math.max(box.minZ, other.minZ);
        if (overlapX <= 0.05 || overlapZ <= 0.05) continue;
        const pen = Math.min(overlapX, overlapZ);
        if (!worst || pen > worst.pen) {
          worst = {
            overlapX,
            overlapZ,
            centerX: box.minX + box.maxX - (other.minX + other.maxX),
            centerZ: box.minZ + box.maxZ - (other.minZ + other.maxZ),
            pen,
          };
        }
      }
    }
    if (!worst) return { dx, dz };
    if (worst.overlapX < worst.overlapZ) dx += worst.centerX >= 0 ? worst.overlapX : -worst.overlapX;
    else dz += worst.centerZ >= 0 ? worst.overlapZ : -worst.overlapZ;
  }
  let best = { dx, dz, cost: Number.POSITIVE_INFINITY };
  const anchor = movers[0];
  if (!anchor) return { dx, dz };
  const consider = (stepX: number, stepZ: number) => {
    if (groupOverlaps(movers, still, stepX, stepZ)) return;
    const cost = Math.hypot(stepX, stepZ);
    if (cost < best.cost) best = { dx: stepX, dz: stepZ, cost };
  };
  for (const other of still) {
    const sides = [
      other.maxX - anchor.minX,
      other.minX - anchor.maxX,
    ];
    const ends = [
      other.maxZ - anchor.minZ,
      other.minZ - anchor.maxZ,
    ];
    for (const stepX of sides) consider(stepX, 0);
    for (const stepZ of ends) consider(0, stepZ);
    for (const stepX of sides) {
      for (const stepZ of ends) consider(stepX, stepZ);
    }
  }
  return best.cost < Number.POSITIVE_INFINITY ? best : { dx, dz };
}

/**
 * Move a dragged module onto the 2-by-2 grid, so each 20 ft envelope covers two
 * grid squares on each side and neighboring modules share an edge. The result
 * does not overlap.
 */
export function settleMove(
  movers: readonly PlanExtent[],
  anchor: PlanExtent,
  still: readonly PlanExtent[],
  grid: { dx: number; dz: number } | null,
  magnet = true,
) {
  const vertices: { dx: number; dz: number; cost: number }[] = [];
  const edges: { dx: number; dz: number; cost: number }[] = [];
  const keep = (dx: number, dz: number) => {
    const cost = Math.hypot(dx, dz);
    if (cost > MODULE_SNAP_REACH_FEET) return null;
    if (groupOverlaps(movers, still, dx, dz)) return null;
    return { dx, dz, cost };
  };
  if (magnet) {
    const anchorX = [anchor.minX, anchor.maxX];
    const anchorZ = [anchor.minZ, anchor.maxZ];
    for (const other of still) {
      const otherX = [other.minX, other.maxX];
      const otherZ = [other.minZ, other.maxZ];
      for (const left of anchorX) {
        for (const right of otherX) {
          const dx = right - left;
          for (const south of anchorZ) {
            for (const north of otherZ) {
              const step = keep(dx, north - south);
              if (step) vertices.push(step);
            }
          }
          const alongX = keep(dx, 0);
          if (alongX && spansMeet(shiftBounds(anchor, dx, 0), other, "x")) edges.push(alongX);
        }
      }
      for (const south of anchorZ) {
        for (const north of otherZ) {
          const dz = north - south;
          const alongZ = keep(0, dz);
          if (alongZ && spansMeet(shiftBounds(anchor, 0, dz), other, "z")) edges.push(alongZ);
        }
      }
    }
  }
  if (grid) {
    const step = SITE_GRID_FEET * MODULE_GRID_SPAN;
    let best: { dx: number; dz: number; cost: number } | null = null;
    for (let column = -4; column <= 4; column += 1) {
      for (let row = -4; row <= 4; row += 1) {
        const dx = grid.dx + column * step;
        const dz = grid.dz + row * step;
        if (groupOverlaps(movers, still, dx, dz)) continue;
        const cost = Math.hypot(dx, dz);
        if (!best || cost < best.cost) best = { dx, dz, cost };
      }
    }
    if (best) return best;
  }
  vertices.sort((left, right) => left.cost - right.cost);
  if (vertices[0]) return vertices[0];
  edges.sort((left, right) => left.cost - right.cost);
  if (edges[0]) return edges[0];
  if (!groupOverlaps(movers, still, 0, 0)) return { dx: 0, dz: 0 };
  return separateGroup(movers, still);
}

function separated(first: PlanPoint[], second: PlanPoint[]) {
  const polys = [first, second];
  for (const poly of polys) {
    for (let index = 0; index < poly.length; index += 1) {
      const start = poly[index];
      const end = poly[(index + 1) % poly.length];
      const axisX = -(end.z - start.z);
      const axisZ = end.x - start.x;
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const point of first) {
        const projected = point.x * axisX + point.z * axisZ;
        aMin = Math.min(aMin, projected);
        aMax = Math.max(aMax, projected);
      }
      for (const point of second) {
        const projected = point.x * axisX + point.z * axisZ;
        bMin = Math.min(bMin, projected);
        bMax = Math.max(bMax, projected);
      }
      if (aMax <= bMin + 0.25 || bMax <= aMin + 0.25) return true;
    }
  }
  return false;
}

export function placementWarnings(instances: readonly PlacedModule[], ring: readonly XZ[]) {
  const corners = new Map<string, PlanPoint[]>();
  for (const instance of instances) {
    corners.set(instance.instanceId, footprintCorners(instance.transform.position, instance.transform.rotationY));
  }
  const warnings: Record<string, ModuleWarning> = {};
  for (const instance of instances) {
    const own = corners.get(instance.instanceId) ?? [];
    const outside = own.some((point) => !pointInRing(point.x, point.z, ring));
    let overlap = false;
    for (const other of instances) {
      if (other.instanceId === instance.instanceId) continue;
      const theirs = corners.get(other.instanceId) ?? [];
      if (!separated(own, theirs)) {
        overlap = true;
        break;
      }
    }
    warnings[instance.instanceId] = { outside, overlap };
  }
  return warnings;
}
