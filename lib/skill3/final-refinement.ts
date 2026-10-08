import { meshFromOpeningVolume, type MassVolume } from "@/lib/skill3/materialize";
import { MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z } from "@/lib/skill3/envelope";

/**
 * Derived preview of one already generated representative.
 * The source volume is never written. The same field always produces the same preview.
 */

export const FINAL_ISO = 0.48;

const MAJOR_VOID_CELLS = 60;
const MICRO_PLAN_HOLE = 12;
const MAJOR_PLAN_HOLE = 28;
const FILL_PINHOLE = 6;
const PROTECT_OPENING = 18;
const FILL_ENCLOSED_VOID = 20;
const STRONG_FIELD = 0.7;
const THIN_RADIUS = 1.15;

export const FINAL_REFINEMENT_OPERATIONS = [
  "Lateral continuity: one plan smooth, then a gap merges only when two plan neighbors touch and the field is already above 0.2",
  "Thickness follows the field: a strong thin strand gains one plan step; a sparse strand stays thin; vertical steps are not thickened",
  "Voids: pinholes under 6 cells fill; openings of 18 or more cells cut 5 slices through field below 0.84 and 3 cells sideways below 0.7",
  "Weak skin: two peels where the field is below 0.62 and thicker mass sits behind it",
  "Surface: field-scaled distance, two light Z blends and one plan blend, held 65% to that distance so caps stay cut",
  "Identity: new mass stays inside a 2-cell plan shell and cannot grow in Z; a core needs field 0.7 and radius 2.8",
] as const;

export type FinalMorphologyMeasures = {
  triangles: number;
  components: number;
  minimumThickness: number;
  majorVoids: number;
  fitsModule: boolean;
};

const FACE: Array<[number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function at(x: number, y: number, z: number, nx: number, ny: number) {
  return (z * ny + y) * nx + x;
}

function solidOf(field: Float32Array, iso: number) {
  const mask = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i += 1) if (field[i] >= iso) mask[i] = 1;
  return mask;
}

function blendZ(field: Float32Array, nx: number, ny: number, nz: number, passes: number, side: number) {
  const center = 1 - side * 2;
  const plane = nx * ny;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = field.slice();
    for (let z = 0; z < nz; z += 1) {
      const below = z > 0 ? z - 1 : z;
      const above = z + 1 < nz ? z + 1 : z;
      const base = z * plane;
      const baseBelow = below * plane;
      const baseAbove = above * plane;
      for (let i = 0; i < plane; i += 1) {
        next[base + i] = field[baseBelow + i] * side + field[base + i] * center + field[baseAbove + i] * side;
      }
    }
    field.set(next);
  }
}

function dilate6(mask: Uint8Array, nx: number, ny: number, nz: number, radius: number) {
  let current = mask;
  for (let step = 0; step < radius; step += 1) {
    const next = current.slice();
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const index = at(x, y, z, nx, ny);
          if (!current[index]) continue;
          for (const [dx, dy, dz] of FACE) {
            const xx = x + dx;
            const yy = y + dy;
            const zz = z + dz;
            if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
            next[at(xx, yy, zz, nx, ny)] = 1;
          }
        }
      }
    }
    current = next;
  }
  return current;
}

function components(mask: Uint8Array, nx: number, ny: number, nz: number, want: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const found: number[][] = [];
  const plane = nx * ny;
  for (let start = 0; start < mask.length; start += 1) {
    if (seen[start] || mask[start] !== want) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    let touchesBorder = false;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const z = Math.floor(index / plane);
      const rem = index - z * plane;
      const y = Math.floor(rem / nx);
      const x = rem - y * nx;
      if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) touchesBorder = true;
      for (const [dx, dy, dz] of FACE) {
        const xx = x + dx;
        const yy = y + dy;
        const zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        const neighbor = at(xx, yy, zz, nx, ny);
        if (seen[neighbor] || mask[neighbor] !== want) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    found.push(touchesBorder ? [] : cells);
  }
  return found.filter((cells) => cells.length > 0);
}

