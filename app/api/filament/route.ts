import { NextResponse } from "next/server";
import { filamentArchetypeStatus } from "@/lib/skill2/filament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ archetypes: filamentArchetypeStatus() });
}
