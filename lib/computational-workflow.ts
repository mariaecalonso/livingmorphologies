/**
 * Whole computational workflow registry.
 *
 * Architecture metadata only. Mutable geometry and project state live in the
 * existing Lab authority files named here. Downstream Lab I/O contracts remain
 * in lib/lab-contracts.ts and are referenced, not copied.
 *
 * Current Lab name is Hybrid Cluster. Hybrid Connection is a historical name
 * retained only in older code comments, filenames, and notes.
 */

import {
  CLUSTER_ASSEMBLY_CATALOG_CONTRACT,
  CLUSTER_PLACEMENT_CONTRACT,
  DRAWING_LAB_CONTRACT,
  ENCLOSURE_LAB_CONTRACT,
  FINAL_ENCLOSED_MODEL_CHECKPOINT,
  INTERPRETATION_LAB_CONTRACT,
  LAB_AUTHORITIES,
  LAB_NAVIGATION_NOTE,
  RENDERING_LAB_CONTRACT,
  SITE_CONTEXT_SOURCE,
  SLICING_LAB_CONTRACT,
} from "./lab-contracts";

export const COMPUTATIONAL_WORKFLOW_REGISTRY = "living-morphologies-computational-workflow-v2" as const;

export type WorkflowRole =
  | "human-input"
  | "designer-authority"
  | "algorithm"
  | "checkpoint"
  | "working-state"
  | "evidence"
  | "shared-authority"
  | "catalog"
  | "implemented-research"
  | "derived-cache"
  | "future-contract"
  | "legacy-research";

export type WorkflowDependencyKind =
  | "implemented-production"
  | "implemented-research"
  | "declared-contract"
  | "checkpoint"
  | "evidence-context"
  | "supporting-input"
  | "derived-cache"
  | "data-contract"
  | "legacy-research"
  | "publication";

export type WorkflowLayer = "methodology" | "implementation-detail";

export type WorkflowImplementation = "implemented" | "partial" | "not-implemented";

export type WorkflowStage = {
  id: string;
  displayName: string;
  role: WorkflowRole;
  layer: WorkflowLayer;
  inputs: readonly string[];
  output: string;
  implementation: WorkflowImplementation;
  checkpoint: boolean;
  labContractId: string | null;
  downstream: readonly string[];
  publication: readonly string[];
  note?: string;
};

export type WorkflowImplementationDetail = {
  id: string;
  displayName: string;
  role: WorkflowRole;
  layer: "implementation-detail";
  parentStage: string;
  inputs: readonly string[];
  output: string;
  implementation: WorkflowImplementation;
  downstream: readonly string[];
  note: string;
};

export type WorkflowEdge = {
  from: string;
  to: string;
  kind: WorkflowDependencyKind;
};

