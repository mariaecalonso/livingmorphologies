import type { IsoMesh } from "@/lib/scan/isomesh";
import { surfaceNets } from "@/lib/scan/isomesh";
import type { NaturalContinuation } from "@/lib/skill3/continuations";
import { MODULE_SIZE_X } from "@/lib/skill3/envelope";

/**
 * XYT_SADDLE_MACRO_FORM. The accepted stack is unchanged. A low-frequency
 * reading of that stack poses one saddle, opens a few supported caves, and
 * sets thickness. Raw trail pixels do not displace the surface. Gentle
 * fairing runs after extraction. The one-saddle baseline is not built here.
 */

const MODULE = MODULE_SIZE_X;
/** Shared macro-field blur. 0.24 replaced 0.32 after the sensitivity reading. */
export const MACRO_BLUR = 0.24;
const PLATE = 64;
const PREVIEW = 32;
const ISO = 0.5;
const FIELD_GAIN = 0.35;
const GRID = 72;
const MESH_GRID = 56;

export type MacroSlice = { z: number; values: number[] };

export type MacroControl = {
  name: string;
  kept: boolean;
  driver: string;
};

export type MacroMetrics = {
  triangles: number;
  connectedComponents: number;
  moduleOccupation: number;
  solidFraction: number;
  minWallThickness: number;
  medianWallThickness: number;
  maxWallThickness: number;
  connected: boolean;
  majorOpeningCount: number;
  largestComponentShare: number;
  meanCurvature: number;
  highFrequencyBefore: number;
  highFrequencyAfter: number;
  displacementMagnitude: number;
  migrationAlignment: number;
  branchInfluence: number;
  macroFieldDifference: number;
  rawFeatureCount: number;
  keptControlCount: number;
  solidRestored?: number;
  thinRemnantBefore?: number;
  thinRemnantAfter?: number;
  openingKept?: number;
  openingVolume?: number;
  finBefore?: number;
  finAfter?: number;
  bodyBefore?: number;
  bodyAfter?: number;
  mergedCells?: number;
  openingShift?: number;
  massChanged?: number;
  featureKept?: number;
  note: string;
};

export type MacroCase = {
  mesh: IsoMesh;
  opened: IsoMesh;
  metrics: MacroMetrics;
  continuousSlices: MacroSlice[];
  macroSlices: MacroSlice[];
  controls: MacroControl[];
  signature: Uint8Array;
  trace: string[];
};

type Sample = {
  iteration: number;
  z: number;
  persistence: number;
  migration: number;
  reinforcement: number;
  connectivityChange: number;
  plate: Float32Array;
  centroidU: number;
  centroidV: number;
};

type Volume = {
  grid: number;
  trail: Float32Array;
  change: Float32Array;
  persistence: Float32Array;
  migration: Float32Array;
  reinforcement: Float32Array;
  branch: Float32Array;
  flowU: Float32Array;
  flowV: Float32Array;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function indexOf(grid: number, x: number, y: number, z: number) {
  return (z * grid + y) * grid + x;
}

function downsample(trails: ArrayLike<number>, size: number, outSize: number) {
  const out = new Float32Array(outSize * outSize);
  for (let y = 0; y < outSize; y += 1) {
    const y0 = Math.floor((y * size) / outSize);
    const y1 = Math.max(y0 + 1, Math.min(size, Math.floor(((y + 1) * size) / outSize)));
    for (let x = 0; x < outSize; x += 1) {
      const x0 = Math.floor((x * size) / outSize);
      const x1 = Math.max(x0 + 1, Math.min(size, Math.floor(((x + 1) * size) / outSize)));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * size;
        for (let xx = x0; xx < x1; xx += 1) {
          sum += trails[row + xx];
          count += 1;
        }
      }
      out[y * outSize + x] = count ? sum / count : 0;
    }
  }
  return out;
}

function plateAt(plate: Float32Array, u: number, v: number) {
  const x = clamp(u, 0, 1) * (PLATE - 1);
  const y = clamp(v, 0, 1) * (PLATE - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(PLATE - 1, x0 + 1);
  const y1 = Math.min(PLATE - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = plate[y0 * PLATE + x0];
  const b = plate[y0 * PLATE + x1];
  const c = plate[y1 * PLATE + x0];
  const d = plate[y1 * PLATE + x1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function centroid(plate: Float32Array) {
  let u = 0;
  let v = 0;
  let weight = 0;
  for (let index = 0; index < plate.length; index += 1) {
    const value = plate[index];
    if (value < 0.12) continue;
    u += ((index % PLATE) + 0.5) / PLATE * value;
    v += (Math.floor(index / PLATE) + 0.5) / PLATE * value;
    weight += value;
  }
  if (weight <= 0) return { u: 0.5, v: 0.5 };
  return { u: u / weight, v: v / weight };
}

function samplesFrom(continuation: NaturalContinuation): Sample[] {
  const events = new Map(continuation.events.map((event) => [event.iteration, event]));
  let peak = 1e-6;
  const plates = continuation.field.slices.map((slice) => {
    const plate = downsample(slice.trails, slice.trailSize, PLATE);
    for (let index = 0; index < plate.length; index += 1) peak = Math.max(peak, plate[index]);
    return { slice, plate };
  });
  return plates
    .map(({ slice, plate }) => {
      const scaled = new Float32Array(plate.length);
      for (let index = 0; index < plate.length; index += 1) scaled[index] = plate[index] / peak;
      const event = events.get(slice.iteration);
      const center = centroid(scaled);
      return {
        iteration: slice.iteration,
        z: slice.z,
        persistence: event?.persistence ?? 1,
        migration: event?.migration ?? 0,
        reinforcement: event?.reinforcement ?? 0,
        connectivityChange: event?.connectivityChange ?? 0,
        plate: scaled,
        centroidU: center.u,
        centroidV: center.v,
      };
    })
    .sort((a, b) => a.z - b.z || a.iteration - b.iteration);
}

function bracket(samples: readonly Sample[], w: number) {
  if (w <= samples[0].z) return { left: samples[0], right: samples[0], t: 0 };
  const last = samples[samples.length - 1];
  if (w >= last.z) return { left: last, right: last, t: 0 };
  let hi = 1;
  while (hi < samples.length && samples[hi].z < w) hi += 1;
  const right = samples[hi];
  const left = samples[hi - 1];
  const span = right.z - left.z;
  return { left, right, t: span > 1e-6 ? (w - left.z) / span : 0 };
}

function boxBlur(field: Float32Array, grid: number, radius: number) {
  const r = Math.max(1, Math.round(radius));
  let current = field;
  for (let axis = 0; axis < 3; axis += 1) {
    const next = new Float32Array(current.length);
    for (let a = 0; a < grid; a += 1) {
      for (let b = 0; b < grid; b += 1) {
        const prefix = new Float64Array(grid + 1);
        for (let i = 0; i < grid; i += 1) {
          const x = axis === 0 ? i : a;
          const y = axis === 1 ? i : axis === 0 ? a : b;
          const z = axis === 2 ? i : b;
          prefix[i + 1] = prefix[i] + current[indexOf(grid, x, y, z)];
        }
        for (let i = 0; i < grid; i += 1) {
          const i0 = Math.max(0, i - r);
          const i1 = Math.min(grid - 1, i + r);
          const x = axis === 0 ? i : a;
          const y = axis === 1 ? i : axis === 0 ? a : b;
          const z = axis === 2 ? i : b;
          next[indexOf(grid, x, y, z)] = (prefix[i1 + 1] - prefix[i0]) / (i1 - i0 + 1);
        }
      }
    }
    current = next;
  }
  return current;
}

function buildVolume(samples: readonly Sample[], grid: number): Volume {
  const cells = grid * grid * grid;
  const trail = new Float32Array(cells);
  const change = new Float32Array(cells);
  const persistence = new Float32Array(cells);
  const migration = new Float32Array(cells);
  const reinforcement = new Float32Array(cells);
  const branch = new Float32Array(cells);
  const flowU = new Float32Array(cells);
  const flowV = new Float32Array(cells);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    const span = bracket(samples, w);
    const flowX = span.right.centroidU - span.left.centroidU;
    const flowY = span.right.centroidV - span.left.centroidV;
    const persist = lerp(span.left.persistence, span.right.persistence, span.t);
    const migrate = lerp(span.left.migration, span.right.migration, span.t);
    const reinforce = lerp(span.left.reinforcement, span.right.reinforcement, span.t);
    const connect = lerp(span.left.connectivityChange, span.right.connectivityChange, span.t);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const value = lerp(plateAt(span.left.plate, u, v), plateAt(span.right.plate, u, v), span.t);
        const temporal = plateAt(span.right.plate, u, v) - plateAt(span.left.plate, u, v);
        const index = indexOf(grid, x, y, z);
        trail[index] = value;
        change[index] = temporal;
        persistence[index] = persist;
        migration[index] = migrate;
        reinforcement[index] = reinforce;
        flowU[index] = flowX;
        flowV[index] = flowY;
        branch[index] = clamp01(Math.max(0, temporal) * (0.35 + connect) + value * connect * 0.5);
      }
    }
  }
  return { grid, trail, change, persistence, migration, reinforcement, branch, flowU, flowV };
}

function normalize(field: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < field.length; index += 1) {
    min = Math.min(min, field[index]);
    max = Math.max(max, field[index]);
  }
  const span = Math.max(1e-6, max - min);
  const out = new Float32Array(field.length);
  for (let index = 0; index < field.length; index += 1) out[index] = (field[index] - min) / span;
  return out;
}

function meanAbsDifference(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return sum / a.length;
}

function meanOf(field: Float32Array) {
  let sum = 0;
  for (let index = 0; index < field.length; index += 1) sum += field[index];
  return sum / field.length;
}

function gaussian(u: number, v: number, w: number, center: { u: number; v: number; w: number }, sigma: number) {
  const du = u - center.u;
  const dv = v - center.v;
  const dw = w - center.w;
  return Math.exp(-(du * du + dv * dv + dw * dw) / (2 * sigma * sigma));
}

type Point = { u: number; v: number; w: number };

