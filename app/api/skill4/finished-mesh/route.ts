import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { finalClusterMeshPath } from "@/lib/skill4/final-cluster-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const program = url.searchParams.get("program") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!program || !id || program.includes("..") || id.includes("..") || program.includes("/") || id.includes("/") || program.includes("\\") || id.includes("\\")) {
    return Response.json(null);
  }
  try {
    const finalCluster = finalClusterMeshPath(program, id);
    const finished = path.join(process.cwd(), "data", "skill4", "finished", program, `${id.replaceAll(":", "__")}.json`);
    const testIndex = id.match(/:test-(\d+)$/);
    const test = testIndex
      ? path.join(process.cwd(), "data", "skill4", "differentiation-test", "meshes", program, `${program}__${testIndex[1]}.json`)
      : "";
    const file = existsSync(finalCluster) ? finalCluster : existsSync(finished) ? finished : test;
    if (!file) return Response.json(null);
    return Response.json(JSON.parse(readFileSync(file, "utf8")), {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json(null);
  }
}
