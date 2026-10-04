import { NextResponse } from "next/server";
import { loadNaturalContinuations } from "@/lib/skill3/continuations";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Viewer plates for the current vertical page. Meshes stay lazy on the client. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const requested = selectionFromQuery({
    archetype: url.searchParams.get("archetype") ?? undefined,
    candidate: url.searchParams.get("candidate") ?? undefined,
  });
  if (!("selection" in requested)) {
    const error = "error" in requested ? requested.error : "The stored selection is not a Skill 2 candidate.";
    return NextResponse.json({ error }, { status: 400 });
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