function deriveControls(samples: readonly Sample[], volume: Volume) {
  let weight = 0;
  let u = 0;
  let v = 0;
  let w = 0;
  let migration = 0;
  let persistence = 0;
  let reinforcement = 0;
  let connectivity = 0;
  let flowU = 0;
  let flowV = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    const gain = 0.35 + sample.migration;
    flowU += (sample.centroidU - samples[index - 1].centroidU) * gain;
    flowV += (sample.centroidV - samples[index - 1].centroidV) * gain;
  }
  for (const sample of samples) {
    let plateMean = 0;
    for (let index = 0; index < sample.plate.length; index += 1) plateMean += sample.plate[index];
    plateMean /= sample.plate.length;
    const sampleWeight = plateMean * (0.4 + 0.6 * sample.persistence);
    weight += sampleWeight;
    u += sample.centroidU * sampleWeight;
    v += sample.centroidV * sampleWeight;
    w += sample.z * sampleWeight;
    migration += sample.migration;
    persistence += sample.persistence;
    reinforcement += sample.reinforcement;
    connectivity += sample.connectivityChange;
  }
  const count = samples.length;
  const mass = { u: u / weight, v: v / weight, w: w / weight };
  const meanMigration = migration / count;
  const meanPersistence = persistence / count;
  const meanReinforcement = reinforcement / count;
  const meanConnectivity = connectivity / count;
  const flowLength = Math.hypot(flowU, flowV);
  const massOffset = Math.hypot(mass.u - 0.5, mass.v - 0.5);
  const massKept = massOffset >= 0.035;
  const tiltKept = meanMigration >= 0.06 && flowLength >= 0.025;
  const anchorKept = meanPersistence >= 0.35 || meanReinforcement >= 0.2;
  const flow = tiltKept ? { u: flowU, v: flowV } : { u: 0, v: 0 };
  const awayU = 0.5 - mass.u;
  const awayV = 0.5 - mass.v;
  const awayLength = Math.hypot(awayU, awayV) || 1;
  const open: Point = tiltKept
    ? {
        u: clamp(mass.u + (flow.u / (flowLength || 1)) * 0.14, 0.16, 0.84),
        v: clamp(mass.v + (flow.v / (flowLength || 1)) * 0.14, 0.16, 0.84),
        w: clamp(mass.w, 0.2, 0.8),
      }
    : {
        u: clamp(mass.u + (awayU / awayLength) * 0.12, 0.16, 0.84),
        v: clamp(mass.v + (awayV / awayLength) * 0.12, 0.16, 0.84),
        w: clamp(mass.w, 0.2, 0.8),
      };
  let branchEnergy = 0;
  for (let index = 0; index < volume.branch.length; index += 1) branchEnergy += volume.branch[index];
  branchEnergy /= volume.branch.length;
  const splitKept = meanConnectivity >= 0.12 || branchEnergy >= 0.08;
  const side = Math.hypot(flow.u, flow.v) > 1e-4 ? { u: -flow.v, v: flow.u } : { u: 0, v: 1 };
  const sideLength = Math.hypot(side.u, side.v) || 1;
  const second: Point = {
    u: clamp(mass.u + (side.u / sideLength) * 0.16, 0.16, 0.84),
    v: clamp(mass.v + (side.v / sideLength) * 0.16, 0.16, 0.84),
    w: clamp(mass.w + 0.12, 0.16, 0.84),
  };
  const secondGap = Math.hypot(second.u - open.u, second.v - open.v, second.w - open.w);
  const secondKept = splitKept && secondGap >= 0.18;
  const pinchKept = tiltKept || meanMigration >= 0.08;
  const pinch: Point = {
    u: (mass.u + open.u) / 2,
    v: (mass.v + open.v) / 2,
    w: (mass.w + open.w) / 2,
  };
  const controls: MacroControl[] = [
    {
      name: "Dominant mass",
      kept: massKept,
      driver: massKept
        ? `Trail centroid sits ${massOffset.toFixed(2)} off the module center. Persistence ${meanPersistence.toFixed(2)}.`
        : "The centroid stays near the center, so the saddle is not shifted.",
    },
    {
      name: "Primary opening",
      kept: true,
      driver: tiltKept
        ? `Migration ${meanMigration.toFixed(2)} pulls the cave along the centroid path.`
        : "Migration is weak, so the cave is cut inside the mass, toward the empty side of the trail.",
    },
    {
      name: "Secondary opening",
      kept: secondKept,
      driver: secondKept
        ? `Connectivity change ${meanConnectivity.toFixed(2)} supports a second cave, separated by ${secondGap.toFixed(2)}.`
        : `Connectivity change ${meanConnectivity.toFixed(2)} does not support a second cave.`,
    },
    {
      name: "Saddle tilt",
      kept: tiltKept,
      driver: tiltKept
        ? `Centroid travel ${flowLength.toFixed(2)} at migration ${meanMigration.toFixed(2)} tilts the saddle.`
        : `Migration ${meanMigration.toFixed(2)} is too small to tilt the saddle.`,
    },
    {
      name: "Thick anchor",
      kept: anchorKept,
      driver: anchorKept
        ? `Persistence ${meanPersistence.toFixed(2)} and reinforcement ${meanReinforcement.toFixed(2)} thicken the mass.`
        : "Persistence is too weak to thicken an anchor.",
    },
    {
      name: "Neck",
      kept: pinchKept,
      driver: pinchKept
        ? "Migration marks a thinner neck between the mass and the primary cave."
        : "No strong migration, so the neck is not thinned.",
    },
  ];
  return {
    mass,
    open,
    second,
    secondKept,
    pinch,
    pinchKept,
    anchorKept,
    tiltKept,
    massKept,
    flow,
    meanMigration,
    meanPersistence,
    meanReinforcement,
    meanConnectivity,
    branchEnergy,
    controls,
  };
}

function sculpt(volume: Volume, macro: Float32Array, controls: ReturnType<typeof deriveControls>) {
  const { grid } = volume;
  const field = new Float32Array(macro.length);
  const pose = new Float32Array(macro.length);
  const tau = Math.PI * 2;
  let align = 0;
  let alignWeight = 0;
  const flowLength = Math.hypot(controls.flow.u, controls.flow.v);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const poseU = controls.massKept ? clamp((controls.mass.u - 0.5) * 1.65, -0.3, 0.3) : 0;
        const poseV = controls.massKept ? clamp((controls.mass.v - 0.5) * 1.65, -0.3, 0.3) : 0;
        const shear = controls.tiltKept ? (w - controls.mass.w) * 1.8 : 0;
        const shiftU = poseU + clamp(controls.flow.u * 2.2, -0.2, 0.2) * shear;
        const shiftV = poseV + clamp(controls.flow.v * 2.2, -0.2, 0.2) * shear;
        const shiftW = clamp((controls.mass.w - 0.5) * 0.35, -0.16, 0.16);
        const saddle = Math.cos(tau * (u + shiftU)) + Math.cos(tau * (v + shiftV)) + Math.cos(tau * (w + shiftW));
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) * 0.65 : 0;
        const offset = primary * 1.7 + secondary * 1.05;
        const presence = smoothstep(0.2, 0.62, macro[index]);
        const anchor = controls.anchorKept ? gaussian(u, v, w, controls.mass, 0.32) : 0.25;
        const rim = primary * (1 - primary) * 4;
        const neck = controls.pinchKept ? gaussian(u, v, w, controls.pinch, 0.2) : 0;
        const thickSignal = clamp01(anchor * 0.8 + macro[index] * 0.2);
        let band = lerp(0.7, 1.45, thickSignal);
        band *= lerp(0.7, 1, 1 - rim * 0.4);
        band *= lerp(0.72, 1, 1 - neck * 0.4);
        band *= lerp(0.4, 1, presence);
        const shell = ISO + (band - Math.abs(saddle - offset)) * FIELD_GAIN;
        field[index] = presence < 0.14 ? 0 : shell;
        pose[index] = Math.hypot(shiftU, shiftV, shiftW);
        if (flowLength > 1e-4 && macro[index] > 0.45) {
          const along = shiftU * controls.flow.u + shiftV * controls.flow.v;
          align += along / (Math.hypot(shiftU, shiftV) * flowLength || 1);
          alignWeight += 1;
        }
      }
    }
  }
  return {
    field,
    pose,
    migrationAlignment: alignWeight > 0 ? clamp(align / alignWeight, -1, 1) : 0,
    branchInfluence: controls.secondKept ? Math.max(controls.branchEnergy, controls.meanConnectivity) : 0,
  };
}

function components(mask: Uint8Array, grid: number) {
  const seen = new Uint8Array(mask.length);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop() as number;
      count += 1;
      const x = index % grid;
      const y = Math.floor(index / grid) % grid;
      const z = Math.floor(index / (grid * grid));
      const next = [
        x > 0 ? index - 1 : -1,
        x + 1 < grid ? index + 1 : -1,
        y > 0 ? index - grid : -1,
        y + 1 < grid ? index + grid : -1,
        z > 0 ? index - grid * grid : -1,
        z + 1 < grid ? index + grid * grid : -1,
      ];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    sizes.push(count);
  }
  sizes.sort((a, b) => b - a);
  return sizes;
}

function keepLarge(mask: Uint8Array, field: Float32Array, grid: number) {
  const sizes = components(mask, grid);
  const floor = (sizes[0] ?? 0) * 0.02;
  if (floor <= 0) return;
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop() as number;
      cells.push(index);
      const x = index % grid;
      const y = Math.floor(index / grid) % grid;
      const z = Math.floor(index / (grid * grid));
      const next = [
        x > 0 ? index - 1 : -1,
        x + 1 < grid ? index + 1 : -1,
        y > 0 ? index - grid : -1,
        y + 1 < grid ? index + grid : -1,
        z > 0 ? index - grid * grid : -1,
        z + 1 < grid ? index + grid * grid : -1,
      ];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (cells.length >= floor) continue;
    for (const index of cells) {
      mask[index] = 0;
      field[index] = 0;
    }
  }
}

