import { mulberry32 } from "../../physarum";
import type { ArchetypeSearchAdapter } from "./adapter";
import { buildCombinedCatalog } from "./catalog";
import { assignFidelity } from "./fidelity";
import { deriveG01Fidelity, fidelityDetailFor } from "./fidelity-method";
import { semanticIdentity } from "./identity";
import { mutateSemanticPlan, type MutationAttempt } from "./mutation";
import { recomputePreservation, type PreservationResult } from "./preservation";
import type {
  BirthRecord,
  CrowdingValue,
  FieldChange,
  GenerationSnapshot,
  MutationIntent,
  ParentSelectionRole,
  PoolMix,
  PendingGeneration,
  PlannedBirthRecord,
  SemanticCandidate,
  SemanticPlan,
  SemanticRun,
  SemanticSearchConfig,
  RealizationState,
} from "./types";
import { SEMANTIC_SCHEMA_VERSION } from "./types";
import { EVALUATION_SEED } from "../evolution-evaluate";
import type { SemanticEvaluation } from "./evaluate";
import { selectCrowdingParent } from "./pareto";
import { selectDiversityParent } from "./parent-selection";

export type { SemanticEvaluation } from "./evaluate";

type PlannedBirth = PlannedBirthRecord;

/**
 * Semantic evolutionary controller.
 * Each generation adds `populationSize` new evaluations. Preserved candidates
 * are not simulated again. Generation composition, mutation profiles, fidelity
 * floors, and morphology distance are configuration. This file does not supply
 * research defaults for those unlocked values.
 * Parent draws for a generation are a pure function of `runSeed` and the
 * generation index, so a resumed run does not replay finished evaluations.
 */
