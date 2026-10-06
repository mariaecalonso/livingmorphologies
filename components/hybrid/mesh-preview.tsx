"use client";

import { useEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";

export function MeshPreview({
  mesh,
  color = [0.85, 0.62, 0.48],
  kind = 1,
}: {
  mesh: IsoMesh | null;
  color?: [number, number, number];
  kind?: 0 | 1;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      drawPlacedMeshes(
        canvas,
        mesh ? [{ id: "preview", mesh, translate: { x: 0, y: 0, z: 0 }, selected: false, color, kind }] : [],
        0.7,
        0.35,
        1.2,
      );
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [color, kind, mesh]);

  return <canvas ref={canvasRef} className="hybrid-preview-canvas" />;
}
