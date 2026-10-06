"use client";
import { useEffect, useMemo, useRef } from "react";
import { sampleField } from "@/lib/skill1/engine";
import { drawSlimeFieldGl } from "@/lib/render/slime-field-gl";
import {
  DISPLAY_LEVELS,
  FIELD_SIZE,
  SECTION_HEIGHT,
  SNAPSHOT_ITERATIONS,
  TRAIL_SCALE,
  trailMaskCutoff,
} from "@/lib/skill1/maps";
import { buildSectionModel, type SectionModel } from "@/lib/skill1/section-view";
import type {
  BiologicalTranslation,
  FieldAttractor,
  FieldSnapshot,
} from "@/lib/skill1/types";
const PLAN_LABELS: Record<number, string> = {
  0: "Agents explore the field",
  100: "Agents respond to attractor",
  250: "Trails begin to form",
  400: "Network strengthens",
  600: "Emergent spatial organization",
};
function toCanvas(y: number, height: number, scale: number) {
  return height - y * scale;
}
function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const render = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height);
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(parent);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
export function drawPlanField(
  ctx: CanvasRenderingContext2D,
  snapshot: FieldSnapshot | null,
  width: number,
  height: number,
  options?: { showHud?: boolean; fine?: boolean; density?: number; attractors?: FieldAttractor[]; showAttractors?: boolean; selectedIndex?: number; selectedIndices?: number[] },
) {
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) / FIELD_SIZE;
  const fieldW = width;
  const fieldH = height;
  const ox = 0;
  const oy = 0;
  const fine = options?.fine !== false;
  const density = options?.density ?? 5;
  ctx.save();
  ctx.translate(ox, oy);
  if (snapshot) {
    let peak = 0.0001;
    for (const value of snapshot.trails) if (value > peak) peak = value;
    const colorMarks =
      options?.attractors?.length
        ? options.attractors
        : [{ kind: "point" as const, x: snapshot.attractor.x, y: snapshot.attractor.y, radius: 1.6 }];
    drawColonyBody(ctx, snapshot, peak, fieldW, fieldH, fine, density, colorMarks);
    const sx = snapshot.source.x * scale;
    const sy = toCanvas(snapshot.source.y, fieldH, scale);
    ctx.strokeStyle = "rgba(15, 115, 119, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(15, 115, 119, 0.28)";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const marks = options?.attractors;
  if (options?.showAttractors !== false) {
  if (marks?.length) {
    const unit = Math.min(fieldW, fieldH) / FIELD_SIZE;
    const at = (x: number, y: number) => ({
      px: (x / FIELD_SIZE) * fieldW,
      py: fieldH - (y / FIELD_SIZE) * fieldH,
    });
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 1.25;
    marks.forEach((item, index) => {
      const selected = options?.selectedIndices?.includes(index) || options?.selectedIndex === index;
      const center = at(item.x, item.y);
      const ringRadius = item.kind === "ring"
        ? Math.max(2, (item.radius ?? 4) * unit)
        : Math.max(2, (item.radius ?? 1.6) * unit);
      if (selected) {
        const gradient = ctx.createLinearGradient(center.px - ringRadius, center.py, center.px + ringRadius, center.py);
        gradient.addColorStop(0, "#0f7377");
        gradient.addColorStop(0.52, "#8faaa8");
        gradient.addColorStop(1, "#c77e5f");
        ctx.strokeStyle = gradient;
        ctx.fillStyle = gradient;
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = "#ffffff";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 1.25;
      }
      if (item.kind === "line" || item.kind === "curve") {
        const end = at(item.x2 ?? item.x + 3, item.y2 ?? item.y);
        ctx.beginPath();
        ctx.moveTo(center.px, center.py);
        if (item.kind === "curve") {
          const bend = at(item.cx ?? (item.x + (item.x2 ?? item.x + 3)) / 2, item.cy ?? (item.y + (item.y2 ?? item.y)) / 2 + 1.6);
          ctx.quadraticCurveTo(bend.px, bend.py, end.px, end.py);
        } else {
          ctx.lineTo(end.px, end.py);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(center.px, center.py, 2.2, 0, Math.PI * 2);
        ctx.arc(end.px, end.py, 2.2, 0, Math.PI * 2);
        if (item.kind === "curve") {
          const bend = at(item.cx ?? (item.x + (item.x2 ?? item.x + 3)) / 2, item.cy ?? (item.y + (item.y2 ?? item.y)) / 2 + 1.6);
          ctx.moveTo(bend.px + 3.2, bend.py);
          ctx.arc(bend.px, bend.py, 3.2, 0, Math.PI * 2);
        }
        ctx.fill();
      } else if (item.kind === "ring") {
        ctx.beginPath();
        ctx.arc(center.px, center.py, Math.max(2, (item.radius ?? 4) * unit), 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(center.px, center.py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const radius = Math.max(2, (item.radius ?? 1.6) * unit);
        ctx.beginPath();
        ctx.arc(center.px, center.py, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(center.px, center.py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  } else if (snapshot) {
    const ax = snapshot.attractor.x * scale;
    const ay = toCanvas(snapshot.attractor.y, fieldH, scale);
    ctx.fillStyle = "rgba(199, 126, 95, 0.7)";
    ctx.beginPath();
    ctx.arc(ax, ay, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  }
  ctx.restore();
  if (options?.showHud) {
    ctx.fillStyle = "rgba(150,184,196,0.8)";
    ctx.font = "500 10px Rajdhani, sans-serif";
    ctx.fillText(`${FIELD_SIZE} × ${FIELD_SIZE} FIELD`, 10, height - 10);
  }
}

export function renderPlanImage(
  snapshot: FieldSnapshot,
  size = 4096,
  options?: {
    attractors?: FieldAttractor[];
    density?: number;
    type?: "image/png";
  },
) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  drawPlanField(ctx, snapshot, size, size, {
    showHud: false,
    fine: true,
    density: options?.density ?? 5,
    attractors: options?.attractors,
    showAttractors: false,
  });
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function downloadDataUrl(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

export function downloadPlanPng(
  snapshot: FieldSnapshot,
  filename: string,
  options?: { attractors?: FieldAttractor[]; density?: number },
) {
  const href = renderPlanImage(snapshot, 4096, options);
  if (href) downloadDataUrl(href, filename);
}

/** @deprecated Use downloadPlanPng. Kept so existing callers compile during the switch. */
export function downloadPlanJpeg(
  snapshot: FieldSnapshot,
  filename: string,
  options?: { attractors?: FieldAttractor[]; density?: number },
) {
  downloadPlanPng(snapshot, filename.replace(/\.jpe?g$/i, ".png"), options);
}
function bilerp(field: Float32Array, ts: number, x: number, y: number) {
  const x0 = Math.max(0, Math.min(ts - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(ts - 1, Math.floor(y)));
  const x1 = Math.min(ts - 1, x0 + 1);
  const y1 = Math.min(ts - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = field[y0 * ts + x0];
  const b = field[y0 * ts + x1];
  const c = field[y1 * ts + x0];
  const d = field[y1 * ts + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}
let fineScratch: HTMLCanvasElement | null = null;
let coarseScratch: HTMLCanvasElement | null = null;
let fineCacheKey = "";
let coarseCacheKey = "";
let nCache: Float32Array | null = null;
function fillTrailCaches(trails: number[], ts: number, peak: number) {
  const count = ts * ts;
  if (!nCache || nCache.length !== count) {
    nCache = new Float32Array(count);
  }
  for (let y = 0; y < ts; y += 1) {
    const row = y * ts;
    for (let x = 0; x < ts; x += 1) {
      nCache[row + x] = Math.pow(Math.max(0, trails[row + x] / peak), 0.82);
    }
  }
}
function drawColonyBody(
  ctx: CanvasRenderingContext2D,
  snapshot: FieldSnapshot,
  peak: number,
  fieldW: number,
  fieldH: number,
  fine: boolean,
  density: number,
  attractors?: FieldAttractor[],
) {
  const cutoff = trailMaskCutoff(density);
  if (drawSlimeFieldGl(ctx, snapshot.trails, snapshot.trailSize, peak, fieldW, fieldH, cutoff, attractors)) return;
  const dpr = ctx.getTransform().a || 1;
  const res = fine
    ? Math.max(4096, Math.min(8192, Math.round(fieldH * Math.max(dpr, 1) * 2)))
    : Math.max(160, Math.min(280, Math.round(fieldH)));
  let finger = 0;
  const stride = Math.max(1, Math.floor(snapshot.trails.length / 64));
  for (let i = 0; i < snapshot.trails.length; i += stride) finger = (finger + Math.round(snapshot.trails[i] * 1000)) | 0;
  const cacheKey = `${finger}:${snapshot.iteration}:${snapshot.trailSize}:${res}:${peak.toFixed(5)}:${cutoff.toFixed(3)}:vessel:${attractors?.length ?? 0}`;
  let scratch = fine ? fineScratch : coarseScratch;
  if (!scratch) {
    scratch = document.createElement("canvas");
    if (fine) fineScratch = scratch;
    else coarseScratch = scratch;
  }
  if (scratch.width !== res || scratch.height !== res) {
    scratch.width = res;
    scratch.height = res;
    if (fine) fineCacheKey = "";
    else coarseCacheKey = "";
  }
  const hit = fine ? fineCacheKey === cacheKey : coarseCacheKey === cacheKey;
  if (!hit) {
    const off = scratch.getContext("2d");
    if (!off) return;
    const image = off.createImageData(res, res);
    const data = image.data;
    const ts = snapshot.trailSize;
    fillTrailCaches(snapshot.trails, ts, peak);
    const nField = nCache;
    if (!nField) return;
    const last = res - 1;
    for (let py = 0; py < res; py += 1) {
      const fy = (1 - py / last) * FIELD_SIZE;
      for (let px = 0; px < res; px += 1) {
        const fx = (px / last) * FIELD_SIZE;
        const scale = ts / FIELD_SIZE;
        const tx = fx * scale;
        const ty = fy * scale;
        const v = bilerp(nField, ts, tx, ty);
        const e = bilerp(nField, ts, tx + 1, ty);
        const w = bilerp(nField, ts, tx - 1, ty);
        const n = bilerp(nField, ts, tx, ty + 1);
        const s = bilerp(nField, ts, tx, ty - 1);
        const around = 0.25 * (e + w + n + s);
        const ridge = Math.max(0, v - around * 0.62);
        const gx = e - w;
        const gy = n - s;
        const glen = Math.hypot(gx, gy);
        const ax = glen > 1e-6 ? -gy / glen : 1;
        const ay = glen > 1e-6 ? gx / glen : 0;
        let tissue = v;
        if (v > 0.04 || ridge > 0.005) {
          let linked = v;
          for (let k = 1; k <= 6; k += 1) {
            linked = Math.max(
              linked,
              bilerp(nField, ts, tx + ax * k * 1.6, ty + ay * k * 1.6),
              bilerp(nField, ts, tx - ax * k * 1.6, ty - ay * k * 1.6),
            );
          }
          tissue = Math.max(v, linked * 0.96);
        }
        const membrane = Math.min(1, Math.max(0, (tissue - 0.14) / 0.14));
        const tube = Math.min(1, Math.max(0, (tissue - 0.045) / 0.075)) * Math.min(1, Math.max(0, (ridge - 0.004) / 0.012));
        const hair = Math.min(1, Math.max(0, (tissue - 0.018) / 0.022)) * Math.min(1, Math.max(0, (ridge - 0.008) / 0.012));
        const mask = Math.max(membrane, tube, hair);
        if (mask < 0.03) {
          const empty = (py * res + px) * 4;
          data[empty + 3] = 255;
          continue;
        }
        const body = Math.min(1, tissue);
        const alpha = mask;
        const vein = Math.min(1, Math.max(0, (body - 0.08) / 0.26));
        let pull = 0;
        if (attractors?.length) {
          let nearest = 1;
          for (const mark of attractors) {
            const dx = fx / FIELD_SIZE - mark.x / FIELD_SIZE;
            const dy = fy / FIELD_SIZE - mark.y / FIELD_SIZE;
            let d = Math.hypot(dx, dy);
            if (mark.kind === "ring") d = Math.abs(d - (mark.radius ?? 4) / FIELD_SIZE);
            nearest = Math.min(nearest, d);
          }
          pull = nearest >= 0.16 ? 0 : 1 - nearest / 0.16;
        }
        const core = Math.max(
          pull * Math.min(1, Math.max(0, (body - 0.08) / 0.24)),
          Math.min(1, Math.max(0, (body - 0.48) / 0.34)),
        );
        const mixCore = core * (0.35 + body * 0.37);
        const r = ((1 * (1 - vein) + 0.78 * vein) * (1 - mixCore) + 0.059 * mixCore) * alpha;
        const g = ((1 * (1 - vein) + 0.494 * vein) * (1 - mixCore) + 0.451 * mixCore) * alpha;
        const b = ((1 * (1 - vein) + 0.373 * vein) * (1 - mixCore) + 0.467 * mixCore) * alpha;
        const i = (py * res + px) * 4;
        data[i] = Math.round(Math.min(1, r) * 255);
        data[i + 1] = Math.round(Math.min(1, g) * 255);
        data[i + 2] = Math.round(Math.min(1, b) * 255);
        data[i + 3] = 255;
      }
    }
    off.putImageData(image, 0, 0);
    if (fine) fineCacheKey = cacheKey;
    else coarseCacheKey = cacheKey;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, 0, 0, fieldW, fieldH);
}
type Projector = (x: number, y: number, z: number) => { px: number; py: number };
function makeProjector(
  width: number,
  height: number,
  size: number,
  levels: number,
): { project: Projector; originX: number; originY: number; sx: number; sy: number; sz: number } {
  const padL = 58;
  const padB = 36;
  const padR = 18;
  const padT = 12;
  const usableW = width - padL - padR;
  const usableH = height - padT - padB;
  const sx = usableW / (size + size * 0.42);
  const sy = sx * 0.4;
  const sz = Math.min(sx * 0.92, (usableH * 0.78) / levels);
  const originX = padL;
  const originY = height - padB;
  const project: Projector = (x, y, z) => ({
    px: originX + x * sx + y * sy,
    py: originY - z * sz - y * sy * 0.52,
  });
  return { project, originX, originY, sx, sy, sz };
}
function drawGroundGrid(
  ctx: CanvasRenderingContext2D,
  project: Projector,
  size: number,
) {
  ctx.strokeStyle = "rgba(90, 130, 150, 0.32)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 2) {
    const a = project(i, 0, 0);
    const b = project(i, size, 0);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    const c = project(0, i, 0);
    const d = project(size, i, 0);
    ctx.beginPath();
    ctx.moveTo(c.px, c.py);
    ctx.lineTo(d.px, d.py);
    ctx.stroke();
  }
  const outline = [project(0, 0, 0), project(size, 0, 0), project(size, size, 0), project(0, size, 0)];
  ctx.strokeStyle = "rgba(120, 170, 190, 0.28)";
  ctx.beginPath();
  ctx.moveTo(outline[0].px, outline[0].py);
  for (const p of outline.slice(1)) ctx.lineTo(p.px, p.py);
  ctx.closePath();
  ctx.stroke();
}
function drawLevelLabels(
  ctx: CanvasRenderingContext2D,
  project: Projector,
  height: number,
) {
  ctx.fillStyle = "rgba(150, 184, 196, 0.85)";
  ctx.font = "500 9px Rajdhani, sans-serif";
  ctx.textAlign = "right";
  for (let level = 0; level < DISPLAY_LEVELS; level += 1) {
    const z = (level / (DISPLAY_LEVELS - 1)) * (height - 0.2);
    const p = project(-0.8, 0, z);
    const caption =
      level === 0 ? "LEVEL 0  (ground)" : level === DISPLAY_LEVELS - 1 ? "LEVEL 5  (top)" : `LEVEL ${level}`;
    ctx.fillText(caption, p.px - 8, p.py + 3);
    ctx.strokeStyle = "rgba(90, 130, 150, 0.2)";
    ctx.beginPath();
    ctx.moveTo(p.px - 4, p.py);
    ctx.lineTo(p.px + 10, p.py);
    ctx.stroke();
  }
  ctx.textAlign = "left";
}
function drawBox(
  ctx: CanvasRenderingContext2D,
  project: Projector,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  fill: string,
  stroke?: string,
) {
  const p000 = project(x, y, z);
  const p100 = project(x + w, y, z);
  const p010 = project(x, y + d, z);
  const p110 = project(x + w, y + d, z);
  const p001 = project(x, y, z + h);
  const p101 = project(x + w, y, z + h);
  const p011 = project(x, y + d, z + h);
  const p111 = project(x + w, y + d, z + h);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(p001.px, p001.py);
  ctx.lineTo(p101.px, p101.py);
  ctx.lineTo(p111.px, p111.py);
  ctx.lineTo(p011.px, p011.py);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.globalAlpha = 0.78;
  ctx.beginPath();
  ctx.moveTo(p000.px, p000.py);
  ctx.lineTo(p100.px, p100.py);
  ctx.lineTo(p101.px, p101.py);
  ctx.lineTo(p001.px, p001.py);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(p100.px, p100.py);
  ctx.lineTo(p110.px, p110.py);
  ctx.lineTo(p111.px, p111.py);
  ctx.lineTo(p101.px, p101.py);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p001.px, p001.py);
    ctx.lineTo(p101.px, p101.py);
    ctx.lineTo(p111.px, p111.py);
    ctx.lineTo(p011.px, p011.py);
    ctx.closePath();
    ctx.stroke();
  }
}
function drawEmergentSection(
  ctx: CanvasRenderingContext2D,
  model: SectionModel | null,
  snapshot: FieldSnapshot | null,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#070d14";
  ctx.fillRect(0, 0, width, height);
  const size = snapshot?.size ?? FIELD_SIZE;
  const { project } = makeProjector(width, height, size, SECTION_HEIGHT);
  drawGroundGrid(ctx, project, size);
  drawLevelLabels(ctx, project, SECTION_HEIGHT);
  if (!model || !snapshot) {
    ctx.fillStyle = "rgba(126,160,173,0.7)";
    ctx.font = "500 11px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("EMPTY FIELD — GENERATE TO EMIT AGENTS", width / 2, 22);
    ctx.textAlign = "left";
    return;
  }
  const voxels: Array<{ x: number; y: number; z: number; v: number }> = [];
  for (let y = 0; y < model.size; y += 1) {
    for (let x = 0; x < model.size; x += 1) {
      for (let z = 0; z < model.height; z += 1) {
        const v = model.mass[(z * model.size + y) * model.size + x];
        if (v < 0.28) continue;
        voxels.push({ x, y, z, v });
      }
    }
  }
  voxels.sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z);
  const maxVoxels = 420;
  const stride = Math.max(1, Math.ceil(voxels.length / maxVoxels));
  for (let i = 0; i < voxels.length; i += stride) {
    const voxel = voxels[i];
    if (voxel.z % 2 !== 0) continue;
    const shade = Math.round(10 + voxel.v * 18);
    drawBox(
      ctx,
      project,
      voxel.x,
      voxel.y,
      voxel.z,
      1,
      1,
      0.18,
      `rgba(${shade}, ${shade + 2}, ${shade + 6}, 0.42)`,
      "rgba(80,110,120,0.08)",
    );
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const edge of model.edges) {
    const a = model.nodes[edge.a];
    const b = model.nodes[edge.b];
    const pa = project(a.x, a.y, a.z);
    const pb = project(b.x, b.y, b.z);
    const w = 0.6 + edge.strength * 2.1;
    ctx.strokeStyle =
      edge.strength > 0.42
        ? `rgba(255, 224, 90, ${0.28 + edge.strength * 0.55})`
        : `rgba(150, 190, 70, ${0.16 + edge.strength * 0.4})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pa.px, pa.py);
    ctx.lineTo(pb.px, pb.py);
    ctx.stroke();
  }
  for (const node of model.nodes) {
    if (node.strength < 0.18) continue;
    const p = project(node.x, node.y, node.z);
    const r = 1.1 + node.strength * 2.4;
    ctx.fillStyle =
      node.strength > 0.4 ? "rgba(255, 232, 120, 0.95)" : "rgba(210, 220, 90, 0.7)";
    ctx.beginPath();
    ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const agentStep = snapshot.agents.length > 700 ? 4 : 2;
  ctx.fillStyle = "rgba(255, 236, 150, 0.8)";
  for (let i = 0; i < snapshot.agents.length; i += agentStep) {
    const agent = snapshot.agents[i];
    const z = 0.25 + (agent.y / size) * 5.6 * Math.min(1, snapshot.iteration / 280);
    const p = project(agent.x, agent.y, z);
    ctx.fillRect(p.px - 0.7, p.py - 0.7, 1.5, 1.5);
  }
  ctx.globalCompositeOperation = "source-over";
  const src = project(snapshot.source.x, snapshot.source.y, 0.35);
  ctx.strokeStyle = "rgba(120, 230, 255, 0.95)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(src.px, src.py, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(120, 230, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(src.px, src.py, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(150,184,196,0.75)";
  ctx.font = "500 10px Rajdhani, sans-serif";
  ctx.fillText(`${FIELD_SIZE} × ${FIELD_SIZE} × ${SECTION_HEIGHT} FIELD`, 58, height - 12);
}
function shadeRgb(base: [number, number, number], light: number) {
  const t = 0.38 + light * 0.62;
  return [
    Math.round(base[0] * t),
    Math.round(base[1] * t),
    Math.round(base[2] * t),
  ] as const;
}
function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  scale: number,
) {
  ctx.fillStyle = "rgba(210, 214, 218, 0.9)";
  ctx.beginPath();
  ctx.arc(x, groundY - scale * 0.72, scale * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - scale * 0.07, groundY - scale * 0.62, scale * 0.14, scale * 0.62);
}
function drawArchitectureSection(
  ctx: CanvasRenderingContext2D,
  model: SectionModel | null,
  snapshot: FieldSnapshot | null,
  translation: BiologicalTranslation,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0d10";
  ctx.fillRect(0, 0, width, height);
  if (!model || !snapshot) {
    ctx.fillStyle = "rgba(126,160,173,0.7)";
    ctx.font = "500 11px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GENERATE TO INTERPRET THE NETWORK AS MASS AND VOID", width / 2, height / 2);
    ctx.textAlign = "left";
    return;
  }
  const image = ctx.createImageData(width, height);
  const around = model.aroundAbsence;
  const peak = Math.max(0.0001, snapshot.trails.reduce((m, v) => Math.max(m, v), 0));
  const occPeak = Math.max(
    0.0001,
    snapshot.occupancy.reduce((m, v) => Math.max(m, v), 0),
  );
  const keep = translation.recipe.isolationRadius * (around ? 0.62 : 1.45);
  const volume =
    translation.recipe.isolationRadius + translation.recipe.enclosureCollar * 0.9;
  const step = width > 420 ? 2 : 1;
  for (let py = 0; py < height; py += step) {
    for (let px = 0; px < width; px += step) {
      const fx = (px / width) * model.size;
      const fz = (1 - py / height) * model.height;
      const ix = clampInt(fx, model.size - 1);
      const dx = fx - snapshot.attractor.x;
      const nx = dx / (keep * (around ? 1.2 : 0.95));
      const nz = (fz - (around ? 5.1 : 4.6)) / (around ? 3.6 : 2.8);
      const blob =
        nx * nx +
        nz * nz * (around ? 0.85 : 1) +
        0.12 * Math.sin(fx * 2.2 + fz * 0.4) +
        0.08 * Math.cos(fz * 1.7 + fx);
      const trail = sampleField(
        snapshot.trails,
        { x: fx * TRAIL_SCALE, y: snapshot.attractor.y * TRAIL_SCALE },
        snapshot.trailSize,
      );
      const n = Math.sqrt(trail / peak);
      let plan = 0;
      for (let y = 0; y < model.size; y += 1) {
        const occ = (snapshot.occupancy[y * model.size + ix] ?? 0) / occPeak;
        const w = Math.exp(-((y - snapshot.attractor.y) ** 2) / 18);
        plan = Math.max(plan, occ * (0.45 + w));
      }
      const floor = Math.abs(fz % 2) < 0.28 || fz < 0.45;
      const inCore = blob < 1;
      const inVolume = Math.abs(dx) < volume * (1.05 + n * 0.18) || plan > 0.14;
      const satellite =
        around && !inCore && n < 0.11 && plan < 0.16 && Math.abs(dx) > keep + 1.1 && fz > 2 && fz < 8.4 && blob < 2.6;
      let r = 10;
      let g = 11;
      let b = 13;
      if (inCore || satellite) {
        const glow = around ? 0.05 + n * 0.04 : 0.22 + n * 0.35;
        if (around) {
          r = Math.round(6 + glow * 24);
          g = Math.round(6 + glow * 22);
          b = Math.round(8 + glow * 20);
        } else {
          r = Math.round(62 + glow * 150);
          g = Math.round(34 + glow * 80);
          b = Math.round(18 + glow * 36);
        }
      } else if (inVolume && (floor || n > 0.16 || plan > 0.12)) {
        const light = 0.5 + (1 - py / height) * 0.32 + n * 0.14;
        if (around) {
          const tone = shadeRgb([218, 216, 210], light);
          r = tone[0];
          g = tone[1];
          b = tone[2];
        } else {
          const tone = shadeRgb([176, 118, 78], light);
          r = tone[0];
          g = tone[1];
          b = tone[2];
        }
      } else if (floor && inVolume) {
        r = around ? 168 : 132;
        g = around ? 166 : 92;
        b = around ? 160 : 62;
      }
      for (let oy = 0; oy < step; oy += 1) {
        for (let ox = 0; ox < step; ox += 1) {
          const nx = px + ox;
          const ny = py + oy;
          if (nx >= width || ny >= height) continue;
          const i = (ny * width + nx) * 4;
          image.data[i] = r;
          image.data[i + 1] = g;
          image.data[i + 2] = b;
          image.data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.fillStyle = around ? "rgba(232,232,228,0.18)" : "rgba(255,186,112,0.16)";
  const ground = height - 8;
  ctx.fillRect(0, ground, width, 8);
  const personScale = height * 0.08;
  drawPerson(ctx, width * 0.16, ground, personScale);
  drawPerson(ctx, width * 0.82, ground, personScale);
  ctx.fillStyle = "rgba(150,184,196,0.7)";
  ctx.font = "500 10px Rajdhani, sans-serif";
  ctx.fillText(translation.archetypeName.toUpperCase(), 12, 18);
}
function clampInt(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}
function drawLongitudinal(
  ctx: CanvasRenderingContext2D,
  model: SectionModel | null,
  snapshot: FieldSnapshot | null,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050910";
  ctx.fillRect(0, 0, width, height);
  if (!snapshot) return;
  const scaleX = width / FIELD_SIZE;
  const scaleZ = height / SECTION_HEIGHT;
  ctx.strokeStyle = "rgba(90, 130, 150, 0.12)";
  for (let x = 0; x <= FIELD_SIZE; x += 2) {
    ctx.beginPath();
    ctx.moveTo(x * scaleX, 0);
    ctx.lineTo(x * scaleX, height);
    ctx.stroke();
  }
  if (model) {
    ctx.globalCompositeOperation = "lighter";
    for (const edge of model.edges) {
      const a = model.nodes[edge.a];
      const b = model.nodes[edge.b];
      ctx.strokeStyle =
        edge.strength > 0.4
          ? `rgba(255, 224, 90, ${0.22 + edge.strength * 0.5})`
          : `rgba(140, 180, 70, ${0.12 + edge.strength * 0.35})`;
      ctx.lineWidth = 0.8 + edge.strength * 1.8;
      ctx.beginPath();
      ctx.moveTo(a.x * scaleX, height - a.z * scaleZ);
      ctx.lineTo(b.x * scaleX, height - b.z * scaleZ);
      ctx.stroke();
    }
    for (const node of model.nodes) {
      ctx.fillStyle = "rgba(255, 228, 110, 0.85)";
      ctx.beginPath();
      ctx.arc(node.x * scaleX, height - node.z * scaleZ, 1.1 + node.strength * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  const src = snapshot.source;
  ctx.strokeStyle = "rgba(120, 230, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(src.x * scaleX, height - 4, 4, 0, Math.PI * 2);
  ctx.stroke();
}
export function Skill1Timeline({
  snapshots,
  currentIteration,
  compact = false,
  density = 5,
}: {
  snapshots: Partial<Record<number, FieldSnapshot>>;
  currentIteration: number;
  compact?: boolean;
  density?: number;
}) {
  return (
    <div className="skill1-timeline grid grid-cols-5 gap-1.5">
      {SNAPSHOT_ITERATIONS.map((mark) => (
        <TimelineFrame
          key={mark}
          mark={mark}
          snapshot={snapshots[mark] ?? null}
          active={currentIteration >= mark}
          compact={compact}
          density={density}
        />
      ))}
    </div>
  );
}
function TimelineFrame({
  mark,
  snapshot,
  active,
  compact = false,
  density = 5,
}: {
  mark: number;
  snapshot: FieldSnapshot | null;
  active: boolean;
  compact?: boolean;
  density?: number;
}) {
  const ref = useCanvas(
    (ctx, width, height) =>
      drawPlanField(ctx, snapshot, width, height, { fine: false, density }),
    [snapshot, snapshot?.iteration, density],
  );
  return (
    <figure
      className={`skill1-timeline-frame min-w-0 overflow-hidden border bg-[#000000] ${
        active ? "border-[rgba(199,126,95,0.5)]" : "border-[rgba(242,242,238,0.18)]"
      }`}
    >
      <figcaption className="skill1-timeline-caption flex items-baseline justify-between gap-2 px-1.5 pt-1">
        <span className="skill1-timeline-label text-[0.52rem] uppercase tracking-[0.14em] text-[var(--soft)]">
          Iteration {mark}
        </span>
      </figcaption>
      {compact ? null : (
        <p className="skill1-timeline-description px-1.5 pb-1 text-[0.5rem] uppercase tracking-[0.08em] text-[var(--muted)]">
          {PLAN_LABELS[mark]}
        </p>
      )}
      <div className={`skill1-timeline-canvas relative w-full ${compact ? "aspect-[6/5]" : "aspect-[5/4]"}`}>
        <canvas ref={ref} className="h-full w-full" role="img" aria-label={`Iteration ${mark} field`} />
      </div>
    </figure>
  );
}
export function Skill1PlanView({
  snapshot,
  density = 5,
  showHud = true,
  attractors,
  showAttractors = true,
  selectedIndices = [0],
  onAttractorsChange,
  onAttractorsCommit,
  onSelectAttractor,
}: {
  snapshot: FieldSnapshot | null;
  density?: number;
  showHud?: boolean;
  attractors?: FieldAttractor[];
  showAttractors?: boolean;
  selectedIndices?: number[];
  onAttractorsChange?: (next: FieldAttractor[]) => void;
  onAttractorsCommit?: () => void;
  onSelectAttractor?: (index: number, shift: boolean) => void;
}) {
  const ref = useCanvas(
    (ctx, width, height) =>
      drawPlanField(ctx, snapshot, width, height, { showHud, fine: true, density, attractors, showAttractors, selectedIndices }),
    [snapshot, snapshot?.iteration, snapshot?.paths, density, showHud, attractors, showAttractors, selectedIndices],
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; mode: "move" | "resize" | "end" | "bend" } | null>(null);
  const marksRef = useRef(attractors);
  const changeRef = useRef(onAttractorsChange);
  const commitRef = useRef(onAttractorsCommit);
  const selectRef = useRef(onSelectAttractor);
  marksRef.current = attractors;
  changeRef.current = onAttractorsChange;
  commitRef.current = onAttractorsCommit;
  selectRef.current = onSelectAttractor;
  const toField = (event: PointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD_SIZE,
      y: (1 - (event.clientY - rect.top) / rect.height) * FIELD_SIZE,
    };
  };
  const distToSeg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const den = dx * dx + dy * dy;
    const t = den > 0.000001 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / den)) : 0;
    return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
  };
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !showAttractors) return;
    const marks = () => marksRef.current ?? [];
    const clamp = (value: number) => Math.min(FIELD_SIZE - 0.4, Math.max(0.4, value));
    const hit = (x: number, y: number) => {
      let best: { index: number; mode: "move" | "resize" | "end" | "bend" } | null = null;
      let bestScore = 1.2;
      const items = marks();
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const center = Math.hypot(x - item.x, y - item.y);
        if (item.kind === "ring" || item.kind === "point") {
          const radius = item.radius ?? (item.kind === "ring" ? 4 : 1.6);
          const edge = Math.abs(center - radius);
          if (edge < 0.4 && center > radius * 0.82 && edge < bestScore) {
            best = { index, mode: "resize" };
            bestScore = edge;
            continue;
          }
          if (center <= radius + 0.5 && Math.min(center, 0.4) < bestScore) {
            best = { index, mode: "move" };
            bestScore = Math.min(center, 0.4);
          }
          continue;
        }
        const x2 = item.x2 ?? item.x + 3;
        const y2 = item.y2 ?? item.y;
        const end = Math.hypot(x - x2, y - y2);
        if (end < 0.75 && end < bestScore) {
          best = { index, mode: "end" };
          bestScore = end;
        }
        if (item.kind === "curve") {
          const cx = item.cx ?? (item.x + x2) / 2;
          const cy = item.cy ?? (item.y + y2) / 2 + 1.6;
          const bend = Math.hypot(x - cx, y - cy);
          if (bend < 0.75 && bend < bestScore) {
            best = { index, mode: "bend" };
            bestScore = bend;
          }
        }
        if (center < 0.75 && center < bestScore) {
          best = { index, mode: "move" };
          bestScore = center;
        }
        const along = distToSeg(x, y, item.x, item.y, x2, y2);
        if (along < 0.55 && along < bestScore) {
          best = { index, mode: "move" };
          bestScore = along;
        }
      }
      return best;
    };
    const down = (event: PointerEvent) => {
      if (!changeRef.current) return;
      const point = toField(event);
      const found = hit(point.x, point.y);
      if (!found) return;
      if (event.shiftKey) {
        selectRef.current?.(found.index, true);
        event.preventDefault();
        return;
      }
      selectRef.current?.(found.index, false);
      dragRef.current = found;
      box.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const change = changeRef.current;
      if (!drag || !change) return;
      const point = toField(event);
      const next = marks().map((item, index) => {
        if (index !== drag.index) return item;
        if (drag.mode === "resize") {
          return { ...item, radius: Math.min(8, Math.max(0.35, Math.hypot(point.x - item.x, point.y - item.y))) };
        }
        if (drag.mode === "end") {
          return { ...item, x2: clamp(point.x), y2: clamp(point.y) };
        }
        if (drag.mode === "bend") {
          return { ...item, cx: clamp(point.x), cy: clamp(point.y) };
        }
        if (item.kind === "line" || item.kind === "curve") {
          const dx = clamp(point.x) - item.x;
          const dy = clamp(point.y) - item.y;
          const x2 = item.x2 ?? item.x + 3;
          const y2 = item.y2 ?? item.y;
          return {
            ...item,
            x: clamp(point.x),
            y: clamp(point.y),
            x2: clamp(x2 + dx),
            y2: clamp(y2 + dy),
            cx: item.kind === "curve" ? clamp((item.cx ?? (item.x + x2) / 2) + dx) : item.cx,
            cy: item.kind === "curve" ? clamp((item.cy ?? (item.y + y2) / 2 + 1.6) + dy) : item.cy,
          };
        }
        return { ...item, x: clamp(point.x), y: clamp(point.y) };
      });
      change(next);
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      commitRef.current?.();
    };
    const hover = (event: PointerEvent) => {
      if (dragRef.current) {
        box.style.cursor = "grabbing";
        return;
      }
      const point = toField(event);
      const found = hit(point.x, point.y);
      box.style.cursor = found ? (found.mode === "resize" ? "nwse-resize" : "grab") : "default";
    };
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointermove", hover);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("pointerleave", () => {
      if (!dragRef.current) box.style.cursor = "default";
    });
    return () => {
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointermove", hover);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      box.style.cursor = "default";
    };
  }, [showAttractors]);
  return (
    <div ref={boxRef} className="skill1-plan-view relative h-full w-full touch-none">
      <canvas
        ref={ref}
        className="skill1-plan-canvas h-full w-full"
        role="img"
        aria-label="2D Physarum agent field"
      />
      {!snapshot ? (
        <p className="skill1-plan-empty-caption pointer-events-none absolute inset-x-0 top-3 text-center text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
          Empty field — generate to emit agents
        </p>
      ) : null}
    </div>
  );
}
export function Skill1SectionView({
  snapshot,
  translation,
  model: givenModel,
}: {
  snapshot: FieldSnapshot | null;
  translation?: BiologicalTranslation | null;
  model?: SectionModel | null;
}) {
  const model = useMemo(
    () => givenModel ?? (snapshot && translation ? buildSectionModel(snapshot, translation) : null),
    [givenModel, snapshot, translation],
  );
  const ref = useCanvas(
    (ctx, width, height) => drawEmergentSection(ctx, model, snapshot, width, height),
    [model, snapshot, snapshot?.iteration],
  );
  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      role="img"
      aria-label="Section view of the emergent field"
    />
  );
}
export function Skill1ArchitectureSection({
  snapshot,
  translation,
  model: givenModel,
}: {
  snapshot: FieldSnapshot | null;
  translation: BiologicalTranslation;
  model?: SectionModel | null;
}) {
  const model = useMemo(
    () => givenModel ?? buildSectionModel(snapshot, translation),
    [givenModel, snapshot, translation],
  );
  const ref = useCanvas(
    (ctx, width, height) =>
      drawArchitectureSection(ctx, model, snapshot, translation, width, height),
    [model, snapshot, snapshot?.iteration, translation.archetypeId],
  );
  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      role="img"
      aria-label="Architectural section interpreted from the network"
    />
  );
}
export function Skill1Longitudinal({
  snapshot,
  translation,
  model: givenModel,
}: {
  snapshot: FieldSnapshot | null;
  translation: BiologicalTranslation;
  model?: SectionModel | null;
}) {
  const model = useMemo(
    () => givenModel ?? buildSectionModel(snapshot, translation),
    [givenModel, snapshot, translation],
  );
  const ref = useCanvas(
    (ctx, width, height) => drawLongitudinal(ctx, model, snapshot, width, height),
    [model, snapshot, snapshot?.iteration],
  );
  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      role="img"
      aria-label="Longitudinal section of the emergent network"
    />
  );
}
