import type { IsoMesh } from "@/lib/scan/isomesh";

const CELL = 0.2;
const SAME = 0.08 * 0.08;

function cellKey(x: number, y: number, z: number) {
  return (Math.floor(x / CELL) + 512) * 1000000
    + (Math.floor(y / CELL) + 512) * 1000
    + (Math.floor(z / CELL) + 512);
}

/**
 * Triangles on the capped mesh that are not on the open surface.
 * The stored meshes are not changed. Vertices within 0.08 of an open vertex stay with the original surface.
 */
export function capAddition(open: IsoMesh, capped: IsoMesh): IsoMesh | null {
  const bins = new Map<number, number[]>();
  for (let index = 0; index < open.positions.length; index += 3) {
    const key = cellKey(open.positions[index], open.positions[index + 1], open.positions[index + 2]);
    const list = bins.get(key);
    if (list) list.push(index);
    else bins.set(key, [index]);
  }
  const added = new Uint8Array(capped.positions.length / 3);
  for (let vertex = 0; vertex < added.length; vertex += 1) {
    const index = vertex * 3;
    const x = capped.positions[index];
    const y = capped.positions[index + 1];
    const z = capped.positions[index + 2];
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let dx = -1; dx <= 1 && best >= SAME; dx += 1) {
      for (let dy = -1; dy <= 1 && best >= SAME; dy += 1) {
        for (let dz = -1; dz <= 1 && best >= SAME; dz += 1) {
          const list = bins.get((cx + dx + 512) * 1000000 + (cy + dy + 512) * 1000 + (cz + dz + 512));
          if (!list) continue;
          for (let item = 0; item < list.length; item += 1) {
            const other = list[item];
            const ox = open.positions[other] - x;
            const oy = open.positions[other + 1] - y;
            const oz = open.positions[other + 2] - z;
            const distance = ox * ox + oy * oy + oz * oz;
            if (distance < best) best = distance;
          }
        }
      }
    }
    if (best >= SAME) added[vertex] = 1;
  }
  const indices: number[] = [];
  for (let index = 0; index < capped.indices.length; index += 3) {
    const a = capped.indices[index];
    const b = capped.indices[index + 1];
    const c = capped.indices[index + 2];
    if (added[a] || added[b] || added[c]) indices.push(a, b, c);
  }
  if (indices.length === 0) return null;
  return {
    positions: capped.positions,
    normals: capped.normals,
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

/** Projected bounds at the shared isometric angle. */
export function capProjectionExtent(mesh: IsoMesh) {
  const yaw = Math.PI / 4;
  const pitch = Math.atan(1 / Math.SQRT2);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    const x1 = positions[index] * cy + positions[index + 2] * sy;
    const z1 = -positions[index] * sy + positions[index + 2] * cy;
    const y2 = positions[index + 1] * cp - z1 * sp;
    minX = Math.min(minX, x1);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y2);
    maxY = Math.max(maxY, y2);
  }
  return { minX, maxX, minY, maxY };
}

const SOLID_CELL = 0.25;

function solidKey(x: number, y: number, z: number) {
  return (Math.floor(x / SOLID_CELL) + 512) * 1000000
    + (Math.floor(y / SOLID_CELL) + 512) * 1000
    + (Math.floor(z / SOLID_CELL) + 512);
}

/**
 * Faces on the later mesh farther than `limit` from the earlier surface.
 * A near-total remesh returns nothing, so the whole body is not painted as a change.
 */
export function solidClosure(before: IsoMesh, after: IsoMesh, limit = 0.5): IsoMesh | null {
  const limitSquared = limit * limit;
  const reach = Math.ceil(limit / SOLID_CELL) + 1;
  const bins = new Map<number, number[]>();
  for (let index = 0; index < before.positions.length; index += 3) {
    const key = solidKey(before.positions[index], before.positions[index + 1], before.positions[index + 2]);
    const list = bins.get(key);
    if (list) list.push(index);
    else bins.set(key, [index]);
  }
  const added = new Uint8Array(after.positions.length / 3);
  let count = 0;
  for (let vertex = 0; vertex < added.length; vertex += 1) {
    const index = vertex * 3;
    const x = after.positions[index];
    const y = after.positions[index + 1];
    const z = after.positions[index + 2];
    const cx = Math.floor(x / SOLID_CELL);
    const cy = Math.floor(y / SOLID_CELL);
    const cz = Math.floor(z / SOLID_CELL);
    let best = Infinity;
    for (let dx = -reach; dx <= reach && best >= limitSquared; dx += 1) {
      for (let dy = -reach; dy <= reach && best >= limitSquared; dy += 1) {
        for (let dz = -reach; dz <= reach && best >= limitSquared; dz += 1) {
          const list = bins.get((cx + dx + 512) * 1000000 + (cy + dy + 512) * 1000 + (cz + dz + 512));
          if (!list) continue;
          for (let item = 0; item < list.length; item += 1) {
            const other = list[item];
            const ox = before.positions[other] - x;
            const oy = before.positions[other + 1] - y;
            const oz = before.positions[other + 2] - z;
            const distance = ox * ox + oy * oy + oz * oz;
            if (distance < best) best = distance;
          }
        }
      }
    }
    if (best >= limitSquared) {
      added[vertex] = 1;
      count += 1;
    }
  }
  if (count === 0 || count / added.length > 0.75) return null;
  const indices: number[] = [];
  for (let index = 0; index < after.indices.length; index += 3) {
    const a = after.indices[index];
    const b = after.indices[index + 1];
    const c = after.indices[index + 2];
    if (added[a] || added[b] || added[c]) indices.push(a, b, c);
  }
  if (indices.length === 0) return null;
  return {
    positions: after.positions,
    normals: after.normals,
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}
