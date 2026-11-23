"use client";

import { useEffect, useRef, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import { ARRANGEMENT_FAMILY, ROLE_LABEL } from "@/lib/skill5/architectural-strategy";
import { assessPockets, isParcelRemainder, PARTICIPATE_FT } from "@/lib/skill5/pocket-feasibility";
import { detectPockets } from "@/lib/skill5/pockets";
import type { SiteContext } from "@/lib/skill5/site-model";
import type { NetworkFrame, NetworkIteration, SiteNetworkStudy } from "./site-network";
import type { LayoutEvaluation, NetworkEvaluation } from "@/lib/skill5/strategy-evaluation";
import { FLOW_SURVIVE } from "./site-network-flow";

const SOURCE_RGB: [number, number, number] = [199, 126, 95];
const ATTRACTOR_RGB: [number, number, number] = [73, 215, 222];
const STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;

function thinRibbon(source: Uint8Array, width: number, height: number) {
  const image = source.slice();
  const read = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : image[y * width + x]);
  let changed = true;
  let passes = 0;
  while (changed && passes < 16) {
    changed = false;
    passes += 1;
    for (let pass = 0; pass < 2; pass += 1) {
      const remove: number[] = [];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = y * width + x;
          if (image[index] !== 1) continue;
          const ring = [
            read(x, y - 1),
            read(x + 1, y - 1),
            read(x + 1, y),
            read(x + 1, y + 1),
            read(x, y + 1),
            read(x - 1, y + 1),
            read(x - 1, y),
            read(x - 1, y - 1),
          ];
          const count = ring.reduce((sum, value) => sum + value, 0);
          if (count < 2 || count > 6) continue;
          let turns = 0;
          for (let neighbor = 0; neighbor < 8; neighbor += 1) {
            if (ring[neighbor] === 0 && ring[(neighbor + 1) % 8] === 1) turns += 1;
          }
          if (turns !== 1) continue;
          const [p2, , p4, , p6, , p8] = ring;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          remove.push(index);
        }
      }
      if (remove.length > 0) changed = true;
      for (const index of remove) image[index] = 0;
    }
  }
  return image;
}

function traceRibbons(skeleton: Uint8Array, width: number, height: number, originX: number, originY: number) {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && skeleton[y * width + x] === 1;
  const degree = (x: number, y: number) => STEPS.reduce((sum, [dx, dy]) => sum + (on(x + dx, y + dy) ? 1 : 0), 0);
  const used = new Set<string>();
  const keyOf = (x: number, y: number, nx: number, ny: number) => {
    const left = y * width + x;
    const right = ny * width + nx;
    return left < right ? `${left}|${right}` : `${right}|${left}`;
  };
  const chains: { x: number; y: number }[][] = [];
  const walk = (sx: number, sy: number, nx: number, ny: number) => {
    const chain = [{ x: sx + originX + 0.5, y: sy + originY + 0.5 }];
    let previousX = sx;
    let previousY = sy;
    let x = nx;
    let y = ny;
    used.add(keyOf(sx, sy, nx, ny));
    for (let guard = 0; guard < width * height; guard += 1) {
      chain.push({ x: x + originX + 0.5, y: y + originY + 0.5 });
      if (degree(x, y) !== 2) break;
      let next: readonly [number, number] | null = null;
      for (const step of STEPS) {
        const qx = x + step[0];
        const qy = y + step[1];
        if (!on(qx, qy) || (qx === previousX && qy === previousY) || used.has(keyOf(x, y, qx, qy))) continue;
        next = [qx, qy];
        break;
      }
      if (!next) break;
      used.add(keyOf(x, y, next[0], next[1]));
      previousX = x;
      previousY = y;
      x = next[0];
      y = next[1];
    }
    if (chain.length > 1) chains.push(chain);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!on(x, y) || degree(x, y) === 2) continue;
      for (const [dx, dy] of STEPS) {
        if (on(x + dx, y + dy) && !used.has(keyOf(x, y, x + dx, y + dy))) walk(x, y, x + dx, y + dy);
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!on(x, y)) continue;
      for (const [dx, dy] of STEPS) {
        if (on(x + dx, y + dy) && !used.has(keyOf(x, y, x + dx, y + dy))) walk(x, y, x + dx, y + dy);
      }
    }
  }
  return chains;
}

