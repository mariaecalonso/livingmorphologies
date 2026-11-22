import { readFileSync } from "node:fs";
import path from "node:path";
import type { StoredProgramCatalog } from "@/lib/skill4/program-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUT = path.join(process.cwd(), "data", "skill4", "program-catalog.json");

export function GET() {
  try {
    const body = JSON.parse(readFileSync(OUTPUT, "utf8")) as StoredProgramCatalog;
    return Response.json(body);
  } catch {
    return Response.json({ scale: "1 model unit = 1 foot", programs: [] } satisfies StoredProgramCatalog);
  }
}
