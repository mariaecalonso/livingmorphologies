import { NextResponse } from "next/server";
import { computationalWorkflowDocument } from "@/lib/computational-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(computationalWorkflowDocument(), {
    headers: { "Cache-Control": "no-store" },
  });
}
