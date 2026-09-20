"use client";

import { useEffect, useRef } from "react";
import { sampleField, trailPeak } from "@/lib/skill1/engine";
import { TRAIL_SCALE } from "@/lib/skill1/maps";
import type {
  ArchitectureReading,
  BiologicalTranslation,
  SimulationState,
  VizSettings,
} from "@/lib/skill1/types";

const SIZE = 20;


function toCanvas(y: number, height: number, scale: number) {
  return height - y * scale;
}

function drawField(
  ctx: CanvasRenderingContext2D,
  state: SimulationState | null,
  viz: VizSettings,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width, height) / SIZE;
  const fieldH = SIZE * scale;
  const ox = (width - fieldH) / 2;
  const oy = (height - fieldH) / 2;

  ctx.save();
  ctx.translate(ox, oy);

  const atmosphere = ctx.createRadialGradient(
    fieldH / 2,
    fieldH / 2,
    18,
    fieldH / 2,
    fieldH / 2,
    fieldH * 0.52,
  );
  atmosphere.addColorStop(0, "rgba(18, 28, 8, 0.45)");
  atmosphere.addColorStop(1, "rgba(2,8,14,0)");
  ctx.fillStyle = atmosphere;
  ctx.fillRect(0, 0, fieldH, fieldH);

  ctx.strokeStyle = "rgba(80, 110, 70, 0.08)";
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  for (let i = 0; i <= SIZE; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * scale, toCanvas(0, fieldH, scale));
    ctx.lineTo(i * scale, toCanvas(SIZE, fieldH, scale));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, toCanvas(i, fieldH, scale));
    ctx.lineTo(fieldH, toCanvas(i, fieldH, scale));
    ctx.stroke();
  }

  if (!state) {
    ctx.restore();
    return;
  }

  const peak = trailPeak(state);
  let active = 0;

  if (viz.showAttraction) {
    const ax = state.attractor.x * scale;
    const ay = toCanvas(state.attractor.y, fieldH, scale);
    const radius = Math.max(22, state.attraction.reduce((m, v) => Math.max(m, v), 0) * 160);
    const glow = ctx.createRadialGradient(ax, ay, 4, ax, ay, radius);
    glow.addColorStop(0, "rgba(255, 210, 70, 0.1)");
    glow.addColorStop(0.45, "rgba(255, 186, 60, 0.04)");
    glow.addColorStop(1, "rgba(255,186,60,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, fieldH, fieldH);
  }

  if (viz.showField) {
    const sx = state.source.x * scale;
    const sy = toCanvas(state.source.y, fieldH, scale);
    ctx.strokeStyle = "rgba(180, 230, 255, 0.7)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "lighter";
  if (viz.showTrails) {
    const ts = state.trailSize;
    const cell = fieldH / ts;
    for (let y = 0; y < ts; y += 1) {
      const vRow = y * ts;
      const py = toCanvas((y + 1) / TRAIL_SCALE, fieldH, scale);
      for (let x = 0; x < ts; x += 1) {
        const n = state.trails[vRow + x] / peak;
        if (n < 0.025) continue;
        active += 1;
        const a = 0.07 + n * 0.62;
        ctx.fillStyle =
          n > 0.42 ? `rgba(255, 224, 90, ${a})` : `rgba(140, 190, 50, ${a * 0.85})`;
        ctx.fillRect((x / TRAIL_SCALE) * scale, py, cell, cell);
      }
    }
  }

  if (viz.showAgents) {
    ctx.fillStyle = "rgba(255, 236, 140, 0.9)";
    for (let i = 0; i < state.agents.length; i += 1) {
      if (i % 3 !== 0) continue;
      const agent = state.agents[i];
      ctx.fillRect(agent.x * scale - 0.7, toCanvas(agent.y, fieldH, scale) - 0.7, 1.5, 1.5);
    }
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud(ctx, state.agents.length, active, state, width);
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  nodes: number,
  paths: number,
  state: SimulationState,
  width: number,
) {
  const convergence = Math.min(
    99,
    Math.round((state.iteration / Math.max(1, state.maxIterations)) * 70 + (state.converged ? 28 : 8)),
  );
  ctx.fillStyle = "rgba(222,247,255,0.96)";
  ctx.font = "600 24px Rajdhani, sans-serif";
  ctx.fillText(String(nodes), 16, 34);
  ctx.fillStyle = "rgba(150,184,196,0.95)";
  ctx.font = "500 10px Rajdhani, sans-serif";
  ctx.fillText("ACTIVE PATHS", 16, 54);
  ctx.fillStyle = "rgba(222,247,255,0.96)";
  ctx.font = "600 22px Rajdhani, sans-serif";
  ctx.fillText(String(paths), 16, 76);
  ctx.fillStyle = "rgba(150,184,196,0.95)";
  ctx.font = "500 10px Rajdhani, sans-serif";
  ctx.fillText("CONVERGENCE", 16, 98);
  ctx.fillStyle = "rgba(122,246,255,0.98)";
  ctx.font = "600 22px Rajdhani, sans-serif";
  ctx.fillText(`${convergence}%`, 16, 120);
  ctx.fillStyle = "rgba(150,184,196,0.88)";
  ctx.font = "500 10px Rajdhani, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("EMERGENT GEOMETRY", width - 16, 28);
  ctx.textAlign = "left";
}

export function Skill1Field({
  state,
  viz,
}: {
  state: SimulationState | null;
  viz: VizSettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
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
      drawField(ctx, state, viz, width, height);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [state, viz, state?.iteration, state?.agents]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      role="img"
      aria-label="Physarum vein field"
    />
  );
}

function drawVoidArchitecture(
  ctx: CanvasRenderingContext2D,
  state: SimulationState,
  translation: BiologicalTranslation,
  width: number,
  height: number,
) {
  const image = ctx.createImageData(width, height);
  const peak = trailPeak(state);
  const keep = translation.recipe.isolationRadius;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const fx = (px / width) * state.size;
      const fy = (1 - py / height) * state.size;
      const trail = sampleField(
        state.trails,
        { x: fx * TRAIL_SCALE, y: fy * TRAIL_SCALE },
        state.trailSize,
      );
      const n = Math.sqrt(Math.max(0, trail / peak));
      const dx = fx - state.attractor.x;
      const dy = fy - state.attractor.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
      const coreR = keep * 0.5 * wobble;
      let shade = 8;
      if (dist < coreR) shade = 4;
      else if (n > 0.36) shade = Math.round(158 + Math.min(1, n) * 88);
      else if (n > 0.18) shade = 102;
      const i = (py * width + px) * 4;
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function drawContainedArchitecture(
  ctx: CanvasRenderingContext2D,
  state: SimulationState,
  translation: BiologicalTranslation,
  width: number,
  height: number,
) {
  const image = ctx.createImageData(width, height);
  const peak = trailPeak(state);
  const keep = translation.recipe.isolationRadius;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const fx = (px / width) * state.size;
      const fy = (1 - py / height) * state.size;
      const trail = sampleField(
        state.trails,
        { x: fx * TRAIL_SCALE, y: fy * TRAIL_SCALE },
        state.trailSize,
      );
      const n = Math.sqrt(Math.max(0, trail / peak));
      const dx = fx - state.attractor.x;
      const dy = fy - state.attractor.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const angleW =
        1 + 0.22 * Math.cos(angle * 2.15 + 0.35) + 0.12 * Math.cos(angle * 5.0 + n * 7);
      const coreR = keep * (0.8 + n * 0.38) * angleW;
      const volR =
        (keep * 0.88 + translation.recipe.enclosureCollar * 0.68 + translation.recipe.clustering * 0.3) *
        angleW *
        (1.04 - n * 0.1);
      let r = 8;
      let g = 10;
      let b = 14;
      if (dist < coreR) {
        const glow = Math.min(1, 0.62 + n * 0.55);
        r = Math.round(236 + 19 * glow);
        g = Math.round(142 + 48 * glow);
        b = Math.round(62 + 28 * n);
      } else if (dist < volR) {
        const shell = Math.min(1, 0.4 + n * 0.7);
        r = Math.round(118 + shell * 92);
        g = Math.round(64 + shell * 48);
        b = Math.round(36 + shell * 22);
      } else if (n > 0.28) {
        r = 96;
        g = 58;
        b = 38;
      }
      const i = (py * width + px) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function Skill1Architecture({
  reading,
  state,
  translation,
}: {
  reading: ArchitectureReading | null;
  state?: SimulationState | null;
  translation?: BiologicalTranslation;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highRes = Boolean(state && translation && reading?.kind);

  useEffect(() => {
    if (!state || !translation || !reading?.kind) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const width = Math.max(1, Math.min(180, Math.floor(rect.width)));
      const height = Math.max(1, Math.min(180, Math.floor(rect.height)));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (reading.kind === "around-absence") {
        drawVoidArchitecture(ctx, state, translation, width, height);
      } else {
        drawContainedArchitecture(ctx, state, translation, width, height);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [reading?.kind, state, translation, state?.iteration]);

  if (highRes) {
    return (
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        role="img"
        aria-label="Architectural topology of mass, void, and enclosure"
      />
    );
  }

  const cells = Array.from({ length: SIZE * SIZE }, (_, index) => ({
    x: index % SIZE,
    y: Math.floor(index / SIZE),
  }));

  return (
    <svg viewBox="-0.5 -0.5 21 21" className="h-full w-full" role="img" aria-label="Architectural topology of mass, void, and enclosure">
      <g transform="translate(0 20) scale(1 -1)">
        {cells.map((cell) => {
          const kind = reading?.cells[cell.y * SIZE + cell.x] ?? "void";
          const occupancy = reading?.occupancy[cell.y * SIZE + cell.x] ?? 0;
          const fill =
            kind === "mass"
              ? `rgba(214, 118, 58, ${0.55 + occupancy * 0.4})`
              : kind === "wall"
                ? "rgba(232, 244, 248, 0.62)"
                : kind === "room"
                  ? "rgba(255, 186, 112, 0.52)"
                  : kind === "primary-void"
                    ? "rgba(3, 8, 12, 0.08)"
                    : kind === "circulation"
                      ? "rgba(0, 228, 255, 0.2)"
                      : kind === "secondary"
                        ? "rgba(18, 64, 74, 0.55)"
                        : kind === "source"
                          ? "rgba(0, 228, 255, 0.42)"
                          : "rgba(6, 14, 20, 0.72)";
          return (
            <rect
              key={`${cell.x}-${cell.y}`}
              x={cell.x}
              y={cell.y}
              width={1}
              height={1}
              fill={fill}
              stroke={kind === "primary-void" || kind === "room" ? "rgba(0,228,255,0.05)" : "rgba(0,228,255,0.08)"}
              strokeWidth={0.03}
            />
          );
        })}
      </g>
    </svg>
  );
}
