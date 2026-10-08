import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, BiologicalTranslation, FieldAttractor, FieldSnapshot, SpatialRecipe } from "./types";

/**
 * Flat Deep Plan — Restrained, Rigid Module, Introspective.
 * One continuous deep plate (low plate articulation). The straight half is a
 * different figure in every cell: two rooms, a deep slot, a corridor, a side
 * bar, a core, rings, a cross, a court, a notch, a T, a jog, a comb, an end
 * slab, a perimeter, unequal rooms. The other half stays curved. Walls stay
 * hair-thin.
 */
export const FLAT_DEEP_CYCLES = ["0", "1", "2", "3", "4", "5", "6"] as const;
export const FLAT_DEEP_TRAIL_SCALE = 24;
export const FLAT_DEEP_RUN_ITERATIONS = 160;
export const FLAT_DEEP_AGENTS = 84;

const EDGE = 1.15;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

export const PLATE_KINDS = [
  "equal-bays",
  "deep-slots",
  "double-loaded",
  "single-loaded",
  "core",
  "nested",
  "cross",
  "racetrack",
  "unequal",
  "tee",
  "jog",
  "fine-grid",
  "merged",
  "end-bar",
  "perimeter",
  "quads",
] as const;

export type PlateKind = (typeof PLATE_KINDS)[number];

export const ORGANIC_KINDS = ["fingers", "kidney", "alcoves", "chain", "lobes"] as const;

export type OrganicKind = (typeof ORGANIC_KINDS)[number];
export type FlatDeepKind = PlateKind | OrganicKind;

export type FlatDeepPlan = {
  kind: FlatDeepKind;
  organic: boolean;
  index: number;
  attempt: number;
  cols: number;
  rows: number;
  cut: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type Seg = { u: number; v: number; u2: number; v2: number; cu?: number; cv?: number; curve?: boolean; gap: boolean };

/**
 * Half the current grid. These already read as a deep plate, so their snapshots stay.
 * Deep slots, both loaded bars, end bars, the long equal bays, the bay plates,
 * and the deeper corridor plates.
 */
const KEPT_HALF = new Set<number>([
  0, 1, 2, 3, 7, 13, 14, 17, 18, 19, 21, 28, 29, 32, 33, 34, 35, 36, 42, 43, 45, 48, 49, 50, 51, 56, 57, 61, 63, 64, 65, 66, 67,
  70, 71, 77, 78, 80, 81, 82, 83, 84, 85, 91, 92, 93, 96, 97, 98, 99,
]);

export function flatDeepKept(index: number) {
  const slot = ((index % 100) + 100) % 100;
  return KEPT_HALF.has(slot);
}

const PLATE_REV = "form-2";
const PLATE_REV_KEY = "lm-fdp-plate-rev";

/** First Start in this tab redraws the straight plates. Curved cells stay. */
export function flatDeepPlatesNeedRedraw() {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(PLATE_REV_KEY) === PLATE_REV) return false;
    window.sessionStorage.setItem(PLATE_REV_KEY, PLATE_REV);
    return true;
  } catch {
    return true;
  }
}

const FLUID_DONE_KEY = "lm-fdp-fluid-cells";

/** Fluid cells already drawn in this tab. A later Start keeps these and redraws only the rest. */
export function markFlatDeepFluid(index: number) {
  if (typeof window === "undefined" || flatDeepKept(index)) return;
  try {
    const next = new Set((window.sessionStorage.getItem(FLUID_DONE_KEY) ?? "").split(",").filter(Boolean));
    next.add(String(index));
    window.sessionStorage.setItem(FLUID_DONE_KEY, [...next].join(","));
  } catch {
    /* ignore */
  }
}

export function flatDeepFluidDone(index: number) {
  if (typeof window === "undefined") return false;
  try {
    return (window.sessionStorage.getItem(FLUID_DONE_KEY) ?? "").split(",").includes(String(index));
  } catch {
    return false;
  }
}

export const markFlatDeepOrganic = markFlatDeepFluid;
export const flatDeepOrganicDone = flatDeepFluidDone;

function wall(segs: Seg[], u: number, v: number, u2: number, v2: number) {
  if (Math.abs(u - u2) > 0.001 && Math.abs(v - v2) > 0.001) return;
  if (Math.hypot(u2 - u, v2 - v) < 0.04) return;
  segs.push({ u, v, u2, v2, gap: false });
}

function outline(segs: Seg[], u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  wall(segs, u0, v0, u1, v0);
  wall(segs, u1, v0, u1, v1);
  wall(segs, u0, v1, u1, v1);
  wall(segs, u0, v0, u0, v1);
}

function equalBays(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) wall(segs, 0, 0.5, 1, 0.5);
  else if (cycle === 1) wall(segs, 0.28, 0, 0.28, 1);
  else if (cycle === 2) {
    wall(segs, 0.22, 0, 0.22, 1);
    wall(segs, 0.78, 0, 0.78, 1);
  } else if (cycle === 3) {
    wall(segs, 0, 0.38, 0.62, 0.38);
    wall(segs, 0.62, 0.38, 0.62, 1);
  } else if (cycle === 4) outline(segs, 0, 0, 0.36, 0.42);
  else if (cycle === 5) {
    wall(segs, 0, 0.58, 1, 0.58);
    wall(segs, 0.34, 0.58, 0.34, 1);
  } else wall(segs, 0.82, 0, 0.82, 1);
  return segs;
}

function deepSlots(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) wall(segs, 0.18, 0, 0.18, 1);
  else if (cycle === 1) {
    wall(segs, 0.4, 0, 0.4, 1);
    wall(segs, 0.55, 0, 0.55, 1);
  } else if (cycle === 2) {
    wall(segs, 0.28, 0, 0.28, 0.72);
    wall(segs, 0.62, 0, 0.62, 0.72);
  } else if (cycle === 3) {
    wall(segs, 0.3, 0, 0.3, 1);
    wall(segs, 0.7, 0, 0.7, 1);
  } else if (cycle === 4) wall(segs, 0.5, 0.15, 0.5, 0.85);
  else if (cycle === 5) {
    wall(segs, 0.12, 0, 0.12, 1);
    wall(segs, 0.24, 0, 0.24, 1);
    wall(segs, 0.36, 0, 0.36, 1);
  } else {
    wall(segs, 0, 0.33, 1, 0.33);
    wall(segs, 0, 0.66, 1, 0.66);
  }
  return segs;
}

