import type { FinalClusterPairId } from "@/lib/skill4/final-cluster-pairs";

/** Maps legacy PROGRAM_SEATS activity ids to Final Cluster placement categories. */
export const FINAL_CATEGORY_FOR_ACTIVITY: Record<string, FinalClusterPairId> = {
  "public-lobby": "lobby-lobby",
  "private-staff-lobby": "lobby-lobby",
  "architecture-design-studio": "workspace-workspace",
  "product-design-studio": "workspace-workspace",
  "biological-research-lab": "workspace-workspace",
  "prototyping-fabrication-lab": "workspace-workspace",
  "waterfront-gathering": "gathering-gathering",
  "indoor-public-gathering": "gathering-gathering",
  "staff-dining": "gathering-gathering",
  "public-restaurant": "gathering-gathering",
  "public-exhibition-gallery": "gathering-gathering",
  "interdisciplinary-collaboration-hub": "gathering-gathering",
};

export function finalCategoryForActivity(activityId: string): FinalClusterPairId | null {
  return FINAL_CATEGORY_FOR_ACTIVITY[activityId] ?? null;
}