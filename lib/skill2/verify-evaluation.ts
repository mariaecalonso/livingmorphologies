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
      meanNearestNeighbor: 6,
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
      embeddedNetworkFraction: 0.1,
      separatedNetworkFraction: 0.8,
      farNetworkFraction: 0.8,
      aroundNetworkFraction: 0.1,
      zoneNetworkFraction: 0.05,
      throughNetworkFraction: 0.05,
      branching: 0.5,
      skeletonEndpoints: 4,
      skeletonNodes: 5,
      cycleRank: 0,
      cycleDensity: 0,
      branchCount: 4,
      branchLengthRegularity: 0.4,
    },
    analysis: {
      edgeSuppressionMargin: 2.6,
      interiorCellCount: 200,
      boundaryRingCellCount: 200,
      interiorExtent: 14.8,
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
      directionalSurround: 0.4,
      morphologicalDepth: 1,
      layering: 0.3,
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
      elementCount: 4,
      insufficientElements: 0,
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
singleton.connection.branchCount = 1;
singleton.connection.cycleRank = 0;
singleton.connection.skeletonEndpoints = 2;
singleton.connection.skeletonNodes = 2;
singleton.connection.branching = 0;
singleton.connection.cycleDensity = 0;
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
  `compact single body must yield connectivityAmount 0, got ${connectivityResult.observedCondition}`,
);

const branchedSingle = baseMeasurements({
  concentrationCount: 1,
  pairOpportunityCount: 0,
  linkedPairCount: 0,
  continuity: 1,
});
branchedSingle.connection.branchCount = 8;
branchedSingle.connection.skeletonEndpoints = 8;
branchedSingle.connection.skeletonNodes = 10;
branchedSingle.connection.branching = 2;
branchedSingle.connection.cycleRank = 2;
branchedSingle.connection.cycleDensity = 0.4;
const branchedEval = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: branchedSingle,
  ratings: { ...voidFieldRatings, connectivity: 2 },
});
const branchedObs =
  branchedEval.criteria.find((item) => item.criterionId === "connectivity")?.observedCondition ?? -1;
assert(branchedObs > 0, "concentrationCount < 2 must not force connectivity 0 for a meaningful network");
assert(branchedObs > connectivityResult.observedCondition, "branched network must exceed compact body");
assert(branchedObs < 0.95, "skeleton richness must not automatically saturate High connectivity");

const cycleNoise = baseMeasurements({
  concentrationCount: 1,
  pairOpportunityCount: 0,
  linkedPairCount: 0,
  continuity: 1,
});
cycleNoise.connection.branchCount = 8;
cycleNoise.connection.skeletonEndpoints = 8;
cycleNoise.connection.branching = 2;
cycleNoise.connection.bridgeCount = 1;
cycleNoise.connection.cycleDensity = 1;
cycleNoise.connection.cycleRank = 20;
const cycleQuiet = { ...cycleNoise, connection: { ...cycleNoise.connection, cycleDensity: 0, cycleRank: 0 } };
const cycleObs = (measurements: MorphologicalMeasurements) =>
  evaluateMorphology({
    typologyId: "gathering",
    archetypeId: "void-field",
    measurements,
    ratings: { ...voidFieldRatings, connectivity: 2 },
  }).criteria.find((item) => item.criterionId === "connectivity")?.observedCondition ?? -1;
assert(
  Math.abs(cycleObs(cycleNoise) - cycleObs(cycleQuiet)) < 1e-12,
  "cycleDensity must not drive Connectivity observed condition",
);

const farNet = baseMeasurements();
farNet.connection.throughNetworkFraction = 0;
farNet.connection.zoneNetworkFraction = 0;
farNet.connection.aroundNetworkFraction = 0;
farNet.connection.farNetworkFraction = 1;
const wrapNet = baseMeasurements();
wrapNet.connection.throughNetworkFraction = 0;
wrapNet.connection.zoneNetworkFraction = 0;
wrapNet.connection.aroundNetworkFraction = 1;
wrapNet.connection.farNetworkFraction = 0;
wrapNet.connection.meanPerimeterContact = 1;
const zoneNet = baseMeasurements();
zoneNet.connection.throughNetworkFraction = 0;
zoneNet.connection.zoneNetworkFraction = 1;
zoneNet.connection.aroundNetworkFraction = 0;
const throughNet = baseMeasurements();
throughNet.connection.throughNetworkFraction = 1;
throughNet.connection.zoneNetworkFraction = 0;
const circObs = (measurements: MorphologicalMeasurements) =>
  evaluateMorphology({
    typologyId: "gathering",
    archetypeId: "void-field",
    measurements,
  }).criteria.find((item) => item.criterionId === "circulation-integration")?.observedCondition ?? -1;
