import { crowdingDistances, nondominatedSort, type Rankable } from "../nsga";
import type { CrowdingValue } from "./types";

export function paretoFront<T extends Rankable>(items: readonly T[]): number[] {
  const fronts = nondominatedSort(items);
  return fronts[0] ?? [];
}

export function frontCrowding<T extends Rankable>(items: readonly T[], front: readonly number[]): Map<number, CrowdingValue> {
  const distances = crowdingDistances(items, front);
  const out = new Map<number, CrowdingValue>();
  for (const index of front) {
    const value = distances.get(index) ?? 0;
    out.set(index, value === Number.POSITIVE_INFINITY ? "boundary" : value);
  }
  return out;
}

/**
 * NSGA-II binary tournament on crowding. Higher crowding wins.
 * A boundary point beats any finite value. Equal crowding keeps the lower id.
 * This is not a combined Formal / Spatial / Atmospheric score.
 */
export function selectCrowdingParent(ids: readonly number[], crowding: ReadonlyMap<number, CrowdingValue>, rng: () => number): number {
  if (ids.length === 0) throw new Error("Pareto parent pool is empty");
  if (ids.length === 1) return ids[0];
  const a = ids[Math.floor(rng() * ids.length)];
  const b = ids[Math.floor(rng() * ids.length)];
  return preferCrowding(a, b, crowding);
}

export function preferCrowding(a: number, b: number, crowding: ReadonlyMap<number, CrowdingValue>) {
  const left = rankCrowding(crowding.get(a) ?? 0);
  const right = rankCrowding(crowding.get(b) ?? 0);
  if (left === right) return Math.min(a, b);
  return left > right ? a : b;
}

function rankCrowding(value: CrowdingValue) {
  return value === "boundary" ? Number.POSITIVE_INFINITY : value;
}
