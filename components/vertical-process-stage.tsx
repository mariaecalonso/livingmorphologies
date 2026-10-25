"use client";

import { useEffect, useRef, useState } from "react";
import { drawPixelPlate, rasterTrailPlate, type SamplePresentation } from "@/components/vertical-render";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import { STACK_DISPLAY_PLATES, stackDisplayIndices, stackDisplaySlices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField, ViewerSlice } from "@/lib/skill3/viewer-field";

function useFittedCanvas(draw: (canvas: HTMLCanvasElement, width: number, height: number) => void, watch: unknown) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const paint = () => {
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      drawRef.current(canvas, width, height);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [watch]);
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

const PLANE_INK: Record<string, string> = {
  z0: "rgba(242,242,238,0.9)",
  threshold: "rgba(199,126,95,1)",
  "max-gap": "rgba(15,115,119,1)",
};

export function ProcessStack({
  field,
  labels,
  reasons,
  plates: plateLimit = STACK_DISPLAY_PLATES,
  presentation = "raw",
  onPick,
}: {
  field: VerticalViewerField;
  labels?: readonly string[];
  reasons?: readonly string[];
  /** How many accepted samples may be drawn. Replay passes the full revealed count. */
  plates?: number;
  /** Raw field is the intensity raster. Clean contour is a presentation reading of the same sample. */
  presentation?: SamplePresentation;
  onPick?: (index: number) => void;
}) {
  const [plates, setPlates] = useState<HTMLCanvasElement[]>([]);
  const hits = useRef<{ index: number; x: number; y: number }[]>([]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  useEffect(() => {
    const slices = stackDisplaySlices(field.slices, plateLimit);
    setPlates(slices.map((slice) => rasterTrailPlate(slice.trails, slice.trailSize, slice.peak, presentation)));
  }, [field, plateLimit, presentation]);
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
    const project = (x: number, y: number, z: number) => ({
      x: (x - y) * 0.86,
      y: (x + y) * 0.28 - z * 0.78,
    });
    const zAt = (index: number) => (count <= 1 ? 0.42 : index / (count - 1));
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
    for (let index = 0; index < count; index += 1) {
      const z = zAt(index);
      consider(0, 0, z);
      consider(1, 0, z);
      consider(1, 1, z);
      consider(0, 1, z);
    }
    consider(0, 0, 0);
    consider(0, 0, 1.12);
    const scale = Math.min((width * 0.76) / Math.max(0.001, maxX - minX), (height * 0.76) / Math.max(0.001, maxY - minY));
    const ox = width * 0.46 - ((minX + maxX) / 2) * scale;
    const oy = height * 0.52 - ((minY + maxY) / 2) * scale;
    const screen = (x: number, y: number, z: number) => {
      const point = project(x, y, z);
      return { x: ox + point.x * scale, y: oy + point.y * scale };
    };
    const base = screen(0, 0, 0);
    const tip = screen(0, 0, 1.12);
    ctx.strokeStyle = "rgba(15,115,119,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = "rgba(199,126,95,0.95)";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - 4, tip.y + 8);
    ctx.lineTo(tip.x + 4, tip.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${Math.max(11, height * 0.028)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Z", tip.x, tip.y - 10);
    ctx.fillStyle = "rgba(15,115,119,0.95)";
    ctx.fillText("T", base.x, base.y + 12);

    const nextHits: { index: number; x: number; y: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      const sourceIndex = shown[index] ?? index;
      const plate = plates[index];
      const z = zAt(index);
      const origin = screen(0, 0, z);
      const across = screen(1, 0, z);
      const depth = screen(0, 1, z);
      const far = screen(1, 1, z);
      const active = index === count - 1;
      const plateWidth = Math.max(1, plate.width);
      const plateHeight = Math.max(1, plate.height);
      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.78;
      ctx.setTransform(
        dpr * (across.x - origin.x) / plateWidth,
        dpr * (across.y - origin.y) / plateWidth,
        dpr * (depth.x - origin.x) / plateHeight,
        dpr * (depth.y - origin.y) / plateHeight,
        dpr * origin.x,
        dpr * origin.y,
      );
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(plate, 0, 0);
      ctx.restore();
      ctx.strokeStyle = PLANE_INK[reasons?.[sourceIndex] ?? ""] ?? "rgba(242,242,238,0.7)";
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(across.x, across.y);
      ctx.lineTo(far.x, far.y);
      ctx.lineTo(depth.x, depth.y);
      ctx.closePath();
      ctx.stroke();
      nextHits.push({ index: sourceIndex, x: (origin.x + far.x) / 2, y: (origin.y + far.y) / 2 });
      const label = labels?.[sourceIndex];
      if (!label) continue;
      ctx.font = `${Math.max(11, height * 0.026)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = active ? "#f2f2ee" : "rgba(242,242,238,0.62)";
      ctx.fillText(label, across.x + 8, across.y);
    }
    hits.current = nextHits;
  }, plates);
  return (
    <canvas
      ref={ref}
      style={{ imageRendering: "pixelated" }}
      aria-label="Accepted samples in axonometric XYT"
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
  /** Fit the 20×20×20 module by orthographic zoom. Pitch and yaw stay fixed. */
  uniformFrame?: boolean;
  /** Module keeps one camera across successive meshes. Bounds frames each mesh on its own. */
  frame?: "module" | "bounds";
  /** Drag orbit. Off while a recording is playing, so the camera stays put. */
  steer?: boolean;
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
  const angle = useRef({ yaw: Math.PI / 4, pitch: 0.62 });
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
      angle.current.yaw += (event.clientX - drag.x) * 0.005;
      angle.current.pitch = Math.min(1.25, Math.max(0.08, angle.current.pitch + (event.clientY - drag.y) * 0.005));
      drag = { x: event.clientX, y: event.clientY };
      setSteered((value) => value + 1);
    };
    const up = () => {
      drag = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [steer]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.dataset.present = float || external ? "float" : "";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spinning = orbit && !reduced && !external;
    const started = performance.now();
    let frameId = 0;
    const paint = (now = started) => {
      const held = frame === "module";
      const yaw = held
        ? angle.current.yaw
        : external
          ? Math.PI / 4
          : spinning ? ((now - started) / (turnSeconds * 1000)) * Math.PI * 2 : float ? 0 : 0.62;
      const pitch = held ? angle.current.pitch : external ? 0.62 : float || spinning ? 0.36 : 0.42;
      drawIsoMesh(canvas, mesh, yaw, pitch, column * 0.72, external ? "clay" : "shell", {
        transparent: float || external,
        uniform: external ? false : uniformFrame,
        fit: held || !external ? "module" : "bounds",
      });
    };
    paint();
    const parent = canvas.parentElement;
    const observer = parent ? new ResizeObserver(() => paint(performance.now())) : null;
    if (parent && observer) observer.observe(parent);
    if (spinning) {
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
  }, [column, external, float, frame, mesh, orbit, steered, turnSeconds, uniformFrame]);
  return <canvas ref={ref} className="vertical-process-mesh" aria-label="Network morphology in the 20 by 20 by 20 module" />;
}
