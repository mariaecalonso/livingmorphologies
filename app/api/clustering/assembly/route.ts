import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ASSEMBLY_DIRECTORY } from "@/lib/skill6/catalog";
import { CLUSTERING_EXPANSION, CLUSTERING_FIVE_TILE, CLUSTERING_GRAPH_BUDGET, CLUSTERING_OVERNIGHT, CLUSTERING_RULE_LARGE, INITIAL_CLUSTERING_COVERAGE, INITIAL_CLUSTERING_LAB, ORGANIZATION_EXPERIMENT, SMALL_GROUND_DIRECTORY, SMALL_GROUND_EXPERIMENT, SMALL_GROUND_V2 } from "@/lib/skill6/experiment-catalog";

export const dynamic = "force-dynamic";

const REFINED_CACHE = new Map<string, { mtimeMs: number; json: string }>();
const FULL_CACHE = new Map<string, { mtimeMs: number; body: string }>();

function remember<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

/** Stored raw union, refined surface, and patches for one assembled cluster. `part=refined` returns the refined surface only. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  if (!/^[a-z0-9-]+$/.test(id)) return NextResponse.json({ error: "Unknown cluster." }, { status: 400 });
  const collection = params.get("collection");
  const directory = collection == null
    ? ASSEMBLY_DIRECTORY
    : collection === SMALL_GROUND_EXPERIMENT
      ? SMALL_GROUND_DIRECTORY
      : collection === SMALL_GROUND_V2
        ? path.join(process.cwd(), "data", "skill6", "experiments", SMALL_GROUND_V2)
        : collection === ORGANIZATION_EXPERIMENT
          ? path.join(process.cwd(), "data", "skill6", "experiments", ORGANIZATION_EXPERIMENT)
          : collection === INITIAL_CLUSTERING_LAB
            ? path.join(process.cwd(), "data", "skill6", "experiments", INITIAL_CLUSTERING_LAB)
            : collection === INITIAL_CLUSTERING_COVERAGE
              ? path.join(process.cwd(), "data", "skill6", "experiments", INITIAL_CLUSTERING_COVERAGE)
              : collection === CLUSTERING_EXPANSION
                ? path.join(process.cwd(), "data", "skill6", "experiments", CLUSTERING_EXPANSION)
                : collection === CLUSTERING_FIVE_TILE
                  ? path.join(process.cwd(), "data", "skill6", "experiments", CLUSTERING_FIVE_TILE)
                  : collection === CLUSTERING_OVERNIGHT
                    ? path.join(process.cwd(), "data", "skill6", "experiments", CLUSTERING_OVERNIGHT)
                    : collection === CLUSTERING_GRAPH_BUDGET
                      ? path.join(process.cwd(), "data", "skill6", "experiments", CLUSTERING_GRAPH_BUDGET)
                      : collection === CLUSTERING_RULE_LARGE
                        ? path.join(process.cwd(), "data", "skill6", "experiments", CLUSTERING_RULE_LARGE)
                        : null;
  if (!directory) return NextResponse.json({ error: "Unknown collection." }, { status: 404 });
  const file = path.join(directory, `${id}.mesh.json`);
  if (!existsSync(file)) return NextResponse.json({ error: "No assembly is stored for this cluster." }, { status: 404 });
  const mtimeMs = statSync(file).mtimeMs;
  const cacheKey = `${file}\n${mtimeMs}`;
  if (params.get("part") === "refined") {
    const cached = REFINED_CACHE.get(cacheKey);
    if (cached) return new NextResponse(cached.json, { headers: { "content-type": "application/json" } });
    const stored = JSON.parse(readFileSync(file, "utf8")) as { id: string; refined: unknown };
    const json = JSON.stringify({ id: stored.id, raw: null, refined: stored.refined, patches: [] });
    remember(REFINED_CACHE, cacheKey, { mtimeMs, json }, 24);
    return new NextResponse(json, { headers: { "content-type": "application/json" } });
  }
  const cached = FULL_CACHE.get(cacheKey);
  if (cached) return new NextResponse(cached.body, { headers: { "content-type": "application/json" } });
  const body = readFileSync(file, "utf8");
  remember(FULL_CACHE, cacheKey, { mtimeMs, body }, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json" } });
}
