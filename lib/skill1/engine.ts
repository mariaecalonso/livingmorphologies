import { mulberry32 } from "../physarum";
import { configForArchetype } from "./archetypes";
import {
  CONVERGENCE_EPSILON,
  CONVERGENCE_MIN_ITERATIONS,
  CONVERGENCE_STREAK,
  DEFAULT_AGENT_COUNT,
  FIELD_SIZE,
  MAX_AGENT_COUNT,
  MAX_ITERATIONS,
  MIN_AGENT_COUNT,
  PATH_LENGTH,
  TRAIL_SCALE,
} from "./maps";
import { attractorFromRatings, sourceFromCorner } from "./translate";
import {
  containSteppedAmphitheater,
  inkSteppedAmphitheater,
  spawnOnSteppedAmphitheater,
  steerSteppedAmphitheater,
} from "./run-stepped-amphitheater";
import { voidRadius, type SlimeControls } from "./slime-controls";
import { HAIR_CAP, HAIR_DECAY, HAIR_DEPOSIT, HAIR_WIDTH } from "./hair-ink";
import type {
  BiologicalTranslation,
  FieldAttractor,
  FieldSnapshot,
  Point,
  SimAgent,
  SimulationState,
} from "./types";

const TWO_PI = Math.PI * 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A deposit stays a trail. A wider disc reads as a blur instead of a Physarum path. */
const TRAIL_RADIUS = 3;

function fineTrail(archetypeId: string) {
  return (
    archetypeId === "compressed-sequential" ||
    archetypeId === "topographic-ground-field" ||
    archetypeId === "linear-gallery" ||
    archetypeId === "flat-deep-plan" ||
    archetypeId === "undulated" ||
    archetypeId === "inserted-horizontal-plate" ||
    archetypeId === "terraced" ||
    archetypeId === "void-field" ||
    archetypeId === "linear-edge-gallery"
  );
}

const wrapAngle = (angle: number) => {
  let next = angle % TWO_PI;
  if (next < 0) next += TWO_PI;
  return next;
};

const angleDelta = (a: number, b: number) => {
  const d = Math.abs(wrapAngle(a) - wrapAngle(b));
  return Math.min(d, TWO_PI - d);
};

const fieldIndex = (x: number, y: number, size: number) =>
  Math.round(y) * size + Math.round(x);

export function sampleField(field: number[], point: Point, size: number) {
  const x = clamp(point.x, 0, size - 1);
  const y = clamp(point.y, 0, size - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = field[y0 * size + x0];
  const b = field[y0 * size + x1];
  const c = field[y1 * size + x0];
  const d = field[y1 * size + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

const topologyCache = new Map<string, ReturnType<typeof configForArchetype>["topology"]>();

const topologyOf = (translation: BiologicalTranslation) => {
  let topology = topologyCache.get(translation.archetypeId);
  if (topology === undefined) {
    topology = configForArchetype(translation.archetypeId).topology;
    topologyCache.set(translation.archetypeId, topology);
  }
  return topology;
};

const aroundAbsence = (translation: BiologicalTranslation) =>
  translation.archetypeId !== "stepped-amphitheater" && topologyOf(translation) === "around-absence";

const containedInterior = (translation: BiologicalTranslation) =>
  topologyOf(translation) === "contained-interior";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function buildAttractionField(
  size: number,
  attractor: Point,
  translation: BiologicalTranslation,
  slime?: SlimeControls,
) {
  const { attractionStrength, influenceRadius, scaleVariation } = translation.params;
  const field = new Array<number>(size * size).fill(0);
  if (translation.archetypeId === "void-field" && translation.recipe.attractors?.length) {
    const circulation = translation.recipe.attractors.filter((item) => item.kind !== "ring" && !item.hole);
    paintAttractorList(field, size, circulation.length ? circulation : translation.recipe.attractors, attractionStrength, slime);
    return field;
  }
  if (translation.recipe.attractorsOnly && translation.recipe.attractors?.length) {
    paintAttractorList(field, size, translation.recipe.attractors, attractionStrength, slime);
    return field;
  }
  if (aroundAbsence(translation)) {
    const ringR = translation.recipe.isolationRadius * (0.7 + scaleVariation * 0.12);
    const sigma = Math.max(1.05, influenceRadius * 0.16);
    const twoSigma = 2 * sigma * sigma;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - attractor.x, y - attractor.y);
        const angle = Math.atan2(y - attractor.y, x - attractor.x);
        const wobble = slime
          ? voidRadius(angle, 1, slime)
          : 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
        const r = ringR * wobble;
        field[fieldIndex(x, y, size)] =
          attractionStrength * Math.exp(-((d - r) * (d - r)) / twoSigma);
      }
    }
    addRecipeAttractors(field, size, translation);
    return field;
  }
  if (translation.recipe.attractors?.length) {
    paintAttractorList(field, size, attractorList(attractor, translation), attractionStrength);
    return field;
  }
  if (!containedInterior(translation)) {
    const radius = Math.max(
      2.2,
      translation.recipe.isolationRadius * (1.35 + scaleVariation * 0.5),
    );
    const sigma = radius * (0.78 + scaleVariation * 0.22);
    const twoSigma = 2 * sigma * sigma;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - attractor.x, y - attractor.y);
        field[fieldIndex(x, y, size)] =
          attractionStrength * Math.exp(-(d * d) / twoSigma);
      }
    }
    return field;
  }
  const radius = Math.max(
    1.2,
    translation.recipe.isolationRadius * (1.05 + scaleVariation * 0.45),
  );
  const sigma = radius * (0.62 + scaleVariation * 0.28);
  const twoSigma = 2 * sigma * sigma;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - attractor.x, y - attractor.y);
      field[fieldIndex(x, y, size)] = attractionStrength * Math.exp(-(d * d) / twoSigma);
    }
  }
  return field;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/** Primary point plus every placed attractor. A mark already sitting on the primary is not added twice. */
function attractorList(primary: Point, translation: BiologicalTranslation): FieldAttractor[] {
  const extras = translation.recipe.attractors ?? [];
  if (translation.recipe.attractorFixed && extras.length) return extras;
  if (aroundAbsence(translation)) {
    return extras.length ? extras : [{ kind: "point", x: primary.x, y: primary.y }];
  }
  const primaryMark: FieldAttractor = { kind: "point", x: primary.x, y: primary.y, radius: 2.2 };
  if (!extras.length) return [primaryMark];
  const covered = extras.some(
    (item) => item.kind !== "line" && item.kind !== "curve" && Math.hypot(item.x - primary.x, item.y - primary.y) < 0.45,
  );
  return covered ? extras : [primaryMark, ...extras];
}

function curveEnds(item: FieldAttractor) {
  const x2 = item.x2 ?? item.x + 3;
  const y2 = item.y2 ?? item.y;
  return {
    x: item.x,
    y: item.y,
    x2,
    y2,
    cx: item.cx ?? (item.x + x2) / 2,
    cy: item.cy ?? (item.y + y2) / 2 + 1.6,
  };
}

function pointOnCurve(item: FieldAttractor, t: number): Point {
  const curve = curveEnds(item);
  const u = 1 - t;
  return {
    x: u * u * curve.x + 2 * u * t * curve.cx + t * t * curve.x2,
    y: u * u * curve.y + 2 * u * t * curve.cy + t * t * curve.y2,
  };
}

function nearestOnCurve(from: Point, item: FieldAttractor): Point {
  let best = pointOnCurve(item, 0);
  let bestD = dist(from, best);
  for (let step = 1; step <= 24; step += 1) {
    const point = pointOnCurve(item, step / 24);
    const d = dist(from, point);
    if (d < bestD) {
      best = point;
      bestD = d;
    }
  }
  return best;
}

function pullPoint(from: Point, item: FieldAttractor, heading?: number): Point {
  if (isVoidCorridor(item)) {
    const on = item.kind === "curve" ? nearestOnCurve(from, item) : nearestOnLine(from, item);
    const dx = from.x - on.x;
    const dy = from.y - on.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const radius = Math.max(0.6, item.radius ?? 1.2);
    return { x: on.x + (dx / d) * radius, y: on.y + (dy / d) * radius };
  }
  if (item.kind === "curve") return nearestOnCurve(from, item);
  if (item.kind === "line") {
    const ax = item.x;
    const ay = item.y;
    const bx = item.x2 ?? item.x;
    const by = item.y2 ?? item.y;
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((from.x - ax) * abx + (from.y - ay) * aby) / len2));
    return { x: ax + abx * t, y: ay + aby * t };
  }
  if (item.kind === "ring" || (item.kind === "point" && isVoidDisk(item))) return ringAroundPoint(from, item, heading);
  return { x: item.x, y: item.y };
}

function nearestOnLine(from: Point, item: FieldAttractor): Point {
  const ax = item.x;
  const ay = item.y;
  const bx = item.x2 ?? item.x;
  const by = item.y2 ?? item.y;
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((from.x - ax) * abx + (from.y - ay) * aby) / len2));
  return { x: ax + abx * t, y: ay + aby * t };
}

/** Grazing point on a circle so movement stays outside and follows the rim. */
function ringAroundPoint(from: Point, item: FieldAttractor, heading?: number): Point {
  const radius = circleRadius(item);
  const dx = from.x - item.x;
  const dy = from.y - item.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const base = Math.atan2(dy, dx);
  if (d <= radius + 0.08) {
    const nx = dx / d;
    const ny = dy / d;
    const t1 = Math.atan2(nx, -ny);
    const t2 = Math.atan2(-nx, ny);
    const travel = heading == null || angleDelta(t1, heading) <= angleDelta(t2, heading) ? t1 : t2;
    return { x: from.x + Math.cos(travel) * 0.9, y: from.y + Math.sin(travel) * 0.9 };
  }
  const offset = Math.acos(Math.min(1, radius / d));
  const p1 = { x: item.x + Math.cos(base + offset) * radius, y: item.y + Math.sin(base + offset) * radius };
  const p2 = { x: item.x + Math.cos(base - offset) * radius, y: item.y + Math.sin(base - offset) * radius };
  if (heading == null) return p1;
  const h1 = Math.atan2(p1.y - from.y, p1.x - from.x);
  const h2 = Math.atan2(p2.y - from.y, p2.x - from.x);
  return angleDelta(h1, heading) <= angleDelta(h2, heading) ? p1 : p2;
}

