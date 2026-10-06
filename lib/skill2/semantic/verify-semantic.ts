import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mulberry32 } from "../../physarum";
import { LOBBY_ARCHETYPE_IDS } from "../../skill1/lobby-realization";
import { EVALUATION_SEED } from "../evolution-evaluate";
import type { ArchetypeSearchAdapter } from "./adapter";
import { buildSemanticHandoff, assertProductionHandoff, lobbyRealizationChecksum } from "./handoff";
import { createLobbyAdapter } from "./lobby-adapter";
import { mutateSemanticPlan } from "./mutation";
import { preferCrowding } from "./pareto";
import { recomputePreservation } from "./preservation";
import { selectDiversityRescue } from "./diversity";
import { runSemanticEvolution } from "./controller";
import { evaluateLobbyCandidate, type SemanticEvaluation } from "./evaluate";
import { runLobbyCalibration, saveLobbySemanticBatch, semanticRunDirectory } from "./lobby-run";
import { semanticIdentity } from "./identity";
import type { CrowdingValue, PhenotypeRecord, SemanticCandidate, SemanticPlan, SemanticSearchConfig } from "./types";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function evaluation(
  objectives: { formal: number; spatial: number; atmospheric: number },
  raw: unknown,
  technicalValid = true,
): SemanticEvaluation {
  return {
    evaluationSeed: EVALUATION_SEED,
    technicalValid,
    failureReason: technicalValid ? null : "technical-invalid",
    objectives,
    criterionMatch: { complexity: objectives.formal },
    observed: { complexity: objectives.formal },
    criterionCategory: { complexity: "formal" },
    phenotype: { raw, occupancy: technicalValid ? [objectives.formal] : null },
    preview: null,
    previewSize: 0,
  };
}

function baseConfig(overrides: Partial<SemanticSearchConfig> = {}): SemanticSearchConfig {
  return {
    populationSize: 2,
    generations: 1,
    runSeed: 11,
    purpose: "development",
    duplicateAttemptBudget: 20,
    ...overrides,
  };
}

function varyingAdapter(): ArchetypeSearchAdapter {
  let n = 0;
  return {
    id: "test",
    archetypeId: "vertical-void",
    typologyId: "lobby",
    sampleExplorer(rng) {
      n += 1;
      const seed = Math.floor(rng() * 1_000_000_000);
      const index = Math.floor(rng() * 1_000_000_000);
      const family = n % 2 === 0 ? "b" : "a";
      return {
        plan: { adapterId: "test", archetypeId: "vertical-void", body: { x: 0, family, seed, index } },
        state: { seed, attempt: 0, index },
      };
    },
    genes: () => [
      { name: "x", kind: "continuous" },
      { name: "family", kind: "discrete", legal: ["a", "b", "c"] },
    ],
    repair: (plan) => ({ ok: true, plan, repairedFields: [] }),
    readGene: (plan, name) => (plan.body as Record<string, unknown>)[name],
    writeGene: (plan, name, value) => ({ ...plan, body: { ...(plan.body as Record<string, unknown>), [name]: value } }),
  };
}

function fixedAdapter(): ArchetypeSearchAdapter {
  const adapter = varyingAdapter();
  return {
    ...adapter,
    sampleExplorer: () => ({
      plan: { adapterId: "test", archetypeId: "vertical-void", body: { x: 1, family: "a" } },
      state: { seed: 1, attempt: 0, index: 1 },
    }),
  };
}

function familyDistance(left: { phenotype: PhenotypeRecord }, right: { phenotype: PhenotypeRecord }) {
  const a = (left.phenotype.raw as { family?: string } | null)?.family;
  const b = (right.phenotype.raw as { family?: string } | null)?.family;
  if (a === b) return 0;
  if ((a === "a" && b === "b") || (a === "b" && b === "a")) return 2;
  return 10;
}

