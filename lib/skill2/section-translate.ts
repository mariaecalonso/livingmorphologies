import type { SimulationState } from "../skill1/types";
import {
  DEFAULT_MORPHOLOGICAL_EXTRACTION,
  type MorphologicalExtractionConfig,
} from "./measurement-config";
import type { MorphologyMeasurementResult, MorphologyOverlays } from "./measurements";

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

export type SectionOrientation = "source-bottom-up";

export type SectionPrimitiveKind =
  | "solid-body"
  | "mass-spine"
  | "enclosure-edge"
  | "span"
  | "ledge";

export type SectionPoint = { x: number; y: number };

export type SectionPrimitive = {
  kind: SectionPrimitiveKind;
  evidence: string;
  polyline: SectionPoint[];
  /** Occupancy-cell half-widths along the polyline (or one value). */
  radius: number[];
  concentrationIndex?: number;
  cells?: number[];
};

export type SectionModel = {
  orientation: SectionOrientation;
  width: number;
  height: number;
  occupancySize: number;
  protectedVoid: Uint8Array;
  primitives: SectionPrimitive[];
};

type Component = {
  cells: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const idx = (x: number, y: number, width: number) => y * width + x;

function peakOf(values: number[]) {
  let peak = 0.0001;
  for (const value of values) if (value > peak) peak = value;
  return peak;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function connectedComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const seen = new Uint8Array(mask.length);
  const out: Component[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const cells: number[] = [];
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    while (stack.length > 0) {
      const i = stack.pop()!;
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
        const ni = idx(nx, ny, width);
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    out.push({ cells, minX, maxX, minY, maxY });
  }
  return out;
}

function skeletonize(mask: Uint8Array, width: number, height: number) {
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
      if (remove.length) {
        changed = true;
        for (const i of remove) img[i] = 0;
      }
    }
  }
  return img;
}

function distanceToNonMass(mass: Uint8Array, width: number, height: number) {
  const dist = new Float32Array(mass.length);
  const queue: number[] = [];
  for (let i = 0; i < mass.length; i += 1) {
    if (!mass[i]) {
      dist[i] = 0;
      queue.push(i);
    } else dist[i] = 1e9;
  }
  if (queue.length === 0) {
    dist.fill(0);
    return dist;
  }
  for (let q = 0; q < queue.length; q += 1) {
    const i = queue[q];
    const x = i % width;
    const y = (i - x) / width;
    const d = dist[i];
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny, width);
      if (dist[ni] <= d + 1) continue;
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }
  return dist;
}

function degree8(mask: Uint8Array, width: number, height: number, i: number) {
  const x = i % width;
  const y = (i - x) / width;
  let n = 0;
  for (const [ox, oy] of N8) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (mask[ny * width + nx]) n += 1;
  }
  return n;
}

function extractPolylines(skel: Uint8Array, width: number, height: number): number[][] {
  const used = new Uint8Array(skel.length);
  const chains: number[][] = [];
  const neighborsOf = (i: number) => {
    const x = i % width;
    const y = (i - x) / width;
    const found: number[] = [];
    for (const [ox, oy] of N8) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny, width);
      if (skel[ni]) found.push(ni);
    }
    return found;
  };
  const walk = (start: number, prev: number) => {
    const chain = [start];
    used[start] = 1;
    let current = start;
    let last = prev;
    while (true) {
      const nexts = neighborsOf(current).filter((ni) => ni !== last && (!used[ni] || degree8(skel, width, height, ni) !== 2));
      const unused = nexts.filter((ni) => !used[ni]);
      if (unused.length !== 1) break;
      const nxt = unused[0];
      if (degree8(skel, width, height, nxt) !== 2 && nxt !== start) {
        chain.push(nxt);
        used[nxt] = 1;
        break;
      }
      chain.push(nxt);
      used[nxt] = 1;
      last = current;
      current = nxt;
    }
    return chain;
  };
  for (let i = 0; i < skel.length; i += 1) {
    if (!skel[i] || used[i]) continue;
    const deg = degree8(skel, width, height, i);
    if (deg === 2) continue;
    const neigh = neighborsOf(i);
    used[i] = 1;
    if (neigh.length === 0) {
      chains.push([i]);
      continue;
    }
    for (const n of neigh) {
      if (used[n] && degree8(skel, width, height, n) === 2) continue;
      const chain = walk(n, i);
      chains.push([i, ...chain]);
    }
  }
  for (let i = 0; i < skel.length; i += 1) {
    if (!skel[i] || used[i]) continue;
    chains.push(walk(i, -1));
  }
  return chains.filter((chain) => chain.length > 0);
}

