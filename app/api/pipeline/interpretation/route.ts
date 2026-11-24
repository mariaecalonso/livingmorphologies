import { NextResponse } from "next/server";
import { DownstreamPipelineError, resolveDownstreamPipeline, stampInterpretationRevision } from "@/lib/skill5/downstream-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(resolveDownstreamPipeline().interpretation, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT() {
  try {
    return NextResponse.json(stampInterpretationRevision());
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Interpretation revision could not be recorded.";
    const status = error instanceof DownstreamPipelineError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
