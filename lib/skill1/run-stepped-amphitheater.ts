/**
 * Stepped Amphitheater · Enclosed Threshold · Incidental Threshold · Contained Commons.
 *
 * Hairs travel along curved steps. The steps stay apart, share one wave,
 * and meet in a thicker gathering. A high branch gene splits the upper
 * steps into two fans.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor, SteppedGrowthField } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const TWO_PI = Math.PI * 2;

export const SA_RUN_ITERATIONS = 220;
export const SA_TRAIL_SCALE = 16;
export const SA_STEP_BUDGET_MS = 18000;
export const SA_GENERATION = "growth-2";

export type SaField = SteppedGrowthField;

const wrap = (angle: number) => {
  let next = angle % TWO_PI;
  if (next < 0) next += TWO_PI;
  return next;
};

const delta = (to: number, from: number) => {
  let d = wrap(to) - wrap(from);
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
};

const mix = (from: number, to: number, t: number) => wrap(from + delta(to, from) * t);

function halton(index: number, base: number) {
  let f = 1;
  let r = 0;
  let n = index + 1;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

function sample(index: number, seed: number, attempt: number, base: number) {
  const jitter = mulberry32((seed ^ (index * 0x9e3779b9) ^ (attempt * 0x85ebca6b) ^ (base * 0x27d4eb2d)) >>> 0)();
  return Math.min(0.999, Math.max(0, halton(index, base) * 0.84 + jitter * 0.16));
}

export function planSteppedAmphitheater(seed: number, attempt = 0, index = 0): SaField {
  const h = (base: number) => sample(index, seed, attempt, base);
  const span0 = 4.4 + h(2) * 5.4;
  const pitch = 1.05 + h(3) * 1.25;
  const count = 3 + Math.floor(h(5) * 6);
  const gatherU = 1.15 + h(7) * 2.6;
  const gatherV = 1.05 + h(11) * 2.4;
  const curve = (h(13) - 0.48) * 2.4;
  const asymmetry = (h(17) - 0.5) * 1.35;
  const flare = (h(19) - 0.5) * 1.1;
  const entryV = -(1.7 + h(23) * 3.6);
  const entryU = (h(29) - 0.5) * span0 * 0.95;
  const axis = h(31) * TWO_PI;
  const phase = h(37) * TWO_PI;

  const locals: Array<[number, number]> = [
    [entryU, entryV],
    [0, 0],
    [-gatherU, gatherV * 0.5],
    [gatherU * (1 + Math.max(0, asymmetry)), gatherV],
    [0, gatherV + pitch * count],
    [-span0, gatherV + pitch * count * 0.45],
    [span0 * (1 + Math.max(0, asymmetry)), gatherV + pitch * count * 0.7],
  ];
  let minU = 99;
  let maxU = -99;
  let minV = 99;
  let maxV = -99;
  for (const [u, v] of locals) {
    const vLin = v - (curve * 0.42 * u * u) / Math.max(2.5, span0);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, vLin);
    maxV = Math.max(maxV, vLin);
  }
  const scale = 15.2 / Math.max(maxU - minU, maxV - minV, 1);
  const ox = (h(41) - 0.5) * 1.4;
  const oy = (h(43) - 0.5) * 1.4;
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  const c = Math.cos(axis);
  const s = Math.sin(axis);
  const ou = -cu * scale;
  const ov = -cv * scale;
  const gx = CENTER + ox - ou * s + ov * c;
  const gy = CENTER + oy + ou * c + ov * s;
  const entryLin = entryV - (curve * 0.42 * entryU * entryU) / Math.max(2.5, span0);
  const eu = entryU * scale;
  const ev = entryLin * scale;

  return {
    gx,
    gy,
    ex: gx - eu * s + ev * c,
    ey: gy + eu * c + ev * s,
    axis,
    curve,
    pitch: pitch * scale,
    count,
    span: span0 * scale,
    asymmetry,
    branch: h(47),
    branchAngle: 0.35 + h(53) * 1.35,
    gatherU: gatherU * scale,
    gatherV: gatherV * scale,
    throat: (0.42 + h(59) * 1.15) * scale,
    porosity: 0.12 + h(61) * 0.55,
    enclosure: h(67),
    phase,
    flare,
  };
}

/** Runs no longer paint stair marks. The field is carried on the recipe. */
export function attractorsFromSteppedAmphitheater(_plan: SaField): FieldAttractor[] {
  return [];
}

