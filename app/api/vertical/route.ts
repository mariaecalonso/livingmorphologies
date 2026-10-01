import { NextResponse } from "next/server";
import { selectionFromQuery } from "@/lib/skill3/selection";
import { loadVerticalViewerBundle } from "@/lib/skill3/viewer-field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same viewer bundle as the vertical page. The page paints first; this request reconstructs. */
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
    const bundle = loadVerticalViewerBundle(requested.selection);
    return NextResponse.json({ fields: bundle.futures.map((future) => future.field) });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The selected candidate could not be reconstructed.";
    return NextResponse.json({ error }, { status: 422 });
  }
}
