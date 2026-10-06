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
type Fragment = { at: number; side: number; stem: number; radius: number };

function pt(x: number, y: number, radius: number, strength: number): FieldAttractor {
  return { kind: "point", x: lim(x), y: lim(y), radius, strength };
}

function ln(x: number, y: number, x2: number, y2: number, radius: number, strength: number, hole = false): FieldAttractor {
  return { kind: "line", x: lim(x), y: lim(y), x2: lim(x2), y2: lim(y2), radius, strength, hole: hole || undefined };
}

function ring(x: number, y: number, radius: number, strength: number): FieldAttractor {
  return { kind: "ring", x: lim(x), y: lim(y), radius, strength, hole: true };
}

function cv(x: number, y: number, x2: number, y2: number, cx: number, cy: number, radius: number, strength: number, hole = false): FieldAttractor {
  return { kind: "curve", x: lim(x), y: lim(y), x2: lim(x2), y2: lim(y2), cx: lim(cx), cy: lim(cy), radius, strength, hole: hole || undefined };
}

function rotate(x: number, y: number, plan: GalleryPlan) {
  const dx = (x - CENTER) * plan.scale * (plan.flip ? -1 : 1);
  const dy = (y - CENTER) * plan.scale;
  const c = Math.cos(plan.twist);
  const s = Math.sin(plan.twist);
  return {
    x: plan.originX + dx * c - dy * s,
    y: plan.originY + dx * s + dy * c,
  };
}

/** Fit the whole figure into the field. Clamping each point was crushing different plans into the same edge bar. */
function place(marks: FieldAttractor[], plan: GalleryPlan): FieldAttractor[] {
  const mapped = marks.map((mark) => {
    const a = rotate(mark.x, mark.y, plan);
    const out: FieldAttractor = { ...mark, x: a.x, y: a.y, radius: (mark.radius ?? 1.2) * plan.scale };
    if (mark.x2 != null && mark.y2 != null) {
      const b = rotate(mark.x2, mark.y2, plan);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    if (mark.cx != null && mark.cy != null) {
      const bend = rotate(mark.cx, mark.cy, plan);
      out.cx = bend.x;
      out.cy = bend.y;
    }
    return out;
  });
  const box = boundsOf(mapped);
  const width = Math.max(0.5, box.maxX - box.minX);
  const height = Math.max(0.5, box.maxY - box.minY);
  const margin = 1.2;
  const fit = Math.min((FIELD_SIZE - margin * 2) / width, (FIELD_SIZE - margin * 2) / height, 1.12);
  const shift = (x: number, y: number) => ({
    x: lim(CENTER + (x - box.cx) * fit),
    y: lim(CENTER + (y - box.cy) * fit),
  });
  return mapped.map((mark) => {
    const a = shift(mark.x, mark.y);
    const out: FieldAttractor = { ...mark, x: a.x, y: a.y, radius: Math.max(0.16, (mark.radius ?? 1.2) * fit) };
    if (mark.x2 != null && mark.y2 != null) {
      const b = shift(mark.x2, mark.y2);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    if (mark.cx != null && mark.cy != null) {
      const bend = shift(mark.cx, mark.cy);
      out.cx = bend.x;
      out.cy = bend.y;
    }
    return out;
  });
}

function along(count: number, span: number, y: number, f: Frame, jitter = 0.2): Station[] {
  const start = CENTER - span;
  const step = (span * 2) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => ({
    x: start + i * step + f.r(-jitter, jitter),
    y: y + f.r(-jitter * 0.6, jitter * 0.6),
  }));
}

function addSpine(marks: FieldAttractor[], path: Station[], width: number, style: "line" | "curve") {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (style === "curve") {
      marks.push(cv(a.x, a.y, b.x, b.y, (a.x + b.x) / 2, (a.y + b.y) / 2 + (b.x - a.x) * 0.08, width, 1.4));
    } else {
      marks.push(ln(a.x, a.y, b.x, b.y, width, 1.4));
    }
  }
}

function addFragments(marks: FieldAttractor[], path: Station[], items: Fragment[], spine: number) {
  for (const item of items) {
    const node = path[Math.min(path.length - 1, Math.max(0, item.at))];
    const x = node.x;
    const y = node.y + item.side * item.stem;
    marks.push(ln(node.x, node.y, x, y, Math.min(0.4, spine * 0.9), 0.7));
    marks.push(pt(x, y, item.radius, 0.88));
  }
}

