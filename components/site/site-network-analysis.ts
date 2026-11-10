import { FLOW_SPACING_FEET, FLOW_SURVIVE } from "./site-network-flow";
import { reachFeet, type NetworkFrame, type NetworkIteration, type NetworkNode } from "./site-network";

export type NetworkAnalysisMode = "density" | "connectivity" | "branching" | "direction" | "overlay";

export type NetworkDiagramNode = {
  x: number;
  z: number;
  kind: "source" | "attractor";
};

export type NetworkFigures = {
  density: Uint8ClampedArray;
  profile: number[];
  rose: number[];
  peaks: number;
  nodes: NetworkDiagramNode[];
  /** Downsampled connected trail cells. This is the trail geometry, not a line between nodes. */
  connectivity: Uint8ClampedArray;
  components: number;
  hierarchy: Uint8ClampedArray;
  size: number;
  /** Conductivity figures describe surviving tubes. Trail figures describe agent deposits. */
  measure: "conductivity" | "trail";
};

export type NetworkMetric = {
  label: string;
  value: string;
};

export type NetworkAnalysis = {
  rgba: Uint8Array;
  metrics: NetworkMetric[];
  legend: string;
};

/**
 * A raw trail cell joins a connected region at or above this value.
 * Neighbors share an edge. A site deposit is 0.06, so 0.02 is a remaining mark, not a display byte.
 * Float32 storage can round 0.02 slightly down; that mark still counts.
 */
export const NETWORK_TRAIL = 0.02;
const TRAIL = NETWORK_TRAIL;
const TRAIL_SLOP = 1e-5;

function fieldCut(iteration: { generator?: "flow" | "agents" }) {
  return iteration.generator === "flow" ? FLOW_SURVIVE : TRAIL;
}

function activeAt(value: number, cut: number) {
  return value >= cut - TRAIL_SLOP;
}

const GRADIENT = 0.02;
const MIN_COMPONENT = 40;

const WHITE: readonly [number, number, number] = [255, 255, 255];
const CYAN: readonly [number, number, number] = [73, 215, 222];
const TEAL: readonly [number, number, number] = [15, 115, 119];
const COPPER: readonly [number, number, number] = [199, 126, 95];
const MUTED: readonly [number, number, number] = [168, 164, 156];

const COMPONENT_COLORS: readonly (readonly [number, number, number])[] = [WHITE, CYAN, TEAL, COPPER, MUTED];

function paint(out: Uint8Array, index: number, color: readonly [number, number, number], alpha: number) {
  const write = index * 4;
  out[write] = color[0];
  out[write + 1] = color[1];
  out[write + 2] = color[2];
  out[write + 3] = alpha;
}

function stamp(out: Uint8Array, size: number, x: number, y: number, radius: number, color: readonly [number, number, number]) {
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(size - 1, x + radius);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(size - 1, y + radius);
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const distance = Math.hypot(px - x, py - y);
      if (distance > radius || distance < radius - 1.6) continue;
      paint(out, py * size + px, color, 230);
    }
  }
}

function nodePixel(node: NetworkNode, frame: NetworkFrame, size: number) {
  return {
    x: Math.round(((node.x - frame.minX) / frame.width) * (size - 1)),
    y: Math.round(((node.z - frame.minZ) / frame.depth) * (size - 1)),
  };
}

function trailNear(trails: Float32Array, size: number, frame: NetworkFrame, node: NetworkNode, limit: number, cut: number) {
  const px = ((node.x - frame.minX) / frame.width) * size;
  const py = ((node.z - frame.minZ) / frame.depth) * size;
  const rx = Math.max(1, Math.ceil(limit / (frame.width / size)));
  const ry = Math.max(1, Math.ceil(limit / (frame.depth / size)));
  const x0 = Math.max(0, Math.floor(px - rx));
  const x1 = Math.min(size - 1, Math.ceil(px + rx));
  const y0 = Math.max(0, Math.floor(py - ry));
  const y1 = Math.min(size - 1, Math.ceil(py + ry));
  const feetX = frame.width / size;
  const feetZ = frame.depth / size;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!activeAt(trails[y * size + x], cut)) continue;
      const east = frame.minX + (x + 0.5) * feetX;
      const north = frame.minZ + (y + 0.5) * feetZ;
      if (Math.hypot(east - node.x, north - node.z) <= limit) return true;
    }
  }
  return false;
}

