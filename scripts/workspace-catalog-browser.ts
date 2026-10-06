/**
 * Browser-side publisher for the three workspace catalogs.
 * Bundled and driven by scripts/publish-workspace-catalog.mjs.
 * Realizations match the run grid: one attempt, the dedicated planner, full step count.
 */
import { mulberry32 } from "../lib/physarum";
import { createSimulation, stepMany, captureSnapshot } from "../lib/skill1/engine";
import { lobbySimulationSlime } from "../lib/skill1/lobby-realization";
import { FLAT_DEEP_RUN_ITERATIONS, FLAT_DEEP_TRAIL_SCALE } from "../lib/skill1/run-flat-deep-plan";
import {
  agentsFromOpenHall,
  attractorsFromOpenHall,
  paramsFromOpenHall,
  planOpenHall,
  recipeFromOpenHall,
  slimeFromOpenHall,
} from "../lib/skill1/run-open-hall";
import {
  agentsFromTerraced,
  attractorsFromTerraced,
  planTerraced,
  slimeFromTerraced,
  TERRACE_RUN_ITERATIONS,
} from "../lib/skill1/run-terraced";
import { attractorsFromUndulated, planUndulated, tuneUndulatedSlime, undulatedAgentCount } from "../lib/skill1/run-undulated";
import { slimeControlsFromTranslation } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { BiologicalTranslation, FieldAttractor, FieldSnapshot } from "../lib/skill1/types";
import type { SlimeControls } from "../lib/skill1/slime-controls";
import { drawPlanField } from "../components/skill1-viz";

const OH_TRAIL_SCALE = 8;
const OH_RUN_ITERATIONS = 280;
const TR_TRAIL_SCALE = 24;
const IMAGE_SIZE = 1280;

type Variant = {
  seed: number;
  agents: number;
  slime: SlimeControls;
  translation: BiologicalTranslation;
};

function seedFor(id: string, run: number) {
  return (0x51c11 ^ (run * 9973) ^ id.length * 131) >>> 0;
}

function kindLabel(marks?: FieldAttractor[]) {
  if (!marks?.length) return "mixed";
  const kinds = [...new Set(marks.map((mark) => mark.kind))];
  if (kinds.length === 1) {
    const kind = kinds[0];
    return kind === "ring" ? "circle" : kind === "curve" ? "curvy line" : kind;
  }
  return "mixed";
}

function realize(base: BiologicalTranslation, slimeBase: SlimeControls, id: string, seed: number, index: number): Variant {
  if (id === "open-hall") {
    const plan = planOpenHall(seed, 0, index);
    const marks = attractorsFromOpenHall(plan, seed, 0);
    const first = marks[0] ?? { x: 10, y: 10 };
    return {
      seed,
      agents: agentsFromOpenHall(plan, seed),
      slime: slimeFromOpenHall(slimeBase, plan, seed),
      translation: {
        ...base,
        params: paramsFromOpenHall(base.params, seed ^ index),
        recipe: {
          ...recipeFromOpenHall(base.recipe, seed ^ index),
          attractorFixed: true,
          attractorsOnly: true,
          attractor: { x: first.x, y: first.y },
          attractors: marks,
        },
      },
    };
  }
  if (id === "undulated") {
    const plan = planUndulated(seed, 0, index);
    const marks = attractorsFromUndulated(plan);
    const first = marks[0] ?? { x: 10, y: 10 };
    return {
      seed,
      agents: undulatedAgentCount(plan, seed),
      slime: {
        ...tuneUndulatedSlime(slimeBase, plan),
        foodPoints: marks
          .filter((_, mark) => mark % 3 === 0)
          .slice(0, 5)
          .map((mark) => ({ x: (mark.x + (mark.x2 ?? mark.x)) / 2, y: (mark.y + (mark.y2 ?? mark.y)) / 2 })),
      },
      translation: {
        ...base,
        params: {
          ...base.params,
          geometryVariation: Math.min(base.params.geometryVariation, 0.22),
          attractionStrength: Math.max(base.params.attractionStrength, 1.15),
          directionalBias: Math.max(base.params.directionalBias, 0.62),
          randomness: Math.min(base.params.randomness, 0.08),
          permeability: Math.min(base.params.permeability, 0.38),
        },
        recipe: {
          ...base.recipe,
          attractorFixed: true,
          attractorsOnly: true,
          attractor: { x: first.x, y: first.y },
          attractors: marks,
          clustering: 0.86,
          coreExposure: Math.min(base.recipe.coreExposure, 0.28),
          approachWidth: Math.min(base.recipe.approachWidth, 1.25),
        },
      },
    };
  }
  const plan = planTerraced(seed, 0, index);
  const marks = attractorsFromTerraced(plan, seed);
  const first = marks[0] ?? { x: 10, y: 10 };
  return {
    seed,
    agents: agentsFromTerraced(plan),
    slime: {
      ...slimeFromTerraced(slimeBase, plan, seed),
      foodPoints: marks.map((mark) => ({ x: (mark.x + (mark.x2 ?? mark.x)) / 2, y: (mark.y + (mark.y2 ?? mark.y)) / 2 })),
    },
    translation: {
      ...base,
      recipe: {
        ...base.recipe,
        attractorFixed: true,
        attractorsOnly: true,
        attractor: { x: first.x, y: first.y },
        attractors: marks,
      },
    },
  };
}

