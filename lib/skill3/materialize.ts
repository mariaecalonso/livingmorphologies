import { surfaceNets, type IsoMesh } from "@/lib/scan/isomesh";
import { DEFAULT_MODULE_Z, moduleEnvelope, type ModuleEnvelope } from "@/lib/skill3/envelope";
import { buildNetworkVolume } from "@/lib/skill3/network-morphology";

/**
 * Skill 3 materialization. Architectural mass is the Physarum body minus its cavities.
 * Each accepted sample contributes two signed-distance fields, interpolated through
 * the real temporal gaps:
 * the outer envelope, where trail activity is the body, and the interior openings.
 * The older column field, which treats everything that is not a void as solid,
 * and the network field, which thickens the trails themselves, stay available
 * The vertical viewer asks for `field: "network"`. The default here stays the
 * carved shell so existing checks keep that result. `?material=shell` rolls back.
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

/**
 * Uniform samples of the continuous void distance through normalized Z.
 * The isosurface reads this field. It is not a stack of extruded plates.
 */
export const MATERIAL_LAYERS = 24;

/**
 * Width, in mask pixels, of the ramp from void to mass.
 * The zero crossing sits at 0.5 so the existing 0.48 isosurface threshold
 * stays on the void boundary.
 */
export const SDF_MASS_BAND = 1;

/** Mesh lattice. Masks stay at the sample resolution and are min-pooled into this. */
export const MESH_RESOLUTION = 64;

/**
 * Outer-envelope activity, as a fraction of the p99 positive-trail reference.
 * Measured on the void-field Z0 plate after the viewer's 128 average:
 * 0.02 of the peak (the current void floor) covers 21% of the plate and is the fat halo.
 * 0.40 of p99, the Skill 2 dense-core cut, covers 3.6% and breaks into filaments.
 * 0.18 of p99 covers 10% and keeps one dominant body at 8% of the plate.
 */
export const ENVELOPE_REFERENCE_QUANTILE = 0.99;
export const ENVELOPE_LEVEL = 0.18;

/**
 * A disconnected trail island is kept when it is at least this fraction of the
 * largest envelope component. Smaller islands are dropped. Secondary lobes stay.
 */
export const ENVELOPE_LOBE_FRACTION = 0.08;

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

/** Squared Euclidean distance to the nearest set pixel. Empty rows stay unmarked. */
function distanceSquared(feature: Uint8Array, size: number) {
  const big = 2 * (size - 1) * (size - 1) + 1;
  const rows = new Float64Array(size * size);
  const line = new Float64Array(size);
  for (let y = 0; y < size; y += 1) {
    let any = false;
    for (let x = 0; x < size; x += 1) if (feature[y * size + x]) any = true;
    const row = y * size;
    if (!any) {
      rows.fill(big, row, row + size);
      continue;
    }
    for (let x = 0; x < size; x += 1) line[x] = feature[row + x] ? 0 : big;
    distanceSquaredLine(line, rows, row);
  }
  const out = new Float64Array(size * size);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) line[y] = rows[y * size + x];
    distanceSquaredLine(line, out, x, size);
  }
  return out;
}

/** Felzenszwalb 1D squared distance. `line` is read fully before `out` is written. */
function distanceSquaredLine(line: Float64Array, out: Float64Array, offset: number, stride = 1) {
  const n = line.length;
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;
  for (let q = 1; q < n; q += 1) {
    let s = ((line[q] + q * q) - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (k > 0 && s <= z[k]) {
      k -= 1;
      s = ((line[q] + q * q) - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const delta = q - v[k];
    out[offset + q * stride] = delta * delta + line[v[k]];
  }
}

/**
 * Signed distance to the void boundary, in pixels.
 * Positive inside architectural mass, negative inside void, zero on the boundary.
 */
export function voidSignedDistance(voidMask: Uint8Array, size: number) {
  const count = size * size;
  const sdf = new Float32Array(count);
  let voids = 0;
  for (let i = 0; i < count; i += 1) if (voidMask[i]) voids += 1;
  if (voids === 0) {
    sdf.fill(size);
    return sdf;
  }
  if (voids === count) {
    sdf.fill(-size);
    return sdf;
  }
  const mass = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) mass[i] = voidMask[i] ? 0 : 1;
  const toMass = distanceSquared(mass, size);
  const toVoid = distanceSquared(voidMask, size);
  for (let i = 0; i < count; i += 1) {
    const distance = Math.sqrt(voidMask[i] ? toMass[i] : toVoid[i]);
    if (!Number.isFinite(distance)) throw new Error("void distance left the finite domain");
    sdf[i] = voidMask[i] ? -distance : distance;
  }
  return sdf;
}

/** Maps the zero crossing to 0.5. Values beyond one band saturate at void or mass. */
export function massFromSignedDistance(sdf: number, band = SDF_MASS_BAND) {
  const mass = 0.5 + sdf / (2 * band);
  if (mass <= 0) return 0;
  if (mass >= 1) return 1;
  return mass;
}

/** p99 of the positive trail. Zero when the plate is empty. */
export function envelopeReference(trails: ArrayLike<number>, quantile = ENVELOPE_REFERENCE_QUANTILE) {
  const pool: number[] = [];
  for (let i = 0; i < trails.length; i += 1) if (trails[i] > 0) pool.push(trails[i]);
  if (pool.length === 0) return 0;
  pool.sort((left, right) => left - right);
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(quantile * (pool.length - 1))))];
}

