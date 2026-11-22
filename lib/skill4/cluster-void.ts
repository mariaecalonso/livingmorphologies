import type { IsoMesh } from "@/lib/scan/isomesh";
import { moduleLength } from "./contract";
import { cubicModelUnitsToCubicFeet, squareModelUnitsToSquareFeet } from "./scale";
import type { TileInstance } from "./tiles";
import { rotateByBasis, tileBasis } from "./tile-basis";

/**
 * Habitable void is the room between the tiles and validated hybrids.
 * Seeds sit in the connection gaps. The room grows only where two solids
 * hold the cell, then a short way up and down that opening. Exterior air
 * and thin slivers stay out.
 *
 * Set VOID_LOGIC_DEBUG in the assembly view to draw the seeds and the
 * rejected exterior skin. Remove that overlay with the flag.
 */
const MIN_CLEARANCE = moduleLength(0.15);
const SHELTER = moduleLength(0.5);
const VERTICAL_OPENING = moduleLength(0.22);

const TARGET_CELL = 0.32;
const MAX_AXIS = 148;

export type ClusterVoidReport = {
  volume: number;
  largest: number;
  pockets: number;
  clearance: number;
  verticalExtent: number;
  continuous: boolean;
  componentsBefore: number;
  componentsAfter: number;
  /** Seeded rooms before small pockets are dropped. */
  mainComponents: number;
  /** Near-surface air that was not accepted as the room. */
  rejectedExterior: number;
  /** Full gap width, in module units, below which a sliver is dropped. */
  minimumClearance: number;
  mesh: IsoMesh | null;
  /** Usable void floor plates, in square feet. One plate per column where the void begins. */
  floorSquareFeet: number;
  /** Void volume, in cubic feet. */
  volumeCubicFeet: number;
  /** Temporary verification: gap seeds. */
  seedMesh: IsoMesh | null;
  /** Temporary verification: exterior skin that was refused. */
  rejectedMesh: IsoMesh | null;
};

const EMPTY: ClusterVoidReport = {
  volume: 0,
  largest: 0,
  pockets: 0,
  clearance: 0,
  verticalExtent: 0,
  continuous: false,
  componentsBefore: 0,
  componentsAfter: 0,
  mainComponents: 0,
  rejectedExterior: 0,
  minimumClearance: MIN_CLEARANCE / moduleLength(1),
  mesh: null,
  floorSquareFeet: 0,
  volumeCubicFeet: 0,
  seedMesh: null,
  rejectedMesh: null,
};

/** Bake a tile's basis and placement into a world-space copy of its mesh. */
export function placeTileMesh(tile: TileInstance, source: IsoMesh): IsoMesh {
  const basis = tileBasis(tile);
  const positions = new Float32Array(source.positions.length);
  const normals = new Float32Array(source.normals.length);
  for (let i = 0; i < source.positions.length; i += 3) {
    const point = rotateByBasis(basis, {
      x: source.positions[i],
      y: source.positions[i + 1],
      z: source.positions[i + 2],
    });
    positions[i] = point.x + tile.transform.x;
    positions[i + 1] = point.y + tile.transform.y;
    positions[i + 2] = point.z + tile.transform.z;
    const normal = rotateByBasis(basis, {
      x: source.normals[i] ?? 0,
      y: source.normals[i + 1] ?? 0,
      z: source.normals[i + 2] ?? 0,
    });
    normals[i] = normal.x;
    normals[i + 1] = normal.y;
    normals[i + 2] = normal.z;
  }
  return { positions, normals, indices: source.indices, triangles: source.triangles };
}

export function analyzeClusterVoid(
  tiles: readonly TileInstance[],
  connections: readonly unknown[],
  worldMeshes: readonly IsoMesh[],
): ClusterVoidReport {
  const parts = meshParts(worldMeshes);
  const triangles = parts.triangles;
  if (triangles.length < 9) return EMPTY;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < triangles.length; i += 3) {
    minX = Math.min(minX, triangles[i]);
    maxX = Math.max(maxX, triangles[i]);
    minY = Math.min(minY, triangles[i + 1]);
    maxY = Math.max(maxY, triangles[i + 1]);
    minZ = Math.min(minZ, triangles[i + 2]);
    maxZ = Math.max(maxZ, triangles[i + 2]);
  }
  const spanX = Math.max(maxX - minX, TARGET_CELL);
  const spanY = Math.max(maxY - minY, TARGET_CELL);
  const spanZ = Math.max(maxZ - minZ, TARGET_CELL);
  const cell = Math.max(TARGET_CELL, spanX / (MAX_AXIS - 6), spanY / (MAX_AXIS - 6), spanZ / (MAX_AXIS - 6));
  const pad = cell * 2;
  const nx = Math.min(MAX_AXIS, Math.max(8, Math.ceil((spanX + pad * 2) / cell) + 1));
  const ny = Math.min(MAX_AXIS, Math.max(8, Math.ceil((spanY + pad * 2) / cell) + 1));
  const nz = Math.min(MAX_AXIS, Math.max(8, Math.ceil((spanZ + pad * 2) / cell) + 1));
  const originX = minX - pad;
  const originY = minY - pad;
  const originZ = minZ - pad;
  const count = nx * ny * nz;
  const solid = new Uint8Array(count);
  const minDist = new Float32Array(count);
  const faceX = new Float32Array(count);
  const faceY = new Float32Array(count);
  const faceZ = new Float32Array(count);
  minDist.fill(1e9);
  const band = cell * 0.87;
  const query = band + cell * 2.6;

  const shells: number[][] = [];
  for (let part = 0; part < parts.ranges.length - 1; part += 1) {
    const shell = new Uint8Array(count);
    markShell(triangles, parts.normals, parts.ranges[part], parts.ranges[part + 1], shell, minDist, faceX, faceY, faceZ, originX, originY, originZ, cell, band, query, nx, ny, nz);
    const partSolid = closeSolid(shell, triangles, parts.ranges[part], parts.ranges[part + 1], originX, originY, originZ, cell, nx, ny, nz);
    const surface: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (partSolid[i]) solid[i] = 1;
      if (shell[i]) surface.push(i);
    }
    shells.push(surface);
  }
  spreadDistance(minDist, cell, nx, ny, nz);
  for (let i = 0; i < count; i += 1) if (minDist[i] <= cell * 0.85) solid[i] = 1;
  const held = holdBetween(shells, solid, cell, nx, ny, nz);
  const between = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    if (!held[i] || solid[i] || !usable(minDist[i])) continue;
    between[i] = 1;
  }
  openVertical(between, solid, minDist, cell, nx, ny, nz);
  for (let i = 0; i < count; i += 1) if (between[i] && !usable(minDist[i])) between[i] = 0;
  const seeds = gapSeeds(linkSegments(tiles, connections), between, solid, originX, originY, originZ, cell, nx, ny, nz);
  const rooms = seededRooms(between, seeds, originX, originY, originZ, cell, nx, ny, nz);
  bridgePassages(rooms.mask, solid, minDist, cell, nx, ny, nz);
  const voidMask = rooms.mask;
  const componentsBefore = floodPockets(voidMask, nx, ny, nz).count;
  let voidCount = 0;
  let lowY = ny;
  let highY = -1;
  let clearance = Infinity;
  for (let i = 0; i < voidMask.length; i += 1) {
    if (!voidMask[i]) continue;
    voidCount += 1;
    const y = Math.floor(i / nx) % ny;
    if (y < lowY) lowY = y;
    if (y > highY) highY = y;
    if (minDist[i] < clearance) clearance = minDist[i];
  }
  const rejected = rejectedSkin(solid, voidMask, minDist, cell, nx, ny, nz, originX, originY, originZ);
  if (!voidCount) {
    return {
      ...EMPTY,
      componentsBefore,
      mainComponents: componentsBefore,
      rejectedExterior: rejected.count,
      seedMesh: markerMesh(seeds),
      rejectedMesh: rejected.mesh ? relax(rejected.mesh) : null,
    };
  }
  const pockets = floodPockets(voidMask, nx, ny, nz);
  const field = roomField(voidMask, solid, minDist, cell, nx, ny, nz);
  const mesh = surfaceNets(field, minDist, voidMask, nx, ny, nz, 0.42, originX, originY, originZ, cell, cell, cell, 1e9);
  const voxel = cell * cell * cell;
  const volume = voidCount * voxel;
  const floorSquareFeet = squareModelUnitsToSquareFeet(floorPlateArea(voidMask, nx, ny, nz, cell));
  return {
    volume,
    largest: pockets.largest * voxel,
    pockets: pockets.count,
    clearance: Number.isFinite(clearance) ? clearance * 2 : 0,
    verticalExtent: highY >= lowY ? (highY - lowY) * cell : 0,
    continuous: pockets.count === 1,
    componentsBefore,
    componentsAfter: pockets.count,
    mainComponents: componentsBefore,
    rejectedExterior: rejected.count,
    minimumClearance: MIN_CLEARANCE / moduleLength(1),
    mesh: mesh.triangles > 0 ? relax(mesh) : null,
    floorSquareFeet,
    volumeCubicFeet: cubicModelUnitsToCubicFeet(volume),
    seedMesh: markerMesh(seeds),
    rejectedMesh: rejected.mesh ? relax(rejected.mesh) : null,
  };
}

