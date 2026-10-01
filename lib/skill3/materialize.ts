import { surfaceNets, type IsoMesh } from "@/lib/scan/isomesh";
import { DEFAULT_MODULE_Z, moduleEnvelope, type ModuleEnvelope } from "@/lib/skill3/envelope";

/**
 * Skill 3 materialization. The architectural void is the dark opening, not the trail.
 * High scalar values are the surrounding mass. The isosurface is that mass, so each
 * cavity is the inner surface of the solid rather than a cast of the trail filaments.
 */

/** Normalized trail at or below this fraction of the sample peak is empty. */
export const OPENING_LEVEL = 0.02;

/** Interior empty components smaller than this stay in the mass. */
export const MIN_OPENING_CELLS = 12;

/**
 * Morphological opening of the void, in cells at a 128-wide sample.
 * Thinner cracks become mass. Openings and fused bridges wider than this stay void.
 */
export const VOID_OPENING_RADIUS = 3;

/** Uniform layers used to interpolate the stacked void masks through Z. */
export const MATERIAL_LAYERS = 24;

/** Mesh lattice. Masks stay at the sample resolution and are min-pooled into this. */
export const MESH_RESOLUTION = 64;

export type VoidSample = {
  z: number;
  trails: ArrayLike<number>;
  trailSize: number;
  peak: number;
};

export type SampleMasks = {
  opening: Uint8Array;
  exterior: Uint8Array;
  openingCount: number;
  size: number;
};

function diskOffsets(radius: number) {
  const offsets: Array<[number, number]> = [];
  const limit = radius * radius;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= limit) offsets.push([x, y]);
    }
  }
  return offsets;
}

function erodeMask(mask: Uint8Array, size: number, radius: number, outside = 0) {
  if (radius <= 0) return mask;
  const offsets = diskOffsets(radius);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let keep = 1;
      for (const [dx, dy] of offsets) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) {
          if (outside === 0) keep = 0;
          if (keep === 0) break;
          continue;
        }
        if (mask[yy * size + xx] === 0) keep = 0;
        if (keep === 0) break;
      }
      out[y * size + x] = keep;
    }
  }
  return out;
}

function dilateMask(mask: Uint8Array, size: number, radius: number) {
  if (radius <= 0) return mask;
  const offsets = diskOffsets(radius);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let on = 0;
      for (const [dx, dy] of offsets) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        if (mask[yy * size + xx]) {
          on = 1;
          break;
        }
      }
      out[y * size + x] = on;
    }
  }
  return out;
}

/** Drops void cracks thinner than the opening radius and restores the fat cavities. */
export function openedVoids(empty: Uint8Array, size: number) {
  const radius = Math.max(0, Math.round((VOID_OPENING_RADIUS * size) / 128));
  return dilateMask(erodeMask(empty, size, radius, 1), size, radius);
}

/** Interior empty components are openings. Empty components that touch the border are exterior. */
export function openingMasks(sample: VoidSample, openingLevel = OPENING_LEVEL): SampleMasks {
  const size = sample.trailSize;
  const count = size * size;
  const peak = sample.peak > 0 ? sample.peak : 1e-6;
  const empty = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    if (sample.trails[i] / peak <= openingLevel) empty[i] = 1;
  }
  const voids = openedVoids(empty, size);

  const opening = new Uint8Array(count);
  const exterior = new Uint8Array(count);
  const seen = new Uint8Array(count);
  const stack: number[] = [];
  let openingCount = 0;

  for (let start = 0; start < count; start += 1) {
    if (!voids[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const cells: number[] = [];
    let touchesBorder = false;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const x = index % size;
      const y = (index - x) / size;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) touchesBorder = true;
      const next = [x > 0 ? index - 1 : -1, x + 1 < size ? index + 1 : -1, y > 0 ? index - size : -1, y + 1 < size ? index + size : -1];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || !voids[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (touchesBorder) {
      for (const cell of cells) exterior[cell] = 1;
      continue;
    }
    if (cells.length < MIN_OPENING_CELLS) continue;
    openingCount += 1;
    for (const cell of cells) opening[cell] = 1;
  }

  return { opening, exterior, openingCount, size };
}

export type MassVolume = {
  field: Float32Array;
  nx: number;
  ny: number;
  nz: number;
  /** Normalized layer positions, 0 at the first accepted sample and 1 at the last. */
  z: number[];
  openingCounts: number[];
};

function bracket<T extends { z: number }>(masks: readonly T[], z: number) {
  if (z <= masks[0].z) return { a: masks[0], b: masks[0], t: 0 };
  const last = masks[masks.length - 1];
  if (z >= last.z) return { a: last, b: last, t: 0 };
  let index = 0;
  while (index < masks.length - 2 && masks[index + 1].z < z) index += 1;
  const a = masks[index];
  const b = masks[index + 1];
  const span = b.z - a.z;
  return { a, b, t: span > 1e-8 ? (z - a.z) / span : 0 };
}

/**
 * Stacks opening and exterior masks on the sample Z positions, lerps them through
 * `layers`, then sets mass = 1 - void - exterior. High values are architectural mass.
 */
export function massVolume(samples: readonly VoidSample[], layers = MATERIAL_LAYERS): MassVolume {
  if (samples.length < 1) throw new Error("mass volume needs an accepted sample");
  const ordered = [...samples].sort((left, right) => left.z - right.z);
  const size = ordered[0].trailSize;
  const masks = ordered.map((sample) => {
    if (sample.trailSize !== size) throw new Error("accepted samples must share one resolution");
    return { z: sample.z, ...openingMasks(sample) };
  });
  const nz = Math.max(2, layers);
  const field = new Float32Array(size * size * nz);
  const z: number[] = [];
  for (let layer = 0; layer < nz; layer += 1) {
    const height = layer / (nz - 1);
    z.push(height);
    const blend = bracket(masks, height);
    const base = layer * size * size;
    for (let i = 0; i < size * size; i += 1) {
      const voidValue = blend.a.opening[i] + (blend.b.opening[i] - blend.a.opening[i]) * blend.t;
      const outside = blend.a.exterior[i] + (blend.b.exterior[i] - blend.a.exterior[i]) * blend.t;
      field[base + i] = Math.max(0, 1 - voidValue - outside);
    }
  }
  return { field, nx: size, ny: size, nz, z, openingCounts: masks.map((mask) => mask.openingCount) };
}

/** Averages XY. A cavity that fills its bin stays open; a mixed bin keeps partial mass. */
export function poolMass(volume: MassVolume, resolution = MESH_RESOLUTION): MassVolume {
  if (volume.nx <= resolution && volume.ny <= resolution) return volume;
  const nx = resolution;
  const ny = resolution;
  const field = new Float32Array(nx * ny * volume.nz);
  for (let z = 0; z < volume.nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      const y0 = Math.floor((y * volume.ny) / ny);
      const y1 = Math.max(y0 + 1, Math.min(volume.ny, Math.floor(((y + 1) * volume.ny) / ny)));
      for (let x = 0; x < nx; x += 1) {
        const x0 = Math.floor((x * volume.nx) / nx);
        const x1 = Math.max(x0 + 1, Math.min(volume.nx, Math.floor(((x + 1) * volume.nx) / nx)));
        let sum = 0;
        let covered = 0;
        for (let yy = y0; yy < y1; yy += 1) {
          const row = (z * volume.ny + yy) * volume.nx;
          for (let xx = x0; xx < x1; xx += 1) {
            sum += volume.field[row + xx];
            covered += 1;
          }
        }
        field[(z * ny + y) * nx + x] = covered ? sum / covered : 0;
      }
    }
  }
  return { ...volume, field, nx, ny };
}

