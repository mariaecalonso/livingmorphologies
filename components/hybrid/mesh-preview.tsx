"use client";

import { useEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes, projectPlacement, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Vec3 } from "@/lib/skill4/contract";
import type { Mat3 } from "@/lib/skill4/tile-basis";

const NO_NOTES: readonly { at: Vec3; label: string; color: string }[] = [];
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
  notes = NO_NOTES,
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
  notes?: readonly { at: Vec3; label: string; color: string }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notesRef = useRef<SVGSVGElement>(null);

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
      const frame = drawPlacedMeshes(canvas, instances, angle, pitch, 1.2, contain, undefined, false, fitScale, undefined, fill);
      const svg = notesRef.current;
      if (!svg) return;
      if (!frame || notes.length === 0) {
        svg.replaceChildren();
        return;
      }
      svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
      const lift = Math.max(36, frame.height * 0.18);
      const placedNotes: { x: number; y: number }[] = [];
      const marks = notes.map((note) => {
        const anchor = projectPlacement(note.at, frame.center, angle, pitch, frame.fit, frame.width, frame.height);
        let labelY = Math.max(14, anchor.y - lift);
        for (const other of placedNotes) {
          if (Math.abs(other.x - anchor.x) < 28 && Math.abs(other.y - labelY) < 16) labelY = Math.max(14, other.y - 16);
        }
        placedNotes.push({ x: anchor.x, y: labelY });
        return { ...note, x: anchor.x, y: anchor.y, labelY };
      });
      svg.replaceChildren(...marks.map((mark) => {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(mark.x));
        line.setAttribute("y1", String(mark.y));
        line.setAttribute("x2", String(mark.x));
        line.setAttribute("y2", String(mark.labelY + 8));
        line.setAttribute("stroke", mark.color);
        line.setAttribute("stroke-width", "1.15");
        line.setAttribute("stroke-dasharray", "1.2 3.5");
        line.setAttribute("stroke-linecap", "round");
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(mark.x));
        text.setAttribute("y", String(mark.labelY));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", mark.color);
        text.textContent = mark.label;
        group.append(line, text);
        return group;
      }));
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
  }, [basis, color, contain, fill, fitScale, guides, kind, mesh, mirror, notes, pitch, placed, spin, turn, yaw]);

  return (
    <>
      <canvas ref={canvasRef} className="hybrid-preview-canvas" />
      {notes.length > 0 ? <svg ref={notesRef} className="hybrid-clip-notes" aria-hidden="true" /> : null}
    </>
  );
}
