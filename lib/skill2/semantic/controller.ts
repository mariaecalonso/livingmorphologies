import { mulberry32 } from "../../physarum";
import type { ArchetypeSearchAdapter } from "./adapter";
import { buildCombinedCatalog, type CatalogVisibility } from "./catalog";
import { assignFidelity } from "./fidelity";
import { deriveG01Fidelity, fidelityDetailFor } from "./fidelity-method";
import { semanticIdentity } from "./identity";
import { mutateSemanticPlan, type MutationAttempt } from "./mutation";
import { archetypeHasRefineGene, diversityGenes, mutateByPolicy, usesDeclaredFields } from "./policy";
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
export async function runSemanticEvolution(args: {
  config: SemanticSearchConfig;
  adapter: ArchetypeSearchAdapter;
  evaluate: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation | Promise<SemanticEvaluation>;
  previous?: SemanticRun | null;
  mutate?: typeof mutateSemanticPlan;
  /** In-flight simulations. Does not change birth order or candidate ids. */
  workers?: number;
  onEvaluated?: (candidate: SemanticCandidate, evaluation: SemanticEvaluation) => void;
  checkpoint?: (run: SemanticRun, phase: "birth-plan" | "candidate" | "fidelity" | "descriptor" | "generation") => void | Promise<void>;
  /** Optional G01 post-process. May install a diversity distance. A block is recorded and the remaining generations still run. */
  afterG01?: (run: SemanticRun) => { block?: string } | void;
}): Promise<SemanticRun> {
  const config = { ...args.config, specialists: args.config.specialists ?? false };
  validateConfig(config);
  const run = args.previous ? continueRun(args.previous, config, args.adapter) : createRun(config, args.adapter);
  const mutate = args.mutate ?? defaultMutate;
  for (let generation = run.completedGenerations + 1; generation <= config.generations; generation += 1) {
    const rng = mulberry32((config.runSeed ^ Math.imul(generation, 0x9e3779b1)) >>> 0);
    if (run.config.diversity) config.diversity = run.config.diversity;
    const previous = run.generations[run.generations.length - 1] ?? null;
    if (config.diversity && run.generations.some((stored) => stored.preservationApplied && stored.diversityStatus === "uncalibrated")) {
      for (const stored of run.generations) {
        if (stored.preservationApplied && stored.diversityStatus === "uncalibrated") {
          reapplyStoredDiversity(run, stored, config.diversity, args.adapter);
        }
      }
      await args.checkpoint?.(run, "generation");
    }
    const pending = run.pendingGeneration?.generation === generation ? run.pendingGeneration : null;
    const planned = pending ?? planGeneration(run, generation, config, args.adapter, rng, mutate, previous);
    if (!pending) {
      assignBirthIds(planned.births, run.candidates);
      run.pendingGeneration = {
        generation,
        births: planned.births,
        requested: planned.requested,
        used: planned.used,
        reallocatedToExplorer: planned.reallocatedToExplorer,
        reallocatedPools: planned.reallocatedPools,
      };
      await args.checkpoint?.(run, "birth-plan");
    } else {
      assignBirthIds(planned.births, run.candidates);
    }
    const done = new Set(run.candidates.map((candidate) => candidate.id));
    await runBirthEvaluations(planned.births, done, args.workers ?? 1, args.evaluate, async (birth, index, evaluation) => {
      const candidate = materialize(birth.candidateId, index, generation, args.adapter, birth, evaluation, config, run.fidelityCalibration);
      run.candidates.push(candidate);
      run.candidates.sort((left, right) => left.id - right.id);
      args.onEvaluated?.(candidate, evaluation);
      await args.checkpoint?.(run, "candidate");
    });
    const births: BirthRecord[] = planned.births.map((birth) => ({
      candidateId: birth.candidateId,
      origin: birth.origin,
      parentId: birth.parentId,
      parentSelectionRole: birth.parentSelectionRole,
      mutationIntent: birth.mutationIntent,
    }));
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
      await args.checkpoint?.(run, "fidelity");
    }
    if (generation === 1 && args.afterG01 && !run.descriptorProfile) {
      args.afterG01(run);
      await args.checkpoint?.(run, "descriptor");
    }
    if (run.config.diversity) config.diversity = run.config.diversity;
    const preservation =
      config.purpose === "calibration"
        ? null
        : recomputePreservation(run.candidates, config.purpose, config.specialists, config.diversity ?? null);
    if (preservation) applyCurrent(run.candidates, preservation);
    run.pendingGeneration = null;
    run.generations.push(snapshot(run, generation, births, planned, preservation, previous));
    run.catalog = preservation
      ? buildCombinedCatalog(run.candidates, preservedIds(preservation), config.catalogDedup, catalogVisibility(args.adapter, config))
      : { dedup: "uncalibrated", redundancyThreshold: null, entries: [] };
    run.completedGenerations = generation;
    await args.checkpoint?.(run, "generation");
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
  let paretoCount = requested.pareto;
  let diversityCount = requested.diversity;
  let reallocated = 0;
  const reallocatedPools: ("pareto" | "diversity")[] = [];
  if (generation > 1 && paretoCount > 0 && !usesDeclaredFields(config.paretoMutation) && !archetypeHasRefineGene(adapter)) {
    explorers += paretoCount;
    reallocated += paretoCount;
    reallocatedPools.push("pareto");
    paretoCount = 0;
  }
  if (generation > 1 && diversityCount > 0 && !usesDeclaredFields(config.diversityMutation) && diversityGenes(adapter).length === 0) {
    explorers += diversityCount;
    reallocated += diversityCount;
    reallocatedPools.push("diversity");
    diversityCount = 0;
  }
  const births: PlannedBirth[] = [];
  const seen = new Set(run.candidates.map((candidate) => semanticIdentity(candidate.plan, candidate.state)));
  const take = (role: "pareto" | "diversity", count: number) => {
    const pool = previous ? poolFor(previous, role) : [];
    if (count > 0 && pool.length === 0) {
      explorers += count;
      reallocated += count;
      reallocatedPools.push(role);
      return;
    }
    for (let slot = 0; slot < count; slot += 1) {
      const birth = planMutant(run, adapter, pool, role, config, rng, mutate, seen);
      if (birth) {
        births.push(birth);
        continue;
      }
      explorers += 1;
      reallocated += 1;
      if (!reallocatedPools.includes(role)) reallocatedPools.push(role);
    }
  };
  for (let slot = 0; slot < explorers; slot += 1) births.push(planExplorer(adapter, rng, seen, config.duplicateAttemptBudget));
  take("pareto", paretoCount);
  take("diversity", diversityCount);
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
  let duplicate: PlannedBirth | null = null;
  for (let attempt = 0; attempt < budget; attempt += 1) {
    const sampled = adapter.sampleExplorer(rng);
    const repaired = adapter.repair(sampled.plan);
    if (!repaired.ok) continue;
    const birth = explorerBirth(repaired.plan, sampled.state, repaired.repairedFields);
    const key = semanticIdentity(birth.plan, birth.state);
    if (seen.has(key)) {
      duplicate = birth;
      continue;
    }
    seen.add(key);
    return birth;
  }
  if (duplicate) return duplicate;
  throw new Error(`${adapter.archetypeId}: explorer sample did not repair`);
}

