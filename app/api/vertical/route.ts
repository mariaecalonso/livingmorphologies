import { NextResponse } from "next/server";
import { loadNaturalContinuations, peekNaturalContinuations } from "@/lib/skill3/continuations";
import { buildDevelopmentCatalogueSet } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (url.searchParams.get("cache") === "1") {
    const set = peekNaturalContinuations(requested.selection);
    const continuationId = url.searchParams.get("continuation");
    const continuation = set?.continuations.find((item) => item.id === continuationId) ?? null;
    if (!set || !continuation) {
      return NextResponse.json({ error: "The continuation bundle is not loaded." }, { status: 404 });
    }
    return NextResponse.json({ continuation });
  }

  try {
    const set = loadNaturalContinuations(requested.selection);
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
