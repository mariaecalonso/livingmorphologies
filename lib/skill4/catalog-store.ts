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

const FINAL_KEY = "lm-skill4-final-catalog";
const finalListeners = new Set<() => void>();
let finalCache: CatalogEntry[] | null = null;

export function readFinalCatalog(): CatalogEntry[] {
  if (finalCache) return finalCache;
  if (typeof window === "undefined") return [];
  try {
    finalCache = parse(window.localStorage.getItem(FINAL_KEY) ?? "[]");
  } catch {
    finalCache = [];
  }
  return finalCache;
}

export function writeFinalCatalog(entries: CatalogEntry[]) {
  finalCache = entries;
  window.localStorage.setItem(FINAL_KEY, JSON.stringify(entries));
  finalListeners.forEach((listener) => listener());
}

export function subscribeFinalCatalog(listener: () => void) {
  finalListeners.add(listener);
  return () => finalListeners.delete(listener);
}

export function finalCatalogServerSnapshot(): CatalogEntry[] {
  return [];
}

const HIDDEN_FINAL_KEY = "lm-skill4-final-hidden";
const hiddenListeners = new Set<() => void>();
let hiddenCache: string[] | null = null;

function readHiddenIds(): string[] {
  if (hiddenCache) return hiddenCache;
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_FINAL_KEY) ?? "[]") as unknown;
    hiddenCache = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    hiddenCache = [];
  }
  return hiddenCache;
}

export function readHiddenFinal(): string[] {
  return readHiddenIds();
}

export function hideFinalCatalog(id: string) {
  const next = readHiddenIds().includes(id) ? readHiddenIds() : [...readHiddenIds(), id];
  hiddenCache = next;
  window.localStorage.setItem(HIDDEN_FINAL_KEY, JSON.stringify(next));
  hiddenListeners.forEach((listener) => listener());
}

export function subscribeHiddenFinal(listener: () => void) {
  hiddenListeners.add(listener);
  return () => hiddenListeners.delete(listener);
}

export function hiddenFinalServerSnapshot(): string[] {
  return [];
}

/** Final catalog results chosen for import on the site. The filed catalog is read-only, so the choice is kept by id. */
const SELECTED_FINAL_KEY = "lm-skill4-final-selected";
const selectedListeners = new Set<() => void>();
let selectedCache: string[] | null = null;

export function readSelectedFinal(): string[] {
  if (selectedCache) return selectedCache;
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SELECTED_FINAL_KEY) ?? "[]") as unknown;
    selectedCache = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    selectedCache = [];
  }
  return selectedCache;
}

export function toggleSelectedFinal(id: string) {
  const current = readSelectedFinal();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  selectedCache = next;
  window.localStorage.setItem(SELECTED_FINAL_KEY, JSON.stringify(next));
  selectedListeners.forEach((listener) => listener());
}

export function subscribeSelectedFinal(listener: () => void) {
  selectedListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SELECTED_FINAL_KEY) return;
    selectedCache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    selectedListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function selectedFinalServerSnapshot(): string[] {
  return [];
}
