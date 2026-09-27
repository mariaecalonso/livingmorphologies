import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { AttractorKind, FieldAttractor } from "./types";

/**
 * Attractor layouts for the run grid. Each archetype keeps the spatial idea its
 * descriptors name; the seed changes orientation, count, proportion, and place
 * so every run is a different realization of the same archetype.
 *
 * Points and rings are solid disks the network wraps around. Lines and curves
 * are corridors the network gathers along; their radius is the corridor width.
 */

type Rng = () => number;

type Frame = {
  r: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
};

/** A mark in layout space: u runs along the archetype axis, v across it, origin at the layout centre. */
type LocalMark = {
  kind: FieldAttractor["kind"];
  u: number;
  v: number;
  u2?: number;
  v2?: number;
  cu?: number;
  cv?: number;
  radius: number;
  strength: number;
  hole?: boolean;
};

const CENTER = (FIELD_SIZE - 1) / 2;
/** Largest distance from the layout centre that still sits inside the field. */
const REACH = CENTER - 1.4;
const lim = (value: number) => Math.min(FIELD_SIZE - 1.2, Math.max(1.2, value));

function frame(rng: Rng): Frame {
  return {
    r: (min, max) => min + rng() * (max - min),
    int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
    chance: (p) => rng() < p,
  };
}

/** Rotates, mirrors, drifts, and scales a layout so every mark lands inside the field. */
function place(layout: LocalMark[], rng: Rng, angles: number[], hold = false): FieldAttractor[] {
  const angle = angles[Math.floor(rng() * angles.length)] + (rng() - 0.5) * (hold ? 0.12 : 0.3);
  const flip = rng() < 0.5 ? -1 : 1;
  const driftSpan = hold ? 2.2 : 3.6;
  const drift = { x: (rng() - 0.5) * driftSpan, y: (rng() - 0.5) * driftSpan };
  const grow = hold ? 0.88 + rng() * 0.14 : 0.7 + rng() * 0.4;
  const shake = (amount: number) => (rng() - 0.5) * 2 * amount;
  const marks = layout.map((mark) => {
    const isDisk = mark.kind === "point" || mark.kind === "ring";
    const wobble = hold ? 0.12 : isDisk ? 1.2 : 0.8;
    return {
      ...mark,
      u: mark.u * grow + shake(wobble),
      v: mark.v * grow + shake(wobble),
      u2: mark.u2 == null ? undefined : mark.u2 * grow + shake(wobble),
      v2: mark.v2 == null ? undefined : mark.v2 * grow + shake(wobble),
      cu: mark.cu == null ? undefined : mark.cu * grow + shake(wobble),
      cv: mark.cv == null ? undefined : mark.cv * grow + shake(wobble),
      radius: mark.radius * (hold ? 0.9 + rng() * 0.2 : 0.65 + rng() * 0.8),
      strength: mark.strength * (hold ? 0.9 + rng() * 0.2 : 0.7 + rng() * 0.6),
    };
  });
  let extent = 0;
  for (const mark of marks) {
    const pad = mark.kind === "point" || mark.kind === "ring" ? mark.radius : mark.radius * 0.5;
    const points = [
      [mark.u, mark.v],
      [mark.u2 ?? mark.u, mark.v2 ?? mark.v],
      [mark.cu ?? mark.u, mark.cv ?? mark.v],
    ];
    for (const [u, v] of points) extent = Math.max(extent, Math.abs(u) + pad, Math.abs(v) + pad);
  }
  const scale = Math.min(1, (REACH - Math.max(Math.abs(drift.x), Math.abs(drift.y))) / Math.max(extent, 1));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const to = (u: number, v: number) => {
    const su = u * scale;
    const sv = v * scale * flip;
    return { x: lim(CENTER + drift.x + su * cos - sv * sin), y: lim(CENTER + drift.y + su * sin + sv * cos) };
  };
  return marks.map((mark) => {
    const a = to(mark.u, mark.v);
    const out: FieldAttractor = { kind: mark.kind, x: a.x, y: a.y, radius: mark.radius * scale, strength: mark.strength };
    if (mark.hole) out.hole = true;
    if (mark.kind === "line" || mark.kind === "curve") {
      const b = to(mark.u2 ?? mark.u, mark.v2 ?? mark.v);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    if (mark.kind === "curve") {
      const c = to(mark.cu ?? mark.u, mark.cv ?? mark.v);
      out.cx = c.x;
      out.cy = c.y;
    }
    return out;
  });
}

const ORTHO = [0, Math.PI / 2];
const CARDINAL = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const ANY = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];

