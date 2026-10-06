import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, FieldSnapshot, SpatialRecipe } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const EDGE = 1.2;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));
const TWISTS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 0.7, -1.05];

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

export type TerrainKind =
  | "rolling"
  | "valley"
  | "plateau"
  | "dune"
  | "basin"
  | "ridge"
  | "terrace"
  | "mounds"
  | "channel"
  | "hollow"
  | "ripple"
  | "crater"
  | "layered"
  | "spine"
  | "slope"
  | "organic"
  | "pockets"
  | "flowing"
  | "depression"
  | "commons";

export type GrowthKind = "mesh" | "filament" | "sparse" | "bloom" | "mass" | "wander" | "committed" | "patchy";
export type GroundFigure = "pads" | "carve";

export const TERRAIN_FAMILIES: TerrainKind[] = [
  "rolling",
  "valley",
  "plateau",
  "dune",
  "basin",
  "ridge",
  "terrace",
  "mounds",
  "channel",
  "hollow",
  "ripple",
  "crater",
  "layered",
  "spine",
  "slope",
  "organic",
  "pockets",
  "flowing",
  "depression",
  "commons",
];

export const GROWTH_MODES: GrowthKind[] = [
  "mesh",
  "filament",
  "sparse",
  "bloom",
  "mass",
  "wander",
  "committed",
  "patchy",
];

export const GROUND_FIGURES: GroundFigure[] = ["pads", "carve"];

export type TopographicPlan = {
  kind: TerrainKind;
  growth: GrowthKind;
  figure: GroundFigure;
  index: number;
  scale: number;
  originX: number;
  originY: number;
  twist: number;
  flip: boolean;
};

function pt(x: number, y: number, radius: number, strength: number, hole = false): FieldAttractor {
  return { kind: hole ? "ring" : "point", x: lim(x), y: lim(y), radius, strength, hole };
}

function rotate(x: number, y: number, plan: TopographicPlan) {
  const dx = (x - CENTER) * plan.scale * (plan.flip ? -1 : 1);
  const dy = (y - CENTER) * plan.scale;
  const c = Math.cos(plan.twist);
  const s = Math.sin(plan.twist);
  return {
    x: lim(plan.originX + dx * c - dy * s),
    y: lim(plan.originY + dx * s + dy * c),
  };
}

function place(marks: FieldAttractor[], plan: TopographicPlan): FieldAttractor[] {
  return marks.map((mark) => {
    const a = rotate(mark.x, mark.y, plan);
    const out: FieldAttractor = { ...mark, x: a.x, y: a.y, radius: (mark.radius ?? 1.2) * plan.scale };
    if (mark.x2 != null && mark.y2 != null) {
      const b = rotate(mark.x2, mark.y2, plan);
      out.x2 = b.x;
      out.y2 = b.y;
    }
    if (mark.cx != null && mark.cy != null) {
      const c = rotate(mark.cx, mark.cy, plan);
      out.cx = c.x;
      out.cy = c.y;
    }
    return out;
  });
}

function isPad(mark: FieldAttractor) {
  return mark.kind !== "line" && mark.kind !== "curve" && mark.hole !== true;
}

/** Push grounds apart so the space between them stays an opening. */
function spreadPads(pads: FieldAttractor[]) {
  const points = pads.map((pad) => ({ x: pad.x, y: pad.y, radius: pad.radius, strength: pad.strength }));
  const gap = 5.6;
  for (let pass = 0; pass < 10; pass += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        let dx = points[j].x - points[i].x;
        let dy = points[j].y - points[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) {
          dx = 1;
          dy = 0.2;
          d = Math.hypot(dx, dy);
        }
        const push = (gap - d) / 2;
        points[i].x = lim(points[i].x - (dx / d) * push);
        points[i].y = lim(points[i].y - (dy / d) * push);
        points[j].x = lim(points[j].x + (dx / d) * push);
        points[j].y = lim(points[j].y + (dy / d) * push);
      }
    }
  }
  return points;
}

