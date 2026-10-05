/**
 * Contained Room Within Volume.
 * Magnetic Enclosed Core · Isolated Attractor · Immersive Core.
 *
 * A dense Physarum field occupies the section. A large organic void is the
 * core. The network compresses and wraps around that void, and the rest of
 * the field stays full enough to read as the surrounding volume.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import { voidRadius, type SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, SpatialRecipe } from "./types";

export const CONTAINED_ROOM_ID = "contained-room-within-volume";
export const CONTAINED_RUN_ITERATIONS = 280;
export const CONTAINED_TRAIL_SCALE = 16;
export const CONTAINED_STEP_BUDGET_MS = 16000;

const TWO_PI = Math.PI * 2;
const LO = 0.65;
const HI = FIELD_SIZE - 0.65;

type Rng = () => number;
type Frame = { r: (min: number, max: number) => number };

function frame(rng: Rng): Frame {
  return { r: (min, max) => min + rng() * (max - min) };
}

export const CONTAINED_FAMILIES = [
  "centered",
  "offset",
  "edge",
  "elongated",
  "lobed",
  "wrapped",
  "branched",
  "partial",
  "enclosed",
  "satellites",
] as const;

export type ContainedRoomKind = (typeof CONTAINED_FAMILIES)[number];
export type ContainedRoomGrowth = "mesh" | "vein" | "braid" | "mass";
export const CONTAINED_GROWTHS: ContainedRoomGrowth[] = ["mesh", "vein", "braid", "mass"];

export type ContainedRoomPlan = {
  kind: ContainedRoomKind;
  growth: ContainedRoomGrowth;
  index: number;
  cycle: number;
  turn: number;
  driftX: number;
  driftY: number;
  roomU: number;
  roomV: number;
  openings: 0 | 1 | 2;
};

type Hole = { x: number; y: number; r: number };
type Shape = { voidElongation: number; voidRotation: number; voidLobes: number; voidNotch: number };

type Spec = {
  kind: ContainedRoomKind;
  v: number;
  cx: number;
  cy: number;
  rot: number;
  coreR: number;
  elong: number;
  lobes: number;
  notch: number;
  layers: number;
  mouth: number;
  mouthAt: number;
  gapped: number;
  wedges: number;
  fieldTarget: number;
  holes: Hole[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function specFor(index: number): Spec {
  const kind = CONTAINED_FAMILIES[index % CONTAINED_FAMILIES.length];
  const v = Math.floor(index / CONTAINED_FAMILIES.length);
  const rng = mulberry32((0xc0a1ed ^ (index + 1) * 0x9e3779b1) >>> 0);
  const rot = rng() * Math.PI;
  const angle = rot + v * 0.55;
  let cx = 10;
  let cy = 10;
  let coreR = 3.2;
  let elong = 1;
  let lobes = 0.08;
  let notch = 0.06;
  let layers = 2;
  let mouth = 0.35;
  let gapped = 1;
  let wedges = 0;
  if (kind === "centered") {
    cx = 8.6 + (v % 5) * 0.55;
    cy = 8.4 + ((v * 2) % 5) * 0.6;
    coreR = 2.9 + (v % 4) * 0.38;
  } else if (kind === "offset") {
    const dist = 3.2 + (v % 3) * 0.7;
    cx = clamp(10 + Math.cos(angle) * dist, 4.2, 15.8);
    cy = clamp(10 + Math.sin(angle) * dist, 4.2, 15.8);
    coreR = 2.7 + (v % 4) * 0.32;
    mouth = 0.7;
  } else if (kind === "edge") {
    const inset = 3.1 + (v % 3) * 0.45;
    const along = 6 + (v % 5) * 1.8;
    const side = v % 4;
    if (side === 0) {
      cx = inset;
      cy = along;
    } else if (side === 1) {
      cx = FIELD_SIZE - inset;
      cy = along;
    } else if (side === 2) {
      cx = along;
      cy = inset;
    } else {
      cx = along;
      cy = FIELD_SIZE - inset;
    }
    coreR = 2.5 + (v % 3) * 0.28;
    mouth = 0.2;
  } else if (kind === "elongated") {
    cx = 7.5 + (v % 4) * 1.3;
    cy = 7.2 + ((v * 3) % 4) * 1.4;
    coreR = 2.15 + (v % 3) * 0.25;
    elong = 2.05 + (v % 4) * 0.16;
    mouth = 0.45;
  } else if (kind === "lobed") {
    cx = 8 + (v % 4) * 1.1;
    cy = 8.2 + ((v * 2) % 4) * 1.05;
    coreR = 3.15 + (v % 3) * 0.35;
    elong = 0.95 + (v % 3) * 0.12;
    lobes = 0.55 + (v % 4) * 0.07;
    notch = 0.12;
    mouth = 0.4;
  } else if (kind === "wrapped") {
    cx = 7.4 + (v % 5) * 1.05;
    cy = 7.6 + ((v * 2) % 5) * 0.95;
    coreR = 2.7 + (v % 4) * 0.28;
    layers = 3;
    mouth = 0.22;
    gapped = 0;
  } else if (kind === "branched") {
    const dist = 2.4 + (v % 3) * 0.8;
    cx = clamp(10 + Math.cos(angle) * dist, 5, 15);
    cy = clamp(10 + Math.sin(angle) * dist, 5, 15);
    coreR = 2.55 + (v % 3) * 0.3;
    mouth = 1.15;
    wedges = 3;
    layers = 2;
  } else if (kind === "partial") {
    cx = 8.2 + (v % 4) * 1.15;
    cy = 8 + ((v * 3) % 4) * 1.2;
    coreR = 3.05 + (v % 3) * 0.35;
    mouth = 1.7 + (v % 3) * 0.28;
    gapped = 2;
    layers = 2;
  } else if (kind === "enclosed") {
    cx = 8.8 + (v % 4) * 0.7;
    cy = 8.6 + ((v * 2) % 4) * 0.75;
    coreR = 3.3 + (v % 3) * 0.4;
    layers = 3;
    mouth = 0.12;
    gapped = 0;
    lobes = 0.22;
  } else {
    cx = 8.4 + (v % 4) * 0.9;
    cy = 9 + ((v * 2) % 4) * 0.7;
    coreR = 2.7 + (v % 3) * 0.25;
    mouth = 0.55;
    layers = 2;
  }
  const holes: Hole[] = [{ x: cx, y: cy, r: coreR }];
  if (kind === "satellites") {
    for (let i = 0; i < 2; i += 1) {
      const ang = angle + i * 2.2 + 0.6;
      const dist = coreR + 4.2 + i * 0.8;
      holes.push({
        x: clamp(cx + Math.cos(ang) * dist, 2.2, 17.8),
        y: clamp(cy + Math.sin(ang) * dist, 2.2, 17.8),
        r: 1.25 + (i === 0 ? 0.25 : 0),
      });
    }
  }
  return {
    kind,
    v,
    cx,
    cy,
    rot,
    coreR,
    elong,
    lobes,
    notch,
    layers,
    mouth,
    mouthAt: angle + Math.PI,
    gapped,
    wedges,
    fieldTarget: 66 + (v % 3) * 4,
    holes,
  };
}

function shapeOf(spec: Spec): Shape {
  return {
    voidElongation: spec.elong,
    voidRotation: spec.rot,
    voidLobes: spec.lobes,
    voidNotch: spec.notch,
  };
}

function insideHole(spec: Spec, x: number, y: number, pad: number) {
  const shape = shapeOf(spec);
  for (const hole of spec.holes) {
    const angle = Math.atan2(y - hole.y, x - hole.x);
    if (Math.hypot(x - hole.x, y - hole.y) < voidRadius(angle, hole.r, shape) + pad) return true;
  }
  return false;
}

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function collar(spec: Spec, rng: Rng, hole: Hole, layers: number, gapped: number) {
  const shape = shapeOf(spec);
  const points: { x: number; y: number }[] = [];
  for (let layer = 0; layer < layers; layer += 1) {
    const pad = 0.42 + layer * 0.92;
    const count = Math.max(12, Math.round((hole.r + pad) * 2.55));
    for (let i = 0; i < count; i += 1) {
      const a = spec.rot + (i / count) * TWO_PI + (rng() - 0.5) * 0.16;
      if (layer < gapped && Math.abs(angDiff(a, spec.mouthAt)) < spec.mouth * 0.5) continue;
      const dist = voidRadius(a, hole.r, shape) + pad + (rng() - 0.5) * 0.22;
      const x = hole.x + Math.cos(a) * dist;
      const y = hole.y + Math.sin(a) * dist;
      if (x < LO || y < LO || x > HI || y > HI) continue;
      points.push({ x, y });
    }
  }
  return points;
}

function inWedge(spec: Spec, x: number, y: number) {
  if (!spec.wedges) return true;
  const angle = Math.atan2(y - spec.cy, x - spec.cx);
  for (let i = 0; i < spec.wedges; i += 1) {
    const at = spec.mouthAt + i * ((TWO_PI / spec.wedges));
    if (Math.abs(angDiff(angle, at)) < 0.42) return true;
  }
  return false;
}

function fieldPoints(spec: Spec, rng: Rng, existing: { x: number; y: number }[]) {
  const points = existing.slice();
  const step = 2.05;
  for (let y = 1.5; y <= 18.5; y += step) {
    for (let x = 1.5; x <= 18.5; x += step) {
      const px = x + (rng() - 0.5) * 0.7;
      const py = y + (rng() - 0.5) * 0.7;
      if (px < LO || py < LO || px > HI || py > HI) continue;
      if (insideHole(spec, px, py, 0.28)) continue;
      if (points.some((point) => Math.hypot(point.x - px, point.y - py) < 0.85)) continue;
      points.push({ x: px, y: py });
    }
  }
  let guard = 0;
  const extra = spec.wedges ? 18 : 14;
  let added = 0;
  while (added < extra && guard < 400) {
    guard += 1;
    const x = LO + rng() * (HI - LO);
    const y = LO + rng() * (HI - LO);
    if (insideHole(spec, x, y, 0.3)) continue;
    const near = Math.hypot(x - spec.cx, y - spec.cy) < spec.coreR + 2.6;
    if (spec.wedges) {
      if (!inWedge(spec, x, y) && !near) continue;
    } else if (!near && rng() > 0.35) continue;
    if (points.some((point) => Math.hypot(point.x - x, point.y - y) < 0.9)) continue;
    points.push({ x, y });
    added += 1;
  }
  return points;
}

function build(index: number) {
  const spec = specFor(index);
  const rng = mulberry32((0x51ed ^ (index + 3) * 0x85ebca6b) >>> 0);
  const shell = collar(spec, rng, spec.holes[0], spec.layers, spec.gapped);
  for (const hole of spec.holes.slice(1)) shell.push(...collar(spec, rng, hole, 1, 0));
  const points = fieldPoints(spec, rng, shell);
  return { spec, points };
}

export function planContainedRoom(seed: number, attempt = 0, index = 0): ContainedRoomPlan {
  const spec = specFor(index);
  const rng = mulberry32(seed ^ 0xc0a1ed ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  return {
    kind: spec.kind,
    growth: CONTAINED_GROWTHS[(spec.v + attempt) % CONTAINED_GROWTHS.length],
    index,
    cycle: spec.v,
    turn: spec.rot,
    driftX: f.r(-0.04, 0.04),
    driftY: f.r(-0.04, 0.04),
    roomU: spec.cx,
    roomV: spec.cy,
    openings: spec.mouth > 1.2 ? 2 : spec.mouth > 0.4 ? 1 : 0,
  };
}

export function attractorsFromContainedRoom(plan: ContainedRoomPlan): FieldAttractor[] {
  const { spec, points } = build(plan.index);
  const rings: FieldAttractor[] = spec.holes.map((hole) => ({
    kind: "ring" as const,
    x: hole.x,
    y: hole.y,
    radius: hole.r,
    strength: 0.04,
    hole: true,
  }));
  const marks: FieldAttractor[] = points.map((point) => ({
    kind: "point" as const,
    x: point.x,
    y: point.y,
    radius: 2.15,
    strength: Math.hypot(point.x - spec.cx, point.y - spec.cy) < spec.coreR + 2.2 ? 0.55 : 0.34,
  }));
  return [...rings, ...marks];
}

const GROWTH_SLIME: Record<ContainedRoomGrowth, Partial<SlimeControls>> = {
  mesh: { persistence: 0.62, trailInfluence: 1.05, deposit: 0.04, randomness: 0.08, sensorAngle: 0.2, stepSize: 0.16, crowdingLimit: 12 },
  vein: { persistence: 0.82, trailInfluence: 1.25, deposit: 0.044, randomness: 0.045, sensorAngle: 0.08, stepSize: 0.16, crowdingLimit: 16 },
  braid: { persistence: 0.72, trailInfluence: 1.15, deposit: 0.042, randomness: 0.06, sensorAngle: 0.12, stepSize: 0.16, crowdingLimit: 14 },
  mass: { persistence: 0.58, trailInfluence: 0.95, deposit: 0.048, randomness: 0.1, sensorAngle: 0.24, stepSize: 0.15, crowdingLimit: 10 },
};

export function slimeFromContainedRoom(base: SlimeControls, plan: ContainedRoomPlan, seed: number): SlimeControls {
  const spec = specFor(plan.index);
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index);
  const growth = GROWTH_SLIME[plan.growth];
  return {
    ...base,
    ...growth,
    deposit: (growth.deposit ?? 0.04) + rng() * 0.006,
    depositWidth: 0.22,
    diffusion: 0,
    decay: 0.993,
    trailCap: 0.72,
    resistance: 0,
    foodPoints: [],
    voidElongation: spec.elong,
    voidRotation: spec.rot,
    voidLobes: spec.lobes,
    voidNotch: spec.notch,
  };
}

export function paramsFromContainedRoom(base: BiologicalParams, seed: number): BiologicalParams {
  const rng = mulberry32(seed ^ 0xc0a1aa);
  return {
    ...base,
    attractionStrength: 0.72 + rng() * 0.2,
    networkDensity: 0.34,
    permeability: 0.9,
    directionalBias: 0.1 + rng() * 0.08,
    geometryVariation: 0.08 + rng() * 0.06,
    nodeSpacing: 0.9,
    randomness: 0.05,
    flowCoupling: 0.2,
  };
}

export function recipeFromContainedRoom(recipe: SpatialRecipe, plan: ContainedRoomPlan): SpatialRecipe {
  const spec = specFor(plan.index);
  return {
    ...recipe,
    clustering: 0.72,
    isolationRadius: spec.coreR,
    approachWidth: spec.wedges ? 1.8 : 1.2,
    coreExposure: spec.mouth > 1.2 ? 0.55 : 0.22,
    enclosureCollar: spec.coreR + 2.4,
  };
}

export function agentsFromContainedRoom(plan: ContainedRoomPlan, seed: number) {
  const rng = mulberry32(seed ^ 0xc0aa22 ^ plan.index);
  const byGrowth: Record<ContainedRoomGrowth, [number, number]> = {
    mesh: [150, 180],
    vein: [140, 170],
    braid: [155, 185],
    mass: [165, 190],
  };
  const [min, max] = byGrowth[plan.growth];
  return Math.round(Math.min(190, Math.max(MIN_AGENT_COUNT, min + rng() * (max - min))));
}