function solidComponents(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const found: number[][] = [];
  const plane = nx * ny;
  for (let start = 0; start < mask.length; start += 1) {
    if (seen[start] || !mask[start]) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const z = Math.floor(index / plane);
      const rem = index - z * plane;
      const y = Math.floor(rem / nx);
      const x = rem - y * nx;
      for (const [dx, dy, dz] of FACE) {
        const xx = x + dx;
        const yy = y + dy;
        const zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        const neighbor = at(xx, yy, zz, nx, ny);
        if (seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    found.push(cells);
  }
  return found;
}

function distanceSquaredLine(line: Float32Array, out: Float32Array) {
  const n = line.length;
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
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
    out[q] = delta * delta + line[v[k]];
  }
}

function distanceToVoid(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const inf = 1e7;
  const dist = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) dist[i] = mask[i] ? inf : 0;
  const width = Math.max(nx, ny, nz);
  const line = new Float32Array(width);
  const out = new Float32Array(width);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      const base = at(0, y, z, nx, ny);
      for (let x = 0; x < nx; x += 1) line[x] = dist[base + x];
      distanceSquaredLine(line.subarray(0, nx), out.subarray(0, nx));
      for (let x = 0; x < nx; x += 1) dist[base + x] = out[x];
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      for (let y = 0; y < ny; y += 1) line[y] = dist[at(x, y, z, nx, ny)];
      distanceSquaredLine(line.subarray(0, ny), out.subarray(0, ny));
      for (let y = 0; y < ny; y += 1) dist[at(x, y, z, nx, ny)] = out[y];
    }
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      for (let z = 0; z < nz; z += 1) line[z] = dist[at(x, y, z, nx, ny)];
      distanceSquaredLine(line.subarray(0, nz), out.subarray(0, nz));
      for (let z = 0; z < nz; z += 1) dist[at(x, y, z, nx, ny)] = Math.sqrt(out[z]);
    }
  }
  return dist;
}

const PLAN: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function dilatePlan(mask: Uint8Array, nx: number, ny: number, nz: number, radius: number) {
  let current = mask;
  for (let step = 0; step < radius; step += 1) {
    const next = current.slice();
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          if (!current[at(x, y, z, nx, ny)]) continue;
          for (const [dx, dy] of PLAN) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
            next[at(xx, yy, z, nx, ny)] = 1;
          }
        }
      }
    }
    current = next;
  }
  return current;
}

/** One sideways step, and only on a strand the field already marks as strong. */
function thickenByField(
  mask: Uint8Array,
  protect: Uint8Array,
  allowed: Uint8Array,
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
) {
  const edt = distanceToVoid(mask, nx, ny, nz);
  const next = mask.slice();
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const index = at(x, y, z, nx, ny);
        const radius = edt[index];
        if (!mask[index] || field[index] < STRONG_FIELD || !(radius > 0) || radius >= THIN_RADIUS) continue;
        for (const [dx, dy] of PLAN) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
          const neighbor = at(xx, yy, z, nx, ny);
          if (mask[neighbor] || protect[neighbor] || !allowed[neighbor] || field[neighbor] < 0.35) continue;
          next[neighbor] = 1;
        }
      }
    }
  }
  return next;
}

function mergeWhereFieldSupports(
  mask: Uint8Array,
  protect: Uint8Array,
  allowed: Uint8Array,
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
) {
  const next = mask.slice();
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const index = at(x, y, z, nx, ny);
        if (mask[index] || protect[index] || !allowed[index] || field[index] < 0.2) continue;
        let supports = 0;
        for (const [dx, dy] of PLAN) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
          if (mask[at(xx, yy, z, nx, ny)]) supports += 1;
        }
        if (supports >= 2) next[index] = 1;
      }
    }
  }
  return next;
}