/** Horizontal area of each level where the void starts, so a tall room is one floor and a stacked void counts again. */
function floorPlateArea(mask: Uint8Array, nx: number, ny: number, nz: number, cell: number) {
  let plates = 0;
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      let open = false;
      for (let y = 0; y < ny; y += 1) {
        const filled = mask[(z * ny + y) * nx + x] === 1;
        if (filled && !open) plates += 1;
        open = filled;
      }
    }
  }
  return plates * cell * cell;
}

function usable(distance: number) {
  if (distance > 1e8) return true;
  return distance * 2 >= MIN_CLEARANCE;
}

/** Cells held between two different solids, not air sitting on one outer face. */
function holdBetween(
  shells: readonly number[][],
  solid: Uint8Array,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const count = nx * ny * nz;
  const stride = nx * ny;
  const bestPart = new Int16Array(count).fill(-1);
  const bestDist = new Float32Array(count).fill(1e9);
  const bestX = new Int16Array(count);
  const bestY = new Int16Array(count);
  const bestZ = new Int16Array(count);
  const secondPart = new Int16Array(count).fill(-1);
  const secondDist = new Float32Array(count).fill(1e9);
  const secondX = new Int16Array(count);
  const secondY = new Int16Array(count);
  const secondZ = new Int16Array(count);
  const seen = new Uint8Array(count);
  const stepOf = new Uint16Array(count);
  const originOf = new Int32Array(count);
  const queue = new Int32Array(count);
  const maxSteps = Math.max(2, Math.ceil((SHELTER * 1.5) / cell));
  const note = (index: number, part: number, dist: number, ox: number, oy: number, oz: number) => {
    if (bestPart[index] === part) {
      if (dist < bestDist[index]) {
        bestDist[index] = dist;
        bestX[index] = ox;
        bestY[index] = oy;
        bestZ[index] = oz;
      }
      return;
    }
    if (secondPart[index] === part) {
      if (dist < secondDist[index]) {
        secondDist[index] = dist;
        secondX[index] = ox;
        secondY[index] = oy;
        secondZ[index] = oz;
      }
      return;
    }
    if (dist < bestDist[index]) {
      if (bestPart[index] >= 0) {
        secondPart[index] = bestPart[index];
        secondDist[index] = bestDist[index];
        secondX[index] = bestX[index];
        secondY[index] = bestY[index];
        secondZ[index] = bestZ[index];
      }
      bestPart[index] = part;
      bestDist[index] = dist;
      bestX[index] = ox;
      bestY[index] = oy;
      bestZ[index] = oz;
      return;
    }
    if (dist < secondDist[index]) {
      secondPart[index] = part;
      secondDist[index] = dist;
      secondX[index] = ox;
      secondY[index] = oy;
      secondZ[index] = oz;
    }
  };
  for (let part = 0; part < shells.length; part += 1) {
    seen.fill(0);
    let tail = 0;
    for (const index of shells[part]) {
      if (seen[index]) continue;
      seen[index] = 1;
      stepOf[index] = 1;
      originOf[index] = index;
      queue[tail] = index;
      tail += 1;
    }
    for (let head = 0; head < tail; head += 1) {
      const index = queue[head];
      const origin = originOf[index];
      const ox = origin % nx;
      const oy = Math.floor(origin / nx) % ny;
      const oz = Math.floor(origin / stride);
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / stride);
      const dist = Math.hypot((x - ox) * cell, (y - oy) * cell, (z - oz) * cell);
      if (dist <= SHELTER) note(index, part, dist, ox, oy, oz);
      const travelled = stepOf[index];
      if (travelled >= maxSteps) continue;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - stride : -1,
        z + 1 < nz ? index + stride : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || solid[next]) continue;
        seen[next] = 1;
        stepOf[next] = travelled + 1;
        originOf[next] = origin;
        queue[tail] = next;
        tail += 1;
      }
    }
  }
  const held = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (bestPart[index] < 0 || secondPart[index] < 0) continue;
    if (bestDist[index] > SHELTER || secondDist[index] > SHELTER) continue;
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    const ax = bestX[index] - x;
    const ay = bestY[index] - y;
    const az = bestZ[index] - z;
    const bx = secondX[index] - x;
    const by = secondY[index] - y;
    const bz = secondZ[index] - z;
    const la = Math.hypot(ax, ay, az) || 1;
    const lb = Math.hypot(bx, by, bz) || 1;
    if ((ax * bx + ay * by + az * bz) / (la * lb) > -0.15) continue;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const ab2 = abx * abx + aby * aby + abz * abz || 1;
    let t = -(ax * abx + ay * aby + az * abz) / ab2;
    if (t < 0.12 || t > 0.88) continue;
    t = Math.min(1, Math.max(0, t));
    const off = Math.hypot(ax + abx * t, ay + aby * t, az + abz * t) * cell;
    if (off <= moduleLength(0.28)) held[index] = 1;
  }
  return held;
}

/** Let the gap rise and drop where the cluster opens, without leaving its column. */
function openVertical(
  mask: Uint8Array,
  solid: Uint8Array,
  minDist: Float32Array,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const steps = Math.max(1, Math.ceil(VERTICAL_OPENING / cell));
  const seeds: number[] = [];
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) seeds.push(index);
  for (const index of seeds) {
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    for (const dir of [-1, 1]) {
      for (let step = 1; step <= steps; step += 1) {
        const nextY = y + dir * step;
        if (nextY < 0 || nextY >= ny) break;
        const next = (z * ny + nextY) * nx + x;
        if (solid[next] || !usable(minDist[next])) break;
        mask[next] = 1;
      }
    }
  }
}

function gapSeeds(
  segments: readonly Segment[],
  between: Uint8Array,
  solid: Uint8Array,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const points: Array<[number, number, number]> = [];
  const offsets: Array<[number, number, number]> = [[0, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2], [2, 0, 0], [-2, 0, 0], [0, 4, 0], [0, -4, 0]];
  for (const segment of segments) {
    let found: [number, number, number] | null = null;
    for (let step = 0; step <= 8 && !found; step += 1) {
      const t = 0.3 + step * 0.05;
      const px = segment.ax + (segment.bx - segment.ax) * t;
      const py = segment.ay + (segment.by - segment.ay) * t;
      const pz = segment.az + (segment.bz - segment.az) * t;
      for (const [ox, oy, oz] of offsets) {
        const index = voxelIndex(px + ox, py + oy, pz + oz, originX, originY, originZ, cell, nx, ny, nz);
        if (index < 0 || solid[index] || !between[index]) continue;
        found = [px + ox, py + oy, pz + oz];
        break;
      }
    }
    if (found) points.push(found);
  }
  return points;
}

function voxelIndex(
  x: number,
  y: number,
  z: number,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const ix = Math.round((x - originX) / cell);
  const iy = Math.round((y - originY) / cell);
  const iz = Math.round((z - originZ) / cell);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
  return (iz * ny + iy) * nx + ix;
}

function seededRooms(
  mask: Uint8Array,
  seeds: readonly (readonly [number, number, number])[],
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const owner = new Int32Array(mask.length).fill(-1);
  const sizes: number[] = [];
  const queue: number[] = [];
  const stride = nx * ny;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || owner[start] >= 0) continue;
    const id = sizes.length;
    owner[start] = id;
    queue.length = 0;
    queue.push(start);
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      size += 1;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / stride);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - stride : -1,
        z + 1 < nz ? index + stride : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || owner[next] >= 0 || !mask[next]) continue;
        owner[next] = id;
        queue.push(next);
      }
    }
    sizes.push(size);
  }
  const hits = new Int32Array(sizes.length);
  for (const seed of seeds) {
    const index = voxelIndex(seed[0], seed[1], seed[2], originX, originY, originZ, cell, nx, ny, nz);
    if (index >= 0 && owner[index] >= 0) hits[owner[index]] += 1;
  }
  const minimum = Math.ceil((MIN_CLEARANCE / cell) ** 3);
  const keep = new Uint8Array(sizes.length);
  let seeded = 0;
  for (let id = 0; id < sizes.length; id += 1) {
    if (hits[id] <= 0 || sizes[id] < minimum) continue;
    keep[id] = 1;
    seeded += 1;
  }
  const next = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) if (owner[index] >= 0 && keep[owner[index]]) next[index] = 1;
  return { mask: next, seeded };
}

