"use client";

import { useEffect, useRef, useState } from "react";
import { rasterTrailPlate } from "@/components/vertical-render";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import { stackDisplayIndices, stackDisplaySlices } from "@/lib/skill3/stack-display";
import { orthoStackFrame } from "@/lib/skill3/view-project";
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
    const pitch = 0.18;
    const full = Math.max(1, plates.length - 1) * pitch;
    const frame = orthoStackFrame(width, height, 0.45, 1.02, full, true);
    const shown = stackDisplayIndices(field.slices.length, plateLimit);
    const nextHits: { index: number; x: number; y: number }[] = [];
    const order = plates.map((_, index) => index).sort((a, b) => {
      const ay = (a - (plates.length - 1) / 2) * pitch;
      const by = (b - (plates.length - 1) / 2) * pitch;
      return frame.rotate(0, ay, 0).z - frame.rotate(0, by, 0).z;
    });
    for (const index of order) {
      const y = (index - (plates.length - 1) / 2) * pitch;
      const origin = frame.rotate(-0.5, y, -0.5);
      const basis = frame.plateBasis(dpr, origin);
      const reason = reasons?.[shown[index] ?? -1];
      ctx.save();
      ctx.setTransform(basis.a, basis.b, basis.c, basis.d, basis.e, basis.f);
      ctx.globalAlpha = index === plates.length - 1 ? 0.96 : 0.42;
      ctx.drawImage(plates[index], 0, 0, 1, 1);
      ctx.globalAlpha = index === plates.length - 1 ? 0.95 : 0.55;
      ctx.strokeStyle = PLANE_INK[reason ?? ""] ?? "rgba(242,242,238,0.7)";
      ctx.lineWidth = index === plates.length - 1 ? 0.012 : 0.006;
      ctx.strokeRect(0, 0, 1, 1);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${Math.max(12, height * 0.045)}px sans-serif`;
    ctx.textBaseline = "middle";
    shown.forEach((sourceIndex, plateIndex) => {
      const y = (plateIndex - (plates.length - 1) / 2) * pitch;
      const point = frame.project(0, y, 0);
      nextHits.push({ index: sourceIndex, x: point.x, y: point.y });
      const label = labels?.[sourceIndex];
      if (!label) return;
      const tag = frame.project(0.62, y, -0.42);
      ctx.fillStyle = PLANE_INK[reasons?.[sourceIndex] ?? ""] ?? "#f2f2ee";
      ctx.fillText(label, tag.x, tag.y);
    });
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
}: {
  field: VerticalViewerField;
  cacheIdentity: string;
  onTriangles?: (count: number | null) => void;
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
      }));
    } catch {
      setMesh(null);
    }
  }, [cacheIdentity, field]);
  useEffect(() => {
    onTriangles?.(mesh?.triangles ?? null);
  }, [mesh, onTriangles]);
  const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z));
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => drawIsoMesh(canvas, mesh, 0.62, 0.42, column * 0.42, "shell");
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [column, mesh]);
  return <canvas ref={ref} className="vertical-process-mesh" aria-label="Network morphology in the 20 by 20 by 20 module" />;
}
