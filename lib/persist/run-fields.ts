/** Permanent per-archetype trail fields. Written twice so a catalog can be rebuilt if one store fails. */

import type { FieldSnapshot } from "@/lib/skill1/types";
import { getSessionValue, packSnapshot, putSessionValue, unpackSnapshot } from "@/lib/persist/session";

const DB_NAME = "living-morphologies-run-fields";
const STORE = "fields";
const DB_VERSION = 1;

function fieldKey(archetypeId: string, index: number) {
  return `${archetypeId}:${index}`;
}

function sessionKey(archetypeId: string, index: number) {
  return `af:${archetypeId}:${index}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveArchetypeField(archetypeId: string, index: number, snapshot: FieldSnapshot) {
  const packed = packSnapshot(snapshot);
  const db = await openDb();
  let ok = false;
  if (db) {
    ok = await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(packed, fieldKey(archetypeId, index));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
  const backup = await putSessionValue(sessionKey(archetypeId, index), packed);
  return ok || backup;
}

export async function loadArchetypeFields(archetypeId: string, count = 100) {
  const snapshots: Array<FieldSnapshot | null> = Array.from({ length: count }, () => null);
  const db = await openDb();
  await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      let packed: ReturnType<typeof packSnapshot> | null = null;
      if (db) {
        packed = await new Promise((resolve) => {
          const tx = db.transaction(STORE, "readonly");
          const request = tx.objectStore(STORE).get(fieldKey(archetypeId, index));
          request.onsuccess = () => resolve((request.result as ReturnType<typeof packSnapshot>) ?? null);
          request.onerror = () => resolve(null);
        });
      }
      if (!packed) packed = await getSessionValue<ReturnType<typeof packSnapshot>>(sessionKey(archetypeId, index));
      if (packed) snapshots[index] = unpackSnapshot(packed);
    }),
  );
  return snapshots;
}

export async function countArchetypeFields(archetypeId: string, count = 100) {
  const prefix = `${archetypeId}:`;
  const db = await openDb();
  if (db) {
    const keys = await new Promise<IDBValidKey[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    });
    const n = keys.filter((key) => String(key).startsWith(prefix)).length;
    if (n) return n;
  }
  const fields = await loadArchetypeFields(archetypeId, count);
  return fields.reduce((sum, item) => sum + (item ? 1 : 0), 0);
}

export async function listArchetypeFieldCounts(archetypeIds: string[], count = 100) {
  const counts: Record<string, number> = {};
  await Promise.all(
    archetypeIds.map(async (id) => {
      counts[id] = await countArchetypeFields(id, count);
    }),
  );
  return counts;
}