function disk(_f: Frame, kind: "point" | "ring", u: number, v: number, radius: number, strength: number, hole = false): LocalMark {
  return { kind, u, v, radius, strength, hole };
}

function seg(_f: Frame, u1: number, v1: number, u2: number, v2: number, radius: number, strength: number): LocalMark {
  return { kind: "line", u: u1, v: v1, u2, v2, radius, strength };
}

function arc(_f: Frame, u1: number, v1: number, u2: number, v2: number, cu: number, cv: number, radius: number, strength: number): LocalMark {
  return { kind: "curve", u: u1, v: v1, u2, v2, cu, cv, radius, strength };
}

/** Dynamic Core · Open Threshold · Visual Immersion — one absence, one approach. */
function verticalVoid(f: Frame): LocalMark[] {
  const ringR = f.r(3.6, 5.4);
  const marks = [disk(f, "ring", 0, 0, ringR, 1.15, true)];
  const approach = f.r(-Math.PI, Math.PI);
  const far = ringR + f.r(3.8, 5.4);
  marks.push(
    seg(
      f,
      Math.cos(approach) * far,
      Math.sin(approach) * far,
      Math.cos(approach) * (ringR + 0.55),
      Math.sin(approach) * (ringR + 0.55),
      f.r(1.7, 2.8),
      0.48,
    ),
  );
  return marks;
}

/** Geometry Compression · Sequential Release · Immersive Transition */
function compressedSequential(f: Frame): LocalMark[] {
  const pinches = f.int(1, 3);
  const span = 15;
  const pinchLen = f.r(2, 2.8);
  const chamberLen = (span - pinches * pinchLen) / (pinches + 1);
  const bend = f.chance(0.4) ? f.r(-2.2, 2.2) : 0;
  const marks: LocalMark[] = [];
  let u = -span / 2;
  for (let i = 0; i <= pinches; i += 1) {
    const wide = f.r(2.2, 3.1);
    const u2 = u + chamberLen;
    if (bend) marks.push(arc(f, u, 0, u2, 0, (u + u2) / 2, bend * (i % 2 ? -1 : 1), wide, 0.8));
    else marks.push(seg(f, u, 0, u2, 0, wide, 0.8));
    u = u2;
    if (i === pinches) break;
    const gap = f.r(1.1, 1.9);
    const jaw = f.r(1.4, 2.4);
    const mid = u + pinchLen / 2;
    marks.push(seg(f, u, 0, u + pinchLen, 0, f.r(0.45, 0.7), 1.25));
    marks.push(disk(f, "ring", mid, gap + jaw, jaw, 1.1, true));
    marks.push(disk(f, "ring", mid, -(gap + jaw), jaw, 1.1, true));
    u += pinchLen;
  }
  return marks;
}

/** Radial Convergence · Integrated Form · Dynamic Engagement */
function continuousHall(f: Frame): LocalMark[] {
  const coreR = f.r(1.4, 2.4);
  const marks = [disk(f, "point", 0, 0, coreR, 1)];
  const spokes = f.int(3, 6);
  const start = f.r(0, Math.PI * 2);
  for (let i = 0; i < spokes; i += 1) {
    const a = start + (i / spokes) * Math.PI * 2 + (f.r(-0.5, 0.5) * Math.PI) / spokes;
    const reach = f.r(7, 9);
    const width = f.r(1.1, 1.8);
    const inner = coreR + 0.4;
    if (f.chance(0.35)) {
      const side = f.r(-2, 2);
      marks.push(
        arc(
          f,
          Math.cos(a) * inner,
          Math.sin(a) * inner,
          Math.cos(a) * reach,
          Math.sin(a) * reach,
          Math.cos(a) * (reach / 2) - Math.sin(a) * side,
          Math.sin(a) * (reach / 2) + Math.cos(a) * side,
          width,
          0.7,
        ),
      );
    } else {
      marks.push(seg(f, Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * reach, Math.sin(a) * reach, width, 0.7));
    }
  }
  return marks;
}