async function testLobbyRealization() {
  for (const archetypeId of LOBBY_ARCHETYPE_IDS) {
    const adapter = createLobbyAdapter(archetypeId);
    const first = adapter.sampleExplorer(mulberry32(7));
    const second = adapter.sampleExplorer(mulberry32(7));
    assert(semanticIdentity(first.plan, first.state) === semanticIdentity(second.plan, second.state), `${archetypeId} explorer repeats`);
    assert(!JSON.stringify(first.plan.body).includes("driftX"), `${archetypeId} explorer is not a pose genome`);
    const candidate = {
      archetypeId,
      plan: first.plan,
      state: first.state,
    } as SemanticCandidate;
    const checksum = lobbyRealizationChecksum(candidate);
    assert(checksum.length > 10, `${archetypeId} realization checksum`);
    const mutated = mutateSemanticPlan(adapter, first.plan, first.state, "local-refinement", {
      useProvisionalAffinity: true,
      fieldCount: 1,
      continuousSigma: 1,
    }, mulberry32(9));
    assert(mutated.status !== "rejected", `${archetypeId} mutation rejected`);
    if (mutated.status !== "rejected") {
      assert(JSON.stringify(mutated.state) === JSON.stringify(first.state), `${archetypeId} mutant keeps realization state`);
      assert(!JSON.stringify(mutated.plan.body).includes("driftX"), `${archetypeId} mutant is not a pose genome`);
    }
  }
  const adapter = createLobbyAdapter("vertical-void");
  const sampled = adapter.sampleExplorer(mulberry32(3));
  const broken = adapter.writeGene(sampled.plan, "cx", -50);
  const repaired = adapter.repair(broken);
  assert(repaired.ok, "illegal cx repairs");
  if (repaired.ok) {
    assert(repaired.repairedFields.includes("cx"), "repair records cx");
    assert(adapter.readGene(repaired.plan, "cx") === 0, "cx is clamped into the field");
  }
  let threw = false;
  try {
    mutateSemanticPlan(adapter, sampled.plan, sampled.state, "objective-specific", { fieldCount: 1, fields: ["cx"] }, mulberry32(1));
  } catch (error) {
    threw = String(error).includes("gene-to-objective");
  }
  assert(threw, "specialist mutation does not guess a gene");
}

async function testDuplicateAndBudget() {
  let calls = 0;
  let threw = false;
  try {
    await runSemanticEvolution({
      config: baseConfig({ populationSize: 2, duplicateAttemptBudget: 3 }),
      adapter: fixedAdapter(),
      evaluate: () => {
        calls += 1;
        return evaluation({ formal: 1, spatial: 0, atmospheric: 0 }, { family: "a" });
      },
    });
  } catch (error) {
    threw = String(error).includes("duplicate attempt budget");
  }
  assert(threw, "exact duplicate exhausts the attempt budget");
  assert(calls === 0, "exact duplicate is not evaluated");

  calls = 0;
  const scores = [
    { formal: 1, spatial: 0.2, atmospheric: 0.2 },
    { formal: 0, spatial: 0, atmospheric: 0 },
  ];
  const run = await runSemanticEvolution({
    config: baseConfig({ populationSize: 2 }),
    adapter: varyingAdapter(),
    evaluate: () => {
      const score = scores[calls] ?? scores[0];
      const technicalValid = calls !== 1;
      calls += 1;
      return evaluation(score, { family: "a" }, technicalValid);
    },
  });
  assert(calls === 2, "legitimate failures count toward the generation budget");
  assert(run.candidates.length === 2, "failed evaluation stays in the record");
  assert(run.candidates[1].technicalValid === false, "technical failure is recorded");
  assert(!run.generations[0].paretoIds.includes(2), "technical failure is not Pareto");
  assert(run.candidates[0].fidelity.status === "uncalibrated", "uncalibrated is not pass");
  assert(run.provisional && run.calibration === "uncalibrated", "development run is provisional");
}

