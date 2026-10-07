/**
 * Homepage Overall Workflow sequence.
 * Macro is a fitted summary. Detail is one full-frame board.
 * Future team SVGs use WORKFLOW_BOARD and replace `detailAsset`.
 */

export type WorkflowTone = "neutral" | "teal" | "copper";

export type WorkflowPoint = { x: number; y: number };

export type WorkflowStage = {
  id: string;
  label: string;
  order: number;
  /** Card center in the macro summary, 0–1. */
  anchor: WorkflowPoint;
  detailAsset: string | null;
  previous: string | null;
  next: string | null;
  tone: WorkflowTone;
  /** Existing lab routes. The homepage links to them; it does not redraw the screens. */
  lab?: readonly { href: string; label: string }[];
};

export type Camera = { x: number; y: number; scale: number };

export type WorldRect = { x: number; y: number; w: number; h: number };

export const WORKFLOW_WORLD = { width: 8200, height: 1200 };

export const WORKFLOW_CARD = { w: 0.132, h: 0.28, radius: 18 };

export type NodeSide = "left" | "right" | "top" | "bottom";

export type MacroNode = {
  id: string;
  center: WorkflowPoint;
  width: number;
  height: number;
  radius: number;
  entrySide: NodeSide | null;
  exitSide: NodeSide | null;
  entry: WorkflowPoint | null;
  focus: WorkflowPoint;
  exit: WorkflowPoint | null;
};

/** How long the glow rests at a node center, in both directions. */
export const NODE_DWELL = 320;

const MACRO_CYCLE = 16000;

/**
 * Shared board for every detailed workflow SVG.
 * Artboard 7407 × 2160. Draw on black. Read left to right.
 * Title zone is the top band. Diagrams stay inside the content rect.
 * Teal #0f7377 marks generative search, Skill 01, and Skill 02.
 * Copper #c77e5f marks Skill 03 and Recombination.
 * Boxes use a 18px corner, a thin teal-to-copper edge, and a black fill.
 */
export const WORKFLOW_BOARD = {
  width: 7407,
  height: 2160,
  margin: 180,
  title: { x: 180, y: 148, index: 36, label: 64 },
  content: { x: 180, y: 360, width: 7047, height: 1620 },
  radius: 18,
  ground: "#000000",
  text: "#ffffff",
  teal: "#0f7377",
  copper: "#c77e5f",
  line: "rgba(255, 255, 255, 0.34)",
} as const;

/** Local dot route inside a board, 0–1 of the artboard. Left to right. */
export const WORKFLOW_BOARD_STOPS: readonly WorkflowPoint[] = [
  { x: 0.12, y: 0.62 },
  { x: 0.3, y: 0.46 },
  { x: 0.48, y: 0.64 },
  { x: 0.66, y: 0.48 },
  { x: 0.86, y: 0.6 },
];

export const WORKFLOW_STAGES: readonly WorkflowStage[] = [
  {
    id: "decomposition",
    label: "Decomposition",
    order: 1,
    anchor: { x: 0.08, y: 0.58 },
    detailAsset: null, // /assets/skill0/decomposition.svg
    previous: null,
    next: "generative-system",
    tone: "neutral",
  },
  {
    id: "generative-system",
    label: "Generative System Search",
    order: 2,
    anchor: { x: 0.244, y: 0.42 },
    detailAsset: "/assets/skill0/generative-system.svg",
    previous: "decomposition",
    next: "skill-1",
    tone: "teal",
  },
  {
    id: "skill-1",
    label: "Translation",
    order: 3,
    anchor: { x: 0.408, y: 0.62 },
    detailAsset: null, // /assets/skill1/workflow.svg
    previous: "generative-system",
    next: "skill-2",
    tone: "teal",
    lab: [{ href: "/lab/physarum", label: "Physarum" }],
  },
  {
    id: "skill-2",
    label: "2D Evolution",
    order: 4,
    anchor: { x: 0.572, y: 0.4 },
    detailAsset: null, // /assets/skill2/workflow.svg
    previous: "skill-1",
    next: "skill-3",
    tone: "teal",
    lab: [{ href: "/lab/evolution", label: "2D Evolution" }],
  },
  {
    id: "skill-3",
    label: "Vertical Propagation",
    order: 5,
    anchor: { x: 0.736, y: 0.6 },
    detailAsset: null, // /assets/skill3/workflow.svg
    previous: "skill-2",
    next: "recombination",
    tone: "copper",
    lab: [{ href: "/lab/vertical", label: "Vertical" }],
  },
  {
    id: "recombination",
    label: "Recombination",
    order: 6,
    anchor: { x: 0.9, y: 0.44 },
    detailAsset: null, // /assets/skill0/recombination.svg
    previous: "skill-3",
    next: null,
    tone: "copper",
    lab: [
      { href: "/lab/hybrid", label: "Hybrid" },
      { href: "/filament", label: "Filament" },
    ],
  },
];

