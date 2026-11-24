import { detectPockets, type NetworkBranch } from "@/lib/skill5/pockets";
import { pointInRing } from "@/lib/skill5/placement";
import { SKILL5_MODULE_ENVELOPE_FEET } from "@/lib/skill5/contract";
import type { XZ } from "@/lib/skill5/site-model";

/** Raster used by both experiments. Five feet keeps the 15 ft graph gaps open. */
export const REGION_CELL_FT = 5;
const SURVIVE = 0.08;
const QUANT = 0.5;

export type RegionNode = { id: string; kind: "source" | "attractor"; x: number; z: number };

export type RegionBand = "north" | "central" | "south";

export type SpatialRegion = {
  id: string;
  kind: "enclosed" | "open" | "narrow";
  areaSqFt: number;
  /** Shorter side of the cell bounding box, in feet. */
  widthFt: number;
  lengthFt: number;
  /** Twice the greatest interior distance to the region's edge. */
  inscribedFt: number;
  centroid: { x: number; z: number };
  band: RegionBand;
  /** Feet from the region's easternmost cell to the parcel edge on that row. */
  eastGapFt: number;
  westGapFt: number;
  touchesEast: boolean;
  touchesWest: boolean;
  /** Median distance from the region's cells to the nearest surviving branch. */
  medianBranchFt: number;
  nearestBuildingFt: number | null;
  anchor: string | null;
};

export type RegionPaint = {
  originX: number;
  originZ: number;
  cell: number;
  cols: number;
  rows: number;
  /** Parallel to `regions`. Zero means no region. */
  cells: Uint8Array;
};

export type RegionExperiment = {
  name: string;
  cellFt: number;
  regions: SpatialRegion[];
  /** Spine or anchor count, depending on the method. */
  guides: number;
  cuts: number;
  paint: RegionPaint;
};

type Grid = {
  cell: number;
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  parcel: Uint8Array;
  branchDist: Float32Array;
};

function keyOf(x: number, z: number) {
  return `${Math.round(x / QUANT)}:${Math.round(z / QUANT)}`;
}

function surviving(branches: readonly NetworkBranch[]) {
  return branches.filter((edge) => edge.conductivity >= SURVIVE && Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0) >= QUANT);
}

function bandOf(z: number, minZ: number, span: number): RegionBand {
  if (z >= minZ + (2 * span) / 3) return "north";
  if (z >= minZ + span / 3) return "central";
  return "south";
}

function boundsOf(ring: readonly XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function makeGrid(parcel: readonly XZ[]): Grid {
  const bounds = boundsOf(parcel);
  const cell = REGION_CELL_FT;
  const originX = bounds.minX;
  const originZ = bounds.minZ;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const parcelMask = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = originX + (col + 0.5) * cell;
      const z = originZ + (row + 0.5) * cell;
      if (pointInRing(x, z, parcel)) parcelMask[row * cols + col] = 1;
    }
  }
  return { cell, originX, originZ, cols, rows, parcel: parcelMask, branchDist: new Float32Array(cols * rows) };
}

function cellCenter(grid: Grid, index: number) {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return { x: grid.originX + (col + 0.5) * grid.cell, z: grid.originZ + (row + 0.5) * grid.cell };
}

function indexAt(grid: Grid, x: number, z: number) {
  const col = Math.floor((x - grid.originX) / grid.cell);
  const row = Math.floor((z - grid.originZ) / grid.cell);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

function segmentDistance(px: number, pz: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / length));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

function fillBranchDistance(grid: Grid, branches: readonly NetworkBranch[]) {
  grid.branchDist.fill(Number.POSITIVE_INFINITY);
  for (let index = 0; index < grid.parcel.length; index += 1) {
    if (grid.parcel[index] !== 1) continue;
    const point = cellCenter(grid, index);
    let best = Number.POSITIVE_INFINITY;
    for (const edge of branches) best = Math.min(best, segmentDistance(point.x, point.z, edge.x0, edge.z0, edge.x1, edge.z1));
    grid.branchDist[index] = best;
  }
}

type Graph = Map<string, { x: number; z: number; edges: { to: string; branch: number }[] }>;

