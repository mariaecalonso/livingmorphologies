import type { NetworkIteration, NetworkNode } from "./site-network";

const DB_NAME = "living-morphologies";
const STORE = "site-network-iterations";

type StoredIteration = Omit<NetworkIteration, "trails"> & {
  trails: ArrayBuffer;
};

function openArchive() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function asNodes(value: unknown): NetworkNode[] {
  if (!Array.isArray(value)) return [];
  const nodes: NetworkNode[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<NetworkNode>;
    if (record.kind !== "source" && record.kind !== "attractor") continue;
    if (typeof record.id !== "string" || typeof record.x !== "number" || typeof record.z !== "number") continue;
    nodes.push({ id: record.id, kind: record.kind, x: record.x, z: record.z });
  }
  return nodes;
}

function readTrails(value: unknown, inkSize: number): Float32Array | null {
  const count = inkSize * inkSize;
  if (value instanceof Float32Array && value.length === count) return new Float32Array(value);
  if (value instanceof ArrayBuffer && value.byteLength === count * 4) return new Float32Array(value);
  return null;
}

function readIteration(value: unknown): NetworkIteration | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredIteration>;
  if (typeof record.id !== "string" || typeof record.seed !== "number" || typeof record.inkSize !== "number") return null;
  if (typeof record.cellFeet !== "number" || !Number.isFinite(record.cellFeet) || record.cellFeet <= 0) return null;
  const trails = readTrails(record.trails, record.inkSize);
  if (!trails) return null;
  return {
    id: record.id,
    index: typeof record.index === "number" ? record.index : 0,
    seed: record.seed,
    nodes: asNodes(record.nodes),
    step: typeof record.step === "number" ? record.step : 0,
    settled: Boolean(record.settled),
    reached: typeof record.reached === "number" ? record.reached : 0,
    total: typeof record.total === "number" ? record.total : 0,
    reachedIds: Array.isArray(record.reachedIds) ? record.reachedIds.filter((item) => typeof item === "string") : [],
    connectedIds: Array.isArray(record.connectedIds) ? record.connectedIds.filter((item) => typeof item === "string") : [],
    note: typeof record.note === "string" ? record.note : null,
    trails,
    inkSize: record.inkSize,
    traversable: typeof record.traversable === "number" && Number.isFinite(record.traversable) ? record.traversable : undefined,
    cellFeet: record.cellFeet,
    generator: record.generator === "flow" || record.generator === "agents" ? record.generator : undefined,
    branches: readBranches(record.branches),
  };
}

function readBranches(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const branches: NonNullable<NetworkIteration["branches"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const edge = item as { x0?: unknown; z0?: unknown; x1?: unknown; z1?: unknown; conductivity?: unknown };
    const x0 = Number(edge.x0);
    const z0 = Number(edge.z0);
    const x1 = Number(edge.x1);
    const z1 = Number(edge.z1);
    const conductivity = Number(edge.conductivity);
    if (![x0, z0, x1, z1, conductivity].every(Number.isFinite)) continue;
    branches.push({ x0, z0, x1, z1, conductivity });
  }
  return branches.length > 0 ? branches : undefined;
}

export async function loadNetworkIterations(): Promise<NetworkIteration[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openArchive();
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });
    return rows
      .map((row) => readIteration(row))
      .filter((row): row is NetworkIteration => row !== null)
      .sort((a, b) => a.index - b.index);
  } finally {
    db.close();
  }
}

export async function saveNetworkIteration(iteration: NetworkIteration) {
  if (typeof indexedDB === "undefined") return;
  const db = await openArchive();
  try {
    const stored: StoredIteration = {
      ...iteration,
      nodes: iteration.nodes.map((node) => ({ ...node })),
      reachedIds: [...iteration.reachedIds],
      connectedIds: [...iteration.connectedIds],
      trails: iteration.trails.slice().buffer,
    };
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(stored);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteNetworkIteration(id: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openArchive();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearNetworkIterations() {
  if (typeof indexedDB === "undefined") return;
  const db = await openArchive();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
