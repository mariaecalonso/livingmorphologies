/**
 * Homepage Overall Workflow sequence.
 * Macro is a fitted summary. Detail is one full-frame board.
 * Future team SVGs use WORKFLOW_BOARD and replace `detailAsset`.
 */

import { LAB_ENTRY, labWorkspace } from "@/lib/site-map";

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

export const WORKFLOW_CARD = { w: 0.132, h: 0.28, radius: 110 };

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

/** A little slower than the first pass. Trail time uses the same pace so the streak stays the same length. */
const LIGHT_PACE = 1.2;
const MACRO_CYCLE = 16000 * LIGHT_PACE;
/** Overview camera fit. The main light uses this so its screen speed matches steps 03–06. */
export const OVERVIEW_FILL = 0.92;
export const WORKFLOW_CYCLE_MS = MACRO_CYCLE;
/** Steps 01 and 02 only. Tail time uses the same pace so their streak stays the same length. */
const TRACK_PACE = 1.18;
export const WORKFLOW_TRACK_DUR = `${28 * LIGHT_PACE * TRACK_PACE}s`;
export const WORKFLOW_TRACK_TAIL = TRACK_PACE;

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

/** Local dot route inside a board, 0–1 of the artboard. Left to right, alternating high and low. */
export const WORKFLOW_BOARD_STOPS: readonly WorkflowPoint[] = [
  { x: 0.12, y: 0.62 },
  { x: 0.3, y: 0.46 },
  { x: 0.48, y: 0.64 },
  { x: 0.66, y: 0.48 },
  { x: 0.86, y: 0.6 },
];

const BOARD_STOP_Y = [0.62, 0.46, 0.64, 0.48, 0.6] as const;

/** Same alternating path, spaced for the number of phase cards. */
export function workflowBoardStops(count: number): readonly WorkflowPoint[] {
  if (count === WORKFLOW_BOARD_STOPS.length) return WORKFLOW_BOARD_STOPS;
  const span = 0.74;
  const start = 0.13;
  const stops = Array.from({ length: count }, (_, index) => ({
    x: count === 1 ? 0.5 : start + (span * index) / (count - 1),
    y: BOARD_STOP_Y[index % BOARD_STOP_Y.length],
  }));
  if (count === 6) stops[5].y = stops[3].y;
  return stops;
}

export const WORKFLOW_STAGES: readonly WorkflowStage[] = [
  {
    id: "decomposition",
    label: "Typology Analysis",
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
    label: labWorkspace("physarum").label,
    order: 3,
    anchor: { x: 0.408, y: 0.62 },
    detailAsset: null, // /assets/skill1/workflow.svg
    previous: "generative-system",
    next: "skill-2",
    tone: "teal",
  },
  {
    id: "skill-2",
    label: labWorkspace("optimization").label,
    order: 4,
    anchor: { x: 0.572, y: 0.4 },
    detailAsset: null, // /assets/skill2/workflow.svg
    previous: "skill-1",
    next: "skill-3",
    tone: "teal",
  },
  {
    id: "skill-3",
    label: labWorkspace("vertical").label,
    order: 5,
    anchor: { x: 0.736, y: 0.6 },
    detailAsset: null, // /assets/skill3/workflow.svg
    previous: "skill-2",
    next: "recombination",
    tone: "copper",
  },
  {
    id: "recombination",
    label: labWorkspace("hybrid").label,
    order: 6,
    anchor: { x: 0.9, y: 0.44 },
    detailAsset: null, // /assets/skill0/recombination.svg
    previous: "skill-3",
    next: null,
    tone: "copper",
    lab: [{ href: LAB_ENTRY.href, label: LAB_ENTRY.label }],
  },
];

export function workflowStage(id: string) {
  return WORKFLOW_STAGES.find((stage) => stage.id === id) ?? null;
}

function cardHeight(stage: WorkflowStage) {
  const base = WORKFLOW_CARD.h * WORKFLOW_WORLD.height;
  if (stage.label.length > 22) return base * 1.85;
  if (stage.label.length > 13) return base * 1.58;
  return base;
}

