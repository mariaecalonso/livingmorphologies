import { NextResponse } from "next/server";
import { ClusterAssemblyError, deleteClusterAssembly, readClusterAssembly } from "@/lib/skill5/cluster-assemblies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const assembly = readClusterAssembly(id);
  if (!assembly) return NextResponse.json({ error: "That Cluster Assembly is not in the catalog." }, { status: 404 });
  return NextResponse.json(assembly, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(deleteClusterAssembly(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Cluster Assembly could not be removed.";
    const status = error instanceof ClusterAssemblyError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
