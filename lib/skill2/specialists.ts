import { genomeKey, type Genome } from "./genome";
import type { Objectives } from "./nsga";

export const SPECIALIST_LIMIT = 4;
export const EMPHASIS_KEYS = ["formal", "spatial", "atmospheric"] as const;
export type Emphasis = (typeof EMPHASIS_KEYS)[number];

export type SpecialistIds = Record<Emphasis, number[]>;

export const EMPTY_SPECIALISTS: SpecialistIds = { formal: [], spatial: [], atmospheric: [] };

export type SpecialistSource = {
  id: number;
  feasible: boolean;
  objectives: Objectives;
  genome: Genome;
};

const DRIFT_GAP = 0.15;
const RADIUS_GAP = 0.01;

export function generalQuality(objectives: Objectives) {
  return (objectives.formal + objectives.spatial + objectives.atmospheric) / 3;
}

export function emphasisScore(objectives: Objectives, emphasis: Emphasis) {
  const favored = objectives[emphasis];
  const others = EMPHASIS_KEYS.filter((key) => key !== emphasis).map((key) => objectives[key]);
  return 0.5 * favored + 0.25 * others[0] + 0.25 * others[1];
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) / 2;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

export function differentEnough(a: Genome, b: Genome) {
  const drift = Math.hypot(a.driftX - b.driftX, a.driftY - b.driftY);
  if (drift >= DRIFT_GAP) return true;
  if (Math.abs(a.uniformRadiusScale - b.uniformRadiusScale) >= RADIUS_GAP) return true;
  const turn = Math.abs(Math.atan2(Math.sin(a.orientation - b.orientation), Math.cos(a.orientation - b.orientation)));
  return turn > 1e-9;
}

export function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

function bias(candidate: SpecialistSource, emphasis: Emphasis) {
  return emphasisScore(candidate.objectives, emphasis) - generalQuality(candidate.objectives);
}

/**
 * At most four specialists in each emphasis. A design is assigned to only one
 * preference, and it must sit apart from every specialist already chosen.
 * The two non-emphasized objectives must clear the feasible 25th percentile.
 */
export function selectSpecialists(candidates: readonly SpecialistSource[], archiveIds: readonly number[]): SpecialistIds {
  const archive = new Set(archiveIds);
  const feasible = candidates.filter((candidate) => candidate.feasible);
  const qualityMedian = median(feasible.map((candidate) => generalQuality(candidate.objectives)));
  const floor = {
    formal: percentile(feasible.map((candidate) => candidate.objectives.formal), 0.25),
    spatial: percentile(feasible.map((candidate) => candidate.objectives.spatial), 0.25),
    atmospheric: percentile(feasible.map((candidate) => candidate.objectives.atmospheric), 0.25),
  };
  const eligibleFor = (candidate: SpecialistSource, emphasis: Emphasis) => {
    if (!candidate.feasible || archive.has(candidate.id)) return false;
    if (generalQuality(candidate.objectives) < qualityMedian) return false;
    return EMPHASIS_KEYS.filter((key) => key !== emphasis).every((key) => candidate.objectives[key] >= floor[key]);
  };
  const assigned = candidates.flatMap((candidate) => {
    const homes = EMPHASIS_KEYS.filter((emphasis) => eligibleFor(candidate, emphasis));
    if (homes.length === 0) return [];
    homes.sort(
      (a, b) => bias(candidate, b) - bias(candidate, a) || emphasisScore(candidate.objectives, b) - emphasisScore(candidate.objectives, a),
    );
    return [{ candidate, emphasis: homes[0] }];
  });
  assigned.sort(
    (a, b) =>
      bias(b.candidate, b.emphasis) - bias(a.candidate, a.emphasis) ||
      emphasisScore(b.candidate.objectives, b.emphasis) - emphasisScore(a.candidate.objectives, a.emphasis) ||
      a.candidate.id - b.candidate.id,
  );
  const chosen: SpecialistIds = { formal: [], spatial: [], atmospheric: [] };
  const kept: SpecialistSource[] = [];
  for (const { candidate, emphasis } of assigned) {
    if (chosen[emphasis].length >= SPECIALIST_LIMIT) continue;
    if (kept.every((other) => differentEnough(candidate.genome, other.genome))) {
      chosen[emphasis].push(candidate.id);
      kept.push(candidate);
    }
  }
  return chosen;
}

export function selectOrientationElites(candidates: readonly SpecialistSource[], orientations: readonly number[]): number[] {
  const chosen: number[] = [];
  for (const orientation of orientations) {
    const matching = candidates.filter((candidate) => {
      if (!candidate.feasible) return false;
      const turn = Math.abs(Math.atan2(Math.sin(candidate.genome.orientation - orientation), Math.cos(candidate.genome.orientation - orientation)));
      return turn <= 1e-6;
    });
    matching.sort((a, b) => generalQuality(b.objectives) - generalQuality(a.objectives) || a.id - b.id);
    if (matching[0]) chosen.push(matching[0].id);
  }
  return chosen;
}

export function specialistIdList(specialists: SpecialistIds) {
  return EMPHASIS_KEYS.flatMap((key) => specialists[key]);
}

export function newGenerationMix(generation: number) {
  if (generation === 2) return { mutants: 24, explorers: 56 };
  if (generation === 3) return { mutants: 40, explorers: 40 };
  if (generation === 4) return { mutants: 56, explorers: 24 };
  return { mutants: 0, explorers: 80 };
}

export function tooClose(genome: Genome, existing: Genome) {
  return !differentEnough(genome, existing);
}

export function genomeIdentity(genome: Genome) {
  return genomeKey(genome);
}