function wallThickness(mask: Uint8Array, grid: number) {
  const dist = new Int16Array(mask.length);
  dist.fill(-1);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    dist[index] = 0;
    queue.push(index);
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const x = index % grid;
    const y = Math.floor(index / grid) % grid;
    const z = Math.floor(index / (grid * grid));
    const next = [
      x > 0 ? index - 1 : -1,
      x + 1 < grid ? index + 1 : -1,
      y > 0 ? index - grid : -1,
      y + 1 < grid ? index + grid : -1,
      z > 0 ? index - grid * grid : -1,
      z + 1 < grid ? index + grid * grid : -1,
    ];
    for (const neighbor of next) {
      if (neighbor < 0 || dist[neighbor] >= 0) continue;
      dist[neighbor] = dist[index] + 1;
      queue.push(neighbor);
    }
  }
  const cell = MODULE / grid;
  const medial: number[] = [];
  for (let z = 1; z < grid - 1; z += 1) {
    for (let y = 1; y < grid - 1; y += 1) {
      for (let x = 1; x < grid - 1; x += 1) {
        const index = indexOf(grid, x, y, z);
        if (!mask[index] || dist[index] < 1) continue;
        const here = dist[index];
        const neighbors = [index - 1, index + 1, index - grid, index + grid, index - grid * grid, index + grid * grid];
        if (neighbors.some((neighbor) => dist[neighbor] > here)) continue;
        medial.push(here * 2 * cell);
      }
    }
  }
  medial.sort((a, b) => a - b);
  return {
    min: medial[0] ?? 0,
    median: medial.length ? medial[Math.floor(medial.length / 2)] : 0,
    max: medial[medial.length - 1] ?? 0,
  };
}

function openingCount(mask: Uint8Array, grid: number) {
  const face = new Uint8Array(mask.length);
  const touch = (index: number) => {
    if (mask[index]) return;
    const x = index % grid;
    const y = Math.floor(index / grid) % grid;
    const z = Math.floor(index / (grid * grid));
    const next = [
      x > 0 ? index - 1 : -1,
      x + 1 < grid ? index + 1 : -1,
      y > 0 ? index - grid : -1,
      y + 1 < grid ? index + grid : -1,
      z > 0 ? index - grid * grid : -1,
      z + 1 < grid ? index + grid * grid : -1,
    ];
    if (next.some((neighbor) => neighbor >= 0 && mask[neighbor])) face[index] = 1;
  };
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      touch(indexOf(grid, x, y, 0));
      touch(indexOf(grid, x, y, grid - 1));
      touch(indexOf(grid, x, 0, y));
      touch(indexOf(grid, x, grid - 1, y));
      touch(indexOf(grid, 0, x, y));
      touch(indexOf(grid, grid - 1, x, y));
    }
  }
  const floor = Math.max(12, Math.round(grid * 0.35));
  return components(face, grid).filter((size) => size >= floor).length;
}

function occupation(mask: Uint8Array, grid: number) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let total = 0;
  for (let z = 0; z < grid; z += 1) {
    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        if (!mask[indexOf(grid, x, y, z)]) continue;
        total += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
  }
  if (!total) return { solid: 0, box: 0 };
  const span = ((maxX - minX) / (grid - 1)) * ((maxY - minY) / (grid - 1)) * ((maxZ - minZ) / (grid - 1));
  return { solid: total / mask.length, box: span };
}

function signatureOf(mask: Uint8Array, grid: number) {
  const bins = 16;
  const out = new Uint8Array(bins * bins * bins);
  for (let z = 0; z < grid; z += 1) {
    const iz = Math.min(bins - 1, Math.floor((z / grid) * bins));
    for (let y = 0; y < grid; y += 1) {
      const iy = Math.min(bins - 1, Math.floor((y / grid) * bins));
      for (let x = 0; x < grid; x += 1) {
        if (!mask[indexOf(grid, x, y, z)]) continue;
        out[(iz * bins + iy) * bins + Math.min(bins - 1, Math.floor((x / grid) * bins))] = 1;
      }
    }
  }
  return out;
}

function resample(field: Float32Array, grid: number, meshGrid: number) {
  const out = new Float32Array(meshGrid * meshGrid * meshGrid);
  for (let z = 0; z < meshGrid; z += 1) {
    const wz = (z / (meshGrid - 1)) * (grid - 1);
    const z0 = Math.floor(wz);
    const z1 = Math.min(grid - 1, z0 + 1);
    const tz = wz - z0;
    for (let y = 0; y < meshGrid; y += 1) {
      const wy = (y / (meshGrid - 1)) * (grid - 1);
      const y0 = Math.floor(wy);
      const y1 = Math.min(grid - 1, y0 + 1);
      const ty = wy - y0;
      for (let x = 0; x < meshGrid; x += 1) {
        const wx = (x / (meshGrid - 1)) * (grid - 1);
        const x0 = Math.floor(wx);
        const x1 = Math.min(grid - 1, x0 + 1);
        const tx = wx - x0;
        const sample = (ix: number, iy: number, iz: number) => field[indexOf(grid, ix, iy, iz)];
        const c00 = lerp(sample(x0, y0, z0), sample(x1, y0, z0), tx);
        const c01 = lerp(sample(x0, y0, z1), sample(x1, y0, z1), tx);
        const c10 = lerp(sample(x0, y1, z0), sample(x1, y1, z0), tx);
        const c11 = lerp(sample(x0, y1, z1), sample(x1, y1, z1), tx);
        out[indexOf(meshGrid, x, y, z)] = lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
      }
    }
  }
  return out;
}

function placeMesh(mesh: IsoMesh): IsoMesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    positions[index] = mesh.positions[index] * MODULE;
    positions[index + 1] = mesh.positions[index + 1] * MODULE;
    positions[index + 2] = mesh.positions[index + 2] * MODULE;
    const length = Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]) || 1;
    normals[index] = mesh.normals[index] / length;
    normals[index + 1] = mesh.normals[index + 1] / length;
    normals[index + 2] = mesh.normals[index + 2] / length;
  }
  return { positions, normals, indices: mesh.indices, triangles: mesh.triangles };
}

function meshField(field: Float32Array, grid: number) {
  const sampled = resample(field, grid, MESH_GRID);
  const z = Array.from({ length: MESH_GRID }, (_, index) => index / (MESH_GRID - 1));
  return placeMesh(surfaceNets(sampled, MESH_GRID, MESH_GRID, MESH_GRID, ISO, 1, z));
}

function surfaceVariation(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  if (count === 0) return 0;
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const add = (a: number, b: number) => {
    const list = neighbors[a];
    for (let i = 0; i < list.length; i += 1) if (list[i] === b) return;
    list.push(b);
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    add(a, b);
    add(b, a);
    add(b, c);
    add(c, b);
    add(c, a);
    add(a, c);
  }
  let sum = 0;
  let used = 0;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const list = neighbors[vertex];
    if (list.length < 3) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const other of list) {
      cx += mesh.positions[other * 3];
      cy += mesh.positions[other * 3 + 1];
      cz += mesh.positions[other * 3 + 2];
    }
    const inv = 1 / list.length;
    sum += Math.hypot(
      cx * inv - mesh.positions[vertex * 3],
      cy * inv - mesh.positions[vertex * 3 + 1],
      cz * inv - mesh.positions[vertex * 3 + 2],
    );
    used += 1;
  }
  return used ? sum / used : 0;
}

function fairMesh(mesh: IsoMesh): IsoMesh {
  const count = mesh.positions.length / 3;
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const add = (a: number, b: number) => {
    const list = neighbors[a];
    for (let i = 0; i < list.length; i += 1) if (list[i] === b) return;
    list.push(b);
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    add(a, b);
    add(b, a);
    add(b, c);
    add(c, b);
    add(c, a);
    add(a, c);
  }
  const meanEdge = new Float32Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const list = neighbors[vertex];
    if (!list.length) continue;
    let sum = 0;
    for (const other of list) {
      sum += Math.hypot(
        mesh.positions[other * 3] - mesh.positions[vertex * 3],
        mesh.positions[other * 3 + 1] - mesh.positions[vertex * 3 + 1],
        mesh.positions[other * 3 + 2] - mesh.positions[vertex * 3 + 2],
      );
    }
    meanEdge[vertex] = sum / list.length;
  }
  let positions = new Float32Array(mesh.positions);
  for (const lambda of [0.42, -0.45, 0.42, -0.45, 0.42, -0.45]) {
    const next = new Float32Array(positions.length);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const list = neighbors[vertex];
      const x = positions[vertex * 3];
      const y = positions[vertex * 3 + 1];
      const z = positions[vertex * 3 + 2];
      if (!list.length) {
        next[vertex * 3] = x;
        next[vertex * 3 + 1] = y;
        next[vertex * 3 + 2] = z;
        continue;
      }
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const other of list) {
        cx += positions[other * 3];
        cy += positions[other * 3 + 1];
        cz += positions[other * 3 + 2];
      }
      const inv = 1 / list.length;
      let dx = (cx * inv - x) * lambda;
      let dy = (cy * inv - y) * lambda;
      let dz = (cz * inv - z) * lambda;
      const cap = meanEdge[vertex] * 0.55;
      const length = Math.hypot(dx, dy, dz);
      if (length > cap && length > 0) {
        const scale = cap / length;
        dx *= scale;
        dy *= scale;
        dz *= scale;
      }
      next[vertex * 3] = x + dx;
      next[vertex * 3 + 1] = y + dy;
      next[vertex * 3 + 2] = z + dz;
    }
    positions = next;
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3;
    const b = mesh.indices[i + 1] * 3;
    const c = mesh.indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let vertex = 0; vertex < count; vertex += 1) {
    const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]) || 1;
    normals[vertex * 3] /= length;
    normals[vertex * 3 + 1] /= length;
    normals[vertex * 3 + 2] /= length;
  }
  return { positions, normals, indices: mesh.indices, triangles: mesh.triangles };
}

