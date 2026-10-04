import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import { attractorsFromCompressedSequential, planCompressedSequential } from "./run-compressed-sequential";
import { attractorsFromContinuousHall, planContinuousHall } from "./run-continuous-hall";
import { attractorsFromLinearGallery, planLinearGallery } from "./run-linear-gallery";
import { attractorsFromTopographic, planTopographicGroundField } from "./run-topographic-ground-field";
import { attractorsFromVerticalVoidPlan, planVerticalVoid } from "./run-morphology";
import type { AttractorKind, FieldAttractor } from "./types";

/**
 * Attractor layouts for the run grid. Each run is an independent realization of
 * the same architectural DNA. There is no universal point/circle/line/curve
 * banding. The seed varies composition, proportion, branching, and approach
 * while the archetype's spatial identity stays readable.
 *
 * Points and rings are solid disks the network wraps around. Lines and curves
 * are corridors the network gathers along; their radius is the corridor width.
 */

type Rng = () => number;

type Frame = {
  r: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
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
    pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))],
  };
}

/** Rotates, mirrors, drifts, and scales a layout so every mark lands inside the field. */
function place(layout: LocalMark[], rng: Rng, angles: number[], hold = false): FieldAttractor[] {
  const angle = angles[Math.floor(rng() * angles.length)] + (rng() - 0.5) * (hold ? 0.12 : 0.3);
  const flip = rng() < 0.5 ? -1 : 1;
  const driftSpan = hold ? 2.8 : 5.2;
  const drift = { x: (rng() - 0.5) * driftSpan, y: (rng() - 0.5) * driftSpan };
  const grow = hold ? 0.82 + rng() * 0.28 : 0.58 + rng() * 0.72;
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

function approachPath(
  f: Frame,
  fromU: number,
  fromV: number,
  toU: number,
  toV: number,
  width: number,
  strength: number,
): LocalMark {
  if (f.chance(0.55)) {
    const midU = (fromU + toU) / 2 + f.r(-2.8, 2.8);
    const midV = (fromV + toV) / 2 + f.r(-2.8, 2.8);
    return arc(f, fromU, fromV, toU, toV, midU, midV, width, strength);
  }
  return seg(f, fromU, fromV, toU, toV, width, strength);
}

/** Dynamic Core · Open Threshold · Visual Immersion — realized in run-morphology. */
function verticalVoid(_f: Frame): LocalMark[] {
  return [];
}

/** Geometry Compression · Sequential Release · Immersive Transition — realized in run-compressed-sequential. */
function compressedSequential(_f: Frame): LocalMark[] {
  return [];
}

/** Radial Convergence · Integrated Form · Dynamic Engagement — realized in run-continuous-hall. */
function continuousHall(_f: Frame): LocalMark[] {
  return [];
}

/** Sculpted Ground · Distributed Flow · Shared Engagement — realized in run-topographic-ground-field. */
function topographicGroundField(_f: Frame): LocalMark[] {
  return [];
}

/** Linear Fragmentation · Connected Progression · Intuitive Guidance — realized in run-linear-gallery. */
function linearGallery(_f: Frame): LocalMark[] {
  return [];
}

/** Orthogonal Balance · Adaptive Module · Engaging */
function openHall(f: Frame): LocalMark[] {
  const marks: LocalMark[] = [];
  const rows = f.int(2, 4);
  const cols = f.int(2, 4);
  const pitchU = f.r(2.4, 4.8);
  const pitchV = f.r(2.4, 4.8);
  const width = f.r(0.75, 1.8);
  const spanU = ((cols - 1) / 2) * pitchU + f.r(1.8, 3.2);
  const spanV = ((rows - 1) / 2) * pitchV + f.r(1.8, 3.2);
  for (let i = 0; i < rows; i += 1) {
    const v = (i - (rows - 1) / 2) * pitchV + f.r(-0.4, 0.4);
    marks.push(seg(f, -spanU, v, spanU, v, width * f.r(0.75, 1.15), f.r(0.45, 0.8)));
  }
  for (let i = 0; i < cols; i += 1) {
    const u = (i - (cols - 1) / 2) * pitchU + f.r(-0.4, 0.4);
    marks.push(seg(f, u, -spanV, u, spanV, width * f.r(0.75, 1.15), f.r(0.45, 0.8)));
  }
  const modules = f.int(3, 7);
  for (let i = 0; i < modules; i += 1) {
    marks.push(
      disk(
        f,
        "point",
        ((i % cols) - (cols - 1) / 2) * pitchU + f.r(-0.8, 0.8),
        (Math.floor(i / cols) - (rows - 1) / 2) * pitchV + f.r(-0.8, 0.8),
        f.r(0.8, 1.8),
        f.r(0.28, 0.55),
      ),
    );
  }
  return marks;
}

/** Articulated · Connected Module · Immersive */
function terraced(f: Frame): LocalMark[] {
  const steps = f.int(3, 6);
  const pitch = f.r(2.2, 4.2);
  const shift = f.r(0.4, 2.2) * (f.chance(0.5) ? -1 : 1);
  const marks: LocalMark[] = [];
  for (let i = 0; i < steps; i += 1) {
    const v = (i - (steps - 1) / 2) * pitch;
    const half = f.r(4.2, 8.2) - i * f.r(0.2, 1.6);
    const u = i * shift + f.r(-0.6, 0.6);
    const thick = f.r(0.75, 1.7);
    if (f.chance(0.35)) marks.push(arc(f, u - half, v, u + half, v, u, v + f.r(-1.6, 1.6), thick, 0.5 + i * 0.12));
    else marks.push(seg(f, u - half, v, u + half, v, thick, 0.5 + i * 0.12));
  }
  const links = f.int(1, 3);
  for (let i = 0; i < links; i += 1) {
    const connector = f.r(-3.5, 3.5);
    marks.push(
      approachPath(
        f,
        connector,
        -((steps - 1) / 2) * pitch - 0.4,
        connector + shift * (steps - 1) + f.r(-1, 1),
        ((steps - 1) / 2) * pitch + 0.4,
        f.r(0.7, 1.3),
        f.r(0.35, 0.65),
      ),
    );
  }
  return marks;
}

/** Restrained · Rigid Module · Introspective */
function flatDeepPlan(f: Frame): LocalMark[] {
  const rows = f.int(2, 4);
  const cols = f.int(2, 4);
  const cell = f.r(1.8, 3.2);
  const width = f.r(0.42, 0.95);
  const halfU = ((cols - 1) / 2) * cell + cell / 2;
  const halfV = ((rows - 1) / 2) * cell + cell / 2;
  const marks: LocalMark[] = [];
  for (let i = 0; i <= rows; i += 1) {
    const v = -halfV + i * cell;
    marks.push(seg(f, -halfU, v, halfU, v, width, f.r(0.7, 1.05)));
  }
  for (let i = 0; i <= cols; i += 1) {
    const u = -halfU + i * cell;
    marks.push(seg(f, u, -halfV, u, halfV, width, f.r(0.7, 1.05)));
  }
  const clusters = f.int(2, 5);
  for (let i = 0; i < clusters; i += 1) {
    marks.push(
      disk(
        f,
        "point",
        f.r(-halfU + 0.6, halfU - 0.6),
        f.r(-halfV + 0.6, halfV - 0.6),
        f.r(0.55, 1.35),
        f.r(0.55, 1.05),
      ),
    );
  }
  return marks;
}

/** Radial Balance · Integrated Module · Partially Engaging */
function voidEdge(f: Frame): LocalMark[] {
  const ringR = f.r(2.2, 5.2);
  const edge = f.r(5.4, 7.4);
  const slide = f.r(-3.6, 3.6);
  const marks = [disk(f, "ring", slide, edge - ringR + f.r(0.4, 1.8), ringR, f.r(0.85, 1.2), true)];
  marks.push(seg(f, -8, edge + 0.6, 8, edge + 0.6, f.r(0.75, 1.7), f.r(0.4, 0.7)));
  const modules = f.int(2, 5);
  for (let i = 0; i < modules; i += 1) {
    const u = f.r(-6.2, 6.2);
    const v = f.r(-5.4, -0.4);
    marks.push(disk(f, "point", u, v, f.r(1.1, 2.4), f.r(0.28, 0.55)));
    if (f.chance(0.6)) {
      marks.push(approachPath(f, u, v, slide + f.r(-1.2, 1.2), edge - ringR, f.r(0.5, 1.2), 0.35));
    }
  }
  return marks;
}

/** Dynamic · Collective Modules · Interactive */
function undulated(f: Frame): LocalMark[] {
  const waves = f.int(2, 5);
  const span = f.r(12, 16.5);
  const step = span / waves;
  const amp = f.r(1.6, 4.6);
  const width = f.r(0.85, 2.2);
  const marks: LocalMark[] = [];
  for (let i = 0; i < waves; i += 1) {
    const u1 = -span / 2 + i * step;
    const u2 = u1 + step;
    marks.push(arc(f, u1, f.r(-1.2, 1.2), u2, f.r(-1.2, 1.2), (u1 + u2) / 2, amp * (i % 2 ? -1 : 1) * f.r(0.6, 1.2), width, f.r(0.35, 0.7)));
  }
  const modules = f.int(4, 8);
  const clusters: Array<{ u: number; v: number }> = [];
  for (let i = 0; i < modules; i += 1) {
    const u = -span / 2 + ((i + 0.5) / modules) * span + f.r(-1.2, 1.2);
    const v = (i % 2 ? -1 : 1) * f.r(1.8, 5.2);
    clusters.push({ u, v });
    marks.push(disk(f, "point", u, v, f.r(1.1, 2.5), f.r(0.45, 0.9)));
  }
  for (let i = 1; i < clusters.length; i += 1) {
    if (!f.chance(0.75)) continue;
    const prev = clusters[i - 1];
    const next = clusters[i];
    marks.push(approachPath(f, prev.u, prev.v, next.u, next.v, f.r(0.5, 1.2), 0.35));
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

function steppedAmphitheater(f: Frame): LocalMark[] {
  const tiers = f.int(3, 6);
  const stretch = f.r(1.08, 1.95);
  const innerRx = f.r(2.2, 3.6);
  const step = f.r(1.05, 1.9);
  const marks: LocalMark[] = [disk(f, "ring", 0, 0, f.r(1.1, 2.1), f.r(0.7, 1.05), true)];
  const mode = f.pick(["oval", "polygon", "seats", "bands"] as const);

  for (let i = 0; i < tiers; i += 1) {
    const rx = innerRx + i * step;
    const ry = rx / stretch;
    const width = f.r(0.42, 0.85) + i * 0.04;
    const strength = 1.25 - i * 0.08;
    if (mode === "polygon") {
      const sides = f.int(6, 10);
      for (let s = 0; s < sides; s += 1) {
        const a0 = (s / sides) * Math.PI * 2;
        const a1 = ((s + 1) / sides) * Math.PI * 2;
        marks.push(seg(f, Math.cos(a0) * rx, Math.sin(a0) * ry, Math.cos(a1) * rx, Math.sin(a1) * ry, width, strength));
      }
    } else if (mode === "seats") {
      const seats = f.int(5, 12);
      for (let s = 0; s < seats; s += 1) {
        if (f.chance(0.1)) continue;
        const a = (s / seats) * Math.PI * 2 + f.r(-0.18, 0.18);
        marks.push(disk(f, "point", Math.cos(a) * rx, Math.sin(a) * ry, f.r(0.35, 1.6), strength * f.r(0.55, 1.1)));
      }
    } else if (mode === "bands") {
      marks.push(arc(f, -rx, -ry * 0.15, rx, -ry * 0.15, 0, -ry, width, strength));
      marks.push(arc(f, -rx, ry * 0.15, rx, ry * 0.15, 0, ry, width, strength * 0.85));
    } else {
      marks.push(...ovalLoop(f, rx, ry, width, strength));
    }
  }

  const outerRy = (innerRx + (tiers - 1) * step) / stretch;
  const approaches = f.int(1, 3);
  for (let i = 0; i < approaches; i += 1) {
    const a = f.pick([-Math.PI / 2, Math.PI / 2, 0, Math.PI]) + f.r(-0.35, 0.35);
    marks.push(
      approachPath(
        f,
        Math.cos(a) * (outerRy + f.r(1.4, 2.8)),
        Math.sin(a) * (outerRy + f.r(1.4, 2.8)),
        Math.cos(a) * (innerRx * 0.4),
        Math.sin(a) * (innerRx * 0.4),
        f.r(0.55, 1.1),
        0.38,
      ),
    );
  }
  return marks;
}

/** Visually Exposed Core · Isolated Anchor · Expansive Commons */
function voidField(f: Frame): LocalMark[] {
  const coreU = f.r(-2.8, 2.8);
  const coreV = f.r(-2.8, 2.8);
  const ringR = f.r(2.8, 6.6);
  const marks = [disk(f, "ring", coreU, coreV, ringR, f.r(0.75, 1.15), true)];
  const framing = f.int(2, 6);
  const start = f.r(0, Math.PI * 2);
  for (let i = 0; i < framing; i += 1) {
    const a = start + (i / framing) * Math.PI * 2 + f.r(-0.4, 0.4);
    const d = ringR + f.r(2.2, 5.4);
    marks.push(disk(f, "point", coreU + Math.cos(a) * d, coreV + Math.sin(a) * d, f.r(1.2, 2.8), f.r(0.18, 0.38)));
  }
  const paths = f.int(1, 4);
  for (let i = 0; i < paths; i += 1) {
    const a = f.r(-Math.PI, Math.PI);
    const far = ringR + f.r(3.4, 6.4);
    marks.push(
      approachPath(
        f,
        coreU + Math.cos(a) * far,
        coreV + Math.sin(a) * far,
        coreU + Math.cos(a) * (ringR + f.r(0.8, 2.2)),
        coreV + Math.sin(a) * (ringR + f.r(0.8, 2.2)),
        f.r(0.55, 1.5),
        f.r(0.18, 0.36),
      ),
    );
  }
  return marks;
}

/** Modular Nodes · Visually Disturbed Nodes · Distributed Retreat */
function insertedHorizontalPlate(f: Frame): LocalMark[] {
  const nodes = f.int(3, 7);
  const marks: LocalMark[] = [];
  const plates: Array<{ u: number; v: number }> = [];
  for (let i = 0; i < nodes; i += 1) {
    const u = -7.4 + ((i + 0.5) / nodes) * 14.8 + f.r(-1.4, 1.4);
    const v = (i % 2 ? -1 : 1) * f.r(1.6, 5.8) + f.r(-1.2, 1.2);
    plates.push({ u, v });
    marks.push(disk(f, f.chance(0.25) ? "ring" : "point", u, v, f.r(1.0, 2.4), f.r(0.55, 1.05)));
    if (f.chance(0.45)) {
      marks.push(seg(f, u - f.r(1.4, 2.6), v, u + f.r(1.4, 2.6), v, f.r(0.7, 1.3), 0.7));
    }
  }
  for (let i = 0; i < plates.length - 1; i += 1) {
    const a = plates[i];
    const b = plates[i + 1];
    marks.push(approachPath(f, a.u, a.v, b.u, b.v, f.r(0.55, 1.3), f.r(0.35, 0.7)));
  }
  if (f.chance(0.5) && plates.length > 2) {
    const a = plates[0];
    const b = plates[plates.length - 1];
    marks.push(approachPath(f, a.u, a.v, b.u, b.v, f.r(0.45, 1), 0.3));
  }
  return marks;
}

/** Magnetic Enclosed Core · Isolated Attractor · Immersive Core */
function containedRoomWithinVolume(f: Frame): LocalMark[] {
  const roomU = f.r(-1.8, 1.8);
  const roomV = f.r(-1.8, 1.8);
  const roomR = f.r(0.9, 2.1);
  const ringR = roomR + f.r(1.8, 3.6);
  const marks = [disk(f, "point", roomU, roomV, roomR, f.r(0.95, 1.25))];
  marks.push(disk(f, "ring", roomU + f.r(-0.4, 0.4), roomV + f.r(-0.4, 0.4), ringR, f.r(0.45, 0.8)));
  const outer = f.int(1, 3);
  for (let i = 0; i < outer; i += 1) {
    marks.push(disk(f, "ring", roomU, roomV, ringR + (i + 1) * f.r(1.1, 2.0), f.r(0.22, 0.45)));
  }
  const openings = f.int(1, 4);
  const start = f.r(0, Math.PI * 2);
  for (let i = 0; i < openings; i += 1) {
    const a = start + (i / openings) * Math.PI * 2 + f.r(-0.4, 0.4);
    const far = ringR + f.r(2.8, 6.4);
    marks.push(
      approachPath(
        f,
        roomU + Math.cos(a) * far,
        roomV + Math.sin(a) * far,
        roomU + Math.cos(a) * (roomR + 0.35),
        roomV + Math.sin(a) * (roomR + 0.35),
        f.r(0.55, 1.3),
        f.r(0.4, 0.75),
      ),
    );
  }
  return marks;
}

/** Porous Spine · Integrated Nodes · Social Commons */
function linearEdgeGallery(f: Frame): LocalMark[] {
  const v = f.r(4.6, 7.1);
  const bend = f.chance(0.55) ? f.r(-2.4, 2.4) : 0;
  const half = f.r(6.2, 8);
  const marks = [
    bend ? arc(f, -half, v, half, v, 0, v + bend, f.r(0.85, 1.7), 1.05) : seg(f, -half, v, half, v, f.r(0.85, 1.7), 1.05),
  ];
  const nodes = f.int(3, 7);
  for (let i = 0; i < nodes; i += 1) {
    const u = -half + ((i + 0.5) / nodes) * half * 2 + f.r(-0.9, 0.9);
    marks.push(disk(f, "point", u, v + (bend ? bend * 0.25 : 0), f.r(0.9, 2.0), f.r(0.5, 0.9)));
  }
  const pores = f.int(2, 5);
  for (let i = 0; i < pores; i += 1) {
    const u = -half + ((i + 0.5) / pores) * half * 2 + f.r(-1.3, 1.3);
    marks.push(approachPath(f, u, v - 0.4, u + f.r(-1.2, 1.2), v - f.r(2.4, 6.2), f.r(0.5, 1.2), f.r(0.28, 0.55)));
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

/** Legal layout orientations (radians) for an archetype. Read-only copy; no generator means no rotation. */
export function legalOrientationsFor(archetypeId: string): number[] {
  return [...(GENERATORS[archetypeId]?.angles ?? [0])];
}

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
  _kind?: AttractorKind,
  attempt = 0,
  index = 0,
): FieldAttractor[] {
  if (archetypeId === "vertical-void") {
    return attractorsFromVerticalVoidPlan(planVerticalVoid(seed, attempt), seed, attempt);
  }
  if (archetypeId === "compressed-sequential") {
    return attractorsFromCompressedSequential(planCompressedSequential(seed, attempt, index), seed, attempt);
  }
  if (archetypeId === "continuous-hall") {
    return attractorsFromContinuousHall(planContinuousHall(seed, attempt, index), seed, attempt);
  }
  if (archetypeId === "topographic-ground-field") {
    return attractorsFromTopographic(planTopographicGroundField(seed, attempt, index), seed, attempt);
  }
  if (archetypeId === "linear-gallery") {
    return attractorsFromLinearGallery(planLinearGallery(seed, attempt, index), seed, attempt);
  }
  const rng = mulberry32(seed ^ 0xa77ac7 ^ (attempt * 0x27d4eb2d));
  const f = frame(rng);
  const generator = GENERATORS[archetypeId];
  if (!generator) return jitteredRecipe(f, recipe);
  return place(generator.build(f), rng, generator.angles, archetypeId === "stepped-amphitheater");
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
