import type { IsoMesh } from "../scan/isomesh";
import { diagnoseTopology } from "./boolean-conditioning";

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
export function filmWrapAssembly(meshes: readonly WorldMesh[]): FilmWrap | null {
  const bounds = boundsOf(meshes);
  if (!bounds) return null;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ);
  if (span < 1e-4) return null;
  const cell = span / AXIS;
  const pad = CLOSE + 3;
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
  for (let pass = 0; pass < CLOSE; pass += 1) closed = dilate(closed, nx, ny, nz);
  for (let pass = 0; pass < CLOSE; pass += 1) closed = erode(closed, nx, ny, nz);
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

function march(field: Float32Array, nx: number, ny: number, nz: number, originX: number, originY: number, originZ: number, cell: number): IsoMesh | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const weld = new Map<string, number>();
  const at = (x: number, y: number, z: number) => field[x + nx * (y + ny * z)];
  const point = (x: number, y: number, z: number) => ({ x: originX + x * cell, y: originY + y * cell, z: originZ + z * cell });
  const id = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  for (let z = 0; z < nz - 1; z += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
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
        if (values.every((value) => value < 0.5) || values.every((value) => value >= 0.5)) continue;
        TETS.forEach((tet) => {
          const inside: number[] = [];
          const outside: number[] = [];
          tet.forEach((corner) => {
            if (values[corner] >= 0.5) inside.push(corner);
            else outside.push(corner);
          });
          if (inside.length === 0 || inside.length === 4) return;
          const cross = (from: number, to: number) => edgePoint(weld, positions, corners[from], corners[to], values[from], values[to], point, id);
          const interior = averageCorners(inside.map((corner) => point(corners[corner].x, corners[corner].y, corners[corner].z)));
          if (inside.length === 1 || inside.length === 3) {
            const hub = inside.length === 1 ? inside[0] : outside[0];
            const rim = (inside.length === 1 ? outside : inside);
            const face = rim.map((corner) => cross(hub, corner));
            addFace(indices, positions, face[0], face[1], face[2], interior, inside.length === 3);
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
) {
  const left = id(from.x, from.y, from.z);
  const right = id(to.x, to.y, to.z);
  const key = left < right ? `${left}:${right}` : `${right}:${left}`;
  const hit = weld.get(key);
  if (hit != null) return hit;
  const span = toValue - fromValue;
  const t = Math.abs(span) < 1e-6 ? 0.5 : (0.5 - fromValue) / span;
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
