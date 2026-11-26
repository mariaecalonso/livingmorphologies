import { readFinalClusterStats } from "@/lib/skill4/final-cluster-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(readFinalClusterStats(), {
    headers: { "Cache-Control": "no-store" },
  });
}
