/**
 * Homepage Results preview.
 * Names and catalogue links come from the lab workspaces.
 * Physarum and Optimization plates are filled from their catalogues.
 * Vertical stays empty until that catalogue is ready.
 */

import { LAB_WORKSPACES, workspaceResultsTab } from "@/lib/site-map";

export type HomeResultStatus = "ready" | "pending";

export type HomeResultPreview = {
  id: string;
  src: string;
  alt: string;
};

export type HomeResultSkill = {
  id: "skill-1" | "skill-2" | "skill-3";
  number: string;
  name: string;
  catalogueTitle: string;
  status: HomeResultStatus;
  href: string | null;
  previews: readonly HomeResultPreview[];
};

export const HOME_RESULTS: readonly HomeResultSkill[] = LAB_WORKSPACES.flatMap((workspace, index) => {
  if (!workspace.resultId) return [];
  const catalogue = workspaceResultsTab(workspace.id);
  if (!catalogue) return [];
  const order = LAB_WORKSPACES.slice(0, index + 1).filter((item) => item.resultId).length;
  return [{
    id: workspace.resultId,
    number: String(order).padStart(2, "0"),
    name: workspace.label,
    catalogueTitle: catalogue.label,
    status: "ready" as const,
    href: catalogue.href,
    previews: [],
  }];
});
