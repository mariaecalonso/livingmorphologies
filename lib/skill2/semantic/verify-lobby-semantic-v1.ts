import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mulberry32 } from "../../physarum";
import { slimeControlsFromTranslation } from "../../skill1/slime-controls";
import { translateArchetype } from "../../skill1/translate";
import { realizeLobbyPlan } from "../../skill1/lobby-realization";
import { selectDiversityRescue } from "./diversity";
import { descriptorDistance, deriveDescriptorV1 } from "./descriptor-v1";
import { createLobbyAdapter } from "./lobby-adapter";
import {
  LOBBY_SEMANTIC_V1_ARCHETYPES,
  LOBBY_SEMANTIC_V1_COMPOSITION,
  LOBBY_V1_UNSPANNED,
  assessLobbySemanticV1,
  lobbyParetoGenes,
  lobbySemanticV1Config,
  mutateLobbySemanticV1,
} from "./lobby-semantic-v1";
import { lobbyState } from "./lobby-adapter";
import type { SemanticCandidate, SemanticRun } from "./types";
import { publicationProblems, buildPublishedCatalog, loadPublishedCatalog, blockedCatalogRecord, writePublishedCatalog } from "./publish-catalog";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function testPublishedBundle() {
  const run = descriptorCandidate(1, 0.2);
  const problems = publicationProblems(fakeRun([run]), 1);
  assert(problems.some((problem) => problem.includes("generations")), "an unfinished run is not publishable");
  const finished = fakeRun([run, { ...run, id: 2, birthIndex: 0, generation: 2 }, { ...run, id: 3, birthIndex: 0, generation: 3 }, { ...run, id: 4, birthIndex: 0, generation: 4 }]);
  finished.completedGenerations = 4;
  finished.generations = [1, 2, 3, 4].map((generation) => ({
    generation,
    candidateIds: [generation],
    newCandidateIds: [generation],
    technicallyValidIds: [generation],
    fidelityEligibleIds: [generation],
    paretoIds: [generation],
    enteredParetoIds: [],
    leftParetoIds: [],
    crowding: {},
    objectiveExtremes: { formal: null, spatial: null, atmospheric: null },
    diversityStatus: "uncalibrated" as const,
    diversityTagIds: [],
    diversityRescueIds: [],
    specialistsEnabled: false,
    specialistIds: { formal: [], spatial: [], atmospheric: [] },
    parentPools: { pareto: [], diversity: [], specialist: { formal: [], spatial: [], atmospheric: [] } },
    preservationApplied: generation === 4,
    compositionRequested: { explorers: 1, pareto: 0, diversity: 0, specialist: 0 },
    compositionUsed: { explorers: 1, pareto: 0, diversity: 0, specialist: 0 },
    reallocatedToExplorer: 0,
    reallocatedPools: [],
    births: [],
    calibration: "calibrated" as const,
    fidelityProfileId: "g01-lower-mode-v1",
  }));
  finished.catalog = { dedup: "uncalibrated", redundancyThreshold: null, entries: [{ representativeId: 1, hiddenIds: [], roleCount: 1 }] };
  finished.fidelityCalibration = {
    method: "g01-lower-mode-v1",
    methodConstants: {},
    status: "warn",
    archetypeId: "linear-gallery",
    referenceCandidateIds: [1],
    primaryFamilyGene: "kind",
    categoryRules: emptyRules(),
    criterionRules: {},
    excludedCriteria: [],
    diagnostics: { population: 1, technicalValid: 1, technicalInvalid: 0, fidelityPass: 1, fidelityFail: 0, warnings: ["example"], blocks: [] },
    familyCoverage: { before: {}, after: {}, unsampled: [], eliminated: [] },
  };
  finished.descriptorProfile = { method: "descriptor-v1", features: [], threshold: { eligibleCount: 1, nearestNeighbor: { min: 0.2, median: 0.2, max: 0.2 }, median: 0.2, mad: 0.1, sigma: 0.14826, value: 0.34826 }, block: null };
  const published = buildPublishedCatalog(finished);
  assert(published.candidates.length === 1, "only the visible catalog candidate is published");
  assert(published.candidates[0].plan.body != null && published.candidates[0].state.seed === 1, "the published candidate keeps plan and salt");
  assert(published.fidelity.warnings.includes("example"), "a warning is published with the catalog");
  assert(publicationProblems(finished, 4).length === 0, "a warned but complete search is publishable");
  const blocked = blockedCatalogRecord(finished);
  const directory = mkdtempSync(join(tmpdir(), "lm-catalog-"));
  writePublishedCatalog(blocked, directory);
  let refused = false;
  try {
    loadPublishedCatalog(directory);
  } catch (error) {
    refused = String(error).includes("not a completed catalog");
  }
  assert(refused, "a blocked record is not a usable catalog");
}

