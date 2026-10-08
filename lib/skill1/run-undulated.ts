import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor } from "./types";

/**
 * Undulated workspace, drawn like a plan: straight walls, hair-thin.
 * The long plates bow. Rooms stay open to each other. Each cell is a
 * different arrangement of those plates. Diffusion stays off.
 */

const EDGE = 1.45;

export const UNDULATED_GROWTH = ["filament", "sharp", "sparse", "committed", "wander"] as const;
export type UndulatedGrowth = (typeof UNDULATED_GROWTH)[number];

export const UNDULATED_KINDS = ["bays", "slots", "corridor", "court", "collective", "jog", "spine", "steps", "nested", "cross", "lot", "chain"] as const;
export type UndulatedKind = (typeof UNDULATED_KINDS)[number];

export const UNDULATED_WEIGHTS = ["hair", "fine", "mid", "bold"] as const;
export const UNDULATED_INKS = ["ghost", "veil", "ink", "solid"] as const;
export type UndulatedWeight = (typeof UNDULATED_WEIGHTS)[number];
export type UndulatedInk = (typeof UNDULATED_INKS)[number];

export type UndulatedPlan = {
  growth: UndulatedGrowth;
  index: number;
  kind: UndulatedKind;
  struct: number;
  weight: UndulatedWeight;
  ink: UndulatedInk;
  angle: number;
  anchorX: number;
  anchorY: number;
  spine: number;
};

type Wall = { x: number; y: number; x2: number; y2: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

function plateBox(index: number): Box {
  const aspect = (index * 5) % 6;
  const w = [12.4, 9.2, 14.2, 8.2, 11, 7.6][aspect];
  const h = [7.4, 11.6, 8.2, 13.2, 9.4, 10.2][aspect];
  const slackX = Math.max(0, FIELD_SIZE - EDGE * 2 - w);
  const slackY = Math.max(0, FIELD_SIZE - EDGE * 2 - h);
  const x0 = EDGE + slackX * (((index * 3) % 7) / 6);
  const y0 = EDGE + slackY * (((index * 5) % 7) / 6);
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

function xy(box: Box, u: number, v: number) {
  return {
    x: lim(box.x0 + u * (box.x1 - box.x0)),
    y: lim(box.y0 + v * (box.y1 - box.y0)),
  };
}

function wall(walls: Wall[], box: Box, u: number, v: number, u2: number, v2: number, gapAt?: number) {
  const push = (a: number, b: number, c: number, d: number) => {
    const p = xy(box, a, b);
    const q = xy(box, c, d);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 0.35) return;
    walls.push({ x: p.x, y: p.y, x2: q.x, y2: q.y });
  };
  if (gapAt == null) {
    push(u, v, u2, v2);
    return;
  }
  const a = Math.max(0.08, gapAt - 0.1);
  const b = Math.min(0.92, gapAt + 0.1);
  push(u, v, u + (u2 - u) * a, v + (v2 - v) * a);
  push(u + (u2 - u) * b, v + (v2 - v) * b, u2, v2);
}

/** A long plate. The bow points along (nx, ny), into the plan, and stays shallow. */
function bow(walls: Wall[], box: Box, u0: number, v0: number, u1: number, v1: number, nx: number, ny: number, amp: number, phase: number, crests = 1) {
  const steps = crests === 1 ? 6 : 8;
  let pu = u0;
  let pv = v0;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const off = Math.sin(phase + t * Math.PI * 2 * crests) * amp;
    const u = u0 + (u1 - u0) * t + nx * off;
    const v = v0 + (v1 - v0) * t + ny * off;
    wall(walls, box, pu, pv, u, v);
    pu = u;
    pv = v;
  }
}

