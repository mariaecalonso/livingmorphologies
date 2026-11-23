"use client";

import { ramp, useExplainFrame } from "@/components/demo-workflow/explain-clock";
import styles from "@/components/demo-workflow/moo-morphology.module.css";

const DURATION = 68;
const ARCHETYPE = "vertical-void";
const EVAL_IDS = [43, 77, 83, 91, 99] as const;

const CYAN = "#49d7de";
const COPPER = "#c77e5f";
const PAPER = "rgba(242,242,238,0.92)";
const DIM = "rgba(242,242,238,0.46)";
const SCORE = { formal: COPPER, spatial: PAPER, atmospheric: CYAN } as const;

const F0 = 0.55;
const S0 = 0.55;
const SPAN = 0.45;
const OX = 188;
const OY = 392;
const XW = 1340;
const YH = 236;

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

const NAV = ["Alternatives", "Evaluation", "Dominance", "Generations", "Results"] as const;
const NEUTRAL = "rgba(242,242,238,0.34)";
const FIELD = { left: 48, top: 70, width: 1664, height: 336 };
const TRACK = { left: 150, width: 1550, top: 86, bottom: 404 };

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

function at(formal: number, spatial: number): [number, number] {
  return [OX + ((formal - F0) / SPAN) * XW, OY - ((spatial - S0) / SPAN) * YH];
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

function frame(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(16.5, 12.5, 1727, 470, 16);
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fill();
  ctx.strokeStyle = "rgba(242,242,238,0.72)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

type Border = "neutral" | "cyan" | "copper" | "both";

function borderOf(row: Row, active: boolean): Border {
  if (!active) return "neutral";
  const diverse = row.diversity === "tag" || row.diversity === "rescue";
  if (row.pareto && diverse) return "both";
  if (row.pareto) return "cyan";
  if (diverse) return "copper";
  return "neutral";
}

function plate(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, size: number, alpha: number, border: Border, emphasis = 0) {
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

function axes(ctx: CanvasRenderingContext2D, alpha: number) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(OX, OY - YH - 6);
  ctx.lineTo(OX, OY);
  ctx.lineTo(OX + XW + 8, OY);
  ctx.stroke();
  text(ctx, "Spatial", OX + 10, OY - YH + 2, PAPER, 11);
  text(ctx, "Formal", OX + XW - 64, OY + 16, PAPER, 11);
  text(ctx, "0.55", OX - 8, OY + 16, DIM, 10, "right");
  text(ctx, "1", OX + XW + 8, OY + 16, DIM, 10);
  text(ctx, "Window 0.55 – 1", OX + 420, OY + 16, DIM, 10);
  ctx.restore();
}

function navigator(ctx: CanvasRenderingContext2D, index: number) {
  NAV.forEach((name, step) => {
    const x = 196 + step * 332;
    text(ctx, `${String(step + 1).padStart(2, "0")}  ${name}`, x, 470, step === index ? CYAN : DIM, 10, "center");
    if (step < NAV.length - 1) {
      ctx.strokeStyle = "rgba(242,242,238,0.28)";
      ctx.beginPath();
      ctx.moveTo(x + 78, 466);
      ctx.lineTo(x + 246, 466);
      ctx.stroke();
    }
  });
}

function fieldMetrics() {
  const label = 13;
  const size = (8 * FIELD.height - 16 * label - FIELD.width) / 7;
  const gap = FIELD.height - 2 * label - 2 * size;
  return { size, gap, label };
}

function openingSlot(index: number, count: number): [number, number] {
  const { size, gap, label } = fieldMetrics();
  const row = index < 9 ? 0 : 1;
  const column = row === 0 ? index : index - 9;
  const columns = row === 0 ? 9 : Math.max(1, count - 9);
  const rowWidth = columns * size + (columns - 1) * gap;
  const x = FIELD.left + (FIELD.width - rowWidth) / 2 + size / 2 + column * (size + gap);
  const y = FIELD.top + row * (size + label + gap) + label + size / 2;
  return [x, y];
}

function evalLayout() {
  const size = 156;
  const gap = (FIELD.width - 5 * size) / 4;
  return { size, gap, y: FIELD.top + 86 };
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

function paint(ctx: CanvasRenderingContext2D, time: number, width: number, height: number) {
  ensure();
  const scale = Math.min(width / 1760, height / 496);
  ctx.save();
  ctx.translate((width - 1760 * scale) / 2, (height - 496 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 1760, 496);
  frame(ctx);

  const stage = time < 11 ? 0 : time < 24 ? 1 : time < 34 ? 2 : time < 54 ? 3 : 4;
  text(ctx, NAV[stage], 40, 40, CYAN, 16);
  text(ctx, "Vertical Void", 248, 40, PAPER, 13);
  navigator(ctx, stage);
  if (status !== "ready") {
    text(ctx, status === "missing" ? "Vertical Void catalog is not stored." : "Reading the catalog.", 880, 240, DIM, 13, "center");
    ctx.restore();
    return;
  }

  const appear = ramp(time, 0.3, 2.2);
  const pick = ramp(time, 11.2, 13.6);
  const scores = ramp(time, 14.2, 16.6);
  const travel = ramp(time, 18.4, 21.8);
  const region = ramp(time, 24.2, 26.2) * (1 - ramp(time, 30.6, 32.2));
  const front = ramp(time, 30.4, 32.4);
  const back = ramp(time, 34.2, 37.2);
  const g2 = ramp(time, 37.4, 39.2);
  const g3 = ramp(time, 42.2, 43.8);
  const g4 = ramp(time, 45.2, 46.8);
  const linkA = ramp(time, 39.4, 40.6) * (1 - ramp(time, 43.4, 44.4));
  const linkB = ramp(time, 47.2, 48.6) * (1 - ramp(time, 52.2, 53.4));
  const result = ramp(time, 54, 56.2);
  const reveal = [1, g2, g3, g4];

  const first = byGeneration(1);
  const evaluated = EVAL_IDS.map((id) => rows.find((row) => row.id === id)).filter((row): row is Row => Boolean(row));
  const winner = evaluated.find((row) => row.id === 83);
  const loser = evaluated.find((row) => row.id === 99);

  axes(ctx, travel * (1 - back));

  if (appear > 0.2 && pick < 0.85) {
    ctx.save();
    ctx.globalAlpha = appear * (1 - pick);
    text(ctx, "Generation 1", 1430, 40, DIM, 11, "right");
    text(ctx, `${first.length} visible`, 1704, 40, PAPER, 12, "right");
    ctx.restore();
  }
  if (scores > 0.3 && back < 0.35) {
    text(ctx, "Formal", 1368, 40, COPPER, 12);
    text(ctx, "Spatial", 1472, 40, PAPER, 12);
    text(ctx, "Atmospheric", 1576, 40, CYAN, 12);
  }
  if (back > 0.35) {
    ctx.save();
    ctx.globalAlpha = Math.max(back * (1 - result), result);
    text(ctx, `${evaluations} evaluations`, 1436, 40, DIM, 11, "right");
    text(ctx, `${rows.length} visible`, 1704, 40, PAPER, 12, "right");
    ctx.restore();
  }

  if (region > 0.04 && winner && loser) {
    const win = at(winner.formal, winner.spatial);
    const lose = at(loser.formal, loser.spatial);
    const cornerX = lose[0] + 22;
    const cornerY = lose[1] - 20;
    ctx.save();
    ctx.globalAlpha = region * (1 - back);
    ctx.strokeStyle = CYAN;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(OX + XW, cornerY);
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX, OY - YH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(73,215,222,0.10)";
    ctx.fillRect(cornerX, OY - YH, OX + XW - cornerX, cornerY - (OY - YH));
    text(ctx, "Higher formal and spatial", 220, lose[1] - 28, CYAN, 12);
    ctx.restore();
  }

  const drawBand = (generation: number) => {
    const layout = bandLayout(generation);
    const shown = reveal[generation - 1] ?? 0;
    if (shown <= 0.02 && generation > 1) return;
    const alpha = generation === 1 ? Math.max(back, result) : shown;
    ctx.save();
    ctx.globalAlpha = alpha;
    text(ctx, `G${generation}`, 40, layout.y - 2, CYAN, 13);
    text(ctx, `${layout.band.length} visible`, 40, layout.y + 14, DIM, 10);
    ctx.restore();
    [...layout.band].sort((a, b) => Number(EVAL_IDS.includes(a.id as (typeof EVAL_IDS)[number])) - Number(EVAL_IDS.includes(b.id as (typeof EVAL_IDS)[number]))).forEach((row) => {
      const slot = bandSlot(row);
      const focus = (linkA > 0.2 && (row.id === 83 || row.id === 191)) || (linkB > 0.2 && (row.id === 174 || row.id === 351));
      const dim = lerp((linkA > 0.25 || linkB > 0.25) && !focus ? 0.32 : 1, 1, result);
      const openSize = fieldMetrics().size;
      const scoreSize = evalLayout().size;
      const size = focus ? lerp(slot[2], 64, Math.max(linkA, linkB)) : slot[2];
      const fromGrid = generation === 1;
      const gridIndex = first.findIndex((item) => item.id === row.id);
      const evalIndex = EVAL_IDS.indexOf(row.id as (typeof EVAL_IDS)[number]);
      let x = slot[0];
      let y = slot[1];
      let drawn = size;
      let plateAlpha = alpha * dim;
      if (fromGrid && evalIndex >= 0) {
        const slotPoint = openingSlot(gridIndex, first.length);
        const enlarged = evalSlot(evalIndex);
        const plot = at(row.formal, row.spatial);
        const mid = [lerp(slotPoint[0], enlarged[0], pick), lerp(slotPoint[1], enlarged[1], pick)] as [number, number];
        const plotted = [lerp(mid[0], plot[0], travel), lerp(mid[1], plot[1], travel)] as [number, number];
        x = lerp(plotted[0], slot[0], back);
        y = lerp(plotted[1], slot[1], back);
        drawn = lerp(lerp(lerp(openSize, scoreSize, pick), 70, travel), slot[2], back);
        if (focus) drawn = lerp(drawn, 64, Math.max(linkA, linkB) * back);
        plateAlpha = appear * dim * (front > 0 && !row.pareto && back < 0.2 ? lerp(1, 0.4, front) : 1);
      } else if (fromGrid && back < 0.98) {
        const slotPoint = openingSlot(Math.max(0, gridIndex), first.length);
        x = lerp(slotPoint[0], slot[0], back);
        y = lerp(slotPoint[1], slot[1], back);
        drawn = lerp(openSize, slot[2], back);
        plateAlpha = appear * (1 - pick) * (1 - travel) + back * dim;
      }
      const classify = (generation === 1 && back > 0.55) || shown > 0.55 || result > 0.2;
      const inPlot = fromGrid && evalIndex >= 0 && travel > 0.85 && back < 0.35;
      const marked = (classify && (generation > 1 || back > 0.45 || result > 0.2)) || (inPlot && front > 0.2);
      plate(ctx, row.image, x, y, drawn, plateAlpha, borderOf(row, marked), focus ? Math.max(linkA, linkB) : 0);
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
        const barY = home[1] + scoreSize / 2 + 18;
        bars(ctx, row, home[0] - scoreSize / 2, barY, scoreSize * 0.62, scores, barAlpha);
        ctx.save();
        ctx.globalAlpha = barAlpha;
        (["formal", "spatial", "atmospheric"] as const).forEach((key, line) => {
          text(ctx, row[key].toFixed(3), home[0] - scoreSize / 2, barY + 28 + line * 15, SCORE[key], 12);
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
  if (linkA > 0.35 && result < 0.2) {
    ctx.save();
    ctx.globalAlpha = linkA * (1 - result);
    text(ctx, "Recorded parent", 40, 422, COPPER, 12);
    text(ctx, "83 generation 1  ·  191 generation 2", 230, 422, DIM, 12);
    ctx.restore();
  }
  if (linkB > 0.35 && result < 0.45) {
    ctx.save();
    ctx.globalAlpha = linkB * (1 - result);
    text(ctx, "Recorded parent", 40, 422, COPPER, 12);
    text(ctx, "174 generation 2  ·  351 generation 4", 230, 422, DIM, 12);
    ctx.restore();
  }

  if (region > 0.45 && winner && loser && back < 0.15 && front < 0.75) {
    ctx.save();
    ctx.globalAlpha = region * (1 - back);
    text(ctx, "83", 44, 286, CYAN, 13);
    text(ctx, "99", 118, 286, DIM, 13);
    (["formal", "spatial", "atmospheric"] as const).forEach((key, line) => {
      text(ctx, winner[key].toFixed(3), 44, 306 + line * 14, SCORE[key], 12);
      text(ctx, loser[key].toFixed(3), 118, 306 + line * 14, SCORE[key], 12);
    });
    text(ctx, "Dominates on all three", 40, 422, CYAN, 12);
    ctx.restore();
  }
  if (front > 0.7 && back < 0.2) {
    text(ctx, "Nondominated", 40, 422, CYAN, 12);
    text(ctx, "Diversity", 210, 422, COPPER, 12);
    text(ctx, "Both use both borders", 340, 422, DIM, 12);
  }
  if (result > 0.45) {
    text(ctx, "Nondominated", 40, 422, CYAN, 12);
    text(ctx, "Diversity", 210, 422, COPPER, 12);
    text(ctx, "Both use both borders", 340, 422, DIM, 12);
    text(ctx, "Not one optimum", 1704, 422, PAPER, 12, "right");
  }

  ctx.restore();
}

/** Vertical Void plates carry the stored search from the visible first generation to the catalog. */
export function MooMorphologyStudy() {
  const ref = useExplainFrame(paint, DURATION);
  return (
    <article className={styles.board} data-explain="">
      <canvas
        ref={ref}
        role="img"
        aria-label="Vertical Void morphology study. Generation 1 shows 17 visible plates. Candidates 43, 77, 83, 91, and 99 carry their stored Formal, Spatial, and Atmospheric scores into objective space. 83 dominates 99 on all three stored scores. The later field shows 89 visible plates from 400 evaluations. Recorded parents are 83 to 191 and 174 to 351. The closing field is the classified catalog."
      />
    </article>
  );
}