export function cardRect(stage: WorkflowStage): WorldRect {
  const w = WORKFLOW_CARD.w * WORKFLOW_WORLD.width;
  const h = cardHeight(stage);
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
  const radius = WORKFLOW_CARD.radius;
  const centers = WORKFLOW_STAGES.map(cardCenter);
  return WORKFLOW_STAGES.map((stage, index) => {
    const rect = cardRect(stage);
    const center = centers[index];
    const previous = centers[index - 1];
    const next = centers[index + 1];
    const entry = previous ? boundaryPoint(previous, center, rect.w, rect.h, radius) : null;
    const exit = next ? boundaryPoint(next, center, rect.w, rect.h, radius) : null;
    return {
      id: stage.id,
      center,
      width: rect.w,
      height: rect.h,
      radius,
      entrySide: entry ? boundarySide(entry, center, rect.w, rect.h) : null,
      exitSide: exit ? boundarySide(exit, center, rect.w, rect.h) : null,
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
  phase: "connector" | "frame";
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
  phase: "connector" | "frame" | "center";
  nodeId: string | null;
};

function clampedRadius(width: number, height: number, radius: number) {
  return Math.min(radius, width / 2, height / 2);
}

function perimeterMetrics(width: number, height: number, radius: number) {
  const rx = clampedRadius(width, height, radius);
  const straightW = Math.max(0, width - 2 * rx);
  const straightH = Math.max(0, height - 2 * rx);
  const arc = (Math.PI / 2) * rx;
  return { rx, straightW, straightH, arc, length: 2 * straightW + 2 * straightH + 4 * arc };
}

/** Clockwise from the start of the top edge. Distance wraps. */
function pointOnPerimeter(distance: number, center: WorkflowPoint, width: number, height: number, radius: number): WorkflowPoint {
  const { rx, straightW, straightH, arc, length } = perimeterMetrics(width, height, radius);
  let d = length > 0 ? ((distance % length) + length) % length : 0;
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  const right = left + width;
  const bottom = top + height;
  const at = (angle: number, cx: number, cy: number) => ({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * rx });
  if (d <= straightW) return { x: left + rx + d, y: top };
  d -= straightW;
  if (d <= arc) return at(-Math.PI / 2 + (arc > 0 ? (d / arc) * (Math.PI / 2) : 0), right - rx, top + rx);
  d -= arc;
  if (d <= straightH) return { x: right, y: top + rx + d };
  d -= straightH;
  if (d <= arc) return at((arc > 0 ? (d / arc) * (Math.PI / 2) : 0), right - rx, bottom - rx);
  d -= arc;
  if (d <= straightW) return { x: right - rx - d, y: bottom };
  d -= straightW;
  if (d <= arc) return at(Math.PI / 2 + (arc > 0 ? (d / arc) * (Math.PI / 2) : 0), left + rx, bottom - rx);
  d -= arc;
  if (d <= straightH) return { x: left, y: bottom - rx - d };
  d -= straightH;
  return at(Math.PI + (arc > 0 ? (d / arc) * (Math.PI / 2) : 0), left + rx, top + rx);
}

function wrapAngle(angle: number) {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}

function closestOnArc(point: WorkflowPoint, cx: number, cy: number, radius: number, start: number, sweep: number) {
  const raw = Math.atan2(point.y - cy, point.x - cx);
  let delta = wrapAngle(raw - start);
  if (delta > sweep) {
    const pastEnd = delta - sweep;
    const beforeStart = Math.PI * 2 - delta;
    delta = pastEnd < beforeStart ? sweep : 0;
  }
  const angle = start + delta;
  return { point: { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }, delta };
}

/** Arc length of the closest point on the rounded outline. */
function perimeterOffset(point: WorkflowPoint, center: WorkflowPoint, width: number, height: number, radius: number) {
  const { rx, straightW, straightH, arc } = perimeterMetrics(width, height, radius);
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  const right = left + width;
  const bottom = top + height;
  const candidates: { point: WorkflowPoint; offset: number }[] = [];
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const topX = clamp(point.x, left + rx, right - rx);
  candidates.push({ point: { x: topX, y: top }, offset: topX - (left + rx) });
  const rightY = clamp(point.y, top + rx, bottom - rx);
  candidates.push({ point: { x: right, y: rightY }, offset: straightW + arc + (rightY - (top + rx)) });
  const bottomX = clamp(point.x, left + rx, right - rx);
  candidates.push({ point: { x: bottomX, y: bottom }, offset: straightW + arc + straightH + arc + (right - rx - bottomX) });
  const leftY = clamp(point.y, top + rx, bottom - rx);
  candidates.push({ point: { x: left, y: leftY }, offset: straightW + arc + straightH + arc + straightW + arc + (bottom - rx - leftY) });
  if (rx > 0) {
    const corners = [
      { cx: right - rx, cy: top + rx, start: -Math.PI / 2, base: straightW },
      { cx: right - rx, cy: bottom - rx, start: 0, base: straightW + arc + straightH },
      { cx: left + rx, cy: bottom - rx, start: Math.PI / 2, base: straightW + arc + straightH + arc + straightW },
      { cx: left + rx, cy: top + rx, start: Math.PI, base: straightW + arc + straightH + arc + straightW + arc + straightH },
    ];
    corners.forEach((corner) => {
      const hit = closestOnArc(point, corner.cx, corner.cy, rx, corner.start, Math.PI / 2);
      candidates.push({ point: hit.point, offset: corner.base + (hit.delta / (Math.PI / 2)) * arc });
    });
  }
  let best = candidates[0];
  let bestDistance = pointDistance(point, best.point);
  candidates.slice(1).forEach((candidate) => {
    const distance = pointDistance(point, candidate.point);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best.offset;
}

function snapToPerimeter(point: WorkflowPoint, center: WorkflowPoint, width: number, height: number, radius: number) {
  return pointOnPerimeter(perimeterOffset(point, center, width, height, radius), center, width, height, radius);
}

/** Shorter outline from `from` to `to`. A tie follows the incoming direction. */
function frameOutline(from: WorkflowPoint, to: WorkflowPoint, center: WorkflowPoint, width: number, height: number, radius: number, incoming: WorkflowPoint | null) {
  const { length } = perimeterMetrics(width, height, radius);
  const start = perimeterOffset(from, center, width, height, radius);
  const end = perimeterOffset(to, center, width, height, radius);
  const clockwise = (end - start + length) % length;
  const counter = (start - end + length) % length;
  let forward = clockwise <= counter + 0.01;
  if (incoming && Math.abs(clockwise - counter) < 1) {
    const step = 6;
    const ahead = pointOnPerimeter(start + step, center, width, height, radius);
    const behind = pointOnPerimeter(start - step, center, width, height, radius);
    const vx = from.x - incoming.x;
    const vy = from.y - incoming.y;
    const withClockwise = (ahead.x - from.x) * vx + (ahead.y - from.y) * vy;
    const withCounter = (behind.x - from.x) * vx + (behind.y - from.y) * vy;
    forward = withClockwise >= withCounter;
  }
  const span = forward ? clockwise : counter;
  // Overview frames keep a 24px step. Smaller frames need a shorter step or the light cuts each corner.
  const chord = Math.min(24, Math.max(1.5, radius * 0.22));
  const steps = Math.max(1, Math.ceil(span / chord));
  const points: WorkflowPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const distance = forward ? start + (span * index) / steps : start - (span * index) / steps;
    points.push(pointOnPerimeter(distance, center, width, height, radius));
  }
  points[0] = pointOnPerimeter(start, center, width, height, radius);
  points[points.length - 1] = pointOnPerimeter(end, center, width, height, radius);
  return points;
}

function outlineLegs(points: WorkflowPoint[], nodeId: string): Array<Omit<RouteMove, "kind" | "ms">> {
  const legs: Array<Omit<RouteMove, "kind" | "ms">> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (pointDistance(points[index], points[index + 1]) < 0.01) continue;
    legs.push({ from: points[index], to: points[index + 1], phase: "frame", nodeId });
  }
  return legs;
}

export type FrameNode = {
  id: string;
  center: WorkflowPoint;
  width: number;
  height: number;
  radius: number;
};

/** Teal-to-copper link and the traveling light. Overview and steps 03–06 share these. */
export const WORKFLOW_LINK = { from: "#0f7377", to: "#c77e5f" };

const LIGHT_STEPS = 24;
const LIGHT_TAIL_MS = 620 * LIGHT_PACE;

function lightSamples(steps: number) {
  const trailMs: number[] = [];
  const radii: number[] = [];
  const opacity: number[] = [];
  for (let index = 0; index < steps; index += 1) {
    const t = index / (steps - 1);
    trailMs.push(Math.round((1 - t) * LIGHT_TAIL_MS));
    radii.push(Number((1.25 + (3.15 - 1.25) * Math.pow(t, 0.8)).toFixed(2)));
    opacity.push(Number((0.58 * Math.pow(t, 1.65)).toFixed(3)));
  }
  trailMs[steps - 1] = 0;
  radii[steps - 1] = 3.15;
  opacity[steps - 1] = 0.58;
  return { trailMs, radii, opacity };
}

const LIGHT_SAMPLES = lightSamples(LIGHT_STEPS);

/** One shared streak. More samples keep the tail a fade instead of separate dots. */
export const WORKFLOW_LIGHT = {
  blur: 2.4,
  trailMs: LIGHT_SAMPLES.trailMs,
  radii: LIGHT_SAMPLES.radii,
  opacity: LIGHT_SAMPLES.opacity,
};

/** Corner size that matches the overview frames for a box of this size. */
export function frameRadius(width: number, height: number) {
  const base = Math.min(WORKFLOW_CARD.w * WORKFLOW_WORLD.width, WORKFLOW_CARD.h * WORKFLOW_WORLD.height);
  return Math.min(width, height) * (WORKFLOW_CARD.radius / base);
}

export type FrameRoute = {
  events: RouteEvent[];
  duration: number;
  stops: Record<string, number>;
  connectors: { from: WorkflowPoint; to: WorkflowPoint }[];
  path: string;
  pose: (t: number) => MacroPose;
};

/** Same connector-then-outline route the overview light walks. */
export function frameRoute(frames: readonly FrameNode[], cycle = MACRO_CYCLE): FrameRoute {
  const nodes = frames.map((frame, index) => {
    const previous = frames[index - 1]?.center;
    const next = frames[index + 1]?.center;
    const entry = previous ? snapToPerimeter(boundaryPoint(previous, frame.center, frame.width, frame.height, frame.radius), frame.center, frame.width, frame.height, frame.radius) : null;
    const exit = next ? snapToPerimeter(boundaryPoint(next, frame.center, frame.width, frame.height, frame.radius), frame.center, frame.width, frame.height, frame.radius) : null;
    return { ...frame, entry, exit };
  });
  const legs: Array<Omit<RouteMove, "kind" | "ms">> = [];
  const frameSpans: { id: string; from: number; to: number }[] = [];
  const opposite = (point: WorkflowPoint, node: (typeof nodes)[number]) => {
    const { length } = perimeterMetrics(node.width, node.height, node.radius);
    return pointOnPerimeter(perimeterOffset(point, node.center, node.width, node.height, node.radius) + length / 2, node.center, node.width, node.height, node.radius);
  };
  nodes.forEach((node, index) => {
    const previous = nodes[index - 1];
    const arrival = node.entry ?? opposite(node.exit as WorkflowPoint, node);
    const departure = node.exit ?? opposite(node.entry as WorkflowPoint, node);
    const incoming = previous?.exit ?? null;
    const from = legs.length;
    legs.push(...outlineLegs(frameOutline(arrival, departure, node.center, node.width, node.height, node.radius, incoming), node.id));
    frameSpans.push({ id: node.id, from, to: legs.length });
    const next = nodes[index + 1];
    if (next?.entry) legs.push({ from: departure, to: next.entry, phase: "connector", nodeId: null });
  });
  const travel = legs.reduce((sum, leg) => sum + pointDistance(leg.from, leg.to), 0);
  const speed = travel / cycle;
  const events: RouteEvent[] = legs.map((leg) => ({ kind: "move", ms: pointDistance(leg.from, leg.to) / Math.max(speed, 0.0001), ...leg }));
  const duration = events.reduce((sum, event) => sum + event.ms, 0) || 1;
  const stops: Record<string, number> = {};
  frameSpans.forEach((span) => {
    let walked = 0;
    for (let index = 0; index < span.from; index += 1) walked += events[index].ms;
    let across = 0;
    for (let index = span.from; index < span.to; index += 1) across += events[index].ms;
    stops[span.id] = (walked + across / 2) / duration;
  });
  const connectors = nodes.slice(0, -1).map((node, index) => ({
    from: node.exit as WorkflowPoint,
    to: nodes[index + 1].entry as WorkflowPoint,
  }));
  const path = connectors
    .map((segment) => `M ${segment.from.x.toFixed(2)} ${segment.from.y.toFixed(2)} L ${segment.to.x.toFixed(2)} ${segment.to.y.toFixed(2)}`)
    .join(" ");
  const pose = (t: number): MacroPose => {
    const time = Math.min(1, Math.max(0, t)) * duration;
    let walked = 0;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const last = index === events.length - 1;
      if (!last && walked + event.ms < time) {
        walked += event.ms;
        continue;
      }
      if (event.kind === "hold") return { point: event.at, phase: "center", nodeId: event.nodeId };
      const span = event.ms || 1;
      const amount = Math.min(1, Math.max(0, (time - walked) / span));
      return { point: lerpPoint(event.from, event.to, amount), phase: event.phase, nodeId: event.nodeId };
    }
    const end = nodes[nodes.length - 1];
    return { point: end?.center ?? { x: 0, y: 0 }, phase: "center", nodeId: end?.id ?? null };
  };
  return { events, duration, stops, connectors, path, pose };
}

function routeLength(route: FrameRoute) {
  return route.events.reduce((sum, event) => {
    if (event.kind !== "move") return sum;
    return sum + Math.hypot(event.to.x - event.from.x, event.to.y - event.from.y);
  }, 0);
}

/** Step boards inside the stage. Matches `.wf-board` and its frames. */
function stepBoardSize(viewW: number, viewH: number) {
  const aspect = WORKFLOW_BOARD.width / WORKFLOW_BOARD.height;
  if (viewW / viewH > aspect) return { w: viewH * aspect, h: viewH };
  return { w: viewW, h: viewW / aspect };
}

function stepFrames(width: number, height: number): FrameNode[] {
  const frameWidth = width * 0.074;
  const frameHeight = frameWidth / 1.7;
  return WORKFLOW_BOARD_STOPS.map((stop, index) => ({
    id: String(index),
    center: { x: stop.x * width, y: stop.y * height },
    width: frameWidth,
    height: frameHeight,
    radius: frameRadius(frameWidth, frameHeight),
  }));
}

/** Cycle that gives the overview light the same screen speed as steps 03–06. */
function overviewCycle(frames: FrameNode[]) {
  const view = { w: 1000, h: 1000 };
  const scale = frameCamera(view.w, view.h, macroBounds(), OVERVIEW_FILL).scale;
  const board = stepBoardSize(view.w, view.h);
  const overviewScreen = routeLength(frameRoute(frames)) * scale;
  const boardScreen = routeLength(frameRoute(stepFrames(board.w, board.h)));
  return MACRO_CYCLE * (overviewScreen / Math.max(boardScreen, 1));
}

function buildMacroRoute() {
  const nodes = macroNodes();
  const frames = nodes.map((node) => ({
    id: node.id,
    center: node.center,
    width: node.width,
    height: node.height,
    radius: node.radius,
  }));
  const route = frameRoute(frames, overviewCycle(frames));
  return { nodes, ...route };
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
  return MACRO_ROUTE.path;
}

/** Position along the shared forward route. Decreasing t walks the same anchors backward. */
export function macroPose(t: number): MacroPose {
  return MACRO_ROUTE.pose(t);
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
