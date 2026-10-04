import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, FieldSnapshot, SpatialRecipe } from "./types";
import type { MorphFeatures } from "./run-morphology";

const EDGE = 1.35;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

type Rng = () => number;
type Pair = [number, number];
export type HallFigure = "stroke" | "beads" | "void-cut";

export type HallFamily =
  | "stroke-h"
  | "stroke-diag"
  | "beads-h"
  | "beads-v"
  | "beads-diag"
  | "beads-anti"
  | "beads-tight"
  | "beads-loose"
  | "rings-h"
  | "rings-diag"
  | "taper-beads"
  | "offset-beads"
  | "twin-beads"
  | "short-beads"
  | "void-h"
  | "void-v"
  | "void-diag"
  | "void-slash"
  | "banks-h"
  | "banks-diag";

export type HallGrowth =
  | "hairline"
  | "ribbon"
  | "bloom"
  | "heavy"
  | "faint"
  | "wet"
  | "dry"
  | "tight"
  | "loose"
  | "slow"
  | "fast"
  | "biased"
  | "soft"
  | "hard"
  | "sparse"
  | "packed"
  | "short"
  | "long"
  | "banked"
  | "open";

export const HALL_FAMILIES: HallFamily[] = [
  "stroke-h",
  "stroke-diag",
  "beads-h",
  "beads-v",
  "beads-diag",
  "beads-anti",
  "beads-tight",
  "beads-loose",
  "rings-h",
  "rings-diag",
  "taper-beads",
  "offset-beads",
  "twin-beads",
  "short-beads",
  "void-h",
  "void-v",
  "void-diag",
  "void-slash",
  "banks-h",
  "banks-diag",
];

export const HALL_GROWTHS: HallGrowth[] = [
  "hairline",
  "ribbon",
  "bloom",
  "heavy",
  "faint",
  "wet",
  "dry",
  "tight",
  "loose",
  "slow",
  "fast",
  "biased",
  "soft",
  "hard",
  "sparse",
  "packed",
  "short",
  "long",
  "banked",
  "open",
];

type DensityKind = "white" | "vein" | "green";

type GrowthSpec = {
  density: DensityKind;
  width: Pair;
  length: Pair;
  agents: Pair;
  clustering: Pair;
  isolation: Pair;
  approach: Pair;
  exposure: Pair;
  slime: {
    persistence: Pair;
    trailInfluence: Pair;
    sensorAngle: Pair;
    sensorDistance: Pair;
    turnAngle: Pair;
    stepSize: Pair;
    deposit: Pair;
    depositWidth: Pair;
    diffusion: Pair;
    decay: Pair;
    resistance: Pair;
    randomness: Pair;
    trailCap: Pair;
  };
  params: Partial<BiologicalParams>;
};

