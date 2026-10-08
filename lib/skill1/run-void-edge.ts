/**
 * Void Edge runs.
 * Radial Balance · Integrated Module · Partially Engaging.
 * One absence sits on a boundary. Modules face it from the field and never wrap the outer side.
 * Each grid slot gets its own family, edge, size, and module rhythm. Growth stays hair-thin.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor, FieldSnapshot } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;

type Rng = () => number;
type Frame = {
  r: (min: number, max: number) => number;
  chance: (p: number) => boolean;
};

function frame(rng: Rng): Frame {
  return {
    r: (min, max) => min + rng() * (max - min),
    chance: (p) => rng() < p,
  };
}

export type EdgeSide = "north" | "east" | "south" | "west";

export type VoidEdgeKind =
  | "circle"
  | "slot"
  | "corner"
  | "crescent"
  | "pocket"
  | "court"
  | "slit"
  | "lens"
  | "gap"
  | "fan"
  | "flank"
  | "spine"
  | "ribs"
  | "knot"
  | "drift"
  | "aperture";

export type VoidEdgeGrowth = "filament" | "sharp" | "sparse" | "thread";

export const EDGE_FAMILIES: VoidEdgeKind[] = [
  "circle",
  "slot",
  "corner",
  "crescent",
  "pocket",
  "court",
  "slit",
  "lens",
  "gap",
  "fan",
  "flank",
  "spine",
  "ribs",
  "knot",
  "drift",
  "aperture",
];

export const EDGE_SIDES: EdgeSide[] = ["north", "east", "south", "west"];
export const EDGE_GROWTHS: VoidEdgeGrowth[] = ["filament", "sharp", "sparse", "thread"];

export type VoidEdgePlan = {
  kind: VoidEdgeKind;
  side: EdgeSide;
  growth: VoidEdgeGrowth;
  index: number;
  radius: number;
  modules: number;
  slide: number;
  depth: number;
  corner: 1 | -1;
};

type Mark = FieldAttractor;

function pt(x: number, y: number, radius: number, strength: number): Mark {
  return { kind: "point", x, y, radius, strength };
}

function ring(x: number, y: number, radius: number, strength: number): Mark {
  return { kind: "ring", x, y, radius, strength, hole: true };
}

function ln(x: number, y: number, x2: number, y2: number, radius: number, strength: number, hole = false): Mark {
  return { kind: "line", x, y, x2, y2, radius, strength, hole: hole || undefined };
}

function cv(
  x: number,
  y: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  hole = false,
): Mark {
  return { kind: "curve", x, y, x2, y2, cx, cy, radius, strength, hole: hole || undefined };
}

const clip = (value: number) => Math.min(FIELD_SIZE - 0.25, Math.max(0.25, value));

/** Local frame: u runs along the boundary, v points into the field. v = 0 sits on the boundary so a void can be cut by it. */
function world(side: EdgeSide, u: number, v: number) {
  if (side === "north") return { x: CENTER + u, y: FIELD_SIZE - 0.2 - v };
  if (side === "south") return { x: CENTER + u, y: 0.2 + v };
  if (side === "east") return { x: FIELD_SIZE - 0.2 - v, y: CENTER + u };
  return { x: 0.2 + v, y: CENTER + u };
}

function placeMark(mark: Mark, side: EdgeSide): Mark {
  const a = world(side, mark.x, mark.y);
  const out: Mark = { ...mark, x: clip(a.x), y: clip(a.y) };
  if (mark.x2 != null && mark.y2 != null) {
    const b = world(side, mark.x2, mark.y2);
    out.x2 = clip(b.x);
    out.y2 = clip(b.y);
  }
  if (mark.cx != null && mark.cy != null) {
    const bend = world(side, mark.cx, mark.cy);
    out.cx = clip(bend.x);
    out.cy = clip(bend.y);
  }
  return out;
}

