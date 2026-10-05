import type { MorphologyDistance, PhenotypeRecord } from "./types";

export type DistancePoint = { id: number; phenotype: PhenotypeRecord };

/**
 * Farthest-first rescue. No fixed cap.
 * A candidate at or beyond `threshold` is rescued. An empty represented set rescues nobody.
 */
export function selectDiversityRescue(
  represented: readonly DistancePoint[],
  remaining: readonly DistancePoint[],
  distance: MorphologyDistance,
  threshold: number,
): { status: "applied" | "no-represented-seed"; rescuedIds: number[] } {
  if (represented.length === 0) return { status: "no-represented-seed", rescuedIds: [] };
  const seed = [...represented];
  const pool = [...remaining];
  const rescuedIds: number[] = [];
  while (pool.length) {
    let best = 0;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i += 1) {
      const nearest = Math.min(...seed.map((item) => distance(pool[i], item)));
      if (nearest > bestDistance || (nearest === bestDistance && pool[i].id < pool[best].id)) {
        best = i;
        bestDistance = nearest;
      }
    }
    if (!(bestDistance >= threshold)) break;
    const chosen = pool.splice(best, 1)[0];
    rescuedIds.push(chosen.id);
    seed.push(chosen);
  }
  return { status: "applied", rescuedIds };
}

/**
 * Tag already-preserved candidates whose nearest preserved neighbor exceeds
 * the supplied threshold. A single preserved candidate is tagged: nothing else
 * occupies its morphology. No threshold is assumed by this function.
 */
export function selectDiversityTags(preserved: readonly DistancePoint[], distance: MorphologyDistance, threshold: number): number[] {
  return preserved
    .filter((candidate) => {
      const others = preserved.filter((item) => item.id !== candidate.id);
      if (others.length === 0) return true;
      const nearest = Math.min(...others.map((item) => distance(candidate, item)));
      return nearest >= threshold;
    })
    .map((candidate) => candidate.id);
}
