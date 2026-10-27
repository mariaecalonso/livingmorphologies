import { BRANCHES } from "../catalog";
import type { Rating, RatingsMap, TypologyId } from "../types";
import { CONVERGENCE_EPSILON, FIELD_SIZE } from "./maps";
import type { Point, SimulationState } from "./types";

/**
 * Read-only measurements of a Skill 1 simulation.
 * Nothing in this module writes agent, trail, flow, or occupancy state.
 *
 * Occupancy threshold: a 20×20 cell is occupied when its mean trail is at least
 * OCCUPANCY_THRESHOLD_RATIO of the peak mean on that same aggregated grid.
 * The mean uses the same block average as the simulator's occupancy downsample.
 */

export const OCCUPANCY_THRESHOLD_RATIO = 0.12;
export const DEFAULT_SAMPLE_INTERVAL = 8;
export const MAX_ANALYSIS_SAMPLES = 96;
export const DIRECTION_BINS = 16;
export const STABILIZATION_REFERENCE = CONVERGENCE_EPSILON * 8;
export const HISTOGRAM_BINS = 8;

const DNA_AXES = [
  {
    id: "centrality",
    label: "Centrality",
    criterionId: "centrality",
    kind: "derived",
  },
  {
    id: "connectivity",
    label: "Connectivity",
    criterionId: "connectivity",
    kind: "derived",
  },
  {
    id: "openness",
    label: "Openness",
    criterionId: "openness",
    kind: "derived",
  },
  {
    id: "directionality",
    label: "Directionality",
    criterionId: "directionality",
    kind: "derived",
  },
  {
    id: "visibility",
    label: "Visibility",
    criterionId: "visibility",
    kind: "derived",
  },
  {
    id: "immersion",
    label: "Immersion",
    criterionId: "immersive",
    kind: "unavailable",
  },
] as const;

export type AnalysisTabId = "dna" | "growth" | "topology" | "density" | "direction";

export const ANALYSIS_TABS: { id: AnalysisTabId; label: string }[] = [
  { id: "dna", label: "Architectural DNA" },
  { id: "growth", label: "Growth Evolution" },
  { id: "topology", label: "Network Topology" },
  { id: "density", label: "Spatial Density" },
  { id: "direction", label: "Directionality" },
];

export type MetricDisplay = "Not available" | "Not yet computed";

export type ScalarMetric = {
  id: string;
  label: string;
  value: number | null;
  display: MetricDisplay | "value";
  reason: string;
  kind: "observed" | "derived" | "normalized" | "unavailable";
};

export type DnaAxis = {
  id: string;
  label: string;
  criterionId: string;
  target: number | null;
  targetDisplay: MetricDisplay | "value";
  targetReason: string;
  generated: number | null;
  generatedDisplay: MetricDisplay | "value";
  generatedReason: string;
  difference: number | null;
};

export type TopologyResult = {
  size: number;
  thresholdRatio: number;
  thresholdValue: number;
  mask: number[];
  skeleton: number[];
  occupiedCells: number;
  branchCount: number | null;
  endpointCount: number | null;
  componentCount: number | null;
  skeletonComponents: number | null;
  cycleRank: number | null;
  connectivity: number | null;
  averagePathLength: number | null;
  diameter: number | null;
  largestComponent: number | null;
  skeletonNodes: number;
  endpoints: number[];
  branches: number[];
  hierarchy: number[];
  reasons: Record<string, string>;
};

export type DirectionReport = {
  bins: number;
  accumulatedBins: number[];
  instantaneousBins: number[];
  accumulatedSegments: number;
  accumulatedCoherence: number | null;
  instantaneousCoherence: number | null;
  accumulatedBias: number | null;
  instantaneousBias: number | null;
  meanSegmentLength: number | null;
  latestStepLength: number | null;
  sumX: number[];
  sumY: number[];
  sumCount: number[];
  instantaneousX: number[];
  instantaneousY: number[];
  instantaneousCount: number[];
  reasons: Record<string, string>;
};

export type GrowthSample = {
  iteration: number;
  occupiedFraction: number | null;
  occupiedCells: number;
  branchCount: number | null;
  meanTrail: number;
  totalTrail: number;
  totalDelta: number | null;
  stabilization: number | null;
  regime: string;
  regimeRule: string;
  meanGrid: number[];
};

export type DensityGrids = {
  size: number;
  trailDensity: number[];
  occupancy: number[] | null;
  intensity: number[];
  occupancyAligned: boolean | null;
  trailSum: number;
};

export type AnalysisFrame = {
  simulationId: string;
  seed: number;
  archetypeId: string;
  iteration: number;
  converged: boolean;
  agentCount: number;
  trailSum: number;
  density: DensityGrids;
  topology: TopologyResult;
  dna: DnaAxis[];
  direction: DirectionReport;
  growth: GrowthSample;
  flow: number[] | null;
  flowReason: string;
  attractors: Point[];
};