const VOXEL_FACES: Array<{ d: [number, number, number]; n: [number, number, number]; corners: Array<[number, number, number]> }> = [
  { d: [1, 0, 0], n: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
  { d: [-1, 0, 0], n: [-1, 0, 0], corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  { d: [0, 1, 0], n: [0, 0, 1], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { d: [0, -1, 0], n: [0, 0, -1], corners: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]] },
  { d: [0, 0, 1], n: [0, 1, 0], corners: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
  { d: [0, 0, -1], n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
];

/** Unit-span isosurface scaled into the module. XY uses the fixed 20; Z uses the module height. */
function placeIsomesh(mesh: IsoMesh, envelope: ModuleEnvelope): IsoMesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  const sx = envelope.sizeX;
  const sy = envelope.sizeY;
  const sz = envelope.sizeZ;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = mesh.positions[i] * sx;
    positions[i + 1] = mesh.positions[i + 1] * sz;
    positions[i + 2] = mesh.positions[i + 2] * sy;
    const nx = mesh.normals[i] / sx;
    const ny = mesh.normals[i + 1] / sz;
    const nz = mesh.normals[i + 2] / sy;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / length;
    normals[i + 1] = ny / length;
    normals[i + 2] = nz / length;
  }
  return { positions, normals, indices: mesh.indices, triangles: mesh.triangles };
}

/**
 * One voxel per mass-field cell, tiled across the module.
 * A cell is mass or void from that same field. The box stays inside the envelope.
 */
function envelopeVoxels(volume: MassVolume, iso: number, envelope: ModuleEnvelope): IsoMesh {
  const { field, nx, ny, nz } = volume;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const inside = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return false;
    return field[(z * ny + y) * nx + x] >= iso;
  };
  const place = (x: number, y: number, z: number) => [
    (x / nx) * envelope.sizeX - envelope.sizeX / 2,
    (z / nz) * envelope.sizeZ - envelope.sizeZ / 2,
    (y / ny) * envelope.sizeY - envelope.sizeY / 2,
  ];
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (!inside(x, y, z)) continue;
        for (const face of VOXEL_FACES) {
          if (inside(x + face.d[0], y + face.d[1], z + face.d[2])) continue;
          const base = positions.length / 3;
          for (const corner of face.corners) {
            const placed = place(x + corner[0], y + corner[1], z + corner[2]);
            positions.push(placed[0], placed[1], placed[2]);
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

/**
 * Isosurface or voxels of one architectural mass field, placed in the fixed 20×20×20 module.
 * Event spacing stays in the normalized sample Z.
 */
export function materializeOpenings(
  samples: readonly VoidSample[],
  options: { mode: "isomesh" | "voxel"; iso: number; spacing: number; yaw: number; sizeZ?: number },
): IsoMesh {
  const envelope = moduleEnvelope(options.sizeZ ?? DEFAULT_MODULE_Z);
  const volume = poolMass(massVolume(samples));
  if (options.mode === "voxel") return envelopeVoxels(volume, options.iso, envelope);
  const unit = surfaceNets(volume.field, volume.nx, volume.ny, volume.nz, options.iso, 1, volume.z);
  return placeIsomesh(unit, envelope);
}
