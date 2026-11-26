import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Grid weld for catalog thumbnails. The stored hybrid is unchanged. */
const CELL = 0.85;

type PackedMesh = {
  triangles: number;
  positions: string;
  normals: string;
  indices: string;
};

export type HybridThumbConnection = {
  id: string;
  validatedHybrid: PackedMesh | null;
};

const ROOT = path.join(process.cwd(), "data", "skill4");
const MESHES = path.join(ROOT, "final-clusters");
const THUMBS = path.join(ROOT, "final-cluster-thumbs");

function meshFile(pairId: string, id: string) {
  return path.join(MESHES, pairId, `${id.replaceAll(":", "__")}.json`);
}

function thumbFile(pairId: string, id: string) {
  return path.join(THUMBS, pairId, `${id.replaceAll(":", "__")}.json`);
}

function bytesOf(view: ArrayBufferView) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function floatsFrom(encoded: string) {
  const bytes = bytesOf(Buffer.from(encoded, "base64"));
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function intsFrom(encoded: string) {
  const bytes = bytesOf(Buffer.from(encoded, "base64"));
  return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function pack(view: ArrayBufferView) {
  return bytesOf(view).toString("base64");
}

function weld(packed: PackedMesh): PackedMesh | null {
  if (!packed || packed.triangles < 1 || !packed.positions || !packed.indices) return null;
  const positions = floatsFrom(packed.positions);
  const indices = intsFrom(packed.indices);
  const count = positions.length / 3;
  const buckets = new Map<string, number>();
  const remap = new Int32Array(count);
  const sums: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = positions[index * 3];
    const y = positions[index * 3 + 1];
    const z = positions[index * 3 + 2];
    const key = `${Math.round(x / CELL)},${Math.round(y / CELL)},${Math.round(z / CELL)}`;
    let id = buckets.get(key);
    if (id === undefined) {
      id = sums.length / 4;
      buckets.set(key, id);
      sums.push(x, y, z, 1);
    } else {
      sums[id * 4] += x;
      sums[id * 4 + 1] += y;
      sums[id * 4 + 2] += z;
      sums[id * 4 + 3] += 1;
    }
    remap[index] = id;
  }
  const vertexCount = sums.length / 4;
  const welded = new Float32Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index += 1) {
    const weight = sums[index * 4 + 3] || 1;
    welded[index * 3] = sums[index * 4] / weight;
    welded[index * 3 + 1] = sums[index * 4 + 1] / weight;
    welded[index * 3 + 2] = sums[index * 4 + 2] / weight;
  }
  const corners: number[] = [];
  const seen = new Set<string>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = remap[indices[triangle]];
    const b = remap[indices[triangle + 1]];
    const c = remap[indices[triangle + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((left, right) => left - right).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    corners.push(a, b, c);
  }
  if (corners.length < 3) return null;
  const normals = new Float32Array(vertexCount * 3);
  for (let triangle = 0; triangle < corners.length; triangle += 3) {
    const a = corners[triangle];
    const b = corners[triangle + 1];
    const c = corners[triangle + 2];
    const abx = welded[b * 3] - welded[a * 3];
    const aby = welded[b * 3 + 1] - welded[a * 3 + 1];
    const abz = welded[b * 3 + 2] - welded[a * 3 + 2];
    const acx = welded[c * 3] - welded[a * 3];
    const acy = welded[c * 3 + 1] - welded[a * 3 + 1];
    const acz = welded[c * 3 + 2] - welded[a * 3 + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a * 3] += nx;
    normals[a * 3 + 1] += ny;
    normals[a * 3 + 2] += nz;
    normals[b * 3] += nx;
    normals[b * 3 + 1] += ny;
    normals[b * 3 + 2] += nz;
    normals[c * 3] += nx;
    normals[c * 3 + 1] += ny;
    normals[c * 3 + 2] += nz;
  }
  for (let index = 0; index < vertexCount; index += 1) {
    const nx = normals[index * 3];
    const ny = normals[index * 3 + 1];
    const nz = normals[index * 3 + 2];
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[index * 3] = nx / length;
    normals[index * 3 + 1] = ny / length;
    normals[index * 3 + 2] = nz / length;
  }
  const indexView = new Uint32Array(corners);
  return {
    triangles: corners.length / 3,
    positions: pack(welded),
    normals: pack(normals),
    indices: pack(indexView),
  };
}

export function readHybridThumb(pairId: string, id: string): HybridThumbConnection[] | null {
  const source = meshFile(pairId, id);
  if (!existsSync(source)) return null;
  const sourceMtimeMs = statSync(source).mtimeMs;
  const cached = thumbFile(pairId, id);
  if (existsSync(cached)) {
    try {
      const stored = JSON.parse(readFileSync(cached, "utf8")) as {
        sourceMtimeMs?: number;
        connections?: HybridThumbConnection[];
      };
      if (stored.sourceMtimeMs === sourceMtimeMs && stored.connections) return stored.connections;
    } catch {
      // The preview is rebuilt from the stored cluster below.
    }
  }
  const body = JSON.parse(readFileSync(source, "utf8")) as {
    connections?: { id: string; validatedHybrid: PackedMesh | null }[];
  };
  const connections = (body.connections ?? []).map((connection) => ({
    id: connection.id,
    validatedHybrid: connection.validatedHybrid ? weld(connection.validatedHybrid) : null,
  }));
  mkdirSync(path.dirname(cached), { recursive: true });
  writeFileSync(cached, JSON.stringify({ sourceMtimeMs, connections }));
  return connections;
}

function writeAll() {
  if (!existsSync(MESHES)) return;
  let written = 0;
  for (const pairId of readdirSync(MESHES)) {
    const dir = path.join(MESHES, pairId);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.replace(/\.json$/, "").replaceAll("__", ":");
      const started = Date.now();
      const connections = readHybridThumb(pairId, id);
      written += 1;
      const triangles = (connections ?? []).reduce((sum, connection) => sum + (connection.validatedHybrid?.triangles ?? 0), 0);
      console.log(`${written} ${id} ${triangles} tris ${Date.now() - started}ms`);
    }
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("lib/skill4/hybrid-thumb-mesh.ts")) {
  writeAll();
}
