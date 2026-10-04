import type { MassVolume, VoidSample } from "./materialize";

/**
 * Network morphology. Architectural mass is a smooth thickening of the
 * Physarum trails themselves. The carved shell (envelope minus voids) stays
 * available through `materializeOpenings({ field: "dual" })`.
 *
 * Accepted samples are sections through time. Persistent trails continue
 * through Z as an interpolated signed-distance field, shifting trails get a
 * thin diagonal bridge, stronger trails thicken, and trails that vanish taper.
 * The isosurface is that field, so nearby branches merge only where it supports them.
 */

/** Shared p99 of positive trail. The same reference is used for every sample. */
export const NETWORK_REFERENCE_QUANTILE = 0.99;

/**
 * Meaningful activity, as a fraction of that shared reference.
 * Lower values keep the diffuse halo and thicken into slabs.
 */
export const NETWORK_ACTIVITY_LEVEL = 0.12;

/** 8-connected islands smaller than this share of the largest body are noise. */
export const NETWORK_LOBE_FRACTION = 0.02;

/** Mesh lattice. Cubic so a tube has the same thickness in XY and Z. */
export const NETWORK_GRID = 64;

/** Tube radius is not used to replace the trail. A small bridge only spans a temporal gap. */
export const NETWORK_BRIDGE_RADIUS = 1.55;

/** Extra thickness, in grid cells, at full trail intensity. Dimmer trails stay thinner. */
export const NETWORK_THICKEN = 1.6;

/** Signed distance is clamped so a vein tapers instead of vanishing in one step. */
export const NETWORK_SDF_CLAMP = 4.5;

/** SDF half-band in grid cells. The 0.5 contour sits on the tube surface. */
export const NETWORK_SDF_BAND = 1.55;

/** Separable smooths. Zero keeps chambers that a blur would seal; the SDF band still rounds the surface. */
export const NETWORK_BLUR_PASSES = 0;

/**
 * Nearest core farther than this, in grid cells, is not a continuation.
 * Unmatched cores taper instead of jumping to an unrelated vein.
 */
export const NETWORK_MIGRATE_CELLS = 14;

/** 3D bodies smaller than this share of the largest are floating fragments. */
export const NETWORK_FRAGMENT_FRACTION = 0.025;

/** How far an unmatched vein reaches into the next gap before it pinches off. */
const TAPER_FRACTION = 0.45;
const TAPER_CELLS = 5;

const ORTHOGONAL: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export type NetworkPlateStats = {
  z: number;
  coverage: number;
  cores: number;
  /** Principal-axis angle of the cores, radians. */
  angle: number;
  /** RMS distance of the cores from the plate center, in grid cells. */
  radius: number;
};

export type NetworkBuildStats = {
  acceptedSamples: number;
  iterations: number[];
  reference: number;
  activityLevel: number;
  plates: NetworkPlateStats[];
  segments: number;
  tapered: number;
  componentsBefore: number;
  componentsAfter: number;
  droppedFragments: number;
  /** Share of lattice cells at or above the isosurface. */
  occupancy: number;
  /** Share of XY columns that contain any mass. A slab fills this; a network does not. */
  footprint: number;
  /** Mean fraction of Z occupied inside those columns. Tubes score high; stacked plates score low. */
  meanColumnFill: number;
  buildMs: number;
};

export type NetworkVolume = MassVolume & { stats: NetworkBuildStats };

/** Inset so the tube surface closes inside the lattice instead of being cut by it. */
export function networkMargin() {
  return Math.ceil(NETWORK_SDF_BAND + NETWORK_THICKEN + NETWORK_BLUR_PASSES + 1);
}

