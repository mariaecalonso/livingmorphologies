import { NextResponse } from "next/server";
import { buildProductionReadingView, type ReadingLabView } from "@/lib/interpretation/reading-view";
import { SelectedAssemblyAdapterError } from "@/lib/interpretation/selected-assembly";
import { assemblyRevisionSignature } from "@/lib/skill5/downstream-pipeline";
import { readDevelopmentCheckpoint } from "@/lib/skill5/development-checkpoint";

export const dynamic = "force-dynamic";

let cache: { key: string; view: ReadingLabView } | null = null;

function cacheKey() {
  const checkpoint = readDevelopmentCheckpoint();
  return assemblyRevisionSignature(checkpoint.assembly) ?? "no-source";
}

export async function GET() {
  try {
    const key = cacheKey();
    if (!cache || cache.key !== key) {
      cache = { key, view: buildProductionReadingView() };
    }
    return NextResponse.json(cache.view, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The reading did not load.";
    const status = caught instanceof SelectedAssemblyAdapterError ? 400 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
