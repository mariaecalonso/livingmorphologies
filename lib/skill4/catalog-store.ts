import { SKILL4_CATALOG_KEY, type CatalogEntry } from "./catalog";

const listeners = new Set<() => void>();
let cache: CatalogEntry[] | null = null;

function parse(raw: string): CatalogEntry[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is CatalogEntry => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as CatalogEntry;
    return typeof record.id === "string" && Array.isArray(record.tiles) && Array.isArray(record.connections);
  });
}

export function readCatalog(): CatalogEntry[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    cache = parse(window.localStorage.getItem(SKILL4_CATALOG_KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache;
}

export function writeCatalog(entries: CatalogEntry[]) {
  cache = entries;
  window.localStorage.setItem(SKILL4_CATALOG_KEY, JSON.stringify(entries));
  listeners.forEach((listener) => listener());
}

export function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function catalogServerSnapshot(): CatalogEntry[] {
  return [];
}
