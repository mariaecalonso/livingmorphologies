/**
 * Skill 2 reader for Lobby catalog rows.
 * Uses the stored semantic plan and salt. Does not pose a genome and does not
 * call `planLinearGallery` or the other fresh-plan schedulers.
 */

import { mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import {
  LOBBY_ATTEMPT_SEARCH,
  isLobbyArchetype,
  planLobby,
  realizeLobbyPlan,
  type LobbyPlan,
  type LobbyRealization,
  type LobbySalt,
} from "../skill1/lobby-realization";
import { DISPLAY_ITERATIONS, TRAIL_SCALE } from "../skill1/maps";
import { slimeControlsFromTranslation } from "../skill1/slime-controls";
import { translateArchetype } from "../skill1/translate";
import type { FieldAttractor, SpatialRecipe } from "../skill1/types";
import { EVALUATION_SEED } from "./evolution-evaluate";

const TRAIL_DECAY = 0.986;

export type LobbyCatalogEntry = {
  archetypeId: string;
  seed?: number;
  /** 1-based grid slot. Salt index is `run - 1`. */
  run?: number;
  recipe?: SpatialRecipe;
  lobbyPlan?: LobbyPlan;
  lobbySalt?: LobbySalt;
};

function sameAttractors(a: readonly FieldAttractor[], b: readonly FieldAttractor[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Realization for a catalog row.
 * A row that already stores `lobbyPlan` and `lobbySalt` is used as stored.
 * An older row that stored the baked attractors, seed, and run is recovered
 * by searching the same attempt range the grid searched. The winning attempt
 * is the one whose attractors match the saved recipe.
 */
export function realizeLobbyCatalogEntry(entry: LobbyCatalogEntry): LobbyRealization | null {
  if (!isLobbyArchetype(entry.archetypeId)) return null;
  const base = translateArchetype(entry.archetypeId);
  const slimeBase = slimeControlsFromTranslation(base);
  if (entry.lobbyPlan && entry.lobbySalt && entry.lobbyPlan.archetypeId === entry.archetypeId) {
    const realized = realizeLobbyPlan(base, slimeBase, entry.lobbyPlan, entry.lobbySalt);
    return realized.ok ? realized : null;
  }
  if (!entry.recipe?.attractors || typeof entry.seed !== "number" || typeof entry.run !== "number") return null;
  const index = Math.max(0, entry.run - 1);
  for (let attempt = 0; attempt < LOBBY_ATTEMPT_SEARCH; attempt += 1) {
    const salt = { seed: entry.seed, attempt, index };
    const planned = planLobby(entry.archetypeId, salt);
    if (!planned) return null;
    const realized = realizeLobbyPlan(base, slimeBase, planned, salt);
    if (realized.ok && sameAttractors(realized.attractors, entry.recipe.attractors)) return realized;
  }
  return null;
}

/**
 * Trail for a Lobby catalog realization.
 * Attractors, slime, and agent count come from the plan and salt.
 * The agent walk uses Skill 2's fixed evaluation seed.
 */
export function simulateLobbyCatalogEntry(
  entry: LobbyCatalogEntry,
  evaluationSeed: number = EVALUATION_SEED,
  trailScale: number = TRAIL_SCALE,
) {
  const realized = realizeLobbyCatalogEntry(entry);
  if (!realized) return null;
  const state = createSimulation(realized.translation, evaluationSeed, realized.agents, trailScale);
  state.maxIterations = DISPLAY_ITERATIONS;
  stepMany(
    state,
    realized.translation,
    mulberry32(evaluationSeed ^ 0x9e3779b9),
    DISPLAY_ITERATIONS,
    TRAIL_DECAY,
    realized.simulationSlime,
    false,
  );
  return { realized, state, evaluationSeed };
}
