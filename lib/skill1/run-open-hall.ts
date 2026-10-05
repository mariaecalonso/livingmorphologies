/**
 * Open Hall realizations for the run grid.
 * Orthogonal Balance · Adaptive Module · Engaging.
 * Each cell is a different spatial reading of the same open hall.
 * Forms diverge: grids, a long hall, a tall slot, dashes, an L, an H, a U,
 * a stair, a cross, a court with a door, separated rooms, a gap-cross,
 * a notch, two stripes, a weighted end, a procession, a meander, open rings, an F.
 * Axis-aligned, see-through, modules that change size, weight that balances.
 * Plate articulation stays low. No curves, no terraces.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, SpatialRecipe } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const EDGE = 1.35;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

type Rng = () => number;
type Frame = {
  r: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
};

function frame(rng: Rng): Frame {
  return {
    r: (min, max) => min + rng() * (max - min),
    int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
    chance: (p) => rng() < p,
    pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))],
  };
}

export type OpenHallKind =
  | "equal-grid"
  | "wide-bays"
  | "tall-bays"
  | "offset-rows"
  | "side-aisle"
  | "double-aisle"
  | "corner-clusters"
  | "open-frame"
  | "staggered"
  | "spine"
  | "court"
  | "loose"
  | "pinwheel"
  | "merged"
  | "lanes"
  | "end-band"
  | "raft"
  | "ribbons"
  | "nested"
  | "comb";

/** Growth changes how the colony walks the same plan. Width stays hair-thin in every mode. */
export type OpenHallGrowth = "filament" | "sparse" | "sharp" | "wander" | "committed";

export const OPEN_HALL_FAMILIES: OpenHallKind[] = [
  "equal-grid",
  "wide-bays",
  "tall-bays",
  "offset-rows",
  "side-aisle",
  "double-aisle",
  "corner-clusters",
  "open-frame",
  "staggered",
  "spine",
  "court",
  "loose",
  "pinwheel",
  "merged",
  "lanes",
  "end-band",
  "raft",
  "ribbons",
  "nested",
  "comb",
];

export const OPEN_HALL_GROWTHS: OpenHallGrowth[] = ["filament", "sparse", "sharp", "wander", "committed"];

/** Asymmetric figures mirror on the last reading. Orientation itself is part of the form. */
const MIRRORS: ReadonlySet<OpenHallKind> = new Set([
  "side-aisle",
  "comb",
  "staggered",
  "ribbons",
  "end-band",
  "spine",
  "loose",
  "open-frame",
]);

export type OpenHallPlan = {
  kind: OpenHallKind;
  growth: OpenHallGrowth;
  index: number;
  cycle: number;
  cols: number;
  rows: number;
  pitchU: number;
  pitchV: number;
  turn: 0 | 1;
  flip: boolean;
  driftX: number;
  driftY: number;
  gap: number;
};

type Mark = {
  u: number;
  v: number;
  u2: number;
  v2: number;
  radius: number;
  strength: number;
};

function seg(u: number, v: number, u2: number, v2: number, radius: number, strength: number): Mark {
  return { u, v, u2, v2, radius, strength };
}

function box(u: number, v: number, w: number, h: number, width: number, strength: number): Mark[] {
  return [
    seg(u - w, v - h, u + w, v - h, width, strength),
    seg(u - w, v + h, u + w, v + h, width, strength),
    seg(u - w, v - h, u - w, v + h, width, strength),
    seg(u + w, v - h, u + w, v + h, width, strength),
  ];
}

function plus(u: number, v: number, w: number, h: number, width: number, strength: number): Mark[] {
  return [seg(u - w, v, u + w, v, width, strength), seg(u, v - h, u, v + h, width, strength)];
}

function poly(pts: ReadonlyArray<readonly [number, number]>, width: number, strength: number): Mark[] {
  const marks: Mark[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    marks.push(seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width, strength));
  }
  return marks;
}