function bays(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const count = 3 + (v % 3);
  const crosses = 1 + (v % 3);
  const amp = 0.055 + (v % 3) * 0.012;
  for (let i = 0; i < count; i += 1) {
    const y = 0.06 + (i / (count - 1)) * 0.88;
    const into = i === count - 1 ? -1 : 1;
    if (i === 0 || i === count - 1) bow(walls, box, 0.04, y, 0.96, y, 0, into, amp, 0.3 + i, v % 4 === 3 ? 2 : 1);
    else wall(walls, box, 0.04, y, 0.96, y, 0.22 + ((i + v) % 3) * 0.18);
  }
  for (let c = 0; c < crosses; c += 1) {
    const x = 0.28 + c * (0.44 / Math.max(1, crosses - 1 || 1));
    const band = (c + v) % (count - 1);
    const y0 = 0.06 + (band / (count - 1)) * 0.88;
    const y1 = 0.06 + ((band + 1) / (count - 1)) * 0.88;
    wall(walls, box, x, y0, x, y1, 0.42);
  }
  if (v % 2 === 0) wall(walls, box, 0.04, 0.06, 0.04, 0.94, 0.55);
  else wall(walls, box, 0.96, 0.06, 0.96, 0.7);
  return walls;
}

function slots(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const n = 3 + (v % 3);
  const left = v % 2 === 0;
  bow(walls, box, left ? 0.04 : 0.96, 0.06, left ? 0.04 : 0.96, 0.94, left ? 1 : -1, 0, 0.07, v * 0.4, 1);
  wall(walls, box, 0.04, 0.94, 0.96, 0.94);
  wall(walls, box, 0.04, 0.06, 0.96, 0.06, 0.3 + (v % 3) * 0.15);
  for (let i = 1; i < n; i += 1) {
    const x = 0.08 + (i / n) * 0.84;
    const reach = 0.42 + (i % 3) * 0.14;
    wall(walls, box, x, 0.94, x, 0.94 - reach);
  }
  if (!left) wall(walls, box, 0.04, 0.2, 0.04, 0.94);
  return walls;
}

function corridor(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const y0 = 0.32 + (v % 3) * 0.04;
  const y1 = y0 + 0.2;
  wall(walls, box, 0.04, y0, 0.96, y0);
  bow(walls, box, 0.04, y1, 0.96, y1, 0, 1, 0.05, 0.4 + v * 0.1, v % 3 === 0 ? 2 : 1);
  const rooms = 2 + (v % 3);
  for (let i = 0; i < rooms; i += 1) {
    const x = (i + 1) / (rooms + 1);
    wall(walls, box, x, 0.06, x, y0, 0.38);
    if (v % 2 === 0) wall(walls, box, x, y1, x, 0.94, 0.62);
  }
  wall(walls, box, 0.04, 0.06, 0.04, 0.94, 0.5);
  wall(walls, box, 0.96, 0.06, 0.96, 0.94, 0.35 + (v % 2) * 0.2);
  if (v % 2 === 1) wall(walls, box, 0.04, 0.06, 0.96, 0.06);
  else wall(walls, box, 0.04, 0.94, 0.7, 0.94);
  return walls;
}

function court(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  bow(walls, box, 0.06, 0.9, 0.94, 0.9, 0, -1, 0.07 + (v % 3) * 0.012, 0.25 * v, v % 4 === 0 ? 2 : 1);
  wall(walls, box, 0.06, 0.08, 0.94, 0.08, v % 2 === 0 ? 0.72 : undefined);
  wall(walls, box, 0.06, 0.08, 0.06, 0.9, 0.58);
  wall(walls, box, 0.94, 0.08, 0.94, 0.9, 0.36);
  const split = 0.34 + (v % 4) * 0.08;
  wall(walls, box, split, 0.08, split, 0.58);
  if (v % 2 === 0) wall(walls, box, 0.12, 0.46, 0.78, 0.46, 0.55);
  else wall(walls, box, split, 0.32, 0.86, 0.32);
  return walls;
}

function collective(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const cols = 2 + (v % 2);
  for (let c = 1; c < cols; c += 1) {
    const x = c / cols;
    bow(walls, box, x, 0.1, x, 0.9, c % 2 === 0 ? 1 : -1, 0, 0.045, c * 0.5, 1);
  }
  wall(walls, box, 0.08, 0.5, 0.92, 0.5, 0.32 + (v % 3) * 0.12);
  bow(walls, box, 0.06, 0.08, 0.94, 0.08, 0, 1, 0.06, 0.2, 1);
  wall(walls, box, 0.06, 0.08, 0.06, 0.72);
  wall(walls, box, 0.94, 0.28, 0.94, 0.92);
  if (v % 3 !== 1) wall(walls, box, 0.2, 0.92, 0.8, 0.92, 0.6);
  return walls;
}