export const WORKFLOW_STAGES: readonly WorkflowStage[] = [
  {
    id: "typology-analysis",
    displayName: "Typology Analysis",
    role: "human-input",
    layer: "methodology",
    inputs: [],
    output: "Locked architectural criteria / ratings / descriptors",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["physarum-logic"],
    publication: ["catalog-schema"],
    note: "lib/catalog.ts. Human-authored authoritative input. Not an alternatives → selected-output checkpoint.",
  },
  {
    id: "physarum-logic",
    displayName: "Physarum Logic",
    role: "algorithm",
    layer: "methodology",
    inputs: ["typology-analysis"],
    output: "Skill1Handoff + published run plates",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["optimization"],
    publication: ["skill1-shared-catalog", "skill1-demo-entries"],
  },
  {
    id: "optimization",
    displayName: "Optimization",
    role: "algorithm",
    layer: "methodology",
    inputs: ["physarum-logic"],
    output: "Generated 2D candidates + Z0 snapshots",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["selected-2d"],
    publication: ["skill2-demo-catalog"],
    note: "Algorithm generates alternatives. Designer pick is a separate checkpoint.",
  },
  {
    id: "selected-2d",
    displayName: "Selected 2D candidates",
    role: "checkpoint",
    layer: "methodology",
    inputs: ["optimization"],
    output: "data/skill2/pareto-catalog/selections.json",
    implementation: "implemented",
    checkpoint: true,
    labContractId: null,
    downstream: ["vertical-propagation"],
    publication: ["skill2-selections", "skill2-demo-previews"],
  },
  {
    id: "vertical-propagation",
    displayName: "Vertical Propagation",
    role: "algorithm",
    layer: "methodology",
    inputs: ["selected-2d"],
    output: "Continuations + solidified meshes",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["selected-3d"],
    publication: ["skill3-demo-pinned"],
  },
  {
    id: "selected-3d",
    displayName: "Selected 3D geometries",
    role: "checkpoint",
    layer: "methodology",
    inputs: ["vertical-propagation"],
    output: "data/skill3/final-selection.json",
    implementation: "implemented",
    checkpoint: true,
    labContractId: null,
    downstream: ["initial-cluster", "hybrid-cluster"],
    publication: ["skill3-final-selection"],
  },
  {
    id: "initial-cluster",
    displayName: "Initial Cluster",
    role: "algorithm",
    layer: "methodology",
    inputs: ["selected-3d"],
    output: "Skill 6 clustering system: compatibility / pair-pose, docking candidates, engines, assembled studies",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["hybrid-cluster"],
    publication: ["skill6-assembled-demo-pair"],
    note: "Initial Cluster is the Skill 6 clustering system. Compatibility / pair-pose, atlas docking candidates, and engines are internal implementation of this stage, not peer methodology stages. The assembled Lab catalog remains an exploratory Lab surface.",
  },
  {
    id: "hybrid-cluster",
    displayName: "Hybrid Cluster",
    role: "algorithm",
    layer: "methodology",
    inputs: ["selected-3d", "initial-cluster"],
    output: "Hybrid Cluster system: connectClusterHybrid + Initial Cluster face-compatibility pairing",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["finished-program-clusters"],
    publication: ["hybrid-integration-run"],
    note: "The Hybrid Cluster SYSTEM is production logic that hybridizes cluster modules. The browser Hybrid Cluster catalog (lm-skill4-catalog) is an exploratory Lab surface and is not consumed by Finished Program Cluster generation. Historical name: Hybrid Connection.",
  },
  {
    id: "client",
    displayName: "Client / Architectural DNA",
    role: "human-input",
    layer: "methodology",
    inputs: [],
    output: "data/skill5/client-activities.json + architectural-dna.json",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["finished-program-clusters", "cluster-placement"],
    publication: [],
    note: "Human-authored authoritative input. Not an alternatives → selected-output checkpoint. Does not alter Initial Cluster, fundamental Hybrid Cluster face pairing, Site Analysis, Site Strategy, or Designer Zoning. Ranking of finished clusters is live.",
  },
  {
    id: "finished-program-clusters",
    displayName: "Finished Program Clusters",
    role: "algorithm",
    layer: "methodology",
    inputs: ["hybrid-cluster", "client"],
    output: "data/skill4/finished-programs + data/skill4/finished",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["cluster-placement"],
    publication: [],
    note: "Uses Hybrid Cluster geometric machinery (connectClusterHybrid) plus Client eligibility, spacing, and hashes. Production Placement reads this catalog only. differentiation-test is excluded unless includeTest=1.",
  },
  {
    id: "site-model",
    displayName: "Authoritative Site Model",
    role: "shared-authority",
    layer: "methodology",
    inputs: [],
    output: LAB_AUTHORITIES.siteContext,
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["site-analysis", "site-strategy", "cluster-placement", "drawing", "rendering"],
    publication: ["site-model"],
  },
  {
    id: "site-analysis",
    displayName: "Site Analysis",
    role: "evidence",
    layer: "methodology",
    inputs: ["site-model"],
    output: "Designer-facing evidence (sun, wind, views, walking). Browser bundle is working cache.",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["verified-site-analysis-conclusions"],
    publication: [],
    note: "Computed from the Authoritative Site Model. Live analysis bundle is not a Site Strategy runtime input. Durable verified conclusions are site-inputs-v1.json.",
  },
  {
    id: "verified-site-analysis-conclusions",
    displayName: "Verified Site Analysis Conclusions",
    role: "evidence",
    layer: "methodology",
    inputs: ["site-analysis"],
    output: "data/skill5/site-inputs-v1.json",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["site-strategy"],
    publication: [],
    note: "Calculated output of the five Site Analysis studies. Records are not automatically attractors, program placements, weights, or growth rules. Not the live browser analysis bundle.",
  },
  {
    id: "site-strategy",
    displayName: "Site Strategy",
    role: "algorithm",
    layer: "methodology",
    inputs: ["site-model", "verified-site-analysis-conclusions"],
    output: "Strategy alternatives / archive iterations in herald-arrival-v1.json",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["selected-site-network"],
    publication: [],
    note: "Reads the Authoritative Site Model, verified Analysis conclusions, and established Strategy rules. Generation of alternatives is not selection. Designer Use for Zoning writes massingNetworkId.",
  },
  {
    id: "selected-site-network",
    displayName: "Selected Site Strategy Network",
    role: "checkpoint",
    layer: "methodology",
    inputs: ["site-strategy"],
    output: "herald-arrival-v1.json massingNetworkId",
    implementation: "implemented",
    checkpoint: true,
    labContractId: null,
    downstream: ["designer-zoning", "cluster-placement"],
    publication: [],
  },
  {
    id: "designer-zoning",
    displayName: "Designer Zoning",
    role: "designer-authority",
    layer: "methodology",
    inputs: ["selected-site-network"],
    output: "data/skill5/designer-zoning.json",
    implementation: "implemented",
    checkpoint: false,
    labContractId: null,
    downstream: ["cluster-placement"],
    publication: [],
    note: "Durable designer-authored authority consumed by Placement. Not an alternatives → selected-output checkpoint. Browser site-workflow zones are working until saved.",
  },
  {
    id: CLUSTER_PLACEMENT_CONTRACT.id,
    displayName: CLUSTER_PLACEMENT_CONTRACT.displayName,
    role: "working-state",
    layer: "methodology",
    inputs: ["site-model", "selected-site-network", "designer-zoning", "finished-program-clusters", "client"],
    output: CLUSTER_PLACEMENT_CONTRACT.output.type,
    implementation: CLUSTER_PLACEMENT_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: CLUSTER_PLACEMENT_CONTRACT.id,
    downstream: CLUSTER_PLACEMENT_CONTRACT.downstream,
    publication: [],
    note: "Spatial context is the existing Authoritative Site Model in the Site workspace. Occupancy / PlacedCluster is the data passed to Cluster Assembly Catalog, not a methodology stage.",
  },
  {
    id: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.id,
    displayName: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.displayName,
    role: "catalog",
    layer: "methodology",
    inputs: ["cluster-placement", "selected-site-network", "designer-zoning"],
    output: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.output.type,
    implementation: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.id,
    downstream: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.downstream,
    publication: [],
  },
  {
    id: "selected-assembly-for-development",
    displayName: "Selected Assembly for Development",
    role: "checkpoint",
    layer: "methodology",
    inputs: ["cluster-assembly-catalog"],
    output: LAB_AUTHORITIES.selectedAssembly,
    implementation: "implemented",
    checkpoint: true,
    labContractId: CLUSTER_ASSEMBLY_CATALOG_CONTRACT.id,
    downstream: ["interpretation"],
    publication: [],
    note: "Only Send for Development writes selectedAssemblyId.",
  },
  {
    id: INTERPRETATION_LAB_CONTRACT.id,
    displayName: INTERPRETATION_LAB_CONTRACT.displayName,
    role: "algorithm",
    layer: "methodology",
    inputs: INTERPRETATION_LAB_CONTRACT.inputs.map(() => "selected-assembly-for-development"),
    output: "Live geometry readings. Integrated Architectural Model not generated.",
    implementation: INTERPRETATION_LAB_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: INTERPRETATION_LAB_CONTRACT.id,
    downstream: INTERPRETATION_LAB_CONTRACT.downstream,
    publication: [],
  },
  {
    id: "current-integrated-architectural-model",
    displayName: "Current Integrated Architectural Model",
    role: "future-contract",
    layer: "methodology",
    inputs: ["interpretation"],
    output: INTERPRETATION_LAB_CONTRACT.output.type,
    implementation: "not-implemented",
    checkpoint: false,
    labContractId: INTERPRETATION_LAB_CONTRACT.id,
    downstream: ["enclosure"],
    publication: [],
  },
  {
    id: ENCLOSURE_LAB_CONTRACT.id,
    displayName: ENCLOSURE_LAB_CONTRACT.displayName,
    role: "future-contract",
    layer: "methodology",
    inputs: ENCLOSURE_LAB_CONTRACT.inputs.map(() => "current-integrated-architectural-model"),
    output: ENCLOSURE_LAB_CONTRACT.output.type,
    implementation: ENCLOSURE_LAB_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: ENCLOSURE_LAB_CONTRACT.id,
    downstream: ["final-enclosed-model"],
    publication: [],
  },
  {
    id: FINAL_ENCLOSED_MODEL_CHECKPOINT.id,
    displayName: FINAL_ENCLOSED_MODEL_CHECKPOINT.displayName,
    role: "checkpoint",
    layer: "methodology",
    inputs: ["enclosure"],
    output: FINAL_ENCLOSED_MODEL_CHECKPOINT.source,
    implementation: "not-implemented",
    checkpoint: true,
    labContractId: null,
    downstream: FINAL_ENCLOSED_MODEL_CHECKPOINT.consumers,
    publication: [],
  },
  {
    id: SLICING_LAB_CONTRACT.id,
    displayName: SLICING_LAB_CONTRACT.displayName,
    role: "future-contract",
    layer: "methodology",
    inputs: SLICING_LAB_CONTRACT.inputs.map(() => "final-enclosed-model"),
    output: SLICING_LAB_CONTRACT.output.type,
    implementation: SLICING_LAB_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: SLICING_LAB_CONTRACT.id,
    downstream: SLICING_LAB_CONTRACT.downstream,
    publication: [],
  },
  {
    id: DRAWING_LAB_CONTRACT.id,
    displayName: DRAWING_LAB_CONTRACT.displayName,
    role: "future-contract",
    layer: "methodology",
    inputs: ["slicing", "final-enclosed-model", "site-model"],
    output: DRAWING_LAB_CONTRACT.output.type,
    implementation: DRAWING_LAB_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: DRAWING_LAB_CONTRACT.id,
    downstream: DRAWING_LAB_CONTRACT.downstream,
    publication: [],
    note: "Primary path is slice → drawing. Final Enclosed Model is a supporting geometric basis.",
  },
  {
    id: RENDERING_LAB_CONTRACT.id,
    displayName: RENDERING_LAB_CONTRACT.displayName,
    role: "future-contract",
    layer: "methodology",
    inputs: ["final-enclosed-model", "site-model"],
    output: RENDERING_LAB_CONTRACT.output.type,
    implementation: RENDERING_LAB_CONTRACT.output.implemented,
    checkpoint: false,
    labContractId: RENDERING_LAB_CONTRACT.id,
    downstream: RENDERING_LAB_CONTRACT.downstream,
    publication: [],
  },
] as const;

