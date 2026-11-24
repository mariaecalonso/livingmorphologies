import { NextResponse } from "next/server";
import { PUBLICATION_SOURCE_REGISTRY, PUBLICATION_SOURCES } from "@/lib/publication-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { contract: PUBLICATION_SOURCE_REGISTRY, sources: PUBLICATION_SOURCES },
    { headers: { "Cache-Control": "no-store" } },
  );
}
