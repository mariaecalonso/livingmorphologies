/**
 * Terraced sections: Articulated levels, Connected Modules, Immersive depth.
 *
 * A cell is an architectural section, not a row of bars.
 * Levels sit at unequal heights and unequal lengths.
 * Stairs and walls are part of the structure, so the levels step and connect.
 * Some sections stagger, split, nest, or branch. The gaps stay open enough to read.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const EDGE = 1.15;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

type Rng = () => number;

export const TERRACE_FAMILIES = [
  "cascade",
  "stagger",
  "split",
  "switchback",
  "fan",
  "landings",
  "cantilever",
  "meander",
  "islands",
  "folded",
  "spine",
  "paired",
  "broken",
  "wrap",
  "ribbon",
  "cross-step",
] as const;

export const TERRACE_GROWTHS = ["filament", "sharp", "sparse", "committed", "wander"] as const;

export type TerraceKind = (typeof TERRACE_FAMILIES)[number];
export type TerraceGrowth = (typeof TERRACE_GROWTHS)[number];

const RHYTHMS = [
  [0, 3.6, 6.1, 10.4, 13.8],
  [0, 2.2, 4.1, 8.9, 11.4],
  [0, 4.8, 6.7, 9.0, 13.5],
  [0, 2.7, 7.1, 9.2, 12.6],
] as const;

export type TerracePlan = {
  kind: TerraceKind;
  growth: TerraceGrowth;
  index: number;
  steps: number;
  pitch: number;
  shift: number;
  span: number;
  scale: number;
  originX: number;
  originY: number;
  twist: number;
  flip: boolean;
  plate: number;
  weight: number;
  ink: number;
  agents: number;
  decay: number;
  random: number;
  cap: number;
  material: number;
  /** 0 white, 1 orange, 2 green. */
  tone: number;
  /** Above 6 so the hair shader does not erase stairs and walls. */
  bulk: number;
  widthPattern: number;
  densityPattern: number;
  lengthPattern: number;
};

export const TERRACE_RUN_ITERATIONS = 160;

type Plate = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  curve: number;
  radius: number;
  strength: number;
  stroke: number;
  stroke2: number;
  mass: number;
  cover: number;
  coverAt: number;
  landing: boolean;
};

function frame(rng: Rng) {
  return {
    r: (min: number, max: number) => min + rng() * (max - min),
  };
}

function member(x0: number, y0: number, x1: number, y1: number, stroke: number, mass: number): Plate {
  return {
    x0,
    y0,
    x1,
    y1,
    curve: 0,
    radius: 0.5,
    strength: mass,
    stroke,
    stroke2: stroke * 0.84,
    mass,
    cover: 1,
    coverAt: 0,
    landing: stroke >= 24,
  };
}

const H = (x0: number, x1: number, y: number, stroke: number, mass = 1) => member(x0, y, x1, y, stroke, mass);
const V = (x: number, y0: number, y1: number, stroke: number, mass = 1.1) => member(x, y0, x, y1, stroke, mass);
const D = (x0: number, y0: number, x1: number, y1: number, stroke: number, mass = 1.2) => member(x0, y0, x1, y1, stroke, mass);

type Ink = { slab: number; tread: number; stair: number; wall: number; branch: number };

function inkOf(plan: TerracePlan): Ink {
  const gain = [0.9, 1.05, 1.2, 0.8][plan.densityPattern % 4];
  return {
    slab: 32 * gain,
    tread: 16 * gain,
    stair: 20 * gain,
    wall: 24 * gain,
    branch: 15 * gain,
  };
}

function metrics(plan: TerracePlan) {
  const n = Math.min(5, Math.max(3, plan.steps));
  const depth = plan.pitch / 3.7;
  const wide = plan.span / 5.2;
  const raw = RHYTHMS[plan.lengthPattern % RHYTHMS.length];
  const top = raw[n - 1];
  const ys = raw.slice(0, n).map((y) => (y - top / 2) * depth);
  return { n, ys, wide, depth, branch: plan.widthPattern % n };
}