export function planOpenHall(seed: number, attempt = 0, index = 0): OpenHallPlan {
  const rng = mulberry32(seed ^ 0x0e11a11 ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  const cycle = Math.floor(index / OPEN_HALL_FAMILIES.length);
  const kind = OPEN_HALL_FAMILIES[index % OPEN_HALL_FAMILIES.length];
  const growth = OPEN_HALL_GROWTHS[(cycle + attempt) % OPEN_HALL_GROWTHS.length];
  return {
    kind,
    growth,
    index,
    cycle,
    cols: 2 + ((index + cycle * 2) % 4),
    rows: 2 + ((index * 3 + cycle) % 4),
    pitchU: 2.4 + ((index * 5 + cycle) % 8) * 0.42,
    pitchV: 2.2 + ((index * 7 + cycle * 3) % 8) * 0.4,
    turn: 0,
    flip: MIRRORS.has(kind) && cycle === 4,
    driftX: f.r(-0.55, 0.55),
    driftY: f.r(-0.55, 0.55),
    gap: 0.7 + (cycle % 5) * 0.28,
  };
}

function equalGrid(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [...box(-2.2, 2.2, 1.5, 1.5, width, 0.55), ...box(2.2, 2.2, 1.5, 1.5, width, 0.55), ...box(-2.2, -2.2, 1.5, 1.5, width, 0.55), ...box(2.2, -2.2, 1.5, 1.5, width, 0.55)];
  if (cycle === 1) return [...box(-3.6, 0, 2.4, 1.1, width, 0.55), ...box(0, 0, 1.1, 2.4, width, 0.5), ...box(3.6, 0, 1.6, 1.6, width, 0.48)];
  if (cycle === 2) return [seg(-6, -3, 6, -3, width, 0.58), seg(-6, 0, 6, 0, width, 0.58), seg(-6, 3, 6, 3, width, 0.58), seg(-3, -5, -3, 5, width, 0.5), seg(3, -5, 3, 5, width, 0.5)];
  if (cycle === 3) return [...box(-4.2, 1.6, 1.2, 0.8, width, 0.5), ...box(0, 1.6, 1.8, 1.4, width, 0.55), ...box(4.2, 1.6, 0.7, 1.1, width, 0.46), ...box(-2.2, -2.4, 2.2, 0.7, width, 0.5), ...box(2.8, -2.4, 1, 1.3, width, 0.48)];
  return [seg(-6.4, -2.2, 6.4, -2.2, width, 0.56), seg(-6.4, 2.2, 6.4, 2.2, width, 0.56), seg(-4.2, -4.4, -4.2, 4.4, width, 0.5), seg(0, -4.4, 0, 4.4, width, 0.5), seg(4.2, -4.4, 4.2, 4.4, width, 0.5)];
}

function wideHalls(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-7.6, 0, 7.6, 0, width, 0.7), seg(-5.2, 0, -5.2, 1.8, width, 0.46), seg(5.2, 0, 5.2, 1.8, width, 0.46)];
  if (cycle === 1) return [seg(-7.6, 0, -1.4, 0, width, 0.66), seg(1.8, 0, 7.6, 0, width, 0.66)];
  if (cycle === 2) return [seg(-7.4, -0.6, 7.4, -0.6, width, 0.62), seg(-7.4, 1.8, 3.2, 1.8, width, 0.48)];
  if (cycle === 3) return [...box(-6.2, 0, 1.2, 1.5, width, 0.55), seg(-4.6, 0, 4.4, 0, width, 0.6), ...box(6.2, 0, 0.7, 2.4, width, 0.48)];
  return [seg(-7.5, 0, 7.5, 0, width, 0.68), ...plus(-6.4, 0, 0.6, 1.2, width, 0.4), ...plus(6.6, 0, 1.1, 0.5, width, 0.42)];
}

function tallHalls(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(0, -7.2, 0, 7.2, width, 0.7), seg(-1.8, 6.4, 1.8, 6.4, width, 0.5)];
  if (cycle === 1) return [seg(-0.9, -6.6, -0.9, 6.6, width, 0.58), seg(0.9, -6.6, 0.9, 6.6, width, 0.58)];
  if (cycle === 2) return [seg(0, -7, 0, -1.2, width, 0.64), seg(0, 1.6, 0, 7, width, 0.64)];
  if (cycle === 3) return box(0, 0, 1.15, 6.4, width, 0.56);
  return [seg(0, -6.8, 0, 6.8, width, 0.66), ...box(0, -5.6, 1.6, 0.7, width, 0.46), ...plus(0, 5.8, 0.5, 0.9, width, 0.42)];
}

function offsetRows(cycle: number, width: number): Mark[] {
  const dashes = [
    [[-6.8, -4.2, -3], [-1.2, 1.4, -3], [3.2, 6.6, -3], [-5.4, -2.2, 0.4], [0.6, 4.8, 0.4], [-6.2, -3.6, 3.4], [-0.4, 2.2, 3.4], [4.4, 6.8, 3.4]],
    [[-7, -5.6, -2.2], [-2.4, 0.2, -2.2], [3.4, 5.2, 1.6], [-6.4, -4.8, 4.2], [1.2, 2.4, 4.2]],
    [[-6.6, -1.2, -4.2], [1.4, 6.8, -4.2], [-7.2, -4.4, 0], [-1.6, 0.8, 0], [3.6, 7, 0], [-5.2, -2.8, 4.4], [0.4, 3.2, 4.4]],
    [[-7.2, -6, -1], [-3.2, -2.2, -1], [1.4, 2.2, 2.4], [4.6, 5.4, 2.4], [-4.4, -3.2, 5], [2.8, 4.2, -4.6]],
    [[-6.4, -2.2, -3.6], [0.8, 6.6, -3.6], [-7, -5.2, 1.2], [-2.6, -1.2, 1.2], [2.4, 4.2, 1.2], [-4.8, 1.6, 4.8]],
  ][cycle];
  return dashes.map(([u0, u1, v], index) => seg(u0, v, u1, v, width * (index % 2 === 0 ? 1 : 0.8), 0.44));
}

