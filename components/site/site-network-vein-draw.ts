/**
 * Display-only network vein shaping.
 * Does not change flow growth, survival, topology, or evaluation — only how
 * surviving edges are drawn as fluid organic corridors with uniform weight.
 */

export type VeinEdge = {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  conductivity: number;
};

export type VeinPoint = { x: number; z: number; half: number };

export type VeinChain = {
  points: VeinPoint[];
  startDegree: number;
  endDegree: number;
};

/** One half-width for every surviving edge (site feet before widthScale). */
export const VEIN_HALF_WIDTH = 2.35;

function keyOf(x: number, z: number) {
  return `${Math.round(x * 10) / 10}:${Math.round(z * 10) / 10}`;
}

/** Uniform stroke — conductivity no longer changes line weight. */
export function veinHalfWidth(_conductivity: number, widthScale = 1) {
  return VEIN_HALF_WIDTH * widthScale;
}

function chaikin(points: VeinPoint[], passes: number) {
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) break;
    const next: VeinPoint[] = [current[0]];
    for (let index = 0; index < current.length - 1; index += 1) {
      const start = current[index];
      const end = current[index + 1];
      next.push({
        x: start.x * 0.75 + end.x * 0.25,
        z: start.z * 0.75 + end.z * 0.25,
        half: start.half * 0.75 + end.half * 0.25,
      });
      next.push({
        x: start.x * 0.25 + end.x * 0.75,
        z: start.z * 0.25 + end.z * 0.75,
        half: start.half * 0.25 + end.half * 0.75,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

type VeinNode = {
  x: number;
  z: number;
  ox: number;
  oz: number;
  links: { to: string; half: number }[];
  pinned?: { x: number; z: number };
};

function shapeSegment(a: VeinPoint, b: VeinPoint, smoothPasses: number) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  const bulge = Math.min(2.0, length * 0.05);
  const mid: VeinPoint = {
    x: (a.x + b.x) * 0.5 + nx * bulge,
    z: (a.z + b.z) * 0.5 + nz * bulge,
    half: (a.half + b.half) * 0.5,
  };
  return chaikin([a, mid, b], Math.max(2, Math.min(3, Math.round(smoothPasses))));
}

/** Same node graph the drawn veins use — pinned, lightly relaxed. */
function buildRelaxedVeinNodes(
  edges: readonly VeinEdge[],
  widthScale = 1,
  pins: readonly { x: number; z: number }[] = [],
) {
  const nodes = new Map<string, VeinNode>();
  const ensure = (x: number, z: number) => {
    const key = keyOf(x, z);
    if (!nodes.has(key)) nodes.set(key, { x, z, ox: x, oz: z, links: [] });
    return key;
  };
  for (const edge of edges) {
    const half = veinHalfWidth(edge.conductivity, widthScale);
    const start = ensure(edge.x0, edge.z0);
    const end = ensure(edge.x1, edge.z1);
    if (start === end) continue;
    nodes.get(start)?.links.push({ to: end, half });
    nodes.get(end)?.links.push({ to: start, half });
  }

  for (const pin of pins) {
    let best: { key: string; dist: number } | null = null;
    for (const [key, node] of nodes) {
      const dist = Math.hypot(node.ox - pin.x, node.oz - pin.z);
      if (dist > 6) continue;
      if (!best || dist < best.dist) best = { key, dist };
    }
    if (!best) continue;
    const node = nodes.get(best.key);
    if (!node) continue;
    node.x = pin.x;
    node.z = pin.z;
    node.pinned = { x: pin.x, z: pin.z };
  }

  for (let pass = 0; pass < 5; pass += 1) {
    const shifted = new Map<string, { x: number; z: number }>();
    for (const [key, node] of nodes) {
      if (node.pinned) {
        shifted.set(key, { x: node.pinned.x, z: node.pinned.z });
        continue;
      }
      const neighbors = [...new Set(node.links.map((link) => link.to))];
      if (neighbors.length < 2) {
        shifted.set(key, { x: node.x, z: node.z });
        continue;
      }
      let x = 0;
      let z = 0;
      let weight = 0;
      for (const neighbor of neighbors) {
        const other = nodes.get(neighbor);
        if (!other) continue;
        x += other.x;
        z += other.z;
        weight += 1;
      }
      x /= Math.max(1e-6, weight);
      z /= Math.max(1e-6, weight);
      const keep = neighbors.length >= 3 ? 0.82 : 0.58;
      shifted.set(key, {
        x: node.x * keep + x * (1 - keep),
        z: node.z * keep + z * (1 - keep),
      });
    }
    for (const [key, point] of shifted) {
      const node = nodes.get(key);
      if (!node) continue;
      node.x = point.x;
      node.z = point.z;
    }
  }
  return nodes;
}

function nearestVeinKey(
  nodes: Map<string, VeinNode>,
  x: number,
  z: number,
  maxDist = 8,
) {
  let best: { key: string; dist: number } | null = null;
  for (const [key, node] of nodes) {
    const dist = Math.hypot(node.ox - x, node.oz - z);
    if (!best || dist < best.dist) best = { key, dist };
  }
  if (!best || best.dist > maxDist) return null;
  return best.key;
}

/**
 * Round pocket walls by relaxing corridor nodes toward their neighbors,
 * then Chaikin-smooth so the web reads cellular rather than grid-locked.
 */
export function buildVeinChains(
  edges: readonly VeinEdge[],
  widthScale = 1,
  /** Chaikin passes. 3 is smooth enough for 3D; higher values explode vertex count. */
  smoothPasses = 3,
  /** Field terminals — drawn veins must stay on these marks. */
  pins: readonly { x: number; z: number }[] = [],
): VeinChain[] {
  if (edges.length === 0) return [];
  const nodes = buildRelaxedVeinNodes(edges, widthScale, pins);

  const used = new Set<string>();
  const pair = (left: string, right: string) => (left < right ? `${left}|${right}` : `${right}|${left}`);
  const chains: VeinChain[] = [];
  const follow = (start: string, first: { to: string; half: number }) => {
    const origin = nodes.get(start);
    if (!origin) return;
    const points: VeinPoint[] = [{ x: origin.x, z: origin.z, half: first.half }];
    used.add(pair(start, first.to));
    let previous = start;
    let current = first.to;
    let half = first.half;
    while (nodes.has(current)) {
      const node = nodes.get(current);
      if (!node) break;
      points.push({ x: node.x, z: node.z, half });
      if (node.links.length !== 2) break;
      const next = node.links.find((link) => link.to !== previous);
      if (!next) break;
      const mark = pair(current, next.to);
      if (used.has(mark)) break;
      used.add(mark);
      half = next.half;
      previous = current;
      current = next.to;
    }
    const shaped = points.length === 2
      ? shapeSegment(points[0], points[1], smoothPasses)
      : chaikin(points, Math.max(2, Math.min(3, Math.round(smoothPasses))));
    chains.push({
      points: shaped,
      startDegree: nodes.get(start)?.links.length ?? 1,
      endDegree: nodes.get(current)?.links.length ?? 1,
    });
  };

  for (const [key, node] of nodes) {
    if (node.links.length === 2) continue;
    for (const link of node.links) {
      if (!used.has(pair(key, link.to))) follow(key, link);
    }
  }
  for (const [key, node] of nodes) {
    for (const link of node.links) {
      if (!used.has(pair(key, link.to))) follow(key, link);
    }
  }
  return chains;
}

/**
 * Remap a pocket / zone ring onto the same shaped paths the veins draw.
 * Topology stays; corners do not get replaced by a geometric box.
 */
export function alignRingToVeinPaths(
  ring: readonly { x: number; z: number }[],
  edges: readonly VeinEdge[],
  pins: readonly { x: number; z: number }[] = [],
  smoothPasses = 3,
): { x: number; z: number }[] {
  if (ring.length < 3 || edges.length === 0) return ring.map((point) => ({ ...point }));
  const nodes = buildRelaxedVeinNodes(edges, 1, pins);
  if (nodes.size === 0) return ring.map((point) => ({ ...point }));

  const out: { x: number; z: number }[] = [];
  const push = (point: { x: number; z: number }) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.35) return;
    out.push({ x: point.x, z: point.z });
  };

  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    const startKey = nearestVeinKey(nodes, from.x, from.z);
    const endKey = nearestVeinKey(nodes, to.x, to.z);
    const start = startKey ? nodes.get(startKey) : null;
    const end = endKey ? nodes.get(endKey) : null;
    if (!start || !end || !startKey || !endKey) {
      push({ x: from.x, z: from.z });
      continue;
    }
    if (startKey === endKey) {
      push({ x: start.x, z: start.z });
      continue;
    }
    const linked = start.links.some((link) => link.to === endKey);
    if (linked) {
      const half = start.links.find((link) => link.to === endKey)?.half ?? VEIN_HALF_WIDTH;
      const shaped = shapeSegment(
        { x: start.x, z: start.z, half },
        { x: end.x, z: end.z, half },
        smoothPasses,
      );
      for (let cursor = 0; cursor < shaped.length - 1; cursor += 1) {
        push({ x: shaped[cursor].x, z: shaped[cursor].z });
      }
      continue;
    }
    push({ x: start.x, z: start.z });
  }

  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z) < 0.35) {
    out.pop();
  }
  return out.length >= 3 ? out : ring.map((point) => ({ ...point }));
}

/** Soft white uniform stroke for 2D iteration thumbs. */
export function paintVeinChains(
  ctx: CanvasRenderingContext2D,
  chains: readonly VeinChain[],
  map: (x: number, z: number) => { x: number; y: number },
  scaleHint: number,
) {
  const widthPx = Math.min(2.8, Math.max(1.2, scaleHint * 0.012));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 0;

  const strokeChain = (points: readonly VeinPoint[], alpha: number) => {
    if (points.length < 2) return;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    for (let index = 0; index < points.length; index += 1) {
      const point = map(points[index].x, points[index].z);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  };

  for (const chain of chains) strokeChain(chain.points, 0.95);
}
