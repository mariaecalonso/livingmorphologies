/** Per-archetype run catalog. Metadata and PNG blobs are stored as separate IndexedDB rows. */

export const CATALOG_KEY = (archetypeId: string) => `lm-run-catalog:${archetypeId}`;

const DB_NAME = "living-morphologies-run-catalog";
const BLOB_STORE = "catalogs";
const ENTRY_STORE = "entries";
const IMAGE_STORE = "images";
const DB_VERSION = 3;

type CatalogEntry = { id: string; archetypeId: string; run: number; seed: number; image?: string };

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        const store = db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
        store.createIndex("archetypeId", "archetypeId", { unique: false });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function localEntries<T>(archetypeId: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY(archetypeId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mergeByRun<T extends CatalogEntry>(entries: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of entries) {
    if (!item || typeof item.run !== "number" || !item.id) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.run - b.run);
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith("data:")) return null;
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const header = dataUrl.slice(0, comma);
    const data = dataUrl.slice(comma + 1);
    const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/png";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function requestAll<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

async function readBlobStore<T>(db: IDBDatabase, archetypeId: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(BLOB_STORE)) return [];
  const tx = db.transaction(BLOB_STORE, "readonly");
  const store = tx.objectStore(BLOB_STORE);
  const direct = await requestAll(store.get(archetypeId));
  if (Array.isArray(direct)) return direct as T[];
  const keys = (await requestAll(store.getAllKeys())) ?? [];
  const matched = keys.filter((key) => String(key) === archetypeId || String(key).includes(archetypeId));
  const found: T[] = [];
  for (const key of matched) {
    const value = await requestAll(store.get(key));
    if (Array.isArray(value)) found.push(...(value as T[]));
  }
  return found;
}

async function readEntryRows<T extends CatalogEntry>(db: IDBDatabase, archetypeId: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(ENTRY_STORE)) return [];
  const tx = db.transaction(ENTRY_STORE, "readonly");
  const store = tx.objectStore(ENTRY_STORE);
  if (store.indexNames.contains("archetypeId")) {
    const indexed = await requestAll(store.index("archetypeId").getAll(archetypeId));
    if (Array.isArray(indexed) && indexed.length) return indexed as T[];
  }
  const all = (await requestAll(store.getAll())) ?? [];
  return (all as T[]).filter((item) => item?.archetypeId === archetypeId);
}

async function attachImages<T extends CatalogEntry>(db: IDBDatabase, entries: T[]): Promise<T[]> {
  if (!entries.length || !db.objectStoreNames.contains(IMAGE_STORE)) return entries;
  const tx = db.transaction(IMAGE_STORE, "readonly");
  const store = tx.objectStore(IMAGE_STORE);
  const next: T[] = [];
  for (const item of entries) {
    if (item.image) {
      next.push(item);
      continue;
    }
    const blob = await requestAll(store.get(item.id));
    next.push(blob instanceof Blob ? { ...item, image: URL.createObjectURL(blob) } : item);
  }
  return next;
}

async function writeEntryRows<T extends CatalogEntry>(db: IDBDatabase, incoming: T[], staleIds: string[] = []): Promise<boolean> {
  const stores = [ENTRY_STORE, IMAGE_STORE].filter((name) => db.objectStoreNames.contains(name));
  if (!stores.includes(ENTRY_STORE)) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(stores, "readwrite");
    const entries = tx.objectStore(ENTRY_STORE);
    const images = stores.includes(IMAGE_STORE) ? tx.objectStore(IMAGE_STORE) : null;
    for (const id of staleIds) {
      entries.delete(id);
      images?.delete(id);
    }
    for (const item of incoming) {
      const blob = item.image ? dataUrlToBlob(item.image) : null;
      const { image: _image, ...meta } = item;
      entries.put(blob ? meta : item);
      if (blob) images?.put(blob, item.id);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function readCatalog<T extends CatalogEntry>(archetypeId: string): Promise<T[]> {
  const db = await openDb();
  const fromEntries = db ? await attachImages(db, await readEntryRows<T>(db, archetypeId)) : [];
  const fromBlob = db ? await readBlobStore<T>(db, archetypeId) : [];
  const fromLocal = localEntries<T>(archetypeId);
  return mergeByRun([...fromLocal, ...fromBlob, ...fromEntries]);
}

export async function writeCatalog<T extends CatalogEntry>(archetypeId: string, entries: T[]): Promise<boolean> {
  const merged = mergeByRun(entries);
  const db = await openDb();
  if (db) {
    const existing = await readEntryRows<T>(db, archetypeId);
    const keep = new Set(merged.map((item) => item.id));
    const stale = existing.filter((item) => !keep.has(item.id)).map((item) => item.id);
    if (await writeEntryRows(db, merged, stale)) {
      try {
        window.localStorage.removeItem(CATALOG_KEY(archetypeId));
      } catch {
        /* quota leftovers are fine */
      }
      return true;
    }
  }
  try {
    window.localStorage.setItem(CATALOG_KEY(archetypeId), JSON.stringify(merged));
    return true;
  } catch {
    return false;
  }
}

export async function putCatalogEntries<T extends CatalogEntry>(archetypeId: string, incoming: T[]): Promise<boolean> {
  if (!incoming.length) return true;
  const db = await openDb();
  if (db && (await writeEntryRows(db, incoming))) return true;
  try {
    const existing = localEntries<T>(archetypeId);
    const byId = new Map(existing.map((item) => [item.id, item]));
    for (const item of incoming) byId.set(item.id, item);
    window.localStorage.setItem(CATALOG_KEY(archetypeId), JSON.stringify([...byId.values()]));
    return true;
  } catch {
    return false;
  }
}

export async function listCatalogCounts(archetypeIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    archetypeIds.map(async (id) => {
      counts[id] = (await readCatalog(id)).length;
    }),
  );
  return counts;
}