function doubleLoaded(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0, 0.42, 1, 0.42);
    wall(segs, 0, 0.58, 1, 0.58);
    wall(segs, 0.33, 0, 0.33, 0.42);
    wall(segs, 0.66, 0, 0.66, 0.42);
    wall(segs, 0.33, 0.58, 0.33, 1);
    wall(segs, 0.66, 0.58, 0.66, 1);
  } else if (cycle === 1) {
    wall(segs, 0, 0.72, 1, 0.72);
    wall(segs, 0, 0.86, 1, 0.86);
    wall(segs, 0.25, 0, 0.25, 0.72);
    wall(segs, 0.6, 0, 0.6, 0.72);
  } else if (cycle === 2) {
    wall(segs, 0, 0.46, 1, 0.46);
    wall(segs, 0, 0.6, 1, 0.6);
    wall(segs, 0.28, 0, 0.28, 0.46);
    wall(segs, 0.74, 0.6, 0.74, 1);
  } else if (cycle === 3) outline(segs, 0.12, 0.38, 0.88, 0.62);
  else if (cycle === 4) {
    wall(segs, 0, 0.46, 0.38, 0.46);
    wall(segs, 0.62, 0.46, 1, 0.46);
    wall(segs, 0, 0.6, 0.38, 0.6);
    wall(segs, 0.62, 0.6, 1, 0.6);
  } else if (cycle === 5) {
    wall(segs, 0.42, 0, 0.42, 1);
    wall(segs, 0.58, 0, 0.58, 1);
    wall(segs, 0.58, 0.3, 1, 0.3);
    wall(segs, 0.58, 0.7, 1, 0.7);
  } else {
    wall(segs, 0, 0.36, 1, 0.36);
    wall(segs, 0, 0.5, 1, 0.5);
    wall(segs, 0.22, 0.5, 0.22, 1);
    wall(segs, 0.55, 0.5, 0.55, 1);
    wall(segs, 0.8, 0.5, 0.8, 1);
  }
  return segs;
}

function singleLoaded(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0, 0.22, 1, 0.22);
    wall(segs, 0.3, 0.22, 0.3, 1);
    wall(segs, 0.7, 0.22, 0.7, 1);
  } else if (cycle === 1) {
    wall(segs, 0, 0.78, 1, 0.78);
    wall(segs, 0.55, 0, 0.55, 0.78);
  } else if (cycle === 2) {
    wall(segs, 0.2, 0, 0.2, 1);
    wall(segs, 0.2, 0.28, 1, 0.28);
    wall(segs, 0.2, 0.72, 1, 0.72);
  } else if (cycle === 3) wall(segs, 0, 0.16, 1, 0.16);
  else if (cycle === 4) {
    wall(segs, 0, 0.18, 1, 0.18);
    outline(segs, 0.08, 0.36, 0.42, 0.88);
    outline(segs, 0.55, 0.48, 0.9, 0.72);
  } else if (cycle === 5) {
    wall(segs, 0, 0.2, 0.78, 0.2);
    wall(segs, 0.78, 0.2, 0.78, 1);
    wall(segs, 0.4, 0.2, 0.4, 1);
  } else {
    wall(segs, 0.16, 0.24, 0.84, 0.24);
    wall(segs, 0.28, 0.24, 0.28, 1);
    wall(segs, 0.7, 0.24, 0.7, 1);
  }
  return segs;
}

function core(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) outline(segs, 0.34, 0.34, 0.66, 0.66);
  else if (cycle === 1) outline(segs, 0.12, 0.18, 0.88, 0.82);
  else if (cycle === 2) outline(segs, 0.08, 0.08, 0.48, 0.55);
  else if (cycle === 3) {
    wall(segs, 0.28, 0.5, 0.72, 0.5);
    wall(segs, 0.5, 0.22, 0.5, 0.78);
  } else if (cycle === 4) {
    wall(segs, 0.3, 0.28, 0.7, 0.28);
    wall(segs, 0.3, 0.28, 0.3, 0.72);
    wall(segs, 0.3, 0.72, 0.7, 0.72);
    wall(segs, 0.7, 0.28, 0.7, 0.46);
    wall(segs, 0.7, 0.58, 0.7, 0.72);
  } else if (cycle === 5) {
    outline(segs, 0.12, 0.16, 0.38, 0.4);
    outline(segs, 0.58, 0.55, 0.86, 0.84);
  } else outline(segs, 0.55, 0.2, 1, 0.8);
  return segs;
}

function nested(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.18, 0.18, 0.82, 0.18);
    wall(segs, 0.18, 0.18, 0.18, 0.82);
    wall(segs, 0.82, 0.18, 0.82, 0.82);
    outline(segs, 0.38, 0.4, 0.62, 0.64);
  } else if (cycle === 1) {
    outline(segs, 0.14, 0.14, 0.86, 0.86);
    outline(segs, 0.32, 0.32, 0.68, 0.68);
  } else if (cycle === 2) outline(segs, 0.28, 0.08, 0.9, 0.62);
  else if (cycle === 3) {
    wall(segs, 0.22, 0.5, 0.78, 0.5);
    wall(segs, 0.5, 0.22, 0.5, 0.78);
  } else if (cycle === 4) {
    wall(segs, 0.36, 0.12, 0.36, 0.88);
    wall(segs, 0.64, 0.12, 0.64, 0.88);
  } else if (cycle === 5) {
    outline(segs, 0.08, 0.22, 0.46, 0.78);
    outline(segs, 0.58, 0.34, 0.9, 0.66);
  } else {
    wall(segs, 0.16, 0.2, 0.84, 0.2);
    wall(segs, 0.16, 0.2, 0.16, 0.8);
    wall(segs, 0.84, 0.2, 0.84, 0.8);
    outline(segs, 0.36, 0.4, 0.64, 0.68);
  }
  return segs;
}