function buildGraph(branches: readonly NetworkBranch[]): Graph {
  const graph: Graph = new Map();
  const add = (x: number, z: number, toX: number, toZ: number, branch: number) => {
    const from = keyOf(x, z);
    const to = keyOf(toX, toZ);
    const vertex = graph.get(from) ?? { x: Math.round(x / QUANT) * QUANT, z: Math.round(z / QUANT) * QUANT, edges: [] };
    if (!vertex.edges.some((edge) => edge.to === to && edge.branch === branch)) vertex.edges.push({ to, branch });
    graph.set(from, vertex);
  };
  branches.forEach((edge, index) => {
    add(edge.x0, edge.z0, edge.x1, edge.z1, index);
    add(edge.x1, edge.z1, edge.x0, edge.z0, index);
  });
  return graph;
}

/** Edges that lie on a shortest route between a source and an attractor. Other branches stay permeable. */
function circulationCuts(branches: readonly NetworkBranch[], nodes: readonly RegionNode[]) {
  const graph = buildGraph(branches);
  const nearest = (x: number, z: number) => {
    let best: string | null = null;
    let distance = 30;
    for (const [id, vertex] of graph) {
      const gap = Math.hypot(vertex.x - x, vertex.z - z);
      if (gap < distance) {
        distance = gap;
        best = id;
      }
    }
    return best;
  };
  const cuts = new Set<number>();
  const sources = nodes.filter((node) => node.kind === "source");
  const attractors = nodes.filter((node) => node.kind === "attractor");
  for (const source of sources) {
    const start = nearest(source.x, source.z);
    if (!start) continue;
    const distance = new Map<string, number>([[start, 0]]);
    const previous = new Map<string, { from: string; branch: number }>();
    const queue = [start];
    while (queue.length > 0) {
      queue.sort((a, b) => (distance.get(a) ?? 0) - (distance.get(b) ?? 0));
      const current = queue.shift();
      if (!current) break;
      const vertex = graph.get(current);
      if (!vertex) continue;
      for (const edge of vertex.edges) {
        const next = (distance.get(current) ?? 0) + Math.hypot(graph.get(edge.to)!.x - vertex.x, graph.get(edge.to)!.z - vertex.z);
        if (next + 1e-6 < (distance.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
          distance.set(edge.to, next);
          previous.set(edge.to, { from: current, branch: edge.branch });
          queue.push(edge.to);
        }
      }
    }
    for (const attractor of attractors) {
      const end = nearest(attractor.x, attractor.z);
      if (!end || !distance.has(end)) continue;
      let cursor: string | undefined = end;
      while (cursor && cursor !== start) {
        const step = previous.get(cursor);
        if (!step) break;
        cuts.add(step.branch);
        cursor = step.from;
      }
    }
  }
  return cuts;
}

function markCuts(grid: Grid, branches: readonly NetworkBranch[], cuts: ReadonlySet<number>) {
  const blocked = new Uint8Array(grid.parcel.length);
  for (const index of cuts) {
    const edge = branches[index];
    const length = Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0);
    const steps = Math.max(1, Math.ceil(length / 2));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const cell = indexAt(grid, edge.x0 + (edge.x1 - edge.x0) * t, edge.z0 + (edge.z1 - edge.z0) * t);
      if (cell >= 0) blocked[cell] = 1;
    }
  }
  return blocked;
}

function flood(grid: Grid, blocked: Uint8Array) {
  const owner = new Int32Array(grid.parcel.length).fill(-1);
  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < grid.parcel.length; start += 1) {
    if (grid.parcel[start] !== 1 || blocked[start] === 1 || owner[start] !== -1) continue;
    owner[start] = count;
    stack.push(start);
    while (stack.length > 0) {
      const current = stack.pop()!;
      const col = current % grid.cols;
      const row = Math.floor(current / grid.cols);
      const next = [col > 0 ? current - 1 : -1, col + 1 < grid.cols ? current + 1 : -1, row > 0 ? current - grid.cols : -1, row + 1 < grid.rows ? current + grid.cols : -1];
      for (const neighbor of next) {
        if (neighbor < 0 || grid.parcel[neighbor] !== 1 || blocked[neighbor] === 1 || owner[neighbor] !== -1) continue;
        owner[neighbor] = count;
        stack.push(neighbor);
      }
    }
    count += 1;
  }
  return { owner, count };
}

