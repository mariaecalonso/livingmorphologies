import { correspondenceScore } from "./correspondence";
import { EVALUATION_CALIBRATION } from "./evaluation-config";
import { VOID_FIELD_EVALUATION_QUESTIONS } from "./evaluation-definitions";
import { evaluateMorphology, finalizeEvaluation } from "./evaluate";
import { measureMorphology } from "./measurements";
import type {
  CandidateEvaluation,
  CriterionEvaluationResult,
  MorphologicalMeasurements,
  NineCriterionResults,
} from "./types";
import type { SimulationState } from "../skill1/types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function makeState(trailSize: number, size: number, trails: number[]): SimulationState {
  return {
    size,
    trailSize,
    iteration: 0,
    maxIterations: 1,
    converged: false,
    streak: 0,
    totalDelta: 0,
    seed: 1,
    source: { x: 1, y: 1 },
    attractor: { x: size / 2, y: size / 2 },
    attraction: new Array(size * size).fill(0),
    permeabilityField: new Array(size * size).fill(1),
    occupancy: new Array(size * size).fill(0),
    trails,
    flow: new Array(size * size).fill(0),
    agents: [],
  };
}

function paintRect(
  trails: number[],
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      trails[y * width + x] = value;
    }
  }
}

function baseMeasurements(overrides?: {
  overallVariation?: number;
  pairOpportunityCount?: number;
  linkedPairCount?: number;
  continuity?: number;
  concentrationCount?: number;
  voidFraction?: number;
  largestVoidFraction?: number;
  voidContinuity?: number;
  enclosure?: number;
  meanOpenSpan?: number;
  maxOpenSpan?: number;
}): MorphologicalMeasurements {
  return {
    field: { size: 20, height: 10 },
    activity: {
      meanDensity: 0.2,
      densityVariation: 0.1,
      peakConcentration: 1,
      spatialSpread: 0.4,
      centerProximity: 0.5,
    },
    mass: {
      totalMassFraction: 0.2,
      concentrationCount: overrides?.concentrationCount ?? 2,
      meanArea: 4,
      meanIntensity: 0.8,
      scaleHierarchy: 0.2,
      meanCentroidSeparation: 8,
      dominantCenterProximity: 0.5,
      sizeRegularity: 0.5,
      spacingRegularity: 0.5,
      clusteredness: 0.4,
    },
    connection: {
      bridgeCount: 1,
      meanBridgeThickness: 0.5,
      meanBridgeLength: 4,
      continuity: overrides?.continuity ?? 1,
      pairOpportunityCount: overrides?.pairOpportunityCount ?? 1,
      linkedPairCount: overrides?.linkedPairCount ?? 1,
      meanPerimeterContact: 0.2,
      footprintOverlap: 0.1,
      branching: 0.5,
    },
    void: {
      voidFraction: overrides?.voidFraction ?? 0.6,
      significantVoidCount: 1,
      residualGapCount: 0,
      largestVoidFraction: overrides?.largestVoidFraction ?? 0.8,
      voidContinuity: overrides?.voidContinuity ?? 0.8,
      meanOpenSpan: overrides?.meanOpenSpan ?? 10,
      maxOpenSpan: overrides?.maxOpenSpan ?? 16,
      meanSignificantArea: 40,
      boundaryOpenFraction: 0.4,
    },
    topology: {
      connectedComponentCount: 1,
      largestComponentFraction: 1,
      enclosure: overrides?.enclosure ?? 0.3,
      anisotropy: 0.3,
      boundingBoxFill: 0.7,
    },
    occupation: {
      potentialOccupationFraction: 0.05,
      supportContinuity: 0.2,
      supportCount: 1,
      meanSupportLength: 4,
    },
    proportion: {
      concentrationSizeVariation: overrides?.overallVariation ?? 0.1,
      voidSizeVariation: overrides?.overallVariation ?? 0.1,
      connectionThicknessVariation: 0,
      overallVariation: overrides?.overallVariation ?? 0.1,
    },
  };
}