function cross(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.5, 0, 0.5, 1);
    wall(segs, 0, 0.5, 1, 0.5);
  } else if (cycle === 1) {
    wall(segs, 0.28, 0, 0.28, 1);
    wall(segs, 0, 0.72, 1, 0.72);
  } else if (cycle === 2) {
    wall(segs, 0.5, 0, 0.5, 0.62);
    wall(segs, 0, 0.62, 1, 0.62);
  } else if (cycle === 3) {
    wall(segs, 0.35, 0, 0.35, 1);
    wall(segs, 0.35, 0.7, 1, 0.7);
  } else if (cycle === 4) {
    wall(segs, 0.42, 0, 0.42, 1);
    wall(segs, 0, 0.5, 1, 0.5);
    outline(segs, 0.72, 0.32, 0.96, 0.68);
  } else if (cycle === 5) {
    wall(segs, 0.22, 0.22, 0.22, 0.78);
    wall(segs, 0.78, 0.22, 0.78, 0.78);
    wall(segs, 0.22, 0.5, 0.78, 0.5);
  } else {
    wall(segs, 0.5, 0, 0.5, 1);
    wall(segs, 0.5, 0.38, 1, 0.38);
    wall(segs, 0, 0.72, 0.5, 0.72);
  }
  return segs;
}

function racetrack(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) outline(segs, 0.22, 0.22, 0.78, 0.78);
  else if (cycle === 1) {
    wall(segs, 0.2, 0.24, 0.8, 0.24);
    wall(segs, 0.2, 0.24, 0.2, 0.8);
    wall(segs, 0.8, 0.24, 0.8, 0.8);
  } else if (cycle === 2) {
    outline(segs, 0.24, 0.24, 0.76, 0.76);
    wall(segs, 0.5, 0, 0.5, 0.24);
  } else if (cycle === 3) {
    outline(segs, 0.08, 0.28, 0.42, 0.72);
    outline(segs, 0.58, 0.28, 0.92, 0.72);
  } else if (cycle === 4) outline(segs, 0.06, 0.18, 0.4, 0.82);
  else if (cycle === 5) {
    wall(segs, 0.22, 0.22, 0.4, 0.22);
    wall(segs, 0.58, 0.22, 0.78, 0.22);
    wall(segs, 0.22, 0.22, 0.22, 0.78);
    wall(segs, 0.78, 0.22, 0.78, 0.78);
    wall(segs, 0.22, 0.78, 0.78, 0.78);
    wall(segs, 0.46, 0.22, 0.46, 0.08);
    wall(segs, 0.54, 0.22, 0.54, 0.08);
  } else {
    outline(segs, 0.08, 0.08, 0.92, 0.92);
    outline(segs, 0.2, 0.2, 0.8, 0.8);
  }
  return segs;
}

function unequal(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.2, 0, 0.2, 1);
    wall(segs, 0.72, 0, 0.72, 1);
  } else if (cycle === 1) wall(segs, 0.82, 0, 0.82, 1);
  else if (cycle === 2) {
    wall(segs, 0.15, 0, 0.15, 1);
    wall(segs, 0.4, 0, 0.4, 1);
    wall(segs, 0.6, 0, 0.6, 1);
    wall(segs, 0.85, 0, 0.85, 1);
  } else if (cycle === 3) {
    wall(segs, 0.45, 0, 0.45, 1);
    wall(segs, 0.45, 0.4, 1, 0.4);
  } else if (cycle === 4) {
    wall(segs, 0.62, 0, 0.62, 1);
    wall(segs, 0.62, 0.45, 1, 0.45);
  } else if (cycle === 5) {
    wall(segs, 0, 0.2, 1, 0.2);
    wall(segs, 0, 0.7, 1, 0.7);
  } else outline(segs, 0, 0, 0.34, 0.28);
  return segs;
}

function tee(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.5, 0, 0.5, 1);
    wall(segs, 0.5, 0.25, 1, 0.25);
  } else if (cycle === 1) {
    wall(segs, 0, 0.5, 1, 0.5);
    wall(segs, 0.72, 0.5, 0.72, 1);
  } else if (cycle === 2) {
    wall(segs, 0.42, 0, 0.42, 1);
    wall(segs, 0.58, 0, 0.58, 1);
    wall(segs, 0.58, 0.3, 1, 0.3);
  } else if (cycle === 3) {
    wall(segs, 0.22, 0, 0.22, 1);
    wall(segs, 0.22, 0.7, 1, 0.7);
  } else if (cycle === 4) {
    wall(segs, 0.4, 0, 0.4, 1);
    wall(segs, 0, 0.28, 1, 0.28);
    outline(segs, 0.16, 0.62, 0.64, 0.92);
  } else if (cycle === 5) {
    wall(segs, 0, 0.8, 1, 0.8);
    wall(segs, 0.5, 0, 0.5, 0.8);
  } else {
    wall(segs, 0.5, 0.16, 0.5, 0.84);
    wall(segs, 0.18, 0.28, 0.82, 0.28);
  }
  return segs;
}

