"use client";

import { useEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Mat3 } from "@/lib/skill4/tile-basis";

const TURN_SECONDS = 32;
const turntables = new Set<(yaw: number) => void>();
let turnYaw = 0.7;
let turnFrame = 0;
let turnStamp = 0;

function ensureTurntable() {
  if (turnFrame) return;
  turnStamp = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - turnStamp) / 1000);
    turnStamp = now;
    turnYaw += (Math.PI * 2 / TURN_SECONDS) * dt;
    turntables.forEach((paint) => paint(turnYaw));
    turnFrame = requestAnimationFrame(tick);
  };
  turnFrame = requestAnimationFrame(tick);
}

export function MeshPreview({
  mesh = null,
  color = [1, 1, 1],
  kind = 0,
  contain = false,
  guides = [],
  yaw = 0.7,
  pitch = 0.35,
  spin = 0,
  mirror = 0,
  basis,
  fitScale = 1,
  fill = false,
  turn = false,
  placed,
}: {
  mesh?: IsoMesh | null;
  color?: [number, number, number];
  kind?: 0 | 1;
  contain?: boolean;
  guides?: readonly { mesh: IsoMesh; color: [number, number, number]; opacity?: number }[];
  yaw?: number;
  pitch?: number;
  spin?: number;
  mirror?: 0 | 1 | 2 | 3;
  basis?: Mat3;
  fitScale?: number;
  fill?: boolean;
  turn?: boolean;
  placed?: readonly PlacedMesh[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const instances = [
      ...(placed ?? (mesh ? [{ id: "preview", mesh, translate: { x: 0, y: 0, z: 0 }, selected: false, color, kind, spin, mirror, basis }] : [])),
      ...guides.map((guide, index) => ({
        id: `guide:${index}`,
        mesh: guide.mesh,
        translate: { x: 0, y: 0, z: 0 },
        selected: false,
        color: guide.color,
        opacity: guide.opacity,
        kind: 0 as const,
        spin,
        mirror,
        basis,
      })),
    ];
    const paint = (angle: number) => {
      drawPlacedMeshes(canvas, instances, angle, pitch, 1.2, contain, undefined, false, fitScale, undefined, fill);
    };
    paint(turn ? turnYaw : yaw);
    const parent = canvas.parentElement;
    const observer = parent ? new ResizeObserver(() => paint(turn ? turnYaw : yaw)) : null;
    if (parent && observer) observer.observe(parent);
    if (!turn) return () => observer?.disconnect();
    const spinPaint = (angle: number) => paint(angle);
    turntables.add(spinPaint);
    ensureTurntable();
    return () => {
      observer?.disconnect();
      turntables.delete(spinPaint);
      if (turntables.size === 0 && turnFrame) {
        cancelAnimationFrame(turnFrame);
        turnFrame = 0;
      }
    };
  }, [basis, color, contain, fill, fitScale, guides, kind, mesh, mirror, pitch, placed, spin, turn, yaw]);

  return <canvas ref={canvasRef} className="hybrid-preview-canvas" />;
}
