import { NextResponse } from "next/server";
import { loadSavedPicks, writeSavedPick } from "@/lib/skill2/saved-picks";
import { readCatalogSelection } from "@/lib/skill2/read-published-selection";

export function skill2PicksGet() {
  return NextResponse.json({ picks: loadSavedPicks() });
}

/** Writes the chosen drawing into the Skill 2 Pareto catalog. A later choice for the same archetype replaces it. */
export async function skill2PicksPost(request: Request) {
  const body = (await request.json()) as { archetypeId?: unknown; candidateId?: unknown };
  const archetypeId = typeof body.archetypeId === "string" ? body.archetypeId : "";
  const candidateId = typeof body.candidateId === "number" ? body.candidateId : Number(body.candidateId);
  const selection = readCatalogSelection(archetypeId, candidateId);
  if (!selection) return NextResponse.json({ saved: false }, { status: 404 });
  try {
    writeSavedPick({
      archetypeId: selection.archetypeId,
      candidateId: selection.candidateId,
      typologyId: selection.typologyId,
      formal: selection.objectives.formal,
      spatial: selection.objectives.spatial,
      atmospheric: selection.objectives.atmospheric,
    });
  } catch {
    return NextResponse.json({ saved: false, archetypeId: selection.archetypeId, candidateId: selection.candidateId }, { status: 503 });
  }
  return NextResponse.json({ saved: true, archetypeId: selection.archetypeId, candidateId: selection.candidateId });
}
