/**
 * Read-only evidence metrics for the Pareto page.
 * Inputs are persisted objectives and per-generation archive id lists.
 * Nothing here writes a run or changes dominance, archive membership, or search.
 *
 * Objectives are criterion-match means in [0, 1]. NSGA maximizes all three
 * (`dominates` in nsga.ts). The hypervolume reference is the fixed anti-ideal
 * (0, 0, 0): it is weakly worse than every point in the unit cube, and it does
 * not move between generations.
 */

export type ObjectiveVector = {
  id: number;
  formal: number;
  spatial: number;
  atmospheric: number;
};

export type GenerationArchive = {
  index: number;
  /** Unweighted global archive after this generation. */
  archiveIds: number[];
};

export const HYPERVOLUME_REFERENCE = { formal: 0, spatial: 0, atmospheric: 0 } as const;

type Vec = { x: number; y: number; z: number };

const toVec = (point: ObjectiveVector): Vec => ({
  x: point.formal,
  y: point.spatial,
  z: point.atmospheric,
});

/** 2D hypervolume for maximization against (0, 0). Dominated points add nothing. */
function hypervolume2d(points: readonly { x: number; y: number }[]) {
  const usable = points.filter((point) => point.x > 0 && point.y > 0);
  const front = usable.filter(
    (point, index) =>
      !usable.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.x >= point.x &&
          other.y >= point.y &&
          (other.x > point.x || other.y > point.y),
      ),
  );
  front.sort((a, b) => b.x - a.x || b.y - a.y);
  let volume = 0;
  let bestY = 0;
  for (const point of front) {
    if (point.y > bestY) {
      volume += point.x * (point.y - bestY);
      bestY = point.y;
    }
  }
  return volume;
}

/**
 * 3D hypervolume of the union of boxes from (0, 0, 0) to each point.
 * Z-slice: between successive z levels the 2D hypervolume of points at or above
 * that level is constant. Duplicate and dominated vectors do not add volume.
 */
export function paretoHypervolume(points: readonly ObjectiveVector[]) {
  const usable = points.map(toVec).filter((point) => point.x > 0 && point.y > 0 && point.z > 0);
  if (usable.length === 0) return 0;
  const sorted = [...usable].sort((a, b) => b.z - a.z);
  const active: Vec[] = [];
  let volume = 0;
  let lastZ: number | null = null;
  for (const point of sorted) {
    if (lastZ !== null && point.z < lastZ && active.length > 0) {
      volume += hypervolume2d(active) * (lastZ - point.z);
    }
    active.push(point);
    lastZ = point.z;
  }
  if (lastZ !== null && active.length > 0) volume += hypervolume2d(active) * lastZ;
  return volume;
}

export function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export type ObjectiveMedians = {
  formal: number | null;
  spatial: number | null;
  atmospheric: number | null;
};

export type ObjectiveBounds = {
  formal: { min: number; max: number };
  spatial: { min: number; max: number };
  atmospheric: { min: number; max: number };
};