function flood(trails: Float32Array, size: number, cut = TRAIL) {
  const labels = new Int32Array(size * size);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let index = 0; index < trails.length; index += 1) {
    if (!activeAt(trails[index], cut) || labels[index] !== 0) continue;
    const label = sizes.length + 1;
    let count = 0;
    labels[index] = label;
    stack.push(index);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      count += 1;
      const x = current % size;
      const y = (current / size) | 0;
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < size ? current + 1 : -1,
        y > 0 ? current - size : -1,
        y + 1 < size ? current + size : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || labels[next] !== 0 || !activeAt(trails[next], cut)) continue;
        labels[next] = label;
        stack.push(next);
      }
    }
    sizes.push(count);
  }
  return { labels, sizes };
}

/** Edge-connected regions of raw trail at or above NETWORK_TRAIL. */
export function countTrailComponents(trails: Float32Array, size: number, cut = TRAIL) {
  if (size < 1 || trails.length !== size * size) return 0;
  return flood(trails, size, cut).sizes.length;
}

/** 72nd percentile of occupied values. Agent fields use the deposit mark. Flow fields use surviving conductivity. */
export function reinforcedCut(trails: Float32Array, cut = TRAIL) {
  const occupied: number[] = [];
  for (const value of trails) {
    if (activeAt(value, cut)) occupied.push(value);
  }
  if (occupied.length === 0) return 0;
  occupied.sort((a, b) => a - b);
  return occupied[Math.min(occupied.length - 1, Math.floor(occupied.length * 0.72))];
}

function clockwise(size: number, index: number) {
  const x = index % size;
  const y = (index / size) | 0;
  const at = (ox: number, oy: number) => {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;
    return true;
  };
  return [
    [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
  ].map(([ox, oy]) => at(ox, oy) ? (y + oy) * size + (x + ox) : -1);
}

function keepSeparated(points: { x: number; y: number; value: number }[], gap: number) {
  const kept: { x: number; y: number }[] = [];
  const ordered = points.slice().sort((a, b) => b.value - a.value);
  for (const point of ordered) {
    if (kept.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < gap)) continue;
    kept.push(point);
  }
  return kept;
}

function directionGroups(trails: Float32Array, size: number, index: number, cut: number, radius: number) {
  const x = index % size;
  const y = (index / size) | 0;
  const hits: boolean[] = [];
  for (let step = 0; step < 8; step += 1) {
    const angle = (step / 8) * Math.PI * 2;
    const nx = Math.round(x + Math.cos(angle) * radius);
    const ny = Math.round(y + Math.sin(angle) * radius);
    hits.push(nx >= 0 && ny >= 0 && nx < size && ny < size && activeAt(trails[ny * size + nx], cut));
  }
  let changes = 0;
  for (let step = 0; step < 8; step += 1) {
    if (hits[step] !== hits[(step + 1) % 8]) changes += 1;
  }
  return changes / 2;
}

function neighborGroups(trails: Float32Array, size: number, index: number, cut: number) {
  const around = clockwise(size, index).map((cell) => cell >= 0 && activeAt(trails[cell], cut));
  let changes = 0;
  for (let step = 0; step < 8; step += 1) {
    if (around[step] !== around[(step + 1) % 8]) changes += 1;
  }
  return changes / 2;
}

function isRidge(trails: Float32Array, size: number, index: number) {
  const value = trails[index];
  for (const cell of clockwise(size, index)) {
    if (cell >= 0 && trails[cell] > value) return false;
  }
  return true;
}

