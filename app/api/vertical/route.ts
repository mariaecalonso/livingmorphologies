import { NextResponse } from "next/server";
import { peekNaturalContinuations, type NaturalContinuationSet } from "@/lib/skill3/continuations";
import { loadVerifiedContinuations } from "@/lib/skill3/semantic-handoff";
import { buildDevelopmentCatalogueSet } from "@/lib/skill3/fixture";
import { loadProvisionalContinuations, peekProvisionalContinuations } from "@/lib/skill3/provisional-replay";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Viewer plates for the current vertical page. Meshes stay lazy on the client. */
export function GET(request: Request) {
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
    const set = preview ? peekProvisionalContinuations(requested.selection) : peekNaturalContinuations(requested.selection);
    const continuationId = url.searchParams.get("continuation");
    const continuation = set?.continuations.find((item) => item.id === continuationId) ?? null;
    if (!set || !continuation || (preview && set.origin !== "provisional")) {
      return NextResponse.json({ error: "The continuation bundle is not loaded." }, { status: 404 });
    }
    return NextResponse.json({ continuation });
  }

  try {
    const set: NaturalContinuationSet = preview
      ? loadProvisionalContinuations(requested.selection)
      : loadVerifiedContinuations(requested.selection);
    const { continuations, ...source } = set;
    return NextResponse.json({
      ...source,
      continuations: continuations.map((continuation) => {
        const { field: _field, ...meta } = continuation;
        return meta;
      }),
      fields: continuations.map((continuation) => continuation.field),
    });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The selected candidate could not be reconstructed.";
    return NextResponse.json({ error }, { status: 422 });
  }
}
