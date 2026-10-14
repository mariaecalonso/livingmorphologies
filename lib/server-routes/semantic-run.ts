import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { semanticPreviewPath } from "@/lib/skill3/semantic-provenance";

export async function semanticRunGet(archetype: string, id: string) {
  const candidateId = Number(id);
  if (!/^[a-z0-9-]+$/.test(archetype) || !/^\d+$/.test(id) || !Number.isInteger(candidateId)) {
    return new NextResponse(null, { status: 404 });
  }
  const path = semanticPreviewPath(archetype, candidateId);
  if (!path) return new NextResponse(null, { status: 404 });
  const bytes = await readFile(path);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
    },
  });
}