function growMarks(marks: FieldAttractor[], growth: GrowthKind, figure: GroundFigure, _kind: TerrainKind, _f: Frame): FieldAttractor[] {
  const radiusMul =
    growth === "mass" ? 1.12 : growth === "bloom" ? 1.04 : growth === "filament" ? 0.9 : growth === "sparse" ? 0.88 : 1;
  const open = figure === "carve" ? 0.82 : 1;
  const pads = spreadPads(marks.filter(isPad));
  return pads.map((pad) => {
    let nearest = 8;
    for (const other of pads) {
      if (other === pad) continue;
      nearest = Math.min(nearest, Math.hypot(pad.x - other.x, pad.y - other.y));
    }
    const want = Math.max(1.7, (pad.radius ?? 2.1) * open * radiusMul);
    const radius = Math.min(want, Math.max(1.55, nearest * 0.34));
    return pt(pad.x, pad.y, radius, (pad.strength ?? 0.45) * 0.7);
  });
}

function familyMarks(kind: TerrainKind, f: Frame): FieldAttractor[] {
  const marks: FieldAttractor[] = [];
  if (kind === "rolling") {
    for (let i = 0; i < 4; i += 1) {
      marks.push(pt(4.2 + i * 3.6 + f.r(-0.2, 0.2), CENTER + Math.sin(i * 0.95) * f.r(1.2, 2.4), f.r(1.9, 2.4), 0.48));
    }
    return marks;
  }
  if (kind === "valley") {
    marks.push(pt(5.2, CENTER - 2.8, 2.4, 0.5));
    marks.push(pt(10, CENTER - 2.4, 2.2, 0.46));
    marks.push(pt(14.8, CENTER - 2.6, 2.4, 0.5));
    marks.push(pt(5.4, CENTER + 2.8, 2.4, 0.5));
    marks.push(pt(10.2, CENTER + 2.5, 2.2, 0.46));
    marks.push(pt(14.6, CENTER + 2.7, 2.4, 0.5));
    return marks;
  }
  if (kind === "plateau") {
    marks.push(pt(CENTER - 1.6, CENTER - 0.4, 3.6, 0.58));
    marks.push(pt(CENTER + 2.4, CENTER + 1.1, 3.2, 0.52));
    marks.push(pt(CENTER + 0.4, CENTER + 2.8, 2.3, 0.4));
    return marks;
  }
  if (kind === "dune") {
    for (let i = 0; i < 3; i += 1) {
      const y = 6.2 + i * 3.6;
      marks.push(pt(5.4, y + f.r(-0.3, 0.3), 2.3, 0.46));
      marks.push(pt(10, y + (i % 2 ? 1.2 : -1.2), 2.5, 0.48));
      marks.push(pt(14.6, y + f.r(-0.3, 0.3), 2.3, 0.46));
    }
    return marks;
  }
  if (kind === "basin") {
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + f.r(-0.15, 0.15);
      marks.push(pt(CENTER + Math.cos(a) * 4.8, CENTER + Math.sin(a) * 4.8, f.r(2.2, 2.9), 0.5));
    }
    return marks;
  }
  if (kind === "ridge") {
    for (let i = 0; i < 5; i += 1) {
      marks.push(pt(4.8 + i * 2.6, CENTER + (i % 2 ? 1.6 : -1.6), f.r(2, 2.6), 0.48));
    }
    return marks;
  }
  if (kind === "terrace") {
    for (let i = 0; i < 4; i += 1) {
      const y = 5.4 + i * 3;
      marks.push(pt(6.2, y, 2.2, 0.4 + i * 0.04));
      marks.push(pt(13.6, y, 2.2, 0.4 + i * 0.04));
    }
    return marks;
  }
  if (kind === "mounds") {
    const spots = [
      [6.2, 7.2],
      [12.2, 6.4],
      [14.4, 11.2],
      [9.2, 13.4],
      [5.6, 11.6],
    ];
    for (const [x, y] of spots) marks.push(pt(x + f.r(-0.4, 0.4), y + f.r(-0.4, 0.4), f.r(2.3, 3.2), 0.52));
    return marks;
  }
  if (kind === "channel") {
    marks.push(pt(5.4, 6.2, 2.3, 0.46));
    marks.push(pt(9.6, 9.8, 2.5, 0.5));
    marks.push(pt(14.4, 13.6, 2.3, 0.46));
    marks.push(pt(5.8, 13.8, 2.2, 0.44));
    marks.push(pt(14.2, 6.4, 2.2, 0.44));
    return marks;
  }
  if (kind === "hollow") {
    marks.push(pt(CENTER - 3.2, CENTER, 2.6, 0.48));
    marks.push(pt(CENTER + 3.2, CENTER, 2.6, 0.48));
    marks.push(pt(CENTER, CENTER - 3.1, 2.4, 0.44));
    marks.push(pt(CENTER, CENTER + 3.1, 2.4, 0.44));
    return marks;
  }
  if (kind === "ripple") {
    for (let i = 0; i < 5; i += 1) {
      const y = 5 + i * 2.5;
      marks.push(pt(6.2 + (i % 2 ? 1.6 : 0), y, 2, 0.42));
      marks.push(pt(13.4 - (i % 2 ? 1.6 : 0), y, 2, 0.42));
    }
    return marks;
  }
  if (kind === "crater") {
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + f.r(-0.12, 0.12);
      marks.push(pt(CENTER + Math.cos(a) * 5.2, CENTER + Math.sin(a) * 4.6, f.r(1.8, 2.3), 0.46));
    }
    return marks;
  }
  if (kind === "layered") {
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      marks.push(pt(CENTER - 3.4 + t * 1.2, 5.6 + t * 8.2, 2.3, 0.4 + t * 0.1));
      marks.push(pt(CENTER + 3.4 - t * 1.2, 5.6 + t * 8.2, 2.3, 0.4 + t * 0.1));
    }
    return marks;
  }
  if (kind === "spine") {
    marks.push(pt(6.4, 6.6, 2.4, 0.48));
    marks.push(pt(10, 10, 2.8, 0.54));
    marks.push(pt(13.8, 13.4, 2.4, 0.48));
    marks.push(pt(8.2, 12.6, 2, 0.4));
    return marks;
  }
  if (kind === "slope") {
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      marks.push(pt(CENTER, 5.4 + t * 8.6, 2.6 - t * 0.7, 0.36 + t * 0.14));
    }
    return marks;
  }
  if (kind === "organic") {
    for (let i = 0; i < 5; i += 1) {
      marks.push(pt(5.6 + i * 2.2 + f.r(-0.5, 0.5), 5.8 + i * 1.7 + f.r(-0.8, 0.8), f.r(1.9, 2.6), 0.44));
    }
    return marks;
  }
  if (kind === "pockets") {
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2 + f.r(-0.2, 0.2);
      marks.push(pt(CENTER + Math.cos(a) * f.r(3.4, 6.2), CENTER + Math.sin(a) * f.r(3.2, 5.8), f.r(1.7, 2.3), 0.42));
    }
    return marks;
  }
  if (kind === "flowing") {
    marks.push(pt(5.2, 7.4, 2.3, 0.46));
    marks.push(pt(9.2, 6.2, 2.2, 0.44));
    marks.push(pt(13.8, 8.8, 2.4, 0.48));
    marks.push(pt(12.4, 13.2, 2.3, 0.46));
    marks.push(pt(7.2, 12.8, 2.2, 0.44));
    return marks;
  }
  if (kind === "depression") {
    marks.push(pt(CENTER - 2.8, CENTER + 0.4, 3.2, 0.52));
    marks.push(pt(CENTER + 3.1, CENTER + 1.4, 3, 0.5));
    marks.push(pt(CENTER, CENTER - 3, 2.6, 0.46));
    return marks;
  }
  marks.push(pt(CENTER, CENTER, 3.2, 0.5));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + f.r(-0.2, 0.2);
    marks.push(pt(CENTER + Math.cos(a) * f.r(4.4, 6.6), CENTER + Math.sin(a) * f.r(4.2, 6.2), f.r(1.8, 2.5), 0.42));
  }
  return marks;
}

