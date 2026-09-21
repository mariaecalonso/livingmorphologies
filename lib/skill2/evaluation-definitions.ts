import type { GroupId } from "../types";
import type { MeasurementKey } from "./types";

export const VOID_FIELD_ARCHETYPE_ID = "void-field";

export type ObservedAxisId =
  | "complexityAmount"
  | "proportionalVariation"
  | "centralityAmount"
  | "articulationAmount"
  | "circulationMix"
  | "opennessAmount"
  | "connectivityAmount"
  | "directionalityAmount"
  | "modularityAmount"
  | "circulationConstitution"
  | "spatialImmersion"
  | "visibilityAmount"
  | "receptivitySpatial"
  | "collaborationAmount"
  | "proximityAmount";

/**
 * How Skill 2 evaluates a catalog criterion morphologically.
 * Low / Medium / High architectural text is NOT stored here; it is read
 * from `lib/catalog.ts` at evaluation time.
 */
export type CriterionEvaluationSpec = {
  criterionId: string;
  category: GroupId;
  shared: boolean;
  /**
   * Meaning of 0 and 1 on `observedAxis`. These name the morphological
   * condition, not architectural quality.
   */
  axisZero: string;
  axisOne: string;
  observedAxis: ObservedAxisId;
  evidence: readonly MeasurementKey[];
  limitations: readonly string[];
  /** Default question; Void Field overlays may replace this. */
  questionTemplate: string;
};

