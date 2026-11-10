import { sampleField } from "@/lib/skill1/engine";
import {
  CONVERGENCE_EPSILON,
  CONVERGENCE_MIN_ITERATIONS,
  CONVERGENCE_STREAK,
  FIELD_SIZE,
  TRAIL_SCALE,
} from "@/lib/skill1/maps";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { BiologicalTranslation, Point, SimAgent, SimulationState } from "@/lib/skill1/types";

/**
 * Site-local copy of the open-hall Physarum step.
 * The live study still calls the shared engine. This stepper is the prototype
 * for return trips: sensing, movement, deposit, diffusion, decay, and the
 * attraction field stay as they are. While an agent is walking back, the
 * distance-independent attractor alignment, the attractor heading blend, and
 * the crowd heading blend are left out so they cannot turn that walk around.
 */

const TWO_PI = Math.PI * 2;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const wrapAngle = (angle: number) => {
  let next = angle % TWO_PI;
  if (next < 0) next += TWO_PI;
  return next;
};

type TrailBook = { active: number[]; stamp: Uint8Array };

const trailBooks = new WeakMap<number[], TrailBook>();
let trailScratch: Float32Array | null = null;
let densityScratch: number[] | null = null;

/**
 * Site-only corridor rules. Unset fields leave the original prototype behavior.
 * None of these change how much ink a step deposits or how fast ink decays.
 */
export type ShuttleTune = {
  /** While returning, drop the attraction-field term so the destination pad cannot outvote the trail. */
  quiet?: boolean;
  /** While returning, do not apply the straight-ahead wander or the extra randomness. Side sensors still turn. */
  steady?: boolean;
  /** While returning, look closer and in a narrower cone, and cut the remaining randomness. */
  narrow?: boolean;
  /** Field units. Inside this distance of the attractor just reached, keep the arrival heading. */
  lock?: number;
  /** After the source, walk back along the trail to the same attractor. A lost trail releases the agent. */
  repeat?: boolean;
  /** While returning, keep the heading when the trail ahead is still present, so a stronger side trail cannot peel the agent off. */
  preferForward?: boolean;
  /** While returning, steer along the deposited trail behind the agent. */
  retrace?: boolean;
  /** While returning, walk back through the positions this agent already traveled. */
  crumbs?: boolean;
  /** Share a discovered source-to-attractor walk with other agents of that pair. */
  collective?: boolean;
  /**
   * Each agent keeps a duty attractor, so the colony works toward every attractor
   * for the whole run. Reaching one sends the agent back along its trail and
   * then on toward whichever attractor still has the thinner approach.
   */
  relay?: boolean;
  /**
   * Prefer a trail segment that other agents have used recently.
   * The bonus uses the existing trail value and a separate activity count.
   * Deposit, diffusion, and decay are unchanged.
   */
  traffic?: boolean;
};

/** Recent passes on the trail grid. This is not ink and is not written into the trail. */
const trafficFields = new WeakMap<SimulationState, Float32Array>();
const TRAFFIC_FADE = 0.9;
const TRAFFIC_TRAIL = 0.02;
const TRAFFIC_PASSES = 1.2;

/** Per-agent attractor duty. This does not change deposit or decay. */
export type RelayBook = {
  duty: Uint8Array;
};

const ROUTES_PER_PAIR = 3;
const ROUTE_SIMILAR = 0.5;
const ROUTE_CAPTURE = 0.16;

const CRUMB_LIMIT = 96;
const CRUMB_SPACING = 0.42;

export type CrumbBook = {
  x: Float32Array;
  y: Float32Array;
  count: Uint16Array;
  cursor: Uint16Array;
  /** 1 while the agent is walking the recorded positions back toward the attractor. */
  forward: Uint8Array;
  /** Times the agent has reached either end of its recorded walk. */
  laps: Uint8Array;
};

/** One discovered walk. Agents reuse it by walking the recorded positions. */
export type SharedRoute = {
  source: number;
  attractor: number;
  x: Float32Array;
  y: Float32Array;
  count: number;
};

export type CollectiveBook = {
  sources: readonly Point[];
  /** Field units. The start of a walk must be this close to a source. */
  sourceReach: number;
  routes: SharedRoute[];
  /** Shared route index, or -1 while the agent is exploring. */
  adopted: Int16Array;
  cursor: Uint16Array;
  /** 1 while walking toward the attractor end of the route. */
  forward: Uint8Array;
  /** 1 while the agent was already inside its source radius last step. */
  atHome: Uint8Array;
};

export type SiteShuttle = {
  returning: boolean[];
  homeX: Float64Array;
  homeY: Float64Array;
  attractors: readonly Point[];
  /** Field units. An explorer who enters this radius starts walking back. */
  reach: number;
  /** Field units. A returning agent inside this radius of its source explores again. */
  homeReach: number;
  tune?: ShuttleTune;
  /** True when a repeating agent is walking the corridor toward its attractor. */
  outbound?: boolean[];
  course?: Float64Array;
  caughtX?: Float64Array;
  caughtY?: Float64Array;
  lost?: Uint8Array;
  crumbs?: CrumbBook;
  collective?: CollectiveBook;
  relay?: RelayBook;
  /** Duty attractor while the traffic rule is on. Every attractor stays in the rotation. */
  traffic?: RelayBook;
};

