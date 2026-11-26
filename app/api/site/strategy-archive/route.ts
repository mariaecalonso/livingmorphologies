import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { publishedZoning } from "@/lib/skill5/strategy-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");

/** Drop trail rasters when branches are present — the browser only needs lines for Strategy. */
function slimArchive(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.iterations)) return raw;
  return {
    ...body,
    iterations: body.iterations.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      const branches = row.branches;
      if (!Array.isArray(branches) || branches.length === 0) return item;
      return { ...row, trailCells: [] };
    }),
  };
}

export async function GET() {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const zoning = publishedZoning(parsed);
    if (!zoning?.massingNetworkId) {
      return NextResponse.json({ error: "The strategy archive could not be read." }, { status: 500 });
    }
    // Pad a short shortlist so a publish that drops an old id does not blank Strategy.
    const shortlist = [...zoning.zoningShortlist];
    while (shortlist.length < 3) shortlist.push(zoning.massingNetworkId);
    const body = slimArchive(parsed) as Record<string, unknown>;
    return NextResponse.json({
      ...body,
      massingNetworkId: zoning.massingNetworkId,
      zoningShortlist: shortlist.slice(0, 3),
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ strategyId: "herald-arrival-v1", massingNetworkId: null, zoningShortlist: [], iterations: [] });
  }
}
