/**
 * Site-local adaptive conductance model for Site Network.
 * The shared Physarum engine is not used. Conductivity is not agent ink.
 * Edges exist only where the open parcel mask allows them. Flow decides which survive.
 */

export const FLOW_SPACING_FEET = 15;
/** Conductivity at or above this value stays in the network. Thin branches live here. It is not the agent trail threshold. */
export const FLOW_SURVIVE = 0.08;
const FLOW_FLOOR = 0.02;
const FLOW_CAP = 1.25;
const FLOW_MU = 1.5;
/** Edges below this no longer carry flow, so an abandoned branch can disappear. */
const FLOW_CARRY = 0.05;
/** The searching sheet. It stays faint until flow reinforces a vein. */
const FLOW_SHEET = 0.32;
/** A short filament ahead of the sheet. */
const FLOW_HAIR = 0.13;
const FLOW_STABLE_STEPS = 20;
const FLOW_MAX_STEPS = 360;
const SOLVER_ITERATIONS = 40;
/** Edges opened in one step while the organism is still searching. */
const GROW_EDGES = 48;
/** Edges opened in one step while a reached attractor grows toward another. */
const JOIN_EDGES = 18;

export type FlowTerminal = {
  id: string;
  kind: "source" | "attractor";
  x: number;
  z: number;
};

export type FlowEdge = {
  a: number;
  b: number;
  length: number;
  conductivity: number;
  /** Random growth order. It does not point toward food. */
  priority: number;
};

type Neighbor = { to: number; edge: number };

export type FlowGraph = {
  east: Float32Array;
  north: Float32Array;
  edges: FlowEdge[];
  neighbors: Neighbor[][];
  sourceAt: Int32Array;
  attractorAt: Int32Array;
  sourceIds: string[];
  attractorIds: string[];
  /** Graph node for each terminal, or -1 when no open sample is close enough. */
  terminalNode: Int32Array;
};

export type FlowReport = {
  connected: string[];
  disconnected: string[];
  branches: number;
  surviving: number;
  maskBreaks: number;
  stable: boolean;
  step: number;
};

export function createFlowGraph(
  terminals: readonly FlowTerminal[],
  spacingFeet: number,
  cellFeet: number,
  frame: { minX: number; minZ: number; width: number; depth: number },
  inkSize: number,
  open: Uint8Array,
  rng: () => number,
): FlowGraph {
  const inside = (east: number, north: number) => cellOpen(east, north, frame, inkSize, open);
  const easts: number[] = [];
  const norths: number[] = [];
  const indexAt = new Map<string, number>();
  const step = spacingFeet;
  for (let north = frame.minZ; north <= frame.minZ + frame.depth; north += step) {
    for (let east = frame.minX; east <= frame.minX + frame.width; east += step) {
      if (!inside(east, north)) continue;
      const key = `${Math.round(east)}:${Math.round(north)}`;
      if (indexAt.has(key)) continue;
      indexAt.set(key, easts.length);
      easts.push(east);
      norths.push(north);
    }
  }
  const edges: FlowEdge[] = [];
  const neighbors: Neighbor[][] = easts.map(() => []);
  const offsets = [
    [step, 0],
    [0, step],
    [step, step],
    [step, -step],
  ];
  for (let index = 0; index < easts.length; index += 1) {
    for (const [de, dn] of offsets) {
      const other = indexAt.get(`${Math.round(easts[index] + de)}:${Math.round(norths[index] + dn)}`);
      if (other == null || other <= index) continue;
      if (!segmentOpen(easts[index], norths[index], easts[other], norths[other], inside, cellFeet)) continue;
      const length = Math.hypot(easts[other] - easts[index], norths[other] - norths[index]);
      const edge = edges.length;
      edges.push({
        a: index,
        b: other,
        length: Math.max(length, 1),
        conductivity: FLOW_FLOOR,
        priority: rng(),
      });
      neighbors[index].push({ to: other, edge });
      neighbors[other].push({ to: index, edge });
    }
  }
  const sources = terminals.filter((item) => item.kind === "source");
  const attractors = terminals.filter((item) => item.kind === "attractor");
  const sourceAt = snapAll(sources, easts, norths, spacingFeet * 1.6);
  const attractorAt = snapAll(attractors, easts, norths, spacingFeet * 1.6);
  return {
    east: Float32Array.from(easts),
    north: Float32Array.from(norths),
    edges,
    neighbors,
    sourceAt,
    attractorAt,
    sourceIds: sources.map((item) => item.id),
    attractorIds: attractors.map((item) => item.id),
    terminalNode: Int32Array.from([...sourceAt, ...attractorAt]),
  };
}