export function workflowStage(id: string) {
  return WORKFLOW_STAGES.find((stage) => stage.id === id) ?? null;
}

export function cardRect(stage: WorkflowStage): WorldRect {
  const w = WORKFLOW_CARD.w * WORKFLOW_WORLD.width;
  const h = WORKFLOW_CARD.h * WORKFLOW_WORLD.height;
  return {
    x: stage.anchor.x * WORKFLOW_WORLD.width - w / 2,
    y: stage.anchor.y * WORKFLOW_WORLD.height - h / 2,
    w,
    h,
  };
}

function lerpPoint(a: WorkflowPoint, b: WorkflowPoint, t: number): WorkflowPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pointDistance(a: WorkflowPoint, b: WorkflowPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Rounded rectangle contains the point. Radius is clamped to the shorter side. */
export function roundedContains(point: WorkflowPoint, center: WorkflowPoint, width: number, height: number, radius: number) {
  const rx = Math.min(radius, width / 2, height / 2);
  const x = Math.abs(point.x - center.x);
  const y = Math.abs(point.y - center.y);
  const halfW = width / 2;
  const halfH = height / 2;
  if (x > halfW || y > halfH) return false;
  if (x <= halfW - rx || y <= halfH - rx) return true;
  const dx = x - (halfW - rx);
  const dy = y - (halfH - rx);
  return dx * dx + dy * dy <= rx * rx;
}

/**
 * Where the segment from an outside point to the node center crosses the rounded boundary.
 * Binary search: the center is inside, the other node center is outside.
 */
export function boundaryPoint(
  outside: WorkflowPoint,
  center: WorkflowPoint,
  width: number,
  height: number,
  radius: number,
): WorkflowPoint {
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 28; step += 1) {
    const mid = (lo + hi) / 2;
    const point = lerpPoint(outside, center, mid);
    if (roundedContains(point, center, width, height, radius)) hi = mid;
    else lo = mid;
  }
  return lerpPoint(outside, center, hi);
}

