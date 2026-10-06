/**
 * Focused checks for bounded candidate evaluation.
 * No Physarum population is simulated here. A worker process is only asked to reject a bad job.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EVALUATION_SEED } from "../evolution-evaluate";
import type { ArchetypeSearchAdapter } from "./adapter";
import { runSemanticEvolution } from "./controller";
import { saveLobbySemanticBatch } from "./lobby-run";
import { LOBBY_SEMANTIC_V1_ARCHETYPES } from "./lobby-semantic-v1";
import type { SemanticEvaluation } from "./evaluate";
import type { PendingGeneration, SemanticPlan, RealizationState, SemanticRun, SemanticSearchConfig } from "./types";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function evaluation(plan: SemanticPlan): SemanticEvaluation {
  const family = String((plan.body as { family?: string }).family ?? "a");
  const formal = family === "a" ? 0.9 : family === "b" ? 0.4 : 0.1;
  return {
    evaluationSeed: EVALUATION_SEED,
    technicalValid: true,
    failureReason: null,
    objectives: { formal, spatial: 0.5, atmospheric: 0.2 },
    criterionMatch: { complexity: formal },
    observed: { complexity: formal },
    criterionCategory: { complexity: "formal" },
    phenotype: { raw: { family }, occupancy: [formal] },
    preview: null,
    previewSize: 0,
  };
}

function adapter(): ArchetypeSearchAdapter {
  let n = 0;
  return {
    id: "test",
    archetypeId: "vertical-void",
    typologyId: "lobby",
    sampleExplorer() {
      n += 1;
      const family = n % 3 === 0 ? "c" : n % 2 === 0 ? "b" : "a";
      return {
        plan: { adapterId: "test", archetypeId: "vertical-void", body: { family, n } },
        state: { seed: 1000 + n, attempt: 0, index: n },
      };
    },
    genes: () => [{ name: "family", kind: "discrete", legal: ["a", "b", "c"] }],
    repair: (plan) => ({ ok: true, plan, repairedFields: [] }),
    readGene: (plan, name) => (plan.body as Record<string, unknown>)[name],
    writeGene: (plan, name, value) => ({ ...plan, body: { ...(plan.body as object), [name]: value } }),
  };
}

function config(): SemanticSearchConfig {
  return {
    populationSize: 6,
    generations: 2,
    runSeed: 7,
    purpose: "development",
    duplicateAttemptBudget: 8,
    composition: { 2: { explorers: 2, pareto: 4, diversity: 0, specialist: 0 } },
    paretoMutation: { fields: ["family"], fieldCount: 1 },
    diversityParentSelection: { kind: "provisional-uniform" },
  };
}

function fingerprint(run: SemanticRun) {
  return {
    ids: run.candidates.map((candidate) => candidate.id),
    plans: run.candidates.map((candidate) => candidate.plan),
    salts: run.candidates.map((candidate) => candidate.state),
    parents: run.candidates.map((candidate) => [
      candidate.lineage.parentId,
      candidate.lineage.parentSelectionRole,
      candidate.lineage.mutationIntent,
    ]),
    changes: run.candidates.map((candidate) => candidate.lineage.changes),
    seeds: run.candidates.map((candidate) => candidate.evaluationSeed),
    generations: run.generations.map((generation) => ({
      generation: generation.generation,
      births: generation.births,
      newCandidateIds: generation.newCandidateIds,
    })),
    pending: run.pendingGeneration,
  };
}

async function search(
  workers: number,
  evaluate: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation | Promise<SemanticEvaluation>,
  checkpoint?: (run: SemanticRun, phase: "birth-plan" | "candidate" | "fidelity" | "descriptor" | "generation") => void | Promise<void>,
) {
  return runSemanticEvolution({
    config: config(),
    adapter: adapter(),
    workers,
    evaluate,
    checkpoint,
  });
}

async function testSameBirths() {
  const sequential = await search(1, evaluation);
  let finished: number[] = [];
  let generationBeforeComplete = false;
  const parallel = await search(5, (plan, state) => {
    const wait = (6 - (state.index % 6)) * 4;
    return new Promise((resolve) => {
      setTimeout(() => {
        finished.push(state.index);
        resolve(evaluation(plan));
      }, wait);
    });
  }, (run, phase) => {
    if (phase === "generation" && run.candidates.length !== run.completedGenerations * run.config.populationSize) {
      generationBeforeComplete = true;
    }
  });
  assert(!generationBeforeComplete, "preservation waits until every birth in the generation is stored");
  assert(finished[0] !== finished[finished.length - 1], "the fixture finishes evaluations out of birth order");
  assert(JSON.stringify(fingerprint(sequential)) === JSON.stringify(fingerprint(parallel)), "workers 1 and 5 keep the same births, ids, salts, and generations");
  assert(parallel.candidates.map((candidate) => candidate.id).join(",") === "1,2,3,4,5,6,7,8,9,10,11,12", "stored candidates stay in id order");
  assert(
    parallel.generations[0].births.map((birth) => birth.candidateId).join(",") === "1,2,3,4,5,6",
    "generation membership follows the predetermined birth list",
  );
}

async function testCheckpointAndResume() {
  const directory = mkdtempSync(join(tmpdir(), "lm-parallel-"));
  let active = 0;
  let overlapped = false;
  let generationBeforeComplete = false;
  const captured: { births: PendingGeneration | null } = { births: null };
  const configRun = { ...config(), generations: 1, populationSize: 4, composition: undefined };
  const runAdapter = adapter();
  try {
    await runSemanticEvolution({
      config: configRun,
      adapter: runAdapter,
      workers: 5,
      evaluate: (_plan, state) =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            if (state.index === 3) reject(new Error("interrupt"));
            else resolve(evaluation(_plan));
          }, state.index === 3 ? 30 : 5);
        }),
      checkpoint: async (run, phase) => {
        if (phase === "birth-plan") captured.births = JSON.parse(JSON.stringify(run.pendingGeneration)) as PendingGeneration;
        if (phase === "generation" && run.candidates.length < run.config.populationSize) generationBeforeComplete = true;
        if (phase !== "candidate") return;
        active += 1;
        if (active > 1) overlapped = true;
        await new Promise((resolve) => setTimeout(resolve, 12));
        const batch = { run, previews: new Map() };
        const savedDir = saveLobbySemanticBatch(batch, join(directory, "semantic-runs"));
        const parsed = JSON.parse(readFileSync(join(savedDir, "run.json"), "utf8")) as SemanticRun;
        assert(parsed.candidates.every((candidate, index) => index === 0 || candidate.id > parsed.candidates[index - 1].id), "run.json stays ordered while workers finish");
        active -= 1;
      },
    });
    throw new Error("the interrupted candidate should stop the generation");
  } catch (error) {
    assert(String(error).includes("interrupt"), "the interruption is the recorded stop");
  }
  assert(!overlapped, "checkpoint writes do not overlap");
  assert(!generationBeforeComplete, "preservation waits until the generation's evaluations are stored");
  const saved = JSON.parse(readFileSync(join(directory, "semantic-runs", "vertical-void", "run.json"), "utf8")) as SemanticRun;
  assert(saved.candidates.some((candidate) => candidate.id === 3) === false, "the unfinished birth is not stored as a completed candidate");
  assert(saved.pendingGeneration?.births.length === 4, "the predetermined birth list remains pending");
  const birthPlans = captured.births;
  if (!birthPlans) throw new Error("birth list was not checkpointed");
  const original = birthPlans.births.find((birth) => birth.candidateId === 3);
  const pending = saved.pendingGeneration;
  if (!pending) throw new Error("pending births were dropped");
  assert(JSON.stringify(pending.births.find((birth) => birth.candidateId === 3)) === JSON.stringify(original), "the unfinished birth keeps its id, plan, and salt");
  let resumedIndexes: number[] = [];
  const resumed = await runSemanticEvolution({
    config: configRun,
    adapter: adapter(),
    previous: saved,
    workers: 5,
    evaluate: (_plan, state) => {
      resumedIndexes.push(state.index);
      return evaluation(_plan);
    },
  });
  assert(resumedIndexes.join(",") === "3", "resume evaluates only the unfinished birth");
  const kept = resumed.candidates.find((candidate) => candidate.id === 1);
  const originalFirst = saved.candidates.find((candidate) => candidate.id === 1);
  assert(JSON.stringify(kept?.plan) === JSON.stringify(originalFirst?.plan), "resume keeps completed plans");
  assert(JSON.stringify(kept?.state) === JSON.stringify(originalFirst?.state), "resume keeps completed salts");
  assert(resumed.candidates.map((candidate) => candidate.id).join(",") === "1,2,3,4", "ids stay the ones assigned at birth");
  assert(resumed.generations.length === 1, "preservation runs only after the missing evaluation is stored");
  writeFileSync(join(directory, "ok.txt"), "ok");
}

function testLaunchContract() {
  const source = readFileSync(join("scripts", "lobby-semantic-v1.ts"), "utf8");
  assert(LOBBY_SEMANTIC_V1_ARCHETYPES.join(",") === "topographic-ground-field,linear-gallery,compressed-sequential,continuous-hall,vertical-void", "faster archetypes are first");
  assert(source.includes("for (const archetypeId of archetypes)"), "the batch walks one archetype at a time");
  assert(source.includes("await runOne(archetypeId)"), "the next archetype starts after the current one returns");
  assert(source.indexOf("await runOne(archetypeId)") < source.indexOf("publishLobbyCatalog({"), "publishing follows the finished archetype");
  assert(!source.includes("Promise.all"), "archetypes are not started together");
  assert(source.includes("workers"), "candidate workers are a separate flag from archetype concurrency");
}

function testWorkerProcessBoots() {
  const path = fileURLToPath(new URL("./evaluate-worker.ts", import.meta.url));
  const child = fork(path, [], { execArgv: process.execArgv, serialization: "advanced" });
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("evaluation worker did not answer"));
    }, 20000);
    child.once("message", (message: { error?: string }) => {
      clearTimeout(timer);
      child.kill();
      if (!message.error) reject(new Error("a bad job should fail inside the worker"));
      else resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`evaluation worker exited before answering (${code})`));
    });
    child.send({
      id: 1,
      plan: { adapterId: "test", archetypeId: "not-a-lobby-archetype", body: {} },
      state: { seed: 1, attempt: 0, index: 0 },
    });
  });
}

async function main() {
  await testSameBirths();
  await testCheckpointAndResume();
  testLaunchContract();
  await testWorkerProcessBoots();
  console.log("parallel candidate evaluation checks passed");
}

main();
