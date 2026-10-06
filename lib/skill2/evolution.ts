import { mulberry32 } from "../physarum";
import { translateArchetype } from "../skill1/translate";
import type { BiologicalTranslation } from "../skill1/types";
import type { TypologyId } from "../types";
import { EVALUATION_SEED, PREVIEW_SIZE, type GenomeEvaluation } from "./evolution-evaluate";
import {
  CANONICAL_GENOME,
  GENOME_BOUNDS,
  clampRadiusScale,
  genomeKey,
  genomeNotes,
  isLegalGenome,
  legalOrientations,
  projectDrift,
  type Genome,
} from "./genome";
import { selectSurvivors, tournament, updateArchive, type Objectives } from "./nsga";

/**
 * Version-1 evolutionary controller. One independent search per archetype:
 * G01 is a legal sample of the realization genome, G02–G04 are mutated
 * offspring with elitist parent + offspring survival. No crossover, no
 * scalarized best; the output is the global non-dominated archive.
 */
export type EvolutionConfig = {
  generations: number;
  populationSize: number;
  /** Gaussian step per drift axis in G02, in Skill 1 field units. */
  initialDriftStep: number;
  initialRadiusStep: number;
  /** Step multiplier per generation after G02. */
  stepDecay: number;
  orientationMutationRate: number;
  /** G01 rejection sampling budget per candidate. */
  maxSampleAttempts: number;
  /** Re-mutations when an offspring repeats an evaluated genome. */
  maxDuplicateRetries: number;
  repairIterations: number;
};

export const EVOLUTION_CONFIG: EvolutionConfig = {
  generations: 4,
  populationSize: 80,
  initialDriftStep: 0.3,
  initialRadiusStep: 0.03,
  stepDecay: 0.75,
  orientationMutationRate: 0.1,
  maxSampleAttempts: 1000,
  maxDuplicateRetries: 5,
  repairIterations: 30,
};

export type PreviewRef = { file: string; index: number };

export type Candidate = {
  id: number;
  archetypeId: string;
  typologyId: TypologyId;
  generation: number;
  parentId: number | null;
  genome: Genome;
  evaluationSeed: number;
  feasible: boolean;
  objectives: Objectives;
  criterionMatch: Record<string, number>;
  observed: Record<string, number>;
  /** e.g. canonical, drift-repaired, orientation-mutated, duplicate-genome, disk-crosses-boundary. */
  flags: string[];
  /** Front index in the survival pool of the candidate's own generation. 1 = non-dominated there. */
  rank: number;
  crowding: number;
  /** Currently in the global external non-dominated archive. Distinct from rank 1. */
  archived: boolean;
  preview: PreviewRef;
};

/** Boundary crowding is Infinity in memory and null in run.json. */
export type PoolEntry = { id: number; rank: number; crowding: number; survived: boolean };

export type GenerationRecord = {
  generation: number;
  driftStep: number;
  radiusStep: number;
  evaluated: number;
  feasible: number;
  /** G01: the 80 initial candidates. Later: 80 parents + 80 offspring. */
  pool: PoolEntry[];
  /** Rank 1 within this generation's pool (generation-specific front). */
  frontIds: number[];
  survivorIds: number[];
  /** Snapshot of the global archive after this generation. */
  archiveIds: number[];
  previewFile: string;
};

export type EvolutionRun = {
  version: 1 | 2;
  archetypeId: string;
  typologyId: TypologyId;
  evaluationSeed: number;
  controllerSeed: number;
  config: EvolutionConfig;
  genomeBounds: typeof GENOME_BOUNDS;
  legalOrientations: number[];
  previewSize: number;
  completedGenerations: number;
  generations: GenerationRecord[];
  candidates: Candidate[];
  /** Current global archive; the Pareto Catalog reads this, not rank 1. */
  archiveIds: number[];
  /**
   * Present on stored version-2 archives. This controller does not select them.
   * The catalog reader falls back to empty lists when a run omits them.
   */
  specialistIds?: {
    formal: number[];
    spatial: number[];
    atmospheric: number[];
  };
  /** Best feasible candidate for each legal orientation, when a stored run recorded one. */
  orientationEliteIds?: number[];
};

export type EvaluateBatch = (genomes: Genome[]) => Promise<GenomeEvaluation[]>;

export const previewFileFor = (generation: number) => `previews-g${String(generation).padStart(2, "0")}.bin`;

export function mutationSteps(generation: number, config: EvolutionConfig = EVOLUTION_CONFIG) {
  if (generation < 2) return { driftStep: 0, radiusStep: 0 };
  const k = config.stepDecay ** (generation - 2);
  return { driftStep: config.initialDriftStep * k, radiusStep: config.initialRadiusStep * k };
}

/** Controller RNG, separate from the simulation seed. Derived per generation so a resumed run repeats exactly. */
export function generationRng(controllerSeed: number, generation: number) {
  return mulberry32((controllerSeed ^ Math.imul(generation, 0x9e3779b1)) >>> 0);
}

