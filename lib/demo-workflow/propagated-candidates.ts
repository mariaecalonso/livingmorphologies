import handoff from "@/data/skill3/final-selection.json";

/** The fifteen 2D candidates Skill 3 carried into vertical propagation. */
export const PROPAGATED_CANDIDATES = handoff.selections.map((entry) => ({
  archetypeId: entry.archetypeId,
  candidateId: entry.candidateId,
  continuationId: entry.continuationId,
}));

export function propagatedCandidate(archetypeId: string) {
  return PROPAGATED_CANDIDATES.find((entry) => entry.archetypeId === archetypeId) ?? null;
}

export function propagatedPreview(archetypeId: string) {
  const entry = propagatedCandidate(archetypeId);
  return entry ? `/demo/skill2/previews/${entry.archetypeId}/${entry.candidateId}.webp` : null;
}