export type AnalysisSession = {
  simulationId: string;
  seed: number;
  archetypeId: string;
  archetypeName: string;
  typologyId: TypologyId;
  samples: GrowthSample[];
  latest: AnalysisFrame | null;
  direction: {
    bins: number[];
    sumX: Float64Array;
    sumY: Float64Array;
    sumCount: Float64Array;
    sumCos: number;
    sumSin: number;
    segments: number;
    lengthSum: number;
  };
};

export type AnalysisSessionMeta = {
  simulationId: string;
  seed: number;
  archetypeId: string;
  archetypeName: string;
  typologyId: TypologyId;
};

export type AnalysisInput = {
  ratings: RatingsMap;
  typologyId: TypologyId;
  isolationRadius: number;
  attractors: Point[];
};

export const ANALYSIS_DEFINITIONS = {
  centrality:
    "Share of aggregated trail mass in cells within the recipe isolation radius of the nearest attractor (state.attractor plus the recipe attractor coordinates). 0–1. Empty trail is not scored.",
  connectivity:
    "Size of the largest 4-connected component of occupied cells, divided by the occupied-cell count. 0–1. Occupied cells use the documented trail threshold.",
  openness:
    "Unoccupied cells divided by the 20×20 field, after the same occupancy threshold. Empty trail is not scored, because there is no deposited network to compare.",
  directionality:
    "Circular resultant length of agent headings at this iteration: hypot(mean cos, mean sin). 0 is uniform, 1 is fully aligned. This is instantaneous heading coherence, not the catalog's architectural axis.",
  visibility:
    "Mean axis-aligned open run, including the starting cell, from every unoccupied cell, divided by the field size. Open means below the occupancy threshold. This is a sightline proxy on the trail grid, not light or material. An empty field is not scored.",
  immersion:
    "Not available. Catalog Immersive depends on light, material, sound, scale, and enclosure. Skill 1 does not store those fields, so no generated immersion value is computed.",
  occupiedArea:
    "Occupied cells divided by field cells. A cell is occupied when its mean trail is at least 12% of the peak mean on the current 20×20 aggregation.",
  branchCount:
    "Skeleton pixels with 3 or more graph neighbors after Zhang-Suen thinning. Orthogonal neighbors always connect. A diagonal neighbor connects only when neither adjacent orthogonal cell is also skeleton, so a crossing does not gain false chords.",
  endpointCount:
    "Skeleton pixels with exactly one neighbor in that same graph.",
  meanTrail:
    "Mean of the 20×20 block-averaged trail grid, including empty cells. The block average matches the simulator occupancy downsample.",
  totalTrail: "Sum of the 20×20 block-averaged trail grid.",
  stabilization:
    "1 − min(1, last-step mean absolute trail change per agent / (convergence epsilon × 8)). The change is state.totalDelta. Iteration 0 is not scored.",
  regime:
    "Labeled only from the change since the previous analysis sample. Exploration: occupied fraction rose by at least 0.015 while stabilization is below 0.55. Reinforcement: occupied fraction rose by less than 0.015 while mean trail is still rising. Convergence: the simulator has converged, or stabilization is at least 0.75 and occupied fraction rose by less than 0.015. Otherwise Unlabeled.",
  cycleRank:
    "Skeleton-graph cycle rank E − N + C. Edges follow the branch-count connection rule.",
  averagePathLength:
    "Mean shortest-path length, in skeleton edges, over pairs in the largest skeleton component. Components with fewer than 2 nodes are not scored.",
  diameter:
    "Longest shortest-path in the largest skeleton component, in skeleton edges.",
  components:
    "4-connected components of the occupancy mask.",
  trailDensity:
    "Mean of the high-resolution trail cells inside each 20×20 block. Same reduction the simulator writes into state.occupancy when a step finalizes.",
  occupancyView:
    "state.occupancy as stored by the simulator. It is not recomputed. A restored field can omit it.",
  intensity:
    "Maximum high-resolution trail value inside each 20×20 block.",
  accumulatedDirection:
    "Sum of consecutive recorded agent path segments since the previous sample, binned into the 20×20 cell that contains the segment start. Segments already shifted out of the path buffer are not reconstructed.",
  instantaneousDirection:
    "Agent headings at this iteration only, averaged inside each 20×20 cell. Unit headings are not displacements.",
  coherence:
    "Resultant length of the selected direction sample. Accumulated coherence uses recorded segment directions. Instantaneous coherence uses headings.",
  bias:
    "(dominant bin count − opposite bin count) / total bin count, on the selected histogram. Range is −1 to 1.",
  flow:
    "state.flow from the last simulation step: how many agents occupied each 20×20 cell during that step. It is not a historical average. The simulator clears this field at the start of every step.",
} as const;

const clampIndex = (value: number, size: number) => Math.max(0, Math.min(size - 1, Math.round(value)));

export function fieldToDisplayRow(y: number, size: number) {
  return size - 1 - y;
}

export function criterionIdsForTypology(typologyId: TypologyId) {
  const ids = new Set<string>();
  for (const branch of BRANCHES) {
    for (const item of branch.shared) ids.add(item.id);
    ids.add(branch.specific[typologyId].id);
  }
  return ids;
}