async function testGlobalRecomputeAndResume() {
  const scores = [
    { formal: 1, spatial: 0, atmospheric: 0 },
    { formal: 0, spatial: 1, atmospheric: 0 },
    { formal: 1, spatial: 1, atmospheric: 0 },
    { formal: 0, spatial: 0, atmospheric: 0 },
  ];
  let calls = 0;
  const evaluate = () => {
    const score = scores[calls];
    calls += 1;
    return evaluation(score, { family: "a", n: calls });
  };
  const config = baseConfig({
    populationSize: 2,
    generations: 2,
    composition: { 2: { explorers: 2, pareto: 0, diversity: 0, specialist: 0 } },
  });
  const run = await runSemanticEvolution({ config, adapter: varyingAdapter(), evaluate });
  assert(calls === 4, "two generations evaluate 4 new candidates");
  assert(run.generations[0].paretoIds.includes(1), "G01 keeps the first tradeoff");
  assert(!run.generations[1].paretoIds.includes(1), "later generation removes a dominated candidate");
  assert(run.generations[1].paretoIds.includes(3), "later candidate can enter Pareto");
  assert(run.candidates[0].current.pareto === false, "current Pareto is not frozen at birth");
  assert(run.generations[0].leftParetoIds.length === 0, "G01 snapshot keeps its own Pareto set");
  assert(!("orientationEliteIds" in run.generations[1]), "orientation elites are not a semantic role");

  const partial = await runSemanticEvolution({
    config: { ...config, generations: 1 },
    adapter: varyingAdapter(),
    evaluate: () => evaluation(scores[0], { family: "a" }),
  });
  let resumedCalls = 0;
  const resumed = await runSemanticEvolution({
    config,
    adapter: varyingAdapter(),
    previous: JSON.parse(JSON.stringify(partial)),
    evaluate: () => {
      resumedCalls += 1;
      return evaluation(scores[resumedCalls + 1], { family: "b" });
    },
  });
  assert(resumedCalls === 2, "resume does not repeat finished evaluations");
  assert(resumed.candidates.length === 4, "resume appends the next generation only");
  assert(resumed.candidates[0].id === 1 && resumed.candidates[2].generation === 2, "carried ids stay put");
}

async function testCrowdingSelection() {
  const scores = [
    { formal: 1, spatial: 0, atmospheric: 0 },
    { formal: 0, spatial: 1, atmospheric: 0 },
    { formal: 0, spatial: 0.2, atmospheric: 1 },
  ];
  let calls = 0;
  const seed = 19;
  const gen1 = await runSemanticEvolution({
    config: baseConfig({ populationSize: 3, generations: 1, runSeed: seed }),
    adapter: varyingAdapter(),
    evaluate: () => {
      const score = scores[calls];
      calls += 1;
      return evaluation(score, { family: calls === 1 ? "a" : "b" });
    },
  });
  const snapshot = gen1.generations[0];
  const ids = snapshot.paretoIds;
  const crowding = new Map<number, CrowdingValue>(Object.entries(snapshot.crowding).map(([id, value]) => [Number(id), value]));
  const rng = mulberry32((seed ^ Math.imul(2, 0x9e3779b1)) >>> 0);
  const a = ids[Math.floor(rng() * ids.length)];
  const b = ids[Math.floor(rng() * ids.length)];
  const expected = preferCrowding(a, b, crowding);
  const gen2 = await runSemanticEvolution({
    config: baseConfig({
      populationSize: 3,
      generations: 2,
      runSeed: seed,
      composition: { 2: { explorers: 0, pareto: 3, diversity: 0, specialist: 0 } },
      paretoMutation: { fields: ["x"], fieldCount: 1, continuousSigma: 1 },
    }),
    adapter: varyingAdapter(),
    previous: gen1,
    evaluate: () => evaluation({ formal: 0.4, spatial: 0.4, atmospheric: 0.4 }, { family: "c" }),
    mutate: (() => {
      let child = 0;
      return (_adapter: ArchetypeSearchAdapter, plan: SemanticPlan, state: SemanticCandidate["state"]) => {
        child += 1;
        return {
          status: "changed" as const,
          plan: { ...plan, body: { ...(plan.body as Record<string, unknown>), x: child } },
          state,
          changes: [{ field: "x", oldValue: 0, requestedValue: child, repairedValue: child }],
          repairedFields: [] as string[],
        };
      };
    })(),
  });
  assert(a !== b, "tournament drew two Pareto members");
  assert(gen2.generations[1].births[0].parentId === expected, "Pareto parent selection uses current crowding");
  assert(gen2.generations[1].births[0].parentSelectionRole === "pareto", "selection role is stored");
  assert(Object.values(snapshot.crowding).includes("boundary"), "global front stores boundary crowding");
}