function jog(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.3, 0, 0.3, 0.45);
    wall(segs, 0.3, 0.45, 0.7, 0.45);
    wall(segs, 0.7, 0.45, 0.7, 1);
  } else if (cycle === 1) {
    wall(segs, 0.7, 0, 0.7, 0.4);
    wall(segs, 0.28, 0.4, 0.7, 0.4);
    wall(segs, 0.28, 0.4, 0.28, 1);
  } else if (cycle === 2) {
    wall(segs, 0.22, 0, 0.22, 0.32);
    wall(segs, 0.22, 0.32, 0.55, 0.32);
    wall(segs, 0.55, 0.32, 0.55, 0.68);
    wall(segs, 0.55, 0.68, 0.84, 0.68);
    wall(segs, 0.84, 0.68, 0.84, 1);
  } else if (cycle === 3) {
    wall(segs, 0.34, 0, 0.34, 0.48);
    wall(segs, 0.34, 0.48, 0.72, 0.48);
    wall(segs, 0.72, 0.48, 0.72, 1);
    outline(segs, 0.46, 0.62, 0.88, 0.9);
  } else if (cycle === 4) {
    wall(segs, 0.16, 0.16, 0.16, 0.46);
    wall(segs, 0.16, 0.46, 0.48, 0.46);
  } else if (cycle === 5) {
    wall(segs, 0.24, 0, 0.24, 0.22);
    wall(segs, 0.24, 0.22, 0.7, 0.22);
    wall(segs, 0.7, 0.22, 0.7, 0.55);
  } else {
    wall(segs, 0.2, 0, 0.2, 0.3);
    wall(segs, 0.2, 0.3, 0.78, 0.3);
    wall(segs, 0.78, 0.3, 0.78, 0.62);
    wall(segs, 0.28, 0.62, 0.78, 0.62);
    wall(segs, 0.28, 0.62, 0.28, 1);
  }
  return segs;
}

function fineGrid(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0, 0.34, 0.7, 0.34);
    wall(segs, 0, 0.68, 0.42, 0.68);
    wall(segs, 0, 0.86, 0.24, 0.86);
  } else if (cycle === 1) {
    wall(segs, 0, 0.22, 0.34, 0.22);
    wall(segs, 0.34, 0.22, 0.34, 0.5);
    wall(segs, 0.34, 0.5, 0.66, 0.5);
    wall(segs, 0.66, 0.5, 0.66, 0.78);
    wall(segs, 0.66, 0.78, 1, 0.78);
  } else if (cycle === 2) {
    wall(segs, 0.08, 0.32, 0.92, 0.32);
    wall(segs, 0.08, 0.68, 0.92, 0.68);
  } else if (cycle === 3) {
    wall(segs, 0.12, 0.18, 0.7, 0.18);
    wall(segs, 0.7, 0.18, 0.7, 0.48);
    wall(segs, 0.28, 0.48, 0.7, 0.48);
    wall(segs, 0.28, 0.48, 0.28, 0.82);
    wall(segs, 0.28, 0.82, 0.86, 0.82);
  } else if (cycle === 4) {
    wall(segs, 0.22, 0.16, 0.22, 0.84);
    wall(segs, 0.22, 0.28, 0.62, 0.28);
    wall(segs, 0.22, 0.7, 0.84, 0.7);
  } else if (cycle === 5) {
    outline(segs, 0.06, 0.34, 0.28, 0.66);
    outline(segs, 0.38, 0.22, 0.7, 0.78);
    outline(segs, 0.78, 0.4, 0.94, 0.58);
  } else {
    wall(segs, 0.16, 0.2, 0.16, 0.8);
    wall(segs, 0.16, 0.8, 0.84, 0.8);
    wall(segs, 0.84, 0.2, 0.84, 0.8);
  }
  return segs;
}

function merged(cycle: number): Seg[] {
  const segs: Seg[] = [];
  if (cycle === 0) {
    wall(segs, 0, 0, 1, 0);
    wall(segs, 1, 0, 1, 0.62);
    wall(segs, 1, 0.62, 0.68, 0.62);
    wall(segs, 0.68, 0.62, 0.68, 1);
    wall(segs, 0.68, 1, 0, 1);
    wall(segs, 0, 1, 0, 0);
  } else if (cycle === 1) {
    wall(segs, 0.32, 0, 1, 0);
    wall(segs, 1, 0, 1, 1);
    wall(segs, 1, 1, 0, 1);
    wall(segs, 0, 1, 0, 0.38);
    wall(segs, 0, 0.38, 0.32, 0.38);
    wall(segs, 0.32, 0.38, 0.32, 0);
  } else if (cycle === 2) {
    outline(segs);
    wall(segs, 0.48, 0, 0.48, 0.42);
    wall(segs, 0.48, 0.58, 0.48, 1);
  } else if (cycle === 3) {
    wall(segs, 0, 0.18, 0.72, 0.18);
    wall(segs, 0.72, 0.18, 0.72, 0.82);
    wall(segs, 0.72, 0.82, 0, 0.82);
    wall(segs, 0, 0.82, 0, 0.18);
  } else if (cycle === 4) {
    outline(segs, 0, 0.16, 0.7, 0.84);
    outline(segs, 0.7, 0.36, 1, 0.64);
  } else if (cycle === 5) {
    outline(segs);
    wall(segs, 0.38, 1, 0.38, 0.72);
    wall(segs, 0.62, 1, 0.62, 0.72);
    wall(segs, 0.38, 0.72, 0.62, 0.72);
  } else {
    wall(segs, 0.18, 0, 0.18, 1);
    wall(segs, 0.62, 0, 0.62, 1);
    wall(segs, 0.18, 0.46, 0.3, 0.46);
    wall(segs, 0.42, 0.46, 0.62, 0.46);
  }
  return segs;
}

function endBar(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.28, 0, 0.28, 1);
    wall(segs, 0.62, 0.28, 1, 0.28);
  } else if (cycle === 1) {
    wall(segs, 0.72, 0, 0.72, 1);
    wall(segs, 0, 0.55, 0.72, 0.55);
  } else if (cycle === 2) {
    wall(segs, 0, 0.3, 1, 0.3);
    wall(segs, 0.4, 0.3, 0.4, 1);
    wall(segs, 0.4, 0.65, 1, 0.65);
  } else if (cycle === 3) {
    wall(segs, 0.18, 0, 0.18, 1);
    wall(segs, 0.82, 0, 0.82, 1);
  } else if (cycle === 4) {
    wall(segs, 0.36, 0, 0.36, 1);
    wall(segs, 0, 0.33, 0.36, 0.33);
    wall(segs, 0, 0.66, 0.36, 0.66);
  } else if (cycle === 5) {
    wall(segs, 0.16, 0, 0.16, 1);
    wall(segs, 0.32, 0, 0.32, 1);
  } else {
    outline(segs, 0.04, 0.12, 0.28, 0.4);
    outline(segs, 0.04, 0.55, 0.34, 0.88);
    wall(segs, 0.5, 0.5, 1, 0.5);
  }
  return segs;
}

