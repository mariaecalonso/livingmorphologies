"use client";

import { useEffect, useRef, useState } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { CANVAS_EYE, MIN_CAMERA_DISTANCE, cursorZoomPoint, drawPlacedMeshes, placementCenter, placementFit, projectPlacement, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Vec3 } from "@/lib/skill4/contract";
import type { Mat3 } from "@/lib/skill4/tile-basis";

const NO_NOTES: readonly { at: Vec3; label: string; color: string }[] = [];
/** Same pull-back cap as the aggregation canvas. */
const MAX_ZOOM_OUT_MULTIPLIER = 1.2;
const TURN_SECONDS = 32;
const turntables = new Set<(yaw: number) => void>();
let turnYaw = 0.7;
let turnFrame = 0;
let turnStamp = 0;

function measurePreview(instances: readonly PlacedMesh[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let found = false;
  for (const instance of instances) {
    const positions = instance.mesh.positions;
    for (let index = 0; index < positions.length; index += 3) {
      found = true;
      const x = positions[index] + instance.translate.x;
      const y = positions[index + 1] + instance.translate.y;
      const z = positions[index + 2] + instance.translate.z;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!found) return { span: 1.2, center: placementCenter(instances) };
  return {
    span: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}

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
  steer = false,
  canvasZoom = false,
  onFrame,
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
  /** Keep the filled framing, and use the given yaw and pitch. */
  steer?: boolean;
  /** Scroll zoom with the aggregation canvas distance, limit, and cursor target. */
  canvasZoom?: boolean;
  onFrame?: (angle: { yaw: number; pitch: number }) => void;
  turn?: boolean;
  placed?: readonly PlacedMesh[];
  notes?: readonly { at: Vec3; label: string; color: string }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notesRef = useRef<SVGSVGElement>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const [eye, setEye] = useState(CANVAS_EYE);
  const [focus, setFocus] = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const eyeRef = useRef(CANVAS_EYE);
  const focusRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const sceneRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const spanRef = useRef(1.2);

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
    const measured = canvasZoom ? measurePreview(instances) : null;
    if (measured) {
      sceneRef.current = measured.center;
      spanRef.current = measured.span;
    }
    const lookAt = canvasZoom ? {
      x: sceneRef.current.x + focus.x,
      y: sceneRef.current.y + focus.y,
      z: sceneRef.current.z + focus.z,
    } : undefined;
    const paint = (angle: number) => {
      const frame = drawPlacedMeshes(
        canvas,
        instances,
        angle,
        pitch,
        canvasZoom ? spanRef.current : 1.2,
        canvasZoom ? false : contain,
        canvasZoom ? eye : undefined,
        false,
        fitScale,
        lookAt,
        canvasZoom ? false : fill,
        canvasZoom ? false : steer,
      );
      if (canvasZoom) canvas.dataset.cameraEye = eye.toFixed(3);
      if (frame) onFrameRef.current?.({ yaw: frame.yaw, pitch: frame.pitch });
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
        const anchor = projectPlacement(note.at, frame.center, angle, pitch, frame.fit, frame.width, frame.height, canvasZoom ? eye : undefined);
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
    const onWheel = (event: WheelEvent) => {
      if (!canvasZoom) return;
      event.preventDefault();
      event.stopPropagation();
      const currentEye = eyeRef.current;
      const currentFocus = focusRef.current;
      const factor = Math.exp(event.deltaY * 0.0012);
      const fit = CANVAS_EYE;
      const limit = fit * MAX_ZOOM_OUT_MULTIPLIER;
      if (factor > 1) {
        if (currentEye >= limit - 1e-3) return;
        const nextEye = Math.min(limit, currentEye * factor);
        const arrived = Math.min(nextEye, fit);
        const keep = currentEye < fit - 1e-4 ? (fit - arrived) / (fit - currentEye) : 0;
        const nextFocus = { x: currentFocus.x * keep, y: currentFocus.y * keep, z: currentFocus.z * keep };
        eyeRef.current = nextEye;
        focusRef.current = nextFocus;
        setEye(nextEye);
        setFocus(nextFocus);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const nextEye = Math.max(MIN_CAMERA_DISTANCE, currentEye * factor);
      const applied = nextEye / currentEye;
      const scene = sceneRef.current;
      const target = { x: scene.x + currentFocus.x, y: scene.y + currentFocus.y, z: scene.z + currentFocus.z };
      const aspect = rect.width / Math.max(1, rect.height);
      const hit = cursorZoomPoint(
        instances,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        target,
        yaw,
        pitch,
        placementFit(spanRef.current, aspect),
        currentEye,
      );
      const shift = 1 - applied;
      const nextFocus = {
        x: currentFocus.x + (hit.point.x - target.x) * shift,
        y: currentFocus.y + (hit.point.y - target.y) * shift,
        z: currentFocus.z + (hit.point.z - target.z) * shift,
      };
      eyeRef.current = nextEye;
      focusRef.current = nextFocus;
      setEye(nextEye);
      setFocus(nextFocus);
    };
    if (canvasZoom && parent) parent.addEventListener("wheel", onWheel, { passive: false });
    if (!turn) return () => {
      observer?.disconnect();
      parent?.removeEventListener("wheel", onWheel);
    };
    const spinPaint = (angle: number) => paint(angle);
    turntables.add(spinPaint);
    ensureTurntable();
    return () => {
      observer?.disconnect();
      parent?.removeEventListener("wheel", onWheel);
      turntables.delete(spinPaint);
      if (turntables.size === 0 && turnFrame) {
        cancelAnimationFrame(turnFrame);
        turnFrame = 0;
      }
    };
  }, [basis, canvasZoom, color, contain, eye, fill, fitScale, focus, guides, kind, mesh, mirror, notes, pitch, placed, spin, steer, turn, yaw]);

  return (
    <>
      <canvas ref={canvasRef} className="hybrid-preview-canvas" />
      {notes.length > 0 ? <svg ref={notesRef} className="hybrid-clip-notes" aria-hidden="true" /> : null}
    </>
  );
}
