import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "experiments", "process-generation", "vertical-void-351", "N24", "manifest.json");

/** Read-only manifest for the verified Vertical Void N24 generation replay. */
export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("archetype") !== "vertical-void" || url.searchParams.get("candidate") !== "351" || url.searchParams.get("continuation") !== "N24") {
    return NextResponse.json({ error: "Live generation data is not stored for this continuation." }, { status: 404 });
  }
  if (!existsSync(FILE)) return NextResponse.json({ error: "Live generation data is not stored for this continuation." }, { status: 404 });
  const manifest = JSON.parse(readFileSync(FILE, "utf8")) as { contract?: string };
  if (manifest.contract !== "process-generation-replay-v1") {
    return NextResponse.json({ error: "Live generation data is not stored for this continuation." }, { status: 404 });
  }
  return NextResponse.json(manifest, { headers: { "cache-control": "no-store" } });
}