function perimeter(cycle: number): Seg[] {
  const segs: Seg[] = [];
  if (cycle === 0) {
    outline(segs);
    outline(segs, 0.22, 0.22, 0.78, 0.78);
  } else if (cycle === 1) {
    outline(segs);
    outline(segs, 0.06, 0.06, 0.28, 0.28);
    outline(segs, 0.36, 0.06, 0.62, 0.22);
    outline(segs, 0.7, 0.06, 0.94, 0.32);
  } else if (cycle === 2) {
    outline(segs, 0.04, 0.62, 0.28, 0.94);
    outline(segs, 0.7, 0.66, 0.96, 0.96);
    outline(segs, 0.04, 0.04, 0.24, 0.28);
    outline(segs, 0.72, 0.04, 0.96, 0.3);
  } else if (cycle === 3) {
    outline(segs);
    wall(segs, 0.5, 0.18, 0.5, 0.82);
  } else if (cycle === 4) {
    wall(segs, 0, 0.22, 1, 0.22);
    wall(segs, 0, 0.22, 0, 1);
    wall(segs, 1, 0.22, 1, 1);
    wall(segs, 0, 1, 1, 1);
    outline(segs, 0.55, 0.45, 0.88, 0.82);
  } else if (cycle === 5) {
    outline(segs);
    outline(segs, 0.04, 0.08, 0.22, 0.28);
    outline(segs, 0.04, 0.38, 0.22, 0.58);
    outline(segs, 0.04, 0.68, 0.22, 0.92);
  } else {
    outline(segs);
    outline(segs, 0.28, 0.08, 0.92, 0.78);
  }
  return segs;
}

function quads(cycle: number): Seg[] {
  const segs: Seg[] = [];
  outline(segs);
  if (cycle === 0) {
    wall(segs, 0.72, 0, 0.72, 1);
    wall(segs, 0, 0.72, 1, 0.72);
  } else if (cycle === 1) wall(segs, 0.5, 0, 0.5, 1);
  else if (cycle === 2) {
    wall(segs, 0.5, 0, 0.5, 1);
    wall(segs, 0, 0.5, 1, 0.5);
    wall(segs, 0.75, 0.5, 0.75, 1);
  } else if (cycle === 3) {
    wall(segs, 0.3, 0, 0.3, 1);
    wall(segs, 0, 0.3, 1, 0.3);
  } else if (cycle === 4) {
    wall(segs, 0.46, 0, 0.46, 1);
    wall(segs, 0.46, 0.4, 1, 0.4);
  } else if (cycle === 5) {
    outline(segs, 0.06, 0.55, 0.4, 0.92);
    outline(segs, 0.55, 0.58, 0.92, 0.94);
    outline(segs, 0.08, 0.08, 0.36, 0.38);
    outline(segs, 0.58, 0.08, 0.9, 0.4);
  } else {
    wall(segs, 0.18, 0.62, 0.42, 0.62);
    wall(segs, 0.3, 0.5, 0.3, 0.86);
  }
  return segs;
}

type Pt = { u: number; v: number };

const inside = (value: number) => Math.min(0.92, Math.max(0.08, value));

function pt(u: number, v: number): Pt {
  return { u: inside(u), v: inside(v) };
}

function along(wide: boolean, long: number, cross: number): Pt {
  return wide ? pt(long, cross) : pt(cross, long);
}

function offChord(a: Pt, b: Pt, c: Pt) {
  const abx = b.u - a.u;
  const aby = b.v - a.v;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((c.u - a.u) * abx + (c.v - a.v) * aby) / len2));
  const px = a.u + abx * t;
  const py = a.v + aby * t;
  let dx = c.u - px;
  let dy = c.v - py;
  let dist = Math.hypot(dx, dy);
  if (dist < 0.0001) {
    dx = -aby;
    dy = abx;
    dist = Math.hypot(dx, dy) || 1;
  }
  return { px, py, dx, dy, dist };
}

/** Every wall bows. A control sitting on its chord would draw another straight line. */
function q(segs: Seg[], a: Pt, b: Pt, c: Pt) {
  if (Math.hypot(b.u - a.u, b.v - a.v) < 0.045) return;
  const min = 0.11;
  let bent = offChord(a, b, c);
  let cu = bent.px + (bent.dx / bent.dist) * Math.max(min, bent.dist);
  let cv = bent.py + (bent.dy / bent.dist) * Math.max(min, bent.dist);
  let placed = pt(cu, cv);
  if (offChord(a, b, placed).dist < min * 0.65) {
    bent = offChord(a, b, { u: bent.px - bent.dx, v: bent.py - bent.dy });
    cu = bent.px + (bent.dx / bent.dist) * min;
    cv = bent.py + (bent.dy / bent.dist) * min;
    placed = pt(cu, cv);
  }
  segs.push({ u: a.u, v: a.v, u2: b.u, v2: b.v, cu: placed.u, cv: placed.v, curve: true, gap: false });
}

/** Closed organic contour. Every edge is a curve; the control sits outside the chord. */
function curveLoop(segs: Seg[], points: Pt[]) {
  const n = points.length;
  const mid = (i: number): Pt => ({
    u: (points[i % n].u + points[(i + 1) % n].u) / 2,
    v: (points[i % n].v + points[(i + 1) % n].v) / 2,
  });
  for (let i = 0; i < n; i += 1) {
    const a = mid(i);
    const b = mid(i + 1);
    const c = points[(i + 1) % n];
    const mx = (a.u + b.u) / 2;
    const my = (a.v + b.v) / 2;
    q(segs, a, b, pt(c.u + (c.u - mx) * 0.7, c.v + (c.v - my) * 0.7));
  }
}

