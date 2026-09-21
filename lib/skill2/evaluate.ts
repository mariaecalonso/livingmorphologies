import {
  CRITERION_LEVELS,
  criteriaForTypology,
  findArchetype,
  findTypology,
  groupsForArchetype,
  ratingDescription,
} from "../catalog";
import type { Rating, RatingsMap, TypologyId } from "../types";
import { clamp01, correspondenceScore, saturate, weightedMean } from "./correspondence";
import {
  EVALUATION_CALIBRATION,
  resolveEvaluationCalibration,
  type EvaluationCalibration,
} from "./evaluation-config";
import {
  CRITERION_EVALUATION_SPECS,
  evaluationQuestion,
  type ObservedAxisId,
} from "./evaluation-definitions";
import type {
  CandidateEvaluation,
  CriterionEvaluationResult,
  MeasurementEvidence,
  MeasurementKey,
  MorphologicalMeasurements,
  NineCriterionResults,
  TargetRatingLabel,
} from "./types";

const ratingLabel = (rating: Rating): TargetRatingLabel => CRITERION_LEVELS[rating].label;

export function readMeasurement(
  measurements: MorphologicalMeasurements,
  key: MeasurementKey,
): number {
  const [group, field] = key.split(".") as [keyof MorphologicalMeasurements, string];
  const record = measurements[group];
  if (record && typeof record === "object" && field in record) {
    const value = (record as Record<string, number>)[field];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return 0;
}

const observedAxes: Record<
  ObservedAxisId,
  (measurements: MorphologicalMeasurements, calibration: EvaluationCalibration) => number
> = {
  complexityAmount: (m, c) =>
    clamp01(
      0.35 * saturate(Math.max(0, m.mass.concentrationCount - 1), c.complexityConcentrationCap - 1) +
        0.25 * saturate(m.connection.branching, c.complexityBranchingCap) +
        0.2 * saturate(Math.max(0, m.topology.connectedComponentCount - 1), c.complexityComponentCap - 1) +
        0.2 * saturate(m.proportion.overallVariation, c.variationCap),
    ),
  proportionalVariation: (m, c) => {
    if (m.proportion.insufficientElements >= 1) return 0.5;
    return saturate(m.proportion.overallVariation, c.variationCap);
  },
  circulationMix: (m) =>
    clamp01(m.connection.throughNetworkFraction + 0.5 * m.connection.zoneNetworkFraction),
  opennessAmount: (m) => {
    const extent = Math.max(1e-9, m.analysis.interiorExtent);
    return clamp01(
      0.3 * m.void.voidFraction +
        0.25 * m.void.largestVoidFraction +
        0.2 * (1 - m.topology.enclosure) +
        0.25 * clamp01(m.void.maxOpenSpan / extent),
    );
  },
  connectivityAmount: (m, c) => {
    const massRel =
      m.connection.pairOpportunityCount < 1
        ? 0
        : m.connection.linkedPairCount / m.connection.pairOpportunityCount;
    const compact =
      m.connection.branchCount < 2 && m.connection.skeletonEndpoints <= 2;
    if (compact && massRel === 0) return 0;
    const networkRel = clamp01(
      0.5 * saturate(m.connection.skeletonEndpoints, 8) +
        0.5 * saturate(m.connection.branching, 3),
    );
    const bridgeRel = saturate(m.connection.bridgeCount, c.connectivityBridgeCap);
    return clamp01(0.4 * massRel + 0.4 * networkRel + 0.2 * bridgeRel);
  },
  circulationConstitution: (m) =>
    clamp01(m.connection.throughNetworkFraction + 0.5 * m.connection.zoneNetworkFraction),
  spatialImmersion: (m, c) =>
    clamp01(
      0.28 * m.topology.directionalSurround +
        0.22 * saturate(m.topology.morphologicalDepth, 3) +
        0.18 * m.topology.layering +
        0.18 * saturate(m.activity.densityVariation, c.densityVariationCap) +
        0.1 * m.activity.spatialSpread +
        0.04 * m.topology.enclosure,
    ),
  visibilityAmount: (m) => {
    const extent = Math.max(1e-9, m.analysis.interiorExtent);
    return clamp01(
      0.4 * clamp01(m.void.maxOpenSpan / extent) +
        0.4 * clamp01(m.void.meanOpenSpan / extent) +
        0.2 * (1 - m.topology.enclosure),
    );
  },
  proximityAmount: (m) => {
    const extent = Math.max(1e-9, m.analysis.interiorExtent);
    if (m.mass.concentrationCount < 2) {
      const separation = clamp01(
        0.5 * m.void.voidFraction + 0.5 * clamp01(m.void.meanOpenSpan / extent),
      );
      return clamp01(1 - separation);
    }
    const nn = clamp01(m.mass.meanNearestNeighbor / extent);
    const voidSep = clamp01(m.void.meanOpenSpan / extent);
    return clamp01(0.5 * (1 - nn) + 0.5 * (1 - voidSep));
  },
  centralityAmount: (m) =>
    clamp01(0.65 * m.mass.dominantCenterProximity + 0.35 * m.activity.centerProximity),
  directionalityAmount: (m) => clamp01(m.topology.anisotropy),
  articulationAmount: (m, c) =>
    clamp01(
      0.35 * (1 - m.topology.boundingBoxFill) +
        0.25 * saturate(Math.max(0, m.mass.concentrationCount - 1), c.complexityConcentrationCap - 1) +
        0.2 * saturate(Math.max(0, m.topology.connectedComponentCount - 1), c.complexityComponentCap - 1) +
        0.2 * saturate(m.proportion.overallVariation, c.variationCap),
    ),
  modularityAmount: (m, c) => {
    if (m.mass.concentrationCount >= 2) {
      return clamp01(
        0.4 * saturate(m.mass.concentrationCount - 1, c.complexityConcentrationCap - 1) +
          0.35 * m.mass.sizeRegularity +
          0.25 * m.mass.spacingRegularity,
      );
    }
    if (m.connection.branchCount >= 3) {
      const units = saturate(m.connection.branchCount - 2, 6);
      return clamp01(
        0.5 * units * m.connection.branchLengthRegularity + 0.5 * m.connection.branchLengthRegularity,
      );
    }
    return 0;
  },
  receptivitySpatial: (m) =>
    clamp01(0.55 * m.void.boundaryOpenFraction + 0.45 * (1 - m.topology.enclosure)),
  collaborationAmount: (m) => {
    const extent = Math.max(1e-9, m.analysis.interiorExtent);
    const visual = clamp01(m.void.meanOpenSpan / extent);
    if (m.mass.concentrationCount < 2 || m.connection.pairOpportunityCount < 1) {
      return clamp01(0.6 * visual + 0.4 * m.void.voidContinuity);
    }
    const pairFrac = m.connection.linkedPairCount / m.connection.pairOpportunityCount;
    return clamp01(0.4 * m.mass.clusteredness + 0.3 * pairFrac + 0.3 * visual);
  },
};

export function observedCondition(
  axis: ObservedAxisId,
  measurements: MorphologicalMeasurements,
  calibration: EvaluationCalibration = EVALUATION_CALIBRATION,
): number {
  return observedAxes[axis](measurements, calibration);
}

export function criterionWeight(shared: boolean, calibration: EvaluationCalibration) {
  return shared ? calibration.sharedCriterionWeight : calibration.typologySpecificCriterionWeight;
}

export function finalizeEvaluation(
  criteria: NineCriterionResults,
  calibration: EvaluationCalibration = EVALUATION_CALIBRATION,
): CandidateEvaluation {
  const scores = criteria.map((item) => item.correspondenceScore);
  const weights = criteria.map((item) => item.weight);
  const overallPerformance = weightedMean(scores, weights);
  const minimumIndividualPerformance = scores.reduce((min, score) => Math.min(min, score), 100);
  const acceptable =
    overallPerformance >= calibration.overallMinimum &&
    minimumIndividualPerformance >= calibration.individualFloor;
  return {
    criteria,
    overallPerformance,
    minimumIndividualPerformance,
    acceptable,
  };
}

export type EvaluateMorphologyInput = {
  typologyId: TypologyId;
  archetypeId: string;
  measurements: MorphologicalMeasurements;
  /** Defaults to the catalog ratings for the archetype. */
  ratings?: RatingsMap;
  calibration?: Partial<EvaluationCalibration>;
};

function evaluateOneCriterion(
  criterionId: string,
  criterionName: string,
  category: CriterionEvaluationResult["category"],
  shared: boolean,
  targetRating: Rating,
  targetDescription: string,
  archetypeId: string,
  measurements: MorphologicalMeasurements,
  calibration: EvaluationCalibration,
): CriterionEvaluationResult {
  const spec = CRITERION_EVALUATION_SPECS[criterionId];
  const weight = criterionWeight(spec?.shared ?? shared, calibration);
  const label = ratingLabel(targetRating);
  const question = evaluationQuestion(criterionId, label, archetypeId, criterionName);
  if (!spec) {
    return {
      criterionId,
      criterionName,
      category,
      targetRating,
      targetRatingLabel: label,
      correspondenceScore: 0,
      shared,
      weight,
      evidence: [],
      observedCondition: 0,
      limitations: [
        "This criterion is not yet mapped in the Skill 2 evaluation framework.",
      ],
      evaluationQuestion: question,
      targetDescription,
    };
  }
  const observed = observedCondition(spec.observedAxis, measurements, calibration);
  const evidence: MeasurementEvidence[] = spec.evidence.map((measurement) => ({
    measurement,
    value: readMeasurement(measurements, measurement),
  }));
  return {
    criterionId,
    criterionName,
    category,
    targetRating,
    targetRatingLabel: label,
    correspondenceScore: correspondenceScore(observed, targetRating),
    shared: spec.shared,
    weight,
    evidence,
    observedCondition: observed,
    limitations: spec.limitations,
    evaluationQuestion: question,
    targetDescription,
  };
}

export function evaluateMorphology(input: EvaluateMorphologyInput): CandidateEvaluation {
  const calibration = resolveEvaluationCalibration(input.calibration);
  const typology = findTypology(input.typologyId);
  const archetype = findArchetype(typology, input.archetypeId);
  const ratings = input.ratings ?? archetype.ratings;
  const groups = groupsForArchetype(input.typologyId, archetype, ratings);
  const instances = groups.flatMap((group) =>
    group.criteria.map((criterion) => ({
      criterionId: criterion.id,
      criterionName: criterion.label,
      category: group.id,
      shared: criterion.definition.shared,
      targetRating: criterion.rating,
      targetDescription: ratingDescription(criterion.definition, criterion.rating),
    })),
  );
  if (instances.length !== 9) {
    throw new Error(`Expected nine criteria, received ${instances.length}`);
  }
  const criteria = instances.map((item) =>
    evaluateOneCriterion(
      item.criterionId,
      item.criterionName,
      item.category,
      item.shared,
      item.targetRating,
      item.targetDescription,
      input.archetypeId,
      input.measurements,
      calibration,
    ),
  ) as unknown as NineCriterionResults;
  return finalizeEvaluation(criteria, calibration);
}

/** Catalog Low / Medium / High text for a criterion (source of truth). */
export function catalogMeaning(typologyId: TypologyId, criterionId: string, rating: Rating) {
  const definition = criteriaForTypology(typologyId).find((item) => item.id === criterionId);
  if (!definition) return "";
  return ratingDescription(definition, rating);
}

export { evaluationQuestion };