const SPECS: Record<HallGrowth, GrowthSpec> = {
  hairline: spec("white", [0.3, 0.5], [7.4, 12], [55, 110], [0.84, 0.94], [0.05, 0.12], [0.8, 0.92]),
  ribbon: spec("vein", [0.7, 1.15], [8, 12.8], [200, 300], [0.55, 0.75], [0.12, 0.24], [0.55, 0.74]),
  bloom: spec("green", [1.15, 1.9], [7.2, 12], [460, 580], [0.32, 0.55], [0.22, 0.42], [0.38, 0.58]),
  heavy: spec("green", [1.3, 2.1], [7, 11.8], [500, 600], [0.3, 0.5], [0.18, 0.34], [0.42, 0.62]),
  faint: spec("white", [0.35, 0.65], [6.8, 11.2], [60, 120], [0.8, 0.93], [0.04, 0.11], [0.76, 0.9]),
  wet: spec("green", [0.95, 1.7], [7.4, 12.2], [440, 580], [0.34, 0.56], [0.2, 0.4], [0.4, 0.6]),
  dry: spec("white", [0.38, 0.7], [8.2, 13.2], [65, 125], [0.82, 0.94], [0.04, 0.12], [0.8, 0.92]),
  tight: spec("white", [0.42, 0.78], [8, 12.6], [55, 115], [0.86, 0.95], [0.04, 0.1], [0.84, 0.94]),
  loose: spec("vein", [0.8, 1.5], [7.6, 12.4], [190, 290], [0.48, 0.7], [0.16, 0.3], [0.45, 0.66]),
  slow: spec("vein", [0.55, 1.05], [7.4, 12], [210, 310], [0.5, 0.72], [0.12, 0.24], [0.55, 0.74]),
  fast: spec("vein", [0.45, 0.9], [8.2, 13], [180, 280], [0.58, 0.76], [0.1, 0.22], [0.6, 0.78]),
  biased: spec("vein", [0.4, 0.75], [8.6, 13.6], [170, 260], [0.7, 0.86], [0.08, 0.18], [0.72, 0.88]),
  soft: spec("green", [0.9, 1.6], [7.2, 11.8], [430, 560], [0.34, 0.56], [0.2, 0.38], [0.4, 0.62]),
  hard: spec("white", [0.36, 0.62], [8.4, 13], [50, 105], [0.84, 0.94], [0.03, 0.09], [0.84, 0.94]),
  sparse: spec("white", [0.5, 1.1], [6.8, 11.4], [50, 100], [0.72, 0.9], [0.08, 0.18], [0.68, 0.84]),
  packed: spec("green", [0.7, 1.3], [8, 12.4], [520, 600], [0.36, 0.58], [0.16, 0.3], [0.42, 0.64]),
  short: spec("white", [0.55, 1.2], [5.2, 8], [60, 120], [0.7, 0.88], [0.08, 0.18], [0.64, 0.82]),
  long: spec("vein", [0.45, 0.95], [11, 15.2], [200, 300], [0.52, 0.74], [0.1, 0.22], [0.6, 0.78]),
  banked: spec("green", [0.85, 1.45], [8.2, 13.4], [450, 580], [0.28, 0.5], [0.2, 0.4], [0.34, 0.56]),
  open: spec("green", [1.05, 1.85], [7.6, 12.6], [440, 570], [0.3, 0.52], [0.22, 0.42], [0.32, 0.54]),
};

const WHITE_GROWTHS = HALL_GROWTHS.filter((item) => SPECS[item].density === "white");
const VEIN_GROWTHS = HALL_GROWTHS.filter((item) => SPECS[item].density === "vein");
const GREEN_GROWTHS = HALL_GROWTHS.filter((item) => SPECS[item].density === "green");

function spec(
  density: DensityKind,
  width: Pair,
  length: Pair,
  agents: Pair,
  persistence: Pair,
  sensorAngle: Pair,
  bias: Pair,
): GrowthSpec {
  const slime =
    density === "white"
      ? {
          persistence: [0.62, 0.82] as Pair,
          trailInfluence: [0.28, 0.62] as Pair,
          sensorAngle: [0.14, 0.34] as Pair,
          sensorDistance: [0.35, 0.75] as Pair,
          turnAngle: [0.14, 0.32] as Pair,
          stepSize: [0.1, 0.16] as Pair,
          deposit: [0.003, 0.009] as Pair,
          depositWidth: [0.16, 0.32] as Pair,
          diffusion: [0, 0.001] as Pair,
          decay: [0.9, 0.934] as Pair,
          resistance: [0.18, 0.4] as Pair,
          randomness: [0.24, 0.42] as Pair,
          trailCap: [0.16, 0.34] as Pair,
        }
      : density === "vein"
        ? {
            persistence: [0.55, 0.78] as Pair,
            trailInfluence: [0.85, 1.25] as Pair,
            sensorAngle: [0.1, 0.22] as Pair,
            sensorDistance: [0.32, 0.7] as Pair,
            turnAngle: [0.08, 0.2] as Pair,
            stepSize: [0.1, 0.16] as Pair,
            deposit: [0.045, 0.085] as Pair,
            depositWidth: [0.85, 1.35] as Pair,
            diffusion: [0.006, 0.018] as Pair,
            decay: [0.966, 0.982] as Pair,
            resistance: [0.12, 0.28] as Pair,
            randomness: [0.08, 0.2] as Pair,
            trailCap: [0.68, 1.02] as Pair,
          }
        : {
            persistence: [0.3, 0.52] as Pair,
            trailInfluence: [1.45, 2] as Pair,
            sensorAngle: [0.18, 0.42] as Pair,
            sensorDistance: [0.5, 1.1] as Pair,
            turnAngle: [0.16, 0.34] as Pair,
            stepSize: [0.12, 0.2] as Pair,
            deposit: [0.18, 0.28] as Pair,
            depositWidth: [2.3, 3.4] as Pair,
            diffusion: [0.05, 0.12] as Pair,
            decay: [0.99, 0.998] as Pair,
            resistance: [0.02, 0.1] as Pair,
            randomness: [0.02, 0.1] as Pair,
            trailCap: [1.55, 1.95] as Pair,
          };
  return {
    density,
    width,
    length,
    agents,
    clustering: [0.4, 0.9],
    isolation: [1.2, 4.2],
    approach: [0.8, 2.4],
    exposure: [0.45, 0.92],
    slime,
    params: {
      attractionStrength: density === "white" ? 0.28 : density === "vein" ? 0.52 : 0.92,
      directionalBias: (bias[0] + bias[1]) / 2,
      networkDensity: density === "white" ? 0.1 : density === "vein" ? 0.36 : 0.78,
      permeability: density === "white" ? 0.32 : density === "vein" ? 0.48 : 0.72,
      geometryVariation: density === "green" ? 0.22 : 0.4,
      nodeRepetition: density === "green" ? 0.5 : 0.74,
    },
  };
}