function percent(part: number, whole: number) {
  if (whole <= 0 || part <= 0) return "0%";
  const value = (part / whole) * 100;
  if (value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function trailCoverage(covered: number, traversable: number | undefined) {
  if (typeof traversable !== "number") return "—";
  return percent(covered, traversable);
}

function countKind(nodes: readonly NetworkNode[], kind: NetworkNode["kind"], hit: (node: NetworkNode) => boolean) {
  const all = nodes.filter((node) => node.kind === kind);
  return `${all.filter(hit).length} / ${all.length}`;
}

function markNodes(out: Uint8Array, size: number, frame: NetworkFrame, nodes: readonly NetworkNode[]) {
  for (const node of nodes) {
    const pixel = nodePixel(node, frame, size);
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= size || pixel.y >= size) continue;
    stamp(out, size, pixel.x, pixel.y, 7, node.kind === "source" ? COPPER : CYAN);
  }
}

function density(iteration: NetworkIteration): NetworkAnalysis {
  const alpha = iteration.trails;
  const cut = fieldCut(iteration);
  const flow = iteration.generator === "flow";
  const out = new Uint8Array(alpha.length * 4);
  let covered = 0;
  let sum = 0;
  let peak = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index];
    if (!activeAt(value, cut)) continue;
    if (value > peak) peak = value;
    covered += 1;
    sum += value;
    const tone = Math.min(1, (value - cut) / 1.2);
    const color: [number, number, number] = [
      Math.round(TEAL[0] + (WHITE[0] - TEAL[0]) * tone),
      Math.round(TEAL[1] + (WHITE[1] - TEAL[1]) * tone),
      Math.round(TEAL[2] + (WHITE[2] - TEAL[2]) * tone),
    ];
    paint(out, index, color, Math.round(90 + tone * 165));
  }
  return {
    rgba: out,
    legend: flow
      ? "Teal is lighter surviving conductivity. White is higher conductivity."
      : "Teal is a light trail. White is a strong concentration.",
    metrics: [
      { label: flow ? "Tube coverage" : "Trail coverage", value: trailCoverage(covered, iteration.traversable) },
      { label: flow ? "Mean conductivity" : "Mean strength", value: covered ? (sum / covered).toFixed(2) : "0" },
      { label: flow ? "Peak conductivity" : "Peak strength", value: peak.toFixed(2) },
    ],
  };
}

function connectivity(iteration: NetworkIteration, frame: NetworkFrame): NetworkAnalysis {
  const alpha = iteration.trails;
  const size = iteration.inkSize;
  const cut = fieldCut(iteration);
  const flow = iteration.generator === "flow";
  const { labels, sizes } = flood(alpha, size, cut);
  const large = sizes
    .map((count, index) => ({ count, label: index + 1 }))
    .filter((item) => item.count >= MIN_COMPONENT)
    .sort((a, b) => b.count - a.count);
  const colorOf = new Map<number, readonly [number, number, number]>();
  large.forEach((item, rank) => {
    colorOf.set(item.label, COMPONENT_COLORS[Math.min(rank, COMPONENT_COLORS.length - 1)]);
  });
  const out = new Uint8Array(alpha.length * 4);
  const junctions: { x: number; y: number; value: number }[] = [];
  for (let index = 0; index < alpha.length; index += 1) {
    const label = labels[index];
    if (!label) continue;
    paint(out, index, colorOf.get(label) ?? MUTED, colorOf.has(label) ? 210 : 90);
  }
  for (let index = 0; index < alpha.length; index += 1) {
    if (!colorOf.has(labels[index]) || !activeAt(alpha[index], cut)) continue;
    const arms = flow ? directionGroups(alpha, size, index, cut, 4) : neighborGroups(alpha, size, index, cut);
    if (!flow && !isRidge(alpha, size, index)) continue;
    if (arms < 3) continue;
    junctions.push({ x: index % size, y: (index / size) | 0, value: alpha[index] });
  }
  const junctionMarks = keepSeparated(junctions, 18);
  for (const mark of junctionMarks) stamp(out, size, mark.x, mark.y, 5, COPPER);
  markNodes(out, size, frame, iteration.nodes);
  const nearLimit = flow ? FLOW_SPACING_FEET * 1.6 : reachFeet(frame.width / size);
  const near = (node: NetworkNode) => trailNear(alpha, size, frame, node, nearLimit, cut);
  const largest = sizes.length ? Math.max(...sizes) : 0;
  const trailCells = sizes.reduce((sum, count) => sum + count, 0);
  return {
    rgba: out,
    legend: flow
      ? "Each color is one connected region of surviving conductivity. Regions share an edge. Orange marks a junction."
      : "Each color is one connected region of raw trail at or above 0.02. Regions share an edge. Orange marks a junction in that trail.",
    metrics: [
      { label: "Components", value: String(large.length) },
      { label: "Small fragments", value: String(sizes.length - large.length) },
      { label: "Largest component", value: percent(largest, trailCells) },
      { label: "Junctions", value: String(junctionMarks.length) },
      { label: flow ? "Linked attractors" : "Connected now", value: `${iteration.connectedIds.length} / ${iteration.total}` },
      { label: flow ? "Stable links" : "Persistent", value: `${iteration.reached} / ${iteration.total}` },
      { label: flow ? "Sources on a tube" : "Sources with trail ink", value: countKind(iteration.nodes, "source", near) },
      { label: flow ? "Attractors on a tube" : "Attractors with trail ink", value: countKind(iteration.nodes, "attractor", near) },
    ],
  };
}

