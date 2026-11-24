import { buildPublicLobbyAssembly } from "@/lib/skill5/cluster-assembly";
import type { ClusterAssemblyReport } from "@/lib/skill5/cluster-assembly-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: ClusterAssemblyReport | null = null;

export function GET() {
  try {
    cached ??= buildPublicLobbyAssembly();
    return Response.json(cached);
  } catch (error) {
    cached = null;
    return Response.json({ error: error instanceof Error ? error.message : "Assembly failed." }, { status: 500 });
  }
}