function slicesOf(field: Float32Array, grid: number, heights: number[]): MacroSlice[] {
  return heights.map((z) => {
    const values = new Array<number>(PREVIEW * PREVIEW);
    const gz = Math.round(z * (grid - 1));
    let peak = 1e-6;
    for (let y = 0; y < PREVIEW; y += 1) {
      const gy = Math.round((y / (PREVIEW - 1)) * (grid - 1));
      for (let x = 0; x < PREVIEW; x += 1) {
        const gx = Math.round((x / (PREVIEW - 1)) * (grid - 1));
        peak = Math.max(peak, field[indexOf(grid, gx, gy, gz)]);
      }
    }
    for (let y = 0; y < PREVIEW; y += 1) {
      const gy = Math.round((y / (PREVIEW - 1)) * (grid - 1));
      for (let x = 0; x < PREVIEW; x += 1) {
        const gx = Math.round((x / (PREVIEW - 1)) * (grid - 1));
        values[y * PREVIEW + x] = field[indexOf(grid, gx, gy, gz)] / peak;
      }
    }
    return { z, values };
  });
}

function neighborsOf(index: number, grid: number) {
  const x = index % grid;
  const y = Math.floor(index / grid) % grid;
  const z = Math.floor(index / (grid * grid));
  const next: number[] = [];
  if (x > 0) next.push(index - 1);
  if (x + 1 < grid) next.push(index + 1);
  if (y > 0) next.push(index - grid);
  if (y + 1 < grid) next.push(index + grid);
  if (z > 0) next.push(index - grid * grid);
  if (z + 1 < grid) next.push(index + grid * grid);
  return next;
}

function distanceToEmpty(mask: Uint8Array, grid: number) {
  const dist = new Int16Array(mask.length);
  dist.fill(-1);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    dist[index] = 0;
    queue.push(index);
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    for (const neighbor of neighborsOf(index, grid)) {
      if (dist[neighbor] >= 0) continue;
      dist[neighbor] = dist[index] + 1;
      queue.push(neighbor);
    }
  }
  return dist;
}

function thinMedialCount(mask: Uint8Array, grid: number) {
  const dist = distanceToEmpty(mask, grid);
  const plane = grid * grid;
  let count = 0;
  for (let z = 1; z < grid - 1; z += 1) {
    for (let y = 1; y < grid - 1; y += 1) {
      for (let x = 1; x < grid - 1; x += 1) {
        const index = indexOf(grid, x, y, z);
        const here = dist[index];
        if (!mask[index] || here < 1 || here > 2) continue;
        const neighbors = [index - 1, index + 1, index - grid, index + grid, index - plane, index + plane];
        if (neighbors.some((neighbor) => dist[neighbor] > here)) continue;
        count += 1;
      }
    }
  }
  return count;
}

function solidWithin(index: number, step: number, reach: number, grid: number, mask: Uint8Array) {
  let cursor = index;
  for (let hop = 1; hop <= reach; hop += 1) {
    const x = cursor % grid;
    const y = Math.floor(cursor / grid) % grid;
    const z = Math.floor(cursor / (grid * grid));
    if (step === -1 && x === 0) return false;
    if (step === 1 && x + 1 >= grid) return false;
    if (step === -grid && y === 0) return false;
    if (step === grid && y + 1 >= grid) return false;
    if (step === -grid * grid && z === 0) return false;
    if (step === grid * grid && z + 1 >= grid) return false;
    cursor += step;
    if (mask[cursor]) return true;
  }
  return false;
}

function bridgingGap(index: number, mask: Uint8Array, grid: number) {
  const plane = grid * grid;
  const across = (step: number) => solidWithin(index, -step, 2, grid, mask) && solidWithin(index, step, 2, grid, mask);
  return across(1) || across(grid) || across(plane);
}

function retainMass(
  source: Float32Array,
  macro: Float32Array,
  volume: Volume,
  controls: ReturnType<typeof deriveControls>,
) {
  const { grid } = volume;
  const field = new Float32Array(source);
  const mask = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) if (field[index] >= ISO) mask[index] = 1;
  const solidBefore = mask.reduce((sum, value) => sum + value, 0);
  const thinBefore = thinMedialCount(mask, grid);
  const core = new Uint8Array(field.length);
  const protectedVoid = new Uint8Array(field.length);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) : 0;
        if (primary > 0.5 || secondary > 0.48) core[index] = 1;
      }
    }
  }
  protectedVoid.set(core);
  for (let index = 0; index < core.length; index += 1) {
    if (!core[index]) continue;
    for (const neighbor of neighborsOf(index, grid)) protectedVoid[neighbor] = 1;
  }
  let coreEmptyBefore = 0;
  for (let index = 0; index < core.length; index += 1) if (core[index] && !mask[index]) coreEmptyBefore += 1;
  const originDist = distanceToEmpty(mask, grid);
  const slits: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] || protectedVoid[index] || macro[index] < 0.26) continue;
    if (!bridgingGap(index, mask, grid)) continue;
    slits.push(index);
  }
  for (const index of slits) {
    mask[index] = 1;
    field[index] = 0.64;
  }
  const target = new Float32Array(field.length);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const neck = controls.pinchKept ? gaussian(u, v, w, controls.pinch, 0.2) : 0;
        const anchor = controls.anchorKept ? gaussian(u, v, w, controls.mass, 0.32) : 0;
        const importance = clamp01(macro[index] * 0.6 + volume.persistence[index] * 0.4);
        let band = importance > 0.62 || anchor > 0.4 ? 6.2 : 5.2;
        if ((primary > 0.22 && primary <= 0.5) || neck > 0.35) band = Math.min(band, 2.4);
        target[index] = band;
      }
    }
  }
  const blurred = boxBlur(target, grid, 5);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const neck = controls.pinchKept ? gaussian(u, v, w, controls.pinch, 0.2) : 0;
        if (protectedVoid[index] || primary > 0.4 || neck > 0.4) blurred[index] = Math.min(blurred[index], 2.2);
      }
    }
  }
  const budget = new Int16Array(field.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || originDist[index] < 1) continue;
    budget[index] = Math.max(0, Math.round(blurred[index] - originDist[index]));
  }
  for (let pass = 0; pass < 6; pass += 1) {
    const grow: number[] = [];
    const nextBudget: number[] = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] || protectedVoid[index] || macro[index] < 0.16) continue;
      let remaining = -1;
      for (const neighbor of neighborsOf(index, grid)) {
        if (!mask[neighbor] || budget[neighbor] <= 0) continue;
        remaining = Math.max(remaining, budget[neighbor] - 1);
      }
      if (remaining < 0) continue;
      grow.push(index);
      nextBudget.push(remaining);
    }
    for (let added = 0; added < grow.length; added += 1) {
      const index = grow[added];
      mask[index] = 1;
      field[index] = 0.64;
      budget[index] = nextBudget[added];
    }
  }
  for (let index = 0; index < core.length; index += 1) {
    if (!core[index] || originDist[index] > 0) continue;
    mask[index] = 0;
    field[index] = 0;
  }
  let solidAfter = 0;
  let coreEmptyAfter = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) solidAfter += 1;
    if (core[index] && !mask[index]) coreEmptyAfter += 1;
  }
  return {
    field,
    solidRestored: solidBefore > 0 ? (solidAfter - solidBefore) / solidBefore : 0,
    thinRemnantBefore: thinBefore,
    thinRemnantAfter: thinMedialCount(mask, grid),
    openingKept: coreEmptyBefore > 0 ? coreEmptyAfter / coreEmptyBefore : 1,
  };
}

function openingVoidSize(mask: Uint8Array, controls: ReturnType<typeof deriveControls>, grid: number) {
  let count = 0;
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) : 0;
        if ((primary > 0.5 || secondary > 0.48) && !mask[indexOf(grid, x, y, z)]) count += 1;
      }
    }
  }
  return count;
}

function architecturalCleanup(
  source: Float32Array,
  macro: Float32Array,
  volume: Volume,
  controls: ReturnType<typeof deriveControls>,
) {
  const { grid } = volume;
  const field = new Float32Array(source);
  const mask = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) if (field[index] >= ISO) mask[index] = 1;
  const thinBefore = thinMedialCount(mask, grid);
  const openingBefore = openingVoidSize(mask, controls, grid);
  const core = new Uint8Array(field.length);
  const guard = new Uint8Array(field.length);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) : 0;
        const neck = controls.pinchKept ? gaussian(u, v, w, controls.pinch, 0.2) : 0;
        if (primary > 0.5 || secondary > 0.48) core[index] = 1;
        if (primary > 0.28 || secondary > 0.3 || neck > 0.32) guard[index] = 1;
      }
    }
  }
  const paperDist = distanceToEmpty(mask, grid);
  const paper = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || guard[index] || paperDist[index] > 2) continue;
    paper[index] = 1;
  }
  const reach = new Int16Array(mask.length);
  reach.fill(-1);
  const queue: number[] = [];
  for (let index = 0; index < paper.length; index += 1) {
    if (!paper[index]) continue;
    for (const neighbor of neighborsOf(index, grid)) {
      if (!mask[neighbor] || paperDist[neighbor] < 3) continue;
      reach[index] = 0;
      queue.push(index);
      break;
    }
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    for (const neighbor of neighborsOf(index, grid)) {
      if (!paper[neighbor] || reach[neighbor] >= 0) continue;
      reach[neighbor] = reach[index] + 1;
      queue.push(neighbor);
    }
  }
  const baseParts = components(mask, grid).length;
  const clipped: number[] = [];
  for (let index = 0; index < paper.length; index += 1) {
    if (!paper[index] || reach[index] < 4) continue;
    clipped.push(index);
    mask[index] = 0;
  }
  if (components(mask, grid).length > baseParts) {
    for (const index of clipped) mask[index] = 1;
  } else {
    for (const index of clipped) field[index] = 0;
  }
  const dist = distanceToEmpty(mask, grid);
  const support: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] || core[index] || macro[index] < 0.22) continue;
    let paper = false;
    for (const neighbor of neighborsOf(index, grid)) {
      if (!mask[neighbor] || guard[neighbor] || dist[neighbor] > 1) continue;
      let thick = false;
      let solids = 0;
      for (const other of neighborsOf(neighbor, grid)) {
        if (!mask[other]) continue;
        solids += 1;
        if (dist[other] >= 2) thick = true;
      }
      if (!thick && solids >= 4) paper = true;
    }
    if (paper) support.push(index);
  }
  for (const index of support) {
    mask[index] = 1;
    field[index] = 0.66;
  }
  for (let index = 0; index < core.length; index += 1) {
    if (!core[index] || source[index] >= ISO) continue;
    field[index] = 0;
    mask[index] = 0;
  }
  return {
    field,
    thinBefore,
    thinAfter: thinMedialCount(mask, grid),
    openingBefore,
    openingAfter: openingVoidSize(mask, controls, grid),
  };
}

