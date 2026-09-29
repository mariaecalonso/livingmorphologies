/**
 * Placeholder trail fields for the interface only.
 * Not produced by the Physarum engine, the evaluator, or any search code.
 * Output is a FieldSnapshot so the real plan renderer draws it; replace with
 * real snapshots once 2D Evolution produces them.
 */

import { FIELD_SIZE } from "@/lib/skill1/maps";
import { mulberry32 } from "@/lib/physarum";
import type { FieldAttractor, FieldSnapshot } from "@/lib/skill1/types";

const TRAIL_SIZE = 160;
const CELL = TRAIL_SIZE / FIELD_SIZE;
const LOW = 2.2;
const HIGH = 17.6;
const STEP = 0.12;
const FAMILY_SEED = 7407;
const FOUNDERS = 5;

type Body = { x: number; y: number; rx: number; ry: number; angle: number; weight: number };

type MockTraits = {
  bodies: Body[];
  tubes: number;
  bridges: number;
  drift: number;
  driftStrength: number;
  curl: number;
  reach: number;
  texture: number;
};

export type MockField = { snapshot: FieldSnapshot; attractors: FieldAttractor[] };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number) {
  return 0.5 * noise(x, y, seed) + 0.3 * noise(x * 2.1, y * 2.1, seed + 7) + 0.2 * noise(x * 4.3, y * 4.3, seed + 13);
}

function founder(index: number): MockTraits {
  const random = mulberry32(FAMILY_SEED * 31 + index * 977);
  const count = 1 + Math.floor(random() * 3);
  const bodies: Body[] = [];
  for (let i = 0; i < count; i += 1) {
    bodies.push({
      x: 5 + random() * 10,
      y: 5 + random() * 10,
      rx: 2.8 + random() * 2.8,
      ry: 2.4 + random() * 2.6,
      angle: random() * Math.PI,
      weight: 0.75 + random() * 0.25,
    });
  }
  return {
    bodies,
    tubes: 18 + Math.floor(random() * 16),
    bridges: 0.35 + random() * 0.6,
    drift: random() * Math.PI * 2,
    driftStrength: 0.1 + random() * 0.4,
    curl: 0.35 + random() * 0.45,
    reach: 5 + random() * 5,
    texture: Math.floor(random() * 1e6),
  };
}

/** One inherited variation step: the morphology changes, the grammar does not. */
function vary(traits: MockTraits, random: () => number): MockTraits {
  const bodies = traits.bodies.map((body) => ({
    x: clamp(body.x + (random() - 0.5) * 1.6, 4.5, 15.5),
    y: clamp(body.y + (random() - 0.5) * 1.6, 4.5, 15.5),
    rx: clamp(body.rx * (0.85 + random() * 0.3), 1.8, 6.5),
    ry: clamp(body.ry * (0.85 + random() * 0.3), 1.8, 6.5),
    angle: body.angle + (random() - 0.5) * 0.5,
    weight: clamp(body.weight + (random() - 0.5) * 0.1, 0.65, 1),
  }));
  if (random() < 0.18 && bodies.length < 3) {
    const parent = bodies[Math.floor(random() * bodies.length)];
    const angle = random() * Math.PI * 2;
    bodies.push({
      x: clamp(parent.x + Math.cos(angle) * 4, 4.5, 15.5),
      y: clamp(parent.y + Math.sin(angle) * 4, 4.5, 15.5),
      rx: parent.rx * 0.6,
      ry: parent.ry * 0.6,
      angle: random() * Math.PI,
      weight: 0.7,
    });
  } else if (random() < 0.12 && bodies.length > 1) {
    bodies.pop();
  }
  return {
    bodies,
    tubes: Math.round(clamp(traits.tubes + (random() - 0.5) * 10, 10, 40)),
    bridges: clamp(traits.bridges + (random() - 0.5) * 0.4, 0.1, 1),
    drift: traits.drift + (random() - 0.5) * 0.7,
    driftStrength: clamp(traits.driftStrength + (random() - 0.5) * 0.24, 0, 0.6),
    curl: clamp(traits.curl + (random() - 0.5) * 0.24, 0.25, 0.9),
    reach: clamp(traits.reach + (random() - 0.5) * 3, 4, 11),
    texture: traits.texture,
  };
}