export function slimeFromSteppedAmphitheater(base: SlimeControls, plan: SaField, seed: number): SlimeControls {
  const rng = mulberry32((seed ^ 0x51c0de ^ Math.round(plan.phase * 1000)) >>> 0);
  const span = (min: number, max: number) => min + rng() * (max - min);
  return {
    ...base,
    sensorAngle: span(0.35, 0.7),
    sensorDistance: span(0.55, 0.95),
    turnAngle: span(0.28, 0.55),
    stepSize: span(0.16, 0.24),
    deposit: span(0.08, 0.12),
    depositWidth: span(1.5, 2.2),
    diffusion: 0,
    decay: span(0.99, 0.996),
    trailInfluence: span(1.35, 1.85),
    resistance: span(0.02, 0.07),
    randomness: span(0.04, 0.14),
    persistence: span(0.55, 0.78),
    trailCap: span(0.72, 0.95),
    crowdingLimit: 36,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function agentsFromSteppedAmphitheater(plan: SaField, seed: number) {
  const rng = mulberry32((seed ^ 0x5aa21 ^ Math.round(plan.span * 10)) >>> 0);
  const base = 168 + plan.count * 8 + Math.round(plan.branch * 24);
  return Math.round(Math.min(240, Math.max(MIN_AGENT_COUNT, base + rng() * 12)));
}

type Frame = {
  u: number;
  v: number;
  vLin: number;
  dvu: number;
  dvv: number;
  zone: "throat" | "commons" | "terrace" | "outside";
  limit: number;
};

function frameOf(x: number, y: number, field: SaField): Frame {
  const dx = x - field.gx;
  const dy = y - field.gy;
  const c = Math.cos(field.axis);
  const s = Math.sin(field.axis);
  const u = dx * -s + dy * c;
  const vLin = dx * c + dy * s;
  const span = Math.max(2.5, field.span);
  const dvu = (2 * field.curve * 0.42 * u) / span;
  const dvv = 1 + Math.cos(vLin * 0.85 + field.phase) * field.pitch * 0.22 * 0.85;
  const v = vLin + (field.curve * 0.42 * u * u) / span + Math.sin(vLin * 0.85 + field.phase) * field.pitch * 0.22;
  const rise = Math.max(0.2, (v - field.gatherV) / Math.max(0.4, field.pitch * field.count));
  const envelope = 0.58 + 0.42 * Math.sin(Math.min(1, Math.max(0, rise)) * Math.PI);
  const flare = 1 + field.flare * (Math.min(1, Math.max(0, rise)) - 0.35);
  const side = u >= 0 ? 1 + Math.max(0, field.asymmetry) : 1 - Math.max(0, field.asymmetry) * 0.62;
  const limit = field.span * envelope * flare * side;
  let zone: Frame["zone"] = "outside";
  if (v < field.gatherV * 0.15) zone = "throat";
  else if (v < field.gatherV && Math.abs(u) < field.gatherU * side) zone = "commons";
  else if (v < field.gatherV + field.pitch * field.count && Math.abs(u) < limit) zone = "terrace";
  return { u, v, vLin, dvu, dvv, zone, limit };
}

function pitchOf(field: SaField) {
  return Math.max(1.15, field.pitch);
}

function waveFreq(field: SaField) {
  return (Math.PI * 2 * (1.5 + Math.abs(field.curve) * 0.45)) / Math.max(4, field.span);
}

function waveAmp(field: SaField) {
  const raw = 0.28 + Math.abs(field.curve) * 0.22 + Math.abs(field.flare) * 0.16;
  return Math.min(raw, pitchOf(field) * 0.28);
}

function waveOf(u: number, field: SaField) {
  return Math.sin(u * waveFreq(field) + field.phase) * waveAmp(field);
}

function stepIndex(vLin: number, field: SaField) {
  const index = Math.round((vLin - field.gatherV) / pitchOf(field));
  return Math.max(0, Math.min(Math.max(1, field.count) - 1, index));
}

/** Level the hairs sit on, in the straight frame. One wavy curve per step. */
function seatLin(u: number, vLin: number, field: SaField) {
  return field.gatherV + stepIndex(vLin, field) * pitchOf(field) + waveOf(u, field);
}

function bandOf(vLin: number, field: SaField) {
  const gathering = vLin < field.gatherV + pitchOf(field) * 0.55;
  return pitchOf(field) * (gathering ? 0.46 : 0.3);
}

function reachOf(u: number, vLin: number, field: SaField) {
  const center = lobeU(u, vLin, field);
  const split = Math.abs(center) > 0.2;
  const half = split ? Math.max(1.15, field.span * 0.36) : Math.max(2.2, field.span * 0.72);
  return { center, half };
}

/** Upper steps split left and right when the branch gene is high. */
function lobeU(u: number, vLin: number, field: SaField) {
  const rise = (vLin - field.gatherV) / Math.max(0.4, pitchOf(field) * Math.max(1, field.count));
  if (field.branch < 0.45 || rise < 0.3) return 0;
  const sign = u === 0 ? (field.phase > Math.PI ? 1 : -1) : Math.sign(u);
  return sign * field.span * (0.16 + Math.min(1, rise) * 0.4) * field.branch;
}

function contourHeading(u: number, field: SaField) {
  const slope = waveAmp(field) * waveFreq(field) * Math.cos(u * waveFreq(field) + field.phase);
  const c = Math.cos(field.axis);
  const s = Math.sin(field.axis);
  return Math.atan2(c + slope * s, -s + slope * c);
}

function nudge(agent: { x: number; y: number }, u: number, v: number, field: SaField) {
  const c = Math.cos(field.axis);
  const s = Math.sin(field.axis);
  agent.x += -u * s + v * c;
  agent.y += u * c + v * s;
}

export function steerSteppedAmphitheater(
  agent: { x: number; y: number; heading: number },
  field: SaField,
  rng: () => number,
) {
  const frame = frameOf(agent.x, agent.y, field);
  const along = contourHeading(frame.u, field);
  const reach = reachOf(frame.u, frame.vLin, field);
  const past = frame.u - reach.center;
  const turning = Math.abs(past) > reach.half * 0.78;
  const forward = past > reach.half * 0.78 ? along + Math.PI : past < -reach.half * 0.78 ? along : closer(along, agent.heading);
  const wobble = Math.sin(frame.u * 0.31 + field.phase) * 0.08;
  agent.heading = mix(agent.heading, forward + wobble + (rng() - 0.5) * 0.06, turning ? 0.94 : 0.8);
}

function closer(along: number, heading: number) {
  return Math.abs(delta(along, heading)) <= Math.abs(delta(along + Math.PI, heading)) ? along : along + Math.PI;
}

export function containSteppedAmphitheater(agent: { x: number; y: number }, field: SaField) {
  const frame = frameOf(agent.x, agent.y, field);
  const targetV = seatLin(frame.u, frame.vLin, field);
  const errV = frame.vLin - targetV;
  const slack = bandOf(frame.vLin, field);
  if (Math.abs(errV) > slack) {
    nudge(agent, 0, -Math.sign(errV) * Math.min(Math.abs(errV) - slack * 0.25, 0.55) * 0.66, field);
  }
  const reach = reachOf(frame.u, frame.vLin, field);
  const errU = frame.u - reach.center;
  if (Math.abs(errU) > reach.half) {
    nudge(agent, -Math.sign(errU) * Math.min(Math.abs(errU) - reach.half, 0.4) * 0.35, 0, field);
  }
}

export function inkSteppedAmphitheater(agent: { x: number; y: number; heading: number }, field: SaField) {
  const frame = frameOf(agent.x, agent.y, field);
  const err = Math.abs(frame.vLin - seatLin(frame.u, frame.vLin, field));
  if (err > bandOf(frame.vLin, field)) return { amount: 0, width: 1 };
  const center = lobeU(frame.u, frame.vLin, field);
  const gap = Math.abs(center) * 0.38;
  if (gap > 0.4 && Math.abs(frame.u) < gap) return { amount: 0, width: 1 };
  const reach = reachOf(frame.u, frame.vLin, field);
  if (Math.abs(frame.u - reach.center) > reach.half * 0.7) return { amount: 0, width: 1 };
  return { amount: 0.04, width: 1 };
}

export function spawnOnSteppedAmphitheater(field: SaField, rng: () => number) {
  const roll = rng();
  const c = Math.cos(field.axis);
  const s = Math.sin(field.axis);
  const at = (u: number, v: number) => {
    const span = Math.max(2.5, field.span);
    const vLin = v - (field.curve * 0.42 * u * u) / span - Math.sin(v * 0.85 + field.phase) * field.pitch * 0.08;
    return {
      x: field.gx - u * s + vLin * c,
      y: field.gy + u * c + vLin * s,
    };
  };
  const count = Math.max(1, field.count);
  const index = Math.min(count - 1, Math.floor(roll * count));
  const pitch = pitchOf(field);
  let u = (rng() - 0.5) * field.span * (0.5 + rng() * 0.45);
  if (field.branch > 0.45 && index > count * 0.28) u = (rng() > 0.5 ? 1 : -1) * (0.22 + rng() * 0.38) * field.span;
  const v = field.gatherV + index * pitch + waveOf(u, field) + (rng() - 0.5) * 0.16;
  const p = at(u, v);
  const along = contourHeading(u, field);
  return { x: p.x, y: p.y, heading: along + (rng() > 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.25 };
}