function trailBook(trails: number[]): TrailBook {
  let book = trailBooks.get(trails);
  if (!book || book.stamp.length !== trails.length) {
    book = { active: [], stamp: new Uint8Array(trails.length) };
    trailBooks.set(trails, book);
  }
  return book;
}

function markTrail(trails: number[], index: number) {
  const book = trailBook(trails);
  if (book.stamp[index]) return;
  book.stamp[index] = 1;
  book.active.push(index);
}

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

function toTrail(point: Point, scale: number) {
  return { x: point.x * scale, y: point.y * scale };
}

function nearestAttractor(from: Point, translation: BiologicalTranslation): Point {
  const marks = translation.recipe.attractors;
  if (translation.recipe.attractorFixed && marks?.length) {
    let best = marks[0];
    let bestDistance = Math.hypot(from.x - best.x, from.y - best.y);
    for (let index = 1; index < marks.length; index += 1) {
      const mark = marks[index];
      const distance = Math.hypot(from.x - mark.x, from.y - mark.y);
      if (distance < bestDistance) {
        best = mark;
        bestDistance = distance;
      }
    }
    return { x: best.x, y: best.y };
  }
  return translation.recipe.attractor;
}

function sense(
  fieldPoint: Point,
  heading: number,
  distance: number,
  trails: number[],
  trailSize: number,
  translation: BiologicalTranslation,
  state: SimulationState,
  slime: SlimeControls | undefined,
  align: boolean,
  attractionScale = 1,
  focus: Point | null = null,
  trailScale = 1,
) {
  const look = {
    x: fieldPoint.x + Math.cos(heading) * distance,
    y: fieldPoint.y + Math.sin(heading) * distance,
  };
  const trail = sampleField(trails, toTrail(look, trailSize / FIELD_SIZE), trailSize);
  const attraction = sampleField(state.attraction, look, state.size);
  const { params } = translation;
  const trailFollow = 0.48 + params.networkDensity * 0.85;
  const pull = 0.16 + params.attractionStrength * 0.5;
  let alignment = 0;
  if (align) {
    const target = focus ?? nearestAttractor(look, translation);
    const dx = target.x - look.x;
    const dy = target.y - look.y;
    const mag = Math.hypot(dx, dy) || 1;
    alignment = Math.max(0, (Math.cos(heading) * dx + Math.sin(heading) * dy) / mag);
  }
  const influence = slime?.trailInfluence ?? 1;
  return {
    score: trail * trailScale * trailFollow * influence + attraction * pull * attractionScale + params.permeability * 0.03 + alignment * params.directionalBias,
    trail,
  };
}

/** Open-hall branch of the engine respawn. Other archetypes are not used by this study. */
function respawn(source: Point, attractor: Point, translation: BiologicalTranslation, rng: () => number) {
  const { params } = translation;
  const roll = rng();
  if (roll > 0.1) {
    return {
      x: 1.1 + rng() * (FIELD_SIZE - 2.2),
      y: 1.1 + rng() * (FIELD_SIZE - 2.2),
      heading: rng() * TWO_PI,
    };
  }
  const invite = (params.sourcePermeability - 0.5) * 0.7;
  const spread = 0.55 + params.geometryVariation * 0.9 + params.nodeSpacing * 0.45 + invite;
  const toward = Math.atan2(attractor.y - source.y, attractor.x - source.x);
  const heading = wrapAngle(
    toward * (0.25 + params.directionalBias * 0.45) + (rng() - 0.5) * (1.2 + params.geometryVariation * 1.4),
  );
  return {
    x: clamp(source.x + (rng() - 0.5) * spread - Math.sign(source.x - 10) * 0.35, 0.15, FIELD_SIZE - 0.15),
    y: clamp(source.y + rng() * spread * 0.7, 0.15, FIELD_SIZE - 0.15),
    heading,
  };
}

function deposit(trails: number[], trailSize: number, point: Point, amount: number, width: number, cap: number) {
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
        paint(x, y, Math.max(0, (1 - Math.abs(pos.x - x)) * (1 - Math.abs(pos.y - y))));
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

function depositSegment(
  trails: number[],
  trailSize: number,
  from: Point,
  to: Point,
  amount: number,
  width: number,
  cap: number,
) {
  const scale = trailSize / FIELD_SIZE;
  const a = toTrail(from, scale);
  const b = toTrail(to, scale);
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  const share = amount / Math.sqrt(steps);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    deposit(trails, trailSize, { x: (a.x + (b.x - a.x) * t) / scale, y: (a.y + (b.y - a.y) * t) / scale }, share, width, cap);
  }
}

