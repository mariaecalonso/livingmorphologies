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
import type {
  BiologicalTranslation,
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

const topologyOf = (translation: BiologicalTranslation) =>
  configForArchetype(translation.archetypeId).topology;

const aroundAbsence = (translation: BiologicalTranslation) =>
  topologyOf(translation) === "around-absence";

const containedInterior = (translation: BiologicalTranslation) =>
  topologyOf(translation) === "contained-interior";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function buildAttractionField(
  size: number,
  attractor: Point,
  translation: BiologicalTranslation,
) {
  const { attractionStrength, influenceRadius, scaleVariation } = translation.params;
  const field = new Array<number>(size * size).fill(0);
  if (aroundAbsence(translation)) {
    const ringR = translation.recipe.isolationRadius * (0.7 + scaleVariation * 0.12);
    const sigma = Math.max(1.05, influenceRadius * 0.16);
    const twoSigma = 2 * sigma * sigma;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - attractor.x, y - attractor.y);
        const angle = Math.atan2(y - attractor.y, x - attractor.x);
        const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
        const r = ringR * wobble;
        field[fieldIndex(x, y, size)] =
          attractionStrength * Math.exp(-((d - r) * (d - r)) / twoSigma);
      }
    }
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

function buildPermeabilityField(
  size: number,
  _source: Point,
  _attractor: Point,
  translation: BiologicalTranslation,
) {
  return new Array<number>(size * size).fill(translation.params.permeability);
}

function toTrail(point: Point, scale: number) {
  return { x: point.x * scale, y: point.y * scale };
}

function sense(
  fieldPoint: Point,
  heading: number,
  distance: number,
  trails: number[],
  trailSize: number,
  translation: BiologicalTranslation,
  state: SimulationState,
) {
  const look = {
    x: fieldPoint.x + Math.cos(heading) * distance,
    y: fieldPoint.y + Math.sin(heading) * distance,
  };
  const trailPos = toTrail(look, TRAIL_SCALE);
  const trail = sampleField(trails, trailPos, trailSize);
  const attraction = sampleField(state.attraction, look, state.size);
  const toAttractor = {
    x: state.attractor.x - look.x,
    y: state.attractor.y - look.y,
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
    const keep = translation.recipe.isolationRadius * (0.28 + 0.24 * opening);
    if (core < keep) {
      return trail * 0.08 - 0.95 - (keep - core) * 0.18;
    }
  }
  return trail * trailFollow + attraction * pull + params.permeability * 0.03 + alignment * params.directionalBias;
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
  };
}