function componentCells(mask: Uint8Array, size: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const components: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const x = index % size;
      const y = (index - x) / size;
      const next = [x > 0 ? index - 1 : -1, x + 1 < size ? index + 1 : -1, y > 0 ? index - size : -1, y + 1 < size ? index + size : -1];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    components.push(cells);
  }
  return components;
}

/**
 * Active Physarum body. Trail is compared with the p99 reference, closed by one
 * cell so adjacent filaments of the same body join, then islands below the lobe
 * fraction are removed.
 */
export function envelopeMask(sample: VoidSample, level = ENVELOPE_LEVEL): Uint8Array {
  const size = sample.trailSize;
  const count = size * size;
  const mask = new Uint8Array(count);
  const reference = envelopeReference(sample.trails);
  if (!(reference > 0)) return mask;
  const cutoff = reference * level;
  for (let i = 0; i < count; i += 1) if (sample.trails[i] >= cutoff) mask[i] = 1;
  const radius = Math.max(0, Math.round(size / 128));
  const closed = erodeMask(dilateMask(mask, size, radius), size, radius, 0);
  const components = componentCells(closed, size);
  if (components.length === 0) return closed;
  let largest = 0;
  for (const cells of components) if (cells.length > largest) largest = cells.length;
  const minimum = Math.max(1, largest * ENVELOPE_LOBE_FRACTION);
  const kept = new Uint8Array(count);
  for (const cells of components) {
    if (cells.length < minimum) continue;
    for (const cell of cells) kept[cell] = 1;
  }
  return kept;
}

/** Positive inside the envelope, negative outside it. */
export function envelopeSignedDistance(sample: VoidSample, level = ENVELOPE_LEVEL) {
  const body = envelopeMask(sample, level);
  const outside = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i += 1) outside[i] = body[i] ? 0 : 1;
  return voidSignedDistance(outside, sample.trailSize);
}

/** One 3×3 average. The zero crossing stays on the distance field; the mesh is not smoothed. */
function smoothSignedDistance(sdf: Float32Array, size: number) {
  const out = new Float32Array(sdf.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= size) continue;
          sum += sdf[yy * size + xx];
          weight += 1;
        }
      }
      out[y * size + x] = weight ? sum / weight : 0;
    }
  }
  return out;
}

/**
 * Column mass field. Each accepted sample becomes a void signed-distance field,
 * and everything that is not an opening or the exterior is solid. Kept so the
 * carved-column result can be compared with the dual field.
 */
export function massVolume(samples: readonly VoidSample[], layers = MATERIAL_LAYERS): MassVolume {
  if (samples.length < 1) throw new Error("mass volume needs an accepted sample");
  const ordered = [...samples].sort((left, right) => left.z - right.z);
  const size = ordered[0].trailSize;
  const plates = ordered.map((sample) => {
    if (sample.trailSize !== size) throw new Error("accepted samples must share one resolution");
    const mask = openingMasks(sample);
    const voids = new Uint8Array(size * size);
    for (let i = 0; i < voids.length; i += 1) voids[i] = mask.opening[i] | mask.exterior[i];
    return { z: sample.z, sdf: voidSignedDistance(voids, size), openingCount: mask.openingCount };
  });
  return volumeFromPlates(size, plates, layers);
}

type DistancePlate = { z: number; sdf: Float32Array; openingCount: number };

function volumeFromPlates(size: number, plates: readonly DistancePlate[], layers: number): MassVolume {
  const nz = Math.max(2, layers);
  const field = new Float32Array(size * size * nz);
  const z: number[] = [];
  for (let layer = 0; layer < nz; layer += 1) {
    const height = layer / (nz - 1);
    z.push(height);
    const blend = bracket(plates, height);
    const base = layer * size * size;
    for (let i = 0; i < size * size; i += 1) {
      const sdf = blend.a.sdf[i] + (blend.b.sdf[i] - blend.a.sdf[i]) * blend.t;
      const mass = massFromSignedDistance(sdf);
      if (!Number.isFinite(mass)) throw new Error("continuous mass field left the finite domain");
      field[base + i] = mass;
    }
  }
  return { field, nx: size, ny: size, nz, z, openingCounts: plates.map((plate) => plate.openingCount) };
}