function fakeCriterion(
  partial: Pick<CriterionEvaluationResult, "criterionId" | "shared" | "correspondenceScore" | "weight">,
): CriterionEvaluationResult {
  return {
    criterionName: partial.criterionId,
    category: "formal",
    targetRating: 1,
    targetRatingLabel: "Medium",
    evidence: [],
    observedCondition: 0,
    limitations: [],
    evaluationQuestion: "",
    targetDescription: "",
    ...partial,
  };
}

function asNine(scores: number[], weights: number[]): NineCriterionResults {
  const items = scores.map((correspondenceScore, index) =>
    fakeCriterion({
      criterionId: `c${index}`,
      shared: index < 6,
      correspondenceScore,
      weight: weights[index] ?? 1,
    }),
  );
  assert(items.length === 9, "need nine criteria");
  return items as unknown as NineCriterionResults;
}

const SIZE = 8;
const TRAIL = 32;

const sameObserved = 0.18;
const lowScore = correspondenceScore(sameObserved, 0);
const mediumScore = correspondenceScore(sameObserved, 1);
const highScore = correspondenceScore(sameObserved, 2);
assert(lowScore !== highScore, "same observation must score differently for Low vs High");
assert(lowScore > highScore, "low-axis observation should correspond better to Low than High");
assert(mediumScore !== lowScore && mediumScore !== highScore, "Medium correspondence must be distinct");

const uniform = baseMeasurements({ overallVariation: 0.05 });
const voidFieldRatings = {
  complexity: 0 as const,
  proportionality: 0 as const,
  "circulation-integration": 1 as const,
  openness: 2 as const,
  connectivity: 0 as const,
  "spatial-permanence": 0 as const,
  immersive: 2 as const,
  visibility: 2 as const,
  "social-proximity": 0 as const,
};

const propLow = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: uniform,
  ratings: { ...voidFieldRatings, proportionality: 0 },
});
const propHigh = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: uniform,
  ratings: { ...voidFieldRatings, proportionality: 2 },
});
const propLowScore = propLow.criteria.find((item) => item.criterionId === "proportionality")?.correspondenceScore ?? -1;
const propHighScore = propHigh.criteria.find((item) => item.criterionId === "proportionality")?.correspondenceScore ?? -1;
assert(propLowScore > propHighScore, "low dimensional variation must score better against LOW Proportionality than HIGH");

const openMorph = baseMeasurements({
  voidFraction: 0.9,
  largestVoidFraction: 0.95,
  voidContinuity: 0.95,
  enclosure: 0.05,
  meanOpenSpan: 16,
  maxOpenSpan: 20,
});
const closedMorph = baseMeasurements({
  voidFraction: 0.15,
  largestVoidFraction: 0.2,
  voidContinuity: 0.2,
  enclosure: 0.9,
  meanOpenSpan: 2,
  maxOpenSpan: 3,
});
const openEval = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: openMorph,
});
const closedEval = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: closedMorph,
});
const openOpenness = openEval.criteria.find((item) => item.criterionId === "openness")?.correspondenceScore ?? -1;
const closedOpenness = closedEval.criteria.find((item) => item.criterionId === "openness")?.correspondenceScore ?? -1;
assert(openOpenness > closedOpenness, "open morphology must score better against HIGH Openness than enclosed morphology");

const singleton = baseMeasurements({
  concentrationCount: 1,
  pairOpportunityCount: 0,
  linkedPairCount: 0,
  continuity: 1,
});
const highConnectivity = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: singleton,
  ratings: { ...voidFieldRatings, connectivity: 2 },
});
const connectivityResult = highConnectivity.criteria.find((item) => item.criterionId === "connectivity");
if (!connectivityResult) throw new Error("connectivity result missing");
assert(connectivityResult.evidence.some((item) => item.measurement === "connection.continuity" && item.value === 1), "sentinel continuity 1 should still be recorded as evidence");
assert(
  connectivityResult.observedCondition === 0,
  `fewer than two concentrations must yield connectivityAmount 0, got ${connectivityResult.observedCondition}`,
);
assert(
  connectivityResult.correspondenceScore < 40,
  `must not treat continuity=1 as High Connectivity; score was ${connectivityResult.correspondenceScore}`,
);

