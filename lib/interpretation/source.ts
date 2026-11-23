import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { InterpretationSource } from "./types";

const INDEX = path.join(process.cwd(), "data", "skill6", "assembled", "index.json");
const VALIDATION = path.join(process.cwd(), "data", "skill6", "assembled", "validation.json");

type StoredRecord = {
  id: string;
  status: string;
  tiles: unknown[];
  assembly?: {
    seatedTiles?: { instanceId: string; pose: { translation: [number, number, number] } }[];
    refined?: { status?: string; components?: number | null; volume?: number | null; triangles?: number };
    meshFile?: string;
  };
};

export type FinalCluster = InterpretationSource & {
  positions: Float32Array;
  indices: Uint32Array;
  seats: { instanceId: string; x: number; y: number }[];
};

type Cache = { mtimeMs: number; cluster: FinalCluster };

let cache: Cache | null = null;

function decode(value: string, width: 4 | 1) {
  const raw = Buffer.from(value, "base64");
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return width === 4 ? new Float32Array(copy.buffer) : new Uint32Array(copy.buffer);
}

function validationNote(id: string): string | null {
  if (!existsSync(VALIDATION)) return null;
  const readings = JSON.parse(readFileSync(VALIDATION, "utf8")) as {
    clusters?: Record<string, { refined?: { penetrations?: number; maxPenetration?: number } }>;
  };
  const refined = readings.clusters?.[id]?.refined;
  if (!refined || refined.penetrations == null || refined.maxPenetration == null) return null;
  if (refined.penetrations < 1 || refined.maxPenetration <= 0.02) return null;
  return `The catalog archives this mesh: ${refined.penetrations} penetration${refined.penetrations === 1 ? "" : "s"}, deepest ${refined.maxPenetration.toFixed(4)}, above the 0.02 graze limit. The stored file is not modified.`;
}

/** The accepted assembly with the most tiles and a refined mesh on disk. Reads the file. Does not write it. */
export function loadFinalCluster(): FinalCluster {
  const mtimeMs = existsSync(INDEX) ? statSync(INDEX).mtimeMs : 0;
  if (cache && cache.mtimeMs === mtimeMs) return cache.cluster;
  if (!existsSync(INDEX)) throw new Error("No assembled cluster index is stored.");
  const report = JSON.parse(readFileSync(INDEX, "utf8")) as { clusters?: StoredRecord[] };
  const candidates = (report.clusters ?? []).filter((record) => {
    const refined = record.assembly?.refined;
    const file = record.assembly?.meshFile;
    return record.status === "accepted" && refined?.status === "NoError" && refined.components === 1 && file && existsSync(path.join(process.cwd(), file));
  });
  candidates.sort((left, right) => right.tiles.length - left.tiles.length || (right.assembly?.refined?.volume ?? 0) - (left.assembly?.refined?.volume ?? 0));
  const record = candidates[0];
  if (!record?.assembly?.meshFile) throw new Error("No accepted refined cluster is stored.");
  const stored = JSON.parse(readFileSync(path.join(process.cwd(), record.assembly.meshFile), "utf8")) as {
    refined?: { positions?: string; indices?: string };
  };
  if (!stored.refined?.positions || !stored.refined.indices) throw new Error("The refined cluster mesh is missing.");
  const positions = decode(stored.refined.positions, 4) as Float32Array;
  const indices = decode(stored.refined.indices, 1) as Uint32Array;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  const cluster: FinalCluster = {
    id: record.id,
    meshFile: record.assembly.meshFile,
    tiles: record.tiles.length,
    volume: record.assembly.refined?.volume ?? 0,
    triangles: record.assembly.refined?.triangles ?? indices.length / 3,
    bounds: { min, max },
    validation: validationNote(record.id),
    positions,
    indices,
    seats: (record.assembly.seatedTiles ?? []).map((tile) => ({
      instanceId: tile.instanceId,
      x: tile.pose.translation[0],
      y: tile.pose.translation[1],
    })),
  };
  cache = { mtimeMs, cluster };
  return cluster;
}