function emptyRules() {
  const fence = { floor: null, median: null, sigma: null, gap: null, admittedCriteria: [], excludedCriteria: [] };
  return { formal: fence, spatial: fence, atmospheric: fence };
}

function fakeRun(candidates: SemanticCandidate[]) {
  return {
    schemaVersion: 3 as const,
    purpose: "production" as const,
    provisional: true,
    calibration: "calibrated" as const,
    fidelityProfileId: "g01-lower-mode-v1",
    archetypeId: "linear-gallery",
    typologyId: "lobby",
    adapterId: "lobby",
    config: lobbySemanticV1Config("linear-gallery"),
    evaluationSeed: 1,
    completedGenerations: 1,
    fidelityCalibration: null,
    pendingGeneration: null,
    descriptorProfile: null,
    candidates,
    generations: [],
    catalog: { dedup: "uncalibrated" as const, redundancyThreshold: null, entries: [] },
  } as SemanticRun;
}

function testComposition() {
  for (const generation of [2, 3, 4] as const) {
    const mix = LOBBY_SEMANTIC_V1_COMPOSITION[generation];
    if (!mix) throw new Error("missing mix");
    const total = mix.explorers + mix.pareto + mix.diversity + mix.specialist;
    assert(total === 100, "each lobby-semantic-v1 generation adds 100 candidates");
    assert(mix.specialist === 0, "specialists stay off");
  }
  const config = lobbySemanticV1Config("linear-gallery");
  assert(config.diversityParentSelection?.kind === "provisional-uniform", "diversity parents use the named provisional strategy");
  assert(config.catalogDedup == null, "catalog dedup is not filtering this search");
  assert(config.specialists === false, "the profile does not enable specialists");
}

function testArchetypeGenes() {
  for (const archetypeId of LOBBY_SEMANTIC_V1_ARCHETYPES) {
    const source = createLobbyAdapter(archetypeId);
    const first = source.sampleExplorer(mulberry32(1));
    const second = source.sampleExplorer(mulberry32(1));
    const readiness = assessLobbySemanticV1(source, first);
    assert(readiness.status === "ready", `${archetypeId} is not ready: ${readiness.reasons.join("; ")}`);
    assert(readiness.paretoGenes.length > 0, `${archetypeId} has a spanned numeric gene`);
    for (const name of LOBBY_V1_UNSPANNED[archetypeId]) assert(!readiness.paretoGenes.includes(name), `${archetypeId} does not invent a span for ${name}`);
    assert(readiness.diversityGene != null && !readiness.paretoGenes.includes(readiness.diversityGene), `${archetypeId} keeps the family gene out of Pareto mutation`);
    const base = translateArchetype(archetypeId);
    const one = realizeLobbyPlan(base, slimeControlsFromTranslation(base), first.plan.body as never, lobbyState(first.state));
    const two = realizeLobbyPlan(base, slimeControlsFromTranslation(base), second.plan.body as never, lobbyState(second.state));
    assert(one.ok && two.ok && JSON.stringify(one.attractors) === JSON.stringify(two.attractors), `${archetypeId} realization repeats`);
  }
}

function testMutation() {
  const source = createLobbyAdapter("compressed-sequential");
  const sampled = source.sampleExplorer(mulberry32(4));
  const pareto = mutateLobbySemanticV1(source, sampled.plan, sampled.state, "local-refinement", { fieldCount: 1 }, mulberry32(5));
  assert(pareto.status !== "rejected", "pareto mutation repairs");
  if (pareto.status !== "rejected") {
    assert(JSON.stringify(pareto.state) === JSON.stringify(sampled.state), "pareto mutation keeps the salt");
    assert(pareto.changes.length === 1, "pareto mutation changes one gene");
    assert(lobbyParetoGenes(source, sampled.plan).includes(pareto.changes[0].field), "the gene is a spanned local field");
    assert(pareto.changes[0].field !== "kind", "pareto mutation does not change the family gene");
  }
  const diversity = mutateLobbySemanticV1(source, sampled.plan, sampled.state, "morphological-exploration", { fieldCount: 1 }, mulberry32(6));
  assert(diversity.status === "changed", "diversity mutation changes the family");
  if (diversity.status === "changed") {
    assert(diversity.changes.every((change) => change.field === "kind"), "diversity mutation does not perturb numeric genes");
    assert(diversity.changes[0].oldValue !== diversity.changes[0].requestedValue, "the family value actually changes");
    assert(JSON.stringify(diversity.state) === JSON.stringify(sampled.state), "diversity mutation keeps the salt");
  }
}

