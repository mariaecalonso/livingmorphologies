/**
 * Browser publisher for the Vertical Void and Continuous Hall catalogs.
 * Driven by scripts/publish-lobby-runs.mjs.
 * One hundred cells, six attempts each, same selection the 100-run grid used.
 */
import { mulberry32 } from "../lib/physarum";
import { createSimulation, stepMany, captureSnapshot } from "../lib/skill1/engine";
import { planLobby, realizeLobbyPlan, lobbySimulationSlime, type LobbySalt } from "../lib/skill1/lobby-realization";
import { DISPLAY_ITERATIONS } from "../lib/skill1/maps";
import {
  extractMorphFeatures,
  isNovelMorphology,
  pickMostNovel,
  verticalVoidIdentity,
  type MorphFeatures,
} from "../lib/skill1/run-morphology";
import { continuousHallIdentity, hallSignature, isNovelHall } from "../lib/skill1/run-continuous-hall";
import { slimeControlsFromTranslation, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { BiologicalTranslation, FieldAttractor, FieldSnapshot } from "../lib/skill1/types";
import { drawPlanField } from "../components/skill1-viz";

const RUN_COUNT = 100;
const RUN_TRAIL_SCALE = 8;
const IMAGE_SIZE = 1280;
const ATTEMPTS = 6;

type Variant = {
  seed: number;
  agents: number;
  slime: SlimeControls;
  translation: BiologicalTranslation;
  lobbyPlan?: ReturnType<typeof realizeLobbyPlan> extends infer R ? (R extends { ok: true; plan: infer P } ? P : never) : never;
  lobbySalt?: LobbySalt;
};

type Try = {
  variant: Variant;
  snapshot: FieldSnapshot;
  features: MorphFeatures;
  identity: boolean;
  signature: number[];
};

let archetypeId = "";
let index = 0;
let savedAt = 0;
let previous: MorphFeatures[] = [];
let previousHall: number[][] = [];
let base: BiologicalTranslation | null = null;
let slimeBase: SlimeControls | null = null;

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

function realizeRun(translation: BiologicalTranslation, slime: SlimeControls, seed: number, attempt: number, cell: number): Variant {
  const salt: LobbySalt = { seed, attempt, index: cell };
  const planned = planLobby(translation.archetypeId, salt);
  if (!planned) throw new Error(`${translation.archetypeId} has no lobby plan`);
  const realized = realizeLobbyPlan(translation, slime, planned, salt);
  if (!realized.ok) throw new Error(`${translation.archetypeId}: ${realized.reasons.join(", ")}`);
  return {
    seed,
    agents: realized.agents,
    slime: realized.slime,
    translation: realized.translation,
    lobbyPlan: realized.plan,
    lobbySalt: realized.salt,
  };
}

function simulate(variant: Variant): FieldSnapshot {
  const next = createSimulation(variant.translation, variant.seed, variant.agents, RUN_TRAIL_SCALE);
  next.maxIterations = DISPLAY_ITERATIONS;
  const rng = mulberry32(variant.seed ^ 0x9e3779b9);
  const slime = lobbySimulationSlime(variant.translation.archetypeId, variant.slime);
  stepMany(next, variant.translation, rng, DISPLAY_ITERATIONS, slime.decay, slime, false);
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
  return canvas.toDataURL("image/png");
}

function choose(tries: Try[], hall: boolean) {
  for (const item of tries) {
    if (!item.identity) continue;
    if (hall ? !isNovelHall(item.signature, previousHall) : !isNovelMorphology(item.features, previous)) continue;
    return item;
  }
  const valid = tries.filter((item) => item.identity);
  const pool = valid.length ? valid : tries;
  return pool[pickMostNovel(pool.map((item) => item.features), previous)] ?? tries[tries.length - 1];
}

function resetCatalog(id: string, stamp: number, startIndex = 0, keptFeatures: MorphFeatures[] = [], keptHall: number[][] = []) {
  archetypeId = id;
  index = startIndex;
  savedAt = stamp;
  previous = keptFeatures;
  previousHall = keptHall;
  base = translateArchetype(id);
  slimeBase = slimeControlsFromTranslation(base);
  return { archetypeId, index, count: RUN_COUNT };
}

function publishCell() {
  if (!base || !slimeBase) throw new Error("catalog was not reset");
  if (index >= RUN_COUNT) return null;
  const cell = index;
  const seed = seedFor(archetypeId, cell);
  const hall = archetypeId === "continuous-hall";
  const tries: Try[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const variant = realizeRun(base, slimeBase, seed, attempt, cell);
    const snapshot = simulate(variant);
    const marks = variant.translation.recipe.attractors ?? [];
    const features = extractMorphFeatures(snapshot, marks);
    const identity = hall ? continuousHallIdentity(features, marks, snapshot) : verticalVoidIdentity(features);
    const signature = hall ? hallSignature(marks, { slime: variant.slime, agents: variant.agents }) : [];
    tries.push({ variant, snapshot, features, identity, signature });
  }
  const chosen = choose(tries, hall);
  if (!chosen) throw new Error(`${archetypeId} cell ${cell} produced no attempt`);
  previous.push(chosen.features);
  if (chosen.signature.length) previousHall.push(chosen.signature);
  const marks = chosen.variant.translation.recipe.attractors;
  const png = paint(chosen.snapshot, marks);
  index += 1;
  const { snapshot: _snapshot, ...rest } = chosen;
  return {
    png,
    state: {
      index,
      features: previous,
      hall: previousHall,
    },
    entry: {
      id: `${archetypeId}-${seed}-${cell}-${savedAt}`,
      archetypeId,
      archetypeName: chosen.variant.translation.archetypeName,
      run: cell + 1,
      seed,
      kind: kindLabel(marks),
      agents: chosen.variant.agents,
      iterations: chosen.snapshot.iteration ?? DISPLAY_ITERATIONS,
      savedAt,
      slime: chosen.variant.slime,
      params: chosen.variant.translation.params,
      behavior: chosen.variant.translation.behavior,
      recipe: chosen.variant.translation.recipe,
      topology: chosen.variant.translation.topology,
      lobbyPlan: chosen.variant.lobbyPlan,
      lobbySalt: chosen.variant.lobbySalt,
      identity: rest.identity,
      attempt: chosen.variant.lobbySalt?.attempt ?? 0,
    },
  };
}

declare global {
  interface Window {
    resetCatalog: typeof resetCatalog;
    publishCell: typeof publishCell;
  }
}

window.resetCatalog = resetCatalog;
window.publishCell = publishCell;
