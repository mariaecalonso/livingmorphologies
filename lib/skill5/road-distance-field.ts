import { pointInRing } from "@/lib/skill5/placement";
import type { SiteRoad, XZ } from "@/lib/skill5/site-model";
import { noiseReading, type NoiseReading, type NoiseSourceId, type ViewPoint } from "@/lib/skill5/views-noise";

/** Same spacing as the stored observation lattice. */
export const ROAD_FIELD_SPACING_FEET = 8;

export const ROAD_CLASS_IDS = ["macarthur", "expressway", "local"] as const;

export type RoadDistanceField = {
  id: NoiseSourceId;
  spacingFeet: number;
  /** South-west corner of the sample grid. Cell centers sit half a step in from this corner. */
  originX: number;
  originZ: number;
  columns: number;
  rows: number;
  /** Feet. NaN where the cell center is outside the parcel. Row-major, south to north. */
  samples: Float32Array;
  /** Minimum, median, and maximum of the finite sample centers. Not area-weighted. */
  minimum: number;
  median: number;
  maximum: number;
  contourFeet: number;
  count: number;
};

export type RoadDistanceFields = Record<NoiseSourceId, RoadDistanceField>;

export type ContourSegment = { feet: number; ax: number; az: number; bx: number; bz: number };

const MEASURE: ViewPoint = { id: "center", label: "Measurement", x: 0, z: 0 };

function classOf(reading: NoiseReading, id: NoiseSourceId) {
  if (id === "macarthur") return reading.macarthur;
  if (id === "expressway") return reading.expressway;
  return reading.local;
}

function contourStep(minimum: number, maximum: number) {
  return maximum - minimum >= 400 ? 100 : 50;
}

function summarize(samples: Float32Array) {
  const values: number[] = [];
  for (const value of samples) {
    if (Number.isFinite(value)) values.push(value);
  }
  values.sort((a, b) => a - b);
  if (values.length === 0) return { minimum: 0, median: 0, maximum: 0, count: 0 };
  const mid = (values.length - 1) / 2;
  const lower = values[Math.floor(mid)];
  const upper = values[Math.ceil(mid)];
  return {
    minimum: values[0],
    median: (lower + upper) / 2,
    maximum: values[values.length - 1],
    count: values.length,
  };
}

/**
 * Three cached distance fields. Each sample is `noiseReading` at that cell center.
 * The movable point does not use this grid; it calls `noiseReading` directly.
 */
export function buildRoadDistanceFields(ring: readonly XZ[], roads: readonly SiteRoad[]): RoadDistanceFields {
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
  const spacing = ROAD_FIELD_SPACING_FEET;
  const columns = Math.max(1, Math.ceil((maxX - minX) / spacing));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / spacing));
  const macarthur = new Float32Array(columns * rows);
  const expressway = new Float32Array(columns * rows);
  const local = new Float32Array(columns * rows);
  macarthur.fill(Number.NaN);
  expressway.fill(Number.NaN);
  local.fill(Number.NaN);
  const point: ViewPoint = { ...MEASURE };
  for (let iz = 0; iz < rows; iz += 1) {
    const z = minZ + (iz + 0.5) * spacing;
    for (let ix = 0; ix < columns; ix += 1) {
      const x = minX + (ix + 0.5) * spacing;
      if (x > maxX || z > maxZ || !pointInRing(x, z, ring)) continue;
      point.x = x;
      point.z = z;
      const reading = noiseReading(point, roads);
      const index = iz * columns + ix;
      macarthur[index] = reading.macarthur.feet ?? Number.NaN;
      expressway[index] = reading.expressway.feet ?? Number.NaN;
      local[index] = reading.local.feet ?? Number.NaN;
    }
  }
  const pack = (id: NoiseSourceId, samples: Float32Array): RoadDistanceField => {
    const stats = summarize(samples);
    return {
      id,
      spacingFeet: spacing,
      originX: minX,
      originZ: minZ,
      columns,
      rows,
      samples,
      minimum: stats.minimum,
      median: stats.median,
      maximum: stats.maximum,
      contourFeet: contourStep(stats.minimum, stats.maximum),
      count: stats.count,
    };
  };
  return {
    macarthur: pack("macarthur", macarthur),
    expressway: pack("expressway", expressway),
    local: pack("local", local),
  };
}

function sampleAt(field: RoadDistanceField, ix: number, iz: number) {
  if (ix < 0 || iz < 0 || ix >= field.columns || iz >= field.rows) return Number.NaN;
  return field.samples[iz * field.columns + ix];
}

function cellX(field: RoadDistanceField, index: number) {
  return field.originX + (index + 0.5) * field.spacingFeet;
}

function cellZ(field: RoadDistanceField, index: number) {
  return field.originZ + (index + 0.5) * field.spacingFeet;
}