const LINEAR_KINDS: TerrainKind[] = ["channel", "spine", "ridge", "valley", "flowing"];
const LINEAR_GROWTH: GrowthKind[] = ["filament", "sparse", "mesh"];

export function planTopographicGroundField(seed: number, attempt = 0, index = 0): TopographicPlan {
  const rng = mulberry32(seed ^ 0x70f00d ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  const linearPass = attempt > 0;
  return {
    kind: linearPass ? LINEAR_KINDS[(index + attempt) % LINEAR_KINDS.length] : TERRAIN_FAMILIES[(index * 7 + attempt * 5) % TERRAIN_FAMILIES.length],
    growth: linearPass ? LINEAR_GROWTH[attempt % LINEAR_GROWTH.length] : GROWTH_MODES[(index * 11 + attempt * 3) % GROWTH_MODES.length],
    figure: GROUND_FIGURES[(Math.floor(index / 20) + index + attempt) & 1],
    index,
    scale: f.r(0.74, 1.12),
    originX: CENTER + f.r(-1.4, 1.4),
    originY: CENTER + f.r(-1.4, 1.4),
    twist: TWISTS[(index * 3 + attempt) % TWISTS.length] + f.r(-0.2, 0.2),
    flip: ((index + attempt) & 1) === 1,
  };
}

export function attractorsFromTopographic(plan: TopographicPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x70f1e1d ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x165667b1));
  const f = frame(rng);
  return place(growMarks(familyMarks(plan.kind, f), plan.growth, plan.figure, plan.kind, f), plan);
}