function diffuse(trails: number[], mix: number) {
  const book = trailBook(trails);
  const size = Math.round(Math.sqrt(trails.length));
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

const RETRACE_OFFSETS = [-0.45, -0.22, 0, 0.22, 0.45];

function retraceHeading(agent: SimAgent, trails: number[], trailSize: number, course: number) {
  const scale = trailSize / FIELD_SIZE;
  let best = 0.02;
  let offset = 0;
  let found = false;
  for (const distance of [0.24, 0.46]) {
    for (const turn of RETRACE_OFFSETS) {
      const lookHeading = course + Math.PI + turn;
      const trail = sampleField(
        trails,
        toTrail({
          x: agent.x + Math.cos(lookHeading) * distance,
          y: agent.y + Math.sin(lookHeading) * distance,
        }, scale),
        trailSize,
      );
      const score = trail * Math.cos(turn);
      if (score <= best) continue;
      best = score;
      offset = turn;
      found = true;
    }
  }
  return found ? wrapAngle(course + offset) : null;
}

function rememberCrumb(book: CrumbBook, index: number, x: number, y: number) {
  const base = index * CRUMB_LIMIT;
  const count = book.count[index];
  if (count > 0) {
    const last = base + count - 1;
    if (Math.hypot(x - book.x[last], y - book.y[last]) < CRUMB_SPACING) return;
  }
  if (count >= CRUMB_LIMIT) {
    book.x.copyWithin(base, base + 1, base + CRUMB_LIMIT);
    book.y.copyWithin(base, base + 1, base + CRUMB_LIMIT);
    book.count[index] = CRUMB_LIMIT - 1;
  }
  const write = base + book.count[index];
  book.x[write] = x;
  book.y[write] = y;
  book.count[index] += 1;
}

function steerCrumbs(agent: SimAgent, book: CrumbBook, index: number) {
  const count = book.count[index];
  if (count < 2) return "idle" as const;
  let cursor = Math.min(book.cursor[index], count - 1);
  const base = index * CRUMB_LIMIT;
  let targetX = book.x[base + cursor];
  let targetY = book.y[base + cursor];
  if (Math.hypot(agent.x - targetX, agent.y - targetY) < 0.28) {
    let turned = false;
    if (book.forward[index]) {
      if (cursor >= count - 1) {
        book.forward[index] = 0;
        turned = true;
      } else cursor += 1;
    } else if (cursor === 0) {
      book.forward[index] = 1;
      turned = true;
    } else cursor -= 1;
    if (turned) book.laps[index] += 1;
    if (book.laps[index] >= 6) return "release" as const;
    book.cursor[index] = cursor;
    targetX = book.x[base + cursor];
    targetY = book.y[base + cursor];
  }
  agent.heading = Math.atan2(targetY - agent.y, targetX - agent.x);
  return "walk" as const;
}

function rememberCourse(shuttle: SiteShuttle, index: number, heading: number, attractor: Point | null) {
  if (shuttle.course) shuttle.course[index] = heading;
  if (attractor && shuttle.caughtX && shuttle.caughtY) {
    shuttle.caughtX[index] = attractor.x;
    shuttle.caughtY[index] = attractor.y;
  }
  if (shuttle.lost) shuttle.lost[index] = 0;
}

function releaseNearHome(agent: SimAgent, shuttle: SiteShuttle, index: number, trails?: number[], trailSize?: number, rng?: () => number) {
  if (shuttle.tune?.crumbs || shuttle.outbound?.[index]) return;
  const home = Math.hypot(agent.x - shuttle.homeX[index], agent.y - shuttle.homeY[index]);
  if (home > shuttle.homeReach) return;
  if (shuttle.tune?.repeat && shuttle.outbound) {
    shuttle.outbound[index] = true;
    agent.heading = wrapAngle(agent.heading + Math.PI);
    rememberCourse(shuttle, index, agent.heading, null);
    return;
  }
  shuttle.returning[index] = false;
  if (shuttle.traffic && rng) cycleDuty(shuttle, index, rng);
  if (shuttle.relay && rng) {
    assignDuty(shuttle, index, trails, trailSize, rng, 0.72);
    aimDuty(agent, shuttle, index);
  }
}

/** Trail sampled outside the attractor pad, so a local mass does not count as a connection. */
function approachTrail(point: Point, trails: number[], trailSize: number) {
  const scale = trailSize / FIELD_SIZE;
  let best = 0;
  for (let step = 0; step < 8; step += 1) {
    const angle = (step / 8) * TWO_PI;
    const sample = sampleField(
      trails,
      { x: (point.x + Math.cos(angle) * 1.8) * scale, y: (point.y + Math.sin(angle) * 1.8) * scale },
      trailSize,
    );
    if (sample > best) best = sample;
  }
  return best;
}

function dutyPoint(shuttle: SiteShuttle, index: number) {
  const book = shuttle.traffic ?? shuttle.relay;
  if (!book || shuttle.attractors.length === 0) return null;
  return shuttle.attractors[book.duty[index] % shuttle.attractors.length] ?? null;
}

function cycleDuty(shuttle: SiteShuttle, index: number, rng: () => number) {
  const book = shuttle.traffic;
  if (!book || shuttle.attractors.length === 0) return;
  const span = shuttle.attractors.length;
  const hop = 1 + Math.floor(rng() * Math.max(1, span - 1));
  book.duty[index] = (book.duty[index] + hop) % span;
}

function activityField(state: SimulationState) {
  const length = state.trailSize * state.trailSize;
  let field = trafficFields.get(state);
  if (!field || field.length !== length) {
    field = new Float32Array(length);
    trafficFields.set(state, field);
  }
  return field;
}

function markActivity(state: SimulationState, x: number, y: number) {
  const field = activityField(state);
  const scale = state.trailSize / FIELD_SIZE;
  const px = clamp(Math.floor(x * scale), 0, state.trailSize - 1);
  const py = clamp(Math.floor(y * scale), 0, state.trailSize - 1);
  field[py * state.trailSize + px] += 1;
}

function fadeActivity(state: SimulationState) {
  const field = activityField(state);
  for (let index = 0; index < field.length; index += 1) {
    if (field[index] === 0) continue;
    const next = field[index] * TRAFFIC_FADE;
    field[index] = next < 0.05 ? 0 : next;
  }
}

/** Extra sensor score for a trail cell other agents have crossed recently. Empty ground gets none. */
function trafficScore(trail: number, activity: number) {
  if (trail < TRAFFIC_TRAIL || activity < TRAFFIC_PASSES) return 0;
  return trail * Math.min(activity, 6) * 0.22;
}

function activityAt(state: SimulationState, look: Point) {
  return sampleField(activityField(state) as unknown as number[], toTrail(look, state.trailSize / FIELD_SIZE), state.trailSize);
}

function assignDuty(
  shuttle: SiteShuttle,
  index: number,
  trails: number[] | undefined,
  trailSize: number | undefined,
  rng: () => number,
  keepBias: number,
) {
  const book = shuttle.relay;
  if (!book || shuttle.attractors.length === 0) return;
  if (!trails || !trailSize) {
    book.duty[index] = index % shuttle.attractors.length;
    return;
  }
  let weakest = 0;
  let weakestTrail = Infinity;
  for (let attractor = 0; attractor < shuttle.attractors.length; attractor += 1) {
    const value = approachTrail(shuttle.attractors[attractor], trails, trailSize);
    if (value < weakestTrail) {
      weakest = attractor;
      weakestTrail = value;
    }
  }
  const current = book.duty[index] % shuttle.attractors.length;
  const currentTrail = approachTrail(shuttle.attractors[current], trails, trailSize);
  if (currentTrail < 0.2 && rng() < keepBias) {
    book.duty[index] = current;
    return;
  }
  book.duty[index] = rng() < 0.22 ? Math.floor(rng() * shuttle.attractors.length) : weakest;
}

function aimDuty(agent: SimAgent, shuttle: SiteShuttle, index: number) {
  const duty = dutyPoint(shuttle, index);
  if (!duty) return;
  agent.heading = Math.atan2(duty.y - agent.y, duty.x - agent.x);
}

/** True when a sample sits in another attractor's pad. The stored trail is not changed. */
function foreignPad(look: Point, shuttle: SiteShuttle | null, duty: Point | null) {
  if (!shuttle?.relay || !duty || shuttle.attractors.length === 0) return false;
  let nearest = shuttle.attractors[0];
  let best = Math.hypot(look.x - nearest.x, look.y - nearest.y);
  for (const mark of shuttle.attractors) {
    const distance = Math.hypot(look.x - mark.x, look.y - mark.y);
    if (distance < best) {
      nearest = mark;
      best = distance;
    }
  }
  if (Math.hypot(nearest.x - duty.x, nearest.y - duty.y) < 0.05) return false;
  return best < 1.2;
}

function nearestPoint(x: number, y: number, points: readonly Point[]) {
  let best = 0;
  let distance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const next = Math.hypot(x - points[index].x, y - points[index].y);
    if (next < distance) {
      best = index;
      distance = next;
    }
  }
  return { index: best, distance };
}