function snapAll(terminals: readonly FlowTerminal[], easts: number[], norths: number[], limit: number) {
  const at = new Int32Array(terminals.length);
  at.fill(-1);
  for (let index = 0; index < terminals.length; index += 1) {
    let best = -1;
    let bestDistance = limit;
    for (let node = 0; node < easts.length; node += 1) {
      const distance = Math.hypot(easts[node] - terminals[index].x, norths[node] - terminals[index].z);
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    at[index] = best;
  }
  return at;
}

function cellOpen(
  east: number,
  north: number,
  frame: { minX: number; minZ: number; width: number; depth: number },
  inkSize: number,
  open: Uint8Array,
) {
  const px = Math.floor(((east - frame.minX) / frame.width) * inkSize);
  const py = Math.floor(((north - frame.minZ) / frame.depth) * inkSize);
  return px >= 0 && py >= 0 && px < inkSize && py < inkSize && open[py * inkSize + px] === 1;
}

function segmentOpen(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  inside: (east: number, north: number) => boolean,
  cellFeet: number,
) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(length / Math.max(0.5, cellFeet * 0.45)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (!inside(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}

export type FlowState = {
  graph: FlowGraph;
  step: number;
  stableFor: number;
  signature: string;
  connected: string[];
  disconnected: string[];
  branches: number;
  surviving: number;
  maskBreaks: number;
  /** True once every attractor shares one body. Pruning waits for this. */
  feeding: boolean;
};

export function createFlowState(graph: FlowGraph): FlowState {
  return {
    graph,
    step: 0,
    stableFor: 0,
    signature: "",
    connected: [],
    disconnected: graph.attractorIds.slice(),
    branches: 0,
    surviving: 0,
    maskBreaks: 0,
    feeding: false,
  };
}

export function adaptFlow(state: FlowState) {
  const { graph } = state;
  if (!foodReached(graph)) {
    growOrganism(graph);
  } else if (!attractorsShareBody(graph)) {
    joinAttractors(graph);
  } else {
    state.feeding = true;
    const supply = flowAmount(graph, supplyFlux(graph), state.step);
    const between = attractorFlow(graph, state.step);
    const supplyMean = meanFlow(supply);
    const betweenMean = meanFlow(between);
    for (let index = 0; index < graph.edges.length; index += 1) {
      const edge = graph.edges[index];
      const scaled = Math.max(supply[index] / supplyMean, between[index] / betweenMean);
      if (edge.conductivity < FLOW_SURVIVE && scaled <= 0) continue;
      const target = scaled >= 0.9
        ? Math.min(FLOW_CAP, scaled ** FLOW_MU)
        : scaled >= 0.22
          ? 0.16 + scaled * 0.22
          : 0;
      const next = edge.conductivity + 0.42 * (target - edge.conductivity);
      edge.conductivity = Math.min(FLOW_CAP, Math.max(FLOW_FLOOR, next));
      if (edge.conductivity < FLOW_SURVIVE) edge.conductivity = FLOW_FLOOR;
    }
    shedRedundant(graph);
  }
  const surviving: number[] = [];
  for (let index = 0; index < graph.edges.length; index += 1) {
    if (graph.edges[index].conductivity >= FLOW_SURVIVE) surviving.push(index);
  }
  const signature = surviving.join(",");
  state.stableFor = signature === state.signature ? state.stableFor + 1 : 0;
  state.signature = signature;
  state.step += 1;
  const reached = reachable(graph, surviving);
  state.connected = [];
  state.disconnected = [];
  for (let index = 0; index < graph.attractorIds.length; index += 1) {
    const node = graph.attractorAt[index];
    const id = graph.attractorIds[index];
    if (node >= 0 && reached.has(node)) state.connected.push(id);
    else state.disconnected.push(id);
  }
  state.surviving = surviving.length;
  state.branches = branchCount(graph, surviving);
}

export function flowSettled(state: FlowState) {
  if (!state.feeding) return state.step >= FLOW_MAX_STEPS;
  return state.step >= FLOW_MAX_STEPS || state.stableFor >= FLOW_STABLE_STEPS;
}

function countLinked(nodes: Int32Array) {
  let count = 0;
  for (const node of nodes) if (node >= 0) count += 1;
  return count;
}

function conducts(conductivity: number) {
  return conductivity >= FLOW_CARRY;
}

function growOrganism(graph: FlowGraph) {
  const count = graph.east.length;
  const body = new Uint8Array(count);
  for (const edge of graph.edges) {
    if (edge.conductivity < FLOW_SURVIVE) continue;
    body[edge.a] = 1;
    body[edge.b] = 1;
  }
  for (const node of graph.sourceAt) if (node >= 0) body[node] = 1;
  const label = new Int32Array(count);
  label.fill(-1);
  let components = 0;
  for (let start = 0; start < count; start += 1) {
    if (body[start] !== 1 || label[start] >= 0) continue;
    const stack = [start];
    label[start] = components;
    while (stack.length) {
      const node = stack.pop();
      if (node == null) break;
      for (const link of graph.neighbors[node]) {
        if (body[link.to] !== 1 || label[link.to] >= 0) continue;
        if (graph.edges[link.edge].conductivity < FLOW_SURVIVE && body[link.to] === 1 && body[node] === 1) {
          label[link.to] = components;
          stack.push(link.to);
          continue;
        }
        if (graph.edges[link.edge].conductivity < FLOW_SURVIVE) continue;
        label[link.to] = components;
        stack.push(link.to);
      }
    }
    components += 1;
  }
  const fresh = new Uint8Array(count);
  for (let component = 0; component < components; component += 1) {
    const frontier: { edge: number; into: number; from: number; priority: number }[] = [];
    for (let index = 0; index < graph.edges.length; index += 1) {
      const edge = graph.edges[index];
      if (edge.conductivity >= FLOW_SURVIVE) continue;
      const a = body[edge.a] === 1 && label[edge.a] === component;
      const b = body[edge.b] === 1 && label[edge.b] === component;
      if (a === b) continue;
      frontier.push({
        edge: index,
        into: a ? edge.b : edge.a,
        from: a ? edge.a : edge.b,
        priority: edge.priority,
      });
    }
    frontier.sort((left, right) => right.priority - left.priority || left.edge - right.edge);
    const near = new Set<number>();
    if (frontier[0]) near.add(frontier[0].from);
    let added = 0;
    for (let pass = 0; pass < 8 && added < GROW_EDGES; pass += 1) {
      for (const item of frontier) {
        if (added >= GROW_EDGES) break;
        const edge = graph.edges[item.edge];
        if (edge.conductivity >= FLOW_SURVIVE) continue;
        if (!near.has(item.from) && !near.has(item.into)) continue;
        edge.conductivity = FLOW_SHEET * (0.75 + edge.priority * 0.45);
        near.add(item.into);
        body[item.into] = 1;
        fresh[item.into] = 1;
        added += 1;
      }
    }
  }
  for (let node = 0; node < count; node += 1) {
    if (fresh[node] !== 1) continue;
    let current = node;
    let previous = -1;
    for (let hop = 0; hop < 2; hop += 1) {
      let best = -1;
      let bestPriority = 0.72;
      for (const link of graph.neighbors[current]) {
        if (link.to === previous || body[link.to] === 1) continue;
        const edge = graph.edges[link.edge];
        if (edge.conductivity >= FLOW_SURVIVE || edge.priority <= bestPriority) continue;
        best = link.edge;
        bestPriority = edge.priority;
      }
      if (best < 0) break;
      const edge = graph.edges[best];
      edge.conductivity = FLOW_HAIR;
      previous = current;
      current = edge.a === current ? edge.b : edge.a;
      body[current] = 1;
    }
  }
}

function foodReached(graph: FlowGraph) {
  const label = livingLabels(graph);
  let pending = 0;
  for (const node of graph.attractorAt) {
    if (node < 0) continue;
    if (label[node] < 0) pending += 1;
  }
  return pending === 0 && countLinked(graph.attractorAt) > 0;
}

/** True when every reached attractor sits in the same surviving body. */
function attractorsShareBody(graph: FlowGraph) {
  const label = livingLabels(graph);
  let shared = -1;
  for (const node of graph.attractorAt) {
    if (node < 0) continue;
    if (label[node] < 0) return false;
    if (shared < 0) shared = label[node];
    else if (label[node] !== shared) return false;
  }
  return shared >= 0;
}

function livingLabels(graph: FlowGraph) {
  const count = graph.east.length;
  const label = new Int32Array(count);
  label.fill(-1);
  let components = 0;
  const seed = (start: number) => {
    if (start < 0 || label[start] >= 0) return;
    const stack = [start];
    label[start] = components;
    while (stack.length) {
      const node = stack.pop();
      if (node == null) break;
      for (const link of graph.neighbors[node]) {
        if (label[link.to] >= 0) continue;
        if (graph.edges[link.edge].conductivity < FLOW_SURVIVE) continue;
        label[link.to] = components;
        stack.push(link.to);
      }
    }
    components += 1;
  };
  for (const node of graph.sourceAt) seed(node);
  for (let start = 0; start < count; start += 1) {
    let alive = false;
    for (const link of graph.neighbors[start]) {
      if (graph.edges[link.edge].conductivity >= FLOW_SURVIVE) {
        alive = true;
        break;
      }
    }
    if (alive) seed(start);
  }
  return label;
}

/**
 * After food is reached, grow from one attractor body toward the next
 * along open edges. The join is a real path in the parcel, not a drawn link.
 */
function joinAttractors(graph: FlowGraph) {
  const count = graph.east.length;
  const label = livingLabels(graph);
  const attractorComponent = new Map<number, number>();
  for (const node of graph.attractorAt) {
    if (node < 0 || label[node] < 0) continue;
    if (!attractorComponent.has(label[node])) attractorComponent.set(label[node], node);
  }
  if (attractorComponent.size < 2) return;
  const origin = attractorComponent.keys().next().value;
  if (origin == null) return;
  const dist = new Float64Array(count);
  dist.fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(count);
  parent.fill(-1);
  const used = new Uint8Array(count);
  for (let node = 0; node < count; node += 1) {
    if (label[node] === origin) dist[node] = 0;
  }
  let found = -1;
  for (;;) {
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let node = 0; node < count; node += 1) {
      if (used[node] !== 0 || dist[node] >= bestDist) continue;
      best = node;
      bestDist = dist[node];
    }
    if (best < 0) break;
    used[best] = 1;
    const mark = label[best];
    if (bestDist > 0 && mark >= 0 && mark !== origin && attractorComponent.has(mark)) {
      found = best;
      break;
    }
    for (const link of graph.neighbors[best]) {
      if (used[link.to] !== 0) continue;
      const edge = graph.edges[link.edge];
      const cost = dist[best] + (1.2 - edge.priority);
      if (cost < dist[link.to]) {
        dist[link.to] = cost;
        parent[link.to] = best;
      }
    }
  }
  if (found < 0) return;
  const chain: number[] = [];
  let cursor = found;
  while (cursor >= 0) {
    chain.push(cursor);
    if (parent[cursor] < 0) break;
    cursor = parent[cursor];
  }
  chain.reverse();
  let opened = 0;
  for (let index = 0; index < chain.length - 1 && opened < JOIN_EDGES; index += 1) {
    let edge: FlowEdge | null = null;
    for (const link of graph.neighbors[chain[index]]) {
      if (link.to === chain[index + 1]) {
        edge = graph.edges[link.edge];
        break;
      }
    }
    if (!edge || edge.conductivity >= FLOW_SURVIVE) continue;
    edge.conductivity = FLOW_SHEET * (0.75 + edge.priority * 0.45);
    opened += 1;
  }
}

function supplyFlux(graph: FlowGraph) {
  const flux = new Float64Array(graph.east.length);
  const sourceCount = countLinked(graph.sourceAt);
  const attractorCount = countLinked(graph.attractorAt);
  if (sourceCount > 0) {
    for (const node of graph.sourceAt) if (node >= 0) flux[node] += 1 / sourceCount;
  }
  if (attractorCount > 0) {
    for (const node of graph.attractorAt) if (node >= 0) flux[node] -= 1 / attractorCount;
  }
  return flux;
}

function flowAmount(graph: FlowGraph, flux: Float64Array, step: number) {
  const pressure = solvePressure(graph, flux, step);
  const amount = new Float64Array(graph.edges.length);
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    if (!conducts(edge.conductivity)) continue;
    const drop = pressure[edge.a] - pressure[edge.b];
    amount[index] = Math.abs((edge.conductivity / edge.length) * drop);
  }
  return amount;
}

function meanFlow(amount: Float64Array) {
  let mean = 0;
  let living = 0;
  for (const value of amount) {
    if (value <= 0) continue;
    mean += value;
    living += 1;
  }
  return living > 0 ? mean / living : 1;
}

/**
 * Drops the lighter edge of a short loop.
 * Tips and the paths that join attractors stay, so the sheet does not remain a lattice.
 */
function shedRedundant(graph: FlowGraph) {
  for (let pass = 0; pass < 4; pass += 1) {
    const degree = new Uint16Array(graph.east.length);
    for (const edge of graph.edges) {
      if (edge.conductivity < FLOW_SURVIVE) continue;
      degree[edge.a] += 1;
      degree[edge.b] += 1;
    }
    const candidates: number[] = [];
    for (let index = 0; index < graph.edges.length; index += 1) {
      const edge = graph.edges[index];
      if (edge.conductivity < FLOW_SURVIVE) continue;
      if (degree[edge.a] < 2 || degree[edge.b] < 2) continue;
      candidates.push(index);
    }
    candidates.sort((left, right) => graph.edges[left].conductivity - graph.edges[right].conductivity || left - right);
    let removed = 0;
    for (const index of candidates) {
      const edge = graph.edges[index];
      if (edge.conductivity < FLOW_SURVIVE) continue;
      if (degree[edge.a] < 2 || degree[edge.b] < 2) continue;
      if (!closesShortLoop(graph, edge.a, edge.b, index)) continue;
      edge.conductivity = FLOW_FLOOR;
      degree[edge.a] -= 1;
      degree[edge.b] -= 1;
      removed += 1;
    }
    if (removed === 0) break;
  }
}

function closesShortLoop(graph: FlowGraph, from: number, to: number, skip: number) {
  const depth = new Int16Array(graph.east.length);
  depth.fill(-1);
  const queue = [from];
  depth[from] = 0;
  let head = 0;
  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    if (depth[node] >= 5) continue;
    for (const link of graph.neighbors[node]) {
      if (link.edge === skip) continue;
      if (graph.edges[link.edge].conductivity < FLOW_SURVIVE) continue;
      if (link.to === to) return true;
      if (depth[link.to] >= 0) continue;
      depth[link.to] = depth[node] + 1;
      queue.push(link.to);
    }
  }
  return false;
}