function approach(u: number, v: number, vu: number, vv: number, radius: number): Mark {
  return ln(u, v, vu, vv, radius, 0.42);
}

function fan(plan: VoidEdgePlan, span: number, near: number, far: number, width: number): Mark[] {
  const marks: Mark[] = [];
  const count = plan.modules;
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const u = plan.slide + (t - 0.5) * span;
    const v = near + (far - near) * (i % 2 === 0 ? 0.35 : 1);
    marks.push(pt(u, v, width, 0.48 + (i % 3) * 0.08));
    marks.push(approach(u, v, plan.slide * 0.35, Math.max(0.4, plan.radius * 0.85), 0.28));
  }
  return marks;
}

function familyMarks(plan: VoidEdgePlan, f: Frame): Mark[] {
  const r = plan.radius;
  const slide = plan.slide;
  const side = plan.corner;
  const depth = plan.depth;
  const width = f.r(0.72, 1.05);
  const marks: Mark[] = [];

  if (plan.kind === "circle") {
    marks.push(ring(slide, r * 0.15, r + 0.8, 1.05));
    marks.push(...fan(plan, r * 2.6, r * 0.7, r + depth * 0.7, width));
  } else if (plan.kind === "slot") {
    const half = 2.4 + plan.modules * 0.85;
    marks.push(ln(slide - half, 0.7, slide + half, 0.7, 1.15 + r * 0.35, 1.05, true));
    for (let i = 0; i < plan.modules; i += 1) {
      const u = slide - half * 0.8 + ((i + 0.5) / plan.modules) * half * 1.6;
      const v = 2.4 + r + (i % 2) * depth * 0.45;
      marks.push(pt(u, v, width, 0.5));
      if (i % 2 === 0) marks.push(approach(u, v, u, 1.5, 0.22));
    }
  } else if (plan.kind === "corner") {
    const u = side * 7.6;
    marks.push(ring(u, 0.15, r + 1.4, 1.1));
    for (let i = 0; i < plan.modules; i += 1) {
      marks.push(pt(u - side * (1.6 + i * 1.35), 1.2 + i * 0.35, width, 0.5));
      marks.push(pt(u - side * 0.8, 2.2 + i * (depth * 0.28), width * 0.9, 0.46));
    }
  } else if (plan.kind === "crescent") {
    const half = r + 2.2;
    marks.push(cv(slide - half, 0.3, slide + half, 0.3, slide + side * 0.8, 1.2 + r * 1.5, 1.15, 1.05, true));
    for (let i = 0; i < plan.modules; i += 1) {
      const t = (i + 1) / (plan.modules + 1);
      marks.push(pt(slide + (t - 0.65) * half, 1.6 + r + t * depth * 0.4, width, 0.48));
    }
  } else if (plan.kind === "pocket") {
    const half = 0.9 + r * 0.35;
    const deep = 3.5 + depth;
    marks.push(ln(slide - half, 0.15, slide - half, deep, 0.7, 0.95, true));
    marks.push(ln(slide + half, 0.15, slide + half, deep, 0.7, 0.95, true));
    marks.push(cv(slide - half, deep, slide + half, deep, slide, deep + r * 0.8, 0.75, 1, true));
    marks.push(pt(slide - half - 1.8, deep * 0.4, width, 0.46));
    marks.push(pt(slide + half + 1.6, deep * 0.7, width, 0.46));
    marks.push(pt(slide, deep + r + 0.8, width, 0.55));
  } else if (plan.kind === "court") {
    const half = 1.4 + r * 0.7;
    const deep = 2.2 + depth * 0.75;
    marks.push(ln(slide - half, 0.2, slide - half, deep, 0.65, 0.9, true));
    marks.push(ln(slide + half, 0.2, slide + half, deep, 0.65, 0.9, true));
    marks.push(ln(slide - half, deep, slide + half, deep, 0.65, 1, true));
    marks.push(pt(slide + side * (half + 1.4), deep * 0.45, width, 0.5));
    marks.push(pt(slide + side * (half + 2.2), deep * 0.9, width * 0.85, 0.44));
    marks.push(pt(slide, deep + 1.6 + depth * 0.2, width, 0.5));
  } else if (plan.kind === "slit") {
    const deep = 4 + depth;
    marks.push(ln(slide, 0.1, slide, deep, 0.72, 1.1, true));
    for (let i = 0; i < plan.modules; i += 1) {
      const v = 1.4 + (i + 0.5) * (deep / plan.modules);
      const u = slide + side * (1.4 + (i % 3) * 1.1);
      marks.push(pt(u, v, width * 0.85, 0.5));
      marks.push(ln(slide + side * 0.7, v, u, v, 0.2, 0.45));
    }
  } else if (plan.kind === "lens") {
    const half = r + 1.1;
    marks.push(cv(slide, 0.2, slide + side * half, 1.2 + r, slide + side * half * 0.2, r * 0.4, 0.7, 1, true));
    marks.push(cv(slide, 0.2, slide + side * half, 1.2 + r, slide + side * half * 0.55, 1.6 + r, 0.65, 0.9, true));
    marks.push(ln(slide + side * half, 1.2 + r, slide + side * (half + depth), 2 + r + depth * 0.35, 0.24, 0.6));
    marks.push(pt(slide + side * (half + depth * 0.6), 2.2 + r, width, 0.5));
    marks.push(pt(slide + side * (half + depth), 3 + r + depth * 0.2, width * 0.8, 0.42));
  } else if (plan.kind === "gap") {
    const half = 3.2 + plan.modules * 0.4;
    const mouth = 0.7 + (plan.index % 3) * 0.45;
    marks.push(ln(slide - half, 0.85, slide - mouth, 0.85, 0.55, 0.85));
    marks.push(ln(slide + mouth, 0.85, slide + half, 0.85, 0.55, 0.85));
    marks.push(ln(slide - mouth, 0.35, slide + mouth, 0.35, 1.05, 1.05, true));
    marks.push(pt(slide, 2.4 + r * 0.4, width, 0.55));
    marks.push(pt(slide + side * 1.1, 3.4 + depth * 0.35, width * 0.85, 0.46));
    marks.push(pt(slide - side * 0.4, 4.2 + depth * 0.55, width * 0.8, 0.42));
  } else if (plan.kind === "fan") {
    marks.push(ln(slide - 0.7, 0.2, slide + 0.7, 0.2, 0.85, 1, true));
    const lengths = [depth * 0.35, depth, depth * 0.55, depth * 1.15, depth * 0.7];
    const count = Math.max(3, Math.min(plan.modules + 1, lengths.length));
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const u = slide + (t - 0.5) * (3.2 + r);
      const v = 1.3 + lengths[i];
      marks.push(ln(slide + (t - 0.5) * 0.6, 0.9, u, v, 0.2, 0.72));
      marks.push(pt(u, v, width * 0.8, 0.5));
    }
  } else if (plan.kind === "flank") {
    const half = 2 + r * 0.5;
    marks.push(ln(slide - half, 0.8, slide + half, 0.8, 1.3, 1, true));
    for (let i = 0; i < plan.modules + 1; i += 1) {
      marks.push(pt(slide + side * (1.5 + i * 1.15), 1.6 + (i % 2) * depth * 0.35, width, 0.5));
    }
  } else if (plan.kind === "spine") {
    marks.push(ln(slide - 0.55, 0.2, slide + 0.55, 0.2, 0.7, 1, true));
    marks.push(ln(slide, 1.1, slide + side * 0.4, 2.2 + depth * 1.35, 0.26, 0.7));
    const stops = plan.modules;
    for (let i = 0; i < stops; i += 1) {
      const v = 2 + ((i + 1) / stops) * depth * 1.2;
      marks.push(pt(slide + side * (i % 2 === 0 ? 0.15 : 0.9), v, width * 0.75, 0.52));
    }
  } else if (plan.kind === "ribs") {
    const half = 2.2 + plan.modules * 0.55;
    marks.push(ln(slide - half, 0.65, slide + half, 0.65, 1.2, 1, true));
    const count = Math.max(3, plan.modules);
    for (let i = 0; i < count; i += 1) {
      const u = slide - half * 0.75 + ((i + 0.5) / count) * half * 1.5;
      const v = 1.5 + (i % 2 === 0 ? depth * 0.4 : depth);
      marks.push(ln(u, 1.5, u, v, 0.22, 0.62));
      marks.push(pt(u, v, width * 0.7, 0.48));
    }
  } else if (plan.kind === "knot") {
    marks.push(ring(slide, 0.2, r * 0.85 + 0.6, 1.05));
    for (let i = 0; i < plan.modules + 1; i += 1) {
      const u = slide + side * (1.3 + (i % 3) * 0.7);
      const v = 1.5 + (i % 2) * 0.9 + (i > 2 ? 1.2 : 0);
      marks.push(pt(u, v, width, 0.58));
    }
  } else if (plan.kind === "drift") {
    marks.push(ln(slide - 0.8, 0.25, slide + 0.9, 0.25, 0.9, 1, true));
    const spots: Array<[number, number, boolean]> = [
      [slide + side * 1.6, 2.1, true],
      [slide - side * 3.2, 3.4 + depth * 0.2, false],
      [slide + side * 2.4, 5 + depth * 0.45, true],
      [slide - side * 0.6, 2.8 + depth, false],
    ];
    spots.slice(0, plan.modules + 1).forEach(([u, v, link]) => {
      marks.push(pt(u, v, width * 0.85, 0.46));
      if (link) marks.push(approach(u, v, slide, 1.1, 0.2));
    });
  } else {
    const mouth = 1.6 + r * 0.35;
    const chamber = 2.4 + r * 0.8;
    marks.push(ln(slide, 0.1, slide, mouth, 0.55, 0.9, true));
    marks.push(ring(slide, mouth + chamber * 0.55, Math.max(1.3, r * 0.7), 1.05));
    for (let i = 0; i < plan.modules; i += 1) {
      const t = plan.modules === 1 ? 0.5 : i / (plan.modules - 1);
      const u = slide + (t - 0.5) * (2.2 + r);
      const v = mouth + chamber + 0.8 + t * depth * 0.35;
      marks.push(pt(u, v, width * 0.85, 0.48));
    }
  }

  return marks.map((mark) => placeMark(mark, plan.side));
}