function routeMean(route: SharedRoute, trails: number[], trailSize: number) {
  const scale = trailSize / FIELD_SIZE;
  const samples = Math.min(route.count, 12);
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const at = samples === 1 ? 0 : Math.round((index * (route.count - 1)) / (samples - 1));
    sum += sampleField(trails, toTrail({ x: route.x[at], y: route.y[at] }, scale), trailSize);
  }
  return sum / samples;
}

function routeGap(route: SharedRoute, x: Float32Array, y: Float32Array, count: number) {
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    let nearest = Infinity;
    for (let point = 0; point < route.count; point += 1) {
      nearest = Math.min(nearest, Math.hypot(x[index] - route.x[point], y[index] - route.y[point]));
    }
    sum += nearest;
  }
  return sum / count;
}

function placeOnRoute(book: CollectiveBook, index: number, routeIndex: number, x: number, y: number) {
  const route = book.routes[routeIndex];
  let cursor = 0;
  let nearest = Infinity;
  for (let point = 0; point < route.count; point += 1) {
    const distance = Math.hypot(x - route.x[point], y - route.y[point]);
    if (distance < nearest) {
      nearest = distance;
      cursor = point;
    }
  }
  book.adopted[index] = routeIndex;
  book.cursor[index] = cursor;
  book.forward[index] = cursor < route.count / 2 ? 1 : 0;
}

