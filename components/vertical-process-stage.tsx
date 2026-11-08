"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { paintedBox } from "@/lib/canvas-frame";
import { drawPixelPlate, rasterTrailPlate, type SamplePresentation } from "@/components/vertical-render";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import { moduleViewFit } from "@/lib/skill3/view-project";
import { orbitProcessIso, processIsoFit, zoomProcessIso, type ProcessIsoCamera } from "@/lib/skill3/process-iso-camera";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import { STACK_DISPLAY_PLATES, stackDisplayIndices, stackDisplaySlices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField, ViewerSlice } from "@/lib/skill3/viewer-field";

function useFittedCanvas(draw: (canvas: HTMLCanvasElement, width: number, height: number) => void, watch: unknown, live = false) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const paint = () => {
      const frame = paintedBox(parent);
      canvas.style.width = `${frame.layoutW}px`;
      canvas.style.height = `${frame.layoutH}px`;
      drawRef.current(canvas, frame.width, frame.height);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    let frameId = 0;
    if (live && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const loop = () => {
        paint();
        frameId = window.requestAnimationFrame(loop);
      };
      frameId = window.requestAnimationFrame(loop);
    }
    return () => {
      observer.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [live, watch]);
  return ref;
}

export function ProcessPlate({ slice, presentation = "raw" }: { slice: ViewerSlice; presentation?: SamplePresentation }) {
  const [plate, setPlate] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    setPlate(rasterTrailPlate(slice.trails, slice.trailSize, slice.peak, presentation));
  }, [presentation, slice]);
  const ref = useFittedCanvas((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    if (!plate) return;
    const native = plate.width;
    const maxSide = Math.min(width, height) * 0.98;
    const side = maxSide >= native ? Math.max(native, Math.floor(maxSide / native) * native) : maxSide;
    drawPixelPlate(ctx, plate, (width - side) / 2, (height - side) / 2, side, side);
  }, plate);
  return <canvas ref={ref} style={{ imageRendering: "pixelated" }} aria-label={`Iteration ${slice.iteration}`} />;
}

/** Empty isometric frame. Same camera as the sample column, with no plates yet. */
export function ProcessGuide({ label, clear = false }: { label: string; clear?: boolean }) {
  const ref = useFittedCanvas((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!clear) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
    }
    const project = (x: number, y: number, z: number) => ({ x: (x - y) * 0.9, y: (x + y) * 0.2 - z * 0.92 });
    const points = [project(0, 0, 0.35), project(1, 0, 0.35), project(1, 1, 0.35), project(0, 1, 0.35)];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    const scale = Math.min((width * 0.62) / Math.max(0.001, maxX - minX), (height * 0.42) / Math.max(0.001, maxY - minY));
    const ox = width * 0.5 - ((minX + maxX) / 2) * scale;
    const oy = height * 0.5 - ((minY + maxY) / 2) * scale;
    ctx.strokeStyle = "rgba(242, 242, 238, 0.28)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = ox + point.x * scale;
      const y = oy + point.y * scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(242, 242, 238, 0.45)";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, width / 2, height * 0.72);
  }, `${label}:${clear}`);
  return <canvas ref={ref} aria-label={label} />;
}

const PLANE_INK: Record<string, string> = {
  z0: "rgba(242,242,238,0.92)",
  threshold: "rgba(126,200,198,0.96)",
  "max-gap": "rgba(224,160,128,0.96)",
};

const PLANE_RGB: Record<string, readonly [number, number, number]> = {
  z0: [242, 242, 238],
  threshold: [126, 200, 198],
  "max-gap": [224, 160, 128],
};

type StackDust = { x: number; y: number; z: number; h: number; weight: number };

