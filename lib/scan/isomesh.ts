import { SCAN_SLICES, type ScanSlice } from "./volume";

export const ISO_RESOLUTION = 42;
export const VOXEL_RESOLUTION = 64;

export type IsoMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangles: number;
};

const EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const CORNERS: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

const at = (field: Float32Array, nx: number, ny: number, x: number, y: number, z: number) =>
  field[(z * ny + y) * nx + x];

/** Vertical gap between slices, as a fraction of the plate width. */
export function sliceSpacing(spacing: number, _yaw = 0.86) {
  return 0.04 + spacing * 0.42;
}

export function columnHeight(spacing: number, yaw = 0.86) {
  return (SCAN_SLICES - 1) * sliceSpacing(spacing, yaw);
}

function world(x: number, y: number, z: number, nx: number, ny: number, pitch: number) {
  const full = (SCAN_SLICES - 1) * pitch;
  return [
    x / (nx - 1) - 0.5,
    z * pitch - full * 0.5,
    y / (ny - 1) - 0.5,
  ];
}

/** Surface-nets isosurface. Density above `iso` is inside the mesh. */
export function surfaceNets(
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  iso: number,
  pitch = 0.85 / Math.max(1, nz - 1),
): IsoMesh {
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const vertexAt = new Int32Array(cx * cy * cz).fill(-1);
  const positions: number[] = [];

  const cellIndex = (x: number, y: number, z: number) => (z * cy + y) * cx + x;

  for (let z = 0; z < cz; z += 1) {
    for (let y = 0; y < cy; y += 1) {
      for (let x = 0; x < cx; x += 1) {
        const values = CORNERS.map(([dx, dy, dz]) => at(field, nx, ny, x + dx, y + dy, z + dz));
        let inside = 0;
        for (const value of values) if (value >= iso) inside += 1;
        if (inside === 0 || inside === 8) continue;

        let ax = 0;
        let ay = 0;
        let az = 0;
        let count = 0;
        for (const [left, right] of EDGES) {
          const a = values[left];
          const b = values[right];
          if ((a >= iso) === (b >= iso)) continue;
          const t = (iso - a) / (b - a || 1e-6);
          const ca = CORNERS[left];
          const cb = CORNERS[right];
          const px = x + ca[0] + (cb[0] - ca[0]) * t;
          const py = y + ca[1] + (cb[1] - ca[1]) * t;
          const pz = z + ca[2] + (cb[2] - ca[2]) * t;
          const point = world(px, py, pz, nx, ny, pitch);
          ax += point[0];
          ay += point[1];
          az += point[2];
          count += 1;
        }
        if (!count) continue;
        vertexAt[cellIndex(x, y, z)] = positions.length / 3;
        positions.push(ax / count, ay / count, az / count);
      }
    }
  }

  const indices: number[] = [];
  const pushQuad = (cells: Array<[number, number, number]>, flip: boolean) => {
    const ids = cells.map(([x, y, z]) => {
      if (x < 0 || y < 0 || z < 0 || x >= cx || y >= cy || z >= cz) return -1;
      return vertexAt[cellIndex(x, y, z)];
    });
    if (ids.some((id) => id < 0)) return;
    const [a, b, c, d] = flip ? [ids[0], ids[3], ids[2], ids[1]] : ids;
    indices.push(a, b, c, a, c, d);
  };

  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
        const a = at(field, nx, ny, x, y, z);
        const b = at(field, nx, ny, x + 1, y, z);
        if ((a >= iso) === (b >= iso)) continue;
        pushQuad(
          [
            [x, y - 1, z - 1],
            [x, y, z - 1],
            [x, y, z],
            [x, y - 1, z],
          ],
          a >= iso && b < iso,
        );
      }
    }
  }

  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const a = at(field, nx, ny, x, y, z);
        const b = at(field, nx, ny, x, y + 1, z);
        if ((a >= iso) === (b >= iso)) continue;
        pushQuad(
          [
            [x - 1, y, z - 1],
            [x, y, z - 1],
            [x, y, z],
            [x - 1, y, z],
          ],
          a >= iso && b < iso,
        );
      }
    }
  }

  for (let z = 0; z < nz - 1; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const a = at(field, nx, ny, x, y, z);
        const b = at(field, nx, ny, x, y, z + 1);
        if ((a >= iso) === (b >= iso)) continue;
        pushQuad(
          [
            [x - 1, y - 1, z],
            [x, y - 1, z],
            [x, y, z],
            [x - 1, y, z],
          ],
          a >= iso && b < iso,
        );
      }
    }
  }

  const normals = new Array<number>(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ib] - positions[ia];
    const ay = positions[ib + 1] - positions[ia + 1];
    const az = positions[ib + 2] - positions[ia + 2];
    const bx = positions[ic] - positions[ia];
    const by = positions[ic + 1] - positions[ia + 1];
    const bz = positions[ic + 2] - positions[ia + 2];
    const nxn = ay * bz - az * by;
    const nyn = az * bx - ax * bz;
    const nzn = ax * by - ay * bx;
    for (const index of [ia, ib, ic]) {
      normals[index] += nxn;
      normals[index + 1] += nyn;
      normals[index + 2] += nzn;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

export function extractIsomesh(slices: ScanSlice[], iso: number, spacing = 0.72, yaw = 0.86): IsoMesh {
  if (slices.length < 2) {
    return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangles: 0 };
  }
  const nz = slices.length;
  const nx = ISO_RESOLUTION;
  const ny = ISO_RESOLUTION;
  const field = new Float32Array(nx * ny * nz);
  const src = slices[0].trailSize;
  for (let z = 0; z < nz; z += 1) {
    const slice = slices[z];
    const peak = slice.peak || 0.0001;
    for (let y = 0; y < ny; y += 1) {
      const y0 = Math.floor((y * src) / ny);
      const y1 = Math.max(y0 + 1, Math.min(src, Math.floor(((y + 1) * src) / ny)));
      for (let x = 0; x < nx; x += 1) {
        const x0 = Math.floor((x * src) / nx);
        const x1 = Math.max(x0 + 1, Math.min(src, Math.floor(((x + 1) * src) / nx)));
        let sum = 0;
        let count = 0;
        for (let yy = y0; yy < y1; yy += 1) {
          const row = yy * src;
          for (let xx = x0; xx < x1; xx += 1) {
            sum += slice.trails[row + xx];
            count += 1;
          }
        }
        field[(z * ny + y) * nx + x] = Math.sqrt(Math.max(0, sum / Math.max(1, count)) / peak);
      }
    }
  }
  return surfaceNets(field, nx, ny, nz, iso, sliceSpacing(spacing, yaw));
}

