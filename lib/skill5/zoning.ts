import type { XZ } from "./site-model";

export type ZoneKind = "lobby" | "gathering" | "workspace";

export type ZonePoint = { x: number; z: number };

/** A manual program region. Elevations are feet. The polygon is on the site plan. */
export type ZoningRegion = {
  id: string;
  name: string;
  kind: ZoneKind;
  points: ZonePoint[];
  baseFt: number;
  heightFt: number;
  visible: boolean;
  networkId: string | null;
  /** Set when this volume was assigned to a detected pocket. Manual outlines leave it empty. */
  pocketId?: string | null;
};

export const ZONE_KIND_ORDER: { id: ZoneKind; label: string; note: string }[] = [
  { id: "lobby", label: "Lobby", note: "Entrances, arrival, and the change from public ground to the interior. Place this by hand." },
  { id: "gathering", label: "Gathering", note: "Waterfront rooms and places where paths meet. Place this by hand." },
  { id: "workspace", label: "Workspace", note: "Quieter branches and the city side. Place this by hand." },
];

const KIND: ReadonlySet<string> = new Set(["lobby", "gathering", "workspace"]);

export function isZoneKind(value: unknown): value is ZoneKind {
  return typeof value === "string" && KIND.has(value);
}

export function polygonAreaSqFt(points: readonly ZonePoint[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    sum += from.x * to.z - to.x * from.z;
  }
  return Math.abs(sum) * 0.5;
}

export function polygonCentroid(points: readonly ZonePoint[]): ZonePoint {
  if (points.length === 0) return { x: 0, z: 0 };
  let twice = 0;
  let x = 0;
  let z = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const cross = from.x * to.z - to.x * from.z;
    twice += cross;
    x += (from.x + to.x) * cross;
    z += (from.z + to.z) * cross;
  }
  if (Math.abs(twice) < 1e-6) {
    const mean = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
    return { x: mean.x / points.length, z: mean.z / points.length };
  }
  return { x: x / (3 * twice), z: z / (3 * twice) };
}

function cross(a: ZonePoint, b: ZonePoint, c: ZonePoint) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function sharesPoint(a: ZonePoint, b: ZonePoint) {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
}

/** True when non-adjacent edges cross or overlap. Touching at a shared corner is allowed. */
export function polygonSelfIntersects(points: readonly ZonePoint[]) {
  const count = points.length;
  if (count < 4) return false;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % count];
    for (let other = index + 1; other < count; other += 1) {
      if (other === index || (index + 1) % count === other) continue;
      if ((other + 1) % count === index) continue;
      const c = points[other];
      const d = points[(other + 1) % count];
      if (sharesPoint(a, c) || sharesPoint(a, d) || sharesPoint(b, c) || sharesPoint(b, d)) continue;
      const ab = cross(a, b, c);
      const ab2 = cross(a, b, d);
      const cd = cross(c, d, a);
      const cd2 = cross(c, d, b);
      const opposite = ab * ab2 < 0 && cd * cd2 < 0;
      if (opposite) return true;
    }
  }
  return false;
}

export function cleanedRing(points: readonly ZonePoint[]) {
  const next: ZonePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    const last = next[next.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < 0.5) continue;
    next.push({ x: point.x, z: point.z });
  }
  if (next.length > 1 && Math.hypot(next[0].x - next[next.length - 1].x, next[0].z - next[next.length - 1].z) < 0.5) next.pop();
  return next;
}

/** Null when the ring can be stored. The previous region stays in place when this returns a reason. */
export function polygonIssue(points: readonly ZonePoint[]): string | null {
  const ring = cleanedRing(points);
  if (ring.length < 3) return "A region needs at least three corners.";
  if (polygonSelfIntersects(ring)) return "This outline crosses itself.";
  if (polygonAreaSqFt(ring) < 1) return "This outline has no area.";
  return null;
}

export function elevationIssue(baseFt: number, heightFt: number): string | null {
  if (!Number.isFinite(baseFt) || !Number.isFinite(heightFt)) return "Elevation must be a number.";
  if (heightFt <= 0) return "Height has to be greater than zero.";
  if (Math.abs(baseFt) > 2000 || heightFt > 2000) return "Elevation is outside the site range.";
  return null;
}

export function translatePolygon(points: readonly ZonePoint[], dx: number, dz: number): ZonePoint[] {
  return points.map((point) => ({ x: point.x + dx, z: point.z + dz }));
}

function pointInRing(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function samples(points: readonly ZonePoint[]) {
  const probed = points.map((point) => ({ ...point }));
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    probed.push({ x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 });
  }
  return probed;
}

export function zoneSiteFlags(points: readonly ZonePoint[], parcel: readonly XZ[], water: readonly XZ[]) {
  const probed = samples(points);
  return {
    outsideParcel: parcel.length >= 3 && probed.some((point) => !pointInRing(point.x, point.z, parcel)),
    inWater: water.length >= 3 && probed.some((point) => pointInRing(point.x, point.z, water)),
  };
}

function segmentDistance(point: ZonePoint, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.min(1, Math.max(0, ((point.x - ax) * dx + (point.z - az) * dz) / length));
  return Math.hypot(point.x - (ax + dx * t), point.z - (az + dz * t));
}