function bounds(values: readonly number[]) {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/** Min and max of each objective over the same archive used for the median. */
export function archiveBounds(points: readonly ObjectiveVector[]): ObjectiveBounds | null {
  if (points.length === 0) return null;
  const formal = bounds(points.map((point) => point.formal));
  const spatial = bounds(points.map((point) => point.spatial));
  const atmospheric = bounds(points.map((point) => point.atmospheric));
  if (!formal || !spatial || !atmospheric) return null;
  return { formal, spatial, atmospheric };
}

/** Median of each objective over the generation's unweighted archive. */
export function archiveMedians(points: readonly ObjectiveVector[]): ObjectiveMedians {
  return {
    formal: median(points.map((point) => point.formal)),
    spatial: median(points.map((point) => point.spatial)),
    atmospheric: median(points.map((point) => point.atmospheric)),
  };
}

export type TurnoverKind = "retained" | "entrants" | "displaced";

export type Turnover = {
  from: number;
  to: number;
  retained: number;
  entrants: number;
  displaced: number;
  retainedIds: number[];
  entrantIds: number[];
  displacedIds: number[];
};

/** Membership change of the unweighted archive between two saved snapshots. */
export function archiveTurnover(previous: readonly number[], next: readonly number[], from: number, to: number): Turnover {
  const before = new Set(previous);
  const after = new Set(next);
  const retainedIds: number[] = [];
  const entrantIds: number[] = [];
  const displacedIds: number[] = [];
  for (const id of after) {
    if (before.has(id)) retainedIds.push(id);
    else entrantIds.push(id);
  }
  for (const id of before) if (!after.has(id)) displacedIds.push(id);
  return {
    from,
    to,
    retained: retainedIds.length,
    entrants: entrantIds.length,
    displaced: displacedIds.length,
    retainedIds,
    entrantIds,
    displacedIds,
  };
}

export type Spread = {
  formal: number;
  spatial: number;
  atmospheric: number;
  /** Mean Euclidean nearest-neighbor distance. Null when the archive has fewer than two members. */
  nearestNeighbor: number | null;
};

function span(values: readonly number[]) {
  if (values.length === 0) return 0;
  let low = values[0];
  let high = values[0];
  for (const value of values) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return high - low;
}

export function archiveSpread(points: readonly ObjectiveVector[]): Spread {
  const nearestNeighbor = (() => {
    if (points.length < 2) return null;
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      let best = Number.POSITIVE_INFINITY;
      for (let j = 0; j < points.length; j += 1) {
        if (i === j) continue;
        const distance = Math.hypot(
          points[i].formal - points[j].formal,
          points[i].spatial - points[j].spatial,
          points[i].atmospheric - points[j].atmospheric,
        );
        if (distance < best) best = distance;
      }
      sum += best;
    }
    return sum / points.length;
  })();
  return {
    formal: span(points.map((point) => point.formal)),
    spatial: span(points.map((point) => point.spatial)),
    atmospheric: span(points.map((point) => point.atmospheric)),
    nearestNeighbor,
  };
}

export type MutantRecord = {
  id: number;
  generation: number;
  parentId: number | null;
  formal: number;
  spatial: number;
  atmospheric: number;
};

/**
 * A mutant Pareto-improves its parent when it is worse in no objective and
 * strictly better in at least one. Entry means the id is in the unweighted
 * archive snapshot of the generation in which it was born.
 */
export function mutantSuccess(candidates: readonly MutantRecord[], archives: readonly GenerationArchive[]) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const archiveAt = new Map(archives.map((generation) => [generation.index, new Set(generation.archiveIds)]));
  let mutants = 0;
  let improvements = 0;
  let entered = 0;
  for (const candidate of candidates) {
    if (candidate.parentId == null) continue;
    const parent = byId.get(candidate.parentId);
    if (!parent) continue;
    mutants += 1;
    const formal = candidate.formal - parent.formal;
    const spatial = candidate.spatial - parent.spatial;
    const atmospheric = candidate.atmospheric - parent.atmospheric;
    const worse = formal < 0 || spatial < 0 || atmospheric < 0;
    const better = formal > 0 || spatial > 0 || atmospheric > 0;
    if (!worse && better) improvements += 1;
    if (archiveAt.get(candidate.generation)?.has(candidate.id)) entered += 1;
  }
  return {
    mutants,
    improvements,
    entered,
    improvementRate: mutants === 0 ? null : improvements / mutants,
    entryRate: mutants === 0 ? null : entered / mutants,
  };
}

export type GenerationAnalytics = {
  index: number;
  hypervolume: number | null;
  medians: ObjectiveMedians;
  bounds: ObjectiveBounds | null;
  spread: Spread | null;
  size: number;
};

export function generationAnalytics(
  generations: readonly GenerationArchive[],
  byId: ReadonlyMap<number, ObjectiveVector>,
): GenerationAnalytics[] {
  return generations.map((generation) => {
    const points = generation.archiveIds.map((id) => byId.get(id)).filter((point): point is ObjectiveVector => point != null);
    return {
      index: generation.index,
      hypervolume: points.length === 0 ? null : paretoHypervolume(points),
      medians: archiveMedians(points),
      bounds: archiveBounds(points),
      spread: points.length === 0 ? null : archiveSpread(points),
      size: points.length,
    };
  });
}
