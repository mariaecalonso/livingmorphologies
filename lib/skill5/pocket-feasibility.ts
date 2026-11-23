import { CLUSTER_FOOTPRINTS, SMALLEST_CLEARANCE_FT, type ClusterFootprint } from "./cluster-footprints";
import type { NetworkBranch, NetworkPocket } from "./pockets";
import { polygonAreaSqFt, type ZonePoint } from "./zoning";

export type PocketFit = "plausible" | "marginal" | "unsuitable" | "remainder";
export type SuggestionKind = "lobby" | "gathering" | "workspace";

/** A source on a surviving branch. Matches the network snap, spacing × 1.6. */
export const PARTICIPATE_FT = 24;
/** An attractor this close to the boundary can suggest its program. */
export const PROGRAM_FT = 40;
/** A participating source this close is a lobby threshold. */
export const THRESHOLD_FT = 30;
const REMAINDER_AREA = 80_000;
const STEP_FT = 4;
const ANGLES = Array.from({ length: 24 }, (_, index) => (index * Math.PI) / 12);

export type PocketAssessment = {
  id: string;
  fit: PocketFit;
  /** Validated plans whose outer footprint lies inside this face. */
  footprints: number;
  suggestions: SuggestionKind[];
  /** A room can hold a footprint. A threshold is only the arrival edge. */
  lobby: "room" | "threshold" | null;
};

type PlanNode = { kind: "source" | "attractor"; x: number; z: number; note?: string | null };

const prepared = CLUSTER_FOOTPRINTS.map((footprint) => {
  let diameter = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of footprint.hull) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    for (const [ox, oz] of footprint.hull) diameter = Math.max(diameter, Math.hypot(x - ox, z - oz));
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return { footprint, diameter, hull: footprint.hull.map(([x, z]) => ({ x: x - cx, z: z - cz })) };
});

function inside(x: number, z: number, ring: readonly ZonePoint[]) {
  let count = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const from = ring[previous];
    const to = ring[index];
    if ((from.z > z) === (to.z > z)) continue;
    const cross = ((to.x - from.x) * (z - from.z)) / (to.z - from.z || 1e-9) + from.x;
    if (x < cross) count = !count;
  }
  return count;
}

function crosses(a: ZonePoint, b: ZonePoint, c: ZonePoint, d: ZonePoint) {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-8) return false;
  const qx = c.x - a.x;
  const qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * rz - qz * rx) / denom;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

function insideConvex(x: number, z: number, ring: readonly ZonePoint[]) {
  let sign = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    const cross = (to.x - from.x) * (z - from.z) - (to.z - from.z) * (x - from.x);
    if (Math.abs(cross) < 1e-6) continue;
    const next = Math.sign(cross);
    if (sign !== 0 && next !== sign) return false;
    sign = next;
  }
  return true;
}

function hullFits(pocket: readonly ZonePoint[], hull: readonly ZonePoint[], angle: number, ox: number, oz: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const placed = hull.map((point) => ({ x: ox + point.x * c - point.z * s, z: oz + point.x * s + point.z * c }));
  for (const point of placed) if (!inside(point.x, point.z, pocket)) return false;
  for (const point of pocket) if (insideConvex(point.x, point.z, placed)) return false;
  for (let index = 0; index < placed.length; index += 1) {
    const a = placed[index];
    const b = placed[(index + 1) % placed.length];
    for (let other = 0; other < pocket.length; other += 1) {
      if (crosses(a, b, pocket[other], pocket[(other + 1) % pocket.length])) return false;
    }
  }
  return true;
}

function footprintFits(pocket: readonly ZonePoint[], samples: readonly ZonePoint[], hull: readonly ZonePoint[], diameter: number, clearance: number) {
  if (clearance * 2 >= diameter) return true;
  for (const angle of ANGLES) {
    for (const sample of samples) {
      if (hullFits(pocket, hull, angle, sample.x, sample.z)) return true;
    }
  }
  return false;
}

function squareFits(pocket: readonly ZonePoint[], samples: readonly ZonePoint[], side: number) {
  const half = side / 2;
  const hull = [
    { x: -half, z: -half },
    { x: half, z: -half },
    { x: half, z: half },
    { x: -half, z: half },
  ];
  return footprintFits(pocket, samples, hull, side * Math.SQRT2, 0);
}

function clearanceOf(ring: readonly ZonePoint[]) {
  let best = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const samples: { x: number; z: number; clear: number }[] = [];
  for (let x = minX; x <= maxX; x += STEP_FT) {
    for (let z = minZ; z <= maxZ; z += STEP_FT) {
      if (!inside(x, z, ring)) continue;
      let clear = Infinity;
      for (let index = 0; index < ring.length; index += 1) {
        const from = ring[index];
        const to = ring[(index + 1) % ring.length];
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = dx * dx + dz * dz;
        const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length));
        clear = Math.min(clear, Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t)));
      }
      if (clear > best) best = clear;
      if (clear >= SMALLEST_CLEARANCE_FT / 2) samples.push({ x, z, clear });
    }
  }
  return { clearance: best, samples };
}

