import { NextResponse } from "next/server";
import { loadSkill3HandoffRecord } from "@/lib/skill4/skill3-handoff";

export const runtime = "nodejs";

/** One registered Skill 03 module. The lab page does not embed the full set. */
export function GET(request: Request) {
  const archetypeId = new URL(request.url).searchParams.get("archetype") ?? "";
  if (!/^[a-z0-9-]+$/.test(archetypeId)) {
    return NextResponse.json({ error: "An archetype id is required." }, { status: 400 });
  }
  const record = loadSkill3HandoffRecord(archetypeId);
  if (!record) return NextResponse.json({ error: "That Skill 03 module is not in the handoff." }, { status: 404 });
  return NextResponse.json(record, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
