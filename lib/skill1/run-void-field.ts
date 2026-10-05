/**
 * Void Field runs.
 * Visually Exposed Core · Isolated Anchor · Expansive Commons.
 * An open field spreads across the section. A distinct void sits in it.
 * The field stays loose and distributed. The void is what changes:
 * its shape, its size, where it sits, and how the network meets it.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import { voidRadius, type SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, SourceCorner, SpatialRecipe } from "./types";

const LO = 0.6;
const HI = FIELD_SIZE - 0.6;

export const VF_MODES = [
  "round",
  "round-large",
  "round-small",
  "offset",
  "edge",
  "corner",
  "elongated",
  "cut",
  "organic",
  "lobed",
  "split",
  "several",
  "anchors",
  "isolated",
  "aside",
  "toward",
  "approaches",
  "off-center",
  "partial",
  "around",
] as const;

export type VoidFieldMode = (typeof VF_MODES)[number];
export type VoidFieldGrowth = "mesh" | "vein" | "open" | "braid";
export const VF_GROWTHS: VoidFieldGrowth[] = ["mesh", "vein", "open", "braid"];

type Relate = "cloud" | "side" | "arms" | "apart" | "large";
type VoidDisk = { x: number; y: number; r: number };

export type VoidFieldPlan = {
  index: number;
  cycle: number;
  mode: VoidFieldMode;
  growth: VoidFieldGrowth;
  voids: VoidDisk[];
  elong: number;
  lobes: number;
  notch: number;
  rot: number;
  openAngle: number;
  gap: number;
  pad: number;
  pointTarget: number;
  relate: Relate;
  fieldX: number;
  fieldY: number;
  fieldR: number;
  arms: number[];
  sourceCorner: SourceCorner;
};

type Rng = () => number;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const span = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
const CIRCLE = { elong: 1, lobes: 0, notch: 0 };

const CORNERS: SourceCorner[] = ["bottom-left", "bottom-right"];

export function planVoidField(seed: number, _attempt = 0, index = 0): VoidFieldPlan {
  const cell = ((index % 100) + 100) % 100;
  const mode = VF_MODES[cell % VF_MODES.length];
  const cycle = Math.floor(cell / VF_MODES.length);
  const rng = mulberry32((seed ^ 0x601df1ed ^ (cell + 1) * 0x9e3779b1) >>> 0);
  const built = build(mode, rng);
  return {
    index: cell,
    cycle,
    mode,
    sourceCorner: CORNERS[(cell + seed) % CORNERS.length],
    ...built,
  };
}

function build(mode: VoidFieldMode, rng: Rng) {
  const openAngle = span(rng, 0, Math.PI * 2);
  if (mode === "round") {
    return pack(rng, openAngle, "open", {
      voids: [disk(rng, 7.5, 12.5, 7.5, 12.5, 2.2, 3.2)],
      ...CIRCLE,
      relate: "cloud",
      pad: 0.9,
      pointTarget: 40,
    });
  }
  if (mode === "round-large") {
    return pack(rng, openAngle, "open", {
      voids: [disk(rng, 8, 12, 8, 12, 3.4, 4.4)],
      ...CIRCLE,
      relate: "cloud",
      pad: 0.85,
      pointTarget: 42,
    });
  }
  if (mode === "round-small") {
    return pack(rng, openAngle, "vein", {
      voids: [disk(rng, 4, 16, 4, 16, 1.6, 2.4)],
      ...CIRCLE,
      relate: "large",
      pad: 1,
      pointTarget: 44,
    });
  }
  if (mode === "offset") {
    const left = rng() < 0.5;
    return pack(rng, openAngle, "braid", {
      voids: [disk(rng, left ? 3.2 : 13, left ? 6.5 : 16.5, 5, 15, 2.6, 4)],
      ...CIRCLE,
      relate: "large",
      pad: 0.35,
      pointTarget: 30,
    });
  }
  if (mode === "edge") {
    const at = edgePoint(rng, span(rng, 2.2, 3.4));
    return pack(rng, openAngle, "open", {
      voids: [{ ...at, r: span(rng, 2.2, 3.2) }],
      ...CIRCLE,
      relate: "large",
      pad: 0.85,
      pointTarget: 40,
    });
  }
  if (mode === "corner") {
    const at = cornerPoint(rng, span(rng, 2.6, 4.2));
    return pack(rng, openAngle, "vein", {
      voids: [{ ...at, r: span(rng, 2.2, 3.4) }],
      ...CIRCLE,
      relate: "apart",
      pad: 0.3,
      pointTarget: 24,
    });
  }
  if (mode === "elongated") {
    return pack(rng, openAngle, "braid", {
      voids: [disk(rng, 6, 14, 6, 14, 2.4, 3.4)],
      elong: span(rng, 2.05, 2.6),
      lobes: 0,
      notch: 0,
      relate: "cloud",
      pad: 0.3,
      pointTarget: 28,
    });
  }
  if (mode === "cut") {
    return pack(rng, openAngle, "open", {
      voids: [disk(rng, 8, 12, 8, 12, 4.2, 5.6)],
      elong: span(rng, 0.34, 0.46),
      lobes: 0,
      notch: 0,
      relate: "large",
      pad: 0.25,
      pointTarget: 30,
    });
  }
  if (mode === "organic") {
    return pack(rng, openAngle, "mesh", {
      voids: [disk(rng, 6.5, 13.5, 6.5, 13.5, 3, 4.4)],
      elong: span(rng, 1.05, 1.45),
      lobes: span(rng, 0.42, 0.7),
      notch: span(rng, 0.08, 0.28),
      relate: "cloud",
      pad: 0.3,
      pointTarget: 26,
    });
  }
  if (mode === "lobed") {
    return pack(rng, openAngle, "mesh", {
      voids: [disk(rng, 7, 13, 7, 13, 3.2, 4.6)],
      elong: span(rng, 0.9, 1.15),
      lobes: span(rng, 0.58, 0.82),
      notch: 0,
      relate: "cloud",
      pad: 0.3,
      pointTarget: 26,
    });
  }
  if (mode === "split") {
    return pack(rng, openAngle, "open", {
      voids: apart(rng, 2, 2.2, 3.4, 2.4),
      ...CIRCLE,
      relate: "large",
      pad: 0.3,
      pointTarget: 28,
    });
  }
  if (mode === "several") {
    return pack(rng, openAngle, "vein", {
      voids: apart(rng, 3, 1.7, 2.6, 2.6),
      ...CIRCLE,
      relate: "large",
      pad: 0.35,
      pointTarget: 26,
    });
  }
  if (mode === "anchors") {
    const main = disk(rng, 6, 14, 6, 14, 2.8, 4);
    const extras: VoidDisk[] = [];
    let guard = 0;
    while (extras.length < 2 && guard < 40) {
      guard += 1;
      const ang = span(rng, 0, Math.PI * 2);
      const dist = main.r + span(rng, 3.8, 6.5);
      const hole = {
        x: clamp(main.x + Math.cos(ang) * dist, 1.8, 18.2),
        y: clamp(main.y + Math.sin(ang) * dist, 1.8, 18.2),
        r: span(rng, 1.15, 1.75),
      };
      if (Math.hypot(hole.x - main.x, hole.y - main.y) < main.r + hole.r + 2) continue;
      if (extras.some((other) => Math.hypot(other.x - hole.x, other.y - hole.y) < other.r + hole.r + 1.6)) continue;
      extras.push(hole);
    }
    return pack(rng, openAngle, "braid", {
      voids: [main, ...extras],
      ...CIRCLE,
      relate: "large",
      pad: 0.35,
      pointTarget: 28,
    });
  }
  if (mode === "isolated") {
    const at = edgePoint(rng, span(rng, 2.2, 3.2));
    return pack(rng, 0, "vein", {
      voids: [{ ...at, r: span(rng, 1.7, 2.6) }],
      ...CIRCLE,
      relate: "apart",
      pad: 0.3,
      pointTarget: 30,
    });
  }
  if (mode === "aside") {
    const hole = disk(rng, 5, 15, 5, 15, 2.4, 3.6);
    return pack(rng, roomiest(hole.x, hole.y, rng), "open", {
      voids: [hole],
      ...CIRCLE,
      relate: "side",
      gap: span(rng, 1.35, 1.7),
      pad: 0.35,
      pointTarget: 26,
    });
  }
  if (mode === "toward") {
    const hole = disk(rng, 6, 14, 6, 14, 2.2, 3.4);
    return pack(rng, roomiest(hole.x, hole.y, rng), "vein", {
      voids: [hole],
      ...CIRCLE,
      relate: "side",
      gap: span(rng, 0.85, 1.15),
      pad: 0.3,
      pointTarget: 22,
    });
  }
  if (mode === "approaches") {
    return pack(rng, openAngle, "braid", {
      voids: [disk(rng, 7.5, 12.5, 7.5, 12.5, 2.4, 3.6)],
      ...CIRCLE,
      relate: "arms",
      armCount: 3,
      pad: 0.3,
      pointTarget: 28,
    });
  }
  if (mode === "off-center") {
    return pack(rng, openAngle, "open", {
      voids: [disk(rng, 2.8, 6.2, 3, 17, 1.8, 2.8)],
      ...CIRCLE,
      relate: "large",
      pad: 0.35,
      pointTarget: 32,
    });
  }
  if (mode === "partial") {
    const at = edgePoint(rng, span(rng, 1.3, 2.2));
    const inward = Math.atan2(FIELD_SIZE * 0.5 - at.y, FIELD_SIZE * 0.5 - at.x);
    return pack(rng, inward, "open", {
      voids: [{ ...at, r: span(rng, 3.2, 4.6) }],
      ...CIRCLE,
      relate: "side",
      gap: 1.05,
      pad: 0.25,
      pointTarget: 24,
    });
  }
  return pack(rng, openAngle, "vein", {
    voids: [disk(rng, 7, 13, 7, 13, 2.2, 3.2)],
    elong: span(rng, 1.1, 1.5),
    lobes: span(rng, 0.12, 0.28),
    notch: 0,
    relate: "arms",
    armCount: 2,
    pad: 0.35,
    pointTarget: 24,
  });
}

function roomiest(x: number, y: number, rng: Rng) {
  let best = 0;
  let bestA = 0;
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 + rng() * 0.15;
    const room = toEdge(x, y, angle);
    if (room > best) {
      best = room;
      bestA = angle;
    }
  }
  return bestA;
}

function edgePoint(rng: Rng, inset: number) {
  const along = span(rng, 5, 15);
  const side = Math.floor(rng() * 4);
  if (side === 0) return { x: inset, y: along };
  if (side === 1) return { x: FIELD_SIZE - inset, y: along };
  if (side === 2) return { x: along, y: inset };
  return { x: along, y: FIELD_SIZE - inset };
}

function cornerPoint(rng: Rng, inset: number) {
  const corner = Math.floor(rng() * 4);
  if (corner === 0) return { x: inset, y: inset };
  if (corner === 1) return { x: FIELD_SIZE - inset, y: inset };
  if (corner === 2) return { x: inset, y: FIELD_SIZE - inset };
  return { x: FIELD_SIZE - inset, y: FIELD_SIZE - inset };
}

function disk(rng: Rng, x0: number, x1: number, y0: number, y1: number, r0: number, r1: number): VoidDisk {
  return { x: span(rng, x0, x1), y: span(rng, y0, y1), r: span(rng, r0, r1) };
}

function apart(rng: Rng, count: number, r0: number, r1: number, gap: number): VoidDisk[] {
  const voids: VoidDisk[] = [];
  let guard = 0;
  while (voids.length < count && guard < 80) {
    guard += 1;
    const next = disk(rng, 2.5, 17.5, 2.5, 17.5, r0, r1);
    if (voids.every((hole) => Math.hypot(hole.x - next.x, hole.y - next.y) > hole.r + next.r + gap)) voids.push(next);
  }
  return voids.length ? voids : [disk(rng, 8, 12, 8, 12, r0, r1)];
}

function pack(
  rng: Rng,
  openAngle: number,
  growth: VoidFieldGrowth,
  spec: {
    voids: VoidDisk[];
    elong: number;
    lobes: number;
    notch: number;
    relate: Relate;
    pad: number;
    pointTarget: number;
    gap?: number;
    fieldR?: number;
    armCount?: number;
  },
) {
  const core = spec.voids[0];
  const rot = span(rng, 0, Math.PI);
  let fieldX = span(rng, 8.6, 11.4);
  let fieldY = span(rng, 8.6, 11.4);
  let fieldR = spec.fieldR ?? span(rng, 8.2, 9.3);
  const arms: number[] = [];
  if (core && spec.relate === "apart") {
    openAngle = roomiest(core.x, core.y, rng);
    fieldR = span(rng, 4.4, 6.2);
    const dist = core.r + fieldR + span(rng, 1.8, 3.1);
    fieldX = clamp(core.x + Math.cos(openAngle) * dist, 4.2, 15.8);
    fieldY = clamp(core.y + Math.sin(openAngle) * dist, 4.2, 15.8);
    const centerDist = Math.hypot(fieldX - core.x, fieldY - core.y);
    fieldR = Math.min(fieldR, Math.max(3.6, centerDist - core.r - 1.4));
  } else if (core && spec.relate === "side") {
    openAngle = roomiest(core.x, core.y, rng);
    fieldR = span(rng, 3.8, 5.4);
    const dist = core.r + fieldR * 0.62 + span(rng, 1.05, 1.7);
    fieldX = clamp(core.x + Math.cos(openAngle) * dist, 3.8, 16.2);
    fieldY = clamp(core.y + Math.sin(openAngle) * dist, 3.8, 16.2);
  } else if (core && spec.relate === "large") {
    fieldX = span(rng, 8.8, 11.2);
    fieldY = span(rng, 8.8, 11.2);
    fieldR = spec.fieldR ?? span(rng, 8.6, 9.5);
  } else if (spec.relate === "cloud") {
    fieldR = spec.fieldR ?? span(rng, 7.6, 9);
  } else if (spec.relate === "arms") {
    fieldR = span(rng, 2.7, 3.8);
    const count = spec.armCount ?? 3;
    let cursor = openAngle + span(rng, 0, 0.4);
    for (let i = 0; i < count; i += 1) {
      arms.push(cursor);
      cursor += span(rng, 1.7, 2.35);
    }
  }
  return {
    growth,
    voids: spec.voids,
    elong: spec.elong,
    lobes: spec.lobes,
    notch: spec.notch,
    rot,
    openAngle,
    gap: spec.gap ?? 0.55,
    pad: Math.max(spec.pad, spec.relate === "side" || spec.relate === "arms" ? 0.75 : 0.95),
    pointTarget: spec.pointTarget + (spec.relate === "cloud" || spec.relate === "large" ? 12 : 0) + Math.floor(rng() * 5),
    relate: spec.relate,
    fieldX,
    fieldY,
    fieldR,
    arms,
  };
}

function shapeOf(plan: VoidFieldPlan) {
  return {
    voidElongation: plan.elong,
    voidRotation: plan.rot,
    voidLobes: plan.lobes,
    voidNotch: plan.notch,
  };
}

function insideVoid(plan: VoidFieldPlan, x: number, y: number) {
  const shape = shapeOf(plan);
  for (const hole of plan.voids) {
    const angle = Math.atan2(y - hole.y, x - hole.x);
    const limit = voidRadius(angle, hole.r, shape);
    if (Math.hypot(x - hole.x, y - hole.y) < limit + plan.pad) return true;
  }
  return false;
}

function toEdge(x: number, y: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let t = 28;
  if (c > 0.02) t = Math.min(t, (HI - x) / c);
  if (c < -0.02) t = Math.min(t, (LO - x) / c);
  if (s > 0.02) t = Math.min(t, (HI - y) / s);
  if (s < -0.02) t = Math.min(t, (LO - y) / s);
  return Math.max(0.4, t);
}

function sampleOccupied(plan: VoidFieldPlan, rng: Rng) {
  const core = plan.voids[0];
  if (core && plan.relate === "arms") {
    const arms = plan.arms.length ? plan.arms : [plan.openAngle];
    const ang = arms[Math.floor(rng() * arms.length)] ?? plan.openAngle;
    const reach = core.r + plan.fieldR * 0.7 + 1.15;
    return blob(
      core.x + Math.cos(ang) * reach,
      core.y + Math.sin(ang) * reach,
      plan.fieldR,
      plan.rot + ang,
      rng,
    );
  }
  return blob(plan.fieldX, plan.fieldY, plan.fieldR, plan.rot, rng);
}

function blob(cx: number, cy: number, radius: number, rot: number, rng: Rng) {
  const ang = rng() * Math.PI * 2;
  const lump = 0.74 + 0.2 * Math.cos(ang * 3 + rot) + 0.12 * Math.cos(ang * 5 - rot);
  const dist = Math.sqrt(rng()) * radius * lump;
  return { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist };
}

function fieldPoints(plan: VoidFieldPlan, rng: Rng) {
  const points: { x: number; y: number }[] = [];
  const spacing = plan.relate === "arms" || plan.relate === "side" ? 1.45 : 1.55;
  let guard = 0;
  while (points.length < plan.pointTarget && guard < plan.pointTarget * 90) {
    guard += 1;
    const sample = sampleOccupied(plan, rng);
    if (sample.x < 1.2 || sample.y < 1.2 || sample.x > FIELD_SIZE - 1.2 || sample.y > FIELD_SIZE - 1.2) continue;
    if (insideVoid(plan, sample.x, sample.y)) continue;
    if (points.some((point) => Math.hypot(point.x - sample.x, point.y - sample.y) < spacing)) continue;
    points.push(sample);
  }
  return points;
}

export function attractorsFromVoidField(plan: VoidFieldPlan): FieldAttractor[] {
  const rng = mulberry32((0x51edf00d ^ (plan.index + 1) * 0x85ebca6b) >>> 0);
  const voids: FieldAttractor[] = plan.voids.map((hole) => ({
    kind: "ring" as const,
    x: hole.x,
    y: hole.y,
    radius: hole.r,
    strength: 0.02,
    hole: true,
  }));
  const points = fieldPoints(plan, rng).map((point) => ({
    kind: "point" as const,
    x: point.x,
    y: point.y,
      radius: 1.05,
    strength: 0.28 + rng() * 0.22,
  }));
  return [...voids, ...points];
}

export function slimeFromVoidField(base: SlimeControls, plan: VoidFieldPlan, seed: number): SlimeControls {
  const rng = mulberry32((seed ^ 0x601df1ed ^ plan.index) >>> 0);
  const growth: Record<VoidFieldGrowth, Partial<SlimeControls>> = {
    mesh: {
      persistence: 0.34,
      trailInfluence: 0.28,
      deposit: 0.016,
      depositWidth: 0.14,
      randomness: 0.26,
      trailCap: 0.36,
      sensorAngle: 0.55,
      stepSize: 0.14,
      crowdingLimit: 5,
    },
    vein: {
      persistence: 0.4,
      trailInfluence: 0.34,
      deposit: 0.017,
      depositWidth: 0.14,
      randomness: 0.2,
      trailCap: 0.38,
      sensorAngle: 0.4,
      stepSize: 0.14,
      crowdingLimit: 6,
    },
    open: {
      persistence: 0.3,
      trailInfluence: 0.24,
      deposit: 0.015,
      depositWidth: 0.13,
      randomness: 0.3,
      trailCap: 0.34,
      sensorAngle: 0.62,
      stepSize: 0.14,
      crowdingLimit: 5,
    },
    braid: {
      persistence: 0.36,
      trailInfluence: 0.3,
      deposit: 0.016,
      depositWidth: 0.14,
      randomness: 0.22,
      trailCap: 0.36,
      sensorAngle: 0.48,
      stepSize: 0.14,
      crowdingLimit: 5,
    },
  };
  return {
    ...base,
    ...growth[plan.growth],
    deposit: (growth[plan.growth].deposit ?? 0.03) + rng() * 0.006,
    diffusion: 0,
    decay: 0.998,
    resistance: 0,
    foodPoints: [],
    voidElongation: plan.elong,
    voidRotation: plan.rot,
    voidLobes: plan.lobes,
    voidNotch: plan.notch,
  };
}

export function paramsFromVoidField(base: BiologicalParams, plan: VoidFieldPlan): BiologicalParams {
  return {
    ...base,
    attractionStrength: 0.3,
    networkDensity: plan.growth === "vein" ? 0.28 : 0.16,
    permeability: 0.92,
    flowCoupling: 0.16,
    directionalBias: 0,
    geometryVariation: 0.05 + plan.lobes * 0.12,
    nodeSpacing: 0.92,
  };
}

export function recipeFromVoidField(recipe: SpatialRecipe, plan: VoidFieldPlan): SpatialRecipe {
  return {
    ...recipe,
    sourceCorner: plan.sourceCorner,
    clustering: 0.05,
    isolationRadius: 0.12,
    approachWidth: 2.4,
    coreExposure: 0.96,
    enclosureCollar: 0.16,
  };
}

export function agentsFromVoidField(plan: VoidFieldPlan, seed: number) {
  const rng = mulberry32((seed ^ 0x601d22 ^ plan.index) >>> 0);
  const byGrowth: Record<VoidFieldGrowth, [number, number]> = {
    mesh: [64, 84],
    vein: [58, 78],
    open: [70, 92],
    braid: [60, 80],
  };
  const [min, max] = byGrowth[plan.growth];
  return Math.round(Math.min(92, Math.max(MIN_AGENT_COUNT, min + rng() * (max - min))));
}