const permObs = (measurements: MorphologicalMeasurements) =>
  evaluateMorphology({
    typologyId: "gathering",
    archetypeId: "void-field",
    measurements,
  }).criteria.find((item) => item.criterionId === "spatial-permanence")?.observedCondition ?? -1;
assert(circObs(farNet) < 0.1, `far network must be Low circulation, got ${circObs(farNet)}`);
assert(circObs(wrapNet) < 0.1, `wrap network must be Low circulation, got ${circObs(wrapNet)}`);
const wrapInBox = baseMeasurements();
wrapInBox.connection.throughNetworkFraction = 0;
wrapInBox.connection.zoneNetworkFraction = 0;
wrapInBox.connection.aroundNetworkFraction = 1;
wrapInBox.connection.farNetworkFraction = 0;
assert(circObs(wrapInBox) < 0.1, "N4 wrap classified as around must remain Low even if it sat in an AABB");
assert(Math.abs(circObs(zoneNet) - 0.5) < 0.05, `zone network should be Medium-like, got ${circObs(zoneNet)}`);
assert(circObs(throughNet) > 0.85, `through network must be High-like, got ${circObs(throughNet)}`);
assert(permObs(wrapNet) < 0.15, `wrap must be Low spatial permanence (distinguishable core), got ${permObs(wrapNet)}`);
assert(permObs(throughNet) > permObs(wrapNet), "through permanence must exceed wrap");

const wrapped = wrapNet;
const embedded = throughNet;

const insufficient = baseMeasurements({ overallVariation: 0, concentrationCount: 1 });
insufficient.proportion.insufficientElements = 1;
insufficient.proportion.elementCount = 0;
insufficient.proportion.overallVariation = 0;
const propInsufficientLow = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: insufficient,
  ratings: { ...voidFieldRatings, proportionality: 0 },
});
const propInsufficientHigh = evaluateMorphology({
  typologyId: "gathering",
  archetypeId: "void-field",
  measurements: insufficient,
  ratings: { ...voidFieldRatings, proportionality: 2 },
});
const insLow =
  propInsufficientLow.criteria.find((item) => item.criterionId === "proportionality")?.correspondenceScore ?? -1;
const insHigh =
  propInsufficientHigh.criteria.find((item) => item.criterionId === "proportionality")?.correspondenceScore ?? -1;
assert(
  Math.abs(insLow - insHigh) < 1e-9,
  "too-few-elements must not correspond better to Low than High (not a uniformity sentinel)",
);
assert(
  (propInsufficientLow.criteria.find((item) => item.criterionId === "proportionality")?.observedCondition ?? -1) ===
    0.5,
  "insufficient elements yield indeterminate proportionalVariation 0.5",
);

const detached = baseMeasurements();
detached.topology.directionalSurround = 0.05;
detached.topology.morphologicalDepth = 0.2;
detached.topology.layering = 0.05;
detached.topology.enclosure = 0;
detached.activity.densityVariation = 0.02;
detached.activity.spatialSpread = 0.1;
const layered = baseMeasurements();
layered.topology.directionalSurround = 0.85;
layered.topology.morphologicalDepth = 2.5;
layered.topology.layering = 0.7;
layered.topology.enclosure = 0.1;
layered.activity.densityVariation = 0.3;
layered.activity.spatialSpread = 0.5;
const solidFill = baseMeasurements({ voidFraction: 0, enclosure: 0 });
solidFill.topology.directionalSurround = 0;
solidFill.topology.morphologicalDepth = 0;
solidFill.topology.layering = 0;
solidFill.topology.enclosure = 0;
const immObs = (measurements: MorphologicalMeasurements) =>
  evaluateMorphology({
    typologyId: "gathering",
    archetypeId: "void-field",
    measurements,
  }).criteria.find((item) => item.criterionId === "immersive")?.observedCondition ?? -1;
