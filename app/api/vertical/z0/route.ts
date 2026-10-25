import { readProcessSource } from "@/lib/skill3/process-source";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Identity of the published Skill 2 Z0. The snapshot is only read. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const source = readProcessSource(url.searchParams.get("archetype") ?? "", Number(url.searchParams.get("candidate")));
  if (!source || source.handoff !== "verified" || source.z0Iteration == null || !source.checksum) {
    return NextResponse.json({ error: "The published Skill 2 Z0 is not stored." }, { status: 404 });
  }
  return NextResponse.json(
    { source: "skill2-z0", iteration: source.z0Iteration, checksum: source.checksum },
    { headers: { "cache-control": "no-store" } },
  );
}
