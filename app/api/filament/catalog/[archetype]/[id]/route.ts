import { NextResponse } from "next/server";
import { isArchetypeId, normalizeFilamentCalibration } from "@/lib/skill2/filament";
import { readPublishedInk } from "@/lib/skill2/filament-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  if (!isArchetypeId(archetype) || !/^\d+$/.test(id)) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const numberOr = (name: "white" | "black" | "organic" | "thickness") =>
    url.searchParams.has(name) ? Number(url.searchParams.get(name)) : undefined;
  const calibration = normalizeFilamentCalibration({
    white: numberOr("white"),
    black: numberOr("black"),
    organic: numberOr("organic"),
    thickness: numberOr("thickness"),
  });
  const png = readPublishedInk(archetype, id, calibration);
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