function testDescriptor() {
  const features = [
    { id: "topology.anisotropy", family: "topology" as const, p10: 0, p90: 1, robustRange: 1, active: true },
    { id: "connection.meanBridgeThickness", family: "path" as const, p10: 0, p90: 1, robustRange: 1, active: true },
    { id: "connection.meanBridgeLength", family: "path" as const, p10: 0, p90: 1, robustRange: 1, active: true },
    { id: "proportion.medialRadiusP50", family: "path" as const, p10: 0, p90: 1, robustRange: 1, active: true },
    { id: "activity.centerProximity", family: "occupancy" as const, p10: 0, p90: 0, robustRange: 0, active: false },
  ];
  const distance = descriptorDistance(features);
  const left = phenotype({ "topology.anisotropy": 0, "connection.meanBridgeThickness": 0, "connection.meanBridgeLength": 0, "proportion.medialRadiusP50": 0 });
  const right = phenotype({ "topology.anisotropy": 1, "connection.meanBridgeThickness": 0, "connection.meanBridgeLength": 0, "proportion.medialRadiusP50": 0 });
  const gap = distance({ id: 1, phenotype: left }, { id: 2, phenotype: right });
  assert(Math.abs(gap - 0.5) < 1e-9, "descriptor families are weighted equally");
  const moved = phenotype({ "topology.anisotropy": 0, "connection.meanBridgeThickness": 0, "connection.meanBridgeLength": 0, "proportion.medialRadiusP50": 0, "activity.centerProximity": 1 });
  assert(distance({ id: 1, phenotype: left }, { id: 3, phenotype: moved }) === 0, "an inactive position feature does not change distance");

  const candidates = [0, 0.2, 0.8, 1].map((value, index) => descriptorCandidate(index + 1, value));
  const profile = deriveDescriptorV1(candidates);
  assert(profile.block == null && profile.threshold != null, "G01 derives a finite diversity threshold");
  assert(profile.features.some((feature) => feature.id === "topology.anisotropy" && feature.active), "a varying feature stays active");
  assert(profile.features.some((feature) => !feature.active), "a flat feature is excluded");
  const rescued = selectDiversityRescue(
    [{ id: 1, phenotype: left }],
    [{ id: 2, phenotype: right }],
    () => profile.threshold?.value ?? 0,
    profile.threshold?.value ?? 0,
  );
  assert(rescued.rescuedIds[0] === 2, "a distance equal to the locked threshold is rescued");
}

function phenotype(values: Record<string, number>) {
  const measurements: Record<string, Record<string, number>> = {};
  for (const [id, value] of Object.entries(values)) {
    const [group, field] = id.split(".");
    measurements[group] = { ...(measurements[group] ?? {}), [field]: value };
  }
  return { raw: measurements, occupancy: [0, 1, 0] };
}

function descriptorCandidate(id: number, anisotropy: number): SemanticCandidate {
  const raw: Record<string, Record<string, number>> = {};
  const set = (idPath: string, value: number) => {
    const [group, field] = idPath.split(".");
    raw[group] = { ...(raw[group] ?? {}), [field]: value };
  };
  set("topology.anisotropy", anisotropy);
  set("topology.connectedComponentCount", 1);
  set("mass.concentrationCount", 2);
  return {
    id,
    archetypeId: "linear-gallery",
    typologyId: "lobby",
    generation: 1,
    birthIndex: id - 1,
    origin: "explorer",
    plan: { adapterId: "lobby", archetypeId: "linear-gallery", body: { kind: "row" } },
    state: { seed: id, attempt: 0, index: id },
    lineage: { parentId: null, parentSelectionRole: null, mutationIntent: null, changes: [], repairedFields: [] },
    evaluationSeed: 1,
    technicalValid: true,
    failureReason: null,
    objectives: { formal: 0.5, spatial: 0.5, atmospheric: 0.5 },
    criterionMatch: {},
    observed: {},
    criterionCategory: {},
    fidelity: { status: "pass", profileId: "g01-lower-mode-v1", categories: null, criteria: null, categoryValues: null },
    phenotype: { raw, occupancy: [id] },
    preview: null,
    current: { pareto: false, crowding: null, specialist: null, diversity: "none" },
  };
}

testComposition();
testArchetypeGenes();
testMutation();
testDescriptor();
testPublishedBundle();
console.log("lobby-semantic-v1 checks passed");