function curveOpen(segs: Seg[], points: Pt[]) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const mx = (a.u + b.u) / 2;
    const my = (a.v + b.v) / 2;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len = Math.hypot(dx, dy) || 1;
    const bow = (i % 2 === 0 ? 0.09 : -0.09);
    q(segs, a, b, pt(mx - (dy / len) * bow, my + (dx / len) * bow));
  }
}

function organicHull(wide: boolean, lobes: number, amp: number, phase: number, bite: number): Pt[] {
  const count = 14;
  const pts: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const wave = 1 + amp * Math.sin(lobes * t + phase);
    const side = Math.sin(t);
    const biteAmt = side < 0 ? bite * side : 0;
    const long = 0.5 + Math.cos(t) * 0.34 * wave;
    const cross = 0.5 + Math.sin(t) * (0.25 + biteAmt) * (0.82 + 0.18 * Math.cos(2 * t + phase));
    pts.push(along(wide, long, cross));
  }
  return pts;
}

function addFingers(segs: Seg[], wide: boolean, count: number, phase: number, slot: number) {
  const wobble = 0.11 + (slot % 3) * 0.03;
  for (let i = 1; i < count; i += 1) {
    const cross = 0.24 + (i / count) * 0.52;
    const sign = i % 2 === 0 ? 1 : -1;
    const shift = Math.sin(phase + i) * 0.03;
    const a = along(wide, 0.16, cross + shift);
    const b = along(wide, 0.5, cross + sign * wobble);
    const c = along(wide, 0.84, cross - sign * wobble * 0.55);
    q(segs, a, b, along(wide, 0.32, cross + sign * wobble * 1.7));
    q(segs, b, c, along(wide, 0.68, cross - sign * wobble * 1.55));
  }
}

function addKidney(segs: Seg[], wide: boolean, phase: number, slot: number) {
  const bands = 2 + (slot % 2);
  for (let band = 0; band < bands; band += 1) {
    const cross = 0.46 + band * 0.13;
    const lift = 0.08 * Math.sin(phase + band);
    const a = along(wide, 0.2, cross);
    const b = along(wide, 0.5, cross + lift);
    const c = along(wide, 0.8, cross - lift * 0.5);
    q(segs, a, b, along(wide, 0.34, cross + 0.16));
    q(segs, b, c, along(wide, 0.66, cross - 0.14));
  }
}

function addAlcoves(segs: Seg[], wide: boolean, phase: number, slot: number) {
  const count = 3 + (slot % 3);
  const spine: Pt[] = [];
  for (let i = 0; i <= count; i += 1) {
    const long = 0.16 + (i / count) * 0.68;
    const cross = 0.5 + Math.sin(i * 1.35 + phase) * 0.11;
    spine.push(along(wide, long, cross));
  }
  curveOpen(segs, spine);
  for (let i = 0; i < count; i += 1) {
    const long = 0.22 + (i / Math.max(1, count - 1)) * 0.56;
    const upper = i % 2 === 0;
    const side = upper ? 0.78 : 0.24;
    const neck = 0.5 + (upper ? 0.08 : -0.08);
    const a = along(wide, long, neck);
    const b = along(wide, long + 0.05, side);
    const c = along(wide, long + 0.14, neck);
    q(segs, a, b, along(wide, long - 0.02, (neck + side) / 2));
    q(segs, b, c, along(wide, long + 0.1, side + (upper ? 0.08 : -0.08)));
  }
}

function addChain(segs: Seg[], wide: boolean, count: number, phase: number, slot: number) {
  let cursor = 0.16;
  for (let i = 0; i < count; i += 1) {
    const span = 0.18 + ((slot + i) % 3) * 0.045;
    const cross = 0.5 + Math.sin(phase + i * 0.9) * 0.05;
    const radLong = span * 0.46;
    const radCross = 0.11 + (i % 2) * 0.035;
    const cell: Pt[] = [];
    const steps = 7;
    for (let k = 0; k < steps; k += 1) {
      const t = (k / steps) * Math.PI * 2 + phase * 0.3;
      const wave = 1 + 0.18 * Math.sin(3 * t + i);
      cell.push(along(wide, cursor + span / 2 + Math.cos(t) * radLong * wave, cross + Math.sin(t) * radCross * wave));
    }
    curveLoop(segs, cell);
    cursor += span * 0.78;
    if (cursor > 0.78) break;
  }
}

function addLobes(segs: Seg[], wide: boolean, lobes: number, phase: number) {
  const origin = along(wide, 0.5 + Math.sin(phase) * 0.04, 0.5 + Math.cos(phase) * 0.03);
  for (let i = 0; i < lobes; i += 1) {
    const t = phase + (i / lobes) * Math.PI * 2;
    const end = along(wide, 0.5 + Math.cos(t) * 0.26, 0.5 + Math.sin(t) * 0.18);
    const ctrl = along(wide, 0.5 + Math.cos(t + 0.7) * 0.2, 0.5 + Math.sin(t + 0.45) * 0.16);
    q(segs, origin, end, ctrl);
  }
}

function fluidSegments(plan: FlatDeepPlan): Seg[] {
  const slot = plan.index;
  const wide = plan.x1 - plan.x0 >= plan.y1 - plan.y0;
  const kind = ORGANIC_KINDS[slot % ORGANIC_KINDS.length];
  const lobes = 3 + (slot % 4);
  const amp = 0.18 + (slot % 5) * 0.02;
  const phase = ((slot * 17) % 360) * (Math.PI / 180);
  const bite = kind === "kidney" ? 0.2 + (slot % 3) * 0.03 : 0.03 + (slot % 3) * 0.015;
  const segs: Seg[] = [];
  curveLoop(segs, organicHull(wide, lobes, amp, phase, bite));
  if (kind === "fingers") addFingers(segs, wide, 4 + (slot % 3), phase, slot);
  else if (kind === "kidney") addKidney(segs, wide, phase, slot);
  else if (kind === "alcoves") addAlcoves(segs, wide, phase, slot);
  else if (kind === "chain") addChain(segs, wide, 3 + (slot % 3), phase, slot);
  else addLobes(segs, wide, lobes, phase);
  return segs;
}

