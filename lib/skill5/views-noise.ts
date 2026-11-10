import { pointInRing } from "@/lib/skill5/placement";
import type { SiteBuilding, SiteHeightSource, SiteRoad, XZ } from "@/lib/skill5/site-model";

export const VIEW_POINT_IDS = ["waterfront", "center", "north", "south", "west"] as const;

export type ViewPointId = (typeof VIEW_POINT_IDS)[number];

export const VIEW_POINT_LABELS: Record<ViewPointId, string> = {
  waterfront: "Waterfront",
  center: "Center",
  north: "North",
  south: "South",
  west: "West",
};

/** Positive bearings are north of east. Negative bearings are south of east. */
export const BAY_BEARING_MIN = -60;
export const BAY_BEARING_MAX = 60;
export const BAY_BEARING_STEP = 10;
export const SHORE_LIMIT_FEET = 4000;

export type BlockerSource = SiteHeightSource | "published";

export type ViewPoint = { id: ViewPointId; label: string; x: number; z: number };

export type SightHit = {
  bearing: number;
  /** Distance to the OpenStreetMap coastline. The water polygon's far edge is not used. */
  shoreFeet: number | null;
  /** The coastline is clear. This is not a verified view of a named destination. */
  open: boolean;
  blockerName: string | null;
  blockerHeight: number | null;
  blockerSource: BlockerSource | null;
  blockerFeet: number | null;
};

export type ViewTarget = {
  name: string;
  ring: readonly XZ[];
  heightFeet: number;
};

export type ViewReading = {
  point: ViewPoint;
  eyeHeight: number;
  rays: SightHit[];
  shoreRays: number;
  openRays: number;
  openDegrees: number;
  east: SightHit;
  estimatedBlocks: number;
  towerBlocks: number;
  /** No surveyed destination points are stored, so this stays zero. */
  destinationViews: number;
};

export type NoiseSourceId = "macarthur" | "expressway" | "local";

export type NoiseSource = {
  id: NoiseSourceId;
  label: string;
  name: string | null;
  feet: number | null;
  x: number | null;
  z: number | null;
};

export type NoiseReading = {
  point: ViewPoint;
  macarthur: NoiseSource;
  expressway: NoiseSource;
  local: NoiseSource;
};

export type ViewRunRecord = {
  id: string;
  pointId: ViewPointId;
  pointLabel: string;
  eyeHeight: number;
  openRays: number;
  shoreRays: number;
  openDegrees: number;
  eastOpen: boolean;
  eastBlocker: string | null;
};

export const VIEW_LIMITS = [
  "Bearings run from 60° south of east to 60° north of east, every 10°. Positive is north of east. Stored X is east and stored Z is north, in international feet.",
  "An open sightline meets the OpenStreetMap coastline, ways 1301088906 and 23867500, retrieved 2026-10-20. That line is not a verified view of a named destination.",
  "The far edge of the water polygon is a map closure. It is not used as a shoreline.",
  "Each sightline falls from eye height to local zero at the coastline. No surveyed water elevation is loaded.",
  "A mass blocks the line when the line meets its plan below its height.",
  "Estimated heights and story counts can change a blocked sightline.",
  "Quantum on the Bay North Tower, 536 ft, Quantum on the Bay South Tower, 554 ft, and the Hilton Miami Downtown tower, 299 ft, are included from the Sun + Shadows analysis shafts. The stored site model is not changed.",
  "Other buildings outside the drawn study window are not tested.",
  "Courtyard holes are not treated as openings.",
  "The ground is flat. There is no terrain.",
] as const;

export const NOISE_LIMITS = [
  "Distances are horizontal lengths in international feet, the same unit as the site frame.",
  "Each length is to an OpenStreetMap road centerline, retrieved 2026-10-20. It is not a decibel level.",
  "No traffic count, AADT, or acoustic measurement is stored for this site. No decibel value is calculated.",
  "The three lengths are separate measurements. They are not a ranking of loudness.",
  "MacArthur Causeway is the named causeway. Other expressways, causeways, and ramps are listed apart from it. Local streets are the nearest mapped local way.",
  "Distance uses the centerline, not the pavement edge.",
  "Elevated decks use 2018 lidar heights and are not the I-395 reconstruction.",
] as const;

