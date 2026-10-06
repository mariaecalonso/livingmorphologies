import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { FieldAttractor, FieldSnapshot } from "./types";

const CENTER = (FIELD_SIZE - 1) / 2;
const lim = (value: number) => Math.min(FIELD_SIZE - 1.15, Math.max(1.15, value));

type Rng = () => number;
type CoreKind =
  | "compact"
  | "expanded"
  | "elongated"
  | "compressed"
  | "irregular"
  | "split"
  | "lobed"
  | "nested"
  | "pinched"
  | "branched"
  | "offset"
  | "openings";

type ApproachKind = "single" | "pair" | "fan" | "diagonal" | "vertical" | "tangential" | "branching";
type RelationKind = "tight" | "loose" | "one-side" | "multi" | "separated" | "asymmetric";

export type MorphPlan = {
  core: CoreKind;
  approach: ApproachKind;
  relation: RelationKind;
  cx: number;
  cy: number;
  axis: number;
  span: number;
  aspect: number;
};

export type MorphFeatures = {
  voidArea: number;
  voidCx: number;
  voidCy: number;
  voidAspect: number;
  voidAngle: number;
  occupied: number;
  density: number;
  rimContact: number;
  branches: number;
  bins: number[];
  components: number;
  approachCount: number;
  coreSpan: number;
  openness: number;
};

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

function hole(x: number, y: number, radius: number, strength = 1.1): FieldAttractor {
  return { kind: "ring", x: lim(x), y: lim(y), radius, strength, hole: true };
}

function node(x: number, y: number, radius: number, strength: number): FieldAttractor {
  return { kind: "point", x: lim(x), y: lim(y), radius, strength };
}

function path(
  x: number,
  y: number,
  x2: number,
  y2: number,
  radius: number,
  strength: number,
  curve: boolean,
  bend = 0,
): FieldAttractor {
  const mark: FieldAttractor = {
    kind: curve ? "curve" : "line",
    x: lim(x),
    y: lim(y),
    x2: lim(x2),
    y2: lim(y2),
    radius,
    strength,
  };
  if (curve) {
    mark.cx = lim((x + x2) / 2 - Math.sin(Math.atan2(y2 - y, x2 - x)) * bend);
    mark.cy = lim((y + y2) / 2 + Math.cos(Math.atan2(y2 - y, x2 - x)) * bend);
  }
  return mark;
}

export const VERTICAL_VOID_CORES: CoreKind[] = [
  "compact",
  "expanded",
  "elongated",
  "compressed",
  "irregular",
  "split",
  "lobed",
  "nested",
  "pinched",
  "branched",
  "offset",
  "openings",
];
export const VERTICAL_VOID_APPROACHES: ApproachKind[] = ["single", "pair", "fan", "diagonal", "vertical", "tangential", "branching"];
export const VERTICAL_VOID_RELATIONS: RelationKind[] = ["tight", "loose", "one-side", "multi", "separated", "asymmetric"];

/** Legal aspect interval for a core. Skill 2 may move inside the interval. */
export function verticalVoidAspectBand(core: CoreKind): [number, number] {
  if (core === "elongated") return [0.35, 2.5];
  if (core === "compressed") return [0.4, 0.85];
  if (core === "compact") return [0.8, 1.2];
  if (core === "expanded") return [0.7, 1.6];
  return [0.4, 2.2];
}

function coreRadius(core: CoreKind, f: Frame) {
  if (core === "compact") return f.pick([1.7, 2.0, 2.3]);
  if (core === "expanded") return f.pick([4.6, 5.1, 5.6]);
  if (core === "compressed") return f.pick([2.2, 2.6, 3.0]);
  return f.pick([2.6, 3.2, 3.8, 4.3]);
}

function buildCore(f: Frame, plan: MorphPlan): FieldAttractor[] {
  const { cx, cy, axis } = plan;
  const radius = coreRadius(plan.core, f);
  const primary = hole(cx, cy, radius);
  if (plan.core !== "split" && plan.core !== "branched") return [primary];
  const gap = radius + f.r(1.1, 2.2);
  const second = hole(cx + Math.cos(axis) * gap, cy + Math.sin(axis) * gap, radius * f.r(0.7, 0.95));
  if (plan.core === "split") return [primary, second];
  const side = hole(
    cx + Math.cos(axis + Math.PI / 2) * (radius + f.r(0.9, 1.6)),
    cy + Math.sin(axis + Math.PI / 2) * (radius + f.r(0.9, 1.6)),
    radius * f.r(0.55, 0.75),
  );
  return [primary, second, side];
}

function rimPoint(holes: FieldAttractor[], angle: number, extra: number) {
  let best = holes[0];
  let bestR = 0;
  for (const item of holes) {
    const r = item.radius ?? 2;
    if (r > bestR) {
      best = item;
      bestR = r;
    }
  }
  const reach = (best.radius ?? 2) + extra;
  return { x: best.x + Math.cos(angle) * reach, y: best.y + Math.sin(angle) * reach, core: best, reach };
}