function relaxArchitectural(mesh: IsoMesh, controls: ReturnType<typeof deriveControls>): IsoMesh {
  const count = mesh.positions.length / 3;
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const add = (a: number, b: number) => {
    const list = neighbors[a];
    for (let i = 0; i < list.length; i += 1) if (list[i] === b) return;
    list.push(b);
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    add(a, b);
    add(b, a);
    add(b, c);
    add(c, b);
    add(c, a);
    add(a, c);
  }
  const anchors = [controls.open];
  if (controls.secondKept) anchors.push(controls.second);
  let positions = new Float32Array(mesh.positions);
  for (let pass = 0; pass < 8; pass += 1) {
    const next = new Float32Array(positions.length);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const list = neighbors[vertex];
      const x = positions[vertex * 3];
      const y = positions[vertex * 3 + 1];
      const z = positions[vertex * 3 + 2];
      if (list.length < 3) {
        next[vertex * 3] = x;
        next[vertex * 3 + 1] = y;
        next[vertex * 3 + 2] = z;
        continue;
      }
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let edge = 0;
      for (const other of list) {
        cx += positions[other * 3];
        cy += positions[other * 3 + 1];
        cz += positions[other * 3 + 2];
        edge += Math.hypot(positions[other * 3] - x, positions[other * 3 + 1] - y, positions[other * 3 + 2] - z);
      }
      const inv = 1 / list.length;
      const oneX = cx * inv;
      const oneY = cy * inv;
      const oneZ = cz * inv;
      edge *= inv;
      const offset = Math.hypot(oneX - x, oneY - y, oneZ - z);
      const spike = edge > 1e-6 ? offset / edge : 0;
      let targetX = oneX;
      let targetY = oneY;
      let targetZ = oneZ;
      if (spike > 0.55) {
        const ring = new Set<number>(list);
        for (const other of list) for (const far of neighbors[other]) if (far !== vertex) ring.add(far);
        let rx = 0;
        let ry = 0;
        let rz = 0;
        for (const other of ring) {
          rx += positions[other * 3];
          ry += positions[other * 3 + 1];
          rz += positions[other * 3 + 2];
        }
        const rinv = 1 / ring.size;
        targetX = rx * rinv;
        targetY = ry * rinv;
        targetZ = rz * rinv;
      }
      cx = targetX;
      cy = targetY;
      cz = targetZ;
      let lambda = spike > 0.7 ? 0.92 : spike > 0.38 ? 0.48 : 0.16;
      let damp = 0;
      for (const anchor of anchors) {
        const distance = Math.hypot(x - anchor.u * MODULE, y - anchor.v * MODULE, z - anchor.w * MODULE);
        const rim = MODULE * 0.26;
        if (distance < rim) damp = Math.max(damp, 1 - distance / rim);
      }
      lambda *= 1 - damp * 0.75;
      let dx = (cx - x) * lambda;
      let dy = (cy - y) * lambda;
      let dz = (cz - z) * lambda;
      const cap = edge * (spike > 0.7 ? 0.9 : 0.3);
      const length = Math.hypot(dx, dy, dz);
      if (length > cap && length > 0) {
        const scale = cap / length;
        dx *= scale;
        dy *= scale;
        dz *= scale;
      }
      next[vertex * 3] = x + dx;
      next[vertex * 3 + 1] = y + dy;
      next[vertex * 3 + 2] = z + dz;
    }
    positions = next;
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3;
    const b = mesh.indices[i + 1] * 3;
    const c = mesh.indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let vertex = 0; vertex < count; vertex += 1) {
    const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]) || 1;
    normals[vertex * 3] /= length;
    normals[vertex * 3 + 1] /= length;
    normals[vertex * 3 + 2] /= length;
  }
  return { positions, normals, indices: mesh.indices, triangles: mesh.triangles };
}

export function macroSignatureDifference(a: Uint8Array, b: Uint8Array) {
  let union = 0;
  let shared = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ? 1 : 0;
    const right = b[index] ? 1 : 0;
    union += left || right ? 1 : 0;
    shared += left && right ? 1 : 0;
  }
  return union > 0 ? 1 - shared / union : 0;
}

function consolidateBody(
  source: Float32Array,
  macro: Float32Array,
  volume: Volume,
  controls: ReturnType<typeof deriveControls>,
) {
  const { grid } = volume;
  const field = new Float32Array(source);
  const mask = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) if (field[index] >= ISO) mask[index] = 1;
  const thinBefore = thinMedialCount(mask, grid);
  const openingBefore = openingVoidSize(mask, controls, grid);
  const dist = distanceToEmpty(mask, grid);
  const core = new Uint8Array(field.length);
  const importance = new Float32Array(field.length);
  const primaryAt = new Float32Array(field.length);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) : 0;
        const anchor = controls.anchorKept ? gaussian(u, v, w, controls.mass, 0.32) : 0;
        primaryAt[index] = Math.max(primary, secondary);
        if (primary > 0.5 || secondary > 0.48) core[index] = 1;
        importance[index] = clamp01(macro[index] * 0.62 + volume.persistence[index] * 0.23 + anchor * 0.15);
      }
    }
  }
  const broad = boxBlur(importance, grid, 6);
  const shell: number[] = [];
  for (let index = 0; index < mask.length; index += 1) if (mask[index] && dist[index] <= 2) shell.push(broad[index]);
  shell.sort((left, right) => left - right);
  const cutoff = shell[Math.floor(shell.length * 0.22)] ?? 0;
  const fin = new Uint8Array(field.length);
  const body = new Uint8Array(field.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    let solids = 0;
    for (const neighbor of neighborsOf(index, grid)) if (mask[neighbor]) solids += 1;
    if (dist[index] <= 2 && broad[index] <= cutoff && solids <= 4) fin[index] = 1;
    else body[index] = 1;
  }
  let finBefore = 0;
  let bodyBefore = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (fin[index]) finBefore += 1;
    if (body[index]) bodyBefore += 1;
  }
  const original = new Uint8Array(mask);
  const allow = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) {
    if (core[index] || primaryAt[index] > 0.46) continue;
    if (macro[index] < 0.12 && broad[index] < 0.16) continue;
    allow[index] = 1;
  }
  const radius = 11;
  let closed = mask;
  for (let pass = 0; pass < radius; pass += 1) {
    const next = new Uint8Array(closed);
    for (let index = 0; index < closed.length; index += 1) {
      if (closed[index] || !allow[index]) continue;
      for (const neighbor of neighborsOf(index, grid)) {
        if (!closed[neighbor]) continue;
        next[index] = 1;
        break;
      }
    }
    closed = next;
  }
  for (let pass = 0; pass < radius; pass += 1) {
    const drop: number[] = [];
    for (let index = 0; index < closed.length; index += 1) {
      if (!closed[index] || original[index]) continue;
      for (const neighbor of neighborsOf(index, grid)) {
        if (closed[neighbor]) continue;
        drop.push(index);
        break;
      }
    }
    if (!drop.length) break;
    const next = new Uint8Array(closed);
    for (const index of drop) next[index] = 0;
    closed = next;
  }
  let mergedCells = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (original[index] || !closed[index]) continue;
    mask[index] = 1;
    field[index] = 0.66;
    body[index] = 1;
    mergedCells += 1;
  }
  const fromSolid = new Int16Array(mask.length);
  fromSolid.fill(-1);
  {
    const queue: number[] = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      fromSolid[index] = 0;
      queue.push(index);
    }
    let head = 0;
    while (head < queue.length) {
      const index = queue[head];
      head += 1;
      if (fromSolid[index] >= 4) continue;
      for (const neighbor of neighborsOf(index, grid)) {
        if (fromSolid[neighbor] >= 0) continue;
        fromSolid[neighbor] = fromSolid[index] + 1;
        queue.push(neighbor);
      }
    }
  }
  const steps = [1, grid, grid * grid];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] || !allow[index] || fromSolid[index] < 1 || fromSolid[index] > 4) continue;
    let hits = 0;
    for (const step of steps) {
      if (solidWithin(index, step, 16, grid, mask) && solidWithin(index, -step, 16, grid, mask)) hits += 1;
    }
    if (hits < 1) continue;
    mask[index] = 1;
    field[index] = 0.66;
    body[index] = 1;
    mergedCells += 1;
  }
  const baseParts = components(mask, grid).length;
  const tips: number[] = [];
  for (let index = 0; index < fin.length; index += 1) {
    if (!fin[index] || !mask[index]) continue;
    let solids = 0;
    for (const neighbor of neighborsOf(index, grid)) if (mask[neighbor]) solids += 1;
    if (solids === 1) tips.push(index);
  }
  for (const index of tips) {
    mask[index] = 0;
    field[index] = 0;
  }
  if (components(mask, grid).length > baseParts) {
    for (const index of tips) {
      mask[index] = 1;
      field[index] = Math.max(source[index], 0.66);
    }
  }
  const blurred = boxBlur(field, grid, 6);
  for (let index = 0; index < field.length; index += 1) {
    if (core[index] && source[index] < ISO) {
      field[index] = 0;
      mask[index] = 0;
      continue;
    }
    if (original[index] && mask[index]) {
      field[index] = Math.max(0.62, source[index] * 0.42 + blurred[index] * 0.58);
      continue;
    }
    if (mask[index]) {
      field[index] = Math.max(0.6, blurred[index]);
      continue;
    }
    field[index] = 0;
  }
  for (let index = 0; index < core.length; index += 1) {
    if (!core[index] || source[index] >= ISO) continue;
    field[index] = 0;
    mask[index] = 0;
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) field[index] = Math.max(field[index], 0.6);
    else field[index] = 0;
  }
  keepLarge(mask, field, grid);
  const finalDist = distanceToEmpty(mask, grid);
  let finAfter = 0;
  let bodyAfter = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }
    if (fin[index]) {
      let solids = 0;
      for (const neighbor of neighborsOf(index, grid)) if (mask[neighbor]) solids += 1;
      if (finalDist[index] <= 2 && solids <= 4) finAfter += 1;
      else bodyAfter += 1;
      continue;
    }
    bodyAfter += 1;
  }
  return {
    field,
    thinBefore,
    thinAfter: thinMedialCount(mask, grid),
    openingBefore,
    openingAfter: openingVoidSize(mask, controls, grid),
    finBefore,
    finAfter,
    bodyBefore,
    bodyAfter,
    mergedCells,
  };
}

