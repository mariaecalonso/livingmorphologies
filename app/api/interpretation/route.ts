import { NextResponse } from "next/server";
import { cleanEdits } from "@/lib/interpretation/edits";
import { buildInterpretation } from "@/lib/interpretation/generate";
import { loadFinalCluster } from "@/lib/interpretation/source";
import { isProposalId, type ProposalId } from "@/lib/interpretation/types";

export const dynamic = "force-dynamic";

async function model(proposal: ProposalId, edits: Record<string, ReturnType<typeof cleanEdits>[string]>) {
  const cluster = loadFinalCluster();
  return buildInterpretation(cluster, proposal, edits);
}

export async function GET(request: Request) {
  const proposal = new URL(request.url).searchParams.get("proposal") ?? "balanced";
  if (!isProposalId(proposal)) return NextResponse.json({ error: "Unknown proposal." }, { status: 400 });
  try {
    return NextResponse.json(await model(proposal, {}));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The cluster could not be interpreted.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { proposal?: string; edits?: unknown } | null;
  const proposal = body?.proposal ?? "";
  if (!isProposalId(proposal)) return NextResponse.json({ error: "Unknown proposal." }, { status: 400 });
  try {
    return NextResponse.json(await model(proposal, cleanEdits(body?.edits)));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The cluster could not be interpreted.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
