import type { SlimeControls } from "../../skill1/slime-controls";
import type { BiologicalTranslation } from "../../skill1/types";
import { realizeLobbyPlan } from "../../skill1/lobby-realization";
import { slimeControlsFromTranslation } from "../../skill1/slime-controls";
import { translateArchetype } from "../../skill1/translate";
import { visibleIds } from "./catalog";
import { lobbyState } from "./lobby-adapter";
import { semanticIdentity } from "./identity";
import { loadSemanticRun } from "./lobby-run";
import { createSearchAdapter } from "./registry";
import type { SemanticCandidate, SemanticPlan, RealizationState, SemanticRun } from "./types";

/**
 * The only Skill 2 record Skill 3 keeps. Catalog scores, previews, phenotypes,
 * and the other candidates stay in data/semantic-runs.
 */
export type Skill3Handoff = {
  archetypeId: string;
  candidateId: number;
  plan: SemanticPlan;
  state: RealizationState;
  evaluationSeed: number;
};

export type Skill3Realization = {
  translation: BiologicalTranslation;
  agents: number;
  slime: SlimeControls;
  seed: number;
};

export type SemanticHandoff = {
  schemaVersion: 3;
  provisional: boolean;
  purpose: SemanticRun["purpose"];
  calibration: SemanticRun["calibration"];
  archetypeId: string;
  candidateId: number;
  roles: string[];
  diversity: SemanticCandidate["current"]["diversity"];
  plan: SemanticPlan;
  state: SemanticCandidate["state"];
  evaluationSeed: number;
  checksum: string;
};

/**
 * Any visible Combined Catalog candidate can be handed on.
 * Hidden near-duplicates and candidates outside the catalog cannot.
 * Development and uncalibrated records stay marked provisional.
 */
export function buildSemanticHandoff(
  run: SemanticRun,
  candidateId: number,
  reproduce: (candidate: SemanticCandidate) => string,
): SemanticHandoff {
  const visible = new Set(visibleIds(run.catalog));
  if (!visible.has(candidateId)) {
    throw new Error(`candidate ${candidateId} is not a visible Combined Catalog candidate`);
  }
  const candidate = run.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`missing candidate ${candidateId}`);
  const roles = [
    candidate.current.pareto ? "pareto" : null,
    candidate.current.specialist ? `specialist-${candidate.current.specialist}` : null,
    candidate.current.diversity !== "none" ? "diversity" : null,
  ].filter((role): role is string => role != null);
  const checksum = reproduce(candidate);
  const again = reproduce(candidate);
  if (checksum !== again) throw new Error("semantic reproduction was not repeatable");
  return {
    schemaVersion: 3,
    provisional: run.provisional || candidate.fidelity.status !== "pass",
    purpose: run.purpose,
    calibration: run.calibration,
    archetypeId: run.archetypeId,
    candidateId,
    roles,
    diversity: candidate.current.diversity,
    plan: candidate.plan,
    state: candidate.state,
    evaluationSeed: run.evaluationSeed,
    checksum,
  };
}

/** One visible catalog candidate from data/semantic-runs. The run itself is not returned. */
export function loadSkill3Handoff(archetypeId: string, candidateId: number): Skill3Handoff {
  const run = loadSemanticRun(archetypeId);
  if (!run) throw new Error(`no catalog for ${archetypeId} in data/semantic-runs`);
  const visible = new Set(visibleIds(run.catalog));
  if (!visible.has(candidateId)) throw new Error(`candidate ${candidateId} is not a visible catalog candidate`);
  const candidate = run.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`missing candidate ${candidateId}`);
  return {
    archetypeId: run.archetypeId,
    candidateId,
    plan: candidate.plan,
    state: candidate.state,
    evaluationSeed: candidate.evaluationSeed,
  };
}

/** Replay the chosen plan. Scores and preview pixels are not part of the result. */
export function realizeSkill3Handoff(handoff: Skill3Handoff): Skill3Realization {
  const adapter = createSearchAdapter(handoff.archetypeId);
  if (!adapter.realize) throw new Error(`${handoff.archetypeId} has no realization`);
  const realized = adapter.realize(handoff.plan, handoff.state);
  if (!realized.ok) throw new Error(realized.reasons.join(", "));
  return {
    translation: realized.translation,
    agents: realized.agents,
    slime: realized.slime,
    seed: handoff.evaluationSeed,
  };
}

export function assertProductionHandoff(record: SemanticHandoff) {
  if (record.provisional || record.purpose !== "production" || record.calibration !== "calibrated") {
    throw new Error("uncalibrated or development handoff is not a final selection");
  }
}

/** Lobby replay. Same plan and salt, then the fixed evaluation seed. Does not pose a translation. */
export function lobbyRealizationChecksum(candidate: SemanticCandidate) {
  const base = translateArchetype(candidate.archetypeId);
  const first = realizeLobbyPlan(base, slimeControlsFromTranslation(base), candidate.plan.body as never, lobbyState(candidate.state));
  const second = realizeLobbyPlan(base, slimeControlsFromTranslation(base), candidate.plan.body as never, lobbyState(candidate.state));
  if (!first.ok || !second.ok) throw new Error("stored Lobby plan did not realize");
  const checksum = semanticIdentity(
    { adapterId: "lobby-realization", archetypeId: candidate.archetypeId, body: { agents: first.agents, attractors: first.attractors, food: first.foodPoints, diffusion: first.simulationSlime.diffusion } },
    candidate.state,
  );
  const again = semanticIdentity(
    { adapterId: "lobby-realization", archetypeId: candidate.archetypeId, body: { agents: second.agents, attractors: second.attractors, food: second.foodPoints, diffusion: second.simulationSlime.diffusion } },
    candidate.state,
  );
  if (checksum !== again) throw new Error("Lobby realization was not repeatable");
  return checksum;
}
