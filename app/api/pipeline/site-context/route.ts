import { NextResponse } from "next/server";
import { readSiteContextSource } from "@/lib/skill5/site-context-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readSiteContextSource(), {
    headers: { "Cache-Control": "no-store" },
  });
}
