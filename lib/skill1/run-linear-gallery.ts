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

export type GalleryKind =
  | "enfilade"
  | "dogleg"
  | "alcove"
  | "switchback"
  | "meander"
  | "fork"
  | "bay"
  | "ladder"
  | "braid"
  | "islands"
  | "hook"
  | "fan"
  | "arcade"
  | "loop"
  | "broken"
  | "wrap";

export type GrowthKind = "filament" | "mass" | "sparse" | "bloom" | "sharp" | "heavy" | "wander" | "committed";

export const GALLERY_FAMILIES: GalleryKind[] = [
  "enfilade",
  "dogleg",
  "alcove",
  "switchback",
  "meander",
  "fork",
  "bay",
  "ladder",
  "braid",
  "islands",
  "hook",
  "fan",
  "arcade",
  "loop",
  "broken",
  "wrap",
];

export const GROWTH_MODES: GrowthKind[] = [
  "filament",
  "mass",
  "sparse",
  "bloom",
  "sharp",
  "heavy",
  "wander",
  "committed",
];

export type GalleryPlan = {
  kind: GalleryKind;
  growth: GrowthKind;
  index: number;
  scale: number;
  originX: number;
  originY: number;
  twist: number;
  flip: boolean;
};

type Station = { x: number; y: number };
function pt(x: number, y: number, radius: number, strength: number): FieldAttractor {
  return { kind: "point", x: lim(x), y: lim(y), radius, strength };
}

function cv(x: number, y: number, x2: number, y2: number, cx: number, cy: number, radius: number, strength: number, hole = false): FieldAttractor {
  return { kind: "curve", x: lim(x), y: lim(y), x2: lim(x2), y2: lim(y2), cx: lim(cx), cy: lim(cy), radius, strength, hole: hole || undefined };
}

type Pose = "center" | "upper" | "lower" | "diagonal" | "soft" | "strong" | "split" | "loop" | "offset" | "fragment";

function poseOf(kind: GalleryKind): Pose {
  if (kind === "enfilade" || kind === "arcade") return "center";
  if (kind === "alcove") return "upper";
  if (kind === "switchback") return "lower";
  if (kind === "dogleg") return "diagonal";
  if (kind === "meander" || kind === "wrap") return "soft";
  if (kind === "ladder" || kind === "fan") return "strong";
  if (kind === "fork" || kind === "braid") return "split";
  if (kind === "hook" || kind === "loop") return "loop";
  if (kind === "bay") return "offset";
  return "fragment";
}

const X0 = 1.45;
const X1 = 18.55;

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function cycleOf(plan: GalleryPlan) {
  return Math.floor(plan.index / GALLERY_FAMILIES.length);
}

