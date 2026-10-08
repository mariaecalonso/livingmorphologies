import { CANONICAL_GENOME } from "../skill2/genome";
import { HANDOFF_CONTRACT_VERSION, stateChecksum, type Skill2HandoffRecord } from "../skill2/handoff";
import { loadVerifiedZ0 } from "../skill2/semantic/z0-snapshot";
import type { CandidateEvaluation, MorphologicalMeasurements, Skill2Handoff } from "../skill2/types";
import type { TypologyId } from "../types";
import { continuationsFromOpenedZ0, loadNaturalContinuations, type NaturalContinuationSet } from "./continuations";
import { parseRunKey, type Skill3SourceRequest } from "./source";

const TYPOLOGY_ID = new Set<TypologyId>(["lobby", "workspace", "gathering"]);

export type OpenedSemanticZ0 = {
  record: Skill2HandoffRecord;
  handoff: Skill2Handoff;
  /** z0-sha256-v1 checksum from the verified snapshot. */
  semanticChecksum: string;
};

function requestArchetype(request: Skill3SourceRequest) {
  if (request.archetypeId) return request.archetypeId;
  if (request.runKey) return parseRunKey(request.runKey).archetypeId;
  return null;
}

/**
 * Turns one verified semantic snapshot into the handoff Skill 3 already steps.
 * Returns null when that candidate has no snapshot. A checksum mismatch still throws.
 * Does not read a pose run and does not interpret a semantic plan.
 */
export function openVerifiedSemanticHandoff(request: Skill3SourceRequest): OpenedSemanticZ0 | null {
  const archetypeId = requestArchetype(request);
  if (!archetypeId) return null;
  const loaded = loadVerifiedZ0(archetypeId, request.candidateId);
  if (!loaded) return null;
  if (loaded.meta.validation.algorithm !== "z0-sha256-v1") {
    throw new Error(`z0 algorithm ${loaded.meta.validation.algorithm} is not z0-sha256-v1`);
  }
  if (loaded.meta.identity.archetypeId !== archetypeId || loaded.meta.identity.candidateId !== request.candidateId) {
    throw new Error(`verified Z0 identity does not match ${archetypeId} candidate ${request.candidateId}`);
  }
  const typologyId = loaded.meta.identity.typologyId;
  if (!TYPOLOGY_ID.has(typologyId as TypologyId)) throw new Error(`verified Z0 typology ${typologyId} is not recognized`);
  const state = loaded.state;
  const translation = loaded.meta.rules.translation;
  const liveChecksum = stateChecksum(state);
  if (state.iteration !== loaded.meta.z0.iteration) throw new Error("verified Z0 iteration does not match its state");
  const source = {
    skill: 1 as const,
    typologyId: translation.typologyId,
    archetypeId: translation.archetypeId,
    archetypeName: translation.archetypeName,
    topology: translation.topology,
    descriptors: translation.descriptors,
    ratings: translation.ratings,
    traces: translation.traces,
    rankings: translation.rankings,
    params: translation.params,
    recipe: translation.recipe,
    behavior: translation.behavior,
    field: {
      size: state.size,
      height: state.size,
      sourceCorner: translation.recipe.sourceCorner,
      attractor: { ...translation.recipe.attractor },
    },
  };
  const record: Skill2HandoffRecord = {
    skill: 2,
    contractVersion: HANDOFF_CONTRACT_VERSION,
    identity: {
      typologyId: typologyId as TypologyId,
      archetypeId,
      archetypeName: loaded.meta.identity.archetypeName,
      candidateId: request.candidateId,
      generation: loaded.meta.identity.generation,
      runKey: loaded.meta.identity.runKey,
    },
    selection: {
      selectedAt: "semantic-z0",
      from: "pareto-archive",
      archiveIds: [request.candidateId],
      note: "verified-semantic-z0",
    },
    source,
    realization: {
      genome: CANONICAL_GENOME,
      recipe: translation.recipe,
      slime: loaded.meta.rules.slime,
      simulation: {
        seed: loaded.meta.replay?.evaluationSeed ?? state.seed,
        agentCount: state.agents.length,
        maxIterations: state.maxIterations,
        trailDecay: loaded.meta.rules.trailDecay,
      },
      fieldSize: state.size,
      trailSize: state.trailSize,
    },
    evaluation: {
      feasible: true,
      objectives: loaded.meta.provenance.objectives,
      criterionMatch: {},
      observed: {},
    },
    z0: { iteration: state.iteration, checksum: liveChecksum },
    preview: { file: loaded.meta.preview?.file ?? `previews/${request.candidateId}.png`, index: 0 },
  };
  const handoff: Skill2Handoff = {
    skill: 2,
    selected: {
      identity: {
        candidateId: `${record.identity.runKey}#${request.candidateId}`,
        seed: record.realization.simulation.seed,
        simulation: record.realization.simulation,
        typologyId: record.identity.typologyId,
        archetypeId,
      },
      source,
      measurements: { field: { size: state.size, height: state.size } } as MorphologicalMeasurements,
      evaluation: { feasible: true, acceptable: true, overallPerformance: 0, minimumIndividualPerformance: 0, criteria: [] } as unknown as CandidateEvaluation,
      section: {
        height: state.size,
        field: {
          iteration: state.iteration,
          size: state.size,
          trailSize: state.trailSize,
          trails: [],
          occupancy: [],
          agents: [],
          source: state.source,
          attractor: state.attractor,
        },
      },
      simulationState: state,
    },
  };
  return { record, handoff, semanticChecksum: loaded.meta.validation.checksum };
}

const semanticCache = new Map<string, NaturalContinuationSet>();

/**
 * Verified semantic Z0 when one is stored. Otherwise the existing pose-run handoff.
 * The semantic path uses the same 24-continuation sampler as a pose handoff.
 */
export function loadVerifiedContinuations(request: Skill3SourceRequest): NaturalContinuationSet & { semanticChecksum?: string } {
  const opened = openVerifiedSemanticHandoff(request);
  if (!opened) return loadNaturalContinuations(request);
  const key = `${opened.record.identity.archetypeId}#${opened.record.identity.candidateId}#${opened.semanticChecksum}`;
  const cached = semanticCache.get(key);
  if (cached) return { ...cached, semanticChecksum: opened.semanticChecksum };
  const set = continuationsFromOpenedZ0(opened.record, opened.handoff, "handoff");
  if (set.z0Iteration !== opened.record.z0.iteration || set.parentChecksum !== opened.record.z0.checksum) {
    throw new Error("semantic continuation did not keep the verified Z0");
  }
  semanticCache.set(key, set);
  return { ...set, semanticChecksum: opened.semanticChecksum };
}

/** Bundle already produced by `loadVerifiedContinuations`. Does not start a replay. */
export function peekVerifiedContinuations(request: Skill3SourceRequest): NaturalContinuationSet | null {
  const archetypeId = requestArchetype(request);
  if (!archetypeId) return null;
  for (const set of semanticCache.values()) {
    if (set.archetypeId === archetypeId && set.candidateId === request.candidateId && set.origin === "handoff") return set;
  }
  return null;
}