assert(immObs(detached) < 0.35, `thin detached field must be Low immersive, got ${immObs(detached)}`);
assert(immObs(layered) > immObs(detached), "layered multi-directional field must exceed detached");
assert(immObs(layered) > 0.55, `layered field should be High-ish immersive, got ${immObs(layered)}`);
assert(immObs(solidFill) < 0.35, `solid fill must not automatically be High immersive, got ${immObs(solidFill)}`);

const oneGenerous = baseMeasurements({ concentrationCount: 1, voidFraction: 0.85, meanOpenSpan: 12 });
oneGenerous.mass.meanNearestNeighbor = 0;
const twoFar = baseMeasurements({ concentrationCount: 2, meanOpenSpan: 12 });
twoFar.mass.meanNearestNeighbor = 12;
twoFar.void.voidFraction = 0.7;
const twoClose = baseMeasurements({ concentrationCount: 2, meanOpenSpan: 1.5 });
twoClose.mass.meanNearestNeighbor = 2;
twoClose.void.voidFraction = 0.2;
const proxObs = (measurements: MorphologicalMeasurements) =>
  evaluateMorphology({
    typologyId: "gathering",
    archetypeId: "void-field",
    measurements,
  }).criteria.find((item) => item.criterionId === "social-proximity")?.observedCondition ?? -1;
assert(proxObs(oneGenerous) < 0.35, `one concentration in generous void must be Low proximity, got ${proxObs(oneGenerous)}`);
assert(proxObs(twoFar) < proxObs(twoClose), "separated territories must be lower proximity than compressed ones");
assert(proxObs(twoClose) > 0.55, `compressed territories should be High-ish proximity, got ${proxObs(twoClose)}`);

const undivided = baseMeasurements({ concentrationCount: 1 });
undivided.connection.branchCount = 1;
undivided.connection.branchLengthRegularity = 0;
const noisyBranches = baseMeasurements({ concentrationCount: 1 });
noisyBranches.connection.branchCount = 12;
noisyBranches.connection.branchLengthRegularity = 0.15;
const repeatedUnits = baseMeasurements({ concentrationCount: 1 });
repeatedUnits.connection.branchCount = 8;
repeatedUnits.connection.branchLengthRegularity = 0.92;
const modObs = (measurements: MorphologicalMeasurements) =>
  evaluateMorphology({
    typologyId: "workspace",
    archetypeId: "open-hall",
    measurements,
  }).criteria.find((item) => item.criterionId === "modularity")?.observedCondition ?? -1;
assert(modObs(undivided) === 0, `undivided body must be Low modularity, got ${modObs(undivided)}`);
assert(modObs(noisyBranches) < 0.4, `irregular branches must not be High modularity, got ${modObs(noisyBranches)}`);
assert(modObs(repeatedUnits) > 0.6, `repeated similar units should be High-like modularity, got ${modObs(repeatedUnits)}`);
assert(modObs(repeatedUnits) > 0, "concentrationCount < 2 must not force modularity 0 when repeated units exist");

const noOccupation = baseMeasurements({ enclosure: 0.9, voidFraction: 0.1 });
noOccupation.occupation.potentialOccupationFraction = 0;
noOccupation.void.boundaryOpenFraction = 0.05;
noOccupation.topology.enclosure = 0.9;
const openApproach = baseMeasurements({ enclosure: 0.05, voidFraction: 0.8 });
openApproach.occupation.potentialOccupationFraction = 0;
openApproach.void.boundaryOpenFraction = 0.9;
openApproach.topology.enclosure = 0.05;
const recLow = evaluateMorphology({
  typologyId: "lobby",
  archetypeId: "continuous-hall",
  measurements: noOccupation,
});
const recHigh = evaluateMorphology({
  typologyId: "lobby",
  archetypeId: "continuous-hall",
  measurements: openApproach,
});
const recLowObs = recLow.criteria.find((item) => item.criterionId === "receptivity")?.observedCondition ?? -1;
const recHighObs = recHigh.criteria.find((item) => item.criterionId === "receptivity")?.observedCondition ?? -1;
assert(recHighObs > recLowObs, "receptivity must use interior approach, not occupation support");
assert(
  (recLow.criteria.find((item) => item.criterionId === "receptivity")?.evidence.every(
    (item) => item.measurement !== "occupation.potentialOccupationFraction",
  ) ?? false),
  "occupation support must not appear in receptivity evidence",
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
