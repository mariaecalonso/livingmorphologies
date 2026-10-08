/**
 * Stepped Amphitheater · Enclosed Threshold · Incidental Threshold · Contained Commons.
 *
 * ENTRY → COMPRESSION → BRANCHING → TERRACING → GATHERING
 *
 * Nothing here is a stair drawing. Each iteration is a growth field: an entry,
 * a narrowing throat, a contained commons, and curved level-sets. Agents deposit
 * hair-thin trails. The steps are where those trails reinforce along the field.
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
  const base = 78 + Math.round(plan.branch * 18) + (plan.count % 4) * 4;
  return Math.round(Math.min(120, Math.max(MIN_AGENT_COUNT, base + rng() * 8)));
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

function tangentOf(frame: Frame, field: SaField) {
  const c = Math.cos(field.axis);
  const s = Math.sin(field.axis);
  const gx = frame.dvu * -s + frame.dvv * c;
  const gy = frame.dvu * c + frame.dvv * s;
  return Math.atan2(-gx, gy);
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
  const tangent = tangentOf(frame, field);
  const forward = Math.abs(delta(tangent, agent.heading)) <= Math.abs(delta(tangent + Math.PI, agent.heading))
    ? tangent
    : tangent + Math.PI;
  const inward = Math.atan2(field.gy - agent.y, field.gx - agent.x);
  let desired = forward;
  let weight = 0.56;

  if (frame.zone === "throat") {
    const mouth = Math.atan2(field.gy - field.ey, field.gx - field.ex);
    const braid = Math.sin(frame.u * 0.8 + field.phase) * (0.25 + field.branch * 0.6);
    desired = mouth + braid;
    weight = 0.62;
  } else if (frame.zone === "commons") {
    const release = Math.sin(frame.u * (0.5 + field.branch) + field.phase);
    desired = field.axis + release * field.branchAngle * 0.65;
    weight = 0.58;
  } else if (frame.zone === "outside") {
    const gap = Math.sin(frame.u * 1.37 + field.phase * 2) > 1.02 - field.porosity * 1.4;
    if (gap) {
      desired = agent.heading;
      weight = 0.1;
    } else {
      desired = mix(inward, forward, 0.45);
      weight = 0.28 + field.enclosure * 0.16;
    }
  } else {
    const fork = Math.sin(frame.u * (0.32 + field.branch * 0.7) + field.phase);
    const wobble = Math.sin(frame.v * 0.21 + field.phase * 1.3) * (0.2 + Math.abs(field.flare) * 0.55);
    const turn = fork > 0.28 ? field.branchAngle : fork < -0.28 ? -field.branchAngle * 0.75 : wobble;
    desired = forward + turn;
    weight = 0.48;
    if (Math.abs(frame.u) > frame.limit * 0.64) desired += -Math.sign(frame.u) * field.enclosure * 0.95;
  }

  agent.heading = mix(agent.heading, desired + (rng() - 0.5) * 0.12, weight);
}

export function containSteppedAmphitheater(agent: { x: number; y: number }, field: SaField) {
  const frame = frameOf(agent.x, agent.y, field);
  if (frame.zone === "throat") {
    const along = Math.max(0, Math.min(1, (field.gatherV * 0.15 - frame.v) / Math.max(0.4, -frame.v + field.gatherV)));
    nudge(agent, -frame.u * (0.018 + along * 0.03), 0, field);
    return;
  }
  const overU = Math.abs(frame.u) - frame.limit;
  const top = field.gatherV + field.pitch * field.count;
  const overV = frame.v - top;
  if (overU < 0.2 && overV < 0.2 && frame.v > -0.8) return;
  const gap = Math.sin(frame.u * 1.37 + field.phase * 2) > 1.02 - field.porosity * 1.4;
  if (gap && overU < 1.6 && overV < 1.6) return;
  const pull = 0.12 + field.enclosure * 0.16;
  if (overU > 0) nudge(agent, -Math.sign(frame.u) * Math.min(overU, 0.6) * pull, 0, field);
  if (overV > 0) nudge(agent, 0, -Math.min(overV, 0.6) * pull, field);
  if (frame.v < -1.2) nudge(agent, 0, Math.min(1.2, -frame.v) * pull * 0.45, field);
}

export function inkSteppedAmphitheater(agent: { x: number; y: number; heading: number }, field: SaField) {
  const frame = frameOf(agent.x, agent.y, field);
  const tangent = tangentOf(frame, field);
  const align = Math.abs(Math.cos(delta(tangent, agent.heading)));
  let amount = 0.035;
  let width = 1.65;
  if (frame.zone === "terrace") {
    amount = align > 0.55 ? 0.1 + align * 0.05 : 0.022;
    width = 1.45;
  } else if (frame.zone === "commons") {
    amount = 0.04;
    width = 1.4;
  } else if (frame.zone === "throat") {
    amount = 0.055;
    width = 1.35;
  } else {
    amount = 0.012;
    width = 1.3;
  }
  return { amount, width };
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
  if (roll < 0.58) {
    const p = at((rng() - 0.5) * field.throat * 1.6, -0.2 - rng() * 1.8);
    const mouth = Math.atan2(field.gy - p.y, field.gx - p.x);
    return { x: p.x, y: p.y, heading: mouth + (rng() - 0.5) * 0.9 };
  }
  if (roll < 0.82) {
    const p = at((rng() - 0.5) * field.gatherU * 1.6, rng() * field.gatherV);
    return { x: p.x, y: p.y, heading: field.axis + (rng() - 0.5) * 1.2 };
  }
  const p = at((rng() - 0.5) * field.span * 0.8, field.gatherV + rng() * field.pitch * field.count);
  return { x: p.x, y: p.y, heading: field.axis + (rng() - 0.5) * 1.6 };
}
