/**
 * Canonical Lab Contract registry.
 *
 * AUTHORITATIVE INPUT → LAB METHODOLOGY → AUTHORITATIVE OUTPUT
 *
 * This file is a contract definition, not a database. It does not store geometry
 * or mutable project state. Authority values live in the existing source files
 * named below; this registry only names those sources.
 *
 * Whole-workflow stages, dependency kinds, and Skill 6 / Client / Site splits
 * live in `lib/computational-workflow.ts`. Website source classes live in
 * `lib/publication-sources.ts`.
 *
 * Methodology between input and output is open unless a note is already established.
 * Do not infer floors, carving, enclosure skin, drawing graphics, or render method
 * from these contracts.
 */

export const LAB_CONTRACT_REGISTRY = "living-morphologies-lab-contracts-v1" as const;

export type LabStageKind = "single-working-stage" | "catalog" | "multi-output" | "checkpoint" | "shared-source";
export type OutputImplementation = "implemented" | "partial" | "not-implemented";

export type LabAuthorityRef = {
  type: string;
  /** Existing production authority id, path, or resolver. Not a copy of the data. */
  source: string;
};

export type LabContract = {
  id: string;
  displayName: string;
  href: string;
  kind: LabStageKind;
  inputs: readonly LabAuthorityRef[];
  output: {
    type: string;
    source: string;
    implemented: OutputImplementation;
    geometryRequired: boolean;
    /** Catalogs expose one explicit downstream selection; they do not leak internals. */
    selectionRequired: boolean;
  };
  downstream: readonly string[];
  /** Only when already established. Absent means methodology is open. */
  methodologyNote?: string;
  catalogFutureCompatible: boolean;
};

export type PipelineCheckpoint = {
  id: string;
  displayName: string;
  kind: "checkpoint";
  source: string;
  geometryRequired: true;
  consumers: readonly string[];
};

export type SharedSource = {
  id: string;
  displayName: string;
  kind: "shared-source";
  source: string;
  consumers: readonly string[];
};

/** Existing production authorities. Strings must match the live contract constants. */
export const LAB_AUTHORITIES = {
  selectedSiteNetwork: "data/skill5/herald-arrival-v1.json massingNetworkId",
  designerZoning: "skill5-designer-zoning-v1",
  finishedProgramClusters: "data/skill4/finished-programs via lib/skill5/finished-cluster-source.ts",
  clientRanking: "skill5-client-compatibility-v1 + lib/skill4/cluster-placement-rank.ts",
  zoneOccupancy: "skill5-cluster-assemblies-v1 occupancy / PlacedCluster",
  clusterAssemblies: "skill5-cluster-assemblies-v1",
  selectedAssembly: "skill5-development-checkpoint-v1",
  interpretation: "skill5-interpretation-authority-v1",
  enclosure: "skill5-enclosure-authority-v1",
  finalEnclosedModel: "skill5-final-enclosed-model-v1",
  slicing: "skill5-slicing-v1",
  drawing: "skill5-drawing-v1",
  rendering: "skill5-rendering-v1",
  siteContext: "data/skill5/herald-site.json via lib/skill5/site-context-source.ts",
  pipeline: "skill5-downstream-pipeline-v1",
} as const;

export const CLUSTER_PLACEMENT_CONTRACT: LabContract = {
  id: "cluster-placement",
  displayName: "Cluster Placement",
  href: "/lab/site?sheet=placement",
  kind: "single-working-stage",
  inputs: [
    { type: "Authoritative Site / Urban Context", source: LAB_AUTHORITIES.siteContext },
    { type: "Selected Site Strategy Network", source: LAB_AUTHORITIES.selectedSiteNetwork },
    { type: "Designer Zoning for that network", source: LAB_AUTHORITIES.designerZoning },
    { type: "Finished Program Cluster catalog", source: LAB_AUTHORITIES.finishedProgramClusters },
    { type: "Client / program ranking context", source: LAB_AUTHORITIES.clientRanking },
  ],
  output: {
    type: "Zone Occupancy / PlacedCluster state",
    source: LAB_AUTHORITIES.zoneOccupancy,
    implemented: "implemented",
    geometryRequired: false,
    selectionRequired: false,
  },
  downstream: ["cluster-assembly-catalog"],
  methodologyNote: "One zone → one finished cluster → one site pose. Occupancy / PlacedCluster is the data contract passed to Cluster Assembly Catalog, not a separate Lab stage. Working occupancy is not the development selection. Spatial context is the existing Authoritative Site Model.",
  catalogFutureCompatible: true,
};

