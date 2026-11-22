"use client";

import { ramp, useExplainFrame } from "@/components/demo-workflow/explain-clock";
import styles from "@/components/demo-workflow/moo-combined.module.css";

const DURATION = 96;
const PLAY = 80.4;
const EXPAND_AT = 10;
const EXPAND_END = 12.4;
const ARCHETYPE = "vertical-void";
const EVAL_IDS = [43, 77, 83, 91, 99] as const;

const CYAN = "#49d7de";
const COPPER = "#c77e5f";
const PAPER = "rgba(242,242,238,0.92)";
const DIM = "rgba(242,242,238,0.46)";
const NEUTRAL = "rgba(242,242,238,0.34)";
const SCORE = { formal: COPPER, spatial: PAPER, atmospheric: CYAN } as const;
const NAV = ["Alternatives", "Evaluation", "Dominance", "Generations", "Results"] as const;
const METHOD = ["Define", "Generate", "Evaluate", "Compare", "Preserve", "Repeat"] as const;

const F0 = 0.55;
const SPAN = 0.45;
const FIELD = { left: 48, top: 70, width: 1664, height: 336 };
const TRACK = { left: 150, width: 1550, top: 86, bottom: 404 };
const WHAT = { x: 28, y: 28, w: 500, h: 440 };
const HOW = { x: 548, y: 28, w: 560, h: 440 };
const RUNNING = { x: 1128, y: 28, w: 604, h: 440 };
const FULL = { x: 16, y: 12, w: 1728, h: 472 };

type Row = {
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  pareto: boolean;
  diversity: string;
  parentId: number | null;
  image: HTMLImageElement | null;
};

type Rect = { x: number; y: number; w: number; h: number };
type Border = "neutral" | "cyan" | "copper" | "both";
type Point = { x: number; y: number; z: number };

let started = false;
let status: "loading" | "ready" | "missing" = "loading";
let rows: Row[] = [];
let evaluations = 0;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function ensure() {
  if (started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    try {
      const catalog = await fetch("/demo/skill2/catalog.json").then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ archetypes: { archetypeId: string; populationSize?: number; candidates: Row[] }[] }>;
      });
      const archetype = catalog.archetypes.find((item) => item.archetypeId === ARCHETYPE);
      if (!archetype) throw new Error("missing vertical void");
      evaluations = archetype.populationSize ?? 0;
      rows = await Promise.all(archetype.candidates.map(async (candidate) => {
        const row: Row = {
          id: candidate.id,
          generation: candidate.generation,
          formal: candidate.formal,
          spatial: candidate.spatial,
          atmospheric: candidate.atmospheric,
          pareto: Boolean(candidate.pareto),
          diversity: candidate.diversity || "none",
          parentId: candidate.parentId ?? null,
          image: null,
        };
        const source = (candidate as Row & { image?: string }).image;
        if (!source) return row;
        row.image = await new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = source;
        });
        return row;
      }));
      status = "ready";
    } catch {
      status = "missing";
    }
  })();
}

