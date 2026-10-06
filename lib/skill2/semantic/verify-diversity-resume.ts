/**
 * Resume each stored Lobby generation 1 and carry the saved Diversity distance
 * through generations 2, 3, and 4. Does not simulate Physarum and does not
 * write the research checkpoint.
 */
import { readFileSync } from "node:fs";
import { createLobbyAdapter } from "./lobby-adapter";
import { diversityFromDescriptor } from "./descriptor-v1";
import { LOBBY_SEMANTIC_V1_ARCHETYPES, lobbySemanticV1Config, mutateLobbySemanticV1 } from "./lobby-semantic-v1";
import { runSemanticEvolution } from "./controller";
import type { SemanticEvaluation } from "./evaluate";
import type { SemanticCandidate, SemanticRun } from "./types";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

async function main() {
  for (const archetypeId of LOBBY_SEMANTIC_V1_ARCHETYPES) {
    await resumeGeneration2(archetypeId);
    await resumeLaterGenerations(archetypeId);
  }
  console.log("stored diversity resume check passed");
}

async function resumeGeneration2(archetypeId: string) {
  const stored = JSON.parse(readFileSync(`data/semantic-runs/${archetypeId}/run.json`, "utf8")) as SemanticRun;
  const original = stored.candidates.map((candidate) => ({
    id: candidate.id,
    plan: JSON.stringify(candidate.plan),
    state: JSON.stringify(candidate.state),
  }));
  const config = lobbySemanticV1Config(archetypeId);
  const diversity = diversityFromDescriptor(stored.descriptorProfile!);
  if (!diversity) throw new Error("stored descriptor has no distance");
  config.diversity = diversity;

  let planned = false;
  try {
    await runSemanticEvolution({
      config,
      adapter: createLobbyAdapter(archetypeId),
      previous: stored,
      mutate: mutateLobbySemanticV1,
      workers: 1,
      evaluate: () => {
        throw new Error("stop-after-birth-plan");
      },
      checkpoint: (run, phase) => {
        if (phase !== "birth-plan" || run.pendingGeneration?.generation !== 2) return;
        planned = true;
        const births = run.pendingGeneration.births;
        const pool = new Set(run.generations[0].parentPools.diversity);
        const diversityBirths = births.filter((birth) => birth.parentSelectionRole === "diversity");
        const paretoBirths = births.filter((birth) => birth.parentSelectionRole === "pareto");
        const explorers = births.filter((birth) => birth.origin === "explorer");
        const refine = archetypeId === "continuous-hall" || archetypeId === "vertical-void";
        assert(births.length === 100, "generation 2 plans the full population");
        assert(diversityBirths.length === 8, "generation 2 keeps the Diversity quota");
        assert(paretoBirths.length === (refine ? 22 : 0), "Pareto births exist only when a refinement gene exists");
        assert(explorers.length === (refine ? 70 : 92), "an archetype without a refinement gene spends those slots on explorers");
        if (!refine) assert(run.pendingGeneration.reallocatedPools.includes("pareto"), "the Pareto shift is recorded");
        assert(pool.size > 0, "generation 1 Diversity pool is filled from the stored distance");
        assert(diversityBirths.every((birth) => birth.parentId != null && pool.has(birth.parentId)), "Diversity births use recovered parents");
        assert(run.generations[0].diversityTagIds.length > 0 && run.generations[0].diversityRescueIds.length > 0, "Tag and Rescue are both stored");
        assert(
          run.candidates.every((candidate, index) => JSON.stringify(candidate.plan) === original[index].plan && JSON.stringify(candidate.state) === original[index].state),
          "recomputation keeps generation 1 plans and salts",
        );
        console.log(
          `${archetypeId}: generation 2 planned, diversity pool ${pool.size}, tag ${run.generations[0].diversityTagIds.length}, rescue ${run.generations[0].diversityRescueIds.length}`,
        );
      },
    });
    throw new Error("generation 2 should stop at the test boundary");
  } catch (error) {
    if (!String(error).includes("stop-after-birth-plan")) throw error;
  }
  assert(planned, `${archetypeId} generation 2 birth list was planned`);
}

