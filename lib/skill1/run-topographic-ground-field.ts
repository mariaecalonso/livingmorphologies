import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, FieldSnapshot, SpatialRecipe } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const EDGE = 1.2;
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

export type TerrainKind =
  | "rolling"
  | "valley"
  | "plateau"
  | "dune"
  | "basin"
  | "ridge"
  | "terrace"
  | "mounds"
  | "channel"
  | "hollow"
  | "ripple"
  | "crater"
  | "layered"
  | "spine"
  | "slope"
  | "pockets"
  | "commons";

export const TERRAIN_FAMILIES: TerrainKind[] = [
  "rolling",
  "valley",
  "plateau",
  "dune",
  "basin",
  "ridge",
  "terrace",
  "mounds",
  "channel",
  "hollow",
  "ripple",
  "crater",
  "layered",
  "spine",
  "slope",
  "pockets",
  "commons",
];

export type TopographicPlan = {
  kind: TerrainKind;
  index: number;
  scale: number;
  originX: number;
  originY: number;
  twist: number;
  flip: boolean;
};

function pt(x: number, y: number, radius: number, strength: number, hole = false): FieldAttractor {
  return { kind: hole ? "ring" : "point", x: lim(x), y: lim(y), radius, strength, hole };
}

function ln(x: number, y: number, x2: number, y2: number, radius: number, strength: number): FieldAttractor {
  return { kind: "line", x: lim(x), y: lim(y), x2: lim(x2), y2: lim(y2), radius, strength };
}

function cv(x: number, y: number, x2: number, y2: number, cx: number, cy: number, radius: number, strength: number): FieldAttractor {
  return { kind: "curve", x: lim(x), y: lim(y), x2: lim(x2), y2: lim(y2), cx: lim(cx), cy: lim(cy), radius, strength };
}

function rotate(x: number, y: number, plan: TopographicPlan) {
  const dx = (x - CENTER) * plan.scale * (plan.flip ? -1 : 1);
  const dy = (y - CENTER) * plan.scale;
  const c = Math.cos(plan.twist);
  const s = Math.sin(plan.twist);
  return {
    x: lim(plan.originX + dx * c - dy * s),
    y: lim(plan.originY + dx * s + dy * c),
  };
}