/** Explicit alternatives → selected-output handoffs only. */
export const HUMAN_CHECKPOINTS = [
  "selected-2d",
  "selected-3d",
  "selected-site-network",
  "selected-assembly-for-development",
  "final-enclosed-model",
] as const;

export const HUMAN_AUTHORED_INPUTS = [
  "typology-analysis",
  "client",
] as const;

export const DESIGNER_AUTHORITIES = [
  "designer-zoning",
] as const;

export const WORKFLOW_IMPLEMENTATION_DETAILS: readonly WorkflowImplementationDetail[] = [
  {
    id: "skill6-compatibility",
    displayName: "Initial Cluster compatibility / pair-pose",
    role: "shared-authority",
    layer: "implementation-detail",
    parentStage: "initial-cluster",
    inputs: ["selected-3d"],
    output: "data/skill6/compatibility.json + atlas candidate poses",
    implementation: "implemented",
    downstream: ["initial-cluster", "hybrid-cluster", "hybrid-connectable"],
    note: "Internal Initial Cluster infrastructure. Engines load atlas + compatibility through lib/skill6/engines/pool.ts. Hybrid Cluster face pairing reads it through lib/skill4/cluster-face-pair.ts. Not a methodology stage.",
  },
  {
    id: "hybrid-connectable",
    displayName: "Hybrid connectable pair cache",
    role: "derived-cache",
    layer: "implementation-detail",
    parentStage: "hybrid-cluster",
    inputs: ["skill6-compatibility", "selected-3d"],
    output: "data/skill6/hybrid-connectable.json",
    implementation: "implemented",
    downstream: ["finished-program-clusters"],
    note: "Internal derived fallback. rankCompatibleFaces uses it only when a face has no direct Skill 6 pose. Not generated from Client / Architectural DNA. Not a methodology stage. Not the Hybrid Cluster catalog.",
  },
  {
    id: "zone-occupancy",
    displayName: "PlacedCluster / zone occupancy",
    role: "working-state",
    layer: "implementation-detail",
    parentStage: "cluster-placement",
    inputs: ["cluster-placement"],
    output: "skill5-cluster-assemblies-v1 occupancy / PlacedCluster",
    implementation: "implemented",
    downstream: ["cluster-assembly-catalog"],
    note: "Data contract: one zone → one Finished Program Cluster → one site pose. Cluster Placement output and Cluster Assembly Catalog input. Not a Lab or methodology stage.",
  },
];