export type ContinuousHallPlan = {
  family: HallFamily;
  growth: HallGrowth;
  figure: HallFigure;
  index: number;
  cx: number;
  cy: number;
  length: number;
  width: number;
  pinch: number;
  flip: boolean;
  twist: number;
};

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

function span(f: Frame, pair: Pair) {
  return f.r(pair[0], pair[1]);
}

export function figureOf(family: HallFamily): HallFigure {
  if (family === "stroke-h" || family === "stroke-diag") return "stroke";
  if (
    family === "void-h" ||
    family === "void-v" ||
    family === "void-diag" ||
    family === "void-slash" ||
    family === "banks-h" ||
    family === "banks-diag"
  ) {
    return "void-cut";
  }
  return "beads";
}

function axisOf(family: HallFamily): { dx: number; dy: number; cx: number; cy: number } {
  switch (family) {
    case "stroke-h":
      return { dx: 1, dy: 0.08, cx: 10, cy: 9.4 };
    case "stroke-diag":
      return { dx: 0.82, dy: 0.58, cx: 10.2, cy: 10.4 };
    case "beads-h":
      return { dx: 1, dy: 0, cx: 10, cy: 7.6 };
    case "beads-v":
      return { dx: 0.08, dy: 1, cx: 13.2, cy: 10 };
    case "beads-diag":
      return { dx: 0.86, dy: 0.52, cx: 9.4, cy: 8.8 };
    case "beads-anti":
      return { dx: 0.84, dy: -0.54, cx: 10.6, cy: 12.2 };
    case "beads-tight":
      return { dx: 0.92, dy: 0.28, cx: 10, cy: 11.4 };
    case "beads-loose":
      return { dx: 0.7, dy: 0.72, cx: 8.8, cy: 9.2 };
    case "rings-h":
      return { dx: 1, dy: -0.06, cx: 10, cy: 14.2 };
    case "rings-diag":
      return { dx: 0.78, dy: 0.62, cx: 11.2, cy: 7.2 };
    case "taper-beads":
      return { dx: 0.88, dy: 0.4, cx: 9.6, cy: 12.6 };
    case "offset-beads":
      return { dx: 0.95, dy: -0.32, cx: 11.8, cy: 5.6 };
    case "twin-beads":
      return { dx: 1, dy: 0.1, cx: 10, cy: 10.8 };
    case "short-beads":
      return { dx: 0.74, dy: 0.66, cx: 7.4, cy: 13.4 };
    case "void-h":
      return { dx: 1, dy: 0, cx: 10, cy: 10 };
    case "void-v":
      return { dx: 0, dy: 1, cx: 10, cy: 10 };
    case "void-diag":
      return { dx: 0.8, dy: 0.6, cx: 10, cy: 10 };
    case "void-slash":
      return { dx: 0.8, dy: -0.6, cx: 10, cy: 10 };
    case "banks-h":
      return { dx: 1, dy: 0.05, cx: 10, cy: 8.4 };
    case "banks-diag":
      return { dx: 0.76, dy: 0.64, cx: 9.8, cy: 11.2 };
  }
}