export function runSemanticEvolution(args: {
  config: SemanticSearchConfig;
  adapter: ArchetypeSearchAdapter;
  evaluate: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation;
  previous?: SemanticRun | null;
  mutate?: typeof mutateSemanticPlan;
  onEvaluated?: (candidate: SemanticCandidate, evaluation: SemanticEvaluation) => void;
  checkpoint?: (run: SemanticRun, phase: "birth-plan" | "candidate" | "fidelity" | "descriptor" | "generation") => void;
  /** Optional G01 post-process. May install a diversity distance. A block stops before preservation. */
  afterG01?: (run: SemanticRun) => { block?: string } | void;
}): SemanticRun {
  const config = { ...args.config, specialists: args.config.specialists ?? false };
  validateConfig(config);
  if (args.previous?.fidelityCalibration?.status === "block" || args.previous?.descriptorProfile?.block) return args.previous;
  const run = args.previous ? continueRun(args.previous, config, args.adapter) : createRun(config, args.adapter);
  const mutate = args.mutate ?? mutateSemanticPlan;
  for (let generation = run.completedGenerations + 1; generation <= config.generations; generation += 1) {
    const rng = mulberry32((config.runSeed ^ Math.imul(generation, 0x9e3779b1)) >>> 0);
    const previous = run.generations[run.generations.length - 1] ?? null;
    const pending = run.pendingGeneration?.generation === generation ? run.pendingGeneration : null;
    const planned = pending ?? planGeneration(run, generation, config, args.adapter, rng, mutate, previous);
    if (!pending) {
      run.pendingGeneration = {
        generation,
        births: planned.births,
        requested: planned.requested,
        used: planned.used,
        reallocatedToExplorer: planned.reallocatedToExplorer,
        reallocatedPools: planned.reallocatedPools,
      };
      args.checkpoint?.(run, "birth-plan");
    }
    const done = new Set(run.candidates.filter((candidate) => candidate.generation === generation).map((candidate) => candidate.birthIndex));
    const births: BirthRecord[] = planned.births.map((birth, index) => {
      const existing = run.candidates.find((candidate) => candidate.generation === generation && candidate.birthIndex === index);
      return {
        candidateId: existing?.id ?? 0,
        origin: birth.origin,
        parentId: birth.parentId,
        parentSelectionRole: birth.parentSelectionRole,
        mutationIntent: birth.mutationIntent,
      };
    });
    for (let index = 0; index < planned.births.length; index += 1) {
      if (done.has(index)) continue;
      const birth = planned.births[index];
      const evaluation = args.evaluate(birth.plan, birth.state);
      const id = (run.candidates[run.candidates.length - 1]?.id ?? 0) + 1;
      const candidate = materialize(id, index, generation, args.adapter, birth, evaluation, config, run.fidelityCalibration);
      run.candidates.push(candidate);
      births[index] = {
        candidateId: id,
        origin: birth.origin,
        parentId: birth.parentId,
        parentSelectionRole: birth.parentSelectionRole,
        mutationIntent: birth.mutationIntent,
      };
      args.onEvaluated?.(candidate, evaluation);
      args.checkpoint?.(run, "candidate");
    }
    if (run.candidates.filter((candidate) => candidate.generation === generation).length !== config.populationSize) {
      throw new Error(`generation ${generation} evaluated ${run.candidates.length} candidates`);
    }
    if (generation === 1 && derivesG01(config) && !run.fidelityCalibration) {
      const record = deriveG01Fidelity(run.candidates.filter((candidate) => candidate.generation === 1), args.adapter);
      run.fidelityCalibration = record;
      run.fidelityProfileId = record.method;
      run.calibration = record.status === "block" ? "uncalibrated" : "calibrated";
      run.provisional = config.purpose !== "production" || record.status !== "pass";
      for (const candidate of run.candidates) {
        if (candidate.generation === 1) candidate.fidelity = fidelityDetailFor(candidate, record);
      }
      args.checkpoint?.(run, "fidelity");
      if (record.status === "block") {
        run.pendingGeneration = null;
        run.generations.push(snapshot(run, generation, births, planned, null, previous));
        run.completedGenerations = generation;
        args.checkpoint?.(run, "generation");
        return run;
      }
    }
    if (generation === 1 && args.afterG01 && !run.descriptorProfile) {
      const outcome = args.afterG01(run);
      args.checkpoint?.(run, "descriptor");
      if (outcome?.block || descriptorBlocked(run)) {
        run.pendingGeneration = null;
        run.generations.push(snapshot(run, generation, births, planned, null, previous));
        run.completedGenerations = generation;
        args.checkpoint?.(run, "generation");
        return run;
      }
    }
    const preservation =
      config.purpose === "calibration"
        ? null
        : recomputePreservation(run.candidates, config.purpose, config.specialists, config.diversity ?? null);
    if (preservation) applyCurrent(run.candidates, preservation);
    run.pendingGeneration = null;
    run.generations.push(snapshot(run, generation, births, planned, preservation, previous));
    run.catalog = preservation
      ? buildCombinedCatalog(run.candidates, preservedIds(preservation), config.catalogDedup)
      : { dedup: "uncalibrated", redundancyThreshold: null, entries: [] };
    run.completedGenerations = generation;
    args.checkpoint?.(run, "generation");
  }
  return run;
}

function createRun(config: SemanticSearchConfig, adapter: ArchetypeSearchAdapter): SemanticRun {
  const profile = config.fidelityProfile ?? null;
  const calibration = config.purpose === "calibration" || !profile ? "uncalibrated" : "calibrated";
  return {
    schemaVersion: SEMANTIC_SCHEMA_VERSION,
    purpose: config.purpose,
    provisional: config.purpose !== "production" || !profile,
    calibration,
    fidelityProfileId: profile?.id ?? null,
    archetypeId: adapter.archetypeId,
    typologyId: adapter.typologyId,
    adapterId: adapter.id,
    config,
    evaluationSeed: EVALUATION_SEED,
    completedGenerations: 0,
    fidelityCalibration: null,
    pendingGeneration: null,
    descriptorProfile: null,
    candidates: [],
    generations: [],
    catalog: { dedup: "uncalibrated", redundancyThreshold: null, entries: [] },
  };
}