export const CLUSTER_ASSEMBLY_CATALOG_CONTRACT: LabContract = {
  id: "cluster-assembly-catalog",
  displayName: "Cluster Assembly Catalog",
  href: "/lab/site?sheet=cluster-assembly",
  kind: "catalog",
  inputs: [
    { type: "Zone Occupancy / PlacedCluster state", source: LAB_AUTHORITIES.zoneOccupancy },
    { type: "Selected Site Strategy Network provenance", source: LAB_AUTHORITIES.selectedSiteNetwork },
    { type: "Designer Zoning provenance", source: LAB_AUTHORITIES.designerZoning },
  ],
  output: {
    type: "Selected Assembly for Development",
    source: LAB_AUTHORITIES.selectedAssembly,
    implemented: "implemented",
    geometryRequired: false,
    selectionRequired: true,
  },
  downstream: ["interpretation"],
  methodologyNote: "Many saved Cluster Assemblies may exist. Only Send for Development establishes the authoritative output. Preview is not output authority.",
  catalogFutureCompatible: true,
};

export const INTERPRETATION_LAB_CONTRACT: LabContract = {
  id: "interpretation",
  displayName: "Architectural Interpretation",
  href: "/lab/interpretation",
  kind: "single-working-stage",
  inputs: [
    { type: "Selected Assembly for Development", source: LAB_AUTHORITIES.selectedAssembly },
  ],
  output: {
    type: "Current Integrated Architectural Model",
    source: LAB_AUTHORITIES.interpretation,
    implemented: "partial",
    geometryRequired: true,
    selectionRequired: true,
  },
  downstream: ["enclosure"],
  methodologyNote: "Input pipeline and live geometry reading are implemented. Integrated Architectural Model generation is not implemented. The Cluster Integration void outer shell is the hard spatial limit for interpretation — nothing outside that shell is interpreted; Enclosure wraps the building at that same limit. Readings, revision ids, and null outputGeometryRef do not fulfill the output. Internal generation method remains open.",
  catalogFutureCompatible: true,
};

export const ENCLOSURE_LAB_CONTRACT: LabContract = {
  id: "enclosure",
  displayName: "Enclosure",
  href: "/lab/enclosure",
  kind: "single-working-stage",
  inputs: [
    { type: "Current Integrated Architectural Model", source: LAB_AUTHORITIES.interpretation },
  ],
  output: {
    type: "Final Enclosed Model",
    source: LAB_AUTHORITIES.finalEnclosedModel,
    implemented: "not-implemented",
    geometryRequired: true,
    selectionRequired: true,
  },
  downstream: ["slicing", "rendering"],
  catalogFutureCompatible: true,
};

export const SLICING_LAB_CONTRACT: LabContract = {
  id: "slicing",
  displayName: "Slicing",
  href: "/lab/slicing",
  kind: "multi-output",
  inputs: [
    { type: "Final Enclosed Model", source: LAB_AUTHORITIES.finalEnclosedModel },
  ],
  output: {
    type: "Saved Slice Definitions / evaluated slices",
    source: LAB_AUTHORITIES.slicing,
    implemented: "not-implemented",
    geometryRequired: true,
    selectionRequired: true,
  },
  downstream: ["drawing"],
  catalogFutureCompatible: true,
};

export const DRAWING_LAB_CONTRACT: LabContract = {
  id: "drawing",
  displayName: "Drawing",
  href: "/lab/drawing",
  kind: "multi-output",
  inputs: [
    { type: "Slice sent from Slicing", source: LAB_AUTHORITIES.slicing },
    { type: "Final Enclosed Model", source: LAB_AUTHORITIES.finalEnclosedModel },
    { type: "Authoritative Site / Urban Context", source: LAB_AUTHORITIES.siteContext },
  ],
  output: {
    type: "Technical Architectural Drawing",
    source: LAB_AUTHORITIES.drawing,
    implemented: "not-implemented",
    geometryRequired: false,
    selectionRequired: false,
  },
  downstream: [],
  methodologyNote: "Primary path is a slice sent from Slicing. Final Enclosed Model is a supporting geometric basis, not a bypass of Slicing.",
  catalogFutureCompatible: true,
};

export const RENDERING_LAB_CONTRACT: LabContract = {
  id: "rendering",
  displayName: "Rendering",
  href: "/lab/rendering",
  kind: "multi-output",
  inputs: [
    { type: "Final Enclosed Model", source: LAB_AUTHORITIES.finalEnclosedModel },
    { type: "Authoritative Site / Urban Context", source: LAB_AUTHORITIES.siteContext },
  ],
  output: {
    type: "Render Artifact",
    source: LAB_AUTHORITIES.rendering,
    implemented: "not-implemented",
    geometryRequired: false,
    selectionRequired: false,
  },
  downstream: [],
  catalogFutureCompatible: true,
};

export const LAB_CONTRACTS = [
  CLUSTER_PLACEMENT_CONTRACT,
  CLUSTER_ASSEMBLY_CATALOG_CONTRACT,
  INTERPRETATION_LAB_CONTRACT,
  ENCLOSURE_LAB_CONTRACT,
  SLICING_LAB_CONTRACT,
  DRAWING_LAB_CONTRACT,
  RENDERING_LAB_CONTRACT,
] as const;