function explorerBirth(plan: SemanticPlan, state: RealizationState, repairedFields: string[]): PlannedBirth {
  return {
    candidateId: 0,
    plan,
    state: { ...state },
    origin: "explorer",
    parentId: null,
    parentSelectionRole: null,
    mutationIntent: null,
    changes: [],
    repairedFields,
  };
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
): PlannedBirth | null {
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
      candidateId: 0,
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
  return null;
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

function assignBirthIds(births: PlannedBirthRecord[], existing: readonly SemanticCandidate[]) {
  let next = existing.reduce((max, candidate) => Math.max(max, candidate.id), 0) + 1;
  for (const birth of births) {
    if (!birth.candidateId) birth.candidateId = next++;
  }
}

/**
 * Evaluations may finish out of order. Checkpoint writes are chained so only
 * one runs at a time, and each birth already carries its candidate id.
 */
async function runBirthEvaluations(
  births: readonly PlannedBirthRecord[],
  done: ReadonlySet<number>,
  workers: number,
  evaluate: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation | Promise<SemanticEvaluation>,
  onResult: (birth: PlannedBirthRecord, index: number, evaluation: SemanticEvaluation) => Promise<void> | void,
) {
  const pending = births.map((birth, index) => ({ birth, index })).filter(({ birth }) => !done.has(birth.candidateId));
  let cursor = 0;
  let writes = Promise.resolve();
  const lane = async () => {
    for (;;) {
      const job = pending[cursor];
      cursor += 1;
      if (!job) return;
      const evaluation = await evaluate(job.birth.plan, job.birth.state);
      const commit = writes.then(() => onResult(job.birth, job.index, evaluation));
      writes = commit.then(
        () => undefined,
        () => undefined,
      );
      await commit;
    }
  };
  const lanes = Math.max(1, Math.min(workers, pending.length || 1));
  const settled = await Promise.allSettled(Array.from({ length: lanes }, () => lane()));
  await writes;
  const rejected = settled.find((item) => item.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
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

function defaultMutate(
  adapter: ArchetypeSearchAdapter,
  plan: SemanticPlan,
  state: RealizationState,
  intent: MutationIntent,
  profile: NonNullable<SemanticSearchConfig["paretoMutation"]>,
  rng: () => number,
) {
  if (usesDeclaredFields(profile)) return mutateSemanticPlan(adapter, plan, state, intent, profile, rng);
  return mutateByPolicy(adapter, plan, state, intent, rng);
}

function catalogVisibility(adapter: ArchetypeSearchAdapter, config: SemanticSearchConfig): CatalogVisibility {
  return { adapter, distance: config.diversity?.distance ?? null };
}

function reapplyStoredDiversity(
  run: SemanticRun,
  stored: GenerationSnapshot,
  diversity: NonNullable<SemanticSearchConfig["diversity"]>,
  adapter: ArchetypeSearchAdapter,
) {
  const generationCandidates = run.candidates.filter((candidate) => candidate.generation <= stored.generation);
  const preservation = recomputePreservation(generationCandidates, run.purpose, run.config.specialists ?? false, diversity);
  applyCurrent(generationCandidates, preservation);
  const earlier = run.generations.filter((item) => item.generation < stored.generation).at(-1) ?? null;
  Object.assign(
    stored,
    snapshot(
      run,
      stored.generation,
      stored.births,
      {
        requested: stored.compositionRequested,
        used: stored.compositionUsed,
        reallocatedToExplorer: stored.reallocatedToExplorer,
        reallocatedPools: stored.reallocatedPools,
      },
      preservation,
      earlier,
      generationCandidates,
    ),
  );
  run.catalog = buildCombinedCatalog(
    generationCandidates,
    preservedIds(preservation),
    run.config.catalogDedup,
    catalogVisibility(adapter, { ...run.config, diversity }),
  );
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
  included: readonly SemanticCandidate[] = run.candidates,
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
    candidateIds: included.map((candidate) => candidate.id),
    newCandidateIds: births.map((birth) => birth.candidateId),
    technicallyValidIds: included.filter((candidate) => candidate.technicalValid).map((candidate) => candidate.id),
    fidelityEligibleIds: preservation?.eligibleIds ?? [],
    paretoIds: [...paretoIds],
    enteredParetoIds: paretoIds.filter((id) => !previousPareto.has(id)),
    leftParetoIds: [...previousPareto].filter((id) => !pareto.has(id)),
    crowding,
    objectiveExtremes: {
      formal: extreme(included, paretoIds, "formal"),
      spatial: extreme(included, paretoIds, "spatial"),
      atmospheric: extreme(included, paretoIds, "atmospheric"),
    },
    diversityStatus: preservation?.diversityStatus ?? "uncalibrated",
    diversityTagIds: [...(preservation?.diversityTagIds ?? [])],
    diversityRescueIds: [...(preservation?.diversityRescueIds ?? [])],
    specialistsEnabled: run.config.specialists ?? false,
    specialistIds: specialistPool,
    parentPools: {
      pareto: [...paretoIds],
      diversity: preservation
        ? included
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