function continueRun(previous: SemanticRun, config: SemanticSearchConfig, adapter: ArchetypeSearchAdapter): SemanticRun {
  if (previous.schemaVersion !== SEMANTIC_SCHEMA_VERSION) throw new Error("resume requires a semantic run");
  if (previous.archetypeId !== adapter.archetypeId) throw new Error("resume archetype does not match the adapter");
  if (previous.config.runSeed !== config.runSeed) throw new Error("resume run seed does not match");
  if (previous.config.populationSize !== config.populationSize) throw new Error("resume population does not match");
  if (previous.config.purpose !== config.purpose) throw new Error("resume purpose does not match");
  if ((previous.config.specialists ?? false) !== config.specialists) throw new Error("resume specialist switch does not match");
  if (previous.completedGenerations > config.generations) throw new Error("resume target is behind the stored run");
  return {
    ...previous,
    config,
    fidelityCalibration: previous.fidelityCalibration,
    pendingGeneration: previous.pendingGeneration,
    candidates: previous.candidates.map((candidate) => ({ ...candidate, current: { ...candidate.current }, lineage: { ...candidate.lineage }, fidelity: { ...candidate.fidelity } })),
    generations: previous.generations.map((item) => ({ ...item })),
  };
}

function validateConfig(config: SemanticSearchConfig) {
  if (!config.duplicateAttemptBudget || config.duplicateAttemptBudget < 1) {
    throw new Error("duplicateAttemptBudget is required");
  }
  if (config.purpose === "production") {
    if (config.populationSize !== 100) throw new Error("a production run evaluates 100 new candidates per generation");
    if (config.generations !== 4) throw new Error("a production run has four generations");
  } else if (config.purpose === "calibration") {
    if (config.generations !== 1) throw new Error("calibration evaluates one explorer generation and does not reproduce");
    if (config.fidelityProfile) throw new Error("calibration does not apply fidelity floors");
    if (config.composition) throw new Error("calibration has no generation composition");
    if (config.paretoMutation || config.diversityMutation || config.diversityParentSelection) {
      throw new Error("calibration does not mutate");
    }
    if (config.specialists) throw new Error("calibration does not select specialists");
    if (config.diversity || config.catalogDedup) throw new Error("calibration does not apply preservation");
  } else if (config.generations < 1 || config.generations > 4) {
    throw new Error("development generations must be from 1 to 4");
  }
  for (let generation = 2; generation <= config.generations; generation += 1) {
    const mix = mixFor(config, generation);
    if (mix.pareto > 0 && !config.paretoMutation) throw new Error(`generation ${generation} Pareto births need an explicit mutation profile`);
    if (mix.diversity > 0 && !config.diversityMutation) throw new Error(`generation ${generation} Diversity births need an explicit mutation profile`);
    if (mix.diversity > 0 && !config.diversityParentSelection) {
      throw new Error(`generation ${generation} Diversity births need an explicit parent-selection strategy`);
    }
    if (mix.specialist > 0) throw new Error("specialist births are refused until a gene-to-objective mapping exists");
  }
}

function mixFor(config: SemanticSearchConfig, generation: number): PoolMix {
  if (generation === 1) {
    return { explorers: config.populationSize, pareto: 0, diversity: 0, specialist: 0 };
  }
  const mix = config.composition?.[generation as 2 | 3 | 4];
  if (!mix) throw new Error(`generation ${generation} requires an explicit composition profile`);
  const sum = mix.explorers + mix.pareto + mix.diversity + mix.specialist;
  if (sum !== config.populationSize) {
    throw new Error(`generation ${generation} composition sums to ${sum}, not ${config.populationSize}`);
  }
  return mix;
}