function compose(path: Station[], fragments: Fragment[], spine: number, style: "line" | "curve"): FieldAttractor[] {
  const marks: FieldAttractor[] = [];
  addSpine(marks, path, spine, style);
  addFragments(marks, path, fragments, spine);
  return marks;
}

function boundsOf(marks: FieldAttractor[]) {
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const item of marks) {
    minX = Math.min(minX, item.x, item.x2 ?? item.x, item.cx ?? item.x);
    minY = Math.min(minY, item.y, item.y2 ?? item.y, item.cy ?? item.y);
    maxX = Math.max(maxX, item.x, item.x2 ?? item.x, item.cx ?? item.x);
    maxY = Math.max(maxY, item.y, item.y2 ?? item.y, item.cy ?? item.y);
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function organicBite(x: number, y: number, radius: number, f: Frame): FieldAttractor[] {
  const bites = [ring(x, y, radius, 1)];
  const extra = f.int(1, 3);
  for (let i = 0; i < extra; i += 1) {
    const a = f.r(0, Math.PI * 2);
    const d = radius * f.r(0.28, 0.78);
    bites.push(ring(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * f.r(0.38, 0.78), 0.82));
  }
  return bites;
}

function wavyVoid(marks: FieldAttractor[], f: Frame): FieldAttractor[] {
  const { minX, minY, maxX, maxY, cx, cy } = boundsOf(marks);
  const horizontal = maxX - minX >= maxY - minY;
  const pad = f.r(0.55, 1.25);
  const n = f.int(4, 6);
  const amp = f.r(0.7, 1.8);
  const waves = f.r(1.1, 2.6);
  const phase = f.r(0, Math.PI * 2);
  const stations: Station[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const wobble = Math.sin(t * Math.PI * waves + phase) * amp;
    stations.push(
      horizontal
        ? { x: minX + pad + (maxX - minX - pad * 2) * t, y: cy + wobble }
        : { x: cx + wobble, y: minY + pad + (maxY - minY - pad * 2) * t },
    );
  }
  const voids: FieldAttractor[] = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    const bow = f.r(-1.15, 1.15);
    voids.push(
      cv(
        a.x,
        a.y,
        b.x,
        b.y,
        (a.x + b.x) / 2 + (horizontal ? 0 : bow),
        (a.y + b.y) / 2 + (horizontal ? bow : 0),
        f.r(0.42, 0.98),
        1.05,
        true,
      ),
    );
  }
  const bites = f.int(2, 4);
  for (let i = 0; i < bites; i += 1) {
    const t = f.r(0.15, 0.85);
    const off = f.r(-1.4, 1.4);
    const x = horizontal ? minX + pad + (maxX - minX - pad * 2) * t : cx + off;
    const y = horizontal ? cy + off : minY + pad + (maxY - minY - pad * 2) * t;
    voids.push(...organicBite(x, y, f.r(0.55, 1.15), f));
  }
  return [...marks, ...voids];
}

function carveOrganicVoid(marks: FieldAttractor[], f: Frame): FieldAttractor[] {
  return wavyVoid(marks, f);
}

function addWraps(marks: FieldAttractor[], f: Frame): FieldAttractor[] {
  const { cx, cy, minX, maxX, minY, maxY } = boundsOf(marks);
  const rx = Math.max(2.1, (maxX - minX) * 0.38);
  const ry = Math.max(1.8, (maxY - minY) * 0.48);
  const wraps = f.int(4, 7);
  const extra: FieldAttractor[] = [];
  for (let i = 0; i < wraps; i += 1) {
    const a0 = (i / wraps) * Math.PI * 2 + f.r(-0.28, 0.28);
    const span = f.r(1.45, 2.7);
    const rIn = f.r(0.85, 1.15);
    const rOut = f.r(1.25, 1.85);
    const p1 = { x: cx + Math.cos(a0) * rx * rIn, y: cy + Math.sin(a0) * ry * rIn };
    const p2 = {
      x: cx + Math.cos(a0 + span) * rx * rIn * f.r(0.86, 1.18),
      y: cy + Math.sin(a0 + span) * ry * rIn * f.r(0.86, 1.18),
    };
    const c = { x: cx + Math.cos(a0 + span * 0.5) * rx * rOut, y: cy + Math.sin(a0 + span * 0.5) * ry * rOut };
    extra.push(cv(p1.x, p1.y, p2.x, p2.y, c.x, c.y, f.r(0.18, 0.4), f.r(0.55, 0.95)));
    if (f.chance(0.55)) {
      const bead = a0 + span * f.r(0.28, 0.72);
      extra.push(pt(cx + Math.cos(bead) * rx * 1.25, cy + Math.sin(bead) * ry * 1.25, f.r(0.42, 0.82), 0.68));
    }
  }
  return marks.concat(extra);
}

