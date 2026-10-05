import { realizeLobbyPlan } from "../../skill1/lobby-realization";
import { slimeControlsFromTranslation } from "../../skill1/slime-controls";
import { translateArchetype } from "../../skill1/translate";
import { visibleIds } from "./catalog";
import { lobbyState } from "./lobby-adapter";
import { semanticIdentity } from "./identity";
import type { SemanticCandidate, SemanticPlan, SemanticRun } from "./types";

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