function sideAisle(cycle: number, width: number): Mark[] {
  if (cycle === 0) return poly([[-6.4, -1.2], [5.6, -1.2], [5.6, 5.4]], width, 0.62);
  if (cycle === 1) return poly([[-1.4, -6.2], [-1.4, 4.8], [5.8, 4.8]], width, 0.62);
  if (cycle === 2) return [seg(-6.2, -1, 1.2, -1, width, 0.58), seg(3.4, -1, 6.2, -1, width, 0.5), seg(6.2, -1, 6.2, 5.2, width, 0.55)];
  if (cycle === 3) return [...box(-4.2, -2.2, 1.6, 0.8, width, 0.52), ...box(-1.2, -2.2, 0.9, 0.8, width, 0.48), ...box(2.4, -2.2, 1.3, 0.8, width, 0.5), ...box(4.6, 0.6, 0.8, 1.4, width, 0.48), ...box(4.6, 3.6, 0.8, 0.7, width, 0.44)];
  return [...poly([[-5.4, -3.2], [2.2, -3.2], [2.2, 1.4]], width, 0.58), ...poly([[-1.2, 2.4], [-1.2, 5.6], [5.4, 5.6]], width * 0.9, 0.46)];
}

function doubleAisle(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-4.2, -5.2, -4.2, 5.2, width, 0.58), seg(4.2, -5.2, 4.2, 5.2, width, 0.58), seg(-4.2, 0, 4.2, 0, width, 0.62)];
  if (cycle === 1) return [seg(-4.6, -5.4, -4.6, 5.4, width, 0.56), seg(4.6, -5.4, 4.6, 5.4, width, 0.56), seg(-4.6, 3.6, 4.6, 3.6, width, 0.6)];
  if (cycle === 2) return [seg(-4.4, -5, -4.4, 5, width, 0.6), seg(-4.4, 0.4, 3.2, 0.4, width, 0.52)];
  if (cycle === 3) return [seg(-3.6, -6.2, -3.6, 2.2, width, 0.56), seg(4.4, -2.4, 4.4, 6.2, width, 0.56), seg(-3.6, 0, 4.4, 0, width, 0.6)];
  return [seg(-4.8, -4.8, -4.8, 4.8, width, 0.55), seg(4.8, -4.8, 4.8, 4.8, width, 0.55), ...box(0, 0.2, 1.6, 0.7, width, 0.46)];
}

function cornerClusters(cycle: number, width: number): Mark[] {
  const big = [
    [0, 2.4, 1.8],
    [1, 2.6, 1.5],
    [2, 2.2, 2],
    [3, 2.8, 1.4],
    [0, 1.2, 2.6],
  ][cycle];
  const spots: Array<[number, number]> = [[-5.4, 4.4], [5.6, 4.2], [-5.6, -4.4], [5.4, -4.6]];
  return spots.flatMap(([u, v], i) => {
    const huge = i === big[0];
    const w = huge ? big[1] : 0.55 + (i % 2) * 0.25;
    const h = huge ? big[2] : 0.45 + ((i + 1) % 2) * 0.3;
    return cycle === 3 ? plus(u, v, w, h, width, 0.52) : box(u, v, w, h, width, huge ? 0.62 : 0.44);
  });
}

function openFrame(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-5.4, -3.6, -5.4, 3.8, width, 0.58), seg(-5.4, -3.6, 5.4, -3.6, width, 0.6), seg(5.4, -3.6, 5.4, 3.8, width, 0.58)];
  if (cycle === 1) return [seg(-6.6, 2.8, -6.6, -2.2, width, 0.55), seg(-6.6, 2.8, 6.6, 2.8, width, 0.6), seg(6.6, 2.8, 6.6, -2.2, width, 0.55)];
  if (cycle === 2) return [seg(4.8, -5.2, 4.8, 5.2, width, 0.58), seg(4.8, -5.2, -3.2, -5.2, width, 0.55), seg(4.8, 5.2, -3.2, 5.2, width, 0.55)];
  if (cycle === 3) return [...box(-4.2, -2.4, 1.1, 0.7, width, 0.48), ...box(0, -2.4, 1.6, 0.7, width, 0.52), ...box(4.2, -2.4, 0.8, 0.7, width, 0.46), ...box(-4.6, 1.2, 0.7, 1.6, width, 0.48), ...box(4.6, 1.6, 0.7, 1.2, width, 0.48)];
  return [seg(-2.2, -6.2, -2.2, 5.4, width, 0.58), seg(-2.2, -6.2, 2.2, -6.2, width, 0.55), seg(2.2, -6.2, 2.2, 5.4, width, 0.58)];
}