function along(cx: number, cy: number, dx: number, dy: number, length: number, t: number) {
  const n = Math.hypot(dx, dy) || 1;
  return {
    x: lim(cx + (dx / n) * (t - 0.5) * length),
    y: lim(cy + (dy / n) * (t - 0.5) * length),
  };
}

function perp(dx: number, dy: number) {
  const n = Math.hypot(dx, dy) || 1;
  return { x: -dy / n, y: dx / n };
}

function flare(t: number, pinch: number) {
  const mid = 1 - Math.abs(t - 0.5) * 2;
  return 1 - (1 - pinch) * mid;
}

function flaredCorridor(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  length: number,
  radius: number,
  pinch: number,
  strength: number,
  hole = false,
): FieldAttractor[] {
  const marks: FieldAttractor[] = [];
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const a = along(cx, cy, dx, dy, length, t0);
    const b = along(cx, cy, dx, dy, length, t1);
    marks.push({
      kind: "line",
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      radius: radius * flare((t0 + t1) / 2, pinch),
      strength,
      hole: hole || undefined,
    });
  }
  return marks;
}

export function planContinuousHall(seed: number, attempt = 0, index = 0): ContinuousHallPlan {
  const rng = mulberry32(seed ^ 0xc0111a ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  const family = f.pick(HALL_FAMILIES);
  const growth = f.pick(HALL_GROWTHS);
  const spec = SPECS[growth];
  const figure = figureOf(family);
  const short = growth === "short" || family === "short-beads";
  return {
    family,
    growth,
    figure,
    index,
    cx: lim(f.r(3.6, 16.4)),
    cy: lim(f.r(3.6, 16.4)),
    length: span(f, short ? [5, 7.6] : growth === "long" ? [11.2, 15.2] : spec.length),
    width: span(f, figure === "beads" ? [spec.width[0] * 1.15, spec.width[1] * 1.35] : spec.width),
    pinch: f.r(0.22, 0.48),
    flip: f.chance(0.5),
    twist: f.r(-0.85, 0.85),
  };
}

export function attractorsFromContinuousHall(plan: ContinuousHallPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x11a11 ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x165667b1));
  const f = frame(rng);
  const axis = axisOf(plan.family);
  const cos = Math.cos(plan.twist);
  const sin = Math.sin(plan.twist);
  const rdx = (plan.flip ? -axis.dx : axis.dx) * cos - (plan.flip ? -axis.dy : axis.dy) * sin;
  const rdy = (plan.flip ? -axis.dx : axis.dx) * sin + (plan.flip ? -axis.dy : axis.dy) * cos;
  const dx = rdx;
  const dy = rdy;
  if (plan.figure === "stroke") {
    return flaredCorridor(plan.cx, plan.cy, dx, dy, plan.length, plan.width, plan.pinch, 1.15);
  }
  if (plan.figure === "void-cut") {
    return voidCutMarks(plan, f, dx, dy);
  }
  return beadMarks(plan, f, dx, dy);
}

function beadMarks(plan: ContinuousHallPlan, f: Frame, dx: number, dy: number): FieldAttractor[] {
  const hollow = plan.family === "rings-h" || plan.family === "rings-diag";
  const count =
    plan.family === "short-beads"
      ? f.int(3, 4)
      : plan.family === "beads-loose"
        ? f.int(3, 5)
        : plan.family === "beads-tight"
          ? f.int(7, 10)
          : f.int(5, 8);
  const marks: FieldAttractor[] = [];
  const rows = plan.family === "twin-beads" ? 2 : 1;
  const side = perp(dx, dy);
  for (let row = 0; row < rows; row += 1) {
    const shift = rows === 1 ? 0 : (row === 0 ? -1 : 1) * (plan.width * 1.15);
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const p = along(plan.cx + side.x * shift, plan.cy + side.y * shift, dx, dy, plan.length, t);
      const radius = plan.width * flare(t, plan.pinch) * f.r(0.88, 1.22);
      marks.push({
        kind: hollow ? "ring" : "point",
        x: p.x,
        y: p.y,
        radius,
        strength: hollow ? 0.95 : 0.85,
        hole: hollow || undefined,
      });
    }
  }
  marks.push(...flaredCorridor(plan.cx, plan.cy, dx, dy, plan.length * 0.92, plan.width * 0.32, plan.pinch, 0.38));
  return marks;
}

