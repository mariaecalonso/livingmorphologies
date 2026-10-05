/**
 * Linear Edge Gallery · Porous Spine · Integrated Nodes · Social Commons.
 * One continuous spine sits on an edge. Nodes are beaded into that spine.
 * Pores open the spine toward a commons on the inner side. Connectivity stays low.
 * Each cell is a different spatial reading of that same edge. Trails stay hair-thin.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const EDGE = 1.15;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));
const HAIR = 0.34;
const SPINE = -7.15;

export const EDGE_FAMILIES = [
  "beaded",
  "bow",
  "stepped",
  "comb",
  "notched",
  "folded",
  "taper",
  "bays",
  "gapped",
  "wave",
  "rail",
  "offset",
  "hook",
  "stitch",
  "paired",
  "pocket",
] as const;

export const EDGE_GROWTHS = ["filament", "sparse", "sharp", "committed"] as const;

export type EdgeKind = (typeof EDGE_FAMILIES)[number];
export type EdgeGrowth = (typeof EDGE_GROWTHS)[number];

export const LEG_RUN_ITERATIONS = 200;
export const LEG_TRAIL_SCALE = 12;
export const LEG_STEP_BUDGET_MS = 17000;
export const LEG_ID = "linear-edge-gallery";

export type EdgePlan = {
  kind: EdgeKind;
  growth: EdgeGrowth;
  index: number;
  cycle: number;
  turn: number;
  flip: boolean;
};

type Local = {
  kind: FieldAttractor["kind"];
  u: number;
  v: number;
  u2?: number;
  v2?: number;
  cu?: number;
  cv?: number;
  radius: number;
  strength: number;
  hole?: boolean;
};

function ln(u: number, v: number, u2: number, v2: number, strength = 1.15): Local {
  return { kind: "line", u, v, u2, v2, radius: HAIR, strength };
}

function cv(u: number, v: number, u2: number, v2: number, cu: number, cv: number, strength = 1.1): Local {
  return { kind: "curve", u, v, u2, v2, cu, cv, radius: HAIR, strength };
}

function node(u: number, v: number, radius: number, strength = 0.82): Local {
  return { kind: "point", u, v, radius, strength };
}

function pore(u: number, v: number, radius: number): Local {
  return { kind: "ring", u, v, radius, strength: 0.62, hole: true };
}

function along(count: number, span: number, phase: number) {
  const n = Math.max(2, count);
  const start = -span;
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return start + ((u + phase) % 1) * span * 2;
  }).sort((a, b) => a - b);
}

const BUILD: Record<EdgeKind, (cycle: number) => Local[]> = {
  beaded: (cycle) => {
    const count = 5 + (cycle % 4);
    const span = 7.2 + (cycle % 3) * 0.45;
    const xs = along(count, span, cycle * 0.07);
    const marks: Local[] = [ln(xs[0], SPINE, xs[xs.length - 1], SPINE)];
    xs.forEach((x, i) => {
      marks.push(node(x, SPINE, 0.48 + (i % 2) * 0.16 + (cycle % 2) * 0.08));
      if (i < xs.length - 1) marks.push(pore((x + xs[i + 1]) / 2, SPINE + 0.15, 0.38 + (cycle % 3) * 0.06));
    });
    return marks;
  },
  bow: (cycle) => {
    const span = 7.4;
    const lift = 1.5 + (cycle % 4) * 0.45;
    const marks: Local[] = [cv(-span, SPINE, span, SPINE, 0, SPINE + lift, 1.2)];
    const count = 4 + (cycle % 3);
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const u = -span + t * span * 2;
      const v = SPINE + Math.sin(t * Math.PI) * lift * 0.55;
      marks.push(node(u, v, 0.55 + (cycle % 2) * 0.12));
      if (i % 2 === 0) marks.push(pore(u, v + 0.7 + (cycle % 3) * 0.15, 0.36));
    }
    return marks;
  },
  stepped: (cycle) => {
    const steps = 4 + (cycle % 3);
    const rise = 0.7 + (cycle % 3) * 0.22;
    const run = 2.4 + (cycle % 2) * 0.35;
    const marks: Local[] = [];
    let u = -7.2;
    let v = SPINE;
    for (let i = 0; i < steps; i += 1) {
      const next = u + run;
      marks.push(ln(u, v, next, v, 1.05));
      marks.push(node(u + run * 0.5, v, 0.5 + (i === steps - 1 ? 0.2 : 0)));
      if (i < steps - 1) {
        marks.push(ln(next, v, next, v + rise, 0.7));
        marks.push(pore(next, v + rise * 0.45, 0.32));
      }
      u = next;
      v += rise;
    }
    return marks;
  },
  comb: (cycle) => {
    const teeth = 4 + (cycle % 3);
    const span = 7.3;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < teeth; i += 1) {
      const u = -span + ((i + 0.5) / teeth) * span * 2;
      const depth = 1.6 + (i % 2) * (0.7 + (cycle % 3) * 0.25);
      marks.push(ln(u, SPINE, u, SPINE + depth, 0.55));
      marks.push(node(u, SPINE, 0.46));
      marks.push(node(u, SPINE + depth, 0.62 + (cycle % 2) * 0.1));
    }
    return marks;
  },
  notched: (cycle) => {
    const span = 7.6;
    const pores = 3 + (cycle % 3);
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.2)];
    for (let i = 0; i < pores; i += 1) {
      const u = -span * 0.72 + (i / Math.max(1, pores - 1)) * span * 1.44;
      marks.push(pore(u, SPINE, 0.55 + (cycle % 2) * 0.16));
      marks.push(node(u + (i % 2 ? 1.15 : -1.15), SPINE, 0.58));
    }
    return marks;
  },
  folded: (cycle) => {
    const arm = 6.2 + (cycle % 3) * 0.5;
    const turn = 3.2 + (cycle % 4) * 0.45;
    const end = cycle % 2 === 0 ? arm : -arm;
    const marks: Local[] = [
      ln(-arm, SPINE, arm, SPINE),
      ln(end, SPINE, end, SPINE + turn, 0.9),
    ];
    const count = 4 + (cycle % 2);
    for (let i = 0; i < count; i += 1) {
      const u = -arm + (i / (count - 1)) * arm * 2;
      marks.push(node(u, SPINE, 0.5));
    }
    marks.push(node(end, SPINE + turn * 0.65, 0.7));
    marks.push(pore(end * 0.35, SPINE + 0.2, 0.4));
    marks.push(pore(end, SPINE + turn * 0.35, 0.34));
    return marks;
  },
  taper: (cycle) => {
    const count = 6 + (cycle % 2);
    const span = 7.5;
    const dir = cycle % 2 === 0 ? 1 : -1;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const u = -span + t * span * 2;
      const grow = dir > 0 ? t : 1 - t;
      marks.push(node(u, SPINE, 0.36 + grow * 0.7));
      if (grow < 0.55 && i % 2 === 0) marks.push(pore(u, SPINE + 0.55, 0.32 + grow));
    }
    marks.push(node(dir * span * 0.92, SPINE + 1.15, 0.95));
    return marks;
  },
  bays: (cycle) => {
    const bays = 3 + (cycle % 2);
    const span = 7.4;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < bays; i += 1) {
      const u = -span * 0.7 + (i / Math.max(1, bays - 1)) * span * 1.4;
      const depth = 1.8 + (cycle % 3) * 0.4 + (i % 2) * 0.35;
      const half = 0.85 + (cycle % 2) * 0.25;
      marks.push(cv(u - half, SPINE, u + half, SPINE, u, SPINE + depth, 0.85));
      marks.push(node(u, SPINE + depth * 0.72, 0.58));
      marks.push(pore(u, SPINE + 0.25, 0.3));
    }
    return marks;
  },
  gapped: (cycle) => {
    const parts = 3 + (cycle % 2);
    const span = 7.6;
    const gap = 0.85 + (cycle % 3) * 0.28;
    const marks: Local[] = [];
    const width = (span * 2 - gap * (parts - 1)) / parts;
    let u = -span;
    for (let i = 0; i < parts; i += 1) {
      const next = u + width;
      marks.push(ln(u, SPINE, next, SPINE));
      marks.push(node(u + width * 0.35, SPINE, 0.48));
      marks.push(node(u + width * 0.7, SPINE, 0.62));
      if (i < parts - 1) {
        marks.push(pore(next + gap * 0.5, SPINE, 0.42 + (cycle % 2) * 0.1));
        marks.push(ln(next, SPINE, next + gap, SPINE + 0.15, 0.28));
      }
      u = next + gap;
    }
    return marks;
  },
  wave: (cycle) => {
    const waves = 2 + (cycle % 2);
    const span = 7.5;
    const amp = 0.85 + (cycle % 3) * 0.35;
    const marks: Local[] = [];
    const steps = 6 + cycle % 2;
    let prevU = -span;
    let prevV = SPINE;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = -span + t * span * 2;
      const v = SPINE + Math.sin(t * Math.PI * waves) * amp;
      marks.push(ln(prevU, prevV, u, v, 1.05));
      if (i % 2 === 0) marks.push(node(u, v, 0.52 + (cycle % 2) * 0.12));
      else marks.push(pore(u, v + 0.45, 0.32));
      prevU = u;
      prevV = v;
    }
    return marks;
  },
  rail: (cycle) => {
    const span = 7.2;
    const gap = 1.15 + (cycle % 3) * 0.28;
    const ties = 3 + (cycle % 2);
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.15), ln(-span * 0.92, SPINE + gap, span * 0.92, SPINE + gap, 0.72)];
    for (let i = 0; i < ties; i += 1) {
      const u = -span * 0.6 + (i / Math.max(1, ties - 1)) * span * 1.2;
      marks.push(ln(u, SPINE, u, SPINE + gap, 0.4));
      marks.push(node(u, SPINE + gap * 0.5, 0.5));
    }
    marks.push(pore(0, SPINE + gap * 0.5, 0.36 + (cycle % 2) * 0.08));
    return marks;
  },
  offset: (cycle) => {
    const count = 5 + (cycle % 3);
    const span = 7.1;
    const reach = 0.9 + (cycle % 3) * 0.28;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < count; i += 1) {
      const u = -span + ((i + 0.5) / count) * span * 2;
      const v = SPINE + reach * (i % 2 === 0 ? 1 : 0.35);
      marks.push(ln(u, SPINE, u, v, 0.4));
      marks.push(node(u, v, 0.5 + (i % 2) * 0.18));
      if (i % 2 === 1) marks.push(pore(u, SPINE + 0.2, 0.3));
    }
    return marks;
  },
  hook: (cycle) => {
    const span = 7.3;
    const hook = 2.6 + (cycle % 4) * 0.4;
    const end = cycle % 2 === 0 ? span : -span;
    const marks: Local[] = [
      ln(-span, SPINE, span, SPINE),
      cv(end, SPINE, end * 0.72, SPINE + hook, end, SPINE + hook * 0.45, 0.9),
    ];
    const count = 5 + (cycle % 2);
    for (let i = 0; i < count; i += 1) {
      const u = -span + (i / (count - 1)) * span * 2;
      marks.push(node(u, SPINE, 0.48));
      if (i % 2 === 0) marks.push(pore(u, SPINE + 0.5, 0.3));
    }
    marks.push(node(end * 0.78, SPINE + hook * 0.7, 0.72));
    return marks;
  },
  stitch: (cycle) => {
    const stitches = 4 + (cycle % 3);
    const span = 7.4;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.2)];
    for (let i = 0; i < stitches; i += 1) {
      const u = -span * 0.8 + (i / Math.max(1, stitches - 1)) * span * 1.6;
      const len = 1.1 + (i % 2) * (0.6 + (cycle % 2) * 0.3);
      marks.push(ln(u, SPINE - 0.25, u, SPINE + len, 0.42));
      marks.push(node(u, SPINE, 0.44));
      marks.push(pore(u + 0.7, SPINE + 0.15, 0.28));
    }
    return marks;
  },
  paired: (cycle) => {
    const pairs = 3 + (cycle % 2);
    const span = 7;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < pairs; i += 1) {
      const u = -span * 0.75 + (i / Math.max(1, pairs - 1)) * span * 1.5;
      const spread = 0.55 + (cycle % 3) * 0.12;
      marks.push(node(u - spread, SPINE, 0.52));
      marks.push(node(u + spread, SPINE, 0.52 + (cycle % 2) * 0.12));
      if (i < pairs - 1) {
        const mid = u + (span * 1.5) / Math.max(1, pairs - 1) / 2;
        marks.push(pore(mid, SPINE + 0.2, 0.4 + (cycle % 2) * 0.08));
      }
    }
    return marks;
  },
  pocket: (cycle) => {
    const pockets = 3;
    const span = 6.8;
    const depth = 2.1 + (cycle % 4) * 0.35;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.05)];
    for (let i = 0; i < pockets; i += 1) {
      const u = -span * 0.65 + (i / (pockets - 1)) * span * 1.3;
      marks.push(cv(u - 1.05, SPINE, u + 1.05, SPINE, u, SPINE + depth, 0.8));
      marks.push(node(u, SPINE + depth * 0.62, 0.78 + (cycle % 2) * 0.12));
      marks.push(pore(u, SPINE + 0.35, 0.34));
    }
    return marks;
  },
};

const TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export function planLinearEdgeGallery(seed: number, attempt = 0, index = 0): EdgePlan {
  const cycle = Math.floor(index / EDGE_FAMILIES.length);
  const kind = EDGE_FAMILIES[(index + attempt * 5) % EDGE_FAMILIES.length];
  const growth = EDGE_GROWTHS[(cycle + attempt) % EDGE_GROWTHS.length];
  return {
    kind,
    growth,
    index,
    cycle,
    turn: TURNS[(cycle + index) % TURNS.length],
    flip: cycle % 3 !== 1,
  };
}

export function attractorsFromLinearEdgeGallery(plan: EdgePlan): FieldAttractor[] {
  const locals = BUILD[plan.kind](plan.cycle % 6);
  const cos = Math.cos(plan.turn);
  const sin = Math.sin(plan.turn);
  const slide = ((plan.cycle % 5) - 2) * 1.35;
  const scaleU = 0.82 + (plan.cycle % 4) * 0.08;
  const scaleV = 0.78 + (plan.cycle % 5) * 0.1;
  const to = (u: number, v: number) => {
    const su = (plan.flip ? -u : u) * scaleU + slide;
    const sv = v * scaleV;
    return { x: lim(CENTER + su * cos - sv * sin), y: lim(CENTER + su * sin + sv * cos) };
  };
  return locals.map((mark) => {
    const a = to(mark.u, mark.v);
    const out: FieldAttractor = { kind: mark.kind, x: a.x, y: a.y, radius: mark.radius, strength: mark.strength };
    if (mark.hole) out.hole = true;
    if (mark.kind === "line" || mark.kind === "curve") {
      const b = to(mark.u2 ?? mark.u, mark.v2 ?? mark.v);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    if (mark.kind === "curve") {
      const c = to(mark.cu ?? mark.u, mark.cv ?? mark.v);
      out.cx = c.x;
      out.cy = c.y;
    }
    return out;
  });
}

const GROWTH_SLIME: Record<EdgeGrowth, Partial<SlimeControls>> = {
  filament: { persistence: 0.72, trailInfluence: 1.35, deposit: 0.02, depositWidth: 0.22, randomness: 0.06, trailCap: 0.55, sensorAngle: 0.16, stepSize: 0.14 },
  sparse: { persistence: 0.48, trailInfluence: 0.9, deposit: 0.012, depositWidth: 0.18, randomness: 0.16, trailCap: 0.38, sensorAngle: 0.28, stepSize: 0.16 },
  sharp: { persistence: 0.8, trailInfluence: 1.6, deposit: 0.028, depositWidth: 0.2, randomness: 0.04, trailCap: 0.7, sensorAngle: 0.1, stepSize: 0.12 },
  committed: { persistence: 0.84, trailInfluence: 1.7, deposit: 0.024, depositWidth: 0.24, randomness: 0.05, trailCap: 0.62, sensorAngle: 0.12, stepSize: 0.13 },
};

export function agentsFromLinearEdgeGallery(plan: EdgePlan) {
  const byGrowth: Record<EdgeGrowth, number> = { filament: 96, sparse: 72, sharp: 110, committed: 128 };
  return Math.max(MIN_AGENT_COUNT, byGrowth[plan.growth] + (plan.cycle % 5) * 6);
}

export function slimeFromLinearEdgeGallery(base: SlimeControls, plan: EdgePlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0xe46e11 ^ plan.index);
  const jitter = (value: number, amount: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value + (rng() - 0.5) * amount));
  const growth = GROWTH_SLIME[plan.growth];
  const marks = attractorsFromLinearEdgeGallery(plan);
  const foodPoints = marks
    .filter((mark) => mark.kind === "point")
    .slice(0, 5)
    .map((mark) => ({ x: mark.x, y: mark.y }));
  return {
    ...base,
    ...growth,
    persistence: jitter(growth.persistence ?? 0.7, 0.08, 0.4, 0.9),
    deposit: jitter(growth.deposit ?? 0.02, 0.008, 0.008, 0.04),
    depositWidth: jitter(growth.depositWidth ?? 0.22, 0.06, 0.16, 0.34),
    randomness: jitter(growth.randomness ?? 0.08, 0.04, 0.02, 0.22),
    sensorAngle: jitter(growth.sensorAngle ?? 0.16, 0.06, 0.06, 0.4),
    stepSize: jitter(growth.stepSize ?? 0.14, 0.03, 0.1, 0.2),
    trailInfluence: jitter(growth.trailInfluence ?? 1.2, 0.2, 0.6, 1.9),
    trailCap: jitter(growth.trailCap ?? 0.5, 0.1, 0.28, 0.85),
    diffusion: 0,
    decay: 0.974 + rng() * 0.014,
    resistance: 0.04 + rng() * 0.12,
    turnAngle: 0.06 + rng() * 0.12,
    sensorDistance: 0.4 + rng() * 0.45,
    crowdingLimit: 10 + Math.floor(rng() * 8),
    foodPoints: foodPoints.length ? foodPoints : base.foodPoints,
    voidElongation: 1,
    voidLobes: 0,
    voidNotch: 0,
    voidRotation: 0,
  };
}