function staggered(cycle: number, width: number): Mark[] {
  if (cycle === 0) return poly([[-6.4, -4.2], [-2.2, -4.2], [-2.2, -1.2], [1.8, -1.2], [1.8, 1.8], [6.2, 1.8]], width, 0.6);
  if (cycle === 1) return poly([[-6.6, -3.4], [0.4, -3.4], [0.4, 3.6], [6.6, 3.6]], width, 0.62);
  if (cycle === 2) return poly([[-6.2, -5], [-3.6, -5], [-3.6, -2.4], [-1, -2.4], [-1, 0.2], [1.6, 0.2], [1.6, 2.8], [4.2, 2.8], [4.2, 5.2]], width, 0.55);
  if (cycle === 3) return [...poly([[-6.4, -3.6], [-1.2, -3.6], [-1.2, 0.4], [2.4, 0.4]], width, 0.58), ...box(5.2, 2.6, 1.1, 1.6, width, 0.46)];
  return poly([[-5.8, 4.6], [-5.8, 1.2], [-1.6, 1.2], [-1.6, -1.6], [2.4, -1.6], [2.4, -4.8], [6.2, -4.8]], width, 0.58);
}

function spine(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-2.2, 0, 6.8, 0, width, 0.66), seg(0, -2.4, 0, 5.6, width, 0.6)];
  if (cycle === 1) return [seg(-6.4, 0, 6.4, 0, width, 0.66), seg(0, 0, 0, 5.8, width, 0.58)];
  if (cycle === 2) return [seg(-5.2, -1.6, 4.2, -1.6, width, 0.62), seg(1.4, -4.8, 1.4, 3.6, width, 0.58)];
  if (cycle === 3) return [seg(-6.2, 0, 4.6, 0, width, 0.64), seg(0, -3.2, 0, 3.2, width, 0.56), ...box(5.8, 0, 1.1, 1.4, width, 0.46)];
  return [seg(-5.6, 0, 6.2, 0, width, 0.64), seg(0, -0.8, 0, 5.4, width, 0.55), seg(-2.4, 0, -2.4, -1.4, width, 0.4)];
}

function court(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-4.4, -3.4, 1.2, -3.4, width, 0.56), seg(3.2, -3.4, 4.4, -3.4, width, 0.56), seg(-4.4, -3.4, -4.4, 3.4, width, 0.55), seg(4.4, -3.4, 4.4, 3.4, width, 0.55), seg(-4.4, 3.4, 4.4, 3.4, width, 0.56)];
  if (cycle === 1) return [seg(-6.2, -2.2, 6.2, -2.2, width, 0.55), seg(-6.2, 2.2, 6.2, 2.2, width, 0.55), seg(-6.2, -2.2, -6.2, 2.2, width, 0.52), seg(6.2, -2.2, 6.2, 0.2, width, 0.48), seg(6.2, 1.2, 6.2, 2.2, width, 0.48)];
  if (cycle === 2) return [...box(0, 0, 4.6, 3.4, width, 0.54), seg(-0.6, -3.4, 0.8, -3.4, width, 0.3), ...plus(0, 0, 1.2, 0.8, width, 0.4)];
  if (cycle === 3) return [...box(0, 0, 5.2, 3.6, width, 0.54), seg(-0.8, -3.6, 0.8, -3.6, width, 0.28), seg(-0.8, -3.6, -0.8, -2.2, width, 0.4), seg(0.8, -3.6, 0.8, -2.2, width, 0.4)];
  return [...box(-3.2, 0, 2.2, 2.6, width, 0.54), ...box(3.4, 0, 1.6, 2.6, width, 0.5), seg(1.6, -2.6, 1.6, -0.6, width, 0.4)];
}

function loose(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [...box(-4.2, 0.2, 2.4, 2, width, 0.58), ...box(5.2, -0.4, 0.7, 0.6, width, 0.44)];
  if (cycle === 1) return [...box(-4.2, 0.2, 2.4, 2, width, 0.56), seg( -1.6, 0.2, 4.2, 0.2, width, 0.4), ...box(5.2, -0.4, 0.7, 0.6, width, 0.44)];
  if (cycle === 2) return [...box(0, -4.2, 2.2, 1.2, width, 0.56), ...box(0.4, 4.6, 0.6, 0.8, width, 0.42)];
  if (cycle === 3) return [...plus(-4.4, 0.6, 2.2, 1.4, width, 0.55), ...box(4.8, -0.8, 1.1, 1.6, width, 0.48)];
  return [...box(-5.2, 2.4, 1.8, 1.3, width, 0.55), ...box(4.6, 2.8, 0.7, 0.55, width, 0.42), ...plus(0.2, -4.2, 0.45, 0.9, width, 0.4)];
}