function distanceOutside(mask: Uint8Array, grid: number) {
  const dist = new Int16Array(mask.length);
  dist.fill(-1);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    dist[index] = 0;
    queue.push(index);
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const next = dist[index] + 1;
    for (const neighbor of neighborsOf(index, grid)) {
      if (dist[neighbor] >= 0) continue;
      dist[neighbor] = next;
      queue.push(neighbor);
    }
  }
  return dist;
}

function smoothBodyEnvelope(
  source: Float32Array,
  macro: Float32Array,
  volume: Volume,
  controls: ReturnType<typeof deriveControls>,
) {
  const { grid } = volume;
  const mask = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index += 1) if (source[index] >= ISO) mask[index] = 1;
  const thinBefore = thinMedialCount(mask, grid);
  const openingBefore = openingVoidSize(mask, controls, grid);
  const inside = distanceToEmpty(mask, grid);
  const outside = distanceOutside(mask, grid);
  const sdf = new Float32Array(source.length);
  const core = new Uint8Array(source.length);
  const primaryAt = new Float32Array(source.length);
  const importance = new Float32Array(source.length);
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const u = x / (grid - 1);
        const index = indexOf(grid, x, y, z);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) : 0;
        const anchor = controls.anchorKept ? gaussian(u, v, w, controls.mass, 0.32) : 0;
        primaryAt[index] = Math.max(primary, secondary);
        if ((primary > 0.5 || secondary > 0.48) && !mask[index]) core[index] = 1;
        importance[index] = clamp01(macro[index] * 0.5 + volume.persistence[index] * 0.22 + anchor * 0.18 + volume.branch[index] * 0.1);
        sdf[index] = mask[index] ? -inside[index] : outside[index];
      }
    }
  }
  const shell: number[] = [];
  const broad = boxBlur(importance, grid, 6);
  for (let index = 0; index < mask.length; index += 1) if (mask[index] && inside[index] <= 2) shell.push(broad[index]);
  shell.sort((left, right) => left - right);
  const cutoff = shell[Math.floor(shell.length * 0.22)] ?? 0;
  const fin = new Uint8Array(mask.length);
  let finBefore = 0;
  let bodyBefore = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    let solids = 0;
    for (const neighbor of neighborsOf(index, grid)) if (mask[neighbor]) solids += 1;
    if (inside[index] <= 2 && broad[index] <= cutoff && solids <= 4) {
      fin[index] = 1;
      finBefore += 1;
    } else bodyBefore += 1;
  }
  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  let centerCount = 0;
  for (let z = 0; z < grid; z += 1) {
    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        const index = indexOf(grid, x, y, z);
        if (!core[index]) continue;
        centerX += x;
        centerY += y;
        centerZ += z;
        centerCount += 1;
      }
    }
  }
  const blurred = boxBlur(boxBlur(sdf, grid, 7), grid, 5);
  const mixed = new Float32Array(sdf.length);
  for (let index = 0; index < sdf.length; index += 1) {
    let alpha = 0.8;
    if (importance[index] > 0.62 && inside[index] >= 4) alpha = 0.32;
    if (primaryAt[index] > 0.16 && primaryAt[index] < 0.5) alpha = Math.min(alpha, 0.28);
    if (fin[index]) alpha = 0.95;
    mixed[index] = sdf[index] * (1 - alpha) + blurred[index] * alpha;
  }
  const curved = boxBlur(mixed, grid, 3);
  const field = new Float32Array(curved.length);
  for (let index = 0; index < curved.length; index += 1) {
    let value = 0.5 - curved[index] * 0.16;
    if (!mask[index] && primaryAt[index] > 0.28) {
      const protect = clamp01((primaryAt[index] - 0.28) / 0.2);
      value *= 1 - protect;
    }
    if (core[index]) value = 0;
    field[index] = clamp01(value);
  }
  const next = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) if (field[index] >= ISO) next[index] = 1;
  keepLarge(next, field, grid);
  for (let index = 0; index < core.length; index += 1) {
    if (!core[index]) continue;
    next[index] = 0;
    field[index] = 0;
  }
  let solidBefore = 0;
  let removed = 0;
  let added = 0;
  let support = 0;
  let supportKept = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) solidBefore += 1;
    if (mask[index] && !next[index]) removed += 1;
    if (!mask[index] && next[index]) added += 1;
    if (mask[index] && (importance[index] > 0.55 || broad[index] > 0.5)) {
      support += 1;
      if (next[index]) supportKept += 1;
    }
  }
  const finalInside = distanceToEmpty(next, grid);
  let finAfter = 0;
  let bodyAfter = 0;
  for (let index = 0; index < next.length; index += 1) {
    if (!next[index]) continue;
    let solids = 0;
    for (const neighbor of neighborsOf(index, grid)) if (next[neighbor]) solids += 1;
    if (fin[index] && finalInside[index] <= 2 && solids <= 4) finAfter += 1;
    else bodyAfter += 1;
  }
  let afterX = 0;
  let afterY = 0;
  let afterZ = 0;
  let afterCount = 0;
  for (let z = 0; z < grid; z += 1) {
    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        const index = indexOf(grid, x, y, z);
        if (!core[index] || next[index]) continue;
        afterX += x;
        afterY += y;
        afterZ += z;
        afterCount += 1;
      }
    }
  }
  const openingShift = centerCount > 0 && afterCount > 0
    ? Math.hypot(afterX / afterCount - centerX / centerCount, afterY / afterCount - centerY / centerCount, afterZ / afterCount - centerZ / centerCount) * (MODULE / (grid - 1))
    : 0;
  return {
    field,
    thinBefore,
    thinAfter: thinMedialCount(next, grid),
    openingBefore,
    openingAfter: openingVoidSize(next, controls, grid),
    finBefore,
    finAfter,
    bodyBefore,
    bodyAfter,
    mergedCells: added,
    openingShift,
    massChanged: solidBefore > 0 ? (removed + added) / solidBefore : 0,
    featureKept: support > 0 ? supportKept / support : 1,
  };
}

export function buildXytMacroCase(continuation: NaturalContinuation, retain = false, fair = false, consolidate = false, envelope = false): MacroCase {
  const samples = samplesFrom(continuation);
  if (samples.length < 2) throw new Error(`${continuation.id} needs at least two accepted temporal samples`);
  const volume = buildVolume(samples, GRID);
  const macro = normalize(boxBlur(volume.trail, GRID, GRID * MACRO_BLUR));
  const raw = normalize(volume.trail);
  const macroFieldDifference = meanAbsDifference(raw, macro);
  let rawFeatureCount = 0;
  const rawPeak = meanOf(raw) + 0.35;
  for (let index = 0; index < raw.length; index += 1) if (raw[index] > rawPeak) rawFeatureCount += 1;
  const controls = deriveControls(samples, volume);
  const sculpted = sculpt(volume, macro, controls);
  const mask = new Uint8Array(sculpted.field.length);
  for (let index = 0; index < mask.length; index += 1) if (sculpted.field[index] >= ISO) mask[index] = 1;
  keepLarge(mask, sculpted.field, GRID);
  for (let index = 0; index < mask.length; index += 1) if (!mask[index]) sculpted.field[index] = 0;
  const retained = retain || fair || consolidate || envelope ? retainMass(sculpted.field, macro, volume, controls) : null;
  const cleaned = fair && retained && !envelope ? architecturalCleanup(retained.field, macro, volume, controls) : null;
  const consolidated = consolidate && retained && !fair && !envelope ? consolidateBody(retained.field, macro, volume, controls) : null;
  const enveloped = envelope && retained ? smoothBodyEnvelope(retained.field, macro, volume, controls) : null;
  const field = enveloped ? enveloped.field : cleaned ? cleaned.field : consolidated ? consolidated.field : retained ? retained.field : sculpted.field;
  const solidMask = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) if (field[index] >= ISO) solidMask[index] = 1;
  const opened = meshField(field, GRID);
  const before = surfaceVariation(opened);
  const smoothed = fairMesh(opened);
  const mesh = fair ? relaxArchitectural(smoothed, controls) : smoothed;
  const after = surfaceVariation(mesh);
  const sizes = components(solidMask, GRID);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const walls = wallThickness(solidMask, GRID);
  const cover = occupation(solidMask, GRID);
  const share = total > 0 ? (sizes[0] ?? 0) / total : 0;
  const openings = openingCount(solidMask, GRID);
  const kept = controls.controls.filter((control) => control.kept);
  let poseSum = 0;
  for (let index = 0; index < sculpted.pose.length; index += 1) poseSum += sculpted.pose[index];
  const displacementMagnitude = (poseSum / sculpted.pose.length) * MODULE;
  const note = enveloped
    ? "Smooth body envelope. A low-frequency field rebuilds the retained mass around the opening."
    : consolidated
    ? "Body consolidation. The opening stays, and the surrounding sheet joins into one broader mass."
    : cleaned
      ? "Architectural fairing. The retained mass, with fins and striations eased back into the same surface."
      : retained
      ? "Retained mass. Thin macro remnants widen into a continuous body around the opening."
      : kept.length >= 3
        ? "Macro saddle. A few stack-derived moves shape one porous body."
        : "Macro saddle. Few stack events were strong enough to move the form.";
  const trace = [
    `${rawFeatureCount} raw concentrations reduced to ${kept.length} macro controls.`,
    ...controls.controls.map((control) => `${control.kept ? "Kept" : "Dropped"} ${control.name}. ${control.driver}`),
  ];
  return {
    mesh,
    opened,
    metrics: {
      triangles: mesh.triangles,
      connectedComponents: sizes.length,
      moduleOccupation: cover.box,
      solidFraction: cover.solid,
      minWallThickness: walls.min,
      medianWallThickness: walls.median,
      maxWallThickness: walls.max,
      connected: sizes.length === 1 || share >= 0.9,
      majorOpeningCount: openings,
      largestComponentShare: share,
      meanCurvature: after,
      highFrequencyBefore: before,
      highFrequencyAfter: after,
      displacementMagnitude,
      migrationAlignment: Math.abs(sculpted.migrationAlignment),
      branchInfluence: sculpted.branchInfluence,
      macroFieldDifference,
      rawFeatureCount,
      keptControlCount: kept.length,
      solidRestored: retained?.solidRestored,
      thinRemnantBefore: enveloped ? enveloped.thinBefore : consolidated ? consolidated.thinBefore : cleaned ? cleaned.thinBefore : retained?.thinRemnantBefore,
      thinRemnantAfter: enveloped ? enveloped.thinAfter : consolidated ? consolidated.thinAfter : cleaned ? cleaned.thinAfter : retained?.thinRemnantAfter,
      openingKept: enveloped && enveloped.openingBefore > 0
        ? enveloped.openingAfter / enveloped.openingBefore
        : consolidated && consolidated.openingBefore > 0
        ? consolidated.openingAfter / consolidated.openingBefore
        : cleaned && cleaned.openingBefore > 0
          ? cleaned.openingAfter / cleaned.openingBefore
          : retained?.openingKept,
      openingVolume: enveloped ? enveloped.openingAfter : consolidated ? consolidated.openingAfter : cleaned ? cleaned.openingAfter : retained ? openingVoidSize(solidMask, controls, GRID) : undefined,
      finBefore: enveloped?.finBefore ?? consolidated?.finBefore,
      finAfter: enveloped?.finAfter ?? consolidated?.finAfter,
      bodyBefore: enveloped?.bodyBefore ?? consolidated?.bodyBefore,
      bodyAfter: enveloped?.bodyAfter ?? consolidated?.bodyAfter,
      mergedCells: enveloped?.mergedCells ?? consolidated?.mergedCells,
      openingShift: enveloped?.openingShift,
      massChanged: enveloped?.massChanged,
      featureKept: enveloped?.featureKept,
      note,
    },
    continuousSlices: slicesOf(volume.trail, GRID, [0.2, 0.5, 0.8]),
    macroSlices: slicesOf(macro, GRID, [0.2, 0.5, 0.8]),
    controls: controls.controls,
    signature: signatureOf(solidMask, GRID),
    trace,
  };
}

