import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { readCatalogSelection, snapshotMatchesSelection } from "@/lib/skill2/read-published-selection";
import { loadVerifiedZ0 } from "@/lib/skill2/semantic/z0-snapshot";
import type { ResolvedProcessSource } from "@/lib/skill3/selection";

/**
 * Reads one published Skill 2 candidate and its stored Z0.
 * Does not replay, persist, or sample continuations.
 */
export function readProcessSource(archetypeId: string, candidateId: number): ResolvedProcessSource | null {
  const selection = readCatalogSelection(archetypeId, candidateId);
  if (!selection) return null;
  const authored = Object.values(ARCHETYPES).find((item) => item.id === archetypeId);
  const archetypeName = authored?.name ?? archetypeId;
  try {
    const loaded = loadVerifiedZ0(archetypeId, candidateId);
    if (
      !loaded
      || loaded.meta.validation.algorithm !== "z0-sha256-v1"
      || !snapshotMatchesSelection(loaded.meta, selection)
    ) {
      return { selection, archetypeName: loaded?.meta.identity.archetypeName ?? archetypeName, handoff: "pending", z0Iteration: null, checksum: null };
    }
    return {
      selection,
      archetypeName: loaded.meta.identity.archetypeName,
      handoff: "verified",
      z0Iteration: loaded.meta.z0.iteration,
      checksum: loaded.meta.validation.checksum,
    };
  } catch {
    return { selection, archetypeName, handoff: "pending", z0Iteration: null, checksum: null };
  }
}