function pinwheel(cycle: number, width: number): Mark[] {
  const arms = [
    [6.2, 3.4, 5.4, 2.2],
    [3.2, 6.4, 4.2, 5.2],
    [7, 2.4, 3.6, 6],
    [4.4, 4.8, 6.6, 2.6],
    [5.6, 5.2, 2.8, 6.2],
  ][cycle];
  const gap = 1.5;
  const marks = [
    seg(gap, 0, arms[0], 0, width, 0.62),
    seg(0, gap, 0, arms[1], width, 0.56),
    seg(-gap, 0, -arms[2], 0, width, 0.58),
    seg(0, -gap, 0, -arms[3], width, 0.5),
  ];
  if (cycle === 4) marks.pop();
  if (cycle === 2) marks.push(...box(arms[0], 0, 0.7, 0.9, width, 0.4));
  return marks;
}

function merged(cycle: number, width: number): Mark[] {
  if (cycle === 0) return poly([[-5.4, -3.8], [5.4, -3.8], [5.4, 1.6], [2.2, 1.6], [2.2, 3.8], [-5.4, 3.8], [-5.4, -3.8]], width, 0.56);
  if (cycle === 1) return poly([[-3.4, -2.4], [6.2, -2.4], [6.2, 2.4], [-6.2, 2.4], [-6.2, 0.4], [-3.4, 0.4], [-3.4, -2.4]], width, 0.55);
  if (cycle === 2) return poly([[-3.6, -2.6], [3.6, -2.6], [3.6, 5.2], [-3.6, 5.2], [-3.6, -2.6], [-1.2, -2.6], [-1.2, -5.2], [1.4, -5.2], [1.4, -2.6]], width, 0.55);
  if (cycle === 3) return poly([[-2.6, -3.8], [5.4, -3.8], [5.4, 3.8], [-5.4, 3.8], [-5.4, 1.2], [-2.6, 1.2], [-2.6, -1.4], [-5.4, -1.4], [-5.4, -3.8], [-2.6, -3.8]], width, 0.54);
  return poly([[-4.8, -4.2], [4.8, -4.2], [4.8, 2.2], [1.6, 2.2], [1.6, 4.2], [-4.8, 4.2], [-4.8, -4.2]], width, 0.54);
}

function lanes(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-7.2, -3.6, 7.2, -3.6, width, 0.6), seg(-7.2, 3.6, 7.2, 3.6, width, 0.6)];
  if (cycle === 1) return [seg(-7, -0.7, 7, -0.7, width, 0.62), seg(-7, 0.7, 7, 0.7, width, 0.62)];
  if (cycle === 2) return [seg(-7.2, -2.4, 6.4, -2.4, width, 0.6), seg(-3.2, 2.8, 7.2, 2.8, width, 0.5)];
  if (cycle === 3) return [seg(-7.2, -3.2, 7.2, -3.2, width, 0.58), seg(-2.2, 0.2, 3.4, 0.2, width, 0.46), seg(-7.2, 3.4, 7.2, 3.4, width, 0.58)];
  return [seg(-7.4, -2.2, 7.4, -2.2, width, 0.62), seg(-6.2, 1.4, -3.4, 1.4, width, 0.44), seg(-0.6, 1.4, 2.2, 1.4, width, 0.44), seg(4.4, 1.4, 6.8, 1.4, width, 0.44)];
}

function endBand(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [...box(-1.6, -4.6, 0.7, 0.55, width, 0.48), ...box(0.2, -4.6, 0.45, 0.7, width, 0.46), ...box(1.6, -4.8, 0.6, 0.4, width, 0.44), ...box(-0.4, -3.2, 0.35, 0.35, width, 0.42), seg(-6.4, 4.8, 6.4, 4.8, width, 0.6)];
  if (cycle === 1) return [...box(-5.2, -1.2, 0.6, 0.5, width, 0.48), ...box(-5.2, 0.4, 0.45, 0.7, width, 0.46), ...box(-5.4, 1.8, 0.7, 0.4, width, 0.44), seg(4.6, -6.2, 4.6, 6.2, width, 0.62)];
  if (cycle === 2) return [...plus(-1.2, -4.4, 0.8, 0.4, width, 0.46), ...plus(0.8, -4.6, 0.4, 0.7, width, 0.44), ...plus(2.2, -4.2, 0.55, 0.35, width, 0.42), seg(-6.2, 4.6, 5.4, 4.6, width, 0.58)];
  if (cycle === 3) return [...box(-1.4, -4.4, 0.8, 0.5, width, 0.48), ...box(0.6, -4.6, 0.5, 0.7, width, 0.46), ...box(0, 4.4, 2.4, 1.1, width, 0.55)];
  return [...box(-5.2, 1.2, 1.4, 0.6, width, 0.52), ...box(-5.4, -0.6, 0.6, 0.45, width, 0.44), ...box(4.8, -1.4, 0.5, 0.8, width, 0.46), ...box(5.2, 0.8, 0.9, 0.4, width, 0.48), seg(-2.2, 0, 2.2, 0, width, 0.4)];
}