export type NoiseRunRecord = {
  id: string;
  pointId: ViewPointId;
  pointLabel: string;
  macarthurFeet: number | null;
  expresswayFeet: number | null;
  localFeet: number | null;
};

type Mass = {
  name: string | null;
  heightFeet: number;
  heightSource: BlockerSource | null;
  ring: readonly XZ[];
};

function samplesInside(ring: readonly XZ[]) {
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
  const points: Array<{ x: number; z: number }> = [];
  for (let x = minX; x <= maxX; x += 8) {
    for (let z = minZ; z <= maxZ; z += 8) {
      if (pointInRing(x, z, ring)) points.push({ x, z });
    }
  }
  return points;
}

function coastAhead(x: number, z: number, shore: readonly XZ[]) {
  return pathHits(x, z, 1, 0, shore, false)[0] ?? null;
}

export function observationPoints(ring: readonly XZ[], shore: readonly XZ[], water: readonly XZ[]): ViewPoint[] {
  const land = samplesInside(ring).filter((point) => {
    if (water.length >= 3 && pointInRing(point.x, point.z, water)) return false;
    const ahead = coastAhead(point.x, point.z, shore);
    return ahead !== null && ahead > 1;
  });
  const inside = land.length > 0 ? land : samplesInside(ring);
  const pool = inside.length > 0 ? inside : [{ x: 0, z: 0 }];
  const pick = (score: (point: { x: number; z: number }) => number) => pool.reduce((best, point) => (score(point) > score(best) ? point : best));
  const mean = pool.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  mean.x /= pool.length;
  mean.z /= pool.length;
  const center = pool.reduce((best, point) => (Math.hypot(point.x - mean.x, point.z - mean.z) < Math.hypot(best.x - mean.x, best.z - mean.z) ? point : best));
  const midZ = pool.reduce((sum, point) => sum + point.z, 0) / pool.length;
  const front = pool.filter((point) => Math.abs(point.z - midZ) <= 80);
  const eastFront = (front.length > 0 ? front : pool).reduce((best, point) => (point.x > best.x ? point : best));
  const chosen: Record<ViewPointId, { x: number; z: number }> = {
    waterfront: eastFront,
    center,
    north: pick((point) => point.z),
    south: pick((point) => -point.z),
    west: pick((point) => -point.x),
  };
  return VIEW_POINT_IDS.map((id) => ({ id, label: VIEW_POINT_LABELS[id], x: chosen[id].x, z: chosen[id].z }));
}

export function bearingVector(bearing: number) {
  const radians = (bearing * Math.PI) / 180;
  return { east: Math.cos(radians), north: Math.sin(radians) };
}

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

function massesOf(buildings: readonly SiteBuilding[], towers: readonly ViewTarget[], inside: (x: number, z: number) => boolean): Mass[] {
  const masses: Mass[] = [];
  for (const building of buildings) {
    if (building.heightFeet === null || building.heightFeet <= 0 || building.ring.length < 3) continue;
    let x = 0;
    let z = 0;
    for (const point of building.ring) {
      x += point[0];
      z += point[1];
    }
    if (!inside(x / building.ring.length, z / building.ring.length)) continue;
    masses.push({
      name: building.name,
      heightFeet: building.heightFeet,
      heightSource: building.heightSource ?? null,
      ring: building.ring,
    });
  }
  for (const tower of towers) {
    if (tower.heightFeet <= 0 || tower.ring.length < 3) continue;
    masses.push({
      name: tower.name,
      heightFeet: tower.heightFeet,
      heightSource: "published",
      ring: tower.ring,
    });
  }
  return masses;
}

/** Height of a sightline that starts at eye height and meets local zero at `reach`. */
export function sightHeight(eyeHeight: number, feet: number, reach: number) {
  if (reach <= 0) return eyeHeight;
  return eyeHeight * (1 - feet / reach);
}

function firstEntry(ox: number, oz: number, dx: number, dz: number, ring: readonly XZ[], limit: number) {
  const hits = pathHits(ox, oz, dx, dz, ring, true).filter((hit) => hit < limit);
  for (const t of hits) {
    if (pointInRing(ox + dx * (t + 0.2), oz + dz * (t + 0.2), ring)) return t;
  }
  return null;
}

