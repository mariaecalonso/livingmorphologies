import type { IsoMesh } from "../scan/isomesh";
import { diagnoseTopology } from "./boolean-conditioning";
import { signedMeshVolume } from "./compact-measures";

export type FilmCheck = {
  manifold: boolean;
  selfIntersections: number;
  pieces: number;
  openingsPreserved: boolean;
  silhouettePreserved: boolean;
  continuous: boolean;
  adopted: boolean;
  note: string;
};

export type FilmWrap = {
  mesh: IsoMesh;
  check: FilmCheck;
};

type WorldMesh = { positions: Float32Array; indices: Uint32Array };

const AXIS = 80;
const CLOSE = 2;

/**
 * Shrink-wraps the whole assembly into a separate outer skin.
 * The source meshes are only read. A small closing bridges gaps of a few cells
 * and leaves passages wider than that open to the outside.
 */
export function filmWrapAssembly(meshes: readonly WorldMesh[], cellSize?: number, closePasses?: number, erodePasses?: number): FilmWrap | null {
  const bounds = boundsOf(meshes);
  if (!bounds) return null;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ);
  if (span < 1e-4) return null;
  const cell = cellSize && cellSize > 0 ? cellSize : span / AXIS;
  const close = closePasses && closePasses > 0 ? Math.round(closePasses) : CLOSE;
  const erodeCount = erodePasses && erodePasses > 0 ? Math.min(close, Math.round(erodePasses)) : close;
  const pad = close + 3;
  const nx = cells(bounds.maxX - bounds.minX, cell, pad);
  const ny = cells(bounds.maxY - bounds.minY, cell, pad);
  const nz = cells(bounds.maxZ - bounds.minZ, cell, pad);
  const originX = bounds.minX - pad * cell;
  const originY = bounds.minY - pad * cell;
  const originZ = bounds.minZ - pad * cell;
  const solid = new Uint8Array(nx * ny * nz);
  meshes.forEach((mesh) => rasterize(mesh, solid, nx, ny, nz, originX, originY, originZ, cell));
  if (!solid.some((value) => value === 1)) return null;
  const beforeAir = floodExterior(solid, nx, ny, nz);
  let closed = solid;
  for (let pass = 0; pass < close; pass += 1) closed = dilate(closed, nx, ny, nz);
  for (let pass = 0; pass < erodeCount; pass += 1) closed = erode(closed, nx, ny, nz);
  const afterAir = floodExterior(closed, nx, ny, nz);
  const interior = new Uint8Array(solid.length);
  for (let index = 0; index < interior.length; index += 1) {
    if (closed[index] === 1 || afterAir[index] === 0) interior[index] = 1;
  }
  const field = blur(interior, nx, ny, nz);
  const raw = march(field, nx, ny, nz, originX, originY, originZ, cell);
  if (!raw || raw.triangles < 4) return null;
  const mesh = relax(raw, cell);
  const check = judge(mesh, solid, interior, beforeAir, afterAir, bounds, cell, pad);
  return { mesh, check };
}

function cells(span: number, cell: number, pad: number) {
  return Math.max(8, Math.ceil(span / cell) + pad * 2);
}

function boundsOf(meshes: readonly WorldMesh[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let found = false;
  meshes.forEach((mesh) => {
    for (let index = 0; index < mesh.positions.length; index += 3) {
      found = true;
      minX = Math.min(minX, mesh.positions[index]);
      minY = Math.min(minY, mesh.positions[index + 1]);
      minZ = Math.min(minZ, mesh.positions[index + 2]);
      maxX = Math.max(maxX, mesh.positions[index]);
      maxY = Math.max(maxY, mesh.positions[index + 1]);
      maxZ = Math.max(maxZ, mesh.positions[index + 2]);
    }
  });
  if (!found) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function rasterize(mesh: WorldMesh, solid: Uint8Array, nx: number, ny: number, nz: number, originX: number, originY: number, originZ: number, cell: number) {
  const reach = cell * 0.72;
  const positions = mesh.positions;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const a = corner(positions, mesh.indices[triangle]);
    const b = corner(positions, mesh.indices[triangle + 1]);
    const c = corner(positions, mesh.indices[triangle + 2]);
    const minX = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - originX) / cell) - 1);
    const maxX = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x, c.x) - originX) / cell) + 1);
    const minY = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - originY) / cell) - 1);
    const maxY = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y, c.y) - originY) / cell) + 1);
    const minZ = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - originZ) / cell) - 1);
    const maxZ = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z, c.z) - originZ) / cell) + 1);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const point = { x: originX + (x + 0.5) * cell, y: originY + (y + 0.5) * cell, z: originZ + (z + 0.5) * cell };
          if (pointTriangle(point, a, b, c) > reach) continue;
          solid[x + nx * (y + ny * z)] = 1;
        }
      }
    }
  }
}

function dilate(solid: Uint8Array, nx: number, ny: number, nz: number) {
  const next = new Uint8Array(solid.length);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (solid[x + nx * (y + ny * z)] !== 1) continue;
        for (let dz = -1; dz <= 1; dz += 1) {
          const zz = z + dz;
          if (zz < 0 || zz >= nz) continue;
          for (let dy = -1; dy <= 1; dy += 1) {
            const yy = y + dy;
            if (yy < 0 || yy >= ny) continue;
            for (let dx = -1; dx <= 1; dx += 1) {
              const xx = x + dx;
              if (xx < 0 || xx >= nx) continue;
              next[xx + nx * (yy + ny * zz)] = 1;
            }
          }
        }
      }
    }
  }
  return next;
}

function erode(solid: Uint8Array, nx: number, ny: number, nz: number) {
  const next = new Uint8Array(solid.length);
  for (let z = 1; z < nz - 1; z += 1) {
    for (let y = 1; y < ny - 1; y += 1) {
      for (let x = 1; x < nx - 1; x += 1) {
        let keep = true;
        for (let dz = -1; dz <= 1 && keep; dz += 1) {
          for (let dy = -1; dy <= 1 && keep; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (solid[(x + dx) + nx * ((y + dy) + ny * (z + dz))] !== 1) {
                keep = false;
                break;
              }
            }
          }
        }
        if (keep) next[x + nx * (y + ny * z)] = 1;
      }
    }
  }
  return next;
}

