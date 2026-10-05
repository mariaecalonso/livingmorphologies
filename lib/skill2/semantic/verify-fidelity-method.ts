import { runSemanticEvolution } from "./controller";
import { applyG01Fidelity, deriveG01Fidelity, G01_LOWER_MODE_V1, lowerModeFence } from "./fidelity-method";
import { recomputeStoredG01Fidelity } from "./lobby-run";
import type { ArchetypeSearchAdapter } from "./adapter";
import type { SemanticCandidate, SemanticRun } from "./types";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function adapter(): ArchetypeSearchAdapter {
  return {
    id: "test",
    archetypeId: "compressed-sequential",
    typologyId: "lobby",
    primaryFamilyGene: "kind",
    sampleExplorer: () => {
      throw new Error("unused");
    },
    genes: () => [
      { name: "kind", kind: "discrete", legal: ["alpha", "beta"] },
      { name: "complexity", kind: "continuous" },
    ],
    repair: (plan) => ({ ok: true, plan, repairedFields: [] }),
    readGene: (plan, name) => (plan.body as Record<string, unknown>)[name],
    writeGene: (plan, name, value) => ({ ...plan, body: { ...(plan.body as object), [name]: value } }),
  };
}

function candidate(
  id: number,
  kind: string,
  scores: { complexity: number; proportionality: number; centrality: number; immersive: number; visibility: number; receptivity: number },
  atmosphericObjective: number,
): SemanticCandidate {
  return {
    id,
    archetypeId: "compressed-sequential",
    typologyId: "lobby",
    generation: 1,
    birthIndex: id - 1,
    origin: "explorer",
    plan: { adapterId: "test", archetypeId: "compressed-sequential", body: { kind } },
    state: { seed: id, attempt: 0, index: id },
    lineage: { parentId: null, parentSelectionRole: null, mutationIntent: null, changes: [], repairedFields: [] },
    evaluationSeed: 1,
    technicalValid: true,
    failureReason: null,
    objectives: { formal: 0.2, spatial: 0.2, atmospheric: atmosphericObjective },
    criterionMatch: scores,
    observed: scores,
    criterionCategory: {
      complexity: "formal",
      proportionality: "formal",
      centrality: "formal",
      immersive: "atmospheric",
      visibility: "atmospheric",
      receptivity: "atmospheric",
    },
    fidelity: { status: "uncalibrated", profileId: null, categories: null, criteria: null, categoryValues: null },
    phenotype: { raw: null, occupancy: null },
    preview: null,
    current: { pareto: false, crowding: null, specialist: null, diversity: "none" },
  };
}

function spread(id: number, kind: string) {
  const wobble = ((id % 5) - 2) * 0.01;
  return candidate(
    id,
    kind,
    {
      complexity: 0.72 + wobble,
      proportionality: 0.68 + wobble,
      centrality: 0.7 + wobble,
      immersive: 0.66 + wobble,
      visibility: 0.64 + wobble,
      receptivity: 0.01,
    },
    0.4,
  );
}

function testNoFixedPercentage() {
  const fence = lowerModeFence([0.61, 0.62, 0.63, 0.64, 0.65, 0.66, 0.67, 0.68]);
  assert(fence.floor == null, "a continuous cloud has no fidelity floor");
  const separated = lowerModeFence([0.1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.81, 0.82, 0.83]);
  assert(separated.floor != null && separated.floor > 0.1 && separated.floor < 0.8, "a separated lower point is fenced");
  assert(G01_LOWER_MODE_V1.gapNoise === 0.05, "gap noise is a versioned method constant");
}

function testCategorySeparationAndCollapse() {
  const healthy = [1, 2, 3, 4, 5, 6].map((id) => spread(id, "alpha"));
  const lowFormal = candidate(
    7,
    "beta",
    { complexity: 0.05, proportionality: 0.7, centrality: 0.7, immersive: 0.66, visibility: 0.64, receptivity: 0.01 },
    0.4,
  );
  const lowFormal2 = candidate(
    8,
    "beta",
    { complexity: 0.06, proportionality: 0.69, centrality: 0.71, immersive: 0.67, visibility: 0.65, receptivity: 0.01 },
    0.4,
  );
  const record = deriveG01Fidelity([...healthy, lowFormal, lowFormal2], adapter());
  const applied = applyG01Fidelity([lowFormal, healthy[0]], record);
  assert(record.criterionRules.receptivity.gated === false, "receptivity is not a level-2 gate");
  assert(record.categoryRules.atmospheric.admittedCriteria.includes("immersive"), "immersive stays in fidelity atmospheric");
  assert(!record.categoryRules.atmospheric.admittedCriteria.includes("receptivity"), "receptivity is outside the fidelity atmospheric mean");
  assert(applied[0].fidelity.status === "fail", "the separated formal mode fails fidelity");
  assert(applied[0].objectives.atmospheric === 0.4, "Pareto atmospheric is not rewritten");
  assert(applied[0].fidelity.categoryValues?.atmospheric != null && applied[0].fidelity.categoryValues.atmospheric > 0.6, "fidelity atmospheric uses immersive and visibility");
  assert(record.excludedCriteria.some((item) => item.id === "receptivity" && item.reason === "questionable"), "receptivity exclusion is recorded");

  const flat = [1, 2, 3, 4, 5, 6].map((id) =>
    candidate(id, "alpha", { complexity: 0.5, proportionality: 0.6 + id * 0.01, centrality: 0.62, immersive: 0.7, visibility: 0.68, receptivity: 0.2 }, 0.55),
  );
  const collapsed = deriveG01Fidelity(flat, adapter());
  assert(collapsed.criterionRules.complexity.reason === "collapsed", "a collapsed criterion leaves the hard gate");
  assert(collapsed.status === "warn", "collapsed criteria warn");
  assert(collapsed.diagnostics.warnings.some((warning) => warning.includes("collapsed")), "the exclusion is diagnosed");
  const kept = applyG01Fidelity(flat, collapsed);
  assert(kept[0].objectives.formal === 0.2, "a collapsed criterion does not rewrite the Pareto formal score");
}

