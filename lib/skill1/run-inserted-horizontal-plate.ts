import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor } from "./types";

/**
 * Inserted Horizontal Plate — Modular Nodes, Visually Disturbed Nodes,
 * Distributed Retreat.
 *
 * An open field holds two to six horizontal plate-zones. Each plate is several
 * faint trails that bend, split, and return, so the zone stays horizontal
 * without becoming a ruled bar. Narrow paths connect the plates or reach into
 * the empty field. Organizations change the relationship: dominant, scattered,
 * staggered, cascading, one-sided, clustered, broken, or overlapping.
 * Diffusion stays off.
 */

export const IHP_TRAIL_SCALE = 24;
export const IHP_RUN_ITERATIONS = 96;
export const IHP_STEP_BUDGET_MS = 18000;

const EDGE = 1.4;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

export const PLATE_ORGS = ["dominant", "distributed", "stagger", "cascade", "retreat", "cluster", "fragment", "overlap"] as const;
type Org = (typeof PLATE_ORGS)[number];
/** Arrangements of one organization. Index 0–99 uses 0 through 12. */
export const PLATE_VARIANTS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

export type InsertedPlatePlan = {
  index: number;
  seed: number;
  org: Org;
  variant: string;
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
  return resample(chaikin(chaikin(points)), 0.8);
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

function drawBand(lines: Line[], band: Band, rng: () => number) {
  const len = Math.max(2.6, band.x1 - band.x0);
  const trails = 8;
  const amp = Math.max(0.32, band.thick * 0.32);
  for (let row = 0; row < trails; row += 1) {
    const phase = band.wave * 0.8 + row * 1.17;
    const turns = 1.3 + (row % 3) * 0.55;
    const reach = amp * (0.55 + (row % 4) * 0.14);
    const trim = len * (0.02 + rng() * 0.04);
    const steps = Math.max(28, Math.round(len * 3.6));
    const points: Pt[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const lx = -len / 2 + trim + (len - trim * 2) * t;
      const wave = Math.sin(phase + t * Math.PI * 2 * turns) * reach;
      const drift = Math.sin(phase * 0.6 + t * Math.PI * (turns + 1)) * reach * 0.38;
      points.push(place(band, lx, wave + drift));
    }
    stroke(lines, soften(points));
    const at = points[Math.min(points.length - 1, 5 + (row % 4) * 2)];
    const back = points[Math.min(points.length - 1, 12 + (row % 3) * 2)];
    if (!at || !back) continue;
    const lift = (row % 2 === 0 ? 1 : -1) * (1.25 + rng() * 0.7);
    const away = { x: (at.x + back.x) / 2 + lift * 0.35, y: (at.y + back.y) / 2 + lift };
    vein(lines, at, away, lift);
    vein(lines, away, back, -lift * 0.7);
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
    const need = Math.max(ordered[i - 1].thick, ordered[i].thick) + 2.4;
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

function compose(org: Org, variant: number): { org: Org; bands: Band[]; open: "left" | "right" | "below" | "above" } {
  const flip = variant % 2 === 1;
  const count = org === "fragment" ? 2 + (variant % 2) : 2 + ((variant * 3 + 1) % 5);
  const lens = lengthsFor(Math.max(count, 4), variant + PLATE_ORGS.indexOf(org) + variant * PLATE_ORGS.length);
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

function plateFigure(plan: InsertedPlatePlan) {
  const org = (PLATE_ORGS as readonly string[]).includes(plan.org) ? plan.org : PLATE_ORGS[plan.index % PLATE_ORGS.length];
  const variant = (PLATE_VARIANTS as readonly string[]).includes(String(plan.variant))
    ? Number(plan.variant)
    : Math.floor(plan.index / PLATE_ORGS.length);
  const slot = PLATE_ORGS.indexOf(org) + variant * PLATE_ORGS.length;
  return { org, variant, slot };
}

function sectionLines(plan: InsertedPlatePlan): Line[] {
  const figure = plateFigure(plan);
  const composed = compose(figure.org, figure.variant);
  composed.bands = fit(composed.bands);
  const rng = mulberry32((plan.seed ^ Math.imul(plan.index + 1, 0x9e3779b9)) >>> 0);
  const lines: Line[] = [];
  for (const band of composed.bands) drawBand(lines, band, rng);
  connect(lines, composed.bands, figure.slot, composed.open);
  return lines.slice(0, 640);
}

export function planInsertedHorizontalPlate(seed: number, attempt = 0, index = 0): InsertedPlatePlan {
  const slot = ((index % 100) + 100) % 100;
  const variant = Math.floor(slot / PLATE_ORGS.length);
  return {
    index: slot,
    seed: (seed ^ Math.imul(attempt + 1, 0x85ebca6b) ^ slot) >>> 0,
    org: PLATE_ORGS[slot % PLATE_ORGS.length],
    variant: String(variant),
  };
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
    sensorAngle: span(0.42, 0.66),
    sensorDistance: span(0.4, 0.72),
    turnAngle: span(0.18, 0.36),
    stepSize: span(0.12, 0.16),
    deposit: 0.016,
    depositWidth: 0.14,
    diffusion: 0,
    decay: 0.998,
    trailInfluence: span(0.22, 0.36),
    resistance: 0,
    randomness: span(0.12, 0.22),
    persistence: span(0.3, 0.42),
    trailCap: 0.36,
    crowdingLimit: 5,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function insertedPlateAgentCount(_plan: InsertedPlatePlan) {
  return 110;
}

export function insertedPlateSignature(plan: InsertedPlatePlan): number[] {
  const lines = linesFromInsertedPlate(plan);
  const heights = lines.filter((line) => Math.abs(line.y2 - line.y) < 0.45).map((line) => Math.round(((line.y + line.y2) / 2) * 2));
  return [PLATE_ORGS.indexOf(plan.org), Number(plan.variant), lines.length, ...heights.slice(0, 12)];
}
