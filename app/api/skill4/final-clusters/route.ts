import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  emptyCatalog,
  FINAL_CLUSTER_PAIRS,
  type FinalClustersCatalogDocument,
} from "@/lib/skill4/final-cluster-pairs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "data", "skill4");
const CATALOG = path.join(ROOT, "final-clusters-catalog.json");
const BATCH = path.join(ROOT, "final-clusters-batch.json");
const MESHES = path.join(ROOT, "final-clusters");

type BatchState = { running: boolean; phase: string };

function readBatch(): BatchState {
  try {
    return JSON.parse(readFileSync(BATCH, "utf8")) as BatchState;
  } catch {
    return { running: false, phase: "" };
  }
}

function readCatalog(): FinalClustersCatalogDocument {
  try {
    return JSON.parse(readFileSync(CATALOG, "utf8")) as FinalClustersCatalogDocument;
  } catch {
    return emptyCatalog();
  }
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const pairId = url.searchParams.get("pair");
  const id = url.searchParams.get("id");
  if (pairId && id) {
    const file = path.join(MESHES, pairId, `${id.replaceAll(":", "__")}.json`);
    if (!existsSync(file)) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(JSON.parse(readFileSync(file, "utf8")));
  }
  const catalog = readCatalog();
  const batch = readBatch();
  return Response.json({
    ...catalog,
    pairs: FINAL_CLUSTER_PAIRS.map((pair) => pair.id),
    batch,
  });
}

export function POST() {
  const batch = readBatch();
  if (batch.running) {
    return Response.json({ ok: false, running: true, phase: batch.phase });
  }
  const child = spawn("npx tsx lib/skill4/generate-final-clusters.ts", {
    cwd: process.cwd(),
    stdio: "ignore",
    shell: true,
    detached: true,
  });
  child.unref();
  return Response.json({ ok: true, started: true });
}
