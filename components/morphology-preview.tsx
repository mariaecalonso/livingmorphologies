"use client";

import { useEffect, useRef } from "react";
import { drawPlanField } from "@/components/skill1-viz";
import type { FieldAttractor, FieldSnapshot } from "@/lib/skill1/types";

/** Paints a trail field with the Physarum plan renderer, sized to the canvas parent. */
export function paintMorphology(
  canvas: HTMLCanvasElement,
  snapshot: FieldSnapshot,
  fine = false,
  attractors?: FieldAttractor[],
  box?: { width: number; height: number },
  density = 5,
  peak?: number,
  hairThin = false,
  inkGain = 1,
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const width = Math.max(1, Math.floor(box?.width ?? parent.clientWidth));
  const height = Math.max(1, Math.floor(box?.height ?? parent.clientHeight));
  const side = Math.max(1, Math.min(width, height));
  const dpr = Math.max(window.devicePixelRatio || 1, side >= 200 ? 2 : 1);
  if (side < 8) return;
  canvas.width = side * dpr;
  canvas.height = side * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.objectFit = "contain";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, side, side);
  drawPlanField(ctx, snapshot, side, side, { showHud: false, fine, density, attractors, showAttractors: false, peak, hairThin, inkGain });
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