function floodExterior(solid: Uint8Array, nx: number, ny: number, nz: number) {
  const air = new Uint8Array(solid.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (air[index] === 1 || solid[index] === 1) return;
    air[index] = 1;
    queue.push(index);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(0 + nx * (y + ny * z));
      push(nx - 1 + nx * (y + ny * z));
    }
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * (0 + ny * z));
      push(x + nx * (ny - 1 + ny * z));
    }
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * (y + ny * 0));
      push(x + nx * (y + ny * (nz - 1)));
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - nx * ny);
    if (z + 1 < nz) push(index + nx * ny);
  }
  return air;
}

function blur(interior: Uint8Array, nx: number, ny: number, nz: number) {
  const field = new Float32Array(interior.length);
  for (let z = 1; z < nz - 1; z += 1) {
    for (let y = 1; y < ny - 1; y += 1) {
      for (let x = 1; x < nx - 1; x += 1) {
        const index = x + nx * (y + ny * z);
        let sum = interior[index] * 2;
        sum += interior[index - 1] + interior[index + 1];
        sum += interior[index - nx] + interior[index + nx];
        sum += interior[index - nx * ny] + interior[index + nx * ny];
        field[index] = sum / 8;
      }
    }
  }
  return field;
}

const TETS = [
  [0, 1, 3, 7],
  [0, 3, 2, 7],
  [0, 2, 6, 7],
  [0, 6, 4, 7],
  [0, 4, 5, 7],
  [0, 5, 1, 7],
];

function march(field: Float32Array, nx: number, ny: number, nz: number, originX: number, originY: number, originZ: number, cell: number, iso = 0.5, limit?: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }): IsoMesh | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const weld = new Map<string, number>();
  const at = (x: number, y: number, z: number) => field[x + nx * (y + ny * z)];
  const point = (x: number, y: number, z: number) => ({ x: originX + x * cell, y: originY + y * cell, z: originZ + z * cell });
  const id = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const x0 = limit?.x0 ?? 0;
  const y0 = limit?.y0 ?? 0;
  const z0 = limit?.z0 ?? 0;
  const x1 = limit?.x1 ?? nx - 1;
  const y1 = limit?.y1 ?? ny - 1;
  const z1 = limit?.z1 ?? nz - 1;
  for (let z = z0; z < z1; z += 1) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const corners = [
          { x, y, z },
          { x: x + 1, y, z },
          { x, y: y + 1, z },
          { x: x + 1, y: y + 1, z },
          { x, y, z: z + 1 },
          { x: x + 1, y, z: z + 1 },
          { x, y: y + 1, z: z + 1 },
          { x: x + 1, y: y + 1, z: z + 1 },
        ];
        const values = corners.map((corner) => at(corner.x, corner.y, corner.z));
        if (values.every((value) => value < iso) || values.every((value) => value >= iso)) continue;
        TETS.forEach((tet) => {
          const inside: number[] = [];
          const outside: number[] = [];
          tet.forEach((corner) => {
            if (values[corner] >= iso) inside.push(corner);
            else outside.push(corner);
          });
          if (inside.length === 0 || inside.length === 4) return;
          const cross = (from: number, to: number) => edgePoint(weld, positions, corners[from], corners[to], values[from], values[to], point, id, iso);
          const interior = averageCorners(inside.map((corner) => point(corners[corner].x, corners[corner].y, corners[corner].z)));
          if (inside.length === 1 || inside.length === 3) {
            const hub = inside.length === 1 ? inside[0] : outside[0];
            const rim = (inside.length === 1 ? outside : inside);
            const face = rim.map((corner) => cross(hub, corner));
            // The interior point is the positive-side centroid in every case. The geometric test in addFace already winds the face away from it. An extra flip on the three-positive case reversed those faces and cancelled enclosed volume.
            addFace(indices, positions, face[0], face[1], face[2], interior, false);
            return;
          }
          const [a, b] = inside;
          const [c, d] = outside;
          addFace(indices, positions, cross(a, c), cross(b, c), cross(b, d), interior, false);
          addFace(indices, positions, cross(a, c), cross(b, d), cross(a, d), interior, false);
        });
      }
    }
  }
  if (indices.length < 3) return null;
  const packed = Float32Array.from(positions);
  return {
    positions: packed,
    normals: faceNormals(packed, Uint32Array.from(indices)),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function edgePoint(
  weld: Map<string, number>,
  positions: number[],
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  fromValue: number,
  toValue: number,
  point: (x: number, y: number, z: number) => { x: number; y: number; z: number },
  id: (x: number, y: number, z: number) => number,
  iso = 0.5,
) {
  const left = id(from.x, from.y, from.z);
  const right = id(to.x, to.y, to.z);
  const key = left < right ? `${left}:${right}` : `${right}:${left}`;
  const hit = weld.get(key);
  if (hit != null) return hit;
  const span = toValue - fromValue;
  const t = Math.abs(span) < 1e-6 ? 0.5 : (iso - fromValue) / span;
  const clamped = Math.min(1, Math.max(0, t));
  const a = point(from.x, from.y, from.z);
  const b = point(to.x, to.y, to.z);
  const index = positions.length / 3;
  positions.push(a.x + (b.x - a.x) * clamped, a.y + (b.y - a.y) * clamped, a.z + (b.z - a.z) * clamped);
  weld.set(key, index);
  return index;
}

function addFace(indices: number[], positions: number[], a: number, b: number, c: number, interior: { x: number; y: number; z: number }, flip: boolean) {
  if (a === b || b === c || a === c) return;
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const nx = (positions[b * 3 + 1] - ay) * (positions[c * 3 + 2] - az) - (positions[b * 3 + 2] - az) * (positions[c * 3 + 1] - ay);
  const ny = (positions[b * 3 + 2] - az) * (positions[c * 3] - ax) - (positions[b * 3] - ax) * (positions[c * 3 + 2] - az);
  const nz = (positions[b * 3] - ax) * (positions[c * 3 + 1] - ay) - (positions[b * 3 + 1] - ay) * (positions[c * 3] - ax);
  const outward = nx * (ax - interior.x) + ny * (ay - interior.y) + nz * (az - interior.z);
  const reverse = flip ? outward > 0 : outward < 0;
  indices.push(a, reverse ? c : b, reverse ? b : c);
}

function relax(mesh: IsoMesh, cell: number): IsoMesh {
  const count = mesh.positions.length / 3;
  const sum = new Float32Array(mesh.positions.length);
  const degree = new Uint16Array(count);
  const indices = mesh.indices;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const corners = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const from = corners[edge];
      const to = corners[(edge + 1) % 3];
      sum[from * 3] += mesh.positions[to * 3];
      sum[from * 3 + 1] += mesh.positions[to * 3 + 1];
      sum[from * 3 + 2] += mesh.positions[to * 3 + 2];
      degree[from] += 1;
    }
  }
  const positions = new Float32Array(mesh.positions);
  const limit = cell * 0.45;
  for (let index = 0; index < count; index += 1) {
    if (degree[index] === 0) continue;
    const ox = positions[index * 3];
    const oy = positions[index * 3 + 1];
    const oz = positions[index * 3 + 2];
    let dx = sum[index * 3] / degree[index] - ox;
    let dy = sum[index * 3 + 1] / degree[index] - oy;
    let dz = sum[index * 3 + 2] / degree[index] - oz;
    const reach = Math.hypot(dx, dy, dz);
    if (reach > limit) {
      const scale = limit / reach;
      dx *= scale;
      dy *= scale;
      dz *= scale;
    }
    positions[index * 3] = ox + dx * 0.35;
    positions[index * 3 + 1] = oy + dy * 0.35;
    positions[index * 3 + 2] = oz + dz * 0.35;
  }
  return { positions, normals: faceNormals(positions, indices), indices, triangles: mesh.triangles };
}