function raft(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [...box(-5.4, 0, 0.5, 0.45, width, 0.44), ...box(-2.8, 0, 1, 0.8, width, 0.5), ...box(0.6, 0, 2.1, 1.5, width, 0.58), ...box(4.2, 0, 0.9, 0.7, width, 0.48), ...box(6.2, 0, 0.45, 0.4, width, 0.42)];
  if (cycle === 1) return [...box(-5.2, 0, 2.2, 1.4, width, 0.58), ...box(-1.2, 0, 0.45, 0.4, width, 0.42), ...box(1.2, 0, 0.5, 0.55, width, 0.44), ...box(4.6, 0, 1.3, 1, width, 0.52)];
  if (cycle === 2) return [...box(0, -5.2, 0.5, 0.45, width, 0.44), ...box(0, -2.4, 0.9, 1, width, 0.5), ...box(0, 1.2, 1.5, 1.8, width, 0.58), ...box(0, 4.8, 0.55, 0.6, width, 0.44)];
  if (cycle === 3) return [...box(-4.6, 0, 2.4, 1.8, width, 0.58), ...box(0.4, 0, 0.4, 0.35, width, 0.4), ...box(4.4, 0, 1.2, 0.7, width, 0.48)];
  return [...box(-5.2, -2.4, 0.6, 0.45, width, 0.44), ...box(-2.2, -0.6, 1, 0.8, width, 0.5), ...box(1.2, 1.2, 1.6, 1.2, width, 0.56), ...box(4.8, 3.2, 0.7, 0.5, width, 0.44)];
}

function ribbons(cycle: number, width: number): Mark[] {
  if (cycle === 0) return poly([[-6.4, -3.6], [2.2, -3.6], [2.2, -0.8], [-4.2, -0.8], [-4.2, 2], [5.6, 2], [5.6, 4.6], [-1.2, 4.6]], width, 0.58);
  if (cycle === 1) return poly([[-2.4, -2.2], [2.6, -2.2], [2.6, 0.2], [-2.2, 0.2], [-2.2, 2.4], [2.4, 2.4]], width, 0.6);
  if (cycle === 2) return [...poly([[-6.2, -4], [4.2, -4], [4.2, -1.2], [-3.2, -1.2], [-3.2, 1.6], [5.4, 1.6]], width, 0.56), seg(-6.4, 4.4, 6.4, 4.4, width, 0.42)];
  if (cycle === 3) return [...poly([[-5.2, 1.2], [-1.2, 1.2], [-1.2, 4.2], [2.4, 4.2]], width, 0.55), ...box(3.6, -2.6, 1.4, 1, width, 0.46)];
  return poly([[-4.6, -5.4], [-4.6, -1.6], [1.2, -1.6], [1.2, 1.4], [-3.4, 1.4], [-3.4, 5.2], [4.8, 5.2]], width, 0.56);
}

function nested(cycle: number, width: number): Mark[] {
  const outer = [seg(-6.2, -4.4, 6.2, -4.4, width, 0.56), seg(-6.2, 4.4, 6.2, 4.4, width, 0.56), seg(-6.2, -4.4, -6.2, 4.4, width, 0.52)];
  const mid = [seg(-3.4, -2.2, 3.4, -2.2, width, 0.48), seg(3.4, -2.2, 3.4, 2.2, width, 0.46), seg(-3.4, 2.2, 3.4, 2.2, width, 0.48)];
  const inner = [seg(-1.2, -0.8, 1.2, -0.8, width, 0.4), seg(-1.2, -0.8, -1.2, 0.8, width, 0.4), seg(-1.2, 0.8, 1.2, 0.8, width, 0.4)];
  if (cycle === 0) return [...outer, ...mid, ...inner];
  if (cycle === 1) return [...outer, ...mid];
  if (cycle === 2) return [...box(0, 0, 6, 4.2, width, 0.55), ...plus(0, 0, 2.2, 1.3, width, 0.42)];
  if (cycle === 3) return [...box(-1.4, 0.8, 4.6, 3.2, width, 0.54), ...box(1.6, -0.8, 2.2, 1.4, width, 0.44)];
  return [...outer, ...box(-1.2, 0, 0.7, 0.5, width, 0.4), ...box(1.4, 0, 1.1, 0.8, width, 0.44), ...box(3.6, 0, 0.45, 0.4, width, 0.4)];
}

