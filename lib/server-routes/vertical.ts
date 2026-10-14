import { NextResponse } from "next/server";
import { readArchetypeRecords, readCarvedMassManifest } from "@/lib/skill3/experiments/carved-mass-registry";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import { generateCarvedMassArchetype } from "@/lib/skill3/experiments/carved-mass-dataset";
import { peekNaturalContinuations, type NaturalContinuationSet } from "@/lib/skill3/continuations";
import { loadVerifiedContinuations, peekVerifiedContinuations } from "@/lib/skill3/semantic-handoff";
import { buildDevelopmentCatalogueSet } from "@/lib/skill3/fixture";
import { loadProvisionalContinuations, peekProvisionalContinuations } from "@/lib/skill3/provisional-replay";
import { selectionFromQuery } from "@/lib/skill3/selection";
import { listSolidifiedCatalogue, readSolidifiedMesh, readSolidifiedStatus } from "@/lib/skill3/solidified-catalogue";

export function verticalGet(request: Request, path: string[]) {
    if (path.length === 0) return continuations(request);
    if (path.length === 1 && path[0] === "solidified") return solidified(request);
    if (path.length === 3 && path[0] === "experiments" && path[1] === "carved-mass" && path[2] === "dataset") return dataset(request);
    return new NextResponse(null, { status: 404 });
}

function continuationBundle(set: NaturalContinuationSet) {
  const { continuations, ...source } = set;
  return {
    ...source,
    continuations: continuations.map((continuation) => {
      const { field: _field, ...meta } = continuation;
      return meta;
    }),
    fields: continuations.map((continuation) => continuation.field),
  };
}

function continuations(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("fixture") === "1") {
    const continuationId = url.searchParams.get("continuation");
    const continuation = buildDevelopmentCatalogueSet().continuations.find((item) => item.id === continuationId) ?? null;
    if (!continuation) {
      return NextResponse.json({ error: "The fixture continuation is not available." }, { status: 404 });
    }
    return NextResponse.json({ continuation });
  }
  const requested = selectionFromQuery({
    archetype: url.searchParams.get("archetype") ?? undefined,
    candidate: url.searchParams.get("candidate") ?? undefined,
  });
  if (!("selection" in requested)) {
    const error = "error" in requested ? requested.error : "The stored selection is not a Skill 2 candidate.";
    return NextResponse.json({ error }, { status: 400 });
  }

  const preview = url.searchParams.get("preview") === "1";
  if (url.searchParams.get("cache") === "1") {
    const set = preview
      ? peekProvisionalContinuations(requested.selection)
      : peekVerifiedContinuations(requested.selection) ?? peekNaturalContinuations(requested.selection);
    if (!set || (preview && set.origin !== "provisional")) {
      return NextResponse.json({ error: "The continuation bundle is not loaded." }, { status: 404 });
    }
    const continuationId = url.searchParams.get("continuation");
    if (!continuationId) return NextResponse.json(continuationBundle(set));
    const continuation = set.continuations.find((item) => item.id === continuationId) ?? null;
    if (!continuation) {
      return NextResponse.json({ error: "The continuation bundle is not loaded." }, { status: 404 });
    }
    return NextResponse.json({ continuation });
  }

  try {
    const set: NaturalContinuationSet = preview
      ? loadProvisionalContinuations(requested.selection)
      : loadVerifiedContinuations(requested.selection);
    return NextResponse.json(continuationBundle(set));
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The selected candidate could not be reconstructed.";
    return NextResponse.json({ error }, { status: 422 });
  }
}

function solidified(request: Request) {
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
  const catalogue = listSolidifiedCatalogue(archetypeId, candidateId);
  if (catalogue.length === 0) {
    return NextResponse.json({ error: "No solidified continuations are stored for this candidate." }, { status: 404 });
  }
  const first = catalogue[0];
  return NextResponse.json({
    source: "carved-mass-solidified",
    contract: "carved-mass-solidified-v1",
    typologyId: first.typologyId,
    archetypeId: first.archetypeId,
    archetypeName: first.archetypeName,
    candidateId: first.candidateId,
    continuations: catalogue,
  });
}

function dataset(request: Request) {
  const url = new URL(request.url);
  const archetypeId = url.searchParams.get("archetype");
  const candidate = Number(url.searchParams.get("candidate"));
  const generate = url.searchParams.get("generate") === "1";
  try {
    if (!archetypeId) {
      try {
        const manifest = readCarvedMassManifest();
        return NextResponse.json({ sources: CARVED_MASS_SOURCES, manifest });
      } catch {
        return NextResponse.json({ sources: CARVED_MASS_SOURCES, manifest: { blur: 0.24, modules: [] } });
      }
    }
    if (!Number.isInteger(candidate)) {
      return NextResponse.json({ error: "candidate is required" }, { status: 422 });
    }
    if (generate) {
      const report = generateCarvedMassArchetype(archetypeId, candidate);
      return NextResponse.json({ report });
    }
    let records;
    try {
      records = readArchetypeRecords(archetypeId, candidate);
    } catch {
      return NextResponse.json({
        archetypeId,
        candidateId: candidate,
        entries: Array.from({ length: 24 }, (_, index) => {
          const continuationId = `N${String(index + 1).padStart(2, "0")}`;
          return {
            continuationId,
            moduleId: `carved-mass:${archetypeId}:${candidate}:${continuationId}`,
            continuationSeed: 0,
            z0Iteration: 0,
            parentChecksum: "",
            solidFraction: 0,
            components: 0,
            openingSize: 0,
            centroid: [0, 0, 0],
            wall: [0, 0, 0],
            flags: [],
            mesh: null,
          };
        }),
      });
    }
    const publish = process.env.VERCEL === "1";
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
        mesh: publish ? null : record.geometry,
      })),
    });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The carved-mass dataset could not be read.";
    return NextResponse.json({ error }, { status: 422 });
  }
}