function cellsToPoints(cells: number[], width: number): SectionPoint[] {
  return cells.map((i) => ({ x: (i % width) + 0.5, y: Math.floor(i / width) + 0.5 }));
}

function chainLength(cells: number[], width: number, cell: number) {
  if (cells.length < 2) return cells.length * cell;
  let len = 0;
  for (let k = 1; k < cells.length; k += 1) {
    const ax = cells[k - 1] % width;
    const ay = Math.floor(cells[k - 1] / width);
    const bx = cells[k] % width;
    const by = Math.floor(cells[k] / width);
    len += Math.hypot(bx - ax, by - ay) * cell;
  }
  return len;
}

function enclosedVoidCount(component: Component, overlays: MorphologyOverlays) {
  const { width, height, mass, significantVoid } = overlays;
  const minX = component.minX;
  const maxX = component.maxX;
  const minY = component.minY;
  const maxY = component.maxY;
  const inBox = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const seen = new Uint8Array(mass.length);
  const stack: number[] = [];
  const pushEdge = (x: number, y: number) => {
    const i = idx(x, y, width);
    if (mass[i] || seen[i]) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = minX; x <= maxX; x += 1) {
    pushEdge(x, minY);
    pushEdge(x, maxY);
  }
  for (let y = minY; y <= maxY; y += 1) {
    pushEdge(minX, y);
    pushEdge(maxX, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (!inBox(nx, ny)) continue;
      const ni = idx(nx, ny, width);
      if (mass[ni] || seen[ni]) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  let enclosed = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const i = idx(x, y, width);
      if (significantVoid[i] && !seen[i] && !mass[i]) enclosed += 1;
    }
  }
  return enclosed;
}

function perimeterStats(component: Component, overlays: MorphologyOverlays) {
  const { width, height, significantVoid, corridor } = overlays;
  const member = new Set(component.cells);
  let perimeter = 0;
  let voidFace = 0;
  let corridorFace = 0;
  const contour: number[] = [];
  for (const i of component.cells) {
    const x = i % width;
    const y = (i - x) / width;
    let facesVoid = false;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      perimeter += 1;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny, width);
      if (member.has(ni)) {
        perimeter -= 1;
        continue;
      }
      if (significantVoid[ni]) {
        voidFace += 1;
        facesVoid = true;
      } else if (corridor[ni]) corridorFace += 1;
    }
    if (facesVoid) contour.push(i);
  }
  return { perimeter, voidFace, corridorFace, contour };
}

function clipRadius(
  i: number,
  occupancyRadius: number,
  cell: number,
  distNonMass: Float32Array,
  overlays: MorphologyOverlays,
) {
  const trailR = distNonMass[i] * cell;
  let r = Math.min(occupancyRadius, trailR);
  const width = overlays.width;
  const x = i % width;
  const y = (i - x) / width;
  const maxSteps = Math.max(1, Math.ceil(r / cell));
  for (let s = 1; s <= maxSteps; s += 1) {
    let hit = false;
    for (const [ox, oy] of N4) {
      const nx = x + ox * s;
      const ny = y + oy * s;
      if (nx < 0 || ny < 0 || nx >= overlays.width || ny >= overlays.height) continue;
      if (overlays.significantVoid[idx(nx, ny, overlays.width)]) {
        hit = true;
        r = Math.min(r, (s - 0.5) * cell);
      }
    }
    if (hit) break;
  }
  return Math.max(0, r);
}

function radiiForChain(
  chain: number[],
  cell: number,
  distNonMass: Float32Array,
  overlays: MorphologyOverlays,
  trails: number[],
  peak: number,
) {
  return chain.map((i) => {
    const rel = peak > 0 ? (trails[i] ?? 0) / peak : 0.5;
    const raw = 2 * distNonMass[i] * cell * (0.5 + 0.5 * rel);
    return clipRadius(i, raw / 2, cell, distNonMass, overlays);
  });
}

function voidFacingContourChains(contour: number[], width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const i of contour) mask[i] = 1;
  return extractPolylines(mask, width, height);
}