export function networkMorphologyNotes() {
  const margin = networkMargin();
  return {
    activityRule:
      `Shared p${Math.round(NETWORK_REFERENCE_QUANTILE * 100)} of every positive trail value. ` +
      `Cells below ${NETWORK_ACTIVITY_LEVEL} of that reference are cleared. ` +
      `8-connected components smaller than ${NETWORK_LOBE_FRACTION} of the largest are removed. ` +
      `A 1-cell close rejoins broken veins. The mask is the architectural section, including its chambers.`,
    connection:
      `Each sample keeps its normalized event-sample Z. Between samples the signed distance is interpolated, ` +
      `so a persistent trail continues through Z and a small shift slides. ` +
      `A skeleton core also links to the nearest core within ${NETWORK_MIGRATE_CELLS} grid cells when the trails no longer overlap, ` +
      `which is the diagonal bridge. Unmatched cores taper across at most ${TAPER_CELLS} grid cells.`,
    thickening:
      `The kept mask is a signed-distance field, so chambers inside the trail stay open. ` +
      `Full-intensity trails gain ${NETWORK_THICKEN} cells of thickness; dimmer trails gain less. ` +
      `Distance is clamped to ±${NETWORK_SDF_CLAMP} cells. ` +
      `A skeleton bridge of radius ${NETWORK_BRIDGE_RADIUS} is added only where a vein has shifted out of overlap, ` +
      `and the isosurface is the 0.5 level (band ${NETWORK_SDF_BAND}). ` +
      `Centerlines are inset by ${margin} cells so the surface closes inside the 20×20×20 module.`,
  };
}

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  values.sort((left, right) => left - right);
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(q * (values.length - 1))))];
}

function clamp01(value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function componentsOf(mask: Uint8Array, size: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const found: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const x = index % size;
      const y = (index - x) / size;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= size) continue;
          const neighbor = yy * size + xx;
          if (seen[neighbor] || !mask[neighbor]) continue;
          seen[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    found.push(cells);
  }
  return found;
}

function keepLargeComponents(mask: Uint8Array, size: number, fraction: number) {
  const found = componentsOf(mask, size);
  if (found.length <= 1) return mask;
  let largest = 0;
  for (const cells of found) if (cells.length > largest) largest = cells.length;
  const minimum = Math.max(4, largest * fraction);
  const kept = new Uint8Array(mask.length);
  for (const cells of found) {
    if (cells.length < minimum) continue;
    for (const cell of cells) kept[cell] = 1;
  }
  return kept;
}

/** Dilate then erode, 4-connected, so a one-cell break in a vein closes. */
function closeMask(mask: Uint8Array, size: number) {
  const dilated = mask.slice();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue;
      for (const [dx, dy] of ORTHOGONAL) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        dilated[yy * size + xx] = 1;
      }
    }
  }
  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!dilated[y * size + x]) continue;
      let intact = true;
      for (const [dx, dy] of ORTHOGONAL) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size || !dilated[yy * size + xx]) {
          intact = false;
          break;
        }
      }
      if (intact) closed[y * size + x] = 1;
    }
  }
  return closed;
}

/** Zhang-Suen. Topology of the veins stays; filled regions collapse to a centerline. */
function skeletonize(mask: Uint8Array, size: number) {
  const skel = mask.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : skel[y * size + x]);
  const kill: number[] = [];
  for (let iter = 0; iter < size; iter += 1) {
    let changed = false;
    for (let pass = 0; pass < 2; pass += 1) {
      kill.length = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const index = y * size + x;
          if (!skel[index]) continue;
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbors < 2 || neighbors > 6) continue;
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let turns = 0;
          for (let k = 0; k < 8; k += 1) if (ring[k] === 0 && ring[k + 1] === 1) turns += 1;
          if (turns !== 1) continue;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          kill.push(index);
        }
      }
      if (kill.length === 0) continue;
      changed = true;
      for (const index of kill) skel[index] = 0;
    }
    if (!changed) break;
  }
  return skel;
}