function segmentDistance(x: number, z: number, branch: NetworkBranch) {
  const dx = branch.x1 - branch.x0;
  const dz = branch.z1 - branch.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - branch.x0) * dx + (z - branch.z0) * dz) / length));
  return Math.hypot(x - (branch.x0 + dx * t), z - (branch.z0 + dz * t));
}

function boundaryDistance(x: number, z: number, ring: readonly ZonePoint[]) {
  if (inside(x, z, ring)) return 0;
  let best = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = dx * dx + dz * dz;
    const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length));
    best = Math.min(best, Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t)));
  }
  return best;
}

function participating(nodes: readonly PlanNode[], branches: readonly NetworkBranch[]) {
  return nodes.filter((node) => {
    if (node.kind !== "source") return false;
    return branches.some((branch) => segmentDistance(node.x, node.z, branch) <= PARTICIPATE_FT);
  });
}

function roleOf(note: string | null | undefined): SuggestionKind | null {
  if (!note) return null;
  if (note.startsWith("Gathering")) return "gathering";
  if (note.startsWith("Workspace")) return "workspace";
  return null;
}

function spans(points: readonly ZonePoint[]) {
  let east = 0;
  let north = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  east = maxX - minX;
  north = maxZ - minZ;
  return { east, north };
}

function countFits(pocket: NetworkPocket, area: number) {
  if (area < SMALLEST_CLEARANCE_FT * SMALLEST_CLEARANCE_FT) return { footprints: 0, square: false };
  const field = clearanceOf(pocket.points);
  const points = field.samples.map((sample) => ({ x: sample.x, z: sample.z, clear: sample.clear }));
  let footprints = 0;
  for (const item of prepared) {
    if (area < polygonAreaSqFt(item.hull)) continue;
    if (field.clearance * 2 < item.footprint.minWidthFt) continue;
    const room = points.filter((sample) => sample.clear * 2 >= item.footprint.minWidthFt);
    const stride = Math.max(1, Math.ceil(room.length / 480));
    const placed = stride === 1 ? room : room.filter((_, index) => index % stride === 0);
    if (footprintFits(pocket.points, placed, item.hull, item.diameter, field.clearance)) footprints += 1;
  }
  const square = footprints > 0 || squareFits(pocket.points, points, SMALLEST_CLEARANCE_FT);
  return { footprints, square };
}

/**
 * Classifies every enclosed face. A plausible face contains at least one
 * validated plan. Area and a sampled width do not count as a fit.
 */
export function assessPockets(pockets: readonly NetworkPocket[], nodes: readonly PlanNode[], branches: readonly NetworkBranch[]): PocketAssessment[] {
  const sources = participating(nodes, branches);
  const attractors = nodes.filter((node) => node.kind === "attractor" && roleOf(node.note));
  return pockets.map((pocket) => {
    const area = polygonAreaSqFt(pocket.points);
    const span = spans(pocket.points);
    const remainder = area >= REMAINDER_AREA || (span.east >= 200 && span.north >= 200);
    const counted = countFits(pocket, area);
    const fit: PocketFit = remainder ? "remainder" : counted.footprints > 0 ? "plausible" : counted.square ? "marginal" : "unsuitable";
    const placeable = fit === "plausible" || fit === "marginal";
    const suggestions = new Set<SuggestionKind>();
    if (placeable) {
      for (const attractor of attractors) {
        const role = roleOf(attractor.note);
        if (!role) continue;
        if (boundaryDistance(attractor.x, attractor.z, pocket.points) <= PROGRAM_FT) suggestions.add(role);
      }
    }
    const threshold = sources.some((source) => boundaryDistance(source.x, source.z, pocket.points) <= THRESHOLD_FT);
    let lobby: PocketAssessment["lobby"] = null;
    if (threshold && placeable) {
      suggestions.add("lobby");
      lobby = "room";
    } else if (threshold) lobby = "threshold";
    const order: SuggestionKind[] = ["lobby", "gathering", "workspace"];
    return { id: pocket.id, fit, footprints: counted.footprints, suggestions: order.filter((kind) => suggestions.has(kind)), lobby };
  });
}

export function suggestionLabel(assessment: PocketAssessment) {
  if (assessment.lobby === "threshold") return "Threshold";
  return assessment.suggestions.map((kind) => (kind === "lobby" ? "Lobby" : kind === "gathering" ? "Gathering" : "Workspace")).join(", ");
}

export function fitLabel(fit: PocketFit) {
  if (fit === "plausible") return "Plausible";
  if (fit === "marginal") return "Marginal";
  if (fit === "remainder") return "Remainder";
  return "Unsuitable";
}

export function footprintCount(footprints: readonly ClusterFootprint[] = CLUSTER_FOOTPRINTS) {
  return footprints.length;
}
