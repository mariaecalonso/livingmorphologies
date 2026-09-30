import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { archiveImagePath } from "@/lib/skill2/evolution-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const path = archiveImagePath(archetype, id);
  if (!path) return new NextResponse(null, { status: 404 });
  const bytes = await readFile(path);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
    },
  });
}