function wrapAroundCenter(f: Frame): FieldAttractor[] {
  const marks: FieldAttractor[] = [];
  const coreAng = f.r(-0.55, 0.55);
  const coreLen = f.r(1.4, 2.6);
  const dx = Math.cos(coreAng) * coreLen;
  const dy = Math.sin(coreAng) * coreLen;
  marks.push(pt(CENTER, CENTER, f.r(1.5, 2.3), 1.85));
  marks.push(ln(CENTER - dx, CENTER - dy, CENTER + dx, CENTER + dy, f.r(0.55, 0.95), 1.7));
  const wraps = f.int(5, 8);
  for (let i = 0; i < wraps; i += 1) {
    const a0 = (i / wraps) * Math.PI * 2 + f.r(-0.18, 0.18);
    const span = f.r(1.7, 2.9);
    const rIn = f.r(0.7, 1.35);
    const rOut = f.r(3.0, 5.2);
    const rEnd = f.r(2.2, 4.0);
    const p1 = { x: CENTER + Math.cos(a0) * rIn, y: CENTER + Math.sin(a0) * rIn };
    const p2 = { x: CENTER + Math.cos(a0 + span) * rEnd, y: CENTER + Math.sin(a0 + span) * rEnd };
    const c = { x: CENTER + Math.cos(a0 + span * 0.45) * rOut, y: CENTER + Math.sin(a0 + span * 0.45) * rOut };
    marks.push(cv(p1.x, p1.y, p2.x, p2.y, c.x, c.y, f.r(0.2, 0.38), f.r(1.15, 1.55)));
    if (f.chance(0.7)) {
      marks.push(pt(p2.x, p2.y, f.r(0.45, 0.85), 0.78));
    }
  }
  return marks;
}