function testFamilyBlockAndRecompute() {
  const high = [1, 2, 3, 4, 5, 6].map((id) => spread(id, "alpha"));
  const low = [7, 8, 9].map((id) =>
    candidate(id, "beta", { complexity: 0.04, proportionality: 0.05, centrality: 0.06, immersive: 0.66, visibility: 0.64, receptivity: 0.01 }, 0.4),
  );
  const source = [...high, ...low];
  const record = deriveG01Fidelity(source, adapter());
  assert(record.status === "block", "eliminating a sampled family blocks calibration");
  assert(record.familyCoverage.eliminated.includes("beta"), "the eliminated family is named");
  const run = {
    schemaVersion: 3,
    purpose: "production",
    provisional: true,
    calibration: "uncalibrated",
    fidelityProfileId: null,
    archetypeId: "compressed-sequential",
    typologyId: "lobby",
    adapterId: "lobby",
    config: { populationSize: source.length, generations: 1, runSeed: 1, purpose: "production", duplicateAttemptBudget: 4 },
    evaluationSeed: 1,
    completedGenerations: 1,
    fidelityCalibration: null,
    pendingGeneration: null,
    candidates: source,
    generations: [],
    catalog: { dedup: "uncalibrated", redundancyThreshold: null, entries: [] },
  } as unknown as SemanticRun;
  const recomputed = recomputeStoredG01Fidelity(run, adapter());
  assert(recomputed.fidelityCalibration?.status === "block", "stored G01 can be recalibrated without simulation");
  assert(recomputed.candidates[6].fidelity.status === "fail", "the recomputed gate still fails the low family");
  assert(recomputed.candidates[0].objectives.formal === 0.2, "recompute does not change Pareto scores");
}

function testCheckpointResume() {
  let calls = 0;
  const box: { run: SemanticRun | null } = { run: null };
  const config = { populationSize: 4, generations: 1, runSeed: 3, purpose: "development" as const, duplicateAttemptBudget: 8 };
  try {
    runSemanticEvolution({
      config,
      adapter: varying(),
      evaluate: () => {
        calls += 1;
        if (calls === 3) throw new Error("interrupt");
        return fakeEval(calls);
      },
      checkpoint: (run) => {
        box.run = JSON.parse(JSON.stringify(run)) as SemanticRun;
      },
    });
  } catch (error) {
    assert(String(error).includes("interrupt"), "the interruption is the test stop");
  }
  const saved = box.run;
  if (saved == null || saved.candidates.length !== 2 || saved.pendingGeneration?.births.length !== 4) {
    throw new Error("checkpoint did not keep two candidates and the birth list");
  }
  const stored = saved;
  const firstState = JSON.stringify(stored.candidates[0].state);
  let resumedCalls = 0;
  const resumed = runSemanticEvolution({
    config,
    adapter: varying(),
    previous: stored,
    evaluate: () => {
      resumedCalls += 1;
      return fakeEval(10 + resumedCalls);
    },
  });
  assert(resumedCalls === 2, "resume does not repeat completed evaluations");
  assert(resumed.candidates.map((item) => item.id).join(",") === "1,2,3,4", "candidate ids continue");
  assert(JSON.stringify(resumed.candidates[0].state) === firstState, "resume keeps the original salt");
}

function varying(): ArchetypeSearchAdapter {
  let n = 0;
  return {
    id: "test",
    archetypeId: "compressed-sequential",
    typologyId: "lobby",
    primaryFamilyGene: "kind",
    sampleExplorer(rng) {
      n += 1;
      const seed = Math.floor(rng() * 1_000_000);
      return {
        plan: { adapterId: "test", archetypeId: "compressed-sequential", body: { kind: n % 2 ? "alpha" : "beta" } },
        state: { seed, attempt: 0, index: n },
      };
    },
    genes: () => [{ name: "kind", kind: "discrete", legal: ["alpha", "beta"] }],
    repair: (plan) => ({ ok: true, plan, repairedFields: [] }),
    readGene: (plan, name) => (plan.body as Record<string, unknown>)[name],
    writeGene: (plan, name, value) => ({ ...plan, body: { ...(plan.body as object), [name]: value } }),
  };
}

function fakeEval(n: number) {
  const wobble = (n % 3) * 0.01;
  return {
    evaluationSeed: 1,
    technicalValid: true,
    failureReason: null,
    objectives: { formal: 0.7, spatial: 0.6, atmospheric: 0.5 },
    criterionMatch: {
      complexity: 0.7 + wobble,
      proportionality: 0.66 + wobble,
      centrality: 0.68,
      immersive: 0.6,
      visibility: 0.62,
      receptivity: 0.2,
    },
    observed: {},
    criterionCategory: {
      complexity: "formal" as const,
      proportionality: "formal" as const,
      centrality: "formal" as const,
      immersive: "atmospheric" as const,
      visibility: "atmospheric" as const,
      receptivity: "atmospheric" as const,
    },
    phenotype: { raw: null, occupancy: null },
    preview: null,
    previewSize: 0,
  };
}

testNoFixedPercentage();
testCategorySeparationAndCollapse();
testFamilyBlockAndRecompute();
testCheckpointResume();
console.log("g01 fidelity checks passed");
