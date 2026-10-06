import { captureSnapshot } from "../skill1/engine";
import { toHandoff } from "../skill1/translate";
import { simulateGenome } from "../skill2/evolution-evaluate";
import { HANDOFF_CONTRACT_VERSION, stateChecksum, type Skill2HandoffRecord } from "../skill2/handoff";
import { searchObjectives } from "../skill2/search-objectives";
import { sectionTranslate } from "../skill2/section-translate";
import type { CandidateEvaluation, Skill2Handoff } from "../skill2/types";
import {
  continuationsFromOpenedZ0,
  NATURAL_CONTINUATION_COUNT,
  type NaturalContinuationSet,
} from "./continuations";
import { DEFAULT_EVENT_CONFIG, type EventSampleConfig } from "./events";
import { parseRunKey, readEvolutionRun, type Skill3SourceRequest } from "./source";

/**
 * In-memory preview only. Replays one archived genome with the current engine
 * and does not write the evolution archive or call `openValidatedHandoff`.
 */
export const PROVISIONAL_PREVIEW_NOTE =
  "provisional preview: current-engine replay; archived scores were not replaced";

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

/** One current-engine replay of a stored genome. The archive file is only read. */
export function openProvisionalReplay(request: Skill3SourceRequest): { record: Skill2HandoffRecord; handoff: Skill2Handoff } {
  const fromKey = request.runKey ? parseRunKey(request.runKey) : null;
  const archetypeId = request.archetypeId ?? fromKey?.archetypeId;
  if (!archetypeId) throw new Error("archetype id or run key is required");
  if (fromKey && request.archetypeId && request.archetypeId !== fromKey.archetypeId) {
    throw new Error(`archetype ${request.archetypeId} does not match run key ${request.runKey}`);
  }
  const run = readEvolutionRun(archetypeId);
  if (fromKey && run.controllerSeed !== fromKey.controllerSeed) {
    throw new Error(`run key ${request.runKey} does not match controller seed ${run.controllerSeed}`);
  }
  const candidate = run.candidates.find((item) => item.id === request.candidateId);
  if (!candidate) throw new Error(`candidate ${request.candidateId} is not in the ${run.archetypeId} run`);
  if (!run.archiveIds.includes(request.candidateId)) {
    throw new Error(`candidate ${request.candidateId} is not in the global Pareto archive`);
  }
  const realized = simulateGenome(run.archetypeId, candidate.genome);
  const evaluation = summarize(realized.evaluation);
  const record: Skill2HandoffRecord = {
    skill: 2,
    contractVersion: HANDOFF_CONTRACT_VERSION,
    identity: {
      typologyId: run.typologyId,
      archetypeId: run.archetypeId,
      archetypeName: realized.base.archetypeName,
      candidateId: request.candidateId,
      generation: candidate.generation,
      runKey: `${run.archetypeId}@${run.controllerSeed}`,
    },
    selection: {
      selectedAt: new Date().toISOString(),
      from: "pareto-archive",
      archiveIds: [...run.archiveIds],
      note: PROVISIONAL_PREVIEW_NOTE,
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
  const source = toHandoff(realized.placed);
  const handoff: Skill2Handoff = {
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
  return { record, handoff };
}

/** Existing vertical sampler, starting from the provisional replay instead of a validated handoff. */
export function runProvisionalContinuations(
  request: Skill3SourceRequest,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet {
  const { record, handoff } = openProvisionalReplay(request);
  const set = continuationsFromOpenedZ0(record, handoff, "provisional", count, config);
  if (set.origin !== "provisional" || record.selection.note !== PROVISIONAL_PREVIEW_NOTE) {
    throw new Error("provisional preview was not labeled");
  }
  return set;
}

const previewCache = new Map<string, NaturalContinuationSet>();

function cacheKey(request: Skill3SourceRequest, count: number, config: EventSampleConfig) {
  const source = request.runKey ?? request.archetypeId ?? "";
  return `preview#${source}#${request.candidateId}#${count}#${config.horizon}#${config.minGap}#${config.maxGap}#${config.deltaThreshold}`;
}

export function peekProvisionalContinuations(
  request: Skill3SourceRequest,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet | null {
  return previewCache.get(cacheKey(request, count, config)) ?? null;
}

export function loadProvisionalContinuations(
  request: Skill3SourceRequest,
  count = NATURAL_CONTINUATION_COUNT,
  config: EventSampleConfig = DEFAULT_EVENT_CONFIG,
): NaturalContinuationSet {
  const key = cacheKey(request, count, config);
  const cached = previewCache.get(key);
  if (cached) return cached;
  const set = runProvisionalContinuations(request, count, config);
  previewCache.set(key, set);
  return set;
}
