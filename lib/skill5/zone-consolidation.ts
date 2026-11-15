import type { NetworkPocket } from "./pockets";
import { polygonAreaSqFt, polygonCentroid, polygonIssue, type ZoneKind, type ZonePoint } from "./zoning";

/** One 20 ft tile. A zone has to hold at least two, and its box stays within four. */
export const TILE_FT = 20;
export const MIN_ZONE_SQFT = TILE_FT * TILE_FT * 2;
export const MAX_ZONE_SPAN_FT = TILE_FT * 4;
const SHARED_EDGE_FT = 8;
const QUANT = 0.5;

export type PocketAssignment = {
  pocketId: string;
  kind: ZoneKind | null;
};

export type ConsolidatedZone = {
  kind: ZoneKind;
  points: ZonePoint[];
  areaSqFt: number;
  spanFt: number;
  pocketIds: string[];
  tileSlots: number;
};

export type ConsolidationFragment = {
  pocketIds: string[];
  areaSqFt: number;
  spanFt: number;
  reason: "under-two-tiles" | "narrower-than-a-tile" | "outline-rejected";
};

export type ConsolidationReport = {
  zones: ConsolidatedZone[];
  fragments: ConsolidationFragment[];
  rawPocketCount: number;
};

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

function quantKey(x: number, z: number) {
  return `${Math.round(x / QUANT)}:${Math.round(z / QUANT)}`;
}

