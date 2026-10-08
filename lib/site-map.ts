/** Homepage sections on `/`. Lab screens stay on their own routes. */
export const HOME_SECTIONS = [
  { href: "/", label: "Home" },
  { href: "/#workflow", label: "Overall Workflow" },
  { href: "/#results", label: "Results" },
  { href: "/#lab-demo", label: "Lab Demo" },
] as const;

export const LAB_ENTRY = { href: "/lab/physarum", label: "Explore Lab" } as const;

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
    id: "hybrid",
    href: "/lab/hybrid",
    label: "Hybrid Connection",
    workflowStage: "recombination",
    resultId: null,
    tabs: [
      { href: "/lab/hybrid", label: "Process" },
      { href: "/lab/hybrid/catalog", label: "Catalog" },
    ],
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