function spineAt(pose: Pose, u: number, plan: GalleryPlan): Station {
  const flip = plan.flip ? -1 : 1;
  const cycle = cycleOf(plan);
  const x = X0 + u * (X1 - X0);
  const phase = ((plan.index + cycle * 2) % 7) * 0.06;
  const kind = plan.kind;

  if (kind === "switchback") {
    const top = 3.1 + (cycle % 3) * 0.7;
    const bottom = 16.7 - (cycle % 3) * 0.7;
    const knee = 0.38 + (cycle % 4) * 0.06;
    const drop = smoothstep((u - knee) / 0.14);
    const y = (flip > 0 ? top : bottom) + ((flip > 0 ? bottom : top) - (flip > 0 ? top : bottom)) * drop;
    const wave = Math.sin((u + phase) * Math.PI * 2) * (0.35 + (cycle % 2) * 0.25);
    return { x, y: lim(y + wave * flip) };
  }

  if (kind === "dogleg") {
    const knee = 0.28 + ((plan.index + cycle) % 5) * 0.09;
    const rise = (4.2 + (cycle % 3) * 1.6) * flip;
    const y = CENTER - rise * 0.45 + rise * smoothstep((u - knee) / 0.1);
    return { x, y: lim(y + Math.sin(u * Math.PI) * 0.35 * flip) };
  }

  if (kind === "hook") {
    const curl = smoothstep((u - (0.62 + (cycle % 3) * 0.06)) / 0.2);
    const y = CENTER + ((cycle % 3) - 1) * 1.4 + curl * (5.4 + (cycle % 2) * 1.2) * flip;
    return { x, y: lim(y + Math.sin(u * Math.PI) * 0.4 * flip) };
  }

  if (pose === "diagonal") {
    const steep = (plan.index + cycle) % 2 === 0;
    const y0 = flip > 0 ? (steep ? 17.1 : 13.6) : (steep ? 2.7 : 6.2);
    const y1 = flip > 0 ? (steep ? 2.7 : 6.2) : (steep ? 17.1 : 13.6);
    const bow = Math.sin((u + phase) * Math.PI) * (steep ? 1.7 : 0.4) * (cycle % 2 === 0 ? 1 : -1);
    return { x, y: lim(y0 + (y1 - y0) * u + bow) };
  }

  if (pose === "offset") {
    const rise = (3.6 + (cycle % 3) * 1.7) * flip;
    const knee = 0.22 + ((plan.index + cycle) % 5) * 0.1;
    const y = CENTER - rise * 0.5 + rise * smoothstep((u - knee) / 0.11);
    return { x, y: lim(y + Math.sin((u + phase) * Math.PI) * (0.25 + (cycle % 2) * 0.45) * flip) };
  }

  if (pose === "strong") {
    const amp = 4.8 + (cycle % 3) * 0.9;
    const y = kind === "fan"
      ? CENTER + Math.sin((u * 2 + phase) * Math.PI) * amp * 0.78 * flip
      : CENTER + (((cycle % 3) - 1) * 0.4) + Math.sin((u + phase) * Math.PI) * amp * flip;
    return { x, y: lim(y) };
  }

  if (pose === "soft") {
    const bends = kind === "wrap" ? 3 : 2;
    const amp = 1.6 + (cycle % 3) * 0.85;
    const drift = ((cycle % 2 === 0 ? u : 1 - u) - 0.5) * (1.2 + (plan.index % 3) * 0.6) * flip;
    return { x, y: lim(CENTER + drift + Math.sin((u * bends + phase) * Math.PI) * amp * flip) };
  }

  if (pose === "upper" || pose === "lower") {
    const slot = cycle % 3;
    const edge = pose === "upper" ? 2.7 + slot * 1.05 : 17.15 - slot * 1.05;
    const sag = u * (1.3 + slot * 1.1) * (pose === "upper" ? 1 : -1) * (((plan.index + cycle) % 2 === 0) ? 1 : 0.35);
    const amp = 1.05 + slot * 0.55;
    return { x, y: lim(edge + sag + Math.sin((u + phase) * Math.PI) * amp * flip) };
  }

  if (pose === "fragment") {
    const knee = 0.3 + (cycle % 4) * 0.08;
    const jog = smoothstep((u - knee) / 0.07) * (1.8 + (cycle % 3) * 1.1) * flip;
    const amp = kind === "broken" ? 0.55 : 1.35 + (cycle % 2) * 0.6;
    return { x, y: lim(CENTER + ((cycle % 3) - 1) * 1.2 + jog + Math.sin((u + phase) * Math.PI) * amp * flip) };
  }

  if (pose === "loop" || pose === "split") {
    const base = CENTER + ((cycle % 5) - 2) * 1.35;
    const amp = 0.35 + (cycle % 3) * 0.4;
    return { x, y: lim(base + Math.sin((u + phase) * Math.PI) * amp * flip) };
  }

  const mode = (plan.index + cycle) % 4;
  const amp = kind === "arcade" ? 1.5 + (cycle % 3) * 0.7 : mode === 0 ? 0.9 : mode === 1 ? 1.15 : mode === 2 ? 2.5 : 0.7;
  const jog = mode === 0 ? smoothstep((u - (0.42 + (cycle % 3) * 0.1)) / 0.14) * 2.4 * flip : 0;
  const base = CENTER + ((cycle % 5) - 2) * (kind === "enfilade" ? 1.7 : 0.45);
  return { x, y: lim(base + jog + Math.sin((u + phase) * Math.PI) * amp * flip) };
}

