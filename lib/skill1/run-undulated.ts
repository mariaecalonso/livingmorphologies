import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor } from "./types";

/**
 * Undulated workspace. A few spines only guide the flow. Inside each spine
 * the agents sense and deposit, so trails climb onto one another and the
 * pathway is wider than any one line. Diffusion stays off.
 */

const EDGE = 1.35;

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
type Pt = { x: number; y: number };
type Gesture = { turns: number; amp: number; sharp: boolean };

const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

function growthGesture(growth: UndulatedGrowth, struct: number): Gesture {
  const n = struct % 3;
  if (growth === "filament") return { turns: 5 + n, amp: 0.85, sharp: false };
  if (growth === "sharp") return { turns: 3 + n, amp: 1.15, sharp: true };
  if (growth === "sparse") return { turns: 2, amp: 0.95, sharp: false };
  if (growth === "committed") return { turns: 3 + (n % 2), amp: 0.8, sharp: false };
  return { turns: 6 + n, amp: 1.05, sharp: false };
}

function weightAmp(weight: UndulatedWeight) {
  if (weight === "hair") return 0.82;
  if (weight === "fine") return 0.94;
  if (weight === "bold") return 1.18;
  return 1;
}

function shift(plan: UndulatedPlan) {
  return { x: (plan.anchorX - 10) * 0.42, y: (plan.anchorY - 10) * 0.42 };
}

function advance(x: number, y: number, h: number, step: number) {
  let nx = x + Math.cos(h) * step;
  let ny = y + Math.sin(h) * step;
  let nh = h;
  if (nx < EDGE || nx > FIELD_SIZE - EDGE) {
    nh = Math.PI - nh;
    nx = x + Math.cos(nh) * step;
  }
  if (ny < EDGE || ny > FIELD_SIZE - EDGE) {
    nh = -nh;
    ny = y + Math.sin(nh) * step;
  }
  return { x: lim(nx), y: lim(ny), h: nh };
}

function meander(x: number, y: number, heading: number, length: number, gesture: Gesture, phase: number, steps = 26) {
  const pts: Pt[] = [{ x, y }];
  const step = length / steps;
  let h = heading;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const wave = Math.sin(phase + t * Math.PI * 2 * gesture.turns);
    const kick = gesture.sharp
      ? Math.sign(wave || 1) * (Math.abs(wave) > 0.5 ? 0.62 * gesture.amp : 0.08)
      : wave * gesture.amp * 0.46;
    h += kick;
    const next = advance(x, y, h, step);
    x = next.x;
    y = next.y;
    h = next.h;
    pts.push({ x, y });
  }
  return { pts, h, x, y };
}

function segments(points: Pt[]): Wall[] {
  const walls: Wall[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.18) continue;
    walls.push({ x: a.x, y: a.y, x2: b.x, y2: b.y });
  }
  return walls;
}

function waveCount(growth: UndulatedGrowth) {
  if (growth === "filament") return 3;
  return 2;
}

/** Two or three guides. The gap between them stays empty so each pathway can braid on its own. */
function waveField(plan: UndulatedPlan, gesture: Gesture, phase: number, heading: number, spread: number, count = waveCount(plan.growth)): Wall[] {
  const n = count;
  const slide = shift(plan);
  const walls: Wall[] = [];
  const gap = 5.2;
  for (let i = 0; i < n; i += 1) {
    const across = (i - (n - 1) / 2) * gap;
    const side = heading + Math.PI / 2;
    const ox = Math.cos(side) * across + slide.x * 0.3;
    const oy = Math.sin(side) * across + slide.y * 0.3;
    const h = heading + (i - (n - 1) / 2) * spread;
    const path = meander(lim(10 + ox - Math.cos(h) * 7.2), lim(10 + oy - Math.sin(h) * 7.2), h, 15.2, gesture, phase + i * 0.8, 26);
    walls.push(...segments(path.pts));
  }
  return walls;
}