function familyMarks(kind: GalleryKind, f: Frame): FieldAttractor[] {
  if (kind === "enfilade") {
    const n = f.int(5, 7);
    const path = along(n, f.r(6.8, 8.1), CENTER, f, 0.12);
    return compose(
      path,
      path.map((_, i) => ({ at: i, side: i % 2 ? 1 : -1, stem: f.r(1.4, 2.0), radius: f.r(0.7, 1.05) })),
      f.r(0.22, 0.34),
      "line",
    );
  }
  if (kind === "dogleg") {
    const mid = CENTER + f.r(-1.2, 1.2);
    const path = [
      { x: CENTER - 7.4, y: CENTER - 2.8 },
      { x: mid, y: CENTER - 2.8 },
      { x: mid, y: CENTER + 3.0 },
      { x: CENTER + 7.2, y: CENTER + 3.0 },
    ];
    return compose(
      path,
      [
        { at: 0, side: 1, stem: f.r(1.6, 2.4), radius: f.r(1.5, 2.2) },
        { at: 1, side: -1, stem: f.r(1.3, 2.1), radius: f.r(1.1, 1.7) },
        { at: 2, side: 1, stem: f.r(1.4, 2.2), radius: f.r(1.2, 1.9) },
        { at: 3, side: -1, stem: f.r(1.6, 2.5), radius: f.r(1.5, 2.2) },
      ],
      f.r(0.28, 0.44),
      "line",
    );
  }
  if (kind === "alcove") {
    const path = along(4, 7.0, CENTER + 1.6, f, 0.15);
    return compose(
      path,
      [
        { at: 0, side: -1, stem: f.r(2.6, 3.8), radius: f.r(1.3, 1.9) },
        { at: 1, side: -1, stem: f.r(3.2, 4.4), radius: f.r(1.6, 2.3) },
        { at: 2, side: -1, stem: f.r(2.4, 3.6), radius: f.r(1.2, 1.8) },
        { at: 3, side: -1, stem: f.r(2.8, 4.0), radius: f.r(1.4, 2.0) },
      ],
      f.r(0.4, 0.7),
      "line",
    );
  }
  if (kind === "switchback") {
    const y0 = CENTER - 3.2;
    const y1 = CENTER;
    const y2 = CENTER + 3.2;
    const path = [
      { x: CENTER - 7.0, y: y0 },
      { x: CENTER + 5.4, y: y0 },
      { x: CENTER + 5.4, y: y1 },
      { x: CENTER - 5.4, y: y1 },
      { x: CENTER - 5.4, y: y2 },
      { x: CENTER + 7.0, y: y2 },
    ];
    return compose(
      path,
      [
        { at: 0, side: -1, stem: f.r(1.1, 1.7), radius: f.r(1.0, 1.5) },
        { at: 1, side: -1, stem: f.r(1.1, 1.7), radius: f.r(1.0, 1.5) },
        { at: 3, side: 1, stem: f.r(1.0, 1.6), radius: f.r(0.95, 1.45) },
        { at: 5, side: 1, stem: f.r(1.1, 1.8), radius: f.r(1.1, 1.7) },
      ],
      f.r(0.24, 0.38),
      "line",
    );
  }
  if (kind === "meander") {
    const path = [
      { x: CENTER - 7.3, y: CENTER + 2.6 },
      { x: CENTER - 2.4, y: CENTER - 2.8 },
      { x: CENTER + 2.4, y: CENTER + 2.8 },
      { x: CENTER + 7.3, y: CENTER - 2.4 },
    ];
    return compose(
      path,
      [
        { at: 0, side: 1, stem: f.r(1.5, 2.3), radius: f.r(1.2, 1.9) },
        { at: 1, side: -1, stem: f.r(1.6, 2.5), radius: f.r(1.3, 2.0) },
        { at: 2, side: 1, stem: f.r(1.5, 2.4), radius: f.r(1.2, 1.9) },
        { at: 3, side: -1, stem: f.r(1.5, 2.3), radius: f.r(1.2, 1.9) },
      ],
      f.r(0.26, 0.42),
      "curve",
    );
  }
  if (kind === "fork") {
    const split = CENTER + f.r(-0.8, 0.8);
    const marks: FieldAttractor[] = [
      ln(CENTER - 7.4, CENTER, split, CENTER, f.r(0.28, 0.48), 1.5),
      ln(split, CENTER, CENTER + 6.8, CENTER - 3.4, f.r(0.22, 0.4), 1.25),
      ln(split, CENTER, CENTER + 6.8, CENTER + 3.4, f.r(0.22, 0.4), 1.25),
      pt(CENTER - 7.4, CENTER, f.r(1.1, 1.8), 1.05),
      pt(CENTER + 6.8, CENTER - 3.4, f.r(1.3, 2.1), 1),
      pt(CENTER + 6.8, CENTER + 3.4, f.r(1.3, 2.1), 1),
      pt(split, CENTER, f.r(0.7, 1.2), 0.85),
    ];
    return marks;
  }
  if (kind === "bay") {
    const path = along(3, 6.4, CENTER, f, 0.1);
    return compose(
      path,
      [
        { at: 0, side: 1, stem: f.r(2.0, 2.8), radius: f.r(2.0, 2.7) },
        { at: 1, side: -1, stem: f.r(2.1, 3.0), radius: f.r(2.1, 2.8) },
        { at: 2, side: 1, stem: f.r(2.0, 2.8), radius: f.r(2.0, 2.7) },
      ],
      f.r(0.36, 0.58),
      "line",
    );
  }
  if (kind === "ladder") {
    const y0 = CENTER - f.r(2.4, 3.4);
    const y1 = CENTER + f.r(2.4, 3.4);
    const marks: FieldAttractor[] = [
      ln(CENTER - 7.2, y0, CENTER + 7.2, y0, f.r(0.22, 0.38), 1.35),
      ln(CENTER - 7.2, y1, CENTER + 7.2, y1, f.r(0.22, 0.38), 1.35),
    ];
    const rungs = f.int(4, 6);
    for (let i = 0; i < rungs; i += 1) {
      const x = CENTER - 6.4 + (12.8 * i) / Math.max(1, rungs - 1) + f.r(-0.2, 0.2);
      marks.push(ln(x, y0, x, y1, f.r(0.16, 0.3), 0.75));
      if (i === 0 || i === rungs - 1 || f.chance(0.55)) marks.push(pt(x, (y0 + y1) / 2, f.r(0.7, 1.3), 0.8));
    }
    return marks;
  }
  if (kind === "braid") {
    const marks: FieldAttractor[] = [
      cv(CENTER - 7.2, CENTER - 2.2, CENTER + 7.2, CENTER + 2.0, CENTER, CENTER + 3.6, f.r(0.22, 0.38), 1.3),
      cv(CENTER - 7.2, CENTER + 2.2, CENTER + 7.2, CENTER - 2.0, CENTER, CENTER - 3.6, f.r(0.22, 0.38), 1.3),
      pt(CENTER - 7.2, CENTER - 2.2, f.r(1.1, 1.8), 0.95),
      pt(CENTER + 7.2, CENTER + 2.0, f.r(1.2, 1.9), 0.95),
      pt(CENTER - 7.2, CENTER + 2.2, f.r(1.0, 1.7), 0.9),
      pt(CENTER + 7.2, CENTER - 2.0, f.r(1.1, 1.8), 0.9),
    ];
    return marks;
  }
  if (kind === "islands") {
    const nodes = [
      { x: CENTER - 6.6, y: CENTER + f.r(-2.2, 2.2) },
      { x: CENTER + f.r(-1.2, 1.2), y: CENTER + f.r(-3.2, 3.2) },
      { x: CENTER + 6.4, y: CENTER + f.r(-2.4, 2.4) },
    ];
    if (f.chance(0.5)) nodes.splice(2, 0, { x: CENTER + 2.4, y: CENTER + f.r(-3.6, 3.6) });
    const marks: FieldAttractor[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      marks.push(pt(nodes[i].x, nodes[i].y, f.r(1.6, 2.6), 1.1));
      if (i > 0) marks.push(ln(nodes[i - 1].x, nodes[i - 1].y, nodes[i].x, nodes[i].y, f.r(0.12, 0.24), 0.7));
    }
    return marks;
  }
  if (kind === "hook") {
    const marks: FieldAttractor[] = [
      ln(CENTER - 7.4, CENTER + 2.2, CENTER + 4.2, CENTER + 2.2, f.r(0.26, 0.44), 1.4),
      cv(CENTER + 4.2, CENTER + 2.2, CENTER + 1.2, CENTER - 3.6, CENTER + 7.4, CENTER - 1.4, f.r(0.24, 0.4), 1.25),
      pt(CENTER - 7.4, CENTER + 2.2, f.r(1.0, 1.6), 0.9),
      pt(CENTER + 1.2, CENTER - 3.6, f.r(1.5, 2.4), 1.1),
      pt(CENTER + 4.2, CENTER + 2.2, f.r(0.7, 1.2), 0.75),
    ];
    return marks;
  }
  if (kind === "fan") {
    const origin = { x: CENTER - 6.6, y: CENTER };
    const marks: FieldAttractor[] = [pt(origin.x, origin.y, f.r(1.4, 2.2), 1.25)];
    const rays = f.int(4, 6);
    for (let i = 0; i < rays; i += 1) {
      const t = rays === 1 ? 0.5 : i / (rays - 1);
      const a = -0.7 + t * 1.4;
      const len = f.r(8.2, 11.4);
      const x = origin.x + Math.cos(a) * len;
      const y = origin.y + Math.sin(a) * len;
      marks.push(ln(origin.x, origin.y, x, y, f.r(0.16, 0.3), 0.85));
      marks.push(pt(x, y, f.r(0.7, 1.4), 0.8));
    }
    return marks;
  }
  if (kind === "arcade") {
    const path = along(5, 7.0, CENTER + 2.2, f, 0.1);
    const marks = compose(
      path,
      path.map((_, i) => ({ at: i, side: -1, stem: f.r(1.6, 2.2), radius: f.r(0.85, 1.25) })),
      f.r(0.28, 0.42),
      "line",
    );
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      marks.push(cv(a.x, a.y - 0.2, b.x, b.y - 0.2, (a.x + b.x) / 2, a.y - f.r(2.2, 3.4), f.r(0.22, 0.36), 0.55));
    }
    return marks;
  }
  if (kind === "loop") {
    const x0 = CENTER - 6.2;
    const x1 = CENTER + 6.2;
    const y0 = CENTER - 3.0;
    const y1 = CENTER + 3.0;
    const marks: FieldAttractor[] = [
      ln(x0, y0, x1, y0, f.r(0.22, 0.38), 1.2),
      ln(x1, y0, x1, y1, f.r(0.22, 0.38), 1.2),
      ln(x1, y1, x0, y1, f.r(0.22, 0.38), 1.2),
      ln(x0, y1, x0, y0, f.r(0.22, 0.38), 1.2),
      pt(x0, y0, f.r(0.9, 1.5), 0.85),
      pt(x1, y1, f.r(1.1, 1.8), 0.9),
      pt((x0 + x1) / 2, y0, f.r(0.8, 1.3), 0.75),
    ];
    const side = f.chance(0.5) ? 1 : -1;
    marks.push(ln((x0 + x1) / 2, side > 0 ? y1 : y0, (x0 + x1) / 2, CENTER + side * 5.2, 0.24, 0.7));
    marks.push(pt((x0 + x1) / 2, CENTER + side * 5.2, f.r(1.3, 2.1), 0.95));
    return marks;
  }
  if (kind === "broken") {
    const marks: FieldAttractor[] = [];
    const chunks = [
      { x0: CENTER - 7.4, x1: CENTER - 3.2, y: CENTER + f.r(-2.8, -0.8) },
      { x0: CENTER - 1.6, x1: CENTER + 1.8, y: CENTER + f.r(-0.6, 0.6) },
      { x0: CENTER + 3.4, x1: CENTER + 7.4, y: CENTER + f.r(0.8, 2.8) },
    ];
    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i];
      marks.push(ln(c.x0, c.y, c.x1, c.y, f.r(0.28, 0.5), 1.25));
      marks.push(pt(c.x0, c.y, f.r(1.0, 1.7), 0.9));
      marks.push(pt(c.x1, c.y, f.r(1.0, 1.7), 0.9));
      if (i > 0) {
        const prev = chunks[i - 1];
        marks.push(ln(prev.x1, prev.y, c.x0, c.y, f.r(0.1, 0.2), 0.55));
      }
    }
    return marks;
  }
  return wrapAroundCenter(f);
}

