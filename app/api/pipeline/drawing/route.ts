import { NextResponse } from "next/server";
import { createDrawingFromSlice, DownstreamPipelineError, resolveDownstreamPipeline } from "@/lib/skill5/downstream-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = resolveDownstreamPipeline();
  return NextResponse.json({
    ...resolved.drawing,
    siteContext: resolved.siteContext,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sourceSliceId?: unknown };
    if (typeof body.sourceSliceId !== "string") {
      return NextResponse.json({ error: "A source slice id is required." }, { status: 400 });
    }
    return NextResponse.json(createDrawingFromSlice(body.sourceSliceId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The drawing record could not be saved.";
    const status = error instanceof DownstreamPipelineError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