/** Join gap rooms through trapped air. Exterior air, which reaches the grid edge, stays out. */
function bridgePassages(
  mask: Uint8Array,
  solid: Uint8Array,
  minDist: Float32Array,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const outside = new Uint8Array(mask.length);
  const queue: number[] = [];
  const stride = nx * ny;
  const push = (index: number) => {
    if (outside[index] || solid[index] || mask[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(y * nx + x);
      push(((nz - 1) * ny + y) * nx + x);
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      push((z * ny) * nx + x);
      push((z * ny + ny - 1) * nx + x);
    }
    for (let y = 0; y < ny; y += 1) {
      push((z * ny + y) * nx);
      push((z * ny + y) * nx + nx - 1);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < nx ? index + 1 : -1,
      y > 0 ? index - nx : -1,
      y + 1 < ny ? index + nx : -1,
      z > 0 ? index - stride : -1,
      z + 1 < nz ? index + stride : -1,
    ];
    for (const next of neighbors) if (next >= 0) push(next);
  }
  const steps = Math.max(1, Math.ceil(moduleLength(0.45) / cell));
  for (let pass = 0; pass < steps; pass += 1) {
    const extra: number[] = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (solid[index] || mask[index] || outside[index] || !usable(minDist[index])) continue;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / stride);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - stride : -1,
        z + 1 < nz ? index + stride : -1,
      ];
      if (neighbors.some((next) => next >= 0 && mask[next])) extra.push(index);
    }
    if (!extra.length) break;
    for (const index of extra) mask[index] = 1;
  }
}

function rejectedSkin(
  solid: Uint8Array,
  voidMask: Uint8Array,
  minDist: Float32Array,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
  originX: number,
  originY: number,
  originZ: number,
) {
  const mask = new Uint8Array(voidMask.length);
  const skin = moduleLength(0.22);
  for (let index = 0; index < mask.length; index += 1) {
    if (solid[index] || voidMask[index]) continue;
    if (minDist[index] < skin) mask[index] = 1;
  }
  const outside = new Uint8Array(mask.length);
  const queue: number[] = [];
  const stride = nx * ny;
  const push = (index: number) => {
    if (outside[index] || solid[index] || voidMask[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(y * nx + x);
      push(((nz - 1) * ny + y) * nx + x);
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      push((z * ny) * nx + x);
      push((z * ny + ny - 1) * nx + x);
    }
    for (let y = 0; y < ny; y += 1) {
      push((z * ny + y) * nx);
      push((z * ny + y) * nx + nx - 1);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < nx ? index + 1 : -1,
      y > 0 ? index - nx : -1,
      y + 1 < ny ? index + nx : -1,
      z > 0 ? index - stride : -1,
      z + 1 < nz ? index + stride : -1,
    ];
    for (const next of neighbors) if (next >= 0) push(next);
  }
  for (let index = 0; index < mask.length; index += 1) if (!outside[index]) mask[index] = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    const extra: number[] = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (!outside[index] || mask[index]) continue;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / stride);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - stride : -1,
        z + 1 < nz ? index + stride : -1,
      ];
      if (neighbors.some((next) => next >= 0 && mask[next])) extra.push(index);
    }
    for (const index of extra) mask[index] = 1;
  }
  const regions = countSized(mask, nx, ny, nz, 80);
  const field = roomField(mask, solid, minDist, cell, nx, ny, nz);
  const mesh = surfaceNets(field, minDist, mask, nx, ny, nz, 0.42, originX, originY, originZ, cell, cell, cell, 1e9);
  return { count: regions, mesh: mesh.triangles > 0 ? mesh : null };
}

function markerMesh(points: readonly (readonly [number, number, number])[]): IsoMesh | null {
  if (!points.length) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const bands = 6;
  const slices = 8;
  const radius = 0.7;
  for (const [cx, cy, cz] of points) {
    const base = positions.length / 3;
    for (let band = 0; band <= bands; band += 1) {
      const v = (band / bands) * Math.PI;
      for (let slice = 0; slice <= slices; slice += 1) {
        const u = (slice / slices) * Math.PI * 2;
        const nx = Math.sin(v) * Math.cos(u);
        const ny = Math.cos(v);
        const nz = Math.sin(v) * Math.sin(u);
        normals.push(nx, ny, nz);
        positions.push(cx + nx * radius, cy + ny * radius, cz + nz * radius);
      }
    }
    const stride = slices + 1;
    for (let band = 0; band < bands; band += 1) {
      for (let slice = 0; slice < slices; slice += 1) {
        const a = base + band * stride + slice;
        indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
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

type Segment = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  len: number;
};

type ShapedSegment = Segment & { endA: number; endB: number; mid: number };

/** Soft plan envelope through the tile centers. It follows the cluster, not a box. */
function clusterEnvelope(
  tiles: readonly TileInstance[],
  connections: readonly unknown[],
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const segments = linkSegments(tiles, connections);
  const mask = new Uint8Array(nx * ny * nz);
  if (!segments.length) return mask;
  for (let z = 0; z < nz; z += 1) {
    const pz = originZ + z * cell;
    for (let y = 0; y < ny; y += 1) {
      const py = originY + y * cell;
      const row = (z * ny + y) * nx;
      for (let x = 0; x < nx; x += 1) {
        const px = originX + x * cell;
        for (const segment of segments) {
          if (insideRoom(px, py, pz, segment)) {
            mask[row + x] = 1;
            break;
          }
        }
      }
    }
  }
  return mask;
}

/** Wider through each gap, narrower at the tiles, so the room follows the connections. */
function insideRoom(px: number, py: number, pz: number, segment: Segment) {
  const abx = segment.bx - segment.ax;
  const aby = segment.by - segment.ay;
  const abz = segment.bz - segment.az;
  const len2 = segment.len * segment.len || 1;
  let t = ((px - segment.ax) * abx + (py - segment.ay) * aby + (pz - segment.az) * abz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dist = Math.hypot(px - (segment.ax + abx * t), py - (segment.ay + aby * t), pz - (segment.az + abz * t));
  const radius = 12 + Math.sin(Math.PI * t) * Math.min(8, segment.len * 0.22);
  return dist <= radius;
}

function convexHull(points: Array<[number, number]>) {
  const unique: Array<[number, number]> = [];
  for (const point of points) {
    if (!unique.some((other) => Math.hypot(other[0] - point[0], other[1] - point[1]) < 1e-3)) unique.push(point);
  }
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length <= 2) return unique;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Array<[number, number]> = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function insideHull(x: number, z: number, hull: Array<[number, number]>, margin: number) {
  let inside = false;
  let dist = Infinity;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i, i += 1) {
    const [x0, z0] = hull[j];
    const [x1, z1] = hull[i];
    if ((z0 > z) !== (z1 > z)) {
      const ix = ((z - z0) * (x1 - x0)) / (z1 - z0 || 1e-6) + x0;
      if (x < ix) inside = !inside;
    }
    dist = Math.min(dist, distToSeg2D(x, z, x0, z0, x1, z1));
  }
  return inside || dist <= margin;
}

function distToSeg2D(x: number, z: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - x0) * dx + (z - z0) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
}

function nearSegments(x: number, z: number, segments: readonly Segment[], radius: number) {
  for (const segment of segments) {
    if (distToSeg2D(x, z, segment.ax, segment.az, segment.bx, segment.bz) <= radius) return true;
  }
  return false;
}

function linkSegments(tiles: readonly TileInstance[], connections: readonly unknown[]) {
  const at = new Map(tiles.map((tile) => [tile.instanceId, tile.transform]));
  const segments: Segment[] = [];
  for (const link of connections) {
    if (!link || typeof link !== "object") continue;
    const pair = link as { tileAId?: string; tileBId?: string };
    if (!pair.tileAId || !pair.tileBId) continue;
    const a = at.get(pair.tileAId);
    const b = at.get(pair.tileBId);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len < 1e-3) continue;
    segments.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, len });
  }
  return segments;
}

function shapeSegment(
  segment: Segment,
  solid: Uint8Array,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
): ShapedSegment {
  const ux = (segment.bx - segment.ax) / segment.len;
  const uy = (segment.by - segment.ay) / segment.len;
  const uz = (segment.bz - segment.az) / segment.len;
  let px = -uy;
  let py = ux;
  let pz = 0;
  if (px * px + py * py + pz * pz < 0.04) {
    px = 0;
    py = -uz;
    pz = uy;
  }
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  const qx = uy * pz - uz * py;
  const qy = uz * px - ux * pz;
  const qz = ux * py - uy * px;
  const side = (x: number, y: number, z: number) => {
    const exits: number[] = [];
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2;
      const dx = Math.cos(angle) * px + Math.sin(angle) * qx;
      const dy = Math.cos(angle) * py + Math.sin(angle) * qy;
      const dz = Math.cos(angle) * pz + Math.sin(angle) * qz;
      exits.push(exitDistance(solid, originX, originY, originZ, cell, nx, ny, nz, x, y, z, dx, dy, dz, segment.len));
    }
    exits.sort((a, b) => a - b);
    const nearest = exits[0];
    const median = exits[3];
    return Math.min(median, nearest + 2.8);
  };
  const alongA = exitDistance(solid, originX, originY, originZ, cell, nx, ny, nz, segment.ax, segment.ay, segment.az, ux, uy, uz, segment.len);
  const alongB = exitDistance(solid, originX, originY, originZ, cell, nx, ny, nz, segment.bx, segment.by, segment.bz, -ux, -uy, -uz, segment.len);
  const gap = Math.max(cell * 4, segment.len - alongA - alongB);
  const endA = side(segment.ax, segment.ay, segment.az);
  const endB = side(segment.bx, segment.by, segment.bz);
  const mid = Math.max(endA, endB, Math.min(gap * 0.95, segment.len * 0.48));
  return { ...segment, endA, endB, mid };
}

