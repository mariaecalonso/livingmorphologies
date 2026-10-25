import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Cached process-page readings. This does not build a mesh or write catalogue geometry. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const continuation = url.searchParams.get("continuation") ?? "";
  const source = CARVED_MASS_SOURCES.find((item) => item.archetypeId === url.searchParams.get("archetype"));
  if (!source || !/^N\d{2}$/.test(continuation)) {
    return NextResponse.json({ error: "The formation reading is not stored." }, { status: 404 });
  }
  const dir = path.join(process.cwd(), "data", "experiments", "process-form", `${source.archetypeId}-${source.candidateId}`, continuation);
  const manifestFile = path.join(dir, "manifest.json");
  if (!existsSync(manifestFile)) return NextResponse.json({ error: "The formation reading is not stored." }, { status: 404 });
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
    retainedTotal?: number;
    finalRetained?: number;
    frames?: number[];
  };
  const frames = (manifest.frames ?? []).flatMap((retained) => {
    if (!Number.isInteger(retained) || retained < 2) return [];
    const file = path.join(dir, `p${String(retained).padStart(2, "0")}.json`);
    if (!existsSync(file)) return [];
    const record = JSON.parse(readFileSync(file, "utf8")) as { geometry?: unknown };
    if (!record.geometry) return [];
    return [{ retained, geometry: record.geometry }];
  });
  if (frames.length === 0) return NextResponse.json({ error: "The formation reading is not stored." }, { status: 404 });
  return NextResponse.json({
    retainedTotal: manifest.retainedTotal ?? null,
    finalRetained: manifest.finalRetained ?? null,
    frames,
  }, { headers: { "cache-control": "no-store" } });
}