export function distanceToRing(point: ZonePoint, ring: readonly XZ[]) {
  if (ring.length < 2) return null;
  let best = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    best = Math.min(best, segmentDistance(point, from[0], from[1], to[0], to[1]));
  }
  return Number.isFinite(best) ? best : null;
}

export function nearestDistance(point: ZonePoint, marks: readonly ZonePoint[]) {
  if (marks.length === 0) return null;
  let best = Infinity;
  for (const mark of marks) best = Math.min(best, Math.hypot(point.x - mark.x, point.z - mark.z));
  return best;
}

export type ZoneFacing = "waterfront" | "city" | "interior";

/** West parcel edges are the city side. The water ring is the mapped bay. */
export function zoneFacing(point: ZonePoint, parcel: readonly XZ[], water: readonly XZ[]): ZoneFacing | null {
  const waterFt = distanceToRing(point, water);
  if (parcel.length < 2 || waterFt == null) return null;
  let west = Infinity;
  for (const [x] of parcel) west = Math.min(west, x);
  let cityFt = Infinity;
  for (let index = 0; index < parcel.length; index += 1) {
    const from = parcel[index];
    const to = parcel[(index + 1) % parcel.length];
    if (from[0] > west + 30 && to[0] > west + 30) continue;
    cityFt = Math.min(cityFt, segmentDistance(point, from[0], from[1], to[0], to[1]));
  }
  if (!Number.isFinite(cityFt)) return null;
  if (waterFt < cityFt * 0.85) return "waterfront";
  if (cityFt < waterFt * 0.85) return "city";
  return "interior";
}

export type NetworkSample = { x: number; z: number; junction: boolean };

export function networkSamples(
  trails: ArrayLike<number>,
  inkSize: number,
  frame: { minX: number; minZ: number; width: number; depth: number },
  floor: number,
): NetworkSample[] {
  if (inkSize < 2 || trails.length !== inkSize * inkSize) return [];
  const occupied = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= inkSize || y >= inkSize) return false;
    return (trails[y * inkSize + x] ?? 0) >= floor;
  };
  const samples: NetworkSample[] = [];
  const stride = 3;
  for (let y = 0; y < inkSize; y += stride) {
    for (let x = 0; x < inkSize; x += stride) {
      if (!occupied(x, y)) continue;
      let turns = 0;
      let previous = occupied(x + 1, y);
      const around: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      for (const [dx, dy] of around) {
        const next = occupied(x + dx, y + dy);
        if (!previous && next) turns += 1;
        previous = next;
      }
      samples.push({
        x: frame.minX + ((x + 0.5) / inkSize) * frame.width,
        z: frame.minZ + ((y + 0.5) / inkSize) * frame.depth,
        junction: turns >= 3,
      });
    }
  }
  return samples;
}

function finitePoint(value: unknown): ZonePoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; z?: unknown };
  const x = typeof point.x === "number" ? point.x : Number(point.x);
  const z = typeof point.z === "number" ? point.z : Number(point.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

/** Reads stored regions. A legacy click marker becomes a small square so it is not dropped. */
export function readZoningRegion(value: unknown): ZoningRegion | null {
  if (!value || typeof value !== "object") return null;
  const zone = value as {
    id?: unknown;
    name?: unknown;
    kind?: unknown;
    points?: unknown;
    x?: unknown;
    z?: unknown;
    baseFt?: unknown;
    heightFt?: unknown;
    visible?: unknown;
    networkId?: unknown;
    pocketId?: unknown;
  };
  if (typeof zone.id !== "string" || !isZoneKind(zone.kind)) return null;
  let points = Array.isArray(zone.points) ? zone.points.flatMap((item) => {
    const point = finitePoint(item);
    return point ? [point] : [];
  }) : [];
  if (points.length < 3 && typeof zone.x === "number" && typeof zone.z === "number") {
    const half = 12;
    points = [
      { x: zone.x - half, z: zone.z - half },
      { x: zone.x + half, z: zone.z - half },
      { x: zone.x + half, z: zone.z + half },
      { x: zone.x - half, z: zone.z + half },
    ];
  }
  if (polygonIssue(points)) return null;
  const baseFt = typeof zone.baseFt === "number" && Number.isFinite(zone.baseFt) ? zone.baseFt : 0;
  const heightFt = typeof zone.heightFt === "number" && zone.heightFt > 0 ? zone.heightFt : 12;
  if (elevationIssue(baseFt, heightFt)) return null;
  return {
    id: zone.id,
    name: typeof zone.name === "string" && zone.name.trim() ? zone.name.trim() : zone.kind,
    kind: zone.kind,
    points: cleanedRing(points),
    baseFt,
    heightFt,
    visible: zone.visible !== false,
    networkId: typeof zone.networkId === "string" ? zone.networkId : null,
    pocketId: typeof zone.pocketId === "string" ? zone.pocketId : null,
  };
}

export function readZoningList(value: unknown): ZoningRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const zone = readZoningRegion(item);
    return zone ? [zone] : [];
  });
}
