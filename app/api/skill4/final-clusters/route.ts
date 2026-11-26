import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  emptyCatalog,
  FINAL_CLUSTER_PAIRS,
  type FinalClustersCatalogDocument,
} from "@/lib/skill4/final-cluster-pairs";
import { readHybridThumb } from "@/lib/skill4/hybrid-thumb-mesh";

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

let catalogCache: { mtimeMs: number; body: FinalClustersCatalogDocument } | null = null;

function readCatalog(): FinalClustersCatalogDocument {
  try {
    const mtimeMs = statSync(CATALOG).mtimeMs;
    if (catalogCache?.mtimeMs === mtimeMs) return catalogCache.body;
    const body = JSON.parse(readFileSync(CATALOG, "utf8")) as FinalClustersCatalogDocument;
    catalogCache = { mtimeMs, body };
    return body;
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
    if (url.searchParams.get("connectors") === "1" && url.searchParams.get("thumb") === "1") {
      const connections = readHybridThumb(pairId, id);
      if (!connections) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ id, connections });
    }
    const body = JSON.parse(readFileSync(file, "utf8")) as {
      mesh?: unknown;
      connections?: { id: string; selectedMockId?: string; validatedHybrid: unknown }[];
    };
    if (url.searchParams.get("connectors") === "1") {
      return Response.json({
        id,
        connections: (body.connections ?? []).map((connection) => ({
          id: connection.id,
          selectedMockId: connection.selectedMockId ?? "",
          validatedHybrid: connection.validatedHybrid,
        })),
      });
    }
    return Response.json(body);
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