function chaikin(points: { x: number; y: number }[]) {
  if (points.length < 3) return points;
  const next = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    next.push(
      { x: from.x * 0.75 + to.x * 0.25, y: from.y * 0.75 + to.y * 0.25 },
      { x: from.x * 0.25 + to.x * 0.75, y: from.y * 0.25 + to.y * 0.75 },
    );
  }
  next.push(points[points.length - 1]);
  return next;
}

function falloff(edge0: number, edge1: number, value: number) {
  const span = edge1 - edge0;
  const t = Math.min(1, Math.max(0, span === 0 ? 0 : (value - edge0) / span));
  return t * t * (3 - 2 * t);
}

function simplify(points: { x: number; y: number }[], epsilon: number) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [start, end] = next;
    const from = points[start];
    const to = points[end];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    let furthest = 0;
    let at = -1;
    for (let index = start + 1; index < end; index += 1) {
      const point = points[index];
      const distance = Math.abs((point.x - from.x) * dy - (point.y - from.y) * dx) / length;
      if (distance > furthest) {
        furthest = distance;
        at = index;
      }
    }
    if (at >= 0 && furthest > epsilon) {
      keep[at] = 1;
      stack.push([start, at], [at, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function paintTubes(ctx: CanvasRenderingContext2D, chains: { points: { x: number; y: number }[]; half: number }[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const cover = new Float32Array(width * height);
  for (const chain of chains) {
    const glowHalf = chain.half * 2.6;
    const reach = Math.ceil(glowHalf);
    const step = Math.max(1, glowHalf * 0.35);
    for (let index = 0; index < chain.points.length - 1; index += 1) {
      const from = chain.points[index];
      const to = chain.points[index + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const count = Math.max(1, Math.ceil(length / step));
      for (let sample = 0; sample <= count; sample += 1) {
        const t = sample / count;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const x0 = Math.max(0, Math.floor(x - reach));
        const x1 = Math.min(width - 1, Math.ceil(x + reach));
        const y0 = Math.max(0, Math.floor(y - reach));
        const y1 = Math.min(height - 1, Math.ceil(y + reach));
        for (let py = y0; py <= y1; py += 1) {
          for (let px = x0; px <= x1; px += 1) {
            const distance = Math.hypot(px + 0.5 - x, py + 0.5 - y);
            if (distance > glowHalf) continue;
            const glow = falloff(1, 0, distance / glowHalf) * 0.4;
            const bodyEdge = distance / chain.half;
            const core = bodyEdge >= 1 ? 0 : falloff(0.22, 0, Math.min(1, bodyEdge));
            const sheath = bodyEdge >= 1 ? 0 : falloff(0.55, 0.05, Math.min(1, bodyEdge));
            const alpha = Math.min(1, glow + core * 0.92 + sheath * 0.22);
            const pixel = py * width + px;
            if (alpha <= cover[pixel]) continue;
            cover[pixel] = alpha;
            const write = pixel * 4;
            const byte = Math.round(alpha * 255);
            data[write] = byte;
            data[write + 1] = byte;
            data[write + 2] = byte;
          }
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function pigmentGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: [number, number, number]) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const [red, green, blue] = rgb;
  gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0.95)`);
  gradient.addColorStop(0.18, `rgba(${red}, ${green}, ${blue}, 0.5)`);
  gradient.addColorStop(0.45, `rgba(${red}, ${green}, ${blue}, 0.16)`);
  gradient.addColorStop(0.72, `rgba(${red}, ${green}, ${blue}, 0.04)`);
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function pointOnBranch(x: number, z: number, branch: { x0: number; z0: number; x1: number; z1: number }) {
  const dx = branch.x1 - branch.x0;
  const dz = branch.z1 - branch.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - branch.x0) * dx + (z - branch.z0) * dz) / length));
  return Math.hypot(x - (branch.x0 + dx * t), z - (branch.z0 + dz * t));
}

export type IterationBatch = {
  done: number;
  total: number;
  step: number;
};

function paintPlan(canvas: HTMLCanvasElement, iteration: NetworkIteration, parcel: readonly (readonly [number, number])[]) {
  const cssWidth = Math.max(1, Math.round(canvas.clientWidth));
  const cssHeight = Math.max(1, Math.round(canvas.clientHeight));
  if (cssWidth < 8 || cssHeight < 8) return false;
  const branches = iteration.branches ?? [];
  if (branches.length === 0 || parcel.length < 3) return false;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of parcel) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const pad = 0.08;
  const fitX = spanX * (1 + pad * 2);
  const fitZ = spanZ * (1 + pad * 2);
  const scale = Math.min(width / fitX, height / fitZ);
  const originX = (width - spanX * scale) / 2;
  const originY = (height - spanZ * scale) / 2;
  const map = (x: number, z: number) => ({
    x: originX + (x - minX) * scale,
    y: originY + (maxZ - z) * scale,
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const pockets = detectPockets(branches, parcel).pockets;
  ctx.fillStyle = "rgba(199, 126, 95, 0.28)";
  for (const pocket of pockets) {
    if (pocket.points.length < 3) continue;
    ctx.beginPath();
    pocket.points.forEach((point, index) => {
      const mapped = map(point.x, point.z);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  parcel.forEach(([x, z], index) => {
    const mapped = map(x, z);
    if (index === 0) ctx.moveTo(mapped.x, mapped.y);
    else ctx.lineTo(mapped.x, mapped.y);
  });
  ctx.closePath();
  ctx.strokeStyle = "rgba(73, 215, 222, 0.7)";
  ctx.lineWidth = Math.max(1, pixelRatio);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = Math.max(1.25, Math.min(width, height) * 0.006);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const branch of branches) {
    const start = map(branch.x0, branch.z0);
    const end = map(branch.x1, branch.z1);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  }
  ctx.stroke();
  const mark = Math.max(2.4, Math.min(width, height) * 0.012);
  for (const node of iteration.nodes) {
    const point = map(node.x, node.z);
    ctx.fillStyle = node.kind === "source" ? "rgb(199, 126, 95)" : "rgb(73, 215, 222)";
    ctx.beginPath();
    if (node.kind === "source") {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-mark, -mark, mark * 2, mark * 2);
      ctx.restore();
    } else {
      ctx.arc(point.x, point.y, mark, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return true;
}

function paintIteration(canvas: HTMLCanvasElement, iteration: NetworkIteration, frame: NetworkFrame) {
  const cssWidth = Math.max(1, Math.round(canvas.clientWidth));
  const cssHeight = Math.max(1, Math.round(canvas.clientHeight));
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const field = iteration.inkSize;
  const trails = iteration.trails;
  if (trails.length !== field * field) return;
  let minX = field;
  let minY = field;
  let maxX = 0;
  let maxY = 0;
  let any = false;
  const alive = new Uint8Array(field * field);
  for (let index = 0; index < trails.length; index += 1) {
    if ((trails[index] ?? 0) < FLOW_SURVIVE) continue;
    alive[index] = 1;
    const x = index % field;
    const y = Math.floor(index / field);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    any = true;
  }
  for (const node of iteration.nodes) {
    const x = ((node.x - frame.minX) / frame.width) * field;
    const y = ((node.z - frame.minZ) / frame.depth) * field;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    any = true;
  }
  if (!any) return;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const marginX = spanX * 0.14;
  const marginY = spanY * 0.14;
  minX -= marginX;
  minY -= marginY;
  maxX += marginX;
  maxY += marginY;
  const fitX = Math.max(1, maxX - minX);
  const fitY = Math.max(1, maxY - minY);
  const fit = Math.min(width / fitX, height / fitY);
  const originX = (width - fitX * fit) / 2;
  const originY = (height - fitY * fit) / 2;
  const map = (x: number, y: number) => ({
    x: originX + (x - minX) * fit,
    y: originY + (maxY - y) * fit,
  });
  const startX = Math.max(0, Math.floor(minX));
  const startY = Math.max(0, Math.floor(minY));
  const cropW = Math.max(1, Math.min(field - 1, Math.ceil(maxX)) - startX + 1);
  const cropH = Math.max(1, Math.min(field - 1, Math.ceil(maxY)) - startY + 1);
  const crop = new Uint8Array(cropW * cropH);
  for (let y = 0; y < cropH; y += 1) {
    const sourceY = startY + y;
    if (sourceY < 0 || sourceY >= field) continue;
    for (let x = 0; x < cropW; x += 1) {
      const sourceX = startX + x;
      if (sourceX < 0 || sourceX >= field) continue;
      crop[y * cropW + x] = alive[sourceY * field + sourceX];
    }
  }
  const chains = traceRibbons(thinRibbon(crop, cropW, cropH), cropW, cropH, startX, startY);
  const paths = chains.map((chain) => {
    let tone = 0;
    for (const point of chain) {
      const sampleX = Math.min(field - 1, Math.max(0, Math.floor(point.x)));
      const sampleY = Math.min(field - 1, Math.max(0, Math.floor(point.y)));
      tone += trails[sampleY * field + sampleX] ?? 0;
    }
    tone /= chain.length;
    const strength = Math.min(1, Math.max(0, (tone - FLOW_SURVIVE) / (1.25 - FLOW_SURVIVE)));
    let points = simplify(chain.map((point) => map(point.x, point.y)), 2.4);
    for (let pass = 0; pass < 3; pass += 1) points = chaikin(points);
    const half = Math.max(2.2, Math.min(width, height) * 0.011) * (0.72 + strength ** 1.45 * 0.85);
    return { points, half };
  });
  paintTubes(ctx, paths);
  const mark = Math.max(2.2, Math.min(width, height) * 0.0055);
  for (const node of iteration.nodes) {
    const x = ((node.x - frame.minX) / frame.width) * field;
    const y = ((node.z - frame.minZ) / frame.depth) * field;
    const point = map(x, y);
    const rgb = node.kind === "source" ? SOURCE_RGB : ATTRACTOR_RGB;
    pigmentGlow(ctx, point.x, point.y, mark * 13, rgb);
    ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    ctx.beginPath();
    if (node.kind === "source") {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-mark, -mark, mark * 2, mark * 2);
      ctx.restore();
    } else {
      ctx.arc(point.x, point.y, mark, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function IterationCanvas({
  iteration,
  frame,
  label,
}: {
  iteration: NetworkIteration;
  frame: NetworkFrame;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let painted = "";
    const paint = () => {
      const key = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (key === painted) return;
      const parcel = (context as SiteContext).site.ring;
      if (paintPlan(canvas, iteration, parcel)) {
        painted = key;
        return;
      }
      if (canvas.clientWidth < 8 || canvas.clientHeight < 8) return;
      painted = key;
      paintIteration(canvas, iteration, frame);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [iteration, frame]);
  return <canvas ref={ref} aria-label={label} />;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function metricSummary(evaluation: NetworkEvaluation) {
  return `${evaluation.connectedAttractors}/${evaluation.attractors} · usable ${percent(evaluation.occupation.usableShare)}`;
}

function arrivalState(iteration: NetworkIteration, role: "primary-lobby" | "private-lobby" | "north-lobby") {
  const node = iteration.nodes.find((item) => item.kind === "source" && item.architecture?.role === role);
  if (!node) return "absent";
  const on = (iteration.branches ?? []).some((branch) => pointOnBranch(node.x, node.z, branch) <= PARTICIPATE_FT);
  return on ? "yes" : "no";
}

function cardWarnings(evaluation: NetworkEvaluation, iteration: NetworkIteration) {
  const warnings: string[] = [];
  if (evaluation.status === "unconverged") warnings.push("Step cap");
  if (evaluation.status === "disconnected" || evaluation.status === "failed") warnings.push("Disconnected");
  const remainders = evaluation.pockets.readings.filter((item) => isParcelRemainder(item.areaSqFt, item.spanEastFt, item.spanNorthFt)).length;
  if (remainders > 0) warnings.push("Remainder");
  const arrival = (["primary-lobby", "private-lobby", "north-lobby"] as const).filter((role) => arrivalState(iteration, role) === "no");
  if (arrival.length > 0) warnings.push("Arrival off the network");
  return warnings;
}

function MetricLines({ evaluation, iteration }: { evaluation: NetworkEvaluation; iteration: NetworkIteration }) {
  const warnings = cardWarnings(evaluation, iteration);
  const arrival = (["primary-lobby", "private-lobby", "north-lobby"] as const).map((role) => `${ROLE_LABEL[role].split(" ")[0]} ${arrivalState(iteration, role)}`).join(" · ");
  return (
    <>
      {warnings.length > 0 ? <p className="site-note">{warnings.join(" · ")}</p> : null}
      <p className="site-note">{evaluation.connectedAttractors}/{evaluation.attractors} · {arrival}</p>
      <p className="site-note">Reach {percent(evaluation.reachShare)} · Enclosed {percent(evaluation.occupation.enclosedShare)}</p>
    </>
  );
}

export function SiteNetworkIterations({
  study,
  iterations,
  evaluations,
  layouts,
  viewId,
  massingId,
  compareIds,
  shortlistIds,
  batch,
  generating,
  onGenerate,
  onView,
  onUse,
  onToggleCompare,
  onToggleShortlist,
}: {
  study: SiteNetworkStudy;
  iterations: readonly NetworkIteration[];
  evaluations: readonly NetworkEvaluation[];
  layouts: readonly LayoutEvaluation[];
  viewId: string | null;
  massingId: string | null;
  compareIds: readonly string[];
  shortlistIds: readonly string[];
  batch: IterationBatch | null;
  generating: boolean;
  onGenerate: () => void;
  onView: (id: string | null) => void;
  onUse: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onToggleShortlist: (id: string) => void;
}) {
  const frame: NetworkFrame = study.frame;
  const compared = iterations.filter((item) => compareIds.includes(item.id)).slice(0, 2);
  const showing = iterations.find((item) => item.id === viewId) ?? null;
  const showingEvaluation = evaluations.find((item) => item.id === viewId) ?? null;
  const current = iterations.filter((item) => item.layoutFamily === "strategy");
  const massing = iterations.find((item) => item.id === massingId) ?? null;
  const [sort, setSort] = useState<"connectivity" | "pockets" | "area" | "plans">("connectivity");
  const [fits, setFits] = useState<Record<string, number>>({});
  const measured = useRef<Record<string, number>>({});
  useEffect(() => {
    const site = context as SiteContext;
    const pending = iterations.filter((item) => item.layoutFamily === "strategy" && measured.current[item.id] == null && (item.branches?.length ?? 0) > 0);
    if (pending.length === 0) return;
    let index = 0;
    let cancel = false;
    const step = () => {
      if (cancel) return;
      const item = pending[index];
      index += 1;
      if (!item) return;
      const pockets = detectPockets(item.branches ?? [], site.site.ring);
      const rows = assessPockets(
        pockets.pockets,
        item.nodes.map((node) => ({ kind: node.kind, x: node.x, z: node.z, note: node.strategy?.note ?? null })),
        item.branches ?? [],
      );
      const plans = rows.filter((row) => row.fit === "plausible").length;
      measured.current[item.id] = plans;
      setFits((current) => ({ ...current, [item.id]: plans }));
      if (index < pending.length) window.setTimeout(step, 0);
    };
    const timer = window.setTimeout(step, 0);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [iterations]);
  const order = (runs: NetworkIteration[]) => [...runs].sort((a, b) => {
    const left = evaluations.find((item) => item.id === a.id);
    const right = evaluations.find((item) => item.id === b.id);
    const value = (item: NetworkIteration, evaluation: typeof left) => {
      if (sort === "pockets") return evaluation?.pockets.count ?? 0;
      if (sort === "area") return evaluation?.pockets.areaSqFt ?? 0;
      if (sort === "plans") return fits[item.id] ?? -1;
      return evaluation && evaluation.attractors > 0 ? evaluation.connectedAttractors / evaluation.attractors : 0;
    };
    return value(b, right) - value(a, left);
  });
  const card = (item: NetworkIteration) => {
    const evaluation = evaluations.find((entry) => entry.id === item.id);
    const unsuccessful = evaluation ? evaluation.status !== "connected" : item.total > 0 && item.reached < item.total;
    return (
      <article key={item.id} className="site-iteration-card" data-active={item.id === viewId || undefined} data-massing={item.id === massingId || undefined}>
        <button type="button" aria-pressed={item.id === viewId} title={item.id === massingId ? "Zoning network" : "Preview this network"} onClick={() => onView(item.id)}>
          <IterationCanvas iteration={item} frame={frame} label={`Iteration ${item.index}`} />
          <span className="site-iteration-meta">
            <b>{item.index} · {item.id === massingId ? "Zoning" : item.id === viewId ? "Preview" : "Saved"}</b>
          </span>
          <span className="site-iteration-meta" data-short={unsuccessful || undefined} title={evaluation?.statusNote ?? "Attractors on the surviving network"}>
            <b>Connectivity</b>
            <b>{evaluation ? `${evaluation.connectedAttractors}/${evaluation.attractors}` : `${item.reached}/${item.total}`}</b>
          </span>
          <span className="site-iteration-meta" title="Public, Private, and Experimental Lobby. Y is on the surviving network. N is not. A means that lobby is absent.">
            <b>Arrivals</b>
            <b>{evaluation ? `${arrivalState(item, "primary-lobby").slice(0, 1)} ${arrivalState(item, "private-lobby").slice(0, 1)} ${arrivalState(item, "north-lobby").slice(0, 1)}` : "—"}</b>
          </span>
          <span className="site-iteration-meta">
            <b>Usable</b>
            <b>{evaluation ? percent(evaluation.occupation.usableShare) : "—"}</b>
          </span>
          <span className="site-iteration-meta">
            <b>Distribution</b>
            <b>{evaluation ? `${evaluation.occupation.usableBands.north}/${evaluation.occupation.usableBands.central}/${evaluation.occupation.usableBands.south}` : "—"}</b>
          </span>
          <span className="site-iteration-meta" title="Central gathering distance to the bay.">
            <b>Waterfront</b>
            <b>{(() => { const feet = item.nodes.find((node) => node.architecture?.role === "central-gathering")?.strategy?.waterfrontFeet; return typeof feet === "number" ? `${Math.round(feet)} ft` : "—"; })()}</b>
          </span>
          {evaluation && cardWarnings(evaluation, item).length > 0 ? <span className="site-iteration-meta" data-short="true"><b>{cardWarnings(evaluation, item).join(" · ")}</b></span> : null}
        </button>
        <div className="site-modes">
          <button type="button" disabled={item.id === massingId} onClick={() => onUse(item.id)}>Use for Zoning</button>
          <button type="button" aria-pressed={shortlistIds.includes(item.id)} data-active={shortlistIds.includes(item.id) || undefined} disabled={!shortlistIds.includes(item.id) && shortlistIds.length >= 3} title={shortlistIds.length >= 3 && !shortlistIds.includes(item.id) ? "The shortlist holds three networks." : "Hold this network for Zoning investigation. The active zoning network stays."} onClick={() => onToggleShortlist(item.id)}>Shortlist</button>
          <button type="button" data-active={compareIds.includes(item.id) || undefined} onClick={() => onToggleCompare(item.id)}>Compare</button>
        </div>
      </article>
    );
  };
  return (
    <section className="site-block site-specs" aria-label="Network iterations">
      <h2 className="site-subtitle">Networks {current.length > 0 ? <span>{current.length}</span> : null}</h2>
      <p className="site-note">{massing ? `Zoning ${massing.index}${massing.layoutTitle ? ` · ${massing.layoutTitle}` : ""}` : "No zoning network"}</p>
      <div className="site-modes site-network-controls" role="group" aria-label="Sort">
        {(["connectivity", "pockets", "area", "plans"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={sort === item} data-active={sort === item || undefined} onClick={() => setSort(item)}>{item === "plans" ? "Plans" : item === "pockets" ? "Pockets" : item === "area" ? "Area" : "Connected"}</button>
        ))}
      </div>
      {batch ? <p className="site-note" role="status">{batch.done + 1}/{batch.total} · step {batch.step}</p> : null}
      {showing && showing.id !== massingId ? <p className="site-note">Preview {showing.index}{showing.layoutTitle ? ` · ${showing.layoutTitle}` : ""}</p> : null}
      <div className="site-modes site-network-controls">
        <button type="button" data-active={viewId === null || undefined} onClick={() => onView(null)}>Live</button>
      </div>
      {showing && showingEvaluation && showing.layoutFamily === "strategy" ? (
        <details className="site-network-eval">
          <summary>{metricSummary(showingEvaluation)}</summary>
          <MetricLines evaluation={showingEvaluation} iteration={showing} />
        </details>
      ) : null}
      <div className="site-iteration-scroll">
      {current.length === 0 ? (
        <>
          <p className="site-note">{iterations.length > 0 ? "No Herald arrival networks in this browser." : "None saved."}</p>
          <ul className="site-strategy-nodes">
            {ARRANGEMENT_FAMILY.map((item) => (
              <li key={item.id}><p className="site-strategy-note">{item.title}</p></li>
            ))}
          </ul>
          <button type="button" disabled={generating} onClick={onGenerate}>{generating ? "Generating" : "Generate strategy variations"}</button>
          <p className="site-note">Then shortlist three and use one for Zoning.</p>
        </>
      ) : null}
      {layouts.filter((layout) => layout.family === "strategy").map((layout) => {
        const runs = current.filter((item) => item.layoutId === layout.layoutId);
        if (runs.length === 0) return null;
        return (
          <section key={layout.layoutId} aria-label={layout.title}>
            <h3 className="site-subtitle" title={layout.layoutId}>{ARRANGEMENT_FAMILY.find((item) => item.id === layout.layoutId)?.title ?? layout.title}</h3>
            <div className="site-iteration-grid">
              {order(runs).map(card)}
            </div>
          </section>
        );
      })}
      {compared.length >= 2 ? (
        <div className="site-iteration-compare" aria-label="Compared iterations">
          {compared.map((item) => {
            const evaluation = evaluations.find((entry) => entry.id === item.id);
            return (
              <figure key={item.id}>
                <IterationCanvas iteration={item} frame={frame} label={`Compare iteration ${item.index}`} />
                <figcaption className="site-note">
                  {item.index} · {evaluation?.status ?? `${item.reached}/${item.total}`}
                </figcaption>
                {evaluation ? <p className="site-note">{metricSummary(evaluation)}</p> : null}
              </figure>
            );
          })}
        </div>
      ) : null}
      </div>
    </section>
  );
}
