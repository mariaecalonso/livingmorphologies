import { NextResponse } from "next/server";
import { publishedHandoff, readPublishedSelection } from "@/lib/skill2/read-published-selection";
import { persistPublishedZ0 } from "@/lib/skill2/semantic/persist-published-z0";
import { loadVerifiedZ0 } from "@/lib/skill2/semantic/z0-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const candidateId = Number(id);
  const selection = readPublishedSelection(archetype, candidateId);
  if (!selection) return NextResponse.json({ selection: null, handoff: "pending" }, { status: 404 });
  return NextResponse.json({ selection, handoff: publishedHandoff(archetype, candidateId) });
}

/** Stores nothing in the catalogue. Replays and verifies a Z0 only when one is not already on disk. */
export async function POST(_request: Request, context: { params: Promise<{ archetype: string; id: string }> }) {
  const { archetype, id } = await context.params;
  const candidateId = Number(id);
  const selection = readPublishedSelection(archetype, candidateId);
  if (!selection) return NextResponse.json({ selection: null, handoff: "pending" }, { status: 404 });
  try {
    if (!loadVerifiedZ0(archetype, candidateId)) persistPublishedZ0(archetype, candidateId);
    const verified = loadVerifiedZ0(archetype, candidateId);
    if (!verified) return NextResponse.json({ selection, handoff: "pending", error: "Verified Z0 was not readable." }, { status: 422 });
    return NextResponse.json({ selection, handoff: "verified", checksum: verified.meta.validation.checksum });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The Z0 could not be verified.";
    return NextResponse.json({ selection, handoff: "pending", error }, { status: 422 });
  }
}