export function slimeFromTopographic(base: SlimeControls, plan: TopographicPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index ^ plan.growth.length);
  const f = frame(rng);
  const byGrowth: Record<GrowthKind, Partial<SlimeControls>> = {
    mesh: {
      persistence: f.r(0.48, 0.78),
      trailInfluence: f.r(0.8, 1.5),
      deposit: f.r(0.08, 0.16),
      depositWidth: f.r(1.2, 2),
      diffusion: f.r(0.06, 0.12),
      randomness: f.r(0.08, 0.26),
      trailCap: f.r(0.85, 1.5),
    },
    filament: {
      persistence: f.r(0.62, 0.86),
      trailInfluence: f.r(1, 1.7),
      deposit: f.r(0.04, 0.09),
      depositWidth: f.r(0.7, 1.15),
      diffusion: f.r(0.03, 0.07),
      randomness: f.r(0.05, 0.2),
      trailCap: f.r(0.55, 1.05),
    },
    sparse: {
      persistence: f.r(0.32, 0.58),
      trailInfluence: f.r(0.45, 0.95),
      deposit: f.r(0.04, 0.1),
      depositWidth: f.r(0.85, 1.4),
      diffusion: f.r(0.03, 0.07),
      randomness: f.r(0.18, 0.42),
      trailCap: f.r(0.5, 1.05),
    },
    bloom: {
      persistence: f.r(0.38, 0.66),
      trailInfluence: f.r(0.55, 1.2),
      deposit: f.r(0.07, 0.16),
      depositWidth: f.r(1.3, 2.2),
      diffusion: f.r(0.08, 0.14),
      randomness: f.r(0.12, 0.36),
      trailCap: f.r(0.8, 1.45),
    },
    mass: {
      persistence: f.r(0.5, 0.8),
      trailInfluence: f.r(0.7, 1.4),
      deposit: f.r(0.12, 0.22),
      depositWidth: f.r(1.7, 2.6),
      diffusion: f.r(0.04, 0.1),
      randomness: f.r(0.05, 0.2),
      trailCap: f.r(1.15, 1.8),
    },
    wander: {
      persistence: f.r(0.28, 0.52),
      trailInfluence: f.r(0.4, 0.95),
      deposit: f.r(0.06, 0.13),
      depositWidth: f.r(1, 1.8),
      diffusion: f.r(0.05, 0.11),
      randomness: f.r(0.22, 0.48),
      trailCap: f.r(0.65, 1.25),
    },
    committed: {
      persistence: f.r(0.68, 0.9),
      trailInfluence: f.r(1.05, 1.75),
      deposit: f.r(0.07, 0.15),
      depositWidth: f.r(1.1, 1.9),
      diffusion: f.r(0.04, 0.09),
      randomness: f.r(0.04, 0.16),
      trailCap: f.r(0.8, 1.45),
    },
    patchy: {
      persistence: f.r(0.4, 0.7),
      trailInfluence: f.r(0.55, 1.25),
      deposit: f.r(0.08, 0.18),
      depositWidth: f.r(1.15, 2.1),
      diffusion: f.r(0.03, 0.08),
      randomness: f.r(0.1, 0.32),
      trailCap: f.r(0.7, 1.4),
    },
  };
  return {
    ...base,
    ...byGrowth[plan.growth],
    sensorAngle: f.r(0.45, 0.75),
    sensorDistance: f.r(0.32, 0.55),
    turnAngle: f.r(0.28, 0.48),
    stepSize: f.r(0.12, 0.2),
    resistance: f.r(0.02, 0.08),
    decay: 0.998,
    trailInfluence: f.r(0.18, 0.32),
    randomness: f.r(0.28, 0.46),
    persistence: f.r(0.18, 0.34),
    diffusion: 0,
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
    foodPoints: [],
  };
}