function dropFragments(mask: Uint8Array, nx: number, ny: number, nz: number): Uint8Array<ArrayBuffer> {
  const found = solidComponents(mask, nx, ny, nz);
  if (found.length <= 1) return mask as Uint8Array<ArrayBuffer>;
  let largest = 0;
  for (const cells of found) if (cells.length > largest) largest = cells.length;
  const minimum = Math.max(24, largest * 0.025);
  const next = mask.slice() as Uint8Array<ArrayBuffer>;
  for (const cells of found) {
    if (cells.length >= minimum) continue;
    for (const cell of cells) next[cell] = 0;
  }
  return next;
}

function planHoles(mask: Uint8Array, z: number, nx: number, ny: number) {
  const seen = new Uint8Array(nx * ny);
  const found: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < nx * ny; start += 1) {
    if (seen[start] || mask[at(start % nx, Math.floor(start / nx), z, nx, ny)]) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    let border = false;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % nx;
      const y = Math.floor(index / nx);
      cells.push(index);
      if (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) border = true;
      const next = [x > 0 ? index - 1 : -1, x + 1 < nx ? index + 1 : -1, y > 0 ? index - nx : -1, y + 1 < ny ? index + nx : -1];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor]) continue;
        const xx = neighbor % nx;
        const yy = Math.floor(neighbor / nx);
        if (mask[at(xx, yy, z, nx, ny)]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (!border) found.push(cells);
  }
  return found;
}

function fillPinholes(mask: Uint8Array, protect: Uint8Array, nx: number, ny: number, nz: number) {
  const next = mask.slice();
  for (let z = 0; z < nz; z += 1) {
    for (const hole of planHoles(mask, z, nx, ny)) {
      if (hole.length >= FILL_PINHOLE) continue;
      for (const cell of hole) {
        const x = cell % nx;
        const y = Math.floor(cell / nx);
        const index = at(x, y, z, nx, ny);
        if (!protect[index]) next[index] = 1;
      }
    }
  }
  return next;
}

function markLargeOpenings(mask: Uint8Array, protect: Uint8Array, nx: number, ny: number, nz: number) {
  for (let z = 0; z < nz; z += 1) {
    for (const hole of planHoles(mask, z, nx, ny)) {
      if (hole.length < PROTECT_OPENING) continue;
      for (const cell of hole) {
        const x = cell % nx;
        const y = Math.floor(cell / nx);
        protect[at(x, y, z, nx, ny)] = 1;
      }
    }
  }
}

/** Peel weak skin off a thick body. A sparse member, with nothing thicker behind it, stays. */
function shedWeakSkin(
  mask: Uint8Array,
  protect: Uint8Array,
  core: Uint8Array,
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
): Uint8Array<ArrayBuffer> {
  let current = mask as Uint8Array<ArrayBuffer>;
  for (let pass = 0; pass < 2; pass += 1) {
    const edt = distanceToVoid(current, nx, ny, nz);
    const next = current.slice() as Uint8Array<ArrayBuffer>;
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const index = at(x, y, z, nx, ny);
          const radius = edt[index];
          if (!current[index] || protect[index] || core[index] || !(radius > 0) || radius > 1.2 || field[index] >= 0.62) continue;
          let backed = false;
          for (const [dx, dy, dz] of FACE) {
            const xx = x + dx;
            const yy = y + dy;
            const zz = z + dz;
            if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
            const neighbor = at(xx, yy, zz, nx, ny);
            if (current[neighbor] && edt[neighbor] >= 2) backed = true;
          }
          if (backed) next[index] = 0;
        }
      }
    }
    current = next;
  }
  return current;
}