const sample = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: uniform,
});
const shared = sample.criteria.find((item) => item.criterionId === "complexity");
const specific = sample.criteria.find((item) => item.criterionId === "circulation-integration");
assert(shared?.weight === EVALUATION_CALIBRATION.sharedCriterionWeight, "shared weight must be 1.0");
assert(
  specific?.weight === EVALUATION_CALIBRATION.typologySpecificCriterionWeight,
  "typology-specific weight must be the provisional 1.15",
);
assert(shared?.weight !== specific?.weight, "shared and typology-specific weights must differ");

const passing = finalizeEvaluation(asNine([70, 70, 70, 70, 70, 70, 70, 70, 70], [1, 1, 1.15, 1, 1, 1.15, 1, 1, 1.15]));
assert(passing.acceptable, "uniform 70s should pass provisional thresholds");

const failedFloor = finalizeEvaluation(asNine([80, 80, 80, 80, 80, 80, 80, 80, 10], [1, 1, 1, 1, 1, 1, 1, 1, 1]));
assert(!failedFloor.acceptable, "one extremely poor criterion must fail acceptability");
assert(failedFloor.minimumIndividualPerformance === 10, "minimum individual should be 10");

const failedOverall = finalizeEvaluation(asNine([40, 40, 40, 40, 40, 40, 40, 40, 40], [1, 1, 1, 1, 1, 1, 1, 1, 1]));
assert(!failedOverall.acceptable, "overall below provisional minimum must fail even if no criterion is extremely poor");
assert(failedOverall.minimumIndividualPerformance === 40, "individual floor is met at 40");
assert(failedOverall.overallPerformance < EVALUATION_CALIBRATION.overallMinimum, "overall should be below minimum");

const emptyTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(emptyTrails, TRAIL, 12, 12, 20, 20, 1);
const measured = measureMorphology(makeState(TRAIL, SIZE, emptyTrails));
const evalA = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: measured,
});
const evalB = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: measured,
});
assert(JSON.stringify(evalA) === JSON.stringify(evalB), "evaluation must be deterministic");

assert(
  sample.criteria.find((item) => item.criterionId === "complexity")?.evaluationQuestion ===
    VOID_FIELD_EVALUATION_QUESTIONS.complexity,
  "Void Field complexity question must be used",
);

const report = (evaluation: CandidateEvaluation) =>
  evaluation.criteria.map((item) => `${item.criterionId}:${item.correspondenceScore.toFixed(1)}@${item.targetRatingLabel}`).join(" ");

console.log("skill2 evaluation framework: ok");
console.log(
  [
    `correspondence Low/Med/High for 0.18 = ${lowScore.toFixed(1)}/${mediumScore.toFixed(1)}/${highScore.toFixed(1)}`,
    `proportionality low-var vs Low ${propLowScore.toFixed(1)} vs High ${propHighScore.toFixed(1)}`,
    `openness open ${openOpenness.toFixed(1)} vs enclosed ${closedOpenness.toFixed(1)}`,
    `singleton High connectivity ${connectivityResult.correspondenceScore.toFixed(1)} (observed ${connectivityResult.observedCondition})`,
    `weights shared ${shared?.weight} specific ${specific?.weight}`,
    `accept pass=${passing.acceptable} floorFail=${failedFloor.acceptable} overallFail=${failedOverall.acceptable}`,
    `void-field prototype ${report(sample)}`,
  ].join("\n"),
);