function registerWalk(
  book: CollectiveBook,
  index: number,
  x: Float32Array,
  y: Float32Array,
  count: number,
  source: number,
  attractor: number,
  trails: number[],
  trailSize: number,
) {
  const pair = book.routes
    .map((route, routeIndex) => ({ route, routeIndex }))
    .filter((item) => item.route.source === source && item.route.attractor === attractor);
  const similar = pair.find((item) => routeGap(item.route, x, y, count) < ROUTE_SIMILAR);
  if (similar) {
    placeOnRoute(book, index, similar.routeIndex, x[count - 1], y[count - 1]);
    return;
  }
  const geometry = { source, attractor, x: x.slice(0, count), y: y.slice(0, count), count };
  if (pair.length < ROUTES_PER_PAIR) {
    book.routes.push(geometry);
    placeOnRoute(book, index, book.routes.length - 1, x[count - 1], y[count - 1]);
    return;
  }
  let weakest = pair[0];
  let weakestTrail = routeMean(weakest.route, trails, trailSize);
  for (const item of pair.slice(1)) {
    const trail = routeMean(item.route, trails, trailSize);
    if (trail < weakestTrail) {
      weakest = item;
      weakestTrail = trail;
    }
  }
  const busy = book.adopted.some((adopted) => adopted === weakest.routeIndex);
  if (!busy && weakestTrail < 0.08) {
    book.routes[weakest.routeIndex] = geometry;
    placeOnRoute(book, index, weakest.routeIndex, x[count - 1], y[count - 1]);
    return;
  }
  let strongest = pair[0];
  let strongestTrail = weakest === pair[0] ? weakestTrail : routeMean(pair[0].route, trails, trailSize);
  for (const item of pair) {
    const trail = item === weakest ? weakestTrail : routeMean(item.route, trails, trailSize);
    if (trail > strongestTrail) {
      strongest = item;
      strongestTrail = trail;
    }
  }
  placeOnRoute(book, index, strongest.routeIndex, x[count - 1], y[count - 1]);
}

function offerDiscoveredWalk(shuttle: SiteShuttle, index: number, trails: number[], trailSize: number) {
  const book = shuttle.collective;
  const crumbs = shuttle.crumbs;
  if (!book || !crumbs || crumbs.count[index] < 4) return false;
  const count = crumbs.count[index];
  const base = index * CRUMB_LIMIT;
  const x = crumbs.x.subarray(base, base + count);
  const y = crumbs.y.subarray(base, base + count);
  const source = nearestPoint(x[0], y[0], book.sources);
  if (source.distance > book.sourceReach) return false;
  const attractor = nearestPoint(x[count - 1], y[count - 1], shuttle.attractors);
  if (attractor.distance > shuttle.reach) return false;
  registerWalk(book, index, x, y, count, source.index, attractor.index, trails, trailSize);
  shuttle.returning[index] = true;
  crumbs.count[index] = 0;
  return true;
}

function maybeJoinRoute(agent: SimAgent, shuttle: SiteShuttle, index: number, trails: number[], trailSize: number, rng: () => number) {
  const book = shuttle.collective;
  if (!book || book.adopted[index] >= 0) return;
  const home = nearestPoint(shuttle.homeX[index], shuttle.homeY[index], book.sources);
  const inside = Math.hypot(agent.x - book.sources[home.index].x, agent.y - book.sources[home.index].y) <= book.sourceReach;
  const arrived = inside && book.atHome[index] === 0;
  book.atHome[index] = inside ? 1 : 0;
  if (!arrived || rng() > 0.55) return;
  const options = book.routes
    .map((route, routeIndex) => ({ route, routeIndex, trail: routeMean(route, trails, trailSize) }))
    .filter((item) => item.route.source === home.index && item.trail >= 0.015);
  if (options.length === 0) return;
  let total = 0;
  for (const option of options) total += option.trail;
  let roll = rng() * total;
  let chosen = options[options.length - 1];
  for (const option of options) {
    roll -= option.trail;
    if (roll <= 0) {
      chosen = option;
      break;
    }
  }
  placeOnRoute(book, index, chosen.routeIndex, agent.x, agent.y);
  shuttle.returning[index] = true;
  if (shuttle.crumbs) shuttle.crumbs.count[index] = 0;
}

function steerShared(agent: SimAgent, book: CollectiveBook, index: number, rng: () => number) {
  const route = book.routes[book.adopted[index]];
  if (!route || route.count < 2) return "release" as const;
  let nearest = Infinity;
  for (let point = 0; point < route.count; point += 1) {
    nearest = Math.min(nearest, Math.hypot(agent.x - route.x[point], agent.y - route.y[point]));
  }
  if (nearest > 0.9) return "release" as const;
  let cursor = Math.min(book.cursor[index], route.count - 1);
  let x = route.x[cursor];
  let y = route.y[cursor];
  if (Math.hypot(agent.x - x, agent.y - y) < ROUTE_CAPTURE) {
    if (book.forward[index]) {
      if (cursor >= route.count - 1) book.forward[index] = 0;
      else cursor += 1;
    } else if (cursor === 0) {
      if (rng() < 0.25) return "release" as const;
      book.forward[index] = 1;
      cursor = Math.min(1, route.count - 1);
    } else cursor -= 1;
    book.cursor[index] = cursor;
    x = route.x[cursor];
    y = route.y[cursor];
  }
  const dx = x - agent.x;
  const dy = y - agent.y;
  if (Math.hypot(dx, dy) > 1e-4) agent.heading = Math.atan2(dy, dx);
  return "walk" as const;
}