function nearestAttractorPoint(from: Point, primary: Point, translation: BiologicalTranslation, heading?: number): Point {
  const all = attractorList(primary, translation);
  const list =
    translation.archetypeId === "void-field"
      ? all.filter((item) => item.kind !== "ring" && !item.hole)
      : all;
  const marks = list.length ? list : all;
  let best = pullPoint(from, marks[0], heading);
  let bestD = dist(from, best);
  for (let i = 1; i < marks.length; i += 1) {
    const point = pullPoint(from, marks[i], heading);
    const d = dist(from, point);
    if (d < bestD) {
      best = point;
      bestD = d;
    }
  }
  return best;
}

function paintAttractorList(field: number[], size: number, list: FieldAttractor[], gainBase: number, slime?: SlimeControls) {
  for (const item of list) {
    const gain = gainBase * (item.strength ?? 1);
    const spread = Math.max(0.75, item.kind === "ring" ? 1.15 : item.radius ?? 2.2);
    const twoSigma = 2 * spread * spread;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let d = 0;
        if (isVoidCorridor(item)) {
          const radial =
            item.kind === "curve"
              ? dist({ x, y }, nearestOnCurve({ x, y }, item))
              : distanceToSegment(x, y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
          const limit = Math.max(0.55, item.radius ?? 1.2);
          if (radial < limit) continue;
          d = radial - limit;
        } else if (item.kind === "line") {
          d = distanceToSegment(x, y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
        } else if (item.kind === "curve") {
          d = dist({ x, y }, nearestOnCurve({ x, y }, item));
        } else if (isVoidDisk(item)) {
          const radial = Math.hypot(x - item.x, y - item.y);
          const limit = polarVoidRadius(item, { x, y }, slime);
          if (radial < limit) continue;
          d = radial - limit;
        } else {
          d = Math.hypot(x - item.x, y - item.y);
        }
        field[fieldIndex(x, y, size)] += gain * Math.exp(-(d * d) / twoSigma);
      }
    }
  }
}

/** Adds each archetype's extra attractors onto the primary field. */
function addRecipeAttractors(field: number[], size: number, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors;
  if (!list?.length) return;
  paintAttractorList(field, size, list, translation.params.attractionStrength);
}

function buildPermeabilityField(
  size: number,
  _source: Point,
  _attractor: Point,
  translation: BiologicalTranslation,
) {
  return new Array<number>(size * size).fill(translation.params.permeability);
}

function circleRadius(item: FieldAttractor) {
  if (item.kind === "line" || item.kind === "curve") return 0;
  return Math.max(0.2, item.radius ?? (item.kind === "ring" ? 4 : 1.6));
}

function isVoidDisk(item: FieldAttractor) {
  if (item.kind === "line" || item.kind === "curve") return false;
  return item.hole === true || item.kind === "ring";
}

function isVoidCorridor(item: FieldAttractor) {
  return (item.kind === "line" || item.kind === "curve") && item.hole === true;
}

function isGroundDisk(item: FieldAttractor) {
  return item.hole !== true && item.kind !== "line" && item.kind !== "curve" && item.kind !== "ring";
}

function isGroundCorridor(item: FieldAttractor) {
  return (item.kind === "line" || item.kind === "curve") && item.hole !== true;
}

function nearestContainedField(point: Point, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors;
  if (!list?.length) return null;
  let best: { d: number; px: number; py: number } | null = null;
  for (const item of list) {
    if (item.hole || item.kind === "ring") continue;
    let px = item.x;
    let py = item.y;
    if (item.kind === "curve") {
      const on = nearestOnCurve(point, item);
      px = on.x;
      py = on.y;
    } else if (item.kind === "line") {
      const on = nearestOnLine(point, item);
      px = on.x;
      py = on.y;
    }
    const d = Math.hypot(point.x - px, point.y - py);
    if (!best || d < best.d) best = { d, px, py };
  }
  return best;
}

const FLAT_DEEP_BODY = 1.15;

function nearestFlatDeep(point: Point, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors;
  if (!list?.length) return null;
  let best: { d: number; px: number; py: number; ax: number; ay: number; bx: number; by: number } | null = null;
  for (const item of list) {
    let px = item.x;
    let py = item.y;
    let ax = item.x;
    let ay = item.y;
    let bx = item.x2 ?? item.x;
    let by = item.y2 ?? item.y;
    if (item.kind === "curve") {
      const on = nearestOnCurve(point, item);
      px = on.x;
      py = on.y;
      const ahead = pointOnCurve(item, 1);
      bx = ahead.x;
      by = ahead.y;
    } else if (item.x2 != null) {
      const on = nearestOnLine(point, item);
      px = on.x;
      py = on.y;
    }
    const d = Math.hypot(point.x - px, point.y - py);
    if (!best || d < best.d) best = { d, px, py, ax, ay, bx, by };
  }
  return best;
}

function onFlatDeepWall(point: Point, translation: BiologicalTranslation) {
  const near = nearestFlatDeep(point, translation);
  return !!near && near.d <= FLAT_DEEP_BODY;
}

/** Keep the plate as a hair body. Do not lock a heading onto the wall line. */
function guideFlatDeep(
  agent: { x: number; y: number; heading: number },
  translation: BiologicalTranslation,
) {
  const near = nearestFlatDeep(agent, translation);
  if (!near || near.d < 0.55) return;
  const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
  const forward =
    angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
  const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
  const pull = near.d > FLAT_DEEP_BODY ? 0.5 : 0.1;
  agent.heading = wrapAngle(agent.heading * (1 - pull) + (forward * 0.7 + onto * 0.3) * pull);
  if (near.d > FLAT_DEEP_BODY) {
    const keep = FLAT_DEEP_BODY / near.d;
    agent.x = near.px + (agent.x - near.px) * keep;
    agent.y = near.py + (agent.y - near.py) * keep;
  }
}

function tgfKeepsPads(translation: BiologicalTranslation) {
  if (translation.archetypeId !== "topographic-ground-field") return false;
  const list = translation.recipe.attractors;
  if (!list?.length) return false;
  return !list.some((item) => item.hole === true || item.kind === "ring");
}

function nearestGroundPad(point: Point, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors;
  if (!list?.length) return null;
  let best: { d: number; x: number; y: number; radius: number } | null = null;
  for (const item of list) {
    if (!isGroundDisk(item)) continue;
    const d = Math.hypot(point.x - item.x, point.y - item.y);
    if (!best || d < best.d) best = { d, x: item.x, y: item.y, radius: Math.max(1.4, item.radius ?? 1.8) };
  }
  return best;
}