function planGeneration(
  run: SemanticRun,
  generation: number,
  config: SemanticSearchConfig,
  adapter: ArchetypeSearchAdapter,
  rng: () => number,
  mutate: typeof mutateSemanticPlan,
  previous: GenerationSnapshot | null,
): { requested: PoolMix; used: PoolMix; reallocatedToExplorer: number; reallocatedPools: ("pareto" | "diversity")[]; births: PlannedBirth[] } {
  const requested = mixFor(config, generation);
  let explorers = requested.explorers;
  let reallocated = 0;
  const reallocatedPools: ("pareto" | "diversity")[] = [];
  const births: PlannedBirth[] = [];
  const seen = new Set(run.candidates.map((candidate) => semanticIdentity(candidate.plan, candidate.state)));
  const allowReallocation = config.purpose === "development";
  const take = (role: "pareto" | "diversity", count: number) => {
    const pool = previous ? poolFor(previous, role) : [];
    if (count > 0 && pool.length === 0) {
      if (!allowReallocation) {
        throw new Error(
          `generation ${generation} ${role} parent pool is empty. The requested composition was not changed. Review the experimental configuration.`,
        );
      }
      explorers += count;
      reallocated += count;
      reallocatedPools.push(role);
      return;
    }
    for (let slot = 0; slot < count; slot += 1) {
      births.push(planMutant(run, adapter, pool, role, config, rng, mutate, seen));
    }
  };
  for (let slot = 0; slot < explorers; slot += 1) births.push(planExplorer(adapter, rng, seen, config.duplicateAttemptBudget));
  take("pareto", requested.pareto);
  take("diversity", requested.diversity);
  // Explorer slots that were increased by reallocation are already included in `explorers`
  // only for the initial loop. Reallocation happens inside `take`, after explorers were planned.
  // Plan the reallocated explorers now.
  const extra = births.filter((birth) => birth.origin === "explorer").length;
  for (let slot = extra; slot < explorers; slot += 1) births.push(planExplorer(adapter, rng, seen, config.duplicateAttemptBudget));
  const used = {
    explorers: births.filter((birth) => birth.origin === "explorer").length,
    pareto: births.filter((birth) => birth.parentSelectionRole === "pareto").length,
    diversity: births.filter((birth) => birth.parentSelectionRole === "diversity").length,
    specialist: 0,
  };
  return { requested, used, reallocatedToExplorer: reallocated, reallocatedPools, births };
}

function planExplorer(adapter: ArchetypeSearchAdapter, rng: () => number, seen: Set<string>, budget: number): PlannedBirth {
  for (let attempt = 0; attempt < budget; attempt += 1) {
    const sampled = adapter.sampleExplorer(rng);
    const repaired = adapter.repair(sampled.plan);
    if (!repaired.ok) continue;
    const key = semanticIdentity(repaired.plan, sampled.state);
    if (seen.has(key)) continue;
    seen.add(key);
    return {
      plan: repaired.plan,
      state: { ...sampled.state },
      origin: "explorer",
      parentId: null,
      parentSelectionRole: null,
      mutationIntent: null,
      changes: [],
      repairedFields: repaired.repairedFields,
    };
  }
  throw new Error("duplicate attempt budget exhausted while sampling explorers");
}