async function testDiversityCatalogAndHandoff() {
  const specs = [
    { objectives: { formal: 1, spatial: 1, atmospheric: 1 }, family: "a" },
    { objectives: { formal: 0, spatial: 0, atmospheric: 0 }, family: "b" },
    { objectives: { formal: 0, spatial: 0, atmospheric: 0.1 }, family: "c" },
  ];
  let calls = 0;
  const run = await runSemanticEvolution({
    config: baseConfig({
      populationSize: 3,
      diversity: { distance: familyDistance, rescueThreshold: 1, tagThreshold: 0 },
      catalogDedup: { distance: familyDistance, redundancyThreshold: 5 },
    }),
    adapter: varyingAdapter(),
    evaluate: () => {
      const spec = specs[calls];
      calls += 1;
      return evaluation(spec.objectives, { family: spec.family });
    },
  });
  const snapshot = run.generations[0];
  assert(snapshot.diversityRescueIds.includes(2) && snapshot.diversityRescueIds.includes(3), "farthest morphologies are rescued");
  assert(snapshot.diversityRescueIds[0] === 3, "the farther morphology is rescued first");
  assert(snapshot.diversityTagIds.includes(1), "Pareto candidate can carry a Diversity tag");
  assert(run.candidates[0].current.diversity === "tag", "tag is stored separately from rescue");
  assert(run.candidates[1].current.diversity === "rescue", "rescue is stored separately from tag");
  const hidden = run.catalog.entries.flatMap((entry) => entry.hiddenIds);
  assert(hidden.includes(2), "near-duplicate is hidden from the catalog");
  assert(run.candidates.some((candidate) => candidate.id === 2), "hidden candidate stays in the research record");
  assert(snapshot.parentPools.diversity.includes(2), "hidden candidate can still reproduce");
  const representative = run.catalog.entries.find((entry) => entry.hiddenIds.includes(2));
  assert(representative?.representativeId === 1, "more preservation roles supply the visible representative");
  const paretoHandoff = buildSemanticHandoff(run, 1, (candidate) => JSON.stringify(candidate.plan.body));
  const rescueHandoff = buildSemanticHandoff(run, 3, (candidate) => JSON.stringify(candidate.plan.body));
  assert(paretoHandoff.roles.includes("pareto") && rescueHandoff.roles.includes("diversity"), "Pareto and Diversity Rescue can hand off");
  assert(rescueHandoff.checksum === JSON.stringify(run.candidates[2].plan.body), "handoff checksum replays the stored plan");
  let blocked = false;
  try {
    buildSemanticHandoff(run, 2, () => "x");
  } catch (error) {
    blocked = String(error).includes("not a visible");
  }
  assert(blocked, "handoff is not limited to archive ids and does not emit hidden duplicates");
  let productionBlocked = false;
  try {
    assertProductionHandoff(paretoHandoff);
  } catch (error) {
    productionBlocked = String(error).includes("not a final selection");
  }
  assert(productionBlocked, "development handoff is not a calibrated selection");
}

async function testFidelityGate() {
  const failing = { id: 9, phenotype: { raw: { family: "z" }, occupancy: [0] } };
  const result = selectDiversityRescue(
    [{ id: 1, phenotype: { raw: { family: "a" }, occupancy: [1] } }],
    [failing],
    familyDistance,
    1,
  );
  assert(result.rescuedIds.length === 1, "distance helper can rescue a far point");
  const gated = selectDiversityRescue([{ id: 1, phenotype: { raw: { family: "a" }, occupancy: [1] } }], [], familyDistance, 1);
  assert(gated.rescuedIds.length === 0, "an empty eligible pool rescues nobody");

  let calls = 0;
  const run = await runSemanticEvolution({
    config: baseConfig({
      populationSize: 2,
      fidelityProfile: { id: "fixture", categoryFloors: { formal: 0.5, spatial: 0.5, atmospheric: 0.5 }, criterionFloors: {} },
      diversity: { distance: familyDistance, rescueThreshold: 0, tagThreshold: 0 },
    }),
    adapter: varyingAdapter(),
    evaluate: () => {
      calls += 1;
      const high = calls === 1;
      return evaluation(
        high ? { formal: 1, spatial: 1, atmospheric: 1 } : { formal: 0.1, spatial: 0.1, atmospheric: 0.1 },
        { family: high ? "a" : "z" },
      );
    },
  });
  assert(run.candidates[0].fidelity.status === "pass", "explicit floors can pass");
  assert(run.candidates[1].fidelity.status === "fail", "explicit floors can fail");
  assert(!run.generations[0].diversityRescueIds.includes(2), "fidelity failure is not rescued");
  assert(!run.generations[0].paretoIds.includes(2), "fidelity failure is not Pareto");
  assert(run.provisional, "a development run with a fixture profile is still provisional");
}