export function ratingTarget(ratings: RatingsMap, typologyId: TypologyId, criterionId: string): ScalarMetric {
  const present = criterionIdsForTypology(typologyId).has(criterionId);
  if (!present) {
    return {
      id: criterionId,
      label: criterionId,
      value: null,
      display: "Not available",
      reason: `${criterionId} is not a catalog criterion for this typology.`,
      kind: "unavailable",
    };
  }
  const rating = ratings[criterionId];
  if (rating !== 0 && rating !== 1 && rating !== 2) {
    return {
      id: criterionId,
      label: criterionId,
      value: null,
      display: "Not available",
      reason: `${criterionId} has no locked Low / Medium / High rating on this archetype.`,
      kind: "unavailable",
    };
  }
  return {
    id: criterionId,
    label: criterionId,
    value: rating / 2,
    display: "value",
    reason: `Catalog rating ${rating} (Low 0, Medium 1, High 2) divided by 2. This is the architectural target, not a measurement.`,
    kind: "normalized",
  };
}

export function aggregateTrailGrids(trails: ArrayLike<number>, trailSize: number, size: number): DensityGrids {
  const trailDensity = new Array<number>(size * size).fill(0);
  const intensity = new Array<number>(size * size).fill(0);
  const scale = trailSize / size;
  let trailSum = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let count = 0;
      let max = 0;
      const x0 = Math.floor(x * scale);
      const y0 = Math.floor(y * scale);
      const x1 = Math.min(trailSize, Math.floor((x + 1) * scale));
      const y1 = Math.min(trailSize, Math.floor((y + 1) * scale));
      for (let ty = y0; ty < y1; ty += 1) {
        const row = ty * trailSize;
        for (let tx = x0; tx < x1; tx += 1) {
          const value = trails[row + tx] ?? 0;
          sum += value;
          trailSum += value;
          if (value > max) max = value;
          count += 1;
        }
      }
      const index = y * size + x;
      trailDensity[index] = count ? sum / count : 0;
      intensity[index] = max;
    }
  }
  return {
    size,
    trailDensity,
    occupancy: null,
    intensity,
    occupancyAligned: null,
    trailSum,
  };
}

export function gridsFromState(state: SimulationState): DensityGrids {
  const grids = aggregateTrailGrids(state.trails, state.trailSize, state.size);
  if (state.occupancy.length === state.size * state.size) {
    grids.occupancy = state.occupancy.slice();
    let aligned = true;
    for (let i = 0; i < grids.trailDensity.length; i += 1) {
      if (Math.abs(grids.trailDensity[i] - state.occupancy[i]) > 1e-9) {
        aligned = false;
        break;
      }
    }
    grids.occupancyAligned = aligned;
  }
  return grids;
}

function peakOf(values: ArrayLike<number>) {
  let peak = 0;
  for (let i = 0; i < values.length; i += 1) if (values[i] > peak) peak = values[i];
  return peak;
}

export function occupiedMask(values: ArrayLike<number>, ratio = OCCUPANCY_THRESHOLD_RATIO) {
  const peak = peakOf(values);
  const mask = new Uint8Array(values.length);
  const threshold = peak * ratio;
  if (peak > 0) {
    for (let i = 0; i < values.length; i += 1) if (values[i] >= threshold) mask[i] = 1;
  }
  return { mask, peak, threshold };
}

function zhangSuen(source: Uint8Array, size: number) {
  const image = new Uint8Array(source);
  const index = (x: number, y: number) => y * size + x;
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      const remove: number[] = [];
      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          const i = index(x, y);
          if (!image[i]) continue;
          const p2 = image[index(x, y - 1)];
          const p3 = image[index(x + 1, y - 1)];
          const p4 = image[index(x + 1, y)];
          const p5 = image[index(x + 1, y + 1)];
          const p6 = image[index(x, y + 1)];
          const p7 = image[index(x - 1, y + 1)];
          const p8 = image[index(x - 1, y)];
          const p9 = image[index(x - 1, y - 1)];
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9];
          let neighbors = 0;
          let transitions = 0;
          for (let k = 0; k < 8; k += 1) {
            neighbors += ring[k];
            if (ring[k] === 0 && ring[(k + 1) % 8] === 1) transitions += 1;
          }
          if (neighbors < 2 || neighbors > 6 || transitions !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) {
            continue;
          }
          remove.push(i);
        }
      }
      if (remove.length) changed = true;
      for (const cell of remove) image[cell] = 0;
    }
  }
  return image;
}

function componentFromAdj(nodes: number[], adj: number[][], length: number) {
  const seen = new Uint8Array(length);
  const labels = new Int32Array(length);
  labels.fill(-1);
  let count = 0;
  let largest = 0;
  const stack: number[] = [];
  for (const start of nodes) {
    if (seen[start]) continue;
    let sizeOf = 0;
    stack.push(start);
    seen[start] = 1;
    labels[start] = count;
    while (stack.length) {
      const cell = stack.pop() as number;
      sizeOf += 1;
      for (const neighbor of adj[cell]) {
        if (seen[neighbor]) continue;
        seen[neighbor] = 1;
        labels[neighbor] = count;
        stack.push(neighbor);
      }
    }
    if (sizeOf > largest) largest = sizeOf;
    count += 1;
  }
  return { count, largest, labels };
}

