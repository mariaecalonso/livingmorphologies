"use client";

import { DIRECTIONALITY_MAP, FIELD_SIZE, INTENSITY_MAP, RADIUS_MAP } from "@/lib/skill1/maps";
import { attractorFromRatings, sourceFromCorner, translateArchetype } from "@/lib/skill1/translate";
import type { GroupId } from "@/lib/types";
import type { TranslationTrace } from "@/lib/skill1/types";
import { useExplainFrame } from "@/components/demo-workflow/explain-clock";
import styles from "@/components/demo-workflow/simulation-logic.module.css";

const DURATION = 8;
/** The recording named by the saved Vertical Void catalog run, analysis run 23. */
const VERTICAL_VOID_GROWTH = "/assets/skill0/void-growth-2.gif";
let growthFrames: ImageBitmap[] | null = null;
let growthStarted = false;

function ensureGrowth() {
  if (growthStarted || typeof window === "undefined" || typeof ImageDecoder === "undefined") return;
  growthStarted = true;
  void (async () => {
    try {
      const response = await fetch(VERTICAL_VOID_GROWTH);
      if (!response.ok) return;
      const decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: "image/gif" });
      await decoder.tracks.ready;
      const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
      const frames: ImageBitmap[] = [];
      for (let index = 0; index < count; index += 1) {
        const { image } = await decoder.decode({ frameIndex: index });
        frames.push(await createImageBitmap(image));
        image.close();
      }
      if (frames.length) growthFrames = frames;
    } catch {
      growthFrames = null;
    }
  })();
}

function drawGrowth(ctx: CanvasRenderingContext2D, box: Box, time: number) {
  const frames = growthFrames;
  if (!frames?.length) return false;
  const index = Math.min(frames.length - 1, Math.floor(cycle(time) * frames.length));
  const image = frames[index];
  if (!image) return false;
  const pad = 10;
  const scale = Math.min((box.w - pad * 2) / image.width, (box.h - pad * 2) / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, box.x + (box.w - width) / 2, box.y + (box.h - height) / 2, width, height);
  return true;
}
const ARCHETYPE = translateArchetype("vertical-void");
const TRACES = ARCHETYPE.traces.filter(
  (trace): trace is TranslationTrace & { category: GroupId } =>
    trace.category === "formal" || trace.category === "spatial" || trace.category === "atmospheric",
);

const CYAN = "#49d7de";
const COPPER = "#c77e5f";
const PAPER = "rgba(255,255,255,0.86)";
const DIM = "rgba(255,255,255,0.46)";
const GROUP_COLOR: Record<GroupId, string> = {
  formal: COPPER,
  spatial: PAPER,
  atmospheric: CYAN,
};

const SOURCE = sourceFromCorner(ARCHETYPE.recipe.sourceCorner, FIELD_SIZE);
const ATTRACTOR = attractorFromRatings(ARCHETYPE, FIELD_SIZE);