async function testMultiRoleAndSpecialists() {
  const specs = [
    { objectives: { formal: 1, spatial: 0, atmospheric: 0 }, family: "a" },
    { objectives: { formal: 0, spatial: 1, atmospheric: 0 }, family: "b" },
  ];
  let calls = 0;
  const run = await runSemanticEvolution({
    config: baseConfig({
      populationSize: 2,
      generations: 2,
      runSeed: 5,
      composition: { 2: { explorers: 0, pareto: 1, diversity: 1, specialist: 0 } },
      paretoMutation: { fields: ["x"], fieldCount: 1, continuousSigma: 2 },
      diversityMutation: { fields: ["family"], fieldCount: 1 },
      diversityParentSelection: { kind: "provisional-uniform" },
      diversity: { distance: familyDistance, rescueThreshold: 1, tagThreshold: 1 },
    }),
    adapter: varyingAdapter(),
    evaluate: () => {
      const spec = specs[calls] ?? { objectives: { formal: 0.4, spatial: 0.4, atmospheric: 0.4 }, family: "c" };
      calls += 1;
      return evaluation(spec.objectives, { family: spec.family });
    },
  });
  const parents = run.generations[0].parentPools;
  assert(parents.pareto.includes(1) && parents.diversity.includes(1), "a multi-role candidate is eligible in both pools");
  assert(run.candidates.filter((candidate) => candidate.id === 1).length === 1, "a multi-role candidate is stored once");
  const births = run.generations[1].births;
  assert(births.map((birth) => birth.parentSelectionRole).sort().join(",") === "diversity,pareto", "each birth records one selection role");
  assert(new Set(births.map((birth) => birth.mutationIntent)).size === 2, "roles do not blend into one mutation");
  assert(births.length === 2, "two roles do not add children beyond the allocation");

  const bare = await runSemanticEvolution({
    config: baseConfig({ populationSize: 1 }),
    adapter: varyingAdapter(),
    evaluate: () => evaluation({ formal: 1, spatial: 1, atmospheric: 1 }, { family: "a" }),
  });
  assert(bare.generations[0].specialistsEnabled === false, "specialists default off");
  assert(bare.generations[0].specialistIds.formal.length === 0, "the default arm has no specialists");

  const shared = specialistFixture();
  const without = recomputePreservation(shared, "development", false, { distance: familyDistance, rescueThreshold: 1, tagThreshold: 1 });
  const withSpecialists = recomputePreservation(shared, "development", true, { distance: familyDistance, rescueThreshold: 1, tagThreshold: 1 });
  assert(without.paretoIds.join(",") === withSpecialists.paretoIds.join(","), "specialists do not change Pareto");
  assert(withSpecialists.specialistIds.formal.includes(5), "the experimental arm can name a Formal specialist");
  assert(without.diversityRescueIds.includes(4), "without specialists that morphology is rescued");
  assert(!withSpecialists.diversityRescueIds.includes(4), "a specialist morphology blocks a nearby rescue");
  assert(withSpecialists.diversityRescueIds.includes(6), "a morphology far from specialists is still rescued");
}

function specialistFixture(): SemanticCandidate[] {
  const make = (
    id: number,
    objectives: SemanticCandidate["objectives"],
    family: string,
  ): SemanticCandidate => ({
    id,
    archetypeId: "vertical-void",
    typologyId: "lobby",
    generation: 1,
    birthIndex: id,
    origin: "explorer",
    plan: { adapterId: "test", archetypeId: "vertical-void", body: { id } },
    state: { seed: id, attempt: 0, index: id },
    lineage: { parentId: null, parentSelectionRole: null, mutationIntent: null, changes: [], repairedFields: [] },
    evaluationSeed: 1,
    technicalValid: true,
    failureReason: null,
    objectives,
    criterionMatch: {},
    observed: {},
    criterionCategory: {},
    fidelity: { status: "uncalibrated", profileId: null, categories: null, criteria: null, categoryValues: null },
    phenotype: { raw: { family }, occupancy: [id] },
    preview: null,
    current: { pareto: false, crowding: null, specialist: null, diversity: "none" },
  });
  return [
    make(1, { formal: 0.9, spatial: 0.9, atmospheric: 0.9 }, "pareto"),
    make(2, { formal: 0.2, spatial: 0.2, atmospheric: 0.2 }, "low"),
    make(3, { formal: 0.3, spatial: 0.3, atmospheric: 0.3 }, "low"),
    make(4, { formal: 0.2, spatial: 0.2, atmospheric: 0.2 }, "specialist"),
    make(5, { formal: 0.85, spatial: 0.55, atmospheric: 0.55 }, "specialist"),
    make(6, { formal: 0.25, spatial: 0.22, atmospheric: 0.22 }, "remote"),
  ];
}

