import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { publishedZoning } from "@/lib/skill5/strategy-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");

export async function GET() {
  try {
    const raw = await readFile(FILE, "utf8");
    const zoning = publishedZoning(JSON.parse(raw) as unknown);
    if (!zoning?.massingNetworkId || zoning.zoningShortlist.length !== 3) {
      return NextResponse.json({ error: "The strategy archive could not be read." }, { status: 500 });
    }
    return new NextResponse(raw, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  } catch {
    return NextResponse.json({ strategyId: "herald-arrival-v1", massingNetworkId: null, zoningShortlist: [], iterations: [] });
  }
}

