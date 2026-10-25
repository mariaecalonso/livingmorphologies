import { MATERIALIZATION_FOLDERS, MATERIALIZATION_STATES } from "@/lib/skill3/catalogue-readiness";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function rootFor(archetype: string | null, reading: string | null) {
  const source = archetype
    ? CARVED_MASS_SOURCES.find((item) => item.archetypeId === archetype)
    : CARVED_MASS_SOURCES[0];
  if (!source) return null;
  const state = MATERIALIZATION_STATES.find((item) => item === reading) ?? "open";
  return path.join(process.cwd(), "data", "experiments", MATERIALIZATION_FOLDERS[state], `${source.archetypeId}-${source.candidateId}`);
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const reading = url.searchParams.get("reading");
  if (reading && !MATERIALIZATION_STATES.includes(reading as (typeof MATERIALIZATION_STATES)[number])) {
    return NextResponse.json({ error: "unknown reading" }, { status: 404 });
  }
  const root = rootFor(url.searchParams.get("archetype"), reading);
  if (!root) return NextResponse.json({ error: "unknown archetype" }, { status: 404 });
  const continuation = url.searchParams.get("continuation");
  if (!continuation || !/^N\d{2}$/.test(continuation)) {
    const files = existsSync(root) ? readdirSync(root).filter((file) => /^N\d{2}\.json$/.test(file)).sort() : [];
    return NextResponse.json({ continuations: files.map((file) => file.replace(".json", "")) });
  }
  const file = path.join(root, `${continuation}.json`);
  if (!existsSync(file)) return NextResponse.json({ error: `${continuation} is not built` }, { status: 404 });
  const record = JSON.parse(readFileSync(file, "utf8")) as { geometry?: unknown };
  return NextResponse.json({ geometry: record.geometry }, { headers: { "cache-control": "no-store" } });
}
