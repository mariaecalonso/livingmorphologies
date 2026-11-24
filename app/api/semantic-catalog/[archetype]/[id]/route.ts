import { NextResponse } from "next/server";
import { loadFilamentCalibration } from "@/lib/skill2/filament";
import { readPublishedInk } from "@/lib/skill2/filament-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const png = readPublishedInk(archetype, id, loadFilamentCalibration(archetype));
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
