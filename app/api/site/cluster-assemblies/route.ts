import { NextResponse } from "next/server";
import {
  ClusterAssemblyError,
  readClusterAssemblyDocument,
  saveClusterAssembly,
} from "@/lib/skill5/cluster-assemblies";
import { readConnectionList, readOccupancyList } from "@/lib/skill5/placed-cluster";
import { readZoningList } from "@/lib/skill5/zoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readClusterAssemblyDocument(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      name?: unknown;
      selectedNetworkId?: unknown;
      zoningSignature?: unknown;
      zones?: unknown;
      occupancy?: unknown;
      connections?: unknown;
      savedFrom?: unknown;
    };
    if (typeof body.selectedNetworkId !== "string") {
      return NextResponse.json({ error: "A selected Site Strategy network is required." }, { status: 400 });
    }
    const saved = saveClusterAssembly({
      name: typeof body.name === "string" ? body.name : undefined,
      selectedNetworkId: body.selectedNetworkId,
      zoningSignature: typeof body.zoningSignature === "string" ? body.zoningSignature : "",
      zones: readZoningList(body.zones),
      occupancy: readOccupancyList(body.occupancy),
      connections: readConnectionList(body.connections),
      savedFrom: body.savedFrom === "auto-initial" || body.savedFrom === "catalog" || body.savedFrom === "placement"
        ? body.savedFrom
        : "placement",
    });
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Cluster Assembly could not be saved.";
    const status = error instanceof ClusterAssemblyError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
