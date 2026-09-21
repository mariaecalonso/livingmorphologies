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

export type MorphologyMeasurementResult = {
  measurements: MorphologicalMeasurements;
  summary: MorphologyExtractionSummary;
  config: MorphologicalExtractionConfig;
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

const axisAlignedVoidRuns = (
  voidMask: Uint8Array,
  width: number,
  height: number,
) => {
  const runs: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x <= width; x += 1) {
      const inside = x < width && voidMask[y * width + x];
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
      const inside = y < height && voidMask[y * width + x];
      if (inside) run += 1;
      else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }
  }
  return runs;
};

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
  for (let i = 0; i < fieldCells; i += 1) {
    if (!corridorMask[i]) continue;
    corridorCount += 1;
    const x = i % width;
    const y = (i - x) / width;
    const inside = concentrations.some(
      (component) =>
        x >= component.minX &&
        x <= component.maxX &&
        y >= component.minY &&
        y <= component.maxY,
    );
    if (inside) overlapCells += 1;
  }
  const footprintOverlap = corridorCount > 0 ? overlapCells / corridorCount : 0;

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
  const branching =
    morphComponents.length === 0 ? 0 : junctions / morphComponents.length;

  const voidComponents = connectedComponents(voidMask, width, height);
  const significantVoids = voidComponents.filter((component) => component.cells.length >= minVoidCells);
  const residualGaps = voidComponents.filter((component) => component.cells.length < minVoidCells);
  const voidSizes = voidComponents.map((component) => component.cells.length);
  const largestVoid = voidSizes.reduce((acc, n) => Math.max(acc, n), 0);
  const largestVoidFraction = voidCells > 0 ? largestVoid / voidCells : 0;

  let enclosed = 0;
  let exposed = 0;
  for (const component of significantVoids) {
    for (const i of component.cells) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          exposed += 1;
          continue;
        }
        const ni = ny * width + nx;
        if (morphMask[ni]) enclosed += 1;
      }
    }
  }
  const enclosure = enclosed + exposed > 0 ? enclosed / (enclosed + exposed) : 0;

  const voidRuns = axisAlignedVoidRuns(voidMask, width, height);
  const maxOpenSpan = (voidRuns.reduce((acc, n) => Math.max(acc, n), 0) || 0) * cell;
  const meanOpenSpan = mean(voidRuns) * cell;

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

  let boundaryCells = 0;
  let boundaryVoid = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) continue;
      boundaryCells += 1;
      if (voidMask[y * width + x]) boundaryVoid += 1;
    }
  }
  const boundaryOpenFraction = boundaryCells > 0 ? boundaryVoid / boundaryCells : 0;

  const concentrationSizeVariation = coefficientOfVariation(concentrationAreas);
  const voidSizeVariation = coefficientOfVariation(
    significantVoids.map((component) => component.cells.length * areaUnit),
  );
  const connectionThicknessVariation = coefficientOfVariation(bridgeThicknesses);
  const variationParts = [
    concentrations.length >= 2 ? concentrationSizeVariation : null,
    significantVoids.length >= 2 ? voidSizeVariation : null,
    bridges.length >= 2 ? connectionThicknessVariation : null,
  ].filter((value): value is number => value !== null);
  const overallVariation = variationParts.length ? mean(variationParts) : 0;

  const measurements: MorphologicalMeasurements = {
    field: {
      size: occupancySize,
      height: SECTION_HEIGHT,
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
      branching: finite(branching),
    },
    void: {
      voidFraction: clamp01(voidCells / fieldCells),
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
  };
}

export function measureMorphology(
  state: SimulationState,
  overrides?: Partial<MorphologicalExtractionConfig>,
): MorphologicalMeasurements {
  return measureMorphologyDetailed(state, overrides).measurements;
}

export { DEFAULT_MORPHOLOGICAL_EXTRACTION };
