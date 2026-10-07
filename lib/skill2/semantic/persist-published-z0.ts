import { join } from "node:path";
import { ARCHETYPES } from "../../skill1/archetypes";
import { EVALUATION_SEED } from "../evolution-evaluate";
import { semanticCatalogRoot } from "../published-catalog-view";
import { readCatalogSelection } from "../read-published-selection";
import { evaluateSearchCandidate } from "./evaluate";
import { loadSemanticRun } from "./lobby-run";
import { loadPublishedCatalog } from "./publish-catalog";
import type { SemanticPlan } from "./types";
import { loadVerifiedZ0, writeVerifiedZ0, type LoadedZ0 } from "./z0-snapshot";

/**
 * Replays one published semantic candidate and stores the snapshot
 * `loadVerifiedZ0` already verifies. Does not rerun search or write the catalogue.
 */
/**
 * Replays the drawing the catalog page is showing and stores the snapshot
 * `loadVerifiedZ0` already verifies. A finished local run is that drawing.
 * Does not rerun search or write the catalogue.
 */
export function persistCatalogZ0(archetypeId: string, candidateId: number): LoadedZ0 {
  if (!readCatalogSelection(archetypeId, candidateId)) {
    throw new Error(`candidate ${candidateId} is not in the catalog`);
  }
  const local = localReplaySource(archetypeId, candidateId);
  if (local) return replayAndStore(archetypeId, local);
  return persistPublishedZ0(archetypeId, candidateId);
}

/**
 * Replays one published semantic candidate and stores the snapshot
 * `loadVerifiedZ0` already verifies. Does not rerun search or write the catalogue.
 */
export function persistPublishedZ0(archetypeId: string, candidateId: number): LoadedZ0 {
  const catalog = loadPublishedCatalog(join(semanticCatalogRoot(), archetypeId));
  if (catalog.archetypeId !== archetypeId) throw new Error(`${archetypeId} catalogue identity does not match`);
  const published = catalog.candidates.find((item) => item.id === candidateId);
  if (!published) throw new Error(`candidate ${candidateId} is not in the published catalog`);
  if (catalog.evaluationSeed !== EVALUATION_SEED) {
    throw new Error(`catalogue evaluation seed ${catalog.evaluationSeed} is not the semantic evaluation seed`);
  }
  return replayAndStore(archetypeId, {
    id: published.id,
    generation: published.generation,
    plan: published.plan,
    state: published.state,
    objectives: published.objectives,
    parentId: published.lineage.parentId,
    archived: published.current.pareto,
    previewFile: published.preview?.file ?? null,
    evaluationSeed: catalog.evaluationSeed,
  });
}

function localReplaySource(archetypeId: string, candidateId: number): ReplaySource | null {
  const run = loadSemanticRun(archetypeId);
  if (!run || run.archetypeId !== archetypeId || run.completedGenerations < run.config.generations) return null;
  if (!run.catalog.entries.some((entry) => entry.representativeId === candidateId)) return null;
  const candidate = run.candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;
  if (run.evaluationSeed !== EVALUATION_SEED || candidate.evaluationSeed !== EVALUATION_SEED) {
    throw new Error(`candidate ${candidateId} evaluation seed is not the semantic evaluation seed`);
  }
  return {
    id: candidate.id,
    generation: candidate.generation,
    plan: candidate.plan,
    state: candidate.state,
    objectives: candidate.objectives,
    parentId: candidate.lineage.parentId,
    archived: candidate.current.pareto,
    previewFile: candidate.preview?.file ?? null,
    evaluationSeed: candidate.evaluationSeed,
  };
}

type ReplaySource = {
  id: number;
  generation: number;
  plan: SemanticPlan;
  state: Parameters<typeof evaluateSearchCandidate>[1];
  objectives: { formal: number; spatial: number; atmospheric: number };
  parentId: number | null;
  archived: boolean;
  previewFile: string | null;
  evaluationSeed: number;
};

function replayAndStore(archetypeId: string, source: ReplaySource): LoadedZ0 {
  if (!source.plan?.body || source.state.seed == null) {
    throw new Error(`candidate ${source.id} cannot be replayed`);
  }
  const typologyId = Object.values(ARCHETYPES).find((item) => item.id === archetypeId)?.typologyId;
  if (!typologyId) throw new Error(`${archetypeId} has no typology`);

  const first = evaluateSearchCandidate(source.plan, source.state, { preview: false });
  const second = evaluateSearchCandidate(source.plan, source.state, { preview: false });
  if (!first.z0 || !second.z0) throw new Error(`candidate ${source.id} did not produce a Z0`);
  if (first.z0.meta.validation.checksum !== second.z0.meta.validation.checksum) {
    throw new Error(`candidate ${source.id} replay was not repeatable`);
  }

  writeVerifiedZ0(
    archetypeId,
    {
      id: source.id,
      generation: source.generation,
      typologyId,
      plan: source.plan,
      state: source.state,
      objectives: source.objectives,
      parentId: source.parentId,
      archived: source.archived,
      previewFile: source.previewFile,
      evaluationSeed: source.evaluationSeed,
    },
    first.z0,
  );

  const loaded = loadVerifiedZ0(archetypeId, source.id);
  if (!loaded) throw new Error(`verified Z0 for ${archetypeId} candidate ${source.id} was not readable`);
  if (loaded.meta.validation.checksum !== first.z0.meta.validation.checksum) {
    throw new Error(`stored checksum does not match the replay for candidate ${source.id}`);
  }
  return loaded;
}