/** Normalized field coordinate to the module frame used by the clay mesh. */
function modulePoint(u: number, v: number, w: number): [number, number, number] {
  return [(u - 0.5) * MODULE, (w - 0.5) * MODULE, (v - 0.5) * MODULE];
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function principalAxis(
  xx: number,
  xy: number,
  xz: number,
  yy: number,
  yz: number,
  zz: number,
) {
  const apply = (vx: number, vy: number, vz: number) => ({
    x: xx * vx + xy * vy + xz * vz,
    y: xy * vx + yy * vy + yz * vz,
    z: xz * vx + yz * vy + zz * vz,
  });
  let vx = 1;
  let vy = 1;
  let vz = 1;
  for (let pass = 0; pass < 18; pass += 1) {
    const next = apply(vx, vy, vz);
    const length = Math.hypot(next.x, next.y, next.z) || 1;
    vx = next.x / length;
    vy = next.y / length;
    vz = next.z / length;
  }
  const primaryRay = apply(vx, vy, vz);
  const primary = vx * primaryRay.x + vy * primaryRay.y + vz * primaryRay.z;
  const dxx = xx - primary * vx * vx;
  const dxy = xy - primary * vx * vy;
  const dxz = xz - primary * vx * vz;
  const dyy = yy - primary * vy * vy;
  const dyz = yz - primary * vy * vz;
  const dzz = zz - primary * vz * vz;
  const applySecond = (ux: number, uy: number, uz: number) => ({
    x: dxx * ux + dxy * uy + dxz * uz,
    y: dxy * ux + dyy * uy + dyz * uz,
    z: dxz * ux + dyz * uy + dzz * uz,
  });
  let ux = vy;
  let uy = vz;
  let uz = vx;
  for (let pass = 0; pass < 18; pass += 1) {
    const next = applySecond(ux, uy, uz);
    const length = Math.hypot(next.x, next.y, next.z) || 1;
    ux = next.x / length;
    uy = next.y / length;
    uz = next.z / length;
  }
  const secondaryRay = applySecond(ux, uy, uz);
  const secondary = Math.max(0, ux * secondaryRay.x + uy * secondaryRay.y + uz * secondaryRay.z);
  const tertiary = Math.max(0, xx + yy + zz - primary - secondary);
  return {
    axis: [vx, vy, vz] as [number, number, number],
    anisotropy: primary / Math.max(1e-6, tertiary),
  };
}

function fieldReading(field: Float32Array, grid: number, cutoff: number) {
  let weight = 0;
  let su = 0;
  let sv = 0;
  let sw = 0;
  let minU = 1;
  let minV = 1;
  let minW = 1;
  let maxU = 0;
  let maxV = 0;
  let maxW = 0;
  let occupied = 0;
  for (let z = 0; z < grid; z += 1) {
    const w = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const v = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const value = field[indexOf(grid, x, y, z)];
        if (value < cutoff) continue;
        const u = x / (grid - 1);
        occupied += 1;
        weight += value;
        su += u * value;
        sv += v * value;
        sw += w * value;
        minU = Math.min(minU, u);
        minV = Math.min(minV, v);
        minW = Math.min(minW, w);
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
        maxW = Math.max(maxW, w);
      }
    }
  }
  const u = weight > 0 ? su / weight : 0.5;
  const v = weight > 0 ? sv / weight : 0.5;
  const w = weight > 0 ? sw / weight : 0.5;
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  let best = { value: -1, u: 0.5, v: 0.5, w: 0.5 };
  for (let z = 0; z < grid; z += 1) {
    const wz = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const vy = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const index = indexOf(grid, x, y, z);
        const value = field[index];
        if (value >= cutoff && weight > 0) {
          const point = modulePoint(x / (grid - 1), vy, wz);
          const center = modulePoint(u, v, w);
          const dx = point[0] - center[0];
          const dy = point[1] - center[1];
          const dz = point[2] - center[2];
          xx += value * dx * dx;
          xy += value * dx * dy;
          xz += value * dx * dz;
          yy += value * dy * dy;
          yz += value * dy * dz;
          zz += value * dz * dz;
        }
        if (value > best.value) best = { value, u: x / (grid - 1), v: vy, w: wz };
      }
    }
  }
  let secondPeak: { value: number; u: number; v: number; w: number } | null = null;
  for (let z = 0; z < grid; z += 1) {
    const wz = z / (grid - 1);
    for (let y = 0; y < grid; y += 1) {
      const vy = y / (grid - 1);
      for (let x = 0; x < grid; x += 1) {
        const value = field[indexOf(grid, x, y, z)];
        const uHere = x / (grid - 1);
        if (Math.hypot(uHere - best.u, vy - best.v, wz - best.w) < 0.12) continue;
        if (!secondPeak || value > secondPeak.value) secondPeak = { value, u: uHere, v: vy, w: wz };
      }
    }
  }
  const first = best.value >= cutoff ? best : null;
  const second = first && secondPeak && secondPeak.value >= first.value * 0.85
    && Math.hypot(secondPeak.u - first.u, secondPeak.v - first.v, secondPeak.w - first.w) >= 0.12
    ? secondPeak
    : null;
  const inv = weight || 1;
  const solved = principalAxis(xx / inv, xy / inv, xz / inv, yy / inv, yz / inv, zz / inv);
  const axis = {
    ...solved,
    axis: (solved.axis[1] < 0
      ? [-solved.axis[0], -solved.axis[1], -solved.axis[2]]
      : solved.axis) as [number, number, number],
  };
  const extent = occupied
    ? {
        x: [(minU - 0.5) * MODULE, (maxU - 0.5) * MODULE] as [number, number],
        y: [(minW - 0.5) * MODULE, (maxW - 0.5) * MODULE] as [number, number],
        z: [(minV - 0.5) * MODULE, (maxV - 0.5) * MODULE] as [number, number],
      }
    : {
        x: [0, 0] as [number, number],
        y: [0, 0] as [number, number],
        z: [0, 0] as [number, number],
      };
  return {
    centroid: modulePoint(u, v, w),
    orientation: axis.axis,
    anisotropy: axis.anisotropy,
    extent,
    strongest: first ? { at: modulePoint(first.u, first.v, first.w), value: first.value } : null,
    second: second ? { at: modulePoint(second.u, second.v, second.w), value: second.value } : null,
    signature: signatureOf(thresholdMask(field, cutoff), grid),
  };
}

function coarseField(field: Float32Array, grid: number, bins: number) {
  const out = new Float64Array(bins * bins * bins);
  const weight = new Uint16Array(out.length);
  for (let z = 0; z < grid; z += 1) {
    const iz = Math.min(bins - 1, Math.floor((z / grid) * bins));
    for (let y = 0; y < grid; y += 1) {
      const iy = Math.min(bins - 1, Math.floor((y / grid) * bins));
      for (let x = 0; x < grid; x += 1) {
        const index = (iz * bins + iy) * bins + Math.min(bins - 1, Math.floor((x / grid) * bins));
        out[index] += field[indexOf(grid, x, y, z)];
        weight[index] += 1;
      }
    }
  }
  return Array.from(out, (value, index) => value / (weight[index] || 1));
}

function thresholdMask(field: Float32Array, cutoff: number) {
  const mask = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) if (field[index] >= cutoff) mask[index] = 1;
  return mask;
}

function isoMask(field: Float32Array) {
  return thresholdMask(field, ISO);
}