export const WORKFLOW_EDGES: readonly WorkflowEdge[] = [
  { from: "typology-analysis", to: "physarum-logic", kind: "implemented-production" },
  { from: "physarum-logic", to: "optimization", kind: "implemented-production" },
  { from: "optimization", to: "selected-2d", kind: "checkpoint" },
  { from: "selected-2d", to: "vertical-propagation", kind: "implemented-production" },
  { from: "vertical-propagation", to: "selected-3d", kind: "checkpoint" },
  { from: "selected-3d", to: "initial-cluster", kind: "implemented-production" },
  { from: "selected-3d", to: "hybrid-cluster", kind: "implemented-production" },
  { from: "initial-cluster", to: "hybrid-cluster", kind: "implemented-production" },
  { from: "hybrid-cluster", to: "finished-program-clusters", kind: "implemented-production" },
  { from: "client", to: "finished-program-clusters", kind: "implemented-production" },
  { from: "client", to: "cluster-placement", kind: "implemented-production" },
  { from: "site-model", to: "site-analysis", kind: "implemented-production" },
  { from: "site-analysis", to: "verified-site-analysis-conclusions", kind: "implemented-production" },
  { from: "verified-site-analysis-conclusions", to: "site-strategy", kind: "implemented-production" },
  { from: "site-model", to: "site-strategy", kind: "implemented-production" },
  { from: "site-strategy", to: "selected-site-network", kind: "checkpoint" },
  { from: "selected-site-network", to: "designer-zoning", kind: "implemented-production" },
  { from: "selected-site-network", to: "cluster-placement", kind: "implemented-production" },
  { from: "designer-zoning", to: "cluster-placement", kind: "implemented-production" },
  { from: "finished-program-clusters", to: "cluster-placement", kind: "implemented-production" },
  { from: "site-model", to: "cluster-placement", kind: "supporting-input" },
  { from: "cluster-placement", to: "cluster-assembly-catalog", kind: "implemented-production" },
  { from: "cluster-assembly-catalog", to: "selected-assembly-for-development", kind: "checkpoint" },
  { from: "selected-assembly-for-development", to: "interpretation", kind: "implemented-production" },
  { from: "interpretation", to: "current-integrated-architectural-model", kind: "declared-contract" },
  { from: "current-integrated-architectural-model", to: "enclosure", kind: "declared-contract" },
  { from: "enclosure", to: "final-enclosed-model", kind: "declared-contract" },
  { from: "final-enclosed-model", to: "slicing", kind: "declared-contract" },
  { from: "slicing", to: "drawing", kind: "declared-contract" },
  { from: "final-enclosed-model", to: "drawing", kind: "supporting-input" },
  { from: "site-model", to: "drawing", kind: "evidence-context" },
  { from: "final-enclosed-model", to: "rendering", kind: "declared-contract" },
  { from: "site-model", to: "rendering", kind: "evidence-context" },
];