function supportLedges(
  overlays: MorphologyOverlays,
  config: MorphologicalExtractionConfig,
  cell: number,
  occupancySize: number,
  trails: number[],
): SectionPrimitive[] {
  const { width, height, mass, interior } = overlays;
  const peak = peakOf(trails);
  const minSupportCells = Math.max(1, Math.round(config.minSupportLength / cell));
  const primitives: SectionPrimitive[] = [];
  for (let y = 0; y < height - 1; y += 1) {
    let x = 0;
    while (x < width) {
      const i = idx(x, y, width);
      if (!mass[i] || !interior[i]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && mass[idx(x, y, width)] && interior[idx(x, y, width)]) x += 1;
      const run = x - start;
      if (run < minSupportCells) continue;
      let clearance = 0;
      const cells: number[] = [];
      for (let sx = start; sx < x; sx += 1) {
        const above = idx(sx, y + 1, width);
        const rel = peak > 0 ? (trails[above] ?? 0) / peak : 0;
        const trueVoid = rel < config.voidMaxRelative && !mass[above];
        if (trueVoid) {
          clearance += 1;
          cells.push(idx(sx, y, width));
        }
      }
      if (clearance / run < config.minSupportClearanceFraction) continue;
      if (cells.length < minSupportCells) continue;
      primitives.push({
        kind: "ledge",
        evidence: "occupation.support-run",
        polyline: cellsToPoints(cells, width),
        radius: cells.map(() => Math.max(cell * 0.35, occupancySize * 0.01)),
        cells,
      });
    }
  }
  return primitives;
}

function classifyConcentration(
  component: Component,
  overlays: MorphologyOverlays,
  distNonMass: Float32Array,
  massSkel: Uint8Array,
  config: MorphologicalExtractionConfig,
  cell: number,
): { kind: "enclosure-edge" | "solid-body" | "mass-spine" | "discard"; L: number; Tmean: number; Tmax: number } {
  const n = component.cells.length;
  const area = n * cell * cell;
  if (area < config.minConcentrationArea) return { kind: "discard", L: 0, Tmean: 0, Tmax: 0 };
  const bboxW = component.maxX - component.minX + 1;
  const bboxH = component.maxY - component.minY + 1;
  const minDim = Math.max(1, Math.min(bboxW, bboxH));
  const bboxFill = n / (bboxW * bboxH);
  const thicknesses = component.cells.map((i) => distNonMass[i]);
  const Tmean = mean(thicknesses);
  const Tmax = thicknesses.reduce((acc, value) => Math.max(acc, value), 0);
  let Lcells = 0;
  const skelMask = new Uint8Array(overlays.width * overlays.height);
  for (const i of component.cells) {
    if (massSkel[i]) {
      skelMask[i] = 1;
      Lcells += 1;
    }
  }
  const L = Lcells * cell;
  const elongation = Lcells / Math.sqrt(n);
  const stats = perimeterStats(component, overlays);
  const voidRatio = stats.perimeter > 0 ? stats.voidFace / stats.perimeter : 0;
  const enclosed = enclosedVoidCount(component, overlays);
  const wrapsVoid = enclosed >= Math.max(1, Math.round(config.minSignificantVoidArea / (cell * cell)));
  const thinShell = Tmean <= 1.25 && Tmean <= 0.22 * minDim;
  if ((voidRatio >= 0.45 || wrapsVoid) && thinShell) return { kind: "enclosure-edge", L, Tmean, Tmax };
  const interiorCount = overlays.interior.reduce((acc, value) => acc + value, 0);
  const fieldScale = interiorCount > 0 && n > 0.15 * interiorCount;
  const aspect = Math.max(bboxW, bboxH) / minDim;
  const compact = elongation < 2.6 && bboxFill >= 0.45 && aspect < 1.85 && !fieldScale;
  const thick = Tmax >= 0.2 * minDim && Tmean >= 1.15;
  const notShell = !thinShell && !wrapsVoid;
  if (compact && thick && notShell) return { kind: "solid-body", L, Tmean, Tmax };
  const ridge = L >= config.minBridgeLength && Lcells >= 2;
  if (ridge || fieldScale) return { kind: "mass-spine", L, Tmean, Tmax };
  return { kind: "discard", L, Tmean, Tmax };
}

function spanKeep(
  chain: number[],
  overlays: MorphologyOverlays,
  width: number,
  cell: number,
  config: MorphologicalExtractionConfig,
) {
  const length = chainLength(chain, width, cell);
  let through = 0;
  let around = 0;
  let far = 0;
  let zone = 0;
  let massTouch = 0;
  for (const i of chain) {
    const cls = overlays.circulation[i];
    if (cls === 4) through += 1;
    else if (cls === 2) around += 1;
    else if (cls === 1) far += 1;
    else if (cls === 3) zone += 1;
    const x = i % width;
    const y = (i - x) / width;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= overlays.width || ny >= overlays.height) continue;
      if (overlays.mass[idx(nx, ny, overlays.width)]) massTouch += 1;
    }
  }
  const n = chain.length;
  if (through / n >= 0.35) return true;
  if (around / n >= 0.6 && through === 0) return false;
  if (length >= config.minBridgeLength && massTouch >= 2) return true;
  if (length >= config.minBridgeLength && massTouch >= 1 && far / n < 0.9) return true;
  if (length >= Math.max(config.minBridgeLength * 4, 2) && n >= 6) return true;
  if (zone / n >= 0.5 && length >= config.minBridgeLength && massTouch >= 1) return true;
  return false;
}

