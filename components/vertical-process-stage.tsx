"use client";

import { useEffect, useRef, useState } from "react";
import { rasterTrailPlate } from "@/components/vertical-render";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import { STACK_DISPLAY_PLATES, stackDisplayIndices, stackDisplaySlices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField, ViewerSlice } from "@/lib/skill3/viewer-field";

const PLATE = 320;

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

export function ProcessPlate({ slice }: { slice: ViewerSlice }) {
  const [plate, setPlate] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    setPlate(rasterTrailPlate(slice.trails, slice.trailSize, slice.peak, slice.iteration, PLATE, slice.source, slice.attractor));
  }, [slice]);
  const ref = useFittedCanvas((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    if (!plate) return;
    const side = Math.min(width, height) * 0.98;
    ctx.drawImage(plate, (width - side) / 2, (height - side) / 2, side, side);
  }, plate);
  return <canvas ref={ref} aria-label={`Iteration ${slice.iteration}`} />;
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
  onPick,
}: {
  field: VerticalViewerField;
  labels?: readonly string[];
  reasons?: readonly string[];
  /** How many accepted samples may be drawn. Replay passes the full revealed count. */
  plates?: number;
  onPick?: (index: number) => void;
}) {
  const [plates, setPlates] = useState<HTMLCanvasElement[]>([]);
  const hits = useRef<{ index: number; x: number; y: number }[]>([]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  useEffect(() => {
    const slices = stackDisplaySlices(field.slices, plateLimit);
    setPlates(slices.map((slice) => rasterTrailPlate(slice.trails, slice.trailSize, slice.peak, slice.iteration, PLATE, slice.source, slice.attractor)));
  }, [field, plateLimit]);
  const ref = useFittedCanvas((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    if (plates.length === 0) return;
    const shown = stackDisplayIndices(field.slices.length, plateLimit);
    const count = plates.length;
    const marginL = Math.max(34, width * 0.16);
    const marginR = Math.max(42, width * 0.2);
    const marginT = Math.max(18, height * 0.05);
    const marginB = Math.max(22, height * 0.06);
    const innerH = Math.max(1, height - marginT - marginB);
    const planeW = Math.max(1, width - marginL - marginR);
    const planeH = Math.max(12, Math.min(planeW * 0.38, (innerH - Math.max(0, count - 1) * 10) / count));
    const gap = count > 1 ? (innerH - planeH * count) / (count - 1) : 0;
    const axisX = marginL * 0.42;
    const nextHits: { index: number; x: number; y: number }[] = [];

    ctx.strokeStyle = "rgba(15,115,119,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(axisX, marginT);
    ctx.lineTo(axisX, height - marginB);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(axisX, marginT + 1);
    ctx.lineTo(axisX - 4, marginT + 9);
    ctx.lineTo(axisX + 4, marginT + 9);
    ctx.closePath();
    ctx.fillStyle = "rgba(199,126,95,0.95)";
    ctx.fill();
    ctx.font = `${Math.max(11, height * 0.028)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(199,126,95,0.95)";
    ctx.fillText("Z", axisX, marginT - 8);
    ctx.fillStyle = "rgba(15,115,119,0.95)";
    ctx.fillText("T", axisX, height - marginB + 10);

    for (let index = 0; index < count; index += 1) {
      const sourceIndex = shown[index] ?? index;
      const y = height - marginB - planeH - index * (planeH + gap);
      const active = index === count - 1;
      const reason = reasons?.[sourceIndex];
      ctx.strokeStyle = "rgba(15,115,119,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axisX, y + planeH / 2);
      ctx.lineTo(marginL, y + planeH / 2);
      ctx.stroke();
      ctx.globalAlpha = active ? 1 : 0.5;
      ctx.drawImage(plates[index], marginL, y, planeW, planeH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PLANE_INK[reason ?? ""] ?? "rgba(242,242,238,0.7)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(marginL, y, planeW, planeH);
      nextHits.push({ index: sourceIndex, x: marginL + planeW / 2, y: y + planeH / 2 });
      const label = labels?.[sourceIndex];
      if (!label) continue;
      ctx.font = `${Math.max(11, height * 0.026)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = active ? "#f2f2ee" : "rgba(242,242,238,0.62)";
      ctx.fillText(label, marginL + planeW + 6, y + planeH / 2);
    }
    hits.current = nextHits;
  }, plates);
  return (
    <canvas
      ref={ref}
      aria-label="Accepted samples stacked through time"
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
  field,
  cacheIdentity,
  onTriangles,
  orbit = false,
  float = false,
  turnSeconds = 22,
  refine = false,
}: {
  field: VerticalViewerField;
  cacheIdentity: string;
  onTriangles?: (count: number | null) => void;
  orbit?: boolean;
  float?: boolean;
  turnSeconds?: number;
  refine?: boolean;
}) {
  const [mesh, setMesh] = useState<ReturnType<typeof cachedOpeningMesh> | null>(null);
  useEffect(() => {
    if (field.slices.length < 2) {
      setMesh(null);
      return;
    }
    try {
      setMesh(cachedOpeningMesh(field.slices, {
        identity: cacheIdentity,
        sequence: field.slices.map((slice) => slice.iteration).join(","),
        field: "network",
        mode: "isomesh",
        iso: 0.48,
        sizeZ: MODULE_SIZE_Z,
        refine,
      }));
    } catch {
      setMesh(null);
    }
  }, [cacheIdentity, field, refine]);
  useEffect(() => {
    onTriangles?.(mesh?.triangles ?? null);
  }, [mesh, onTriangles]);
  const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z));
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.dataset.present = float ? "float" : "";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spinning = orbit && !reduced;
    const started = performance.now();
    let frame = 0;
    const paint = (now = started) => {
      const yaw = spinning ? ((now - started) / (turnSeconds * 1000)) * Math.PI * 2 : float ? 0 : 0.62;
      const pitch = float || spinning ? 0.36 : 0.42;
      drawIsoMesh(canvas, mesh, yaw, pitch, column * 0.72, "shell", { transparent: float });
    };
    paint();
    const parent = canvas.parentElement;
    const observer = parent ? new ResizeObserver(() => paint(performance.now())) : null;
    if (parent && observer) observer.observe(parent);
    if (spinning) {
      const loop = (now: number) => {
        paint(now);
        frame = window.requestAnimationFrame(loop);
      };
      frame = window.requestAnimationFrame(loop);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [column, float, mesh, orbit, turnSeconds]);
  return <canvas ref={ref} className="vertical-process-mesh" aria-label="Network morphology in the 20 by 20 by 20 module" />;
}