export type LabContractId = (typeof LAB_CONTRACTS)[number]["id"];

export const FINAL_ENCLOSED_MODEL_CHECKPOINT: PipelineCheckpoint = {
  id: "final-enclosed-model",
  displayName: "Final Enclosed Model",
  kind: "checkpoint",
  source: LAB_AUTHORITIES.finalEnclosedModel,
  geometryRequired: true,
  consumers: ["slicing", "drawing", "rendering"],
};

export const SITE_CONTEXT_SOURCE: SharedSource = {
  id: "site-context",
  displayName: "Authoritative Site / Urban Context",
  kind: "shared-source",
  source: LAB_AUTHORITIES.siteContext,
  consumers: ["site-analysis", "site-strategy", "cluster-placement", "drawing", "rendering"],
};

export const PIPELINE_CHECKPOINTS = [FINAL_ENCLOSED_MODEL_CHECKPOINT] as const;
export const SHARED_SOURCES = [SITE_CONTEXT_SOURCE] as const;

/**
 * Presentation / navigation order may differ from computational dependency.
 * Cluster Integration is a parent workspace, not a production source.
 * Architectural Interpretation is the next top-level Lab after it; it does not
 * branch from Cluster Integration in parallel with Cluster Placement.
 * Its production input is Selected Assembly for Development, produced by
 * Cluster Assembly Catalog via Send for Development.
 * Rendering remains last in the stage bar even though it branches from the
 * Final Enclosed Model, not from Drawing.
 */
export const LAB_NAVIGATION_NOTE = "Top-level stage-bar order is lib/site-map.ts. Cluster Integration contains Cluster Placement, Cluster Assembly Catalog, then legacy Tile Assembly and Configurations (not checkpoints). Architectural Interpretation is the next top-level Lab; it does not branch from Cluster Integration. Computational handoff is Cluster Placement → Cluster Assembly Catalog → Send for Development → Selected Assembly for Development → Architectural Interpretation. Occupancy / PlacedCluster is the data passed between Placement and the Catalog, not a stage. Computational dependency is LAB_COMPUTATIONAL_EDGES. Do not reorder tabs to match the graph.";

export const LAB_COMPUTATIONAL_EDGES = [
  { from: "site-context", to: "cluster-placement" },
  { from: "selected-site-strategy-network", to: "cluster-placement" },
  { from: "designer-zoning", to: "cluster-placement" },
  { from: "finished-program-clusters", to: "cluster-placement" },
  { from: "cluster-placement", to: "cluster-assembly-catalog" },
  { from: "cluster-assembly-catalog", to: "selected-assembly-for-development" },
  { from: "selected-assembly-for-development", to: "interpretation" },
  { from: "interpretation", to: "current-integrated-architectural-model" },
  { from: "current-integrated-architectural-model", to: "enclosure" },
  { from: "enclosure", to: "final-enclosed-model" },
  { from: "final-enclosed-model", to: "slicing" },
  { from: "slicing", to: "drawing" },
  { from: "final-enclosed-model", to: "drawing" },
  { from: "site-context", to: "drawing" },
  { from: "final-enclosed-model", to: "rendering" },
  { from: "site-context", to: "rendering" },
] as const;

/** Downstream edges above mix implemented and declared contracts. Typed kinds are in lib/computational-workflow.ts. */

const CONTRACTS_BY_ID = new Map<string, LabContract>(LAB_CONTRACTS.map((item) => [item.id, item]));

export function labContract(id: string): LabContract {
  const found = CONTRACTS_BY_ID.get(id);
  if (!found) throw new Error(`Unknown lab contract: ${id}`);
  return found;
}

/** A geometry output contract is fulfilled only by real geometry plus matching lineage. */
export function geometryOutputSatisfied(input: {
  geometryRequired: boolean;
  outputGeometryRef: string | null | undefined;
  lineageMatches: boolean;
}) {
  if (!input.geometryRequired) return false;
  return Boolean(input.outputGeometryRef) && input.lineageMatches;
}

export type LabContractDocument = {
  contract: typeof LAB_CONTRACT_REGISTRY;
  labs: typeof LAB_CONTRACTS;
  checkpoints: typeof PIPELINE_CHECKPOINTS;
  sharedSources: typeof SHARED_SOURCES;
  edges: typeof LAB_COMPUTATIONAL_EDGES;
  navigationNote: typeof LAB_NAVIGATION_NOTE;
};

export function labContractDocument(): LabContractDocument {
  return {
    contract: LAB_CONTRACT_REGISTRY,
    labs: LAB_CONTRACTS,
    checkpoints: PIPELINE_CHECKPOINTS,
    sharedSources: SHARED_SOURCES,
    edges: LAB_COMPUTATIONAL_EDGES,
    navigationNote: LAB_NAVIGATION_NOTE,
  };
}
