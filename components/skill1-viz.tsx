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
  densityAmount,
  trailMaskCutoff,
} from "@/lib/skill1/maps";
import { buildSectionModel, type SectionModel } from "@/lib/skill1/section-view";
import type {
  BiologicalTranslation,
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
  options?: { showHud?: boolean; fine?: boolean; density?: number },
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width, height) / FIELD_SIZE;
  const fieldH = FIELD_SIZE * scale;
  const ox = (width - fieldH) / 2;
  const oy = (height - fieldH) / 2;
  const fine = options?.fine !== false;
  const density = options?.density ?? 5;
  ctx.save();
  ctx.translate(ox, oy);
  if (!snapshot) {
    ctx.restore();
    return;
  }
  let peak = 0.0001;
  for (const value of snapshot.trails) if (value > peak) peak = value;
  drawColonyBody(ctx, snapshot, peak, fieldH, fine, density);
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
  const ax = snapshot.attractor.x * scale;
  const ay = toCanvas(snapshot.attractor.y, fieldH, scale);
  ctx.fillStyle = "rgba(199, 126, 95, 0.7)";
  ctx.beginPath();
  ctx.arc(ax, ay, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (options?.showHud) {
    ctx.fillStyle = "rgba(150,184,196,0.8)";
    ctx.font = "500 10px Rajdhani, sans-serif";
    ctx.fillText(`${FIELD_SIZE} × ${FIELD_SIZE} FIELD`, 10, height - 10);
  }
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
      nCache[row + x] = Math.sqrt(Math.max(0, trails[row + x] / peak));
    }
  }
}
function drawColonyBody(
  ctx: CanvasRenderingContext2D,
  snapshot: FieldSnapshot,
  peak: number,
  fieldH: number,
  fine: boolean,
  density: number,
) {
  const cutoff = trailMaskCutoff(density);
  if (drawSlimeFieldGl(ctx, snapshot.trails, snapshot.trailSize, peak, fieldH, cutoff)) return;
  const dpr = ctx.getTransform().a || 1;
  const res = fine
    ? Math.max(1024, Math.min(1536, Math.round(fieldH * Math.max(dpr, 1) * 1.6)))
    : Math.max(160, Math.min(280, Math.round(fieldH)));
  const pack = densityAmount(density);
  let finger = 0;
  const stride = Math.max(1, Math.floor(snapshot.trails.length / 64));
  for (let i = 0; i < snapshot.trails.length; i += stride) finger = (finger + Math.round(snapshot.trails[i] * 1000)) | 0;
  const cacheKey = `${finger}:${snapshot.iteration}:${snapshot.trailSize}:${res}:${peak.toFixed(5)}:${cutoff.toFixed(3)}:trail`;
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
        const tx = fx * TRAIL_SCALE;
        const ty = fy * TRAIL_SCALE;
        const n = bilerp(nField, ts, tx, ty);
        const i = (py * res + px) * 4;
        const floor = Math.max(0.03, cutoff * 0.22);
        if (n < floor) {
          data[i + 3] = 0;
          continue;
        }
        const around =
          (bilerp(nField, ts, tx - 1.4, ty) +
            bilerp(nField, ts, tx + 1.4, ty) +
            bilerp(nField, ts, tx, ty - 1.4) +
            bilerp(nField, ts, tx, ty + 1.4)) *
          0.25;
        const ridge = Math.max(0, n - around);
        const tube = Math.min(1, Math.pow(n, 1.35) * 0.72 + ridge * 4.5);
        const t = Math.min(1, tube * (0.85 + pack * 0.2));
        let r: number;
        let g: number;
        let b: number;
        if (t < 0.28) {
          const u = t / 0.28;
          r = 18 + 70 * u;
          g = 36 + 48 * u;
          b = 22 + 8 * u;
        } else if (t < 0.62) {
          const u = (t - 0.28) / 0.34;
          r = 88 + 130 * u;
          g = 84 + 70 * u;
          b = 30 + 18 * u;
        } else {
          const u = (t - 0.62) / 0.38;
          r = 218 + 37 * u;
          g = 154 + 90 * u;
          b = 48 + 160 * u;
        }
        data[i] = Math.round(r);
        data[i + 1] = Math.round(g);
        data[i + 2] = Math.round(b);
        data[i + 3] = Math.round(Math.min(1, (n - floor) / 0.06) * 255);
      }
    }
    off.putImageData(image, 0, 0);
    if (fine) fineCacheKey = cacheKey;
    else coarseCacheKey = cacheKey;
  }
  ctx.imageSmoothingEnabled = res > fieldH * dpr * 1.05;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, 0, 0, fieldH, fieldH);
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
}: {
  snapshot: FieldSnapshot | null;
  density?: number;
  showHud?: boolean;
}) {
  const ref = useCanvas(
    (ctx, width, height) =>
      drawPlanField(ctx, snapshot, width, height, { showHud, fine: true, density }),
    [snapshot, snapshot?.iteration, snapshot?.paths, density, showHud],
  );
  return (
    <div className="skill1-plan-view relative h-full w-full">
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