function blockerAt(ox: number, oz: number, dx: number, dz: number, eyeY: number, reach: number, masses: readonly Mass[]) {
  let best: { mass: Mass; feet: number } | null = null;
  for (const mass of masses) {
    const inside = pointInRing(ox, oz, mass.ring);
    const t = inside && eyeY <= mass.heightFeet ? 0 : firstEntry(ox, oz, dx, dz, mass.ring, reach);
    if (t === null || t >= reach) continue;
    const y = sightHeight(eyeY, t, reach);
    if (y > mass.heightFeet || y < 0) continue;
    if (!best || t < best.feet) best = { mass, feet: t };
  }
  return best;
}

function pathHits(ox: number, oz: number, dx: number, dz: number, path: readonly XZ[], closed: boolean) {
  const hits: number[] = [];
  if (path.length < 2) return hits;
  const count = closed ? path.length : path.length - 1;
  for (let index = 0; index < count; index += 1) {
    const [ax, az] = path[index];
    const [bx, bz] = path[(index + 1) % path.length];
    const t = rayEdge(ox, oz, dx, dz, ax, az, bx, bz);
    if (t === null || t > SHORE_LIMIT_FEET) continue;
    if (hits.every((hit) => Math.abs(hit - t) > 0.5)) hits.push(t);
  }
  hits.sort((a, b) => a - b);
  return hits;
}

export function viewReading(point: ViewPoint, eyeHeight: number, buildings: readonly SiteBuilding[], shore: readonly XZ[], inView: (x: number, z: number) => boolean, towers: readonly ViewTarget[] = []): ViewReading {
  const masses = massesOf(buildings, towers, inView);
  const rays: SightHit[] = [];
  for (let bearing = BAY_BEARING_MIN; bearing <= BAY_BEARING_MAX; bearing += BAY_BEARING_STEP) {
    const { east, north } = bearingVector(bearing);
    const shoreFeet = pathHits(point.x, point.z, east, north, shore, false)[0] ?? null;
    const hit = shoreFeet === null ? null : blockerAt(point.x, point.z, east, north, eyeHeight, shoreFeet, masses);
    const blocked = hit !== null;
    rays.push({
      bearing,
      shoreFeet,
      open: shoreFeet !== null && !blocked,
      blockerName: blocked ? hit?.mass.name ?? "Unnamed" : null,
      blockerHeight: blocked ? hit?.mass.heightFeet ?? null : null,
      blockerSource: blocked ? hit?.mass.heightSource ?? null : null,
      blockerFeet: blocked ? hit?.feet ?? null : null,
    });
  }
  const east = rays.find((ray) => ray.bearing === 0) ?? rays[0];
  const shoreRays = rays.filter((ray) => ray.shoreFeet !== null).length;
  const openRays = rays.filter((ray) => ray.open).length;
  const estimatedBlocks = rays.filter((ray) => ray.blockerSource === "estimated" || ray.blockerSource === "osm-levels").length;
  const towerBlocks = rays.filter((ray) => ray.blockerSource === "published").length;
  return { point, eyeHeight, rays, shoreRays, openRays, openDegrees: openRays * BAY_BEARING_STEP, east, estimatedBlocks, towerBlocks, destinationViews: 0 };
}

function pointSegment(x: number, z: number, a: XZ, b: XZ) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / length));
  return { x: a[0] + dx * t, z: a[1] + dz * t };
}

function roadTitle(road: SiteRoad) {
  const named = road.name.trim();
  if (named && !/^unnamed$/i.test(named)) return named;
  if (road.kind === "ramp") return "Unnamed ramp";
  if (road.kind === "expressway") return "Unnamed expressway";
  if (road.kind === "causeway") return "Unnamed causeway";
  return "Unnamed street";
}

function nearestRoad(x: number, z: number, roads: readonly SiteRoad[]) {
  let best: { feet: number; x: number; z: number; name: string } | null = null;
  for (const road of roads) {
    for (let index = 1; index < road.path.length; index += 1) {
      const hit = pointSegment(x, z, road.path[index - 1], road.path[index]);
      const feet = Math.hypot(x - hit.x, z - hit.z);
      if (!best || feet < best.feet) best = { feet, x: hit.x, z: hit.z, name: roadTitle(road) };
    }
  }
  return best;
}

