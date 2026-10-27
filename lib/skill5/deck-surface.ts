import type { SiteRoad, XZ } from "./site-model";

const SAME_NAME_REACH_FEET = 200;
const HIGHWAY_REACH_FEET = 600;
const RAMP_STREET_REACH_FEET = 90;
const CROSSING_REACH_FEET = 70;
const FACING_DOT = 0.75;
const STRICT_DOT = 0.9;
const CROSS_DOT = 0.85;

type RoadEnd = {
  id: number;
  road: SiteRoad;
  point: XZ;
  outward: XZ;
  half: number;
  height: number | null;
};

function along(path: readonly XZ[], from: number, to: number) {
  let span = 0;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  for (let index = start; index < end; index += 1) {
    span += Math.hypot(path[index + 1][0] - path[index][0], path[index + 1][1] - path[index][1]);
  }
  return span;
}

function direction(from: XZ, to: XZ): XZ {
  const dx = from[0] - to[0];
  const dz = from[1] - to[1];
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

/** Missing deck samples take the grade between the measured samples on the same road. */
export function continuousDeck(road: SiteRoad): SiteRoad {
  if (!road.elevated || !road.deckFeet || road.deckFeet.every((height) => typeof height !== "number")) return road;
  const known = road.deckFeet.flatMap((height, index) => (typeof height === "number" ? [index] : []));
  if (known.length === 0) return road;
  const deckFeet = road.path.map((_, index) => {
    const measured = road.deckFeet?.[index];
    if (typeof measured === "number") return measured;
    const previous = known.filter((item) => item < index).at(-1);
    const next = known.find((item) => item > index);
    if (previous == null) return road.deckFeet?.[next ?? index] as number;
    if (next == null) return road.deckFeet?.[previous] as number;
    const span = along(road.path, previous, next) || 1;
    const mix = along(road.path, previous, index) / span;
    const start = road.deckFeet?.[previous] as number;
    const end = road.deckFeet?.[next] as number;
    return start * (1 - mix) + end * mix;
  });
  return { ...road, deckFeet };
}

function drawnPoint(road: SiteRoad, index: number): XZ {
  const [x, z] = road.path[index];
  const shift = road.centerShiftFeet?.[index];
  if (typeof shift !== "number") return [x, z];
  const other = index === 0 ? 1 : index - 1;
  const dx = x - road.path[other][0];
  const dz = z - road.path[other][1];
  const length = Math.hypot(dx, dz) || 1;
  return [x - (dz / length) * shift, z + (dx / length) * shift];
}

function endsOf(roads: readonly SiteRoad[]): RoadEnd[] {
  const ends: RoadEnd[] = [];
  roads.forEach((road) => {
    if (road.path.length < 2) return;
    [0, road.path.length - 1].forEach((index) => {
      const other = index === 0 ? 1 : road.path.length - 2;
      const measured = road.halfWidthFeet?.[index];
      const height = road.deckFeet?.[index];
      ends.push({
        id: ends.length,
        road,
        point: drawnPoint(road, index),
        outward: direction(road.path[index], road.path[other]),
        half: typeof measured === "number" ? measured : road.displayHalfWidthFeet,
        height: typeof height === "number" ? height : null,
      });
    });
  });
  return ends;
}

function highway(road: SiteRoad) {
  return road.kind === "ramp" || road.kind === "expressway" || road.kind === "causeway";
}

function pairReach(left: RoadEnd, right: RoadEnd) {
  if (left.road === right.road) return 0;
  const sameName = left.road.name === right.road.name && left.road.name !== "Unnamed";
  if (sameName && highway(left.road) && highway(right.road)) return HIGHWAY_REACH_FEET;
  if (sameName) return SAME_NAME_REACH_FEET;
  if (highway(left.road) && highway(right.road)) return HIGHWAY_REACH_FEET;
  const rampToStreet = (left.road.kind === "ramp" && !right.road.elevated) || (right.road.kind === "ramp" && !left.road.elevated);
  if (rampToStreet) return RAMP_STREET_REACH_FEET;
  return 0;
}

function facing(left: RoadEnd, right: RoadEnd) {
  const reach = pairReach(left, right);
  if (reach === 0) return null;
  const dx = right.point[0] - left.point[0];
  const dz = right.point[1] - left.point[1];
  const distance = Math.hypot(dx, dz);
  if (distance < 8 || distance > reach) return null;
  const ahead = (dx * left.outward[0] + dz * left.outward[1]) / distance;
  const back = (-dx * right.outward[0] + -dz * right.outward[1]) / distance;
  if (ahead < FACING_DOT || back < FACING_DOT) return null;
  if (distance > 120 && (ahead < STRICT_DOT || back < STRICT_DOT)) return null;
  if (distance > 250 && (ahead < 0.95 || back < 0.95)) return null;
  return distance;
}

function linkBetween(left: RoadEnd, right: RoadEnd, target = right.point): SiteRoad {
  const elevated = Boolean(left.road.elevated || right.road.elevated);
  const leftHeight = left.height;
  const rightHeight = right.road.elevated ? right.height : 0.2;
  const deckFeet = elevated
    ? [leftHeight ?? rightHeight ?? 0.4, rightHeight ?? leftHeight ?? 0.4]
    : undefined;
  return {
    name: left.road.name,
    kind: left.road.kind,
    displayHalfWidthFeet: Math.min(left.half, right.half),
    elevated,
    ...(deckFeet ? { deckFeet } : {}),
    path: [left.point, target],
  };
}

/**
 * Closes gaps that keep the same street, ramp, or highway from reading as one road.
 * A local street is not joined to an elevated highway. Parallel carriageways stay apart.
 */
export function networkLinks(roads: readonly SiteRoad[]): SiteRoad[] {
  const prepared = roads.map(continuousDeck);
  const ends = endsOf(prepared);
  const pairs: Array<{ distance: number; left: number; right: number }> = [];
  for (let left = 0; left < ends.length; left += 1) {
    for (let right = left + 1; right < ends.length; right += 1) {
      const distance = facing(ends[left], ends[right]);
      if (distance == null) continue;
      pairs.push({ distance, left, right });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  const used = new Set<number>();
  const links: SiteRoad[] = [];
  for (const pair of pairs) {
    if (used.has(pair.left) || used.has(pair.right)) continue;
    used.add(pair.left);
    used.add(pair.right);
    links.push(linkBetween(ends[pair.left], ends[pair.right]));
  }
  for (const end of ends) {
    if (used.has(end.id)) continue;
    if (end.road.elevated && end.road.kind !== "ramp") continue;
    let best: { distance: number; point: XZ; road: SiteRoad } | null = null;
    for (const road of prepared) {
      if (road === end.road || road.path.length < 2) continue;
      if (end.road.kind === "ramp" && road.elevated && !highway(road)) continue;
      if (end.road.kind !== "ramp" && road.elevated) continue;
      for (let index = 1; index < road.path.length; index += 1) {
        const start = road.path[index - 1];
        const finish = road.path[index];
        const abx = finish[0] - start[0];
        const abz = finish[1] - start[1];
        const span = abx * abx + abz * abz || 1;
        const t = ((end.point[0] - start[0]) * abx + (end.point[1] - start[1]) * abz) / span;
        if (t <= 0.04 || t >= 0.96) continue;
        const point: XZ = [start[0] + abx * t, start[1] + abz * t];
        const dx = point[0] - end.point[0];
        const dz = point[1] - end.point[1];
        const distance = Math.hypot(dx, dz);
        if (distance < 8 || distance > CROSSING_REACH_FEET) continue;
        if ((dx * end.outward[0] + dz * end.outward[1]) / distance < CROSS_DOT) continue;
        if (!best || distance < best.distance) best = { distance, point, road };
      }
    }
    if (!best) continue;
    used.add(end.id);
    const targetEnd: RoadEnd = {
      id: -1,
      road: best.road,
      point: best.point,
      outward: [0, 0],
      half: best.road.displayHalfWidthFeet,
      height: best.road.elevated ? (best.road.deckFeet?.find((height) => typeof height === "number") ?? null) : null,
    };
    links.push(linkBetween(end, targetEnd, best.point));
  }
  return links;
}

/** Elevated roads stay one ribbon. A missing lidar sample follows the grade of the measured deck. */
export function elevatedDeckRoads(roads: readonly SiteRoad[]): SiteRoad[] {
  return roads.filter((road) => road.elevated).map(continuousDeck);
}