const LATER_MIX: Record<number, { explorers: number; pareto: number; diversity: number }> = {
  2: { explorers: 70, pareto: 22, diversity: 8 },
  3: { explorers: 50, pareto: 37, diversity: 13 },
  4: { explorers: 30, pareto: 52, diversity: 18 },
};

async function resumeLaterGenerations(archetypeId: string) {
  const stored = JSON.parse(readFileSync(`data/semantic-runs/${archetypeId}/run.json`, "utf8")) as SemanticRun;
  const config = lobbySemanticV1Config(archetypeId);
  const diversity = diversityFromDescriptor(stored.descriptorProfile!);
  if (!diversity) throw new Error(`${archetypeId} stored descriptor has no distance`);
  config.diversity = diversity;
  let live: SemanticRun | null = null;
  const run = await runSemanticEvolution({
    config,
    adapter: createLobbyAdapter(archetypeId),
    previous: stored,
    mutate: mutateLobbySemanticV1,
    workers: 1,
    checkpoint: (current) => {
      live = current;
    },
    evaluate: (plan, state) => inheritedEvaluation(live, plan, state),
  });
  assert(run.completedGenerations === 4, `${archetypeId} completes four generations`);
  for (const generation of [2, 3, 4]) {
    const current = run.generations[generation - 1];
    const previous = run.generations[generation - 2];
    const mix = LATER_MIX[generation];
    const refine = archetypeId === "continuous-hall" || archetypeId === "vertical-void";
    const diversityBirths = current.births.filter((birth) => birth.parentSelectionRole === "diversity");
    const paretoBirths = current.births.filter((birth) => birth.parentSelectionRole === "pareto");
    const explorers = current.births.filter((birth) => birth.origin === "explorer");
    assert(previous.diversityStatus === "applied" && previous.parentPools.diversity.length > 0, `${archetypeId} generation ${generation - 1} keeps a Diversity pool`);
    assert(diversityBirths.length === mix.diversity, `${archetypeId} generation ${generation} keeps its Diversity quota`);
    assert(paretoBirths.length === (refine ? mix.pareto : 0), `${archetypeId} generation ${generation} refines only when a span exists`);
    assert(explorers.length === mix.explorers + (refine ? 0 : mix.pareto), `${archetypeId} generation ${generation} keeps 100 births`);
    assert(
      diversityBirths.every((birth) => birth.parentId != null && previous.parentPools.diversity.includes(birth.parentId)),
      `${archetypeId} generation ${generation} Diversity births use the previous pool`,
    );
  }
  assert(run.generations[3].diversityStatus === "applied" && run.generations[3].parentPools.diversity.length > 0, `${archetypeId} generation 4 preserves Diversity`);
  console.log(
    `${archetypeId}: generations 2-4 planned, pools ${run.generations.map((generation) => generation.parentPools.diversity.length).join("/")}`,
  );
}

function inheritedEvaluation(run: SemanticRun | null, plan: SemanticRun["candidates"][number]["plan"], state: SemanticRun["candidates"][number]["state"]): SemanticEvaluation {
  const birth = run?.pendingGeneration?.births.find((item) => item.plan === plan && item.state === state);
  const parent =
    (birth?.parentId != null ? run?.candidates.find((candidate) => candidate.id === birth.parentId) : null) ??
    run?.candidates.find((candidate) => candidate.fidelity.status === "pass");
  if (!parent) throw new Error("missing stored parent for a later-generation test birth");
  return evaluationFrom(parent);
}

function evaluationFrom(parent: SemanticCandidate): SemanticEvaluation {
  return {
    evaluationSeed: parent.evaluationSeed,
    technicalValid: parent.technicalValid,
    failureReason: null,
    objectives: parent.objectives,
    criterionMatch: parent.criterionMatch,
    observed: parent.observed,
    criterionCategory: parent.criterionCategory,
    phenotype: parent.phenotype,
    preview: null,
    previewSize: 0,
  };
}

main();
