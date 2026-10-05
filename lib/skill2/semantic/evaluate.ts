import { mulberry32 } from "../../physarum";
import { createSimulation, stepMany } from "../../skill1/engine";
import { realizeLobbyPlan, lobbySimulationSlime } from "../../skill1/lobby-realization";
import { DISPLAY_ITERATIONS, FIELD_SIZE, TRAIL_SCALE } from "../../skill1/maps";
import { slimeControlsFromTranslation } from "../../skill1/slime-controls";
import { translateArchetype } from "../../skill1/translate";
import { EVALUATION_SEED } from "../evolution-evaluate";
import { morphologyValid } from "../evaluate";
import { evaluateMorphology } from "../evaluate";
import { measureMorphologyDetailed } from "../measurements";
import { searchObjectives } from "../search-objectives";
import { lobbyState } from "./lobby-adapter";
import type { PhenotypeRecord, RealizationState, SemanticPlan } from "./types";

const TRAIL_DECAY = 0.986;

/** Inspection drawing. The 20×20 occupancy grid stays the raw fingerprint source. */
export const INSPECTION_PREVIEW_SIZE = 160;

export type SemanticEvaluation = {
  evaluationSeed: number;
  technicalValid: boolean;
  failureReason: string | null;
  objectives: { formal: number; spatial: number; atmospheric: number };
  criterionMatch: Record<string, number>;
  observed: Record<string, number>;
  criterionCategory: Record<string, "formal" | "spatial" | "atmospheric">;
  phenotype: PhenotypeRecord;
  preview: Uint8Array | null;
  previewSize: number;
};

/**
 * Lobby evaluation. Realization comes from the stored plan and salt.
 * The simulation seed stays the fixed evaluation seed and is not the salt.
 */
export function evaluateLobbyCandidate(plan: SemanticPlan, state: RealizationState): SemanticEvaluation {
  const base = translateArchetype(plan.archetypeId);
  const slimeBase = slimeControlsFromTranslation(base);
  const realized = realizeLobbyPlan(base, slimeBase, plan.body as never, lobbyState(state));
  if (!realized.ok) return failed(realized.reasons.join(","));
  const slime = lobbySimulationSlime(plan.archetypeId, realized.simulationSlime);
  const simulation = createSimulation(realized.translation, EVALUATION_SEED, realized.agents, TRAIL_SCALE);
  simulation.maxIterations = DISPLAY_ITERATIONS;
  stepMany(
    simulation,
    realized.translation,
    mulberry32(EVALUATION_SEED ^ 0x9e3779b9),
    DISPLAY_ITERATIONS,
    TRAIL_DECAY,
    slime,
    false,
  );
  const detailed = measureMorphologyDetailed(simulation);
  const evaluation = evaluateMorphology({
    typologyId: base.typologyId,
    archetypeId: plan.archetypeId,
    measurements: detailed.measurements,
  });
  const objectives = searchObjectives(evaluation.criteria);
  const criterionMatch: Record<string, number> = {};
  const criterionCategory: Record<string, "formal" | "spatial" | "atmospheric"> = {};
  for (const item of objectives.criteria) {
    criterionMatch[item.criterionId] = item.criterionMatch;
    if (item.category === "formal" || item.category === "spatial" || item.category === "atmospheric") {
      criterionCategory[item.criterionId] = item.category;
    }
  }
  const observed: Record<string, number> = {};
  for (const item of evaluation.criteria) observed[item.criterionId] = item.observedCondition;
  const technicalValid = evaluation.feasible && morphologyValid(detailed.measurements);
  return {
    evaluationSeed: EVALUATION_SEED,
    technicalValid,
    failureReason: technicalValid ? null : "technical-invalid",
    objectives: {
      formal: objectives.formalMatch,
      spatial: objectives.spatialMatch,
      atmospheric: objectives.atmosphericMatch,
    },
    criterionMatch,
    observed,
    criterionCategory,
    phenotype: {
      raw: { measurements: detailed.measurements, summary: detailed.summary },
      occupancy: occupancyGrid(simulation.trails, simulation.trailSize, FIELD_SIZE),
    },
    preview: inspectionPreview(simulation.trails, simulation.trailSize, detailed.summary.occupancyReference),
    previewSize: INSPECTION_PREVIEW_SIZE,
  };
}

/** Mean trail in each cell of the shared field. Values stay in trail units. */
export function occupancyGrid(trails: readonly number[], trailSize: number, cells: number) {
  const out = new Array<number>(cells * cells).fill(0);
  const factor = trailSize / cells;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      let sum = 0;
      let count = 0;
      const y0 = Math.floor(y * factor);
      const y1 = Math.floor((y + 1) * factor);
      const x0 = Math.floor(x * factor);
      const x1 = Math.floor((x + 1) * factor);
      for (let ty = y0; ty < y1; ty += 1) {
        for (let tx = x0; tx < x1; tx += 1) {
          sum += trails[ty * trailSize + tx] ?? 0;
          count += 1;
        }
      }
      out[y * cells + x] = count ? sum / count : 0;
    }
  }
  return out;
}

function failed(reason: string): SemanticEvaluation {
  return {
    evaluationSeed: EVALUATION_SEED,
    technicalValid: false,
    failureReason: reason,
    objectives: { formal: 0, spatial: 0, atmospheric: 0 },
    criterionMatch: {},
    observed: {},
    criterionCategory: {},
    phenotype: { raw: null, occupancy: null },
    preview: null,
    previewSize: 0,
  };
}

/** Display-scaled drawing. Raw occupancy is stored separately and is not resized to each morphology. */
export function inspectionPreview(trails: readonly number[], trailSize: number, reference: number) {
  const size = INSPECTION_PREVIEW_SIZE;
  const factor = Math.max(1, Math.round(trailSize / size));
  const out = new Uint8Array(size * size);
  const scale = reference > 0 ? 1 / reference : 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const ty = y * factor + dy;
        if (ty >= trailSize) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const tx = x * factor + dx;
          if (tx >= trailSize) break;
          sum += trails[ty * trailSize + tx] ?? 0;
          count += 1;
        }
      }
      const value = count ? (sum / count) * scale : 0;
      out[y * size + x] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
  return out;
}