function exitDistance(
  solid: Uint8Array,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
) {
  const steps = Math.max(1, Math.ceil(maxDist / cell));
  for (let i = 1; i <= steps; i += 1) {
    const distance = i * cell;
    if (!occupied(solid, originX, originY, originZ, cell, nx, ny, nz, x + dx * distance, y + dy * distance, z + dz * distance)) return distance;
  }
  return maxDist;
}

function occupied(
  solid: Uint8Array,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
  x: number,
  y: number,
  z: number,
) {
  const ix = Math.round((x - originX) / cell);
  const iy = Math.round((y - originY) / cell);
  const iz = Math.round((z - originZ) / cell);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return false;
  return solid[(iz * ny + iy) * nx + ix] === 1;
}

function graphEnvelope(
  segments: readonly ShapedSegment[],
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const mask = new Uint8Array(nx * ny * nz);
  if (!segments.length) return mask;
  for (let z = 0; z < nz; z += 1) {
    const pz = originZ + z * cell;
    for (let y = 0; y < ny; y += 1) {
      const py = originY + y * cell;
      const row = (z * ny + y) * nx;
      for (let x = 0; x < nx; x += 1) {
        const px = originX + x * cell;
        for (const segment of segments) {
          if (insideSegment(px, py, pz, segment)) {
            mask[row + x] = 1;
            break;
          }
        }
      }
    }
  }
  return mask;
}

function insideSegment(px: number, py: number, pz: number, segment: ShapedSegment) {
  const abx = segment.bx - segment.ax;
  const aby = segment.by - segment.ay;
  const abz = segment.bz - segment.az;
  const len2 = segment.len * segment.len;
  let t = ((px - segment.ax) * abx + (py - segment.ay) * aby + (pz - segment.az) * abz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = segment.ax + abx * t;
  const cy = segment.ay + aby * t;
  const cz = segment.az + abz * t;
  const dist = Math.hypot(px - cx, py - cy, pz - cz);
  const bulge = Math.sin(Math.PI * t);
  const end = t < 0.5 ? segment.endA : segment.endB;
  return dist <= end + (segment.mid - end) * bulge;
}

/** Pull a passage through the nearest air beside each connection so the gaps join. */
function carvePassages(
  mask: Uint8Array,
  solid: Uint8Array,
  segments: readonly ShapedSegment[],
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const passage = Math.max(cell * 3, 2.4);
  for (const segment of segments) {
    const ux = (segment.bx - segment.ax) / segment.len;
    const uy = (segment.by - segment.ay) / segment.len;
    const uz = (segment.bz - segment.az) / segment.len;
    let px = -uy;
    let py = ux;
    let pz = 0;
    if (px * px + py * py + pz * pz < 0.04) {
      px = 0;
      py = -uz;
      pz = uy;
    }
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl;
    py /= pl;
    pz /= pl;
    const qx = uy * pz - uz * py;
    const qy = uz * px - ux * pz;
    const qz = ux * py - uy * px;
    const steps = Math.max(1, Math.ceil(segment.len / cell));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = segment.ax + (segment.bx - segment.ax) * t;
      const y = segment.ay + (segment.by - segment.ay) * t;
      const z = segment.az + (segment.bz - segment.az) * t;
      const reach = (t < 0.5 ? segment.endA : segment.endB) + (segment.mid - (t < 0.5 ? segment.endA : segment.endB)) * Math.sin(Math.PI * t);
      let best = Infinity;
      let sx = x;
      let sy = y;
      let sz = z;
      if (!occupied(solid, originX, originY, originZ, cell, nx, ny, nz, x, y, z)) {
        best = 0;
      } else {
        for (let k = 0; k < 10; k += 1) {
          const angle = (k / 10) * Math.PI * 2;
          const dx = Math.cos(angle) * px + Math.sin(angle) * qx;
          const dy = Math.cos(angle) * py + Math.sin(angle) * qy;
          const dz = Math.cos(angle) * pz + Math.sin(angle) * qz;
          const hit = exitDistance(solid, originX, originY, originZ, cell, nx, ny, nz, x, y, z, dx, dy, dz, reach);
          if (hit < best) {
            best = hit;
            sx = x + dx * hit;
            sy = y + dy * hit;
            sz = z + dz * hit;
          }
        }
      }
      if (best > reach) continue;
      paintBall(mask, solid, originX, originY, originZ, cell, nx, ny, nz, sx, sy, sz, passage);
    }
  }
}

function paintBall(
  mask: Uint8Array,
  solid: Uint8Array,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
  x: number,
  y: number,
  z: number,
  radius: number,
) {
  const r = Math.ceil(radius / cell);
  const cx = Math.round((x - originX) / cell);
  const cy = Math.round((y - originY) / cell);
  const cz = Math.round((z - originZ) / cell);
  const limit = radius * radius;
  for (let iz = cz - r; iz <= cz + r; iz += 1) {
    if (iz < 0 || iz >= nz) continue;
    for (let iy = cy - r; iy <= cy + r; iy += 1) {
      if (iy < 0 || iy >= ny) continue;
      const row = (iz * ny + iy) * nx;
      for (let ix = cx - r; ix <= cx + r; ix += 1) {
        if (ix < 0 || ix >= nx) continue;
        const dx = (ix - cx) * cell;
        const dy = (iy - cy) * cell;
        const dz = (iz - cz) * cell;
        if (dx * dx + dy * dy + dz * dz > limit) continue;
        const index = row + ix;
        if (!solid[index]) mask[index] = 1;
      }
    }
  }
}

/** Spread the open field a short way through air so nearby gaps become one room. */
function fuseAir(
  mask: Uint8Array,
  solid: Uint8Array,
  envelope: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  steps: number,
) {
  let current = mask;
  for (let pass = 0; pass < steps; pass += 1) {
    if (floodPockets(current, nx, ny, nz).count <= 1) return current;
    const next = current.slice();
    for (let z = 1; z < nz - 1; z += 1) {
      for (let y = 1; y < ny - 1; y += 1) {
        const row = (z * ny + y) * nx;
        for (let x = 1; x < nx - 1; x += 1) {
          const index = row + x;
          if (current[index] || solid[index] || !envelope[index]) continue;
          if (
            current[index - 1] || current[index + 1]
            || current[index - nx] || current[index + nx]
            || current[index - nx * ny] || current[index + nx * ny]
          ) next[index] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function keepLargest(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const seen = new Uint8Array(mask.length);
  const queue: number[] = [];
  let best: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      cells.push(index);
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / (nx * ny));
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - nx * ny : -1,
        z + 1 < nz ? index + nx * ny : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (cells.length > best.length) best = cells;
  }
  const next = new Uint8Array(mask.length);
  for (const index of best) next[index] = 1;
  return next;
}

function roomField(
  mask: Uint8Array,
  solid: Uint8Array,
  minDist: Float32Array,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const outside = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (!mask[i]) outside[i] = 1;
  const shell = voxelDistance(outside, nx, ny, nz, 8);
  const field = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || solid[i]) continue;
    const fromOuter = shell[i] < 0 ? 8 : shell[i];
    const fromSolid = minDist[i] / Math.max(cell, 1e-4);
    field[i] = Math.min(1, Math.min(fromOuter, fromSolid) / 2.4);
  }
  return field;
}

function meshParts(meshes: readonly IsoMesh[]) {
  const ranges = [0];
  let count = 0;
  for (const mesh of meshes) count += mesh.indices.length;
  const triangles = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let cursor = 0;
  for (const mesh of meshes) {
    const positions = mesh.positions;
    const indices = mesh.indices;
    for (let i = 0; i < indices.length; i += 1) {
      const vertex = indices[i] * 3;
      triangles[cursor] = positions[vertex];
      triangles[cursor + 1] = positions[vertex + 1];
      triangles[cursor + 2] = positions[vertex + 2];
      normals[cursor] = mesh.normals[vertex] ?? 0;
      normals[cursor + 1] = mesh.normals[vertex + 1] ?? 0;
      normals[cursor + 2] = mesh.normals[vertex + 2] ?? 0;
      cursor += 3;
    }
    ranges.push(cursor);
  }
  return { triangles, normals, ranges };
}

function markShell(
  triangles: Float32Array,
  normals: Float32Array,
  start: number,
  end: number,
  shell: Uint8Array,
  minDist: Float32Array,
  faceX: Float32Array,
  faceY: Float32Array,
  faceZ: Float32Array,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  band: number,
  query: number,
  nx: number,
  ny: number,
  nz: number,
) {
  for (let t = start; t < end; t += 9) {
    const ax = triangles[t];
    const ay = triangles[t + 1];
    const az = triangles[t + 2];
    const bx = triangles[t + 3];
    const by = triangles[t + 4];
    const bz = triangles[t + 5];
    const cx = triangles[t + 6];
    const cy = triangles[t + 7];
    const cz = triangles[t + 8];
    let fnx = normals[t] + normals[t + 3] + normals[t + 6];
    let fny = normals[t + 1] + normals[t + 4] + normals[t + 7];
    let fnz = normals[t + 2] + normals[t + 5] + normals[t + 8];
    if (fnx * fnx + fny * fny + fnz * fnz < 1e-4) {
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      fnx = uy * vz - uz * vy;
      fny = uz * vx - ux * vz;
      fnz = ux * vy - uy * vx;
    }
    const fl = Math.hypot(fnx, fny, fnz) || 1;
    fnx /= fl;
    fny /= fl;
    fnz /= fl;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - query - originX) / cell));
    const x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) + query - originX) / cell));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - query - originY) / cell));
    const y1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) + query - originY) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - query - originZ) / cell));
    const z1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) + query - originZ) / cell));
    for (let z = z0; z <= z1; z += 1) {
      const pz = originZ + z * cell;
      for (let y = y0; y <= y1; y += 1) {
        const py = originY + y * cell;
        const row = (z * ny + y) * nx;
        for (let x = x0; x <= x1; x += 1) {
          const index = row + x;
          const px = originX + x * cell;
          const distance = distPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          if (distance < minDist[index]) {
            minDist[index] = distance;
            faceX[index] = fnx;
            faceY[index] = fny;
            faceZ[index] = fnz;
          }
          if (distance <= band) shell[index] = 1;
        }
      }
    }
  }
}

