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
    const count = 4 + (cycle % 5);
    const span = 5.4 + (cycle % 4) * 0.85;
    const xs = along(count, span, cycle * 0.11);
    const marks: Local[] = [ln(xs[0], SPINE, xs[xs.length - 1], SPINE)];
    xs.forEach((x, i) => {
      const swell = i % 3 === cycle % 3;
      marks.push(node(x, SPINE + (swell ? 1.4 + (cycle % 3) * 0.45 : 0), swell ? 0.95 : 0.38 + (i % 2) * 0.12));
      if (i < xs.length - 1 && i % 2 === cycle % 2) marks.push(pore((x + xs[i + 1]) / 2, SPINE + 0.85, 0.42 + (cycle % 3) * 0.1));
    });
    return marks;
  },
  bow: (cycle) => {
    const span = 6.2 + (cycle % 3) * 0.7;
    const lift = 3.4 + (cycle % 4) * 0.75;
    const marks: Local[] = [cv(-span, SPINE, span, SPINE, (cycle % 2 === 0 ? -1.2 : 1.4), SPINE + lift, 1.2)];
    const count = 3 + (cycle % 3);
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const u = -span + t * span * 2;
      const v = SPINE + Math.sin(t * Math.PI) * lift * 0.72;
      marks.push(node(u, v, 0.5 + (i === Math.floor(count / 2) ? 0.35 : 0)));
      if (i % 2 === cycle % 2) marks.push(pore(u, v + 0.9, 0.4));
    }
    return marks;
  },
  stepped: (cycle) => {
    const steps = 3 + (cycle % 2);
    const rise = 1.7 + (cycle % 3) * 0.55;
    const run = 3.1 + (cycle % 2) * 0.8;
    const marks: Local[] = [];
    let u = -6.4;
    let v = SPINE;
    for (let i = 0; i < steps; i += 1) {
      const next = u + run;
      marks.push(ln(u, v, next, v, 1.05));
      marks.push(node(u + run * (0.35 + (i % 2) * 0.3), v, 0.46 + (i === steps - 1 ? 0.28 : 0)));
      if (i < steps - 1) {
        marks.push(ln(next, v, next, v + rise, 0.75));
        marks.push(pore(next + 0.35, v + rise * 0.5, 0.36));
      }
      u = next;
      v += rise;
    }
    return marks;
  },
  comb: (cycle) => {
    const teeth = 3 + (cycle % 4);
    const span = 6.6;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < teeth; i += 1) {
      const u = -span + ((i + 0.5) / teeth) * span * 2;
      const depth = 2.6 + (i % 3) * (1.15 + (cycle % 3) * 0.35);
      marks.push(ln(u, SPINE, u + (i % 2 === 0 ? 0.35 : -0.2), SPINE + depth, 0.62));
      marks.push(node(u, SPINE, 0.42));
      marks.push(node(u, SPINE + depth, 0.58 + (i === cycle % teeth ? 0.28 : 0)));
    }
    return marks;
  },
  notched: (cycle) => {
    const span = 6.8 + (cycle % 2) * 0.6;
    const pores = 2 + (cycle % 3);
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.2)];
    for (let i = 0; i < pores; i += 1) {
      const u = -span * 0.62 + (i / Math.max(1, pores - 1)) * span * 1.24;
      const mouth = 1.8 + (cycle % 3) * 0.7 + (i % 2) * 0.8;
      marks.push(cv(u - 1.1, SPINE, u + 1.1, SPINE, u, SPINE + mouth, 0.7));
      marks.push(pore(u, SPINE + mouth * 0.45, 0.48 + (cycle % 2) * 0.16));
      marks.push(node(u, SPINE + mouth, 0.62));
    }
    return marks;
  },
  folded: (cycle) => {
    const arm = 5.4 + (cycle % 3) * 0.8;
    const turn = 4.4 + (cycle % 4) * 0.7;
    const end = cycle % 2 === 0 ? arm : -arm;
    const marks: Local[] = [
      ln(-arm, SPINE, arm * 0.15, SPINE),
      ln(end, SPINE, end, SPINE + turn, 0.95),
      ln(end, SPINE + turn, end - Math.sign(end) * (2.2 + (cycle % 2)), SPINE + turn, 0.7),
    ];
    const count = 3 + (cycle % 2);
    for (let i = 0; i < count; i += 1) {
      const u = -arm + (i / (count - 1)) * arm * 0.7;
      marks.push(node(u, SPINE, i === count - 1 ? 0.72 : 0.42));
    }
    marks.push(node(end, SPINE + turn * 0.55, 0.7));
    marks.push(pore(end * 0.55, SPINE + 0.4, 0.4));
    return marks;
  },
  taper: (cycle) => {
    const count = 5 + (cycle % 3);
    const span = 6.8;
    const dir = cycle % 2 === 0 ? 1 : -1;
    const marks: Local[] = [ln(-span, SPINE, span * 0.15 * dir, SPINE), ln(span * 0.15 * dir, SPINE, dir * span, SPINE + 1.6 + (cycle % 3) * 0.4, 0.85)];
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const u = -span + t * span * 2;
      const grow = dir > 0 ? t : 1 - t;
      marks.push(node(u, SPINE + grow * (1.2 + (cycle % 2)), 0.32 + grow * 0.7));
    }
    marks.push(node(dir * span * 0.82, SPINE + 2.8 + (cycle % 3) * 0.6, 0.9));
    marks.push(pore(dir * span * 0.4, SPINE + 0.8, 0.36));
    return marks;
  },
  bays: (cycle) => {
    const bays = 2 + (cycle % 3);
    const span = 6.6;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < bays; i += 1) {
      const u = -span * 0.72 + (i / Math.max(1, bays - 1)) * span * 1.44;
      const depth = 2.8 + (cycle % 3) * 0.85 + (i % 2) * 1.2;
      const half = 1.15 + (i === cycle % bays ? 0.7 : 0.15);
      marks.push(cv(u - half, SPINE, u + half, SPINE, u + (i % 2 ? 0.4 : -0.3), SPINE + depth, 0.9));
      marks.push(node(u, SPINE + depth * 0.7, 0.64));
      marks.push(pore(u, SPINE + 0.45, 0.34));
    }
    return marks;
  },
  gapped: (cycle) => {
    const parts = 2 + (cycle % 3);
    const span = 7.2;
    const gap = 1.6 + (cycle % 3) * 0.7;
    const marks: Local[] = [];
    const width = (span * 2 - gap * (parts - 1)) / parts;
    let u = -span;
    for (let i = 0; i < parts; i += 1) {
      const next = u + width;
      const v = SPINE + (i === 1 && parts > 2 ? 1.8 + (cycle % 2) * 0.8 : 0);
      marks.push(ln(u, v, next, v));
      marks.push(node(u + width * (0.3 + (i % 2) * 0.35), v, 0.42 + (i % 2) * 0.28));
      if (i < parts - 1) {
        marks.push(pore(next + gap * 0.5, SPINE + 0.2, 0.5 + (cycle % 2) * 0.16));
        marks.push(ln(next, v, next + gap, SPINE + (i % 2) * 1.4, 0.32));
      }
      u = next + gap;
    }
    return marks;
  },
  wave: (cycle) => {
    const waves = 1 + (cycle % 3);
    const span = 6.8;
    const amp = 2.4 + (cycle % 3) * 0.8;
    const marks: Local[] = [];
    const steps = 5 + (cycle % 2);
    let prevU = -span;
    let prevV = SPINE;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = -span + t * span * 2;
      const v = SPINE + Math.sin(t * Math.PI * waves + cycle * 0.4) * amp;
      marks.push(cv(prevU, prevV, u, v, (prevU + u) / 2, (prevV + v) / 2 + (i % 2 === 0 ? 0.6 : -0.2), 1.05));
      if (i % 2 === 0) marks.push(node(u, Math.max(SPINE, v), 0.56));
      else marks.push(pore(u, v + 0.7, 0.34));
      prevU = u;
      prevV = v;
    }
    return marks;
  },
  rail: (cycle) => {
    const span = 6.4 + (cycle % 2) * 0.8;
    const gap = 2.4 + (cycle % 3) * 0.85;
    const ties = 2 + (cycle % 3);
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.15), ln(-span * 0.78, SPINE + gap, span * 0.78, SPINE + gap, 0.78)];
    for (let i = 0; i < ties; i += 1) {
      const u = -span * 0.55 + (i / Math.max(1, ties - 1)) * span * 1.1;
      marks.push(ln(u, SPINE, u, SPINE + gap, 0.48));
      marks.push(node(u, SPINE + gap * (0.35 + (i % 2) * 0.4), 0.5));
    }
    marks.push(pore(span * 0.15 * (cycle % 2 === 0 ? 1 : -1), SPINE + gap * 0.5, 0.46));
    return marks;
  },
  offset: (cycle) => {
    const count = 4 + (cycle % 3);
    const span = 6.5;
    const reach = 2.2 + (cycle % 3) * 0.8;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < count; i += 1) {
      const u = -span + ((i + 0.5) / count) * span * 2;
      const v = SPINE + reach * (i % 2 === 0 ? 1 : 0.4);
      marks.push(ln(u, SPINE, u + (i % 2 ? 0.4 : -0.25), v, 0.48));
      marks.push(node(u, v, 0.48 + (i % 2) * 0.26));
      if (i % 2 === cycle % 2) marks.push(pore(u, SPINE + 0.35, 0.32));
    }
    return marks;
  },
  hook: (cycle) => {
    const span = 6.2 + (cycle % 3) * 0.5;
    const hook = 4.2 + (cycle % 4) * 0.65;
    const end = cycle % 2 === 0 ? span : -span;
    const marks: Local[] = [
      ln(-span * Math.sign(end), SPINE, end * 0.2, SPINE),
      cv(end * 0.2, SPINE, end * 0.55, SPINE + hook, end, SPINE + hook * 0.42, 0.95),
    ];
    const count = 4 + (cycle % 2);
    for (let i = 0; i < count; i += 1) {
      const u = -span * Math.sign(end) + (i / (count - 1)) * Math.abs(end * 0.2 + span);
      marks.push(node(u, SPINE, i === 0 ? 0.7 : 0.4));
    }
    marks.push(node(end * 0.62, SPINE + hook * 0.72, 0.78));
    marks.push(pore(end * 0.35, SPINE + hook * 0.28, 0.4));
    return marks;
  },
  stitch: (cycle) => {
    const stitches = 3 + (cycle % 3);
    const span = 6.6;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.2)];
    for (let i = 0; i < stitches; i += 1) {
      const u = -span * 0.8 + (i / Math.max(1, stitches - 1)) * span * 1.6;
      const len = 2.2 + (i % 2) * (1.3 + (cycle % 2) * 0.6);
      const lean = i % 2 === 0 ? 0.55 : -0.4;
      marks.push(ln(u, SPINE, u + lean, SPINE + len, 0.5));
      marks.push(node(u + lean, SPINE + len, 0.48 + (i === cycle % stitches ? 0.24 : 0)));
      if (i % 2 === 0) marks.push(pore(u + 0.8, SPINE + 0.4, 0.32));
    }
    return marks;
  },
  paired: (cycle) => {
    const pairs = 2 + (cycle % 3);
    const span = 6.2;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE)];
    for (let i = 0; i < pairs; i += 1) {
      const u = -span * 0.7 + (i / Math.max(1, pairs - 1)) * span * 1.4;
      const spread = 0.7 + (cycle % 3) * 0.28;
      const lift = 1.5 + (cycle % 3) * 0.7;
      marks.push(node(u - spread, SPINE, 0.5));
      marks.push(node(u + spread, SPINE + (i % 2 === 0 ? lift : lift * 0.35), 0.58));
      marks.push(ln(u - spread, SPINE, u + spread, SPINE + (i % 2 === 0 ? lift : lift * 0.35), 0.4));
      if (i < pairs - 1) marks.push(pore(u + span * 0.35, SPINE + 0.3, 0.42));
    }
    return marks;
  },
  pocket: (cycle) => {
    const pockets = 2 + (cycle % 2);
    const span = 6.4;
    const marks: Local[] = [ln(-span, SPINE, span, SPINE, 1.05)];
    for (let i = 0; i < pockets; i += 1) {
      const u = -span * 0.55 + (i / Math.max(1, pockets - 1)) * span * 1.1;
      const depth = 3.2 + (cycle % 4) * 0.7 + (i % 2) * 1.1;
      const half = 1.2 + (i === 0 ? 0.45 : 0);
      marks.push(cv(u - half, SPINE, u + half, SPINE, u + (cycle % 2 ? 0.5 : -0.4), SPINE + depth, 0.85));
      marks.push(node(u, SPINE + depth * 0.68, 0.74));
      marks.push(pore(u, SPINE + 0.5, 0.38));
    }
    return marks;
  },
};

const TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Most cells keep a close halo. Some project the white particles much farther, and those reaches differ. */
export function edgeReachFor(index: number) {
  const slot = index % 8;
  if (slot === 1 || slot === 6) return 5.6;
  if (slot === 4) return 3.9;
  return 2.15;
}

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
  const locals = BUILD[plan.kind](plan.cycle);
  const cos = Math.cos(plan.turn);
  const sin = Math.sin(plan.turn);
  const spanBoost = [0.78, 1.05, 0.66, 0.92, 1.12, 0.74, 0.88][plan.cycle % 7];
  const corner = ((plan.index + plan.cycle) % 3) - 1;
  const slide = corner * (spanBoost < 0.85 ? 3.6 : 1.15);
  const scaleV = 0.9 + (plan.cycle % 3) * 0.04;
  const to = (u: number, v: number) => {
    const su = (plan.flip ? -u : u) * spanBoost + slide;
    const sv = (SPINE + (v - SPINE) * (0.92 + (plan.cycle % 3) * 0.16)) * scaleV;
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
  filament: { persistence: 0.74, trailInfluence: 1.35, deposit: 0.024, depositWidth: 0.22, randomness: 0.07, trailCap: 0.52, sensorAngle: 0.16, stepSize: 0.14 },
  sparse: { persistence: 0.52, trailInfluence: 0.95, deposit: 0.016, depositWidth: 0.18, randomness: 0.14, trailCap: 0.4, sensorAngle: 0.26, stepSize: 0.16 },
  sharp: { persistence: 0.8, trailInfluence: 1.55, deposit: 0.028, depositWidth: 0.2, randomness: 0.04, trailCap: 0.62, sensorAngle: 0.1, stepSize: 0.12 },
  committed: { persistence: 0.84, trailInfluence: 1.65, deposit: 0.022, depositWidth: 0.24, randomness: 0.05, trailCap: 0.56, sensorAngle: 0.12, stepSize: 0.13 },
};

export function agentsFromLinearEdgeGallery(plan: EdgePlan) {
  const byGrowth: Record<EdgeGrowth, number> = { filament: 300, sparse: 260, sharp: 340, committed: 360 };
  const reach = edgeReachFor(plan.index);
  const extra = reach > 5 ? 90 : reach > 3 ? 40 : 0;
  return Math.max(MIN_AGENT_COUNT, byGrowth[plan.growth] + (plan.cycle % 5) * 8 + extra);
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
    deposit: jitter(growth.deposit ?? 0.022, 0.008, 0.012, 0.036),
    depositWidth: jitter(growth.depositWidth ?? 0.22, 0.04, 0.16, 0.28),
    randomness: jitter(growth.randomness ?? 0.08, 0.04, 0.02, 0.22),
    sensorAngle: jitter(growth.sensorAngle ?? 0.16, 0.06, 0.06, 0.4),
    stepSize: jitter(growth.stepSize ?? 0.14, 0.03, 0.1, 0.2),
    trailInfluence: jitter(growth.trailInfluence ?? 1.2, 0.2, 0.6, 1.9),
    trailCap: jitter(growth.trailCap ?? 1.05, 0.08, 0.95, 1.15),
    diffusion: 0,
    decay: 0.996,
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
