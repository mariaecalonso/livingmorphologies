import { mulberry32 } from "../../physarum";
import { createSimulation, stepMany } from "../../skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE, TRAIL_SCALE } from "../../skill1/maps";
import { EVALUATION_SEED } from "../evolution-evaluate";
import { morphologyValid } from "../evaluate";
import { evaluateMorphology } from "../evaluate";
import { measureMorphologyDetailed } from "../measurements";
import { searchObjectives } from "../search-objectives";
import type { SearchRealization } from "./adapter";
import { createSearchAdapter } from "./registry";
import { trailsForPreview } from "../preview-ink";
import type { PhenotypeRecord, RealizationState, SemanticPlan } from "./types";
import { HAIR_DECAY } from "../../skill1/hair-ink";
import { captureZ0, type Z0Capture } from "./z0-snapshot";

const TRAIL_DECAY = HAIR_DECAY;

/** Inspection drawing at the trail grid. Raw occupancy stays the 20×20 fingerprint. */
export const INSPECTION_PREVIEW_SIZE = FIELD_SIZE * TRAIL_SCALE;

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
  /** Present only until the archive snapshot is written. Not stored on the candidate. */
  z0?: Z0Capture;
};

/**
 * Scores any archetype whose adapter can realize a stored plan.
 * The simulation seed stays the fixed evaluation seed and is not the salt.
 */
export function evaluateSearchCandidate(
  plan: SemanticPlan,
  state: RealizationState,
  options?: { preview?: boolean },
): SemanticEvaluation {
  const adapter = createSearchAdapter(plan.archetypeId);
  if (!adapter.realize) return failed(`${plan.archetypeId} has no realization`);
  const realized = adapter.realize(plan, state);
  if (!realized.ok) return failed(realized.reasons.join(","));
  return scoreRealization(plan.archetypeId, realized, options?.preview !== false);
}

/** Lobby entry. Same scorer as every other typology. */
export function evaluateLobbyCandidate(plan: SemanticPlan, state: RealizationState): SemanticEvaluation {
  return evaluateSearchCandidate(plan, state);
}

function scoreRealization(
  archetypeId: string,
  realized: Extract<SearchRealization, { ok: true }>,
  preview = true,
): SemanticEvaluation {
  const simulation = createSimulation(realized.translation, EVALUATION_SEED, realized.agents, TRAIL_SCALE);
  simulation.maxIterations = DISPLAY_ITERATIONS;
  stepMany(
    simulation,
    realized.translation,
    mulberry32(EVALUATION_SEED ^ 0x9e3779b9),
    DISPLAY_ITERATIONS,
    TRAIL_DECAY,
    realized.slime,
    false,
  );
  const z0 = captureZ0(simulation, {
    translation: realized.translation,
    slime: realized.slime,
    trailDecay: TRAIL_DECAY,
  });
  const detailed = measureMorphologyDetailed(simulation);
  const evaluation = evaluateMorphology({
    typologyId: realized.translation.typologyId,
    archetypeId,
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
    preview: preview
      ? inspectionPreview(
          trailsForPreview(simulation.trails, simulation.displayTrails),
          simulation.trailSize,
          detailed.summary.occupancyReference,
        )
      : null,
    previewSize: preview ? INSPECTION_PREVIEW_SIZE : 0,
    z0,
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

/** Untoned plate. Filament refinement is applied later, from the archetype calibration. */
export function inspectionPreview(trails: ArrayLike<number>, trailSize: number, reference: number) {
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
