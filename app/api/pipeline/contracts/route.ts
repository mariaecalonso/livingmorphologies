import { NextResponse } from "next/server";
import { labContractDocument } from "@/lib/lab-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(labContractDocument(), {
    headers: { "Cache-Control": "no-store" },
  });
}