export function paramsFromTopographic(base: BiologicalParams, seed: number): BiologicalParams {
  const rng = mulberry32(seed ^ 0x70fa11);
  return {
    ...base,
    attractionStrength: 0.06 + rng() * 0.08,
    networkDensity: 0.22 + rng() * 0.2,
    permeability: 0.48 + rng() * 0.42,
    flowCoupling: 0.12 + rng() * 0.16,
    geometryVariation: 0.2 + rng() * 0.2,
    directionalBias: 0.02,
  };
}

export function recipeFromTopographic(recipe: SpatialRecipe, seed: number): SpatialRecipe {
  const rng = mulberry32(seed ^ 0x70ec1e);
  const f = frame(rng);
  return {
    ...recipe,
    clustering: f.r(0.04, 0.42),
    isolationRadius: f.r(4.2, 6.8),
    approachWidth: f.r(2.8, 4.7),
    coreExposure: f.r(0.62, 0.96),
  };
}

export function agentsFromTopographic(plan: TopographicPlan, seed: number) {
  const rng = mulberry32(seed ^ 0x70a11e ^ plan.index);
  const byGrowth: Record<GrowthKind, [number, number]> = {
    mesh: [160, 200],
    filament: [150, 190],
    sparse: [140, 180],
    bloom: [160, 210],
    mass: [180, 230],
    wander: [150, 200],
    committed: [160, 200],
    patchy: [155, 200],
  };
  const [min, max] = byGrowth[plan.growth];
  const count = min + rng() * (max - min);
  return Math.round(plan.figure === "carve" ? count * 1.12 : count);
}

function fieldProfile(snapshot: FieldSnapshot) {
  const trails = snapshot.trails;
  const ts = snapshot.trailSize;
  const scale = ts / FIELD_SIZE;
  const liveAt = (x: number, y: number) => x >= 0 && y >= 0 && x < ts && y < ts && trails[y * ts + x] >= 0.012;
  let live = 0;
  let filled = 0;
  let minX = ts;
  let minY = ts;
  let maxX = 0;
  let maxY = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < trails.length; i += 1) {
    if (trails[i] < 0.012) continue;
    live += 1;
    const px = i % ts;
    const py = Math.floor(i / ts);
    sx += px;
    sy += py;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    let n = 0;
    if (liveAt(px - 1, py)) n += 1;
    if (liveAt(px + 1, py)) n += 1;
    if (liveAt(px, py - 1)) n += 1;
    if (liveAt(px, py + 1)) n += 1;
    if (n >= 3) filled += 1;
  }
  const spanX = (maxX - minX) / scale;
  const spanY = (maxY - minY) / scale;
  let linearity = 0;
  if (live > 8) {
    const mx = sx / live;
    const my = sy / live;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (let i = 0; i < trails.length; i += 1) {
      if (trails[i] < 0.012) continue;
      const dx = (i % ts) - mx;
      const dy = Math.floor(i / ts) - my;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
    }
    xx /= live;
    yy /= live;
    xy /= live;
    const trace = xx + yy;
    const det = xx * yy - xy * xy;
    const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    const major = trace / 2 + disc;
    const minor = trace / 2 - disc;
    linearity = major > 0.0001 ? 1 - minor / major : 0;
  }
  return {
    occupied: live / Math.max(1, trails.length),
    trailSpan: Math.max(spanX, spanY),
    spanX,
    spanY,
    biaxial: Math.min(spanX, spanY) / Math.max(0.01, Math.max(spanX, spanY)),
    fill: filled / Math.max(1, live),
    linearity,
  };
}

