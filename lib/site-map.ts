/** Homepage sections on `/`. Lab screens stay on their own routes. */
export const HOME_SECTIONS = [
  { href: "/", label: "Home" },
  { href: "/#workflow", label: "Overall Workflow" },
  { href: "/#precedent-analysis", label: "Precedent Analysis" },
  { href: "/#results", label: "Results" },
] as const;

export const LAB_ENTRY = { href: "/lab", label: "Explore Lab" } as const;

/**
 * Top-level lab screens. Subviews (runs, catalogues, scan, assembly)
 * stay on the stage bar of the screen they belong to.
 */
export const LAB_ROUTES = [
  { href: "/lab", label: "Workflow" },
  { href: "/lab/physarum", label: "Physarum Logic" },
  { href: "/lab/evolution", label: "2D Evolution" },
  { href: "/lab/vertical", label: "Vertical Propagation" },
  { href: "/lab/hybrid", label: "Hybrid Connection" },
] as const;

/** Keeps Desktop / Presentation framing when a lab link is followed inside the canvas. */
export function stageFrameSuffix(wall: boolean, presentationFrame: boolean) {
  if (presentationFrame) return "?wall=1&frame=1";
  if (wall) return "?wall=1";
  return "";
}