function insideGroundMass(point: Point, translation: BiologicalTranslation) {
  if (!tgfKeepsPads(translation)) return true;
  const list = translation.recipe.attractors;
  if (!list?.length) return false;
  for (const item of list) {
    if (isGroundDisk(item)) {
      if (Math.hypot(point.x - item.x, point.y - item.y) < Math.max(0.7, item.radius ?? 1.6)) return true;
      continue;
    }
    if (!isGroundCorridor(item)) continue;
    const radial =
      item.kind === "curve"
        ? dist(point, nearestOnCurve(point, item))
        : distanceToSegment(point.x, point.y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
    if (radial < Math.max(0.45, item.radius ?? 1.1)) return true;
  }
  return false;
}

function polarVoidRadius(item: FieldAttractor, point: Point, slime?: SlimeControls) {
  const base = circleRadius(item);
  if (base <= 0) return 0;
  if (!slime) return base;
  return voidRadius(Math.atan2(point.y - item.y, point.x - item.x), base, slime);
}

function fringedVoid(archetypeId: string) {
  return archetypeId === "void-edge" || archetypeId === "linear-edge-gallery";
}

function verticalVoidReach(angle: number, base: number) {
  const lump = 0.72 + 0.06 * Math.sin(angle * 1.45 + 0.4) + 0.04 * Math.sin(angle * 2.25 + 1.3);
  return base * lump;
}

function fringeReach(angle: number, base: number) {
  const lump = 0.46 + 0.07 * Math.sin(angle * 1.35 + 0.4) + 0.05 * Math.sin(angle * 2.15 + 1.6);
  return base * lump;
}

function emptyReach(archetypeId: string, angle: number, base: number) {
  if (archetypeId === "void-edge") {
    const lump = 0.96 + 0.02 * Math.sin(angle * 1.7 + 0.3);
    return base * lump;
  }
  if (archetypeId === "linear-edge-gallery") {
    const lump = 0.9 + 0.04 * Math.sin(angle * 1.55 + 0.2) + 0.03 * Math.sin(angle * 2.35 + 1.1);
    return base * lump;
  }
  return fringeReach(angle, base);
}

function insideAttractorHole(point: Point, translation: BiologicalTranslation, slime?: SlimeControls) {
  const list = translation.recipe.attractors;
  if (!list) return false;
  if (translation.archetypeId === "vertical-void") return false;
  const fringed = fringedVoid(translation.archetypeId);
  const core = fringed ? 1 : 0.58;
  for (const item of list) {
    if (isVoidCorridor(item)) {
      const radial =
        item.kind === "curve"
          ? dist(point, nearestOnCurve(point, item))
          : distanceToSegment(point.x, point.y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
      const along =
        item.kind === "curve"
          ? Math.atan2(point.y - (item.cy ?? item.y), point.x - (item.cx ?? item.x))
          : Math.atan2((item.y2 ?? item.y) - item.y, (item.x2 ?? item.x) - item.x);
      const limit = fringed
        ? emptyReach(translation.archetypeId, along + radial * 4, Math.max(0.55, item.radius ?? 1.2))
        : Math.max(0.55, item.radius ?? 1.2) * core;
      if (radial < limit) return true;
      continue;
    }
    if (!isVoidDisk(item)) continue;
    const radius = polarVoidRadius(item, point, slime);
    if (radius <= 0) continue;
    const angle = Math.atan2(point.y - item.y, point.x - item.x);
    const limit =
      translation.archetypeId === "vertical-void"
        ? verticalVoidReach(angle, radius)
        : fringed
          ? emptyReach(translation.archetypeId, angle, radius)
          : radius * core;
    if (Math.hypot(point.x - item.x, point.y - item.y) < limit) return true;
  }
  return false;
}

function circleHitT(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, radius: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  let t = Infinity;
  if (t0 >= 0 && t0 <= 1) t = t0;
  if (t1 >= 0 && t1 <= 1 && t1 < t) t = t1;
  return t === Infinity ? null : t;
}

const holeMasks = new Map<string, Uint8Array>();

/** Trail pixels inside an attractor disk. Fixed for a given disk layout, so built once and reused every step. */
function holeMaskFor(trailSize: number, fieldSize: number, translation: BiologicalTranslation, slime?: SlimeControls) {
  const list = translation.recipe.attractors ?? [];
  const shape = slime
    ? `${slime.voidElongation.toFixed(3)},${slime.voidRotation.toFixed(3)},${slime.voidLobes.toFixed(3)},${slime.voidNotch.toFixed(3)}`
    : "circle";
  const key = `${trailSize}|${fieldSize}|${shape}|${list
    .map((item) => {
      if (isVoidCorridor(item)) return `c${item.x},${item.y},${item.x2},${item.y2},${item.radius ?? 0}`;
      if (!isVoidDisk(item)) return "";
      const radius = circleRadius(item);
      return radius > 0 ? `${item.x},${item.y},${radius}` : "";
    })
    .join(";")}`;
  let mask = holeMasks.get(key);
  if (!mask) {
    const scale = trailSize / fieldSize;
    mask = new Uint8Array(trailSize * trailSize);
    for (let i = 0; i < mask.length; i += 1) {
      const fx = (i % trailSize) / scale;
      const fy = Math.floor(i / trailSize) / scale;
      if (insideAttractorHole({ x: fx, y: fy }, translation, slime)) mask[i] = 1;
    }
    if (holeMasks.size >= 16) holeMasks.delete(holeMasks.keys().next().value as string);
    holeMasks.set(key, mask);
  }
  return mask;
}

function groundMaskFor(trailSize: number, fieldSize: number, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors ?? [];
  const key = `g|${trailSize}|${fieldSize}|${list
    .map((item) => `${item.kind},${item.x},${item.y},${item.x2 ?? ""},${item.y2 ?? ""},${item.cx ?? ""},${item.cy ?? ""},${item.radius ?? 0},${item.hole ? 1 : 0}`)
    .join(";")}`;
  let mask = holeMasks.get(key);
  if (!mask) {
    const scale = trailSize / fieldSize;
    mask = new Uint8Array(trailSize * trailSize);
    for (let i = 0; i < mask.length; i += 1) {
      const fx = (i % trailSize) / scale;
      const fy = Math.floor(i / trailSize) / scale;
      if (insideGroundMass({ x: fx, y: fy }, translation)) mask[i] = 1;
    }
    if (holeMasks.size >= 16) holeMasks.delete(holeMasks.keys().next().value as string);
    holeMasks.set(key, mask);
  }
  return mask;
}

function eraseTrailsOutsideGround(
  trails: number[],
  trailSize: number,
  fieldSize: number,
  translation: BiologicalTranslation,
) {
  if (translation.archetypeId !== "topographic-ground-field") return;
  const book = trailBook(trails);
  const keep = groundMaskFor(trailSize, fieldSize, translation);
  let write = 0;
  for (let n = 0; n < book.active.length; n += 1) {
    const i = book.active[n];
    if (!keep[i]) {
      trails[i] = 0;
      book.stamp[i] = 0;
      continue;
    }
    book.active[write] = i;
    write += 1;
  }
  book.active.length = write;
}

function eraseTrailsInsideCircles(
  trails: number[],
  trailSize: number,
  fieldSize: number,
  translation: BiologicalTranslation,
  slime?: SlimeControls,
) {
  if (tgfKeepsPads(translation)) {
    return;
  }
  const list = translation.recipe.attractors;
  if (!list?.some((item) => (isVoidDisk(item) && circleRadius(item) > 0) || isVoidCorridor(item))) return;
  const book = trailBook(trails);
  const hole = holeMaskFor(trailSize, fieldSize, translation, slime);
  let write = 0;
  for (let n = 0; n < book.active.length; n += 1) {
    const i = book.active[n];
    if (hole[i]) {
      trails[i] = 0;
      book.stamp[i] = 0;
      continue;
    }
    book.active[write] = i;
    write += 1;
  }
  book.active.length = write;
}

function pressedAgainstVoid(agent: Point, translation: BiologicalTranslation, slime?: SlimeControls) {
  const list = translation.recipe.attractors;
  if (!list) return false;
  for (const item of list) {
    if (!isVoidDisk(item) || circleRadius(item) <= 0) continue;
    const radius = polarVoidRadius(item, agent, slime);
    if (Math.hypot(agent.x - item.x, agent.y - item.y) < radius + 0.65) return true;
  }
  return false;
}

/** Stops a step at the circle rim and turns the heading so the particle travels around it. */
function keepOutsideCircles(
  agent: SimAgent,
  fromX: number,
  fromY: number,
  translation: BiologicalTranslation,
  size: number,
  slime?: SlimeControls,
) {
  const list = translation.recipe.attractors;
  if (!list) return;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const item of list) {
      if (!isVoidDisk(item) || circleRadius(item) <= 0) continue;
      const angle = Math.atan2(agent.y - item.y, agent.x - item.x);
      const radius = polarVoidRadius(item, agent, slime);
      const endDist = Math.hypot(agent.x - item.x, agent.y - item.y);
      if (endDist >= radius + 0.02 && translation.archetypeId !== "vertical-void") continue;
      if (translation.archetypeId === "vertical-void") {
        const limit = verticalVoidReach(angle, radius);
        if (endDist >= limit) continue;
        const wobble = 0.5 + 0.5 * Math.sin(angle * 2.7 + item.x);
        const out = limit + 0.2 + wobble * 0.95;
        agent.x = clamp(item.x + Math.cos(angle) * out, 0.18, size - 0.18);
        agent.y = clamp(item.y + Math.sin(angle) * out, 0.18, size - 0.18);
        continue;
      }
      if (fringedVoid(translation.archetypeId)) {
        const limit = emptyReach(translation.archetypeId, angle, radius);
        if (endDist >= limit) continue;
        const wobble = 0.5 + 0.5 * Math.sin(angle * 2.4 + item.y);
        const edge = translation.archetypeId === "linear-edge-gallery";
        const exit = edge ? angle + Math.sin(agent.x * 11.3 + agent.y * 6.7) * 0.55 : angle;
        const out = edge ? limit + 0.55 + wobble * 1.15 : limit + 0.08 + wobble * 0.22;
        agent.x = clamp(item.x + Math.cos(exit) * out, 0.18, size - 0.18);
        agent.y = clamp(item.y + Math.sin(exit) * out, 0.18, size - 0.18);
        continue;
      }
      const fromAngle = Math.atan2(fromY - item.y, fromX - item.x);
      const out = radius + 0.04;
      agent.x = clamp(item.x + Math.cos(endDist > 0.001 ? angle : fromAngle) * out, 0.18, size - 0.18);
      agent.y = clamp(item.y + Math.sin(endDist > 0.001 ? angle : fromAngle) * out, 0.18, size - 0.18);
      const nx = agent.x - item.x;
      const ny = agent.y - item.y;
      const nm = Math.hypot(nx, ny) || 1;
      if (translation.archetypeId === "void-field") {
        agent.heading = Math.atan2(ny, nx);
        continue;
      }
      const t1 = Math.atan2(nx / nm, -ny / nm);
      const t2 = Math.atan2(-nx / nm, ny / nm);
      agent.heading = angleDelta(t1, agent.heading) <= angleDelta(t2, agent.heading) ? t1 : t2;
    }
  }
}

function toTrail(point: Point, scale: number) {
  return { x: point.x * scale, y: point.y * scale };
}

function foodPull(look: Point, foods: Point[], strength: number) {
  let pull = 0;
  const sigma = 2.4;
  const twoSigma = 2 * sigma * sigma;
  for (const food of foods) {
    const d = dist(look, food);
    pull += strength * Math.exp(-(d * d) / twoSigma);
  }
  return pull;
}

function sense(
  fieldPoint: Point,
  heading: number,
  distance: number,
  trails: number[],
  trailSize: number,
  translation: BiologicalTranslation,
  state: SimulationState,
  foods?: Point[],
  slime?: SlimeControls,
) {
  const look = {
    x: fieldPoint.x + Math.cos(heading) * distance,
    y: fieldPoint.y + Math.sin(heading) * distance,
  };
  const trailPos = toTrail(look, trailSize / FIELD_SIZE);
  const trail = sampleField(trails, trailPos, trailSize);
  const attraction = sampleField(state.attraction, look, state.size);
  const target = nearestAttractorPoint(look, state.attractor, translation, heading);
  const toAttractor = {
    x: target.x - look.x,
    y: target.y - look.y,
  };
  const mag = Math.hypot(toAttractor.x, toAttractor.y) || 1;
  const alignment = Math.max(
    0,
    (Math.cos(heading) * toAttractor.x + Math.sin(heading) * toAttractor.y) / mag,
  );
  const { params } = translation;
  const trailFollow =
    0.48 +
    params.networkDensity * 0.85 +
    (containedInterior(translation) ? params.flowCoupling * 0.28 : 0);
  const pull = 0.16 + params.attractionStrength * 0.5;
  if (aroundAbsence(translation) && translation.archetypeId !== "void-field") {
    const core = dist(look, state.attractor);
    const angle = Math.atan2(look.y - state.attractor.y, look.x - state.attractor.x);
    const opening = 0.5 + 0.5 * Math.cos(angle * 2.05 + 0.4);
    const keep = slime
      ? voidRadius(angle, translation.recipe.isolationRadius * 0.42, slime)
      : translation.recipe.isolationRadius * (0.28 + 0.24 * opening);
    if (core < keep) {
      return trail * 0.08 - 0.95 - (keep - core) * 0.18;
    }
  }
  const extraFood = foods && foods.length > 1 ? foodPull(look, foods.slice(1), params.attractionStrength) : 0;
  if (insideAttractorHole(look, translation, slime) && translation.archetypeId !== "void-field") return -2;
  const influence = slime?.trailInfluence ?? 1;
  const resistance = sampleResistance(look, state.size, slime?.resistance ?? 0);
  return (
    trail * trailFollow * influence +
    (translation.archetypeId === "continuous-hall" ? 0 : attraction * pull) +
    extraFood +
    params.permeability * 0.03 +
    alignment * params.directionalBias -
    resistance * 1.35
  );
}