function planMutant(
  run: SemanticRun,
  adapter: ArchetypeSearchAdapter,
  pool: readonly number[],
  role: "pareto" | "diversity",
  config: SemanticSearchConfig,
  rng: () => number,
  mutate: typeof mutateSemanticPlan,
  seen: Set<string>,
): PlannedBirth {
  const intent: MutationIntent = role === "pareto" ? "local-refinement" : "morphological-exploration";
  const profile = role === "pareto" ? config.paretoMutation : config.diversityMutation;
  if (!profile) throw new Error(`missing ${role} mutation profile`);
  const selection = config.diversityParentSelection;
  if (role === "diversity" && !selection) throw new Error("Diversity parent selection strategy is missing");
  const crowding = crowdingMap(run);
  for (let attempt = 0; attempt < config.duplicateAttemptBudget; attempt += 1) {
    const parentId =
      role === "pareto" ? selectCrowdingParent(pool, crowding, rng) : selectDiversityParent(pool, selection!, rng);
    const parent = run.candidates.find((candidate) => candidate.id === parentId);
    if (!parent) throw new Error(`missing parent ${parentId}`);
    const attemptResult: MutationAttempt = mutate(adapter, parent.plan, parent.state, intent, profile, rng);
    if (attemptResult.status !== "changed") continue;
    const key = semanticIdentity(attemptResult.plan, attemptResult.state);
    if (seen.has(key)) continue;
    seen.add(key);
    return {
      plan: attemptResult.plan,
      state: attemptResult.state,
      origin: "mutant",
      parentId,
      parentSelectionRole: role,
      mutationIntent: intent,
      changes: attemptResult.changes,
      repairedFields: attemptResult.repairedFields,
    };
  }
  throw new Error(`duplicate attempt budget exhausted while mutating ${role} parents`);
}

function poolFor(snapshot: GenerationSnapshot, role: "pareto" | "diversity") {
  return role === "pareto" ? snapshot.parentPools.pareto : snapshot.parentPools.diversity;
}

function crowdingMap(run: SemanticRun) {
  const latest = run.generations[run.generations.length - 1];
  const map = new Map<number, CrowdingValue>();
  if (!latest) return map;
  for (const [id, value] of Object.entries(latest.crowding)) map.set(Number(id), value);
  return map;
}

function descriptorBlocked(run: SemanticRun) {
  return run.descriptorProfile?.block ?? null;
}

function derivesG01(config: SemanticSearchConfig) {
  if (config.deriveG01Fidelity === false) return false;
  if (config.deriveG01Fidelity === true) return true;
  return config.purpose === "production" && !config.fidelityProfile;
}

function materialize(
  id: number,
  birthIndex: number,
  generation: number,
  adapter: ArchetypeSearchAdapter,
  birth: PlannedBirth,
  evaluation: SemanticEvaluation,
  config: SemanticSearchConfig,
  calibration: SemanticRun["fidelityCalibration"],
): SemanticCandidate {
  return {
    id,
    archetypeId: adapter.archetypeId,
    typologyId: adapter.typologyId,
    generation,
    birthIndex,
    origin: birth.origin,
    plan: birth.plan,
    state: birth.state,
    lineage: {
      parentId: birth.parentId,
      parentSelectionRole: birth.parentSelectionRole,
      mutationIntent: birth.mutationIntent,
      changes: birth.changes,
      repairedFields: birth.repairedFields,
    },
    evaluationSeed: evaluation.evaluationSeed,
    technicalValid: evaluation.technicalValid,
    failureReason: evaluation.failureReason,
    objectives: evaluation.objectives,
    criterionMatch: evaluation.criterionMatch,
    observed: evaluation.observed,
    criterionCategory: evaluation.criterionCategory,
    fidelity: calibration
      ? fidelityDetailFor(evaluation, calibration)
      : assignFidelity(evaluation.technicalValid, evaluation.objectives, evaluation.criterionMatch, config.fidelityProfile),
    phenotype: evaluation.phenotype,
    preview: null,
    current: { pareto: false, crowding: null, specialist: null, diversity: "none" },
  };
}