function spineRadius(u: number, swell: number, pattern: number) {
  const bell = Math.exp(-((u - swell) ** 2) * 12);
  const bell2 = Math.exp(-((u - Math.min(0.9, swell + 0.38)) ** 2) * 14);
  if (pattern === 1) return 1.05 - bell * 0.78;
  if (pattern === 2) return 0.2 + bell * 1.05 + bell2 * 0.55;
  if (pattern === 3) return 0.24 + (0.5 + 0.5 * Math.sin(u * Math.PI * 3)) * 0.55;
  return 0.18 + bell * 1.15;
}

function bowLink(a: Station, b: Station, radius: number, strength: number, bow: number): FieldAttractor {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return cv(a.x, a.y, b.x, b.y, (a.x + b.x) / 2 + (-dy / len) * bow, (a.y + b.y) / 2 + (dx / len) * bow, radius, strength);
}

function offsetStation(a: Station, b: Station, reach: number): Station {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: lim((a.x + b.x) / 2 + (-dy / len) * reach), y: lim((a.y + b.y) / 2 + (dx / len) * reach) };
}

/** One continuous spine from edge to edge. Nodes and branches stay attached to it. */
function progressionMarks(plan: GalleryPlan, f: Frame): FieldAttractor[] {
  const pose = poseOf(plan.kind);
  const flip = plan.flip ? -1 : 1;
  const cycle = cycleOf(plan);
  const swell = 0.16 + ((plan.index * 3 + cycle) % 8) * 0.08;
  const pattern = (plan.index + cycle) % 4;
  const calm = plan.kind === "switchback" || plan.kind === "dogleg" || plan.kind === "hook" || pose === "offset";
  const steps = pose === "soft" || plan.kind === "switchback" || pose === "strong" ? 12 : 8;
  const path = Array.from({ length: steps + 1 }, (_, step) => {
    const u = step === 0 || step === steps ? step / steps : step / steps + f.r(-0.01, 0.01);
    return spineAt(pose, Math.max(0, Math.min(1, u)), plan);
  });
  const marks: FieldAttractor[] = [];
  const necks = pose === "fragment" ? [0.28 + (cycle % 4) * 0.05, 0.62 + (plan.index % 3) * 0.06] : [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const u = (i + 0.5) / steps;
    let radius = spineRadius(u, swell, pattern);
    const bowAmp = calm ? 0.16 : pose === "soft" ? 0.85 : pose === "strong" ? 0.55 : 0.38;
    let bow = f.r(bowAmp * 0.35, bowAmp) * (i % 2 === 0 ? 1 : -1) * flip;
    if (necks.some((gap) => Math.abs(u - gap) < 0.05)) radius *= 0.34;
    marks.push(bowLink(path[i], path[i + 1], radius, 1.85, bow));
  }

  const nodeCount = 2 + ((plan.index + cycle) % 4);
  const used: number[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    let u = 0.1 + ((i * 5 + plan.index * 2 + cycle * 3) % 17) / 20;
    if (used.some((other) => Math.abs(other - u) < 0.14)) u = Math.min(0.9, u + 0.16);
    used.push(u);
    const at = spineAt(pose, u, plan);
    const grown = Math.abs(u - swell) < 0.1 || (pattern === 2 && Math.abs(u - Math.min(0.9, swell + 0.38)) < 0.08);
    marks.push(pt(at.x, at.y, grown ? f.r(0.9, 1.2) : f.r(0.56, 0.78), grown ? 0.62 : 0.42));
  }

  const branch = (fromU: number, toU: number, reach: number, radius: number, strength: number) => {
    const parts = 4;
    const side = Array.from({ length: parts + 1 }, (_, step) => {
      const t = step / parts;
      const u = fromU + (toU - fromU) * t;
      const on = spineAt(pose, u, plan);
      const ahead = spineAt(pose, Math.min(1, u + 0.04), plan);
      const lift = Math.sin(t * Math.PI) * reach;
      return offsetStation(on, ahead, lift);
    });
    side[0] = spineAt(pose, fromU, plan);
    side[side.length - 1] = spineAt(pose, toU, plan);
    for (let i = 0; i < side.length - 1; i += 1) {
      marks.push(bowLink(side[i], side[i + 1], radius, strength, f.r(0.2, 0.7) * flip));
    }
    const mid = side[Math.floor(side.length / 2)];
    marks.push(pt(mid.x, mid.y, f.r(0.55, 0.82), 0.45));
  };

  const spur = (anchor: number, reach: number) => {
    const on = spineAt(pose, anchor, plan);
    const ahead = spineAt(pose, Math.min(1, anchor + 0.05), plan);
    const sign = Math.abs(CENTER - on.y) > 2.2 ? Math.sign(CENTER - on.y) || flip : flip;
    const room = Math.max(1.4, Math.min(Math.abs(reach), Math.abs(CENTER - on.y) + 2.4));
    const tip = offsetStation(on, ahead, room * sign);
    marks.push(bowLink(on, tip, f.r(0.16, 0.28), 0.48, f.r(0.25, 0.7) * sign));
    marks.push(pt(tip.x, tip.y, f.r(0.5, 0.78), 0.4));
  };

  if (pose === "split") {
    const reach = (3.6 + (cycle % 3) * 1.15) * flip;
    const from = 0.16 + (cycle % 3) * 0.06;
    const to = plan.kind === "braid" ? 0.62 : 0.84;
    branch(from, to, reach, 0.42, 0.95);
    if (plan.kind === "braid") branch(0.4, 0.9, reach * -0.55, 0.28, 0.7);
  } else if (pose === "loop" && plan.kind !== "hook") {
    branch(0.18 + (cycle % 3) * 0.05, 0.72 + (plan.index % 3) * 0.05, (4.4 + (cycle % 3) * 0.9) * flip, 0.4, 0.9);
  } else if (plan.kind !== "switchback") {
    const spurs = (plan.index + cycle) % 4;
    if (spurs > 0) spur(0.18 + ((plan.index + cycle) % 5) * 0.08, 2.2 + (cycle % 3) * 0.9);
    if (spurs > 2) spur(0.55 + (cycle % 3) * 0.08, -(1.6 + (plan.index % 3) * 0.7));
  }
  return marks;
}

