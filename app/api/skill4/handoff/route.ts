import { NextResponse } from "next/server";
import { loadSkill3HandoffRecords } from "@/lib/skill4/skill3-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skill 3 meshes for the hybrid board. Kept off the page document so the lab HTML stays small. */
export function GET() {
  return NextResponse.json({ records: loadSkill3HandoffRecords() });
}
