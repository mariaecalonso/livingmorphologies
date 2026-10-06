import type { ArchetypeSearchAdapter } from "./adapter";
import type { CatalogEntry, CombinedCatalog, MorphologyDistance, SemanticCandidate, SemanticPlan } from "./types";
import { roleNames } from "./preservation";

export type CatalogVisibility = {
  adapter: ArchetypeSearchAdapter;
  /** When set, descriptor distance 0 is hidden even if the calibrated threshold is off. */
  distance?: MorphologyDistance | null;
};

/**
 * Designer-facing catalog. Does not remove candidates from the research record
 * or from parent pools. First representative rule: more current preservation
 * roles. Equal role counts use the lower candidate id. That id order is a
 * temporary stable fallback, not a claim that older or Pareto candidates win.
 * A candidate is also hidden when its descriptor distance to a kept candidate
 * is 0, or when the plans differ only in genes marked `place`.
 */
export function buildCombinedCatalog(
  candidates: readonly SemanticCandidate[],
  preservedIds: readonly number[],
  dedup: { distance: MorphologyDistance; redundancyThreshold: number } | null | undefined,
  visibility?: CatalogVisibility | null,
): CombinedCatalog {
  const preserved = candidates.filter((candidate) => preservedIds.includes(candidate.id));
  const ranked = [...preserved].sort((a, b) => roleNames(b).length - roleNames(a).length || a.id - b.id);
  const entries: CatalogEntry[] = [];
  const hidden = new Set<number>();
  for (const candidate of ranked) {
    if (hidden.has(candidate.id)) continue;
    const hiddenIds: number[] = [];
    for (const other of ranked) {
      if (other.id === candidate.id || hidden.has(other.id)) continue;
      if (entries.some((entry) => entry.representativeId === other.id)) continue;
      if (sameVisibleMorphology(candidate, other, visibility)) {
        hiddenIds.push(other.id);
        hidden.add(other.id);
        continue;
      }
      if (!dedup) continue;
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
  return {
    dedup: dedup ? "applied" : "uncalibrated",
    redundancyThreshold: dedup?.redundancyThreshold ?? null,
    entries,
  };
}

export function visibleIds(catalog: CombinedCatalog) {
  return catalog.entries.map((entry) => entry.representativeId);
}

function sameVisibleMorphology(candidate: SemanticCandidate, other: SemanticCandidate, visibility?: CatalogVisibility | null) {
  if (!visibility) return false;
  if (visibility.distance) {
    const gap = visibility.distance(
      { id: candidate.id, phenotype: candidate.phenotype },
      { id: other.id, phenotype: other.phenotype },
    );
    if (gap === 0) return true;
  }
  return placementOnly(visibility.adapter, candidate.plan, other.plan);
}

function placementOnly(adapter: ArchetypeSearchAdapter, left: SemanticPlan, right: SemanticPlan) {
  const genes = adapter.genes().filter((gene) => gene.kind !== "derived" && gene.kind !== "unused");
  let differed = false;
  for (const gene of genes) {
    if (sameValue(adapter.readGene(left, gene.name), adapter.readGene(right, gene.name))) continue;
    if (gene.mutationRole !== "place") return false;
    differed = true;
  }
  return differed;
}

function sameValue(left: unknown, right: unknown) {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}
