/**
 * NSGA-II-style ranking for the version-1 evolutionary search. Pure functions.
 * Formal, Spatial, and Atmospheric are maximized independently; there is no
 * scalarized best. A feasible candidate dominates any infeasible one.
 */

export type Objectives = {
  formal: number;
  spatial: number;
  atmospheric: number;
};

export type Rankable = {
  feasible: boolean;
  objectives: Objectives;
};

export const OBJECTIVE_KEYS = ["formal", "spatial", "atmospheric"] as const;

export function dominates(a: Rankable, b: Rankable): boolean {
  if (a.feasible !== b.feasible) return a.feasible;
  if (!a.feasible) return false;
  let better = false;
  for (const key of OBJECTIVE_KEYS) {
    if (a.objectives[key] < b.objectives[key]) return false;
    if (a.objectives[key] > b.objectives[key]) better = true;
  }
  return better;
}

/** Fronts as index lists; fronts[0] is non-dominated within `items`. */
export function nondominatedSort(items: readonly Rankable[]): number[][] {
  const dominatedBy = items.map(() => 0);
  const dominating: number[][] = items.map(() => []);
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (dominates(items[i], items[j])) {
        dominating[i].push(j);
        dominatedBy[j] += 1;
      } else if (dominates(items[j], items[i])) {
        dominating[j].push(i);
        dominatedBy[i] += 1;
      }
    }
  }
  const fronts: number[][] = [];
  let current = items.map((_, index) => index).filter((index) => dominatedBy[index] === 0);
  while (current.length) {
    fronts.push(current);
    const next: number[] = [];
    for (const i of current) {
      for (const j of dominating[i]) {
        dominatedBy[j] -= 1;
        if (dominatedBy[j] === 0) next.push(j);
      }
    }
    current = next.sort((a, b) => a - b);
  }
  return fronts;
}

const vectorKey = (item: Rankable) => OBJECTIVE_KEYS.map((key) => item.objectives[key]).join("|");

/**
 * Crowding distance within one front, normalized per objective by the front's range.
 * Boundary points are infinite. Identical objective vectors share one value, so
 * duplicates earn no extra diversity credit.
 */
export function crowdingDistances(items: readonly Rankable[], front: readonly number[]): Map<number, number> {
  const groups = new Map<string, number[]>();
  for (const index of front) {
    const key = vectorKey(items[index]);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  }
  const unique = [...groups.values()].map((members) => members[0]);
  const distance = new Map<number, number>(unique.map((index) => [index, 0]));
  if (unique.length <= 2) {
    for (const index of unique) distance.set(index, Number.POSITIVE_INFINITY);
  } else {
    for (const key of OBJECTIVE_KEYS) {
      const sorted = [...unique].sort((a, b) => items[a].objectives[key] - items[b].objectives[key] || a - b);
      const low = items[sorted[0]].objectives[key];
      const high = items[sorted[sorted.length - 1]].objectives[key];
      const range = high - low;
      if (range <= 0) continue;
      distance.set(sorted[0], Number.POSITIVE_INFINITY);
      distance.set(sorted[sorted.length - 1], Number.POSITIVE_INFINITY);
      for (let k = 1; k < sorted.length - 1; k += 1) {
        const index = sorted[k];
        const gap = (items[sorted[k + 1]].objectives[key] - items[sorted[k - 1]].objectives[key]) / range;
        distance.set(index, (distance.get(index) ?? 0) + gap);
      }
    }
  }
  const out = new Map<number, number>();
  for (const members of groups.values()) {
    const value = distance.get(members[0]) ?? 0;
    for (const index of members) out.set(index, value);
  }
  return out;
}

export type RankResult = {
  /** 1-based front index per item. */
  rank: number[];
  crowding: number[];
  fronts: number[][];
};

export function rankPopulation(items: readonly Rankable[]): RankResult {
  const fronts = nondominatedSort(items);
  const rank = items.map(() => 0);
  const crowding = items.map(() => 0);
  fronts.forEach((front, f) => {
    const distances = crowdingDistances(items, front);
    for (const index of front) {
      rank[index] = f + 1;
      crowding[index] = distances.get(index) ?? 0;
    }
  });
  return { rank, crowding, fronts };
}

/** Binary tournament: lower rank wins, then higher crowding, then the first draw. */
export function tournament(rank: readonly number[], crowding: readonly number[], rng: () => number): number {
  const n = rank.length;
  const a = Math.floor(rng() * n);
  if (n < 2) return a;
  let b = Math.floor(rng() * (n - 1));
  if (b >= a) b += 1;
  if (rank[a] !== rank[b]) return rank[a] < rank[b] ? a : b;
  if (crowding[a] !== crowding[b]) return crowding[a] > crowding[b] ? a : b;
  return a;
}

/** Elitist survival: whole fronts in order, the overflowing front cut by crowding. */
export function selectSurvivors(items: readonly Rankable[], size: number): { survivors: number[]; ranking: RankResult } {
  const ranking = rankPopulation(items);
  const survivors: number[] = [];
  for (const front of ranking.fronts) {
    if (survivors.length + front.length <= size) {
      survivors.push(...front);
      continue;
    }
    const rest = [...front].sort((a, b) => ranking.crowding[b] - ranking.crowding[a] || a - b);
    survivors.push(...rest.slice(0, size - survivors.length));
    break;
  }
  return { survivors, ranking };
}

/**
 * Global external archive: feasible candidates not dominated by any candidate
 * evaluated so far. A newcomer that dominates members removes them.
 */
export function updateArchive<T extends Rankable>(archive: readonly T[], incoming: readonly T[]): T[] {
  let next = [...archive];
  for (const candidate of incoming) {
    if (!candidate.feasible) continue;
    if (next.some((member) => dominates(member, candidate))) continue;
    next = next.filter((member) => !dominates(candidate, member));
    next.push(candidate);
  }
  return next;
}
