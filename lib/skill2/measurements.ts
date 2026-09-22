import { SECTION_HEIGHT } from "../skill1/maps";
import type { SimulationState } from "../skill1/types";
import {
  DEFAULT_MORPHOLOGICAL_EXTRACTION,
  resolveExtractionConfig,
  type MorphologicalExtractionConfig,
} from "./measurement-config";
import type { MorphologicalMeasurements } from "./types";

const N4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const N8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export type MorphologyExtractionSummary = {
  trailPeak: number;
  flowPeak: number;
  massCells: number;
  connectionCells: number;
  voidCells: number;
  skeletonJunctions: number;
  skeletonLength: number;
};

/** Diagnostic cell maps for visual audit. Same classification as measurement. */
export type MorphologyOverlays = {
  width: number;
  height: number;
  mass: Uint8Array;
  corridor: Uint8Array;
  significantVoid: Uint8Array;
  interior: Uint8Array;
  skeleton: Uint8Array;
  /** 0 none, 1 far, 2 around, 3 zone, 4 through */
  circulation: Uint8Array;
};

export type MorphologyMeasurementResult = {
  measurements: MorphologicalMeasurements;
  summary: MorphologyExtractionSummary;
  config: MorphologicalExtractionConfig;
  overlays: MorphologyOverlays;
};

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number) => Math.min(1, Math.max(0, finite(value)));

const peakOf = (field: number[]) => {
  let peak = 0;
  for (const value of field) if (value > peak) peak = value;
  return peak;
};

const mean = (values: ArrayLike<number>) => {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
};

const populationStdev = (values: ArrayLike<number>) => {
  if (values.length === 0) return 0;
  const m = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += (values[i] - m) ** 2;
  return Math.sqrt(sum / values.length);
};

const coefficientOfVariation = (values: number[]) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  if (m <= 1e-12) return 0;
  return populationStdev(values) / m;
};

const gini = (values: number[]) => {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  if (sum <= 1e-12) return 0;
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return clamp01(acc / (n * sum));
};

type Component = {
  cells: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const connectedComponents = (
  mask: Uint8Array,
  width: number,
  height: number,
): Component[] => {
  const seen = new Uint8Array(mask.length);
  const components: Component[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    const stack = [start];
    seen[start] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (stack.length > 0) {
      const i = stack.pop();
      if (i === undefined) break;
      cells.push(i);
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    components.push({ cells, minX, maxX, minY, maxY });
  }
  return components;
};

const upsampleNearest = (src: number[], srcSize: number, destSize: number) => {
  const out = new Array<number>(destSize * destSize).fill(0);
  if (src.length !== srcSize * srcSize || destSize <= 0) return out;
  const scale = destSize / srcSize;
  for (let y = 0; y < destSize; y += 1) {
    const sy = Math.min(srcSize - 1, Math.floor(y / scale));
    for (let x = 0; x < destSize; x += 1) {
      const sx = Math.min(srcSize - 1, Math.floor(x / scale));
      out[y * destSize + x] = src[sy * srcSize + sx] ?? 0;
    }
  }
  return out;
};

const distanceToVoid = (morphology: Uint8Array, width: number, height: number) => {
  const dist = new Float32Array(morphology.length);
  const queue: number[] = [];
  for (let i = 0; i < morphology.length; i += 1) {
    if (!morphology[i]) {
      dist[i] = 0;
      queue.push(i);
    } else {
      dist[i] = 1e9;
    }
  }
  if (queue.length === 0) {
    dist.fill(Math.max(width, height));
    return dist;
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head];
    head += 1;
    const x = i % width;
    const y = (i - x) / width;
    const next = dist[i] + 1;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (next < dist[ni]) {
        dist[ni] = next;
        queue.push(ni);
      }
    }
  }
  return dist;
};

const skeletonize = (mask: Uint8Array, width: number, height: number) => {
  const img = mask.slice();
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && img[y * width + x] ? 1 : 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1] as const) {
      const remove: number[] = [];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const i = y * width + x;
          if (!img[i]) continue;
          const p = [
            at(x, y - 1),
            at(x + 1, y - 1),
            at(x + 1, y),
            at(x + 1, y + 1),
            at(x, y + 1),
            at(x - 1, y + 1),
            at(x - 1, y),
            at(x - 1, y - 1),
          ];
          let neighbors = 0;
          for (const value of p) neighbors += value;
          if (neighbors < 2 || neighbors > 6) continue;
          let transitions = 0;
          for (let k = 0; k < 8; k += 1) {
            if (p[k] === 0 && p[(k + 1) % 8] === 1) transitions += 1;
          }
          if (transitions !== 1) continue;
          if (step === 0) {
            if (p[0] * p[2] * p[4] !== 0) continue;
            if (p[2] * p[4] * p[6] !== 0) continue;
          } else {
            if (p[0] * p[2] * p[6] !== 0) continue;
            if (p[0] * p[4] * p[6] !== 0) continue;
          }
          remove.push(i);
        }
      }
      if (remove.length > 0) {
        changed = true;
        for (const i of remove) img[i] = 0;
      }
    }
  }
  return img;
};

