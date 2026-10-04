/** Survives closing the app. Catalog images stay in run-catalog IDB; this holds board + run progress. */

import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { FieldAttractor, FieldSnapshot, SimulationState, VizSettings } from "@/lib/skill1/types";
import type { RatingsMap, TypologyId } from "@/lib/types";

const DB_NAME = "living-morphologies-session";
const STORE = "kv";
const DB_VERSION = 1;

export type BoardSession = {
  typologyId: TypologyId;
  archetypeId: string;
  ratings: RatingsMap;
  iteration: number;
  run: number;
  saved: number;
  slime: SlimeControls | null;
  attractors: FieldAttractor[] | null;
  viz: VizSettings;
  targetIterations: number;
  displayMode: "desktop" | "presentation";
  carveThreshold: number;
  showAttractors: boolean;
  selectedAttractors: number[];
  catalogOpen: boolean;
};

export type RunsSession = {
  pickedId: string | null;
  runningId: string | null;
  completed: number;
  allQueue: boolean;
  allDone: boolean;
  running: boolean;
  paused: boolean;
};

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

export async function putSessionValue(key: string, value: unknown) {
  return put(key, value);
}

export async function getSessionValue<T>(key: string) {
  return get<T>(key);
}

async function put(key: string, value: unknown) {
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function get<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function del(key: string) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function packSnapshot(snapshot: FieldSnapshot) {
  const trails = new Float32Array(snapshot.trails.length);
  for (let i = 0; i < snapshot.trails.length; i += 1) trails[i] = snapshot.trails[i];
  return {
    iteration: snapshot.iteration,
    size: snapshot.size,
    trailSize: snapshot.trailSize,
    source: snapshot.source,
    attractor: snapshot.attractor,
    trails: trails.buffer,
  };
}

export function unpackSnapshot(packed: {
  iteration: number;
  size: number;
  trailSize: number;
  source: { x: number; y: number };
  attractor: { x: number; y: number };
  trails: ArrayBuffer;
}): FieldSnapshot {
  return {
    iteration: packed.iteration,
    size: packed.size,
    trailSize: packed.trailSize,
    source: packed.source,
    attractor: packed.attractor,
    trails: Array.from(new Float32Array(packed.trails)),
    occupancy: [],
    agents: [],
    paths: [],
  };
}

export function simulationFromSnapshot(snapshot: FieldSnapshot): SimulationState {
  return {
    size: snapshot.size,
    trailSize: snapshot.trailSize,
    iteration: snapshot.iteration,
    maxIterations: snapshot.iteration,
    converged: true,
    streak: 0,
    totalDelta: 0,
    seed: 0,
    source: snapshot.source,
    attractor: snapshot.attractor,
    attraction: [],
    permeabilityField: [],
    occupancy: snapshot.occupancy ?? [],
    trails: snapshot.trails,
    flow: [],
    agents: [],
  };
}

export async function saveBoardSession(session: BoardSession, snapshot: FieldSnapshot | null) {
  await put("board", session);
  if (snapshot) await put("board-field", packSnapshot(snapshot));
  else await del("board-field");
}

export async function loadBoardSession() {
  const session = await get<BoardSession>("board");
  const packed = await get<ReturnType<typeof packSnapshot>>("board-field");
  return {
    session,
    snapshot: packed ? unpackSnapshot(packed) : null,
  };
}

export async function saveRunsMeta(session: RunsSession) {
  await put("runs", session);
  try {
    if (session.allDone) {
      window.localStorage.setItem("lm-run-all-done", "1");
      window.localStorage.removeItem("lm-run-all-queue");
      window.localStorage.removeItem("lm-run-all-next");
    } else {
      window.localStorage.removeItem("lm-run-all-done");
      window.localStorage.setItem("lm-run-all-queue", session.allQueue ? "1" : "0");
      if (session.runningId || session.pickedId) {
        window.localStorage.setItem("lm-run-all-next", session.runningId ?? session.pickedId ?? "");
      }
    }
  } catch {
    /* ignore */
  }
}

export function readAllDoneFlag() {
  try {
    return window.localStorage.getItem("lm-run-all-done") === "1";
  } catch {
    return false;
  }
}

export function clearAllDoneFlag() {
  try {
    window.localStorage.removeItem("lm-run-all-done");
  } catch {
    /* ignore */
  }
}

export async function saveCatalogIndex(counts: Record<string, number>) {
  await put("catalog-index", { savedAt: Date.now(), counts });
}

export async function saveRunSnapshot(index: number, snapshot: FieldSnapshot) {
  await put(`run-field:${index}`, packSnapshot(snapshot));
}

export async function loadRunsSession() {
  const session = await get<RunsSession>("runs");
  const snapshots: Array<FieldSnapshot | null> = Array.from({ length: 100 }, () => null);
  if (session && session.completed > 0) {
    await Promise.all(
      Array.from({ length: session.completed }, async (_, index) => {
        const packed = await get<ReturnType<typeof packSnapshot>>(`run-field:${index}`);
        if (packed) snapshots[index] = unpackSnapshot(packed);
      }),
    );
  }
  return { session, snapshots };
}

export async function clearRunFields() {
  await Promise.all(Array.from({ length: 100 }, (_, index) => del(`run-field:${index}`)));
}