/** Fill missing samples from nearby true triangle distances. Measured distances stay. */
function spreadDistance(
  minDist: Float32Array,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const next = new Float32Array(minDist.length);
  for (let pass = 0; pass < 4; pass += 1) {
    next.set(minDist);
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const index = (z * ny + y) * nx + x;
          if (minDist[index] < 1e8) continue;
          let distance = minDist[index];
          if (x > 0) distance = Math.min(distance, minDist[index - 1] + cell);
          if (x + 1 < nx) distance = Math.min(distance, minDist[index + 1] + cell);
          if (y > 0) distance = Math.min(distance, minDist[index - nx] + cell);
          if (y + 1 < ny) distance = Math.min(distance, minDist[index + nx] + cell);
          if (z > 0) distance = Math.min(distance, minDist[index - nx * ny] + cell);
          if (z + 1 < nz) distance = Math.min(distance, minDist[index + nx * ny] + cell);
          next[index] = distance;
        }
      }
    }
    minDist.set(next);
  }
}

/**
 * Fill the inside of one mesh. A thin shell is not enough: the gap test would
 * then extrude a slab between every pair of surface hits. Parity across the
 * three axes fills a closed volume. An open sheet, which would claim half the
 * grid, stays a shell so the air around it is not sealed.
 */
function closeSolid(
  shell: Uint8Array,
  triangles: Float32Array,
  start: number,
  end: number,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let t = start; t < end; t += 3) {
    minX = Math.min(minX, triangles[t]);
    maxX = Math.max(maxX, triangles[t]);
    minY = Math.min(minY, triangles[t + 1]);
    maxY = Math.max(maxY, triangles[t + 1]);
    minZ = Math.min(minZ, triangles[t + 2]);
    maxZ = Math.max(maxZ, triangles[t + 2]);
  }
  const x0 = Math.max(0, Math.floor((minX - originX) / cell));
  const y0 = Math.max(0, Math.floor((minY - originY) / cell));
  const z0 = Math.max(0, Math.floor((minZ - originZ) / cell));
  const x1 = Math.min(nx - 1, Math.ceil((maxX - originX) / cell));
  const y1 = Math.min(ny - 1, Math.ceil((maxY - originY) / cell));
  const z1 = Math.min(nz - 1, Math.ceil((maxZ - originZ) / cell));
  const bbox = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1));
  sealPinholes(shell, nx, ny, nz);
  let shellCount = 0;
  for (let i = 0; i < shell.length; i += 1) if (shell[i]) shellCount += 1;
  const vote = parityVotes(shell, nx, ny, nz);
  let interior = 0;
  for (let z = z0; z <= z1; z += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const row = (z * ny + y) * nx;
      for (let x = x0; x <= x1; x += 1) {
        const index = row + x;
        if (!shell[index] && vote[index] >= 2) interior += 1;
      }
    }
  }
  const plausible = (count: number) => count > shellCount * 0.15 && count < bbox * 0.9;
  if (plausible(interior)) {
    const solid = shell.slice();
    for (let z = z0; z <= z1; z += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const row = (z * ny + y) * nx;
        for (let x = x0; x <= x1; x += 1) if (vote[row + x] >= 2) solid[row + x] = 1;
      }
    }
    return solid;
  }
  const flooded = shell.slice();
  fillSolidInteriors(flooded, nx, ny, nz);
  let filled = 0;
  for (let z = z0; z <= z1; z += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const row = (z * ny + y) * nx;
      for (let x = x0; x <= x1; x += 1) {
        const index = row + x;
        if (flooded[index] && !shell[index]) filled += 1;
      }
    }
  }
  return plausible(filled) ? flooded : shell;
}

/** Close a one-cell crack so a diagonal shell still reads as a wall. */
function sealPinholes(shell: Uint8Array, nx: number, ny: number, nz: number) {
  const extra: number[] = [];
  for (let z = 1; z < nz - 1; z += 1) {
    for (let y = 1; y < ny - 1; y += 1) {
      const row = (z * ny + y) * nx;
      for (let x = 1; x < nx - 1; x += 1) {
        const index = row + x;
        if (shell[index]) continue;
        const across = (shell[index - 1] && shell[index + 1])
          || (shell[index - nx] && shell[index + nx])
          || (shell[index - nx * ny] && shell[index + nx * ny]);
        if (across) extra.push(index);
      }
    }
  }
  for (const index of extra) shell[index] = 1;
}

function wallCountX(shell: Uint8Array, nx: number, ny: number, y: number, z: number) {
  let walls = 0;
  for (let x = 0; x < nx; x += 1) {
    if (!shell[(z * ny + y) * nx + x]) continue;
    walls += 1;
    while (x < nx && shell[(z * ny + y) * nx + x]) x += 1;
  }
  return walls;
}

function wallCountY(shell: Uint8Array, nx: number, ny: number, x: number, z: number) {
  let walls = 0;
  for (let y = 0; y < ny; y += 1) {
    if (!shell[(z * ny + y) * nx + x]) continue;
    walls += 1;
    while (y < ny && shell[(z * ny + y) * nx + x]) y += 1;
  }
  return walls;
}

function wallCountZ(shell: Uint8Array, nx: number, ny: number, x: number, y: number) {
  let walls = 0;
  for (let z = 0; z < nzFrom(shell, nx, ny); z += 1) {
    if (!shell[(z * ny + y) * nx + x]) continue;
    walls += 1;
    while (z < nzFrom(shell, nx, ny) && shell[(z * ny + y) * nx + x]) z += 1;
  }
  return walls;
}

function nzFrom(shell: Uint8Array, nx: number, ny: number) {
  return shell.length / (nx * ny);
}

/** One vote per axis. A line with an odd number of walls is open and casts no vote. */
function parityVotes(shell: Uint8Array, nx: number, ny: number, nz: number) {
  const vote = new Uint8Array(shell.length);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      if (wallCountX(shell, nx, ny, y, z) % 2 !== 0) continue;
      let inside = false;
      for (let x = 0; x < nx; x += 1) {
        const index = (z * ny + y) * nx + x;
        if (shell[index]) {
          while (x < nx && shell[(z * ny + y) * nx + x]) x += 1;
          inside = !inside;
          x -= 1;
          continue;
        }
        if (inside) vote[index] += 1;
      }
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      if (wallCountY(shell, nx, ny, x, z) % 2 !== 0) continue;
      let inside = false;
      for (let y = 0; y < ny; y += 1) {
        const index = (z * ny + y) * nx + x;
        if (shell[index]) {
          while (y < ny && shell[(z * ny + y) * nx + x]) y += 1;
          inside = !inside;
          y -= 1;
          continue;
        }
        if (inside) vote[index] += 1;
      }
    }
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      if (wallCountZ(shell, nx, ny, x, y) % 2 !== 0) continue;
      let inside = false;
      for (let z = 0; z < nz; z += 1) {
        const index = (z * ny + y) * nx + x;
        if (shell[index]) {
          while (z < nz && shell[(z * ny + y) * nx + x]) z += 1;
          inside = !inside;
          z -= 1;
          continue;
        }
        if (inside) vote[index] += 1;
      }
    }
  }
  return vote;
}