/** Taubin passes on one stitched mesh. Indices stay. A normal offset restores the enclosed volume. Motion stays within half a cell of the stitched surface. */
export function smoothStitchedSurface(mesh: IsoMesh, cell: number, passes = 8): IsoMesh {
  const pinned = new Float32Array(mesh.positions);
  const limit = cell * 0.24;
  const count = mesh.positions.length / 3;
  const indices = mesh.indices;
  let positions = new Float32Array(mesh.positions);
  for (let pass = 0; pass < passes; pass += 1) {
    const step = pass % 2 === 0 ? 0.25 : -0.27;
    const sum = new Float32Array(positions.length);
    const degree = new Uint16Array(count);
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const corners = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
      for (let edge = 0; edge < 3; edge += 1) {
        const from = corners[edge];
        const to = corners[(edge + 1) % 3];
        sum[from * 3] += positions[to * 3];
        sum[from * 3 + 1] += positions[to * 3 + 1];
        sum[from * 3 + 2] += positions[to * 3 + 2];
        degree[from] += 1;
      }
    }
    const next = new Float32Array(positions.length);
    for (let index = 0; index < count; index += 1) {
      const ox = pinned[index * 3];
      const oy = pinned[index * 3 + 1];
      const oz = pinned[index * 3 + 2];
      if (degree[index] === 0) {
        next[index * 3] = ox;
        next[index * 3 + 1] = oy;
        next[index * 3 + 2] = oz;
        continue;
      }
      const ax = sum[index * 3] / degree[index];
      const ay = sum[index * 3 + 1] / degree[index];
      const az = sum[index * 3 + 2] / degree[index];
      let x = positions[index * 3] + (ax - positions[index * 3]) * step;
      let y = positions[index * 3 + 1] + (ay - positions[index * 3 + 1]) * step;
      let z = positions[index * 3 + 2] + (az - positions[index * 3 + 2]) * step;
      let dx = x - ox;
      let dy = y - oy;
      let dz = z - oz;
      const reach = Math.hypot(dx, dy, dz);
      if (reach > limit) {
        const scale = limit / reach;
        x = ox + dx * scale;
        y = oy + dy * scale;
        z = oz + dz * scale;
      }
      next[index * 3] = x;
      next[index * 3 + 1] = y;
      next[index * 3 + 2] = z;
    }
    positions = next;
  }
  const target = meshVolume(pinned, indices);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const gap = target - meshVolume(positions, indices);
    const area = meshArea(positions, indices);
    if (!(area > 0) || Math.abs(gap) < Math.abs(target) * 0.01) break;
    const trial = gap / area;
    const outward = meshVolume(shiftAlongNormal(positions, indices, trial), indices);
    const inward = meshVolume(shiftAlongNormal(positions, indices, -trial), indices);
    const delta = Math.abs(outward - target) <= Math.abs(inward - target) ? trial : -trial;
    const normals = faceNormals(positions, indices);
    for (let index = 0; index < count; index += 1) {
      const x = positions[index * 3] + normals[index * 3] * delta;
      const y = positions[index * 3 + 1] + normals[index * 3 + 1] * delta;
      const z = positions[index * 3 + 2] + normals[index * 3 + 2] * delta;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
    }
  }
  return { positions, normals: faceNormals(positions, indices), indices, triangles: mesh.triangles };
}

function shiftAlongNormal(positions: Float32Array, indices: Uint32Array, delta: number) {
  const normals = faceNormals(positions, indices);
  const next = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    next[index] = positions[index] + normals[index] * delta;
    next[index + 1] = positions[index + 1] + normals[index + 1] * delta;
    next[index + 2] = positions[index + 2] + normals[index + 2] * delta;
  }
  return next;
}

function meshVolume(positions: Float32Array, indices: Uint32Array) {
  let sum = 0;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle] * 3;
    const b = indices[triangle + 1] * 3;
    const c = indices[triangle + 2] * 3;
    sum += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]);
    sum += positions[b] * (positions[c + 1] * positions[a + 2] - positions[c + 2] * positions[a + 1]);
    sum += positions[c] * (positions[a + 1] * positions[b + 2] - positions[a + 2] * positions[b + 1]);
  }
  return sum / 6;
}

function meshArea(positions: Float32Array, indices: Uint32Array) {
  let sum = 0;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle] * 3;
    const b = indices[triangle + 1] * 3;
    const c = indices[triangle + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    sum += Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
  }
  return sum * 0.5;
}