const RADIUS_STEPS = [1.65, 2.05, 2.45, 2.9, 3.35, 3.85];
const SLIDES = [-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6];

export function planVoidEdge(seed: number, attempt = 0, index = 0): VoidEdgePlan {
  const families = EDGE_FAMILIES.length;
  const sides = EDGE_SIDES.length;
  const pass = Math.floor(index / (families * sides));
  const kind = EDGE_FAMILIES[index % families];
  const side = EDGE_SIDES[Math.floor(index / families) % sides];
  const radius = RADIUS_STEPS[(index + pass * 2) % RADIUS_STEPS.length];
  const slide = SLIDES[(Math.floor(index / 2) + pass) % SLIDES.length];
  const modules = 2 + ((index + attempt) % 5);
  const depth = 2.1 + ((index * 3 + pass) % 6) * 0.55;
  const corner: 1 | -1 = (index + pass) % 2 === 0 ? 1 : -1;
  void seed;
  return { kind, side, growth: EDGE_GROWTHS[(index + pass) % EDGE_GROWTHS.length], index, radius, modules, slide, depth, corner };
}

export function attractorsFromVoidEdge(plan: VoidEdgePlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x0e66e ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x27d4eb2d));
  return familyMarks(plan, frame(rng));
}

export function slimeFromVoidEdge(base: SlimeControls, plan: VoidEdgePlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index ^ plan.growth.length);
  const f = frame(rng);
  const thin = plan.growth === "sharp" || plan.growth === "filament";
  return {
    ...base,
    sensorAngle: f.r(0.08, thin ? 0.24 : 0.36),
    sensorDistance: f.r(0.45, 1.15),
    turnAngle: f.r(0.08, 0.42),
    stepSize: f.r(0.12, 0.28),
    deposit: f.r(0.09, thin ? 0.14 : 0.18),
    depositWidth: f.r(0.16, thin ? 0.28 : 0.38),
    diffusion: 0,
    decay: f.r(0.994, 0.998),
    trailInfluence: f.r(1.05, 1.85),
    resistance: f.r(0.02, 0.16),
    randomness: plan.growth === "sparse" ? f.r(0.18, 0.42) : f.r(0.03, 0.16),
    persistence: plan.growth === "sparse" ? f.r(0.42, 0.68) : f.r(0.7, 0.92),
    trailCap: f.r(0.32, 0.72),
    crowdingLimit: 16 + plan.modules * 4,
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
    foodPoints: [],
  };
}

