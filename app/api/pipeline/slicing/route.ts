import { NextResponse } from "next/server";
import { createSliceDefinition, DownstreamPipelineError, resolveDownstreamPipeline } from "@/lib/skill5/downstream-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(resolveDownstreamPipeline().slicing, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; type?: unknown };
    if (body.type !== "horizontal" && body.type !== "vertical") {
      return NextResponse.json({ error: "A slice type of horizontal or vertical is required." }, { status: 400 });
    }
    return NextResponse.json(createSliceDefinition({
      name: typeof body.name === "string" ? body.name : undefined,
      type: body.type,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The slice definition could not be saved.";
    const status = error instanceof DownstreamPipelineError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
