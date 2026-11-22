"use client";

import { useExplainFrame } from "@/components/demo-workflow/explain-clock";
import { mulberry32 } from "@/lib/physarum";
import { translateArchetype } from "@/lib/skill1/translate";
import styles from "@/components/demo-workflow/agent-behavior.module.css";

const translation = translateArchetype("vertical-void");
const { params, recipe } = translation;
const sensorAngle = 0.32 + params.geometryVariation * 0.45;
const sensorDistance = 0.45 + params.influenceRadius * 0.035 + params.scaleVariation * 0.25;
const turnAngle = 0.22 + params.geometryVariation * 0.55;
const speed = 0.12 + params.permeability * 0.16;
const stepLength = speed * (0.7 + params.permeability * 0.35);
const depositBase = 0.05 + params.flowCoupling * 0.1;
const trailFollow = 0.48 + params.networkDensity * 0.85;
const pull = 0.16 + params.attractionStrength * 0.5;
const ringR = recipe.isolationRadius * (0.7 + params.scaleVariation * 0.12);
const sigma = Math.max(1.05, params.influenceRadius * 0.16);
const twoSigma = 2 * sigma * sigma;
const DECAY = 0.986;
const GRID = 80;
const SPAN = 20;
const DURATION = 8;

const CYAN = "#49d7de";
const INK = "#f2f2ee";
const PAPER = "rgba(255,255,255,0.86)";
const DIM = "rgba(255,255,255,0.46)";

type TrailPoint = { x: number; y: number };
type SceneKind = "sense" | "turn" | "move" | "deposit";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const cellOf = (value: number) => clamp(Math.floor((value / SPAN) * GRID), 0, GRID - 1);

function sample(field: Float32Array, x: number, y: number) {
  const gx = clamp((x / SPAN) * (GRID - 1), 0, GRID - 1);
  const gy = clamp((y / SPAN) * (GRID - 1), 0, GRID - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(GRID - 1, x0 + 1);
  const y1 = Math.min(GRID - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const at = (ix: number, iy: number) => field[iy * GRID + ix];
  return at(x0, y0) * (1 - tx) * (1 - ty) + at(x1, y0) * tx * (1 - ty) + at(x0, y1) * (1 - tx) * ty + at(x1, y1) * tx * ty;
}

function attraction(x: number, y: number) {
  const d = Math.hypot(x - recipe.attractor.x, y - recipe.attractor.y);
  const angle = Math.atan2(y - recipe.attractor.y, x - recipe.attractor.x);
  const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
  const radius = ringR * wobble;
  return params.attractionStrength * Math.exp(-((d - radius) * (d - radius)) / twoSigma);
}

function sense(field: Float32Array, x: number, y: number, heading: number) {
  const lookX = x + Math.cos(heading) * sensorDistance;
  const lookY = y + Math.sin(heading) * sensorDistance;
  const trail = sample(field, lookX, lookY);
  const core = Math.hypot(lookX - recipe.attractor.x, lookY - recipe.attractor.y);
  const angle = Math.atan2(lookY - recipe.attractor.y, lookX - recipe.attractor.x);
  const opening = 0.5 + 0.5 * Math.cos(angle * 2.05 + 0.4);
  const keep = recipe.isolationRadius * (0.28 + 0.24 * opening);
  if (core < keep) return trail * 0.08 - 0.95 - (keep - core) * 0.18;
  const toX = recipe.attractor.x - lookX;
  const toY = recipe.attractor.y - lookY;
  const mag = Math.hypot(toX, toY) || 1;
  const alignment = Math.max(0, (Math.cos(heading) * toX + Math.sin(heading) * toY) / mag);
  return trail * trailFollow + attraction(lookX, lookY) * pull + alignment * params.directionalBias;
}

function stamp(field: Float32Array, x0: number, y0: number, x1: number, y1: number, amount: number) {
  const span = Math.hypot(x1 - x0, y1 - y0);
  const marks = Math.max(1, Math.ceil(span / 0.12));
  for (let mark = 0; mark <= marks; mark += 1) {
    const t = mark / marks;
    const ix = cellOf(x0 + (x1 - x0) * t);
    const iy = cellOf(y0 + (y1 - y0) * t);
    field[iy * GRID + ix] = Math.min(1.8, field[iy * GRID + ix] + amount);
  }
}

const WANDER = 0.14 + params.geometryVariation * 1.2;

function bounce(x: number, y: number, heading: number) {
  let next = heading;
  if (x < 0.8 || x > SPAN - 0.8) next = Math.PI - next;
  if (y < 0.8 || y > SPAN - 0.8) next = -next;
  return next;
}

/** A population running the Vertical Void step. Each scene keeps the rule that cell is there to show. */
function population(kind: SceneKind) {
  const field = new Float32Array(GRID * GRID);
  const rng = mulberry32(kind === "sense" ? 351 : kind === "turn" ? 907 : kind === "move" ? 1204 : 441);
  const seed = recipe.attractor.x - recipe.isolationRadius * 0.95;
  const seedY = recipe.attractor.y + 1.4;
  if (kind === "sense" || kind === "deposit") {
    for (let arm = 0; arm < 16; arm += 1) {
      const angle = -0.9 + arm * 0.11;
      stamp(field, seed - 1.4, seedY, seed - 1.4 + Math.cos(angle) * 3.2, seedY + Math.sin(angle) * 1.4, 0.7);
    }
  }
  const count = kind === "move" ? 18 : 24;
  const steps = kind === "sense" ? 22 : kind === "turn" ? 56 : kind === "move" ? 42 : 64;
  const agents = Array.from({ length: count }, (_, index) => {
    const spread = kind === "sense" ? 1.6 : 6;
    const x = clamp(seed + (rng() - 0.5) * spread, 0.8, SPAN - 0.8);
    const y = clamp(seedY + (rng() - 0.5) * spread, 0.8, SPAN - 0.8);
    const heading = kind === "move" ? (index / count) * 1.4 - 0.4 : rng() * Math.PI * 2;
    return { x, y, heading, trail: [{ x, y }] as TrailPoint[] };
  });
  for (let step = 0; step < steps; step += 1) {
    for (let cell = 0; cell < field.length; cell += 1) field[cell] *= DECAY;
    agents.forEach((agent) => {
      const left = sense(field, agent.x, agent.y, agent.heading + sensorAngle);
      const forward = sense(field, agent.x, agent.y, agent.heading);
      const right = sense(field, agent.x, agent.y, agent.heading - sensorAngle);
      let turn = 0;
      if (kind === "turn") turn = (rng() - 0.5) * 2 * turnAngle;
      else if (kind === "move") turn = (rng() - 0.5) * 0.1;
      else if (left > forward && left > right) turn = turnAngle;
      else if (right > forward && right > left) turn = -turnAngle;
      else turn = (rng() - 0.5) * WANDER;
      agent.heading = bounce(agent.x, agent.y, agent.heading + turn);
      const fromX = agent.x;
      const fromY = agent.y;
      agent.x = clamp(agent.x + Math.cos(agent.heading) * stepLength, 0.5, SPAN - 0.5);
      agent.y = clamp(agent.y + Math.sin(agent.heading) * stepLength, 0.5, SPAN - 0.5);
      if (kind !== "turn") stamp(field, fromX, fromY, agent.x, agent.y, depositBase);
      agent.trail.push({ x: agent.x, y: agent.y });
    });
  }
  return agents.map((agent) => agent.trail);
}

const scenes = {
  sense: population("sense"),
  turn: population("turn"),
  move: population("move"),
  deposit: population("deposit"),
};

const frames = ["01  Sense", "02  Turn", "03  Move", "04  Deposit", "05  Decay"] as const;
const captions = [
  "Three samples. The stronger side leads.",
  "Heading turns toward that side.",
  "The step follows permeability.",
  "The step leaves a pale trail.",
  "Each step, the field fades.",
] as const;

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size: number) {
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "Arial Narrow", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value.toUpperCase(), x, y);
}