/** Sculpted Ground · Distributed Flow · Shared Engagement */
function topographicGroundField(f: Frame): LocalMark[] {
  const marks: LocalMark[] = [];
  const mounds = f.int(4, 7);
  for (let i = 0; i < mounds; i += 1) {
    const a = (i / mounds) * Math.PI * 2 + f.r(-0.4, 0.4);
    const d = f.r(2, 7);
    marks.push(disk(f, "point", Math.cos(a) * d, Math.sin(a) * d, f.r(1.5, 3.6), f.r(0.3, 0.5)));
  }
  const flows = f.int(1, 2);
  for (let i = 0; i < flows; i += 1) {
    const v = f.r(-5, 5);
    marks.push(arc(f, -8, v, 8, v + f.r(-3, 3), f.r(-3, 3), v + f.r(-4, 4), f.r(2, 3), 0.35));
  }
  return marks;
}

/** Linear Fragmentation · Connected Progression · Intuitive Guidance */
function linearGallery(f: Frame): LocalMark[] {
  const half = f.r(6.5, 7.5);
  const width = f.r(0.9, 1.4);
  const bend = f.chance(0.4) ? f.r(-2.5, 2.5) : 0;
  const marks = [
    bend ? arc(f, -half, 0, half, 0, 0, bend, width, 1) : seg(f, -half, 0, half, 0, width, 1),
  ];
  const nodes = f.int(3, 5);
  for (let i = 0; i < nodes; i += 1) {
    const t = (i + 0.5) / nodes;
    const u = -half + t * half * 2 + f.r(-0.6, 0.6);
    const v = bend ? 2 * t * (1 - t) * bend : 0;
    marks.push(disk(f, "point", u, v, f.r(0.9, 1.5), 0.7));
  }
  return marks;
}

/** Orthogonal Balance · Adaptive Module · Engaging */
function openHall(f: Frame): LocalMark[] {
  const marks: LocalMark[] = [];
  if (f.chance(0.6)) marks.push(disk(f, "point", 0, 0, f.r(1.6, 2.4), 0.5));
  const rows = f.int(2, 3);
  const cols = f.int(2, 3);
  const pitch = f.r(2.6, 4.2);
  const width = f.r(1.1, 1.7);
  for (let i = 0; i < rows; i += 1) {
    const v = (i - (rows - 1) / 2) * pitch;
    marks.push(seg(f, -7.2, v, 7.2, v, width, 0.7));
  }
  for (let i = 0; i < cols; i += 1) {
    const u = (i - (cols - 1) / 2) * pitch;
    marks.push(seg(f, u, -7.2, u, 7.2, width, 0.7));
  }
  return marks;
}

/** Articulated · Connected Module · Immersive */
function terraced(f: Frame): LocalMark[] {
  const steps = f.int(3, 4);
  const pitch = f.r(3, 3.8);
  const shift = f.r(0.6, 1.4) * (f.chance(0.5) ? -1 : 1);
  const marks: LocalMark[] = [];
  for (let i = 0; i < steps; i += 1) {
    const v = (i - (steps - 1) / 2) * pitch;
    const half = 7 - i * f.r(0.8, 1.4);
    const u = i * shift;
    marks.push(seg(f, u - half, v, u + half, v, f.r(1, 1.4), 0.6 + i * 0.15));
  }
  const connector = f.r(-2, 2);
  marks.push(seg(f, connector, -((steps - 1) / 2) * pitch - 0.5, connector + shift * (steps - 1), ((steps - 1) / 2) * pitch + 0.5, 1, 0.5));
  return marks;
}

/** Restrained · Rigid Module · Introspective */
function flatDeepPlan(f: Frame): LocalMark[] {
  const marks = [disk(f, "point", 0, 0, f.r(1, 1.5), 1)];
  const rows = f.int(2, 3);
  const cols = f.int(2, 3);
  const cell = f.r(2.2, 3);
  const width = f.r(0.6, 0.9);
  const halfU = ((cols - 1) / 2) * cell + cell / 2;
  const halfV = ((rows - 1) / 2) * cell + cell / 2;
  for (let i = 0; i <= rows; i += 1) {
    const v = -halfV + i * cell;
    marks.push(seg(f, -halfU, v, halfU, v, width, 0.9));
  }
  for (let i = 0; i <= cols; i += 1) {
    const u = -halfU + i * cell;
    marks.push(seg(f, u, -halfV, u, halfV, width, 0.9));
  }
  return marks;
}

