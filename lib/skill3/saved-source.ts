import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { catalogHandoff } from "@/lib/skill2/read-published-selection";
import { loadSavedPicks } from "@/lib/skill2/saved-picks";

export type SavedVerticalCandidate = {
  archetypeId: string;
  archetypeName: string;
  typologyId: string;
  candidateId: number;
};

/** The saved drawing whose Z0 checksum matches, preferring Vertical Void. */
export function firstVerifiedSavedPick(): SavedVerticalCandidate | null {
  const picks = loadSavedPicks();
  const preferred = picks.find((pick) => pick.archetypeId === "vertical-void");
  const ordered = preferred ? [preferred, ...picks.filter((pick) => pick.archetypeId !== "vertical-void")] : picks;
  for (const pick of ordered) {
    if (catalogHandoff(pick.archetypeId, pick.candidateId) !== "verified") continue;
    const archetype = Object.values(ARCHETYPES).find((item) => item.id === pick.archetypeId);
    return {
      archetypeId: pick.archetypeId,
      archetypeName: archetype?.name ?? pick.archetypeId,
      typologyId: pick.typologyId,
      candidateId: pick.candidateId,
    };
  }
  return null;
}