function figure(plan: UndulatedPlan): Wall[] {
  const base = growthGesture(plan.growth, plan.struct);
  const gesture = { ...base, amp: base.amp * weightAmp(plan.weight) };
  const phase = plan.spine * 14 + plan.struct * 0.7;
  const sharp = { ...gesture, sharp: true, turns: Math.max(2, gesture.turns - 1) };

  if (plan.kind === "steps") return waveField(plan, gesture, phase, 0.04, 0.04);
  if (plan.kind === "bays") return waveField(plan, gesture, phase, 0.22, 0.14);
  if (plan.kind === "corridor") return waveField(plan, gesture, phase, 0.08, 0.02);
  if (plan.kind === "slots") return waveField(plan, gesture, phase, 0.15, 0.32);
  if (plan.kind === "court") return waveField(plan, gesture, phase + 1, 0.9, 0.18);
  if (plan.kind === "nested") return waveField(plan, gesture, phase + 2, 1.2, 0.1);
  if (plan.kind === "collective") return waveField(plan, gesture, phase, 0.4, 0.45);
  if (plan.kind === "lot") return waveField(plan, gesture, phase + 0.6, 1.7, 0.55);
  if (plan.kind === "jog") return waveField(plan, sharp, phase, 0.55, 0.16);
  if (plan.kind === "spine") return waveField(plan, gesture, phase, 0.02, 0.03);
  if (plan.kind === "cross") {
    return [
      ...waveField(plan, gesture, phase, 0.2, 0.05, 3),
      ...waveField(plan, gesture, phase + 1.6, 1.35, 0.05, 3),
    ];
  }
  return waveField(plan, sharp, phase, 0.35, 0.28);
}

export function planUndulated(seed: number, attempt = 0, index = 0): UndulatedPlan {
  const rng = mulberry32((seed ^ 0x5a17d ^ (attempt * 0x9e3779b9) ^ (index * 0x85ebca6b)) >>> 0);
  const id = ((index * 37 + 13) % 100 + 100) % 100;
  const growth = UNDULATED_GROWTH[index % UNDULATED_GROWTH.length];
  const span = FIELD_SIZE - EDGE * 2;
  return {
    growth,
    index,
    kind: UNDULATED_KINDS[id % UNDULATED_KINDS.length],
    struct: Math.floor(id / 12),
    weight: UNDULATED_WEIGHTS[index % UNDULATED_WEIGHTS.length],
    ink: UNDULATED_INKS[Math.floor(index / 4) % UNDULATED_INKS.length],
    angle: 0,
    anchorX: EDGE + span * (((index * 3) % 7) / 6),
    anchorY: EDGE + span * (((index * 5) % 7) / 6),
    spine: growth === "wander" ? 0.22 + rng() * 0.08 : 0.16 + rng() * 0.06,
  };
}

function drawn(plan: UndulatedPlan) {
  return figure(plan);
}

export function attractorsFromUndulated(plan: UndulatedPlan): FieldAttractor[] {
  return drawn(plan).map((wall) => ({
    kind: "line" as const,
    x: wall.x,
    y: wall.y,
    x2: wall.x2,
    y2: wall.y2,
    radius: 0.45,
    strength: 1,
  }));
}

/** Same hair as void field. Many faint deposits pile into a body. The guide only keeps that body undulating. */
export function tuneUndulatedSlime(slime: SlimeControls, plan: UndulatedPlan): SlimeControls {
  const rng = mulberry32((plan.index * 0x9e3779b9) >>> 0);
  const span = (min: number, max: number) => min + rng() * (max - min);
  const body = plan.weight === "bold" ? 0.018 : plan.weight === "hair" ? 0.014 : 0.016;
  return {
    ...slime,
    sensorAngle: span(0.42, 0.66),
    sensorDistance: span(0.4, 0.72),
    turnAngle: span(0.18, 0.36),
    stepSize: span(0.12, 0.16),
    deposit: body + rng() * 0.004,
    depositWidth: span(0.12, 0.16),
    diffusion: 0,
    decay: 0.998,
    trailInfluence: span(0.22, 0.36),
    resistance: 0,
    randomness: span(0.2, 0.32),
    persistence: span(0.3, 0.42),
    trailCap: span(0.32, 0.42),
    crowdingLimit: 5,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function undulatedAgentCount(plan: UndulatedPlan, _seed: number) {
  const guides = waveCount(plan.growth);
  return Math.min(150, 70 + guides * 24);
}
