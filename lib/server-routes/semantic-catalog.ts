import { NextResponse } from "next/server";
import { loadFilamentCalibration } from "@/lib/skill2/filament";
import { readPublishedInk } from "@/lib/skill2/filament-catalog";
import { catalogHandoff, readCatalogObserved, readCatalogSelection, snapshotMatchesSelection } from "@/lib/skill2/read-published-selection";
import { persistCatalogZ0 } from "@/lib/skill2/semantic/persist-published-z0";
import { loadVerifiedZ0 } from "@/lib/skill2/semantic/z0-snapshot";

export function semanticCatalogGet(_request: Request, path: string[]) {
  if (path.length === 3 && path[2] === "selection") return selectionGet(path[0], path[1]);
  if (path.length === 2) return drawing(path[0], path[1]);
  return new NextResponse(null, { status: 404 });
}

export function semanticCatalogPost(_request: Request, path: string[]) {
  if (path.length === 3 && path[2] === "selection") return selectionPost(path[0], path[1]);
  return new NextResponse(null, { status: 404 });
}

function drawing(archetype: string, id: string) {
  const bytes = readPublishedInk(archetype, id, loadFilamentCalibration(archetype));
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
  });
}

function selectionGet(archetype: string, id: string) {
  const candidateId = Number(id);
  const selection = readCatalogSelection(archetype, candidateId);
  if (!selection) return NextResponse.json({ selection: null, handoff: "pending", observed: {} }, { status: 404 });
  return NextResponse.json({
    selection,
    handoff: catalogHandoff(archetype, candidateId),
    observed: readCatalogObserved(archetype, candidateId),
  });
}

function selectionPost(archetype: string, id: string) {
  const candidateId = Number(id);
  const selection = readCatalogSelection(archetype, candidateId);
  if (!selection) return NextResponse.json({ selection: null, handoff: "pending" }, { status: 404 });
  try {
    if (catalogHandoff(archetype, candidateId) !== "verified") persistCatalogZ0(archetype, candidateId);
    const verified = loadVerifiedZ0(archetype, candidateId);
    if (!verified || !snapshotMatchesSelection(verified.meta, selection)) {
      return NextResponse.json({ selection, handoff: "pending", error: "Verified Z0 was not readable." }, { status: 422 });
    }
    return NextResponse.json({ selection, handoff: "verified", checksum: verified.meta.validation.checksum });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "The Z0 could not be verified.";
    return NextResponse.json({ selection, handoff: "pending", error }, { status: 422 });
  }
}
