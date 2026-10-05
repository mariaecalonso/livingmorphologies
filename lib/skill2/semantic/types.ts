/**
 * Schema 3 semantic search records.
 * Pose genomes stay on version-2 runs. These records do not carry drift,
 * radius scale, or orientation.
 */

import type { Objectives } from "../nsga";

export const SEMANTIC_SCHEMA_VERSION = 3 as const;

export type RunPurpose = "development" | "calibration" | "production";
export type CalibrationState = "uncalibrated" | "calibrated";
export type FidelityStatus = "uncalibrated" | "pass" | "fail" | "not-evaluated";
export type DiversityProvenance = "none" | "tag" | "rescue";
export type ParentSelectionRole =
  | "pareto"
  | "diversity"
  | "specialist-formal"
  | "specialist-spatial"
  | "specialist-atmospheric";
export type MutationIntent = "local-refinement" | "morphological-exploration" | "objective-specific";
export type CrowdingValue = number | "boundary";

/** Numbers Skill 1 uses to replay residual realization. Not semantic genes. */
export type RealizationState = Readonly<Record<string, number>>;

/** Opaque to the evolution loop. Only an archetype adapter reads `body`. */
export type SemanticPlan = {
  adapterId: string;
  archetypeId: string;
  body: unknown;
};

export type FieldChange = {
  field: string;
  oldValue: unknown;
  requestedValue: unknown;
  repairedValue: unknown;
};

export type PhenotypeRecord = {
  /** Raw descriptor measurements. Not normalized. */
  raw: unknown;
  /** Mean trail in each cell of the shared 20×20 domain. Not cropped or rescaled. */
  occupancy: number[] | null;
};

export type FidelityDetail = {
  status: FidelityStatus;
  profileId: string | null;
  categories: { formal: boolean; spatial: boolean; atmospheric: boolean } | null;
  criteria: Record<string, boolean> | null;
  /** Means of the criteria admitted to fidelity. Separate from Pareto objectives. */
  categoryValues: { formal: number | null; spatial: number | null; atmospheric: number | null } | null;
};

export type CandidateCurrent = {
  pareto: boolean;
  crowding: CrowdingValue | null;
  specialist: "formal" | "spatial" | "atmospheric" | null;
  diversity: DiversityProvenance;
};

export type SemanticCandidate = {
  id: number;
  archetypeId: string;
  typologyId: string;
  generation: number;
  birthIndex: number;
  origin: "explorer" | "mutant";
  plan: SemanticPlan;
  state: RealizationState;
  lineage: {
    parentId: number | null;
    parentSelectionRole: ParentSelectionRole | null;
    mutationIntent: MutationIntent | null;
    changes: FieldChange[];
    repairedFields: string[];
  };
  evaluationSeed: number;
  technicalValid: boolean;
  failureReason: string | null;
  objectives: Objectives;
  criterionMatch: Record<string, number>;
  observed: Record<string, number>;
  criterionCategory: Record<string, "formal" | "spatial" | "atmospheric">;
  fidelity: FidelityDetail;
  phenotype: PhenotypeRecord;
  /** Display file written beside the run. Null until the run is saved, or when no preview was captured. */
  preview: { size: number; file: string } | null;
  current: CandidateCurrent;
};

export type PoolMix = {
  explorers: number;
  pareto: number;
  diversity: number;
  specialist: number;
};

export type BirthRecord = {
  candidateId: number;
  origin: "explorer" | "mutant";
  parentId: number | null;
  parentSelectionRole: ParentSelectionRole | null;
  mutationIntent: MutationIntent | null;
};

export type GenerationSnapshot = {
  generation: number;
  candidateIds: number[];
  newCandidateIds: number[];
  technicallyValidIds: number[];
  fidelityEligibleIds: number[];
  paretoIds: number[];
  enteredParetoIds: number[];
  leftParetoIds: number[];
  crowding: Record<string, CrowdingValue>;
  objectiveExtremes: {
    formal: [number, number] | null;
    spatial: [number, number] | null;
    atmospheric: [number, number] | null;
  };
  diversityStatus: "applied" | "uncalibrated" | "no-represented-seed";
  diversityTagIds: number[];
  diversityRescueIds: number[];
  specialistsEnabled: boolean;
  specialistIds: { formal: number[]; spatial: number[]; atmospheric: number[] };
  parentPools: {
    pareto: number[];
    diversity: number[];
    specialist: { formal: number[]; spatial: number[]; atmospheric: number[] };
  };
  /** False for calibration batches. Empty Pareto lists then mean preservation was not applied. */
  preservationApplied: boolean;
  compositionRequested: PoolMix;
  compositionUsed: PoolMix;
  /** Development only. Research runs fail instead of changing the requested mix. */
  reallocatedToExplorer: number;
  reallocatedPools: ("pareto" | "diversity")[];
  births: BirthRecord[];
  calibration: CalibrationState;
  fidelityProfileId: string | null;
};

export type CatalogEntry = {
  representativeId: number;
  hiddenIds: number[];
  roleCount: number;
};

export type CombinedCatalog = {
  dedup: "applied" | "uncalibrated";
  redundancyThreshold: number | null;
  entries: CatalogEntry[];
};

export type FidelityProfile = {
  id: string;
  categoryFloors: { formal: number; spatial: number; atmospheric: number };
  /** Only criteria the caller has marked as validated. Empty means category floors only. */
  criterionFloors: Readonly<Record<string, number>>;
};