function comb(cycle: number, width: number): Mark[] {
  if (cycle === 0) return [seg(-4.2, -4.6, -4.2, 4.6, width, 0.64), seg(-4.2, -3.2, -1.6, -3.2, width, 0.48), seg(-4.2, 0, 2.4, 0, width, 0.55), seg(-4.2, 3.2, -0.4, 3.2, width, 0.46)];
  if (cycle === 1) return [seg(-3.6, -5, -3.6, 5, width, 0.64), seg(-3.6, -2.4, 3.6, -2.4, width, 0.55), seg(-3.6, 3.2, 0.2, 3.2, width, 0.46)];
  if (cycle === 2) return [seg(4.2, -4.8, 4.2, 4.8, width, 0.64), seg(4.2, -3, -1.4, -3, width, 0.5), seg(4.2, 0.2, -3.2, 0.2, width, 0.56), seg(4.2, 3.4, 1.2, 3.4, width, 0.44)];
  if (cycle === 3) return [seg(-4.4, -4.4, -4.4, 4.4, width, 0.6), seg(4.4, -4.4, 4.4, 4.4, width, 0.55), seg(-4.4, -2.6, 1.2, -2.6, width, 0.48), seg(-2.2, 0.4, 4.4, 0.4, width, 0.48), seg(-4.4, 3, 2.6, 3, width, 0.5)];
  return [seg(-4.6, -5.2, -4.6, 3.6, width, 0.62), seg(-4.6, -3.4, 1.6, -3.4, width, 0.5), seg(-4.6, 0, 3.4, 0, width, 0.54), seg(-4.6, 3.2, 0.4, 3.2, width, 0.46), ...box(-4.6, -5.6, 1.2, 0.45, width, 0.42)];
}

function familyMarks(plan: OpenHallPlan): Mark[] {
  const width = 0.32 + (plan.index % 5) * 0.04;
  switch (plan.kind) {
    case "equal-grid":
      return equalGrid(plan.cycle, width);
    case "wide-bays":
      return wideHalls(plan.cycle, width);
    case "tall-bays":
      return tallHalls(plan.cycle, width);
    case "offset-rows":
      return offsetRows(plan.cycle, width);
    case "side-aisle":
      return sideAisle(plan.cycle, width);
    case "double-aisle":
      return doubleAisle(plan.cycle, width);
    case "corner-clusters":
      return cornerClusters(plan.cycle, width);
    case "open-frame":
      return openFrame(plan.cycle, width);
    case "staggered":
      return staggered(plan.cycle, width);
    case "spine":
      return spine(plan.cycle, width);
    case "court":
      return court(plan.cycle, width);
    case "loose":
      return loose(plan.cycle, width);
    case "pinwheel":
      return pinwheel(plan.cycle, width);
    case "merged":
      return merged(plan.cycle, width);
    case "lanes":
      return lanes(plan.cycle, width);
    case "end-band":
      return endBand(plan.cycle, width);
    case "raft":
      return raft(plan.cycle, width);
    case "ribbons":
      return ribbons(plan.cycle, width);
    case "nested":
      return nested(plan.cycle, width);
    case "comb":
      return comb(plan.cycle, width);
    default:
      return equalGrid(plan.cycle, width);
  }
}

function place(marks: Mark[], plan: OpenHallPlan): FieldAttractor[] {
  const cos = plan.turn === 0 ? 1 : 0;
  const sin = plan.turn === 0 ? 0 : 1;
  const flip = plan.flip ? -1 : 1;
  const map = (u: number, v: number) => {
    const sv = v * flip;
    return {
      x: lim(CENTER + plan.driftX + u * cos - sv * sin),
      y: lim(CENTER + plan.driftY + u * sin + sv * cos),
    };
  };
  return marks.map((mark) => {
    const a = map(mark.u, mark.v);
    const b = map(mark.u2, mark.v2);
    return {
      kind: "line" as const,
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      radius: mark.radius,
      strength: mark.strength,
    };
  });
}

export function attractorsFromOpenHall(plan: OpenHallPlan, _seed: number, _attempt = 0): FieldAttractor[] {
  return place(familyMarks(plan), plan);
}

const GROWTH_SLIME: Record<OpenHallGrowth, (f: Frame) => Partial<SlimeControls>> = {
  filament: (f) => ({
    persistence: f.r(0.72, 0.9),
    trailInfluence: f.r(1.15, 1.7),
    deposit: f.r(0.016, 0.04),
    depositWidth: f.r(0.22, 0.38),
    diffusion: 0,
    randomness: f.r(0.03, 0.12),
    trailCap: f.r(0.4, 0.72),
    sensorAngle: f.r(0.08, 0.2),
    stepSize: f.r(0.12, 0.2),
  }),
  sparse: (f) => ({
    persistence: f.r(0.3, 0.5),
    trailInfluence: f.r(0.35, 0.75),
    deposit: f.r(0.01, 0.024),
    depositWidth: f.r(0.2, 0.32),
    diffusion: 0,
    randomness: f.r(0.06, 0.2),
    trailCap: f.r(0.26, 0.48),
    sensorAngle: f.r(0.16, 0.34),
    stepSize: f.r(0.16, 0.28),
  }),
  sharp: (f) => ({
    persistence: f.r(0.82, 0.94),
    trailInfluence: f.r(1.35, 1.9),
    deposit: f.r(0.02, 0.048),
    depositWidth: f.r(0.2, 0.32),
    diffusion: 0,
    randomness: f.r(0.01, 0.08),
    trailCap: f.r(0.5, 0.9),
    sensorAngle: f.r(0.05, 0.14),
    stepSize: f.r(0.1, 0.16),
  }),
  wander: (f) => ({
    persistence: f.r(0.24, 0.46),
    trailInfluence: f.r(0.32, 0.7),
    deposit: f.r(0.012, 0.03),
    depositWidth: f.r(0.22, 0.4),
    diffusion: 0,
    randomness: f.r(0.32, 0.62),
    trailCap: f.r(0.3, 0.55),
    sensorAngle: f.r(0.28, 0.52),
    stepSize: f.r(0.16, 0.3),
  }),
  committed: (f) => ({
    persistence: f.r(0.64, 0.84),
    trailInfluence: f.r(1, 1.55),
    deposit: f.r(0.022, 0.05),
    depositWidth: f.r(0.24, 0.44),
    diffusion: 0,
    randomness: f.r(0.03, 0.12),
    trailCap: f.r(0.55, 0.9),
    sensorAngle: f.r(0.08, 0.2),
    stepSize: f.r(0.11, 0.18),
  }),
};