function catchReturn(agent: SimAgent, fromX: number, fromY: number, shuttle: SiteShuttle, index: number, trails?: number[], trailSize?: number, rng?: () => number) {
  if (shuttle.collective && shuttle.collective.adopted[index] >= 0) return;
  if (shuttle.returning[index]) {
    if (shuttle.outbound?.[index] && shuttle.caughtX && shuttle.caughtY) {
      const arrived = Math.hypot(agent.x - shuttle.caughtX[index], agent.y - shuttle.caughtY[index]) <= shuttle.reach;
      if (arrived) {
        const dx = fromX - agent.x;
        const dy = fromY - agent.y;
        if (Math.hypot(dx, dy) >= 1e-4) {
          shuttle.outbound[index] = false;
          agent.heading = Math.atan2(dy, dx);
          rememberCourse(shuttle, index, agent.heading, null);
        }
        return;
      }
    }
    releaseNearHome(agent, shuttle, index, trails, trailSize, rng);
    return;
  }
  for (const attractor of shuttle.attractors) {
    if (shuttle.relay || shuttle.traffic) {
      const duty = dutyPoint(shuttle, index);
      if (!duty || Math.hypot(attractor.x - duty.x, attractor.y - duty.y) > 0.05) continue;
    }
    if (Math.hypot(agent.x - attractor.x, agent.y - attractor.y) > shuttle.reach) continue;
    const dx = fromX - agent.x;
    const dy = fromY - agent.y;
    if (Math.hypot(dx, dy) < 1e-4) return;
    if (shuttle.tune?.collective && trails && trailSize && offerDiscoveredWalk(shuttle, index, trails, trailSize)) return;
    if (shuttle.tune?.collective) return;
    shuttle.returning[index] = true;
    if (shuttle.outbound) shuttle.outbound[index] = false;
    agent.heading = Math.atan2(dy, dx);
    rememberCourse(shuttle, index, agent.heading, attractor);
    if (shuttle.crumbs && shuttle.crumbs.count[index] > 1) {
      shuttle.crumbs.cursor[index] = shuttle.crumbs.count[index] - 2;
      shuttle.crumbs.forward[index] = 0;
    }
    return;
  }
}

/**
 * One open-hall step. Pass a shuttle to let agents who have reached an attractor
 * walk back along the trail. Pass null to match the shared engine step.
 */
