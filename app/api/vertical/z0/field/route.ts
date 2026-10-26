import { readPublishedZ0Plate } from "@/lib/skill3/process-source";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Stored Skill 2 trail for the Start viewer. Does not run the simulation. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const archetypeId = url.searchParams.get("archetype") ?? "";
  const candidateId = Number(url.searchParams.get("candidate"));
  try {
    const plate = readPublishedZ0Plate(archetypeId, candidateId);
    if (!plate) return NextResponse.json({ error: "The published Skill 2 Z0 is not stored." }, { status: 404 });
    return NextResponse.json({ source: "skill2-z0", ...plate }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The published Skill 2 Z0 is not stored." }, { status: 404 });
  }
}