function gaussian(rng: () => number) {
  const u = Math.max(Number.EPSILON, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const sameAngle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= 1e-9;

/** G01: canonical pose first, then rejection-sampled legal genomes. Illegal samples are resampled, never shrunk. */
export function sampleInitialGenomes(
  base: BiologicalTranslation,
  rng: () => number,
  config: EvolutionConfig = EVOLUTION_CONFIG,
  legal = legalOrientations(base),
): Genome[] {
  if (!legal.length) throw new Error(`${base.archetypeId}: no legal orientation keeps the marks inside the field`);
  if (!isLegalGenome(base, CANONICAL_GENOME, legal)) throw new Error(`${base.archetypeId}: canonical pose is not legal`);
  const genomes: Genome[] = [{ ...CANONICAL_GENOME }];
  const seen = new Set([genomeKey(CANONICAL_GENOME)]);
  while (genomes.length < config.populationSize) {
    let accepted: Genome | null = null;
    for (let attempt = 0; attempt < config.maxSampleAttempts && !accepted; attempt += 1) {
      const r = GENOME_BOUNDS.driftMagnitude * Math.sqrt(rng());
      const theta = rng() * Math.PI * 2;
      const genome: Genome = {
        driftX: r * Math.cos(theta),
        driftY: r * Math.sin(theta),
        uniformRadiusScale:
          GENOME_BOUNDS.radiusScaleMin + rng() * (GENOME_BOUNDS.radiusScaleMax - GENOME_BOUNDS.radiusScaleMin),
        orientation: legal[Math.floor(rng() * legal.length)],
      };
      if (!seen.has(genomeKey(genome)) && isLegalGenome(base, genome, legal)) accepted = genome;
    }
    if (!accepted) {
      throw new Error(
        `${base.archetypeId}: G01 candidate ${genomes.length + 1} found no legal unique genome in ${config.maxSampleAttempts} samples`,
      );
    }
    seen.add(genomeKey(accepted));
    genomes.push(accepted);
  }
  return genomes;
}

/** Largest legal step from a legal anchor drift toward the mutated drift. */
function repairDrift(
  base: BiologicalTranslation,
  genome: Genome,
  anchor: { driftX: number; driftY: number },
  legal: number[],
  iterations: number,
): Genome {
  const at = (t: number): Genome => ({
    ...genome,
    driftX: anchor.driftX + (genome.driftX - anchor.driftX) * t,
    driftY: anchor.driftY + (genome.driftY - anchor.driftY) * t,
  });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    if (isLegalGenome(base, at(mid), legal)) lo = mid;
    else hi = mid;
  }
  return at(lo);
}

/** Bounded mutation for G02 onward. Drift is projected onto the disk, radius clamped, orientation jumps rarely. */
export function mutateGenome(
  base: BiologicalTranslation,
  parent: Genome,
  generation: number,
  rng: () => number,
  config: EvolutionConfig = EVOLUTION_CONFIG,
  legal = legalOrientations(base),
): { genome: Genome; flags: string[] } {
  const { driftStep, radiusStep } = mutationSteps(generation, config);
  const flags: string[] = [];
  const drift = projectDrift(parent.driftX + gaussian(rng) * driftStep, parent.driftY + gaussian(rng) * driftStep);
  let orientation = parent.orientation;
  const others = legal.filter((angle) => !sameAngle(angle, parent.orientation));
  const parentLegal = others.length < legal.length;
  if (!parentLegal) {
    orientation = legal[Math.floor(rng() * legal.length)];
    flags.push("orientation-mutated");
  } else if (others.length && rng() < config.orientationMutationRate) {
    orientation = others[Math.floor(rng() * others.length)];
    flags.push("orientation-mutated");
  }
  let genome: Genome = {
    ...drift,
    uniformRadiusScale: clampRadiusScale(parent.uniformRadiusScale + gaussian(rng) * radiusStep),
    orientation,
  };
  if (!isLegalGenome(base, genome, legal)) {
    const parentDrift = { driftX: parent.driftX, driftY: parent.driftY };
    const anchorLegal = isLegalGenome(base, { ...genome, ...parentDrift }, legal);
    const anchor = anchorLegal ? parentDrift : { driftX: 0, driftY: 0 };
    genome = repairDrift(base, genome, anchor, legal, config.repairIterations);
    flags.push("drift-repaired");
    if (!isLegalGenome(base, genome, legal)) genome = { ...genome, ...anchor };
  }
  return { genome, flags };
}

export function createRun(archetypeId: string, controllerSeed: number, config: EvolutionConfig = EVOLUTION_CONFIG): EvolutionRun {
  const base = translateArchetype(archetypeId);
  return {
    version: 1,
    archetypeId,
    typologyId: base.typologyId,
    evaluationSeed: EVALUATION_SEED,
    controllerSeed,
    config,
    genomeBounds: GENOME_BOUNDS,
    legalOrientations: legalOrientations(base),
    previewSize: PREVIEW_SIZE,
    completedGenerations: 0,
    generations: [],
    candidates: [],
    archiveIds: [],
  };
}

function assertSeed(value: number, where: string) {
  if (value !== EVALUATION_SEED) {
    throw new Error(`${where}: evaluation seed ${value} differs from the fixed seed ${EVALUATION_SEED}`);
  }
}

/**
 * Runs the remaining generations of `run`. `onGeneration` receives the run after
 * each generation plus that generation's previews in candidate order.
 */
export async function runEvolution(options: {
  run: EvolutionRun;
  evaluate: EvaluateBatch;
  onGeneration?: (run: EvolutionRun, previews: Uint8Array[]) => void | Promise<void>;
}): Promise<EvolutionRun> {
  const { run, evaluate, onGeneration } = options;
  assertSeed(run.evaluationSeed, "run");
  const { config } = run;
  const base = translateArchetype(run.archetypeId);
  const legal = legalOrientations(base);
  const byId = new Map(run.candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set(run.candidates.map((candidate) => genomeKey(candidate.genome)));

  for (let generation = run.completedGenerations + 1; generation <= config.generations; generation += 1) {
    const rng = generationRng(run.controllerSeed, generation);
    const steps = mutationSteps(generation, config);
    const previous = run.generations[run.generations.length - 1];
    const parents = previous ? previous.survivorIds.map((id) => byId.get(id)!) : [];
    const parentPool = previous ? previous.survivorIds.map((id) => previous.pool.find((entry) => entry.id === id)!) : [];

    const births: Array<{ genome: Genome; parentId: number | null; flags: string[] }> = [];
    if (generation === 1) {
      sampleInitialGenomes(base, rng, config, legal).forEach((genome, index) =>
        births.push({ genome, parentId: null, flags: index === 0 ? ["canonical"] : [] }),
      );
    } else {
      const rank = parentPool.map((entry) => entry.rank);
      const crowding = parentPool.map((entry) => entry.crowding ?? Number.POSITIVE_INFINITY);
      while (births.length < config.populationSize) {
        const parent = parents[tournament(rank, crowding, rng)];
        let child = mutateGenome(base, parent.genome, generation, rng, config, legal);
        for (let retry = 0; retry < config.maxDuplicateRetries && seen.has(genomeKey(child.genome)); retry += 1) {
          child = mutateGenome(base, parent.genome, generation, rng, config, legal);
        }
        if (seen.has(genomeKey(child.genome))) child.flags.push("duplicate-genome");
        seen.add(genomeKey(child.genome));
        births.push({ genome: child.genome, parentId: parent.id, flags: child.flags });
      }
    }
    for (const birth of births) seen.add(genomeKey(birth.genome));

    const evaluations = await evaluate(births.map((birth) => birth.genome));
    if (evaluations.length !== births.length) throw new Error(`G${generation}: evaluator returned ${evaluations.length} of ${births.length}`);
    const previewFile = previewFileFor(generation);
    const firstId = run.candidates.length + 1;
    const offspring: Candidate[] = births.map((birth, index) => {
      const result = evaluations[index];
      assertSeed(result.evaluationSeed, `G${generation} candidate ${firstId + index}`);
      return {
        id: firstId + index,
        archetypeId: run.archetypeId,
        typologyId: run.typologyId,
        generation,
        parentId: birth.parentId,
        genome: birth.genome,
        evaluationSeed: result.evaluationSeed,
        feasible: result.feasible,
        objectives: result.objectives,
        criterionMatch: result.criterionMatch,
        observed: result.observed,
        flags: [...birth.flags, ...genomeNotes(base, birth.genome)],
        rank: 0,
        crowding: 0,
        archived: false,
        preview: { file: previewFile, index },
      };
    });

    const pool = [...parents, ...offspring];
    const { survivors, ranking } = selectSurvivors(pool, config.populationSize);
    const survived = new Set(survivors);
    const entries: PoolEntry[] = pool.map((candidate, index) => ({
      id: candidate.id,
      rank: ranking.rank[index],
      crowding: ranking.crowding[index],
      survived: survived.has(index),
    }));
    offspring.forEach((candidate, index) => {
      const entry = entries[parents.length + index];
      candidate.rank = entry.rank;
      candidate.crowding = entry.crowding;
    });

    for (const candidate of offspring) {
      run.candidates.push(candidate);
      byId.set(candidate.id, candidate);
    }
    const archive = updateArchive(
      run.archiveIds.map((id) => byId.get(id)!),
      offspring,
    );
    run.archiveIds = archive.map((candidate) => candidate.id).sort((a, b) => a - b);
    const archived = new Set(run.archiveIds);
    for (const candidate of run.candidates) candidate.archived = archived.has(candidate.id);

    run.generations.push({
      generation,
      ...steps,
      evaluated: offspring.length,
      feasible: offspring.filter((candidate) => candidate.feasible).length,
      pool: entries,
      frontIds: entries.filter((entry) => entry.rank === 1).map((entry) => entry.id),
      survivorIds: survivors.map((index) => pool[index].id),
      archiveIds: [...run.archiveIds],
      previewFile,
    });
    run.completedGenerations = generation;
    if (onGeneration) await onGeneration(run, evaluations.map((result) => result.preview));
  }
  return run;
}