function stackUnit(index: number) {
  let value = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function ProcessStack({
  field,
  labels,
  reasons,
  plates: plateLimit = STACK_DISPLAY_PLATES,
  kept,
  presentation = "contour",
  fieldAmount = 0,
  envelopeAmount = 0,
  mesh = null,
  onPick,
}: {
  field: VerticalViewerField;
  labels?: readonly string[];
  reasons?: readonly string[];
  /** How many accepted samples may be drawn. Replay passes the full revealed count. */
  plates?: number;
  /** Full kept-sample count. Plates stay in those slots while the stack builds. */
  kept?: number;
  /** Clean contour keeps each retained slice readable on the shared footprint. */
  presentation?: SamplePresentation;
  /** 0-1. Open-mesh particles rise from the base after the plates are in. */
  fieldAmount?: number;
  /** 0-1. Faint surface ghost. Not the finished mesh. */
  envelopeAmount?: number;
  /** Stored Open mesh. Sampled as particles only. The solid surface is not drawn. */
  mesh?: IsoMesh | null;
  onPick?: (index: number) => void;
}) {
  const [plates, setPlates] = useState<HTMLCanvasElement[]>([]);
  const [cloudMark, setCloudMark] = useState(0);
  const cloud = useRef<{ dust: StackDust[] }>({ dust: [] });
  const hits = useRef<{ index: number; x: number; y: number }[]>([]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const reasonKey = reasons?.join(",") ?? "";
  useEffect(() => {
    const slices = stackDisplaySlices(field.slices, plateLimit);
    const shown = stackDisplayIndices(field.slices.length, plateLimit);
    const tinted = slices.map((slice, index) => {
      const plate = rasterTrailPlate(slice.trails, slice.trailSize, slice.peak, presentation);
      const reason = reasons?.[shown[index] ?? index] ?? "z0";
      return tintContour(plate, PLANE_RGB[reason] ?? PLANE_RGB.z0);
    });
    if (mesh && mesh.indices.length > 0) {
      const sampled = formField(mesh);
      cloud.current = {
        dust: sampled.dust.map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z,
          h: point.h,
          weight: point.layer === 0 ? 1 : 0.72,
        })),
      };
    } else {
      cloud.current = { dust: [] };
    }
    setPlates(tinted);
    setCloudMark((mark) => mark + 1);
  }, [field, kept, mesh, plateLimit, presentation, reasonKey, reasons]);
  const ref = useFittedCanvas((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    if (plates.length === 0) return;
    const shown = stackDisplayIndices(field.slices.length, plateLimit);
    const count = plates.length;
    const slots = Math.max(count, kept ?? count);
    const halfX = MODULE_SIZE_X / 2;
    const halfY = MODULE_SIZE_Y / 2;
    const yaw = Math.PI / 4;
    const pitch = 0.62;
    const spin = formSpin();
    const cs = Math.cos(spin);
    const ss = Math.sin(spin);
    const aspect = width / Math.max(1, height);
    const fit = moduleViewFit(moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z)) * 0.72, aspect);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const screen = (x: number, y: number, z: number) => {
      const sx = x * cs + z * ss;
      const sz = -x * ss + z * cs;
      const x1 = sx * cy + sz * sy;
      const z1 = -sx * sy + sz * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const w = z2 * fit + 3.4;
      const ndcX = (x1 * fit * 1.55) / w;
      const ndcY = (y2 * fit * aspect * 1.55) / w;
      return { x: (ndcX + 1) * 0.5 * width, y: (1 - ndcY) * 0.5 * height, depth: w };
    };
    const heightAt = (index: number) => (slots <= 1 ? 0 : (index / (slots - 1) - 0.5) * MODULE_SIZE_Z);
    const strokeQuad = (corners: { x: number; y: number }[]) => {
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.stroke();
    };
    const ordered = cloud.current.dust.slice().sort((a, b) => screen(b.x, b.y, b.z).depth - screen(a.x, a.y, a.z).depth);
    const paintDust = (sizeFor: (weight: number) => number, alphaFor: (weight: number, rise: number) => number, color: string) => {
      ctx.save();
      ctx.fillStyle = color;
      for (const point of ordered) {
        const rise = Math.min(1, Math.max(0, (fieldAmount * 1.04 - point.h) / 0.12));
        if (rise <= 0) continue;
        const at = screen(point.x, point.y, point.z);
        const size = sizeFor(point.weight);
        ctx.globalAlpha = alphaFor(point.weight, rise);
        ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size);
      }
      ctx.restore();
    };
    if (envelopeAmount > 0 && fieldAmount > 0) {
      paintDust(
        (weight) => 8 + weight * 2,
        (weight, rise) => 0.12 * weight * rise * envelopeAmount,
        "rgba(206, 232, 226, 1)",
      );
    }
    if (fieldAmount > 0) {
      paintDust(
        (weight) => 6.2 + weight * 2.2,
        (weight, rise) => 0.9 * weight * rise,
        "rgba(244, 252, 250, 1)",
      );
    }
    const nextHits: { index: number; x: number; y: number }[] = [];
    const plateOrder = Array.from({ length: count }, (_, index) => index)
      .sort((a, b) => screen(0, heightAt(b), 0).depth - screen(0, heightAt(a), 0).depth);
    for (const index of plateOrder) {
      const sourceIndex = shown[index] ?? index;
      const plate = plates[index];
      const hy = heightAt(index);
      const plateY = hy - 0.4;
      const corners = [
        screen(-halfX, hy, halfY),
        screen(halfX, hy, halfY),
        screen(halfX, hy, -halfY),
        screen(-halfX, hy, -halfY),
      ];
      const lower = [
        screen(-halfX, plateY, halfY),
        screen(halfX, plateY, halfY),
        screen(halfX, plateY, -halfY),
        screen(-halfX, plateY, -halfY),
      ];
      const reason = reasons?.[sourceIndex] ?? "z0";
      const accent = PLANE_INK[reason] ?? PLANE_INK.z0;
      const midY = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = accent;
      for (let edge = 0; edge < 4; edge += 1) {
        const next = (edge + 1) % 4;
        if ((lower[edge].y + lower[next].y) / 2 <= (corners[edge].y + corners[next].y) / 2) continue;
        ctx.beginPath();
        ctx.moveTo(corners[edge].x, corners[edge].y);
        ctx.lineTo(corners[next].x, corners[next].y);
        ctx.lineTo(lower[next].x, lower[next].y);
        ctx.lineTo(lower[edge].x, lower[edge].y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      const cells = 8;
      const plateWidth = Math.max(1, plate.width);
      const plateHeight = Math.max(1, plate.height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      for (let row = 0; row < cells; row += 1) {
        for (let col = 0; col < cells; col += 1) {
          const u0 = col / cells;
          const u1 = (col + 1) / cells;
          const v0 = row / cells;
          const v1 = (row + 1) / cells;
          const sw = (u1 - u0) * plateWidth;
          const sh = (v1 - v0) * plateHeight;
          const origin = screen(-halfX + u0 * MODULE_SIZE_X, hy, halfY - v0 * MODULE_SIZE_Y);
          const across = screen(-halfX + u1 * MODULE_SIZE_X, hy, halfY - v0 * MODULE_SIZE_Y);
          const down = screen(-halfX + u0 * MODULE_SIZE_X, hy, halfY - v1 * MODULE_SIZE_Y);
          ctx.setTransform(
            dpr * (across.x - origin.x) / sw,
            dpr * (across.y - origin.y) / sw,
            dpr * (down.x - origin.x) / sh,
            dpr * (down.y - origin.y) / sh,
            dpr * origin.x,
            dpr * origin.y,
          );
          ctx.drawImage(plate, u0 * plateWidth, v0 * plateHeight, sw, sh, 0, 0, sw, sh);
        }
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = index === count - 1 ? 2 : 1.25;
      strokeQuad(corners);
      ctx.restore();
      nextHits.push({ index: sourceIndex, x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 });
      const label = labels?.[sourceIndex];
      if (!label) continue;
      const right = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      ctx.font = "16px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.8;
      ctx.fillText(label, right + 10, midY);
      ctx.globalAlpha = 1;
    }
    const axisBottom = screen(-halfX, slots <= 1 ? 0 : -MODULE_SIZE_Z / 2, -halfY);
    const axisTop = screen(-halfX, slots <= 1 ? 0 : MODULE_SIZE_Z / 2, -halfY);
    ctx.save();
    ctx.strokeStyle = "rgba(242, 242, 238, 0.28)";
    ctx.fillStyle = "rgba(242, 242, 238, 0.45)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(axisBottom.x - 18, axisBottom.y);
    ctx.lineTo(axisTop.x - 18, axisTop.y - 10);
    ctx.stroke();
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("T", axisBottom.x - 18, axisBottom.y + 8);
    ctx.restore();
    hits.current = nextHits;
  }, `${plates.length}:${kept ?? plates.length}:${fieldAmount}:${envelopeAmount}:${cloudMark}:${reasonKey}`, true);
  return (
    <canvas
      ref={ref}
      style={{ imageRendering: "pixelated" }}
      aria-label="Retained plates and the Open morphology as a particle scaffold"
      onClick={(event) => {
        const pick = onPickRef.current;
        const canvas = ref.current;
        if (!pick || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let best: { index: number; distance: number } | null = null;
        for (const hit of hits.current) {
          const distance = Math.hypot(hit.x - x, hit.y - y);
          if (!best || distance < best.distance) best = { index: hit.index, distance };
        }
        if (best && best.distance <= Math.min(rect.width, rect.height) * 0.22) pick(best.index);
      }}
    />
  );
}

type SampleMark = {
  iteration: number;
  reason: "z0" | "threshold" | "max-gap";
};

const SAMPLE_INK = {
  z0: "rgba(242, 242, 238, 0.95)",
  threshold: "rgba(126, 200, 198, 0.95)",
  "max-gap": "rgba(224, 160, 128, 0.95)",
} as const;

const SAMPLE_RGB = {
  z0: [242, 242, 238],
  threshold: [126, 200, 198],
  "max-gap": [224, 160, 128],
} as const;

function tintContour(source: HTMLCanvasElement, rgb: readonly [number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const ink = pixels[index] / 255;
    if (ink < 0.08) {
      pixels[index + 3] = 0;
      continue;
    }
    pixels[index] = rgb[0];
    pixels[index + 1] = rgb[1];
    pixels[index + 2] = rgb[2];
    pixels[index + 3] = Math.round(255 * Math.min(1, ink));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const SKIPPED_RGB = [168, 168, 164] as const;

export type SampleFrame = {
  iteration: number;
  trails: ArrayLike<number>;
  trailSize: number;
  peak: number;
  reason: SampleMark["reason"] | null;
};

/** Every generated iteration. Skipped plates use their own logged field. */
export function SampleDecisionStack({
  frames,
  playIteration,
  onSeek,
  columns = 4,
  labelSize = 16,
  fit = false,
}: {
  frames: readonly SampleFrame[];
  playIteration: number;
  onSeek?: (iteration: number) => void;
  /** Columns of plates. The Process page uses four. Zero with fit chooses a column count that keeps the plates large. */
  columns?: number;
  /** Earlier / Later size in canvas pixels. Zero hides them. */
  labelSize?: number;
  /** Size the columns to the canvas. The Process page stays on its own spacing. */
  fit?: boolean;
}) {
  const [plates, setPlates] = useState<Map<number, HTMLCanvasElement>>(new Map());
  const coverage = useRef<Map<number, number>>(new Map());
  const hits = useRef<{ iteration: number; x: number; y: number }[]>([]);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  useEffect(() => {
    const next = new Map<number, HTMLCanvasElement>();
    const amounts = new Map<number, number>();
    for (const frame of frames) {
      const plate = rasterTrailPlate(frame.trails, frame.trailSize, frame.peak, "contour");
      const tinted = tintContour(plate, frame.reason ? SAMPLE_RGB[frame.reason] : SKIPPED_RGB);
      next.set(frame.iteration, tinted);
      const pixels = tinted.getContext("2d")?.getImageData(0, 0, tinted.width, tinted.height).data;
      let lit = 0;
      if (pixels) {
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 16) lit += 1;
      }
      amounts.set(frame.iteration, lit / Math.max(1, tinted.width * tinted.height));
    }
    coverage.current = amounts;
    setPlates(next);
  }, [frames]);
  const ref = useFittedCanvas((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx || frames.length < 2) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const count = frames.length;
    const xk = 0.9;
    const yk = 0.24;
    const usable = height * (fit ? 0.68 : 0.84);
    const faceRatio = fit ? 0.72 : 0.66;
    const scaleFor = (cols: number) => {
      const tall = Math.ceil(count / cols);
      const pitch = usable / Math.max(1, tall - 1);
      const fromHeight = (pitch * faceRatio) / (2 * yk);
      if (!fit) return fromHeight;
      const factor = cols + Math.max(0, cols - 1) * 0.2;
      const fromWidth = (width * 0.78) / (2 * xk * factor);
      return Math.min(fromHeight, fromWidth);
    };
    let columnCount = Math.max(1, columns);
    if (fit && columns < 1) {
      let bestScale = -1;
      const maxCols = Math.min(8, count);
      for (let cols = 1; cols <= maxCols; cols += 1) {
        const next = scaleFor(cols);
        if (next > bestScale) {
          bestScale = next;
          columnCount = cols;
        }
      }
    }
    const columnSize = (column: number) => Math.floor(count / columnCount) + (column < count % columnCount ? 1 : 0);
    const columnStart = (column: number) => {
      let start = 0;
      for (let index = 0; index < column; index += 1) start += columnSize(index);
      return start;
    };
    const tallest = columnSize(0);
    const pitchPx = usable / Math.max(1, tallest - 1);
    let scale = scaleFor(columnCount);
    const zSpan = ((tallest - 1) * pitchPx) / scale;
    const slab = 2.2;
    const project = (x: number, y: number, z: number) => ({
      x: (x - y) * xk,
      y: (x + y) * yk - z * zSpan,
    });
    const columnOf = (index: number) => {
      let cursor = 0;
      for (let column = 0; column < columnCount; column += 1) {
        cursor += columnSize(column);
        if (index < cursor) return column;
      }
      return columnCount - 1;
    };
    const zAt = (index: number) => {
      const column = columnOf(index);
      return (index - columnStart(column)) / Math.max(1, tallest - 1);
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const consider = (x: number, y: number, z: number) => {
      const point = project(x, y, z);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    };
    consider(0, 0, 0);
    consider(1, 0, 0);
    consider(1, 1, 0);
    consider(0, 1, 0);
    consider(0, 0, 1);
    consider(1, 0, 1);
    consider(1, 1, 1);
    consider(0, 1, 1);
    if (fit) {
      const span = Math.max(1, maxY - minY);
      const extra = 2 * yk * scale * 0.55 + 28;
      const room = height * 0.82;
      if (span * scale + extra > room) scale = Math.max(1, (room - 28) / span);
    }
    const facePx = 2 * yk * scale;
    const diamondW = 2 * xk * scale;
    const gutter = fit ? diamondW * 0.2 : 36;
    const lift = facePx * 0.5 + 12;
    const topEdge = minY * scale - lift;
    const bottomEdge = maxY * scale + 6;
    const oy = fit ? (height - (bottomEdge - topEdge)) / 2 - topEdge : height * 0.5 - ((minY + maxY) / 2) * scale;
    const columnCenter = (column: number) => width * 0.5 + (column - (columnCount - 1) / 2) * (diamondW + gutter);
    const screen = (x: number, y: number, z: number, column: number) => {
      const point = project(x, y, z);
      const ox = columnCenter(column) - ((minX + maxX) / 2) * scale;
      return { x: ox + point.x * scale, y: oy + point.y * scale };
    };
    const strokePlane = (originPt: { x: number; y: number }, across: { x: number; y: number }, far: { x: number; y: number }, depth: { x: number; y: number }) => {
      ctx.beginPath();
      ctx.moveTo(originPt.x, originPt.y);
      ctx.lineTo(across.x, across.y);
      ctx.lineTo(far.x, far.y);
      ctx.lineTo(depth.x, depth.y);
      ctx.closePath();
      ctx.stroke();
    };
    const quad = (index: number) => {
      const z = zAt(index);
      const column = columnOf(index);
      return [screen(0, 0, z, column), screen(1, 0, z, column), screen(1, 1, z, column), screen(0, 1, z, column)];
    };
    const paintField = (source: HTMLCanvasElement, corners: { x: number; y: number }[], alpha: number) => {
      const plateWidth = Math.max(1, source.width);
      const plateHeight = Math.max(1, source.height);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.setTransform(
        dpr * (corners[1].x - corners[0].x) / plateWidth,
        dpr * (corners[1].y - corners[0].y) / plateWidth,
        dpr * (corners[3].x - corners[0].x) / plateHeight,
        dpr * (corners[3].y - corners[0].y) / plateHeight,
        dpr * corners[0].x,
        dpr * corners[0].y,
      );
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(source, 0, 0);
      ctx.restore();
    };
    const paintSlab = (corners: { x: number; y: number }[], alpha: number, color: string) => {
      const midY = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      for (let index = 0; index < 4; index += 1) {
        const start = corners[index];
        const end = corners[(index + 1) % 4];
        if ((start.y + end.y) / 2 < midY) continue;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(end.x, end.y + slab);
        ctx.lineTo(start.x, start.y + slab);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };
    const fillPlane = (corners: { x: number; y: number }[], alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(242, 242, 238, 1)";
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    const paintGrid = (corners: { x: number; y: number }[], alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgba(242, 242, 238, 1)";
      ctx.lineWidth = 0.7;
      ctx.setLineDash([1.4, 3.2]);
      const steps = 3;
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        ctx.beginPath();
        ctx.moveTo(corners[0].x + (corners[3].x - corners[0].x) * t, corners[0].y + (corners[3].y - corners[0].y) * t);
        ctx.lineTo(corners[1].x + (corners[2].x - corners[1].x) * t, corners[1].y + (corners[2].y - corners[1].y) * t);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(corners[0].x + (corners[1].x - corners[0].x) * t, corners[0].y + (corners[1].y - corners[0].y) * t);
        ctx.lineTo(corners[3].x + (corners[2].x - corners[3].x) * t, corners[3].y + (corners[2].y - corners[3].y) * t);
        ctx.stroke();
      }
      ctx.restore();
    };
    const nextHits: { iteration: number; x: number; y: number }[] = [];
    let currentCorners: { x: number; y: number }[] | null = null;
    let currentReason: SampleMark["reason"] | null = null;
    const guidePoint = (index: number) => {
      const corners = quad(index);
      return {
        x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
        y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
      };
    };
    const revealed: { x: number; y: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      if (frames[index].iteration > playIteration) break;
      revealed.push(guidePoint(index));
    }
    if (revealed.length > 0) {
      const lift = facePx * 0.5 + 10;
      ctx.save();
      ctx.strokeStyle = "rgba(242, 242, 238, 0.34)";
      ctx.lineWidth = 1.15;
      ctx.lineJoin = "miter";
      ctx.beginPath();
      ctx.moveTo(revealed[0].x, revealed[0].y);
      for (let index = 1; index < revealed.length; index += 1) {
        const previous = revealed[index - 1];
        const point = revealed[index];
        if (Math.abs(point.x - previous.x) > 2) {
          ctx.lineTo(previous.x, previous.y - lift);
          ctx.lineTo(point.x, previous.y - lift);
        }
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    }
    for (let index = 0; index < count; index += 1) {
      const frame = frames[index];
      const corners = quad(index);
      nextHits.push({ iteration: frame.iteration, x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 });
      if (frame.iteration === playIteration) {
        currentCorners = corners;
        currentReason = frame.reason;
        continue;
      }
      if (frame.iteration > playIteration) continue;
      const plate = plates.get(frame.iteration);
      const kept = Boolean(frame.reason);
      const accent = kept ? SAMPLE_INK[frame.reason ?? "z0"] : "rgba(214, 214, 210, 1)";
      paintSlab(corners, kept ? 0.4 : 0.12, accent);
      if (fit) {
        ctx.save();
        ctx.globalAlpha = kept ? 0.34 : 0.12;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        fillPlane(corners, kept ? 0.08 : 0.04);
      }
      paintGrid(corners, kept ? 0.16 : 0.08);
      if (plate) paintField(plate, corners, kept ? 0.92 : 0.62);
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = kept ? 0.95 : 0.55;
      ctx.lineWidth = kept ? 1.25 : 1;
      if (kept) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 3;
      }
      strokePlane(corners[0], corners[1], corners[2], corners[3]);
      ctx.restore();
    }
    const first = quad(0);
    const far = quad(count - 1);
    if (labelSize > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(242, 242, 238, 0.55)";
      ctx.font = `${labelSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("Earlier", (first[0].x + first[1].x + first[2].x + first[3].x) / 4, Math.max(first[0].y, first[1].y, first[2].y, first[3].y) + 10);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Later", Math.max(far[0].x, far[1].x, far[2].x, far[3].x) + 8, (far[0].y + far[1].y + far[2].y + far[3].y) / 4);
      ctx.restore();
    }
    if (currentCorners) {
      const plate = plates.get(playIteration);
      const ink = "rgba(242, 242, 238, 0.98)";
      paintSlab(currentCorners, 0.8, ink);
      fillPlane(currentCorners, 0.16);
      paintGrid(currentCorners, 0.45);
      if (plate) paintField(plate, currentCorners, 1);
      ctx.save();
      ctx.shadowColor = ink;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.2;
      strokePlane(currentCorners[0], currentCorners[1], currentCorners[2], currentCorners[3]);
      ctx.restore();
      if (currentReason) {
        ctx.save();
        ctx.strokeStyle = SAMPLE_INK[currentReason];
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.1;
        strokePlane(currentCorners[0], currentCorners[1], currentCorners[2], currentCorners[3]);
        ctx.restore();
      }
      const head = guidePoint(frames.findIndex((frame) => frame.iteration === playIteration));
      ctx.save();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    hits.current = nextHits;
  }, `${playIteration}:${frames.length}:${plates.size}:${columns}:${labelSize}:${fit}`);

  return (
    <div className="process-sample-stack">
    <canvas
      ref={ref}
      aria-label="Generated plates, with retained samples bright and skipped plates ghosted"
      onClick={(event) => {
        const seek = onSeekRef.current;
        const canvas = ref.current;
        if (!seek || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let best: { iteration: number; distance: number } | null = null;
        for (const hit of hits.current) {
          if (Math.abs(hit.x - x) > rect.width * 0.48) continue;
          const distance = Math.abs(hit.y - y);
          if (!best || distance < best.distance) best = { iteration: hit.iteration, distance };
        }
        if (best && best.distance <= rect.height / Math.max(2, frames.length)) seek(best.iteration);
      }}
    />
    </div>
  );
}

type FormDust = { x: number; y: number; z: number; h: number; layer: number };
type FormFace = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; h: number };

function formField(mesh: IsoMesh, budget = 5400) {
  const { positions, indices } = mesh;
  let minY = Infinity;
  let maxY = -Infinity;
  const triangles: (FormFace & { area: number })[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const ax = positions[a];
    const ay = positions[a + 1];
    const az = positions[a + 2];
    const bx = positions[b];
    const by = positions[b + 1];
    const bz = positions[b + 2];
    const cx = positions[c];
    const cy = positions[c + 1];
    const cz = positions[c + 2];
    minY = Math.min(minY, ay, by, cy);
    maxY = Math.max(maxY, ay, by, cy);
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const area = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
    if (area < 1e-4) continue;
    triangles.push({ ax, ay, az, bx, by, bz, cx, cy, cz, h: 0, area });
  }
  const span = Math.max(1e-4, maxY - minY);
  const areaSum = triangles.reduce((sum, triangle) => sum + triangle.area, 0) || 1;
  const dust: FormDust[] = [];
  const faces: FormFace[] = [];
  triangles.forEach((triangle, index) => {
    const h = ((triangle.ay + triangle.by + triangle.cy) / 3 - minY) / span;
    triangle.h = h;
    if (index % 2 === 0) faces.push(triangle);
    const expected = (budget * triangle.area) / areaSum;
    let copies = Math.floor(expected);
    if (stackUnit(index + 11) < expected - copies) copies += 1;
    if (copies <= 0 && triangle.area >= areaSum * 0.0004) copies = 1;
    copies = Math.min(copies, 8);
    for (let copy = 0; copy < copies; copy += 1) {
      const seed = index * 6 + copy;
      const root = Math.sqrt(stackUnit(seed));
      const pick = stackUnit(seed + 1);
      const w0 = 1 - root;
      const w1 = root * (1 - pick);
      const w2 = root * pick;
      dust.push({
        x: triangle.ax * w0 + triangle.bx * w1 + triangle.cx * w2,
        y: triangle.ay * w0 + triangle.by * w1 + triangle.cy * w2,
        z: triangle.az * w0 + triangle.bz * w1 + triangle.cz * w2,
        h: (triangle.ay * w0 + triangle.by * w1 + triangle.cy * w2 - minY) / span,
        layer: copy % 3,
      });
    }
  });
  return { dust, faces, minY, maxY };
}

const FORM_TURN_MS = 22000;
const MODULE_BOX_EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 4],
  [3, 1], [3, 2], [3, 7],
  [5, 1], [5, 4], [5, 7],
  [6, 2], [6, 4], [6, 7],
];

function formSpin(now = performance.now()) {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return (now / FORM_TURN_MS) * Math.PI * 2;
}

/** 20×20×20 module boundary in the same orthographic frame as the shared isometric mesh. */
function drawOrthoModuleBox(ctx: CanvasRenderingContext2D, width: number, height: number, yaw: number, pitch: number, zoom: number) {
  const half = MODULE_SIZE_Z / 2;
  const aspect = width / Math.max(1, height);
  const fit = processIsoFit(pitch, aspect, zoom);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const ndcX = (x1 * fit) / aspect;
    const ndcY = y2 * fit;
    return { x: (ndcX + 1) * 0.5 * width, y: (1 - ndcY) * 0.5 * height };
  };
  const corners: { x: number; y: number }[] = [];
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      for (const z of [-half, half]) corners.push(project(x, y, z));
    }
  }
  ctx.save();
  ctx.strokeStyle = "rgba(232, 244, 240, 0.78)";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  for (const [a, b] of MODULE_BOX_EDGES) {
    ctx.moveTo(corners[a].x, corners[a].y);
    ctx.lineTo(corners[b].x, corners[b].y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Module cage, drawn a little inside the 20 cube so the form reads first. */
function drawModuleBox(ctx: CanvasRenderingContext2D, width: number, height: number, yaw: number, pitch: number, zoom = 1) {
  const half = MODULE_SIZE_Z / 2 * 0.9;
  const aspect = width / Math.max(1, height);
  const fit = moduleViewFit(moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z)) * 0.72, aspect) * zoom;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const w = z2 * fit + 3.4;
    const ndcX = (x1 * fit * 1.55) / w;
    const ndcY = (y2 * fit * aspect * 1.55) / w;
    return { x: (ndcX + 1) * 0.5 * width, y: (1 - ndcY) * 0.5 * height };
  };
  const corners: { x: number; y: number }[] = [];
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      for (const z of [-half, half]) corners.push(project(x, y, z));
    }
  }
  ctx.save();
  ctx.strokeStyle = "rgba(232, 244, 240, 0.78)";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  for (const [a, b] of MODULE_BOX_EDGES) {
    ctx.moveTo(corners[a].x, corners[a].y);
    ctx.lineTo(corners[b].x, corners[b].y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Particles and a ghost shell grow up through the finished morphology. No plates. */
export function ProcessFormEmergence({
  mesh,
  rise,
  shell,
  points = 5400,
  grain = 1,
}: {
  mesh: IsoMesh;
  rise: number;
  shell: number;
  /** Sample count. The process default stays dense. */
  points?: number;
  /** Point size relative to the process default. */
  grain?: number;
}) {
  const field = useRef<ReturnType<typeof formField> | null>(null);
  const meshId = useRef<IsoMesh | null>(null);
  const budget = useRef(points);
  if (meshId.current !== mesh || budget.current !== points) {
    meshId.current = mesh;
    budget.current = points;
    field.current = formField(mesh, points);
  }
  const ref = useFittedCanvas((canvas, width, height) => {
    const body = field.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const yaw = Math.PI / 4;
    const pitch = 0.62;
    drawModuleBox(ctx, width, height, yaw, pitch);
    if (!body || rise <= 0) return;
    const aspect = width / Math.max(1, height);
    const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z)) * 0.72;
    const fit = moduleViewFit(column, aspect);
    const spin = formSpin();
    const cs = Math.cos(spin);
    const ss = Math.sin(spin);
    const project = (x: number, y: number, z: number) => {
      const sx = x * cs + z * ss;
      const sz = -x * ss + z * cs;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const x1 = sx * cy + sz * sy;
      const z1 = -sx * sy + sz * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const viewZ = -z2 * fit - 3.4;
      const w = -viewZ;
      const ndcX = (x1 * fit * 1.55) / w;
      const ndcY = (y2 * fit * aspect * 1.55) / w;
      return {
        x: (ndcX + 1) * 0.5 * width,
        y: (1 - ndcY) * 0.5 * height,
        depth: w,
      };
    };
    if (shell > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(198, 230, 224, 1)";
      ctx.globalAlpha = 0.16 + shell * 0.14;
      for (const face of body.faces) {
        if (face.h > rise) continue;
        const a = project(face.ax, face.ay, face.az);
        const b = project(face.bx, face.by, face.bz);
        const c = project(face.cx, face.cy, face.cz);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    const visible = body.dust.filter((point) => {
      if (point.h > rise) return false;
      const age = rise - point.h;
      if (point.layer === 1 && age < 0.04) return false;
      if (point.layer === 2 && (shell < 0.2 || age < 0.09)) return false;
      return true;
    });
    visible.sort((a, b) => project(b.x, b.y, b.z).depth - project(a.x, a.y, a.z).depth);
    ctx.save();
    ctx.fillStyle = "rgb(236, 248, 244)";
    for (const point of visible) {
      const age = rise - point.h;
      const at = project(point.x, point.y, point.z);
      const front = age < 0.035;
      const size = (front ? 6.4 : point.layer === 0 ? 5.4 : 4.6) * grain;
      ctx.globalAlpha = front ? 0.95 : point.layer === 0 ? 0.84 : 0.62;
      ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size);
    }
    ctx.restore();
  }, `${rise.toFixed(3)}:${shell.toFixed(3)}:${grain}:${mesh.triangles}`, true);
  return <canvas ref={ref} aria-label="Vertical propagation building the morphology from the base" />;
}

export function ProcessMorphology({
  field = null,
  mesh: storedMesh,
  cacheIdentity,
  onTriangles,
  orbit = false,
  float = false,
  turnSeconds = 22,
  refine = false,
  uniformFrame = false,
  frame = "bounds",
  steer = false,
  insideBox = false,
  zoomable = false,
  isoCamera,
  onIsoCamera,
  isoTick = 0,
  fitMargin,
  accent = null,
  isoExtent = null,
}: {
  field?: VerticalViewerField | null;
  /** Stored module. When present, the continuation field is not meshed. */
  mesh?: IsoMesh | null;
  cacheIdentity: string;
  onTriangles?: (count: number | null) => void;
  orbit?: boolean;
  float?: boolean;
  turnSeconds?: number;
  refine?: boolean;
  /** Fit the 20x20x20 module by orthographic zoom. Pitch and yaw stay fixed. */
  uniformFrame?: boolean;
  /** Module keeps one camera across successive meshes. Bounds frames each mesh on its own. */
  frame?: "module" | "bounds";
  /** Drag orbit. Off while a recording is playing, so the camera stays put. */
  steer?: boolean;
  /** Fixed 20×20×20 module boundary. */
  insideBox?: boolean;
  /** Wheel zoom. The camera stays on the module frame. */
  zoomable?: boolean;
  /** Shared orthographic isometric camera. When set, this view does not spin or fit its own bounds. */
  isoCamera?: MutableRefObject<ProcessIsoCamera>;
  onIsoCamera?: () => void;
  isoTick?: number;
  /** Bounds-fit margin. Lower leaves room for the catalogue spin. */
  fitMargin?: number;
  /** Faces drawn in copper over the clay mesh. Display only. */
  accent?: IsoMesh | null;
  /** Shared projected extent. Both comparison views use it, so neither is fitted on its own. */
  isoExtent?: { minX: number; maxX: number; minY: number; maxY: number } | null;
}) {
  const external = storedMesh !== undefined;
  const [built, setBuilt] = useState<ReturnType<typeof cachedOpeningMesh> | null>(null);
  useEffect(() => {
    if (external) return;
    if (!field || field.slices.length < 2) {
      setBuilt(null);
      return;
    }
    try {
      setBuilt(cachedOpeningMesh(field.slices, {
        identity: cacheIdentity,
        sequence: field.slices.map((slice) => slice.iteration).join(","),
        field: "network",
        mode: "isomesh",
        iso: 0.48,
        sizeZ: MODULE_SIZE_Z,
        refine,
      }));
    } catch {
      setBuilt(null);
    }
  }, [cacheIdentity, external, field, refine]);
  const mesh = external ? storedMesh ?? null : built;
  useEffect(() => {
    onTriangles?.(mesh?.triangles ?? null);
  }, [mesh, onTriangles]);
  const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z));
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLCanvasElement>(null);
  const angle = useRef({ yaw: Math.PI / 4, pitch: 0.62 });
  const zoom = useRef(1);
  const onIsoRef = useRef(onIsoCamera);
  onIsoRef.current = onIsoCamera;
  const [steered, setSteered] = useState(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !steer) return;
    let drag: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      if (isoCamera) {
        orbitProcessIso(isoCamera.current, event.clientX - drag.x, event.clientY - drag.y);
        onIsoRef.current?.();
      } else {
        angle.current.yaw += (event.clientX - drag.x) * 0.005;
        angle.current.pitch = Math.min(1.25, Math.max(0.08, angle.current.pitch + (event.clientY - drag.y) * 0.005));
        setSteered((value) => value + 1);
      }
      drag = { x: event.clientX, y: event.clientY };
    };
    const up = () => {
      drag = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    const wheel = (event: WheelEvent) => {
      if (!zoomable) return;
      event.preventDefault();
      if (isoCamera) {
        zoomProcessIso(isoCamera.current, event.deltaY);
        onIsoRef.current?.();
        return;
      }
      const next = zoom.current * (event.deltaY > 0 ? 0.92 : 1.08);
      zoom.current = Math.min(2.4, Math.max(0.55, next));
      setSteered((value) => value + 1);
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [isoCamera, steer, zoomable]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.dataset.present = float || external ? "float" : "";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turn = orbit && !reduced;
    const spinning = turn && !external;
    const started = performance.now();
    let frameId = 0;
    const paint = (now = started) => {
      const shared = isoCamera?.current;
      const held = frame === "module" || Boolean(shared);
      const yaw = shared
        ? shared.yaw
        : held
          ? angle.current.yaw
          : external
            ? Math.PI / 4
            : spinning ? ((now - started) / (turnSeconds * 1000)) * Math.PI * 2 : float ? 0 : 0.62;
      const pitch = shared ? shared.pitch : held ? angle.current.pitch : external ? 0.62 : float || spinning ? 0.36 : 0.42;
      const spin = shared
        ? 0
        : insideBox
          ? formSpin(now)
          : turn && external
            ? ((now - started) / (turnSeconds * 1000)) * Math.PI * 2
            : 0;
      const parentSize = canvas.parentElement;
      const aspect = parentSize ? parentSize.clientWidth / Math.max(1, parentSize.clientHeight) : 1;
      let viewZoom = shared ? shared.zoom : 1;
      let viewPan: [number, number] | undefined;
      if (shared && isoExtent && parentSize && parentSize.clientWidth > 0 && parentSize.clientHeight > 0) {
        const moduleFit = processIsoFit(pitch, aspect, 1);
        const halfX = (isoExtent.maxX - isoExtent.minX) / 2;
        const halfY = (isoExtent.maxY - isoExtent.minY) / 2;
        const ndc = Math.max(halfX * moduleFit / aspect, halfY * moduleFit);
        viewZoom = Math.min(2.2, 0.86 / Math.max(0.05, ndc));
        viewPan = [-(isoExtent.minX + isoExtent.maxX) / 2, -(isoExtent.minY + isoExtent.maxY) / 2];
      }
      drawIsoMesh(canvas, mesh, yaw, pitch, (column * 0.72) / (shared ? 1 : zoom.current), external ? "clay" : "shell", {
        transparent: float || external,
        uniform: shared ? true : external ? false : uniformFrame,
        fit: shared || held || !external ? "module" : "bounds",
        spin,
        zoom: viewZoom,
        pan: viewPan,
        margin: fitMargin,
        accent,
      });
      const cage = boxRef.current;
      const cageParent = cage?.parentElement;
      const cageCtx = cage?.getContext("2d");
      if (insideBox && cage && cageParent && cageCtx) {
        const width = Math.max(1, cageParent.clientWidth);
        const height = Math.max(1, cageParent.clientHeight);
        const dpr = window.devicePixelRatio || 1;
        cage.width = Math.floor(width * dpr);
        cage.height = Math.floor(height * dpr);
        cageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cageCtx.clearRect(0, 0, width, height);
        if (shared) drawOrthoModuleBox(cageCtx, width, height, shared.yaw, shared.pitch, shared.zoom);
        else drawModuleBox(cageCtx, width, height, yaw, pitch, zoom.current);
      }
    };
    paint();
    const parent = canvas.parentElement;
    const observer = parent ? new ResizeObserver(() => paint(performance.now())) : null;
    if (parent && observer) observer.observe(parent);
    if (!isoCamera && (spinning || (turn && external) || (insideBox && !reduced))) {
      const loop = (now: number) => {
        paint(now);
        frameId = window.requestAnimationFrame(loop);
      };
      frameId = window.requestAnimationFrame(loop);
    }
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [accent, column, external, float, frame, insideBox, isoCamera, isoExtent, isoTick, mesh, orbit, steered, turnSeconds, uniformFrame]);
  const meshCanvas = <canvas ref={ref} className="vertical-process-mesh" aria-label="Network morphology in the 20 by 20 by 20 module" />;
  const boxCanvas = insideBox ? <canvas ref={boxRef} className="process-voxel-box" aria-hidden="true" /> : null;
  if (isoCamera || insideBox) {
    return (
      <div className="process-mesh-well">
        {meshCanvas}
        {boxCanvas}
      </div>
    );
  }
  return meshCanvas;
}