/** Existing openings cut farther through weak field. Strong trail cells stay. */
function deepenOpenings(
  mask: Uint8Array,
  protect: Uint8Array,
  field: Float32Array,
  nx: number,
  ny: number,
  nz: number,
) {
  const plane = nx * ny;
  const depth = new Int16Array(mask.length);
  depth.fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!protect[i]) continue;
    depth[i] = 0;
    queue.push(i);
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const step = depth[index];
    if (step >= 5) continue;
    const z = Math.floor(index / plane);
    const rem = index - z * plane;
    const y = Math.floor(rem / nx);
    const x = rem - y * nx;
    const clear = (xx: number, yy: number, zz: number, limit: number, fieldLimit: number) => {
      if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) return;
      const neighbor = at(xx, yy, zz, nx, ny);
      if (depth[neighbor] !== -1 || !mask[neighbor] || field[neighbor] >= fieldLimit) return;
      if (step + 1 > limit) return;
      mask[neighbor] = 0;
      protect[neighbor] = 1;
      depth[neighbor] = step + 1;
      queue.push(neighbor);
    };
    clear(x, y, z - 1, 5, 0.84);
    clear(x, y, z + 1, 5, 0.84);
    if (step < 3) {
      for (const [dx, dy] of PLAN) clear(x + dx, y + dy, z, 3, 0.7);
    }
  }
}
function smoothPlan(field: Float32Array, nx: number, ny: number, nz: number, radius: number, passes: number, weight: number) {
  let current = field;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          let sum = 0;
          let count = 0;
          for (let dy = -radius; dy <= radius; dy += 1) {
            const yy = y + dy;
            if (yy < 0 || yy >= ny) continue;
            for (let dx = -radius; dx <= radius; dx += 1) {
              const xx = x + dx;
              if (xx < 0 || xx >= nx) continue;
              sum += current[at(xx, yy, z, nx, ny)];
              count += 1;
            }
          }
          const index = at(x, y, z, nx, ny);
          next[index] = current[index] * (1 - weight) + (sum / count) * weight;
        }
      }
    }
    current = next;
  }
  return current;
}

/** Rounded shell of the consolidated mask. The zero crossing is the isosurface. */
function shellField(
  mask: Uint8Array,
  protect: Uint8Array,
  core: Uint8Array,
  allowed: Uint8Array,
  source: Float32Array,
  nx: number,
  ny: number,
  nz: number,
) {
  const inside = distanceToVoid(mask, nx, ny, nz);
  const inverted = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) inverted[i] = mask[i] ? 0 : 1;
  const outside = distanceToVoid(inverted, nx, ny, nz);
  const sdf = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) {
      sdf[i] = -Math.min(outside[i], 3.2);
      continue;
    }
    const strength = Math.min(1, Math.max(0, (source[i] - FINAL_ISO) / 0.42));
    sdf[i] = Math.min(inside[i], 0.85 + strength * 2.15);
  }
  const unsmoothed = sdf.slice();
  blendZ(sdf, nx, ny, nz, 2, 0.1);
  const rounded = smoothPlan(sdf, nx, ny, nz, 1, 1, 0.28);
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    let distance = rounded[i] * 0.35 + unsmoothed[i] * 0.65;
    if (protect[i]) distance = Math.min(distance, -2.2);
    if (core[i]) distance = Math.max(distance, 0.45);
    if (distance > 0 && !allowed[i]) distance = -0.25;
    let value = FINAL_ISO + distance * 0.18;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    out[i] = value;
  }
  return out;
}