function maskComponents(mask: Uint8Array, size: number) {
  const labels = new Int32Array(mask.length);
  labels.fill(-1);
  let count = 0;
  let largest = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;
    let sizeOf = 0;
    stack.push(start);
    labels[start] = count;
    while (stack.length) {
      const cell = stack.pop() as number;
      sizeOf += 1;
      const x = cell % size;
      const y = (cell - x) / size;
      const next = [
        x > 0 ? cell - 1 : -1,
        x + 1 < size ? cell + 1 : -1,
        y > 0 ? cell - size : -1,
        y + 1 < size ? cell + size : -1,
      ];
      for (const neighbor of next) {
        if (neighbor < 0 || !mask[neighbor] || labels[neighbor] !== -1) continue;
        labels[neighbor] = count;
        stack.push(neighbor);
      }
    }
    if (sizeOf > largest) largest = sizeOf;
    count += 1;
  }
  return { count, largest, labels };
}

export function extractTopology(values: ArrayLike<number>, size: number, ratio = OCCUPANCY_THRESHOLD_RATIO): TopologyResult {
  const { mask, peak, threshold } = occupiedMask(values, ratio);
  const skeleton = zhangSuen(mask, size);
  const reasons: Record<string, string> = {};
  let occupiedCells = 0;
  for (let i = 0; i < mask.length; i += 1) occupiedCells += mask[i];
  const empty = occupiedCells === 0;
  if (empty || peak <= 0) {
    reasons.network = "Not yet computed. No cell is above the occupancy threshold.";
  }
  const components = empty ? { count: 0, largest: 0, labels: new Int32Array(mask.length) } : maskComponents(mask, size);
  const adj: number[][] = Array.from({ length: mask.length }, () => []);
  const nodes: number[] = [];
  const occupied = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && skeleton[y * size + x] === 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = y * size + x;
      if (!skeleton[cell]) continue;
      nodes.push(cell);
      for (const [ox, oy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (!occupied(x + ox, y + oy)) continue;
        const neighbor = (y + oy) * size + (x + ox);
        adj[cell].push(neighbor);
        adj[neighbor].push(cell);
      }
      for (const [ox, oy] of [
        [1, 1],
        [1, -1],
      ] as const) {
        if (!occupied(x + ox, y + oy)) continue;
        if (occupied(x + ox, y) || occupied(x, y + oy)) continue;
        const neighbor = (y + oy) * size + (x + ox);
        adj[cell].push(neighbor);
        adj[neighbor].push(cell);
      }
    }
  }
  const endpoints: number[] = [];
  const branches: number[] = [];
  let edgeCount = 0;
  for (const cell of nodes) {
    const degree = adj[cell].length;
    edgeCount += degree;
    if (degree === 1) endpoints.push(cell);
    else if (degree >= 3) branches.push(cell);
  }
  edgeCount /= 2;
  const skeletonParts = nodes.length ? componentFromAdj(nodes, adj, mask.length) : { count: 0, largest: 0, labels: new Int32Array(mask.length) };
  let cycleRank: number | null = empty ? null : edgeCount - nodes.length + skeletonParts.count;
  if (empty) {
    reasons.branchCount = "Not yet computed. The occupancy mask is empty.";
    reasons.endpointCount = reasons.branchCount;
    reasons.componentCount = reasons.branchCount;
    reasons.cycleRank = reasons.branchCount;
    reasons.connectivity = reasons.branchCount;
    reasons.averagePathLength = reasons.branchCount;
    reasons.diameter = reasons.branchCount;
  }
  const hierarchy = new Array<number>(mask.length).fill(-1);
  if (!empty && endpoints.length) {
    const queue = endpoints.slice();
    for (const cell of endpoints) hierarchy[cell] = 0;
    let head = 0;
    while (head < queue.length) {
      const cell = queue[head];
      head += 1;
      const nextDistance = hierarchy[cell] + 1;
      for (const neighbor of adj[cell]) {
        if (!skeleton[neighbor] || hierarchy[neighbor] !== -1) continue;
        hierarchy[neighbor] = nextDistance;
        queue.push(neighbor);
      }
    }
  } else if (!empty) {
    reasons.hierarchy = "Not available. This skeleton has no endpoint, so branch order from endpoints is not defined.";
  }

  let averagePathLength: number | null = null;
  let diameter: number | null = null;
  if (!empty && skeletonParts.largest >= 2) {
    let largestLabel = 0;
    let largestCount = 0;
    const tally = new Map<number, number>();
    for (const cell of nodes) {
      const label = skeletonParts.labels[cell];
      const next = (tally.get(label) ?? 0) + 1;
      tally.set(label, next);
      if (next > largestCount) {
        largestCount = next;
        largestLabel = label;
      }
    }
    const members = nodes.filter((cell) => skeletonParts.labels[cell] === largestLabel);
    let pairSum = 0;
    let pairs = 0;
    let farthest = 0;
    const queue: number[] = [];
    const dist = new Int32Array(mask.length);
    for (const origin of members) {
      dist.fill(-1);
      dist[origin] = 0;
      queue.length = 0;
      queue.push(origin);
      let head = 0;
      while (head < queue.length) {
        const cell = queue[head];
        head += 1;
        const base = dist[cell];
        for (const neighbor of adj[cell]) {
          if (dist[neighbor] !== -1) continue;
          dist[neighbor] = base + 1;
          queue.push(neighbor);
        }
      }
      for (const other of members) {
        if (other <= origin) continue;
        const length = dist[other];
        if (length < 0) continue;
        pairSum += length;
        pairs += 1;
        if (length > farthest) farthest = length;
      }
    }
    if (pairs > 0) {
      averagePathLength = pairSum / pairs;
      diameter = farthest;
    }
  } else if (!empty) {
    reasons.averagePathLength = "Not available. The largest skeleton component has fewer than 2 nodes.";
    reasons.diameter = reasons.averagePathLength;
  }

  return {
    size,
    thresholdRatio: ratio,
    thresholdValue: threshold,
    mask: Array.from(mask),
    skeleton: Array.from(skeleton),
    occupiedCells,
    branchCount: empty ? null : branches.length,
    endpointCount: empty ? null : endpoints.length,
    componentCount: empty ? null : components.count,
    skeletonComponents: empty ? null : skeletonParts.count,
    cycleRank,
    connectivity: empty ? null : components.largest / occupiedCells,
    averagePathLength,
    diameter,
    largestComponent: empty ? null : components.largest,
    skeletonNodes: nodes.length,
    endpoints,
    branches,
    hierarchy,
    reasons,
  };
}