/** Radial Balance · Integrated Module · Partially Engaging */
function voidEdge(f: Frame): LocalMark[] {
  const ringR = f.r(2.8, 4.2);
  const edge = 6.4;
  const marks = [disk(f, "ring", f.r(-2, 2), edge - ringR + 1.2, ringR, 1)];
  marks.push(seg(f, -7, edge + 0.8, 7, edge + 0.8, f.r(1, 1.4), 0.55));
  const modules = f.int(1, 2);
  for (let i = 0; i < modules; i += 1) {
    marks.push(disk(f, "point", f.r(-5, 5), f.r(-4.5, -1.5), f.r(1.6, 2.2), 0.4));
  }
  return marks;
}

/** Dynamic · Collective Modules · Interactive */
function undulated(f: Frame): LocalMark[] {
  const waves = f.int(2, 3);
  const span = 15;
  const step = span / waves;
  const amp = f.r(2, 3.5);
  const width = f.r(1.2, 1.8);
  const marks: LocalMark[] = [];
  for (let i = 0; i < waves; i += 1) {
    const u1 = -span / 2 + i * step;
    const u2 = u1 + step;
    marks.push(arc(f, u1, 0, u2, 0, (u1 + u2) / 2, amp * (i % 2 ? -1 : 1), width, 0.5));
  }
  const modules = f.int(3, 5);
  for (let i = 0; i < modules; i += 1) {
    const u = -span / 2 + ((i + 0.5) / modules) * span;
    const v = (i % 2 ? -1 : 1) * f.r(2.5, 3.5);
    marks.push(disk(f, "point", u, v, f.r(1.4, 2), 0.75));
  }
  return marks;
}

/**
 * Enclosed Threshold · Incidental Threshold · Contained Commons
 * Nested oval loops around an empty bowl. Solid stacked disks collapse into
 * one hole, so each tier is a closed corridor the slime can thicken.
 */
function ovalLoop(f: Frame, rx: number, ry: number, width: number, strength: number): LocalMark[] {
  const lift = ry * 1.62;
  return [
    arc(f, -rx, 0, rx, 0, 0, -lift, width, strength),
    arc(f, -rx, 0, rx, 0, 0, lift, width, strength),
  ];
}

function steppedAmphitheater(f: Frame, kind?: AttractorKind): LocalMark[] {
  const tiers = f.int(3, 4);
  const stretch = kind === "ring" ? f.r(1.05, 1.2) : f.r(1.45, 1.85);
  const innerRx = f.r(2.8, 3.3);
  const step = f.r(1.35, 1.7);
  const marks: LocalMark[] = [disk(f, "ring", 0, 0, f.r(1.35, 1.75), 0.85, true)];

  for (let i = 0; i < tiers; i += 1) {
    const rx = innerRx + i * step;
    const ry = rx / stretch;
    const width = 0.52 + i * 0.05;
    const strength = 1.22 - i * 0.08;
    if (kind === "line") {
      const sides = 8;
      for (let s = 0; s < sides; s += 1) {
        const a0 = (s / sides) * Math.PI * 2;
        const a1 = ((s + 1) / sides) * Math.PI * 2;
        marks.push(seg(f, Math.cos(a0) * rx, Math.sin(a0) * ry, Math.cos(a1) * rx, Math.sin(a1) * ry, width, strength));
      }
    } else if (kind === "point") {
      const seats = f.int(4, 11);
      for (let s = 0; s < seats; s += 1) {
        if (f.chance(0.12)) continue;
        const a = (s / seats) * Math.PI * 2 + f.r(-0.2, 0.2);
        marks.push(disk(f, "point", Math.cos(a) * rx, Math.sin(a) * ry, f.r(0.35, 2.3), strength * f.r(0.55, 1.15)));
      }
    } else {
      marks.push(...ovalLoop(f, rx, ry, width, strength));
    }
  }

  const outerRy = (innerRx + (tiers - 1) * step) / stretch;
  const crown = f.int(2, 3);
  for (let i = 0; i < crown; i += 1) {
    const u = (i - (crown - 1) / 2) * f.r(2.2, 3.2);
    marks.push(disk(f, "point", u, -outerRy - f.r(1.1, 1.8), f.r(0.7, 1.1), 0.32));
  }
  return marks;
}

