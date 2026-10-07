import { NextResponse } from "next/server";
import { readPublishedInk } from "@/lib/skill2/filament-catalog";
import { loadFilamentCalibration } from "@/lib/skill2/filament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const bytes = readPublishedInk(archetype, id, loadFilamentCalibration(archetype));
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
    },
  });
}
