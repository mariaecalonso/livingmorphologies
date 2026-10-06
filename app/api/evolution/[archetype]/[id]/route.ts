import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { archiveImagePath } from "@/lib/skill2/evolution-index";
import { readCatalogFilament, semanticPreviewPath } from "@/lib/skill2/filament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const semantic = semanticPreviewPath(archetype, id);
  const bytes = semantic ? readCatalogFilament(archetype, semantic, id) : null;
  if (bytes) {
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  }
  const path = archiveImagePath(archetype, id);
  if (!path) return new NextResponse(null, { status: 404 });
  const stored = await readFile(path);
  return new NextResponse(stored, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
    },
  });
}
