import { NextResponse } from "next/server";
import { isArchetypeId, saveFilamentCalibration, type FilamentCalibration } from "@/lib/skill2/filament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ archetype: string }> }) {
  const { archetype } = await context.params;
  if (!isArchetypeId(archetype)) return NextResponse.json({ error: "unknown archetype" }, { status: 400 });
  const body = (await request.json()) as Partial<FilamentCalibration>;
  const calibration = saveFilamentCalibration(archetype, body);
  return NextResponse.json({ calibration });
}