/** Iso-lines of the sampled field. Levels are round foot intervals, not a normalized scale. */
export function contourSegments(field: RoadDistanceField): ContourSegment[] {
  const segments: ContourSegment[] = [];
  const step = field.contourFeet;
  if (!(step > 0)) return segments;
  const first = Math.ceil(field.minimum / step) * step;
  const last = Math.floor(field.maximum / step) * step;
  for (let level = first; level <= last; level += step) {
    for (let iz = 0; iz < field.rows - 1; iz += 1) {
      for (let ix = 0; ix < field.columns - 1; ix += 1) {
        const values = [
          sampleAt(field, ix, iz),
          sampleAt(field, ix + 1, iz),
          sampleAt(field, ix + 1, iz + 1),
          sampleAt(field, ix, iz + 1),
        ];
        if (values.some((value) => !Number.isFinite(value))) continue;
        const xs = [cellX(field, ix), cellX(field, ix + 1), cellX(field, ix + 1), cellX(field, ix)];
        const zs = [cellZ(field, iz), cellZ(field, iz), cellZ(field, iz + 1), cellZ(field, iz + 1)];
        let mask = 0;
        for (let corner = 0; corner < 4; corner += 1) {
          if (values[corner] >= level) mask |= 1 << corner;
        }
        if (mask === 0 || mask === 15) continue;
        const edgePoint = (edge: number) => {
          const from = [0, 1, 2, 3][edge];
          const to = [1, 2, 3, 0][edge];
          const span = values[to] - values[from];
          const mix = span === 0 ? 0.5 : (level - values[from]) / span;
          const t = Math.min(1, Math.max(0, mix));
          return {
            x: xs[from] + (xs[to] - xs[from]) * t,
            z: zs[from] + (zs[to] - zs[from]) * t,
          };
        };
        const links = contourLinks(mask, values, level);
        for (const [left, right] of links) {
          const a = edgePoint(left);
          const b = edgePoint(right);
          segments.push({ feet: level, ax: a.x, az: a.z, bx: b.x, bz: b.z });
        }
      }
    }
  }
  return segments;
}

/** Edge pairs for a marching-squares case. Edges are 0 south, 1 east, 2 north, 3 west. */
function contourLinks(mask: number, values: readonly number[], level: number): ReadonlyArray<readonly [number, number]> {
  if (mask === 5 || mask === 10) {
    const average = (values[0] + values[1] + values[2] + values[3]) / 4;
    const centerHigh = average >= level;
    if (mask === 5) return centerHigh ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
    return centerHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
  }
  const table: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [],
    [[3, 0]],
    [[0, 1]],
    [[3, 1]],
    [[1, 2]],
    [],
    [[0, 2]],
    [[3, 2]],
    [[2, 3]],
    [[2, 0]],
    [],
    [[2, 1]],
    [[1, 3]],
    [[0, 1]],
    [[3, 0]],
  ];
  return table[mask] ?? [];
}

export type CenterlineTick = { ax: number; az: number; bx: number; bz: number };

/**
 * A short mark along the stored centerline through the nearest point from `noiseReading`.
 * This is the source path, not the laterally shifted ribbon drawn on the model.
 */
export function centerlineTick(roads: readonly SiteRoad[], sourceId: NoiseSourceId, hitX: number, hitZ: number): CenterlineTick | null {
  const roadsOfClass = roads.filter((road) => {
    const macarthur = /macarthur/i.test(road.name);
    if (sourceId === "macarthur") return macarthur;
    if (sourceId === "local") return road.kind === "local";
    return (road.kind === "causeway" || road.kind === "expressway" || road.kind === "ramp") && !macarthur;
  });
  let best: { distance: number; ax: number; az: number; bx: number; bz: number; hx: number; hz: number } | null = null;
  for (const road of roadsOfClass) {
    for (let index = 1; index < road.path.length; index += 1) {
      const [ax, az] = road.path[index - 1];
      const [bx, bz] = road.path[index];
      const dx = bx - ax;
      const dz = bz - az;
      const length = dx * dx + dz * dz;
      const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((hitX - ax) * dx + (hitZ - az) * dz) / length));
      const hx = ax + dx * t;
      const hz = az + dz * t;
      const distance = Math.hypot(hitX - hx, hitZ - hz);
      if (!best || distance < best.distance) best = { distance, ax, az, bx, bz, hx, hz };
    }
  }
  if (!best || best.distance > 0.2) return null;
  const dx = best.bx - best.ax;
  const dz = best.bz - best.az;
  const span = Math.hypot(dx, dz) || 1;
  const half = 22;
  return {
    ax: best.hx - (dx / span) * half,
    az: best.hz - (dz / span) * half,
    bx: best.hx + (dx / span) * half,
    bz: best.hz + (dz / span) * half,
  };
}

export function fieldSample(field: RoadDistanceField, x: number, z: number) {
  const ix = Math.round((x - field.originX) / field.spacingFeet - 0.5);
  const iz = Math.round((z - field.originZ) / field.spacingFeet - 0.5);
  const value = sampleAt(field, ix, iz);
  return Number.isFinite(value) ? value : null;
}

export { classOf };