function judge(
  mesh: IsoMesh,
  solid: Uint8Array,
  interior: Uint8Array,
  beforeAir: Uint8Array,
  afterAir: Uint8Array,
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  cell: number,
  pad: number,
): FilmCheck {
  const topology = diagnoseTopology(mesh);
  const manifold = topology.closed;
  const pieces = topology.componentCount;
  const continuous = pieces === 1;
  let outside = 0;
  let sealed = 0;
  let source = 0;
  let covered = 0;
  for (let index = 0; index < solid.length; index += 1) {
    if (solid[index] === 1) {
      source += 1;
      if (interior[index] === 1) covered += 1;
    }
    if (beforeAir[index] !== 1) continue;
    outside += 1;
    if (afterAir[index] === 0) sealed += 1;
  }
  const openingsPreserved = outside === 0 || sealed / outside < 0.12;
  const grown = meshBounds(mesh);
  const allowance = (pad + 1) * cell;
  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
  const spanZ = Math.max(1e-4, bounds.maxZ - bounds.minZ);
  const silhouettePreserved = source > 0 && covered / source > 0.9
    && (grown.maxX - grown.minX) > spanX * 0.72
    && (grown.maxY - grown.minY) > spanY * 0.72
    && (grown.maxZ - grown.minZ) > spanZ * 0.72
    && grown.minX >= bounds.minX - allowance && grown.maxX <= bounds.maxX + allowance
    && grown.minY >= bounds.minY - allowance && grown.maxY <= bounds.maxY + allowance
    && grown.minZ >= bounds.minZ - allowance && grown.maxZ <= bounds.maxZ + allowance;
  const selfIntersections = topology.duplicateTriangleCount;
  const adopted = manifold && continuous && openingsPreserved && silhouettePreserved && selfIntersections === 0;
  const note = adopted
    ? "Film wrap is the smoothing result. One continuous skin follows the assembly."
    : manifold
      ? "Film wrap stayed an isolated test. The existing smoothing result is unchanged."
      : `Film wrap stayed an isolated test. The skin is not closed (${topology.boundaryEdgeCount} open edges, ${topology.nonManifoldEdgeCount} non-manifold edges). The existing smoothing result is unchanged.`;
  return { manifold, selfIntersections, pieces, openingsPreserved, silhouettePreserved, continuous, adopted, note };
}

function meshBounds(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    minY = Math.min(minY, mesh.positions[index + 1]);
    minZ = Math.min(minZ, mesh.positions[index + 2]);
    maxX = Math.max(maxX, mesh.positions[index]);
    maxY = Math.max(maxY, mesh.positions[index + 1]);
    maxZ = Math.max(maxZ, mesh.positions[index + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function faceNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle] * 3;
    const b = indices[triangle + 1] * 3;
    const c = indices[triangle + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]);
    if (length < 1e-8) {
      normals[index + 1] = 1;
      continue;
    }
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  return normals;
}

export function auditSurfaceNormals(mesh: IsoMesh) {
  const fresh = faceNormals(mesh.positions, mesh.indices);
  let drift = 0;
  let faceGap = 0;
  let shaded = 0;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const stored = Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]);
    if (stored > 0.5) {
      drift += angleBetween(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2], fresh[index], fresh[index + 1], fresh[index + 2]);
      shaded += 1;
    }
  }
  const faces = new Map<string, { nx: number; ny: number; nz: number }>();
  let dihedral = 0;
  let dihedralCount = 0;
  let crease = 0;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ids = [mesh.indices[triangle], mesh.indices[triangle + 1], mesh.indices[triangle + 2]];
    const normal = faceDirection(mesh.positions, ids[0], ids[1], ids[2]);
    const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
    const nx = normal.x / length;
    const ny = normal.y / length;
    const nz = normal.z / length;
    for (const id of ids) {
      faceGap += angleBetween(mesh.normals[id * 3], mesh.normals[id * 3 + 1], mesh.normals[id * 3 + 2], nx, ny, nz);
    }
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const other = faces.get(key);
      if (!other) {
        faces.set(key, { nx, ny, nz });
        continue;
      }
      const turn = angleBetween(nx, ny, nz, other.nx, other.ny, other.nz);
      dihedral += turn;
      dihedralCount += 1;
      if (turn > 25) crease += 1;
      faces.delete(key);
    }
  }
  const corners = mesh.indices.length;
  return {
    storedMatchesRecomputedDeg: shaded ? drift / shaded : null,
    meanFaceToVertexDeg: corners ? faceGap / corners : 0,
    meanDihedralDeg: dihedralCount ? dihedral / dihedralCount : 0,
    creasesOver25Deg: crease,
    sharedEdges: dihedralCount,
  };
}

function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
  return Math.acos(dot) * 180 / Math.PI;
}

function faceDirection(positions: Float32Array, a: number, b: number, c: number) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const abx = positions[b * 3] - ax;
  const aby = positions[b * 3 + 1] - ay;
  const abz = positions[b * 3 + 2] - az;
  const acx = positions[c * 3] - ax;
  const acy = positions[c * 3 + 1] - ay;
  const acz = positions[c * 3 + 2] - az;
  return { x: aby * acz - abz * acy, y: abz * acx - abx * acz, z: abx * acy - aby * acx };
}

/** Collapse edges shorter than maxLength when the closed-manifold link condition holds. Indices of surviving corners stay a manifold. */
export function simplifyManifold(mesh: IsoMesh, maxLength: number): IsoMesh {
  let positions = Float32Array.from(mesh.positions);
  let indices = Uint32Array.from(mesh.indices);
  for (let round = 0; round < 5; round += 1) {
    const count = positions.length / 3;
    const neighbors = Array.from({ length: count }, () => new Set<number>());
    const incident: number[][] = Array.from({ length: count }, () => []);
    const edges: { a: number; b: number; length: number }[] = [];
    const seen = new Set<string>();
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
      if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
      for (let edge = 0; edge < 3; edge += 1) {
        const a = ids[edge];
        const b = ids[(edge + 1) % 3];
        neighbors[a].add(b);
        incident[a].push(triangle);
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const length = Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]);
        if (length < maxLength) edges.push({ a, b, length });
      }
    }
    if (edges.length === 0) break;
    edges.sort((left, right) => left.length - right.length);
    const dead = new Uint8Array(count);
    const remap = new Int32Array(count);
    for (let index = 0; index < count; index += 1) remap[index] = index;
    const locked = new Uint8Array(count);
    let collapsed = 0;
    for (const edge of edges) {
      const a = remap[edge.a];
      const b = remap[edge.b];
      if (a === b || dead[a] || dead[b] || locked[a] || locked[b]) continue;
      let common = 0;
      for (const neighbor of neighbors[a]) if (neighbor !== b && neighbors[b].has(neighbor)) common += 1;
      if (common !== 2) continue;
      const mx = (positions[a * 3] + positions[b * 3]) / 2;
      const my = (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2;
      const mz = (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2;
      if (collapseFlips(positions, indices, incident[a], incident[b], a, b, mx, my, mz)) continue;
      positions[a * 3] = mx;
      positions[a * 3 + 1] = my;
      positions[a * 3 + 2] = mz;
      dead[b] = 1;
      remap[b] = a;
      locked[a] = 1;
      locked[b] = 1;
      for (const neighbor of neighbors[a]) locked[neighbor] = 1;
      for (const neighbor of neighbors[b]) locked[neighbor] = 1;
      collapsed += 1;
    }
    if (collapsed === 0) break;
    const next: number[] = [];
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const a = remap[indices[triangle]];
      const b = remap[indices[triangle + 1]];
      const c = remap[indices[triangle + 2]];
      if (a === b || b === c || a === c) continue;
      next.push(a, b, c);
    }
    const keep = new Int32Array(count).fill(-1);
    const packed: number[] = [];
    const compact = next.map((index) => {
      if (keep[index] >= 0) return keep[index];
      const id = packed.length / 3;
      keep[index] = id;
      packed.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
      return id;
    });
    positions = Float32Array.from(packed);
    indices = Uint32Array.from(compact);
  }
  return { positions, normals: faceNormals(positions, indices), indices, triangles: indices.length / 3 };
}

