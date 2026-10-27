import type { CatalogEntry } from "./catalog";

const FILED_FINAL_CATALOG = "/skill4/SKILL04-FINAL-CATALOG.json";

let filedRequest: Promise<CatalogEntry[]> | null = null;

function isCatalogEntry(entry: unknown): entry is CatalogEntry {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as CatalogEntry;
  return typeof record.id === "string" && Array.isArray(record.tiles) && Array.isArray(record.connections);
}

/** The published final catalog. Fetched once per page; a failed load is retried on the next call. */
export function loadFiledFinalCatalog(): Promise<CatalogEntry[]> {
  if (filedRequest) return filedRequest;
  const request = fetch(FILED_FINAL_CATALOG)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Final catalog returned ${response.status}`);
      const rows: unknown = await response.json();
      return Array.isArray(rows) ? rows.filter(isCatalogEntry) : [];
    })
    .catch(() => {
      filedRequest = null;
      return [];
    });
  filedRequest = request;
  return request;
}

/** Filed results first, then results saved in this browser. Hidden ids are left out. */
export function mergeFinalCatalog(filed: readonly CatalogEntry[], saved: readonly CatalogEntry[], hidden: readonly string[]): CatalogEntry[] {
  const hiddenIds = new Set(hidden);
  const shown = filed.filter((entry) => !hiddenIds.has(entry.id));
  const ids = new Set(shown.map((entry) => entry.id));
  return [...shown, ...saved.filter((entry) => !ids.has(entry.id) && !hiddenIds.has(entry.id))];
}