/** Spatial resistance. 0 leaves every cell unchanged. Higher values make some regions harder to cross. */
function sampleResistance(point: Point, size: number, amount: number) {
  if (amount <= 0.001) return 0;
  const nx = point.x / Math.max(1, size - 1);
  const ny = point.y / Math.max(1, size - 1);
  const gradient = nx * 0.55 + ny * 0.2;
  const patch = Math.exp(-((nx - 0.68) ** 2 + (ny - 0.32) ** 2) / 0.06);
  const local = Math.min(1, Math.max(0, gradient * 0.45 + patch * 0.7));
  return Math.min(1, amount * local);
}

function nearestUndulated(agent: Point, translation: BiologicalTranslation) {
  const marks = translation.recipe.attractors;
  if (!marks?.length) return null;
  let bestD = Infinity;
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  let px = 0;
  let py = 0;
  let tip = false;
  for (const mark of marks) {
    if (mark.x2 == null) continue;
    const x2 = mark.x2;
    const y2 = mark.y2 ?? mark.y;
    const abx = x2 - mark.x;
    const aby = y2 - mark.y;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((agent.x - mark.x) * abx + (agent.y - mark.y) * aby) / len2));
    const qx = mark.x + abx * t;
    const qy = mark.y + aby * t;
    const d = Math.hypot(agent.x - qx, agent.y - qy);
    if (d < bestD) {
      bestD = d;
      ax = mark.x;
      ay = mark.y;
      bx = x2;
      by = y2;
      px = qx;
      py = qy;
      tip = mark.cover === 1;
    }
  }
  if (!Number.isFinite(bestD)) return null;
  return { d: bestD, ax, ay, bx, by, px, py, tip };
}

function nearestVoidCirculation(agent: Point, translation: BiologicalTranslation) {
  const marks = translation.recipe.attractors;
  if (!marks?.length) return null;
  let bestD = Infinity;
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  let px = agent.x;
  let py = agent.y;
  for (const mark of marks) {
    if (mark.kind === "ring" || mark.hole) continue;
    const on = mark.kind === "curve" ? nearestOnCurve(agent, mark) : nearestOnLine(agent, mark);
    const d = Math.hypot(agent.x - on.x, agent.y - on.y);
    if (d >= bestD) continue;
    bestD = d;
    px = on.x;
    py = on.y;
    if (mark.kind === "curve") {
      const ahead = pointOnCurve(mark, 1);
      ax = mark.x;
      ay = mark.y;
      bx = ahead.x;
      by = ahead.y;
    } else {
      ax = mark.x;
      ay = mark.y;
      bx = mark.x2 ?? mark.x;
      by = mark.y2 ?? mark.y;
    }
  }
  if (!Number.isFinite(bestD)) return null;
  return { d: bestD, ax, ay, bx, by, px, py };
}

/** Walk a drafted line. Inserted horizontal plate still uses this. */
function followUndulated(agent: { x: number; y: number; heading: number }, translation: BiologicalTranslation) {
  const near = nearestUndulated(agent, translation);
  if (!near) return;
  const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
  const forward =
    angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
  const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
  const lateral = near.d > 0.08 ? 0.62 : 0.04;
  agent.heading = wrapAngle(forward * (1 - lateral) + onto * lateral);
}

const PLATE_BODY = 0.95;
const UNDULATED_PATH = 2.35;

function guidePlate(agent: { x: number; y: number; heading: number }, translation: BiologicalTranslation) {
  const near = nearestUndulated(agent, translation);
  if (!near) return;
  const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
  const len2 = (near.bx - near.ax) ** 2 + (near.by - near.ay) ** 2 || 1;
  const along = ((agent.x - near.ax) * (near.bx - near.ax) + (agent.y - near.ay) * (near.by - near.ay)) / len2;
  const forward =
    along > 0.9 ? tangent + Math.PI : along < 0.1 ? tangent : angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
  const weight = near.d > PLATE_BODY ? 0.64 : 0.86;
  agent.heading = wrapAngle(agent.heading * (1 - weight) + forward * weight);
}
function guideUndulated(agent: { x: number; y: number; heading: number }, translation: BiologicalTranslation) {
  const near = nearestUndulated(agent, translation);
  if (!near || near.d < 0.9) return;
  const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
  const forward =
    angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
  const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
  const pull = near.d > UNDULATED_PATH ? 0.48 : 0.16;
  agent.heading = wrapAngle(agent.heading * (1 - pull) + (forward * 0.7 + onto * 0.3) * pull);
}

const HALL_OUTER = 1.65;

function hallContact(agent: Point, translation: BiologicalTranslation) {
  const near = nearestUndulated(agent, translation);
  if (!near) return null;
  const abx = near.bx - near.ax;
  const aby = near.by - near.ay;
  const len2 = abx * abx + aby * aby || 1;
  const along = ((agent.x - near.ax) * abx + (agent.y - near.ay) * aby) / len2;
  return { ...near, along };
}

/** Keep hairs from leaving the field of the two halls. Do not seat them on an edge. */
function guideHall(agent: { x: number; y: number; heading: number }, translation: BiologicalTranslation) {
  const near = hallContact(agent, translation);
  if (!near || near.d <= 2.8) return;
  let dx = agent.x - near.px;
  let dy = agent.y - near.py;
  const distFrom = Math.hypot(dx, dy) || 1;
  const pull = Math.min(0.12, near.d - 2.8);
  agent.x -= (dx / distFrom) * pull;
  agent.y -= (dy / distFrom) * pull;
}

const TERRACE_PLATE = 0.34;

function nearestTerraced(agent: Point, translation: BiologicalTranslation) {
  const marks = translation.recipe.attractors;
  if (!marks?.length) return null;
  let best = Infinity;
  let found: {
    d: number;
    px: number;
    py: number;
    ax: number;
    ay: number;
    bx: number;
    by: number;
    plate: boolean;
    radius: number;
    along: number;
    stroke: number;
    mass: number;
    cover: number;
    coverAt: number;
  } | null = null;
  for (const mark of marks) {
    if (mark.x2 == null && mark.kind !== "curve") continue;
    let qx = mark.x;
    let qy = mark.y;
    let ax = mark.x;
    let ay = mark.y;
    let bx = mark.x2 ?? mark.x;
    let by = mark.y2 ?? mark.y;
    if (mark.kind === "curve") {
      const q = nearestOnCurve(agent, mark);
      qx = q.x;
      qy = q.y;
    } else {
      const abx = bx - ax;
      const aby = by - ay;
      const len2 = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((agent.x - ax) * abx + (agent.y - ay) * aby) / len2));
      qx = ax + abx * t;
      qy = ay + aby * t;
    }
    const d = Math.hypot(agent.x - qx, agent.y - qy);
    const plate = (mark.radius ?? 0) >= TERRACE_PLATE;
    const score = d - (plate ? 0.4 : 0);
    if (score < best) {
      best = score;
      const span2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1;
      const along = Math.max(0, Math.min(1, ((qx - ax) * (bx - ax) + (qy - ay) * (by - ay)) / span2));
      const stroke = (mark.stroke ?? 1) + ((mark.stroke2 ?? mark.stroke ?? 1) - (mark.stroke ?? 1)) * along;
      found = {
        d,
        px: qx,
        py: qy,
        ax,
        ay,
        bx,
        by,
        plate,
        radius: mark.radius ?? (plate ? 0.6 : 0.22),
        along,
        stroke,
        mass: mark.mass ?? 1,
        cover: mark.cover ?? 1,
        coverAt: mark.coverAt ?? 0,
      };
    }
  }
  return found;
}

const TERRACE_BODY = 1.7;

function holdTerraced(
  agent: { x: number; y: number; heading: number },
  translation: BiologicalTranslation,
  _slime?: SlimeControls,
) {
  const near = nearestTerraced(agent, translation);
  if (!near || near.d < 0.55) return;
  const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
  const forward =
    angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
  const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
  const pull = near.d > TERRACE_BODY ? 0.5 : 0.1;
  agent.heading = wrapAngle(agent.heading * (1 - pull) + (forward * 0.7 + onto * 0.3) * pull);
  if (near.d > TERRACE_BODY) {
    const keep = TERRACE_BODY / near.d;
    agent.x = near.px + (agent.x - near.px) * keep;
    agent.y = near.py + (agent.y - near.py) * keep;
  }
}

function onTerracedPlate(agent: Point, translation: BiologicalTranslation) {
  const near = nearestTerraced(agent, translation);
  if (!near) return false;
  return near.d < TERRACE_BODY;
}

