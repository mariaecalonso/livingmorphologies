"use client";

import { ramp, useExplainFrame } from "@/components/demo-workflow/explain-clock";
import styles from "@/components/demo-workflow/moo-intro.module.css";

const DURATION = 70;

const CYAN = "#49d7de";
const COPPER = "#c77e5f";
const PAPER = "rgba(255,255,255,0.86)";
const DIM = "rgba(255,255,255,0.46)";

type Dot = { x: number; y: number; front: boolean };

/** Schematic front. Formal increases to the right, Spatial upward. Atmospheric is not an axis. */
const DOTS: Dot[] = [
  { x: 0.12, y: 0.9, front: true },
  { x: 0.3, y: 0.72, front: true },
  { x: 0.48, y: 0.54, front: true },
  { x: 0.66, y: 0.36, front: true },
  { x: 0.84, y: 0.16, front: true },
  { x: 0.24, y: 0.48, front: false },
  { x: 0.4, y: 0.34, front: false },
  { x: 0.52, y: 0.22, front: false },
  { x: 0.34, y: 0.62, front: false },
  { x: 0.58, y: 0.5, front: false },
];

const MIX = [
  { name: "G1", parts: [1, 0, 0] },
  { name: "G2", parts: [0.7, 0.22, 0.08] },
  { name: "G3", parts: [0.5, 0.37, 0.13] },
  { name: "G4", parts: [0.3, 0.52, 0.18] },
] as const;

const STEPS = [
  ["01", "Define", "Three separate objectives."],
  ["02", "Generate", "A population of morphologies."],
  ["03", "Evaluate", "Three scores, not one total."],
  ["04", "Compare", "Keep the nondominated front."],
  ["05", "Vary", "Explore the front and preserve diversity."],
  ["06", "Repeat", "Several generations. No single optimum."],
] as const;

const WHY = [
  "The objectives compete.",
  "The search keeps many alternatives.",
  "The Pareto front shows the trade-offs.",
  "A person selects afterward.",
];

const PLOT = { x: 828, y: 118, w: 520, h: 90 };

const WHAT = { x: 32, y: 72, w: 360, h: 164 };
const WHY_BOX = { x: 416, y: 72, w: 360, h: 164 };
const FRONT = { x: 800, y: 72, w: 928, h: 164 };

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = DIM, size = 12) {
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
  ctx.letterSpacing = "0.12em";
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
}

function centerLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, color = DIM, size = 12) {
  ctx.font = `500 ${size}px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
  ctx.letterSpacing = "0.12em";
  const measured = ctx.measureText(text.toUpperCase()).width;
  ctx.letterSpacing = "0px";
  label(ctx, text, x + (width - measured) / 2, y, color, size);
}

function sentence(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, width: number, size = 13) {
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((item, index) => ctx.fillText(item, x, y + index * (size + 3)));
}

function place(dot: Dot) {
  return {
    x: PLOT.x + 28 + dot.x * (PLOT.w - 56),
    y: PLOT.y + PLOT.h - 18 - dot.y * (PLOT.h - 36),
  };
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius = 26) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function plan(ctx: CanvasRenderingContext2D, x: number, y: number, kind: number, color: string, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  if (kind === 0) ctx.rect(-3.5, -7, 7, 14);
  else if (kind === 1) {
    ctx.moveTo(-7, 6);
    ctx.lineTo(-7, -1);
    ctx.lineTo(-1, -1);
    ctx.lineTo(-1, -6);
    ctx.lineTo(7, -6);
    ctx.lineTo(7, 6);
    ctx.closePath();
  } else if (kind === 2) {
    ctx.moveTo(-6, 6);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-1, -6);
    ctx.lineTo(-1, 1);
    ctx.lineTo(6, 1);
    ctx.lineTo(6, 6);
    ctx.closePath();
  } else {
    ctx.moveTo(-7, 5);
    ctx.lineTo(-2, 5);
    ctx.lineTo(-2, -1);
    ctx.lineTo(2, -1);
    ctx.lineTo(2, -6);
    ctx.lineTo(7, -6);
    ctx.lineTo(7, 2);
    ctx.lineTo(3, 2);
    ctx.lineTo(3, 5);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

/** The small diagrams from a standard multiobjective explanation. */
function stepGlyph(ctx: CanvasRenderingContext2D, index: number, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 1.1;
  if (index === 0) {
    [COPPER, PAPER, CYAN].forEach((color, row) => {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.moveTo(-16, row * 9 - 9);
      ctx.lineTo(16, row * 9 - 9);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-16 + [10, 22, 16][row], row * 9 - 9, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (index === 1) {
    plan(ctx, -9, -8, 0, PAPER, 0.72);
    plan(ctx, 8, -7, 1, PAPER, 0.62);
    plan(ctx, -8, 8, 2, PAPER, 0.68);
    plan(ctx, 9, 8, 3, PAPER, 0.58);
  } else if (index === 2) {
    [0.85, 0.45, 0.7].forEach((share, row) => {
      ctx.fillStyle = [COPPER, PAPER, CYAN][row];
      ctx.fillRect(-16, row * 8 - 10, 32 * share, 3);
    });
  } else if (index === 3) {
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.lineTo(-16, -12);
    ctx.moveTo(-16, 8);
    ctx.lineTo(16, 8);
    ctx.stroke();
    ctx.fillStyle = CYAN;
    [[-10, -8], [-2, -2], [8, 6]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(2, 4, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (index === 4) {
    plan(ctx, -12, 3, 1, CYAN, 0.7);
    plan(ctx, 6, -7, 1, PAPER, 0.86);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.lineTo(1, -3);
    ctx.moveTo(-1, -2);
    ctx.lineTo(1, -3);
    ctx.lineTo(-1, -5);
    ctx.stroke();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgba(199,126,95,0.8)";
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.lineTo(12, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    plan(ctx, 16, 10, 2, COPPER, 0.55);
  } else {
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.bezierCurveTo(-8, 8, -8, -8, 0, -8);
    ctx.bezierCurveTo(8, -8, 10, -8, 16, -8);
    ctx.stroke();
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(4, -8, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: "panel" | "tile" | "primary" = "panel") {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 16);
  if (kind === "primary") {
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradient.addColorStop(0, "#49d7de");
    gradient.addColorStop(0.34, "#9af6f8");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.92)");
    gradient.addColorStop(0.76, "#f0b08a");
    gradient.addColorStop(1, "#c77e5f");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(73,215,222,0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = -8;
    ctx.stroke();
    ctx.shadowColor = "rgba(199,126,95,0.32)";
    ctx.shadowOffsetX = 8;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.stroke();
  } else {
    ctx.strokeStyle = kind === "panel" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1;
    ctx.shadowColor = kind === "panel" ? "rgba(242,242,238,0.2)" : "rgba(242,242,238,0.1)";
    ctx.shadowBlur = kind === "panel" ? 16 : 8;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
  ctx.restore();
}

function mass(ctx: CanvasRenderingContext2D, x: number, y: number, count: number) {
  for (let step = 0; step < count; step += 1) {
    const left = x + step * 26;
    const top = y - step * 14;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(left, top, 52, 18);
    ctx.fillStyle = "rgba(73,215,222,0.75)";
    ctx.fillRect(left, top - 4, 52, 4);
  }
}

function paint(ctx: CanvasRenderingContext2D, time: number, width: number, height: number) {
  const scale = Math.min(width / 1760, height / 496);
  const ox = (width - 1760 * scale) / 2;
  const oy = (height - 496 * scale) / 2;
  const what = 1;
  const why = 1;
  const frontOn = ramp(time, 0.35, 3.8);
  const dominated = ramp(time, 2.4, 5);
  const stepsOn = STEPS.map((_, index) => ramp(time, 4.2 + index * 1.35, 5.3 + index * 1.35));
  const generations = ramp(time, 13.6, 23);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 1760, 496);

  label(ctx, "Multiobjective optimization", 32, 26, CYAN, 13);
  sentence(ctx, "A search for trade-offs among Formal, Spatial, and Atmospheric. Not one optimal morphology.", 340, 26, DIM, 1380, 13);

  centerLabel(ctx, "01  What it is", WHAT.x, WHAT.y - 10, WHAT.w, what > 0.4 ? PAPER : DIM, 11);
  ctx.globalAlpha = 0.45 + what * 0.55;
  frame(ctx, WHAT.x, WHAT.y, WHAT.w, WHAT.h, "panel");
  ctx.globalAlpha = what;
  ring(ctx, WHAT.x + 78, WHAT.y + 78, COPPER);
  ring(ctx, WHAT.x + 118, WHAT.y + 78, PAPER);
  ring(ctx, WHAT.x + 98, WHAT.y + 112, CYAN);
  label(ctx, "Formal", WHAT.x + 46, WHAT.y + 46, COPPER, 11);
  label(ctx, "Spatial", WHAT.x + 148, WHAT.y + 70, PAPER, 11);
  label(ctx, "Atmospheric", WHAT.x + 50, WHAT.y + 148, CYAN, 11);
  sentence(ctx, "MOO evaluates multiple objectives at the same time.", WHAT.x + 148, WHAT.y + 104, PAPER, 190, 13);
  ctx.globalAlpha = 1;

  centerLabel(ctx, "02  Why", WHY_BOX.x, WHY_BOX.y - 10, WHY_BOX.w, why > 0.4 ? PAPER : DIM, 11);
  ctx.globalAlpha = 0.45 + why * 0.55;
  frame(ctx, WHY_BOX.x, WHY_BOX.y, WHY_BOX.w, WHY_BOX.h, "panel");
  ctx.globalAlpha = why;
  WHY.forEach((line, index) => {
    const y = WHY_BOX.y + 36 + index * 30;
    ctx.fillStyle = index === 3 ? CYAN : PAPER;
    ctx.fillRect(WHY_BOX.x + 24, y - 8, 4, 4);
    sentence(ctx, line, WHY_BOX.x + 40, y, index === 3 ? CYAN : "rgba(255,255,255,0.78)", 290, 13);
  });
  ctx.globalAlpha = 1;

  centerLabel(ctx, "03  Pareto front", FRONT.x, FRONT.y - 10, FRONT.w, frontOn > 0.4 ? PAPER : DIM, 11);
  ctx.globalAlpha = 0.45 + frontOn * 0.55;
  frame(ctx, FRONT.x, FRONT.y, FRONT.w, FRONT.h, "primary");
  ctx.globalAlpha = frontOn;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(FRONT.x + 250, FRONT.y + 22, 3, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, "Nondominated", FRONT.x + 260, FRONT.y + 26, CYAN, 11);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(FRONT.x + 430, FRONT.y + 22, 3, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, "Dominated", FRONT.x + 440, FRONT.y + 26, DIM, 11);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(FRONT.x + 580, FRONT.y + 22);
  ctx.lineTo(FRONT.x + 604, FRONT.y + 22);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, "Schematic", FRONT.x + 612, FRONT.y + 26, DIM, 11);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.moveTo(PLOT.x + 16, PLOT.y + 8);
  ctx.lineTo(PLOT.x + 16, PLOT.y + PLOT.h - 6);
  ctx.lineTo(PLOT.x + PLOT.w - 8, PLOT.y + PLOT.h - 6);
  ctx.stroke();
  label(ctx, "Formal", PLOT.x + PLOT.w - 72, PLOT.y + PLOT.h + 14, PAPER, 11);
  label(ctx, "Spatial", PLOT.x + 22, PLOT.y + 14, PAPER, 11);

  const front = DOTS.filter((dot) => dot.front);
  if (frontOn > 0.2) {
    ctx.beginPath();
    front.forEach((dot, index) => {
      const point = place(dot);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = `rgba(73,215,222,${frontOn})`;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (dominated > 0.05) {
    ctx.globalAlpha = dominated;
    label(ctx, "Trade-off region", PLOT.x + 150, PLOT.y + PLOT.h - 16, COPPER, 10);
    ctx.globalAlpha = 1;
  }
  DOTS.forEach((dot, index) => {
    const born = ramp(time, 0.5 + index * 0.18, 1.5 + index * 0.18);
    if (born <= 0.02) return;
    const point = place(dot);
    ctx.globalAlpha = born * (dot.front ? 1 : 0.55);
    ctx.fillStyle = dot.front && frontOn > 0.45 ? CYAN : "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, dot.front ? 4.2 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  if (frontOn > 0.75) {
    [
      { dot: front[0], text: "A", dx: 10, dy: -6 },
      { dot: front[1], text: "Pareto front", dx: 14, dy: -22 },
      { dot: front[2], text: "B", dx: 10, dy: -8 },
      { dot: front[4], text: "C", dx: 10, dy: -8 },
    ].forEach((tag) => {
      const point = place(tag.dot);
      label(ctx, tag.text, point.x + tag.dx, point.y + tag.dy, tag.text.length > 1 ? DIM : CYAN, tag.text.length > 1 ? 10 : 12);
    });
    const noteX = FRONT.x + FRONT.w - 212;
    const noteY = FRONT.y + 52;
    frame(ctx, noteX, noteY, 196, 86, "tile");
    sentence(ctx, "Trade-off: improving one objective tends to reduce another.", noteX + 14, noteY + 28, PAPER, 168, 13);
  }

  centerLabel(ctx, "04  The search", 32, 258, 1696, stepsOn[0] > 0.2 ? PAPER : DIM, 11);
  STEPS.forEach((step, index) => {
    const x = 32 + index * 286;
    const y = 272;
    ctx.globalAlpha = 0.45 + stepsOn[index] * 0.55;
    frame(ctx, x, y, 266, 84, "tile");
    stepGlyph(ctx, index, x + 32, y + 46);
    label(ctx, `${step[0]}  ${step[1]}`, x + 68, y + 32, stepsOn[index] > 0.5 ? CYAN : DIM, 11);
    sentence(ctx, step[2], x + 68, y + 52, PAPER, 180, 12);
    ctx.globalAlpha = 1;
    if (index < STEPS.length - 1 && stepsOn[index] > 0.75) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(x + 270, y + 42);
      ctx.lineTo(x + 282, y + 42);
      ctx.stroke();
    }
  });

  centerLabel(ctx, "05  Four generations", 32, 370, 1696, generations > 0.2 ? PAPER : DIM, 11);
  ctx.globalAlpha = 0.45 + generations * 0.55;
  frame(ctx, 32, 384, 1696, 96, "panel");
  ctx.globalAlpha = 1;
  const roles = [
    [PAPER, "Explorers", "Sample and test many alternatives."],
    [CYAN, "Nondominated", "Keep the trade-off set."],
    [COPPER, "Diversity", "Keep morphologies apart."],
  ] as const;
  roles.forEach((role, index) => {
    const y = 412 + index * 22;
    ctx.globalAlpha = generations;
    ctx.fillStyle = role[0];
    ctx.fillRect(52, y - 8, 8, 8);
    label(ctx, role[1], 70, y, role[0], 11);
    sentence(ctx, role[2], 210, y, DIM, 250, 12);
    ctx.globalAlpha = 1;
  });
  label(ctx, "Schematic", 500, 408, DIM, 11);
  MIX.forEach((generation, index) => {
    const amount = Math.max(0, Math.min(1, generations * MIX.length - index));
    const x = 620 + index * 260;
    ctx.globalAlpha = 0.25 + amount * 0.75;
    mass(ctx, x, 438, index + 1);
    ctx.globalAlpha = 1;
    let cursor = 0;
    [PAPER, CYAN, COPPER].forEach((color, part) => {
      const w = 78 * generation.parts[part] * amount;
      ctx.fillStyle = color;
      ctx.fillRect(x + cursor, 456, Math.max(0, w - 1), 5);
      cursor += w;
    });
    label(ctx, generation.name, x, 474, amount > 0.35 ? PAPER : DIM, 11);
    if (index < MIX.length - 1 && amount > 0.7) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(x + 150, 424);
      ctx.lineTo(x + 188, 424);
      ctx.stroke();
    }
  });
  ctx.restore();
}

/** The multiobjective introduction, in the order of a standard explanation, then this search. */
export function MooIntro() {
  const ref = useExplainFrame(paint, DURATION);
  return (
    <article className={styles.board} data-explain="">
      <canvas
        ref={ref}
        role="img"
        aria-label="Multiobjective optimization. Formal, Spatial, and Atmospheric are maximized separately, so the search looks for trade-offs rather than one winner. Dominated candidates sit inside a schematic Pareto front. The search defines those objectives, generates morphologies, evaluates all three scores, keeps the nondominated front, and varies the next generation from explorers, that front, and diversity. The lobby search repeats this for four generations and does not stop on a convergence test. The result is a set of trade-offs. The search does not choose the morphology. The chart is schematic, not a recorded generation."
      />
    </article>
  );
}
