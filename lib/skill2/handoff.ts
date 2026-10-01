import { captureSnapshot } from "../skill1/engine";
import type { SlimeControls } from "../skill1/slime-controls";
import { toHandoff, translateArchetype } from "../skill1/translate";
import type { SimulationState, Skill1Handoff, SpatialRecipe } from "../skill1/types";
import type { TypologyId } from "../types";
import type { EvolutionRun, PreviewRef } from "./evolution";
import { EVALUATION_SEED, simulateGenome } from "./evolution-evaluate";
import { applyGenome, type Genome } from "./genome";
import type { Objectives } from "./nsga";
import { searchObjectives } from "./search-objectives";
import { sectionTranslate } from "./section-translate";
import type { CandidateEvaluation, Skill2Handoff, Skill2SimulationConfig } from "./types";

export const HANDOFF_CONTRACT_VERSION = 1;

/**
 * Stable, serializable record of one designer-selected candidate from the
 * global Pareto archive. The live Skill 3 path keeps the simulation that
 * built this record. `replaySkill2Handoff` rebuilds that same Z0 for tests;
 * the checksum proves the rebuild is the evaluated morphology.
 */
export type Skill2HandoffRecord = {
  skill: 2;
  contractVersion: typeof HANDOFF_CONTRACT_VERSION;
  identity: {
    typologyId: TypologyId;
    archetypeId: string;
    archetypeName: string;
    candidateId: number;
    generation: number;
    /** `${archetypeId}@${controllerSeed}` */
    runKey: string;
  };
  selection: {
    selectedAt: string;
    from: "pareto-archive";
    /** Global archive at selection time. */
    archiveIds: number[];
    note?: string;
  };
  /** Unposed Skill 1 translation: the architectural source. */
  source: Skill1Handoff;
  realization: {
    genome: Genome;
    /** Posed attractor and marks that were simulated (attractorFixed). */
    recipe: SpatialRecipe;
    /** Translated controls; the food point is the posed attractor. */
    slime: SlimeControls;
    simulation: Skill2SimulationConfig;
    fieldSize: number;
    trailSize: number;
  };
  evaluation: {
    feasible: boolean;
    objectives: Objectives;
    criterionMatch: Record<string, number>;
    observed: Record<string, number>;
  };
  z0: {
    iteration: number;
    /** FNV-1a over trails and agent x / y / heading (float64). */
    checksum: string;
  };
  preview: PreviewRef;
};

export function stateChecksum(state: SimulationState) {
  const view = new DataView(new ArrayBuffer(8));
  let hash = 0x811c9dc5;
  const add = (value: number) => {
    view.setFloat64(0, value);
    for (let b = 0; b < 8; b += 1) hash = Math.imul(hash ^ view.getUint8(b), 0x01000193) >>> 0;
  };
  for (let i = 0; i < state.trails.length; i += 1) add(state.trails[i]);
  for (const agent of state.agents) {
    add(agent.x);
    add(agent.y);
    add(agent.heading);
  }
  return hash.toString(16).padStart(8, "0");
}

function summarize(evaluation: CandidateEvaluation) {
  const search = searchObjectives(evaluation.criteria);
  const criterionMatch: Record<string, number> = {};
  for (const item of search.criteria) if (item.included) criterionMatch[item.criterionId] = item.criterionMatch;
  const observed: Record<string, number> = {};
  for (const item of evaluation.criteria) observed[item.criterionId] = item.observedCondition;
  return {
    feasible: evaluation.feasible,
    objectives: { formal: search.formalMatch, spatial: search.spatialMatch, atmospheric: search.atmosphericMatch },
    criterionMatch,
    observed,
  };
}

const sameObjectives = (a: Objectives, b: Objectives) =>
  a.formal === b.formal && a.spatial === b.spatial && a.atmospheric === b.atmospheric;

type GenomeRealization = ReturnType<typeof simulateGenome>;