function spawnAgent(
  source: Point,
  attractor: Point,
  translation: BiologicalTranslation,
  rng: () => number,
): SimAgent {
  const { params, recipe } = translation;
  let x: number;
  let y: number;
  let heading: number;
  if (translation.archetypeId === "void-field" && recipe.attractors?.length) {
    const marks = recipe.attractors;
    const field = marks.filter((item) => item.kind !== "ring" && !item.hole);
    const pool = field.length ? field : marks;
    const mark = pool[Math.floor(rng() * pool.length)] ?? pool[0];
    const angle = rng() * TWO_PI;
    const jitter = 0.12 + rng() * 0.45;
    x = clamp(mark.x + Math.cos(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
    y = clamp(mark.y + Math.sin(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
    heading = rng() * TWO_PI;
  } else if ((translation.archetypeId === "undulated" || translation.archetypeId === "inserted-horizontal-plate") && recipe.attractors?.length) {
    const marks = recipe.attractors;
    const mark = marks[Math.floor(rng() * marks.length)] ?? marks[0];
    const t = rng();
    if (mark.kind === "curve") {
      const at = pointOnCurve(mark, t);
      const ahead = pointOnCurve(mark, Math.min(1, t + 0.12));
      x = clamp(at.x, 0.2, FIELD_SIZE - 0.2);
      y = clamp(at.y, 0.2, FIELD_SIZE - 0.2);
      heading = wrapAngle(Math.atan2(ahead.y - at.y, ahead.x - at.x) + (rng() < 0.5 ? 0 : Math.PI));
    } else {
      const x2 = mark.x2 ?? mark.x;
      const y2 = mark.y2 ?? mark.y;
      x = clamp(mark.x + (x2 - mark.x) * t, 0.2, FIELD_SIZE - 0.2);
      y = clamp(mark.y + (y2 - mark.y) * t, 0.2, FIELD_SIZE - 0.2);
      heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() < 0.5 ? 0 : Math.PI));
    }
  } else if (translation.archetypeId === "stepped-amphitheater" && recipe.saField) {
    const at = spawnOnSteppedAmphitheater(recipe.saField, rng);
    x = clamp(at.x, 0.2, FIELD_SIZE - 0.2);
    y = clamp(at.y, 0.2, FIELD_SIZE - 0.2);
    heading = at.heading;
  } else if (translation.archetypeId === "terraced" && recipe.attractors?.length) {
    const marks = recipe.attractors;
    const plates = marks.filter((item) => (item.radius ?? 0) >= TERRACE_PLATE);
    const pool = rng() < 0.9 && plates.length ? plates : marks;
    let weight = 0;
    for (const item of pool) weight += Math.max(0.04, item.mass ?? 1);
    let roll = rng() * weight;
    let mark = pool[pool.length - 1];
    for (const item of pool) {
      roll -= Math.max(0.04, item.mass ?? 1);
      if (roll <= 0) {
        mark = item;
        break;
      }
    }
    const cover = Math.max(0.08, Math.min(1, mark.cover ?? 1));
    const at = Math.max(0, Math.min(1 - cover, mark.coverAt ?? 0));
    const t = at + rng() * cover;
    if (mark.kind === "curve") {
      const at = pointOnCurve(mark, t);
      const ahead = pointOnCurve(mark, Math.min(1, t + 0.1));
      x = clamp(at.x, 0.2, FIELD_SIZE - 0.2);
      y = clamp(at.y, 0.2, FIELD_SIZE - 0.2);
      heading = wrapAngle(Math.atan2(ahead.y - at.y, ahead.x - at.x) + (rng() < 0.5 ? 0 : Math.PI));
    } else {
      const x2 = mark.x2 ?? mark.x;
      const y2 = mark.y2 ?? mark.y;
      x = clamp(mark.x + (x2 - mark.x) * t, 0.2, FIELD_SIZE - 0.2);
      y = clamp(mark.y + (y2 - mark.y) * t, 0.2, FIELD_SIZE - 0.2);
      heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() < 0.5 ? 0 : Math.PI));
    }
  } else if (translation.archetypeId === "topographic-ground-field" && recipe.attractors?.length) {
    const pads = recipe.attractors.filter((item) => item.hole !== true && item.kind !== "line" && item.kind !== "curve" && item.kind !== "ring");
    const pad = pads[Math.floor(rng() * pads.length)] ?? recipe.attractors[0];
    const angle = rng() * TWO_PI;
    const reach = Math.max(0.4, (pad.radius ?? 1.8) * 0.45) * Math.sqrt(rng());
    x = clamp(pad.x + Math.cos(angle) * reach, 0.35, FIELD_SIZE - 0.35);
    y = clamp(pad.y + Math.sin(angle) * reach, 0.35, FIELD_SIZE - 0.35);
    heading = rng() * TWO_PI;
  } else if (translation.archetypeId === "flat-deep-plan" && recipe.attractors?.length) {
    const marks = recipe.attractors;
    const mark = marks[Math.floor(rng() * marks.length)] ?? marks[0];
    const t = rng();
    let atX: number;
    let atY: number;
    let dir: number;
    if (mark.kind === "curve") {
      const at = pointOnCurve(mark, t);
      const ahead = pointOnCurve(mark, Math.min(1, t + 0.08));
      atX = at.x;
      atY = at.y;
      dir = Math.atan2(ahead.y - at.y, ahead.x - at.x);
    } else {
      const x2 = mark.x2 ?? mark.x;
      const y2 = mark.y2 ?? mark.y;
      atX = mark.x + (x2 - mark.x) * t;
      atY = mark.y + (y2 - mark.y) * t;
      dir = Math.atan2(y2 - mark.y, x2 - mark.x);
    }
    if (rng() < 0.5) dir += Math.PI;
    const side = rng() < 0.5 ? 1 : -1;
    const offset = 0.28 + rng() * 0.72;
    x = clamp(atX + Math.cos(dir + Math.PI / 2) * side * offset, 0.2, FIELD_SIZE - 0.2);
    y = clamp(atY + Math.sin(dir + Math.PI / 2) * side * offset, 0.2, FIELD_SIZE - 0.2);
    heading = wrapAngle(dir + (rng() - 0.5) * 1.1);
  } else if (fineTrail(translation.archetypeId)) {
    const marks = recipe.attractors ?? [];
    let minX = FIELD_SIZE;
    let minY = FIELD_SIZE;
    let maxX = 0;
    let maxY = 0;
    for (const item of marks) {
      minX = Math.min(minX, item.x, item.x2 ?? item.x);
      minY = Math.min(minY, item.y, item.y2 ?? item.y);
      maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
      maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
    }
    const scatter = !marks.length || rng() >= 0.2 + recipe.clustering * 0.7;
    if (scatter) {
      const pad = 2.6;
      x = clamp((minX < maxX ? minX : 1.6) - pad + rng() * ((maxX > minX ? maxX - minX : 16) + pad * 2), 0.2, FIELD_SIZE - 0.2);
      y = clamp((minY < maxY ? minY : 1.6) - pad + rng() * ((maxY > minY ? maxY - minY : 16) + pad * 2), 0.2, FIELD_SIZE - 0.2);
      heading = rng() * TWO_PI;
    } else {
      const chambers = marks.filter((item) => (item.radius ?? 1) >= 2);
      const beads = marks.filter((item) => (item.radius ?? 1) >= 0.7 && (item.radius ?? 1) < 2);
      const necks = marks.filter((item) => (item.radius ?? 1) < 0.7);
      const pool =
        rng() < 0.78 && chambers.length
          ? chambers
          : rng() < 0.6 && beads.length
            ? beads
            : necks.length
              ? necks
              : marks;
      const mark = pool[Math.floor(rng() * Math.max(1, pool.length))] ?? {
        x: attractor.x,
        y: attractor.y,
        x2: attractor.x,
        y2: attractor.y,
        radius: 1.2,
      };
      if (mark.kind === "point" || mark.kind === "ring" || mark.x2 == null) {
        const a = rng() * TWO_PI;
        const r = (mark.radius ?? 1.2) * rng() * 0.82;
        x = clamp(mark.x + Math.cos(a) * r, 0.2, FIELD_SIZE - 0.2);
        y = clamp(mark.y + Math.sin(a) * r, 0.2, FIELD_SIZE - 0.2);
        heading = rng() * TWO_PI;
      } else {
        const t = rng();
        const x2 = mark.x2 ?? mark.x;
        const y2 = mark.y2 ?? mark.y;
        const alongX = mark.x + (x2 - mark.x) * t;
        const alongY = mark.y + (y2 - mark.y) * t;
        const nx = -(y2 - mark.y);
        const ny = x2 - mark.x;
        const span = Math.hypot(nx, ny) || 1;
        const offset = (mark.radius ?? 0.2) * (0.2 + rng() * 0.45);
        x = clamp(alongX + (nx / span) * (rng() - 0.5) * offset, 0.2, FIELD_SIZE - 0.2);
        y = clamp(alongY + (ny / span) * (rng() - 0.5) * offset, 0.2, FIELD_SIZE - 0.2);
        heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() - 0.5) * 0.4);
      }
    }
  } else if (translation.archetypeId === "continuous-hall") {
    const marks = recipe.attractors ?? [];
    const voids = marks.filter((item) => item.hole || item.kind === "ring");
    const solids = marks.filter((item) => !item.hole && item.kind !== "ring");
    const inverted = voids.length > 0;
    const pool = inverted ? (solids.length ? solids : voids) : marks;
    const mark = pool[Math.floor(rng() * Math.max(1, pool.length))] ?? {
      x: attractor.x,
      y: attractor.y,
      x2: attractor.x,
      y2: attractor.y,
      radius: 1,
    };
    if (!inverted && (mark.kind === "point" || mark.kind === "ring")) {
      const a = rng() * TWO_PI;
      const r = (mark.radius ?? 1) * rng() * 0.85;
      x = clamp(mark.x + Math.cos(a) * r, 0.2, FIELD_SIZE - 0.2);
      y = clamp(mark.y + Math.sin(a) * r, 0.2, FIELD_SIZE - 0.2);
      heading = rng() * TWO_PI;
    } else {
      const t = rng();
      const x2 = mark.x2 ?? mark.x;
      const y2 = mark.y2 ?? mark.y;
      const alongX = mark.x + (x2 - mark.x) * t;
      const alongY = mark.y + (y2 - mark.y) * t;
      const nx = -(y2 - mark.y);
      const ny = x2 - mark.x;
      const span = Math.hypot(nx, ny) || 1;
      const side = rng() < 0.5 ? 1 : -1;
      const offset = rng() * HALL_OUTER * 0.8;
      x = clamp(alongX + (nx / span) * side * offset, 0.2, FIELD_SIZE - 0.2);
      y = clamp(alongY + (ny / span) * side * offset, 0.2, FIELD_SIZE - 0.2);
      heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() - 0.5) * 1.1);
    }
  } else if (aroundAbsence(translation) && rng() > 0.05) {
    x = 1.1 + rng() * (FIELD_SIZE - 2.2);
    y = 1.1 + rng() * (FIELD_SIZE - 2.2);
    const away = dist({ x, y }, attractor);
    if (away < recipe.isolationRadius * 0.5) {
      const angle = Math.atan2(y - attractor.y, x - attractor.x) || rng() * TWO_PI;
      const radius = recipe.isolationRadius * (0.65 + rng() * 0.5);
      x = clamp(attractor.x + Math.cos(angle) * radius, 0.2, FIELD_SIZE - 0.2);
      y = clamp(attractor.y + Math.sin(angle) * radius, 0.2, FIELD_SIZE - 0.2);
    }
    heading = rng() * TWO_PI;
  } else if (translation.archetypeId === "contained-room-within-volume" && recipe.attractors?.length) {
    const field = recipe.attractors.filter((item) => item.kind === "point");
    const pool = field.length ? field : recipe.attractors.filter((item) => !item.hole);
    const collar = pool.filter((item) => Math.hypot(item.x - attractor.x, item.y - attractor.y) < recipe.isolationRadius + 2.4);
    const chosen = rng() < 0.38 && collar.length ? collar : pool;
    const mark = chosen[Math.floor(rng() * chosen.length)] ?? pool[0];
    const angle = rng() * TWO_PI;
    const jitter = 0.2 + rng() * 1.15;
    x = clamp(mark.x + Math.cos(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
    y = clamp(mark.y + Math.sin(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
    heading = rng() * TWO_PI;
  } else if (containedInterior(translation) && rng() < 0.16 + recipe.clustering * 0.7) {
    const angle = rng() * TWO_PI;
    const radius =
      recipe.isolationRadius * (0.18 + rng() * (1.55 + params.geometryVariation * 0.7));
    x = clamp(attractor.x + Math.cos(angle) * radius, 0.2, FIELD_SIZE - 0.2);
    y = clamp(attractor.y + Math.sin(angle) * radius, 0.2, FIELD_SIZE - 0.2);
    heading = rng() * TWO_PI;
  } else if (!aroundAbsence(translation) && !containedInterior(translation) && rng() > 0.1) {
    x = 1.1 + rng() * (FIELD_SIZE - 2.2);
    y = 1.1 + rng() * (FIELD_SIZE - 2.2);
    heading = rng() * TWO_PI;
    if (params.nodeRepetition > 0.55 && rng() < 0.35 + params.nodeRepetition * 0.25) {
      const steps = 2 + Math.round(params.nodeRepetition * 3);
      const t = Math.floor(rng() * (steps + 1)) / steps;
      const jitter = 0.8 + params.geometricDisplacement * 1.4;
      x = clamp(
        source.x + (attractor.x - source.x) * t + (rng() - 0.5) * jitter,
        0.2,
        FIELD_SIZE - 0.2,
      );
      y = clamp(
        source.y + (attractor.y - source.y) * t + (rng() - 0.5) * jitter,
        0.2,
        FIELD_SIZE - 0.2,
      );
    }
  } else {
    const invite =
      translation.ratings.receptivity === 0 ||
      translation.ratings.receptivity === 1 ||
      translation.ratings.receptivity === 2
        ? (params.sourcePermeability - 0.5) * 0.7
        : 0;
    const spread = 0.55 + params.geometryVariation * 0.9 + params.nodeSpacing * 0.45 + invite;
    const toward = Math.atan2(attractor.y - source.y, attractor.x - source.x);
    heading = wrapAngle(
      toward * (0.25 + params.directionalBias * 0.45) +
        (rng() - 0.5) * (1.2 + params.geometryVariation * 1.4),
    );
    const inward = aroundAbsence(translation)
      ? 0
      : containedInterior(translation)
        ? 1.2
        : 0.35;
    x = clamp(source.x + (rng() - 0.5) * spread - Math.sign(source.x - 10) * inward, 0.15, FIELD_SIZE - 0.15);
    y = clamp(source.y + rng() * spread * 0.7, 0.15, FIELD_SIZE - 0.15);
  }
  return {
    x,
    y,
    heading,
    speed: 0.12 + params.permeability * 0.16,
    trailStrength: 0.38 + params.flowCoupling * 0.42,
    pathX: [x],
    pathY: [y],
    hold: 0,
  };
}

const trailBooks = new WeakMap<number[], { active: number[]; stamp: Uint8Array }>();

function trailBook(trails: number[]) {
  let book = trailBooks.get(trails);
  if (!book || book.stamp.length !== trails.length) {
    book = { active: [], stamp: new Uint8Array(trails.length) };
    trailBooks.set(trails, book);
  }
  return book;
}

let trailScratch: Float32Array | null = null;
let densityScratch: number[] | null = null;

function densityFor(size: number) {
  const count = size * size;
  if (!densityScratch || densityScratch.length !== count) densityScratch = new Array<number>(count).fill(0);
  else densityScratch.fill(0);
  return densityScratch;
}

function scratchFor(length: number) {
  if (!trailScratch || trailScratch.length < length) trailScratch = new Float32Array(length);
  return trailScratch;
}

function markTrail(trails: number[], index: number) {
  const book = trailBook(trails);
  if (book.stamp[index]) return;
  book.stamp[index] = 1;
  book.active.push(index);
}

function deposit(
  trails: number[],
  trailSize: number,
  point: Point,
  amount: number,
  width = 1,
  cap = 1.8,
) {
  const scale = trailSize / FIELD_SIZE;
  const pixelWidth = width * (scale / TRAIL_SCALE);
  const pos = toTrail(point, scale);
  const paint = (x: number, y: number, weight: number) => {
    if (x < 0 || y < 0 || x >= trailSize || y >= trailSize || weight <= 0) return;
    const index = y * trailSize + x;
    trails[index] = Math.min(cap, trails[index] + amount * weight);
    markTrail(trails, index);
  };
  if (pixelWidth <= 1.05) {
    const x0 = Math.floor(pos.x);
    const y0 = Math.floor(pos.y);
    for (let oy = 0; oy <= 1; oy += 1) {
      for (let ox = 0; ox <= 1; ox += 1) {
        const x = x0 + ox;
        const y = y0 + oy;
        const w = (1 - Math.abs(pos.x - x)) * (1 - Math.abs(pos.y - y));
        paint(x, y, Math.max(0, w));
      }
    }
    return;
  }
  const span = Math.ceil(pixelWidth);
  const x0 = Math.floor(pos.x);
  const y0 = Math.floor(pos.y);
  const stride = pixelWidth > 8 ? 2 : 1;
  for (let oy = -span; oy <= span; oy += stride) {
    for (let ox = -span; ox <= span; ox += stride) {
      const x = x0 + ox;
      const y = y0 + oy;
      const distance = Math.hypot(pos.x - x, pos.y - y);
      if (distance > pixelWidth) continue;
      paint(x, y, 1 - distance / pixelWidth);
    }
  }
}

/** Stamp the deposit along the step so successive marks overlap into a filament. */
function depositSegment(
  trails: number[],
  trailSize: number,
  from: Point,
  to: Point,
  amount: number,
  width = 1,
  cap = 1.8,
) {
  const scale = trailSize / FIELD_SIZE;
  const a = toTrail(from, scale);
  const b = toTrail(to, scale);
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(span));
  const share = amount / Math.sqrt(steps);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    deposit(
      trails,
      trailSize,
      {
        x: (a.x + (b.x - a.x) * t) / scale,
        y: (a.y + (b.y - a.y) * t) / scale,
      },
      share,
      width,
      cap,
    );
  }
}

function downsampleOccupancy(trails: number[], trailSize: number, size: number) {
  const occupancy = new Array<number>(size * size).fill(0);
  const scale = trailSize / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let count = 0;
      const x0 = Math.floor(x * scale);
      const y0 = Math.floor(y * scale);
      const x1 = Math.min(trailSize, Math.floor((x + 1) * scale));
      const y1 = Math.min(trailSize, Math.floor((y + 1) * scale));
      for (let ty = y0; ty < y1; ty += 1) {
        for (let tx = x0; tx < x1; tx += 1) {
          sum += trails[ty * trailSize + tx];
          count += 1;
        }
      }
      occupancy[y * size + x] = count ? sum / count : 0;
    }
  }
  return occupancy;
}

