import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { readVerticalSupport } from "@/lib/skill4/cluster-morphology";
import { CLUSTER_PROGRAMS } from "@/lib/skill4/program-tiles";
import type { FinishedProgram } from "@/lib/skill4/finished-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "data", "skill4", "differentiation-test");

function safe(value: string) {
  return value.length > 0 && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const program = url.searchParams.get("program") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (program || id) {
    if (!safe(program) || !safe(id)) return Response.json(null);
    const file = path.join(ROOT, "meshes", program, `${id.replaceAll(":", "__")}.json`);
    if (!existsSync(file)) return Response.json(null);
    return Response.json(JSON.parse(readFileSync(file, "utf8")));
  }
  const programs = CLUSTER_PROGRAMS.map((item) => {
    const file = path.join(ROOT, "programs", `${item.id}.json`);
    if (!existsSync(file)) return { programId: item.id, name: item.name, iteration: null };
    const saved = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
    const iteration = saved.iterations[Math.min(1, Math.max(0, saved.iterations.length - 1))] ?? null;
    const rise = iteration ? readVerticalSupport(iteration.tiles, iteration.connections) : null;
    const riseLabel = !rise || rise.elevatedTiles === 0 ? "low" : rise.elevatedTiles === 1 ? "single raised tile" : rise.verticalTransitionCount >= 2 ? "broad vertical" : "layered";
    return {
      programId: item.id,
      name: item.name,
      iteration: iteration ? {
        id: iteration.id,
        tiles: iteration.tileCount,
        size: iteration.review ? `${iteration.review.clusterWidth} × ${iteration.review.clusterDepth} × ${iteration.review.clusterHeight}` : "",
        spread: iteration.review?.planSpread ?? 0,
        branches: iteration.review?.branches ?? 0,
        levels: iteration.review?.verticalLevels ?? 0,
        regions: iteration.review?.regionsRetained ?? 0,
        void: iteration.habitableArea,
        transitions: iteration.review?.verticalTransitionCount ?? 0,
        singleStem: iteration.review?.upperMassSupportedBySingleStem ?? false,
        rise: riseLabel,
      } : null,
    };
  });
  const summary = existsSync(path.join(ROOT, "summary.txt")) ? readFileSync(path.join(ROOT, "summary.txt"), "utf8") : "";
  const running = existsSync(path.join(ROOT, "batch.json")) ? JSON.parse(readFileSync(path.join(ROOT, "batch.json"), "utf8")) as { running?: boolean; phase?: string } : { running: false, phase: "" };
  return Response.json({ programs, summary, running, meshes: existsSync(path.join(ROOT, "meshes")) ? readdirSync(path.join(ROOT, "meshes")).length : 0 });
}
