import { NextResponse } from "next/server";
import { isArchetypeId } from "@/lib/skill2/filament";
import { readPreviewPlate } from "@/lib/skill2/filament-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  if (!isArchetypeId(archetype) || !/^\d+$/.test(id)) return new NextResponse(null, { status: 404 });
  const plate = readPreviewPlate(archetype, id);
  if (!plate) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(plate.png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Filament-Full": String(plate.full),
    },
  });
}