function branching(iteration: NetworkIteration, frame: NetworkFrame): NetworkAnalysis {
  const alpha = iteration.trails;
  const size = iteration.inkSize;
  const cut = fieldCut(iteration);
  const flow = iteration.generator === "flow";
  const majorCut = reinforcedCut(alpha, cut);
  const { labels, sizes } = flood(alpha, size, cut);
  const largeLabel = new Set(sizes.map((count, index) => count >= MIN_COMPONENT ? index + 1 : 0).filter((label) => label > 0));
  const majorComponent = new Set<number>();
  let major = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] < majorCut || labels[index] === 0) continue;
    major += 1;
    majorComponent.add(labels[index]);
  }
  const out = new Uint8Array(alpha.length * 4);
  let branches = 0;
  let separate = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    if (labels[index] === 0) continue;
    const reinforced = alpha[index] >= majorCut;
    const attached = majorComponent.has(labels[index]);
    if (reinforced) paint(out, index, WHITE, 230);
    else if (attached) {
      branches += 1;
      paint(out, index, CYAN, 180);
    } else {
      separate += 1;
      paint(out, index, TEAL, 140);
    }
  }
  const points: { x: number; y: number; value: number }[] = [];
  for (let index = 0; index < alpha.length; index += 1) {
    if (!largeLabel.has(labels[index]) || !activeAt(alpha[index], cut)) continue;
    const arms = flow ? directionGroups(alpha, size, index, cut, 4) : neighborGroups(alpha, size, index, cut);
    if (!flow && !isRidge(alpha, size, index)) continue;
    if (arms < 3) continue;
    points.push({ x: index % size, y: (index / size) | 0, value: alpha[index] });
  }
  const branchMarks = keepSeparated(points, 18);
  for (const mark of branchMarks) stamp(out, size, mark.x, mark.y, 5, COPPER);
  markNodes(out, size, frame, iteration.nodes);
  return {
    rgba: out,
    legend: flow
      ? "White is higher conductivity. Cyan is a lighter tube on that network. Teal is a separate tube. Orange is a branch point."
      : "White is a reinforced path. Cyan is a lighter branch on that path. Teal is a separate light trail. Orange is a branch point.",
    metrics: [
      { label: flow ? "High conductivity" : "Reinforced cells", value: String(major) },
      { label: flow ? "Lighter tubes" : "Branch cells", value: String(branches) },
      { label: flow ? "Separate tubes" : "Separate light cells", value: String(separate) },
      { label: "Branch points", value: String(branchMarks.length) },
    ],
  };
}

function direction(iteration: NetworkIteration): NetworkAnalysis {
  const alpha = iteration.trails;
  const size = iteration.inkSize;
  const cut = fieldCut(iteration);
  const flow = iteration.generator === "flow";
  const out = new Uint8Array(alpha.length * 4);
  const bins = new Array<number>(12).fill(0);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = y * size + x;
      if (!activeAt(alpha[index], cut)) continue;
      const east = alpha[index + 1] - alpha[index - 1];
      const north = alpha[index + size] - alpha[index - size];
      const magnitude = Math.hypot(east, north);
      if (magnitude < GRADIENT) continue;
      const tangent = Math.atan2(north, east) + Math.PI / 2;
      const folded = ((tangent % Math.PI) + Math.PI) % Math.PI;
      const tone = folded / Math.PI;
      bins[Math.min(11, Math.floor(tone * 12))] += alpha[index];
      const color: [number, number, number] = [
        Math.round(COPPER[0] + (CYAN[0] - COPPER[0]) * tone),
        Math.round(COPPER[1] + (CYAN[1] - COPPER[1]) * tone),
        Math.round(COPPER[2] + (CYAN[2] - COPPER[2]) * tone),
      ];
      paint(out, index, color, 200);
    }
  }
  const total = bins.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...bins);
  const peakBin = bins.indexOf(peak);
  const degrees = Math.round((peakBin + 0.5) * (180 / bins.length));
  return {
    rgba: out,
    legend: flow
      ? "Color follows the tube’s direction. Copper is closer to east–west. Teal is closer to north–south."
      : "Color follows the trail’s direction. Copper is closer to east–west. Teal is closer to north–south.",
    metrics: [
      { label: "Dominant bearing", value: total ? `${degrees}°` : "—" },
      { label: "Bearing share", value: total ? percent(peak, total) : "—" },
      { label: flow ? "Tube samples" : "Trail samples", value: String(bins.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0)) },
    ],
  };
}