function centralityValue(values: ArrayLike<number>, size: number, attractors: Point[], radius: number) {
  let total = 0;
  let central = 0;
  const points = attractors.length ? attractors : [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = values[y * size + x];
      if (value <= 0) continue;
      total += value;
      let near = false;
      for (const point of points) {
        if (Math.hypot(x - point.x, y - point.y) <= radius) {
          near = true;
          break;
        }
      }
      if (near) central += value;
    }
  }
  if (total <= 0) return null;
  return central / total;
}

function opennessValue(mask: Uint8Array) {
  let occupied = 0;
  for (let i = 0; i < mask.length; i += 1) occupied += mask[i];
  if (occupied === 0) return null;
  return (mask.length - occupied) / mask.length;
}

function visibilityValue(mask: Uint8Array, size: number) {
  let occupied = 0;
  for (let i = 0; i < mask.length; i += 1) occupied += mask[i];
  if (occupied === 0) return null;
  let open = 0;
  let sum = 0;
  const run = (x: number, y: number, ox: number, oy: number) => {
    let length = 0;
    let cx = x;
    let cy = y;
    while (cx >= 0 && cy >= 0 && cx < size && cy < size && mask[cy * size + cx] === 0) {
      length += 1;
      cx += ox;
      cy += oy;
    }
    return length;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (mask[y * size + x]) continue;
      open += 1;
      sum += (run(x, y, 1, 0) + run(x, y, -1, 0) + run(x, y, 0, 1) + run(x, y, 0, -1)) / 4;
    }
  }
  if (open === 0) return 0;
  return sum / open / size;
}

function headingCoherence(agents: SimulationState["agents"]) {
  if (!agents.length) return null;
  let sx = 0;
  let sy = 0;
  for (const agent of agents) {
    sx += Math.cos(agent.heading);
    sy += Math.sin(agent.heading);
  }
  return Math.hypot(sx, sy) / agents.length;
}

export function buildDna(
  state: SimulationState,
  grids: DensityGrids,
  topology: TopologyResult,
  input: AnalysisInput,
): DnaAxis[] {
  const { mask } = occupiedMask(grids.trailDensity);
  const attractors = dedupePoints([{ x: state.attractor.x, y: state.attractor.y }, ...input.attractors]);
  const generated = {
    centrality: centralityValue(grids.trailDensity, state.size, attractors, input.isolationRadius),
    connectivity: topology.connectivity,
    openness: opennessValue(mask),
    directionality: headingCoherence(state.agents),
    visibility: visibilityValue(mask, state.size),
    immersion: null as number | null,
  };
  const generatedReason: Record<string, string> = {
    centrality:
      generated.centrality == null
        ? "Not yet computed. Aggregated trail mass is zero."
        : ANALYSIS_DEFINITIONS.centrality,
    connectivity:
      generated.connectivity == null
        ? "Not yet computed. No occupied cells."
        : ANALYSIS_DEFINITIONS.connectivity,
    openness: generated.openness == null ? "Not yet computed. No trail has been deposited." : ANALYSIS_DEFINITIONS.openness,
    directionality:
      generated.directionality == null
        ? "Not available. This simulation state has no agent headings."
        : ANALYSIS_DEFINITIONS.directionality,
    visibility:
      generated.visibility == null
        ? "Not yet computed. Sightlines are not scored on an empty trail field."
        : ANALYSIS_DEFINITIONS.visibility,
    immersion: ANALYSIS_DEFINITIONS.immersion,
  };
  return DNA_AXES.map((axis) => {
    const target = ratingTarget(input.ratings, input.typologyId, axis.criterionId);
    const value = generated[axis.id];
    const unavailable = axis.id === "immersion" || (axis.id === "directionality" && value == null);
    return {
      id: axis.id,
      label: axis.label,
      criterionId: axis.criterionId,
      target: target.value,
      targetDisplay: target.display,
      targetReason: target.reason,
      generated: value,
      generatedDisplay: value == null ? (unavailable ? "Not available" : "Not yet computed") : "value",
      generatedReason: generatedReason[axis.id],
      difference: target.value == null || value == null ? null : value - target.value,
    };
  });
}