function applyCurrent(candidates: SemanticCandidate[], preservation: PreservationResult) {
  const pareto = new Set(preservation.paretoIds);
  const tags = new Set(preservation.diversityTagIds);
  const rescues = new Set(preservation.diversityRescueIds);
  const specialist = new Map<number, "formal" | "spatial" | "atmospheric">();
  for (const emphasis of ["formal", "spatial", "atmospheric"] as const) {
    for (const id of preservation.specialistIds[emphasis]) specialist.set(id, emphasis);
  }
  for (const candidate of candidates) {
    candidate.current = {
      pareto: pareto.has(candidate.id),
      crowding: pareto.has(candidate.id) ? (preservation.crowding.get(candidate.id) ?? null) : null,
      specialist: specialist.get(candidate.id) ?? null,
      diversity: tags.has(candidate.id) ? "tag" : rescues.has(candidate.id) ? "rescue" : "none",
    };
  }
}

function preservedIds(preservation: PreservationResult) {
  return [
    ...preservation.paretoIds,
    ...preservation.diversityTagIds,
    ...preservation.diversityRescueIds,
    ...preservation.specialistIds.formal,
    ...preservation.specialistIds.spatial,
    ...preservation.specialistIds.atmospheric,
  ];
}

function snapshot(
  run: SemanticRun,
  generation: number,
  births: BirthRecord[],
  planned: { requested: PoolMix; used: PoolMix; reallocatedToExplorer: number; reallocatedPools: ("pareto" | "diversity")[] },
  preservation: PreservationResult | null,
  previous: GenerationSnapshot | null,
): GenerationSnapshot {
  const previousPareto = new Set(previous?.paretoIds ?? []);
  const paretoIds = preservation?.paretoIds ?? [];
  const pareto = new Set(paretoIds);
  const crowding: GenerationSnapshot["crowding"] = {};
  if (preservation) {
    for (const [id, value] of preservation.crowding) crowding[String(id)] = value;
  }
  const specialistPool = {
    formal: [...(preservation?.specialistIds.formal ?? [])],
    spatial: [...(preservation?.specialistIds.spatial ?? [])],
    atmospheric: [...(preservation?.specialistIds.atmospheric ?? [])],
  };
  return {
    generation,
    candidateIds: run.candidates.map((candidate) => candidate.id),
    newCandidateIds: births.map((birth) => birth.candidateId),
    technicallyValidIds: run.candidates.filter((candidate) => candidate.technicalValid).map((candidate) => candidate.id),
    fidelityEligibleIds: preservation?.eligibleIds ?? [],
    paretoIds: [...paretoIds],
    enteredParetoIds: paretoIds.filter((id) => !previousPareto.has(id)),
    leftParetoIds: [...previousPareto].filter((id) => !pareto.has(id)),
    crowding,
    objectiveExtremes: {
      formal: extreme(run.candidates, paretoIds, "formal"),
      spatial: extreme(run.candidates, paretoIds, "spatial"),
      atmospheric: extreme(run.candidates, paretoIds, "atmospheric"),
    },
    diversityStatus: preservation?.diversityStatus ?? "uncalibrated",
    diversityTagIds: [...(preservation?.diversityTagIds ?? [])],
    diversityRescueIds: [...(preservation?.diversityRescueIds ?? [])],
    specialistsEnabled: run.config.specialists ?? false,
    specialistIds: specialistPool,
    parentPools: {
      pareto: [...paretoIds],
      diversity: preservation
        ? run.candidates
            .filter((candidate) => candidate.current.diversity === "tag" || candidate.current.diversity === "rescue")
            .map((candidate) => candidate.id)
        : [],
      specialist: specialistPool,
    },
    preservationApplied: preservation != null,
    compositionRequested: planned.requested,
    compositionUsed: planned.used,
    reallocatedToExplorer: planned.reallocatedToExplorer,
    reallocatedPools: planned.reallocatedPools,
    births,
    calibration: run.calibration,
    fidelityProfileId: run.fidelityProfileId,
  };
}

function extreme(candidates: readonly SemanticCandidate[], ids: readonly number[], key: "formal" | "spatial" | "atmospheric"): [number, number] | null {
  const values = ids.map((id) => candidates.find((candidate) => candidate.id === id)?.objectives[key]).filter((value): value is number => value != null);
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}