export type MutationProfile = {
  /** Explicit gene names. Required unless `useProvisionalAffinity` is set. */
  fields?: readonly string[];
  /** Opt in to an adapter's declared provisional affinity. Not a hidden default. */
  useProvisionalAffinity?: boolean;
  fieldCount: number;
  /** Required when a chosen field is continuous. No research default. */
  continuousSigma?: number;
};

export type SemanticSearchConfig = {
  populationSize: number;
  generations: number;
  runSeed: number;
  purpose: RunPurpose;
  /** Attempts to find a non-duplicate repaired plan before one evaluation. Required. */
  duplicateAttemptBudget: number;
  specialists?: boolean;
  fidelityProfile?: FidelityProfile | null;
  /**
   * When true, G01 derives `g01-lower-mode-v1` after its explorers are stored.
   * Production does this when no manual profile was supplied.
   */
  deriveG01Fidelity?: boolean;
  composition?: {
    2?: PoolMix;
    3?: PoolMix;
    4?: PoolMix;
  };
  paretoMutation?: MutationProfile;
  diversityMutation?: MutationProfile;
  /**
   * Required whenever a generation requests Diversity parents.
   * There is no implied default. `provisional-uniform` is a stand-in, not the research method.
   */
  diversityParentSelection?: DiversityParentSelection;
  diversity?: {
    distance: MorphologyDistance;
    rescueThreshold: number;
    tagThreshold?: number;
  } | null;
  catalogDedup?: {
    distance: MorphologyDistance;
    redundancyThreshold: number;
  } | null;
};

/**
 * How a Diversity parent is drawn from the Diversity pool.
 * `provisional-uniform` exists so tests and development can proceed.
 * It is not a settled research rule and is never assumed.
 */
export type DiversityParentSelection =
  | { kind: "provisional-uniform" }
  | { kind: "custom"; select: (ids: readonly number[], rng: () => number) => number };

export type MorphologyDistance = (
  left: { id: number; phenotype: PhenotypeRecord },
  right: { id: number; phenotype: PhenotypeRecord },
) => number;

export type PlannedBirthRecord = {
  plan: SemanticPlan;
  state: RealizationState;
  origin: "explorer" | "mutant";
  parentId: number | null;
  parentSelectionRole: ParentSelectionRole | null;
  mutationIntent: MutationIntent | null;
  changes: FieldChange[];
  repairedFields: string[];
};

export type PendingGeneration = {
  generation: number;
  births: PlannedBirthRecord[];
  requested: PoolMix;
  used: PoolMix;
  reallocatedToExplorer: number;
  reallocatedPools: ("pareto" | "diversity")[];
};

export type FidelityFence = {
  floor: number | null;
  median: number | null;
  sigma: number | null;
  gap: [number, number] | null;
};

export type FidelityCriterionRule = FidelityFence & {
  gated: boolean;
  reason: string | null;
};

export type FidelityCalibrationStatus = "pass" | "warn" | "block";

export type FidelityCalibrationRecord = {
  method: "g01-lower-mode-v1";
  methodConstants: Readonly<Record<string, number>>;
  status: FidelityCalibrationStatus;
  archetypeId: string;
  referenceCandidateIds: number[];
  primaryFamilyGene: string | null;
  categoryRules: Record<
    "formal" | "spatial" | "atmospheric",
    FidelityFence & { admittedCriteria: string[]; excludedCriteria: string[] }
  >;
  criterionRules: Record<string, FidelityCriterionRule>;
  excludedCriteria: { id: string; reason: string }[];
  diagnostics: {
    population: number;
    technicalValid: number;
    technicalInvalid: number;
    fidelityPass: number;
    fidelityFail: number;
    warnings: string[];
    blocks: string[];
  };
  familyCoverage: {
    before: Record<string, number>;
    after: Record<string, number>;
    unsampled: string[];
    eliminated: string[];
  };
};

export type DescriptorFeatureNorm = {
  id: string;
  family: "topology" | "void" | "concentration" | "directionality" | "path" | "occupancy";
  p10: number;
  p90: number;
  robustRange: number;
  active: boolean;
};

export type DescriptorV1Profile = {
  method: "descriptor-v1";
  features: DescriptorFeatureNorm[];
  threshold: {
    eligibleCount: number;
    nearestNeighbor: { min: number; median: number; max: number };
    median: number;
    mad: number;
    sigma: number;
    value: number;
  } | null;
  block: string | null;
};

export type SemanticRun = {
  schemaVersion: typeof SEMANTIC_SCHEMA_VERSION;
  purpose: RunPurpose;
  /** True when the run must not be treated as a calibrated research result. */
  provisional: boolean;
  calibration: CalibrationState;
  fidelityProfileId: string | null;
  archetypeId: string;
  typologyId: string;
  adapterId: string;
  config: SemanticSearchConfig;
  evaluationSeed: number;
  completedGenerations: number;
  /** Set once after G01. G02–G04 read it and do not replace it. */
  fidelityCalibration: FidelityCalibrationRecord | null;
  /** Births for the generation currently being evaluated. Null between generations. */
  pendingGeneration: PendingGeneration | null;
  candidates: SemanticCandidate[];
  generations: GenerationSnapshot[];
  catalog: CombinedCatalog;
  /** Locked `descriptor-v1` normalization and threshold. Null until derived from G01. */
  descriptorProfile: DescriptorV1Profile | null;
};