function boundarySide(point: WorkflowPoint, center: WorkflowPoint, width: number, height: number): NodeSide {
  const dx = (point.x - center.x) / (width / 2);
  const dy = (point.y - center.y) / (height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

export function macroNodes(): MacroNode[] {
  const width = WORKFLOW_CARD.w * WORKFLOW_WORLD.width;
  const height = WORKFLOW_CARD.h * WORKFLOW_WORLD.height;
  const radius = WORKFLOW_CARD.radius;
  const centers = WORKFLOW_STAGES.map(cardCenter);
  return WORKFLOW_STAGES.map((stage, index) => {
    const center = centers[index];
    const previous = centers[index - 1];
    const next = centers[index + 1];
    const entry = previous ? boundaryPoint(previous, center, width, height, radius) : null;
    const exit = next ? boundaryPoint(next, center, width, height, radius) : null;
    return {
      id: stage.id,
      center,
      width,
      height,
      radius,
      entrySide: entry ? boundarySide(entry, center, width, height) : null,
      exitSide: exit ? boundarySide(exit, center, width, height) : null,
      entry,
      focus: center,
      exit,
    };
  });
}

type RouteMove = {
  kind: "move";
  ms: number;
  from: WorkflowPoint;
  to: WorkflowPoint;
  phase: "connector" | "inside";
  nodeId: string | null;
};

type RouteHold = {
  kind: "hold";
  ms: number;
  at: WorkflowPoint;
  nodeId: string;
};

type RouteEvent = RouteMove | RouteHold;

export type MacroPose = {
  point: WorkflowPoint;
  phase: "connector" | "inside" | "center";
  nodeId: string | null;
};

function buildMacroRoute() {
  const nodes = macroNodes();
  const legs: Array<Omit<RouteMove, "kind" | "ms">> = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const current = nodes[index];
    const next = nodes[index + 1];
    legs.push({ from: current.focus, to: current.exit as WorkflowPoint, phase: "inside", nodeId: current.id });
    legs.push({ from: current.exit as WorkflowPoint, to: next.entry as WorkflowPoint, phase: "connector", nodeId: null });
    legs.push({ from: next.entry as WorkflowPoint, to: next.focus, phase: "inside", nodeId: next.id });
  }
  const travel = legs.reduce((sum, leg) => sum + pointDistance(leg.from, leg.to), 0);
  const holds = nodes.length * NODE_DWELL;
  const speed = travel / Math.max(1, MACRO_CYCLE - holds);
  const events: RouteEvent[] = [{ kind: "hold", ms: NODE_DWELL, at: nodes[0].focus, nodeId: nodes[0].id }];
  legs.forEach((leg, index) => {
    events.push({ kind: "move", ms: pointDistance(leg.from, leg.to) / speed, ...leg });
    if (index % 3 === 2) {
      const node = nodes[Math.floor(index / 3) + 1];
      events.push({ kind: "hold", ms: NODE_DWELL, at: node.focus, nodeId: node.id });
    }
  });
  const duration = events.reduce((sum, event) => sum + event.ms, 0);
  const stops: Record<string, number> = {};
  let walked = 0;
  events.forEach((event) => {
    if (event.kind === "hold") stops[event.nodeId] = (walked + event.ms / 2) / duration;
    walked += event.ms;
  });
  const connectors = nodes.slice(0, -1).map((node, index) => ({
    from: node.exit as WorkflowPoint,
    to: nodes[index + 1].entry as WorkflowPoint,
  }));
  return { nodes, events, duration, stops, connectors };
}

const MACRO_ROUTE = buildMacroRoute();

export function macroNodeGeometry() {
  return MACRO_ROUTE.nodes;
}

export function macroCenterT(id: string) {
  return MACRO_ROUTE.stops[id] ?? 0;
}

export function macroRouteDuration() {
  return MACRO_ROUTE.duration;
}

/** One subpath per connector. Each end sits on a rounded node boundary. */
export function connectorPath() {
  return MACRO_ROUTE.connectors
    .map((segment) => `M ${segment.from.x.toFixed(2)} ${segment.from.y.toFixed(2)} L ${segment.to.x.toFixed(2)} ${segment.to.y.toFixed(2)}`)
    .join(" ");
}

/** Position along the shared forward route. Decreasing t walks the same anchors backward. */
export function macroPose(t: number): MacroPose {
  const time = Math.min(1, Math.max(0, t)) * MACRO_ROUTE.duration;
  let walked = 0;
  for (let index = 0; index < MACRO_ROUTE.events.length; index += 1) {
    const event = MACRO_ROUTE.events[index];
    const last = index === MACRO_ROUTE.events.length - 1;
    if (!last && walked + event.ms < time) {
      walked += event.ms;
      continue;
    }
    if (event.kind === "hold") return { point: event.at, phase: "center", nodeId: event.nodeId };
    const span = event.ms || 1;
    const amount = glide(Math.min(1, Math.max(0, (time - walked) / span)));
    return {
      point: lerpPoint(event.from, event.to, amount),
      phase: event.phase,
      nodeId: event.nodeId,
    };
  }
  const end = MACRO_ROUTE.nodes[MACRO_ROUTE.nodes.length - 1];
  return { point: end.focus, phase: "center", nodeId: end.id };
}

export function cardCenter(stage: WorkflowStage): WorkflowPoint {
  const rect = cardRect(stage);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function macroBounds(): WorldRect {
  const rects = WORKFLOW_STAGES.map(cardRect);
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  const pad = 72;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function frameCamera(viewW: number, viewH: number, rect: WorldRect, fill: number): Camera {
  const scale = Math.min(viewW / rect.w, viewH / rect.h) * fill;
  return {
    scale,
    x: viewW / 2 - (rect.x + rect.w / 2) * scale,
    y: viewH / 2 - (rect.y + rect.h / 2) * scale,
  };
}

export function mixCamera(a: Camera, b: Camera, t: number, view?: { w: number; h: number }): Camera {
  const amount = Math.min(1, Math.max(0, t));
  if (!view || a.scale <= 0 || b.scale <= 0) {
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
      scale: a.scale + (b.scale - a.scale) * amount,
    };
  }
  const scale = a.scale * Math.pow(b.scale / a.scale, amount);
  const ax = (view.w / 2 - a.x) / a.scale;
  const ay = (view.h / 2 - a.y) / a.scale;
  const bx = (view.w / 2 - b.x) / b.scale;
  const by = (view.h / 2 - b.y) / b.scale;
  const x = ax + (bx - ax) * amount;
  const y = ay + (by - ay) * amount;
  return {
    scale,
    x: view.w / 2 - x * scale,
    y: view.h / 2 - y * scale,
  };
}

/** Smootherstep. Soft ease in and out, no bounce or overshoot. */
export function glide(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function catmull(p0: WorkflowPoint, p1: WorkflowPoint, p2: WorkflowPoint, p3: WorkflowPoint, t: number): WorkflowPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function macroSpine() {
  const anchors = WORKFLOW_STAGES.map(cardCenter);
  const sampled: WorkflowPoint[] = [];
  const stopAt: number[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const p0 = anchors[index - 1] ?? anchors[index];
    const p1 = anchors[index];
    const p2 = anchors[index + 1];
    const p3 = anchors[index + 2] ?? p2;
    stopAt.push(sampled.length);
    sampled.push(p1);
    for (let step = 1; step < 10; step += 1) sampled.push(catmull(p0, p1, p2, p3, step / 10));
  }
  stopAt.push(sampled.length);
  sampled.push(anchors[anchors.length - 1]);
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < sampled.length; index += 1) {
    const length = Math.hypot(sampled[index].x - sampled[index - 1].x, sampled[index].y - sampled[index - 1].y);
    lengths.push(length);
    total += length;
  }
  const stops = stopAt.map((sampleIndex) => {
    if (sampleIndex <= 0 || total <= 0) return 0;
    let walked = 0;
    for (let index = 0; index < sampleIndex && index < lengths.length; index += 1) walked += lengths[index];
    return walked / total;
  });
  return { points: sampled, stops, total };
}

export function pointAlong(points: readonly WorkflowPoint[], t: number): WorkflowPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || t <= 0) return points[0];
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return points[0];
  let dist = Math.min(1, Math.max(0, t)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (dist <= lengths[index] || index === lengths.length - 1) {
      const span = lengths[index] || 1;
      const u = Math.min(1, dist / span);
      const from = points[index];
      const to = points[index + 1];
      return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
    }
    dist -= lengths[index];
  }
  return points[points.length - 1];
}

export function spinePath(points: readonly WorkflowPoint[]) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

export function toScreen(point: WorkflowPoint, camera: Camera): WorkflowPoint {
  return { x: camera.x + point.x * camera.scale, y: camera.y + point.y * camera.scale };
}