function thumbnail(alpha: Float32Array, size: number, majorCut: number, hierarchy: boolean, cut: number) {
  const target = 120;
  const image = new Uint8ClampedArray(target * target * 4);
  const stride = size / target;
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      const x0 = Math.floor(x * stride);
      const y0 = Math.floor(y * stride);
      const x1 = Math.min(size, Math.ceil((x + 1) * stride));
      const y1 = Math.min(size, Math.ceil((y + 1) * stride));
      let value = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) value = Math.max(value, alpha[sy * size + sx]);
      }
      if (!activeAt(value, cut)) continue;
      const tone = Math.min(1, (value - cut) / 1.2);
      const reinforced = hierarchy && value >= majorCut;
      const write = ((target - 1 - y) * target + x) * 4;
      image[write] = reinforced ? 255 : Math.round(TEAL[0] + (WHITE[0] - TEAL[0]) * tone);
      image[write + 1] = reinforced ? 255 : Math.round(TEAL[1] + (WHITE[1] - TEAL[1]) * tone);
      image[write + 2] = reinforced ? 255 : Math.round(TEAL[2] + (WHITE[2] - TEAL[2]) * tone);
      image[write + 3] = reinforced ? 235 : Math.round(120 + tone * 135);
    }
  }
  return image;
}

function componentPlate(trails: Float32Array, size: number, cut: number) {
  const { labels, sizes } = flood(trails, size, cut);
  const target = 120;
  const image = new Uint8ClampedArray(target * target * 4);
  const stride = size / target;
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      const x0 = Math.floor(x * stride);
      const y0 = Math.floor(y * stride);
      const x1 = Math.min(size, Math.ceil((x + 1) * stride));
      const y1 = Math.min(size, Math.ceil((y + 1) * stride));
      let label = 0;
      let value = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const sample = trails[sy * size + sx];
          if (!activeAt(sample, cut) || sample <= value) continue;
          value = sample;
          label = labels[sy * size + sx];
        }
      }
      if (!label) continue;
      const color = COMPONENT_COLORS[(label - 1) % COMPONENT_COLORS.length];
      const write = ((target - 1 - y) * target + x) * 4;
      image[write] = color[0];
      image[write + 1] = color[1];
      image[write + 2] = color[2];
      image[write + 3] = 220;
    }
  }
  return { image, components: sizes.length };
}