const GALLERY_POSES = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 5, -Math.PI / 5];
const GALLERY_SCALES = [0.82, 0.96, 1.1, 0.74, 1.16, 0.9];

export function planLinearGallery(seed: number, attempt = 0, index = 0): GalleryPlan {
  const rng = mulberry32(seed ^ 0x44ac91 ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  const cycle = Math.floor(index / GALLERY_FAMILIES.length);
  const kind = GALLERY_FAMILIES[index % GALLERY_FAMILIES.length];
  const growth = GROWTH_MODES[(cycle + attempt * 3) % GROWTH_MODES.length];
  return {
    kind,
    growth,
    index,
    scale: GALLERY_SCALES[cycle % GALLERY_SCALES.length] * f.r(0.96, 1.04),
    originX: CENTER,
    originY: CENTER,
    twist: GALLERY_POSES[(cycle + attempt) % GALLERY_POSES.length] + f.r(-0.04, 0.04),
    flip: ((cycle + attempt) & 1) === 1,
  };
}

export function attractorsFromLinearGallery(plan: GalleryPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x11f22ed ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x165667b1));
  const f = frame(rng);
  let marks = familyMarks(plan.kind, f);
  if (plan.kind !== "wrap" && (plan.kind === "meander" || plan.kind === "arcade") && f.chance(0.45)) {
    marks = addWraps(marks, f);
  }
  if ((plan.growth === "mass" || plan.growth === "bloom" || plan.growth === "heavy") && f.chance(0.7) && plan.kind !== "wrap") {
    marks = carveOrganicVoid(marks, f);
  }
  return place(marks, plan).map((mark) => ({
    ...mark,
    hole: false,
    kind: mark.kind === "ring" ? "point" : mark.kind,
  }));
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
      persistence: f.r(0.5, 0.78),
      trailInfluence: f.r(0.7, 1.4),
      deposit: f.r(0.12, 0.26),
      depositWidth: f.r(1.6, 3.1),
      diffusion: f.r(0.02, 0.08),
      randomness: f.r(0.06, 0.28),
      trailCap: f.r(1.1, 1.85),
      sensorAngle: f.r(0.16, 0.42),
    },
    sparse: {
      persistence: f.r(0.28, 0.55),
      trailInfluence: f.r(0.35, 0.85),
      deposit: f.r(0.015, 0.06),
      depositWidth: f.r(0.28, 0.8),
      diffusion: f.r(0, 0.03),
      randomness: f.r(0.35, 0.85),
      trailCap: f.r(0.3, 0.85),
      sensorAngle: f.r(0.28, 0.7),
    },
    bloom: {
      persistence: f.r(0.4, 0.68),
      trailInfluence: f.r(0.55, 1.2),
      deposit: f.r(0.06, 0.16),
      depositWidth: f.r(1.2, 2.4),
      diffusion: f.r(0.06, 0.14),
      randomness: f.r(0.12, 0.4),
      trailCap: f.r(0.8, 1.5),
      sensorAngle: f.r(0.22, 0.55),
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
      persistence: f.r(0.55, 0.84),
      trailInfluence: f.r(0.8, 1.6),
      deposit: f.r(0.1, 0.24),
      depositWidth: f.r(1.8, 3.2),
      diffusion: f.r(0.01, 0.06),
      randomness: f.r(0.05, 0.24),
      trailCap: f.r(1.3, 1.95),
      sensorAngle: f.r(0.12, 0.36),
    },
    wander: {
      persistence: f.r(0.22, 0.48),
      trailInfluence: f.r(0.28, 0.75),
      deposit: f.r(0.03, 0.1),
      depositWidth: f.r(0.4, 1.2),
      diffusion: f.r(0.02, 0.08),
      randomness: f.r(0.45, 0.95),
      trailCap: f.r(0.4, 1.1),
      sensorAngle: f.r(0.35, 0.85),
    },
    committed: {
      persistence: f.r(0.7, 0.92),
      trailInfluence: f.r(1.2, 1.9),
      deposit: f.r(0.04, 0.12),
      depositWidth: f.r(0.35, 1.0),
      diffusion: f.r(0, 0.03),
      randomness: f.r(0.02, 0.16),
      trailCap: f.r(0.5, 1.2),
      sensorAngle: f.r(0.08, 0.24),
    },
  };
  const carved = plan.kind === "loop" || plan.kind === "islands" || plan.growth === "mass" || plan.growth === "bloom" || plan.growth === "heavy";
  return {
    ...base,
    stepSize: f.r(0.1, 0.36),
    sensorDistance: f.r(0.35, 1.7),
    turnAngle: f.r(0.06, 0.7),
    resistance: f.r(0.02, 0.4),
    foodPoints: [],
    ...byGrowth[plan.growth],
    trailInfluence: f.r(0.2, 0.38),
    randomness: f.r(0.16, 0.3),
    persistence: f.r(0.28, 0.46),
    diffusion: 0,
    decay: f.r(0.94, 0.994),
    voidElongation: carved ? f.r(0.55, 1.85) : 1,
    voidRotation: carved ? f.r(0, Math.PI) : 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function paramsFromLinearGallery(base: BiologicalParams, seed: number): BiologicalParams {
  const rng = mulberry32(seed ^ 0x11fa22);
  return {
    ...base,
    attractionStrength: 0.32 + rng() * 0.55,
    networkDensity: 0.22 + rng() * 0.62,
    permeability: 0.28 + rng() * 0.55,
    flowCoupling: 0.28 + rng() * 0.55,
    directionalBias: 0.4 + rng() * 0.5,
    geometryVariation: 0.3 + rng() * 0.58,
  };
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
    filament: [160, 200],
    mass: [190, 240],
    sparse: [150, 190],
    bloom: [170, 220],
    sharp: [160, 200],
    heavy: [190, 240],
    wander: [150, 200],
    committed: [170, 220],
  };
  const [min, max] = byGrowth[plan.growth];
  return Math.round(min + rng() * (max - min));
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
  return Math.max(maxX - minX, maxY - minY) >= 7.2;
}

export function linearGalleryIdentity(_features: unknown, attractors: FieldAttractor[], snapshot?: FieldSnapshot): boolean {
  if (!attractorIdentity(attractors)) return false;
  if (!snapshot) return true;
  const profile = fieldProfile(snapshot);
  if (profile.occupied < 0.05 || profile.occupied > 0.74) return false;
  if (profile.trailSpan < 6.2) return false;
  if (profile.occupied > 0.28 && profile.contrast < 1.25 && profile.anisotropy < 1.08) return false;
  if (profile.meanTrail < 0.12 && profile.linearity < 0.5) return false;
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