export function planLinearGallery(seed: number, attempt = 0, index = 0): GalleryPlan {
  const rng = mulberry32(seed ^ 0x44ac91 ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  const cycle = Math.floor(index / GALLERY_FAMILIES.length);
  const kind = GALLERY_FAMILIES[(index + attempt * 3) % GALLERY_FAMILIES.length];
  const growth = GROWTH_MODES[(index + attempt) % GROWTH_MODES.length];
  return {
    kind,
    growth,
    index,
    scale: 0.82 + (index % 4) * 0.06 + f.r(-0.02, 0.02),
    originX: lim(CENTER + ((cycle % 5) - 2) * 1.15),
    originY: lim(CENTER + (((index + cycle) % 5) - 2) * 0.95),
    twist: ((index % 7) - 3) * 0.16 + f.r(-0.04, 0.04),
    flip: (index + cycle) % 3 !== 1,
  };
}

export function attractorsFromLinearGallery(plan: GalleryPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x11f22ed ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x165667b1));
  return progressionMarks(plan, frame(rng));
}

export function slimeFromLinearGallery(base: SlimeControls, plan: GalleryPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index ^ plan.growth.length);
  const f = frame(rng);
  const byGrowth: Record<GrowthKind, Partial<SlimeControls>> = {
    filament: {
      persistence: f.r(0.72, 0.92),
      trailInfluence: f.r(1.1, 1.85),
      deposit: f.r(0.01, 0.045),
      depositWidth: f.r(0.22, 0.55),
      diffusion: f.r(0, 0.02),
      randomness: f.r(0.04, 0.22),
      trailCap: f.r(0.28, 0.7),
      sensorAngle: f.r(0.08, 0.28),
    },
    mass: {
      persistence: f.r(0.48, 0.74),
      trailInfluence: f.r(0.7, 1.3),
      deposit: f.r(0.04, 0.07),
      depositWidth: f.r(0.42, 0.6),
      diffusion: f.r(0.01, 0.03),
      randomness: f.r(0.08, 0.26),
      trailCap: f.r(0.7, 1.1),
      sensorAngle: f.r(0.18, 0.42),
    },
    sparse: {
      persistence: f.r(0.28, 0.55),
      trailInfluence: f.r(0.35, 0.85),
      deposit: f.r(0.015, 0.05),
      depositWidth: f.r(0.24, 0.42),
      diffusion: f.r(0, 0.03),
      randomness: f.r(0.35, 0.85),
      trailCap: f.r(0.3, 0.85),
      sensorAngle: f.r(0.28, 0.7),
    },
    bloom: {
      persistence: f.r(0.4, 0.66),
      trailInfluence: f.r(0.55, 1.15),
      deposit: f.r(0.03, 0.06),
      depositWidth: f.r(0.36, 0.55),
      diffusion: f.r(0.015, 0.035),
      randomness: f.r(0.14, 0.38),
      trailCap: f.r(0.55, 0.95),
      sensorAngle: f.r(0.24, 0.55),
    },
    sharp: {
      persistence: f.r(0.62, 0.88),
      trailInfluence: f.r(0.9, 1.7),
      deposit: f.r(0.02, 0.07),
      depositWidth: f.r(0.22, 0.48),
      diffusion: f.r(0, 0.015),
      randomness: f.r(0.03, 0.18),
      trailCap: f.r(0.35, 0.9),
      sensorAngle: f.r(0.08, 0.26),
    },
    heavy: {
      persistence: f.r(0.55, 0.82),
      trailInfluence: f.r(0.85, 1.5),
      deposit: f.r(0.045, 0.075),
      depositWidth: f.r(0.48, 0.62),
      diffusion: f.r(0.008, 0.028),
      randomness: f.r(0.05, 0.2),
      trailCap: f.r(0.75, 1.12),
      sensorAngle: f.r(0.14, 0.34),
    },
    wander: {
      persistence: f.r(0.22, 0.48),
      trailInfluence: f.r(0.28, 0.75),
      deposit: f.r(0.025, 0.06),
      depositWidth: f.r(0.3, 0.5),
      diffusion: f.r(0.01, 0.03),
      randomness: f.r(0.45, 0.95),
      trailCap: f.r(0.4, 1.1),
      sensorAngle: f.r(0.35, 0.85),
    },
    committed: {
      persistence: f.r(0.7, 0.92),
      trailInfluence: f.r(1.2, 1.9),
      deposit: f.r(0.03, 0.065),
      depositWidth: f.r(0.34, 0.55),
      diffusion: f.r(0, 0.03),
      randomness: f.r(0.02, 0.16),
      trailCap: f.r(0.5, 1.2),
      sensorAngle: f.r(0.08, 0.24),
    },
  };
  const carved = plan.kind === "loop" || plan.kind === "islands" || plan.growth === "mass" || plan.growth === "bloom" || plan.growth === "heavy";
  return {
    ...base,
    stepSize: f.r(0.18, 0.3),
    sensorDistance: f.r(0.35, 1.7),
    turnAngle: f.r(0.06, 0.7),
    decay: f.r(0.94, 0.994),
    resistance: f.r(0.02, 0.4),
    voidElongation: carved ? f.r(0.55, 1.85) : 1,
    voidRotation: carved ? f.r(0, Math.PI) : 0,
    voidLobes: carved ? f.r(0.16, 0.58) : 0,
    voidNotch: carved ? f.r(-0.42, 0.42) : 0,
    foodPoints: [{ x: plan.originX, y: plan.originY }],
    ...byGrowth[plan.growth],
    persistence: Math.max(byGrowth[plan.growth].persistence ?? 0.7, 0.7),
    randomness: Math.min(byGrowth[plan.growth].randomness ?? 0.2, 0.3),
    diffusion: Math.min(byGrowth[plan.growth].diffusion ?? 0.01, 0.02),
    depositWidth: 0.22 + ((plan.index * 5 + cycleOf(plan)) % 6) * 0.065,
  };
}

