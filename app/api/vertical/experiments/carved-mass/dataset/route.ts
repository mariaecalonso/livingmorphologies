import { NextResponse } from "next/server";
import { readArchetypeRecords, readCarvedMassManifest } from "@/lib/skill3/experiments/carved-mass-registry";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import { generateCarvedMassArchetype } from "@/lib/skill3/experiments/carved-mass-dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export function GET(request: Request) {
  const url = new URL(request.url);
  const archetypeId = url.searchParams.get("archetype");
  const candidate = Number(url.searchParams.get("candidate"));
  const generate = url.searchParams.get("generate") === "1";
  try {
    if (!archetypeId) {
      const manifest = readCarvedMassManifest();
      return NextResponse.json({ sources: CARVED_MASS_SOURCES, manifest });
    }
    if (!Number.isInteger(candidate)) {
      return NextResponse.json({ error: "candidate is required" }, { status: 422 });
    }
    if (generate) {
      const report = generateCarvedMassArchetype(archetypeId, candidate);
      return NextResponse.json({ report });
    }
    const records = readArchetypeRecords(archetypeId, candidate);
    return NextResponse.json({
      archetypeId,
      candidateId: candidate,
      entries: records.map((record) => ({
        continuationId: record.continuationId,
        moduleId: record.moduleId,
        continuationSeed: record.continuationSeed,
        z0Iteration: record.z0Iteration,
        parentChecksum: record.parentChecksum,
        solidFraction: record.metrics.solidFraction,
        components: record.metrics.components,
        openingSize: record.metrics.openingSize,
        centroid: record.metrics.centroid,
        wall: record.metrics.wall,
        flags: record.flags,
        mesh: record.geometry,
      })),
    });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The carved-mass dataset could not be read.";
    return NextResponse.json({ error }, { status: 422 });
  }
}