/** A new field. `volume` and its samples stay unchanged. */
export function refineRepresentativeField(volume: MassVolume): MassVolume {
  const { nx, ny, nz } = volume;
  const source = volume.field;
  const soft = smoothPlan(source.slice(), nx, ny, nz, 1, 1, 0.22);
  const original = solidOf(source, FINAL_ISO);
  const originalDistance = distanceToVoid(original, nx, ny, nz);
  const allowed = dilatePlan(original, nx, ny, nz, 2);
  const core = new Uint8Array(original.length);
  for (let i = 0; i < original.length; i += 1) {
    if (original[i] && originalDistance[i] >= 2.8 && source[i] >= STRONG_FIELD) core[i] = 1;
  }
  let mask = solidOf(soft, FINAL_ISO);
  for (let i = 0; i < mask.length; i += 1) {
    if (core[i]) mask[i] = 1;
    else if (mask[i] && !allowed[i]) mask[i] = 0;
  }
  const protect = new Uint8Array(mask.length);
  for (const cells of components(mask, nx, ny, nz, 0)) {
    if (cells.length >= FILL_ENCLOSED_VOID) {
      for (const cell of cells) protect[cell] = 1;
      continue;
    }
    for (const cell of cells) if (!core[cell]) mask[cell] = 1;
  }
  markLargeOpenings(mask, protect, nx, ny, nz);
  mask = thickenByField(mask, protect, allowed, source, nx, ny, nz);
  mask = mergeWhereFieldSupports(mask, protect, allowed, source, nx, ny, nz);
  mask = fillPinholes(mask, protect, nx, ny, nz);
  mask = dropFragments(mask, nx, ny, nz);
  mask = shedWeakSkin(mask, protect, core, source, nx, ny, nz);
  deepenOpenings(mask, protect, source, nx, ny, nz);
  mask = fillPinholes(mask, protect, nx, ny, nz);
  for (let i = 0; i < mask.length; i += 1) {
    if (protect[i]) mask[i] = 0;
    else if (core[i]) mask[i] = 1;
    else if (mask[i] && !allowed[i]) mask[i] = 0;
  }
  return { ...volume, field: shellField(mask, protect, core, allowed, source, nx, ny, nz) };
}

/** Narrow radial influence, in grid cells. Thin trails and the shell band live here. */
export const IMPLICIT_NARROW_SIGMA = 1.35;
export const IMPLICIT_NARROW_RADIUS = 4;
/** Wide radial influence. Subtracting it clears the interior of a thick mass. */
export const IMPLICIT_WIDE_SIGMA = 3.1;
export const IMPLICIT_WIDE_RADIUS = 8;
/** (narrow − wide) is scaled so the shell crosses the 0.48 isosurface. */
export const IMPLICIT_DOG_SCALE = 4.5;
/** Extra influence from density ridges in the source field. */
export const IMPLICIT_RIDGE_SIGMA = 1.6;
export const IMPLICIT_RIDGE_RADIUS = 4;
export const IMPLICIT_RIDGE_SCALE = 2.2;
/** Mass cannot appear farther than this from the original solid. */
export const IMPLICIT_OUTSIDE_LIMIT = 3.2;
/** Protected openings stay under this, below the isosurface. */
export const IMPLICIT_VOID_CAP = 0.16;

function gaussianWeights(sigma: number, radius: number) {
  const raw = new Float32Array(radius + 1);
  let sum = 0;
  for (let distance = 0; distance <= radius; distance += 1) {
    const weight = Math.exp(-0.5 * (distance / sigma) ** 2);
    raw[distance] = weight;
    sum += distance === 0 ? weight : weight * 2;
  }
  for (let distance = 0; distance < raw.length; distance += 1) raw[distance] /= sum;
  return raw;
}

const NARROW_WEIGHTS = gaussianWeights(IMPLICIT_NARROW_SIGMA, IMPLICIT_NARROW_RADIUS);
const WIDE_WEIGHTS = gaussianWeights(IMPLICIT_WIDE_SIGMA, IMPLICIT_WIDE_RADIUS);
const RIDGE_WEIGHTS = gaussianWeights(IMPLICIT_RIDGE_SIGMA, IMPLICIT_RIDGE_RADIUS);