export const IMPLEMENTATION_EDGES: readonly WorkflowEdge[] = [
  { from: "selected-3d", to: "skill6-compatibility", kind: "implemented-production" },
  { from: "skill6-compatibility", to: "initial-cluster", kind: "supporting-input" },
  { from: "skill6-compatibility", to: "hybrid-cluster", kind: "supporting-input" },
  { from: "skill6-compatibility", to: "hybrid-connectable", kind: "derived-cache" },
  { from: "selected-3d", to: "hybrid-connectable", kind: "derived-cache" },
  { from: "hybrid-connectable", to: "finished-program-clusters", kind: "derived-cache" },
  { from: "cluster-placement", to: "zone-occupancy", kind: "data-contract" },
  { from: "zone-occupancy", to: "cluster-assembly-catalog", kind: "data-contract" },
];

export const WORKFLOW_NAVIGATION_NOTE = LAB_NAVIGATION_NOTE;
export const SHARED_SITE_MODEL = SITE_CONTEXT_SOURCE;

export function computationalWorkflowDocument() {
  return {
    contract: COMPUTATIONAL_WORKFLOW_REGISTRY,
    stages: WORKFLOW_STAGES,
    edges: WORKFLOW_EDGES,
    implementationDetails: WORKFLOW_IMPLEMENTATION_DETAILS,
    implementationEdges: IMPLEMENTATION_EDGES,
    checkpoints: HUMAN_CHECKPOINTS,
    humanAuthoredInputs: HUMAN_AUTHORED_INPUTS,
    designerAuthorities: DESIGNER_AUTHORITIES,
    navigationNote: WORKFLOW_NAVIGATION_NOTE,
    sharedSiteModel: SHARED_SITE_MODEL,
  };
}

