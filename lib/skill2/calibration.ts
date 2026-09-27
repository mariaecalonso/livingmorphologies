import { mkdirSync, writeFileSync } from "node:fs";
import { TYPOLOGIES } from "../catalog";
import { hashSeed, mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import { toHandoff, translateArchetype } from "../skill1/translate";
import type { Rating, TypologyId } from "../types";
import { EVALUATION_CALIBRATION } from "./evaluation-config";
import { CRITERION_EVALUATION_SPECS, type ObservedAxisId } from "./evaluation-definitions";
import { evaluateMorphology, observedCondition } from "./evaluate";
import { DEFAULT_MORPHOLOGICAL_EXTRACTION } from "./measurement-config";
import { measureMorphology } from "./measurements";
import type { MorphologicalMeasurements } from "./types";
import { describeDistribution, flattenNumbers, type NumericDistribution } from "./calibration-stats";

export const CALIBRATION_PROTOCOL = {
  name: "skill2-calibration-v1",
  agentCount: 1000,
  maxIterations: 600,
  trailDecay: 0.986,
  samplesPerArchetype: 20,
  seedNamespace: "skill2-calibration-v1",
  variation: "seed-only" as const,
  engine: "Skill 1 createSimulation + stepMany (same stepping as runSimulation)",
} as const;

export const TYPLOGY_SPECIFIC_CRITERIA: Record<TypologyId, readonly string[]> = {
  lobby: ["centrality", "directionality", "receptivity"],
  workspace: ["plate-articulation", "modularity", "collaboration"],
  gathering: ["circulation-integration", "spatial-permanence", "social-proximity"],
};

export const SENSITIVITY_KEYS = [
  "mass.totalMassFraction",
  "mass.concentrationCount",
  "connection.bridgeCount",
  "connection.pairOpportunityCount",
  "connection.linkedPairCount",
  "void.voidFraction",
  "void.significantVoidCount",
  "occupation.potentialOccupationFraction",
  "occupation.supportCount",
] as const;

const OBSERVED_AXES = [
  ...new Set(Object.values(CRITERION_EVALUATION_SPECS).map((spec) => spec.observedAxis)),
] as ObservedAxisId[];

export function calibrationSeed(archetypeId: string, sampleIndex: number) {
  return hashSeed([CALIBRATION_PROTOCOL.seedNamespace, archetypeId, String(sampleIndex)]);
}

export type CalibrationSample = {
  typologyId: TypologyId;
  archetypeId: string;
  archetypeName: string;
  sampleIndex: number;
  seed: number;
  iteration: number;
  converged: boolean;
  ms: number;
  measurements: Record<string, number>;
  observed: Record<string, number>;
  overallPerformance: number;
  minimumIndividualPerformance: number;
  acceptable: boolean;
  criteria: Array<{
    criterionId: string;
    targetRating: Rating;
    targetRatingLabel: string;
    observedCondition: number;
    correspondenceScore: number;
    weight: number;
  }>;
};

const runOne = (
  typologyId: TypologyId,
  archetypeId: string,
  archetypeName: string,
  sampleIndex: number,
  extraction = DEFAULT_MORPHOLOGICAL_EXTRACTION,
): CalibrationSample => {
  const translation = translateArchetype(archetypeId);
  toHandoff(translation);
  const seed = calibrationSeed(archetypeId, sampleIndex);
  const started = Date.now();
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state = createSimulation(translation, seed, CALIBRATION_PROTOCOL.agentCount);
  state.maxIterations = CALIBRATION_PROTOCOL.maxIterations;
  stepMany(
    state,
    translation,
    rng,
    CALIBRATION_PROTOCOL.maxIterations,
    CALIBRATION_PROTOCOL.trailDecay,
  );
  const morphology = measureMorphology(state, extraction);
  const evaluation = evaluateMorphology({ typologyId, archetypeId, measurements: morphology });
  const observed: Record<string, number> = {};
  for (const axis of OBSERVED_AXES) {
    observed[axis] = observedCondition(axis, morphology);
  }
  return {
    typologyId,
    archetypeId,
    archetypeName,
    sampleIndex,
    seed,
    iteration: state.iteration,
    converged: state.converged,
    ms: Date.now() - started,
    measurements: flattenNumbers(morphology),
    observed,
    overallPerformance: evaluation.overallPerformance,
    minimumIndividualPerformance: evaluation.minimumIndividualPerformance,
    acceptable: evaluation.acceptable,
    criteria: evaluation.criteria.map((item) => ({
      criterionId: item.criterionId,
      targetRating: item.targetRating,
      targetRatingLabel: item.targetRatingLabel,
      observedCondition: item.observedCondition,
      correspondenceScore: item.correspondenceScore,
      weight: item.weight,
    })),
  };
};

const collect = (rows: CalibrationSample[], pick: (row: CalibrationSample) => number) =>
  describeDistribution(rows.map(pick));

const byKey = (rows: CalibrationSample[], key: string) =>
  collect(rows, (row) => row.measurements[key] ?? 0);

export function analyzeSamples(samples: CalibrationSample[]) {
  const measurementKeys = samples[0] ? Object.keys(samples[0].measurements).sort() : [];
  const measurements: Record<string, NumericDistribution> = {};
  for (const key of measurementKeys) measurements[key] = byKey(samples, key);

  const measurementsByArchetype: Record<string, Record<string, NumericDistribution>> = {};
  for (const sample of samples) {
    measurementsByArchetype[sample.archetypeId] ??= {};
  }
  for (const archetypeId of Object.keys(measurementsByArchetype)) {
    const subset = samples.filter((row) => row.archetypeId === archetypeId);
    for (const key of measurementKeys) {
      measurementsByArchetype[archetypeId][key] = byKey(subset, key);
    }
  }

  const observed: Record<string, NumericDistribution> = {};
  for (const axis of OBSERVED_AXES) {
    observed[axis] = collect(samples, (row) => row.observed[axis] ?? 0);
  }

  const criteria: Record<
    string,
    {
      all: NumericDistribution;
      byTarget: Record<string, NumericDistribution>;
      observedAll: NumericDistribution;
      observedByTarget: Record<string, NumericDistribution>;
    }
  > = {};
  const criterionIds = [...new Set(samples.flatMap((row) => row.criteria.map((item) => item.criterionId)))];
  for (const criterionId of criterionIds) {
    const cells = samples.map((row) => row.criteria.find((item) => item.criterionId === criterionId)).filter(Boolean);
    const byTarget: Record<string, NumericDistribution> = {};
    const observedByTarget: Record<string, NumericDistribution> = {};
    for (const rating of [0, 1, 2] as const) {
      const group = cells.filter((item) => item && item.targetRating === rating);
      if (group.length === 0) continue;
      const label = group[0]!.targetRatingLabel;
      byTarget[label] = describeDistribution(group.map((item) => item!.correspondenceScore));
      observedByTarget[label] = describeDistribution(group.map((item) => item!.observedCondition));
    }
    criteria[criterionId] = {
      all: describeDistribution(cells.map((item) => item!.correspondenceScore)),
      byTarget,
      observedAll: describeDistribution(cells.map((item) => item!.observedCondition)),
      observedByTarget,
    };
  }

  const differentiation: Record<
    string,
    Array<{ key: string; betweenStdev: number; meanWithinStdev: number; ratio: number }>
  > = {};
  for (const typology of TYPOLOGIES) {
    const ids = typology.archetypes.map((item) => item.id);
    const ranks: Array<{ key: string; betweenStdev: number; meanWithinStdev: number; ratio: number }> = [];
    for (const key of measurementKeys) {
      const means = ids.map((id) => measurementsByArchetype[id]?.[key]?.mean ?? 0);
      const withins = ids.map((id) => measurementsByArchetype[id]?.[key]?.stdev ?? 0);
      const between = describeDistribution(means).stdev;
      const meanWithin = withins.reduce((acc, value) => acc + value, 0) / Math.max(1, withins.length);
      ranks.push({
        key,
        betweenStdev: between,
        meanWithinStdev: meanWithin,
        ratio: between / (meanWithin + 1e-9),
      });
    }
    ranks.sort((a, b) => b.ratio - a.ratio);
    differentiation[typology.id] = ranks;
  }

  const typologySpecific: Record<string, Record<string, Record<string, NumericDistribution>>> = {};
  for (const typology of TYPOLOGIES) {
    typologySpecific[typology.id] = {};
    for (const criterionId of TYPLOGY_SPECIFIC_CRITERIA[typology.id]) {
      typologySpecific[typology.id][criterionId] = {};
      for (const archetype of typology.archetypes) {
        const subset = samples.filter((row) => row.archetypeId === archetype.id);
        typologySpecific[typology.id][criterionId][archetype.id] = describeDistribution(
          subset.map((row) => row.criteria.find((item) => item.criterionId === criterionId)?.observedCondition ?? 0),
        );
      }
    }
  }

  const acceptableCount = samples.filter((row) => row.acceptable).length;
  const acceptableByArchetype: Record<string, { n: number; acceptable: number; rate: number }> = {};
  for (const sample of samples) {
    acceptableByArchetype[sample.archetypeId] ??= { n: 0, acceptable: 0, rate: 0 };
    acceptableByArchetype[sample.archetypeId].n += 1;
    if (sample.acceptable) acceptableByArchetype[sample.archetypeId].acceptable += 1;
  }
  for (const row of Object.values(acceptableByArchetype)) {
    row.rate = row.n ? row.acceptable / row.n : 0;
  }

  const floorHits: Record<string, number> = {};
  let overallOnlyRejects = 0;
  let floorRejects = 0;
  for (const sample of samples) {
    if (sample.acceptable) continue;
    const weak = sample.criteria.filter((item) => item.correspondenceScore < EVALUATION_CALIBRATION.individualFloor);
    if (weak.length === 0) overallOnlyRejects += 1;
    else {
      floorRejects += 1;
      for (const item of weak) floorHits[item.criterionId] = (floorHits[item.criterionId] ?? 0) + 1;
    }
  }

  const saturating = measurementKeys.filter((key) => {
    const dist = measurements[key];
    const span = dist.max - dist.min;
    const nearBound = dist.p10 > 0.95 || dist.p90 < 0.05;
    const unitish = dist.max <= 1.0001 && dist.min >= -0.0001;
    return unitish && (span < 0.02 || nearBound);
  });
  const nearlyConstant = measurementKeys.filter((key) => {
    const dist = measurements[key];
    return dist.stdev < 1e-6 || dist.max - dist.min < 1e-6;
  });

  return {
    measurements,
    measurementsByArchetype,
    observed,
    criteria,
    differentiation,
    typologySpecific,
    acceptability: {
      n: samples.length,
      acceptable: acceptableCount,
      rate: samples.length ? acceptableCount / samples.length : 0,
      byArchetype: acceptableByArchetype,
      floorRejects,
      overallOnlyRejects,
      floorHits,
    },
    flags: { saturating, nearlyConstant },
    iterations: describeDistribution(samples.map((row) => row.iteration)),
  };
}

export type SensitivityCell = {
  voidMaxRelative: number;
  massMinRelative: number;
  n: number;
  means: Record<string, number>;
};

export function runSensitivity(sampleIndexCap = 3): SensitivityCell[] {
  const subjects = TYPOLOGIES.map((typology) => ({
    typologyId: typology.id,
    archetype: typology.archetypes[0],
  }));
  const voids = [0.05, 0.08, 0.12];
  const masses = [0.3, 0.4, 0.5];
  const cells: SensitivityCell[] = [];
  for (const voidMaxRelative of voids) {
    for (const massMinRelative of masses) {
      const rows: CalibrationSample[] = [];
      for (const subject of subjects) {
        for (let sampleIndex = 0; sampleIndex < sampleIndexCap; sampleIndex += 1) {
          rows.push(
            runOne(subject.typologyId, subject.archetype.id, subject.archetype.name, sampleIndex, {
              ...DEFAULT_MORPHOLOGICAL_EXTRACTION,
              voidMaxRelative,
              massMinRelative,
            }),
          );
        }
      }
      const means: Record<string, number> = {};
      for (const key of SENSITIVITY_KEYS) {
        means[key] = describeDistribution(rows.map((row) => row.measurements[key] ?? 0)).mean;
      }
      cells.push({ voidMaxRelative, massMinRelative, n: rows.length, means });
    }
  }
  return cells;
}

export function runCalibration(samplesPerArchetype: number = 20) {
  const started = Date.now();
  const samples: CalibrationSample[] = [];
  for (const typology of TYPOLOGIES) {
    for (const archetype of typology.archetypes) {
      for (let sampleIndex = 0; sampleIndex < samplesPerArchetype; sampleIndex += 1) {
        const row = runOne(typology.id, archetype.id, archetype.name, sampleIndex);
        samples.push(row);
        console.log(
          `${archetype.id}#${sampleIndex} seed=${row.seed} iter=${row.iteration} ok=${row.acceptable} overall=${row.overallPerformance.toFixed(1)} min=${row.minimumIndividualPerformance.toFixed(1)} ${row.ms}ms`,
        );
      }
    }
  }
  const replay = runOne(samples[0].typologyId, samples[0].archetypeId, samples[0].archetypeName, 0);
  const deterministic =
    JSON.stringify({ m: samples[0].measurements, e: samples[0].criteria, o: samples[0].overallPerformance }) ===
    JSON.stringify({ m: replay.measurements, e: replay.criteria, o: replay.overallPerformance });
  const analysis = analyzeSamples(samples);
  const sensitivity = runSensitivity(3);
  return {
    protocol: {
      ...CALIBRATION_PROTOCOL,
      samplesPerArchetype,
      trailDecayNote: "Explicit stepMany trailDecay=0.986; same RNG mix as Skill 1 runSimulation (seed ^ 0x9e3779b9).",
      seedFormula: 'hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)])',
    },
    runtimeMs: Date.now() - started,
    sampleCount: samples.length,
    deterministic,
    analysis,
    sensitivity,
    samples,
  };
}

export function writeCalibrationOutput(
  result: ReturnType<typeof runCalibration>,
  outDir = "calibration/skill2",
) {
  mkdirSync(outDir, { recursive: true });
  const compact = result.samples.map((row) => ({
    typologyId: row.typologyId,
    archetypeId: row.archetypeId,
    sampleIndex: row.sampleIndex,
    seed: row.seed,
    iteration: row.iteration,
    converged: row.converged,
    ms: row.ms,
    overallPerformance: row.overallPerformance,
    minimumIndividualPerformance: row.minimumIndividualPerformance,
    acceptable: row.acceptable,
    measurements: row.measurements,
    observed: row.observed,
    criteria: row.criteria,
  }));
  writeFileSync(`${outDir}/samples.json`, JSON.stringify(compact));
  writeFileSync(
    `${outDir}/summary.json`,
    JSON.stringify(
      {
        protocol: result.protocol,
        runtimeMs: result.runtimeMs,
        sampleCount: result.sampleCount,
        deterministic: result.deterministic,
        analysis: result.analysis,
        sensitivity: result.sensitivity,
      },
      null,
      2,
    ),
  );
  return outDir;
}