/** Flow from each attractor toward the others, so the tubes between them stay. */
function attractorFlow(graph: FlowGraph, step: number) {
  const amount = new Float64Array(graph.edges.length);
  const nodes: number[] = [];
  const seen = new Set<number>();
  for (const node of graph.attractorAt) {
    if (node < 0 || seen.has(node)) continue;
    seen.add(node);
    nodes.push(node);
  }
  if (nodes.length < 2) return amount;
  const share = 1 / (nodes.length - 1);
  for (const origin of nodes) {
    const flux = new Float64Array(graph.east.length);
    flux[origin] += 1;
    for (const other of nodes) if (other !== origin) flux[other] -= share;
    const part = flowAmount(graph, flux, step);
    for (let index = 0; index < amount.length; index += 1) {
      if (part[index] > amount[index]) amount[index] = part[index];
    }
  }
  return amount;
}


function solvePressure(graph: FlowGraph, flux: Float64Array, step: number) {
  const count = graph.east.length;
  const pressure = new Float64Array(count);
  if (count === 0 || graph.edges.length === 0) return pressure;
  const component = components(graph, step);
  const groups = new Map<number, number[]>();
  for (let index = 0; index < count; index += 1) {
    const id = component[index];
    const list = groups.get(id);
    if (list) list.push(index);
    else groups.set(id, [index]);
  }
  for (const nodes of groups.values()) {
    let pin = -1;
    let hasSource = false;
    let hasAttractor = false;
    for (const node of graph.sourceAt) {
      if (node >= 0 && component[node] === component[nodes[0]]) {
        hasSource = true;
        if (pin < 0) pin = node;
      }
    }
    for (const node of graph.attractorAt) {
      if (node >= 0 && component[node] === component[nodes[0]]) hasAttractor = true;
    }
    if (!hasSource || !hasAttractor || pin < 0) continue;
    conjugate(graph, flux, pressure, pin, nodes, step);
  }
  return pressure;
}

