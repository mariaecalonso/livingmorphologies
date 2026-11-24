import { buildPublicLobbyAssembly } from "@/lib/skill5/cluster-assembly";
import type { ClusterAssemblyReport } from "@/lib/skill5/cluster-assembly-report";
import { designerZoningSignature } from "@/lib/skill5/designer-zoning";
import { readPublishedSelectedNetwork } from "@/lib/skill5/selected-site-network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: { signature: string; report: ClusterAssemblyReport } | null = null;

export function GET() {
  try {
    const selected = readPublishedSelectedNetwork();
    const signature = `${selected.massingNetworkId}:${designerZoningSignature(selected.massingNetworkId)}`;
    if (!cached || cached.signature !== signature) {
      cached = { signature, report: buildPublicLobbyAssembly() };
    }
    return Response.json(cached.report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    cached = null;
    return Response.json({ error: error instanceof Error ? error.message : "Assembly failed." }, { status: 500 });
  }
}