/** Approximate distance to the nearest empty cell, in cells. */
function distanceToOutside(mask: Uint8Array, size: number) {
  const inf = size + size;
  const dist = new Float32Array(size * size);
  for (let i = 0; i < dist.length; i += 1) dist[i] = mask[i] ? inf : 0;
  const relax = (x: number, y: number, nx: number, ny: number, weight: number) => {
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
    const next = dist[ny * size + nx] + weight;
    const index = y * size + x;
    if (next < dist[index]) dist[index] = next;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      relax(x, y, x - 1, y, 1);
      relax(x, y, x, y - 1, 1);
      relax(x, y, x - 1, y - 1, 1.414);
      relax(x, y, x + 1, y - 1, 1.414);
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      relax(x, y, x + 1, y, 1);
      relax(x, y, x, y + 1, 1);
      relax(x, y, x + 1, y + 1, 1.414);
      relax(x, y, x - 1, y + 1, 1.414);
    }
  }
  return dist;
}

type Core = { x: number; y: number; z: number; r: number };

function insetCoord(index: number, grid: number, margin: number) {
  const span = grid - 1 - 2 * margin;
  return margin + (index / Math.max(1, grid - 1)) * span;
}

function signedActivity(activity: Float32Array, mask: Uint8Array, grid: number) {
  const outside = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) outside[i] = mask[i] ? 0 : 1;
  const toOutside = distanceToOutside(mask, grid);
  const toInside = distanceToOutside(outside, grid);
  const boost = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const strength = clamp01((Math.min(1, activity[i]) - NETWORK_ACTIVITY_LEVEL) / (1 - NETWORK_ACTIVITY_LEVEL));
    boost[i] = NETWORK_THICKEN * strength;
  }
  const spread = boost.slice();
  for (let pass = 0; pass < Math.ceil(NETWORK_THICKEN); pass += 1) {
    const next = spread.slice();
    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        const value = spread[y * grid + x];
        if (value <= 0) continue;
        for (const [dx, dy] of ORTHOGONAL) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= grid || yy >= grid) continue;
          const index = yy * grid + xx;
          if (value > next[index]) next[index] = value;
        }
      }
    }
    spread.set(next);
  }
  const sdf = new Float32Array(mask.length);
  for (let i = 0; i < sdf.length; i += 1) {
    const signed = mask[i] ? toOutside[i] : -toInside[i];
    sdf[i] = Math.max(-NETWORK_SDF_CLAMP, Math.min(NETWORK_SDF_CLAMP, signed + spread[i]));
  }
  return sdf;
}

function plateCores(activity: Float32Array, grid: number, z: number): { cores: Core[]; sdf: Float32Array; coverage: number; angle: number; radius: number } {
  const mask = new Uint8Array(grid * grid);
  let covered = 0;
  for (let i = 0; i < activity.length; i += 1) {
    if (activity[i] < NETWORK_ACTIVITY_LEVEL) continue;
    mask[i] = 1;
    covered += 1;
  }
  const kept = closeMask(keepLargeComponents(mask, grid, NETWORK_LOBE_FRACTION), grid);
  let skel = skeletonize(kept, grid);
  let skelCount = 0;
  for (let i = 0; i < skel.length; i += 1) skelCount += skel[i];
  if (skelCount === 0) skel = kept;

  const cores: Core[] = [];
  let meanX = 0;
  let meanY = 0;
  let active = 0;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const index = y * grid + x;
      if (kept[index]) {
        meanX += x;
        meanY += y;
        active += 1;
      }
      if (!skel[index]) continue;
      cores.push({ x, y, z, r: NETWORK_BRIDGE_RADIUS });
    }
  }
  const count = active || 1;
  meanX /= count;
  meanY /= count;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  let radiusSum = 0;
  const center = (grid - 1) / 2;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      if (!kept[y * grid + x]) continue;
      const dx = x - meanX;
      const dy = y - meanY;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
      const ox = x - center;
      const oy = y - center;
      radiusSum += ox * ox + oy * oy;
    }
  }
  return {
    cores,
    sdf: signedActivity(activity, kept, grid),
    coverage: covered / (grid * grid),
    angle: 0.5 * Math.atan2(2 * xy, xx - yy),
    radius: Math.sqrt(radiusSum / count),
  };
}