function jog(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const shift = 0.08 + (v % 3) * 0.05;
  wall(walls, box, 0.04, 0.1, 0.58 + shift, 0.1);
  wall(walls, box, 0.04, 0.1, 0.04, 0.52);
  bow(walls, box, 0.04, 0.52, 0.62, 0.52, 0, -1, 0.05, 0.3, 1);
  wall(walls, box, 0.58, 0.28, 0.58, 0.52);
  wall(walls, box, 0.36, 0.4, 0.96, 0.4);
  wall(walls, box, 0.96, 0.4, 0.96, 0.9);
  bow(walls, box, 0.36, 0.9, 0.96, 0.9, 0, -1, 0.055, 0.8, 1);
  wall(walls, box, 0.36, 0.52, 0.36, 0.9, 0.45);
  if (v % 2 === 0) wall(walls, box, 0.28, 0.1, 0.28, 0.38);
  else wall(walls, box, 0.7, 0.4, 0.7, 0.78);
  return walls;
}

function spine(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const rooms = 3 + (v % 2);
  wall(walls, box, 0.04, 0.42, 0.96, 0.42);
  bow(walls, box, 0.04, 0.58, 0.96, 0.58, 0, 1, 0.045, 0.25, v % 3 === 0 ? 2 : 1);
  for (let i = 0; i < rooms; i += 1) {
    const x0 = 0.06 + (i / rooms) * 0.88;
    const x1 = 0.06 + ((i + 1) / rooms) * 0.88;
    wall(walls, box, x0, 0.08, x1 - 0.02, 0.08);
    wall(walls, box, x0, 0.08, x0, 0.42, i % 2 === 0 ? 0.4 : undefined);
    wall(walls, box, x0, 0.92, x1 - 0.02, 0.92);
    wall(walls, box, x0, 0.58, x0, 0.92, 0.48);
  }
  wall(walls, box, 0.96, 0.08, 0.96, 0.42, 0.5);
  return walls;
}

function steps(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const n = 3 + (v % 2);
  const depth = 0.15;
  const rise = 0.1;
  for (let i = 0; i < n; i += 1) {
    const y = 0.06 + i * (depth + rise);
    const x0 = 0.05 + i * (0.1 + (v % 2) * 0.04);
    const x1 = 0.96 - (n - 1 - i) * 0.06;
    wall(walls, box, x0, y, x1, y);
    bow(walls, box, x0, y + depth, x1, y + depth, 0, 1, 0.04, i * 0.5, 1);
    wall(walls, box, x0, y, x0, y + depth);
    wall(walls, box, x1, y, x1, y + depth, 0.55);
  }
  return walls;
}

function nested(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  bow(walls, box, 0.05, 0.9, 0.95, 0.9, 0, -1, 0.06, 0.3 + v * 0.1, 1);
  wall(walls, box, 0.05, 0.08, 0.95, 0.08, 0.7);
  wall(walls, box, 0.05, 0.08, 0.05, 0.9, 0.4);
  wall(walls, box, 0.95, 0.08, 0.95, 0.9);
  const inset = 0.18 + (v % 3) * 0.04;
  const shift = (v % 2 === 0 ? 0.06 : -0.04);
  wall(walls, box, inset + shift, 0.28, 0.78 + shift, 0.28);
  bow(walls, box, inset + shift, 0.62, 0.78 + shift, 0.62, 0, -1, 0.04, 0.6, 1);
  wall(walls, box, inset + shift, 0.28, inset + shift, 0.62, 0.5);
  wall(walls, box, 0.78 + shift, 0.28, 0.78 + shift, 0.5);
  return walls;
}

function cross(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const y0 = 0.38 + (v % 3) * 0.03;
  const y1 = y0 + 0.18;
  const x0 = 0.36 + (v % 2) * 0.06;
  const x1 = x0 + 0.18;
  wall(walls, box, 0.04, y0, 0.96, y0);
  bow(walls, box, 0.04, y1, 0.96, y1, 0, 1, 0.045, 0.2, 1);
  wall(walls, box, x0, 0.06, x0, 0.94, 0.5);
  bow(walls, box, x1, 0.06, x1, 0.94, 1, 0, 0.04, 0.7, 1);
  wall(walls, box, 0.06, 0.08, x0, 0.08);
  wall(walls, box, x1, 0.08, 0.9, 0.08, 0.6);
  wall(walls, box, 0.06, 0.92, 0.42, 0.92);
  wall(walls, box, 0.06, 0.08, 0.06, y0, 0.45);
  return walls;
}

