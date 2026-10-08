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
 * one-sided, clustered, broken, or overlapping. Each plate is a woven band of
 * fine trails, and short paths tie the plates into one spatial body. The stroke
 * stays the Contained Room width; density comes from more trails, not a thicker pen.
 */

export const IHP_TRAIL_SCALE = 16;
export const IHP_RUN_ITERATIONS = 320;
export const IHP_STEP_BUDGET_MS = 18000;

const EDGE = 1.4;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

export const PLATE_ORGS = ["dominant", "distributed", "stagger", "cascade", "retreat", "cluster", "fragment", "overlap"] as const;
export const PLATE_VARIANTS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
type Org = (typeof PLATE_ORGS)[number];

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

function place(band: Band, lx: number, ly: number): Pt {
  const c = Math.cos(band.tilt);
  const s = Math.sin(band.tilt);
  const cx = (band.x0 + band.x1) / 2;
  return { x: cx + lx * c - ly * s, y: band.y + lx * s + ly * c };
}

function along(lines: Line[], band: Band, yAt: (t: number) => number, t0: number, t1: number, amp: number, phase: number) {
  const len = Math.max(2.6, band.x1 - band.x0);
  const half = len / 2;
  const points: Pt[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const t = t0 + (t1 - t0) * u;
    const lx = -half + len * t;
    const ly = yAt(t) + Math.sin(phase + t * Math.PI * 1.7) * amp;
    points.push(place(band, lx, ly));
  }
  stroke(lines, soften(points));
}

/** A horizontal plate: a band of fine veins, cross-linked so it reads as one body. */
function drawBand(lines: Line[], band: Band, rng: () => number) {
  const len = Math.max(2.6, band.x1 - band.x0);
  const half = len / 2;
  const veins = 5;
  const gap = 0.28 + rng() * 0.08;
  const bow = (rng() - 0.5) * 0.28;
  const lane = (row: number, t: number) => (row - (veins - 1) / 2) * gap + Math.sin(t * Math.PI) * bow;
  for (let row = 0; row < veins; row += 1) {
    const edge = row === 0 || row === veins - 1;
    const base = (row - (veins - 1) / 2) * gap;
    const t0 = edge ? rng() * 0.04 : 0.02 + rng() * 0.08;
    const t1 = edge ? 0.96 + rng() * 0.04 : 0.86 + rng() * 0.12;
    const amp = edge ? 0.1 + rng() * 0.06 : 0.035 + rng() * 0.03;
    along(
      lines,
      band,
      (t) => base + Math.sin(t * Math.PI) * bow + Math.sin(band.wave + row + t * Math.PI * (edge ? 2.2 : 1.2)) * amp,
      t0,
      Math.min(0.99, t1),
      0.02,
      band.wave + row,
    );
  }
  const bridges = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < bridges; i += 1) {
    const t = 0.1 + ((i + 0.35) / bridges) * 0.8;
    const row = i % (veins - 1);
    const lx = -half + len * t;
    vein(
      lines,
      place(band, lx, lane(row, t)),
      place(band, lx + (rng() - 0.5) * 0.4, lane(row + 1, t)),
      (rng() - 0.5) * 0.16,
    );
  }
  const forks = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < forks; i += 1) {
    const t = 0.18 + rng() * 0.64;
    const row = Math.floor(rng() * veins);
    const ly = (row - (veins - 1) / 2) * gap + Math.sin(t * Math.PI) * bow;
    const lx = -half + len * t;
    const dir = row < veins / 2 ? -1 : 1;
    const reach = 0.28 + rng() * 0.45;
    vein(lines, place(band, lx, ly), place(band, lx + (rng() - 0.5) * 0.5, ly + dir * reach), (rng() - 0.5) * 0.3);
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
  const org = PLATE_ORGS[index % PLATE_ORGS.length];
  const variant = Math.floor(index / PLATE_ORGS.length);
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
  const ordered = [...bands].sort((a, b) => a.y - b.y);
  const bend = index % 2 === 0 ? 1 : -1;
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const top = ordered[i];
    const bot = ordered[i + 1];
    for (let k = 0; k < 2; k += 1) {
      const u = 0.22 + k * 0.48 + (i % 2) * 0.05;
      const v = 0.74 - k * 0.4 - (i % 2) * 0.04;
      const from = { x: top.x0 + (top.x1 - top.x0) * u, y: top.y };
      const to = { x: bot.x0 + (bot.x1 - bot.x0) * v, y: bot.y };
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      if (span < 0.9 || span > 6.4) continue;
      vein(lines, from, to, bend * (0.32 + k * 0.22));
    }
  }
  const host = ordered[index % ordered.length];
  if (!host) return;
  const fromEnd = open === "left" || (open === "above" && index % 2 === 0);
  const origin = { x: fromEnd ? host.x0 + 0.4 : host.x1 - 0.4, y: host.y };
  const reach =
    open === "left"
      ? { x: origin.x - 1.6, y: origin.y + 0.7 }
      : open === "right"
        ? { x: origin.x + 1.6, y: origin.y - 0.6 }
        : open === "above"
          ? { x: origin.x + 0.5, y: origin.y - 1.5 }
          : { x: origin.x - 0.4, y: origin.y + 1.5 };
  vein(lines, origin, reach, 0.35);
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
  return lines.slice(0, 420);
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
    sensorAngle: span(0.06, 0.16),
    sensorDistance: span(0.32, 0.52),
    turnAngle: span(0.08, 0.18),
    stepSize: span(0.14, 0.22),
    deposit: span(0.058, 0.07),
    depositWidth: 0.2,
    diffusion: 0,
    decay: 0.996,
    trailInfluence: span(1.25, 1.7),
    resistance: span(0.01, 0.05),
    randomness: span(0.04, 0.1),
    persistence: span(0.82, 0.93),
    trailCap: 1,
    crowdingLimit: 24,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function insertedPlateAgentCount(plan: InsertedPlatePlan) {
  const lines = linesFromInsertedPlate(plan).length;
  return Math.max(156, Math.min(200, 120 + Math.round(Math.min(lines, 320) * 0.22)));
}

export function insertedPlateSignature(plan: InsertedPlatePlan): number[] {
  const lines = linesFromInsertedPlate(plan);
  const heights = lines.filter((line) => Math.abs(line.y2 - line.y) < 0.45).map((line) => Math.round(((line.y + line.y2) / 2) * 2));
  return [plan.index % PLATE_ORGS.length, lines.length, ...heights.slice(0, 12)];
}
