import { NextResponse } from "next/server";
import { resolveDownstreamPipeline } from "@/lib/skill5/downstream-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = resolveDownstreamPipeline();
  return NextResponse.json({
    ...resolved.rendering,
    siteContext: resolved.siteContext,
  }, { headers: { "Cache-Control": "no-store" } });
}
