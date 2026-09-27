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
  | "mass.meanNearestNeighbor"
  | "connection.bridgeCount"
  | "connection.meanBridgeThickness"
  | "connection.meanBridgeLength"
  | "connection.continuity"
  | "connection.pairOpportunityCount"
  | "connection.linkedPairCount"
  | "connection.meanPerimeterContact"
  | "connection.footprintOverlap"
  | "connection.embeddedNetworkFraction"
  | "connection.separatedNetworkFraction"
  | "connection.farNetworkFraction"
  | "connection.aroundNetworkFraction"
  | "connection.zoneNetworkFraction"
  | "connection.throughNetworkFraction"
  | "connection.branching"
  | "connection.skeletonEndpoints"
  | "connection.skeletonNodes"
  | "connection.cycleRank"
  | "connection.cycleDensity"
  | "connection.branchCount"
  | "connection.branchLengthRegularity"
  | "analysis.edgeSuppressionMargin"
  | "analysis.interiorCellCount"
  | "analysis.boundaryRingCellCount"
  | "analysis.interiorExtent"
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
  | "topology.directionalSurround"
  | "topology.morphologicalDepth"
  | "topology.layering"
  | "occupation.potentialOccupationFraction"
  | "occupation.supportContinuity"
  | "occupation.supportCount"
  | "occupation.meanSupportLength"
  | "proportion.concentrationSizeVariation"
  | "proportion.voidSizeVariation"
  | "proportion.connectionThicknessVariation"
  | "proportion.overallVariation"
  | "proportion.elementCount"
  | "proportion.insufficientElements";

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
    /** Mean nearest-neighbor centroid distance, occupancy-cell units; 0 if fewer than two. */
    meanNearestNeighbor: number;
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
     * cells, in [0, 1]. Often saturated by trails wrapping a core. Kept as
     * a diagnostic; circulation evaluation does not use it.
     */
    meanPerimeterContact: number;
    /**
     * Fraction of connection-band cells that fall inside a concentration
     * axis-aligned bounding box, in [0, 1].
     */
    footprintOverlap: number;
    /**
     * Fraction of corridor cells with mass on opposite sides (threaded
     * through a concentration). Interior morphology only.
     */
    embeddedNetworkFraction: number;
    /**
     * Fraction of corridor cells in components that never touch a
     * concentration. 1 = network fully separated from masses.
     */
    separatedNetworkFraction: number;
    /** Corridor cells with no N4 mass contact and not inside a concentration AABB. */
    farNetworkFraction: number;
    /** Corridor cells that follow a concentration perimeter (wrap), not through. */
    aroundNetworkFraction: number;
    /** Corridor cells inside a concentration AABB without opposite-side sandwich. */
    zoneNetworkFraction: number;
    /** Corridor cells that bisect mass (opposite-side sandwich). */
    throughNetworkFraction: number;
    /**
     * Skeleton junction density: junctions per occupancy-unit of skeleton
     * length. Scale-aware; not raw junction count and not junctions per
     * component.
     */
    branching: number;
    skeletonEndpoints: number;
    skeletonNodes: number;
    /** Cycle rank of the skeleton graph (edges − nodes + components). */
    cycleRank: number;
    /** cycleRank / max(1, nodes), in [0, 1]. Diagnostic; not used in Connectivity scoring (saturated on live 8-connected skeletons). */
    cycleDensity: number;
    branchCount: number;
    /** 1 − CV of skeleton branch lengths; 0 if fewer than two branches. */
    branchLengthRegularity: number;
  };
  /**
   * Analysis domain metadata. The Skill 1 empty perimeter is a boundary
   * condition, not architectural openness.
   */
  analysis: {
    /** Occupancy-space margin matching Skill 1 edge suppression. */
    edgeSuppressionMargin: number;
    interiorCellCount: number;
    boundaryRingCellCount: number;
    /** Interior width in occupancy-cell units (`size - 2 * margin`). */
    interiorExtent: number;
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
    /** Mean axis-aligned void run length in occupancy-cell units (interior domain). */
    meanOpenSpan: number;
    /** Longest axis-aligned void run in occupancy-cell units (interior domain). */
    maxOpenSpan: number;
    /** Mean area of significant void components, occupancy-cell units. */
    meanSignificantArea: number;
    /**
     * Fraction of the interior-domain inner perimeter that is void, in [0, 1].
     * The Skill 1 empty outer ring is excluded and cannot create this value.
     */
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
    /**
     * From interior void next to morphology, fraction of N4 directions that
     * hit morphology within a local radius. Not courtyard enclosure.
     */
    directionalSurround: number;
    /** Mean occupancy-unit thickness of morphology encountered from those voids. */
    morphologicalDepth: number;
    /** Axis-aligned morph↔void transitions per interior line, saturated. */
    layering: number;
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
    /** Count of size observations used for overallVariation. */
    elementCount: number;
    /** 1 when fewer than two comparable elements exist (CV would be a sentinel). */
    insufficientElements: number;
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
 * `FieldSnapshot` rather than duplicating trail buffers. `interpretation`
 * is a derived protoarchitectural section and is not scored.
 */
export type Skill2SectionalRepresentation = {
  height: number;
  field: FieldSnapshot;
  interpretation?: import("./section-translate").SectionModel;
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