function components(graph: FlowGraph, step: number) {
  const label = new Int32Array(graph.east.length);
  label.fill(-1);
  let next = 0;
  for (let start = 0; start < label.length; start += 1) {
    if (label[start] >= 0) continue;
    const stack = [start];
    label[start] = next;
    while (stack.length) {
      const node = stack.pop();
      if (node == null) break;
      for (const link of graph.neighbors[node]) {
        if (!conducts(graph.edges[link.edge].conductivity)) continue;
        if (label[link.to] >= 0) continue;
        label[link.to] = next;
        stack.push(link.to);
      }
    }
    next += 1;
  }
  return label;
}

function conjugate(graph: FlowGraph, flux: Float64Array, pressure: Float64Array, pin: number, nodes: readonly number[], step: number) {
  const count = graph.east.length;
  const use = new Uint8Array(count);
  for (const node of nodes) use[node] = 1;
  const residual = new Float64Array(count);
  const direction = new Float64Array(count);
  const product = new Float64Array(count);
  for (const node of nodes) {
    if (node === pin) continue;
    residual[node] = flux[node];
    direction[node] = flux[node];
  }
  let previous = dot(residual, residual, use);
  if (previous < 1e-18) return;
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
    apply(graph, direction, product, pin, use, step);
    const slope = dot(direction, product, use);
    if (Math.abs(slope) < 1e-18) break;
    const alpha = previous / slope;
    let next = 0;
    for (const node of nodes) {
      if (node === pin) continue;
      pressure[node] += alpha * direction[node];
      residual[node] -= alpha * product[node];
      next += residual[node] * residual[node];
    }
    if (next < 1e-16) break;
    const beta = next / previous;
    for (const node of nodes) {
      if (node === pin) continue;
      direction[node] = residual[node] + beta * direction[node];
    }
    previous = next;
  }
}