function voidCenter(mask: Uint8Array, controls: ReturnType<typeof deriveControls>, grid: number) {
  let count = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let iz = 0; iz < grid; iz += 1) {
    const w = iz / (grid - 1);
    for (let iy = 0; iy < grid; iy += 1) {
      const v = iy / (grid - 1);
      for (let ix = 0; ix < grid; ix += 1) {
        const u = ix / (grid - 1);
        const primary = gaussian(u, v, w, controls.open, 0.32);
        const secondary = controls.secondKept ? gaussian(u, v, w, controls.second, 0.26) : 0;
        if ((primary > 0.5 || secondary > 0.48) && !mask[indexOf(grid, ix, iy, iz)]) {
          count += 1;
          x += ix;
          y += iy;
          z += iz;
        }
      }
    }
  }
  if (!count) return null;
  return modulePoint(x / count / (grid - 1), y / count / (grid - 1), z / count / (grid - 1));
}

export type FrozenStageReading = {
  centroid: [number, number, number];
  orientation: [number, number, number];
  anisotropy: number;
  extent: { x: [number, number]; y: [number, number]; z: [number, number] };
  strongest: { at: [number, number, number]; value: number } | null;
  second: { at: [number, number, number]; value: number } | null;
  signature: Uint8Array;
};

export type FrozenAudit = {
  temporal: {
    sampleCount: number;
    migration: number;
    migrationVector: [number, number];
    path: [number, number, number][];
    pathLength: number;
    netShift: [number, number, number];
    direction: [number, number, number];
    spread: number[];
    persistence: number[];
    intensity: { mean: number; p10: number; p50: number; p90: number };
    deltas: number[];
    branchEvents: number;
  };
  macro: FrozenStageReading;
  rawSignature: Uint8Array;
  controls: {
    saddleCenter: [number, number, number];
    pose: [number, number, number];
    tiltKept: boolean;
    flow: [number, number];
    openingCenter: [number, number, number];
    openingScale: number;
    secondaryCenter: [number, number, number];
    secondaryKept: boolean;
    anchor: [number, number, number];
    anchorKept: boolean;
    pinch: [number, number, number];
    pinchKept: boolean;
    migration: number;
    branchEnergy: number;
    connectivity: number;
    persistence: number;
    reinforcement: number;
    massKept: boolean;
  };
  sculptSignature: Uint8Array;
  retainedSignature: Uint8Array;
  envelopeSignature: Uint8Array;
  macroCoarse: number[];
  final: {
    centroid: [number, number, number];
    orientation: [number, number, number];
    openingCenter: [number, number, number] | null;
    openingSize: number;
    openingCount: number;
    solidFraction: number;
    wall: [number, number, number];
    moduleOccupation: number;
    components: number;
    surfaceNoise: number;
  };
  blurFraction: number;
  blurVoxels: number;
  stack: MacroSlice[];
  macroSlices: MacroSlice[];
  mesh: IsoMesh;
};

/**
 * Reads the frozen envelope path. The default blur is MACRO_BLUR.
 * A caller may pass another radius for a sensitivity reading. Clamps,
 * gates, saddle, retained mass, and the envelope are unchanged.
 */
export function inspectFrozenEnvelope(continuation: NaturalContinuation, blurFraction = MACRO_BLUR): FrozenAudit {
  const samples = samplesFrom(continuation);
  if (samples.length < 2) throw new Error(`${continuation.id} needs at least two accepted temporal samples`);
  const volume = buildVolume(samples, GRID);
  const blurVoxels = Math.max(1, Math.round(GRID * blurFraction));
  const macro = normalize(boxBlur(volume.trail, GRID, blurVoxels));
  const raw = normalize(volume.trail);
  const controls = deriveControls(samples, volume);
  const sculpted = sculpt(volume, macro, controls);
  const sculptMask = isoMask(sculpted.field);
  keepLarge(sculptMask, sculpted.field, GRID);
  for (let index = 0; index < sculptMask.length; index += 1) if (!sculptMask[index]) sculpted.field[index] = 0;
  const retained = retainMass(sculpted.field, macro, volume, controls);
  const enveloped = smoothBodyEnvelope(retained.field, macro, volume, controls);
  const envelopeMask = isoMask(enveloped.field);
  const opened = meshField(enveloped.field, GRID);
  const mesh = fairMesh(opened);
  const frame = meshFrame(mesh);
  const later = samples.slice(1);
  let flowU = 0;
  let flowV = 0;
  let pathLength = 0;
  const path = samples.map((sample) => modulePoint(sample.centroidU, sample.centroidV, sample.z));
  for (let index = 1; index < samples.length; index += 1) {
    const du = samples[index].centroidU - samples[index - 1].centroidU;
    const dv = samples[index].centroidV - samples[index - 1].centroidV;
    flowU += du;
    flowV += dv;
    pathLength += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1], path[index][2] - path[index - 1][2]);
  }
  const net = [
    path[path.length - 1][0] - path[0][0],
    path[path.length - 1][1] - path[0][1],
    path[path.length - 1][2] - path[0][2],
  ] as [number, number, number];
  const netLength = Math.hypot(net[0], net[1], net[2]) || 1;
  let direction: [number, number, number] = [net[0] / netLength, net[1] / netLength, net[2] / netLength];
  if (direction[1] < 0) direction = [-direction[0], -direction[1], -direction[2]];
  const intensities: number[] = [];
  for (const sample of samples) {
    for (let index = 0; index < sample.plate.length; index += 1) intensities.push(sample.plate[index]);
  }
  const poseU = controls.massKept ? clamp((controls.mass.u - 0.5) * 1.65, -0.3, 0.3) : 0;
  const poseV = controls.massKept ? clamp((controls.mass.v - 0.5) * 1.65, -0.3, 0.3) : 0;
  const poseW = clamp((controls.mass.w - 0.5) * 0.35, -0.16, 0.16);
  const walls = wallThickness(envelopeMask, GRID);
  const cover = occupation(envelopeMask, GRID);
  return {
    temporal: {
      sampleCount: samples.length,
      migration: later.reduce((sum, sample) => sum + sample.migration, 0) / later.length,
      migrationVector: [flowU / later.length, flowV / later.length],
      path,
      pathLength,
      netShift: net,
      direction,
      spread: samples.map((sample) => {
        let moment = 0;
        let weight = 0;
        for (let index = 0; index < sample.plate.length; index += 1) {
          const value = sample.plate[index];
          const du = ((index % PLATE) + 0.5) / PLATE - sample.centroidU;
          const dv = (Math.floor(index / PLATE) + 0.5) / PLATE - sample.centroidV;
          moment += value * (du * du + dv * dv);
          weight += value;
        }
        return weight > 0 ? Math.sqrt(moment / weight) : 0;
      }),
      persistence: samples.map((sample) => sample.persistence),
      intensity: {
        mean: intensities.reduce((sum, value) => sum + value, 0) / (intensities.length || 1),
        p10: quantile(intensities, 0.1),
        p50: quantile(intensities, 0.5),
        p90: quantile(intensities, 0.9),
      },
      deltas: later.map((sample) => Math.abs(continuation.events.find((event) => event.iteration === sample.iteration)?.delta ?? 0)),
      branchEvents: later.filter((sample) => sample.connectivityChange > 0).length,
    },
    macro: fieldReading(macro, GRID, 0.35),
    rawSignature: fieldReading(raw, GRID, 0.35).signature,
    controls: {
      saddleCenter: modulePoint(controls.mass.u, controls.mass.v, controls.mass.w),
      pose: [poseU, poseV, poseW],
      tiltKept: controls.tiltKept,
      flow: [controls.flow.u, controls.flow.v],
      openingCenter: modulePoint(controls.open.u, controls.open.v, controls.open.w),
      openingScale: 0.32,
      secondaryCenter: modulePoint(controls.second.u, controls.second.v, controls.second.w),
      secondaryKept: controls.secondKept,
      anchor: modulePoint(controls.mass.u, controls.mass.v, controls.mass.w),
      anchorKept: controls.anchorKept,
      pinch: modulePoint(controls.pinch.u, controls.pinch.v, controls.pinch.w),
      pinchKept: controls.pinchKept,
      migration: controls.meanMigration,
      branchEnergy: controls.branchEnergy,
      connectivity: controls.meanConnectivity,
      persistence: controls.meanPersistence,
      reinforcement: controls.meanReinforcement,
      massKept: controls.massKept,
    },
    macroCoarse: coarseField(macro, GRID, 16),
    sculptSignature: signatureOf(sculptMask, GRID),
    retainedSignature: signatureOf(isoMask(retained.field), GRID),
    envelopeSignature: signatureOf(envelopeMask, GRID),
    final: {
      centroid: frame.centroid,
      orientation: frame.orientation,
      openingCenter: voidCenter(envelopeMask, controls, GRID),
      openingSize: openingVoidSize(envelopeMask, controls, GRID),
      openingCount: openingCount(envelopeMask, GRID),
      solidFraction: cover.solid,
      wall: [walls.min, walls.median, walls.max],
      moduleOccupation: cover.box,
      components: components(envelopeMask, GRID).length,
      surfaceNoise: surfaceVariation(mesh),
    },
    blurFraction,
    blurVoxels,
    stack: slicesOf(volume.trail, GRID, [0.2, 0.5, 0.8]),
    macroSlices: slicesOf(macro, GRID, [0.2, 0.5, 0.8]),
    mesh,
  };
}

function meshFrame(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  if (!count) {
    return {
      centroid: [0, 0, 0] as [number, number, number],
      orientation: [0, 1, 0] as [number, number, number],
    };
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < count; index += 1) {
    x += mesh.positions[index * 3];
    y += mesh.positions[index * 3 + 1];
    z += mesh.positions[index * 3 + 2];
  }
  x /= count;
  y /= count;
  z /= count;
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = mesh.positions[index * 3] - x;
    const dy = mesh.positions[index * 3 + 1] - y;
    const dz = mesh.positions[index * 3 + 2] - z;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  const axis = principalAxis(xx, xy, xz, yy, yz, zz);
  const orientation = axis.axis[2] < 0 || (Math.abs(axis.axis[2]) < 1e-6 && axis.axis[1] < 0)
    ? [-axis.axis[0], -axis.axis[1], -axis.axis[2]] as [number, number, number]
    : axis.axis;
  return { centroid: [x, y, z] as [number, number, number], orientation };
}