const EDGE_STYLE: Record<WorkflowDependencyKind, string> = {
  "implemented-production": "-->",
  "implemented-research": "-.->",
  checkpoint: "==>",
  "declared-contract": "-.->",
  "evidence-context": "-.->",
  "supporting-input": "-.->",
  "derived-cache": "-.->",
  "data-contract": "-.->",
  "legacy-research": "-.->",
  publication: "-.->",
};

function stageClass(stage: WorkflowStage) {
  if (stage.role === "checkpoint" || stage.checkpoint) return "checkpoint";
  if (stage.role === "future-contract" || stage.implementation === "not-implemented") return "future";
  if (stage.role === "implemented-research") return "research";
  if (stage.role === "derived-cache") return "cache";
  if (stage.role === "human-input" || stage.role === "designer-authority") return "human";
  if (stage.role === "evidence") return "evidence";
  if (stage.role === "legacy-research") return "legacy";
  if (stage.role === "shared-authority") return "shared";
  return "production";
}

export function computationalGraphMermaid() {
  const lines = [
    "flowchart LR",
    "  classDef production fill:#0b1f22,stroke:#49d7de,color:#e8ffff",
    "  classDef research fill:#1a1824,stroke:#9aa0ff,color:#dfe2ff,stroke-dasharray: 4 3",
    "  classDef human fill:#1c2114,stroke:#c5d36a,color:#eef6b8",
    "  classDef checkpoint fill:#2a1a12,stroke:#c77e5f,color:#ffd8c8",
    "  classDef cache fill:#1a1a12,stroke:#c77e5f,color:#ffd8c8,stroke-dasharray: 2 3",
    "  classDef future fill:#111,stroke:#555,color:#bbb,stroke-dasharray: 5 4",
    "  classDef evidence fill:#111,stroke:#49d7de,color:#9ad,stroke-dasharray: 2 3",
    "  classDef legacy fill:#111,stroke:#666,color:#888",
    "  classDef shared fill:#102018,stroke:#49d7de,color:#cffff6",
  ];
  for (const stage of WORKFLOW_STAGES) {
    lines.push(`  ${stage.id}["${stage.displayName}"]:::${stageClass(stage)}`);
  }
  for (const edge of WORKFLOW_EDGES) {
    lines.push(`  ${edge.from} ${EDGE_STYLE[edge.kind]}|${edge.kind}| ${edge.to}`);
  }
  return lines.join("\n");
}