function voidCutMarks(plan: ContinuousHallPlan, f: Frame, dx: number, dy: number): FieldAttractor[] {
  const marks: FieldAttractor[] = flaredCorridor(plan.cx, plan.cy, dx, dy, plan.length, plan.width * 1.15, plan.pinch, 1.05, true);
  const disks = f.int(4, 7);
  for (let i = 0; i < disks; i += 1) {
    const t = disks === 1 ? 0.5 : i / (disks - 1);
    const p = along(plan.cx, plan.cy, dx, dy, plan.length, t);
    marks.push({
      kind: "ring",
      x: p.x,
      y: p.y,
      radius: plan.width * flare(t, plan.pinch) * f.r(0.95, 1.3),
      strength: 1,
      hole: true,
    });
  }
  if (plan.family === "banks-h" || plan.family === "banks-diag") {
    const side = perp(dx, dy);
    const banks = f.int(4, 6);
    for (let i = 0; i < banks; i += 1) {
      const t = banks === 1 ? 0.5 : i / (banks - 1);
      const p = along(plan.cx, plan.cy, dx, dy, plan.length * 0.88, t);
      const reach = plan.width * flare(t, plan.pinch) * f.r(2.1, 3.2);
      marks.push({
        kind: "point",
        x: lim(p.x + side.x * reach),
        y: lim(p.y + side.y * reach),
        radius: plan.width * f.r(1.3, 2.1),
        strength: 0.7,
      });
      marks.push({
        kind: "point",
        x: lim(p.x - side.x * reach),
        y: lim(p.y - side.y * reach),
        radius: plan.width * f.r(1.2, 2),
        strength: 0.7,
      });
    }
  }
  return marks;
}

export function slimeFromContinuousHall(base: SlimeControls, plan: ContinuousHallPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x11c0de ^ plan.index);
  const f = frame(rng);
  const s = SPECS[plan.growth].slime;
  const cut = plan.figure === "void-cut";
  return {
    ...base,
    persistence: span(f, s.persistence),
    trailInfluence: span(f, s.trailInfluence),
    sensorAngle: span(f, s.sensorAngle),
    sensorDistance: span(f, s.sensorDistance),
    turnAngle: span(f, s.turnAngle),
    stepSize: span(f, s.stepSize),
    deposit: f.r(0.003, 0.28),
    depositWidth: f.r(0.16, 3.4),
    diffusion: f.r(0, 0.12),
    decay: f.r(0.9, 0.998),
    resistance: span(f, s.resistance),
    randomness: span(f, s.randomness),
    trailCap: f.r(0.16, 1.95),
    voidElongation: cut ? span(f, [1.4, 2.4]) : 1,
    voidRotation: cut ? Math.atan2(axisOf(plan.family).dy, axisOf(plan.family).dx) : 0,
    voidLobes: 0,
    voidNotch: cut ? span(f, [-0.25, 0.25]) : 0,
    foodPoints: [{ x: plan.cx, y: plan.cy }],
  };
}

export function paramsFromContinuousHall(base: BiologicalParams, plan: ContinuousHallPlan): BiologicalParams {
  const extra = SPECS[plan.growth].params;
  const tone = SPECS[plan.growth].density;
  return {
    ...base,
    ...extra,
    directionalBias: extra.directionalBias ?? (tone === "green" ? 0.4 : 0.78),
    randomnessMode: tone === "white" ? "high" : tone === "vein" ? "medium" : "low",
    decayMode: tone === "white" ? "aggressive" : "controlled",
  };
}

export function recipeFromContinuousHall(recipe: SpatialRecipe, plan: ContinuousHallPlan, seed: number): SpatialRecipe {
  const rng = mulberry32(seed ^ 0x11ec1e);
  const f = frame(rng);
  const spec = SPECS[plan.growth];
  return {
    ...recipe,
    clustering: plan.figure === "void-cut" ? span(f, [0.12, 0.34]) : f.r(0.12, 0.92),
    isolationRadius: plan.figure === "void-cut" ? span(f, [2.4, 4.6]) : span(f, spec.isolation),
    approachWidth: span(f, spec.approach),
    coreExposure: plan.figure === "void-cut" ? span(f, [0.7, 0.95]) : span(f, spec.exposure),
    enclosureCollar: plan.figure === "void-cut" ? span(f, [0.9, 1.6]) : recipe.enclosureCollar,
    attractorFixed: true,
    attractorsOnly: true,
    attractor: { x: plan.cx, y: plan.cy },
  };
}