function fillSolidInteriors(solid: Uint8Array, nx: number, ny: number, nz: number) {
  const reached = new Uint8Array(solid.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (reached[index] || solid[index]) return;
    reached[index] = 1;
    queue.push(index);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push((z * ny + y) * nx);
      push((z * ny + y) * nx + (nx - 1));
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      push((z * ny) * nx + x);
      push((z * ny + (ny - 1)) * nx + x);
    }
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      push(y * nx + x);
      push(((nz - 1) * ny + y) * nx + x);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const z = Math.floor(index / (nx * ny));
    const y = Math.floor(index / nx) % ny;
    const x = index % nx;
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - nx * ny);
    if (z + 1 < nz) push(index + nx * ny);
  }
  for (let i = 0; i < solid.length; i += 1) {
    if (!reached[i]) solid[i] = 1;
  }
}

/**
 * Gaps held between two or more parts. Closing removes the crust on exposed
 * faces. A cell also has to sit near at least two separate solids, so a dent
 * in one tile is not a room.
 */
function enclosedVoid(
  solid: Uint8Array,
  near: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  cell: number,
  radius: number,
) {
  const reach = Math.max(2, Math.ceil(radius / cell));
  const dist = voxelDistance(solid, nx, ny, nz, reach);
  const dilated = new Uint8Array(solid.length);
  for (let i = 0; i < solid.length; i += 1) if (dist[i] >= 0 && dist[i] <= reach) dilated[i] = 1;
  const complement = new Uint8Array(solid.length);
  for (let i = 0; i < solid.length; i += 1) if (!dilated[i]) complement[i] = 1;
  const outside = voxelDistance(complement, nx, ny, nz, reach + 1);
  const voidMask = new Uint8Array(solid.length);
  for (let i = 0; i < solid.length; i += 1) {
    if (solid[i] || near[i] < 2 || !dilated[i]) continue;
    if (outside[i] >= 0 && outside[i] <= reach) continue;
    voidMask[i] = 1;
  }
  const minMedial = Math.max(2, Math.ceil(1.2 / cell));
  const seen = new Uint8Array(solid.length);
  const queue: number[] = [];
  for (let start = 0; start < voidMask.length; start += 1) {
    if (!voidMask[start] || seen[start]) continue;
    const cells: number[] = [];
    let deepest = 0;
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      cells.push(index);
      if (dist[index] > deepest) deepest = dist[index];
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / (nx * ny));
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - nx * ny : -1,
        z + 1 < nz ? index + nx * ny : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || seen[neighbor] || !voidMask[neighbor]) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (deepest >= minMedial) continue;
    for (const index of cells) voidMask[index] = 0;
  }
  let clearance = Infinity;
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const index = (z * ny + y) * nx + x;
        if (!voidMask[index]) continue;
        const here = dist[index];
        const wider = (neighbor: number) => neighbor >= 0 && voidMask[neighbor] && dist[neighbor] > here;
        if (wider(x > 0 ? index - 1 : -1) || wider(x + 1 < nx ? index + 1 : -1)) continue;
        if (wider(y > 0 ? index - nx : -1) || wider(y + 1 < ny ? index + nx : -1)) continue;
        if (wider(z > 0 ? index - nx * ny : -1) || wider(z + 1 < nz ? index + nx * ny : -1)) continue;
        const span = here * 2 * cell;
        if (span > cell && span < clearance) clearance = span;
      }
    }
  }
  return { voidMask, clearance: Number.isFinite(clearance) ? clearance : 0 };
}

function voxelDistance(seed: Uint8Array, nx: number, ny: number, nz: number, limit = 32767) {
  const count = seed.length;
  const dist = new Int16Array(count);
  dist.fill(-1);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < count; i += 1) {
    if (!seed[i]) continue;
    dist[i] = 0;
    queue[tail] = i;
    tail += 1;
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (dist[index] >= limit) continue;
    const next = dist[index] + 1;
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    const visit = (neighbor: number) => {
      if (dist[neighbor] >= 0) return;
      dist[neighbor] = next;
      queue[tail] = neighbor;
      tail += 1;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < nx) visit(index + 1);
    if (y > 0) visit(index - nx);
    if (y + 1 < ny) visit(index + nx);
    if (z > 0) visit(index - nx * ny);
    if (z + 1 < nz) visit(index + nx * ny);
  }
  return dist;
}


function dropSlivers(mask: Uint8Array, nx: number, ny: number, nz: number, cell: number, minimum: number) {
  const seen = new Uint8Array(mask.length);
  const next = mask.slice();
  const queue: number[] = [];
  const voxel = cell * cell * cell;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      cells.push(index);
      const z = Math.floor(index / (nx * ny));
      const y = Math.floor(index / nx) % ny;
      const x = index % nx;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - nx * ny : -1,
        z + 1 < nz ? index + nx * ny : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (cells.length * voxel >= minimum) continue;
    for (const index of cells) next[index] = 0;
  }
  return next;
}

function countSized(mask: Uint8Array, nx: number, ny: number, nz: number, minimum: number) {
  const seen = new Uint8Array(mask.length);
  const queue: number[] = [];
  const stride = nx * ny;
  let count = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      size += 1;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / stride);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - stride : -1,
        z + 1 < nz ? index + stride : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !mask[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    if (size >= minimum) count += 1;
  }
  return count;
}

function floodPockets(voidMask: Uint8Array, nx: number, ny: number, nz: number) {
  const seen = new Uint8Array(voidMask.length);
  let count = 0;
  let largest = 0;
  const queue: number[] = [];
  for (let start = 0; start < voidMask.length; start += 1) {
    if (!voidMask[start] || seen[start]) continue;
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      size += 1;
      const z = Math.floor(index / (nx * ny));
      const y = Math.floor(index / nx) % ny;
      const x = index % nx;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - nx * ny : -1,
        z + 1 < nz ? index + nx * ny : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !voidMask[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    count += 1;
    if (size > largest) largest = size;
  }
  return { count, largest };
}

/**
 * The iso sits where the true triangle distance equals a small offset.
 * Shell cells keep that distance, so the crossing falls between samples
 * instead of on a grid face. Deep solid stays outside the void.
 */
function distanceField(
  mask: Uint8Array,
  solid: Uint8Array,
  minDist: Float32Array,
  cell: number,
) {
  const offset = cell * 1.4;
  const field = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || solid[i]) continue;
    field[i] = Math.min(1, minDist[i] / (offset * 2));
  }
  return field;
}

const CORNERS: Array<[number, number, number]> = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function surfaceNets(
  field: Float32Array,
  minDist: Float32Array,
  mask: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  iso: number,
  originX: number,
  originY: number,
  originZ: number,
  stepX: number,
  stepY: number,
  stepZ: number,
  far: number,
): IsoMesh {
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const vertexAt = new Int32Array(cx * cy * cz).fill(-1);
  const positions: number[] = [];
  const at = (x: number, y: number, z: number) => field[(z * ny + y) * nx + x];
  for (let z = 0; z < cz; z += 1) {
    for (let y = 0; y < cy; y += 1) {
      for (let x = 0; x < cx; x += 1) {
        const values = CORNERS.map(([dx, dy, dz]) => at(x + dx, y + dy, z + dz));
        let inside = 0;
        for (const value of values) if (value >= iso) inside += 1;
        if (inside === 0 || inside === 8) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let hits = 0;
        for (const [left, right] of EDGES) {
          const a = values[left];
          const b = values[right];
          if ((a >= iso) === (b >= iso)) continue;
          const t = (iso - a) / (b - a || 1e-6);
          const ca = CORNERS[left];
          const cb = CORNERS[right];
          ax += originX + (x + ca[0] + (cb[0] - ca[0]) * t) * stepX;
          ay += originY + (y + ca[1] + (cb[1] - ca[1]) * t) * stepY;
          az += originZ + (z + ca[2] + (cb[2] - ca[2]) * t) * stepZ;
          hits += 1;
        }
        if (!hits) continue;
        vertexAt[(z * cy + y) * cx + x] = positions.length / 3;
        positions.push(ax / hits, ay / hits, az / hits);
      }
    }
  }
  const indices: number[] = [];
  const pushQuad = (cells: Array<[number, number, number]>, flip: boolean) => {
    const ids = cells.map(([x, y, z]) => {
      if (x < 0 || y < 0 || z < 0 || x >= cx || y >= cy || z >= cz) return -1;
      return vertexAt[(z * cy + y) * cx + x];
    });
    if (ids.some((id) => id < 0)) return;
    const [a, b, c, d] = flip ? [ids[0], ids[3], ids[2], ids[1]] : ids;
    indices.push(a, b, c, a, c, d);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
        const a = at(x, y, z);
        const b = at(x + 1, y, z);
        if ((a >= iso) === (b >= iso)) continue;
        if (exteriorCap(mask, minDist, (z * ny + y) * nx + x, (z * ny + y) * nx + x + 1, far)) continue;
        pushQuad([[x, y - 1, z - 1], [x, y, z - 1], [x, y, z], [x, y - 1, z]], a >= iso && b < iso);
      }
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const a = at(x, y, z);
        const b = at(x, y + 1, z);
        if ((a >= iso) === (b >= iso)) continue;
        if (exteriorCap(mask, minDist, (z * ny + y) * nx + x, (z * ny + y + 1) * nx + x, far)) continue;
        pushQuad([[x - 1, y, z - 1], [x, y, z - 1], [x, y, z], [x - 1, y, z]], a >= iso && b < iso);
      }
    }
  }
  for (let z = 0; z < nz - 1; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const a = at(x, y, z);
        const b = at(x, y, z + 1);
        if ((a >= iso) === (b >= iso)) continue;
        if (exteriorCap(mask, minDist, (z * ny + y) * nx + x, ((z + 1) * ny + y) * nx + x, far)) continue;
        pushQuad([[x - 1, y - 1, z], [x, y - 1, z], [x, y, z], [x - 1, y, z]], a >= iso && b < iso);
      }
    }
  }
  return withNormals(positions, indices);
}

