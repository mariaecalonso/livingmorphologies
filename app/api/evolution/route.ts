import { NextResponse } from "next/server";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(loadEvolutionCatalog());
}
