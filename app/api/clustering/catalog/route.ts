import { getCatalog, type CatalogArchiveEntry } from "@/lib/skill6/catalog";
import { displaySizeOfCount } from "@/lib/skill6/contract";
import { CLUSTERING_EXPANSION, CLUSTERING_FIVE_TILE, CLUSTERING_GRAPH_BUDGET, CLUSTERING_OVERNIGHT, CLUSTERING_RULE_LARGE, INITIAL_CLUSTERING_COVERAGE, INITIAL_CLUSTERING_LAB, ORGANIZATION_EXPERIMENT, readExperimentReport, SMALL_GROUND_EXPERIMENT, SMALL_GROUND_V2 } from "@/lib/skill6/experiment-catalog";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const collection = new URL(request.url).searchParams.get("collection");
  const catalog = await getCatalog();
  if (!collection) return NextResponse.json(catalog);
  if (collection !== SMALL_GROUND_EXPERIMENT && collection !== SMALL_GROUND_V2 && collection !== ORGANIZATION_EXPERIMENT && collection !== INITIAL_CLUSTERING_LAB && collection !== INITIAL_CLUSTERING_COVERAGE && collection !== CLUSTERING_EXPANSION && collection !== CLUSTERING_FIVE_TILE && collection !== CLUSTERING_OVERNIGHT && collection !== CLUSTERING_GRAPH_BUDGET && collection !== CLUSTERING_RULE_LARGE) return NextResponse.json({ error: "Unknown collection." }, { status: 404 });
  const report = readExperimentReport(collection);
  if (!report) return NextResponse.json({ error: "That experiment collection has not been written." }, { status: 404 });
  const archive: CatalogArchiveEntry[] = report.diagnostics.map((entry) => ({
    id: entry.id,
    store: "assembled-index",
    algorithm: "rule-based-envelope-v2.1",
    status: entry.status,
    tiles: entry.tiles,
    size: displaySizeOfCount(entry.tiles) ?? "small",
    reason: entry.reason,
  }));
  return NextResponse.json({
    ...catalog,
    clusters: report.records ?? report.validated,
    archive,
    validation: report.validation,
    note: report.note,
    provisional: report.provisional ?? [],
    rows: report.rows ?? [],
  });
}