function buildApproaches(f: Frame, plan: MorphPlan, holes: FieldAttractor[]): FieldAttractor[] {
  const marks: FieldAttractor[] = [];
  const dirs: number[] = [];
  if (plan.approach === "single") dirs.push(plan.axis + f.r(-0.25, 0.25));
  else if (plan.approach === "pair") dirs.push(plan.axis, plan.axis + Math.PI);
  else if (plan.approach === "diagonal") dirs.push(plan.axis + Math.PI / 4);
  else if (plan.approach === "vertical") dirs.push(-Math.PI / 2 + f.r(-0.18, 0.18));
  else if (plan.approach === "tangential") dirs.push(plan.axis + Math.PI / 2);
  else if (plan.approach === "fan") {
    dirs.push(plan.axis - 0.7, plan.axis, plan.axis + 0.7);
  } else {
    dirs.push(plan.axis, plan.axis + 0.95);
  }

  for (let i = 0; i < dirs.length; i += 1) {
    const angle = dirs[i];
    const far = f.r(6.4, 8.6);
    const stop = plan.relation === "separated" ? f.r(1.2, 2.0) : f.r(0.25, 0.7);
    const rim = rimPoint(holes, angle, stop);
    const start = { x: plan.cx + Math.cos(angle) * far, y: plan.cy + Math.sin(angle) * far };
    marks.push(
      path(start.x, start.y, rim.x, rim.y, i === 0 ? f.r(1.4, 2.3) : f.r(0.8, 1.5), i === 0 ? 0.82 : 0.5, plan.approach !== "vertical", f.r(0.8, 2.6)),
    );
  }
  const nodes = plan.relation === "one-side" ? 2 : f.int(3, 5);
  const start = plan.relation === "one-side" || plan.relation === "asymmetric" ? plan.axis - 0.8 : 0;
  const sweep = plan.relation === "one-side" ? Math.PI : Math.PI * 2;
  for (let i = 0; i < nodes; i += 1) {
    const a = start + (i / nodes) * sweep;
    const p = rimPoint(holes, a, f.r(1.4, 3.2));
    marks.push(node(p.x, p.y, f.r(0.7, 1.4), f.r(0.28, 0.55)));
  }
  return marks;
}

export function planVerticalVoid(seed: number, attempt = 0, index = 0): MorphPlan {
  const rng = mulberry32(seed ^ 0xa77ac7 ^ (attempt * 0x9e3779b9) ^ (index * 0x85ebca6b));
  const f = frame(rng);
  const core = VERTICAL_VOID_CORES[index % VERTICAL_VOID_CORES.length];
  const col = index % 5;
  const row = Math.floor(index / 5) % 4;
  const [low, high] = verticalVoidAspectBand(core);
  return {
    core,
    approach: VERTICAL_VOID_APPROACHES[(index + attempt) % VERTICAL_VOID_APPROACHES.length],
    relation: VERTICAL_VOID_RELATIONS[Math.floor(index / 3) % VERTICAL_VOID_RELATIONS.length],
    cx: lim(2.6 + col * 3.6 + f.r(-0.7, 0.7)),
    cy: lim(2.8 + row * 4.3 + f.r(-0.8, 0.8)),
    axis: f.r(-Math.PI, Math.PI),
    span: f.r(3.2, 6.4),
    aspect: low + f.r(0, 1) * (high - low),
  };
}

export function attractorsFromVerticalVoidPlan(plan: MorphPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x51f00d ^ (attempt * 0x85ebca6b));
  const f = frame(rng);
  const holes = buildCore(f, plan);
  return [...holes, ...buildApproaches(f, plan, holes)];
}

export function slimeFromVerticalVoidPlan(base: SlimeControls, plan: MorphPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const next = { ...base };
  next.voidElongation = clamp(plan.aspect, 0.4, 2.4);
  next.voidRotation = plan.axis;
  next.voidLobes = 0;
  next.voidNotch = 0;
  next.trailInfluence = 0.22 + rng() * 0.16;
  next.resistance = 0.04 + rng() * 0.1;
  next.persistence = 0.28 + rng() * 0.2;
  next.sensorAngle = 0.35 + rng() * 0.25;
  next.sensorDistance = 0.4 + rng() * 0.3;
  next.turnAngle = 0.25 + rng() * 0.2;
  next.depositWidth = 0.14;
  next.deposit = 0.016;
  next.diffusion = 0;
  next.decay = 0.998;
  next.randomness = 0.2 + rng() * 0.14;
  next.foodPoints = [];
  return next;
}

function isVoid(item: FieldAttractor) {
  return item.hole === true || item.kind === "ring";
}