function dedupePoints(points: Point[]) {
  const kept: Point[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (kept.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 0.2)) continue;
    kept.push({ x: point.x, y: point.y });
  }
  return kept;
}

function emptyDirection(size: number): AnalysisSession["direction"] {
  return {
    bins: new Array<number>(DIRECTION_BINS).fill(0),
    sumX: new Float64Array(size * size),
    sumY: new Float64Array(size * size),
    sumCount: new Float64Array(size * size),
    sumCos: 0,
    sumSin: 0,
    segments: 0,
    lengthSum: 0,
  };
}

function binOf(angle: number) {
  let turns = (angle + Math.PI) / (Math.PI * 2);
  if (turns >= 1) turns -= 1;
  return Math.min(DIRECTION_BINS - 1, Math.max(0, Math.floor(turns * DIRECTION_BINS)));
}

function biasOf(bins: ArrayLike<number>) {
  let total = 0;
  let dominant = 0;
  let dominantIndex = 0;
  for (let i = 0; i < bins.length; i += 1) {
    total += bins[i];
    if (bins[i] > dominant) {
      dominant = bins[i];
      dominantIndex = i;
    }
  }
  if (total <= 0) return null;
  const opposite = bins[(dominantIndex + bins.length / 2) % bins.length] ?? 0;
  return (dominant - opposite) / total;
}

function directionFromState(
  state: SimulationState,
  previous: AnalysisSession["direction"],
  steps: number,
): { stored: AnalysisSession["direction"]; report: DirectionReport } {
  const size = state.size;
  const bins = previous.bins.slice();
  const sumX = new Float64Array(previous.sumX);
  const sumY = new Float64Array(previous.sumY);
  const sumCount = new Float64Array(previous.sumCount);
  let sumCos = previous.sumCos;
  let sumSin = previous.sumSin;
  let segments = previous.segments;
  let lengthSum = previous.lengthSum;
  const take = Math.max(0, steps);
  let latestLength = 0;
  let latestCount = 0;
  for (const agent of state.agents) {
    const xs = agent.pathX;
    const ys = agent.pathY;
    if (!xs || !ys || xs.length < 2 || take === 0) continue;
    const usable = Math.min(take, xs.length - 1);
    const start = xs.length - 1 - usable;
    for (let i = start; i < xs.length - 1; i += 1) {
      const dx = xs[i + 1] - xs[i];
      const dy = ys[i + 1] - ys[i];
      const mag = Math.hypot(dx, dy);
      if (mag <= 1e-8) continue;
      const cell = clampIndex(ys[i], size) * size + clampIndex(xs[i], size);
      sumX[cell] += dx;
      sumY[cell] += dy;
      sumCount[cell] += 1;
      sumCos += dx / mag;
      sumSin += dy / mag;
      segments += 1;
      lengthSum += mag;
      bins[binOf(Math.atan2(dy, dx))] += 1;
      if (i === xs.length - 2) {
        latestLength += mag;
        latestCount += 1;
      }
    }
  }
  const instantaneousBins = new Array<number>(DIRECTION_BINS).fill(0);
  const instantaneousX = new Array<number>(size * size).fill(0);
  const instantaneousY = new Array<number>(size * size).fill(0);
  const instantaneousCount = new Array<number>(size * size).fill(0);
  let headingX = 0;
  let headingY = 0;
  for (const agent of state.agents) {
    const dx = Math.cos(agent.heading);
    const dy = Math.sin(agent.heading);
    headingX += dx;
    headingY += dy;
    instantaneousBins[binOf(agent.heading)] += 1;
    const cell = clampIndex(agent.y, size) * size + clampIndex(agent.x, size);
    instantaneousX[cell] += dx;
    instantaneousY[cell] += dy;
    instantaneousCount[cell] += 1;
  }
  const reasons: Record<string, string> = {};
  if (!state.agents.length) {
    reasons.instantaneous = "Not available. This simulation state has no agents.";
  }
  if (segments === 0) {
    reasons.accumulated = "Not yet computed. No recorded path segment has been sampled.";
  }
  const report: DirectionReport = {
    bins: DIRECTION_BINS,
    accumulatedBins: bins,
    instantaneousBins,
    accumulatedSegments: segments,
    accumulatedCoherence: segments > 0 ? Math.hypot(sumCos, sumSin) / segments : null,
    instantaneousCoherence: state.agents.length ? Math.hypot(headingX, headingY) / state.agents.length : null,
    accumulatedBias: segments > 0 ? biasOf(bins) : null,
    instantaneousBias: state.agents.length ? biasOf(instantaneousBins) : null,
    meanSegmentLength: segments > 0 ? lengthSum / segments : null,
    latestStepLength: latestCount > 0 ? latestLength / latestCount : null,
    sumX: Array.from(sumX),
    sumY: Array.from(sumY),
    sumCount: Array.from(sumCount),
    instantaneousX,
    instantaneousY,
    instantaneousCount,
    reasons,
  };
  return {
    stored: { bins, sumX, sumY, sumCount, sumCos, sumSin, segments, lengthSum },
    report,
  };
}