/** Builds the record for an archived candidate and keeps the live iteration-600 state. */
function archivedRealization(
  run: EvolutionRun,
  candidateId: number,
  options: { selectedAt?: string; note?: string } = {},
) {
  const candidate = run.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`candidate ${candidateId} is not in the ${run.archetypeId} run`);
  if (!run.archiveIds.includes(candidateId)) throw new Error(`candidate ${candidateId} is not in the global Pareto archive`);
  if (run.evaluationSeed !== EVALUATION_SEED) throw new Error(`run used evaluation seed ${run.evaluationSeed}`);
  const realized = simulateGenome(run.archetypeId, candidate.genome);
  const evaluation = summarize(realized.evaluation);
  if (!sameObjectives(evaluation.objectives, candidate.objectives)) {
    throw new Error(`candidate ${candidateId}: replay does not reproduce the stored objectives`);
  }
  const record: Skill2HandoffRecord = {
    skill: 2,
    contractVersion: HANDOFF_CONTRACT_VERSION,
    identity: {
      typologyId: run.typologyId,
      archetypeId: run.archetypeId,
      archetypeName: realized.base.archetypeName,
      candidateId,
      generation: candidate.generation,
      runKey: `${run.archetypeId}@${run.controllerSeed}`,
    },
    selection: {
      selectedAt: options.selectedAt ?? new Date().toISOString(),
      from: "pareto-archive",
      archiveIds: [...run.archiveIds],
      ...(options.note ? { note: options.note } : {}),
    },
    source: toHandoff(realized.base),
    realization: {
      genome: { ...candidate.genome },
      recipe: realized.placed.recipe,
      slime: realized.slime,
      simulation: realized.simulation,
      fieldSize: realized.state.size,
      trailSize: realized.state.trailSize,
    },
    evaluation,
    z0: { iteration: realized.state.iteration, checksum: stateChecksum(realized.state) },
    preview: candidate.preview,
  };
  return { record, realized };
}

/** Builds the record for an archived candidate. Simulates once to confirm the stored scores and fix the checksum. */
export function buildSkill2HandoffRecord(
  run: EvolutionRun,
  candidateId: number,
  options: { selectedAt?: string; note?: string } = {},
): Skill2HandoffRecord {
  return archivedRealization(run, candidateId, options).record;
}

function assertHandoffContract(record: Skill2HandoffRecord) {
  if (record.skill !== 2 || record.contractVersion !== HANDOFF_CONTRACT_VERSION) {
    throw new Error(`unsupported handoff contract ${record.skill}/${record.contractVersion}`);
  }
  if (record.realization.simulation.seed !== EVALUATION_SEED) {
    throw new Error(`handoff seed ${record.realization.simulation.seed} differs from the fixed seed ${EVALUATION_SEED}`);
  }
  const expected = toHandoff(applyGenome(translateArchetype(record.identity.archetypeId), record.realization.genome));
  if (JSON.stringify(expected.recipe) !== JSON.stringify(record.realization.recipe)) {
    throw new Error("handoff recipe does not match its genome");
  }
}

/** Assembles the runtime handoff from a realization that already passed archive validation. */
function handoffFromRealized(record: Skill2HandoffRecord, realized: GenomeRealization): Skill2Handoff {
  assertHandoffContract(record);
  const checks: Array<[boolean, string]> = [
    [JSON.stringify(realized.slime) === JSON.stringify(record.realization.slime), "slime controls"],
    [JSON.stringify(realized.simulation) === JSON.stringify(record.realization.simulation), "simulation config"],
    [realized.state.trailSize === record.realization.trailSize, "trail size"],
    [realized.state.iteration === record.z0.iteration, "iteration"],
    [stateChecksum(realized.state) === record.z0.checksum, "Z0 checksum"],
    [sameObjectives(summarize(realized.evaluation).objectives, record.evaluation.objectives), "objectives"],
  ];
  const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
  if (failed.length) throw new Error(`handoff replay mismatch: ${failed.join(", ")}`);
  const source = toHandoff(realized.placed);
  return {
    skill: 2,
    selected: {
      identity: {
        candidateId: `${record.identity.runKey}#${record.identity.candidateId}`,
        seed: record.realization.simulation.seed,
        simulation: record.realization.simulation,
        typologyId: record.identity.typologyId,
        archetypeId: record.identity.archetypeId,
      },
      source,
      measurements: realized.detailed.measurements,
      evaluation: realized.evaluation,
      section: {
        height: source.field.height,
        field: captureSnapshot(realized.state),
        interpretation: sectionTranslate(realized.state, realized.detailed),
      },
      simulationState: realized.state,
    },
  };
}

/**
 * One deterministic simulation. The returned handoff continues from that
 * state after the same mismatch checks `replaySkill2Handoff` applies.
 */
export function openValidatedHandoff(
  run: EvolutionRun,
  candidateId: number,
  options: { selectedAt?: string; note?: string } = {},
) {
  const { record, realized } = archivedRealization(run, candidateId, options);
  return { record, handoff: handoffFromRealized(record, realized) };
}

/**
 * Rebuilds the selected candidate as the runtime `Skill2Handoff`, including the
 * live Skill 1 engine state Skill 3 continues from. Refuses any mismatch.
 * `selected.source` is the posed translation that was actually simulated.
 */
export function replaySkill2Handoff(record: Skill2HandoffRecord): Skill2Handoff {
  assertHandoffContract(record);
  const realized = simulateGenome(record.identity.archetypeId, record.realization.genome);
  return handoffFromRealized(record, realized);
}