function segmentsFor(plan: FlatDeepPlan): Seg[] {
  const cycle = Math.floor(plan.index / PLATE_KINDS.length) % 7;
  if (plan.organic) return fluidSegments(plan);
  if (plan.kind === "equal-bays") return equalBays(cycle);
  if (plan.kind === "deep-slots") return deepSlots(cycle);
  if (plan.kind === "double-loaded") return doubleLoaded(cycle);
  if (plan.kind === "single-loaded") return singleLoaded(cycle);
  if (plan.kind === "core") return core(cycle);
  if (plan.kind === "nested") return nested(cycle);
  if (plan.kind === "cross") return cross(cycle);
  if (plan.kind === "racetrack") return racetrack(cycle);
  if (plan.kind === "unequal") return unequal(cycle);
  if (plan.kind === "tee") return tee(cycle);
  if (plan.kind === "jog") return jog(cycle);
  if (plan.kind === "fine-grid") return fineGrid(cycle);
  if (plan.kind === "merged") return merged(cycle);
  if (plan.kind === "end-bar") return endBar(cycle);
  if (plan.kind === "perimeter") return perimeter(cycle);
  return quads(cycle);
}

function plateBox(index: number) {
  const band = Math.floor(index / PLATE_KINDS.length);
  const aspects = [1.22, 1.58, 1.96, 2.45, 2.9, 3.35, 1.72];
  const longs = [14.6, 12.4, 15.2, 11.2, 13.6, 10.4, 15.8];
  let w = longs[band] ?? 16;
  let h = w / (aspects[band] ?? 1.8);
  if ((index + band) % 2 === 1) {
    const swap = w;
    w = h;
    h = swap;
  }
  const max = FIELD_SIZE - EDGE * 2;
  const scale = Math.min(1, max / w, max / h);
  w *= scale;
  h *= scale;
  const slackX = max - w;
  const slackY = max - h;
  const fx = ((index * 5 + band * 3) % 7) / 6;
  const fy = ((index * 3 + band * 5) % 7) / 6;
  const x0 = EDGE + slackX * fx;
  const y0 = EDGE + slackY * fy;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

function grain(kind: PlateKind, index: number) {
  const band = Math.floor(index / PLATE_KINDS.length);
  if (kind === "equal-bays") return { cols: 2 + (band % 4), rows: 2 + ((band + index) % 3), cut: 0.5 };
  if (kind === "deep-slots") return { cols: 4 + (band % 5), rows: 1, cut: 0.5 };
  if (kind === "double-loaded" || kind === "single-loaded") return { cols: 3 + (band % 5), rows: 2 + (band % 3), cut: 0.5 };
  if (kind === "core") return { cols: 2 + (band % 3), rows: 2 + ((band + 1) % 3), cut: 0.22 + (band % 3) * 0.06 };
  if (kind === "nested") return { cols: 1, rows: 1 + (band % 3), cut: 0.5 };
  if (kind === "cross") return { cols: 2 + (band % 4), rows: 2, cut: 0.32 + (band % 5) * 0.08 };
  if (kind === "racetrack") return { cols: 3 + (band % 4), rows: 1, cut: 0.28 + (band % 3) * 0.08 };
  if (kind === "unequal") return { cols: 2 + (band % 4), rows: band % 2, cut: 0.36 + (band % 4) * 0.08 };
  if (kind === "tee") return { cols: 2 + (band % 3), rows: 1 + (band % 4), cut: 0.34 + (band % 4) * 0.1 };
  if (kind === "jog") return { cols: 2 + (band % 3), rows: 1 + (band % 4), cut: 0.3 + (band % 4) * 0.08 };
  if (kind === "fine-grid") return { cols: 4 + (band % 3), rows: 3 + (band % 2), cut: 0.5 };
  if (kind === "merged") return { cols: 3, rows: 3, cut: 0.5 };
  if (kind === "end-bar") return { cols: 3 + (band % 4), rows: 2, cut: 0.26 + (band % 3) * 0.08 };
  if (kind === "perimeter") return { cols: 3 + (band % 4), rows: 2, cut: 0.2 + (band % 3) * 0.06 };
  return { cols: 1 + (band % 4), rows: band % 4, cut: 0.5 };
}

export function planFlatDeepPlan(_seed: number, attempt = 0, index = 0): FlatDeepPlan {
  const slot = ((index % 100) + 100) % 100;
  const box = plateBox(slot);
  const rigidKind = PLATE_KINDS[slot % PLATE_KINDS.length];
  if (flatDeepKept(slot)) {
    const g = grain(rigidKind, slot);
    const cut = Math.min(0.78, g.cut + attempt * 0.05);
    return { kind: rigidKind, organic: false, index: slot, attempt, ...g, cut, ...box };
  }
  const kind = ORGANIC_KINDS[slot % ORGANIC_KINDS.length];
  const g = grain("deep-slots", slot);
  return {
    kind,
    organic: true,
    index: slot,
    attempt,
    cols: 3 + (slot % 5),
    rows: 2 + (Math.floor(slot / 7) % 3),
    cut: g.cut,
    ...box,
  };
}

function splitGap(seg: Seg, at: number): Seg[] {
  const du = seg.u2 - seg.u;
  const dv = seg.v2 - seg.v;
  const a = Math.max(0.12, at - 0.07);
  const b = Math.min(0.88, at + 0.07);
  return [
    { ...seg, u2: seg.u + du * a, v2: seg.v + dv * a, gap: false },
    { ...seg, u: seg.u + du * b, v: seg.v + dv * b, gap: false },
  ];
}

export function attractorsFromFlatDeep(plan: FlatDeepPlan): FieldAttractor[] {
  const segs = segmentsFor(plan);
  const marks: FieldAttractor[] = [];
  segs.forEach((seg, n) => {
    const open = !seg.curve && seg.gap && (plan.index * 11 + n * 7 + plan.attempt * 3) % 5 === 0;
    const parts = open ? splitGap(seg, 0.38 + ((plan.index + n) % 5) * 0.07) : [seg];
    for (const part of parts) {
      const x = lim(plan.x0 + part.u * (plan.x1 - plan.x0));
      const y = lim(plan.y0 + part.v * (plan.y1 - plan.y0));
      const x2 = lim(plan.x0 + part.u2 * (plan.x1 - plan.x0));
      const y2 = lim(plan.y0 + part.v2 * (plan.y1 - plan.y0));
      if (Math.hypot(x2 - x, y2 - y) < 0.4) continue;
      if (part.curve && part.cu != null && part.cv != null) {
        marks.push({
          kind: "curve",
          x,
          y,
          x2,
          y2,
          cx: lim(plan.x0 + part.cu * (plan.x1 - plan.x0)),
          cy: lim(plan.y0 + part.cv * (plan.y1 - plan.y0)),
          radius: 0.36,
          strength: 1,
        });
        continue;
      }
      marks.push({ kind: "line", x, y, x2, y2, radius: 0.4, strength: 1 });
    }
  });
  return marks;
}

function foodFrom(marks: FieldAttractor[]) {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < marks.length && points.length < 5; i += 3) {
    const mark = marks[i];
    points.push({
      x: (mark.x + (mark.x2 ?? mark.x)) / 2,
      y: (mark.y + (mark.y2 ?? mark.y)) / 2,
    });
  }
  return points.length ? points : [{ x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 }];
}