/** Visually Exposed Core · Isolated Anchor · Expansive Commons */
function voidField(f: Frame): LocalMark[] {
  const ringR = f.r(4, 6);
  const marks = [disk(f, "ring", 0, 0, ringR, 1)];
  const anchors = f.int(2, 4);
  const start = f.r(0, Math.PI * 2);
  for (let i = 0; i < anchors; i += 1) {
    const a = start + (i / anchors) * Math.PI * 2 + f.r(-0.3, 0.3);
    const d = ringR + f.r(2.4, 3.4);
    marks.push(disk(f, "point", Math.cos(a) * d, Math.sin(a) * d, f.r(1.8, 2.6), 0.3));
  }
  return marks;
}

/** Modular Nodes · Visually Disturbed Nodes · Distributed Retreat */
function insertedHorizontalPlate(f: Frame): LocalMark[] {
  const v = f.r(-1.5, 1.5);
  const marks = [seg(f, -8, v, 8, v, f.r(1.2, 1.6), 1.15)];
  const nodes = f.int(3, 5);
  for (let i = 0; i < nodes; i += 1) {
    const u = -7 + ((i + 0.5) / nodes) * 14 + f.r(-0.8, 0.8);
    const side = (i % 2 ? -1 : 1) * f.r(3, 5.5);
    marks.push(disk(f, "point", u, v + side, f.r(1.2, 2), 0.35));
  }
  return marks;
}

/** Magnetic Enclosed Core · Isolated Attractor · Immersive Core */
function containedRoomWithinVolume(f: Frame): LocalMark[] {
  const marks = [disk(f, "point", 0, 0, f.r(1.2, 1.8), 1)];
  if (f.chance(0.6)) {
    const a = f.r(0, Math.PI * 2);
    const d = f.r(1.8, 2.4);
    marks.push(disk(f, "point", Math.cos(a) * d, Math.sin(a) * d, f.r(1, 1.4), 0.9));
  }
  const ringR = f.r(2.8, 3.8);
  marks.push(disk(f, "ring", 0, 0, ringR, 0.55));
  const pulls = f.int(2, 4);
  const start = f.r(0, Math.PI * 2);
  for (let i = 0; i < pulls; i += 1) {
    const a = start + (i / pulls) * Math.PI * 2 + f.r(-0.3, 0.3);
    const far = f.r(5.5, 7.5);
    marks.push(seg(f, Math.cos(a) * far, Math.sin(a) * far, Math.cos(a) * (ringR + 0.5), Math.sin(a) * (ringR + 0.5), f.r(0.8, 1.1), 0.5));
  }
  return marks;
}

/** Porous Spine · Integrated Nodes · Social Commons */
function linearEdgeGallery(f: Frame): LocalMark[] {
  const v = f.r(5.5, 6.5);
  const marks = [seg(f, -7, v, 7, v, f.r(1, 1.3), 1)];
  const nodes = f.int(3, 4);
  for (let i = 0; i < nodes; i += 1) {
    const u = -6 + ((i + 0.5) / nodes) * 12 + f.r(-0.6, 0.6);
    marks.push(disk(f, "point", u, v, f.r(1.1, 1.5), 0.7));
  }
  const pores = f.int(2, 3);
  for (let i = 0; i < pores; i += 1) {
    const u = -6.5 + ((i + 0.5) / pores) * 13 + f.r(-1, 1);
    marks.push(seg(f, u, v - 0.5, u, v - f.r(3, 5), 0.8, 0.4));
  }
  return marks;
}

const GENERATORS: Record<string, { angles: number[]; build: (f: Frame) => LocalMark[] }> = {
  "vertical-void": { angles: ANY, build: verticalVoid },
  "compressed-sequential": { angles: ANY, build: compressedSequential },
  "continuous-hall": { angles: ANY, build: continuousHall },
  "topographic-ground-field": { angles: ANY, build: topographicGroundField },
  "linear-gallery": { angles: ANY, build: linearGallery },
  "open-hall": { angles: ORTHO, build: openHall },
  terraced: { angles: ANY, build: terraced },
  "flat-deep-plan": { angles: ORTHO, build: flatDeepPlan },
  "void-edge": { angles: CARDINAL, build: voidEdge },
  undulated: { angles: ANY, build: undulated },
  "stepped-amphitheater": { angles: CARDINAL, build: steppedAmphitheater },
  "void-field": { angles: ANY, build: voidField },
  "inserted-horizontal-plate": { angles: ORTHO, build: insertedHorizontalPlate },
  "contained-room-within-volume": { angles: ANY, build: containedRoomWithinVolume },
  "linear-edge-gallery": { angles: CARDINAL, build: linearEdgeGallery },
};

