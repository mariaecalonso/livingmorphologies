import { mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE, TRAIL_SCALE } from "../skill1/maps";
import { agentCountFromDensity, densityFromTranslation, slimeControlsFromTranslation } from "../skill1/slime-controls";
import { translateArchetype } from "../skill1/translate";
import { evaluateMorphology } from "./evaluate";
import { applyGenome, type Genome } from "./genome";
import { measureMorphologyDetailed } from "./measurements";
import type { Objectives } from "./nsga";
import { searchObjectives } from "./search-objectives";

/** Every candidate in every generation is simulated with this seed. Not a gene. */
export const EVALUATION_SEED = 1;

/** Stored preview side length. One byte per pixel of the standard 1280 trail field. */
export const PREVIEW_SIZE = FIELD_SIZE * TRAIL_SCALE;

const TRAIL_DECAY = 0.986;

export type GenomeEvaluation = {
  evaluationSeed: number;
  trailSize: number;
  iteration: number;
  feasible: boolean;
  objectives: Objectives;
  /** Included search criteria only. */
  criterionMatch: Record<string, number>;
  /** All nine criteria. */
  observed: Record<string, number>;
  /**
   * PREVIEW_SIZE² bytes, row-major. Trail intensity relative to the evaluator's
   * occupancy reference (p99 of interior trail), clamped to 1 and scaled to 255.
   */
  preview: Uint8Array;
};

function previewFromTrails(trails: readonly number[], trailSize: number, reference: number): Uint8Array {
  const factor = Math.max(1, Math.round(trailSize / PREVIEW_SIZE));
  const out = new Uint8Array(PREVIEW_SIZE * PREVIEW_SIZE);
  const scale = reference > 0 ? 1 / reference : 0;
  for (let y = 0; y < PREVIEW_SIZE; y += 1) {
    for (let x = 0; x < PREVIEW_SIZE; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const ty = y * factor + dy;
        if (ty >= trailSize) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const tx = x * factor + dx;
          if (tx >= trailSize) break;
          sum += trails[ty * trailSize + tx];
          count += 1;
        }
      }
      const value = count ? (sum / count) * scale : 0;
      out[y * PREVIEW_SIZE + x] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
  return out;
}

/**
 * Canonical audit protocol on the posed translation: translated SlimeControls
 * with the food point at the posed attractor, density-derived agent count,
 * standard trail scale, DISPLAY_ITERATIONS, trail decay 0.986, fixed seed.
 */
export function evaluateGenome(archetypeId: string, genome: Genome): GenomeEvaluation {
  return evaluateGenomeAtTrailScale(archetypeId, genome, TRAIL_SCALE);
}

/** The simulated realization of a genome, before scoring. Shared by evaluation and the Skill 3 handoff replay. */
export function simulateGenome(archetypeId: string, genome: Genome, trailScale: number = TRAIL_SCALE) {
  const base = translateArchetype(archetypeId);
  const placed = applyGenome(base, genome);
  const slime = { ...slimeControlsFromTranslation(base), foodPoints: [{ ...placed.recipe.attractor }] };
  const agentCount = agentCountFromDensity(densityFromTranslation(base));
  const state = createSimulation(placed, EVALUATION_SEED, agentCount, trailScale);
  state.maxIterations = DISPLAY_ITERATIONS;
  stepMany(state, placed, mulberry32(EVALUATION_SEED ^ 0x9e3779b9), DISPLAY_ITERATIONS, TRAIL_DECAY, slime, false);
  const detailed = measureMorphologyDetailed(state);
  const evaluation = evaluateMorphology({ typologyId: base.typologyId, archetypeId, measurements: detailed.measurements });
  const simulation = { seed: EVALUATION_SEED, agentCount, maxIterations: DISPLAY_ITERATIONS, trailDecay: TRAIL_DECAY };
  return { base, placed, slime, simulation, state, detailed, evaluation };
}

/** Same protocol at another trail resolution. For resolution validation and screening only. */
export function evaluateGenomeAtTrailScale(archetypeId: string, genome: Genome, trailScale: number): GenomeEvaluation {
  const { state, detailed, evaluation } = simulateGenome(archetypeId, genome, trailScale);
  const objectives = searchObjectives(evaluation.criteria);
  const criterionMatch: Record<string, number> = {};
  for (const item of objectives.criteria) if (item.included) criterionMatch[item.criterionId] = item.criterionMatch;
  const observed: Record<string, number> = {};
  for (const item of evaluation.criteria) observed[item.criterionId] = item.observedCondition;
  return {
    evaluationSeed: state.seed,
    trailSize: state.trailSize,
    iteration: state.iteration,
    feasible: evaluation.feasible,
    objectives: {
      formal: objectives.formalMatch,
      spatial: objectives.spatialMatch,
      atmospheric: objectives.atmosphericMatch,
    },
    criterionMatch,
    observed,
    preview: previewFromTrails(state.trails, state.trailSize, detailed.summary.occupancyReference),
  };
}