function cascade(plan: TerracePlan): Plate[] {
  const { n, ys, wide, branch } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  let prev: { x0: number; x1: number; y: number } | null = null;
  for (let i = 0; i < n; i += 1) {
    const len = [7.2, 4.4, 5.8, 3.1, 6.4][i] * wide;
    const x0 = (-3.4 + i * 1.85) * wide;
    const x1 = x0 + len;
    const y = ys[i];
    plates.push(H(x0, x1, y, i === branch ? ink.slab : ink.tread, i === branch ? 1.5 : 0.95));
    if (prev) {
      const climbRight = i % 2 === 1;
      plates.push(D(climbRight ? prev.x1 : prev.x0, prev.y, climbRight ? x0 : x1, y, ink.stair));
    }
    prev = { x0, x1, y };
  }
  plates.push(V((-3.4) * wide, ys[0], ys[Math.min(2, n - 1)], ink.wall));
  const spur = ys[Math.min(branch, n - 1)];
  plates.push(H(4.2 * wide, 8.1 * wide, spur + 1.3 * (plan.pitch / 3.7), ink.branch, 0.9));
  if (!prev) return plates;
  plates.push(D(prev.x1, prev.y, 8.1 * wide, spur + 1.3 * (plan.pitch / 3.7), ink.branch, 1));
  return plates;
}

function stagger(plan: TerracePlan): Plate[] {
  const { n, ys, wide } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  let prev: { x0: number; x1: number; y: number } | null = null;
  for (let i = 0; i < n; i += 1) {
    const left = i % 2 === 0;
    const len = (left ? 5.6 : 3.4) * wide;
    const x0 = (left ? -6.4 : 1.1) * wide;
    const x1 = x0 + len;
    plates.push(H(x0, x1, ys[i], left ? ink.slab : ink.tread, left ? 1.4 : 0.9));
    if (prev) plates.push(D(prev.x1, prev.y, x0, ys[i], ink.stair, 1.3));
    prev = { x0, x1, y: ys[i] };
  }
  plates.push(V(1.1 * wide, ys[1] ?? ys[0], ys[n - 1], ink.wall));
  return plates;
}

