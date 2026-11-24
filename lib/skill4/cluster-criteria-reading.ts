import type { Rating } from "@/lib/types";
import { CLIENT_ACTIVITY_SEED, type ClientCompatibilityDocument } from "../skill5/client-compatibility";
import type { TileConnection } from "./connections";
import type { FinishedIteration } from "./finished-catalog";
import { envelopeWidth, type TileInstance } from "./tiles";

const LEVEL = ["Low", "Medium", "High"] as const;

const LABELS: Record<string, string> = {
  complexity: "Complexity",
  proportionality: "Proportionality",
  openness: "Openness",
  connectivity: "Connectivity",
  immersive: "Immersive",
  visibility: "Visibility",
  centrality: "Centrality",
  directionality: "Directionality",
  receptivity: "Receptivity",
  "plate-articulation": "Plate articulation",
  modularity: "Modularity",
  collaboration: "Collaboration",
  "circulation-integration": "Circulation integration",
  "spatial-permanence": "Spatial permanence",
  "social-proximity": "Social proximity",
};

export type CriterionRelation = "meets" | "below" | "above" | "unmeasured";

export type SpacePoint = { x: number; y: number; z: number };

/** A piece of the measured cluster. The drawing uses these coordinates and nothing else. */
export type SpatialMark =
  | { kind: "box"; min: SpacePoint; max: SpacePoint; alpha: number }
  | { kind: "bar"; a: SpacePoint; b: SpacePoint; thickness: number; alpha: number }
  | { kind: "slab"; y: number; height: number; polygon: SpacePoint[]; alpha: number };

export type CriterionReading = {
  id: string;
  label: string;
  desired: Rating;
  measured: Rating | null;
  relation: CriterionRelation;
  value: number | null;
  unit: string;
  basis: string;
  marks: SpatialMark[];
  labelAt: SpacePoint;
};

export type ClusterReading = {
  criteria: CriterionReading[];
};

function band(value: number, mediumAt: number, highAt: number): Rating {
  if (value < mediumAt) return 0;
  if (value < highAt) return 1;
  return 2;
}

function relation(measured: Rating | null, desired: Rating): CriterionRelation {
  if (measured === null) return "unmeasured";
  if (measured === desired) return "meets";
  return measured < desired ? "below" : "above";
}

function range(values: number[]) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function point(tile: TileInstance): SpacePoint {
  return { x: tile.transform.x, y: tile.transform.y, z: tile.transform.z };
}

function mid(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function boxAround(at: SpacePoint, size: number): SpatialMark {
  const half = size / 2;
  return {
    kind: "box",
    alpha: 0.78,
    min: { x: at.x - half, y: at.y - half, z: at.z - half },
    max: { x: at.x + half, y: at.y + half, z: at.z + half },
  };
}

function convexHull(points: { x: number; z: number }[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = sorted.filter((point, index) => index === 0 || point.x !== sorted[index - 1]!.x || point.z !== sorted[index - 1]!.z);
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const build = (source: { x: number; z: number }[]) => {
    const hull: { x: number; z: number }[] = [];
    for (const item of source) {
      while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, item) <= 0) hull.pop();
      hull.push(item);
    }
    return hull;
  };
  if (unique.length < 3) return unique;
  const lower = build(unique);
  const upper = build([...unique].reverse());
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polygonArea(polygon: { x: number; z: number }[]) {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) / 2;
}

type Joint = { a: SpacePoint; b: SpacePoint; mid: SpacePoint; core: boolean; axis: "x" | "y" | "z" };
type Level = { y: number; tiles: TileInstance[] };

type Survey = {
  tiles: TileInstance[];
  module: number;
  center: SpacePoint;
  bounds: { min: SpacePoint; max: SpacePoint };
  width: number;
  depth: number;
  height: number;
  unique: number;
  counts: Map<string, number>;
  degree: Map<string, number>;
  branches: TileInstance[];
  ends: TileInstance[];
  central: TileInstance[];
  levels: Level[];
  joints: Joint[];
  spine: TileInstance[];
  neighbor: number;
  spread: number;
  voidBox: { min: SpacePoint; max: SpacePoint } | null;
  voidFloor: number;
  footprint: SpacePoint[];
  footprintArea: number;
  openDirections: SpacePoint[];
};