function stabilizationOf(state: SimulationState) {
  if (state.iteration <= 0) return null;
  return 1 - Math.min(1, state.totalDelta / STABILIZATION_REFERENCE);
}

function regimeFor(samples: GrowthSample[], converged: boolean): { regime: string; regimeRule: string } {
  const current = samples[samples.length - 1];
  const previous = samples.length > 1 ? samples[samples.length - 2] : null;
  if (!current || !previous || current.occupiedFraction == null || previous.occupiedFraction == null) {
    return {
      regime: "Unlabeled",
      regimeRule: "Not yet computed. A regime needs two samples with deposited trail.",
    };
  }
  const gained = current.occupiedFraction - previous.occupiedFraction;
  const densityRising = current.meanTrail > previous.meanTrail;
  const stable = current.stabilization != null && current.stabilization >= 0.75;
  if (converged || (stable && gained < 0.015)) {
    return {
      regime: "Convergence",
      regimeRule: converged
        ? "The simulator reports converged."
        : "Stabilization is at least 0.75 and occupied fraction rose by less than 0.015 since the previous sample.",
    };
  }
  if (gained >= 0.015 && (current.stabilization == null || current.stabilization < 0.55)) {
    return {
      regime: "Exploration",
      regimeRule: "Occupied fraction rose by at least 0.015 since the previous sample, and stabilization is below 0.55.",
    };
  }
  if (gained < 0.015 && densityRising) {
    return {
      regime: "Reinforcement",
      regimeRule: "Occupied fraction rose by less than 0.015 while mean trail density is still rising.",
    };
  }
  return {
    regime: "Unlabeled",
    regimeRule: "The measured change does not match the exploration, reinforcement, or convergence rule.",
  };
}

export function createAnalysisSession(meta: AnalysisSessionMeta): AnalysisSession {
  return {
    ...meta,
    samples: [],
    latest: null,
    direction: emptyDirection(FIELD_SIZE),
  };
}

export function recordAnalysisSample(
  session: AnalysisSession,
  state: SimulationState,
  input: AnalysisInput,
  options?: { interval?: number; force?: boolean },
): AnalysisSession {
  const interval = Math.max(1, options?.interval ?? DEFAULT_SAMPLE_INTERVAL);
  if (session.latest && session.latest.iteration === state.iteration && session.latest.simulationId === session.simulationId) {
    return session;
  }
  const previousIteration = session.samples.length ? session.samples[session.samples.length - 1].iteration : -interval;
  if (!options?.force && state.iteration !== 0 && state.iteration - previousIteration < interval) return session;

  const grids = gridsFromState(state);
  const topology = extractTopology(grids.trailDensity, state.size);
  const steps = session.samples.length ? Math.max(0, state.iteration - previousIteration) : Math.max(0, state.iteration);
  const direction = directionFromState(state, session.direction, steps);
  const occupiedFraction =
    topology.occupiedCells > 0
      ? topology.occupiedCells / (state.size * state.size)
      : state.iteration === 0
        ? null
        : 0;
  const draft: GrowthSample = {
    iteration: state.iteration,
    occupiedFraction,
    occupiedCells: topology.occupiedCells,
    branchCount: topology.branchCount,
    meanTrail: average(grids.trailDensity),
    totalTrail: sum(grids.trailDensity),
    totalDelta: state.iteration > 0 ? state.totalDelta : null,
    stabilization: stabilizationOf(state),
    regime: "Unlabeled",
    regimeRule: "",
    meanGrid: grids.trailDensity.slice(),
  };
  const samples = session.samples.concat(draft);
  if (samples.length > MAX_ANALYSIS_SAMPLES) samples.splice(0, samples.length - MAX_ANALYSIS_SAMPLES);
  const regime = regimeFor(samples, state.converged);
  draft.regime = regime.regime;
  draft.regimeRule = regime.regimeRule;
  const flow = state.flow.length === state.size * state.size ? state.flow.slice() : null;
  const frame: AnalysisFrame = {
    simulationId: session.simulationId,
    seed: session.seed,
    archetypeId: session.archetypeId,
    iteration: state.iteration,
    converged: state.converged,
    agentCount: state.agents.length,
    trailSum: grids.trailSum,
    density: grids,
    topology,
    dna: buildDna(state, grids, topology, input),
    direction: direction.report,
    growth: draft,
    flow,
    flowReason: flow ? ANALYSIS_DEFINITIONS.flow : "Not available. This state has no flow field.",
    attractors: dedupePoints([{ x: state.attractor.x, y: state.attractor.y }, ...input.attractors]),
  };
  return {
    ...session,
    samples,
    latest: frame,
    direction: direction.stored,
  };
}