export function topographicIdentity(_features: unknown, attractors: FieldAttractor[], snapshot?: FieldSnapshot): boolean {
  const holes = attractors.filter((item) => item.hole || item.kind === "ring").length;
  const pads = attractors.filter((item) => (item.radius ?? 0) >= 1.45 && !item.hole && item.kind !== "line" && item.kind !== "curve").length;
  if (holes < 2 && pads < 2) return false;
  if (!snapshot) return true;
  const profile = fieldProfile(snapshot);
  if (holes >= 2) {
    if (profile.occupied < 0.08 || profile.occupied > 0.78) return false;
    if (profile.trailSpan < 7) return false;
    if (profile.biaxial < 0.28) return false;
    if (profile.fill < 0.4 && profile.linearity < 0.42) return false;
    return profile.fill >= 0.16;
  }
  if (profile.occupied < 0.03 || profile.occupied > 0.48) return false;
  if (profile.trailSpan < 7) return false;
  if (profile.biaxial < 0.28) return false;
  if (profile.fill < 0.4 && profile.linearity < 0.42) return false;
  return profile.fill >= 0.18;
}

export function scoreTopographic(snapshot: FieldSnapshot, attractors: FieldAttractor[]): number {
  if (attractors.length < 4) return 0;
  const profile = fieldProfile(snapshot);
  const field = profile.fill >= 0.16 && profile.biaxial >= 0.34 ? 1.3 : 0.12;
  const cover = profile.occupied > 0.09 && profile.occupied < 0.72 ? 1 : 0.22;
  return profile.fill * 1.6 + profile.biaxial + field + cover;
}

export function topographicSignature(
  attractors: FieldAttractor[],
  extra?: { slime?: SlimeControls; agents?: number; kind?: TerrainKind; growth?: GrowthKind; figure?: GroundFigure; snapshot?: FieldSnapshot },
): number[] {
  const holes = attractors.filter((item) => item.hole || item.kind === "ring").length;
  const lines = attractors.filter((item) => item.kind === "line").length;
  const curves = attractors.filter((item) => item.kind === "curve").length;
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x);
    maxY = Math.max(maxY, item.y);
  }
  const slime = extra?.slime;
  return [
    attractors.length / 28,
    holes / 10,
    lines / 10,
    curves / 12,
    (maxX - minX) / FIELD_SIZE,
    (maxY - minY) / FIELD_SIZE,
    extra?.kind ? TERRAIN_FAMILIES.indexOf(extra.kind) / 20 : 0,
    extra?.growth ? GROWTH_MODES.indexOf(extra.growth) / 10 : 0,
    extra?.figure === "carve" || holes > 0 ? 1 : 0,
    extra?.agents ? extra.agents / 400 : 0,
    slime ? slime.deposit : 0,
    slime ? slime.depositWidth / 3.4 : 0,
    slime ? slime.diffusion : 0,
    slime ? slime.randomness / 1.2 : 0,
    ...(extra?.snapshot
      ? (() => {
          const profile = fieldProfile(extra.snapshot);
          return [profile.occupied, profile.fill, profile.linearity, profile.biaxial];
        })()
      : []),
  ];
}

function signatureDistance(a: number[], b: number[]) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, len));
}

export function isNovelTerrain(signature: number[], previous: number[][]): boolean {
  if (!previous.length) return true;
  return previous.every((item) => signatureDistance(signature, item) >= 0.34);
}

export function pickMostNovelTerrain(signatures: number[][], previous: number[][]): number {
  if (!signatures.length) return 0;
  let best = 0;
  let bestMin = -1;
  for (let i = 0; i < signatures.length; i += 1) {
    const nearest = previous.length ? Math.min(...previous.map((item) => signatureDistance(signatures[i], item))) : 1;
    if (nearest > bestMin) {
      bestMin = nearest;
      best = i;
    }
  }
  return best;
}