export function slimeFromOpenHall(base: SlimeControls, plan: OpenHallPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index ^ plan.growth.length);
  const f = frame(rng);
  const marks = attractorsFromOpenHall(plan, seed);
  const foodPoints = marks.slice(0, 6).map((mark) => ({
    x: (mark.x + (mark.x2 ?? mark.x)) / 2,
    y: (mark.y + (mark.y2 ?? mark.y)) / 2,
  }));
  return {
    ...base,
    ...GROWTH_SLIME[plan.growth](f),
    resistance: f.r(0.02, 0.22),
    crowdingLimit: f.int(8, 28),
    foodPoints: foodPoints.length ? foodPoints : base.foodPoints,
    voidElongation: 1,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function paramsFromOpenHall(base: BiologicalParams, seed: number): BiologicalParams {
  const rng = mulberry32(seed ^ 0x0e11aa);
  return {
    ...base,
    attractionStrength: 0.52 + rng() * 0.38,
    networkDensity: 0.18 + rng() * 0.28,
    permeability: 0.62 + rng() * 0.28,
    flowCoupling: 0.34 + rng() * 0.3,
    directionalBias: 0.35 + rng() * 0.3,
    geometryVariation: 0.22 + rng() * 0.28,
  };
}

export function recipeFromOpenHall(recipe: SpatialRecipe, seed: number): SpatialRecipe {
  const rng = mulberry32(seed ^ 0x0e11ec);
  const f = frame(rng);
  return {
    ...recipe,
    clustering: f.r(0.08, 0.32),
    isolationRadius: f.r(3.6, 6.6),
    approachWidth: f.r(2.6, 4.8),
    coreExposure: f.r(0.74, 0.94),
    enclosureCollar: f.r(0.35, 1.05),
  };
}

export function agentsFromOpenHall(plan: OpenHallPlan, seed: number) {
  const rng = mulberry32(seed ^ 0x0e1a22 ^ plan.index);
  const byGrowth: Record<OpenHallGrowth, [number, number]> = {
    filament: [96, 128],
    sparse: [58, 84],
    sharp: [120, 160],
    wander: [72, 108],
    committed: [140, 178],
  };
  const [min, max] = byGrowth[plan.growth];
  return Math.round(Math.min(180, Math.max(MIN_AGENT_COUNT, min + rng() * (max - min))));
}

/** Coarse layout signature so two cells can be compared without a second simulation. */
export function openHallSignature(plan: OpenHallPlan, marks: FieldAttractor[]): number[] {
  let span = 0;
  let length = 0;
  let horizontal = 0;
  for (const mark of marks) {
    const dx = (mark.x2 ?? mark.x) - mark.x;
    const dy = (mark.y2 ?? mark.y) - mark.y;
    length += Math.hypot(dx, dy);
    if (Math.abs(dx) >= Math.abs(dy)) horizontal += 1;
    span = Math.max(span, Math.hypot(mark.x - CENTER, mark.y - CENTER));
  }
  return [
    OPEN_HALL_FAMILIES.indexOf(plan.kind),
    OPEN_HALL_GROWTHS.indexOf(plan.growth),
    plan.turn,
    plan.flip ? 1 : 0,
    plan.cycle,
    Math.round(length),
    Math.round(span * 4),
    marks.length,
    horizontal,
  ];
}

export function isNovelOpenHall(signature: number[], previous: number[][]) {
  return previous.every((other) => {
    if (other[0] !== signature[0] || other[1] !== signature[1]) return true;
    let delta = 0;
    for (let i = 2; i < signature.length; i += 1) delta += Math.abs((other[i] ?? 0) - signature[i]);
    return delta > 4;
  });
}