function num(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** The three ratings and the number each one writes. Same tables as the translation. */
function ratingSteps(trace: TranslationTrace) {
  if (trace.target === "influenceRadius") return [0, 1, 2].map((rating) => num(RADIUS_MAP[rating as 0 | 1 | 2]));
  if (trace.target === "directionalBias") return [0, 1, 2].map((rating) => num(DIRECTIONALITY_MAP[rating as 0 | 1 | 2]));
  if (trace.target === "attractorPosition") {
    const center = { x: (FIELD_SIZE - 1) / 2, y: (FIELD_SIZE - 1) / 2 };
    const span = Math.hypot(center.x - SOURCE.x, center.y - SOURCE.y);
    return ([0, 1, 2] as const).map((rating) => {
      const point = attractorFromRatings({ ...ARCHETYPE, ratings: { ...ARCHETYPE.ratings, centrality: rating } }, FIELD_SIZE);
      return span ? num(Math.hypot(point.x - SOURCE.x, point.y - SOURCE.y) / span) : "0";
    });
  }
  return [0, 1, 2].map((rating) => num(INTENSITY_MAP[rating as 0 | 1 | 2]));
}

/** The parameter's name as the Lab writes it. */
const LAB_PARAMETER_NAME: Record<string, string> = {
  geometryVariation: "Geometry variation",
  scaleVariation: "Scale variation",
  attractorPosition: "Attractor",
  permeability: "Permeability",
  networkDensity: "Network density",
  directionalBias: "Directional bias",
  attractionStrength: "Attraction strength",
  influenceRadius: "Influence radius",
  sourcePermeability: "Source permeability",
};

function parameterName(trace: TranslationTrace) {
  return LAB_PARAMETER_NAME[trace.target] ?? trace.target;
}

function parameterValue(trace: TranslationTrace) {
  if (trace.target === "attractorPosition") return `(${num(ATTRACTOR.x)}, ${num(ATTRACTOR.y)})`;
  if (trace.target === "influenceRadius") return `${num(trace.biologicalValue)} cells`;
  return num(trace.biologicalValue);
}

function parameterFor(trace: TranslationTrace) {
  return `${parameterName(trace)} ${parameterValue(trace)}`;
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

function cycle(time: number) {
  return (((time % DURATION) + DURATION) % DURATION) / DURATION;
}

function wrap(angle: number) {
  const turn = Math.PI * 2;
  let value = angle % turn;
  if (value <= -Math.PI) value += turn;
  if (value > Math.PI) value -= turn;
  return value;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.letterSpacing = "0.12em";
  ctx.fillText(value.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

function linesFor(ctx: CanvasRenderingContext2D, value: string, width: number, size: number, tracking: string, limit: number) {
  ctx.font = `500 ${size}px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
  ctx.letterSpacing = tracking;
  const words = value.split(" ");
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
  ctx.letterSpacing = "0px";
  return lines.slice(0, limit);
}

type Box = { x: number; y: number; w: number; h: number };

function fieldPoint(box: Box, x: number, y: number) {
  const pad = 14;
  const span = Math.min(box.w, box.h) - pad * 2;
  const left = box.x + (box.w - span) / 2;
  const top = box.y + (box.h - span) / 2;
  const scale = span / (FIELD_SIZE - 1);
  return { x: left + x * scale, y: top + span - y * scale };
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function clipBox(ctx: CanvasRenderingContext2D, box: Box) {
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
}

function frame(ctx: CanvasRenderingContext2D, box: Box) {
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
}

function wander(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const points: { x: number; y: number }[] = [];
  let x = box.x + 16;
  let y = box.y + box.h * 0.55;
  let heading = -0.15;
  for (let step = 0; step < 90; step += 1) {
    const wobble = Math.sin(step * 0.55) * 0.7 + Math.sin(step * 1.37) * 0.3;
    heading = wrap(heading + wobble * amount * 0.55);
    x += Math.cos(heading) * 4.1;
    y += Math.sin(heading) * 3.2;
    if (x > box.x + box.w - 14 || x < box.x + 14) heading = Math.PI - heading;
    if (y > box.y + box.h - 14 || y < box.y + 14) heading = -heading;
    x = clamp(x, box.x + 12, box.x + box.w - 12);
    y = clamp(y, box.y + 12, box.y + box.h - 12);
    points.push({ x, y });
  }
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(box.x + 16, box.y + box.h * 0.55);
  ctx.lineTo(box.x + box.w - 16, box.y + box.h * 0.55);
  ctx.stroke();
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  points.forEach((point, step) => (step === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.stroke();
  const cursorAt = Math.max(0, Math.min(points.length - 1, Math.floor(cycle(time) * (points.length - 1))));
  const cursor = points[cursorAt];
  if (cursor) dot(ctx, cursor.x, cursor.y, 3.2, "#ffffff");
}

function scaleField(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const mid = box.y + box.h * 0.72;
  const width = box.w * (0.22 + amount * 0.7);
  const sweep = cycle(time) * box.w;
  ctx.beginPath();
  for (let x = 0; x <= box.w; x += 2) {
    const u = (x - box.w / 2) / width;
    const y = mid - Math.exp(-u * u) * box.h * 0.5;
    if (x === 0) ctx.moveTo(box.x + x, y);
    else ctx.lineTo(box.x + x, y);
  }
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.strokeStyle = "rgba(199,126,95,0.35)";
  ctx.beginPath();
  ctx.moveTo(box.x + box.w / 2 - width, mid);
  ctx.lineTo(box.x + box.w / 2 + width, mid);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.moveTo(box.x + sweep, box.y + 12);
  ctx.lineTo(box.x + sweep, box.y + box.h - 12);
  ctx.stroke();
}

function placeAttractor(ctx: CanvasRenderingContext2D, box: Box, time: number) {
  const source = fieldPoint(box, SOURCE.x, SOURCE.y);
  const center = fieldPoint(box, (FIELD_SIZE - 1) / 2, (FIELD_SIZE - 1) / 2);
  const attractor = fieldPoint(box, ATTRACTOR.x, ATTRACTOR.y);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(source.x, source.y);
  ctx.lineTo(center.x, center.y);
  ctx.stroke();
  ctx.setLineDash([]);
  dot(ctx, center.x, center.y, 2, "rgba(255,255,255,0.4)");
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(attractor.x, attractor.y, 8, 0, Math.PI * 2);
  ctx.stroke();
  const phase = cycle(time);
  dot(ctx, source.x + (attractor.x - source.x) * phase, source.y + (attractor.y - source.y) * phase, 3, "#ffffff");
  dot(ctx, source.x, source.y, 2.4, COPPER);
}

function permeability(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const phase = cycle(time);
  const y = box.y + box.h * 0.5;
  for (let i = 0; i < 4; i += 1) {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(box.x + 18 + i * 28, y - 16, 14, 32);
  }
  const travel = box.w - 28;
  dot(ctx, box.x + 14 + phase * travel, y, 3.2, "#ffffff");
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(box.x + 14, y);
  ctx.lineTo(box.x + 14 + phase * travel * (0.45 + amount * 0.55), y);
  ctx.stroke();
}

function linking(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const trail = Array.from({ length: 8 }, (_, index) => ({
    x: box.x + 16 + index * ((box.w - 32) / 7),
    y: box.y + box.h * 0.62 + Math.sin(index * 0.8) * 18,
  }));
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  trail.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.stroke();
  [0.15, 0.55].forEach((offset, index) => {
    const phase = (cycle(time) + offset) % 1;
    const along = phase * (trail.length - 1);
    const i = clamp(Math.floor(along), 0, trail.length - 2);
    const mix = along - i;
    const on = {
      x: trail[i].x + (trail[i + 1].x - trail[i].x) * mix,
      y: trail[i].y + (trail[i + 1].y - trail[i].y) * mix,
    };
    const loose = box.y + (index === 0 ? 28 : box.h - 28);
    dot(ctx, on.x, on.y * amount + loose * (1 - amount), 3, "#ffffff");
  });
}

function direction(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const start = { x: box.x + 18, y: box.y + box.h * 0.72 };
  const ahead = { x: box.x + box.w - 18, y: start.y };
  const attractor = { x: box.x + box.w * 0.72, y: box.y + 22 };
  const aim = {
    x: ahead.x + (attractor.x - ahead.x) * amount,
    y: ahead.y + (attractor.y - ahead.y) * amount,
  };
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(ahead.x, ahead.y);
  ctx.stroke();
  ctx.strokeStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(aim.x, aim.y);
  ctx.stroke();
  const phase = cycle(time);
  dot(ctx, start.x + (aim.x - start.x) * phase, start.y + (aim.y - start.y) * phase, 3, "#ffffff");
  ctx.strokeStyle = COPPER;
  ctx.strokeRect(attractor.x - 4, attractor.y - 4, 8, 8);
}

function pull(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const start = { x: box.x + 16, y: box.y + box.h - 22 };
  const attractor = { x: box.x + box.w - 24, y: box.y + 24 };
  const bend = { x: box.x + box.w * (0.7 - amount * 0.28), y: box.y + box.h * (0.75 - amount * 0.4) };
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(bend.x, bend.y, attractor.x, attractor.y);
  ctx.stroke();
  const phase = cycle(time);
  const u = 1 - phase;
  const x = u * u * start.x + 2 * u * phase * bend.x + phase * phase * attractor.x;
  const y = u * u * start.y + 2 * u * phase * bend.y + phase * phase * attractor.y;
  dot(ctx, x, y, 3, "#ffffff");
  ctx.strokeStyle = CYAN;
  ctx.beginPath();
  ctx.arc(attractor.x, attractor.y, 7, 0, Math.PI * 2);
  ctx.stroke();
}

function reach(ctx: CanvasRenderingContext2D, box: Box, radius: number, time: number) {
  const center = fieldPoint(box, (FIELD_SIZE - 1) / 2, (FIELD_SIZE - 1) / 2);
  const edge = fieldPoint(box, (FIELD_SIZE - 1) / 2 + radius, (FIELD_SIZE - 1) / 2);
  const span = Math.hypot(edge.x - center.x, edge.y - center.y);
  ctx.strokeStyle = "rgba(73,215,222,0.35)";
  ctx.beginPath();
  ctx.arc(center.x, center.y, span, 0, Math.PI * 2);
  ctx.stroke();
  const phase = cycle(time);
  const agent = fieldPoint(box, 2 + phase * 15, 4 + Math.sin(phase * Math.PI * 2) * 2);
  const inside = Math.hypot(agent.x - center.x, agent.y - center.y) <= span;
  dot(ctx, agent.x, agent.y, 3, inside ? CYAN : "rgba(255,255,255,0.45)");
  dot(ctx, center.x, center.y, 2.5, CYAN);
}

function leaving(ctx: CanvasRenderingContext2D, box: Box, amount: number, time: number) {
  const source = { x: box.x + 22, y: box.y + box.h - 22 };
  ctx.strokeStyle = CYAN;
  ctx.strokeRect(source.x - 10, source.y - 10, 20, 20);
  for (let i = 0; i < 3; i += 1) {
    const phase = (cycle(time) + i / 3) % 1;
    const travel = phase * amount;
    dot(ctx, source.x + travel * (box.w * 0.7), source.y - travel * (box.h * 0.62), 2.8, "#ffffff");
  }
}

function seeded(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

type Pt = { x: number; y: number };

function quadPoints(start: Pt, control: Pt, end: Pt, steps = 36): Pt[] {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps;
    const u = 1 - t;
    return { x: u * u * start.x + 2 * u * t * control.x + t * t * end.x, y: u * u * start.y + 2 * u * t * control.y + t * t * end.y };
  });
}

/** The pale grain of a generation field. */
function grainField(ctx: CanvasRenderingContext2D, box: Box, count: number) {
  for (let grain = 0; grain < count; grain += 1) {
    ctx.fillStyle = "#f2f2ee";
    ctx.globalAlpha = 0.04 + seeded(grain * 3.1) * 0.07;
    ctx.fillRect(box.x + 8 + seeded(grain * 7.3) * (box.w - 16), box.y + 8 + seeded(grain * 11.7) * (box.h - 16), 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
}

/**
 * Draws one agent's whole trail in a single stroke, grown to a fractional progress
 * so the head moves continuously, with deposits along it. The trail fades in at the
 * start of the cycle and out at the end, so the loop does not snap.
 */
function strokeTrail(ctx: CanvasRenderingContext2D, points: Pt[], progress: number, seedBase: number): Pt | null {
  if (points.length < 2 || progress <= 0) return points[0] ?? null;
  const fade = clamp(progress / 0.05, 0, 1) * clamp((1 - progress) / 0.05, 0, 1);
  const along = clamp(progress, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(along));
  const mix = along - index;
  const head = {
    x: points[index].x + (points[index + 1].x - points[index].x) * mix,
    y: points[index].y + (points[index + 1].y - points[index].y) * mix,
  };
  ctx.strokeStyle = "#f2f2ee";
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.62 * fade;
  ctx.beginPath();
  points.slice(0, index + 1).forEach((point, step) => (step === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  ctx.globalAlpha = 0.55 * fade;
  for (let step = 0; step <= index; step += 3) {
    if (seeded(seedBase + step) > 0.3) dot(ctx, points[step].x, points[step].y, 1.1, "#f2f2ee");
  }
  ctx.globalAlpha = fade;
  if (progress > 0.02) dot(ctx, head.x, head.y, 1.8, "#ffffff");
  ctx.globalAlpha = 1;
  return head;
}

/** One small iteration per parameter, showing only what that parameter does. */
function drawParameterSimulation(ctx: CanvasRenderingContext2D, trace: TranslationTrace, box: Box, time: number) {
  const amount = trace.biologicalValue;
  const phase = cycle(time);

  if (trace.target === "geometryVariation") {
    // A generation iteration: many agents lay speckled trails as they wander.
    grainField(ctx, box, 380);
    const steps = 52;
    for (let agent = 0; agent < 96; agent += 1) {
      let x = box.x + 14 + seeded(agent * 17 + 2) * (box.w - 28);
      let y = box.y + 14 + seeded(agent * 23 + 5) * (box.h - 28);
      let heading = seeded(agent * 31 + 7) * Math.PI * 2;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        heading = wrap(heading + (seeded(agent * 991 + step * 17) - 0.5) * 1.6 * amount + Math.sin(step * 0.35 + agent * 1.7) * 0.12);
        x += Math.cos(heading) * 2.4;
        y += Math.sin(heading) * 2.4;
        if (x > box.x + box.w - 10 || x < box.x + 10) heading = Math.PI - heading;
        if (y > box.y + box.h - 10 || y < box.y + 10) heading = -heading;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 557);
    }
    return;
  }

  if (trace.target === "scaleVariation") {
    // Agents feel the attractor through a field of this width: inside it they turn in, outside it they drift.
    grainField(ctx, box, 260);
    const center = { x: box.x + box.w / 2, y: box.y + box.h * 0.44 };
    const sigma = box.w * (0.2 + amount * 0.32);
    ctx.strokeStyle = "#f2f2ee";
    [1, 1.7].forEach((ring) => {
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, sigma * ring, sigma * ring * 0.68, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    const steps = 44;
    for (let agent = 0; agent < 72; agent += 1) {
      let x = box.x + 12 + seeded(agent * 41 + 3) * (box.w - 24);
      let y = box.y + 12 + seeded(agent * 43 + 6) * (box.h - 24);
      let heading = Math.atan2(center.y - y, center.x - x) + (seeded(agent * 47 + 1) - 0.5) * 1.6;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        const distance = Math.hypot(center.x - x, center.y - y);
        const pull = Math.exp(-(distance * distance) / (2 * sigma * sigma));
        const desired = Math.atan2(center.y - y, center.x - x);
        heading = wrap(heading + wrap(desired - heading) * (0.03 + pull * 0.24) + (seeded(agent * 601 + step * 7) - 0.5) * 0.2);
        x += Math.cos(heading) * 2.3;
        y += Math.sin(heading) * 2.3;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 613);
    }
    dot(ctx, center.x, center.y, 2.4, "#ffffff");
    return;
  }

  if (trace.target === "attractorPosition") {
    // Agents leave the source and their trails gather on the attractor at the field centre.
    grainField(ctx, box, 260);
    const source = fieldPoint(box, SOURCE.x, SOURCE.y);
    const attractor = fieldPoint(box, ATTRACTOR.x, ATTRACTOR.y);
    const steps = 56;
    for (let agent = 0; agent < 84; agent += 1) {
      let x = clamp(source.x + (seeded(agent * 61 + 1) - 0.5) * 30, box.x + 8, box.x + box.w - 8);
      let y = clamp(source.y + (seeded(agent * 67 + 4) - 0.5) * 30, box.y + 8, box.y + box.h - 8);
      let heading = Math.atan2(attractor.y - y, attractor.x - x) + (seeded(agent * 71 + 2) - 0.5) * 1.1;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        const desired = Math.atan2(attractor.y - y, attractor.x - x);
        heading = wrap(heading + wrap(desired - heading) * 0.13 + (seeded(agent * 701 + step * 11) - 0.5) * 0.24);
        x += Math.cos(heading) * 2.5;
        y += Math.sin(heading) * 2.5;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 719);
    }
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(attractor.x, attractor.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2f2ee";
    ctx.beginPath();
    ctx.arc(attractor.x, attractor.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(source.x - 5, source.y - 5, 10, 10);
    return;
  }

  if (trace.target === "permeability") {
    // Nothing impedes them: agents take long steps and their trails cross the whole field.
    grainField(ctx, box, 220);
    const steps = 48;
    for (let agent = 0; agent < 80; agent += 1) {
      let x = box.x + 8;
      let y = box.y + 12 + seeded(agent * 131 + 3) * (box.h - 24);
      let heading = (seeded(agent * 137 + 5) - 0.5) * 0.55;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        heading = wrap(heading + (seeded(agent * 139 + step * 7) - 0.5) * 0.16);
        x += Math.cos(heading) * (2.4 + amount * 1.4);
        y += Math.sin(heading) * (2.4 + amount * 1.4);
        if (y > box.y + box.h - 10 || y < box.y + 10) heading = -heading;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 149);
    }
    return;
  }

  if (trace.target === "networkDensity") {
    // Agents sense the trails already laid and join them, so a few routes thicken and brighten.
    grainField(ctx, box, 150);
    const routes = [0, 1, 2].map((route) => {
      const start = { x: box.x + 10, y: box.y + box.h * (0.3 + route * 0.18) };
      const end = { x: box.x + box.w - 10, y: box.y + box.h * (0.62 - route * 0.14) };
      const control = { x: box.x + box.w * (0.42 + route * 0.08), y: box.y + box.h * (0.24 + seeded(route * 31) * 0.5) };
      return quadPoints(start, control, end, 44);
    });
    const routeAt = (route: Pt[], t: number) => route[clamp(Math.round(t * (route.length - 1)), 0, route.length - 1)];
    const steps = 44;
    for (let agent = 0; agent < 66; agent += 1) {
      const route = routes[agent % routes.length];
      const points: Pt[] = [];
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const on = routeAt(route, t);
        const offset = (seeded(agent * 157 + 2) - 0.5) * 30 * (1 - t * (0.35 + amount * 0.55));
        points.push({ x: on.x, y: on.y + offset });
      }
      strokeTrail(ctx, points, phase, agent * 163);
    }
    // Followed trails accumulate deposits and read brighter than the field around them.
    routes.forEach((route, routeIndex) => {
      for (let speck = 0; speck < 46; speck += 1) {
        const seed = routeIndex * 211 + speck * 17.3;
        const appear = seeded(seed);
        if (appear > phase) continue;
        const on = routeAt(route, seeded(speck * 23.7 + routeIndex));
        ctx.globalAlpha = (0.3 + seeded(seed + 4) * 0.55) * clamp((phase - appear) * 6, 0, 1) * clamp((1 - phase) / 0.05, 0, 1);
        dot(ctx, on.x + (seeded(seed + 8) - 0.5) * 3, on.y + (seeded(seed + 12) - 0.5) * 3, 1.35, "#f2f2ee");
      }
    });
    ctx.globalAlpha = 1;
    return;
  }

  if (trace.target === "directionalBias") {
    // Every heading is blended part-way toward the attractor, so trails start scattered and bend in.
    grainField(ctx, box, 200);
    const attractor = fieldPoint(box, ATTRACTOR.x, ATTRACTOR.y);
    const steps = 50;
    for (let agent = 0; agent < 76; agent += 1) {
      let x = box.x + 10 + seeded(agent * 167 + 3) * (box.w - 20);
      let y = box.y + 10 + seeded(agent * 173 + 6) * (box.h - 20);
      let heading = seeded(agent * 179 + 1) * Math.PI * 2;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        const desired = Math.atan2(attractor.y - y, attractor.x - x);
        heading = wrap(heading + wrap(desired - heading) * amount * 0.22 + (seeded(agent * 181 + step * 7) - 0.5) * 0.14);
        x += Math.cos(heading) * 2.4;
        y += Math.sin(heading) * 2.4;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 191);
    }
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(attractor.x, attractor.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2f2ee";
    ctx.beginPath();
    ctx.arc(attractor.x, attractor.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (trace.target === "attractionStrength") {
    // The pull out-scores the trails: agents are diverted hard onto the ring around the void and pile up there.
    grainField(ctx, box, 200);
    const center = { x: box.x + box.w / 2, y: box.y + box.h * 0.48 };
    const voidScale = ARCHETYPE.params.scaleVariation;
    const rx = box.w * (0.18 + voidScale * 0.18);
    const ry = box.h * (0.21 + voidScale * 0.18);
    const steps = 48;
    for (let agent = 0; agent < 78; agent += 1) {
      let x = box.x + 10 + seeded(agent * 193 + 3) * (box.w - 20);
      let y = box.y + 10 + seeded(agent * 197 + 6) * (box.h - 20);
      const startAngle = Math.atan2((y - center.y) / ry, (x - center.x) / rx);
      if (Math.hypot((x - center.x) / rx, (y - center.y) / ry) < 1.25) {
        x = center.x + Math.cos(startAngle) * rx * 1.5;
        y = center.y + Math.sin(startAngle) * ry * 1.5;
      }
      const target = { x: center.x + Math.cos(startAngle) * rx, y: center.y + Math.sin(startAngle) * ry };
      let heading = seeded(agent * 199 + 1) * Math.PI * 2;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        const desired = Math.atan2(target.y - y, target.x - x);
        heading = wrap(heading + wrap(desired - heading) * (0.04 + amount * 0.22) + (seeded(agent * 211 + step * 7) - 0.5) * 0.12);
        x += Math.cos(heading) * 2.5;
        y += Math.sin(heading) * 2.5;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 223);
    }
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // Strong pull, heavy accumulation: the ring fills early and reads brightest on the page.
    for (let speck = 0; speck < 170; speck += 1) {
      const appear = seeded(speck * 227.3) / 1.25;
      if (appear > phase) continue;
      const angle = seeded(speck * 229.7) * Math.PI * 2;
      const edge = 1.02 + seeded(speck * 233.1) * 0.13;
      ctx.globalAlpha = (0.4 + seeded(speck * 239.9) * 0.6) * clamp((phase - appear) * 6, 0, 1) * clamp((1 - phase) / 0.05, 0, 1);
      dot(ctx, center.x + Math.cos(angle) * rx * edge, center.y + Math.sin(angle) * ry * edge, 1.45, "#f2f2ee");
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (trace.target === "influenceRadius") {
    // The pull reaches this far: agents cross the field straight until they enter its range, then they turn in.
    grainField(ctx, box, 180);
    const center = fieldPoint(box, (FIELD_SIZE - 1) / 2, (FIELD_SIZE - 1) / 2);
    const edge = fieldPoint(box, (FIELD_SIZE - 1) / 2 + amount, (FIELD_SIZE - 1) / 2);
    const span = Math.hypot(edge.x - center.x, edge.y - center.y);
    ctx.strokeStyle = "#f2f2ee";
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(center.x, center.y, span, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const steps = 52;
    for (let agent = 0; agent < 72; agent += 1) {
      let x = box.x + 8;
      let y = box.y + 12 + seeded(agent * 241 + 3) * (box.h - 24);
      let heading = (seeded(agent * 251 + 5) - 0.5) * 0.5;
      const points: Pt[] = [{ x, y }];
      for (let step = 1; step <= steps; step += 1) {
        const distance = Math.hypot(center.x - x, center.y - y);
        if (distance <= span) {
          const desired = Math.atan2(center.y - y, center.x - x);
          heading = wrap(heading + wrap(desired - heading) * 0.2);
        }
        x += Math.cos(heading) * 2.5;
        y += Math.sin(heading) * 2.5;
        if (y > box.y + box.h - 10 || y < box.y + 10) heading = -heading;
        x = clamp(x, box.x + 8, box.x + box.w - 8);
        y = clamp(y, box.y + 8, box.y + box.h - 8);
        points.push({ x, y });
      }
      strokeTrail(ctx, points, phase, agent * 257);
    }
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2f2ee";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // sourcePermeability: agents are seeded at the source and leave it into the field, fanning out as they go.
  grainField(ctx, box, 160);
  const source = fieldPoint(box, SOURCE.x, SOURCE.y);
  const steps = 56;
  for (let agent = 0; agent < 84; agent += 1) {
    const delay = seeded(agent * 263 + 2) * 0.4;
    const local = clamp((phase - delay) / (1 - delay), 0, 1);
    if (local <= 0) continue;
    let x = clamp(source.x + (seeded(agent * 269 + 1) - 0.5) * 14, box.x + 8, box.x + box.w - 8);
    let y = clamp(source.y + (seeded(agent * 271 + 4) - 0.5) * 14, box.y + 8, box.y + box.h - 8);
    const toward = Math.atan2(box.y + box.h * 0.3 - y, box.x + box.w * 0.8 - x);
    let heading = toward + (seeded(agent * 277 + 6) - 0.5) * (0.5 + amount * 0.9);
    const points: Pt[] = [{ x, y }];
    for (let step = 1; step <= steps; step += 1) {
      heading = wrap(heading + (seeded(agent * 281 + step * 7) - 0.5) * 0.2);
      x += Math.cos(heading) * 2.5;
      y += Math.sin(heading) * 2.5;
      if (x > box.x + box.w - 10 || x < box.x + 10) heading = Math.PI - heading;
      if (y > box.y + box.h - 10 || y < box.y + 10) heading = -heading;
      x = clamp(x, box.x + 8, box.x + box.w - 8);
      y = clamp(y, box.y + 8, box.y + box.h - 8);
      points.push({ x, y });
    }
    strokeTrail(ctx, points, local, agent * 283);
  }
  ctx.strokeStyle = "#f2f2ee";
  ctx.strokeRect(source.x - 6, source.y - 6, 12, 12);
}

/** Low, Medium, High, with the rating's number. The lit cell is the parameter this criterion writes. */
function drawRatingMap(ctx: CanvasRenderingContext2D, x: number, w: number, y: number, trace: TranslationTrace, color: string, time: number) {
  const steps = ratingSteps(trace);
  const names = ["Low", "Med", "High"];
  const gap = 5;
  const cell = (w - gap * 2) / 3;
  const pulse = 0.12 + (Math.sin(cycle(time) * Math.PI * 2) * 0.5 + 0.5) * 0.2;
  steps.forEach((mark, index) => {
    const left = x + index * (cell + gap);
    const on = index === trace.rating;
    ctx.strokeStyle = on ? color : "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, y + 0.5, cell - 1, 32);
    if (on) {
      ctx.fillStyle = color;
      ctx.globalAlpha = pulse;
      ctx.fillRect(left, y, cell, 32);
      ctx.globalAlpha = 1;
    }
    text(ctx, names[index] ?? "", left + 4, y + 12, on ? color : DIM, 8);
    text(ctx, mark, left + 4, y + 26, on ? color : PAPER, 11);
  });
}

function drawTrace(ctx: CanvasRenderingContext2D, trace: TranslationTrace, box: Box, time: number, variant: "behavior" | "parameter" = "behavior") {
  ctx.save();
  clipBox(ctx, box);
  if (variant === "parameter") {
    drawParameterSimulation(ctx, trace, box, time);
    ctx.restore();
    frame(ctx, box);
    return;
  }
  const recorded = drawGrowth(ctx, box, time);
  const amount = trace.biologicalValue;
  if (recorded) {
    ctx.restore();
    frame(ctx, box);
    return;
  }
  if (trace.target === "geometryVariation") wander(ctx, box, amount, time);
  else if (trace.target === "scaleVariation") scaleField(ctx, box, amount, time);
  else if (trace.target === "attractorPosition") placeAttractor(ctx, box, time);
  else if (trace.target === "permeability") permeability(ctx, box, amount, time);
  else if (trace.target === "networkDensity") linking(ctx, box, amount, time);
  else if (trace.target === "directionalBias") direction(ctx, box, amount, time);
  else if (trace.target === "attractionStrength") pull(ctx, box, amount, time);
  else if (trace.target === "influenceRadius") reach(ctx, box, amount, time);
  else if (trace.target === "sourcePermeability") leaving(ctx, box, amount, time);
  ctx.restore();
  frame(ctx, box);
}

function paint(ctx: CanvasRenderingContext2D, time: number, width: number, height: number, variant: "behavior" | "parameter") {
  const scale = Math.min(width / 1760, height / 496);
  const ox = (width - 1760 * scale) / 2;
  const oy = (height - 496 * scale) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 1760, 496);
  text(ctx, variant !== "parameter" && growthFrames?.length ? "Vertical Void · run 23" : "Vertical Void", 24, 28, CYAN, 13);
  text(
    ctx,
    variant === "parameter" ? "Ratings write parameters. Descriptors are names." : "The behaviour is the parameter it sets",
    1760 - 24,
    28,
    DIM,
    12,
    "right",
  );

  const groups: GroupId[] = ["formal", "spatial", "atmospheric"];
  const margin = 24;
  const groupGap = 28;
  const innerGap = 12;
  const groupW = (1760 - margin * 2 - groupGap * 2) / 3;
  groups.forEach((group, groupIndex) => {
    const traces = TRACES.filter((trace) => trace.category === group);
    const left = margin + groupIndex * (groupW + groupGap);
    const color = GROUP_COLOR[group];
    ctx.font = `500 11px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
    ctx.letterSpacing = "0.1em";
    ctx.fillStyle = color;
    const title = group.toUpperCase();
    ctx.fillText(title, left, 58);
    ctx.fillText((traces[0]?.descriptor ?? "").toUpperCase(), left + ctx.measureText(title).width + 18, 58);
    ctx.letterSpacing = "0px";
    traces.forEach((trace, index) => {
      const colW = (groupW - innerGap * 2) / 3;
      const x = left + index * (colW + innerGap);
      text(ctx, trace.criterion, x, 82, PAPER, 12);
      text(ctx, trace.ratingLabel, x, 100, color, 11);
      const box = { x, y: 114, w: colW, h: 236 };
      drawTrace(ctx, trace, box, time, variant);
      if (variant === "parameter") {
        const cx = x + colW / 2;
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.moveTo(cx, 352);
        ctx.lineTo(cx, 359);
        ctx.moveTo(cx - 3, 356);
        ctx.lineTo(cx, 360);
        ctx.lineTo(cx + 3, 356);
        ctx.stroke();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 352, colW, 130);
      ctx.clip();
      if (variant === "parameter") {
        drawRatingMap(ctx, x, colW - 4, 366, trace, color, time);
        text(ctx, parameterName(trace), x, 418, color, 10);
        ctx.fillStyle = PAPER;
        ctx.font = `500 13px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
        ctx.fillText(parameterValue(trace), x, 436);
      } else {
        const label = linesFor(ctx, trace.biologicalLabel.toUpperCase(), colW - 4, 11, "0px", 2);
        ctx.fillStyle = color;
        ctx.font = `500 11px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
        label.forEach((line, lineIndex) => ctx.fillText(line, x, 368 + lineIndex * 13));
        text(ctx, parameterName(trace), x, 404, color, 10);
        ctx.fillStyle = PAPER;
        ctx.font = `500 13px "acumin-variable", "Arial Narrow", Helvetica, Arial, sans-serif`;
        ctx.fillText(parameterValue(trace), x, 422);
      }
      ctx.restore();
    });
  });
  if (variant === "parameter") {
    text(ctx, "The spatial recipe is authored for each archetype. It is not computed from the descriptor.", 24, 478, DIM, 11);
  }
  ctx.restore();
}

function paintBehavior(ctx: CanvasRenderingContext2D, time: number, width: number, height: number) {
  paint(ctx, time, width, height, "behavior");
}

function paintParameters(ctx: CanvasRenderingContext2D, time: number, width: number, height: number) {
  paint(ctx, time, width, height, "parameter");
}

/** Vertical Void's criteria, each playing as the biological behavior it sets. */
export function SimulationLogic() {
  ensureGrowth();
  const ref = useExplainFrame(paintBehavior, DURATION);
  const summary = TRACES.map((trace) => `${trace.criterion} ${trace.ratingLabel} sets ${parameterFor(trace)}, ${trace.biologicalLabel}.`).join(" ");
  return (
    <article className={styles.board} data-explain="">
      <canvas ref={ref} role="img" aria-label={`Simulation logic for Vertical Void. ${summary}`} />
    </article>
  );
}

/** The same Vertical Void board, with each behavior named as the parameter it sets. */
export function SimulationParameters() {
  ensureGrowth();
  const ref = useExplainFrame(paintParameters, DURATION);
  const summary = TRACES.map((trace) => `${trace.criterion} ${trace.ratingLabel} selects ${parameterFor(trace)}.`).join(" ");
  return (
    <article className={styles.board} data-explain="">
      <canvas ref={ref} role="img" aria-label={`Parameter map for Vertical Void. Ratings write the biological parameters. Descriptors are stored names. The spatial recipe is authored separately. ${summary}`} />
    </article>
  );
}