export function agentsFromVoidEdge(plan: VoidEdgePlan, seed: number) {
  const rng = mulberry32(seed ^ 0x6d2b79f5 ^ plan.index);
  const base = plan.growth === "sparse" ? 88 : plan.growth === "thread" ? 168 : plan.growth === "sharp" ? 140 : 124;
  return Math.round(Math.min(220, Math.max(72, base + plan.modules * 6 + (rng() - 0.5) * 16)));
}

export function voidEdgeIdentity(attractors: FieldAttractor[]): boolean {
  const holes = attractors.filter((item) => item.hole || item.kind === "ring");
  const modules = attractors.filter((item) => item.kind === "point");
  if (!holes.length || modules.length < 2) return false;
  let hx = 0;
  let hy = 0;
  for (const hole of holes) {
    hx += hole.x;
    hy += hole.y;
  }
  hx /= holes.length;
  hy /= holes.length;
  const edgeDist = Math.min(hx, hy, FIELD_SIZE - 1 - hx, FIELD_SIZE - 1 - hy);
  const centerDist = Math.hypot(hx - CENTER, hy - CENTER);
  return edgeDist < 5.2 && centerDist > 2.4;
}

export function voidEdgeSignature(plan: VoidEdgePlan, attractors: FieldAttractor[]): number[] {
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x, item.x2 ?? item.x);
    minY = Math.min(minY, item.y, item.y2 ?? item.y);
    maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
    maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
  }
  return [
    EDGE_FAMILIES.indexOf(plan.kind) / EDGE_FAMILIES.length,
    EDGE_SIDES.indexOf(plan.side) / EDGE_SIDES.length,
    plan.radius / 4,
    plan.modules / 6,
    (plan.slide + 4) / 8,
    plan.depth / 6,
    plan.corner,
    (maxX - minX) / FIELD_SIZE,
    (maxY - minY) / FIELD_SIZE,
    attractors.length / 24,
  ];
}

export function isNovelVoidEdge(signature: number[], previous: number[][]): boolean {
  return previous.every((item) => {
    let sum = 0;
    const n = Math.min(signature.length, item.length, 7);
    for (let i = 0; i < n; i += 1) sum += Math.abs(signature[i] - item[i]);
    return sum / Math.max(1, n) >= 0.08;
  });
}

export function voidEdgeHasMass(snapshot: FieldSnapshot) {
  const trails = snapshot.trails;
  if (!trails.length) return false;
  let hot = 0;
  let peak = 0;
  for (let i = 0; i < trails.length; i += 1) {
    const value = trails[i];
    if (value > peak) peak = value;
    if (value > 0.08) hot += 1;
  }
  const occupied = hot / trails.length;
  return occupied > 0.004 && occupied < 0.42 && peak > 0.2;
}
