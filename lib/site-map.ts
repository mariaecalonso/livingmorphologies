/** Left rail on every page. Home scrolls to the section; other pages follow the link. */
export const HOME_RAIL = [
  { href: "/#home", id: "home", label: "Home" },
  { href: "/#demo-workflow", id: "demo-workflow", label: "Workflow" },
  { href: "/#results", id: "results", label: "Results" },
  { href: "/#site", id: "site", label: "Site" },
  { href: "/#lab-demo", id: "lab-demo", label: "Demo" },
] as const;

export const HOME_RAIL_SELECT = "lm-home-rail-select";

/** Homepage sections on `/`. Lab screens stay on their own routes. */
export const HOME_SECTIONS = [
  { href: "/", label: "Home" },
  { href: "/#client", label: "ecoLogicStudio" },
  { href: "/#demo-workflow", label: "Workflow" },
  { href: "/#results", label: "Results" },
  { href: "/#site", label: "Site" },
  { href: "/#lab-demo", label: "Lab Demo" },
] as const;

export const LAB_ENTRY = { href: "/lab/physarum", label: "Explore Lab" } as const;

/** The client page lives in the lab as its own stage. */
export const CLIENT_LAB = { href: "/lab/client", label: "Client" } as const;

/** Kept off the stage bar. The page stays at /lab/physarum-cinematic. */
export const CINEMATIC_STAGE_ARCHIVED = true;

/** Kept off the stage bar. The page stays at /lab/physarum-study. */
export const GROWTH_STAGE_ARCHIVED = true;

/**
 * Program Cluster 2.0 archived from the interface:
 * Tile Compatibility, Cluster Placement (program catalog), Morphology Review,
 * differentiation / finished program-cluster catalogs.
 * Hybrid Connection stays live at /lab/hybrid (Process, Catalog, Final Catalog).
 * Routes and data stay in the project; set false to restore the old UI.
 */
export const PROGRAM_CLUSTER_2_ARCHIVED = true;

/**
 * Pocket after the Physarum video. Program Cluster 2.0 only.
 * Cinematic intro and GROWTH stay off the bar.
 * Live Cluster Integration routes still redirect while PROGRAM_CLUSTER_2_ARCHIVED is true.
 */
export const CLUSTER_ARCHIVE = {
  href: "/lab/archived",
  label: "Archived",
  tabs: [
    { href: "/lab/archived?sheet=compatibility", label: "Tile Compatibility" },
    { href: "/lab/archived?sheet=placement", label: "Cluster Placement" },
    { href: "/lab/archived?sheet=morphology", label: "Morphology Review" },
    { href: "/lab/archived?sheet=differentiation", label: "Differentiation" },
    { href: "/lab/archived?sheet=catalog", label: "Finished Catalogs" },
  ],
} as const;

/**
 * Lab workspaces. Overall Workflow and Results read these names.
 * Change a label here and the stage bar, the workflow zoom, and the results preview follow.
 */