export function sectionTranslate(
  state: SimulationState,
  morphology: MorphologyMeasurementResult,
): SectionModel {
  const overlays = morphology.overlays;
  const config = morphology.config ?? DEFAULT_MORPHOLOGICAL_EXTRACTION;
  const width = overlays.width;
  const height = overlays.height;
  const occupancySize = state.size;
  const cell = occupancySize > 0 && width > 0 ? occupancySize / width : 1;
  const protectedVoid = overlays.significantVoid.slice();
  const distNonMass = distanceToNonMass(overlays.mass, width, height);
  const massSkel = skeletonize(overlays.mass, width, height);
  const concentrations = connectedComponents(overlays.mass, width, height).filter(
    (component) => component.cells.length * cell * cell >= config.minConcentrationArea,
  );
  const trails = state.trails;
  const peak = peakOf(trails);
  const primitives: SectionPrimitive[] = [];

  concentrations.forEach((component, index) => {
    const decision = classifyConcentration(component, overlays, distNonMass, massSkel, config, cell);
    if (decision.kind === "discard") return;
    if (decision.kind === "solid-body") {
      primitives.push({
        kind: "solid-body",
        evidence: "concentration.compact-thick",
        polyline: cellsToPoints(component.cells, width),
        radius: component.cells.map((i) => clipRadius(i, distNonMass[i] * cell, cell, distNonMass, overlays)),
        concentrationIndex: index,
        cells: [...component.cells],
      });
      return;
    }
    if (decision.kind === "enclosure-edge") {
      const { contour } = perimeterStats(component, overlays);
      const chains = voidFacingContourChains(contour, width, height);
      for (const chain of chains) {
        if (chain.length < 2) continue;
        primitives.push({
          kind: "enclosure-edge",
          evidence: "concentration.void-facing-contour",
          polyline: cellsToPoints(chain, width),
          radius: chain.map((i) =>
            clipRadius(i, Math.max(cell * 0.4, distNonMass[i] * cell), cell, distNonMass, overlays),
          ),
          concentrationIndex: index,
        });
      }
      return;
    }
    const skelMask = new Uint8Array(width * height);
    let ridgeCells = 0;
    for (const i of component.cells) {
      if (massSkel[i]) {
        skelMask[i] = 1;
        ridgeCells += 1;
      }
    }
    if (ridgeCells < 2) {
      const thicknesses = component.cells.map((i) => distNonMass[i]);
      const tmax = thicknesses.reduce((acc, value) => Math.max(acc, value), 0);
      const cutoff = Math.max(1, tmax * 0.65);
      for (const i of component.cells) {
        if (distNonMass[i] >= cutoff) skelMask[i] = 1;
      }
    }
    const chains = extractPolylines(skelMask, width, height);
    const usable = chains.filter((chain) => chainLength(chain, width, cell) >= config.minBridgeLength);
    const source = usable.length ? usable : chains;
    for (const chain of source) {
      if (chain.length < 2) continue;
      primitives.push({
        kind: "mass-spine",
        evidence: "concentration.mass-medial-axis",
        polyline: cellsToPoints(chain, width),
        radius: radiiForChain(chain, cell, distNonMass, overlays, trails, peak),
        concentrationIndex: index,
      });
    }
  });

  const spanMask = new Uint8Array(width * height);
  for (let i = 0; i < spanMask.length; i += 1) {
    if (!overlays.interior[i] || overlays.significantVoid[i] || overlays.mass[i]) continue;
    if (overlays.skeleton[i] && overlays.corridor[i]) spanMask[i] = 1;
  }
  const spanChains = extractPolylines(spanMask, width, height);
  for (const chain of spanChains) {
    if (!spanKeep(chain, overlays, width, cell, config)) continue;
    primitives.push({
      kind: "span",
      evidence: "connection.filtered-skeleton",
      polyline: cellsToPoints(chain, width),
      radius: chain.map((i) => clipRadius(i, Math.max(cell * 0.25, distNonMass[i] * cell * 0.45), cell, distNonMass, overlays)),
    });
  }

  primitives.push(...supportLedges(overlays, config, cell, occupancySize, trails));

  return {
    orientation: "source-bottom-up",
    width,
    height,
    occupancySize,
    protectedVoid,
    primitives,
  };
}