/**
 * Dual mass field. The envelope SDF limits where material may exist. The opening
 * SDF cuts cavities out of that body. Their intersection is the minimum of the
 * two distances. Every accepted sample is used, at its own temporal Z.
 */
export function dualMassVolume(samples: readonly VoidSample[], layers = MATERIAL_LAYERS): MassVolume {
  if (samples.length < 1) throw new Error("mass volume needs an accepted sample");
  const ordered = [...samples].sort((left, right) => left.z - right.z);
  const size = ordered[0].trailSize;
  const plates = ordered.map((sample) => {
    if (sample.trailSize !== size) throw new Error("accepted samples must share one resolution");
    const openings = openingMasks(sample);
    const envelope = envelopeSignedDistance(sample);
    const cavities = voidSignedDistance(openings.opening, size);
    const combined = new Float32Array(size * size);
    for (let i = 0; i < combined.length; i += 1) combined[i] = Math.min(envelope[i], cavities[i]);
    return { z: sample.z, sdf: smoothSignedDistance(combined, size), openingCount: openings.openingCount };
  });
  return pruneMassFragments(volumeFromPlates(size, plates, layers));
}

/** Drops 3D mass components smaller than the lobe fraction of the largest body. */
function pruneMassFragments(volume: MassVolume, fraction = ENVELOPE_LOBE_FRACTION): MassVolume {
  const { field, nx, ny, nz } = volume;
  const seen = new Uint8Array(field.length);
  const stack: number[] = [];
  const components: number[][] = [];
  for (let start = 0; start < field.length; start += 1) {
    if (seen[start] || field[start] < 0.5) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const z = Math.floor(index / (nx * ny));
      const rem = index - z * nx * ny;
      const y = Math.floor(rem / nx);
      const x = rem - y * nx;
      const next = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - nx * ny : -1,
        z + 1 < nz ? index + nx * ny : -1,
      ];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || field[neighbor] < 0.5) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    components.push(cells);
  }
  if (components.length <= 1) return volume;
  let largest = 0;
  for (const cells of components) if (cells.length > largest) largest = cells.length;
  const minimum = Math.max(1, largest * fraction);
  const next = field.slice();
  for (const cells of components) {
    if (cells.length >= minimum) continue;
    for (const cell of cells) next[cell] = 0;
  }
  return { ...volume, field: next };
}

/** The field the isosurface reads. Dual mass is pruned again after pooling. */
export function prepareMassVolume(samples: readonly VoidSample[], field: "dual" | "column" = "dual") {
  const built = poolMass((field === "column" ? massVolume : dualMassVolume)(samples));
  return field === "column" ? built : pruneMassFragments(built);
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

export type OpeningField = "dual" | "column" | "network";

/** The mass field. Threshold, module size, spacing, and yaw are not inputs. */
export function openingFieldVolume(samples: readonly VoidSample[], field: OpeningField = "dual"): MassVolume {
  return field === "network" ? buildNetworkVolume(samples) : prepareMassVolume(samples, field);
}

/** Isosurface or voxels of an already built field, placed in the module. */
export function meshFromOpeningVolume(
  volume: MassVolume,
  options: { mode: "isomesh" | "voxel"; iso: number; sizeZ?: number },
): IsoMesh {
  const envelope = moduleEnvelope(options.sizeZ ?? DEFAULT_MODULE_Z);
  if (options.mode === "voxel") return envelopeVoxels(volume, options.iso, envelope);
  const unit = surfaceNets(volume.field, volume.nx, volume.ny, volume.nz, options.iso, 1, volume.z);
  return placeIsomesh(unit, envelope);
}

/**
 * Isosurface or voxels of one continuous architectural mass field, placed in the
 * fixed 20×20×20 module. `samples` is the full accepted sequence. The default
 * field is the Physarum envelope minus interior voids. `field: "column"` keeps
 * the previous void-only solid. `field: "network"` thickens the trail network.
 */
export function materializeOpenings(
  samples: readonly VoidSample[],
  options: { mode: "isomesh" | "voxel"; iso: number; spacing: number; yaw: number; sizeZ?: number; field?: OpeningField },
): IsoMesh {
  return meshFromOpeningVolume(openingFieldVolume(samples, options.field ?? "dual"), {
    mode: options.mode,
    iso: options.iso,
    sizeZ: options.sizeZ,
  });
}
