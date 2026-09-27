import { mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import { DEFAULT_AGENT_COUNT } from "../skill1/maps";
import { translateArchetype } from "../skill1/translate";
import type { BiologicalTranslation, Point, SimulationState } from "../skill1/types";

export const SCAN_SLICES = 24;
export const STEPS_BETWEEN_SLICES = 22;

export type ScanSlice = {
  index: number;
  iteration: number;
  trails: Float32Array;
  trailSize: number;
  peak: number;
  source: Point;
  attractor: Point;
};

export type ScanRun = {
  translation: BiologicalTranslation;
  state: SimulationState;
  rng: () => number;
};

export function startScan(archetypeId: string, seed: number): ScanRun {
  const translation = translateArchetype(archetypeId);
  return {
    translation,
    state: createSimulation(translation, seed, DEFAULT_AGENT_COUNT),
    rng: mulberry32(seed ^ 0x9e3779b9),
  };
}

export function takeSlice(state: SimulationState, index: number): ScanSlice {
  const trails = new Float32Array(state.trails.length);
  let peak = 0.0001;
  for (let i = 0; i < state.trails.length; i += 1) {
    const value = state.trails[i];
    trails[i] = value;
    if (value > peak) peak = value;
  }
  return {
    index,
    iteration: state.iteration,
    trails,
    trailSize: state.trailSize,
    peak,
    source: { ...state.source },
    attractor: { ...state.attractor },
  };
}

export function advanceScan(run: ScanRun) {
  run.state = stepMany(
    run.state,
    run.translation,
    run.rng,
    STEPS_BETWEEN_SLICES,
  );
  return run.state;
}

export function sampleSlice(slice: ScanSlice, xNorm: number, yNorm: number) {
  const size = slice.trailSize;
  const x = Math.min(size - 1, Math.max(0, xNorm * (size - 1)));
  const y = Math.min(size - 1, Math.max(0, yNorm * (size - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (px: number, py: number) => slice.trails[py * size + px] / slice.peak;
  return (
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x1, y0) * tx * (1 - ty) +
    at(x0, y1) * (1 - tx) * ty +
    at(x1, y1) * tx * ty
  );
}
