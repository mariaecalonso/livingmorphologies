import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor } from "./types";

/**
 * Inserted Horizontal Plate — Modular Nodes, Visually Disturbed Nodes,
 * Distributed Retreat.
 *
 * An open field holds two to six horizontal plate-zones. Each plate is a
 * Physarum network — a wavy spine, a vein that splits and returns, and short
 * forks — so it reads as a horizontal element without becoming a painted bar.
 * Narrow paths connect the plates or reach into the empty field. Organizations
 * change the relationship: dominant, scattered, staggered, cascading,
 * one-sided, clustered, broken, or overlapping. Ink matches the other
 * hair-thin archetypes. Diffusion stays off.
 */

export const IHP_TRAIL_SCALE = 24;
export const IHP_RUN_ITERATIONS = 96;
export const IHP_STEP_BUDGET_MS = 18000;

const EDGE = 1.4;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

const ORGS = ["dominant", "distributed", "stagger", "cascade", "retreat", "cluster", "fragment", "overlap"] as const;
type Org = (typeof ORGS)[number];

export type InsertedPlatePlan = {
  index: number;
  seed: number;
};

type Line = { x: number; y: number; x2: number; y2: number };
type Pt = { x: number; y: number };
type Band = { x0: number; x1: number; y: number; thick: number; tilt: number; wave: number };

const LENGTHS = [12.2, 4.4, 8.1, 3.6, 6.4, 9.6, 5.1];

function seg(lines: Line[], a: Pt, b: Pt) {
  const ax = lim(a.x);
  const ay = lim(a.y);
  const bx = lim(b.x);
  const by = lim(b.y);
  if (Math.hypot(bx - ax, by - ay) < 0.38) return;
  lines.push({ x: ax, y: ay, x2: bx, y2: by });
}

function stroke(lines: Line[], points: Pt[]) {
  for (let i = 1; i < points.length; i += 1) {
    if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) > 3.4) continue;
    seg(lines, points[i - 1], points[i]);
  }
}

function chaikin(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(points[points.length - 1]);
  return out;
}

function resample(points: Pt[], spacing: number): Pt[] {
  if (points.length < 2) return points;
  const out: Pt[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    let ax = points[i - 1].x;
    let ay = points[i - 1].y;
    const bx = points[i].x;
    const by = points[i].y;
    let left = Math.hypot(bx - ax, by - ay);
    while (left > 0.001 && carry + left >= spacing) {
      const need = spacing - carry;
      const t = need / left;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      out.push({ x: ax, y: ay });
      left -= need;
      carry = 0;
    }
    carry += left;
  }
  const last = points[points.length - 1];
  const end = out[out.length - 1];
  if (Math.hypot(last.x - end.x, last.y - end.y) > spacing * 0.45) out.push(last);
  return out;
}

function soften(points: Pt[]): Pt[] {
  return resample(chaikin(points), 1.15);
}

function bandAt(x0: number, length: number, y: number, thick: number, tilt: number, wave: number): Band {
  const span = Math.max(2.8, length);
  return { x0: lim(x0), x1: lim(x0 + span), y: lim(y), thick, tilt, wave };
}

function drawBand(lines: Line[], band: Band, rng: () => number) {
  const len = Math.max(2.6, band.x1 - band.x0);
  const cx = (band.x0 + band.x1) / 2;
  const rows = Math.max(12, Math.round(band.thick / 0.08));
  const c = Math.cos(band.tilt);
  const s = Math.sin(band.tilt);
  for (let row = 0; row < rows; row += 1) {
    const edge = row < 2 || row > rows - 3;
    const localY = (row / (rows - 1) - 0.5) * band.thick;
    const trimL = len * (edge ? 0.02 + rng() * 0.14 : rng() * 0.04);
    const trimR = len * (edge ? 0.03 + rng() * 0.16 : rng() * 0.05);
    const points: Pt[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const lx = -len / 2 + trimL + (len - trimL - trimR) * t;
      const amp = edge ? 0.18 : 0.035;
      const wave = Math.sin(t * Math.PI * (1.15 + (row % 3) * 0.35) + band.wave + row * 0.4) * amp;
      const ly = localY + wave;
      points.push({ x: cx + lx * c - ly * s, y: band.y + lx * s + ly * c });
    }
    stroke(lines, resample(chaikin(points), 2.15));
  }
}