function place(marks: FieldAttractor[], plan: TopographicPlan): FieldAttractor[] {
  return marks.map((mark) => {
    const a = rotate(mark.x, mark.y, plan);
    const out: FieldAttractor = { ...mark, x: a.x, y: a.y, radius: (mark.radius ?? 1.2) * plan.scale };
    if (mark.x2 != null && mark.y2 != null) {
      const b = rotate(mark.x2, mark.y2, plan);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    if (mark.cx != null && mark.cy != null) {
      const c = rotate(mark.cx, mark.cy, plan);
      out.cx = c.x;
      out.cy = c.y;
    }
    return out;
  });
}

function familyMarks(kind: TerrainKind, f: Frame): FieldAttractor[] {
  const marks: FieldAttractor[] = [];
  if (kind === "rolling") {
    const n = f.int(6, 10);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + f.r(-0.35, 0.35);
      const d = f.r(2.2, 7.4);
      marks.push(pt(CENTER + Math.cos(a) * d, CENTER + Math.sin(a) * d, f.r(1.4, 2.8), f.r(0.28, 0.58)));
    }
    for (let i = 0; i < n; i += 1) {
      const a = marks[i];
      const b = marks[(i + 1) % n];
      marks.push(cv(a.x, a.y, b.x, b.y, (a.x + b.x) / 2 + f.r(-1.6, 1.6), (a.y + b.y) / 2 + f.r(-1.6, 1.6), f.r(0.7, 1.5), f.r(0.22, 0.45)));
    }
    return marks;
  }
  if (kind === "valley") {
    const gap = f.r(2.4, 3.8);
    marks.push(cv(3.2, CENTER - gap, 16.8, CENTER - gap + f.r(-1.2, 1.2), 10, CENTER - gap + f.r(-2.2, 0.4), f.r(1.1, 2), f.r(0.4, 0.7)));
    marks.push(cv(3.2, CENTER + gap, 16.8, CENTER + gap + f.r(-1.2, 1.2), 10, CENTER + gap + f.r(-0.4, 2.2), f.r(1.1, 2), f.r(0.4, 0.7)));
    marks.push(cv(4.2, CENTER, 15.8, CENTER, 10, CENTER + f.r(-1.8, 1.8), f.r(0.55, 1.05), f.r(0.2, 0.4)));
    for (let i = 0; i < 4; i += 1) marks.push(pt(5 + i * 3.1 + f.r(-0.5, 0.5), CENTER + f.r(-0.6, 0.6), f.r(0.8, 1.5), f.r(0.25, 0.5)));
    return marks;
  }
  if (kind === "plateau") {
    const n = f.int(4, 7);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + f.r(-0.25, 0.25);
      const d = f.r(2.8, 6.8);
      marks.push(pt(CENTER + Math.cos(a) * d, CENTER + Math.sin(a) * d, f.r(2.2, 3.6), f.r(0.35, 0.62)));
    }
    for (let i = 0; i < n; i += 1) {
      const a = marks[i];
      const b = marks[(i + 1 + (f.chance(0.35) ? 1 : 0)) % n];
      marks.push(ln(a.x, a.y, b.x, b.y, f.r(0.7, 1.4), f.r(0.28, 0.52)));
    }
    return marks;
  }
  if (kind === "dune" || kind === "ripple" || kind === "layered") {
    const rows = kind === "ripple" ? f.int(5, 7) : f.int(3, 5);
    const span = kind === "dune" ? f.r(6.4, 8.2) : f.r(5.6, 7.8);
    for (let i = 0; i < rows; i += 1) {
      const t = (i / Math.max(1, rows - 1) - 0.5) * 2;
      const y = CENTER + t * f.r(4.2, 6.6);
      const bend = (i % 2 ? -1 : 1) * f.r(1.2, 3.4);
      marks.push(cv(CENTER - span, y, CENTER + span, y + f.r(-0.8, 0.8), CENTER, y + bend, f.r(0.7, 1.6), f.r(0.28, 0.55)));
      if (f.chance(0.55)) marks.push(pt(CENTER + f.r(-span * 0.6, span * 0.6), y + f.r(-0.8, 0.8), f.r(0.9, 1.8), f.r(0.22, 0.45)));
    }
    return marks;
  }
  if (kind === "basin" || kind === "crater" || kind === "pockets" || kind === "hollow") {
    const n = kind === "hollow" ? f.int(3, 5) : f.int(5, 9);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + f.r(-0.4, 0.4);
      const d = f.r(1.6, 7.2);
      marks.push(pt(CENTER + Math.cos(a) * d, CENTER + Math.sin(a) * d, f.r(1.1, kind === "hollow" ? 3.4 : 2.4), f.r(0.2, 0.42), true));
    }
    const links = f.int(4, 8);
    for (let i = 0; i < links; i += 1) {
      const a = marks[i % n];
      const b = marks[(i + 1 + (f.chance(0.4) ? 1 : 0)) % n];
      marks.push(cv(a.x, a.y, b.x, b.y, (a.x + b.x) / 2 + f.r(-1.8, 1.8), (a.y + b.y) / 2 + f.r(-1.8, 1.8), f.r(0.55, 1.3), f.r(0.22, 0.48)));
    }
    if (kind === "hollow") marks.push(pt(CENTER + f.r(-1.2, 1.2), CENTER + f.r(-1.2, 1.2), f.r(3.2, 4.6), f.r(0.18, 0.34)));
    return marks;
  }
  if (kind === "ridge" || kind === "spine") {
    const half = f.r(6.2, 8);
    marks.push(cv(CENTER - half, CENTER, CENTER + half, CENTER, CENTER, CENTER + f.r(-2.4, 2.4), f.r(1.1, 2.1), f.r(0.45, 0.75)));
    const ribs = f.int(4, 7);
    for (let i = 0; i < ribs; i += 1) {
      const t = (i + 0.5) / ribs;
      const x = CENTER - half + t * half * 2;
      const side = (i % 2 ? -1 : 1) * f.r(2.4, 5.2);
      marks.push(ln(x, CENTER, x + f.r(-1.1, 1.1), CENTER + side, f.r(0.45, 1.1), f.r(0.22, 0.48)));
      marks.push(pt(x + f.r(-0.4, 0.4), CENTER + side * 0.35, f.r(0.8, 1.6), f.r(0.25, 0.5)));
    }
    return marks;
  }
  if (kind === "terrace" || kind === "slope") {
    const rows = f.int(3, 5);
    for (let i = 0; i < rows; i += 1) {
      const t = i / Math.max(1, rows - 1);
      const y = 4.2 + t * 11.2;
      const inset = kind === "slope" ? t * f.r(1.2, 2.6) : f.r(0, 1.1);
      const w = f.r(5.4, 7.8) - inset;
      marks.push(ln(CENTER - w, y, CENTER + w, y + f.r(-0.35, 0.35), f.r(0.7, 1.5), 0.25 + t * 0.4));
      marks.push(pt(CENTER + f.r(-w * 0.5, w * 0.5), y + f.r(-0.5, 0.5), f.r(1.1, 2.2), 0.28 + t * 0.28));
    }
    return marks;
  }
  if (kind === "channel") {
    marks.push(cv(3.4, 4.2, 16.2, 15.4, 7.2, 12.6, f.r(0.7, 1.3), f.r(0.35, 0.6)));
    marks.push(cv(4.1, 15.6, 16.4, 4.8, 12.8, 7.4, f.r(0.65, 1.2), f.r(0.3, 0.55)));
    const n = f.int(3, 5);
    for (let i = 0; i < n; i += 1) {
      marks.push(pt(4.8 + i * 2.8 + f.r(-0.6, 0.6), 5.2 + f.r(0, 9.2), f.r(0.9, 1.8), f.r(0.22, 0.48)));
    }
    return marks;
  }
  if (kind === "mounds") {
    const n = f.int(5, 8);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + f.r(-0.3, 0.3);
      const d = f.r(2.4, 6.8);
      marks.push(pt(CENTER + Math.cos(a) * d, CENTER + Math.sin(a) * d, f.r(1.6, 3.1), f.r(0.3, 0.6)));
    }
    for (let i = 0; i < n; i += 1) {
      const a = marks[i];
      const b = marks[(i + 1) % n];
      marks.push(cv(a.x, a.y, b.x, b.y, CENTER + f.r(-1.8, 1.8), CENTER + f.r(-1.8, 1.8), f.r(0.6, 1.3), f.r(0.22, 0.46)));
    }
    return marks;
  }
  const n = f.int(6, 10);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + f.r(-0.4, 0.4);
    const d = f.r(1.8, 7.6);
    marks.push(pt(CENTER + Math.cos(a) * d, CENTER + Math.sin(a) * d, f.r(1.2, 2.8), f.r(0.22, 0.55), f.chance(0.22)));
  }
  for (let i = 0; i < n; i += 1) {
    const a = marks[i];
    const b = marks[(i + 1) % n];
    marks.push(cv(a.x, a.y, b.x, b.y, (a.x + b.x) / 2 + f.r(-2, 2), (a.y + b.y) / 2 + f.r(-2, 2), f.r(0.55, 1.4), f.r(0.2, 0.45)));
  }
  return marks;
}

