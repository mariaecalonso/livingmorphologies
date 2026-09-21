import type { GroupId, Rating, TypologyId } from "../types";
import type { FieldSnapshot, Skill1Handoff, SimulationState } from "../skill1/types";

/**
 * Catalog Low / Medium / High labels. Architectural meanings stay in the
 * catalog; Skill 2 only records which selected condition evaluation will
 * later correspond to.
 */
export type TargetRatingLabel = "Low" | "Medium" | "High";

/**
 * Eventual criterion correspondence in [0, 100]. This module does not
 * compute or clamp the value.
 */
export type CorrespondenceScore = number;

export type CandidateId = string;

/**
 * Controls needed to reproduce a Skill 2 realization of a fixed Skill 1
 * translation. Biological rules remain on `Skill1Handoff`; this config only
 * varies realization (seed, run length, agent count, trail decay).
 *
 * `trailDecay` is an argument to Skill 1 `stepSimulation` and is not stored
 * on `SimulationState`.
 */
export type Skill2SimulationConfig = {
  seed: number;
  agentCount: number;
  maxIterations: number;
  trailDecay: number;
};

/**
 * Identity of one 2D realization. Source architectural data is referenced
 * via typology/archetype ids, not copied from the catalog.
 */
export type CandidateIdentity = {
  candidateId: CandidateId;
  seed: number;
  simulation: Skill2SimulationConfig;
  typologyId: TypologyId;
  archetypeId: string;
};

/**
 * Keys of neutral morphological measurements. Evaluation evidence points
 * here instead of restating architectural criteria.
 */
export type MeasurementKey =
  | "activity.meanDensity"
  | "activity.densityVariation"
  | "activity.peakConcentration"
  | "activity.spatialSpread"
  | "activity.centerProximity"
  | "mass.totalMassFraction"
  | "mass.concentrationCount"
  | "mass.meanArea"
  | "mass.meanIntensity"
  | "mass.scaleHierarchy"
  | "mass.meanCentroidSeparation"
  | "mass.dominantCenterProximity"
  | "mass.sizeRegularity"
  | "mass.spacingRegularity"
  | "mass.clusteredness"
  | "connection.bridgeCount"
  | "connection.meanBridgeThickness"
  | "connection.meanBridgeLength"
  | "connection.continuity"
  | "connection.pairOpportunityCount"
  | "connection.linkedPairCount"
  | "connection.meanPerimeterContact"
  | "connection.footprintOverlap"
  | "connection.branching"
  | "void.voidFraction"
  | "void.significantVoidCount"
  | "void.residualGapCount"
  | "void.largestVoidFraction"
  | "void.voidContinuity"
  | "void.meanOpenSpan"
  | "void.maxOpenSpan"
  | "void.meanSignificantArea"
  | "void.boundaryOpenFraction"
  | "topology.connectedComponentCount"
  | "topology.largestComponentFraction"
  | "topology.enclosure"
  | "topology.anisotropy"
  | "topology.boundingBoxFill"
  | "occupation.potentialOccupationFraction"
  | "occupation.supportContinuity"
  | "occupation.supportCount"
  | "occupation.meanSupportLength"
  | "proportion.concentrationSizeVariation"
  | "proportion.voidSizeVariation"
  | "proportion.connectionThicknessVariation"
  | "proportion.overallVariation";

export type MeasurementEvidence = {
  measurement: MeasurementKey;
  value: number;
};

/**
 * Neutral morphological measurements of an abstract sectional field.
 * Magnitudes describe the morphology; they do not know whether a value is
 * architecturally desirable.
 */
