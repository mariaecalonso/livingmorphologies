import { join } from "node:path";
import { ARCHETYPES } from "../../skill1/archetypes";
import { EVALUATION_SEED } from "../evolution-evaluate";
import { semanticCatalogRoot } from "../published-catalog-view";
import { evaluateSearchCandidate } from "./evaluate";
import { loadPublishedCatalog } from "./publish-catalog";
import { loadVerifiedZ0, writeVerifiedZ0, type LoadedZ0 } from "./z0-snapshot";

/**
 * Replays one published semantic candidate and stores the snapshot
 * `loadVerifiedZ0` already verifies. Does not rerun search or write the catalogue.
 */
export function persistPublishedZ0(archetypeId: string, candidateId: number): LoadedZ0 {
  const catalog = loadPublishedCatalog(join(semanticCatalogRoot(), archetypeId));
  if (catalog.archetypeId !== archetypeId) throw new Error(`${archetypeId} catalogue identity does not match`);
  const published = catalog.candidates.find((item) => item.id === candidateId);
  if (!published) throw new Error(`candidate ${candidateId} is not in the published catalog`);
  if (!published.plan?.body || published.state.seed == null) {
    throw new Error(`candidate ${candidateId} cannot be replayed`);
  }
  if (catalog.evaluationSeed !== EVALUATION_SEED) {
    throw new Error(`catalogue evaluation seed ${catalog.evaluationSeed} is not the semantic evaluation seed`);
  }
  const typologyId = Object.values(ARCHETYPES).find((item) => item.id === archetypeId)?.typologyId;
  if (!typologyId) throw new Error(`${archetypeId} has no typology`);

  const first = evaluateSearchCandidate(published.plan, published.state, { preview: false });
  const second = evaluateSearchCandidate(published.plan, published.state, { preview: false });
  if (!first.z0 || !second.z0) throw new Error(`candidate ${candidateId} did not produce a Z0`);
  if (first.z0.meta.validation.checksum !== second.z0.meta.validation.checksum) {
    throw new Error(`candidate ${candidateId} replay was not repeatable`);
  }

  writeVerifiedZ0(
    archetypeId,
    {
      id: published.id,
      generation: published.generation,
      typologyId,
      plan: published.plan,
      state: published.state,
      objectives: published.objectives,
      parentId: published.lineage.parentId,
      archived: published.current.pareto,
      previewFile: published.preview?.file ?? null,
      evaluationSeed: catalog.evaluationSeed,
    },
    first.z0,
  );

  const loaded = loadVerifiedZ0(archetypeId, candidateId);
  if (!loaded) throw new Error(`verified Z0 for ${archetypeId} candidate ${candidateId} was not readable`);
  if (loaded.meta.validation.checksum !== first.z0.meta.validation.checksum) {
    throw new Error(`stored checksum does not match the replay for candidate ${candidateId}`);
  }
  return loaded;
}