export function createSimulation(
  translation: BiologicalTranslation,
  seed: number,
  agentCount = DEFAULT_AGENT_COUNT,
  trailScale = TRAIL_SCALE,
): SimulationState {
  const size = FIELD_SIZE;
  const trailSize = size * Math.max(1, Math.round(trailScale));
  const rng = mulberry32(seed);
  const source = sourceFromCorner(translation.recipe.sourceCorner, size);
  const attractor = translation.recipe.attractorFixed
    ? translation.recipe.attractor
    : attractorFromRatings(translation, size);
  const count = clamp(Math.round(agentCount), MIN_AGENT_COUNT, MAX_AGENT_COUNT);
  const agents = Array.from({ length: count }, () =>
    spawnAgent(source, attractor, translation, rng),
  );

  return {
    size,
    trailSize,
    iteration: 0,
    maxIterations: MAX_ITERATIONS,
    converged: false,
    streak: 0,
    totalDelta: 0,
    seed,
    source,
    attractor,
    attraction: buildAttractionField(size, attractor, translation),
    permeabilityField: buildPermeabilityField(size, source, attractor, translation),
    occupancy: new Array<number>(size * size).fill(0),
    trails: new Array<number>(trailSize * trailSize).fill(0),
    displayTrails: new Float32Array(trailSize * trailSize),
    flow: new Array<number>(size * size).fill(0),
    agents,
  };
}

