import type { PhysarumParams, Rating, RatingsMap } from "./types";

const rating = (map: RatingsMap, id: string): number => map[id] ?? 1;

export function hashSeed(parts: string[]): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function toPhysarumParams(
  ratings: RatingsMap,
  seed: number,
): PhysarumParams {
  const complexity = rating(ratings, "complexity");
  const proportionality = rating(ratings, "proportionality");
  const directionality = rating(ratings, "directionality");
  const openness = rating(ratings, "openness");
  const connectivity = rating(ratings, "connectivity");
  const centrality = rating(ratings, "centrality");
  const contrast = rating(ratings, "contrast");
  const visibility = rating(ratings, "visibility");
  const hierarchy = rating(ratings, "hierarchy");

  return {
    seed,
    agentCount: 220 + complexity * 90 + connectivity * 40,
    sensorAngle: 0.28 + openness * 0.22,
    sensorDistance: 6 + visibility * 4 + openness * 3,
    turnAngle: 0.22 + (2 - proportionality) * 0.12,
    stepSize: 1.05 + directionality * 0.22,
    deposit: 0.085 + connectivity * 0.045,
    decay: 0.012 + (2 - centrality) * 0.006,
    spread: 0.35 + openness * 0.28,
    elongate: directionality / 2,
    centerPull: centrality / 2,
    contrast: contrast / 2,
    hierarchy: hierarchy / 2,
    visibility: visibility / 2,
  };
}

export function simulationStats(params: PhysarumParams, iteration: number) {
  const rng = mulberry32(params.seed ^ (iteration * 9973));
  const inputNodes = Math.round(128 + params.agentCount * 0.12 + rng() * 18);
  const activePaths = Math.round(
    24 + params.deposit * 180 + params.spread * 20 + rng() * 8,
  );
  const convergence = Math.round(
    54 + params.centerPull * 22 + (1 - params.spread) * 12 + rng() * 6,
  );
  return {
    inputNodes,
    activePaths,
    convergence: Math.min(96, Math.max(42, convergence)),
  };
}

export function criteriaFit(original: RatingsMap, current: RatingsMap) {
  const score = (ids: string[]) => {
    const total = ids.reduce((sum, id) => {
      const a = original[id] ?? 1;
      const b = current[id] ?? 1;
      return sum + (1 - Math.abs(a - b) / 2);
    }, 0);
    return total / ids.length;
  };

  const formal = score(["complexity", "proportionality", "directionality"]);
  const spatial = score(["openness", "connectivity", "centrality"]);
  const atmospheric = score(["contrast", "visibility", "hierarchy"]);
  const overall = (formal + spatial + atmospheric) / 3;

  return { formal, spatial, atmospheric, overall };
}

export function ratingLabel(value: Rating): string {
  return ["Low", "Medium", "High"][value];
}