const EMPTY_MESH: IsoMesh = {
  positions: new Float32Array(),
  normals: new Float32Array(),
  indices: new Uint32Array(),
  triangles: 0,
};

const VOXEL_FACES: Array<{ d: [number, number, number]; n: [number, number, number]; corners: Array<[number, number, number]> }> = [
  { d: [1, 0, 0], n: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
  { d: [-1, 0, 0], n: [-1, 0, 0], corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  { d: [0, 1, 0], n: [0, 0, 1], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { d: [0, -1, 0], n: [0, 0, -1], corners: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]] },
  { d: [0, 0, 1], n: [0, 1, 0], corners: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
  { d: [0, 0, -1], n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
];

/** Exposed cubes. One layer per scan slice, same vertical pitch as the isomesh. */
export function extractVoxels(slices: ScanSlice[], iso: number, spacing = 0.72, yaw = 0.86): IsoMesh {
  if (slices.length < 1) return EMPTY_MESH;
  const nz = slices.length;
  const nx = VOXEL_RESOLUTION;
  const ny = VOXEL_RESOLUTION;
  const field = new Float32Array(nx * ny * nz);
  const src = slices[0].trailSize;
  for (let z = 0; z < nz; z += 1) {
    const slice = slices[z];
    const peak = slice.peak || 0.0001;
    for (let y = 0; y < ny; y += 1) {
      const y0 = Math.floor((y * src) / ny);
      const y1 = Math.max(y0 + 1, Math.min(src, Math.floor(((y + 1) * src) / ny)));
      for (let x = 0; x < nx; x += 1) {
        const x0 = Math.floor((x * src) / nx);
        const x1 = Math.max(x0 + 1, Math.min(src, Math.floor(((x + 1) * src) / nx)));
        let sum = 0;
        let count = 0;
        for (let yy = y0; yy < y1; yy += 1) {
          const row = yy * src;
          for (let xx = x0; xx < x1; xx += 1) {
            sum += slice.trails[row + xx];
            count += 1;
          }
        }
        field[(z * ny + y) * nx + x] = Math.sqrt(Math.max(0, sum / Math.max(1, count)) / peak);
      }
    }
  }
  const pitch = sliceSpacing(spacing, yaw);
  const full = (SCAN_SLICES - 1) * pitch;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const inside = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return false;
    return field[(z * ny + y) * nx + x] >= iso;
  };
  const point = (x: number, y: number, z: number) => [
    x / nx - 0.5,
    z * pitch - full * 0.5,
    y / ny - 0.5,
  ];
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (!inside(x, y, z)) continue;
        for (const face of VOXEL_FACES) {
          if (inside(x + face.d[0], y + face.d[1], z + face.d[2])) continue;
          const base = positions.length / 3;
          for (const corner of face.corners) {
            const p = point(x + corner[0], y + corner[1], z + corner[2]);
            positions.push(p[0], p[1], p[2]);
            normals.push(face.n[0], face.n[1], face.n[2]);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}