function longestSpine(tiles: TileInstance[], connections: TileConnection[]) {
  const graph = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = graph.get(from) ?? [];
    list.push(to);
    graph.set(from, list);
  };
  for (const connection of connections) {
    add(connection.tileAId, connection.tileBId);
    add(connection.tileBId, connection.tileAId);
  }
  const byId = new Map(tiles.map((tile) => [tile.instanceId, tile]));
  const walk = (start: string) => {
    const parent = new Map<string, string | null>([[start, null]]);
    const distance = new Map<string, number>([[start, 0]]);
    const queue = [start];
    let far = start;
    while (queue.length) {
      const id = queue.shift()!;
      if ((distance.get(id) ?? 0) > (distance.get(far) ?? 0)) far = id;
      for (const next of graph.get(id) ?? []) {
        if (parent.has(next)) continue;
        parent.set(next, id);
        distance.set(next, (distance.get(id) ?? 0) + 1);
        queue.push(next);
      }
    }
    return { far, parent };
  };
  if (tiles.length < 2) return tiles.slice();
  const first = walk(tiles[0]!.instanceId);
  const second = walk(first.far);
  const path: TileInstance[] = [];
  let cursor: string | null = second.far;
  while (cursor) {
    const tile = byId.get(cursor);
    if (tile) path.push(tile);
    cursor = second.parent.get(cursor) ?? null;
  }
  return path.reverse();
}