/** A mask/exterior crossing far from any triangle is a flat outer cap, not the molded void. */
function exteriorCap(mask: Uint8Array, minDist: Float32Array, a: number, b: number, far: number) {
  const crosses = mask[a] !== mask[b];
  return crosses && Math.min(minDist[a], minDist[b]) > far;
}

/** A few light moves toward neighbor averages. Cell steps soften; the larger curves stay. */
function relax(mesh: IsoMesh): IsoMesh {
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions);
  const sums = new Float64Array(mesh.positions.length);
  const weights = new Float64Array(count);
  for (let pass = 0; pass < 5; pass += 1) {
    sums.fill(0);
    weights.fill(0);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const tri = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
      for (let a = 0; a < 3; a += 1) {
        const b = tri[(a + 1) % 3];
        sums[tri[a] * 3] += positions[b * 3];
        sums[tri[a] * 3 + 1] += positions[b * 3 + 1];
        sums[tri[a] * 3 + 2] += positions[b * 3 + 2];
        weights[tri[a]] += 1;
      }
    }
    for (let i = 0; i < count; i += 1) {
      if (!weights[i]) continue;
      positions[i * 3] = positions[i * 3] * 0.72 + (sums[i * 3] / weights[i]) * 0.28;
      positions[i * 3 + 1] = positions[i * 3 + 1] * 0.72 + (sums[i * 3 + 1] / weights[i]) * 0.28;
      positions[i * 3 + 2] = positions[i * 3 + 2] * 0.72 + (sums[i * 3 + 2] / weights[i]) * 0.28;
    }
  }
  return withNormals(Array.from(positions), Array.from(mesh.indices));
}

function withNormals(positions: number[], indices: number[]): IsoMesh {
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

function distPointTri(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(ax + abx * v - px, ay + aby * v - py, az + abz * v - pz);
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(ax + acx * w - px, ay + acy * w - py, az + acz * w - pz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(bx + (cx - bx) * w - px, by + (cy - by) * w - py, bz + (cz - bz) * w - pz);
  }
  const denom = 1 / (va + vb + vc || 1e-8);
  const v = vb * denom;
  const w = vc * denom;
  return Math.hypot(ax + abx * v + acx * w - px, ay + aby * v + acy * w - py, az + abz * v + acz * w - pz);
}

export type ShrinkwrapVoidReport = {
  mesh: IsoMesh | null;
  pocketsMesh: IsoMesh | null;
  floorSquareFeet: number;
  volumeCubicFeet: number;
  maxHeightFeet: number;
  widthFeet: number;
  depthFeet: number;
  regionsBefore: number;
  regionsRetained: number;
  /** One horizontal cut. 0 is the bottom of the solid, 1 is the top. */
  section: (height: number) => { solid: IsoMesh | null; void: IsoMesh | null };
};

const EMPTY_SHRINKWRAP_VOID: ShrinkwrapVoidReport = {
  mesh: null,
  pocketsMesh: null,
  floorSquareFeet: 0,
  volumeCubicFeet: 0,
  maxHeightFeet: 0,
  widthFeet: 0,
  depthFeet: 0,
  regionsBefore: 0,
  regionsRetained: 0,
  section: () => ({ solid: null, void: null }),
};

/**
 * Habitable void of one adopted shrinkwrap.
 * The solid is the interior of that skin. Air connected to the outside stays exterior.
 * Air held from more than one side is kept even when the room is open.
 * Only the largest remaining field is the main void.
 */
export function analyzeShrinkwrapVoid(mesh: IsoMesh): ShrinkwrapVoidReport {
  if (!mesh || mesh.triangles < 4 || mesh.indices.length < 9) return EMPTY_SHRINKWRAP_VOID;
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
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const cell = Math.max(0.85, span / 96);
  const pad = cell * 3;
  const nx = Math.min(120, Math.max(12, Math.ceil((maxX - minX + pad * 2) / cell) + 1));
  const ny = Math.min(120, Math.max(12, Math.ceil((maxY - minY + pad * 2) / cell) + 1));
  const nz = Math.min(120, Math.max(12, Math.ceil((maxZ - minZ + pad * 2) / cell) + 1));
  const originX = minX - pad;
  const originY = minY - pad;
  const originZ = minZ - pad;
  const count = nx * ny * nz;
  const shell = new Uint8Array(count);
  const reach = cell * 0.9;
  const positions = mesh.positions;
  const indices = mesh.indices;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ia = indices[triangle] * 3;
    const ib = indices[triangle + 1] * 3;
    const ic = indices[triangle + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - originX) / cell) - 1);
    const x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - originX) / cell) + 1);
    const y0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - originY) / cell) - 1);
    const y1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - originY) / cell) + 1);
    const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - originZ) / cell) - 1);
    const z1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - originZ) / cell) + 1);
    for (let z = z0; z <= z1; z += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const px = originX + (x + 0.5) * cell;
          const py = originY + (y + 0.5) * cell;
          const pz = originZ + (z + 0.5) * cell;
          if (distPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) > reach) continue;
          shell[(z * ny + y) * nx + x] = 1;
        }
      }
    }
  }
  const outside = floodAir(shell, nx, ny, nz);
  const solid = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) if (!outside[index]) solid[index] = 1;
  const clearance = new Float32Array(count);
  clearance.fill(1e9);
  const queue = new Int32Array(count);
  let tail = 0;
  for (let index = 0; index < count; index += 1) {
    if (!solid[index]) continue;
    clearance[index] = 0;
    queue[tail] = index;
    tail += 1;
  }
  const stride = nx * ny;
  for (let head = 0; head < tail; head += 1) {
    const index = queue[head];
    const dist = clearance[index];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    const nextDist = dist + cell;
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < nx ? index + 1 : -1,
      y > 0 ? index - nx : -1,
      y + 1 < ny ? index + nx : -1,
      z > 0 ? index - stride : -1,
      z + 1 < nz ? index + stride : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || solid[next] || nextDist >= clearance[next]) continue;
      clearance[next] = nextDist;
      queue[tail] = next;
      tail += 1;
    }
  }
  const hold = Math.min(36, Math.max(18, span * 0.34));
  const steps = Math.max(2, Math.ceil(hold / cell));
  const minRoom = 2.4;
  const sheltered = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (solid[index] || clearance[index] < minRoom || clearance[index] > hold) continue;
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    let pairs = 0;
    let hits = 0;
    const look = (sx: number, sy: number, sz: number) => {
      for (let step = 1; step <= steps; step += 1) {
        const xx = x + sx * step;
        const yy = y + sy * step;
        const zz = z + sz * step;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) return false;
        if (solid[(zz * ny + yy) * nx + xx]) return true;
      }
      return false;
    };
    const px = look(1, 0, 0);
    const nxHit = look(-1, 0, 0);
    const py = look(0, 1, 0);
    const nyHit = look(0, -1, 0);
    const pz = look(0, 0, 1);
    const nzHit = look(0, 0, -1);
    if (px) hits += 1;
    if (nxHit) hits += 1;
    if (py) hits += 1;
    if (nyHit) hits += 1;
    if (pz) hits += 1;
    if (nzHit) hits += 1;
    if (px && nxHit) pairs += 1;
    if (py && nyHit) pairs += 1;
    if (pz && nzHit) pairs += 1;
    if (pairs >= 2 || (pairs >= 1 && hits >= 3)) sheltered[index] = 1;
  }
  const openAir = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!solid[index] && !sheltered[index]) openAir[index] = 1;
  }
  const exterior = floodMarked(openAir, nx, ny, nz);
  const sealed = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!solid[index] && !exterior[index] && clearance[index] >= minRoom) sealed[index] = 1;
  }
  const candidate = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (sheltered[index] || sealed[index]) candidate[index] = 1;
  }
  const regions = labelComponents(candidate, nx, ny, nz);
  const regionsBefore = regions.count;
  const minimum = Math.max(180, regions.largest * 0.08);
  const mainId = regions.largestId;
  const main = new Uint8Array(count);
  const pockets = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const id = regions.ids[index];
    if (id <= 0) continue;
    if (id === mainId && regions.sizes[id] >= minimum) main[index] = 1;
    else if (regions.sizes[id] >= 40) pockets[index] = 1;
  }
  const field = blurMask(main, nx, ny, nz);
  const distances = clearance;
  const voidMesh = surfaceNets(field, distances, main, nx, ny, nz, 0.42, originX, originY, originZ, cell, cell, cell, 1e9);
  const pocketField = blurMask(pockets, nx, ny, nz);
  const pocketMesh = surfaceNets(pocketField, distances, pockets, nx, ny, nz, 0.42, originX, originY, originZ, cell, cell, cell, 1e9);
  let lowX = nx;
  let highX = -1;
  let lowY = ny;
  let highY = -1;
  let lowZ = nz;
  let highZ = -1;
  let cells = 0;
  let plates = 0;
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      let column = false;
      for (let y = 0; y < ny; y += 1) {
        if (!main[(z * ny + y) * nx + x]) continue;
        column = true;
        cells += 1;
        if (x < lowX) lowX = x;
        if (x > highX) highX = x;
        if (y < lowY) lowY = y;
        if (y > highY) highY = y;
        if (z < lowZ) lowZ = z;
        if (z > highZ) highZ = z;
      }
      if (column) plates += 1;
    }
  }
  const smooth = voidMesh.triangles > 4 ? keepLargestIsland(relax(relax(voidMesh))) : null;
  const pocketSkin = pocketMesh.triangles > 4 ? relax(pocketMesh) : null;
  return {
    mesh: smooth,
    pocketsMesh: pocketSkin,
    floorSquareFeet: cells > 0 ? plates * cell * cell : 0,
    volumeCubicFeet: cells * cell * cell * cell,
    maxHeightFeet: cells > 0 ? (highY - lowY + 1) * cell : 0,
    widthFeet: cells > 0 ? (highX - lowX + 1) * cell : 0,
    depthFeet: cells > 0 ? (highZ - lowZ + 1) * cell : 0,
    regionsBefore,
    regionsRetained: cells > 0 ? 1 : 0,
    section: (height: number) => sectionSheets(solid, main, nx, ny, nz, originX, originY, originZ, cell, minY, maxY, height),
  };
}