async function testProductionGuard() {
  let threw = false;
  try {
    await runSemanticEvolution({
      config: baseConfig({ purpose: "production", populationSize: 4, generations: 4 }),
      adapter: varyingAdapter(),
      evaluate: () => evaluation({ formal: 1, spatial: 1, atmospheric: 1 }, { family: "a" }),
    });
  } catch (error) {
    threw = String(error).includes("100 new candidates");
  }
  assert(threw, "production keeps the 100-candidate generation budget");
}

async function testOneLobbySimulation() {
  const adapter = createLobbyAdapter("vertical-void");
  const sampled = adapter.sampleExplorer(mulberry32(4));
  const evaluated = evaluateLobbyCandidate(sampled.plan, sampled.state);
  assert(evaluated.evaluationSeed === EVALUATION_SEED, "evaluation seed stays fixed");
  assert(evaluated.phenotype.occupancy?.length === 400, "occupancy uses the shared 20 by 20 domain");
  assert(evaluated.phenotype.raw != null, "raw phenotype is kept");
  const plan = sampled.plan.body as { driftX?: number };
  assert(plan.driftX == null, "simulation did not require a pose genome");
}

async function testCalibrationWorkflow() {
  let missingStrategy = false;
  try {
    await runSemanticEvolution({
      config: baseConfig({
        populationSize: 1,
        generations: 2,
        composition: { 2: { explorers: 0, pareto: 0, diversity: 1, specialist: 0 } },
        diversityMutation: { fields: ["family"], fieldCount: 1 },
      }),
      adapter: varyingAdapter(),
      evaluate: () => evaluation({ formal: 1, spatial: 1, atmospheric: 1 }, { family: "a" }),
    });
  } catch (error) {
    missingStrategy = String(error).includes("parent-selection strategy");
  }
  assert(missingStrategy, "uniform Diversity selection is not implied");

  const reallocated = await runSemanticEvolution({
    config: baseConfig({
      populationSize: 1,
      generations: 2,
      composition: { 2: { explorers: 0, pareto: 0, diversity: 1, specialist: 0 } },
      diversityMutation: { fields: ["family"], fieldCount: 1 },
      diversityParentSelection: { kind: "provisional-uniform" },
    }),
    adapter: varyingAdapter(),
    evaluate: () => evaluation({ formal: 1, spatial: 1, atmospheric: 1 }, { family: "a" }),
  });
  assert(reallocated.generations[1].reallocatedPools.includes("diversity"), "development records an empty Diversity pool");
  assert(reallocated.generations[1].reallocatedToExplorer === 1, "development reallocates that slot to explorers");
  assert(reallocated.generations[1].compositionRequested.diversity === 1, "the requested mix stays visible");
  assert(reallocated.candidates[1].origin === "explorer", "the reallocated birth is an explorer");

  let researchBlocked = false;
  let researchCalls = 0;
  try {
    await runSemanticEvolution({
      config: baseConfig({
        purpose: "production",
        populationSize: 100,
        generations: 4,
        fidelityProfile: { id: "open", categoryFloors: { formal: 0, spatial: 0, atmospheric: 0 }, criterionFloors: {} },
        composition: {
          2: { explorers: 0, pareto: 0, diversity: 100, specialist: 0 },
          3: { explorers: 100, pareto: 0, diversity: 0, specialist: 0 },
          4: { explorers: 100, pareto: 0, diversity: 0, specialist: 0 },
        },
        diversityMutation: { fields: ["family"], fieldCount: 1 },
        diversityParentSelection: { kind: "provisional-uniform" },
      }),
      adapter: varyingAdapter(),
      evaluate: () => {
        researchCalls += 1;
        return evaluation({ formal: 0.5, spatial: 0.5, atmospheric: 0.5 }, { family: "a" });
      },
    });
  } catch (error) {
    researchBlocked = String(error).includes("parent pool is empty") && String(error).includes("not changed");
  }
  assert(researchBlocked, "a research run does not rewrite an empty parent pool into explorers");
  assert(researchCalls === 100, "the failure happens before the next generation is evaluated");

  let draw = 0;
  const chosen = await runSemanticEvolution({
    config: baseConfig({
      populationSize: 2,
      generations: 2,
      composition: { 2: { explorers: 0, pareto: 0, diversity: 2, specialist: 0 } },
      diversityMutation: { fields: ["family"], fieldCount: 1 },
      diversityParentSelection: { kind: "custom", select: (ids) => Math.max(...ids) },
      diversity: { distance: familyDistance, rescueThreshold: 1, tagThreshold: 1 },
    }),
    adapter: varyingAdapter(),
    evaluate: () => {
      draw += 1;
      const first = draw % 2 === 1;
      return evaluation(first ? { formal: 1, spatial: 0, atmospheric: 0 } : { formal: 0, spatial: 1, atmospheric: 0 }, {
        family: first ? "a" : "b",
      });
    },
  });
  assert(chosen.generations[1].births.every((birth) => birth.parentId === 2), "a custom Diversity strategy replaces the provisional draw");

  let calls = 0;
  const batch = await runLobbyCalibration({
    archetypeId: "vertical-void",
    count: 3,
    runSeed: 4,
    duplicateAttemptBudget: 8,
    evaluate: () => {
      calls += 1;
      const technicalValid = calls !== 2;
      return {
        ...evaluation(
          technicalValid ? { formal: 0.4, spatial: 0.4, atmospheric: 0.4 } : { formal: 0, spatial: 0, atmospheric: 0 },
          { family: "a" },
          technicalValid,
        ),
        preview: new Uint8Array([10, 20, 30, 40]),
        previewSize: 2,
      };
    },
  });
  assert(batch.run.purpose === "calibration" && batch.run.calibration === "uncalibrated" && batch.run.provisional, "calibration is not a production result");
  assert(batch.run.generations.length === 1 && batch.run.generations[0].preservationApplied === false, "calibration does not require preservation");
  assert(batch.run.generations[0].paretoIds.length === 0, "an empty Pareto list is not a fidelity judgment");
  assert(batch.run.candidates.every((candidate) => candidate.origin === "explorer"), "calibration does not mutate");
  assert(batch.run.candidates[0].fidelity.status === "uncalibrated", "calibration does not mark fidelity as pass");
  assert(batch.run.candidates[1].technicalValid === false, "a failed calibration candidate is retained");
  assert(calls === 3, "every calibration attempt is evaluated");
  const directory = saveLobbySemanticBatch(batch, join(mkdtempSync(join(tmpdir(), "lm-semantic-")), "semantic-runs"));
  const saved = JSON.parse(readFileSync(join(directory, "run.json"), "utf8")) as { candidates: { preview: { file: string } | null; plan: { body: unknown } }[] };
  assert(saved.candidates[0].preview?.file === "previews/1.png", "an inspection preview is stored beside the run");
  assert(!JSON.stringify(saved.candidates[0].plan.body).includes("driftX"), "the saved plan is semantic");
  assert(readFileSync(join(directory, "previews", "1.png"))[0] === 137, "the preview is a PNG");
  assert(semanticRunDirectory("vertical-void").replace(/\\/g, "/").endsWith("data/semantic-runs/vertical-void"), "semantic output is separate from pose runs");
  let blockedPoseDir = false;
  try {
    semanticRunDirectory("vertical-void", join("data", "evolution"));
  } catch (error) {
    blockedPoseDir = String(error).includes("legacy pose catalog");
  }
  assert(blockedPoseDir, "semantic output cannot replace data/evolution");
}

main();

async function main() {
  await testLobbyRealization();
  await testDuplicateAndBudget();
  await testGlobalRecomputeAndResume();
  await testCrowdingSelection();
  await testDiversityCatalogAndHandoff();
  await testFidelityGate();
  await testMultiRoleAndSpecialists();
  await testProductionGuard();
  await testCalibrationWorkflow();
  await testOneLobbySimulation();
  console.log("semantic skill 2 checks passed");
}