export const LAB_WORKSPACES = [
  {
    id: "physarum",
    href: "/lab/physarum",
    label: "Physarum Logic",
    workflowStage: "skill-1",
    resultId: "skill-1",
    tabs: [
      { href: "/lab/physarum", label: "Translation" },
      { href: "/lab/physarum/runs", label: "Runs" },
      { href: "/lab/physarum/catalog", label: "Catalog", results: true },
    ],
  },
  {
    id: "optimization",
    href: "/lab/evolution",
    label: "Optimization",
    workflowStage: "skill-2",
    resultId: "skill-2",
    tabs: [
      { href: "/lab/evolution", label: "Process" },
      { href: "/lab/evolution/pareto-catalog", label: "Catalog", results: true },
    ],
  },
  {
    id: "vertical",
    href: "/lab/vertical",
    label: "Vertical Propagation",
    workflowStage: "skill-3",
    resultId: "skill-3",
    tabs: [
      { href: "/lab/vertical", label: "Process" },
      { href: "/lab/vertical/catalogue", label: "Catalog" },
      { href: "/lab/vertical/final", label: "Final", results: true },
    ],
  },
  {
    id: "clustering",
    href: "/lab/clustering",
    label: "Initial Cluster",
    workflowStage: "clustering",
    resultId: null,
    tabs: [
      { href: "/lab/clustering", label: "Initial Cluster" },
      { href: "/lab/clustering/process", label: "Engines" },
      { href: "/lab/clustering/catalog", label: "Catalog" },
      { href: "/lab/clustering/refined", label: "Refine" },
    ],
  },
  {
    id: "site",
    href: "/lab/site",
    label: "Site Integration",
    workflowStage: "skill-5",
    resultId: null,
    tabs: [
      { href: "/lab/site/analysis", label: "Site Analysis" },
      { href: "/lab/site?sheet=strategy", label: "Site Strategy" },
      { href: "/lab/site?sheet=zoning", label: "Zoning" },
    ],
  },
  {
    id: "hybrid",
    href: "/lab/hybrid",
    label: "Hybrid Cluster",
    workflowStage: "recombination",
    resultId: null,
    tabs: [
      { href: "/lab/hybrid", label: "Process" },
      { href: "/lab/hybrid/catalog", label: "Catalog" },
      { href: "/lab/hybrid/final-catalog", label: "Final Catalog" },
      { href: "/lab/hybrid/final-clusters", label: "Final Clusters" },
    ],
  },
  {
    id: "cluster-integration",
    // When PROGRAM_CLUSTER_2_ARCHIVED is false, restore Cluster Placement as the first tab and default href.
    href: "/lab/site?sheet=cluster-assembly",
    label: "Cluster Integration",
    workflowStage: "cluster-integration",
    resultId: null,
    tabs: [
      { href: "/lab/site?sheet=cluster-assembly", label: "Cluster Assembly Catalog" },
      { href: "/lab/site?sheet=assembly", label: "Tile Assembly" },
      { href: "/lab/site?sheet=configurations", label: "Configurations" },
    ],
  },
  {
    id: "interpretation",
    href: "/lab/interpretation",
    label: "Architectural Interpretation",
    workflowStage: "interpretation",
    resultId: null,
    tabs: [],
  },
  {
    id: "enclosure",
    href: "/lab/enclosure",
    label: "Enclosure",
    workflowStage: "enclosure",
    resultId: null,
    tabs: [],
  },
  {
    id: "slicing",
    href: "/lab/slicing",
    label: "Slicing",
    workflowStage: "slicing",
    resultId: null,
    tabs: [],
  },
  {
    id: "drawing",
    href: "/lab/drawing",
    label: "Drawing",
    workflowStage: "drawing",
    resultId: null,
    tabs: [],
  },
  {
    id: "rendering",
    href: "/lab/rendering",
    label: "Rendering",
    workflowStage: "rendering",
    resultId: null,
    tabs: [],
  },
] as const;

export type LabWorkspaceId = (typeof LAB_WORKSPACES)[number]["id"];

export function labWorkspace<T extends LabWorkspaceId>(id: T): Extract<(typeof LAB_WORKSPACES)[number], { id: T }> {
  const found = LAB_WORKSPACES.find((workspace) => workspace.id === id);
  if (!found || found.id !== id) throw new Error(`Unknown lab workspace: ${id}`);
  return found as Extract<(typeof LAB_WORKSPACES)[number], { id: T }>;
}

export function workspaceForWorkflowStage(stageId: string) {
  return LAB_WORKSPACES.find((workspace) => workspace.workflowStage === stageId) ?? null;
}

export function workspaceResultsTab(id: LabWorkspaceId) {
  const tab = labWorkspace(id).tabs.find((item) => "results" in item && item.results);
  return tab ?? null;
}

/** Lab workspaces. The site Overall Workflow is the map; the lab starts at Physarum Logic. */
export const LAB_ROUTES = LAB_WORKSPACES.map((workspace) => ({ href: workspace.href, label: workspace.label })) as readonly { href: string; label: string }[];

/** Keeps Desktop / Presentation framing when a lab link is followed inside the canvas. */
export function stageFrameSuffix(wall: boolean, presentationFrame: boolean) {
  if (presentationFrame) return "?wall=1&frame=1";
  if (wall) return "?wall=1";
  return "";
}
