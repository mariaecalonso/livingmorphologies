"use client";

import { useEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";

export function MeshPreview({
  mesh,
  color = [0.85, 0.62, 0.48],
  kind = 1,
  contain = false,
  guides = [],
  yaw = 0.7,
  pitch = 0.35,
}: {
  mesh: IsoMesh | null;
  color?: [number, number, number];
  kind?: 0 | 1;
  contain?: boolean;
  guides?: readonly { mesh: IsoMesh; color: [number, number, number] }[];
  yaw?: number;
  pitch?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      drawPlacedMeshes(
        canvas,
        [
          ...(mesh ? [{ id: "preview", mesh, translate: { x: 0, y: 0, z: 0 }, selected: false, color, kind }] : []),
          ...guides.map((guide, index) => ({
            id: `guide:${index}`,
            mesh: guide.mesh,
            translate: { x: 0, y: 0, z: 0 },
            selected: false,
            color: guide.color,
            kind: 1 as const,
          })),
        ],
        yaw,
        pitch,
        1.2,
        contain,
      );
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [color, contain, guides, kind, mesh, pitch, yaw]);

  return <canvas ref={canvasRef} className="hybrid-preview-canvas" />;
}