function split(plan: TerracePlan): Plate[] {
  const { n, ys, wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  for (let i = 0; i < n; i += 1) {
    const yL = ys[i];
    const yR = ys[i] + (i % 2 === 0 ? 0.9 : -0.7) * depth;
    const leftLen = [4.8, 3.2, 5.4, 2.6, 4.1][i] * wide;
    const rightLen = [3.1, 5.2, 2.4, 4.6, 3.6][i] * wide;
    plates.push(H(-7 * wide, -7 * wide + leftLen, yL, i === 0 ? ink.slab : ink.tread, 1.1));
    plates.push(H(7 * wide - rightLen, 7 * wide, yR, i === n - 1 ? ink.slab : ink.tread, 1));
    if (i > 0) {
      plates.push(D(-7 * wide + leftLen * 0.2, ys[i - 1], -7 * wide, yL, ink.stair));
      plates.push(D(7 * wide, ys[i - 1] + (i % 2 ? -0.7 : 0.9) * depth, 7 * wide - rightLen, yR, ink.branch, 1));
    }
  }
  const bridge = ys[Math.floor(n / 2)];
  plates.push(H(-1.6 * wide, 1.8 * wide, bridge, ink.slab, 1.4));
  plates.push(V(0, ys[0], ys[n - 1], ink.wall * 0.75, 0.8));
  return plates;
}

function switchback(plan: TerracePlan): Plate[] {
  const { n, ys, wide } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  for (let i = 0; i < n; i += 1) {
    const goRight = i % 2 === 0;
    const len = [6.4, 3.6, 5.2, 2.8, 4.8][i] * wide;
    const x0 = goRight ? -5.5 * wide : 5.8 * wide - len;
    const x1 = x0 + len;
    plates.push(H(x0, x1, ys[i], i % 2 === 0 ? ink.slab : ink.tread, 1.15));
    if (i > 0) {
      const prevRight = (i - 1) % 2 === 0;
      const fromX = prevRight ? 0.6 * wide : -0.4 * wide;
      const toX = goRight ? x0 : x1;
      plates.push(D(fromX, ys[i - 1], toX, ys[i], ink.stair, 1.25));
      plates.push(V(fromX, ys[i - 1], ys[i], ink.wall, 0.9));
    }
  }
  const mid = Math.floor(n / 2);
  plates.push(H(2.2 * wide, 6.4 * wide, (ys[mid] + (ys[mid + 1] ?? ys[mid])) / 2, ink.branch, 0.9));
  plates.push(D(0.6 * wide, ys[mid], 6.4 * wide, (ys[mid] + (ys[mid + 1] ?? ys[mid])) / 2, ink.branch));
  return plates;
}

function fan(plan: TerracePlan): Plate[] {
  const { ys, wide, depth, n } = metrics(plan);
  const ink = inkOf(plan);
  const y0 = ys[0];
  const yA = ys[Math.min(2, n - 1)];
  const yB = ys[Math.min(3, n - 1)] + 0.6 * depth;
  const yC = ys[n - 1] + 1.1 * depth;
  return [
    H(-5.5 * wide, 2.2 * wide, y0, ink.slab, 1.5),
    D(2.2 * wide, y0, 6.4 * wide, yA, ink.stair, 1.3),
    D(-1.2 * wide, y0, -6.2 * wide, yB, ink.stair, 1.3),
    H(4.6 * wide, 8.4 * wide, yA, ink.tread, 1),
    H(-8.2 * wide, -4.4 * wide, yB, ink.slab, 1.2),
    D(6.4 * wide, yA, 3.2 * wide, yC, ink.branch, 1.1),
    H(0.8 * wide, 5.6 * wide, yC, ink.tread, 0.95),
    V(-5.5 * wide, y0, yB, ink.wall),
  ];
}

function landings(plan: TerracePlan): Plate[] {
  const { wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const y0 = -5.6 * depth;
  const y1 = -1.6 * depth;
  const y2 = 2.4 * depth;
  const y3 = 5.8 * depth;
  return [
    H(-7.2 * wide, 7.4 * wide, y0, ink.slab, 1.55),
    V(-5.4 * wide, y0, y1, ink.wall),
    H(-5.4 * wide, -0.6 * wide, y1, ink.tread, 1.05),
    D(-0.6 * wide, y1, 1.4 * wide, y2, ink.stair, 1.25),
    H(1.4 * wide, 6.6 * wide, y2, ink.tread, 1),
    D(4.8 * wide, y0, 7.2 * wide, y3, ink.stair, 1.2),
    H(5.4 * wide, 8.6 * wide, y3, ink.branch, 0.9),
    D(-5.4 * wide, y1, -7.2 * wide, y0, ink.branch, 0.95),
    V(6.6 * wide, y2, y3, ink.wall * 0.8, 0.9),
  ];
}

function cantilever(plan: TerracePlan): Plate[] {
  const { n, ys, wide } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [V(-5.6 * wide, ys[0], ys[n - 1], ink.wall, 1.25)];
  for (let i = 0; i < n; i += 1) {
    const len = [3.2, 5.1, 7.4, 4.4, 8.2][i] * wide;
    plates.push(H(-5.6 * wide, -5.6 * wide + len, ys[i], i === n - 1 ? ink.slab : ink.tread, 1.1));
    if (i > 0) {
      plates.push(D(-5.6 * wide + [3.2, 5.1, 7.4, 4.4, 8.2][i - 1] * wide * 0.7, ys[i - 1], -5.6 * wide + len, ys[i], ink.stair));
    }
  }
  const drop = ys[Math.max(0, n - 2)];
  plates.push(V(-1.2 * wide, drop, ys[n - 1], ink.branch, 0.9));
  plates.push(H(-1.2 * wide, 2.4 * wide, drop, ink.branch, 0.85));
  return plates;
}

function meander(plan: TerracePlan): Plate[] {
  const { wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const y0 = -6 * depth;
  const y1 = -3.2 * depth;
  const y2 = -0.4 * depth;
  const y3 = 3.6 * depth;
  const y4 = 6.2 * depth;
  return [
    H(-6.8 * wide, -1.4 * wide, y0, ink.slab, 1.4),
    D(-1.4 * wide, y0, 1.6 * wide, y1, ink.stair),
    H(1.6 * wide, 6.2 * wide, y1, ink.tread, 1),
    V(6.2 * wide, y1, y2, ink.wall),
    H(2.4 * wide, 6.2 * wide, y2, ink.tread, 0.95),
    D(2.4 * wide, y2, -2.2 * wide, y3, ink.stair, 1.25),
    H(-6.4 * wide, -2.2 * wide, y3, ink.slab, 1.2),
    D(-4.8 * wide, y3, -1.2 * wide, y4, ink.branch),
    H(-1.2 * wide, 3.4 * wide, y4, ink.branch, 0.9),
    V(-6.8 * wide, y0, y1 - 0.2 * depth, ink.wall * 0.75, 0.8),
  ];
}

function islands(plan: TerracePlan): Plate[] {
  const { wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const y0 = -5.2 * depth;
  const y1 = -0.8 * depth;
  const y2 = 4.8 * depth;
  return [
    H(-7.4 * wide, -2.6 * wide, y0, ink.slab, 1.45),
    H(-1.2 * wide, 3.8 * wide, y1, ink.tread, 1.1),
    H(2.2 * wide, 7.6 * wide, y2, ink.slab, 1.3),
    D(-2.6 * wide, y0, -1.2 * wide, y1, ink.stair, 1.25),
    D(3.8 * wide, y1, 2.2 * wide, y2, ink.stair, 1.25),
    D(-4.8 * wide, y0, 0.8 * wide, y1, ink.branch, 1.05),
    V(-7.4 * wide, y0, y1, ink.wall),
    H(-7.4 * wide, -4.2 * wide, y1, ink.branch, 0.85),
  ];
}

function folded(plan: TerracePlan): Plate[] {
  const { n, ys, wide } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  const leftN = Math.max(2, Math.ceil(n / 2));
  for (let i = 0; i < leftN; i += 1) {
    const len = [4.2, 2.8, 3.6][i] * wide;
    plates.push(H(-6.8 * wide, -6.8 * wide + len, ys[i], i === 0 ? ink.slab : ink.tread, 1.1));
    if (i > 0) plates.push(D(-6.8 * wide + len, ys[i - 1], -6.8 * wide, ys[i], ink.stair));
  }
  const foldY = ys[leftN - 1];
  const rightLow = foldY + 2.4 * (plan.pitch / 3.7);
  const rightHigh = rightLow + 3.2 * (plan.pitch / 3.7);
  plates.push(D(-6.8 * wide + 3.2 * wide, foldY, 1.4 * wide, rightLow, ink.stair, 1.35));
  plates.push(H(1.4 * wide, 7.2 * wide, rightLow, ink.slab, 1.4));
  plates.push(V(7.2 * wide, rightLow, rightHigh, ink.wall));
  plates.push(H(3.6 * wide, 7.2 * wide, rightHigh, ink.tread, 1));
  plates.push(D(5.2 * wide, rightLow, 3.6 * wide, rightHigh, ink.branch));
  return plates;
}

function spine(plan: TerracePlan): Plate[] {
  const { n, ys, wide } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [V(0, ys[0] - 0.3, ys[n - 1] + 0.3, ink.wall, 1.35)];
  for (let i = 0; i < n; i += 1) {
    const len = [5.8, 2.6, 4.4, 3.3, 6.6][i] * wide;
    if (i % 3 !== 2) {
      plates.push(H(-len, 0, ys[i], i % 2 === 0 ? ink.slab : ink.tread, 1.15));
      if (i < n - 1) plates.push(D(-len, ys[i], -0.15, ys[Math.min(n - 1, i + 1)], ink.stair));
    }
    if (i % 3 !== 1) {
      const rlen = len * [0.45, 0.8, 0.55, 1, 0.4][i];
      plates.push(H(0, rlen, ys[i], ink.tread, 0.9));
    }
  }
  return plates;
}

function paired(plan: TerracePlan): Plate[] {
  const { n, ys, wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  for (let i = 0; i < n; i += 1) {
    const lenL = [3.2, 4.6, 2.4, 5.1, 3.6][i] * wide;
    const lenR = [5.4, 2.8, 4.2, 3.4, 6.1][i] * wide;
    plates.push(H(-7 * wide, -7 * wide + lenL, ys[i], ink.tread, 1));
    plates.push(H(7 * wide - lenR, 7 * wide, ys[i] + (i % 2 ? 1.1 : -0.4) * depth, i === 1 ? ink.slab : ink.tread, 1));
    if (i > 0) {
      plates.push(D(-7 * wide + lenL, ys[i - 1], -7 * wide, ys[i], ink.stair));
      plates.push(D(7 * wide, ys[i - 1] + ((i - 1) % 2 ? 1.1 : -0.4) * depth, 7 * wide - lenR, ys[i] + (i % 2 ? 1.1 : -0.4) * depth, ink.stair));
    }
  }
  const mid = ys[Math.floor(n / 2)];
  plates.push(H(-2.2 * wide, 2.4 * wide, mid, ink.slab, 1.45));
  plates.push(V(0, ys[0], mid, ink.wall * 0.8, 0.9));
  return plates;
}

function broken(plan: TerracePlan): Plate[] {
  const { n, ys, wide } = metrics(plan);
  const ink = inkOf(plan);
  const plates: Plate[] = [];
  const gap = Math.floor(n / 2);
  for (let i = 0; i < n; i += 1) {
    const len = [6.6, 4.2, 3.1, 5.4, 2.8][i] * wide;
    const x0 = (-2.4 + (i === gap ? 2.8 : i * 0.35)) * wide;
    plates.push(H(x0, x0 + len, ys[i], i === 0 ? ink.slab : ink.tread, 1.1));
    if (i > 0 && i !== gap) plates.push(D(x0 + len * 0.15, ys[i - 1], x0, ys[i], ink.stair));
  }
  const pocket = ys[Math.max(0, gap - 1)];
  const rejoin = ys[Math.min(n - 1, gap + 1)];
  const midY = (pocket + rejoin) / 2;
  plates.push(H(-7.4 * wide, -3.4 * wide, pocket - 0.2, ink.branch, 0.95));
  plates.push(D(-6.6 * wide, ys[0], -3.4 * wide, midY, ink.stair, 1.15));
  plates.push(D(-3.4 * wide, midY, 2.4 * wide, rejoin, ink.branch, 1.15));
  plates.push(V(-7.4 * wide, ys[0], rejoin, ink.wall));
  return plates;
}

function wrap(plan: TerracePlan): Plate[] {
  const { wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const y0 = -5.4 * depth;
  const y1 = -1.8 * depth;
  const y2 = 2.2 * depth;
  const y3 = 5.6 * depth;
  return [
    H(-4.2 * wide, 5.8 * wide, y0, ink.slab, 1.5),
    V(5.8 * wide, y0, y1, ink.wall),
    H(1.6 * wide, 5.8 * wide, y1, ink.tread, 1),
    D(1.6 * wide, y1, -3.6 * wide, y2, ink.stair, 1.25),
    H(-6.4 * wide, -1.2 * wide, y2, ink.tread, 1),
    V(-6.4 * wide, y2, y3, ink.wall * 0.85, 0.9),
    H(-6.4 * wide, -2.2 * wide, y3, ink.branch, 0.9),
    H(-2.4 * wide, 2.8 * wide, y1 + 0.8 * depth, ink.tread, 1.05),
    D(-2.4 * wide, y1 + 0.8 * depth, 1.6 * wide, y2, ink.branch, 1),
  ];
}

function ribbon(plan: TerracePlan): Plate[] {
  const { wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const runs = [
    [-6.6, -2.2, -5.8],
    [-0.4, 3.2, -2.4],
    [4.6, 7.4, -0.2],
    [5.8, 1.4, 2.6],
    [0.2, -3.6, 4.4],
    [-2.2, -6.4, 6.6],
  ];
  const plates: Plate[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    const [x0, x1, y] = runs[i];
    const yy = y * depth;
    const next = runs[i + 1];
    const stroke = i % 3 === 0 ? ink.slab : ink.tread;
    plates.push(H(x0 * wide, x1 * wide, yy, stroke, i % 3 === 0 ? 1.35 : 0.95));
    if (next) plates.push(D(x1 * wide, yy, next[0] * wide, next[2] * depth, ink.stair, 1.2));
  }
  plates.push(V(-6.6 * wide, -5.8 * depth, -2.2 * depth, ink.wall));
  plates.push(H(4.2 * wide, 8.2 * wide, 3.2 * depth, ink.branch, 0.9));
  plates.push(D(3.2 * wide, 1.4 * depth, 8.2 * wide, 3.2 * depth, ink.branch));
  return plates;
}

function crossStep(plan: TerracePlan): Plate[] {
  const { wide, depth } = metrics(plan);
  const ink = inkOf(plan);
  const y0 = -5.8 * depth;
  const y1 = -1.4 * depth;
  const y2 = 2.6 * depth;
  const y3 = 6.1 * depth;
  return [
    H(-7.2 * wide, -1.6 * wide, y0, ink.slab, 1.45),
    H(1.2 * wide, 7.4 * wide, y1, ink.tread, 1),
    H(-6.4 * wide, -0.4 * wide, y2, ink.tread, 1),
    H(2.2 * wide, 6.8 * wide, y3, ink.slab, 1.3),
    D(-1.6 * wide, y0, 1.2 * wide, y1, ink.stair, 1.25),
    D(1.2 * wide, y1, -0.4 * wide, y2, ink.stair, 1.25),
    D(-0.4 * wide, y2, 2.2 * wide, y3, ink.stair, 1.25),
    D(7.4 * wide, y1, 2.8 * wide, y3, ink.branch, 1.1),
    V(-7.2 * wide, y0, y2, ink.wall),
    H(-3.2 * wide, 0.8 * wide, (y1 + y2) / 2, ink.branch, 0.85),
  ];
}

function sectionFor(plan: TerracePlan): Plate[] {
  switch (plan.kind) {
    case "cascade":
      return cascade(plan);
    case "stagger":
      return stagger(plan);
    case "split":
      return split(plan);
    case "switchback":
      return switchback(plan);
    case "fan":
      return fan(plan);
    case "landings":
      return landings(plan);
    case "cantilever":
      return cantilever(plan);
    case "meander":
      return meander(plan);
    case "islands":
      return islands(plan);
    case "folded":
      return folded(plan);
    case "spine":
      return spine(plan);
    case "paired":
      return paired(plan);
    case "broken":
      return broken(plan);
    case "wrap":
      return wrap(plan);
    case "ribbon":
      return ribbon(plan);
    default:
      return crossStep(plan);
  }
}

function draw(plates: Plate[]): FieldAttractor[] {
  return plates.map((plate) => ({
    kind: "line" as const,
    x: plate.x0,
    y: plate.y0,
    x2: plate.x1,
    y2: plate.y1,
    radius: plate.radius,
    strength: plate.strength,
    stroke: plate.stroke,
    stroke2: plate.stroke2,
    mass: plate.mass,
    cover: 1,
    coverAt: 0,
  }));
}

function settle(marks: FieldAttractor[], plan: TerracePlan): FieldAttractor[] {
  const flip = plan.flip ? -1 : 1;
  const occ = plan.scale;
  const mapped = marks.map((mark) => {
    const out: FieldAttractor = { ...mark, x: mark.x * flip * occ, y: mark.y * occ };
    if (mark.x2 != null && mark.y2 != null) {
      out.x2 = mark.x2 * flip * occ;
      out.y2 = mark.y2 * occ;
    }
    return out;
  });
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const mark of mapped) {
    minX = Math.min(minX, mark.x, mark.x2 ?? mark.x);
    maxX = Math.max(maxX, mark.x, mark.x2 ?? mark.x);
    minY = Math.min(minY, mark.y, mark.y2 ?? mark.y);
    maxY = Math.max(maxY, mark.y, mark.y2 ?? mark.y);
  }
  const fit = Math.min((FIELD_SIZE - EDGE * 2) / Math.max(0.8, maxX - minX), (FIELD_SIZE - EDGE * 2) / Math.max(0.8, maxY - minY), 1);
  const halfW = ((maxX - minX) * fit) / 2;
  const halfH = ((maxY - minY) * fit) / 2;
  const ox = Math.min(FIELD_SIZE - EDGE - halfW, Math.max(EDGE + halfW, plan.originX));
  const oy = Math.min(FIELD_SIZE - EDGE - halfH, Math.max(EDGE + halfH, plan.originY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const shift = (x: number, y: number) => ({
    x: lim(ox + (x - cx) * fit),
    y: lim(oy + (y - cy) * fit),
  });
  return mapped.map((mark) => {
    const a = shift(mark.x, mark.y);
    const out: FieldAttractor = { ...mark, x: a.x, y: a.y, radius: 0.48 };
    if (mark.x2 != null && mark.y2 != null) {
      const b = shift(mark.x2, mark.y2);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    return out;
  });
}

export function planTerraced(seed: number, attempt = 0, index = 0): TerracePlan {
  const slot = Math.max(0, index);
  const kind = TERRACE_FAMILIES[slot % TERRACE_FAMILIES.length];
  const variant = Math.floor(slot / TERRACE_FAMILIES.length);
  const rng = mulberry32((seed ^ (slot * 0x9e3779b9) ^ (attempt * 0x85ebca6b)) >>> 0);
  const f = frame(rng);
  const steps = 3 + ((slot * 5 + variant) % 3);
  const pitch = [3.2, 4.6, 3.7, 5.2, 2.9, 4.2, 5.6, 3.5][(slot * 3 + variant) % 8];
  const span = [4.4, 6.2, 5.1, 7.0, 4.8, 5.8, 6.6, 3.9][(slot * 2 + variant) % 8];
  const widthPattern = (slot * 3 + 1) % 4;
  const densityPattern = (slot + variant * 2) % 4;
  const lengthPattern = (slot * 5 + variant) % 4;
  const ink = inkOf({ densityPattern } as TerracePlan);
  const bias = [
    [CENTER, CENTER],
    [CENTER - 0.8, CENTER],
    [CENTER + 0.9, CENTER],
    [CENTER, CENTER - 0.5],
    [CENTER, CENTER + 0.6],
  ][(slot + variant) % 5];
  return {
    kind,
    growth: pitch >= 4.6 ? "sparse" : TERRACE_GROWTHS[slot % TERRACE_GROWTHS.length],
    index: slot,
    steps,
    pitch,
    shift: 1.6 + f.r(0, 0.4),
    span: span + f.r(-0.05, 0.05),
    scale: 0.96,
    originX: bias[0],
    originY: bias[1],
    twist: 0,
    flip: (slot + variant) % 2 === 1,
    plate: 0.5,
    weight: ink.slab,
    ink: pitch >= 4.6 ? 0.06 : 0.09,
    agents: 150 + (slot % 4) * 18,
    decay: 0.992,
    random: 0.035,
    cap: 1.45,
    material: widthPattern,
    tone: slot % 3,
    bulk: ink.slab,
    widthPattern,
    densityPattern,
    lengthPattern,
  };
}

export function attractorsFromTerraced(plan: TerracePlan, _seed = 0): FieldAttractor[] {
  return settle(draw(sectionFor(plan)), plan);
}

export function agentsFromTerraced(plan: TerracePlan) {
  return 84 + (plan.index % 5) * 6;
}

/** Same hair-thin physarum ink as Flat Deep Plan. The section geometry stays on the marks. */
export function slimeFromTerraced(base: SlimeControls, plan: TerracePlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index);
  const span = (min: number, max: number) => min + rng() * (max - min);
  return {
    ...base,
    sensorAngle: span(0.06, 0.16),
    sensorDistance: span(0.32, 0.52),
    turnAngle: span(0.08, 0.18),
    stepSize: span(0.14, 0.22),
    deposit: span(0.08, 0.12),
    depositWidth: span(0.24, 0.38),
    diffusion: 0,
    decay: span(0.995, 0.998),
    trailInfluence: span(1.25, 1.7),
    resistance: span(0.01, 0.05),
    randomness: span(0.02, 0.06),
    persistence: span(0.86, 0.95),
    trailCap: span(0.7, 1.05),
    crowdingLimit: 12,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function terraceSignature(plan: TerracePlan, attractors: FieldAttractor[]): number[] {
  let diagonals = 0;
  let verticals = 0;
  let minLen = 99;
  let maxLen = 0;
  for (const mark of attractors) {
    const dx = Math.abs((mark.x2 ?? mark.x) - mark.x);
    const dy = Math.abs((mark.y2 ?? mark.y) - mark.y);
    const len = Math.hypot(dx, dy);
    if (dx > 1.2 && dy < 0.45) {
      minLen = Math.min(minLen, len);
      maxLen = Math.max(maxLen, len);
    }
    if (dx < 0.5 && dy > 1.4) verticals += 1;
    if (dx > 1 && dy > 1) diagonals += 1;
  }
  return [
    TERRACE_FAMILIES.indexOf(plan.kind),
    plan.steps,
    plan.lengthPattern,
    verticals,
    diagonals,
    Math.round(maxLen / Math.max(0.4, minLen)),
    Math.round(plan.pitch * 10),
    Math.round(plan.span * 10),
  ];
}

export function terraceSignaturesDiffer(a: number[], b: number[]) {
  if (a[0] !== b[0] || a[1] !== b[1] || a[3] !== b[3]) return true;
  let delta = 0;
  for (let i = 0; i < a.length; i += 1) delta += Math.abs(a[i] - b[i]);
  return delta >= 3;
}