export function stepSiteNetwork(
  state: SimulationState,
  translation: BiologicalTranslation,
  rng: () => number,
  slime: SlimeControls | undefined,
  shuttle: SiteShuttle | null,
) {
  if (translation.archetypeId !== "open-hall") {
    throw new Error("The site stepper only reproduces the open-hall study.");
  }
  if (state.converged || state.iteration >= state.maxIterations) return state;

  const { params } = translation;
  const sensorAngle = slime?.sensorAngle ?? 0.32 + params.geometryVariation * 0.45;
  const sensorDistance = slime?.sensorDistance ?? 0.45 + params.influenceRadius * 0.035 + params.scaleVariation * 0.25;
  const turnAngle = slime?.turnAngle ?? 0.22 + params.geometryVariation * 0.55;
  const cohesion = clamp(1 - params.nodeSpacing, 0, 1) * (0.38 + params.nodeInteraction * 0.24 + translation.recipe.clustering * 0.16);
  const decayMul = clamp(slime?.decay ?? 0.986, 0.9, 0.998);
  const density = densityFor(state.size);
  for (const agent of state.agents) {
    const ix = clamp(Math.round(agent.x), 0, state.size - 1);
    const iy = clamp(Math.round(agent.y), 0, state.size - 1);
    density[iy * state.size + ix] += 1;
  }

  let trailDelta = 0;
  state.flow.fill(0);
  for (let index = 0; index < state.agents.length; index += 1) {
    const agent = state.agents[index];
    const returning = shuttle?.returning[index] === true;
    const tune = returning ? shuttle?.tune : undefined;
    let sensorDistanceHere = sensorDistance;
    let sensorAngleHere = sensorAngle;
    let turnAngleHere = turnAngle;
    if (tune?.narrow) {
      sensorDistanceHere = Math.min(sensorDistanceHere, 0.3);
      sensorAngleHere = Math.min(sensorAngleHere, 0.16);
      turnAngleHere = Math.min(turnAngleHere, 0.28);
    }
    const locked = Boolean(
      tune?.lock &&
      shuttle?.caughtX &&
      shuttle.caughtY &&
      Math.hypot(agent.x - shuttle.caughtX[index], agent.y - shuttle.caughtY[index]) <= tune.lock,
    );
    const here = { x: agent.x, y: agent.y };
    const holdHeading = slime != null && agent.hold > 0;
    let walkingShared = false;
    if (shuttle?.tune?.collective && shuttle.collective && !holdHeading) {
      if (shuttle.collective.adopted[index] < 0) maybeJoinRoute(agent, shuttle, index, state.trails, state.trailSize, rng);
      if (shuttle.collective.adopted[index] >= 0) {
        const shared = steerShared(agent, shuttle.collective, index, rng);
        if (shared === "release") {
          shuttle.collective.adopted[index] = -1;
          shuttle.returning[index] = false;
          if (shuttle.crumbs) shuttle.crumbs.count[index] = 0;
        } else walkingShared = true;
      }
    }
    if (holdHeading) agent.hold -= 1;
    if (locked && shuttle?.course) agent.heading = shuttle.course[index];
    let walkingCrumbs = false;
    if (tune?.crumbs && shuttle?.crumbs && !holdHeading && !locked) {
      const crumb = steerCrumbs(agent, shuttle.crumbs, index);
      if (crumb === "release") {
        shuttle.returning[index] = false;
        shuttle.crumbs.count[index] = 0;
        shuttle.crumbs.laps[index] = 0;
      } else if (crumb === "walk") walkingCrumbs = true;
    }
    const retracing = Boolean(tune?.retrace && shuttle?.course && !walkingCrumbs && !holdHeading && !locked);
    if (walkingCrumbs) {
      if (slime && rng() < slime.persistence) agent.hold = 1 + Math.floor(slime.persistence * 5);
    } else if (retracing && shuttle?.course) {
      const next = retraceHeading(agent, state.trails, state.trailSize, shuttle.course[index]);
      if (next === null) {
        if (shuttle.lost) shuttle.lost[index] += 1;
      } else {
        agent.heading = next;
        shuttle.course[index] = next;
        if (shuttle.lost) shuttle.lost[index] = 0;
      }
      if (slime && rng() < slime.persistence) agent.hold = 1 + Math.floor(slime.persistence * 5);
      if (shuttle.lost && shuttle.lost[index] >= 8) {
        shuttle.returning[index] = false;
        if (shuttle.outbound) shuttle.outbound[index] = false;
      }
    }
    const duty = !returning && (shuttle?.relay || shuttle?.traffic) ? dutyPoint(shuttle, index) : null;
    let onSharedTrail = false;
    if (!holdHeading && !locked && !retracing && !walkingCrumbs && !walkingShared) {
      const attractionScale = tune?.quiet ? 0 : 1;
      const lookAt = (heading: number) => ({
        x: here.x + Math.cos(heading) * sensorDistanceHere,
        y: here.y + Math.sin(heading) * sensorDistanceHere,
      });
      const weight = (look: Point) => (foreignPad(look, shuttle, duty) ? 0.2 : 1);
      const forwardLook = lookAt(agent.heading);
      const leftLook = lookAt(agent.heading + sensorAngleHere);
      const rightLook = lookAt(agent.heading - sensorAngleHere);
      const forward = sense(here, agent.heading, sensorDistanceHere, state.trails, state.trailSize, translation, state, slime, !returning, weight(forwardLook) === 1 ? attractionScale : 0, duty, weight(forwardLook));
      const left = sense(here, agent.heading + sensorAngleHere, sensorDistanceHere, state.trails, state.trailSize, translation, state, slime, !returning, weight(leftLook) === 1 ? attractionScale : 0, duty, weight(leftLook));
      const right = sense(here, agent.heading - sensorAngleHere, sensorDistanceHere, state.trails, state.trailSize, translation, state, slime, !returning, weight(rightLook) === 1 ? attractionScale : 0, duty, weight(rightLook));
      if (shuttle?.traffic) {
        forward.score += trafficScore(forward.trail, activityAt(state, forwardLook));
        left.score += trafficScore(left.trail, activityAt(state, leftLook));
        right.score += trafficScore(right.trail, activityAt(state, rightLook));
        onSharedTrail = trafficScore(forward.trail, activityAt(state, forwardLook)) > 0;
      }
      const bestTrail = Math.max(forward.trail, left.trail, right.trail);
      if (returning && tune?.repeat && shuttle?.lost) {
        shuttle.lost[index] = bestTrail < 0.02 ? shuttle.lost[index] + 1 : 0;
      }
      const keepForward = Boolean(tune?.preferForward && forward.trail >= 0.02);
      if (!keepForward && left.score > forward.score && left.score > right.score) agent.heading += turnAngleHere;
      else if (!keepForward && right.score > forward.score && right.score > left.score) agent.heading -= turnAngleHere;
      else if (!tune?.steady) agent.heading += (rng() - 0.5) * (0.14 + params.geometryVariation * 1.2 + params.geometricDisplacement * 0.35);
      if (slime && rng() < slime.persistence) agent.hold = 1 + Math.floor(slime.persistence * 5);
      if (returning && tune?.repeat && shuttle?.lost && shuttle.lost[index] >= 8) {
        shuttle.returning[index] = false;
        if (shuttle.outbound) shuttle.outbound[index] = false;
      }
    }
    if (slime && slime.randomness > 0 && !(tune?.steady || tune?.narrow || locked || walkingCrumbs || walkingShared)) {
      agent.heading += (rng() - 0.5) * slime.randomness * Math.PI;
    }

    if (!returning && !walkingShared && cohesion > 0.002) {
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
      if (bx !== 0 || by !== 0) agent.heading = wrapAngle(agent.heading * (1 - cohesion) + Math.atan2(by, bx) * cohesion);
    }

    if (!returning && !walkingShared && !onSharedTrail) {
      const dirPull = params.directionalBias * 0.28;
      if (dirPull > 0.01) {
        const target = duty ?? nearestAttractor(agent, translation);
        const toward = Math.atan2(target.y - agent.y, target.x - agent.x);
        agent.heading = wrapAngle(agent.heading * (1 - dirPull) + toward * dirPull);
      }
      const ix = clamp(Math.round(agent.x), 0, state.size - 1);
      const iy = clamp(Math.round(agent.y), 0, state.size - 1);
      if (slime && density[iy * state.size + ix] > slime.crowdingLimit) {
        agent.heading = wrapAngle(agent.heading + (rng() > 0.5 ? 1 : -1) * (Math.PI / 2));
      }
    }

    const stepBase = slime?.stepSize ?? agent.speed * (0.7 + params.permeability * 0.35);
    const step = stepBase;
    const fromX = agent.x;
    const fromY = agent.y;
    agent.x += Math.cos(agent.heading) * step;
    agent.y += Math.sin(agent.heading) * step;

    const hitWall = agent.x < 0.18 || agent.x > state.size - 0.18 || agent.y < 0.18 || agent.y > state.size - 0.18;
    if (hitWall) {
      const fresh = respawn(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
      if (shuttle?.relay) {
        assignDuty(shuttle, index, state.trails, state.trailSize, rng, 0);
        aimDuty(agent, shuttle, index);
      }
      if (shuttle?.traffic) cycleDuty(shuttle, index, rng);
    }

    const cell = clamp(Math.round(agent.y), 0, state.size - 1) * state.size + clamp(Math.round(agent.x), 0, state.size - 1);
    state.flow[cell] += 1;
    let depositAmount = slime?.deposit ?? (0.05 + params.flowCoupling * 0.1) * agent.trailStrength;
    const edge = Math.min(agent.x, agent.y, state.size - agent.x, state.size - agent.y);
    if (edge < 2.6) depositAmount *= 0.012;
    const width = slime?.depositWidth ?? 1;
    const cap = slime?.trailCap ?? 1.8;
    const traveled = Math.hypot(agent.x - fromX, agent.y - fromY);
    if (!hitWall && traveled <= step * 1.75 + 0.02) {
      depositSegment(state.trails, state.trailSize, { x: fromX, y: fromY }, agent, depositAmount, width, cap);
    } else {
      deposit(state.trails, state.trailSize, agent, depositAmount, width, cap);
    }

    if (rng() < 0.0009) {
      const fresh = respawn(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
      if (shuttle?.relay) {
        assignDuty(shuttle, index, state.trails, state.trailSize, rng, 0);
        aimDuty(agent, shuttle, index);
      }
      if (shuttle?.traffic) cycleDuty(shuttle, index, rng);
    }
    if (shuttle?.traffic && !hitWall) {
      markActivity(state, fromX, fromY);
      markActivity(state, agent.x, agent.y);
    }

    if (shuttle) {
      const jumped = Math.hypot(agent.x - fromX, agent.y - fromY) > 0.8;
      if (jumped) {
        shuttle.returning[index] = false;
        if (shuttle.crumbs) shuttle.crumbs.count[index] = 0;
        if (shuttle.collective) shuttle.collective.adopted[index] = -1;
        if (shuttle.relay) assignDuty(shuttle, index, state.trails, state.trailSize, rng, 0);
        if (shuttle.traffic) cycleDuty(shuttle, index, rng);
      } else {
        const adopted = shuttle.collective?.adopted[index] ?? -1;
        if (shuttle.crumbs && adopted < 0 && !returning && (shuttle.tune?.crumbs || shuttle.tune?.collective)) {
          rememberCrumb(shuttle.crumbs, index, agent.x, agent.y);
        }
        catchReturn(agent, fromX, fromY, shuttle, index, state.trails, state.trailSize, rng);
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
  if ((slime?.diffusion ?? 0) > 0.001) diffuse(state.trails, slime?.diffusion ?? 0);
  if (shuttle?.traffic) fadeActivity(state);

  state.iteration += 1;
  state.totalDelta = trailDelta / Math.max(1, state.agents.length);
  if (state.iteration >= CONVERGENCE_MIN_ITERATIONS && state.totalDelta < CONVERGENCE_EPSILON) state.streak += 1;
  else if (state.iteration >= CONVERGENCE_MIN_ITERATIONS) state.streak = 0;
  state.converged = state.streak >= CONVERGENCE_STREAK || state.iteration >= state.maxIterations;
  return state;
}