export function networkFigures(iteration: NetworkIteration, frame: NetworkFrame): NetworkFigures | null {
  if (iteration.trails.length !== iteration.inkSize * iteration.inkSize) return null;
  const alpha = iteration.trails;
  const size = iteration.inkSize;
  const cut = fieldCut(iteration);
  const majorCut = reinforcedCut(alpha, cut);
  const columns = 48;
  const profile = new Array<number>(columns).fill(0);
  for (let index = 0; index < alpha.length; index += 1) {
    if (!activeAt(alpha[index], cut)) continue;
    const column = Math.min(columns - 1, Math.floor(((index % size) / size) * columns));
    profile[column] += alpha[index];
  }
  const profilePeak = Math.max(...profile, 1);
  const roseBins = 16;
  const rose = new Array<number>(roseBins).fill(0);
  let peaks = 0;
  const step = 4;
  for (let y = step; y < size - step; y += step) {
    for (let x = step; x < size - step; x += step) {
      const index = y * size + x;
      if (!activeAt(alpha[index], cut)) continue;
      const east = alpha[index + 1] - alpha[index - 1];
      const north = alpha[index + size] - alpha[index - size];
      if (Math.hypot(east, north) < GRADIENT) continue;
      const folded = ((Math.atan2(north, east) + Math.PI / 2) % Math.PI + Math.PI) % Math.PI;
      rose[Math.min(roseBins - 1, Math.floor((folded / Math.PI) * roseBins))] += 1;
      let peak = true;
      for (let oy = -step; oy <= step && peak; oy += step) {
        for (let ox = -step; ox <= step; ox += step) {
          if (ox === 0 && oy === 0) continue;
          if (alpha[(y + oy) * size + (x + ox)] > alpha[index]) peak = false;
        }
      }
      if (peak && alpha[index] >= majorCut) peaks += 1;
    }
  }
  const plate = componentPlate(alpha, size, cut);
  for (const node of iteration.nodes) {
    const x = Math.max(0, Math.min(119, Math.round(((node.x - frame.minX) / frame.width) * 119)));
    const y = Math.max(0, Math.min(119, Math.round(((node.z - frame.minZ) / frame.depth) * 119)));
    const color = node.kind === "source" ? COPPER : CYAN;
    const row = 119 - y;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const px = x + ox;
        const py = row + oy;
        if (px < 0 || py < 0 || px >= 120 || py >= 120) continue;
        const write = (py * 120 + px) * 4;
        plate.image[write] = color[0];
        plate.image[write + 1] = color[1];
        plate.image[write + 2] = color[2];
        plate.image[write + 3] = 255;
      }
    }
  }
  return {
    density: thumbnail(alpha, size, majorCut, false, cut),
    hierarchy: thumbnail(alpha, size, majorCut, true, cut),
    profile: profile.map((value) => value / profilePeak),
    rose,
    peaks,
    nodes: iteration.nodes.map((node) => ({ x: node.x, z: node.z, kind: node.kind })),
    connectivity: plate.image,
    components: plate.components,
    size: 120,
    measure: iteration.generator === "flow" ? "conductivity" : "trail",
  };
}

function overlay(iterations: readonly NetworkIteration[]): NetworkAnalysis {
  const size = iterations[0].inkSize;
  const counts = new Uint16Array(size * size);
  let used = 0;
  for (const iteration of iterations) {
    if (iteration.inkSize !== size || iteration.trails.length !== counts.length) continue;
    used += 1;
    const alpha = iteration.trails;
    const cut = fieldCut(iteration);
    for (let index = 0; index < alpha.length; index += 1) {
      if (activeAt(alpha[index], cut)) counts[index] += 1;
    }
  }
  const out = new Uint8Array(counts.length * 4);
  let shared = 0;
  let partial = 0;
  let single = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count === 0) continue;
    if (count === used) {
      shared += 1;
      paint(out, index, WHITE, 230);
    } else if (count === 1) {
      single += 1;
      paint(out, index, COPPER, 170);
    } else {
      partial += 1;
      paint(out, index, CYAN, 190);
    }
  }
  const marked = shared + partial + single;
  return {
    rgba: out,
    legend: iterations.every((item) => item.generator === "flow")
      ? "White is surviving conductivity in every selected iteration. Cyan is in more than one. Orange is in only one."
      : "White appears in every selected iteration. Cyan appears in more than one. Orange appears in only one.",
    metrics: [
      { label: "Iterations", value: String(used) },
      { label: "Shared by all", value: percent(shared, marked) },
      { label: "Shared by some", value: percent(partial, marked) },
      { label: "In only one", value: percent(single, marked) },
    ],
  };
}

export function analyzeNetwork(
  mode: NetworkAnalysisMode,
  iterations: readonly NetworkIteration[],
  frame: NetworkFrame,
): NetworkAnalysis | null {
  if (mode === "overlay") {
    const usable = iterations.filter((item) => item.trails.length > 0);
    if (usable.length < 2) return null;
    return overlay(usable);
  }
  const iteration = iterations[0];
  if (!iteration || iteration.trails.length !== iteration.inkSize * iteration.inkSize) return null;
  if (mode === "density") return density(iteration);
  if (mode === "connectivity") return connectivity(iteration, frame);
  if (mode === "direction") return direction(iteration);
  return branching(iteration, frame);
}
