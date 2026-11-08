import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import {
  loadFilamentCalibration,
  normalizeFilamentCalibration,
  refinePreviewPng,
  semanticPreviewPath,
} from "@/lib/skill2/filament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const source = semanticPreviewPath(archetype, id);
  if (!source) return new NextResponse(null, { status: 404 });
  const saved = loadFilamentCalibration(archetype);
  const url = new URL(request.url);
  const numberOr = (name: "white" | "black" | "organic" | "thickness") =>
    url.searchParams.has(name) ? Number(url.searchParams.get(name)) : saved[name];
  const calibration = normalizeFilamentCalibration({
    white: numberOr("white"),
    black: numberOr("black"),
    organic: numberOr("organic"),
    thickness: numberOr("thickness"),
  });
  const png = refinePreviewPng(readFileSync(source), calibration);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