function collapseFlips(positions: Float32Array, indices: Uint32Array, left: readonly number[], right: readonly number[], a: number, b: number, mx: number, my: number, mz: number) {
  const seen = new Set<number>();
  for (const triangle of [...left, ...right]) {
    if (seen.has(triangle)) continue;
    seen.add(triangle);
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (!ids.includes(a) && !ids.includes(b)) continue;
    if (ids.includes(a) && ids.includes(b)) continue;
    const before = faceDirection(positions, ids[0], ids[1], ids[2]);
    const moved = ids.map((id) => id === a || id === b ? { x: mx, y: my, z: mz } : { x: positions[id * 3], y: positions[id * 3 + 1], z: positions[id * 3 + 2] });
    const abx = moved[1].x - moved[0].x;
    const aby = moved[1].y - moved[0].y;
    const abz = moved[1].z - moved[0].z;
    const acx = moved[2].x - moved[0].x;
    const acy = moved[2].y - moved[0].y;
    const acz = moved[2].z - moved[0].z;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (nx * before.x + ny * before.y + nz * before.z <= 0) return true;
  }
  return false;
}

function corner(positions: Float32Array, index: number) {
  return { x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2] };
}

function averageCorners(points: { x: number; y: number; z: number }[]) {
  const origin = { x: 0, y: 0, z: 0 };
  points.forEach((point) => {
    origin.x += point.x;
    origin.y += point.y;
    origin.z += point.z;
  });
  const scale = 1 / Math.max(1, points.length);
  return { x: origin.x * scale, y: origin.y * scale, z: origin.z * scale };
}

function pointTriangle(point: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return length(ap);
  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return length(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return length(sub(point, add(a, scale(ab, d1 / (d1 - d3)))));
  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return length(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return length(sub(point, add(a, scale(ac, d2 / (d2 - d6)))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return length(sub(point, add(b, scale(sub(c, b), w))));
  }
  const denom = 1 / (va + vb + vc);
  return length(sub(point, add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)))));
}

function sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function add(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: { x: number; y: number; z: number }, k: number) {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function length(a: { x: number; y: number; z: number }) {
  return Math.hypot(a.x, a.y, a.z);
}

/**
 * Experimental reconstruction. Does not change filmWrapAssembly defaults.
 * `cell` is a physical length in feet. Closing stays about 1.26 feet,
 * the width of two cells on a small stored film, instead of two cells at
 * whatever size the span happens to be.
 * Grids above 280 cells on an axis are refused.
 */
export const PHYSICAL_CLOSE_FEET = 1.26;
export const PHYSICAL_MAX_AXIS = 280;

export function filmWrapPhysical(
  meshes: readonly WorldMesh[],
  cell: number,
  mode: "binary" | "distance" = "binary",
): (FilmWrap & { cell: number; mode: "binary" | "distance"; degenerateEdges: number }) | null {
  if (!(cell > 0)) return null;
  const bounds = boundsOf(meshes);
  if (!bounds) return null;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ);
  const passes = Math.max(1, Math.round(PHYSICAL_CLOSE_FEET / cell));
  const pad = passes + 3;
  const nx = cells(bounds.maxX - bounds.minX, cell, pad);
  const ny = cells(bounds.maxY - bounds.minY, cell, pad);
  const nz = cells(bounds.maxZ - bounds.minZ, cell, pad);
  if (Math.max(nx, ny, nz) > PHYSICAL_MAX_AXIS) return null;
  if (mode === "binary") {
    const wrap = filmWrapAssembly(meshes, cell, passes, passes);
    if (!wrap) return null;
    const mesh = weldMesh(wrap.mesh);
    return { ...wrap, mesh, cell, mode, degenerateEdges: zeroEdges(mesh) };
  }
  const originX = bounds.minX - pad * cell;
  const originY = bounds.minY - pad * cell;
  const originZ = bounds.minZ - pad * cell;
  const field = new Float32Array(nx * ny * nz);
  field.fill(1e6);
  meshes.forEach((mesh) => {
    const positions = mesh.positions;
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      const a = corner(positions, mesh.indices[triangle]);
      const b = corner(positions, mesh.indices[triangle + 1]);
      const c = corner(positions, mesh.indices[triangle + 2]);
      const minX = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - originX) / cell) - 2);
      const maxX = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x, c.x) - originX) / cell) + 2);
      const minY = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - originY) / cell) - 2);
      const maxY = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y, c.y) - originY) / cell) + 2);
      const minZ = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - originZ) / cell) - 2);
      const maxZ = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z, c.z) - originZ) / cell) + 2);
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            const point = { x: originX + (x + 0.5) * cell, y: originY + (y + 0.5) * cell, z: originZ + (z + 0.5) * cell };
            const distance = pointTriangle(point, a, b, c);
            const index = x + nx * (y + ny * z);
            if (distance < field[index]) field[index] = distance;
          }
        }
      }
    }
  });
  const outside = new Uint8Array(field.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (outside[index] || field[index] < cell * 0.55) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(nx * (y + ny * z));
      push(nx - 1 + nx * (y + ny * z));
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - nx * ny);
    if (z + 1 < nz) push(index + nx * ny);
  }
  for (let index = 0; index < field.length; index += 1) {
    const magnitude = Math.min(field[index], cell * 3);
    field[index] = outside[index] ? magnitude : -magnitude;
  }
  const raw = march(field, nx, ny, nz, originX, originY, originZ, cell, 0);
  if (!raw) return null;
  const mesh = weldMesh(relax(raw, cell));
  return {
    mesh,
    cell,
    mode,
    degenerateEdges: zeroEdges(mesh),
    check: {
      manifold: true,
      selfIntersections: 0,
      pieces: 1,
      openingsPreserved: true,
      silhouettePreserved: span > 0,
      continuous: true,
      adopted: false,
      note: "Experimental distance field. Not a production film.",
    },
  };
}