function deposit(
  trails: number[],
  trailSize: number,
  point: Point,
  amount: number,
) {
  const pos = toTrail(point, TRAIL_SCALE);
  const x0 = Math.floor(pos.x);
  const y0 = Math.floor(pos.y);
  for (let oy = 0; oy <= 1; oy += 1) {
    for (let ox = 0; ox <= 1; ox += 1) {
      const x = x0 + ox;
      const y = y0 + oy;
      if (x < 0 || y < 0 || x >= trailSize || y >= trailSize) continue;
      const w = (1 - Math.abs(pos.x - x)) * (1 - Math.abs(pos.y - y));
      const index = y * trailSize + x;
      trails[index] = Math.min(1.8, trails[index] + amount * Math.max(0, w));
    }
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
): SimulationState {
  const size = FIELD_SIZE;
  const trailSize = size * TRAIL_SCALE;
  const rng = mulberry32(seed);
  const source = sourceFromCorner(translation.recipe.sourceCorner, size);
  const attractor = attractorFromRatings(translation, size);
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
): SimulationState {
  if (state.converged || state.iteration >= state.maxIterations) return state;

  const { params } = translation;
  const sensorAngle = 0.32 + params.geometryVariation * 0.45;
  const sensorDistance = 0.45 + params.influenceRadius * 0.035 + params.scaleVariation * 0.25;
  const turnAngle = 0.22 + params.geometryVariation * 0.55;
  const cohesionMul = aroundAbsence(translation)
    ? 0.48
    : containedInterior(translation)
      ? 0.74
      : 0.38 + params.nodeInteraction * 0.24 + translation.recipe.clustering * 0.16;
  const cohesion = clamp(1 - params.nodeSpacing, 0, 1) * cohesionMul;
  const decayMul = clamp(trailDecay, 0.96, 0.998);

  const density = new Array<number>(state.size * state.size).fill(0);
  for (const agent of state.agents) {
    const ix = clamp(Math.round(agent.x), 0, state.size - 1);
    const iy = clamp(Math.round(agent.y), 0, state.size - 1);
    density[iy * state.size + ix] += 1;
  }

  let trailDelta = 0;
  state.flow.fill(0);

  for (const agent of state.agents) {
    const here = { x: agent.x, y: agent.y };
    const forward = sense(here, agent.heading, sensorDistance, state.trails, state.trailSize, translation, state);
    const left = sense(here, agent.heading + sensorAngle, sensorDistance, state.trails, state.trailSize, translation, state);
    const right = sense(here, agent.heading - sensorAngle, sensorDistance, state.trails, state.trailSize, translation, state);

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
      const toward = Math.atan2(state.attractor.y - agent.y, state.attractor.x - agent.x);
      agent.heading = wrapAngle(agent.heading * (1 - dirPull) + toward * dirPull);
    }

    const step = agent.speed * (0.7 + params.permeability * 0.35);
    agent.x += Math.cos(agent.heading) * step;
    agent.y += Math.sin(agent.heading) * step;

    if (aroundAbsence(translation)) {
      const coreDist = dist(agent, state.attractor);
      const angle = Math.atan2(agent.y - state.attractor.y, agent.x - state.attractor.x) || rng() * TWO_PI;
      const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
      const opening = 0.5 + 0.5 * Math.cos(angle * 2.05 + 0.4);
      const keepOut = translation.recipe.isolationRadius * 0.48 * wobble * (0.42 + 0.58 * opening);
      if (coreDist < keepOut) {
        const radius = keepOut + 0.12;
        agent.x = clamp(state.attractor.x + Math.cos(angle) * radius, 0.18, state.size - 0.18);
        agent.y = clamp(state.attractor.y + Math.sin(angle) * radius, 0.18, state.size - 0.18);
        agent.heading = wrapAngle(angle + (rng() - 0.5) * 0.5);
      }
    }

    const hitWall =
      agent.x < 0.18 || agent.x > state.size - 0.18 || agent.y < 0.18 || agent.y > state.size - 0.18;
    if (hitWall) {
      const fresh = spawnAgent(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
      agent.pathX = [fresh.x];
      agent.pathY = [fresh.y];
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
    let depositAmount = (0.05 + params.flowCoupling * 0.1) * agent.trailStrength;
    const edge = Math.min(agent.x, agent.y, state.size - agent.x, state.size - agent.y);
    if (edge < 2.6) depositAmount *= 0.012;
    if (
      aroundAbsence(translation) &&
      dist(agent, state.attractor) < translation.recipe.isolationRadius * 0.55
    ) {
      depositAmount *= 0.05;
    }
    deposit(state.trails, state.trailSize, agent, depositAmount);

    if (
      rng() <
      (aroundAbsence(translation) ? 0.0004 : containedInterior(translation) ? 0.0015 : 0.0009)
    ) {
      const fresh = spawnAgent(state.source, state.attractor, translation, rng);
      agent.x = fresh.x;
      agent.y = fresh.y;
      agent.heading = fresh.heading;
      agent.pathX = [fresh.x];
      agent.pathY = [fresh.y];
    } else {
      agent.pathX.push(agent.x);
      agent.pathY.push(agent.y);
      if (agent.pathX.length > PATH_LENGTH) {
        agent.pathX.shift();
        agent.pathY.shift();
      }
    }
  }

  for (let i = 0; i < state.trails.length; i += 1) {
    const faded = state.trails[i] * decayMul;
    trailDelta += Math.abs(state.trails[i] - faded);
    state.trails[i] = faded > 0.003 ? faded : 0;
  }

  const leak = 0.03 + params.networkDensity * 0.12;
  const pack = clamp(1 - params.nodeSpacing, 0, 1);
  if (params.networkDensity > 0.35 || pack > 0.55) {
    const mix = params.networkDensity > 0.35 ? leak : 0.018 + pack * 0.025;
    const copy = state.trails.slice();
    for (let y = 1; y < state.trailSize - 1; y += 1) {
      for (let x = 1; x < state.trailSize - 1; x += 1) {
        const i = y * state.trailSize + x;
        const avg =
          (copy[i - 1] + copy[i + 1] + copy[i - state.trailSize] + copy[i + state.trailSize]) * 0.25;
        state.trails[i] = copy[i] * (1 - mix) + avg * mix;
      }
    }
  }

  state.occupancy = downsampleOccupancy(state.trails, state.trailSize, state.size);
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
) {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    if (next.converged) break;
    next = stepSimulation(next, translation, rng, trailDecay);
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

export function captureSnapshot(state: SimulationState): FieldSnapshot {
  return {
    iteration: state.iteration,
    size: state.size,
    trailSize: state.trailSize,
    trails: state.trails.slice(),
    occupancy: state.occupancy.slice(),
    agents: state.agents.map((agent) => ({ x: agent.x, y: agent.y })),
    paths: state.agents.map((agent) => ({
      x: agent.pathX.slice(),
      y: agent.pathY.slice(),
    })),
    source: { ...state.source },
    attractor: { ...state.attractor },
  };
}