export type MorphologicalMeasurements = {
  field: {
    size: number;
    height: number;
  };
  /** Overall trail intensity. Does not judge whether density is desirable. */
  activity: {
    /** Mean peak-relative trail value over the whole field, in [0, 1]. */
    meanDensity: number;
    /** Population standard deviation of peak-relative trails. */
    densityVariation: number;
    /** Raw maximum trail value (Skill 1 trail units). */
    peakConcentration: number;
    /** RMS spread of activity about its centroid, / half-diagonal, in [0, 1]. */
    spatialSpread: number;
    /** 1 − (activity centroid distance to field center / half-diagonal), in [0, 1]. */
    centerProximity: number;
  };
  /** Dense or repeatedly reinforced activity → mass / concentration. */
  mass: {
    totalMassFraction: number;
    concentrationCount: number;
    /** Mean concentration area in occupancy-cell units. */
    meanArea: number;
    /** Mean peak-relative trail intensity inside concentrations, in [0, 1]. */
    meanIntensity: number;
    /**
     * Gini of concentration scores (area × intensity × flow reinforcement).
     * 0 = equal concentrations or fewer than two; 1 = one dominates.
     */
    scaleHierarchy: number;
    /** Mean pairwise centroid distance of concentrations, occupancy-cell units. */
    meanCentroidSeparation: number;
    /** Largest concentration's centroid proximity to field center, in [0, 1]. */
    dominantCenterProximity: number;
    /** 1 − CV of concentration areas; 0 if fewer than two concentrations. */
    sizeRegularity: number;
    /** 1 − CV of nearest-neighbor centroid distances; 0 if fewer than two. */
    spacingRegularity: number;
    /** 1 − mean nearest-neighbor distance / half-diagonal; 0 if fewer than two. */
    clusteredness: number;
  };
  /** Thinner trails between concentrations → connection / bridge. */
  connection: {
    bridgeCount: number;
    /** Mean bridge thickness in occupancy-cell units. */
    meanBridgeThickness: number;
    /** Mean bridge length in occupancy-cell units. */
    meanBridgeLength: number;
    /**
     * Fraction of concentration pairs joined by a morphological path.
     * 1 if fewer than two concentrations exist. Evaluation must not treat
     * that sentinel as architectural High Connectivity; use
     * `pairOpportunityCount` / `linkedPairCount` instead.
     */
    continuity: number;
    /** `n * (n - 1) / 2` for n concentrations. 0 if fewer than two. */
    pairOpportunityCount: number;
    /** How many of those pairs are joined by morphology. */
    linkedPairCount: number;
    /**
     * Mean fraction of concentration perimeter adjacent to connection-band
     * cells, in [0, 1]. Neutral overlap evidence, not a circulation score.
     */
    meanPerimeterContact: number;
    /**
     * Fraction of connection-band cells that fall inside a concentration
     * axis-aligned bounding box, in [0, 1].
     */
    footprintOverlap: number;
    /**
     * Skeleton junctions per morphological component. Subdivision of a
     * continuous network; not the same as component count.
     */
    branching: number;
  };
  /**
   * Absence / low activity → physical void. Distinguishes significant voids
   * from tiny residual gaps, and records unobstructed span through void.
   */
  void: {
    voidFraction: number;
    significantVoidCount: number;
    residualGapCount: number;
    /** Largest void component / all void cells, in [0, 1]. */
    largestVoidFraction: number;
    /** Alias of largestVoidFraction: how much void is one continuous body. */
    voidContinuity: number;
    /** Mean axis-aligned void run length in occupancy-cell units. */
    meanOpenSpan: number;
    /** Longest axis-aligned void run in occupancy-cell units. */
    maxOpenSpan: number;
    /** Mean area of significant void components, occupancy-cell units. */
    meanSignificantArea: number;
    /** Fraction of field-boundary cells that are void, in [0, 1]. */
    boundaryOpenFraction: number;
  };
  topology: {
    /** Disconnected morphology. 0 if there is no activity. */
    connectedComponentCount: number;
    /** Largest morphological component / all morphology cells, in [0, 1]. */
    largestComponentFraction: number;
    /** Degree to which morphology surrounds void, in [0, 1]. */
    enclosure: number;
    /** Shape anisotropy of morphology (0 isotropic … 1 strongly axial). */
    anisotropy: number;
    /** Morphology cells / axis-aligned morphological bounding box, in [0, 1]. */
    boundingBoxFill: number;
  };
  /**
   * Abstract potential occupation: relatively horizontal, sufficiently
   * continuous morphological support. Not a literal floor or room.
   */
  occupation: {
    potentialOccupationFraction: number;
    supportContinuity: number;
    supportCount: number;
    /** Mean support run length in occupancy-cell units. */
    meanSupportLength: number;
  };
  /**
   * Dimensional variation among significant elements (coefficient of
   * variation). Low variation is not scored as good or bad.
   */
  proportion: {
    concentrationSizeVariation: number;
    voidSizeVariation: number;
    connectionThicknessVariation: number;
    overallVariation: number;
  };
};

/**
 * Result shape for one original architectural criterion. Scores are not
 * calculated here; the shape records the locked target rating and where
 * correspondence will later be written.
 */
export type CriterionEvaluationResult = {
  criterionId: string;
  criterionName: string;
  category: GroupId;
  targetRating: Rating;
  targetRatingLabel: TargetRatingLabel;
  correspondenceScore: CorrespondenceScore;
  shared: boolean;
  weight: number;
  evidence: readonly MeasurementEvidence[];
  /**
   * Criterion-specific [0, 1] observed condition used for correspondence.
   * Meaning of 0 vs 1 is defined on the evaluation spec, not “more is better”.
   */
  observedCondition: number;
  limitations: readonly string[];
  evaluationQuestion: string;
  /** Catalog description for the archetype's selected rating. */
  targetDescription: string;
};

/** Nine Formal / Spatial / Atmospheric criterion results (6 shared + 3 typology-specific). */
export type NineCriterionResults = readonly [
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
  CriterionEvaluationResult,
];

export type CandidateEvaluation = {
  criteria: NineCriterionResults;
  overallPerformance: number;
  minimumIndividualPerformance: number;
  acceptable: boolean;
};

/**
 * Visible / inspectable 2D sectional representation. Composes Skill 1
 * `FieldSnapshot` rather than duplicating trail buffers.
 */
export type Skill2SectionalRepresentation = {
  height: number;
  field: FieldSnapshot;
};

/**
 * One generated, measured, and (eventually) evaluated 2D candidate.
 * `simulationState` is the Skill 1 engine state Skill 3 continues from as Z0.
 */
export type Skill2Candidate = {
  identity: CandidateIdentity;
  source: Skill1Handoff;
  measurements: MorphologicalMeasurements;
  evaluation: CandidateEvaluation;
  section: Skill2SectionalRepresentation;
  simulationState: SimulationState;
};

/**
 * Handoff of one human-selected candidate to Skill 3.
 * Skill 3 must not need to regenerate this candidate from scratch.
 */
export type Skill2Handoff = {
  skill: 2;
  selected: Skill2Candidate;
};
