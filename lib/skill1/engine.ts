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
import { voidRadius, type SlimeControls } from "./slime-controls";
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
  topologyOf(translation) === "around-absence";

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
  if (translation.recipe.attractorsOnly && translation.recipe.attractors?.length) {
    paintAttractorList(field, size, translation.recipe.attractors, attractionStrength);
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
  if (item.kind === "ring" || item.kind === "point") return ringAroundPoint(from, item, heading);
  return { x: item.x, y: item.y };
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
  const list = attractorList(primary, translation);
  let best = pullPoint(from, list[0], heading);
  let bestD = dist(from, best);
  for (let i = 1; i < list.length; i += 1) {
    const point = pullPoint(from, list[i], heading);
    const d = dist(from, point);
    if (d < bestD) {
      best = point;
      bestD = d;
    }
  }
  return best;
}

function paintAttractorList(field: number[], size: number, list: FieldAttractor[], gainBase: number) {
  for (const item of list) {
    const gain = gainBase * (item.strength ?? 1);
    const spread = Math.max(0.75, item.kind === "ring" ? 1.15 : item.radius ?? 2.2);
    const twoSigma = 2 * spread * spread;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let d = 0;
        if (item.kind === "line") {
          d = distanceToSegment(x, y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
        } else if (item.kind === "curve") {
          d = dist({ x, y }, nearestOnCurve({ x, y }, item));
        } else if (item.kind === "ring" || item.kind === "point") {
          const radial = Math.hypot(x - item.x, y - item.y);
          const limit = circleRadius(item);
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

function insideAttractorHole(point: Point, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors;
  if (!list) return false;
  for (const item of list) {
    const radius = circleRadius(item);
    if (radius <= 0) continue;
    if (Math.hypot(point.x - item.x, point.y - item.y) < radius) return true;
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
function holeMaskFor(trailSize: number, fieldSize: number, translation: BiologicalTranslation) {
  const list = translation.recipe.attractors ?? [];
  const key = `${trailSize}|${fieldSize}|${list
    .map((item) => {
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
      if (insideAttractorHole({ x: fx, y: fy }, translation)) mask[i] = 1;
    }
    if (holeMasks.size >= 8) holeMasks.delete(holeMasks.keys().next().value as string);
    holeMasks.set(key, mask);
  }
  return mask;
}

function eraseTrailsInsideCircles(
  trails: number[],
  trailSize: number,
  fieldSize: number,
  translation: BiologicalTranslation,
) {
  const list = translation.recipe.attractors;
  if (!list?.some((item) => circleRadius(item) > 0)) return;
  const book = trailBook(trails);
  const hole = holeMaskFor(trailSize, fieldSize, translation);
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

/** Stops a step at the circle rim and turns the heading so the particle travels around it. */
function keepOutsideCircles(
  agent: SimAgent,
  fromX: number,
  fromY: number,
  translation: BiologicalTranslation,
  size: number,
) {
  const list = translation.recipe.attractors;
  if (!list) return;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const item of list) {
      const radius = circleRadius(item);
      if (radius <= 0) continue;
      const endDist = Math.hypot(agent.x - item.x, agent.y - item.y);
      const startDist = Math.hypot(fromX - item.x, fromY - item.y);
      if (endDist >= radius && startDist >= radius) {
        const crossed = circleHitT(fromX, fromY, agent.x, agent.y, item.x, item.y, radius);
        if (crossed == null) continue;
      } else if (endDist >= radius) {
        continue;
      }
      let px = agent.x;
      let py = agent.y;
      if (startDist > radius) {
        const hit = circleHitT(fromX, fromY, agent.x, agent.y, item.x, item.y, radius);
        if (hit != null) {
          const span = Math.hypot(agent.x - fromX, agent.y - fromY) || 1;
          const t = Math.max(0, hit - 0.04 / span);
          px = fromX + (agent.x - fromX) * t;
          py = fromY + (agent.y - fromY) * t;
        }
      }
      const rdx = px - item.x;
      const rdy = py - item.y;
      const rd = Math.hypot(rdx, rdy);
      if (rd < radius + 0.02) {
        const angle = rd > 0.001 ? Math.atan2(rdy, rdx) : Math.atan2(fromY - item.y, fromX - item.x);
        px = item.x + Math.cos(angle) * (radius + 0.02);
        py = item.y + Math.sin(angle) * (radius + 0.02);
      }
      agent.x = clamp(px, 0.18, size - 0.18);
      agent.y = clamp(py, 0.18, size - 0.18);
      const nx = agent.x - item.x;
      const ny = agent.y - item.y;
      const nm = Math.hypot(nx, ny) || 1;
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
  if (aroundAbsence(translation)) {
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
  if (insideAttractorHole(look, translation)) return -2;
  const influence = slime?.trailInfluence ?? 1;
  const resistance = sampleResistance(look, state.size, slime?.resistance ?? 0);
  return (
    trail * trailFollow * influence +
    attraction * pull +
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
  if (aroundAbsence(translation) && rng() > 0.05) {
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
  for (let oy = -span; oy <= span; oy += 1) {
    for (let ox = -span; ox <= span; ox += 1) {
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
  const decayMul = slime
    ? clamp(slime.decay, 0.9, 0.998)
    : clamp(trailDecay, 0.96, 0.998);
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
    keepOutsideCircles(agent, agent.x, agent.y, translation, state.size);
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

    const dirPull = params.directionalBias * 0.28;
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

    const stepBase = slime?.stepSize ?? agent.speed * (0.7 + params.permeability * 0.35);
    const resistance = sampleResistance(agent, state.size, slime?.resistance ?? 0);
    const step = stepBase * (1 - resistance * 0.82);
    const fromX = agent.x;
    const fromY = agent.y;
    agent.x += Math.cos(agent.heading) * step;
    agent.y += Math.sin(agent.heading) * step;

    if (aroundAbsence(translation)) {
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

    keepOutsideCircles(agent, fromX, fromY, translation, state.size);

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
    const edge = Math.min(agent.x, agent.y, state.size - agent.x, state.size - agent.y);
    if (edge < 2.6) depositAmount *= 0.012;
    if (insideAttractorHole(agent, translation)) depositAmount = 0;
    if (aroundAbsence(translation)) {
      const angle = Math.atan2(agent.y - state.attractor.y, agent.x - state.attractor.x);
      const limit = slime
        ? voidRadius(angle, translation.recipe.isolationRadius * 0.55, slime)
        : translation.recipe.isolationRadius * 0.55;
      if (dist(agent, state.attractor) < limit) depositAmount *= 0.05;
    }
    const depositWidth = slime?.depositWidth ?? 1;
    const depositCap = slime?.trailCap ?? 1.8;
    const traveled = dist({ x: fromX, y: fromY }, agent);
    if (!hitWall && traveled <= step * 1.75 + 0.02) {
      depositSegment(
        state.trails,
        state.trailSize,
        { x: fromX, y: fromY },
        agent,
        depositAmount,
        depositWidth,
        depositCap,
      );
    } else {
      deposit(state.trails, state.trailSize, agent, depositAmount, depositWidth, depositCap);
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

  eraseTrailsInsideCircles(state.trails, state.trailSize, state.size, translation);

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