export function extractMorphFeatures(snapshot: FieldSnapshot, attractors: FieldAttractor[]): MorphFeatures {
  const holes = attractors.filter(isVoid);
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  let voidArea = 0;
  let voidCx = CENTER;
  let voidCy = CENTER;
  if (holes.length) {
    let w = 0;
    let sx = 0;
    let sy = 0;
    for (const item of holes) {
      const r = item.radius ?? 2;
      const mass = r * r;
      w += mass;
      sx += item.x * mass;
      sy += item.y * mass;
      minX = Math.min(minX, item.x - r);
      minY = Math.min(minY, item.y - r);
      maxX = Math.max(maxX, item.x + r);
      maxY = Math.max(maxY, item.y + r);
    }
    voidCx = sx / w;
    voidCy = sy / w;
    voidArea = w;
  }
  const width = Math.max(0.4, maxX - minX);
  const height = Math.max(0.4, maxY - minY);
  const voidAspect = width / height;
  const voidAngle = Math.atan2(maxY - minY, maxX - minX);

  const trails = snapshot.trails;
  const n = trails.length;
  let maxTrail = 0;
  for (let i = 0; i < n; i += 1) if (trails[i] > maxTrail) maxTrail = trails[i];
  const cut = maxTrail * 0.18;
  let occupied = 0;
  let density = 0;
  let rimContact = 0;
  let rimN = 0;
  const bins = Array.from({ length: 8 }, () => 0);
  const size = snapshot.trailSize || Math.sqrt(n);
  const scale = size / FIELD_SIZE;
  for (let i = 0; i < n; i += 1) {
    const value = trails[i];
    density += value;
    if (value < cut) continue;
    occupied += 1;
    const x = (i % size) / scale;
    const y = Math.floor(i / size) / scale;
    const dx = x - voidCx;
    const dy = y - voidCy;
    const d = Math.hypot(dx, dy);
    if (d > 0.4 && d < Math.max(width, height) * 0.7 + 2.2) {
      rimContact += value;
      rimN += 1;
      const bin = ((Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
      bins[bin] += 1;
    }
  }
  const branches = bins.filter((count) => count > occupied * 0.02).length;
  const grid = 16;
  const seen = new Uint8Array(grid * grid);
  let components = 0;
  const step = size / grid;
  const cellOn = (gx: number, gy: number) => {
    const x0 = Math.floor(gx * step);
    const y0 = Math.floor(gy * step);
    for (let y = y0; y < y0 + step && y < size; y += 1) {
      for (let x = x0; x < x0 + step && x < size; x += 1) {
        if (trails[y * size + x] >= cut) return true;
      }
    }
    return false;
  };
  const flood = (sx: number, sy: number) => {
    const stack = [sx + sy * grid];
    seen[sx + sy * grid] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % grid;
      const y = Math.floor(i / grid);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
        const j = nx + ny * grid;
        if (seen[j] || !cellOn(nx, ny)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
  };
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const i = gx + gy * grid;
      if (seen[i] || !cellOn(gx, gy)) continue;
      components += 1;
      flood(gx, gy);
    }
  }

  return {
    voidArea,
    voidCx,
    voidCy,
    voidAspect,
    voidAngle,
    occupied: occupied / Math.max(1, n),
    density: density / Math.max(1, n),
    rimContact: rimN ? rimContact / rimN : 0,
    branches,
    bins: bins.map((count) => count / Math.max(1, occupied)),
    components,
    approachCount: attractors.filter((item) => item.kind === "line" || item.kind === "curve").length,
    coreSpan: Math.max(width, height),
    openness: 1 - occupied / Math.max(1, n),
  };
}

export function verticalVoidIdentity(features: MorphFeatures): boolean {
  const centered = Math.hypot(features.voidCx - CENTER, features.voidCy - CENTER) < 5.2;
  const hasCore = features.voidArea > 2.2 && features.coreSpan > 2.4 && features.coreSpan < 14;
  const open = features.openness > 0.22;
  const engaged = features.rimContact > 0.002 && features.branches >= 1;
  const approach = features.approachCount >= 1;
  return centered && hasCore && open && engaged && approach;
}

function featureVector(features: MorphFeatures): number[] {
  return [
    features.voidArea / 40,
    features.voidCx / FIELD_SIZE,
    features.voidCy / FIELD_SIZE,
    Math.min(3, features.voidAspect) / 3,
    (features.voidAngle + Math.PI) / (Math.PI * 2),
    features.occupied,
    Math.min(1, features.density / 0.25),
    Math.min(1, features.rimContact / 0.08),
    features.branches / 8,
    features.components / 8,
    features.approachCount / 10,
    features.coreSpan / FIELD_SIZE,
    features.openness,
    ...features.bins,
  ];
}

export function morphDistance(a: MorphFeatures, b: MorphFeatures): number {
  const va = featureVector(a);
  const vb = featureVector(b);
  let sum = 0;
  for (let i = 0; i < va.length; i += 1) {
    const d = va[i] - vb[i];
    sum += d * d;
  }
  return Math.sqrt(sum / va.length);
}

const NOVELTY_GAP = 0.11;

export function isNovelMorphology(features: MorphFeatures, previous: MorphFeatures[]): boolean {
  if (!previous.length) return true;
  return previous.every((item) => morphDistance(features, item) >= NOVELTY_GAP);
}

export function pickMostNovel(candidates: MorphFeatures[], previous: MorphFeatures[]): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < candidates.length; i += 1) {
    const score = previous.length
      ? Math.min(...previous.map((item) => morphDistance(candidates[i], item)))
      : 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
