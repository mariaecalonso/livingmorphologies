import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { rankProgramClusters } from "@/lib/skill4/cluster-placement-rank";
import { finalClusterPlacement, isFinalClusterCategory } from "@/lib/skill4/final-cluster-placement";
import { finalCategoryForActivity } from "@/lib/skill5/final-cluster-seat-map";
import { CLUSTER_PROGRAMS } from "@/lib/skill4/program-tiles";
import { ClientDocumentError, loadClientActivitiesDocument } from "@/lib/skill5/load-client-documents";
import type { FinishedCatalog, FinishedProgram } from "@/lib/skill4/finished-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "data", "skill4");
const PROGRAMS = path.join(ROOT, "finished-programs");
const TEST_PROGRAMS = path.join(ROOT, "differentiation-test", "programs");
const CATALOG = path.join(ROOT, "finished-catalog.json");
const BATCH = path.join(ROOT, "finished-batch.json");

function readBatch() {
  try {
    return JSON.parse(readFileSync(BATCH, "utf8")) as { running: boolean; phase: string };
  } catch {
    return { running: false, phase: "" };
  }
}

const parsed = new Map<string, { mtime: number; program: FinishedProgram }>();

function readProgram(file: string): FinishedProgram {
  const mtime = statSync(file).mtimeMs;
  const cached = parsed.get(file);
  if (cached && cached.mtime === mtime) return cached.program;
  const program = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
  parsed.set(file, { mtime, program });
  return program;
}

function summarize(program: FinishedProgram): FinishedProgram {
  return {
    ...program,
    iterations: program.iterations.map(({ tiles: _tiles, connections: _connections, ...summary }) => summary),
  } as FinishedProgram;
}

/**
 * Differentiation-test clusters stay on disk for /api/skill4/differentiation-test.
 * They are not production Placement records unless includeTest=1 is explicit.
 */
function withTestClusters(program: FinishedProgram): FinishedProgram {
  const file = path.join(TEST_PROGRAMS, `${program.programId}.json`);
  if (!existsSync(file)) return program;
  try {
    const test = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
    const present = new Set(program.iterations.map((item) => item.id));
    const extra = test.iterations.flatMap((item, index) => {
      const id = `${program.programId}:test-${index}`;
      if (present.has(id)) return [];
      return [{ ...item, id, iteration: program.iterations.length + index + 1 }];
    });
    if (extra.length === 0) return program;
    return {
      ...program,
      finished: program.iterations.length + extra.length,
      persisted: program.iterations.length + extra.length,
      iterations: [...program.iterations, ...extra],
    };
  } catch {
    return program;
  }
}

function readCatalog(): FinishedCatalog {
  const saved = new Map<string, FinishedProgram>();
  if (existsSync(PROGRAMS)) {
    for (const name of readdirSync(PROGRAMS)) {
      if (!name.endsWith(".json")) continue;
      const program = readProgram(path.join(PROGRAMS, name));
      saved.set(program.programId, program);
    }
  }
  if (saved.size === 0 && existsSync(CATALOG)) {
    const stored = JSON.parse(readFileSync(CATALOG, "utf8")) as FinishedCatalog;
    return { ...stored, batch: readBatch() };
  }
  const programs = CLUSTER_PROGRAMS.map((program) => saved.get(program.id) ?? {
    programId: program.id,
    name: program.name,
    requested: 10,
    finished: 0,
    failed: 0,
    validationRuns: 0,
    shrinkwrapRuns: 0,
    persisted: 0,
    iterations: [],
  });
  return { scale: "1 model unit = 1 foot", programs, batch: readBatch() };
}

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const programId = url.searchParams.get("program") ?? "";
    const catalog = readCatalog();
    if (programId && url.searchParams.get("view") === "placement") {
      const category = isFinalClusterCategory(programId) ? programId : finalCategoryForActivity(programId);
      if (!category) {
        return Response.json(
          { error: "unsupported program for new placement", programId, source: "final-clusters" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      const placement = finalClusterPlacement(category);
      return Response.json(placement ? { ...placement, requestedProgramId: programId, source: "final-clusters" } : null, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (programId) {
      const stored = catalog.programs.find((item) => item.programId === programId) ?? null;
      const includeTest = url.searchParams.get("includeTest") === "1";
      const program = stored ? (includeTest ? withTestClusters(stored) : stored) : null;
      if (url.searchParams.get("view") === "placement") {
        if (!program) return Response.json(null);
        try {
          return Response.json(rankProgramClusters(program.programId, program.name, program.iterations, loadClientActivitiesDocument()), {
            headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
          });
        } catch (error) {
          const message = error instanceof ClientDocumentError || error instanceof Error
            ? error.message
            : "The client activity record could not be read.";
          return Response.json({ error: message }, { status: 500 });
        }
      }
      return Response.json(program, {
        headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
      });
    }
    return Response.json({
      ...catalog,
      programs: catalog.programs.map(summarize),
    });
  } catch {
    return Response.json({ scale: "1 model unit = 1 foot", programs: [], batch: { running: false, phase: "" } } satisfies FinishedCatalog);
  }
}

export function POST() {
  const batch = readBatch();
  if (batch.running) return Response.json({ started: false, running: true });
  const child = spawn("npx tsx lib/skill4/generate-finished-catalog.ts", {
    cwd: process.cwd(),
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return Response.json({ started: true, running: true });
}