function traitsFor(seed: number, generation: number, founderIndex?: number) {
  const random = mulberry32(seed);
  const pick = Math.floor(random() * FOUNDERS);
  let traits = founder(founderIndex ?? pick);
  for (let step = 0; step < Math.max(1, generation); step += 1) traits = vary(traits, random);
  return { traits, random };
}

function deposit(field: Float32Array, x: number, y: number, radius: number, amount: number) {
  const cx = x * CELL;
  const cy = y * CELL;
  const r = Math.max(0.6, radius * CELL);
  const r2 = r * r;
  const reach = Math.ceil(r * 2);
  const i0 = Math.max(0, Math.floor(cx) - reach);
  const i1 = Math.min(TRAIL_SIZE - 1, Math.floor(cx) + reach);
  const j0 = Math.max(0, Math.floor(cy) - reach);
  const j1 = Math.min(TRAIL_SIZE - 1, Math.floor(cy) + reach);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const dx = i + 0.5 - cx;
      const dy = j + 0.5 - cy;
      field[j * TRAIL_SIZE + i] += amount * Math.exp(-(dx * dx + dy * dy) / r2);
    }
  }
}

function turnToward(heading: number, target: number) {
  return Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
}

type Walk = {
  x: number;
  y: number;
  heading: number;
  length: number;
  radius: number;
  amount: number;
  depth: number;
  curl: number;
  target?: { x: number; y: number };
};

function grow(field: Float32Array, traits: MockTraits, random: () => number, walk: Walk) {
  let { x, y, heading } = walk;
  const steps = Math.max(2, Math.round(walk.length / STEP));
  let spin = 0;
  let spinLeft = 0;
  for (let step = 0; step < steps; step += 1) {
    heading += (random() - 0.5) * walk.curl;
    heading += turnToward(heading, traits.drift) * traits.driftStrength * 0.04;
    if (walk.target) {
      heading += turnToward(heading, Math.atan2(walk.target.y - y, walk.target.x - x)) * 0.14;
      if (Math.hypot(walk.target.x - x, walk.target.y - y) < 0.6) break;
    }
    if (spinLeft > 0) {
      heading += spin;
      spinLeft -= 1;
    } else if (!walk.target && random() < 0.02) {
      spin = (random() < 0.5 ? -1 : 1) * (0.28 + random() * 0.2);
      spinLeft = 10 + Math.floor(random() * 14);
    }
    x += Math.cos(heading) * STEP;
    y += Math.sin(heading) * STEP;
    if (x < LOW || x > HIGH || y < LOW || y > HIGH) {
      if (random() < 0.35) break;
      x = clamp(x, LOW, HIGH);
      y = clamp(y, LOW, HIGH);
      heading += (random() < 0.5 ? 1 : -1) * Math.PI * 0.5;
    }
    const fade = 1 - (step / steps) * 0.5;
    const swell = 0.8 + 0.4 * noise(x * 1.7, y * 1.7, traits.texture + 3);
    deposit(field, x, y, walk.radius * swell, walk.amount * fade);
    if (walk.depth < 2 && random() < 0.045) {
      grow(field, traits, random, {
        x,
        y,
        heading: heading + (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7),
        length: (walk.length - step * STEP) * (0.3 + random() * 0.4),
        radius: walk.radius * 0.85,
        amount: walk.amount * 0.8,
        depth: walk.depth + 1,
        curl: walk.curl,
      });
    }
  }
}