function byGeneration(generation: number) {
  return rows.filter((row) => row.generation === generation).sort((a, b) => a.id - b.id);
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 12, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.letterSpacing = "0.12em";
  ctx.fillText(value.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

function glass(ctx: CanvasRenderingContext2D, rect: Rect, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 16);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();
  ctx.strokeStyle = "rgba(242,242,238,0.72)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function mixRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

function borderOf(row: Row, active: boolean): Border {
  if (!active) return "neutral";
  const diverse = row.diversity === "tag" || row.diversity === "rescue";
  if (row.pareto && diverse) return "both";
  if (row.pareto) return "cyan";
  if (diverse) return "copper";
  return "neutral";
}

function plate(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, size: number, alpha: number, border: Border, emphasis = 0, origin = false) {
  if (alpha <= 0.02 || size < 2) return;
  const radius = Math.min(7, size * 0.1);
  const left = x - size / 2;
  const top = y - size / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, radius);
  ctx.fillStyle = "rgba(8,8,8,0.78)";
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (image) ctx.drawImage(image, left, top, size, size);
  ctx.restore();
  if (origin) {
    ctx.beginPath();
    ctx.roundRect(left - 3, top - 3, size + 6, size + 6, radius + 2);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(242,242,238,0.72)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, radius);
  ctx.lineWidth = border === "neutral" ? 1 : 1.35;
  ctx.strokeStyle = border === "cyan" || border === "both" ? CYAN : border === "copper" ? COPPER : NEUTRAL;
  if (emphasis > 0.08) {
    ctx.shadowColor = "rgba(242,242,238,0.28)";
    ctx.shadowBlur = 7 * emphasis;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (border === "both") {
    ctx.beginPath();
    ctx.roundRect(left + 3, top + 3, size - 6, size - 6, Math.max(2, radius - 2));
    ctx.strokeStyle = COPPER;
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }
  ctx.restore();
}

function fieldMetrics() {
  const label = 13;
  const size = (8 * FIELD.height - 16 * label - FIELD.width) / 7;
  const gap = FIELD.height - 2 * label - 2 * size;
  return { size, gap, label };
}

function openingSlot(index: number, count: number): [number, number, number] {
  const { size, gap, label } = fieldMetrics();
  const row = index < 9 ? 0 : 1;
  const column = row === 0 ? index : index - 9;
  const columns = row === 0 ? 9 : Math.max(1, count - 9);
  const rowWidth = columns * size + (columns - 1) * gap;
  const x = FIELD.left + (FIELD.width - rowWidth) / 2 + size / 2 + column * (size + gap);
  const y = FIELD.top + row * (size + label + gap) + label + size / 2;
  return [x, y, size];
}

function evalLayout() {
  const size = 148;
  const gap = (FIELD.width - 5 * size) / 4;
  return { size, gap, y: FIELD.top + 78 };
}

function evalSlot(index: number): [number, number] {
  const { size, gap, y } = evalLayout();
  return [FIELD.left + size / 2 + index * (size + gap), y];
}

function bandLayout(generation: number) {
  const band = byGeneration(generation);
  const longest = Math.max(1, ...[1, 2, 3, 4].map((item) => byGeneration(item).length));
  const gap = 7;
  const size = (TRACK.width - (longest - 1) * gap) / longest;
  const rowWidth = band.length * size + Math.max(0, band.length - 1) * gap;
  const left = TRACK.left + (TRACK.width - rowWidth) / 2;
  const y = TRACK.top + (generation - 0.5) * ((TRACK.bottom - TRACK.top) / 4);
  return { band, gap, size, left, y };
}

function bandSlot(row: Row): [number, number, number] {
  const layout = bandLayout(row.generation);
  const index = Math.max(0, layout.band.findIndex((item) => item.id === row.id));
  return [layout.left + layout.size / 2 + index * (layout.size + layout.gap), layout.y, layout.size];
}

function project(formal: number, spatial: number, atmospheric: number, yaw: number): Point {
  const x = (formal - F0) / SPAN - 0.5;
  const y = (spatial - F0) / SPAN - 0.5;
  const z = (atmospheric - F0) / SPAN - 0.5;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const xr = x * c - z * s;
  let zr = x * s + z * c;
  const pitch = -0.42;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const yr = y * cp - zr * sp;
  zr = y * sp + zr * cp;
  const depth = 3.1 + zr;
  const p = 2.4 / depth;
  return { x: 980 + xr * 520 * p, y: 230 - yr * 220 * p, z: zr };
}

function axisTip(axis: "formal" | "spatial" | "atmospheric", yaw: number) {
  const score = { formal: F0, spatial: F0, atmospheric: F0, [axis]: 1 };
  return project(score.formal, score.spatial, score.atmospheric, yaw);
}

function drawWhat(ctx: CanvasRenderingContext2D) {
  glass(ctx, WHAT);
  text(ctx, "General", WHAT.x + 22, WHAT.y + 28, DIM, 11);
  text(ctx, "What is MOO?", WHAT.x + 22, WHAT.y + 52, CYAN, 16);
  const cx = WHAT.x + 118;
  const cy = WHAT.y + 168;
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx - 28, cy - 16, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PAPER;
  ctx.beginPath();
  ctx.arc(cx + 28, cy - 16, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = CYAN;
  ctx.beginPath();
  ctx.arc(cx, cy + 28, 42, 0, Math.PI * 2);
  ctx.stroke();
  text(ctx, "Formal", cx - 86, cy - 62, COPPER, 12);
  text(ctx, "Spatial", cx + 36, cy - 62, PAPER, 12);
  text(ctx, "Atmospheric", cx - 48, cy + 86, CYAN, 12);
  const column = WHAT.x + 250;
  text(ctx, "Objectives can conflict", column, WHAT.y + 148, PAPER, 13);
  text(ctx, "Many alternatives remain", column, WHAT.y + 176, PAPER, 13);
  text(ctx, "A designer selects later", column, WHAT.y + 204, CYAN, 13);
  const plotX = WHAT.x + 36;
  const plotY = WHAT.y + 292;
  ctx.strokeStyle = "rgba(242,242,238,0.72)";
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + 92);
  ctx.lineTo(plotX + 188, plotY + 92);
  ctx.stroke();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(plotX + 22, plotY + 18);
  ctx.lineTo(plotX + 68, plotY + 36);
  ctx.lineTo(plotX + 112, plotY + 58);
  ctx.lineTo(plotX + 164, plotY + 78);
  ctx.stroke();
  ctx.setLineDash([]);
  [[36, 24], [74, 40], [116, 62], [158, 76]].forEach(([x, y]) => {
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(plotX + x, plotY + y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "rgba(242,242,238,0.45)";
  [[52, 58], [98, 70]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(plotX + x, plotY + y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
  text(ctx, "No single optimum", column, plotY + 36, PAPER, 12);
  text(ctx, "Schematic", column, plotY + 60, DIM, 11);
}

function drawHow(ctx: CanvasRenderingContext2D, time: number) {
  glass(ctx, HOW);
  text(ctx, "General", HOW.x + 22, HOW.y + 28, DIM, 11);
  text(ctx, "How it works", HOW.x + 22, HOW.y + 52, CYAN, 16);
  const phase = (time % 6) / 6;
  const step = Math.min(5, Math.floor(phase * 6));
  METHOD.forEach((name, index) => {
    const x = HOW.x + 36 + (index % 3) * 172;
    const y = HOW.y + 96 + Math.floor(index / 3) * 58;
    ctx.beginPath();
    ctx.arc(x + 8, y - 4, 8, 0, Math.PI * 2);
    ctx.strokeStyle = index === step ? CYAN : "rgba(242,242,238,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (index === step) {
      ctx.fillStyle = CYAN;
      ctx.beginPath();
      ctx.arc(x + 8, y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, `${index + 1}  ${name}`, x + 24, y, index === step ? PAPER : DIM, 12);
  });
  const loopLeft = HOW.x + 36;
  const loopTop = HOW.y + 214;
  const loopWidth = 488;
  const loopHeight = 36;
  ctx.strokeStyle = "rgba(242,242,238,0.45)";
  ctx.beginPath();
  ctx.moveTo(loopLeft, loopTop);
  ctx.lineTo(loopLeft + loopWidth, loopTop);
  ctx.lineTo(loopLeft + loopWidth, loopTop + loopHeight);
  ctx.lineTo(loopLeft, loopTop + loopHeight);
  ctx.closePath();
  ctx.stroke();
  const loop = phase;
  const perimeter = loopWidth * 2 + loopHeight * 2;
  const distance = loop * perimeter;
  let dotX = loopLeft;
  let dotY = loopTop;
  if (distance < loopWidth) dotX += distance;
  else if (distance < loopWidth + loopHeight) dotY += distance - loopWidth;
  else if (distance < loopWidth * 2 + loopHeight) dotX += loopWidth - (distance - loopWidth - loopHeight);
  else dotY += loopHeight - (distance - loopWidth * 2 - loopHeight);
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3.4, 0, Math.PI * 2);
  ctx.fill();

  const marks = [0, 1, 2, 3];
  marks.forEach((index) => {
    const x = HOW.x + 36 + index * 118;
    const y = HOW.y + 292;
    const born = step >= 1 ? 1 : 0;
    const dominated = index === 3 && step >= 3;
    const kept = index === 1 && step >= 4;
    ctx.save();
    ctx.globalAlpha = born * (dominated ? 0.28 : 1);
    ctx.strokeStyle = kept ? CYAN : "rgba(242,242,238,0.7)";
    ctx.strokeRect(x, y, 46, 46);
    ctx.strokeStyle = index === 0 ? COPPER : index === 1 ? PAPER : CYAN;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 30);
    ctx.lineTo(x + 18, y + 16);
    ctx.lineTo(x + 34, y + 24);
    ctx.stroke();
    ctx.restore();
    if (step >= 2 && !dominated) {
      (["formal", "spatial", "atmospheric"] as const).forEach((key, line) => {
        ctx.strokeStyle = SCORE[key];
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(x, y + 54 + line * 6);
        ctx.lineTo(x + 18 + ((index + line) % 3) * 8, y + 54 + line * 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    if (kept && step >= 4) {
      ctx.save();
      ctx.translate(16, -14);
      ctx.strokeStyle = COPPER;
      ctx.strokeRect(x, y, 46, 46);
      ctx.restore();
    }
  });
}

function bars(ctx: CanvasRenderingContext2D, row: Row, x: number, y: number, width: number, grow: number, alpha: number) {
  (["formal", "spatial", "atmospheric"] as const).forEach((key, index) => {
    const yy = y + index * 8;
    ctx.strokeStyle = SCORE[key];
    ctx.globalAlpha = alpha * 0.28;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + width, yy);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + row[key] * width * grow, yy);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawAxes(ctx: CanvasRenderingContext2D, yaw: number, alpha: number) {
  if (alpha <= 0.02) return;
  const origin = project(F0, F0, F0, yaw);
  ctx.save();
  ctx.globalAlpha = alpha;
  (["formal", "spatial", "atmospheric"] as const).forEach((axis) => {
    const tip = axisTip(axis, yaw);
    ctx.strokeStyle = SCORE[axis];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    const labelY = tip.y > 360 ? tip.y - 16 : tip.y + 14;
    text(ctx, axis, tip.x + 8, labelY, SCORE[axis], 12);
  });
  ctx.restore();
}

function legendMark(ctx: CanvasRenderingContext2D, kind: "dash" | "cyan" | "copper", x: number, y: number) {
  ctx.save();
  if (kind === "dash") {
    ctx.strokeStyle = "rgba(242,242,238,0.72)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 18, y - 4);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = kind === "cyan" ? CYAN : COPPER;
    ctx.fillRect(x, y - 8, 8, 8);
  }
  ctx.restore();
}

function legend(ctx: CanvasRenderingContext2D, where: "side" | "bottom") {
  const items = [
    ["dash", "Origin", PAPER],
    ["cyan", "Nondominated", CYAN],
    ["copper", "Diversity", COPPER],
  ] as const;
  ctx.save();
  if (where === "side") {
    items.forEach((item, index) => {
      const y = 86 + index * 24;
      legendMark(ctx, item[0], 40, y);
      text(ctx, item[1], 70, y, item[2], 12);
    });
  } else {
    items.forEach((item, index) => {
      const x = 40 + index * 220;
      legendMark(ctx, item[0], x, 422);
      text(ctx, item[1], x + 28, 422, item[2], 12);
    });
    text(ctx, "Not one optimum", 1704, 422, PAPER, 12, "right");
  }
  ctx.restore();
}

function paintStudy(ctx: CanvasRenderingContext2D, sim: number, chrome: boolean) {
  const stage = sim < 11 ? 0 : sim < 24 ? 1 : sim < 34 ? 2 : sim < 54 ? 3 : 4;
  const pick = ramp(sim, 11.2, 13.6);
  const scores = ramp(sim, 14.2, 16.6);
  const travel = ramp(sim, 18.4, 21.8);
  const region = ramp(sim, 24.2, 26.2) * (1 - ramp(sim, 30.6, 32.2));
  const front = ramp(sim, 30.4, 32.4);
  const back = ramp(sim, 34.2, 37.2);
  const g2 = ramp(sim, 37.4, 39.2);
  const g3 = ramp(sim, 42.2, 43.8);
  const g4 = ramp(sim, 45.2, 46.8);
  const linkA = ramp(sim, 39.4, 40.6) * (1 - ramp(sim, 43.4, 44.4));
  const linkB = ramp(sim, 47.2, 48.6) * (1 - ramp(sim, 52.2, 53.4));
  const result = ramp(sim, 54, 56.2);
  const reveal = [1, g2, g3, g4];
  const yaw = lerp(0.38, 0.58, ramp(sim, 18, 33));
  const showPlot = travel * (1 - back);

  if (chrome) {
    text(ctx, NAV[stage], 40, 40, CYAN, 16);
    text(ctx, "Vertical Void", 280, 40, PAPER, 13);
    NAV.forEach((name, step) => {
      const x = 196 + step * 332;
      text(ctx, `${String(step + 1).padStart(2, "0")}  ${name}`, x, 456, step === stage ? CYAN : DIM, 10, "center");
      if (step < NAV.length - 1) {
        ctx.strokeStyle = "rgba(242,242,238,0.28)";
        ctx.beginPath();
        ctx.moveTo(x + 78, 452);
        ctx.lineTo(x + 246, 452);
        ctx.stroke();
      }
    });
  }
  if (status !== "ready") {
    text(ctx, status === "missing" ? "Vertical Void catalog is not stored." : "Reading the catalog.", 880, 240, DIM, 13, "center");
    return;
  }

  const first = byGeneration(1);
  const evaluated = EVAL_IDS.map((id) => rows.find((row) => row.id === id)).filter((row): row is Row => Boolean(row));
  const winner = evaluated.find((row) => row.id === 83);
  const loser = evaluated.find((row) => row.id === 99);
  drawAxes(ctx, yaw, showPlot);
  if (chrome && showPlot > 0.3) text(ctx, "Window 0.55 – 1", 1704, 40, DIM, 10, "right");

  if (chrome && pick < 0.85) {
    ctx.save();
    ctx.globalAlpha = 1 - pick;
    text(ctx, "Generation 1", 1430, 40, DIM, 11, "right");
    text(ctx, `${first.length} visible`, 1704, 40, PAPER, 12, "right");
    ctx.restore();
  }
  if (chrome && scores > 0.3 && travel < 0.35) {
    text(ctx, "Formal", 1368, 40, COPPER, 12);
    text(ctx, "Spatial", 1472, 40, PAPER, 12);
    text(ctx, "Atmospheric", 1576, 40, CYAN, 12);
  }
  if (chrome && back > 0.35) {
    ctx.save();
    ctx.globalAlpha = Math.max(back * (1 - result), result);
    text(ctx, `${evaluations} evaluations`, 1436, 40, DIM, 11, "right");
    text(ctx, `${rows.length} visible`, 1704, 40, PAPER, 12, "right");
    ctx.restore();
  }

  if (showPlot > 0.08) {
    first.forEach((row) => {
      const point = project(row.formal, row.spatial, row.atmospheric, yaw);
      const diverse = row.diversity === "tag" || row.diversity === "rescue";
      ctx.save();
      ctx.globalAlpha = showPlot * (EVAL_IDS.includes(row.id as (typeof EVAL_IDS)[number]) ? 0.2 : 0.85);
      ctx.fillStyle = row.pareto ? CYAN : diverse ? COPPER : "rgba(242,242,238,0.55)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, row.pareto ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (row.generation === 1) {
        ctx.strokeStyle = "rgba(242,242,238,0.7)";
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  }

  if (front > 0.2 && back < 0.35) {
    const frontRows = [43, 77, 83].map((id) => rows.find((row) => row.id === id)).filter((row): row is Row => Boolean(row));
    if (frontRows.length === 3) {
      const points = frontRows.map((row) => project(row.formal, row.spatial, row.atmospheric, yaw));
      ctx.save();
      ctx.globalAlpha = front * (1 - back) * 0.9;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(73,215,222,0.12)";
      ctx.fill();
      ctx.strokeStyle = CYAN;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, "Connects stored candidates", 70, 164, DIM, 11);
      ctx.restore();
    }
  }

  if (region > 0.04 && loser) {
    ctx.save();
    ctx.globalAlpha = region * (1 - back);
    ctx.strokeStyle = CYAN;
    ctx.setLineDash([4, 3]);
    (["formal", "spatial", "atmospheric"] as const).forEach((axis) => {
      const from = project(loser.formal, loser.spatial, loser.atmospheric, yaw);
      const score = { formal: loser.formal, spatial: loser.spatial, atmospheric: loser.atmospheric, [axis]: 1 };
      const to = project(score.formal, score.spatial, score.atmospheric, yaw);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  const drawBand = (generation: number) => {
    const layout = bandLayout(generation);
    const shown = reveal[generation - 1] ?? 0;
    if (shown <= 0.02 && generation > 1) return;
    const alpha = generation === 1 ? Math.max(back, result) : shown;
    if (chrome) {
      ctx.save();
      ctx.globalAlpha = alpha;
      text(ctx, `G${generation}`, 40, layout.y - 2, CYAN, 13);
      text(ctx, `${layout.band.length} visible`, 40, layout.y + 14, DIM, 10);
      ctx.restore();
    }
    [...layout.band].sort((a, b) => Number(EVAL_IDS.includes(a.id as (typeof EVAL_IDS)[number])) - Number(EVAL_IDS.includes(b.id as (typeof EVAL_IDS)[number]))).forEach((row) => {
      const slot = bandSlot(row);
      const focus = (linkA > 0.2 && (row.id === 83 || row.id === 191)) || (linkB > 0.2 && (row.id === 174 || row.id === 351));
      const dim = lerp((linkA > 0.25 || linkB > 0.25) && !focus ? 0.32 : 1, 1, result);
      const openSize = fieldMetrics().size;
      const scoreSize = evalLayout().size;
      const fromGrid = generation === 1;
      const gridIndex = first.findIndex((item) => item.id === row.id);
      const evalIndex = EVAL_IDS.indexOf(row.id as (typeof EVAL_IDS)[number]);
      let x = slot[0];
      let y = slot[1];
      let drawn = focus ? lerp(slot[2], 64, Math.max(linkA, linkB)) : slot[2];
      let plateAlpha = alpha * dim;
      if (fromGrid && evalIndex >= 0) {
        const slotPoint = openingSlot(gridIndex, first.length);
        const enlarged = evalSlot(evalIndex);
        const plot = project(row.formal, row.spatial, row.atmospheric, yaw);
        const mid = [lerp(slotPoint[0], enlarged[0], pick), lerp(slotPoint[1], enlarged[1], pick)] as [number, number];
        const lift = 34 * travel * (1 - back);
        const plotted = [lerp(mid[0], plot.x, travel), lerp(mid[1], plot.y - lift, travel)] as [number, number];
        x = lerp(plotted[0], slot[0], back);
        y = lerp(plotted[1], slot[1], back);
        drawn = lerp(lerp(lerp(openSize, scoreSize, pick), 36, travel), slot[2], back);
        if (focus) drawn = lerp(drawn, 64, Math.max(linkA, linkB) * back);
        plateAlpha = dim * (front > 0 && !row.pareto && back < 0.2 ? lerp(1, 0.4, front) : 1);
      } else if (fromGrid && back < 0.98) {
        const slotPoint = openingSlot(Math.max(0, gridIndex), first.length);
        x = lerp(slotPoint[0], slot[0], back);
        y = lerp(slotPoint[1], slot[1], back);
        drawn = lerp(openSize, slot[2], back);
        plateAlpha = (1 - pick) * (1 - travel) + back * dim;
      }
      const classify = (generation === 1 && back > 0.55) || shown > 0.55 || result > 0.2;
      const inPlot = fromGrid && evalIndex >= 0 && travel > 0.85 && back < 0.35;
      const marked = (classify && (generation > 1 || back > 0.45 || result > 0.2)) || (inPlot && front > 0.2);
      if (inPlot && plateAlpha > 0.2) {
        ctx.save();
        ctx.globalAlpha = plateAlpha * 0.7;
        ctx.strokeStyle = "rgba(242,242,238,0.55)";
        ctx.beginPath();
        ctx.moveTo(project(row.formal, row.spatial, row.atmospheric, yaw).x, project(row.formal, row.spatial, row.atmospheric, yaw).y);
        ctx.lineTo(x, y + drawn / 2);
        ctx.stroke();
        ctx.restore();
      }
      plate(ctx, row.image, x, y, drawn, plateAlpha, borderOf(row, marked), focus ? Math.max(linkA, linkB) : 0, marked && row.generation === 1);
      const showId = plateAlpha > 0.45 && (drawn > 90 || (evalIndex >= 0 && drawn > 40 && back < 0.45) || focus);
      if (showId) {
        ctx.save();
        ctx.globalAlpha = plateAlpha;
        text(ctx, String(row.id), x, y - drawn / 2 - 8, PAPER, drawn > 100 ? 13 : 11, "center");
        ctx.restore();
      }
      if (evalIndex >= 0 && scores * (1 - travel) * (1 - back) > 0.04) {
        const home = evalSlot(evalIndex);
        const barAlpha = scores * (1 - travel) * (1 - back);
        const barY = home[1] + scoreSize / 2 + 16;
        bars(ctx, row, home[0] - scoreSize / 2, barY, scoreSize * 0.62, scores, barAlpha);
        ctx.save();
        ctx.globalAlpha = barAlpha;
        (["formal", "spatial", "atmospheric"] as const).forEach((key, line) => {
          text(ctx, row[key].toFixed(3), home[0] - scoreSize / 2, barY + 26 + line * 14, SCORE[key], 12);
        });
        ctx.restore();
      }
    });
  };

  [1, 2, 3, 4].forEach(drawBand);

  const strokeLink = (fromId: number, toId: number, amount: number) => {
    if (amount <= 0.04) return;
    const from = rows.find((row) => row.id === fromId);
    const to = rows.find((row) => row.id === toId);
    if (!from || !to) return;
    const a = bandSlot(from);
    const b = bandSlot(to);
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.strokeStyle = COPPER;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.restore();
  };
  strokeLink(83, 191, linkA * back);
  strokeLink(174, 351, linkB);
  if (chrome && linkA > 0.35 && result < 0.2) {
    text(ctx, "Recorded parent", 40, 422, COPPER, 12);
    text(ctx, "83 generation 1  ·  191 generation 2", 230, 422, DIM, 12);
  }
  if (chrome && linkB > 0.35 && result < 0.45) {
    text(ctx, "Recorded parent", 40, 422, COPPER, 12);
    text(ctx, "174 generation 2  ·  351 generation 4", 230, 422, DIM, 12);
  }
  if (chrome && region > 0.45 && winner && loser && back < 0.15 && front < 0.75) {
    ctx.save();
    ctx.globalAlpha = region * (1 - back);
    text(ctx, "83", 44, 78, CYAN, 13);
    text(ctx, "99", 118, 78, DIM, 13);
    (["formal", "spatial", "atmospheric"] as const).forEach((key, line) => {
      text(ctx, winner[key].toFixed(3), 44, 98 + line * 14, SCORE[key], 12);
      text(ctx, loser[key].toFixed(3), 118, 98 + line * 14, SCORE[key], 12);
    });
    text(ctx, "Dominates on all three", 40, 156, CYAN, 12);
    ctx.restore();
  }
  if (chrome && front > 0.7 && back < 0.2) legend(ctx, "side");
  if (chrome && result > 0.45) legend(ctx, "bottom");
}

function paint(ctx: CanvasRenderingContext2D, time: number, width: number, height: number) {
  ensure();
  const clock = Math.min(time, PLAY);
  const scale = Math.min(width / 1760, height / 496);
  ctx.save();
  ctx.translate((width - 1760 * scale) / 2, (height - 496 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 1760, 496);

  const expand = ramp(clock, EXPAND_AT, EXPAND_END);
  const sim = Math.max(0, clock - EXPAND_END);
  const remain = 1 - expand;
  if (remain > 0.02) {
    ctx.save();
    ctx.globalAlpha = remain;
    ctx.translate(0, -28 * expand);
    drawWhat(ctx);
    drawHow(ctx, clock);
    ctx.restore();
  }

  const rect = mixRect(RUNNING, FULL, expand);
  const fitted = Math.min(rect.w / 1760, rect.h / 496);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 16);
  ctx.clip();
  ctx.fillStyle = "#000";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.translate(rect.x + (rect.w - 1760 * fitted) / 2, rect.y + (rect.h - 496 * fitted) / 2);
  ctx.scale(fitted, fitted);
  paintStudy(ctx, sim, fitted > 0.86);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 16);
  ctx.strokeStyle = "rgba(242,242,238,0.72)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  if (fitted <= 0.86) {
    text(ctx, "Process running", rect.x + 22, rect.y + 28, CYAN, 16);
    text(ctx, "Vertical Void", rect.x + 22, rect.y + 50, PAPER, 13);
  }
  ctx.restore();
}

/** An experimental page. The general method stays schematic. The running search is the stored Vertical Void record. */
export function MooCombinedPresentation() {
  const ref = useExplainFrame(paint, DURATION);
  return (
    <article className={styles.board} data-explain="">
      <canvas
        ref={ref}
        role="img"
        aria-label="Experimental combined multiobjective presentation. Two general frames explain conflicting objectives and the define, generate, evaluate, compare, preserve, and repeat loop. The third frame then expands into the recorded Vertical Void search: alternatives, evaluation, dominance, generations, and results. The objective plot uses stored Formal, Spatial, and Atmospheric scores. The surface only connects stored candidates."
      />
    </article>
  );
}
