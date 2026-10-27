"use client";

import { useEffect, useRef } from "react";
import { paintedBox } from "@/lib/canvas-frame";
import { drawPlanField } from "@/components/skill1-viz";
import type { FieldAttractor, FieldSnapshot } from "@/lib/skill1/types";

/** Paints a trail field with the Physarum plan renderer, sized to the canvas parent. */
export function paintMorphology(
  canvas: HTMLCanvasElement,
  snapshot: FieldSnapshot,
  fine = false,
  attractors?: FieldAttractor[],
  box?: { width: number; height: number },
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const frame = paintedBox(parent);
  const layoutW = box?.width ?? frame.layoutW;
  const layoutH = box?.height ?? frame.layoutH;
  const width = box ? Math.max(1, Math.floor(frame.width)) : frame.width;
  const height = box ? Math.max(1, Math.floor(frame.height)) : frame.height;
  const dpr = Math.max(window.devicePixelRatio || 1, width >= 200 ? 2 : 1);
  if (width < 8 || height < 8) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${Math.max(1, Math.floor(layoutW))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(layoutH))}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  drawPlanField(ctx, snapshot, width, height, { showHud: false, fine, density: 5, attractors, showAttractors: false });
}

/** Fills its parent and repaints on resize. Uses layout size, so ancestor transforms do not distort it. */
export function MorphologyPreview({
  snapshot,
  attractors,
  className = "",
}: {
  snapshot: FieldSnapshot;
  attractors?: FieldAttractor[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const paint = () => paintMorphology(canvas, snapshot, false, attractors, { width: box.clientWidth, height: box.clientHeight });
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => observer.disconnect();
  }, [snapshot, attractors]);

  return (
    <span className={`morphology-preview ${className}`}>
      <canvas ref={canvasRef} />
    </span>
  );
}