function edgeKey(a: ZonePoint, b: ZonePoint) {
  const left = quantKey(a.x, a.z);
  const right = quantKey(b.x, b.z);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function edgeLength(a: ZonePoint, b: ZonePoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function boxOf(pockets: readonly NetworkPocket[]): Box {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const pocket of pockets) {
    for (const point of pocket.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

function spanOf(box: Box) {
  return Math.max(box.maxX - box.minX, box.maxZ - box.minZ);
}

function widthOf(box: Box) {
  return Math.min(box.maxX - box.minX, box.maxZ - box.minZ);
}

function expand(box: Box, pocket: NetworkPocket): Box {
  const next = { ...box };
  for (const point of pocket.points) {
    next.minX = Math.min(next.minX, point.x);
    next.maxX = Math.max(next.maxX, point.x);
    next.minZ = Math.min(next.minZ, point.z);
    next.maxZ = Math.max(next.maxZ, point.z);
  }
  return next;
}

function adjacency(pockets: readonly NetworkPocket[]) {
  const owners = new Map<string, { id: string; length: number }[]>();
  for (const pocket of pockets) {
    const points = pocket.points;
    for (let index = 0; index < points.length; index += 1) {
      const from = points[index];
      const to = points[(index + 1) % points.length];
      const key = edgeKey(from, to);
      const list = owners.get(key) ?? [];
      list.push({ id: pocket.id, length: edgeLength(from, to) });
      owners.set(key, list);
    }
  }
  const weights = new Map<string, number>();
  for (const list of owners.values()) {
    if (list.length < 2) continue;
    const ids = [...new Set(list.map((item) => item.id))];
    if (ids.length !== 2) continue;
    const length = list.reduce((sum, item) => sum + item.length, 0) / list.length;
    if (length < SHARED_EDGE_FT) continue;
    const key = ids[0] < ids[1] ? `${ids[0]}|${ids[1]}` : `${ids[1]}|${ids[0]}`;
    weights.set(key, (weights.get(key) ?? 0) + length);
  }
  const neighbors = new Map<string, { id: string; length: number }[]>();
  for (const [key, length] of weights) {
    const [left, right] = key.split("|");
    const push = (from: string, to: string) => {
      const list = neighbors.get(from) ?? [];
      list.push({ id: to, length });
      neighbors.set(from, list);
    };
    push(left, right);
    push(right, left);
  }
  return neighbors;
}

function outerRing(pockets: readonly NetworkPocket[]): ZonePoint[] | null {
  const count = new Map<string, { a: ZonePoint; b: ZonePoint; n: number }>();
  for (const pocket of pockets) {
    const points = pocket.points;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (edgeLength(a, b) < 1e-3) continue;
      const key = edgeKey(a, b);
      const found = count.get(key);
      if (found) found.n += 1;
      else count.set(key, { a, b, n: 1 });
    }
  }
  const edges = [...count.values()].filter((edge) => edge.n === 1);
  if (edges.length < 3) return null;
  const unused = new Set(edges.map((_, index) => index));
  const at = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    for (const point of [edge.a, edge.b]) {
      const key = quantKey(point.x, point.z);
      const list = at.get(key) ?? [];
      list.push(index);
      at.set(key, list);
    }
  });
  const rings: ZonePoint[][] = [];
  while (unused.size > 0) {
    const start = unused.values().next().value;
    if (start == null) break;
    unused.delete(start);
    const ring = [{ ...edges[start].a }];
    let current = edges[start].b;
    let guard = 0;
    while (guard < edges.length + 2) {
      guard += 1;
      if (quantKey(current.x, current.z) === quantKey(ring[0].x, ring[0].z)) break;
      const options = (at.get(quantKey(current.x, current.z)) ?? []).filter((index) => unused.has(index));
      if (options.length === 0) break;
      const next = options[0];
      unused.delete(next);
      const edge = edges[next];
      const fromA = quantKey(edge.a.x, edge.a.z) === quantKey(current.x, current.z);
      current = fromA ? edge.b : edge.a;
      ring.push({ ...current });
    }
    if (ring.length >= 3) rings.push(ring);
  }
  rings.sort((left, right) => polygonAreaSqFt(right) - polygonAreaSqFt(left));
  return rings[0] ?? null;
}

function bandKind(x: number, minX: number, maxX: number): ZoneKind {
  const span = Math.max(1, maxX - minX);
  const t = (x - minX) / span;
  if (t < 0.34) return "lobby";
  if (t > 0.66) return "gathering";
  return "workspace";
}

/**
 * Joins adjacent raw pockets into architectural zones.
 * A zone must cover at least two 20 ft tiles and stay inside an 80 ft box.
 * Pockets that already have a typology only join the same typology.
 * Unassigned pockets take Lobby / Workspace / Gathering from the west, middle, and east thirds of the pocket field.
 * The pocket polygons are not rewritten.
 */
export function consolidatePockets(
  pockets: readonly NetworkPocket[],
  assignments: readonly PocketAssignment[] = [],
): ConsolidationReport {
  const kindOf = new Map(assignments.map((item) => [item.pocketId, item.kind]));
  const byId = new Map(pockets.map((pocket) => [pocket.id, pocket]));
  const neighbors = adjacency(pockets);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const pocket of pockets) {
    const center = polygonCentroid(pocket.points);
    minX = Math.min(minX, center.x);
    maxX = Math.max(maxX, center.x);
  }
  const claimed = new Set<string>();
  const order = [...pockets].sort((left, right) => {
    const a = polygonCentroid(left.points);
    const b = polygonCentroid(right.points);
    return a.z - b.z || a.x - b.x || left.id.localeCompare(right.id);
  });
  const groups: NetworkPocket[][] = [];
  for (const seed of order) {
    if (claimed.has(seed.id)) continue;
    const members = [seed];
    claimed.add(seed.id);
    const assigned = kindOf.get(seed.id) ?? null;
    let grew = true;
    while (grew) {
      grew = false;
      const box = boxOf(members);
      const memberIds = new Set(members.map((item) => item.id));
      let best: { pocket: NetworkPocket; length: number } | null = null;
      for (const member of members) {
        for (const link of neighbors.get(member.id) ?? []) {
          if (claimed.has(link.id) || memberIds.has(link.id)) continue;
          const neighbor = byId.get(link.id);
          if (!neighbor) continue;
          const neighborKind = kindOf.get(neighbor.id) ?? null;
          if (assigned && neighborKind && neighborKind !== assigned) continue;
          if (!assigned && neighborKind) continue;
          const next = expand(box, neighbor);
          if (spanOf(next) > MAX_ZONE_SPAN_FT + 1e-6) continue;
          if (!best || link.length > best.length) best = { pocket: neighbor, length: link.length };
        }
      }
      if (!best) continue;
      members.push(best.pocket);
      claimed.add(best.pocket.id);
      grew = true;
    }
    groups.push(members);
  }
  const zones: ConsolidatedZone[] = [];
  const fragments: ConsolidationFragment[] = [];
  for (const members of groups) {
    const ids = members.map((item) => item.id);
    const box = boxOf(members);
    const area = members.reduce((sum, item) => sum + polygonAreaSqFt(item.points), 0);
    const span = spanOf(box);
    if (widthOf(box) < TILE_FT - 0.5) {
      fragments.push({ pocketIds: ids, areaSqFt: area, spanFt: span, reason: "narrower-than-a-tile" });
      continue;
    }
    if (area < MIN_ZONE_SQFT) {
      fragments.push({ pocketIds: ids, areaSqFt: area, spanFt: span, reason: "under-two-tiles" });
      continue;
    }
    const ring = outerRing(members);
    const ringArea = ring ? polygonAreaSqFt(ring) : 0;
    const boxArea = Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxZ - box.minZ);
    const outlineFits = ring != null && !polygonIssue(ring) && ringArea >= MIN_ZONE_SQFT && ringArea <= boxArea * 1.05 && ringArea <= area * 1.2;
    if (!ring || !outlineFits) {
      fragments.push({ pocketIds: ids, areaSqFt: area, spanFt: span, reason: ring && ringArea < MIN_ZONE_SQFT ? "under-two-tiles" : "outline-rejected" });
      continue;
    }
    const assignedKind = members.map((item) => kindOf.get(item.id) ?? null).find((kind) => kind != null) ?? null;
    const center = polygonCentroid(ring);
    const kind = assignedKind ?? bandKind(center.x, minX, maxX);
    zones.push({
      kind,
      points: ring,
      areaSqFt: ringArea,
      spanFt: span,
      pocketIds: ids,
      tileSlots: Math.floor(polygonAreaSqFt(ring) / (TILE_FT * TILE_FT)),
    });
  }
  return { zones, fragments, rawPocketCount: pockets.length };
}