function viewOf(trails: TrailPoint[][], pad: number, extra: TrailPoint[] = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const include = (point: TrailPoint) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  };
  trails.forEach((trail) => trail.forEach(include));
  extra.forEach(include);
  const span = Math.max(maxX - minX, maxY - minY, 0.4) * pad;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, span };
}

function paint(ctx: CanvasRenderingContext2D, time: number, width: number, height: number) {
  const scale = Math.min(width / 1760, height / 496);
  const ox = (width - 1760 * scale) / 2;
  const oy = (height - 496 * scale) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 1760, 496);
  text(ctx, "Vertical Void · parameters set the agent", 24, 28, CYAN, 13);
  ctx.textAlign = "right";
  text(ctx, "Descriptors stay names. The spatial recipe is authored apart.", 1736, 28, DIM, 12);
  ctx.textAlign = "left";

  const phase = ((time % DURATION) + DURATION) % DURATION / DURATION;
  const fade = clamp(phase / 0.05, 0, 1) * clamp((1 - phase) / 0.05, 0, 1);
  const active = phase < 0.22 ? 0 : phase < 0.4 ? 1 : phase < 0.62 ? 2 : phase < 0.8 ? 3 : 4;
  const margin = 20;
  const gap = 16;
  const top = 48;
  const panelW = (1760 - margin * 2 - gap * 4) / 5;
  const panelH = 496 - top - 18;
  const panels = [
    { name: frames[0], caption: captions[0], trails: scenes.sense, mode: "sense" as const },
    { name: frames[1], caption: captions[1], trails: scenes.turn, mode: "turn" as const },
    { name: frames[2], caption: captions[2], trails: scenes.move, mode: "move" as const },
    { name: frames[3], caption: captions[3], trails: scenes.deposit, mode: "deposit" as const },
    { name: frames[4], caption: captions[4], trails: scenes.deposit, mode: "decay" as const },
  ];

  panels.forEach((panel, index) => {
    const x = margin + index * (panelW + gap);
    ctx.strokeStyle = index === active ? "rgba(73,215,222,0.85)" : "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + 0.5, panelW - 1, panelH - 1);
    text(ctx, panel.name, x + 12, top + 22, index === active ? CYAN : PAPER, 13);
    text(ctx, panel.caption, x + 12, top + panelH - 12, DIM, 11);
    const plot = { x: x + 14, y: top + 34, w: panelW - 28, h: panelH - 62 };
    const rays: TrailPoint[] = [];
    if (panel.mode === "sense") {
      panel.trails.forEach((trail) => {
        const head = trail[trail.length - 1];
        const prev = trail[Math.max(0, trail.length - 2)];
        const heading = Math.atan2(head.y - prev.y, head.x - prev.x);
        [sensorAngle, 0, -sensorAngle].forEach((offset) => {
          rays.push({ x: head.x + Math.cos(heading + offset) * sensorDistance, y: head.y + Math.sin(heading + offset) * sensorDistance });
        });
      });
    }
    const view = viewOf(panel.trails, panel.mode === "move" ? 1.2 : 1.32, rays);
    const fit = Math.min(plot.w, plot.h) * 0.92;
    const project = (point: TrailPoint) => ({
      x: plot.x + plot.w / 2 + ((point.x - view.cx) / view.span) * fit,
      y: plot.y + plot.h / 2 - ((point.y - view.cy) / view.span) * fit,
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    for (let grain = 0; grain < 220; grain += 1) {
      const unit = Math.sin((index + 1) * 19.7 + grain * 12.7) * 43758.5453;
      const unitA = unit - Math.floor(unit);
      const unitB = Math.sin(grain * 9.1 + 3.4) * 43758.5453;
      ctx.globalAlpha = 0.04 + unitA * 0.07;
      ctx.fillStyle = INK;
      ctx.fillRect(plot.x + 8 + unitA * (plot.w - 16), plot.y + 8 + (unitB - Math.floor(unitB)) * (plot.h - 16), 1.2, 1.2);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    panel.trails.forEach((trail, trailIndex) => {
      const along = clamp(phase, 0, 1) * (trail.length - 1);
      const last = Math.min(trail.length - 2, Math.floor(along));
      const mix = along - last;
      const head = {
        x: trail[last].x + (trail[last + 1].x - trail[last].x) * mix,
        y: trail[last].y + (trail[last + 1].y - trail[last].y) * mix,
      };
      if (panel.mode === "decay") {
        for (let pointIndex = 0; pointIndex < last; pointIndex += 1) {
          const age = last - pointIndex;
          const remain = DECAY ** (age * 2 + phase * 36);
          const from = project(trail[pointIndex]);
          const to = project(trail[pointIndex + 1]);
          ctx.globalAlpha = fade * remain * 0.85;
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
      } else {
        const ink = panel.mode === "deposit" ? 0.28 + phase * 0.5 : 0.62;
        ctx.globalAlpha = fade * ink;
        ctx.lineWidth = panel.mode === "deposit" ? 1.15 + phase * 0.7 : 1.5;
        ctx.beginPath();
        for (let pointIndex = 0; pointIndex <= last; pointIndex += 1) {
          const placed = project(trail[pointIndex]);
          if (pointIndex === 0) ctx.moveTo(placed.x, placed.y);
          else ctx.lineTo(placed.x, placed.y);
        }
        const placedHead = project(head);
        ctx.lineTo(placedHead.x, placedHead.y);
        ctx.stroke();
        if (panel.mode === "deposit") {
          for (let pointIndex = 0; pointIndex <= last; pointIndex += 3) {
            if ((trailIndex + pointIndex) % 2 === 0) continue;
            const placed = project(trail[pointIndex]);
            ctx.globalAlpha = fade * (0.25 + depositBase * 3);
            ctx.fillStyle = INK;
            ctx.beginPath();
            ctx.arc(placed.x, placed.y, 1.15, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (panel.mode === "sense" && trailIndex % 3 === 0) {
        const placedHead = project(head);
        const heading = Math.atan2(head.y - trail[last].y, head.x - trail[last].x);
        [sensorAngle, 0, -sensorAngle].forEach((offset) => {
          const end = project({
            x: head.x + Math.cos(heading + offset) * sensorDistance,
            y: head.y + Math.sin(heading + offset) * sensorDistance,
          });
          ctx.globalAlpha = fade * (offset === 0 ? 0.9 : 0.42);
          ctx.lineWidth = offset === 0 ? 1.2 : 1;
          ctx.beginPath();
          ctx.moveTo(placedHead.x, placedHead.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        });
      }
      if (panel.mode !== "decay" && phase > 0.02) {
        const placedHead = project(head);
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(placedHead.x, placedHead.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  });
  ctx.restore();
}

/** Experimental comparison page. The Parameter Map stays the other explanation. */
export function AgentBehaviorAlternative() {
  const ref = useExplainFrame(paint, DURATION);
  return (
    <article className={styles.board}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Agent behavior for Vertical Void. One repeating step senses the field on the left, forward, and right, turns toward the stronger reading, moves a step set by permeability, deposits a pale trail, then lets that trail decay. Descriptors remain stored names. The spatial recipe is authored separately."
      />
    </article>
  );
}
