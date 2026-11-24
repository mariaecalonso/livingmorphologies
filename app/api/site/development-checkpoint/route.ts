import { NextResponse } from "next/server";
import { readDevelopmentCheckpoint } from "@/lib/skill5/development-checkpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readDevelopmentCheckpoint(), {
    headers: { "Cache-Control": "no-store" },
  });
}