function stepsFor(id: string) {
  if (id === "open-hall") return OH_RUN_ITERATIONS;
  if (id === "undulated") return FLAT_DEEP_RUN_ITERATIONS;
  return TERRACE_RUN_ITERATIONS;
}

function scaleFor(id: string) {
  if (id === "open-hall") return OH_TRAIL_SCALE;
  if (id === "undulated") return FLAT_DEEP_TRAIL_SCALE;
  return TR_TRAIL_SCALE;
}

function simulate(variant: Variant, id: string): FieldSnapshot {
  const steps = stepsFor(id);
  const next = createSimulation(variant.translation, variant.seed, variant.agents, scaleFor(id));
  next.maxIterations = steps;
  const rng = mulberry32(variant.seed ^ 0x9e3779b9);
  const slime = lobbySimulationSlime(id, variant.slime);
  stepMany(next, variant.translation, rng, steps, slime.decay, slime, false);
  return captureSnapshot(next, true);
}

function paint(snapshot: FieldSnapshot, attractors?: FieldAttractor[]) {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  drawPlanField(ctx, snapshot, IMAGE_SIZE, IMAGE_SIZE, {
    showHud: false,
    fine: true,
    density: 5,
    attractors,
    showAttractors: false,
  });
  const sample = ctx.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE).data;
  let lit = 0;
  for (let i = 0; i < sample.length; i += 64) {
    if (sample[i] + sample[i + 1] + sample[i + 2] > 18) lit += 1;
  }
  return { png: canvas.toDataURL("image/png"), lit };
}

function probeGl() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return "no-webgl2";
  const floatBuf = gl.getExtension("EXT_color_buffer_float");
  return floatBuf ? "webgl2-float" : "webgl2-no-float";
}

function publishCell(id: string, index: number, savedAt: number) {
  const base = translateArchetype(id);
  const slimeBase = slimeControlsFromTranslation(base);
  const seed = seedFor(id, index);
  const variant = realize(base, slimeBase, id, seed, index);
  const snapshot = simulate(variant, id);
  const marks = variant.translation.recipe.attractors;
  const painted = paint(snapshot, marks);
  return {
    id: `${id}-${seed}-${index}-${savedAt}`,
    archetypeId: id,
    archetypeName: variant.translation.archetypeName,
    run: index + 1,
    seed,
    kind: kindLabel(marks),
    agents: variant.agents,
    iterations: snapshot.iteration,
    savedAt,
    slime: variant.slime,
    params: variant.translation.params,
    behavior: variant.translation.behavior,
    recipe: variant.translation.recipe,
    topology: variant.translation.topology,
    png: painted.png,
    lit: painted.lit,
  };
}

Object.assign(window, { publishCell, probeGl });