export function paramsFromLinearGallery(base: BiologicalParams, _seed: number): BiologicalParams {
  return base;
}

export function recipeFromLinearGallery(recipe: SpatialRecipe, seed: number): SpatialRecipe {
  const rng = mulberry32(seed ^ 0x11ec22);
  const f = frame(rng);
  return {
    ...recipe,
    clustering: f.r(0.12, 0.72),
    isolationRadius: f.r(2.0, 5.2),
    approachWidth: f.r(1.1, 3.6),
    coreExposure: f.r(0.28, 0.82),
  };
}

export function agentsFromLinearGallery(plan: GalleryPlan, seed: number) {
  const rng = mulberry32(seed ^ 0x11a22e ^ plan.index);
  const byGrowth: Record<GrowthKind, [number, number]> = {
    filament: [110, 170],
    mass: [180, 260],
    sparse: [90, 140],
    bloom: [150, 220],
    sharp: [120, 180],
    heavy: [190, 260],
    wander: [100, 170],
    committed: [140, 210],
  };
  const [min, max] = byGrowth[plan.growth];
  const count = Math.round(min + rng() * (max - min));
  return Math.round(count * 0.62);
}

function fieldProfile(snapshot: FieldSnapshot) {
  const trails = snapshot.trails;
  const ts = snapshot.trailSize;
  const scale = ts / FIELD_SIZE;
  let live = 0;
  let mass = 0;
  let minX = ts;
  let minY = ts;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < trails.length; i += 1) {
    if (trails[i] < 0.012) continue;
    live += 1;
    mass += trails[i];
    const px = i % ts;
    const py = Math.floor(i / ts);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < trails.length; i += 1) {
    if (trails[i] < 0.012) continue;
    const px = i % ts;
    const py = Math.floor(i / ts);
    sx += px;
    sy += py;
    sxx += px * px;
    syy += py * py;
    sxy += px * py;
  }
  let linearity = 0;
  if (live > 8) {
    const mx = sx / live;
    const my = sy / live;
    const cxx = sxx / live - mx * mx;
    const cyy = syy / live - my * my;
    const cxy = sxy / live - mx * my;
    const trace = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const root = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    const eigMajor = trace / 2 + root;
    const eigMinor = Math.max(0, trace / 2 - root);
    linearity = eigMajor > 1 ? 1 - eigMinor / eigMajor : 0;
  }
  const spanX = (maxX - minX) / scale;
  const spanY = (maxY - minY) / scale;
  const major = Math.max(spanX, spanY);
  const minor = Math.min(spanX, spanY);
  const horizontal = spanX >= spanY;
  const bins = 18;
  const sums = Array.from({ length: bins }, () => 0);
  const counts = Array.from({ length: bins }, () => 0);
  const lo = horizontal ? minX : minY;
  const hi = horizontal ? maxX : maxY;
  const width = Math.max(1, hi - lo);
  for (let i = 0; i < trails.length; i += 1) {
    const value = trails[i];
    if (value < 0.008) continue;
    const px = i % ts;
    const py = Math.floor(i / ts);
    const along = horizontal ? px : py;
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(((along - lo) / width) * bins)));
    sums[bin] += value;
    counts[bin] += 1;
  }
  const series = sums.map((sum, i) => sum / Math.max(1, counts[i]));
  const peaks: number[] = [];
  for (let i = 1; i < bins - 1; i += 1) {
    if (series[i] >= 0.016 && series[i] >= series[i - 1] && series[i] >= series[i + 1]) peaks.push(i);
  }
  const valleys: number[] = [];
  for (let i = 0; i < peaks.length - 1; i += 1) {
    let min = series[peaks[i]];
    for (let j = peaks[i] + 1; j < peaks[i + 1]; j += 1) min = Math.min(min, series[j]);
    valleys.push(min);
  }
  const peakMean = peaks.length ? peaks.reduce((sum, i) => sum + series[i], 0) / peaks.length : 0;
  const valleyMean = valleys.length ? valleys.reduce((sum, value) => sum + value, 0) / valleys.length : 0;
  return {
    occupied: live / Math.max(1, trails.length),
    trailSpan: major,
    spanX,
    spanY,
    anisotropy: major / Math.max(0.01, minor),
    fragments: peaks.length,
    contrast: valleyMean > 0 ? peakMean / valleyMean : peakMean > 0 ? 8 : 0,
    anchored: valleys.length > 0 && valleys.every((value) => value > 0.0035),
    meanTrail: live ? mass / live : 0,
    linearity,
  };
}