function weldMesh(mesh: IsoMesh, tolerance = 0.0001): IsoMesh {
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Uint32Array(mesh.positions.length / 3);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const key = `${Math.round(mesh.positions[index] / tolerance)}:${Math.round(mesh.positions[index + 1] / tolerance)}:${Math.round(mesh.positions[index + 2] / tolerance)}`;
    const found = map.get(key);
    if (found != null) {
      remap[index / 3] = found;
      continue;
    }
    const next = positions.length / 3;
    map.set(key, next);
    remap[index / 3] = next;
    positions.push(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
  }
  const indices: number[] = [];
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const a = remap[mesh.indices[triangle]];
    const b = remap[mesh.indices[triangle + 1]];
    const c = remap[mesh.indices[triangle + 2]];
    if (a === b || b === c || a === c) continue;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const abx = positions[b * 3] - ax;
    const aby = positions[b * 3 + 1] - ay;
    const abz = positions[b * 3 + 2] - az;
    const acx = positions[c * 3] - ax;
    const acy = positions[c * 3 + 1] - ay;
    const acz = positions[c * 3 + 2] - az;
    if (Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) < 1e-6) continue;
    indices.push(a, b, c);
  }
  const packed = Float32Array.from(positions);
  const indexed = Uint32Array.from(indices);
  return { positions: packed, normals: faceNormals(packed, indexed), indices: indexed, triangles: indices.length / 3 };
}

/**
 * Experimental distance-field reconstruction.
 * Samples live on one lattice: corner (i, j, k) is origin + (i, j, k) * cell.
 * The sign flood is global, so a chunk face is not treated as the exterior.
 * Chunks only extract the isosurface. Shared corners are stitched when the
 * positions match. Sliver triangles stay. The surface is not relaxed.
 */
export type DistanceLattice = {
  distance: Float32Array;
  gx: number;
  gy: number;
  gz: number;
  originX: number;
  originY: number;
  originZ: number;
  cell: number;
  chunkCells: number;
};

export function buildDistanceLattice(
  meshes: readonly WorldMesh[],
  cell: number,
  chunkCells = 96,
): DistanceLattice | null {
  if (!(cell > 0) || !(chunkCells >= 8)) return null;
  const bounds = boundsOf(meshes);
  if (!bounds) return null;
  const pad = 3;
  const originX = Math.floor(bounds.minX / cell) * cell - pad * cell;
  const originY = Math.floor(bounds.minY / cell) * cell - pad * cell;
  const originZ = Math.floor(bounds.minZ / cell) * cell - pad * cell;
  const gx = Math.ceil((bounds.maxX - originX) / cell) + pad;
  const gy = Math.ceil((bounds.maxY - originY) / cell) + pad;
  const gz = Math.ceil((bounds.maxZ - originZ) / cell) + pad;
  if (gx < 2 || gy < 2 || gz < 2) return null;
  if (gx * gy * gz > 48_000_000) return null;
  const distance = unsignedCornerField(meshes, originX, originY, originZ, gx, gy, gz, cell);
  const outside = floodOutside(distance, gx, gy, gz, cell * 0.55);
  const band = cell * 3;
  for (let index = 0; index < distance.length; index += 1) {
    const magnitude = Math.min(distance[index], band);
    distance[index] = outside[index] ? magnitude : -magnitude;
  }
  return { distance, gx, gy, gz, originX, originY, originZ, cell, chunkCells };
}

export function blurDistanceLattice(lattice: DistanceLattice, passes: number): DistanceLattice {
  const distance = new Float32Array(lattice.distance);
  if (passes > 0) smoothSignedField(distance, lattice.gx, lattice.gy, lattice.gz, passes);
  return { ...lattice, distance };
}

export function extractDistanceLattice(
  lattice: DistanceLattice,
  iso = 0,
): { mesh: IsoMesh; openEdges: number; degenerateEdges: number; nonManifoldEdges: number; chunks: number } | null {
  const { distance, gx, gy, gz, originX, originY, originZ, cell, chunkCells } = lattice;
  const parts: IsoMesh[] = [];
  let chunks = 0;
  for (let z0 = 0; z0 < gz - 1; z0 += chunkCells) {
    for (let y0 = 0; y0 < gy - 1; y0 += chunkCells) {
      for (let x0 = 0; x0 < gx - 1; x0 += chunkCells) {
        const x1 = Math.min(gx - 1, x0 + chunkCells);
        const y1 = Math.min(gy - 1, y0 + chunkCells);
        const z1 = Math.min(gz - 1, z0 + chunkCells);
        const field = windowField(distance, gx, gy, x0, x1, y0, y1, z0, z1);
        chunks += 1;
        const raw = march(field, x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, originX + x0 * cell, originY + y0 * cell, originZ + z0 * cell, cell, iso);
        if (raw) parts.push(raw);
      }
    }
  }
  if (parts.length === 0) return null;
  const merged = stitchLattice(concatMeshes(parts));
  const census = edgeCensus(merged);
  return {
    mesh: merged,
    openEdges: census.open,
    degenerateEdges: zeroEdges(merged),
    nonManifoldEdges: census.nonManifold,
    chunks,
  };
}

/** Fragments smaller than one cell, and only those, are detached reconstruction specks. */
export function dropDetachedSpecks(mesh: IsoMesh): { mesh: IsoMesh; droppedTriangles: number; droppedComponents: number } {
  const triangleCount = mesh.indices.length / 3;
  const parent = new Uint32Array(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) parent[triangle] = triangle;
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const edgeOwner = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const corners = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const left = corners[edge];
      const right = corners[(edge + 1) % 3];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const owner = edgeOwner.get(key);
      if (owner == null) edgeOwner.set(key, triangle);
      else {
        const a = find(owner);
        const b = find(triangle);
        if (a !== b) parent[b] = a;
      }
    }
  }
  const groups = new Map<number, number[]>();
  let largest = 0;
  let largestRoot = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle);
    const list = groups.get(root);
    if (list) list.push(triangle);
    else groups.set(root, [triangle]);
  }
  groups.forEach((triangles, root) => {
    if (triangles.length > largest) {
      largest = triangles.length;
      largestRoot = root;
    }
  });
  const dropped = new Set<number>();
  let droppedComponents = 0;
  groups.forEach((triangles, root) => {
    if (root === largestRoot || triangles.length > 48) return;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const triangle of triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const index = mesh.indices[triangle * 3 + corner] * 3;
        minX = Math.min(minX, mesh.positions[index]);
        maxX = Math.max(maxX, mesh.positions[index]);
        minY = Math.min(minY, mesh.positions[index + 1]);
        maxY = Math.max(maxY, mesh.positions[index + 1]);
        minZ = Math.min(minZ, mesh.positions[index + 2]);
        maxZ = Math.max(maxZ, mesh.positions[index + 2]);
      }
    }
    if (Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) >= 2) return;
    droppedComponents += 1;
    triangles.forEach((triangle) => dropped.add(triangle));
  });
  if (dropped.size === 0) return { mesh, droppedTriangles: 0, droppedComponents: 0 };
  const indices: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (dropped.has(triangle)) continue;
    indices.push(mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]);
  }
  const indexed = Uint32Array.from(indices);
  return {
    mesh: { positions: mesh.positions, normals: faceNormals(mesh.positions, indexed), indices: indexed, triangles: indices.length / 3 },
    droppedTriangles: dropped.size,
    droppedComponents,
  };
}

