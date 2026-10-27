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