function average(values: ArrayLike<number>) {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values: ArrayLike<number>) {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) total += values[i];
  return total;
}

export function frameForTab(session: AnalysisSession | null, _tab: AnalysisTabId) {
  return session?.latest ?? null;
}

export function gridStats(values: ArrayLike<number>, ratio = OCCUPANCY_THRESHOLD_RATIO) {
  let total = 0;
  let max = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
    if (values[i] > max) max = values[i];
  }
  const mean = values.length ? total / values.length : 0;
  const threshold = max * ratio;
  let occupied = 0;
  if (max > 0) {
    for (let i = 0; i < values.length; i += 1) if (values[i] >= threshold) occupied += 1;
  }
  return {
    mean,
    max,
    threshold,
    occupiedFraction: values.length ? occupied / values.length : 0,
    total,
  };
}

export function concentrationHistogram(values: ArrayLike<number>, bins = HISTOGRAM_BINS) {
  const counts = new Array<number>(bins).fill(0);
  const max = peakOf(values);
  if (max <= 0) {
    counts[0] = values.length;
    return { max, counts };
  }
  for (let i = 0; i < values.length; i += 1) {
    const index = Math.min(bins - 1, Math.floor((values[i] / max) * bins));
    counts[index] += 1;
  }
  return { max, counts };
}

export function evenSamples<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  const picked: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    if (seen.has(index)) continue;
    seen.add(index);
    picked.push(items[index]);
  }
  return picked;
}

export function exportAnalysisPayload(session: AnalysisSession | null) {
  if (!session?.latest) return null;
  const latest = session.latest;
  return {
    simulationId: session.simulationId,
    seed: session.seed,
    archetypeId: session.archetypeId,
    archetypeName: session.archetypeName,
    iteration: latest.iteration,
    converged: latest.converged,
    agentCount: latest.agentCount,
    trailSum: latest.trailSum,
    thresholdRatio: OCCUPANCY_THRESHOLD_RATIO,
    definitions: ANALYSIS_DEFINITIONS,
    dna: latest.dna,
    topology: {
      occupiedCells: latest.topology.occupiedCells,
      branchCount: latest.topology.branchCount,
      endpointCount: latest.topology.endpointCount,
      componentCount: latest.topology.componentCount,
      skeletonComponents: latest.topology.skeletonComponents,
      cycleRank: latest.topology.cycleRank,
      connectivity: latest.topology.connectivity,
      averagePathLength: latest.topology.averagePathLength,
      diameter: latest.topology.diameter,
      thresholdValue: latest.topology.thresholdValue,
      mask: latest.topology.mask,
      skeleton: latest.topology.skeleton,
      reasons: latest.topology.reasons,
    },
    density: {
      trailDensity: latest.density.trailDensity,
      occupancy: latest.density.occupancy,
      intensity: latest.density.intensity,
      occupancyAligned: latest.density.occupancyAligned,
    },
    direction: {
      accumulatedBins: latest.direction.accumulatedBins,
      instantaneousBins: latest.direction.instantaneousBins,
      accumulatedSegments: latest.direction.accumulatedSegments,
      accumulatedCoherence: latest.direction.accumulatedCoherence,
      instantaneousCoherence: latest.direction.instantaneousCoherence,
      accumulatedBias: latest.direction.accumulatedBias,
      instantaneousBias: latest.direction.instantaneousBias,
      meanSegmentLength: latest.direction.meanSegmentLength,
      latestStepLength: latest.direction.latestStepLength,
      reasons: latest.direction.reasons,
    },
    flow: latest.flow,
    growth: session.samples.map((sample) => ({
      iteration: sample.iteration,
      occupiedFraction: sample.occupiedFraction,
      occupiedCells: sample.occupiedCells,
      branchCount: sample.branchCount,
      meanTrail: sample.meanTrail,
      totalTrail: sample.totalTrail,
      totalDelta: sample.totalDelta,
      stabilization: sample.stabilization,
      regime: sample.regime,
      regimeRule: sample.regimeRule,
      meanGrid: sample.meanGrid,
    })),
  };
}

export function trailChecksum(trails: ArrayLike<number>) {
  let total = 0;
  for (let i = 0; i < trails.length; i += 1) total += trails[i];
  return total;
}

export function dominantBinLabel(bins: ArrayLike<number>) {
  let total = 0;
  let best = 0;
  let index = 0;
  for (let i = 0; i < bins.length; i += 1) {
    total += bins[i];
    if (bins[i] > best) {
      best = bins[i];
      index = i;
    }
  }
  if (total <= 0) return null;
  const labels = ["W", "WSW", "SW", "SSW", "S", "SSE", "SE", "ESE", "E", "ENE", "NE", "NNE", "N", "NNW", "NW", "WNW"];
  const label = bins.length === labels.length ? labels[index] : `bin ${index}`;
  return { index, label, count: best, share: best / total };
}