export const CRITERION_EVALUATION_SPECS: Record<string, CriterionEvaluationSpec> = {
  complexity: {
    criterionId: "complexity",
    category: "formal",
    shared: true,
    axisZero: "few masses, little scale-aware branching, limited geometric variation",
    axisOne: "many masses, high scale-aware branching, high geometric variation",
    observedAxis: "complexityAmount",
    evidence: [
      "mass.concentrationCount",
      "connection.branching",
      "topology.connectedComponentCount",
      "proportion.overallVariation",
      "activity.densityVariation",
    ],
    limitations: [
      "Complexity is inferred from mass count, network subdivision, fragmentation, and dimensional variation, not from architectural program or layered drawings.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} {{criterionName}} condition?",
  },
  centrality: {
    criterionId: "centrality",
    category: "formal",
    shared: false,
    axisZero: "dominant mass/activity lies toward the field periphery",
    axisOne: "dominant mass/activity occupies the field center",
    observedAxis: "centralityAmount",
    evidence: [
      "mass.dominantCenterProximity",
      "activity.centerProximity",
      "mass.concentrationCount",
      "connection.linkedPairCount",
      "connection.pairOpportunityCount",
    ],
    limitations: [
      "Centrality is geometric position of activity/mass relative to the 2D field center. It does not measure lobby program, access control, or how people actually distribute through a building.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Centrality condition?",
  },
  "plate-articulation": {
    criterionId: "plate-articulation",
    category: "formal",
    shared: false,
    axisZero: "compact, filled, lightly subdivided morphological body",
    axisOne: "offset, recessed, or subdivided morphological body with distinct zones",
    observedAxis: "articulationAmount",
    evidence: [
      "topology.boundingBoxFill",
      "mass.concentrationCount",
      "topology.connectedComponentCount",
      "proportion.overallVariation",
      "connection.branching",
    ],
    limitations: [
      "Plate articulation is inferred from 2D silhouette fill, subdivision, and variation. It is not a literal floor plate, projection, or rotation in 3D.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Plate Articulation condition?",
  },
  proportionality: {
    criterionId: "proportionality",
    category: "formal",
    shared: true,
    axisZero: "uniform dimensional relationships among masses, voids, and connections",
    axisOne: "strongly differentiated dimensional relationships among those elements",
    observedAxis: "proportionalVariation",
    evidence: [
      "proportion.concentrationSizeVariation",
      "proportion.voidSizeVariation",
      "proportion.connectionThicknessVariation",
      "proportion.overallVariation",
      "proportion.insufficientElements",
      "proportion.elementCount",
    ],
    limitations: [
      "Proportionality uses coefficients of variation within morphological families (mass areas, void areas, bridge thicknesses) separately. Families with fewer than two members are omitted. No family with n≥2 is indeterminate (0.5), not Low-uniform. Area is never compared with thickness.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Proportionality condition?",
  },
  "circulation-integration": {
    criterionId: "circulation-integration",
    category: "formal",
    shared: false,
    axisZero: "connective trails remain far from or around concentrations",
    axisOne: "connective trails organize or pass through concentration territory",
    observedAxis: "circulationMix",
    evidence: [
      "connection.farNetworkFraction",
      "connection.aroundNetworkFraction",
      "connection.zoneNetworkFraction",
      "connection.throughNetworkFraction",
      "mass.concentrationCount",
    ],
    limitations: [
      "Wrap-around trails are catalog Low (around/outside), not Medium. Perimeter contact is not used. Through/zone relationships do not require occupying the densest trail core exclusively, but simple contact is not High.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Circulation Integration condition?",
  },
  openness: {
    criterionId: "openness",
    category: "spatial",
    shared: true,
    axisZero: "little continuous void; morphology tightly encloses space",
    axisOne: "substantial continuous void with limited enclosure by dense morphology",
    observedAxis: "opennessAmount",
    evidence: [
      "void.voidFraction",
      "void.largestVoidFraction",
      "void.voidContinuity",
      "topology.enclosure",
      "void.meanOpenSpan",
      "void.maxOpenSpan",
    ],
    limitations: [
      "Openness is a 2D sectional void/enclosure reading of the interior analysis domain. The Skill 1 empty perimeter ring is excluded and cannot create High openness.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Openness condition?",
  },
  connectivity: {
    criterionId: "connectivity",
    category: "spatial",
    shared: true,
    axisZero: "no or few inter-concentration relationships",
    axisOne: "many linked concentration pairs and bridges",
    observedAxis: "connectivityAmount",
    evidence: [
      "connection.pairOpportunityCount",
      "connection.linkedPairCount",
      "connection.bridgeCount",
      "connection.continuity",
      "mass.concentrationCount",
      "connection.branching",
      "connection.cycleRank",
      "connection.skeletonEndpoints",
    ],
    limitations: [
      "connection.continuity equals 1 when fewer than two concentrations exist. Connectivity uses mass pairs when they exist plus scale-aware branching, endpoints, and bridges. One compact body is Low; concentrationCount < 2 does not force 0.",
      "connection.cycleRank / cycleDensity are diagnostic only. 8-connected skeleton cycle density saturates on live trails and is not used in the observed Connectivity axis.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Connectivity condition?",
  },
  directionality: {
    criterionId: "directionality",
    category: "spatial",
    shared: false,
    axisZero: "isotropic morphology with no dominant axis",
    axisOne: "strongly anisotropic morphology with one dominant axis",
    observedAxis: "directionalityAmount",
    evidence: [
      "topology.anisotropy",
      "activity.spatialSpread",
      "connection.meanBridgeLength",
    ],
    limitations: [
      "Directionality is the covariance anisotropy of the 2D morphology. It does not measure visual orientation, signage, or intended movement sequences.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Directionality condition?",
  },
  modularity: {
    criterionId: "modularity",
    category: "spatial",
    shared: false,
    axisZero: "one continuous body or unlike fragments; little repetition",
    axisOne: "several similar, regularly spaced morphological units",
    observedAxis: "modularityAmount",
    evidence: [
      "mass.concentrationCount",
      "mass.sizeRegularity",
      "mass.spacingRegularity",
      "connection.branchCount",
      "connection.branchLengthRegularity",
    ],
    limitations: [
      "Modularity is repetition and regularity of concentrations when several exist, otherwise similar skeleton branches. Interchangeability and reconfiguration are unmeasurable. A noisy branched network is not High.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Modularity condition?",
  },
  "spatial-permanence": {
    criterionId: "spatial-permanence",
    category: "spatial",
    shared: false,
    axisZero: "a distinguishable gathering concentration exists apart from the connective network",
    axisOne: "gathering mass is constituted by / mixed with the connective network",
    observedAxis: "circulationConstitution",
    evidence: [
      "connection.throughNetworkFraction",
      "connection.zoneNetworkFraction",
      "connection.aroundNetworkFraction",
      "mass.scaleHierarchy",
      "mass.concentrationCount",
    ],
    limitations: [
      "Wrap-around circulation with a distinct core is Low spatial permanence. Not temporal or material durability.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Spatial Permanence condition?",
  },
  immersive: {
    criterionId: "immersive",
    category: "atmospheric",
    shared: true,
    axisZero: "spatially detached field: thin, weakly surrounding morphology",
    axisOne: "deep, layered, multi-directional morphological field around interior space",
    observedAxis: "spatialImmersion",
    evidence: [
      "topology.directionalSurround",
      "topology.morphologicalDepth",
      "topology.layering",
      "activity.densityVariation",
      "activity.spatialSpread",
      "topology.enclosure",
    ],
    limitations: [
      "The catalog Immersive definition includes material, sound, light, scale, and enclosure. Skill 2 evaluates only spatially measurable morphology. Courtyard enclosure is optional evidence and is not required for High. Solid fill is not High. The empty Skill 1 ring cannot create immersion.",
    ],
    questionTemplate:
      "Does the spatially measurable morphology correspond to the catalog's {{ratingLabel}} Immersive condition?",
  },
  visibility: {
    criterionId: "visibility",
    category: "atmospheric",
    shared: true,
    axisZero: "short interrupted void spans",
    axisOne: "long continuous void spans with little morphological obstruction",
    observedAxis: "visibilityAmount",
    evidence: [
      "void.meanOpenSpan",
      "void.maxOpenSpan",
      "void.voidContinuity",
      "topology.enclosure",
    ],
    limitations: [
      "Open spans are axis-aligned interior-domain runs, not full angular isovists. The empty Skill 1 boundary ring cannot create High visibility.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Visibility condition?",
  },
  receptivity: {
    criterionId: "receptivity",
    category: "atmospheric",
    shared: false,
    axisZero: "closed interior-domain perimeter and high enclosure of interior void",
    axisOne: "open interior-domain perimeter and interior void that is not courtyard-enclosed",
    observedAxis: "receptivitySpatial",
    evidence: [
      "void.boundaryOpenFraction",
      "topology.enclosure",
      "void.voidFraction",
      "analysis.interiorExtent",
    ],
    limitations: [
      "Catalog Receptivity includes invitation, formality, and psychological distance. Skill 2 evaluates only spatial approachability of the interior domain. The Skill 1 empty outer ring cannot create High receptivity. Occupation-support was retired from this axis because it is almost never present on this 2D trail field.",
    ],
    questionTemplate:
      "Does the spatially measurable morphology correspond to the catalog's {{ratingLabel}} Receptivity condition?",
  },
  collaboration: {
    criterionId: "collaboration",
    category: "atmospheric",
    shared: false,
    axisZero: "separated morphological territories with little shared occupation or visual continuity",
    axisOne: "clustered territories, visual continuity, and occupation support that could be shared",
    observedAxis: "collaborationAmount",
    evidence: [
      "mass.clusteredness",
      "mass.meanCentroidSeparation",
      "connection.linkedPairCount",
      "connection.pairOpportunityCount",
      "void.meanOpenSpan",
    ],
    limitations: [
      "Catalog Collaboration describes individual versus shared work configurations. Skill 2 evaluates clustering, interior visual span, and pair linkage only. Occupation-support was retired from this axis (almost always zero on this 2D field). It does not model desks, teams, or interaction.",
    ],
    questionTemplate:
      "Does the spatially measurable morphology correspond to the catalog's {{ratingLabel}} Collaboration condition?",
  },
  "social-proximity": {
    criterionId: "social-proximity",
    category: "atmospheric",
    shared: false,
    axisZero: "generous or separated spatial territories",
    axisOne: "compressed territories / close significant zones",
    observedAxis: "proximityAmount",
    evidence: [
      "void.meanSignificantArea",
      "void.significantVoidCount",
      "void.meanOpenSpan",
      "mass.meanNearestNeighbor",
      "mass.concentrationCount",
    ],
    limitations: [
      "Catalog Low Social Proximity mentions foliage or tables as examples. Skill 2 does not simulate furniture or foliage; it evaluates intervening void and territory spacing only. Compact activity spread is not treated as compression.",
    ],
    questionTemplate:
      "Does the morphology correspond to the catalog's {{ratingLabel}} Social Proximity condition?",
  },
};

/**
 * Void Field prototype questions. These interpret catalog meanings for this
 * archetype only; they do not rewrite the catalog.
 */
export const VOID_FIELD_EVALUATION_QUESTIONS: Record<string, string> = {
  complexity:
    "Does the morphology maintain a simple, legible organization with few dominant masses and limited geometric variation?",
  proportionality:
    "Are the significant masses, voids, and connective elements relatively consistent in their dimensional relationships, corresponding to the catalog's Low Proportionality condition?",
  "circulation-integration":
    "Do connective paths partially enter, cross, or overlap the major spatial concentrations without being completely separated from them or completely embedded within them?",
  openness:
    "Does the morphology preserve substantial continuous void space with limited enclosure by dense morphology?",
  connectivity:
    "Does the morphology maintain only a limited number of direct connections between its major spatial concentrations?",
  "spatial-permanence":
    "Does a dominant gathering concentration remain spatially distinguishable from the primary connective/circulation network rather than being formed by or fully integrated with it?",
  immersive:
    "Does the sectional morphology establish a strong spatial field around significant void/open regions through enclosure, layering, density variation, and spatial depth?",
  visibility:
    "Do significant void regions maintain long, continuous visual access with minimal obstruction by dense morphology?",
  "social-proximity":
    "Does the morphology provide generous and/or separated spatial territories rather than compressing multiple significant zones into close proximity?",
};

export function evaluationQuestion(
  criterionId: string,
  ratingLabel: string,
  archetypeId: string,
  criterionName?: string,
): string {
  if (archetypeId === VOID_FIELD_ARCHETYPE_ID && VOID_FIELD_EVALUATION_QUESTIONS[criterionId]) {
    return VOID_FIELD_EVALUATION_QUESTIONS[criterionId];
  }
  const spec = CRITERION_EVALUATION_SPECS[criterionId];
  const template =
    spec?.questionTemplate ??
    "Does the morphology correspond to the catalog's {{ratingLabel}} {{criterionName}} condition?";
  return template
    .replaceAll("{{ratingLabel}}", ratingLabel)
    .replaceAll("{{criterionName}}", criterionName ?? spec?.criterionId ?? "criterion");
}

export const REGISTERED_CRITERION_IDS = Object.keys(CRITERION_EVALUATION_SPECS);