function nearestCore(cores: readonly Core[], x: number, y: number, migrate: number) {
  const limit = migrate * migrate;
  let best = -1;
  let bestDistance = limit;
  for (let i = 0; i < cores.length; i += 1) {
    const dx = cores[i].x - x;
    const dy = cores[i].y - y;
    const distance = dx * dx + dy * dy;
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

type Segment = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; ra: number; rb: number };

function linkPlates(lower: readonly Core[], upper: readonly Core[], z0: number, z1: number, migrate: number) {
  const segments: Segment[] = [];
  const claimed = new Uint8Array(upper.length);
  let tapered = 0;
  const gap = Math.max(0, z1 - z0);
  const taper = Math.min(gap * TAPER_FRACTION, TAPER_CELLS);
  for (let i = 0; i < lower.length; i += 1) {
    const core = lower[i];
    const match = nearestCore(upper, core.x, core.y, migrate);
    if (match >= 0) {
      claimed[match] = 1;
      const next = upper[match];
      const shift = Math.hypot(next.x - core.x, next.y - core.y);
      if (shift > 2.5) {
        segments.push({ ax: core.x, ay: core.y, az: z0, bx: next.x, by: next.y, bz: z1, ra: core.r, rb: next.r });
      }
      continue;
    }
    if (taper <= 1e-5) continue;
    tapered += 1;
    segments.push({ ax: core.x, ay: core.y, az: z0, bx: core.x, by: core.y, bz: z0 + taper, ra: core.r, rb: core.r * 0.2 });
  }
  for (let i = 0; i < upper.length; i += 1) {
    if (claimed[i]) continue;
    const core = upper[i];
    if (taper <= 1e-5) continue;
    tapered += 1;
    segments.push({ ax: core.x, ay: core.y, az: z1, bx: core.x, by: core.y, bz: z1 - taper, ra: core.r, rb: core.r * 0.2 });
  }
  return { segments, tapered };
}

function rasterCapsules(field: Float32Array, grid: number, segments: readonly Segment[]) {
  const band = NETWORK_SDF_BAND;
  const margin = networkMargin();
  for (const segment of segments) {
    const ax = insetCoord(segment.ax, grid, margin);
    const ay = insetCoord(segment.ay, grid, margin);
    const bx = insetCoord(segment.bx, grid, margin);
    const by = insetCoord(segment.by, grid, margin);
    const az = segment.az;
    const bz = segment.bz;
    const reach = Math.max(segment.ra, segment.rb) + band;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(grid - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(grid - 1, Math.ceil(Math.max(ay, by) + reach));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - reach));
    const z1 = Math.min(grid - 1, Math.ceil(Math.max(az, bz) + reach));
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const ab2 = abx * abx + aby * aby + abz * abz;
    for (let z = z0; z <= z1; z += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const row = (z * grid + y) * grid;
        for (let x = x0; x <= x1; x += 1) {
          const apx = x - ax;
          const apy = y - ay;
          const apz = z - az;
          let t = ab2 > 1e-8 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const dx = ax + abx * t - x;
          const dy = ay + aby * t - y;
          const dz = az + abz * t - z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const radius = segment.ra + (segment.rb - segment.ra) * t;
          const influence = 0.5 + (radius - dist) / (2 * band);
          if (influence <= field[row + x]) continue;
          field[row + x] = influence > 1 ? 1 : influence;
        }
      }
    }
  }
}

function blurLine(source: Float32Array, target: Float32Array, start: number, stride: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    const index = start + i * stride;
    const left = i > 0 ? source[index - stride] : 0;
    const right = i + 1 < count ? source[index + stride] : 0;
    target[index] = (left + source[index] * 2 + right) * 0.25;
  }
}

function blurField(field: Float32Array, grid: number) {
  const next = new Float32Array(field.length);
  const plane = grid * grid;
  for (let pass = 0; pass < NETWORK_BLUR_PASSES; pass += 1) {
    for (let z = 0; z < grid; z += 1) {
      for (let y = 0; y < grid; y += 1) blurLine(field, next, (z * grid + y) * grid, 1, grid);
    }
    for (let z = 0; z < grid; z += 1) {
      for (let x = 0; x < grid; x += 1) blurLine(next, field, z * plane + x, grid, grid);
    }
    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) blurLine(field, next, y * grid + x, plane, grid);
    }
    field.set(next);
  }
}