export function implementationGraphMermaid() {
  const parents = new Set(WORKFLOW_IMPLEMENTATION_DETAILS.map((item) => item.parentStage));
  const lines = [
    "flowchart LR",
    "  classDef production fill:#0b1f22,stroke:#49d7de,color:#e8ffff",
    "  classDef cache fill:#1a1a12,stroke:#c77e5f,color:#ffd8c8,stroke-dasharray: 2 3",
    "  classDef shared fill:#102018,stroke:#49d7de,color:#cffff6",
    "  classDef working fill:#1a1824,stroke:#9aa0ff,color:#dfe2ff,stroke-dasharray: 4 3",
  ];
  for (const stage of WORKFLOW_STAGES) {
    if (!parents.has(stage.id) && !IMPLEMENTATION_EDGES.some((edge) => edge.from === stage.id || edge.to === stage.id)) continue;
    lines.push(`  ${stage.id}["${stage.displayName}"]:::production`);
  }
  for (const detail of WORKFLOW_IMPLEMENTATION_DETAILS) {
    const cls = detail.role === "derived-cache" ? "cache" : detail.role === "working-state" ? "working" : "shared";
    lines.push(`  ${detail.id}["${detail.displayName}"]:::${cls}`);
  }
  for (const edge of IMPLEMENTATION_EDGES) {
    lines.push(`  ${edge.from} ${EDGE_STYLE[edge.kind]}|${edge.kind}| ${edge.to}`);
  }
  return lines.join("\n");
}

export function navigationHierarchyMermaid() {
  return [
    "flowchart TD",
    "  website[Website Classroom] --> typology[Typology Analysis / catalog]",
    "  website --> labs[Lab stage bar]",
    "  labs --> physarum[Physarum Logic]",
    "  labs --> optimization[Optimization]",
    "  labs --> vertical[Vertical Propagation]",
    "  labs --> clustering[Initial Cluster]",
    "  labs --> client[Client]",
    "  labs --> site[Site Integration]",
    "  site --> analysis[Site Analysis]",
    "  site --> strategy[Site Strategy]",
    "  site --> zoning[Zoning]",
    "  labs --> hybrid[Hybrid Cluster]",
    "  labs --> integration[Cluster Integration]",
    "  integration --> placement[Cluster Placement]",
    "  integration --> catalog[Cluster Assembly Catalog]",
    "  integration --> tiles[Tile Assembly · legacy]",
    "  integration --> configs[Configurations · legacy]",
    "  labs --> interpretation[Architectural Interpretation]",
    "  labs --> enclosure[Enclosure]",
    "  labs --> slicing[Slicing]",
    "  labs --> drawing[Drawing]",
    "  labs --> rendering[Rendering]",
    "  labs --> video[Physarum video]",
    "  note[Navigation is not computational dependency]",
  ].join("\n");
}