function apply(graph: FlowGraph, input: Float64Array, output: Float64Array, pin: number, use: Uint8Array, step: number) {
  output.fill(0);
  for (let node = 0; node < graph.east.length; node += 1) {
    if (use[node] === 0) continue;
    if (node === pin) {
      output[node] = input[node];
      continue;
    }
    let diagonal = 0;
    let off = 0;
    for (const link of graph.neighbors[node]) {
      if (!conducts(graph.edges[link.edge].conductivity)) continue;
      const weight = graph.edges[link.edge].conductivity / graph.edges[link.edge].length;
      diagonal += weight;
      if (link.to !== pin && use[link.to] === 1) off += weight * input[link.to];
    }
    output[node] = diagonal * input[node] - off;
  }
}

function dot(left: Float64Array, right: Float64Array, use: Uint8Array) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (use[index] === 0) continue;
    sum += left[index] * right[index];
  }
  return sum;
}

function reachable(graph: FlowGraph, surviving: readonly number[]) {
  const neighbors: number[][] = graph.east.length ? Array.from({ length: graph.east.length }, () => []) : [];
  for (const index of surviving) {
    const edge = graph.edges[index];
    neighbors[edge.a].push(edge.b);
    neighbors[edge.b].push(edge.a);
  }
  const seen = new Set<number>();
  const stack: number[] = [];
  for (const node of graph.sourceAt) {
    if (node >= 0 && !seen.has(node)) {
      seen.add(node);
      stack.push(node);
    }
  }
  while (stack.length) {
    const node = stack.pop() ?? 0;
    for (const next of neighbors[node] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

function branchCount(graph: FlowGraph, surviving: readonly number[]) {
  const degree = new Uint16Array(graph.east.length);
  for (const index of surviving) {
    const edge = graph.edges[index];
    degree[edge.a] += 1;
    degree[edge.b] += 1;
  }
  let branches = 0;
  for (const value of degree) if (value >= 3) branches += 1;
  return branches;
}

/** Writes surviving conductivity into a trail-sized raster. Closed cells stay empty. Values are conductivity, capped for display. */
export function rasterFlow(
  state: FlowState,
  target: Float32Array,
  frame: { minX: number; minZ: number; width: number; depth: number },
  inkSize: number,
  open: Uint8Array,
  displayFloor = FLOW_SURVIVE,
) {
  target.fill(0);
  const { graph } = state;
  let maskBreaks = 0;
  for (const edge of graph.edges) {
    if (edge.conductivity < displayFloor) continue;
    const value = Math.min(FLOW_CAP, edge.conductivity);
    const radius = 0.7 + 1.15 * Math.sqrt(value / FLOW_CAP);
    maskBreaks += stampTube(
      target,
      graph.east[edge.a],
      graph.north[edge.a],
      graph.east[edge.b],
      graph.north[edge.b],
      value,
      radius,
      frame,
      inkSize,
      open,
    );
  }
  state.maskBreaks = maskBreaks;
}

function stampTube(
  target: Float32Array,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  value: number,
  radius: number,
  frame: { minX: number; minZ: number; width: number; depth: number },
  inkSize: number,
  open: Uint8Array,
) {
  const ax = ((x0 - frame.minX) / frame.width) * inkSize;
  const ay = ((z0 - frame.minZ) / frame.depth) * inkSize;
  const bx = ((x1 - frame.minX) / frame.width) * inkSize;
  const by = ((z1 - frame.minZ) / frame.depth) * inkSize;
  const length = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(length));
  const reach = Math.ceil(radius);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const x0i = Math.max(0, Math.floor(x - reach));
    const x1i = Math.min(inkSize - 1, Math.ceil(x + reach));
    const y0i = Math.max(0, Math.floor(y - reach));
    const y1i = Math.min(inkSize - 1, Math.ceil(y + reach));
    for (let py = y0i; py <= y1i; py += 1) {
      for (let px = x0i; px <= x1i; px += 1) {
        if (Math.hypot(px + 0.5 - x, py + 0.5 - y) > radius) continue;
        const index = py * inkSize + px;
        if (open[index] !== 1) continue;
        if (value > target[index]) target[index] = value;
      }
    }
  }
  return 0;
}

/** Counts surviving edges whose centerline leaves the open mask. */
export function auditFlowMask(
  state: FlowState,
  frame: { minX: number; minZ: number; width: number; depth: number },
  inkSize: number,
  open: Uint8Array,
  cellFeet: number,
) {
  const inside = (east: number, north: number) => cellOpen(east, north, frame, inkSize, open);
  let breaks = 0;
  for (const edge of state.graph.edges) {
    if (edge.conductivity < FLOW_SURVIVE) continue;
    if (!segmentOpen(state.graph.east[edge.a], state.graph.north[edge.a], state.graph.east[edge.b], state.graph.north[edge.b], inside, cellFeet)) breaks += 1;
  }
  state.maskBreaks = breaks;
  return breaks;
}

export function survivingPoints(state: FlowState) {
  const graph = state.graph;
  const points: { x: number; z: number }[] = [];
  for (const edge of graph.edges) {
    if (edge.conductivity < FLOW_SURVIVE) continue;
    points.push({
      x: (graph.east[edge.a] + graph.east[edge.b]) / 2,
      z: (graph.north[edge.a] + graph.north[edge.b]) / 2,
    });
  }
  return points;
}

export type FlowRoute = {
  id: string;
  length: number;
  points: { x: number; z: number }[];
};

/** Shortest surviving route from any source to each attractor. Length is site feet along the tubes. */
export function attractorRoutes(state: FlowState): FlowRoute[] {
  const graph = state.graph;
  const count = graph.east.length;
  const neighbors: { to: number; length: number }[][] = Array.from({ length: count }, () => []);
  for (const edge of graph.edges) {
    if (edge.conductivity < FLOW_SURVIVE) continue;
    neighbors[edge.a].push({ to: edge.b, length: edge.length });
    neighbors[edge.b].push({ to: edge.a, length: edge.length });
  }
  const distance = new Float64Array(count);
  distance.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(count);
  previous.fill(-1);
  const settled = new Uint8Array(count);
  for (const node of graph.sourceAt) if (node >= 0) distance[node] = 0;
  for (let step = 0; step < count; step += 1) {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
      if (settled[index] === 1 || distance[index] >= bestDistance) continue;
      best = index;
      bestDistance = distance[index];
    }
    if (best < 0) break;
    settled[best] = 1;
    for (const link of neighbors[best]) {
      const next = distance[best] + link.length;
      if (next >= distance[link.to]) continue;
      distance[link.to] = next;
      previous[link.to] = best;
    }
  }
  return graph.attractorIds.map((id, index) => {
    const node = graph.attractorAt[index];
    if (node < 0 || !Number.isFinite(distance[node])) return { id, length: Infinity, points: [] };
    const chain: number[] = [];
    for (let cursor = node; cursor >= 0; cursor = previous[cursor]) {
      chain.push(cursor);
      if (distance[cursor] === 0) break;
    }
    chain.reverse();
    return {
      id,
      length: distance[node],
      points: chain.map((item) => ({ x: graph.east[item], z: graph.north[item] })),
    };
  });
}
