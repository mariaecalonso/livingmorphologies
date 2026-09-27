import { configForArchetype } from "./archetypes";
import { trailPeak } from "./engine";
import type {
  BiologicalTranslation,
  Point,
  SimulationState,
  TopologyKind,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const idx = (x: number, y: number, size: number) => y * size + x;

export type ArchitecturalFields = {
  kind: TopologyKind;
  occupancy: number[];
  voidField: number[];
  massField: number[];
  interiorField: number[];
  trailNorm: number[];
  agentNorm: number[];
};

function normalize(field: number[]) {
  const peak = field.reduce((max, value) => Math.max(max, value), 1e-6);
  return field.map((value) => value / peak);
}

function robustPeak(field: number[]) {
  const values = field.filter((value) => value > 0.0001).sort((a, b) => a - b);
  if (!values.length) return 0.04;
  return Math.max(0.04, values[Math.floor(values.length * 0.72)] * 1.05);
}

function agentDensity(state: SimulationState) {
  const field = new Array<number>(state.size * state.size).fill(0);
  for (const agent of state.agents) {
    const x = clamp(Math.round(agent.x), 0, state.size - 1);
    const y = clamp(Math.round(agent.y), 0, state.size - 1);
    field[idx(x, y, state.size)] += 1;
  }
  return normalize(field);
}

function smooth(field: number[], size: number, amount: number) {
  const next = field.slice();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = field[idx(x, y, size)];
      let count = 1;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        sum += field[idx(nx, ny, size)];
        count += 1;
      }
      const i = idx(x, y, size);
      next[i] = field[i] * (1 - amount) + (sum / count) * amount;
    }
  }
  return next;
}

/**
 * Distance from the attractor, warped by the network so the core is not a circle.
 * Around-absence must not stretch the void toward the source — that is the corridor.
 */
function warpedDistance(
  cell: Point,
  state: SimulationState,
  trail: number,
  permeability: number,
  translation: BiologicalTranslation,
) {
  const dx = cell.x - state.attractor.x;
  const dy = cell.y - state.attractor.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const { params } = translation;
  const around = configForArchetype(translation.archetypeId).topology === "around-absence";
  const stretch = around
    ? 1 + Math.cos(angle * 2.4 + trail * 5.2) * (0.07 + params.geometryVariation * 0.12)
    : 1 +
      Math.cos(
        angle -
          Math.atan2(state.source.y - state.attractor.y, state.source.x - state.attractor.x),
      ) *
        (0.1 + params.flowCoupling * 0.2);
  const trailWarp = 1 - trail * (around ? 0.1 : 0.16 + params.geometryVariation * 0.22);
  const permWarp = 0.86 + permeability * 0.28;
  return dist * stretch * trailWarp * permWarp;
}

function falloff(distance: number, radius: number) {
  const sigma = Math.max(0.8, radius);
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function aroundAbsence(
  state: SimulationState,
  translation: BiologicalTranslation,
  trailNorm: number[],
  agentNorm: number[],
  _attractionNorm: number[],
  permeabilityNorm: number[],
) {
  const { recipe, params } = translation;
  const size = state.size;
  const core =
    recipe.isolationRadius *
    (0.62 + params.scaleVariation * 0.14) *
    (0.82 + recipe.coreExposure * 0.14);
  const tissue = smooth(trailNorm, size, 0.18);
  const voidRaw = new Array<number>(size * size).fill(0);
  const massRaw = new Array<number>(size * size).fill(0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = idx(x, y, size);
      const vein = tissue[i] * 0.55 + trailNorm[i] * 0.45 + agentNorm[i] * 0.04;
      const dist = warpedDistance({ x, y }, state, trailNorm[i], permeabilityNorm[i], translation);
      const kernel = falloff(dist, core);
      const coreVoid = clamp(kernel * (0.96 + recipe.coreExposure * 0.08), 0, 1);
      let mass = vein * (1 - coreVoid);
      if (coreVoid > 0.46) mass = 0;
      if (vein < 0.22) mass *= 0.12;
      mass = clamp(mass, 0, 1);
      const voidStrength = clamp(Math.max(coreVoid, (1 - mass) * 0.7), 0, 1);
      voidRaw[i] = mass > 0.24 ? Math.min(voidStrength, 0.2) : voidStrength;
      massRaw[i] = mass;
    }
  }

  return {
    voidField: smooth(voidRaw, size, 0.28),
    massField: smooth(massRaw, size, 0.32),
    interiorField: new Array<number>(size * size).fill(0),
  };
}

