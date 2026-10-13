import { NextResponse } from "next/server";
import { listSolidifiedCatalogue, readSolidifiedMesh, readSolidifiedStatus } from "@/lib/skill3/solidified-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stored solidified modules only. This route does not generate continuations. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const archetypeId = url.searchParams.get("archetype") ?? "";
  const candidateId = Number(url.searchParams.get("candidate"));
  const continuationId = url.searchParams.get("continuation");
  if (!archetypeId || !Number.isInteger(candidateId)) {
    return NextResponse.json({ error: "The solidified catalogue needs an archetype and candidate." }, { status: 400 });
  }
  if (continuationId) {
    const mesh = readSolidifiedMesh(archetypeId, candidateId, continuationId);
    const status = readSolidifiedStatus(archetypeId, candidateId, continuationId);
    const moduleId = `carved-mass:${archetypeId}:${candidateId}:${continuationId}`;
    if (!mesh || mesh.moduleId !== moduleId || !status) {
      return NextResponse.json({ error: "That solidified module is not stored." }, { status: 404 });
    }
    return NextResponse.json({
      source: "carved-mass-solidified",
      moduleId,
      archetypeId,
      candidateId,
      continuationId,
      status,
      geometry: mesh.geometry,
    });
  }
  const continuations = listSolidifiedCatalogue(archetypeId, candidateId);
  if (continuations.length === 0) {
    return NextResponse.json({ error: "No solidified continuations are stored for this candidate." }, { status: 404 });
  }
  const first = continuations[0];
  return NextResponse.json({
    source: "carved-mass-solidified",
    contract: "carved-mass-solidified-v1",
    typologyId: first.typologyId,
    archetypeId: first.archetypeId,
    archetypeName: first.archetypeName,
    candidateId: first.candidateId,
    continuations,
  });
}