const STRUCT_TERMS = 21;

function galleryOccupancy(snapshot: FieldSnapshot, bins = 8): number[] {
  const trails = snapshot.trails;
  const ts = Math.max(1, snapshot.trailSize);
  const cells = new Float64Array(bins * bins);
  let peak = 0;
  for (let i = 0; i < trails.length; i += 1) peak = Math.max(peak, trails[i]);
  const cut = Math.max(0.02, peak * 0.2);
  for (let i = 0; i < trails.length; i += 1) {
    if (trails[i] < cut) continue;
    const px = i % ts;
    const py = Math.floor(i / ts);
    const bx = Math.min(bins - 1, (px / ts) * bins);
    const by = Math.min(bins - 1, (py / ts) * bins);
    cells[Math.floor(by) * bins + Math.floor(bx)] += trails[i];
  }
  let max = 0;
  for (let i = 0; i < cells.length; i += 1) max = Math.max(max, cells[i]);
  const scale = max > 0 ? 1 / max : 0;
  return Array.from(cells, (value) => value * scale);
}

function attractorIdentity(attractors: FieldAttractor[]) {
  const spines = attractors.filter((item) => item.kind === "line" || item.kind === "curve");
  const chambers = attractors.filter((item) => (item.kind === "point" || item.kind === "ring") && (item.radius ?? 0) >= 0.55);
  const voids = attractors.filter((item) => item.hole || item.kind === "ring");
  if (spines.length < 1) return false;
  if (chambers.length < 2) return false;
  if (chambers.length + voids.length < 3) return false;
  let minX = FIELD_SIZE;
  let maxX = 0;
  let minY = FIELD_SIZE;
  let maxY = 0;
  for (const item of spines) {
    minX = Math.min(minX, item.x, item.x2 ?? item.x);
    maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
    minY = Math.min(minY, item.y, item.y2 ?? item.y);
    maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
  }
  return Math.max(maxX - minX, maxY - minY) >= 14;
}