function massComponents(field: Float32Array, grid: number, level: number) {
  const seen = new Uint8Array(field.length);
  const stack: number[] = [];
  const found: number[][] = [];
  const plane = grid * grid;
  for (let start = 0; start < field.length; start += 1) {
    if (seen[start] || field[start] < level) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const z = Math.floor(index / plane);
      const rem = index - z * plane;
      const y = Math.floor(rem / grid);
      const x = rem - y * grid;
      const next = [
        x > 0 ? index - 1 : -1,
        x + 1 < grid ? index + 1 : -1,
        y > 0 ? index - grid : -1,
        y + 1 < grid ? index + grid : -1,
        z > 0 ? index - plane : -1,
        z + 1 < grid ? index + plane : -1,
      ];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || field[neighbor] < level) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    found.push(cells);
  }
  return found;
}

function pruneFragments(field: Float32Array, grid: number) {
  const found = massComponents(field, grid, 0.5);
  if (found.length <= 1) return { before: found.length, after: found.length, dropped: 0 };
  let largest = 0;
  for (const cells of found) if (cells.length > largest) largest = cells.length;
  const minimum = Math.max(1, largest * NETWORK_FRAGMENT_FRACTION);
  let dropped = 0;
  for (const cells of found) {
    if (cells.length >= minimum) continue;
    dropped += 1;
    for (const cell of cells) field[cell] = 0;
  }
  return { before: found.length, after: found.length - dropped, dropped };
}

function poolActivity(sample: VoidSample, norm: Float32Array, grid: number) {
  const activity = new Float32Array(grid * grid);
  const size = sample.trailSize;
  for (let y = 0; y < size; y += 1) {
    const gy = Math.min(grid - 1, Math.floor((y * grid) / size));
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const value = norm[row + x];
      if (value < NETWORK_ACTIVITY_LEVEL) continue;
      const gx = Math.min(grid - 1, Math.floor((x * grid) / size));
      const index = gy * grid + gx;
      if (value > activity[index]) activity[index] = value;
    }
  }
  return activity;
}

function shapeScores(field: Float32Array, grid: number) {
  let occupied = 0;
  let mass = 0;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      let layers = 0;
      for (let z = 0; z < grid; z += 1) {
        if (field[(z * grid + y) * grid + x] < 0.5) continue;
        layers += 1;
        mass += 1;
      }
      if (layers > 0) occupied += 1;
    }
  }
  return {
    occupancy: mass / (grid * grid * grid),
    footprint: occupied / (grid * grid),
    meanColumnFill: occupied ? mass / occupied / grid : 0,
  };
}