export function planTopographicGroundField(seed: number, attempt = 0, index = 0): TopographicPlan {
  const rng = mulberry32(seed ^ 0x70f00d ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  return {
    kind: f.pick(TERRAIN_FAMILIES),
    index,
    scale: f.r(0.78, 1.08),
    originX: CENTER + f.r(-1.2, 1.2),
    originY: CENTER + f.r(-1.2, 1.2),
    twist: f.r(-0.55, 0.55),
    flip: f.chance(0.5),
  };
}

export function attractorsFromTopographic(plan: TopographicPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x70f1e1d ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x165667b1));
  const f = frame(rng);
  return place(familyMarks(plan.kind, f), plan);
}

export function slimeFromTopographic(base: SlimeControls, plan: TopographicPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index);
  const f = frame(rng);
  return {
    ...base,
    persistence: f.r(0.14, 0.88),
    trailInfluence: f.r(0.28, 1.85),
    sensorAngle: f.r(0.08, 1.05),
    sensorDistance: f.r(0.32, 1.9),
    turnAngle: f.r(0.06, 0.95),
    stepSize: f.r(0.08, 0.38),
    deposit: f.r(0.01, 0.28),
    depositWidth: f.r(0.26, 3.4),
    diffusion: f.r(0, 0.14),
    decay: f.r(0.92, 0.996),
    resistance: f.r(0, 0.42),
    randomness: f.r(0.04, 0.95),
    trailCap: f.r(0.2, 1.9),
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
    foodPoints: [{ x: plan.originX, y: plan.originY }],
  };
}