function survey(item: FinishedIteration): Survey | null {
  const tiles = item.tiles ?? [];
  if (!tiles.length) return null;
  const connections = item.connections ?? [];
  const module = envelopeWidth();
  const xs = tiles.map((tile) => tile.transform.x);
  const ys = tiles.map((tile) => tile.transform.y);
  const zs = tiles.map((tile) => tile.transform.z);
  const review = item.review;
  const spanX = range(xs);
  const spanY = range(ys);
  const spanZ = range(zs);
  const width = review?.clusterWidth || spanX + module;
  const depth = review?.clusterDepth || spanZ + module;
  const height = review?.clusterHeight || spanY + module;
  const minX = Math.min(...xs) - Math.max(0, (width - spanX) / 2);
  const maxX = Math.max(...xs) + Math.max(0, (width - spanX) / 2);
  const minY = Math.min(...ys) - Math.max(0, (height - spanY) / 2);
  const maxY = Math.max(...ys) + Math.max(0, (height - spanY) / 2);
  const minZ = Math.min(...zs) - Math.max(0, (depth - spanZ) / 2);
  const maxZ = Math.max(...zs) + Math.max(0, (depth - spanZ) / 2);
  const center = { x: average(xs), y: average(ys), z: average(zs) };
  const degree = new Map(tiles.map((tile) => [tile.instanceId, 0]));
  for (const connection of connections) {
    degree.set(connection.tileAId, (degree.get(connection.tileAId) ?? 0) + 1);
    degree.set(connection.tileBId, (degree.get(connection.tileBId) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile.archetypeId, (counts.get(tile.archetypeId) ?? 0) + 1);
  const sorted = [...tiles].sort((a, b) => a.transform.y - b.transform.y);
  const levels: Level[] = [];
  for (const tile of sorted) {
    const last = levels[levels.length - 1];
    if (!last || tile.transform.y - last.y > module * 0.55) levels.push({ y: tile.transform.y, tiles: [tile] });
    else last.tiles.push(tile);
  }
  const distances = tiles.map((tile) => Math.hypot(tile.transform.x - center.x, tile.transform.z - center.z));
  const inner = Math.max(...distances, 1) * 0.45;
  const joints: Joint[] = [];
  for (const connection of connections) {
    const a = tiles.find((tile) => tile.instanceId === connection.tileAId);
    const b = tiles.find((tile) => tile.instanceId === connection.tileBId);
    if (!a || !b) continue;
    const pa = point(a);
    const pb = point(b);
    const middle = mid(pa, pb);
    const dx = Math.abs(pa.x - pb.x);
    const dy = Math.abs(pa.y - pb.y);
    const dz = Math.abs(pa.z - pb.z);
    const dominant = Math.max(dx, dy, dz);
    const axis = dx === dominant ? "x" : dy === dominant ? "y" : "z";
    const core = Math.abs(middle.x - center.x) <= Math.max(spanX, 1) * 0.25 && Math.abs(middle.z - center.z) <= Math.max(spanZ, 1) * 0.25;
    joints.push({ a: pa, b: pb, mid: middle, core, axis });
  }
  const planSpan = Math.max(spanX, spanZ, 1);
  const spread = Math.min(1, average(distances) / (planSpan * 0.5));
  const voidAxes = (review?.voidWidth ?? 0) > 0 && (review?.voidDepth ?? 0) > 0 && (review?.voidHeight ?? 0) > 0;
  const voidBox = voidAxes ? {
    min: { x: center.x - review!.voidWidth / 2, y: minY, z: center.z - review!.voidDepth / 2 },
    max: { x: center.x + review!.voidWidth / 2, y: minY + review!.voidHeight, z: center.z + review!.voidDepth / 2 },
  } : null;
  const hull = convexHull(tiles.map((tile) => ({ x: tile.transform.x, z: tile.transform.z })));
  let footprint: SpacePoint[];
  if (hull.length >= 3) footprint = hull.map((item) => ({ x: item.x, y: minY, z: item.z }));
  else if (hull.length === 2) {
    const dx = hull[1]!.x - hull[0]!.x;
    const dz = hull[1]!.z - hull[0]!.z;
    const length = Math.hypot(dx, dz) || 1;
    const px = (-dz / length) * module * 0.5;
    const pz = (dx / length) * module * 0.5;
    const a = hull[0]!;
    const b = hull[1]!;
    footprint = [
      { x: a.x + px, y: minY, z: a.z + pz },
      { x: a.x - px, y: minY, z: a.z - pz },
      { x: b.x - px, y: minY, z: b.z - pz },
      { x: b.x + px, y: minY, z: b.z + pz },
    ];
  } else {
    const only = hull[0] ?? { x: center.x, z: center.z };
    const half = module * 0.5;
    footprint = [
      { x: only.x - half, y: minY, z: only.z - half },
      { x: only.x + half, y: minY, z: only.z - half },
      { x: only.x + half, y: minY, z: only.z + half },
      { x: only.x - half, y: minY, z: only.z + half },
    ];
  }
  const occupiedDirections = new Set<number>();
  for (const tile of tiles) {
    const dx = tile.transform.x - center.x;
    const dz = tile.transform.z - center.z;
    if (Math.hypot(dx, dz) < 1) continue;
    const angle = Math.atan2(dz, dx);
    occupiedDirections.add(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 8) % 8);
  }
  const reach = Math.max(...distances, module);
  const openDirections = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((sector) => {
    if (occupiedDirections.has(sector)) return [];
    const angle = ((sector + 0.5) / 8) * Math.PI * 2 - Math.PI;
    return [{ x: center.x + Math.cos(angle) * reach, y: minY + module * 0.2, z: center.z + Math.sin(angle) * reach }];
  });
  let neighbor = 0;
  if (tiles.length > 1) {
    neighbor = average(tiles.map((tile) => {
      let nearest = Infinity;
      for (const other of tiles) {
        if (other.instanceId === tile.instanceId) continue;
        const distance = Math.hypot(tile.transform.x - other.transform.x, tile.transform.y - other.transform.y, tile.transform.z - other.transform.z);
        if (distance < nearest) nearest = distance;
      }
      return nearest;
    }));
  }
  return {
    tiles,
    module,
    center,
    bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    width,
    depth,
    height,
    unique: counts.size,
    counts,
    degree,
    branches: tiles.filter((tile) => (degree.get(tile.instanceId) ?? 0) >= 3),
    ends: tiles.filter((tile) => (degree.get(tile.instanceId) ?? 0) <= 1),
    central: tiles.filter((_, index) => distances[index]! <= inner),
    levels: review?.verticalLevels ? levels.slice(0, Math.max(levels.length, 0)) : levels,
    joints,
    spine: longestSpine(tiles, connections),
    neighbor,
    spread: review?.planSpread ?? spread,
    voidBox,
    voidFloor: item.habitableArea,
    footprint,
    footprintArea: Math.max(polygonArea(footprint), module * module),
    openDirections,
  };
}

function storedLevels(item: FinishedIteration, found: number) {
  return item.review?.verticalLevels && item.review.verticalLevels > 0 ? item.review.verticalLevels : found;
}

type Rated = { value: number | null; unit: string; basis: string; measured: Rating | null; marks: SpatialMark[] };

function rate(id: string, item: FinishedIteration, space: Survey): Rated {
  const { width, depth, height, module, center } = space;
  const plan = Math.max(width * depth, 1);
  const longPlan = Math.max(width, depth);
  const shortPlan = Math.max(1, Math.min(width, depth));
  const floorY = space.bounds.min.y;
  const voidLong = space.voidBox ? Math.max(space.voidBox.max.x - space.voidBox.min.x, space.voidBox.max.z - space.voidBox.min.z) : 0;
  const voidShort = space.voidBox ? Math.max(1, Math.min(space.voidBox.max.x - space.voidBox.min.x, space.voidBox.max.z - space.voidBox.min.z)) : 0;
  const voidHeight = space.voidBox ? space.voidBox.max.y - space.voidBox.min.y : 0;

  if (id === "complexity") {
    const measured: Rating = space.unique <= 1 && space.branches.length === 0 ? 0 : space.unique >= 4 || space.branches.length >= 2 ? 2 : 1;
    const marks = space.tiles.map((tile) => boxAround(point(tile), space.branches.includes(tile) ? module * 0.46 : module * 0.26));
    return { value: space.unique, unit: "archetypes", basis: `${space.unique} archetypes and ${space.branches.length} tiles where three or more joints meet`, measured, marks };
  }
  if (id === "proportionality") {
    const dims = [width, depth, height].sort((a, b) => a - b);
    const value = dims[2]! <= 0 ? 0 : (dims[2]! - dims[0]!) / dims[2]!;
    return {
      value,
      unit: "contrast",
      basis: `${width.toFixed(0)} by ${depth.toFixed(0)} by ${height.toFixed(0)} ft`,
      measured: band(value, 0.34, 0.62),
      marks: [{ kind: "box", min: space.bounds.min, max: space.bounds.max, alpha: 0.16 }],
    };
  }
  if (id === "openness") {
    if (space.voidFloor > 0 && space.voidBox) {
      const value = Math.min(1, space.voidFloor / plan);
      return {
        value,
        unit: "void / plan",
        basis: `${Math.round(space.voidFloor)} sf void inside a ${Math.round(plan)} sf plan`,
        measured: band(value, 0.22, 0.4),
        marks: [{ kind: "box", ...space.voidBox, alpha: 0.34 }],
      };
    }
    const value = space.openDirections.length / 8;
    return {
      value,
      unit: "open sides",
      basis: `no void was stored. ${space.openDirections.length} of 8 plan directions have no tile`,
      measured: band(value, 0.3, 0.55),
      marks: [
        { kind: "slab", y: floorY, height: module * 0.12, polygon: space.footprint, alpha: 0.28 },
        ...space.openDirections.map((at) => boxAround(at, module * 0.22)),
      ],
    };
  }
  if (id === "connectivity") {
    const value = space.tiles.length ? (space.joints.length * 2) / space.tiles.length : 0;
    const axes = new Set(space.joints.map((joint) => joint.axis)).size;
    const measured: Rating = value >= 2 || (value >= 1.7 && axes >= 3) ? 2 : value < 1.4 ? 0 : 1;
    return {
      value,
      unit: "links / tile",
      basis: `${space.joints.length} joints across ${axes} axes`,
      measured,
      marks: space.joints.map((joint) => boxAround(joint.mid, module * 0.24)),
    };
  }
  if (id === "immersive") {
    const value = voidHeight > 0 && voidLong > 0 ? voidHeight / voidLong : height / longPlan;
    const column = Math.max(shortPlan * 0.14, module * 0.35);
    return {
      value,
      unit: voidHeight > 0 ? "void rise" : "assembly rise",
      basis: voidHeight > 0 ? `void ${voidHeight.toFixed(0)} ft high over a ${voidLong.toFixed(0)} ft plan` : `no void height was stored. The assembly is ${height.toFixed(0)} ft high over a ${longPlan.toFixed(0)} ft plan`,
      measured: band(value, 0.35, 0.75),
      marks: [{
        kind: "box",
        alpha: 0.3,
        min: { x: center.x - column / 2, y: space.bounds.min.y, z: center.z - column / 2 },
        max: { x: center.x + column / 2, y: space.bounds.max.y, z: center.z + column / 2 },
      }],
    };
  }
  if (id === "visibility") {
    const value = voidLong > 0 ? voidLong / voidShort : longPlan / shortPlan;
    const alongX = space.voidBox ? (space.voidBox.max.x - space.voidBox.min.x) >= (space.voidBox.max.z - space.voidBox.min.z) : width >= depth;
    const source = space.voidBox ?? space.bounds;
    const y = space.voidBox ? (space.voidBox.min.y + space.voidBox.max.y) / 2 : (space.bounds.min.y + space.bounds.max.y) / 2;
    const thickness = Math.max((voidLong > 0 ? voidShort : shortPlan) * 0.16, module * 0.2);
    const a = { x: alongX ? source.min.x : center.x, y, z: alongX ? center.z : source.min.z };
    const b = { x: alongX ? source.max.x : center.x, y, z: alongX ? center.z : source.max.z };
    return {
      value,
      unit: voidLong > 0 ? "void axis" : "plan axis",
      basis: voidLong > 0 ? `clear void ${voidLong.toFixed(0)} by ${voidShort.toFixed(0)} ft` : `no void plan was stored. The assembly plan is ${longPlan.toFixed(0)} by ${shortPlan.toFixed(0)} ft`,
      measured: band(value, 1.35, 2),
      marks: [{ kind: "bar", a, b, thickness, alpha: 0.42 }],
    };
  }
  if (id === "centrality") {
    const value = space.central.length / space.tiles.length;
    const group = space.central.length ? space.central : space.tiles;
    const xs = group.map((tile) => tile.transform.x);
    const zs = group.map((tile) => tile.transform.z);
    const pad = module * 0.2;
    return {
      value,
      unit: "tiles at center",
      basis: `${space.central.length} of ${space.tiles.length} tiles sit in the inner half of the plan`,
      measured: band(value, 0.34, 0.6),
      marks: [{
        kind: "box",
        alpha: 0.36,
        min: { x: Math.min(...xs) - pad, y: average(group.map((tile) => tile.transform.y)) - module * 0.05, z: Math.min(...zs) - pad },
        max: { x: Math.max(...xs) + pad, y: average(group.map((tile) => tile.transform.y)) + module * 0.08, z: Math.max(...zs) + pad },
      }],
    };
  }
  if (id === "directionality") {
    const value = longPlan / shortPlan;
    const alongX = width >= depth;
    const thickness = Math.max(shortPlan * 0.14, module * 0.25);
    const y = floorY + module * 0.08;
    return {
      value,
      unit: "long / short",
      basis: `plan ${longPlan.toFixed(0)} by ${shortPlan.toFixed(0)} ft`,
      measured: band(value, 1.35, 2),
      marks: [{
        kind: "bar",
        thickness,
        alpha: 0.4,
        a: { x: alongX ? space.bounds.min.x : center.x, y, z: alongX ? center.z : space.bounds.min.z },
        b: { x: alongX ? space.bounds.max.x : center.x, y, z: alongX ? center.z : space.bounds.max.z },
      }],
    };
  }
  if (id === "receptivity") {
    const value = space.ends.length / space.tiles.length;
    const marks = space.ends.map((tile) => {
      const dx = tile.transform.x - center.x;
      const dz = tile.transform.z - center.z;
      const length = Math.hypot(dx, dz) || 1;
      return boxAround({
        x: tile.transform.x + (dx / length) * module * 0.7,
        y: tile.transform.y,
        z: tile.transform.z + (dz / length) * module * 0.7,
      }, module * 0.24);
    });
    return { value, unit: "open ends", basis: `${space.ends.length} tiles have one joint or none`, measured: band(value, 0.28, 0.5), marks };
  }
  if (id === "plate-articulation") {
    const levels = storedLevels(item, space.levels.length);
    const measured: Rating = levels <= 1 && space.spread < 0.45 ? 0 : levels >= 3 || (levels >= 2 && space.spread >= 0.55) ? 2 : 1;
    const marks: SpatialMark[] = space.levels.map((level) => {
      const xs = level.tiles.map((tile) => tile.transform.x);
      const zs = level.tiles.map((tile) => tile.transform.z);
      const pad = module * 0.35;
      return {
        kind: "box",
        alpha: 0.4,
        min: { x: Math.min(...xs) - pad, y: level.y - module * 0.04, z: Math.min(...zs) - pad },
        max: { x: Math.max(...xs) + pad, y: level.y + module * 0.1, z: Math.max(...zs) + pad },
      };
    });
    return { value: levels, unit: "levels", basis: `${levels} occupied heights, plan spread ${space.spread.toFixed(2)}`, measured, marks };
  }
  if (id === "modularity") {
    const value = 1 - space.unique / space.tiles.length;
    const repeated = space.tiles.filter((tile) => (space.counts.get(tile.archetypeId) ?? 0) > 1);
    const shown = repeated.length ? repeated : space.tiles;
    const order = [...space.counts.keys()];
    const marks = shown.map((tile) => boxAround(point(tile), module * (repeated.length ? 0.22 : 0.16 + order.indexOf(tile.archetypeId) * 0.07)));
    return { value, unit: "repeated tiles", basis: `${space.tiles.length - space.unique} repeats among ${space.tiles.length} tiles`, measured: band(value, 0.2, 0.5), marks };
  }
  if (id === "collaboration" || id === "social-proximity") {
    const value = space.neighbor <= 0 ? 0 : module / space.neighbor;
    const seen = new Set<string>();
    const marks: SpatialMark[] = [];
    for (const tile of space.tiles) {
      let nearest: TileInstance | null = null;
      let distance = Infinity;
      for (const other of space.tiles) {
        if (other.instanceId === tile.instanceId) continue;
        const gap = Math.hypot(tile.transform.x - other.transform.x, tile.transform.y - other.transform.y, tile.transform.z - other.transform.z);
        if (gap < distance) {
          distance = gap;
          nearest = other;
        }
      }
      if (!nearest) continue;
      const key = [tile.instanceId, nearest.instanceId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push({ kind: "bar", a: point(tile), b: point(nearest), thickness: module * 0.14, alpha: 0.5 });
    }
    return {
      value,
      unit: "module / spacing",
      basis: `nearest tiles average ${space.neighbor.toFixed(1)} ft apart`,
      measured: band(value, 0.48, 0.62),
      marks,
    };
  }
  if (id === "circulation-integration") {
    const inside = space.joints.filter((joint) => joint.core);
    const value = space.joints.length ? inside.length / space.joints.length : 0;
    return {
      value,
      unit: "joints in the core",
      basis: `${inside.length} of ${space.joints.length} joints sit in the inner half of the plan`,
      measured: band(value, 0.25, 0.6),
      marks: inside.map((joint) => boxAround(joint.mid, module * 0.32)),
    };
  }
  if (id === "spatial-permanence") {
    const value = space.spine.length / space.tiles.length;
    const marks: SpatialMark[] = [];
    for (let index = 1; index < space.spine.length; index += 1) {
      marks.push({ kind: "bar", a: point(space.spine[index - 1]!), b: point(space.spine[index]!), thickness: module * 0.32, alpha: 0.46 });
    }
    return { value, unit: "spine", basis: `${space.spine.length} of ${space.tiles.length} tiles lie on the longest path`, measured: band(value, 0.5, 0.85), marks };
  }
  return { value: null, unit: "", basis: "this criterion has no spatial measure", measured: null, marks: [] };
}

function labelPoint(marks: SpatialMark[], fallback: SpacePoint): SpacePoint {
  const samples: SpacePoint[] = [];
  for (const mark of marks) {
    if (mark.kind === "box") samples.push(mid(mark.min, mark.max));
    else if (mark.kind === "bar") samples.push(mid(mark.a, mark.b));
    else if (mark.polygon.length) samples.push(mark.polygon[Math.floor(mark.polygon.length / 2)]!);
  }
  if (!samples.length) return fallback;
  return {
    x: average(samples.map((sample) => sample.x)),
    y: average(samples.map((sample) => sample.y)),
    z: average(samples.map((sample) => sample.z)),
  };
}

/** Read one program's desires against one saved cluster. Nothing is written back. */
export function readClusterCriteria(programId: string, item: FinishedIteration, activities: ClientCompatibilityDocument = CLIENT_ACTIVITY_SEED): ClusterReading {
  const program = activities.activities.find((entry) => entry.id === programId);
  const space = survey(item);
  return {
    criteria: (program?.desires ?? []).map((desire) => {
      const reading = space ? rate(desire.criterionId, item, space) : { value: null, unit: "", basis: "this cluster has no stored tiles", measured: null, marks: [] as SpatialMark[] };
      return {
        id: desire.criterionId,
        label: LABELS[desire.criterionId] ?? desire.criterionId,
        desired: desire.value,
        measured: reading.measured,
        relation: relation(reading.measured, desire.value),
        value: reading.value,
        unit: reading.unit,
        basis: reading.basis,
        marks: reading.marks,
        labelAt: labelPoint(reading.marks, space?.center ?? { x: 0, y: 0, z: 0 }),
      };
    }),
  };
}

export function levelName(level: Rating | null) {
  return level === null ? "Unmeasured" : LEVEL[level];
}
