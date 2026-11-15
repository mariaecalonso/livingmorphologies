/**
 * Chooses biological sources and attractors across open land.
 * The points are inputs to the existing placer. They do not change the solver.
 */

export type CoveragePoint = { x: number; z: number };

export type CoverageChoice = {
  kind: "source" | "attractor";
  surface: "land" | "water";
  x: number;
  z: number;
  reason: string;
};

const SEPARATION_FT = 100;

function extent(points: readonly CoveragePoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function inBand(points: readonly CoveragePoint[], minZ: number, maxZ: number, from: number, to: number) {
  const span = maxZ - minZ;
  const low = minZ + span * from;
  const high = minZ + span * to;
  return points.filter((point) => point.z >= low && (to === 1 ? point.z <= high : point.z < high));
}

function farthestFrom(candidates: readonly CoveragePoint[], taken: readonly CoveragePoint[]) {
  const ranked = [...candidates].sort((left, right) => {
    const gap = (point: CoveragePoint) => taken.length === 0
      ? 0
      : Math.min(...taken.map((item) => Math.hypot(item.x - point.x, item.z - point.z)));
    return gap(right) - gap(left) || left.z - right.z || left.x - right.x;
  });
  return ranked.find((point) => taken.every((item) => Math.hypot(item.x - point.x, item.z - point.z) >= SEPARATION_FT)) ?? null;
}

function edgePoint(points: readonly CoveragePoint[], side: "west" | "east") {
  if (points.length === 0) return null;
  const box = extent(points);
  const limit = side === "west" ? box.minX + 20 : box.maxX - 20;
  const edge = points.filter((point) => side === "west" ? point.x <= limit : point.x >= limit);
  const pool = edge.length > 0 ? edge : points;
  const mid = (box.minZ + box.maxZ) / 2;
  return [...pool].sort((left, right) => Math.abs(left.z - mid) - Math.abs(right.z - mid) || left.x - right.x)[0] ?? null;
}

/**
 * Two sources on the west edge, in the north and south thirds.
 * Two land attractors on the east edge, in the north and middle thirds.
 * One water attractor, only from cells the placer already accepts, kept 100 ft from the land attractors when that cell exists.
 */
export function chooseSiteCoverage(land: readonly CoveragePoint[], water: readonly CoveragePoint[]): CoverageChoice[] {
  if (land.length === 0) return [];
  const box = extent(land);
  const chosen: CoveragePoint[] = [];
  const result: CoverageChoice[] = [];
  const take = (point: CoveragePoint | null, choice: Omit<CoverageChoice, "x" | "z">) => {
    if (!point) return;
    if (chosen.some((item) => Math.hypot(item.x - point.x, item.z - point.z) < SEPARATION_FT)) return;
    chosen.push(point);
    result.push({ ...choice, x: point.x, z: point.z });
  };
  take(edgePoint(inBand(land, box.minZ, box.maxZ, 2 / 3, 1), "west"), {
    kind: "source",
    surface: "land",
    reason: "Western open land in the north third of the eligible land.",
  });
  take(edgePoint(inBand(land, box.minZ, box.maxZ, 0, 1 / 3), "west"), {
    kind: "source",
    surface: "land",
    reason: "Western open land in the south third of the eligible land.",
  });
  take(edgePoint(inBand(land, box.minZ, box.maxZ, 2 / 3, 1), "east"), {
    kind: "attractor",
    surface: "land",
    reason: "Eastern open land in the north third, separated from the sources.",
  });
  take(edgePoint(inBand(land, box.minZ, box.maxZ, 1 / 3, 2 / 3), "east"), {
    kind: "attractor",
    surface: "land",
    reason: "Eastern open land in the middle third, separated from the sources.",
  });
  const waterPoint = farthestFrom(water, chosen.filter((_, index) => result[index]?.kind === "attractor"));
  if (waterPoint) {
    result.push({
      kind: "attractor",
      surface: "water",
      x: waterPoint.x,
      z: waterPoint.z,
      reason: "Eligible in-frame water. The only water cells on this site are at the southeast edge.",
    });
  }
  return result;
}