function sampleSdf(sdf: Float32Array, grid: number, x: number, y: number) {
  if (x < 0 || y < 0 || x > grid - 1 || y > grid - 1) return -NETWORK_SDF_CLAMP;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid - 1, x0 + 1);
  const y1 = Math.min(grid - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const row0 = y0 * grid;
  const row1 = y1 * grid;
  const a = sdf[row0 + x0];
  const b = sdf[row0 + x1];
  const c = sdf[row1 + x0];
  const d = sdf[row1 + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function bracketPlates<T extends { sample: { z: number } }>(plates: readonly T[], height: number) {
  if (height <= plates[0].sample.z) return { a: plates[0], b: plates[0], t: 0 };
  const last = plates[plates.length - 1];
  if (height >= last.sample.z) return { a: last, b: last, t: 0 };
  let index = 0;
  while (index < plates.length - 2 && plates[index + 1].sample.z < height) index += 1;
  const a = plates[index];
  const b = plates[index + 1];
  const span = b.sample.z - a.sample.z;
  return { a, b, t: span > 1e-8 ? (height - a.sample.z) / span : 0 };
}
export function buildNetworkVolume(samples: readonly VoidSample[]): NetworkVolume {
  const started = Date.now();
  if (samples.length < 2) throw new Error("network morphology needs at least two accepted samples");
  const ordered = [...samples].sort((left, right) => left.z - right.z);
  const size = ordered[0].trailSize;
  const positives: number[] = [];
  for (const sample of ordered) {
    if (sample.trailSize !== size) throw new Error("accepted samples must share one resolution");
    for (let i = 0; i < sample.trails.length; i += 1) if (sample.trails[i] > 0) positives.push(sample.trails[i]);
  }
  const reference = quantile(positives, NETWORK_REFERENCE_QUANTILE);
  const scale = reference > 0 ? 1 / reference : 0;
  const grid = Math.min(NETWORK_GRID, size);
  const margin = networkMargin();
  if (margin * 2 + 4 >= grid) throw new Error("network grid is too small for the tube radius");

  const plates = ordered.map((sample) => {
    const norm = new Float32Array(size * size);
    for (let i = 0; i < norm.length; i += 1) {
      const value = sample.trails[i] * scale;
      if (value > 0) norm[i] = value;
    }
    const activity = poolActivity(sample, norm, grid);
    const z = margin + sample.z * (grid - 1 - 2 * margin);
    const plate = plateCores(activity, grid, z);
    return { sample, plate };
  });

  const field = new Float32Array(grid * grid * grid);
  const z = Array.from({ length: grid }, (_, layer) => layer / (grid - 1));
  const span = grid - 1 - 2 * margin;
  const band = NETWORK_SDF_BAND;
  for (let layer = margin; layer <= grid - 1 - margin; layer += 1) {
    const height = (layer - margin) / span;
    const blend = bracketPlates(plates, height);
    for (let y = margin; y <= grid - 1 - margin; y += 1) {
      const ly = ((y - margin) / span) * (grid - 1);
      const row = (layer * grid + y) * grid;
      for (let x = margin; x <= grid - 1 - margin; x += 1) {
        const lx = ((x - margin) / span) * (grid - 1);
        const sdf = sampleSdf(blend.a.plate.sdf, grid, lx, ly) * (1 - blend.t) + sampleSdf(blend.b.plate.sdf, grid, lx, ly) * blend.t;
        const mass = 0.5 + sdf / (2 * band);
        field[row + x] = mass <= 0 ? 0 : mass >= 1 ? 1 : mass;
      }
    }
  }
  let segments = 0;
  let tapered = 0;
  for (let i = 0; i < plates.length - 1; i += 1) {
    const lower = plates[i];
    const upper = plates[i + 1];
    const linked = linkPlates(
      lower.plate.cores,
      upper.plate.cores,
      margin + lower.sample.z * span,
      margin + upper.sample.z * span,
      NETWORK_MIGRATE_CELLS,
    );
    rasterCapsules(field, grid, linked.segments);
    segments += linked.segments.length;
    tapered += linked.tapered;
  }
  blurField(field, grid);
  const pruned = pruneFragments(field, grid);
  const shape = shapeScores(field, grid);
  return {
    field,
    nx: grid,
    ny: grid,
    nz: grid,
    z,
    openingCounts: plates.map((plate) => plate.plate.cores.length),
    stats: {
      acceptedSamples: ordered.length,
      iterations: [],
      reference,
      activityLevel: NETWORK_ACTIVITY_LEVEL,
      plates: plates.map((plate) => ({
        z: plate.sample.z,
        coverage: plate.plate.coverage,
        cores: plate.plate.cores.length,
        angle: plate.plate.angle,
        radius: plate.plate.radius,
      })),
      segments,
      tapered,
      componentsBefore: pruned.before,
      componentsAfter: pruned.after,
      droppedFragments: pruned.dropped,
      occupancy: shape.occupancy,
      footprint: shape.footprint,
      meanColumnFill: shape.meanColumnFill,
      buildMs: Date.now() - started,
    },
  };
}