function vein(lines: Line[], a: Pt, b: Pt, bend: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const mid = { x: (a.x + b.x) / 2 + (-dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
  const points: Pt[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const t = i / 4;
    const u = 1 - t;
    points.push({
      x: u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
    });
  }
  stroke(lines, soften(points));
}

function lengthsFor(count: number, turn: number) {
  return Array.from({ length: count }, (_, i) => LENGTHS[(i + turn) % LENGTHS.length]);
}

function spreadY(bands: Band[]) {
  const ordered = [...bands].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ordered.length; i += 1) {
    const need = (ordered[i - 1].thick + ordered[i].thick) / 2 + 1.25;
    if (Math.abs(ordered[i].y - ordered[i - 1].y) < need && Math.abs(ordered[i].y - ordered[i - 1].y) > 0.35) {
      ordered[i] = { ...ordered[i], y: ordered[i - 1].y + need };
    }
  }
  const overflow = ordered.length ? ordered[ordered.length - 1].y - (FIELD_SIZE - 2.2) : 0;
  if (overflow > 0.2) {
    for (let i = 0; i < ordered.length; i += 1) ordered[i] = { ...ordered[i], y: lim(ordered[i].y - overflow) };
  }
  return ordered;
}

function compose(index: number): { org: Org; bands: Band[]; open: "left" | "right" | "below" | "above" } {
  const org = ORGS[index % ORGS.length];
  const variant = Math.floor(index / ORGS.length);
  const flip = variant % 2 === 1;
  const count = org === "fragment" ? 2 + (variant % 2) : 2 + ((variant * 3 + 1) % 5);
  const lens = lengthsFor(Math.max(count, 4), variant + index);
  const thick = 1.35 + (variant % 3) * 0.12;
  const tiltFor = (i: number) => (variant % 3 === 1 && i === count - 1 ? 0.1 * (flip ? -1 : 1) : i === 1 && variant % 4 === 0 ? 0.07 : 0);
  const bands: Band[] = [];
  const xLeft = 2.1;
  const xRight = 17.6;

  if (org === "dominant") {
    const yLong = 5.2 + (variant % 3) * 3.4;
    const long = lens[0] > 8 ? lens[0] : 11.4;
    const xLong = flip ? xRight - long : xLeft + (variant % 2) * 0.6;
    bands.push(bandAt(xLong, long, yLong, thick + 0.25, 0, variant));
    for (let i = 1; i < count; i += 1) {
      const length = Math.min(6.2, lens[i]);
      const x = flip ? xLeft + (i % 2) * 1.4 : xRight - length - (i % 2) * 1.2;
      const y = yLong + (i % 2 === 0 ? -1 : 1) * (2.3 + i * 1.15);
      bands.push(bandAt(x, length, y, thick, tiltFor(i), variant + i));
    }
    return { org, bands: spreadY(bands), open: flip ? "right" : "left" };
  }

  if (org === "distributed") {
    const slots = [
      [2.2, 4.4],
      [10.5, 7.6],
      [3.4, 11.2],
      [11.2, 14.4],
      [6.2, 16.6],
    ];
    for (let i = 0; i < count; i += 1) {
      const slot = slots[(i + variant) % slots.length];
      const length = lens[(i * 2 + variant) % lens.length] * 0.72;
      const x = flip ? xRight - (slot[0] - 2) - length : slot[0];
      bands.push(bandAt(x, length, slot[1] + (variant % 3) * 0.35, thick, tiltFor(i), i + variant));
    }
    return { org, bands: spreadY(bands), open: variant % 2 === 0 ? "above" : "below" };
  }

  if (org === "stagger") {
    const gaps = [2.5, 3.6, 2.2, 4.1, 2.9];
    let y = 3.6 + (variant % 3) * 0.4;
    for (let i = 0; i < count; i += 1) {
      const length = lens[i] * (i % 2 === 0 ? 0.78 : 0.55);
      const dockRight = i % 2 === (flip ? 0 : 1);
      const x = dockRight ? xRight - length : xLeft;
      bands.push(bandAt(x, length, y, thick, tiltFor(i), variant + i * 1.3));
      y += gaps[(i + variant) % gaps.length] + thick;
    }
    return { org, bands, open: flip ? "left" : "right" };
  }

  if (org === "cascade") {
    let y = 3.8;
    let x = flip ? 9.5 : 2;
    for (let i = 0; i < count; i += 1) {
      const length = 8.8 - i * 0.85 + (variant % 3) * 0.4;
      const at = flip ? x - i * 1.35 : x + i * 1.45;
      bands.push(bandAt(at, Math.max(3.2, length), y, thick * (i === 0 ? 1.15 : 0.92), i === count - 1 ? tiltFor(i) : 0, variant + i));
      y += 2.15 + (i % 2) * 0.85 + thick * 0.35;
    }
    return { org, bands, open: flip ? "left" : "right" };
  }

  if (org === "retreat") {
    const side = flip ? xRight : xLeft;
    let y = 3.8 + (variant % 4) * 0.55;
    for (let i = 0; i < count; i += 1) {
      const length = Math.min(8.4, 3.8 + lens[i] * 0.42);
      const x = flip ? side - length - (i % 2) * 0.8 : side + (i % 3) * 0.7;
      bands.push(bandAt(x, length, y, thick, tiltFor(i), variant * 0.4 + i));
      y += 2.1 + (i % 2) * 1.15;
    }
    return { org, bands, open: flip ? "left" : "right" };
  }

  if (org === "cluster") {
    const window = variant % 3 === 0 ? 3.6 : variant % 3 === 1 ? 7.2 : 11.4;
    for (let i = 0; i < count; i += 1) {
      const length = lens[i] * (i === variant % count ? 0.95 : 0.58);
      const x = (flip ? 8.2 : 2.4) + (i % 2) * 1.6;
      bands.push(bandAt(x, length, window + i * (1.55 + thick * 0.15), thick, tiltFor(i), i + 0.6));
    }
    return { org, bands, open: variant % 3 === 0 ? "below" : "above" };
  }

  if (org === "fragment") {
    const levels = 2 + (variant % 2);
    for (let level = 0; level < levels; level += 1) {
      const y = 4.2 + level * (3.4 + (variant % 3) * 0.45);
      const leftW = 3.4 + (variant % 3) * 1.1 + level * 0.4;
      const rightW = 5.2 - level * 0.7 + (variant % 2) * 1.3;
      const gap = 1.4 + ((level + variant) % 3) * 0.9;
      const leftX = flip ? 3.2 + level * 0.5 : 2.2;
      bands.push(bandAt(leftX, leftW, y, thick * 0.95, 0, level));
      bands.push(bandAt(leftX + leftW + gap, rightW, y + (level === 1 ? 0.28 : 0), thick, tiltFor(level), level + 2));
    }
    return { org, bands, open: "above" };
  }

  let y = 4 + (variant % 3) * 0.6;
  let x = flip ? 8.5 : 2.3;
  for (let i = 0; i < count; i += 1) {
    const length = i % 2 === 0 ? 9.2 + (variant % 2) : 6.4;
    bands.push(bandAt(x, length, y, thick + (i === 0 ? 0.2 : 0), tiltFor(i), variant + i));
    x = flip ? x - 1.6 : x + 1.5;
    y += 2.4 + thick * 0.2;
  }
  return { org, bands, open: flip ? "left" : "right" };
}

function connect(lines: Line[], bands: Band[], index: number, open: "left" | "right" | "below" | "above") {
  const mode = index % 4;
  const ordered = [...bands].sort((a, b) => a.y - b.y);
  if (mode !== 0) {
    for (let i = 0; i < ordered.length - 1; i += 1) {
      if (mode === 1 && i % 2 === 1) continue;
      const top = ordered[i];
      const bot = ordered[i + 1];
      const from = { x: top.x0 + (top.x1 - top.x0) * (0.3 + (i % 3) * 0.2), y: top.y + top.thick / 2 };
      const to = { x: bot.x0 + (bot.x1 - bot.x0) * (0.7 - (i % 2) * 0.25), y: bot.y - bot.thick / 2 };
      if (Math.hypot(to.x - from.x, to.y - from.y) < 1.2) continue;
      vein(lines, from, to, (index % 2 === 0 ? 1 : -1) * (0.6 + (i % 2) * 0.4));
    }
  }
  const host = ordered[index % ordered.length];
  if (!host) return;
  const fromEnd = open === "left" || (open === "above" && index % 2 === 0);
  const origin = { x: fromEnd ? host.x0 + 0.3 : host.x1 - 0.3, y: host.y };
  const reach = open === "left" ? { x: origin.x - 2.8, y: origin.y + 1.6 } : open === "right" ? { x: origin.x + 2.8, y: origin.y - 1.4 } : open === "above" ? { x: origin.x + 1.2, y: origin.y - 2.6 } : { x: origin.x - 1.1, y: origin.y + 2.6 };
  vein(lines, origin, reach, 0.8);
  if (ordered.length > 2 && index % 3 === 0) {
    const other = ordered[(index + 2) % ordered.length];
    vein(lines, { x: host.x1, y: host.y }, { x: other.x0, y: other.y }, -1.1);
  }
}

function fit(bands: Band[]) {
  if (bands.length < 2) return bands.map((band) => ({ ...band, y: lim(band.y) }));
  const min = Math.min(...bands.map((band) => band.y));
  const max = Math.max(...bands.map((band) => band.y));
  const span = Math.max(0.01, max - min);
  const scale = Math.min(1, 12.8 / span);
  const lo = 3.5 + (16.4 - 3.5 - span * scale) * 0.5;
  return bands.map((band) => ({ ...band, y: lim(lo + (band.y - min) * scale) }));
}

function sectionLines(plan: InsertedPlatePlan): Line[] {
  const composed = compose(plan.index);
  composed.bands = fit(composed.bands);
  const rng = mulberry32((plan.seed ^ Math.imul(plan.index + 1, 0x9e3779b9)) >>> 0);
  const lines: Line[] = [];
  for (const band of composed.bands) drawBand(lines, band, rng);
  connect(lines, composed.bands, plan.index, composed.open);
  return lines.slice(0, 640);
}

export function planInsertedHorizontalPlate(seed: number, attempt = 0, index = 0): InsertedPlatePlan {
  const slot = ((index % 100) + 100) % 100;
  return { index: slot, seed: (seed ^ Math.imul(attempt + 1, 0x85ebca6b) ^ slot) >>> 0 };
}

export function linesFromInsertedPlate(plan: InsertedPlatePlan): Line[] {
  return sectionLines(plan);
}

export function attractorsFromInsertedPlate(plan: InsertedPlatePlan): FieldAttractor[] {
  return linesFromInsertedPlate(plan).map((line) => ({
    kind: "line" as const,
    x: line.x,
    y: line.y,
    x2: line.x2,
    y2: line.y2,
    radius: 0.32,
    strength: 1,
  }));
}

export function tuneInsertedPlateSlime(slime: SlimeControls, plan: InsertedPlatePlan): SlimeControls {
  const rng = mulberry32((plan.seed ^ 0x85ebca6b) >>> 0);
  const span = (min: number, max: number) => min + rng() * (max - min);
  return {
    ...slime,
    sensorAngle: span(0.06, 0.14),
    sensorDistance: span(0.28, 0.46),
    turnAngle: span(0.08, 0.16),
    stepSize: span(0.16, 0.22),
    deposit: span(0.14, 0.18),
    depositWidth: span(0.22, 0.32),
    diffusion: 0,
    decay: span(0.996, 0.998),
    trailInfluence: span(1.3, 1.7),
    resistance: span(0, 0.02),
    randomness: span(0.02, 0.06),
    persistence: span(0.86, 0.96),
    trailCap: span(0.7, 1),
    crowdingLimit: 10,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function insertedPlateAgentCount(plan: InsertedPlatePlan) {
  const lines = linesFromInsertedPlate(plan).length;
  return Math.max(150, Math.min(210, 60 + Math.round(lines * 0.22)));
}

export function insertedPlateSignature(plan: InsertedPlatePlan): number[] {
  const lines = linesFromInsertedPlate(plan);
  const heights = lines.filter((line) => Math.abs(line.y2 - line.y) < 0.45).map((line) => Math.round(((line.y + line.y2) / 2) * 2));
  return [plan.index % ORGS.length, lines.length, ...heights.slice(0, 12)];
}
