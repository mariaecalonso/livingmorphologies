import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { clearPublishedInk, readPreviewPlate, readPublishedInk } from "@/lib/skill2/filament-catalog";
import {
  filamentArchetypeStatus,
  isArchetypeId,
  loadFilamentCalibration,
  normalizeFilamentCalibration,
  refinePreviewPng,
  saveFilamentCalibration,
  semanticPreviewPath,
  type FilamentCalibration,
} from "@/lib/skill2/filament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };

/** One function for every filament URL, so the Hobby plan stays under its function limit. */
export async function GET(request: Request, context: Context) {
  const { path = [] } = await context.params;
  if (path.length === 0) return NextResponse.json({ archetypes: filamentArchetypeStatus() });
  if (path[0] === "catalog" && path.length === 3) return catalogInk(request, path[1], path[2]);
  if (path[0] === "plate" && path.length === 3) return plateInk(path[1], path[2]);
  if (path.length === 2) return previewInk(request, path[0], path[1]);
  return new NextResponse(null, { status: 404 });
}

export async function POST(request: Request, context: Context) {
  const { path = [] } = await context.params;
  if (path.length !== 1) return NextResponse.json({ error: "unknown archetype" }, { status: 404 });
  const archetype = path[0];
  if (!isArchetypeId(archetype)) return NextResponse.json({ error: "unknown archetype" }, { status: 400 });
  const body = (await request.json()) as Partial<FilamentCalibration>;
  const calibration = saveFilamentCalibration(archetype, body);
  clearPublishedInk(archetype);
  return NextResponse.json({ calibration });
}

function numberOr(url: URL, saved: FilamentCalibration, name: "white" | "black" | "organic" | "thickness") {
  return url.searchParams.has(name) ? Number(url.searchParams.get(name)) : saved[name];
}

function calibrationFrom(request: Request, archetype: string) {
  const saved = loadFilamentCalibration(archetype);
  const url = new URL(request.url);
  return normalizeFilamentCalibration({
    white: numberOr(url, saved, "white"),
    black: numberOr(url, saved, "black"),
    organic: numberOr(url, saved, "organic"),
    thickness: numberOr(url, saved, "thickness"),
  });
}

function previewInk(request: Request, archetype: string, id: string) {
  const source = semanticPreviewPath(archetype, id);
  if (!source) return new NextResponse(null, { status: 404 });
  const png = refinePreviewPng(readFileSync(source), calibrationFrom(request, archetype), archetype);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

function catalogInk(request: Request, archetype: string, id: string) {
  if (!isArchetypeId(archetype) || !/^\d+$/.test(id)) return new NextResponse(null, { status: 404 });
  const png = readPublishedInk(archetype, id, calibrationFrom(request, archetype));
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

function plateInk(archetype: string, id: string) {
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