function containedInterior(
  state: SimulationState,
  translation: BiologicalTranslation,
  trailNorm: number[],
  agentNorm: number[],
  attractionNorm: number[],
  permeabilityNorm: number[],
) {
  const { recipe, params } = translation;
  const size = state.size;
  const core =
    recipe.isolationRadius * (0.78 + params.scaleVariation * 0.18 + recipe.clustering * 0.12);
  const volume =
    recipe.enclosureCollar * (0.72 + recipe.clustering * 0.18) + recipe.isolationRadius * 0.55;
  const interiorRaw = new Array<number>(size * size).fill(0);
  const massRaw = new Array<number>(size * size).fill(0);
  const voidRaw = new Array<number>(size * size).fill(0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = idx(x, y, size);
      const trail = trailNorm[i];
      const dist = warpedDistance({ x, y }, state, trail, permeabilityNorm[i], translation);
      const kernel = falloff(dist, core);
      const volumeKernel = falloff(dist, volume);
      let interior =
        kernel * (0.72 + trail * 0.28 + agentNorm[i] * 0.18) +
        attractionNorm[i] * kernel * 0.32;
      interior *= 1.12 - recipe.coreExposure * 0.35;
      if (kernel > 0.5 && attractionNorm[i] > 0.42) {
        interior = Math.max(interior, 0.56 + trail * 0.14);
      }
      interior = clamp(interior, 0, 1);
      const collar = falloff(Math.abs(dist - core * 1.15), 0.85);
      const outer =
        (1 - interior * 0.85) *
        (0.14 +
          volumeKernel * 0.52 +
          trail * 0.36 +
          (1 - dist / 18) * 0.12 * recipe.clustering +
          (1 - permeabilityNorm[i]) * 0.05);
      const mass = clamp(outer + collar * 0.16, 0, 1);
      interiorRaw[i] = interior;
      massRaw[i] = interior > 0.5 ? mass * 0.18 : mass;
      voidRaw[i] = clamp(1 - mass - interior * 0.6, 0, 1);
    }
  }

  return {
    voidField: smooth(voidRaw, size, 0.32),
    massField: smooth(massRaw, size, 0.4),
    interiorField: smooth(interiorRaw, size, 0.3),
  };
}

function openNetwork(
  state: SimulationState,
  _translation: BiologicalTranslation,
  trailNorm: number[],
  agentNorm: number[],
  _attractionNorm: number[],
  _permeabilityNorm: number[],
) {
  const size = state.size;
  const tissue = smooth(trailNorm, size, 0.22);
  const massRaw = new Array<number>(size * size).fill(0);
  const voidRaw = new Array<number>(size * size).fill(0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = idx(x, y, size);
      const vein = tissue[i] * 0.58 + trailNorm[i] * 0.42 + agentNorm[i] * 0.08;
      const mass = clamp(vein, 0, 1);
      massRaw[i] = mass;
      voidRaw[i] = clamp(1 - mass, 0, 1);
    }
  }

  return {
    voidField: smooth(voidRaw, size, 0.28),
    massField: smooth(massRaw, size, 0.3),
    interiorField: new Array<number>(size * size).fill(0),
  };
}

/**
 * Occupancy field: likelihood a cell becomes architectural mass.
 * Trails inform organization; they do not become walls directly.
 */
export function buildArchitecturalFields(
  state: SimulationState,
  translation: BiologicalTranslation,
): ArchitecturalFields {
  const kind = configForArchetype(translation.archetypeId).topology;
  const trailPeakValue =
    kind === "around-absence" ? robustPeak(state.occupancy) : Math.max(trailPeak(state), 0.04);
  const trailNorm = state.occupancy.map((value) =>
    clamp(Math.sqrt(Math.max(0, value / trailPeakValue)), 0, 1.2),
  );
  const agentNorm = agentDensity(state);
  const attractionNorm = normalize(state.attraction);
  const permeabilityNorm = normalize(state.permeabilityField);
  const fields =
    kind === "contained-interior"
      ? containedInterior(
          state,
          translation,
          trailNorm,
          agentNorm,
          attractionNorm,
          permeabilityNorm,
        )
      : kind === "around-absence"
        ? aroundAbsence(
            state,
            translation,
            trailNorm,
            agentNorm,
            attractionNorm,
            permeabilityNorm,
          )
        : openNetwork(
            state,
            translation,
            trailNorm,
            agentNorm,
            attractionNorm,
            permeabilityNorm,
          );

  const occupancy = fields.massField.map((mass, index) => {
    if (kind === "contained-interior") {
      return clamp(mass + fields.interiorField[index] * 0.35, 0, 1);
    }
    return mass;
  });

  return {
    kind,
    occupancy,
    voidField: fields.voidField,
    massField: fields.massField,
    interiorField: fields.interiorField,
    trailNorm,
    agentNorm,
  };
}
