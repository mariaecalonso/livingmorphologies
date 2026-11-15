import type { Rating } from "@/lib/types";

export const ECOLOGIC_ACTIVITY_IDS = [
  "public-lobby",
  "private-staff-lobby",
  "architecture-design-studio",
  "product-design-studio",
  "prototyping-fabrication-lab",
  "biological-research-lab",
  "interdisciplinary-collaboration-hub",
  "public-exhibition-gallery",
  "indoor-public-gathering",
  "waterfront-gathering",
  "public-restaurant",
  "staff-dining",
] as const;

export const APPROVED_ROOM = "Approved ecoLogicStudio room rating for this space. It is the desired architectural DNA, not a measured property of a tile.";

export const LOBBY_ORDER = ["complexity", "proportionality", "centrality", "openness", "connectivity", "directionality", "immersive", "visibility", "receptivity"] as const;
export const WORKSPACE_ORDER = ["complexity", "proportionality", "plate-articulation", "openness", "connectivity", "modularity", "immersive", "visibility", "collaboration"] as const;
export const GATHERING_ORDER = ["complexity", "proportionality", "circulation-integration", "openness", "connectivity", "spatial-permanence", "immersive", "visibility", "social-proximity"] as const;

type DesireSeed = [criterionId: string, value: Rating, weight: 1 | 2 | 3, source: "documented" | "interpretation" | "review", reason: string];

export function approvedRoom(order: readonly string[], pairs: string): DesireSeed[] {
  const parsed = pairs.split(",").map((item) => item.trim().split("/").map(Number));
  return order.map((criterionId, index) => [criterionId, parsed[index][0] as Rating, parsed[index][1] as 1 | 2 | 3, "interpretation", APPROVED_ROOM]);
}