function source(id: NoiseSourceId, label: string, roads: readonly SiteRoad[], x: number, z: number): NoiseSource {
  const hit = nearestRoad(x, z, roads);
  return { id, label, name: hit ? hit.name : null, feet: hit ? hit.feet : null, x: hit ? hit.x : null, z: hit ? hit.z : null };
}

export function noiseReading(point: ViewPoint, roads: readonly SiteRoad[]): NoiseReading {
  const macarthurRoads = roads.filter((road) => /macarthur/i.test(road.name));
  const expresswayRoads = roads.filter((road) => (road.kind === "causeway" || road.kind === "expressway" || road.kind === "ramp") && !/macarthur/i.test(road.name));
  const localRoads = roads.filter((road) => road.kind === "local");
  return {
    point,
    macarthur: source("macarthur", "MacArthur Causeway", macarthurRoads, point.x, point.z),
    expressway: source("expressway", "Other expressway or ramp", expresswayRoads, point.x, point.z),
    local: source("local", "Nearest local street", localRoads, point.x, point.z),
  };
}

export function programNotes(view: ViewReading, noise: NoiseReading) {
  const waterfront = `${view.openRays} of ${view.shoreRays} sightlines reach the mapped coastline. An open sightline is not a verified view of a named destination.`;
  const gathering = view.openRays > 0
    ? "A public gathering place can be oriented along the open sightlines toward the mapped coastline."
    : "This eye height has no open sightline to the mapped coastline.";
  const macarthur = noise.macarthur.feet === null
    ? "MacArthur Causeway is not in the mapped roads, so quiet work cannot be placed by that distance."
    : `Quiet work can use distance from MacArthur Causeway. This point is ${Math.round(noise.macarthur.feet).toLocaleString("en-US")} ft from its centerline. That length is not a sound level.`;
  return { waterfront, gathering, quiet: macarthur };
}

export function viewRunRecord(index: number, reading: ViewReading): ViewRunRecord {
  return {
    id: `view-${reading.point.id}-${reading.eyeHeight}-${index}`,
    pointId: reading.point.id,
    pointLabel: reading.point.label,
    eyeHeight: reading.eyeHeight,
    openRays: reading.openRays,
    shoreRays: reading.shoreRays,
    openDegrees: reading.openDegrees,
    eastOpen: reading.east.open,
    eastBlocker: reading.east.blockerName,
  };
}

export function noiseRunRecord(index: number, reading: NoiseReading): NoiseRunRecord {
  return {
    id: `noise-${reading.point.id}-${index}`,
    pointId: reading.point.id,
    pointLabel: reading.point.label,
    macarthurFeet: reading.macarthur.feet,
    expresswayFeet: reading.expressway.feet,
    localFeet: reading.local.feet,
  };
}

export type SightSegment = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  open: boolean;
};

export function viewSegments(reading: ViewReading): SightSegment[] {
  const segments: SightSegment[] = [{
    ax: reading.point.x,
    ay: 0.8,
    az: reading.point.z,
    bx: reading.point.x,
    by: reading.eyeHeight,
    bz: reading.point.z,
    open: true,
  }];
  for (const ray of reading.rays) {
    if (ray.shoreFeet === null || ray.shoreFeet <= 0) continue;
    const { east, north } = bearingVector(ray.bearing);
    const target = ray.shoreFeet;
    const reach = ray.open ? target : ray.blockerFeet ?? target;
    if (reach <= 0) continue;
    const endY = ray.open ? 1.6 : Math.max(1.6, sightHeight(reading.eyeHeight, reach, target));
    segments.push({
      ax: reading.point.x,
      ay: reading.eyeHeight,
      az: reading.point.z,
      bx: reading.point.x + east * reach,
      by: endY,
      bz: reading.point.z + north * reach,
      open: ray.open,
    });
  }
  return segments;
}

export function noiseSegments(reading: NoiseReading): SightSegment[] {
  const segments: SightSegment[] = [];
  for (const item of [reading.macarthur, reading.expressway, reading.local]) {
    if (item.feet === null || item.x === null || item.z === null) continue;
    segments.push({
      ax: reading.point.x,
      ay: 8,
      az: reading.point.z,
      bx: item.x,
      by: 8,
      bz: item.z,
      open: item.id === "macarthur",
    });
  }
  return segments;
}