function paintBodies(field: Float32Array, traits: MockTraits) {
  for (let j = 0; j < TRAIL_SIZE; j += 1) {
    const y = (j + 0.5) / CELL;
    if (y < LOW || y > HIGH) continue;
    for (let i = 0; i < TRAIL_SIZE; i += 1) {
      const x = (i + 0.5) / CELL;
      if (x < LOW || x > HIGH) continue;
      let reach = 0;
      for (const body of traits.bodies) {
        const cos = Math.cos(body.angle);
        const sin = Math.sin(body.angle);
        const dx = x - body.x;
        const dy = y - body.y;
        const u = (dx * cos + dy * sin) / body.rx;
        const v = (-dx * sin + dy * cos) / body.ry;
        const warp = (fbm(x * 0.55, y * 0.55, traits.texture) - 0.5) * 1.1;
        const distance = Math.hypot(u, v) * (1 + warp);
        reach = Math.max(reach, body.weight * (1 - smooth(0.4, 1.15, distance)));
      }
      if (reach <= 0) continue;
      const grain = fbm(x * 4.6, y * 4.6, traits.texture + 11);
      const ripple = noise(x * 10, y * 10, traits.texture + 23) - 0.5;
      let value = reach * (0.5 + 0.7 * grain + 0.5 * ripple);
      if (reach < 0.45) value *= smooth(0.3, 0.62, grain + reach * 0.5);
      if (reach < 0.7) value *= smooth(0.3, 0.4, fbm(x * 1.5, y * 1.5, traits.texture + 31) + reach * 0.12);
      field[j * TRAIL_SIZE + i] += value;
    }
  }
}

function bodyEdge(body: Body, angle: number, scale: number) {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  const u = Math.cos(angle) * body.rx * scale;
  const v = Math.sin(angle) * body.ry * scale;
  return { x: body.x + u * cos - v * sin, y: body.y + u * sin + v * cos };
}

function buildField(traits: MockTraits, random: () => number): MockField {
  const field = new Float32Array(TRAIL_SIZE * TRAIL_SIZE);
  paintBodies(field, traits);

  traits.bodies.forEach((a, index) => {
    traits.bodies.slice(index + 1).forEach((b) => {
      if (random() > traits.bridges) return;
      const strands = 1 + Math.floor(random() * 2);
      for (let s = 0; s < strands; s += 1) {
        const angle = Math.atan2(b.y - a.y, b.x - a.x) + (random() - 0.5) * 0.9;
        const start = bodyEdge(a, angle, 0.7);
        grow(field, traits, random, {
          ...start,
          heading: angle,
          length: Math.hypot(b.x - a.x, b.y - a.y) * 1.8,
          radius: 0.2 + random() * 0.08,
          amount: 0.07 + random() * 0.03,
          depth: 1,
          curl: traits.curl * 0.5,
          target: bodyEdge(b, angle + Math.PI, 0.5),
        });
      }
    });
  });

  for (let t = 0; t < traits.tubes; t += 1) {
    const body = traits.bodies[Math.floor(random() * traits.bodies.length)];
    const angle = random() * Math.PI * 2;
    const start = bodyEdge(body, angle, 0.8 + random() * 0.25);
    grow(field, traits, random, {
      ...start,
      heading: angle + (random() - 0.5) * 0.8,
      length: traits.reach * (0.35 + random() * 0.65),
      radius: 0.12 + random() * 0.04,
      amount: 0.03 + random() * 0.015,
      depth: 0,
      curl: traits.curl,
    });
  }

  const fragments = 2 + Math.floor(random() * 5);
  for (let f = 0; f < fragments; f += 1) {
    grow(field, traits, random, {
      x: LOW + random() * (HIGH - LOW),
      y: LOW + random() * (HIGH - LOW),
      heading: random() * Math.PI * 2,
      length: 0.5 + random() * 1.2,
      radius: 0.12,
      amount: 0.03,
      depth: 2,
      curl: traits.curl,
    });
  }

  const attractors: FieldAttractor[] = traits.bodies.map((body) => ({ kind: "point", x: body.x, y: body.y, radius: 1.6 }));
  return {
    attractors,
    snapshot: {
      iteration: 600,
      size: FIELD_SIZE,
      trailSize: TRAIL_SIZE,
      trails: Array.from(field),
      occupancy: [],
      agents: [],
      source: { x: -10, y: -10 },
      attractor: { x: traits.bodies[0].x, y: traits.bodies[0].y },
    },
  };
}

const cache = new Map<string, MockField>();

/**
 * Placeholder morphology for a mock candidate. Every candidate descends from one
 * of a few shared founders, varied once per generation, so later generations
 * read as relatives of the initial population.
 */
export function mockField(seed: number, generation: number, founderIndex?: number): MockField {
  const key = `${seed}:${generation}:${founderIndex ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { traits, random } = traitsFor(seed, generation, founderIndex);
  const built = buildField(traits, random);
  cache.set(key, built);
  return built;
}