export function slimeFromFlatDeep(base: SlimeControls, plan: FlatDeepPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index);
  const span = (min: number, max: number) => min + rng() * (max - min);
  return {
    ...base,
    sensorAngle: span(0.06, 0.16),
    sensorDistance: span(0.32, 0.52),
    turnAngle: span(0.08, 0.18),
    stepSize: span(0.14, 0.22),
    deposit: span(0.08, 0.12),
    depositWidth: span(0.24, 0.38),
    diffusion: 0,
    decay: span(0.995, 0.998),
    trailInfluence: span(1.25, 1.7),
    resistance: span(0.01, 0.05),
    randomness: plan.organic ? span(0.04, 0.1) : span(0.02, 0.06),
    persistence: plan.organic ? span(0.82, 0.93) : span(0.86, 0.95),
    trailCap: span(0.7, 1.05),
    crowdingLimit: 12,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function agentsFromFlatDeep(plan: FlatDeepPlan) {
  const walls = plan.cols + plan.rows;
  const baseCount = FLAT_DEEP_AGENTS + walls;
  return Math.max(72, Math.min(plan.organic ? 128 : 110, baseCount + (plan.organic ? 18 : 0)));
}

export function translationFromFlatDeep(
  base: BiologicalTranslation,
  plan: FlatDeepPlan,
  marks: FieldAttractor[],
): BiologicalTranslation {
  const cx = (plan.x0 + plan.x1) / 2;
  const cy = (plan.y0 + plan.y1) / 2;
  const params: BiologicalParams = {
    ...base.params,
    geometryVariation: plan.organic ? Math.max(base.params.geometryVariation, 0.34) : Math.min(base.params.geometryVariation, 0.22),
    attractionStrength: Math.max(base.params.attractionStrength, 1.15),
    directionalBias: Math.max(base.params.directionalBias, 0.62),
    randomness: Math.min(base.params.randomness, 0.08),
    permeability: Math.min(base.params.permeability, 0.38),
  };
  const recipe: SpatialRecipe = {
    ...base.recipe,
    attractorFixed: true,
    attractorsOnly: true,
    attractor: { x: cx, y: cy },
    attractors: marks,
    clustering: 0.86,
    coreExposure: Math.min(base.recipe.coreExposure, 0.28),
    approachWidth: Math.min(base.recipe.approachWidth, 1.25),
  };
  return { ...base, params, recipe };
}

export function flatDeepSignature(plan: FlatDeepPlan): number[] {
  const w = plan.x1 - plan.x0;
  const h = plan.y1 - plan.y0;
  return [
    (PLATE_KINDS as readonly string[]).indexOf(plan.kind),
    plan.cols,
    plan.rows,
    Math.round(plan.cut * 20),
    Math.round((w / Math.max(0.2, h)) * 10),
    Math.round(plan.x0),
    Math.round(plan.y0),
    Math.round(w),
    Math.round(h),
  ];
}

export function isNovelFlatDeep(signature: number[], previous: number[][]) {
  for (const other of previous) {
    if (other[0] !== signature[0]) continue;
    const sameGrain = other[1] === signature[1] && other[2] === signature[2] && other[3] === signature[3];
    const samePlace = Math.abs(other[5] - signature[5]) <= 1 && Math.abs(other[6] - signature[6]) <= 1;
    const sameProportion = other[4] === signature[4] && other[7] === signature[7] && other[8] === signature[8];
    if (sameGrain && samePlace && sameProportion) return false;
  }
  return true;
}

export function realizeFlatDeepRun(
  base: BiologicalTranslation,
  slimeBase: SlimeControls,
  seed: number,
  attempt = 0,
  index = 0,
) {
  const plan = planFlatDeepPlan(seed, attempt, index);
  const marks = attractorsFromFlatDeep(plan);
  const slime = {
    ...slimeFromFlatDeep(slimeBase, plan, seed ^ (attempt * 9973)),
    foodPoints: foodFrom(marks),
  };
  return {
    seed,
    agents: agentsFromFlatDeep(plan),
    slime,
    translation: translationFromFlatDeep(base, plan, marks),
    plan,
  };
}

export function flatDeepIdentity(snapshot?: FieldSnapshot): boolean {
  if (!snapshot) return true;
  const trails = snapshot.trails;
  let live = 0;
  let mass = 0;
  const stride = Math.max(1, Math.floor(trails.length / 8000));
  let seen = 0;
  for (let i = 0; i < trails.length; i += stride) {
    seen += 1;
    if (trails[i] < 0.02) continue;
    live += 1;
    mass += trails[i];
  }
  const occupied = live / Math.max(1, seen);
  if (occupied < 0.012 || occupied > 0.62) return false;
  if (live > 0 && mass / live < 0.05) return false;
  return true;
}