export function agentsFromContinuousHall(plan: ContinuousHallPlan, seed: number) {
  const rng = mulberry32(seed ^ 0x0a11ce);
  const [lo, hi] = SPECS[plan.growth].agents;
  return Math.round(lo + rng() * (hi - lo));
}

function trailBounds(snapshot: FieldSnapshot) {
  const trails = snapshot.trails;
  const n = trails.length;
  const size = snapshot.trailSize || Math.sqrt(n);
  let maxTrail = 0;
  for (let i = 0; i < n; i += 1) if (trails[i] > maxTrail) maxTrail = trails[i];
  const cut = maxTrail * 0.2;
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < n; i += 1) {
    if (trails[i] < cut) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    width,
    height,
    aspect: Math.max(width, height) / Math.max(1, Math.min(width, height)),
    coverage: (width * height) / Math.max(1, size * size),
  };
}

function attractorSpan(attractors: FieldAttractor[]) {
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
  const width = Math.max(0.4, maxX - minX);
  const height = Math.max(0.4, maxY - minY);
  return Math.max(width, height) / Math.min(width, height);
}

export function continuousHallIdentity(features: MorphFeatures, attractors: FieldAttractor[], snapshot?: FieldSnapshot): boolean {
  if (!attractors.length) return false;
  const holes = attractors.filter((item) => item.hole || item.kind === "ring");
  const disks = attractors.filter((item) => item.kind === "point" || item.kind === "ring");
  const linear = attractorSpan(attractors) >= 1.7;
  if (!linear) return false;
  if (features.occupied < 0.003 || features.occupied > 0.8) return false;
  if (holes.length) return true;
  if (disks.length >= 3) return features.components <= 8;
  if (!snapshot) return true;
  const box = trailBounds(snapshot);
  return box.aspect >= 1.7 && box.coverage < 0.72;
}

export function hallSignature(
  attractors: FieldAttractor[],
  extra?: { slime?: SlimeControls; agents?: number; growth?: HallGrowth; family?: HallFamily },
): number[] {
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  let sx = 0;
  let sy = 0;
  let holes = 0;
  let points = 0;
  let lines = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x, item.x2 ?? item.x);
    minY = Math.min(minY, item.y, item.y2 ?? item.y);
    maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
    maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
    sx += item.x;
    sy += item.y;
    if (item.hole || item.kind === "ring") holes += 1;
    if (item.kind === "point") points += 1;
    if (item.kind === "line" || item.kind === "curve") lines += 1;
  }
  const n = Math.max(1, attractors.length);
  const slime = extra?.slime;
  return [
    (maxX - minX) / FIELD_SIZE,
    (maxY - minY) / FIELD_SIZE,
    sx / n / FIELD_SIZE,
    sy / n / FIELD_SIZE,
    holes / 12,
    points / 16,
    lines / 6,
    extra?.family ? HALL_FAMILIES.indexOf(extra.family) / 20 : 0,
    extra?.growth ? HALL_GROWTHS.indexOf(extra.growth) / 20 : 0,
    extra?.agents ? extra.agents / 560 : 0,
    SPECS[extra?.growth ?? "hairline"].density === "white" ? 0 : SPECS[extra?.growth ?? "hairline"].density === "vein" ? 0.5 : 1,
    slime ? slime.deposit : 0,
    slime ? slime.depositWidth / 2.4 : 0,
    slime ? slime.persistence : 0,
    slime ? slime.sensorAngle / 0.7 : 0,
    slime ? slime.diffusion * 10 : 0,
  ];
}

export function isNovelHall(signature: number[], previous: number[][]): boolean {
  if (!previous.length) return true;
  return previous.every((item) => {
    let sum = 0;
    const len = Math.min(signature.length, item.length);
    for (let i = 0; i < len; i += 1) {
      const d = signature[i] - item[i];
      sum += d * d;
    }
    return Math.sqrt(sum / Math.max(1, len)) >= 0.22;
  });
}
