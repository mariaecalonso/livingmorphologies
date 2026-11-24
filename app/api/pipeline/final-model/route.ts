import { NextResponse } from "next/server";
import { resolveDownstreamPipeline } from "@/lib/skill5/downstream-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(resolveDownstreamPipeline().finalEnclosedModel, {
    headers: { "Cache-Control": "no-store" },
  });
}