function lot(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  bow(walls, box, 0.05, 0.88, 0.95, 0.88, 0, -1, 0.075, 0.2 * v, v % 3 === 0 ? 2 : 1);
  wall(walls, box, 0.05, 0.1, 0.95, 0.1);
  wall(walls, box, 0.05, 0.1, 0.05, 0.88, v % 2 === 0 ? 0.6 : undefined);
  wall(walls, box, 0.95, 0.1, 0.95, 0.88, 0.42);
  const bands = 1 + (v % 3);
  for (let i = 0; i < bands; i += 1) {
    const y = 0.32 + i * 0.18;
    const inset = 0.12 + (i % 2) * 0.1;
    wall(walls, box, inset, y, 0.92 - inset, y, i === 1 ? 0.55 : undefined);
  }
  if (v % 2 === 1) wall(walls, box, 0.48, 0.1, 0.48, 0.32);
  return walls;
}

function chain(box: Box, v: number): Wall[] {
  const walls: Wall[] = [];
  const rooms = 3 + (v % 3);
  bow(walls, box, 0.04, 0.72, 0.96, 0.72, 0, 1, 0.05, 0.3, v % 4 === 0 ? 2 : 1);
  bow(walls, box, 0.04, 0.28, 0.96, 0.28, 0, -1, 0.045, 1.1, 1);
  for (let i = 1; i < rooms; i += 1) {
    const x = i / rooms;
    wall(walls, box, x, 0.28, x, 0.72, 0.36 + (i % 2) * 0.15);
  }
  wall(walls, box, 0.04, 0.28, 0.04, 0.72, 0.5);
  if (v % 2 === 0) wall(walls, box, 0.96, 0.28, 0.96, 0.72);
  return walls;
}

const DRAW = [bays, slots, corridor, court, collective, jog, spine, steps, nested, cross, lot, chain] as const;

function plateWalls(plan: UndulatedPlan): Wall[] {
  const box = plateBox(plan.index);
  return DRAW[UNDULATED_KINDS.indexOf(plan.kind)](box, plan.struct);
}

export function planUndulated(seed: number, attempt = 0, index = 0): UndulatedPlan {
  const rng = mulberry32((seed ^ 0x5a17d ^ (attempt * 0x9e3779b9) ^ (index * 0x85ebca6b)) >>> 0);
  const id = ((index * 37 + 13) % 100 + 100) % 100;
  const growth = UNDULATED_GROWTH[index % UNDULATED_GROWTH.length];
  const box = plateBox(index);
  return {
    growth,
    index,
    kind: UNDULATED_KINDS[id % UNDULATED_KINDS.length],
    struct: Math.floor(id / 12),
    weight: UNDULATED_WEIGHTS[index % UNDULATED_WEIGHTS.length],
    ink: UNDULATED_INKS[Math.floor(index / 4) % UNDULATED_INKS.length],
    angle: 0,
    anchorX: (box.x0 + box.x1) / 2,
    anchorY: (box.y0 + box.y1) / 2,
    spine: growth === "wander" ? 0.22 + rng() * 0.08 : 0.16 + rng() * 0.06,
  };
}

export function attractorsFromUndulated(plan: UndulatedPlan): FieldAttractor[] {
  return plateWalls(plan).map((wall) => ({
    kind: "line" as const,
    x: wall.x,
    y: wall.y,
    x2: wall.x2,
    y2: wall.y2,
    radius: 0.4,
    strength: 1,
  }));
}

/** Same pen as a flat deep plan. The walls above are unchanged. Diffusion stays off. */
export function tuneUndulatedSlime(slime: SlimeControls, plan: UndulatedPlan): SlimeControls {
  const rng = mulberry32((plan.index * 0x9e3779b9) >>> 0);
  const span = (min: number, max: number) => min + rng() * (max - min);
  return {
    ...slime,
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

export function undulatedAgentCount(plan: UndulatedPlan, _seed: number) {
  return Math.max(72, Math.min(110, 84 + plateWalls(plan).length));
}