/** Falls back to the recipe marks, jittered, for an archetype without a generator. */
function jitteredRecipe(f: Frame, recipe: FieldAttractor[]): FieldAttractor[] {
  return recipe.map((item) => ({
    ...item,
    x: lim(item.x + f.r(-1, 1)),
    y: lim(item.y + f.r(-1, 1)),
    radius: item.radius == null ? undefined : item.radius * f.r(0.8, 1.25),
  }));
}

export function runAttractorsFor(
  archetypeId: string,
  seed: number,
  recipe: FieldAttractor[],
  kind?: AttractorKind,
): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0xa77ac7);
  const f = frame(rng);
  if (archetypeId === "stepped-amphitheater") {
    return place(steppedAmphitheater(f, kind), rng, CARDINAL, kind !== "point");
  }
  const generator = GENERATORS[archetypeId];
  if (!generator) return jitteredRecipe(f, recipe);
  return place(generator.build(f), rng, generator.angles);
}

function pathPoint(mark: FieldAttractor, t: number) {
  const x2 = mark.x2 ?? mark.x;
  const y2 = mark.y2 ?? mark.y;
  if (mark.kind === "curve") {
    const cx = mark.cx ?? (mark.x + x2) / 2;
    const cy = mark.cy ?? (mark.y + y2) / 2;
    const u = 1 - t;
    return { x: u * u * mark.x + 2 * u * t * cx + t * t * x2, y: u * u * mark.y + 2 * u * t * cy + t * t * y2 };
  }
  return { x: mark.x + (x2 - mark.x) * t, y: mark.y + (y2 - mark.y) * t };
}

function pathLength(mark: FieldAttractor) {
  let length = 0;
  let prev = pathPoint(mark, 0);
  for (let i = 1; i <= 16; i += 1) {
    const next = pathPoint(mark, i / 16);
    length += Math.hypot(next.x - prev.x, next.y - prev.y);
    prev = next;
  }
  return length;
}

/**
 * A corridor becomes a row of disks along its path; a disk keeps its place.
 * Points are small nodes the network gathers on. Circles are large voids it loops around.
 */
function asDisks(mark: FieldAttractor, kind: "point" | "ring", rng: Rng, runScale: number): FieldAttractor[] {
  const base = Math.max(0.45, mark.radius ?? 1.6);
  const hole = kind === "ring";
  const size = (value: number) =>
    kind === "point"
      ? Math.min(3.2, Math.max(0.3, value * runScale * (0.45 + rng() * 1.1)))
      : Math.min(4.8, Math.max(0.8, value * runScale * (0.55 + rng() * 0.9)));
  if (mark.kind === "point" || mark.kind === "ring") {
    return [{ kind, x: mark.x, y: mark.y, radius: size(base), strength: (mark.strength ?? 1) * (0.6 + rng() * 0.8), hole }];
  }
  const spacing = kind === "point" ? 1.4 + rng() * 2.4 : 2 + rng() * 2.2;
  const count = Math.max(1, Math.round(pathLength(mark) / spacing));
  const beads: FieldAttractor[] = [];
  for (let i = 0; i < count; i += 1) {
    if (rng() < 0.1) continue;
    const p = pathPoint(mark, (i + 0.5) / count + (rng() - 0.5) * 0.08);
    beads.push({ kind, x: p.x, y: p.y, radius: size(base), strength: (mark.strength ?? 1) * (0.55 + rng() * 0.9), hole });
  }
  return beads;
}

/** A disk becomes a corridor across its diameter; a curve straightens to its ends. */
function asLine(mark: FieldAttractor, rng: Rng): FieldAttractor {
  if (mark.kind === "line") return { ...mark };
  if (mark.kind === "curve") return { kind: "line", x: mark.x, y: mark.y, x2: mark.x2, y2: mark.y2, radius: mark.radius, strength: mark.strength };
  const r = Math.max(0.6, mark.radius ?? 1.6);
  const a = rng() * Math.PI;
  return {
    kind: "line",
    x: lim(mark.x - Math.cos(a) * r),
    y: lim(mark.y - Math.sin(a) * r),
    x2: lim(mark.x + Math.cos(a) * r),
    y2: lim(mark.y + Math.sin(a) * r),
    radius: Math.max(0.6, r * 0.45),
    strength: mark.strength,
  };
}