function blurAxis(src: Float32Array, nx: number, ny: number, nz: number, axis: 0 | 1 | 2, weights: Float32Array) {
  const radius = weights.length - 1;
  const next = new Float32Array(src.length);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        let sum = src[at(x, y, z, nx, ny)] * weights[0];
        for (let distance = 1; distance <= radius; distance += 1) {
          const weight = weights[distance];
          if (axis === 0) {
            if (x - distance >= 0) sum += src[at(x - distance, y, z, nx, ny)] * weight;
            if (x + distance < nx) sum += src[at(x + distance, y, z, nx, ny)] * weight;
          } else if (axis === 1) {
            if (y - distance >= 0) sum += src[at(x, y - distance, z, nx, ny)] * weight;
            if (y + distance < ny) sum += src[at(x, y + distance, z, nx, ny)] * weight;
          } else {
            if (z - distance >= 0) sum += src[at(x, y, z - distance, nx, ny)] * weight;
            if (z + distance < nz) sum += src[at(x, y, z + distance, nx, ny)] * weight;
          }
        }
        next[at(x, y, z, nx, ny)] = sum;
      }
    }
  }
  return next;
}

function radialBlur(src: Float32Array, nx: number, ny: number, nz: number, weights: Float32Array) {
  let current = blurAxis(src, nx, ny, nz, 0, weights);
  current = blurAxis(current, nx, ny, nz, 1, weights);
  current = blurAxis(current, nx, ny, nz, 2, weights);
  return current;
}

/**
 * Implicit surface for one continuation.
 * Occupied cells emit a narrow radial field and a wide one. Their difference
 * keeps thin trails and a shell around thick masses, and drops the filled core.
 * Density ridges in the source field add a second, smaller influence.
 * The isosurface is 0.48. `volume` is not written.
 */
export function implicitInfluenceField(volume: MassVolume): MassVolume {
  const { nx, ny, nz } = volume;
  const source = volume.field;
  const solid = solidOf(source, FINAL_ISO);
  const mass = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] < FINAL_ISO) continue;
    const strength = Math.min(1, Math.max(0, (source[i] - FINAL_ISO) / 0.5));
    mass[i] = 0.7 + 0.3 * strength;
  }
  const narrow = radialBlur(mass, nx, ny, nz, NARROW_WEIGHTS);
  const wide = radialBlur(mass, nx, ny, nz, WIDE_WEIGHTS);
  const mean = radialBlur(source, nx, ny, nz, RIDGE_WEIGHTS);
  const ridge = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) ridge[i] = Math.max(0, source[i] - mean[i]);
  const ridgeField = radialBlur(ridge, nx, ny, nz, NARROW_WEIGHTS);
  const inverted = new Uint8Array(solid.length);
  for (let i = 0; i < solid.length; i += 1) inverted[i] = solid[i] ? 0 : 1;
  const outside = distanceToVoid(inverted, nx, ny, nz);
  const protect = new Uint8Array(solid.length);
  for (const cells of components(solid, nx, ny, nz, 0)) {
    if (cells.length < FILL_ENCLOSED_VOID) continue;
    for (const cell of cells) protect[cell] = 1;
  }
  markLargeOpenings(solid, protect, nx, ny, nz);
  const field = new Float32Array(source.length);
  for (let i = 0; i < field.length; i += 1) {
    const shell = narrow[i] - wide[i];
    let value = Math.max(0, shell) * IMPLICIT_DOG_SCALE + ridgeField[i] * IMPLICIT_RIDGE_SCALE;
    if (!solid[i] && outside[i] > IMPLICIT_OUTSIDE_LIMIT) value = 0;
    if (protect[i]) value = Math.min(value, IMPLICIT_VOID_CAP);
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    field[i] = value;
  }
  return { ...volume, field };
}

function minimumThickness(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const edt = distanceToVoid(mask, nx, ny, nz);
  let radius = Infinity;
  let any = false;
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const index = at(x, y, z, nx, ny);
        const value = edt[index];
        if (!(value > 0)) continue;
        let peak = true;
        for (const [dx, dy, dz] of FACE) {
          const xx = x + dx;
          const yy = y + dy;
          const zz = z + dz;
          if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
          if (edt[at(xx, yy, zz, nx, ny)] > value + 1e-4) peak = false;
        }
        if (!peak) continue;
        any = true;
        if (value < radius) radius = value;
      }
    }
  }
  if (!any) return 0;
  const cell = MODULE_SIZE_X / Math.max(1, nx - 1);
  return radius * 2 * cell;
}