function journeyProfile(snapshot: FieldSnapshot) {
  const trails = snapshot.trails;
  const ts = Math.max(1, snapshot.trailSize);
  const columns = 36;
  const runs: number[] = [];
  let covered = 0;
  for (let col = 0; col < columns; col += 1) {
    const x0 = Math.floor((col / columns) * ts);
    const x1 = Math.max(x0 + 1, Math.floor(((col + 1) / columns) * ts));
    let inRun = false;
    let count = 0;
    let ink = false;
    for (let y = 0; y < ts; y += 1) {
      let hot = false;
      for (let x = x0; x < x1; x += 1) {
        if (trails[y * ts + x] >= 0.02) {
          hot = true;
          break;
        }
      }
      if (hot) ink = true;
      if (hot && !inRun) count += 1;
      inRun = hot;
    }
    if (ink) {
      covered += 1;
      runs.push(count);
    }
  }
  runs.sort((a, b) => a - b);
  const median = runs.length ? runs[Math.floor(runs.length / 2)] : 0;
  return { coverage: covered / columns, median };
}

export function linearGalleryIdentity(_features: unknown, attractors: FieldAttractor[], snapshot?: FieldSnapshot): boolean {
  if (!attractorIdentity(attractors)) return false;
  if (!snapshot) return true;
  const profile = fieldProfile(snapshot);
  if (profile.occupied < 0.012 || profile.occupied > 0.42) return false;
  if (profile.trailSpan < 12) return false;
  if (profile.spanX < 12) return false;
  const journey = journeyProfile(snapshot);
  if (journey.coverage < 0.72) return false;
  if (journey.median < 1 || journey.median > 3) return false;
  if (profile.meanTrail < 0.08 && profile.linearity < 0.45) return false;
  return true;
}

export function scoreLinearGallery(snapshot: FieldSnapshot, attractors: FieldAttractor[]): number {
  if (!attractorIdentity(attractors)) return 0;
  const profile = fieldProfile(snapshot);
  const voids = attractors.filter((item) => item.hole || item.kind === "ring").length;
  return (
    profile.trailSpan / FIELD_SIZE +
    Math.min(1.5, profile.fragments / 4) +
    Math.min(1.2, profile.contrast / 3) +
    (profile.anchored || voids ? 1.3 : 0.1) +
    (profile.anisotropy >= 1.12 ? 1 : 0.2) +
    Math.min(1.1, voids / 5)
  );
}