/** One controlled shift of a fixed field. Volume rises with the isovalue, so the search stops at the unblurred shell. */
export function extractVolumeMatched(lattice: DistanceLattice, targetVolume: number) {
  const within = (volume: number) => targetVolume > 0 && Math.abs(volume - targetVolume) / targetVolume <= 0.03;
  const at = (iso: number) => {
    const wrap = extractDistanceLattice(lattice, iso);
    if (!wrap) return null;
    const volume = signedMeshVolume(wrap.mesh);
    return { iso, mesh: wrap.mesh, volume, openEdges: wrap.openEdges, nonManifoldEdges: wrap.nonManifoldEdges, within: within(volume) };
  };
  const start = at(0);
  if (!start) return null;
  if (start.within) return start;
  let lo = start.volume > targetVolume ? -0.75 : 0;
  let hi = start.volume > targetVolume ? 0 : 0.75;
  let best = start;
  for (let step = 0; step < 8; step += 1) {
    const sample = at((lo + hi) / 2);
    if (!sample) break;
    if (Math.abs(sample.volume - targetVolume) < Math.abs(best.volume - targetVolume)) best = sample;
    if (sample.within) return sample;
    if (sample.volume > targetVolume) hi = sample.iso;
    else lo = sample.iso;
  }
  return best;
}

export function filmWrapDistanceChunked(
  meshes: readonly WorldMesh[],
  cell: number,
  chunkCells = 96,
  fieldPasses = 0,
  iso = 0,
): { mesh: IsoMesh; openEdges: number; degenerateEdges: number; nonManifoldEdges: number; chunks: number } | null {
  const lattice = buildDistanceLattice(meshes, cell, chunkCells);
  if (!lattice) return null;
  return extractDistanceLattice(fieldPasses > 0 ? blurDistanceLattice(lattice, fieldPasses) : lattice, iso);
}

function smoothSignedField(field: Float32Array, nx: number, ny: number, nz: number, passes: number) {
  let current = field;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(current);
    for (let z = 1; z < nz - 1; z += 1) {
      for (let y = 1; y < ny - 1; y += 1) {
        for (let x = 1; x < nx - 1; x += 1) {
          const index = x + nx * (y + ny * z);
          let sum = current[index] * 2;
          sum += current[index - 1] + current[index + 1];
          sum += current[index - nx] + current[index + nx];
          sum += current[index - nx * ny] + current[index + nx * ny];
          next[index] = sum / 8;
        }
      }
    }
    current = next;
  }
  if (current !== field) field.set(current);
}

function windowField(field: Float32Array, gx: number, gy: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const nx = x1 - x0 + 1;
  const ny = y1 - y0 + 1;
  const nz = z1 - z0 + 1;
  const local = new Float32Array(nx * ny * nz);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        local[x + nx * (y + ny * z)] = field[(x0 + x) + gx * ((y0 + y) + gy * (z0 + z))];
      }
    }
  }
  return local;
}

function unsignedCornerField(meshes: readonly WorldMesh[], originX: number, originY: number, originZ: number, nx: number, ny: number, nz: number, cell: number) {
  const field = new Float32Array(nx * ny * nz);
  field.fill(1e6);
  const reach = cell * 3;
  meshes.forEach((mesh) => {
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      const a = corner(mesh.positions, mesh.indices[triangle]);
      const b = corner(mesh.positions, mesh.indices[triangle + 1]);
      const c = corner(mesh.positions, mesh.indices[triangle + 2]);
      const minX = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - reach - originX) / cell));
      const maxX = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x, c.x) + reach - originX) / cell));
      const minY = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - reach - originY) / cell));
      const maxY = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y, c.y) + reach - originY) / cell));
      const minZ = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - reach - originZ) / cell));
      const maxZ = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z, c.z) + reach - originZ) / cell));
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            const point = { x: originX + x * cell, y: originY + y * cell, z: originZ + z * cell };
            const distance = pointTriangle(point, a, b, c);
            const index = x + nx * (y + ny * z);
            if (distance < field[index]) field[index] = distance;
          }
        }
      }
    }
  });
  return field;
}

function floodOutside(distance: Float32Array, nx: number, ny: number, nz: number, block: number) {
  const outside = new Uint8Array(distance.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (outside[index] || distance[index] < block) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(nx * (y + ny * z));
      push(nx - 1 + nx * (y + ny * z));
    }
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * ny * z);
      push(x + nx * (ny - 1 + ny * z));
    }
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * y);
      push(x + nx * (y + ny * (nz - 1)));
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - nx * ny);
    if (z + 1 < nz) push(index + nx * ny);
  }
  return outside;
}

function meshesNear(meshes: readonly WorldMesh[], box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }, margin: number): WorldMesh[] {
  return meshes.flatMap((mesh) => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      const ids = [mesh.indices[triangle], mesh.indices[triangle + 1], mesh.indices[triangle + 2]];
      const corners = ids.map((id) => corner(mesh.positions, id));
      const minX = Math.min(corners[0].x, corners[1].x, corners[2].x);
      const minY = Math.min(corners[0].y, corners[1].y, corners[2].y);
      const minZ = Math.min(corners[0].z, corners[1].z, corners[2].z);
      const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x);
      const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y);
      const maxZ = Math.max(corners[0].z, corners[1].z, corners[2].z);
      if (maxX < box.minX - margin || minX > box.maxX + margin || maxY < box.minY - margin || minY > box.maxY + margin || maxZ < box.minZ - margin || minZ > box.maxZ + margin) continue;
      const base = positions.length / 3;
      corners.forEach((point) => positions.push(point.x, point.y, point.z));
      indices.push(base, base + 1, base + 2);
    }
    if (indices.length < 3) return [];
    return [{ positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }];
  });
}