const countSkeletonJunctions = (skel: Uint8Array, width: number, height: number) => {
  let junctions = 0;
  let length = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!skel[i]) continue;
      length += 1;
      let neighbors = 0;
      for (const [ox, oy] of N8) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (skel[ny * width + nx]) neighbors += 1;
      }
      if (neighbors >= 3) junctions += 1;
    }
  }
  return { junctions, length };
};

const skeletonDegree = (skel: Uint8Array, width: number, height: number, i: number) => {
  const x = i % width;
  const y = (i - x) / width;
  let neighbors = 0;
  for (const [ox, oy] of N8) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (skel[ny * width + nx]) neighbors += 1;
  }
  return neighbors;
};

/**
 * Junction/endpoint graph of a skeleton. Cycle rank is
 * max(0, edges − nodes + components), with a pure loop (no nodes)
 * counting as one cycle. Branch lengths are occupancy units.
 */
const analyzeSkeletonGraph = (
  skel: Uint8Array,
  width: number,
  height: number,
  cell: number,
) => {
  let endpoints = 0;
  const nodeSet = new Set<number>();
  for (let i = 0; i < skel.length; i += 1) {
    if (!skel[i]) continue;
    const degree = skeletonDegree(skel, width, height, i);
    if (degree === 1) endpoints += 1;
    if (degree !== 2) nodeSet.add(i);
  }
  const skelMask = skel;
  const components = connectedComponents(skelMask, width, height);
  let edges = 0;
  let cycleRank = 0;
  const branchLengths: number[] = [];
  const walkBranch = (start: number, first: number) => {
    let prev = start;
    let cur = first;
    let steps = 1;
    const seen = new Set<number>([start, first]);
    while (cur >= 0) {
      if (nodeSet.has(cur) && cur !== start) return { end: cur, steps };
      const x = cur % width;
      const y = (cur - x) / width;
      let next = -1;
      for (const [ox, oy] of N8) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!skel[ni] || seen.has(ni) || ni === prev) continue;
        next = ni;
        break;
      }
      if (next < 0) return { end: cur, steps };
      seen.add(next);
      prev = cur;
      cur = next;
      steps += 1;
      if (steps > width * height) return { end: cur, steps };
    }
    return { end: cur, steps };
  };
  const edgeKeys = new Set<string>();
  for (const component of components) {
    const nodes = component.cells.filter((i) => nodeSet.has(i));
    if (nodes.length === 0) {
      if (component.cells.length >= 4) cycleRank += 1;
      continue;
    }
    for (const node of nodes) {
      const x = node % width;
      const y = (node - x) / width;
      for (const [ox, oy] of N8) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!skel[ni]) continue;
        const { end, steps } = nodeSet.has(ni) ? { end: ni, steps: 1 } : walkBranch(node, ni);
        if (end < 0 || end === node) continue;
        const key = node < end ? `${node}-${end}-${steps}` : `${end}-${node}-${steps}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        edges += 1;
        branchLengths.push(steps * cell);
      }
    }
  }
  cycleRank += Math.max(0, edges - nodeSet.size + components.length);
  const branchLengthRegularity =
    branchLengths.length >= 2 ? clamp01(1 - coefficientOfVariation(branchLengths)) : 0;
  return {
    endpoints,
    nodes: nodeSet.size,
    edges,
    cycleRank,
    branchCount: branchLengths.length,
    branchLengthRegularity,
    branchLengths,
  };
};

const axisAlignedVoidRuns = (
  voidMask: Uint8Array,
  width: number,
  height: number,
  domain?: Uint8Array,
) => {
  const open = (i: number) => Boolean(voidMask[i] && (!domain || domain[i]));
  const runs: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x <= width; x += 1) {
      const inside = x < width && open(y * width + x);
      if (inside) run += 1;
      else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    for (let y = 0; y <= height; y += 1) {
      const inside = y < height && open(y * width + x);
      if (inside) run += 1;
      else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }
  }
  return runs;
};

/**
 * Interior analysis domain: occupancy cells farther than Skill 1 edge
 * suppression from the field border. Empty perimeter is a simulation
 * boundary condition, not morphological openness.
 */
export function buildInteriorMask(
  width: number,
  height: number,
  occupancySize: number,
  margin: number,
): Uint8Array {
  const interior = new Uint8Array(Math.max(0, width * height));
  if (width <= 0 || height <= 0) return interior;
  if (occupancySize <= 0 || margin <= 0) {
    interior.fill(1);
    return interior;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ox = ((x + 0.5) * occupancySize) / width;
      const oy = ((y + 0.5) * occupancySize) / height;
      const edge = Math.min(ox, oy, occupancySize - ox, occupancySize - oy);
      if (edge >= margin) interior[y * width + x] = 1;
    }
  }
  return interior;
}

const morphologyReachable = (
  morphology: Uint8Array,
  width: number,
  height: number,
  seeds: number[],
) => {
  const seen = new Uint8Array(morphology.length);
  const stack = [...seeds];
  for (const seed of seeds) {
    if (seed >= 0 && seed < morphology.length) seen[seed] = 1;
  }
  while (stack.length > 0) {
    const i = stack.pop();
    if (i === undefined) break;
    const x = i % width;
    const y = (i - x) / width;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (seen[ni] || !morphology[ni]) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
};

export function measureMorphologyDetailed(
  state: SimulationState,
  overrides?: Partial<MorphologicalExtractionConfig>,
): MorphologyMeasurementResult {
  const config = resolveExtractionConfig(overrides);
  const width = state.trailSize;
  const height = state.trailSize;
  const occupancySize = state.size;
  const cell = occupancySize > 0 && width > 0 ? occupancySize / width : 1;
  const areaUnit = cell * cell;
  const fieldCells = Math.max(1, width * height);
  const trails = state.trails;
  const trailPeak = peakOf(trails);
  const flowField =
    state.flow.length === occupancySize * occupancySize
      ? upsampleNearest(state.flow, occupancySize, width)
      : new Array<number>(fieldCells).fill(0);
  const flowPeak = peakOf(flowField);

  const relative = new Float32Array(fieldCells);
  const massMask = new Uint8Array(fieldCells);
  const morphMask = new Uint8Array(fieldCells);
  const voidMask = new Uint8Array(fieldCells);
  const connectionBand = new Uint8Array(fieldCells);
  let massCells = 0;
  let connectionCells = 0;
  let voidCells = 0;
  let activitySum = 0;
  let activityMomentX = 0;
  let activityMomentY = 0;
  let activityWeight = 0;

  for (let i = 0; i < fieldCells; i += 1) {
    const rel = trailPeak > 0 ? (trails[i] ?? 0) / trailPeak : 0;
    relative[i] = rel;
    activitySum += rel;
    if (rel < config.voidMaxRelative) {
      voidMask[i] = 1;
      voidCells += 1;
    } else {
      morphMask[i] = 1;
      const x = i % width;
      const y = (i - x) / width;
      activityWeight += rel;
      activityMomentX += rel * x;
      activityMomentY += rel * y;
      if (rel >= config.massMinRelative) {
        massMask[i] = 1;
        massCells += 1;
      } else {
        connectionBand[i] = 1;
        connectionCells += 1;
      }
    }
  }

  const interior = buildInteriorMask(width, height, occupancySize, config.analysisEdgeMargin);
  let interiorCellCount = 0;
  let interiorVoidCells = 0;
  let interiorMinX = width;
  let interiorMaxX = -1;
  let interiorMinY = height;
  let interiorMaxY = -1;
  const interiorVoidMask = new Uint8Array(fieldCells);
  for (let i = 0; i < fieldCells; i += 1) {
    if (!interior[i]) continue;
    interiorCellCount += 1;
    const x = i % width;
    const y = (i - x) / width;
    if (x < interiorMinX) interiorMinX = x;
    if (x > interiorMaxX) interiorMaxX = x;
    if (y < interiorMinY) interiorMinY = y;
    if (y > interiorMaxY) interiorMaxY = y;
    if (voidMask[i]) {
      interiorVoidMask[i] = 1;
      interiorVoidCells += 1;
    }
  }
  const interiorExtent =
    interiorMaxX >= interiorMinX
      ? Math.max(interiorMaxX - interiorMinX + 1, interiorMaxY - interiorMinY + 1) * cell
      : Math.max(0, occupancySize - 2 * config.analysisEdgeMargin);

  const minMassCells = Math.max(1, Math.round(config.minConcentrationArea / areaUnit));
  const minVoidCells = Math.max(1, Math.round(config.minSignificantVoidArea / areaUnit));
  const minBridgeCells = Math.max(1, Math.round(config.minBridgeLength / cell));
  const minSupportCells = Math.max(1, Math.round(config.minSupportLength / cell));

  const denseComponents = connectedComponents(massMask, width, height);
  const concentrations = denseComponents.filter((component) => component.cells.length >= minMassCells);
  const concentrationId = new Int32Array(fieldCells).fill(-1);
  concentrations.forEach((component, id) => {
    for (const i of component.cells) concentrationId[i] = id;
  });

  const corridorMask = new Uint8Array(fieldCells);
  for (let i = 0; i < fieldCells; i += 1) {
    if (morphMask[i] && concentrationId[i] < 0) corridorMask[i] = 1;
  }
  const corridorComponents = connectedComponents(corridorMask, width, height);

  const neighborConcentrationIds = (i: number) => {
    const ids = new Set<number>();
    const x = i % width;
    const y = (i - x) / width;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const id = concentrationId[ny * width + nx];
      if (id >= 0) ids.add(id);
    }
    return ids;
  };

  const bridges = corridorComponents.filter((component) => {
    if (component.cells.length < minBridgeCells) return false;
    const ids = new Set<number>();
    for (const i of component.cells) {
      for (const id of neighborConcentrationIds(i)) ids.add(id);
    }
    return ids.size >= 2;
  });

  const dist = distanceToVoid(morphMask, width, height);
  const bridgeThicknesses = bridges.map((component) => {
    const radii = component.cells.map((i) => dist[i] * cell);
    return 2 * mean(radii);
  });
  const bridgeLengths = bridges.map((component) => {
    const dx = (component.maxX - component.minX + 1) * cell;
    const dy = (component.maxY - component.minY + 1) * cell;
    return Math.max(dx, dy);
  });

  let linkedPairs = 0;
  const pairCount = (concentrations.length * (concentrations.length - 1)) / 2;
  if (concentrations.length >= 2) {
    for (let a = 0; a < concentrations.length; a += 1) {
      const reachable = morphologyReachable(
        morphMask,
        width,
        height,
        concentrations[a].cells,
      );
      for (let b = a + 1; b < concentrations.length; b += 1) {
        if (concentrations[b].cells.some((i) => reachable[i])) linkedPairs += 1;
      }
    }
  }
  const continuity =
    concentrations.length < 2 ? 1 : pairCount > 0 ? linkedPairs / pairCount : 1;

  let perimeterContactSum = 0;
  for (const component of concentrations) {
    const member = new Set(component.cells);
    let perimeter = 0;
    let contact = 0;
    for (const i of component.cells) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          perimeter += 1;
          continue;
        }
        const ni = ny * width + nx;
        if (member.has(ni)) continue;
        perimeter += 1;
        if (connectionBand[ni] || corridorMask[ni]) contact += 1;
      }
    }
    perimeterContactSum += perimeter > 0 ? contact / perimeter : 0;
  }
  const meanPerimeterContact =
    concentrations.length > 0 ? perimeterContactSum / concentrations.length : 0;

  let overlapCells = 0;
  let corridorCount = 0;
  let embeddedCells = 0;
  let farCells = 0;
  let aroundCells = 0;
  let zoneCells = 0;
  let throughCells = 0;
  const circulation = new Uint8Array(fieldCells);
  const insideAabb = (x: number, y: number) =>
    concentrations.some(
      (component) =>
        x >= component.minX &&
        x <= component.maxX &&
        y >= component.minY &&
        y <= component.maxY,
    );
  for (let i = 0; i < fieldCells; i += 1) {
    if (!corridorMask[i] || !interior[i]) continue;
    corridorCount += 1;
    const x = i % width;
    const y = (i - x) / width;
    const inside = insideAabb(x, y);
    if (inside) overlapCells += 1;
    const left = x > 0 && massMask[i - 1];
    const right = x < width - 1 && massMask[i + 1];
    const up = y > 0 && massMask[i - width];
    const down = y < height - 1 && massMask[i + width];
    const sandwich = (left && right) || (up && down);
    if (sandwich) embeddedCells += 1;
    const n4Mass = neighborConcentrationIds(i).size > 0;
    // Precedence: through > around/wrap (N4 boundary) > zone (AABB, not wrap) > far.
    // Wrap that sits inside a fat concentration AABB stays AROUND, not ZONE.
    if (sandwich) {
      throughCells += 1;
      circulation[i] = 4;
    } else if (n4Mass) {
      aroundCells += 1;
      circulation[i] = 2;
    } else if (inside) {
      zoneCells += 1;
      circulation[i] = 3;
    } else {
      farCells += 1;
      circulation[i] = 1;
    }
  }
  const footprintOverlap = corridorCount > 0 ? overlapCells / corridorCount : 0;
  const embeddedNetworkFraction = corridorCount > 0 ? embeddedCells / corridorCount : 0;
  const farNetworkFraction = corridorCount > 0 ? farCells / corridorCount : 1;
  const aroundNetworkFraction = corridorCount > 0 ? aroundCells / corridorCount : 0;
  const zoneNetworkFraction = corridorCount > 0 ? zoneCells / corridorCount : 0;
  const throughNetworkFraction = corridorCount > 0 ? throughCells / corridorCount : 0;

  const centroids = concentrations.map((component) => {
    let sx = 0;
    let sy = 0;
    for (const i of component.cells) {
      sx += i % width;
      sy += (i - (i % width)) / width;
    }
    const n = Math.max(1, component.cells.length);
    return { x: (sx / n) * cell, y: (sy / n) * cell };
  });
  const centroidGaps: number[] = [];
  for (let a = 0; a < centroids.length; a += 1) {
    for (let b = a + 1; b < centroids.length; b += 1) {
      centroidGaps.push(Math.hypot(centroids[a].x - centroids[b].x, centroids[a].y - centroids[b].y));
    }
  }
  const meanCentroidSeparation = finite(mean(centroidGaps));

  const morphComponents = connectedComponents(morphMask, width, height);
  const morphSizes = morphComponents.map((component) => component.cells.length);
  const morphTotal = morphSizes.reduce((acc, n) => acc + n, 0);
  const largestMorph = morphSizes.reduce((acc, n) => Math.max(acc, n), 0);

  const skel = skeletonize(morphMask, width, height);
  const { junctions, length: skeletonLength } = countSkeletonJunctions(skel, width, height);
  const skeletonOccupancyLength = skeletonLength * cell;
  const branching = skeletonOccupancyLength > 1e-9 ? junctions / skeletonOccupancyLength : 0;
  const graph = analyzeSkeletonGraph(skel, width, height, cell);
  const cycleDensity =
    graph.nodes > 0 ? graph.cycleRank / graph.nodes : graph.cycleRank > 0 ? 1 : 0;

  const interiorCorridorMask = new Uint8Array(fieldCells);
  for (let i = 0; i < fieldCells; i += 1) {
    if (corridorMask[i] && interior[i]) interiorCorridorMask[i] = 1;
  }
  const interiorCorridorComponents = connectedComponents(interiorCorridorMask, width, height);
  let separatedCorridorCells = 0;
  let interiorCorridorCells = 0;
  for (const component of interiorCorridorComponents) {
    interiorCorridorCells += component.cells.length;
    const touchesMass = component.cells.some((i) => neighborConcentrationIds(i).size > 0);
    if (!touchesMass) separatedCorridorCells += component.cells.length;
  }
  const separatedNetworkFraction =
    interiorCorridorCells > 0 ? separatedCorridorCells / interiorCorridorCells : 1;

  const voidComponents = connectedComponents(interiorVoidMask, width, height);
  const significantVoids = voidComponents.filter((component) => component.cells.length >= minVoidCells);
  const significantVoid = new Uint8Array(fieldCells);
  for (const component of significantVoids) {
    for (const i of component.cells) significantVoid[i] = 1;
  }
  const residualGaps = voidComponents.filter((component) => component.cells.length < minVoidCells);
  const voidSizes = voidComponents.map((component) => component.cells.length);
  const largestVoid = voidSizes.reduce((acc, n) => Math.max(acc, n), 0);
  const largestVoidFraction = interiorVoidCells > 0 ? largestVoid / interiorVoidCells : 0;

  const innerPerimeterSeeds: number[] = [];
  for (let i = 0; i < fieldCells; i += 1) {
    if (!interior[i] || !interiorVoidMask[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    let nextToRing = false;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        nextToRing = true;
        break;
      }
      const ni = ny * width + nx;
      if (!interior[ni]) {
        nextToRing = true;
        break;
      }
    }
    if (nextToRing) innerPerimeterSeeds.push(i);
  }
  const openInteriorVoid = morphologyReachable(interiorVoidMask, width, height, innerPerimeterSeeds);
  let openVoidCells = 0;
  for (let i = 0; i < fieldCells; i += 1) {
    if (openInteriorVoid[i]) openVoidCells += 1;
  }
  const enclosure =
    interiorVoidCells > 0 ? clamp01(1 - openVoidCells / interiorVoidCells) : 0;

  const voidRuns = axisAlignedVoidRuns(interiorVoidMask, width, height, interior);
  const maxOpenSpan = (voidRuns.reduce((acc, n) => Math.max(acc, n), 0) || 0) * cell;
  const meanOpenSpan = mean(voidRuns) * cell;

  const surroundRadius = Math.max(2, Math.round(2.5 / Math.max(cell, 1e-9)));
  let surroundSum = 0;
  let surroundSamples = 0;
  let depthSum = 0;
  let depthSamples = 0;
  for (let i = 0; i < fieldCells; i += 1) {
    if (!interior[i] || !interiorVoidMask[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    let hits = 0;
    let nearMorph = false;
    for (const [ox, oy] of N4) {
      let seenMorph = false;
      let morphRun = 0;
      for (let step = 1; step <= surroundRadius; step += 1) {
        const nx = x + ox * step;
        const ny = y + oy * step;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) break;
        const ni = ny * width + nx;
        if (!interior[ni]) break;
        if (morphMask[ni]) {
          seenMorph = true;
          nearMorph = true;
          morphRun += 1;
        } else if (seenMorph) {
          break;
        } else if (!interiorVoidMask[ni]) {
          break;
        }
      }
      if (seenMorph) {
        hits += 1;
        depthSum += morphRun * cell;
        depthSamples += 1;
      }
    }
    if (!nearMorph) continue;
    surroundSum += hits / 4;
    surroundSamples += 1;
  }
  const directionalSurround = surroundSamples > 0 ? surroundSum / surroundSamples : 0;
  const morphologicalDepth = depthSamples > 0 ? depthSum / depthSamples : 0;

  let layerTransitions = 0;
  let layerLines = 0;
  for (let y = 0; y < height; y += 1) {
    let prev: 0 | 1 | 2 | null = null;
    let used = false;
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!interior[i]) {
        prev = null;
        continue;
      }
      used = true;
      const kind: 0 | 1 | 2 = morphMask[i] ? 1 : interiorVoidMask[i] ? 0 : 2;
      if (prev !== null && prev !== kind && (prev === 0 || prev === 1) && (kind === 0 || kind === 1)) {
        layerTransitions += 1;
      }
      prev = kind;
    }
    if (used) layerLines += 1;
  }
  for (let x = 0; x < width; x += 1) {
    let prev: 0 | 1 | 2 | null = null;
    let used = false;
    for (let y = 0; y < height; y += 1) {
      const i = y * width + x;
      if (!interior[i]) {
        prev = null;
        continue;
      }
      used = true;
      const kind: 0 | 1 | 2 = morphMask[i] ? 1 : interiorVoidMask[i] ? 0 : 2;
      if (prev !== null && prev !== kind && (prev === 0 || prev === 1) && (kind === 0 || kind === 1)) {
        layerTransitions += 1;
      }
      prev = kind;
    }
    if (used) layerLines += 1;
  }
  const layering = clamp01(layerTransitions / Math.max(1, layerLines) / 4);

  const concentrationAreas = concentrations.map((component) => component.cells.length * areaUnit);
  const concentrationIntensities = concentrations.map((component) =>
    mean(component.cells.map((i) => relative[i])),
  );
  const concentrationScores = concentrations.map((component, index) => {
    const flowMean =
      flowPeak > 0 ? mean(component.cells.map((i) => flowField[i] / flowPeak)) : 0;
    return (
      concentrationAreas[index] *
      concentrationIntensities[index] *
      (0.5 + 0.5 * flowMean)
    );
  });

  const supportLengths: number[] = [];
  let supportCells = 0;
  for (let y = 0; y < height - 1; y += 1) {
    let x = 0;
    while (x < width) {
      if (!massMask[y * width + x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && massMask[y * width + x]) x += 1;
      const run = x - start;
      if (run < minSupportCells) continue;
      let clearance = 0;
      for (let sx = start; sx < x; sx += 1) {
        if (voidMask[(y + 1) * width + sx]) clearance += 1;
      }
      if (clearance / run < config.minSupportClearanceFraction) continue;
      supportLengths.push(run * cell);
      supportCells += run;
    }
  }

  const halfDiagonal = 0.5 * Math.hypot(width, height);
  let spatialSpread = 0;
  let centerProximity = 0;
  const fieldCx = (width - 1) / 2;
  const fieldCy = (height - 1) / 2;
  if (activityWeight > 1e-12 && halfDiagonal > 0) {
    const cx = activityMomentX / activityWeight;
    const cy = activityMomentY / activityWeight;
    let moment = 0;
    for (let i = 0; i < fieldCells; i += 1) {
      if (!morphMask[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      moment += relative[i] * ((x - cx) ** 2 + (y - cy) ** 2);
    }
    spatialSpread = clamp01(Math.sqrt(moment / activityWeight) / halfDiagonal);
    centerProximity = clamp01(1 - Math.hypot(cx - fieldCx, cy - fieldCy) / halfDiagonal);
  }

  let dominantCenterProximity = 0;
  if (concentrations.length > 0) {
    const dominant = concentrations.reduce((best, component) =>
      component.cells.length > best.cells.length ? component : best,
    );
    const n = Math.max(1, dominant.cells.length);
    let sx = 0;
    let sy = 0;
    for (const i of dominant.cells) {
      sx += i % width;
      sy += (i - (i % width)) / width;
    }
    dominantCenterProximity = clamp01(
      1 - Math.hypot(sx / n - fieldCx, sy / n - fieldCy) / Math.max(halfDiagonal, 1e-9),
    );
  }

  const occupancyHalfDiag = 0.5 * Math.hypot(occupancySize, occupancySize);
  const nearest: number[] = [];
  for (let i = 0; i < centroids.length; i += 1) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < centroids.length; j += 1) {
      if (i === j) continue;
      const gap = Math.hypot(centroids[i].x - centroids[j].x, centroids[i].y - centroids[j].y);
      if (gap < best) best = gap;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  const sizeRegularity =
    concentrations.length >= 2 ? clamp01(1 - coefficientOfVariation(concentrationAreas)) : 0;
  const spacingRegularity =
    nearest.length >= 2 ? clamp01(1 - coefficientOfVariation(nearest)) : 0;
  const clusteredness =
    nearest.length > 0 && occupancyHalfDiag > 0
      ? clamp01(1 - mean(nearest) / occupancyHalfDiag)
      : 0;
  const meanNearestNeighbor = finite(mean(nearest));

  let morphMinX = width;
  let morphMaxX = -1;
  let morphMinY = height;
  let morphMaxY = -1;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let morphCount = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < fieldCells; i += 1) {
    if (!morphMask[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    morphCount += 1;
    mx += x;
    my += y;
    if (x < morphMinX) morphMinX = x;
    if (x > morphMaxX) morphMaxX = x;
    if (y < morphMinY) morphMinY = y;
    if (y > morphMaxY) morphMaxY = y;
  }
  if (morphCount > 0) {
    mx /= morphCount;
    my /= morphCount;
    for (let i = 0; i < fieldCells; i += 1) {
      if (!morphMask[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      const dx = x - mx;
      const dy = y - my;
      xx += dx * dx;
      xy += dx * dy;
      yy += dy * dy;
    }
    xx /= morphCount;
    xy /= morphCount;
    yy /= morphCount;
  }
  const trace = xx + yy;
  const disc = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) + 4 * xy * xy));
  const lambda1 = 0.5 * (trace + disc);
  const lambda2 = 0.5 * (trace - disc);
  const anisotropy = lambda1 + lambda2 > 1e-12 ? clamp01((lambda1 - lambda2) / (lambda1 + lambda2)) : 0;
  const bboxArea =
    morphMaxX >= morphMinX ? (morphMaxX - morphMinX + 1) * (morphMaxY - morphMinY + 1) : 0;
  const boundingBoxFill = bboxArea > 0 ? clamp01(morphCount / bboxArea) : 0;

  let innerPerimeterCells = 0;
  let innerPerimeterVoid = 0;
  for (let i = 0; i < fieldCells; i += 1) {
    if (!interior[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    let nextToRing = false;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        nextToRing = true;
        break;
      }
      if (!interior[ny * width + nx]) {
        nextToRing = true;
        break;
      }
    }
    if (!nextToRing) continue;
    innerPerimeterCells += 1;
    if (interiorVoidMask[i]) innerPerimeterVoid += 1;
  }
  const boundaryOpenFraction = innerPerimeterCells > 0 ? innerPerimeterVoid / innerPerimeterCells : 0;

  const significantVoidAreas = significantVoids.map((component) => component.cells.length * areaUnit);
  const concentrationSizeVariation =
    concentrations.length >= 2 ? coefficientOfVariation(concentrationAreas) : 0;
  const voidSizeVariation =
    significantVoids.length >= 2 ? coefficientOfVariation(significantVoidAreas) : 0;
  const connectionThicknessVariation =
    bridges.length >= 2 ? coefficientOfVariation(bridgeThicknesses) : 0;
  const variationParts = [
    concentrations.length >= 2 ? concentrationSizeVariation : null,
    significantVoids.length >= 2 ? voidSizeVariation : null,
    bridges.length >= 2 ? connectionThicknessVariation : null,
  ].filter((value): value is number => value !== null);
  const elementCount = variationParts.length;
  const insufficientElements = variationParts.length === 0 ? 1 : 0;
  const overallVariation = variationParts.length ? mean(variationParts) : 0;

  const measurements: MorphologicalMeasurements = {
    field: {
      size: occupancySize,
      height: SECTION_HEIGHT,
    },
    analysis: {
      edgeSuppressionMargin: config.analysisEdgeMargin,
      interiorCellCount,
      boundaryRingCellCount: fieldCells - interiorCellCount,
      interiorExtent: finite(interiorExtent),
    },
    activity: {
      meanDensity: clamp01(activitySum / fieldCells),
      densityVariation: finite(populationStdev(relative)),
      peakConcentration: finite(trailPeak),
      spatialSpread,
      centerProximity,
    },
    mass: {
      totalMassFraction: clamp01(massCells / fieldCells),
      concentrationCount: concentrations.length,
      meanArea: finite(mean(concentrationAreas)),
      meanIntensity: clamp01(mean(concentrationIntensities)),
      scaleHierarchy: gini(concentrationScores),
      meanCentroidSeparation,
      dominantCenterProximity,
      sizeRegularity,
      spacingRegularity,
      clusteredness,
      meanNearestNeighbor,
    },
    connection: {
      bridgeCount: bridges.length,
      meanBridgeThickness: finite(mean(bridgeThicknesses)),
      meanBridgeLength: finite(mean(bridgeLengths)),
      continuity: clamp01(continuity),
      pairOpportunityCount: pairCount,
      linkedPairCount: linkedPairs,
      meanPerimeterContact: clamp01(meanPerimeterContact),
      footprintOverlap: clamp01(footprintOverlap),
      embeddedNetworkFraction: clamp01(embeddedNetworkFraction),
      separatedNetworkFraction: clamp01(separatedNetworkFraction),
      farNetworkFraction: clamp01(farNetworkFraction),
      aroundNetworkFraction: clamp01(aroundNetworkFraction),
      zoneNetworkFraction: clamp01(zoneNetworkFraction),
      throughNetworkFraction: clamp01(throughNetworkFraction),
      branching: finite(branching),
      skeletonEndpoints: graph.endpoints,
      skeletonNodes: graph.nodes,
      cycleRank: graph.cycleRank,
      cycleDensity: clamp01(cycleDensity),
      branchCount: graph.branchCount,
      branchLengthRegularity: clamp01(graph.branchLengthRegularity),
    },
    void: {
      voidFraction: clamp01(interiorCellCount > 0 ? interiorVoidCells / interiorCellCount : 1),
      significantVoidCount: significantVoids.length,
      residualGapCount: residualGaps.length,
      largestVoidFraction: clamp01(largestVoidFraction),
      voidContinuity: clamp01(largestVoidFraction),
      meanOpenSpan: finite(meanOpenSpan),
      maxOpenSpan: finite(maxOpenSpan),
      meanSignificantArea: finite(
        mean(significantVoids.map((component) => component.cells.length * areaUnit)),
      ),
      boundaryOpenFraction: clamp01(boundaryOpenFraction),
    },
    topology: {
      connectedComponentCount: morphComponents.length,
      largestComponentFraction: morphTotal > 0 ? clamp01(largestMorph / morphTotal) : 0,
      enclosure: clamp01(enclosure),
      anisotropy,
      boundingBoxFill,
      directionalSurround: clamp01(directionalSurround),
      morphologicalDepth: finite(morphologicalDepth),
      layering: clamp01(layering),
    },
    occupation: {
      potentialOccupationFraction: clamp01(supportCells / fieldCells),
      supportContinuity: clamp01(mean(supportLengths.map((length) => length / occupancySize))),
      supportCount: supportLengths.length,
      meanSupportLength: finite(mean(supportLengths)),
    },
    proportion: {
      concentrationSizeVariation: finite(concentrationSizeVariation),
      voidSizeVariation: finite(voidSizeVariation),
      connectionThicknessVariation: finite(connectionThicknessVariation),
      overallVariation: finite(overallVariation),
      elementCount,
      insufficientElements,
    },
  };

  return {
    measurements,
    summary: {
      trailPeak,
      flowPeak,
      massCells,
      connectionCells,
      voidCells,
      skeletonJunctions: junctions,
      skeletonLength,
    },
    config,
    overlays: {
      width,
      height,
      mass: massMask,
      corridor: corridorMask,
      significantVoid,
      interior,
      skeleton: skel,
      circulation,
    },
  };
}

export function measureMorphology(
  state: SimulationState,
  overrides?: Partial<MorphologicalExtractionConfig>,
): MorphologicalMeasurements {
  return measureMorphologyDetailed(state, overrides).measurements;
}

export { DEFAULT_MORPHOLOGICAL_EXTRACTION };