/** A disk becomes an arc along its rim; a line bends by a fraction of its length. */
function asCurve(mark: FieldAttractor, rng: Rng): FieldAttractor {
  if (mark.kind === "curve") return { ...mark };
  if (mark.kind === "line") {
    const x2 = mark.x2 ?? mark.x;
    const y2 = mark.y2 ?? mark.y;
    const dx = x2 - mark.x;
    const dy = y2 - mark.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = (rng() < 0.5 ? -1 : 1) * length * (0.2 + rng() * 0.15);
    return {
      ...mark,
      kind: "curve",
      cx: lim((mark.x + x2) / 2 + (-dy / length) * bend),
      cy: lim((mark.y + y2) / 2 + (dx / length) * bend),
    };
  }
  const r = Math.max(0.6, mark.radius ?? 1.6);
  const a = rng() * Math.PI * 2;
  return {
    kind: "curve",
    x: lim(mark.x + Math.cos(a) * r),
    y: lim(mark.y + Math.sin(a) * r),
    x2: lim(mark.x + Math.cos(a + Math.PI) * r),
    y2: lim(mark.y + Math.sin(a + Math.PI) * r),
    cx: lim(mark.x + Math.cos(a + Math.PI / 2) * r * 2),
    cy: lim(mark.y + Math.sin(a + Math.PI / 2) * r * 2),
    radius: Math.max(0.6, r * 0.4),
    strength: mark.strength,
  };
}

const SINGLE_VOID = new Set(["vertical-void", "void-edge"]);

function primaryVoidMark(marks: FieldAttractor[]): FieldAttractor {
  const holes = marks.filter((mark) => mark.hole || mark.kind === "ring");
  const pool = holes.length ? holes : marks;
  return [...pool].sort((a, b) => (b.radius ?? 0) - (a.radius ?? 0))[0] ?? marks[0];
}

function oneDisk(mark: FieldAttractor, kind: "point" | "ring", rng: Rng, runScale: number): FieldAttractor {
  return asDisks(mark, kind, rng, runScale)[0] ?? { ...mark, kind, hole: true };
}

/** One void stays one void. The approach stays a corridor, never a second hole. */
function singleVoidAsKind(marks: FieldAttractor[], kind: FieldAttractor["kind"], rng: Rng): FieldAttractor[] {
  if (!marks.length) return marks;
  const voidMark = primaryVoidMark(marks);
  const approach = marks.find((mark) => mark !== voidMark && (mark.kind === "line" || mark.kind === "curve"));
  const runScale = kind === "point" ? 0.85 + rng() * 0.55 : 0.8 + rng() * 0.5;
  let voidOut: FieldAttractor;
  if (kind === "point" || kind === "ring") voidOut = { ...oneDisk(voidMark, kind, rng, runScale), hole: true };
  else if (kind === "line") voidOut = asLine(voidMark, rng);
  else voidOut = asCurve(voidMark, rng);
  if (!approach) return [voidOut];
  if (kind === "line") return [voidOut, asLine(approach, rng)];
  if (kind === "curve") return [voidOut, asCurve(approach, rng)];
  return [voidOut, { ...approach, kind: approach.kind === "curve" ? "curve" : "line" }];
}

/** Rewrites a layout so every mark is one attractor type while keeping its placement. */
export function attractorsAsKind(
  marks: FieldAttractor[],
  kind: FieldAttractor["kind"],
  seed: number,
  archetypeId?: string,
): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x5eed);
  if (archetypeId && SINGLE_VOID.has(archetypeId)) return singleVoidAsKind(marks, kind, rng);
  const runScale = kind === "point" ? 0.4 + rng() * 2.2 : 0.65 + rng() * 1.5;
  if (kind === "point" || kind === "ring") return marks.flatMap((mark) => asDisks(mark, kind, rng, runScale));
  if (kind === "line") return marks.map((mark) => asLine(mark, rng));
  return marks.map((mark) => asCurve(mark, rng));
}
