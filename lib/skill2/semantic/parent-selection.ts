import type { DiversityParentSelection } from "./types";

/**
 * Draws one Diversity parent.
 * `provisional-uniform` is an explicit stand-in: each pool member has an equal
 * chance. It is not the research method for Diversity reproduction.
 * A later method replaces it by passing `{ kind: "custom", select }`.
 */
export function selectDiversityParent(
  ids: readonly number[],
  selection: DiversityParentSelection,
  rng: () => number,
): number {
  if (ids.length === 0) throw new Error("Diversity parent pool is empty");
  if (selection.kind === "provisional-uniform") return ids[Math.floor(rng() * ids.length)];
  const chosen = selection.select(ids, rng);
  if (!ids.includes(chosen)) throw new Error("Diversity parent strategy returned an id outside the pool");
  return chosen;
}