function pointInPolygon(x: number, z: number, points: readonly { x: number; z: number }[]) {
  const ring = points.map((point) => [point.x, point.z] as XZ);
  return pointInRing(x, z, ring);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function nearestBuilding(x: number, z: number, buildings: readonly (readonly XZ[])[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const ring of buildings) {
    for (let index = 0; index < ring.length; index += 1) {
      const from = ring[index];
      const to = ring[(index + 1) % ring.length];
      best = Math.min(best, segmentDistance(x, z, from[0], from[1], to[0], to[1]));
    }
  }
  return Number.isFinite(best) ? best : null;
}

function measureComponent(
  grid: Grid,
  indexes: number[],
  parcel: readonly XZ[],
  buildings: readonly (readonly XZ[])[],
  kind: SpatialRegion["kind"],
  id: string,
  anchor: string | null,
): SpatialRegion {
  const bounds = boundsOf(parcel);
  let sumX = 0;
  let sumZ = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxEast = -Infinity;
  let eastAt = 0;
  let minWest = Infinity;
  let westAt = 0;
  const distances: number[] = [];
  for (const index of indexes) {
    const point = cellCenter(grid, index);
    sumX += point.x;
    sumZ += point.z;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
    distances.push(grid.branchDist[index]);
    if (point.x > maxEast) {
      maxEast = point.x;
      eastAt = point.z;
    }
    if (point.x < minWest) {
      minWest = point.x;
      westAt = point.z;
    }
  }
  const centroid = { x: sumX / indexes.length, z: sumZ / indexes.length };
  let parcelEast = maxEast;
  let parcelWest = minWest;
  for (let x = maxEast; x <= bounds.maxX + grid.cell; x += grid.cell) {
    if (!pointInRing(x, eastAt, parcel)) break;
    parcelEast = x;
  }
  for (let x = minWest; x >= bounds.minX - grid.cell; x -= grid.cell) {
    if (!pointInRing(x, westAt, parcel)) break;
    parcelWest = x;
  }
  const width = Math.min(maxX - minX, maxZ - minZ) + grid.cell;
  const length = Math.max(maxX - minX, maxZ - minZ) + grid.cell;
  const inside = new Set(indexes);
  let inscribed = 0;
  for (const index of indexes) {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    let radius = 0;
    for (let step = 1; step < 40; step += 1) {
      const neighbors = [index - step, index + step, index - step * grid.cols, index + step * grid.cols];
      if (neighbors.some((neighbor) => neighbor < 0 || neighbor >= grid.parcel.length || !inside.has(neighbor) || Math.abs((neighbor % grid.cols) - col) > step)) {
        break;
      }
      radius = step;
    }
    inscribed = Math.max(inscribed, radius);
  }
  const narrow = width < SKILL5_MODULE_ENVELOPE_FEET || indexes.length * grid.cell * grid.cell < SKILL5_MODULE_ENVELOPE_FEET * SKILL5_MODULE_ENVELOPE_FEET;
  const buildingFt = nearestBuilding(centroid.x, centroid.z, buildings);
  return {
    id,
    kind: narrow ? "narrow" : kind,
    areaSqFt: Math.round(indexes.length * grid.cell * grid.cell),
    widthFt: Math.round(width),
    lengthFt: Math.round(length),
    inscribedFt: Math.round(inscribed * 2 * grid.cell),
    centroid: { x: Math.round(centroid.x), z: Math.round(centroid.z) },
    band: bandOf(centroid.z, bounds.minZ, bounds.maxZ - bounds.minZ),
    eastGapFt: Math.max(0, Math.round(parcelEast - maxEast)),
    westGapFt: Math.max(0, Math.round(minWest - parcelWest)),
    touchesEast: parcelEast - maxEast <= grid.cell * 1.5,
    touchesWest: minWest - parcelWest <= grid.cell * 1.5,
    medianBranchFt: Math.round(median(distances)),
    nearestBuildingFt: buildingFt === null ? null : Math.round(buildingFt),
    anchor,
  };
}

/**
 * Source-to-attractor routes are the only branch cuts. Side growth stays passable.
 * Enclosed graph faces from detectPockets are reported separately and removed from the open field.
 */
export function circulationPartition(
  parcel: readonly XZ[],
  branches: readonly NetworkBranch[],
  nodes: readonly RegionNode[],
  buildings: readonly (readonly XZ[])[] = [],
): RegionExperiment {
  const kept = surviving(branches);
  const grid = makeGrid(parcel);
  fillBranchDistance(grid, kept);
  const cuts = circulationCuts(kept, nodes);
  const blocked = markCuts(grid, kept, cuts);
  const pockets = detectPockets(kept, parcel).pockets;
  const enclosed = new Uint8Array(grid.parcel.length);
  for (let index = 0; index < grid.parcel.length; index += 1) {
    if (grid.parcel[index] !== 1) continue;
    const point = cellCenter(grid, index);
    if (pockets.some((pocket) => pointInPolygon(point.x, point.z, pocket.points))) enclosed[index] = 1;
  }
  const openBlocked = blocked.map((value, index) => (value === 1 || enclosed[index] === 1 ? 1 : 0));
  const flooded = flood(grid, openBlocked);
  const regions: SpatialRegion[] = [];
  const groups: number[][] = [];
  for (let pocket = 0; pocket < pockets.length; pocket += 1) {
    const cells: number[] = [];
    for (let index = 0; index < enclosed.length; index += 1) {
      if (enclosed[index] !== 1) continue;
      const point = cellCenter(grid, index);
      if (pointInPolygon(point.x, point.z, pockets[pocket].points)) cells.push(index);
    }
    if (cells.length === 0) continue;
    groups.push(cells);
    regions.push(measureComponent(grid, cells, parcel, buildings, "enclosed", `enclosed-${pocket + 1}`, null));
  }
  for (let component = 0; component < flooded.count; component += 1) {
    const cells: number[] = [];
    for (let index = 0; index < flooded.owner.length; index += 1) if (flooded.owner[index] === component) cells.push(index);
    if (cells.length === 0) continue;
    groups.push(cells);
    regions.push(measureComponent(grid, cells, parcel, buildings, "open", `open-${component + 1}`, null));
  }
  const paint = paintOf(grid, groups);
  return { name: "circulation-partition", cellFt: REGION_CELL_FT, regions, guides: kept.length - cuts.size, cuts: cuts.size, paint };
}

function paintOf(grid: Grid, groups: readonly (readonly number[])[]) {
  const cells = new Uint8Array(grid.parcel.length);
  groups.forEach((group, index) => {
    for (const cell of group) cells[cell] = index + 1;
  });
  return { originX: grid.originX, originZ: grid.originZ, cell: grid.cell, cols: grid.cols, rows: grid.rows, cells };
}

/**
 * Every parcel cell is claimed by the nearest source, attractor, or junction.
 * Branches do not block the claim. They only record how far the cell is from the network.
 */
export function anchorBasins(
  parcel: readonly XZ[],
  branches: readonly NetworkBranch[],
  nodes: readonly RegionNode[],
  buildings: readonly (readonly XZ[])[] = [],
  junctions = true,
): RegionExperiment {
  const kept = surviving(branches);
  const grid = makeGrid(parcel);
  fillBranchDistance(grid, kept);
  const graph = buildGraph(kept);
  const seeds: { name: string; x: number; z: number }[] = nodes.map((node) => ({ name: `${node.kind} ${node.id}`, x: node.x, z: node.z }));
  if (junctions) {
    for (const [id, vertex] of graph) {
      const degree = new Set(vertex.edges.map((edge) => edge.to)).size;
      if (degree < 3) continue;
      if (seeds.some((seed) => Math.hypot(seed.x - vertex.x, seed.z - vertex.z) < 20)) continue;
      seeds.push({ name: `junction ${id}`, x: vertex.x, z: vertex.z });
    }
  }
  const owner = new Int32Array(grid.parcel.length).fill(-1);
  const distance = new Float64Array(grid.parcel.length).fill(Number.POSITIVE_INFINITY);
  const heap: { index: number; distance: number }[] = [];
  const push = (item: { index: number; distance: number }) => {
    heap.push(item);
    let cursor = heap.length - 1;
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if (heap[parent].distance <= heap[cursor].distance) break;
      const swap = heap[parent];
      heap[parent] = heap[cursor];
      heap[cursor] = swap;
      cursor = parent;
    }
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (!last || heap.length === 0) return first;
    heap[0] = last;
    let cursor = 0;
    while (true) {
      const left = cursor * 2 + 1;
      const right = left + 1;
      let next = cursor;
      if (left < heap.length && heap[left].distance < heap[next].distance) next = left;
      if (right < heap.length && heap[right].distance < heap[next].distance) next = right;
      if (next === cursor) break;
      const swap = heap[next];
      heap[next] = heap[cursor];
      heap[cursor] = swap;
      cursor = next;
    }
    return first;
  };
  seeds.forEach((seed, seedIndex) => {
    let best = -1;
    let gap = 40;
    for (let index = 0; index < grid.parcel.length; index += 1) {
      if (grid.parcel[index] !== 1) continue;
      const point = cellCenter(grid, index);
      const next = Math.hypot(point.x - seed.x, point.z - seed.z);
      if (next < gap) {
        gap = next;
        best = index;
      }
    }
    if (best < 0 || gap > distance[best]) return;
    distance[best] = 0;
    owner[best] = seedIndex;
    push({ index: best, distance: 0 });
  });
  const stepCost = grid.cell;
  const diagonal = grid.cell * Math.SQRT2;
  while (heap.length > 0) {
    const current = pop();
    if (!current || current.distance > distance[current.index] + 1e-6) continue;
    const col = current.index % grid.cols;
    const row = Math.floor(current.index / grid.cols);
    const neighbors = [
      [1, 0, stepCost], [-1, 0, stepCost], [0, 1, stepCost], [0, -1, stepCost],
      [1, 1, diagonal], [1, -1, diagonal], [-1, 1, diagonal], [-1, -1, diagonal],
    ] as const;
    for (const [dx, dz, cost] of neighbors) {
      const nextCol = col + dx;
      const nextRow = row + dz;
      if (nextCol < 0 || nextRow < 0 || nextCol >= grid.cols || nextRow >= grid.rows) continue;
      const next = nextRow * grid.cols + nextCol;
      if (grid.parcel[next] !== 1) continue;
      const proposed = current.distance + cost;
      if (proposed + 1e-6 < distance[next]) {
        distance[next] = proposed;
        owner[next] = owner[current.index];
        push({ index: next, distance: proposed });
      }
    }
  }
  const pockets = detectPockets(kept, parcel).pockets;
  const enclosed = new Uint8Array(grid.parcel.length);
  for (let index = 0; index < grid.parcel.length; index += 1) {
    if (grid.parcel[index] !== 1) continue;
    const point = cellCenter(grid, index);
    if (pockets.some((pocket) => pointInPolygon(point.x, point.z, pocket.points))) enclosed[index] = 1;
  }
  const regions: SpatialRegion[] = [];
  const groups: number[][] = [];
  for (let pocket = 0; pocket < pockets.length; pocket += 1) {
    const cells: number[] = [];
    for (let index = 0; index < enclosed.length; index += 1) {
      if (enclosed[index] !== 1) continue;
      const point = cellCenter(grid, index);
      if (pointInPolygon(point.x, point.z, pockets[pocket].points)) cells.push(index);
    }
    if (cells.length > 0) {
      groups.push(cells);
      regions.push(measureComponent(grid, cells, parcel, buildings, "enclosed", `enclosed-${pocket + 1}`, null));
    }
  }
  for (let seed = 0; seed < seeds.length; seed += 1) {
    const cells: number[] = [];
    for (let index = 0; index < owner.length; index += 1) if (owner[index] === seed && enclosed[index] === 0) cells.push(index);
    if (cells.length === 0) continue;
    groups.push(cells);
    regions.push(measureComponent(grid, cells, parcel, buildings, "open", `anchor-${seed + 1}`, seeds[seed].name));
  }
  return { name: junctions ? "anchor-basins" : "terminal-basins", cellFt: REGION_CELL_FT, regions, guides: seeds.length, cuts: 0, paint: paintOf(grid, groups) };
}