export function gallerySignature(
  attractors: FieldAttractor[],
  extra?: { slime?: SlimeControls; agents?: number; kind?: GalleryKind; growth?: GrowthKind; snapshot?: FieldSnapshot },
): number[] {
  const lines = attractors.filter((item) => item.kind === "line").length;
  const curves = attractors.filter((item) => item.kind === "curve").length;
  const points = attractors.filter((item) => item.kind === "point");
  const holes = attractors.filter((item) => item.hole || item.kind === "ring").length;
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  let radius = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x);
    maxY = Math.max(maxY, item.y);
  }
  for (const item of points) radius += item.radius ?? 0;
  const profile = extra?.snapshot ? fieldProfile(extra.snapshot) : null;
  const slime = extra?.slime;
  return [
    attractors.length / 28,
    lines / 12,
    curves / 8,
    points.length / 16,
    (maxX - minX) / FIELD_SIZE,
    (maxY - minY) / FIELD_SIZE,
    points.length ? radius / points.length / 2.8 : 0,
    extra?.kind ? GALLERY_FAMILIES.indexOf(extra.kind) / 18 : 0,
    extra?.growth ? GROWTH_MODES.indexOf(extra.growth) / 8 : 0,
    extra?.agents ? extra.agents / 280 : 0,
    slime ? slime.deposit : 0,
    slime ? slime.depositWidth / 3.2 : 0,
    slime ? slime.diffusion / 0.14 : 0,
    slime ? slime.randomness : 0,
    profile ? profile.occupied / 0.5 : 0,
    profile ? profile.spanX / FIELD_SIZE : 0,
    profile ? profile.spanY / FIELD_SIZE : 0,
    profile ? profile.fragments / 8 : 0,
    profile ? Math.min(1, profile.contrast / 5) : 0,
    profile ? Math.min(1, profile.meanTrail / 1.6) : 0,
    holes / 10,
    ...(profile && extra?.snapshot ? galleryOccupancy(extra.snapshot) : []),
  ];
}

function structDistance(a: number[], b: number[]) {
  let sum = 0;
  const len = Math.min(STRUCT_TERMS, a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, len));
}

function pictureDistance(a: number[], b: number[]) {
  if (a.length <= STRUCT_TERMS || b.length <= STRUCT_TERMS) return 1;
  const n = Math.min(a.length, b.length) - STRUCT_TERMS;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(a[STRUCT_TERMS + i] - b[STRUCT_TERMS + i]);
  return sum / Math.max(1, n);
}

export function isNovelGallery(signature: number[], previous: number[][]): boolean {
  if (!previous.length) return true;
  return previous.every((item) => {
    const distance = structDistance(signature, item);
    const picture = pictureDistance(signature, item);
    const occupied = signature[14] ?? 0;
    const otherOccupied = item[14] ?? 0;
    const spanX = signature[15] ?? 0;
    const otherSpanX = item[15] ?? 0;
    const spanY = signature[16] ?? 0;
    const otherSpanY = item[16] ?? 0;
    const mean = signature[19] ?? 0;
    const otherMean = item[19] ?? 0;
    const tealTwin = occupied > 0.28 && otherOccupied > 0.28 && Math.abs(occupied - otherOccupied) < 0.1;
    const massTwin = mean > 0.32 && otherMean > 0.32 && Math.abs(mean - otherMean) < 0.14 && Math.abs(occupied - otherOccupied) < 0.14;
    const smearTwin =
      occupied < 0.3 &&
      otherOccupied < 0.3 &&
      Math.abs(occupied - otherOccupied) < 0.05 &&
      Math.abs(spanX - otherSpanX) < 0.08 &&
      Math.abs(spanY - otherSpanY) < 0.08 &&
      Math.abs(mean - otherMean) < 0.1;
    return distance >= 0.34 && picture >= 0.08 && !tealTwin && !smearTwin && !massTwin;
  });
}

export function galleryDistance(a: number[], b: number[]) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, len));
}

export function pickMostNovelGallery(signatures: number[][], previous: number[][]) {
  if (!signatures.length) return 0;
  if (!previous.length) return 0;
  let best = 0;
  let bestMin = -1;
  for (let i = 0; i < signatures.length; i += 1) {
    let nearest = Infinity;
    for (const item of previous) nearest = Math.min(nearest, pictureDistance(signatures[i], item) + structDistance(signatures[i], item));
    if (nearest > bestMin) {
      bestMin = nearest;
      best = i;
    }
  }
  return best;
}