function floodAir(blocked: Uint8Array, nx: number, ny: number, nz: number) {
  const air = new Uint8Array(blocked.length);
  const queue = new Int32Array(blocked.length);
  const stride = nx * ny;
  let tail = 0;
  const push = (index: number) => {
    if (index < 0 || index >= blocked.length || air[index] || blocked[index]) return;
    air[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push((z * ny + y) * nx);
      push((z * ny + y) * nx + nx - 1);
    }
    for (let x = 0; x < nx; x += 1) {
      push((z * ny) * nx + x);
      push((z * ny + ny - 1) * nx + x);
    }
  }
  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(y * nx + x);
      push(((nz - 1) * ny + y) * nx + x);
    }
  }
  for (let head = 0; head < tail; head += 1) {
    const index = queue[head];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - stride);
    if (z + 1 < nz) push(index + stride);
  }
  return air;
}

function floodMarked(open: Uint8Array, nx: number, ny: number, nz: number) {
  const reached = new Uint8Array(open.length);
  const queue = new Int32Array(open.length);
  let tail = 0;
  const push = (index: number) => {
    if (index < 0 || !open[index] || reached[index]) return;
    reached[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  const stride = nx * ny;
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push((z * ny + y) * nx);
      push((z * ny + y) * nx + nx - 1);
    }
  }
  for (let head = 0; head < tail; head += 1) {
    const index = queue[head];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / stride);
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - stride);
    if (z + 1 < nz) push(index + stride);
  }
  return reached;
}

function labelComponents(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const ids = new Int32Array(mask.length);
  const sizes: number[] = [0];
  const queue = new Int32Array(mask.length);
  let count = 0;
  let largest = 0;
  let largestId = 0;
  const stride = nx * ny;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || ids[start]) continue;
    count += 1;
    let size = 0;
    let tail = 0;
    ids[start] = count;
    queue[0] = start;
    tail = 1;
    for (let head = 0; head < tail; head += 1) {
      const index = queue[head];
      size += 1;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / stride);
      const nexts = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - stride : -1,
        z + 1 < nz ? index + stride : -1,
      ];
      for (const next of nexts) {
        if (next < 0 || !mask[next] || ids[next]) continue;
        ids[next] = count;
        queue[tail] = next;
        tail += 1;
      }
    }
    sizes[count] = size;
    if (size > largest) {
      largest = size;
      largestId = count;
    }
  }
  return { ids, sizes, count, largest, largestId };
}

function keepLargestIsland(mesh: IsoMesh): IsoMesh {
  const triangles = Math.floor(mesh.indices.length / 3);
  if (triangles < 8) return mesh;
  const parent = new Int32Array(triangles);
  for (let index = 0; index < triangles; index += 1) parent[index] = index;
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const unite = (a: number, b: number) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent[left] = right;
  };
  const owner = new Map<number, number>();
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = mesh.indices[triangle * 3 + corner];
      const previous = owner.get(vertex);
      if (previous === undefined) owner.set(vertex, triangle);
      else unite(previous, triangle);
    }
  }
  const counts = new Map<number, number>();
  let largest = 0;
  let largestRoot = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const root = find(triangle);
    const next = (counts.get(root) ?? 0) + 1;
    counts.set(root, next);
    if (next > largest) {
      largest = next;
      largestRoot = root;
    }
  }
  if (counts.size <= 1) return mesh;
  const kept: number[] = [];
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const root = find(triangle);
    if (root === largestRoot || (counts.get(root) ?? 0) >= largest * 0.12) kept.push(triangle);
  }
  if (kept.length === triangles) return mesh;
  const remap = new Map<number, number>();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const take = (vertex: number) => {
    const existing = remap.get(vertex);
    if (existing !== undefined) return existing;
    const next = positions.length / 3;
    remap.set(vertex, next);
    positions.push(mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]);
    normals.push(mesh.normals[vertex * 3], mesh.normals[vertex * 3 + 1], mesh.normals[vertex * 3 + 2]);
    return next;
  };
  for (const triangle of kept) {
    indices.push(take(mesh.indices[triangle * 3]), take(mesh.indices[triangle * 3 + 1]), take(mesh.indices[triangle * 3 + 2]));
  }
  return {
    triangles: kept.length,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

function blurMask(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const field = new Float32Array(mask.length);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let dz = -1; dz <= 1; dz += 1) {
          const zz = z + dz;
          if (zz < 0 || zz >= nz) continue;
          for (let dy = -1; dy <= 1; dy += 1) {
            const yy = y + dy;
            if (yy < 0 || yy >= ny) continue;
            for (let dx = -1; dx <= 1; dx += 1) {
              const xx = x + dx;
              if (xx < 0 || xx >= nx) continue;
              sum += mask[(zz * ny + yy) * nx + xx];
              weight += 1;
            }
          }
        }
        field[(z * ny + y) * nx + x] = weight ? sum / weight : 0;
      }
    }
  }
  return field;
}

function sectionSheets(
  solid: Uint8Array,
  voidMask: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  originX: number,
  originY: number,
  originZ: number,
  cell: number,
  minY: number,
  maxY: number,
  height: number,
) {
  const y = Math.max(0, Math.min(ny - 1, Math.round(((minY + (maxY - minY) * Math.min(1, Math.max(0, height))) - originY) / cell)));
  const plane = originY + (y + 0.5) * cell;
  const solidPositions: number[] = [];
  const voidPositions: number[] = [];
  const solidIndices: number[] = [];
  const voidIndices: number[] = [];
  const push = (bucket: number[], indices: number[], x: number, z: number) => {
    const base = bucket.length / 3;
    const x0 = originX + x * cell;
    const x1 = x0 + cell;
    const z0 = originZ + z * cell;
    const z1 = z0 + cell;
    bucket.push(x0, plane, z0, x1, plane, z0, x1, plane, z1, x0, plane, z1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      const index = (z * ny + y) * nx + x;
      if (voidMask[index]) push(voidPositions, voidIndices, x, z);
      else if (solid[index]) push(solidPositions, solidIndices, x, z);
    }
  }
  const sheet = (bucket: number[], indices: number[]): IsoMesh | null => {
    if (indices.length < 3) return null;
    const mesh = withNormals(bucket, indices);
    return mesh.triangles > 0 ? mesh : null;
  };
  return { solid: sheet(solidPositions, solidIndices), void: sheet(voidPositions, voidIndices) };
}
