import { NextResponse } from "next/server";
import { readDesignerZoning, writeDesignerZoning, DesignerZoningError } from "@/lib/skill5/designer-zoning";
import { readZoningList } from "@/lib/skill5/zoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readDesignerZoning(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { regions?: unknown };
    const saved = writeDesignerZoning(readZoningList(body.regions));
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Designer zoning could not be saved.";
    const status = error instanceof DesignerZoningError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
