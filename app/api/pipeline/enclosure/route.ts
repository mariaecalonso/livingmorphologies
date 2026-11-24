import { NextResponse } from "next/server";
import { DownstreamPipelineError, resolveDownstreamPipeline, stampEnclosureRevision } from "@/lib/skill5/downstream-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = resolveDownstreamPipeline();
  return NextResponse.json({
    enclosure: resolved.enclosure,
    finalEnclosedModel: resolved.finalEnclosedModel,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT() {
  try {
    const resolved = stampEnclosureRevision();
    return NextResponse.json({
      enclosure: resolved.enclosure,
      finalEnclosedModel: resolved.finalEnclosedModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Enclosure revision could not be recorded.";
    const status = error instanceof DownstreamPipelineError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