export function paramsFromTopographic(base: BiologicalParams, seed: number): BiologicalParams {
  const rng = mulberry32(seed ^ 0x70fa11);
  return {
    ...base,
    attractionStrength: 0.28 + rng() * 0.5,
    networkDensity: 0.42 + rng() * 0.48,
    permeability: 0.48 + rng() * 0.42,
    flowCoupling: 0.28 + rng() * 0.5,
    geometryVariation: 0.38 + rng() * 0.52,
  };
}

export function recipeFromTopographic(recipe: SpatialRecipe, seed: number): SpatialRecipe {
  const rng = mulberry32(seed ^ 0x70ec1e);
  const f = frame(rng);
  return {
    ...recipe,
    clustering: f.r(0.04, 0.42),
    isolationRadius: f.r(4.2, 6.8),
    approachWidth: f.r(2.8, 4.7),
    coreExposure: f.r(0.62, 0.96),
  };
}

export function agentsFromTopographic(plan: TopographicPlan, seed: number) {
  const rng = mulberry32(seed ^ 0x70a11e ^ plan.index);
  return Math.round(90 + rng() * 230);
}

function fieldProfile(snapshot: FieldSnapshot) {
  const trails = snapshot.trails;
  const ts = snapshot.trailSize;
  const scale = ts / FIELD_SIZE;
  let live = 0;
  let minX = ts;
  let minY = ts;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < trails.length; i += 1) {
    if (trails[i] < 0.012) continue;
    live += 1;
    const px = i % ts;
    const py = Math.floor(i / ts);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const spanX = (maxX - minX) / scale;
  const spanY = (maxY - minY) / scale;
  return {
    occupied: live / Math.max(1, trails.length),
    trailSpan: Math.max(spanX, spanY),
    spanX,
    spanY,
    biaxial: Math.min(spanX, spanY) / Math.max(0.01, Math.max(spanX, spanY)),
  };
}

export function topographicIdentity(_features: unknown, attractors: FieldAttractor[], snapshot?: FieldSnapshot): boolean {
  if (attractors.length < 4) return false;
  if (!snapshot) return true;
  const profile = fieldProfile(snapshot);
  if (profile.occupied < 0.06 || profile.occupied > 0.86) return false;
  if (profile.trailSpan < 9) return false;
  return profile.biaxial >= 0.28;
}

export function scoreTopographic(snapshot: FieldSnapshot, attractors: FieldAttractor[]): number {
  if (attractors.length < 4) return 0;
  const profile = fieldProfile(snapshot);
  const field = profile.biaxial >= 0.28 ? 1.3 : 0.15;
  const cover = profile.occupied > 0.1 && profile.occupied < 0.72 ? 1 : 0.25;
  return profile.trailSpan / FIELD_SIZE + profile.biaxial * 1.4 + field + cover + attractors.length / 28;
}

export function topographicSignature(
  attractors: FieldAttractor[],
  extra?: { slime?: SlimeControls; agents?: number; kind?: TerrainKind },
): number[] {
  const holes = attractors.filter((item) => item.hole || item.kind === "ring").length;
  const lines = attractors.filter((item) => item.kind === "line").length;
  const curves = attractors.filter((item) => item.kind === "curve").length;
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x);
    maxY = Math.max(maxY, item.y);
  }
  const slime = extra?.slime;
  return [
    attractors.length / 28,
    holes / 10,
    lines / 10,
    curves / 12,
    (maxX - minX) / FIELD_SIZE,
    (maxY - minY) / FIELD_SIZE,
    extra?.kind ? TERRAIN_FAMILIES.indexOf(extra.kind) / 20 : 0,
    extra?.agents ? extra.agents / 400 : 0,
    slime ? slime.deposit : 0,
    slime ? slime.depositWidth / 3.4 : 0,
    slime ? slime.diffusion : 0,
    slime ? slime.randomness / 1.2 : 0,
  ];
}

export function isNovelTerrain(signature: number[], previous: number[][]): boolean {
  if (!previous.length) return true;
  return previous.every((item) => {
    let sum = 0;
    const len = Math.min(signature.length, item.length);
    for (let i = 0; i < len; i += 1) {
      const d = signature[i] - item[i];
      sum += d * d;
    }
    return Math.sqrt(sum / Math.max(1, len)) >= 0.2;
  });
}