export function stepSimulation(
  state: SimulationState,
  translation: BiologicalTranslation,
  rng: () => number,
  trailDecay = 0.986,
  slime?: SlimeControls,
  finalize = true,
  recordPaths = true,
): SimulationState {
  if (state.converged || state.iteration >= state.maxIterations) return state;

  if (slime && aroundAbsence(translation)) {
    state.attraction = buildAttractionField(state.size, state.attractor, translation, slime);
  }

  const { params } = translation;
  const sensorAngle = slime?.sensorAngle ?? 0.32 + params.geometryVariation * 0.45;
  const sensorDistance =
    slime?.sensorDistance ?? 0.45 + params.influenceRadius * 0.035 + params.scaleVariation * 0.25;
  const turnAngle = slime?.turnAngle ?? 0.22 + params.geometryVariation * 0.55;
  const cohesionMul = aroundAbsence(translation)
    ? 0.48
    : containedInterior(translation)
      ? 0.74
      : 0.38 + params.nodeInteraction * 0.24 + translation.recipe.clustering * 0.16;
  const cohesion = clamp(1 - params.nodeSpacing, 0, 1) * cohesionMul;
  // Catalog ink. Archetype slime does not choose the pen.
  const decayMul = HAIR_DECAY;
  const foods = slime?.foodPoints;

  const density = densityFor(state.size);
  for (const agent of state.agents) {
    const ix = clamp(Math.round(agent.x), 0, state.size - 1);
    const iy = clamp(Math.round(agent.y), 0, state.size - 1);
    density[iy * state.size + ix] += 1;
  }

  let trailDelta = 0;
  state.flow.fill(0);

  for (const agent of state.agents) {
    keepOutsideCircles(agent, agent.x, agent.y, translation, state.size, slime);
    const here = { x: agent.x, y: agent.y };
    const holdHeading = slime != null && agent.hold > 0;
    if (holdHeading) agent.hold -= 1;
    if (!holdHeading) {
      const forward = sense(here, agent.heading, sensorDistance, state.trails, state.trailSize, translation, state, foods, slime);
      const left = sense(here, agent.heading + sensorAngle, sensorDistance, state.trails, state.trailSize, translation, state, foods, slime);
      const right = sense(here, agent.heading - sensorAngle, sensorDistance, state.trails, state.trailSize, translation, state, foods, slime);

      if (left > forward && left > right) agent.heading += turnAngle;
      else if (right > forward && right > left) agent.heading -= turnAngle;
      else {
        const wander =
          0.14 +
          params.geometryVariation * 1.2 +
          (aroundAbsence(translation) || containedInterior(translation)
            ? 0
            : params.geometricDisplacement * 0.35);
        agent.heading += (rng() - 0.5) * wander;
      }
      if (slime && rng() < slime.persistence) {
        agent.hold = 1 + Math.floor(slime.persistence * 5);
      }
    }
    if (slime && slime.randomness > 0) {
      agent.heading += (rng() - 0.5) * slime.randomness * Math.PI;
    }

    if (cohesion > 0.002) {
      const ix = clamp(Math.round(agent.x), 0, state.size - 1);
      const iy = clamp(Math.round(agent.y), 0, state.size - 1);
      let best = density[iy * state.size + ix];
      let bx = 0;
      let by = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = ix + ox;
          const ny = iy + oy;
          if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size) continue;
          const value = density[ny * state.size + nx];
          if (value > best) {
            best = value;
            bx = ox;
            by = oy;
          }
        }
      }
      if (bx !== 0 || by !== 0) {
        agent.heading = wrapAngle(agent.heading * (1 - cohesion) + Math.atan2(by, bx) * cohesion);
      }
    }

    const dirPull = translation.archetypeId === "linear-edge-gallery" ? 0.03 : params.directionalBias * 0.28;
    if (dirPull > 0.01) {
      const target = nearestAttractorPoint(agent, state.attractor, translation, agent.heading);
      const toward = Math.atan2(target.y - agent.y, target.x - agent.x);
      agent.heading = wrapAngle(agent.heading * (1 - dirPull) + toward * dirPull);
    }

    const ix = clamp(Math.round(agent.x), 0, state.size - 1);
    const iy = clamp(Math.round(agent.y), 0, state.size - 1);
    if (slime && density[iy * state.size + ix] > slime.crowdingLimit) {
      agent.heading = wrapAngle(agent.heading + (rng() > 0.5 ? 1 : -1) * (Math.PI / 2));
    }

    if (translation.archetypeId === "stepped-amphitheater" && translation.recipe.saField) {
      steerSteppedAmphitheater(agent, translation.recipe.saField, rng);
    }

    if (translation.archetypeId === "inserted-horizontal-plate") guidePlate(agent, translation);
    if (translation.archetypeId === "undulated") guideUndulated(agent, translation);
    if (translation.archetypeId === "continuous-hall") guideHall(agent, translation);
    const stepBase = slime?.stepSize ?? agent.speed * (0.7 + params.permeability * 0.35);
    const resistance = sampleResistance(agent, state.size, slime?.resistance ?? 0);
    const step = stepBase * (1 - resistance * 0.82);
    const fromX = agent.x;
    const fromY = agent.y;
    agent.x += Math.cos(agent.heading) * step;
    agent.y += Math.sin(agent.heading) * step;
    if (translation.archetypeId === "inserted-horizontal-plate") {
      const near = nearestUndulated(agent, translation);
      if (near && near.d > PLATE_BODY) {
        const keep = PLATE_BODY / near.d;
        agent.x = near.px + (agent.x - near.px) * keep;
        agent.y = near.py + (agent.y - near.py) * keep;
      }
    }
    if (translation.archetypeId === "undulated") {
      const near = nearestUndulated(agent, translation);
      if (near && near.d > UNDULATED_PATH) {
        const keep = UNDULATED_PATH / near.d;
        agent.x = near.px + (agent.x - near.px) * keep;
        agent.y = near.py + (agent.y - near.py) * keep;
      }
    }
    if (translation.archetypeId === "continuous-hall") {
      const near = nearestUndulated(agent, translation);
      if (near && near.d > HALL_OUTER) {
        const pull = Math.min(0.32, (near.d - HALL_OUTER) * 0.2);
        agent.x += ((near.px - agent.x) / near.d) * pull;
        agent.y += ((near.py - agent.y) / near.d) * pull;
      }
    }
    if (translation.archetypeId === "void-field") {
      const near = nearestVoidCirculation(agent, translation);
      if (!near || near.d > 2.2) {
        const fresh = spawnAgent(state.source, state.attractor, translation, rng);
        agent.x = fresh.x;
        agent.y = fresh.y;
        agent.heading = fresh.heading;
      }
    }
    if (translation.archetypeId === "contained-room-within-volume") {
      const near = nearestContainedField(agent, translation);
      if (near && near.d > 3.3) {
        agent.x += (near.px - agent.x) * 0.2;
        agent.y += (near.py - agent.y) * 0.2;
      }
    }
    if (translation.archetypeId === "terraced") holdTerraced(agent, translation, slime);
    if (translation.archetypeId === "flat-deep-plan") guideFlatDeep(agent, translation);
    if (translation.archetypeId === "stepped-amphitheater" && translation.recipe.saField) {
      containSteppedAmphitheater(agent, translation.recipe.saField);
    }
    if (translation.archetypeId === "topographic-ground-field") {
      const pad = nearestGroundPad(agent, translation);
      if (pad && pad.d > pad.radius * 0.98) {
        const pull = Math.min(0.4, (pad.d - pad.radius * 0.98) * 0.45);
        agent.x += ((pad.x - agent.x) / pad.d) * pull;
        agent.y += ((pad.y - agent.y) / pad.d) * pull;
      }
    }

    if (aroundAbsence(translation) && translation.archetypeId !== "void-field") {
      const coreDist = dist(agent, state.attractor);
      const angle = Math.atan2(agent.y - state.attractor.y, agent.x - state.attractor.x) || rng() * TWO_PI;
      const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
      const opening = 0.5 + 0.5 * Math.cos(angle * 2.05 + 0.4);
      const keepOut = slime
        ? voidRadius(angle, translation.recipe.isolationRadius * 0.48, slime)
        : translation.recipe.isolationRadius * 0.48 * wobble * (0.42 + 0.58 * opening);
      if (coreDist < keepOut) {
        const radius = keepOut + 0.12;
        agent.x = clamp(state.attractor.x + Math.cos(angle) * radius, 0.18, state.size - 0.18);
        agent.y = clamp(state.attractor.y + Math.sin(angle) * radius, 0.18, state.size - 0.18);
        agent.heading = wrapAngle(angle + (rng() - 0.5) * 0.5);
      }
    }

    keepOutsideCircles(agent, fromX, fromY, translation, state.size, slime);
    if (translation.archetypeId === "void-field" && pressedAgainstVoid(agent, translation, slime)) {
      const fresh = spawnAgent(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
    }

    const hitWall =
      agent.x < 0.18 || agent.x > state.size - 0.18 || agent.y < 0.18 || agent.y > state.size - 0.18;
    if (hitWall) {
      const fresh = spawnAgent(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
      if (recordPaths) {
        agent.pathX = [fresh.x];
        agent.pathY = [fresh.y];
      }
    } else {
      if (agent.x < 0.18 || agent.x > state.size - 0.18) {
        agent.x = clamp(agent.x, 0.18, state.size - 0.18);
        agent.heading = wrapAngle((agent.x < 1 ? 0 : Math.PI) + (rng() - 0.5) * 0.9);
      }
      if (agent.y < 0.18 || agent.y > state.size - 0.18) {
        agent.y = clamp(agent.y, 0.18, state.size - 0.18);
        agent.heading = wrapAngle((agent.y < 1 ? Math.PI / 2 : -Math.PI / 2) + (rng() - 0.5) * 0.9);
      }
    }

    const cell = fieldIndex(
      clamp(Math.round(agent.x), 0, state.size - 1),
      clamp(Math.round(agent.y), 0, state.size - 1),
      state.size,
    );
    state.flow[cell] += 1;
    let depositAmount = slime?.deposit ?? (0.05 + params.flowCoupling * 0.1) * agent.trailStrength;
    let steppedInk: { amount: number; width: number } | null = null;
    if (translation.archetypeId === "stepped-amphitheater" && translation.recipe.saField) {
      steppedInk = inkSteppedAmphitheater(agent, translation.recipe.saField);
      depositAmount = steppedInk.amount;
    }
    const edge = Math.min(agent.x, agent.y, state.size - agent.x, state.size - agent.y);
    if (
      edge < 2.6 &&
      !fineTrail(translation.archetypeId) &&
      translation.archetypeId !== "undulated" &&
      translation.archetypeId !== "stepped-amphitheater" &&
      translation.archetypeId !== "contained-room-within-volume"
    ) {
      depositAmount *= 0.012;
    }
    if (insideAttractorHole(agent, translation, slime)) depositAmount = 0;
    if (
      translation.archetypeId === "linear-edge-gallery" &&
      insideAttractorHole({ x: fromX, y: fromY }, translation, slime)
    ) {
      depositAmount = 0;
    }
    if (translation.archetypeId === "vertical-void") {
      const voids = translation.recipe.attractors;
      if (voids) {
        for (const item of voids) {
          if (item.kind === "line" || item.kind === "curve") continue;
          if (item.hole !== true && item.kind !== "ring") continue;
          const radius = polarVoidRadius(item, agent, slime);
          if (radius <= 0) continue;
          const angle = Math.atan2(agent.y - item.y, agent.x - item.x);
          if (Math.hypot(agent.x - item.x, agent.y - item.y) < verticalVoidReach(angle, radius)) {
            depositAmount = 0;
            break;
          }
        }
      }
    }
    if (translation.archetypeId === "void-field") {
      const near = nearestVoidCirculation(agent, translation);
      if (!near || near.d > 1.55) depositAmount = 0;
    }
    if (translation.archetypeId === "topographic-ground-field") {
      const pad = nearestGroundPad(agent, translation);
      if (!pad || pad.d > pad.radius) depositAmount = 0;
    }
    if (translation.archetypeId === "flat-deep-plan" && !onFlatDeepWall(agent, translation)) depositAmount = 0;
    if (translation.archetypeId === "contained-room-within-volume") {
      const near = nearestContainedField(agent, translation);
      if (!near || near.d > 3.15) depositAmount = 0;
      else {
        const coreD = Math.hypot(agent.x - state.attractor.x, agent.y - state.attractor.y);
        const rim = Math.max(1.4, translation.recipe.isolationRadius);
        const outside = coreD - rim;
        if (outside > 0 && outside < 1.6) depositAmount *= 1.65;
      }
    }
    if (translation.archetypeId === "inserted-horizontal-plate") {
      const near = nearestUndulated(agent, translation);
      if (!near || near.d > PLATE_BODY) depositAmount = 0;
    }
    if (translation.archetypeId === "undulated") {
      const near = nearestUndulated(agent, translation);
      if (!near || near.d > UNDULATED_PATH) depositAmount = 0;
    }
    if (translation.archetypeId === "continuous-hall") {
      const near = hallContact(agent, translation);
      if (!near || near.d > HALL_OUTER + 0.35) depositAmount = 0;
    }
    if (translation.archetypeId === "terraced" && !onTerracedPlate(agent, translation)) {
      depositAmount = 0;
    }
    if (aroundAbsence(translation) && translation.archetypeId !== "void-field") {
      const angle = Math.atan2(agent.y - state.attractor.y, agent.x - state.attractor.x);
      const limit = slime
        ? voidRadius(angle, translation.recipe.isolationRadius * 0.55, slime)
        : translation.recipe.isolationRadius * 0.55;
      if (dist(agent, state.attractor) < limit) depositAmount *= 0.05;
    }
    const depositWidth = HAIR_WIDTH;
    const depositCap = HAIR_CAP;
    const paint = depositAmount > 0 ? (translation.archetypeId === "void-edge" ? HAIR_DEPOSIT * 0.55 : HAIR_DEPOSIT) : 0;
    const traveled = dist({ x: fromX, y: fromY }, agent);
    const joinTrail =
      translation.archetypeId !== "compressed-sequential" || depositWidth < 28;
    if (joinTrail && !hitWall && traveled <= step * 1.75 + 0.02) {
      depositSegment(
        state.trails,
        state.trailSize,
        { x: fromX, y: fromY },
        agent,
        paint,
        depositWidth,
        depositCap,
      );
    } else {
      deposit(state.trails, state.trailSize, agent, paint, depositWidth, depositCap);
    }

    if (
      rng() <
      (aroundAbsence(translation) ? 0.0004 : containedInterior(translation) ? 0.0015 : 0.0009)
    ) {
      const fresh = spawnAgent(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
      if (recordPaths) {
        agent.pathX = [fresh.x];
        agent.pathY = [fresh.y];
      }
    } else if (recordPaths) {
      agent.pathX.push(agent.x);
      agent.pathY.push(agent.y);
      if (agent.pathX.length > PATH_LENGTH) {
        agent.pathX.shift();
        agent.pathY.shift();
      }
    }
  }

  const book = trailBook(state.trails);
  let write = 0;
  for (let n = 0; n < book.active.length; n += 1) {
    const i = book.active[n];
    if (state.displayTrails) state.displayTrails[i] = Math.max(state.displayTrails[i], state.trails[i]);
    const faded = state.trails[i] * decayMul;
    trailDelta += Math.abs(state.trails[i] - faded);
    if (faded > 0.003) {
      state.trails[i] = faded;
      book.active[write] = i;
      write += 1;
    } else {
      state.trails[i] = 0;
      book.stamp[i] = 0;
    }
  }
  book.active.length = write;

  const leak = 0.03 + params.networkDensity * 0.12;
  const pack = clamp(1 - params.nodeSpacing, 0, 1);
  const slimeMix = slime?.diffusion ?? -1;
  if (slimeMix > 0.001 || (!slime && (params.networkDensity > 0.35 || pack > 0.55))) {
    const mix = slime ? slimeMix : params.networkDensity > 0.35 ? leak : 0.018 + pack * 0.025;
    const size = state.trailSize;
    const trails = state.trails;
    const seen = book.stamp;
    const queued: number[] = [];
    const queue = (index: number) => {
      if (index < 0 || index >= trails.length || seen[index] === 2) return;
      seen[index] = 2;
      queued.push(index);
    };
    for (let n = 0; n < book.active.length; n += 1) {
      const i = book.active[n];
      queue(i);
      const x = i % size;
      if (x > 0) queue(i - 1);
      if (x < size - 1) queue(i + 1);
      if (i >= size) queue(i - size);
      if (i < trails.length - size) queue(i + size);
    }
    const previous = scratchFor(trails.length);
    for (let n = 0; n < queued.length; n += 1) previous[queued[n]] = trails[queued[n]];
    const read = (index: number) => (seen[index] === 2 ? previous[index] : trails[index]);
    for (let n = 0; n < queued.length; n += 1) {
      const i = queued[n];
      const x = i % size;
      const left = x > 0 ? read(i - 1) : previous[i];
      const right = x < size - 1 ? read(i + 1) : previous[i];
      const up = i >= size ? read(i - size) : previous[i];
      const down = i < trails.length - size ? read(i + size) : previous[i];
      trails[i] = previous[i] * (1 - mix) + (left + right + up + down) * 0.25 * mix;
    }
    let write = 0;
    for (let n = 0; n < queued.length; n += 1) {
      const i = queued[n];
      if (trails[i] > 0.003) {
        seen[i] = 1;
        queued[write] = i;
        write += 1;
      } else {
        trails[i] = 0;
        seen[i] = 0;
      }
    }
    queued.length = write;
    book.active = queued;
  }

  eraseTrailsInsideCircles(state.trails, state.trailSize, state.size, translation, slime);

  if (finalize) state.occupancy = downsampleOccupancy(state.trails, state.trailSize, state.size);
  state.iteration += 1;
  state.totalDelta = trailDelta / Math.max(1, state.agents.length);
  if (
    state.iteration >= CONVERGENCE_MIN_ITERATIONS &&
    state.totalDelta < CONVERGENCE_EPSILON
  ) {
    state.streak += 1;
  } else if (state.iteration >= CONVERGENCE_MIN_ITERATIONS) {
    state.streak = 0;
  }
  state.converged =
    state.streak >= CONVERGENCE_STREAK || state.iteration >= state.maxIterations;
  return state;
}

export function stepMany(
  state: SimulationState,
  translation: BiologicalTranslation,
  rng: () => number,
  count: number,
  trailDecay = 0.986,
  slime?: SlimeControls,
  recordPaths = true,
) {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    if (next.converged) break;
    next = stepSimulation(next, translation, rng, trailDecay, slime, i === count - 1, recordPaths);
  }
  return next;
}

export function runSimulation(
  translation: BiologicalTranslation,
  seed: number,
  maxIterations = MAX_ITERATIONS,
  agentCount = DEFAULT_AGENT_COUNT,
) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state = createSimulation(translation, seed, agentCount);
  state.maxIterations = maxIterations;
  while (!state.converged && state.iteration < maxIterations) {
    stepSimulation(state, translation, rng);
  }
  return state;
}

export function trailPeak(state: SimulationState) {
  return state.trails.reduce((max, value) => Math.max(max, value), 0.0001);
}

export function captureSnapshot(state: SimulationState, lite = false): FieldSnapshot {
  return {
    iteration: state.iteration,
    size: state.size,
    trailSize: state.trailSize,
    trails: state.trails.slice(),
    occupancy: lite ? [] : state.occupancy.slice(),
    agents: lite ? [] : state.agents.map((agent) => ({ x: agent.x, y: agent.y })),
    paths: lite ? [] : state.agents.map((agent) => ({
      x: agent.pathX.slice(),
      y: agent.pathY.slice(),
    })),
    source: { ...state.source },
    attractor: { ...state.attractor },
  };
}