export function measureRepresentativeMorphology(volume: MassVolume): FinalMorphologyMeasures {
  const mesh = meshFromOpeningVolume(volume, { mode: "isomesh", iso: FINAL_ISO, sizeZ: MODULE_SIZE_Z });
  let fitsModule = true;
  const limit = MODULE_SIZE_X / 2 + 1e-3;
  for (let i = 0; i < mesh.positions.length; i += 1) {
    if (Math.abs(mesh.positions[i]) > limit) fitsModule = false;
  }
  if (mesh.positions.length === 0) fitsModule = true;
  const mask = solidOf(volume.field, FINAL_ISO);
  const bodies = solidComponents(mask, volume.nx, volume.ny, volume.nz);
  const voids = components(mask, volume.nx, volume.ny, volume.nz, 0);
  return {
    triangles: mesh.triangles,
    components: bodies.length,
    minimumThickness: minimumThickness(mask, volume.nx, volume.ny, volume.nz),
    majorVoids: voids.filter((cells) => cells.length >= MAJOR_VOID_CELLS).length,
    fitsModule: fitsModule && volume.nx > 0 && MODULE_SIZE_Y === 20 && MODULE_SIZE_Z === 20,
  };
}

function openingCensus(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const major: number[] = [];
  let micro = 0;
  for (let z = 0; z < nz; z += 1) {
    for (const hole of planHoles(mask, z, nx, ny)) {
      if (hole.length < MICRO_PLAN_HOLE) micro += 1;
      else if (hole.length >= MAJOR_PLAN_HOLE) major.push(hole.length);
    }
  }
  major.sort((left, right) => left - right);
  return {
    micro,
    major: major.length,
    medianMajor: major.length ? major[Math.floor((major.length - 1) / 2)] : 0,
  };
}

function stackDelta(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const plane = nx * ny;
  let sum = 0;
  for (let z = 0; z < nz - 1; z += 1) {
    let diff = 0;
    const base = z * plane;
    const above = base + plane;
    for (let i = 0; i < plane; i += 1) if (mask[base + i] !== mask[above + i]) diff += 1;
    sum += diff / plane;
  }
  return nz > 1 ? sum / (nz - 1) : 0;
}

/** How far the refined solid stays inside the original growth. */
export function compareRefinedIdentity(before: MassVolume, after: MassVolume) {
  const { nx, ny, nz } = before;
  const source = solidOf(before.field, FINAL_ISO);
  const refined = solidOf(after.field, FINAL_ISO);
  const allowed = dilate6(source, nx, ny, nz, 2);
  let intersection = 0;
  let sourceCount = 0;
  let union = 0;
  let escaped = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i]) sourceCount += 1;
    if (source[i] && refined[i]) intersection += 1;
    if (source[i] || refined[i]) union += 1;
    if (refined[i] && !allowed[i]) escaped += 1;
  }
  const openingsBefore = openingCensus(source, nx, ny, nz);
  const openingsAfter = openingCensus(refined, nx, ny, nz);
  return {
    componentsBefore: solidComponents(source, nx, ny, nz).length,
    componentsAfter: solidComponents(refined, nx, ny, nz).length,
    retainedSolid: sourceCount ? intersection / sourceCount : 1,
    intersectionOverUnion: union ? intersection / union : 1,
    escapedCells: escaped,
    microOpeningsBefore: openingsBefore.micro,
    microOpeningsAfter: openingsAfter.micro,
    majorOpeningsBefore: openingsBefore.major,
    majorOpeningsAfter: openingsAfter.major,
    medianMajorOpeningBefore: openingsBefore.medianMajor,
    medianMajorOpeningAfter: openingsAfter.medianMajor,
    stackDeltaBefore: stackDelta(source, nx, ny, nz),
    stackDeltaAfter: stackDelta(refined, nx, ny, nz),
  };
}
