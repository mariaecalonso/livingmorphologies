import type { CatalogEntry, CombinedCatalog, MorphologyDistance, SemanticCandidate } from "./types";
import { roleNames } from "./preservation";

/**
 * Designer-facing catalog. Does not remove candidates from the research record
 * or from parent pools. First representative rule: more current preservation
 * roles. Equal role counts use the lower candidate id. That id order is a
 * temporary stable fallback, not a claim that older or Pareto candidates win.
 */
export function buildCombinedCatalog(
  candidates: readonly SemanticCandidate[],
  preservedIds: readonly number[],
  dedup: { distance: MorphologyDistance; redundancyThreshold: number } | null | undefined,
): CombinedCatalog {
  const preserved = candidates.filter((candidate) => preservedIds.includes(candidate.id));
  const ranked = [...preserved].sort((a, b) => roleNames(b).length - roleNames(a).length || a.id - b.id);
  if (!dedup) {
    return {
      dedup: "uncalibrated",
      redundancyThreshold: null,
      entries: ranked.map((candidate) => ({ representativeId: candidate.id, hiddenIds: [], roleCount: roleNames(candidate).length })),
    };
  }
  const entries: CatalogEntry[] = [];
  const hidden = new Set<number>();
  for (const candidate of ranked) {
    if (hidden.has(candidate.id)) continue;
    const hiddenIds: number[] = [];
    for (const other of ranked) {
      if (other.id === candidate.id || hidden.has(other.id)) continue;
      if (entries.some((entry) => entry.representativeId === other.id)) continue;
      const gap = dedup.distance(
        { id: candidate.id, phenotype: candidate.phenotype },
        { id: other.id, phenotype: other.phenotype },
      );
      if (gap < dedup.redundancyThreshold) {
        hiddenIds.push(other.id);
        hidden.add(other.id);
      }
    }
    entries.push({ representativeId: candidate.id, hiddenIds, roleCount: roleNames(candidate).length });
  }
  return { dedup: "applied", redundancyThreshold: dedup.redundancyThreshold, entries };
}

export function visibleIds(catalog: CombinedCatalog) {
  return catalog.entries.map((entry) => entry.representativeId);
}