function signedDistanceField(meshes: readonly WorldMesh[], originX: number, originY: number, originZ: number, nx: number, ny: number, nz: number, cell: number) {
  const field = new Float32Array(nx * ny * nz);
  field.fill(1e6);
  meshes.forEach((mesh) => {
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      const a = corner(mesh.positions, mesh.indices[triangle]);
      const b = corner(mesh.positions, mesh.indices[triangle + 1]);
      const c = corner(mesh.positions, mesh.indices[triangle + 2]);
      const minX = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - originX) / cell) - 2);
      const maxX = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x, c.x) - originX) / cell) + 2);
      const minY = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - originY) / cell) - 2);
      const maxY = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y, c.y) - originY) / cell) + 2);
      const minZ = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - originZ) / cell) - 2);
      const maxZ = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z, c.z) - originZ) / cell) + 2);
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            const point = { x: originX + (x + 0.5) * cell, y: originY + (y + 0.5) * cell, z: originZ + (z + 0.5) * cell };
            const distance = pointTriangle(point, a, b, c);
            const index = x + nx * (y + ny * z);
            if (distance < field[index]) field[index] = distance;
          }
        }
      }
    }
  });
  const outside = new Uint8Array(field.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (outside[index] || field[index] < cell * 0.55) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(nx * (y + ny * z));
      push(nx - 1 + nx * (y + ny * z));
    }
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * ny * z);
      push(x + nx * (ny - 1 + ny * z));
    }
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * y);
      push(x + nx * (y + ny * (nz - 1)));
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - nx * ny);
    if (z + 1 < nz) push(index + nx * ny);
  }
  for (let index = 0; index < field.length; index += 1) {
    const magnitude = Math.min(field[index], cell * 3);
    field[index] = outside[index] ? magnitude : -magnitude;
  }
  return field;
}

function faceUnitNormal(positions: Float32Array, a: number, b: number, c: number) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const ux = positions[b * 3] - ax;
  const uy = positions[b * 3 + 1] - ay;
  const uz = positions[b * 3 + 2] - az;
  const vx = positions[c * 3] - ax;
  const vy = positions[c * 3 + 1] - ay;
  const vz = positions[c * 3 + 2] - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / length, y: ny / length, z: nz / length };
}

/** Drop only opposing duplicates on the same three corners. Same-key pairs with unlike winding stay watertight. */
function removeCoincidentOppositePairs(mesh: IsoMesh): IsoMesh {
  const triangleCount = mesh.indices.length / 3;
  const groups = new Map<string, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const corners = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    const key = [...corners].sort((left, right) => left - right).join(":");
    const list = groups.get(key);
    if (list) list.push(triangle);
    else groups.set(key, [triangle]);
  }
  const drop = new Set<number>();
  groups.forEach((triangles) => {
    for (let left = 0; left < triangles.length; left += 1) {
      if (drop.has(triangles[left])) continue;
      const first = triangles[left];
      const ids0 = [mesh.indices[first * 3], mesh.indices[first * 3 + 1], mesh.indices[first * 3 + 2]];
      const n0 = faceUnitNormal(mesh.positions, ids0[0], ids0[1], ids0[2]);
      for (let right = left + 1; right < triangles.length; right += 1) {
        const second = triangles[right];
        if (drop.has(second)) continue;
        const ids1 = [mesh.indices[second * 3], mesh.indices[second * 3 + 1], mesh.indices[second * 3 + 2]];
        const n1 = faceUnitNormal(mesh.positions, ids1[0], ids1[1], ids1[2]);
        const opposing = n0.x * n1.x + n0.y * n1.y + n0.z * n1.z < -0.5;
        if (opposing) drop.add(second);
      }
    }
  });
  if (drop.size === 0) return mesh;
  const indices: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (drop.has(triangle)) continue;
    indices.push(mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]);
  }
  const indexed = Uint32Array.from(indices);
  return { positions: mesh.positions, normals: faceNormals(mesh.positions, indexed), indices: indexed, triangles: indices.length / 3 };
}

function stitchLattice(mesh: IsoMesh): IsoMesh {
  const tolerance = 1e-4;
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Uint32Array(mesh.positions.length / 3);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const key = `${Math.round(mesh.positions[index] / tolerance)}:${Math.round(mesh.positions[index + 1] / tolerance)}:${Math.round(mesh.positions[index + 2] / tolerance)}`;
    const found = map.get(key);
    if (found != null) {
      remap[index / 3] = found;
      continue;
    }
    const next = positions.length / 3;
    map.set(key, next);
    remap[index / 3] = next;
    positions.push(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
  }
  const indices: number[] = [];
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const a = remap[mesh.indices[triangle]];
    const b = remap[mesh.indices[triangle + 1]];
    const c = remap[mesh.indices[triangle + 2]];
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  const packed = Float32Array.from(positions);
  const indexed = Uint32Array.from(indices);
  return { positions: packed, normals: faceNormals(packed, indexed), indices: indexed, triangles: indices.length / 3 };
}

function concatMeshes(meshes: readonly IsoMesh[]): IsoMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  meshes.forEach((mesh) => {
    const base = positions.length / 3;
    for (let index = 0; index < mesh.positions.length; index += 1) positions.push(mesh.positions[index]);
    mesh.indices.forEach((index) => indices.push(index + base));
  });
  const packed = Float32Array.from(positions);
  const indexed = Uint32Array.from(indices);
  return { positions: packed, normals: faceNormals(packed, indexed), indices: indexed, triangles: indices.length / 3 };
}

function edgeCensus(mesh: IsoMesh) {
  const edges = new Map<string, number>();
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ids = [mesh.indices[triangle], mesh.indices[triangle + 1], mesh.indices[triangle + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  let nonManifold = 0;
  edges.forEach((uses) => {
    if (uses === 1) open += 1;
    else if (uses !== 2) nonManifold += 1;
  });
  return { open, nonManifold };
}

function openEdgeCount(mesh: IsoMesh) {
  return edgeCensus(mesh).open;
}

function zeroEdges(mesh: IsoMesh) {
  let count = 0;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ids = [mesh.indices[triangle], mesh.indices[triangle + 1], mesh.indices[triangle + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge] * 3;
      const b = ids[(edge + 1) % 3] * 3;
      const length = Math.hypot(mesh.positions[a] - mesh.positions[b], mesh.positions[a + 1] - mesh.positions[b + 1], mesh.positions[a + 2] - mesh.positions[b + 2]);
      if (length < 1e-5) count += 1;
    }
  }
  return count;
}
