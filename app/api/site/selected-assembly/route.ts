import { NextResponse } from "next/server";
import { ClusterAssemblyError, readClusterAssemblyDocument, writeSelectedAssemblyId } from "@/lib/skill5/cluster-assemblies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const document = readClusterAssemblyDocument();
  const assembly = document.assemblies.find((item) => item.assemblyId === document.selectedAssemblyId) ?? null;
  return NextResponse.json({
    selectedAssemblyId: document.selectedAssemblyId,
    assembly,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { selectedAssemblyId?: unknown };
    if (body.selectedAssemblyId !== null && typeof body.selectedAssemblyId !== "string") {
      return NextResponse.json({ error: "A Cluster Assembly id is required." }, { status: 400 });
    }
    const saved = writeSelectedAssemblyId(body.selectedAssemblyId);
    const assembly = saved.assemblies.find((item) => item.assemblyId === saved.selectedAssemblyId) ?? null;
    return NextResponse.json({
      selectedAssemblyId: saved.selectedAssemblyId,
      assembly,
      changed: saved.changed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The selected Cluster Assembly could not be saved.";
    const status = error instanceof ClusterAssemblyError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
