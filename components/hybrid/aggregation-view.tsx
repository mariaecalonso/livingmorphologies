"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS_EYE, cursorZoomPoint, drawPlacedMeshes, MIN_CAMERA_DISTANCE, placementCenter, placementFit, placementSurfaceHit, projectPlacement, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Vec3 } from "@/lib/skill4/contract";
import { filmSweepFrame, SWEEP_MS, type FilmSweep } from "./validation-panel";

const MAX_ZOOM_OUT_MULTIPLIER = 2.6;

type CanvasLink = {
  id: string;
  label: string;
  point: Vec3;
  active: boolean;
};

type MeasureSegment = {
  id: string;
  a: Vec3;
  b: Vec3;
  label: string;
};

export function AggregationView({
  instances,
  selectedId,
  onSelect,
  links,
  onSelectConnection,
  span,
  anchorIds,
  initialPitch = 0.35,
  initialYaw = 0.7,
  sweep = null,
  onSweepDone,
  measuring = false,
  measures = [],
  pendingPoint = null,
  onMeasurePoint,
  zoomOut = MAX_ZOOM_OUT_MULTIPLIER,
  tone = "default",
}: {
  instances: readonly PlacedMesh[];
  selectedId: string;
  onSelect: (id: string | null) => void;
  links: readonly CanvasLink[];
  onSelectConnection: (id: string) => void;
  span: number;
  sweep?: FilmSweep | null;
  onSweepDone?: () => void;
  measuring?: boolean;
  measures?: readonly MeasureSegment[];
  pendingPoint?: Vec3 | null;
  onMeasurePoint?: (point: Vec3) => void;
  /** Camera frames these instances. Other meshes, such as a swapped connector, do not move it. */
  anchorIds?: readonly string[];
  /** Radians. Negative looks down from above the ground grid. */
  initialPitch?: number;
  /** Radians around the vertical axis. The ground plane stays horizontal. */
  initialYaw?: number;
  /** How far the wheel can pull back, as a multiple of the resting camera. */
  zoomOut?: number;
  /** Hybrid Cluster viewers use the reduced rim, crease, and bloom. */
  tone?: "default" | "hybrid";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; button: number; shift: boolean; focus: Vec3 } | null>(null);
  const movedRef = useRef(false);
  const [yaw, setYaw] = useState(initialYaw);
  const [pitch, setPitch] = useState(initialPitch);
  const [eye, setEye] = useState(CANVAS_EYE);
  const [focus, setFocus] = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const eyeRef = useRef(CANVAS_EYE);
  const focusRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const fitEyeRef = useRef(CANVAS_EYE);
  const sweepClock = useRef({ id: -1, start: 0, done: false });
  const sweepDoneRef = useRef(onSweepDone);
  sweepDoneRef.current = onSweepDone;
  const [markers, setMarkers] = useState<Array<{ id: string; label: string; active: boolean; x: number; y: number }>>([]);
  const [measureOverlay, setMeasureOverlay] = useState<Array<{ id: string; ax: number; ay: number; bx: number; by: number; label: string }>>([]);
  const [pendingOverlay, setPendingOverlay] = useState<{ x: number; y: number } | null>(null);
  const framed = anchorIds?.length ? instances.filter((item) => anchorIds.includes(item.id)) : instances;
  const base = placementCenter(framed.length ? framed : instances);
  const lookAt = { x: base.x + focus.x, y: base.y + focus.y, z: base.z + focus.z };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (sweep && sweepClock.current.id !== sweep.id) sweepClock.current = { id: sweep.id, start: performance.now(), done: false };
    let frameId = 0;
    const paint = (now?: number) => {
      const clock = sweepClock.current;
      const duration = sweep?.duration ?? SWEEP_MS;
      const t = sweep && clock.id === sweep.id ? Math.min(1, ((now ?? performance.now()) - clock.start) / duration) : 1;
      const drawn = sweep && clock.id === sweep.id ? filmSweepFrame(instances, sweep, t) : instances;
      const frame = drawPlacedMeshes(canvas, drawn, yaw, pitch, span, false, eye, drawn.some((item) => !item.volume), 1, lookAt, false, false, undefined, 1, 0, [0, 0, 0, 1], tone);
      if (!frame) {
        setMarkers((current) => (current.length === 0 ? current : []));
        setMeasureOverlay((current) => (current.length === 0 ? current : []));
        setPendingOverlay((current) => (current == null ? current : null));
        return;
      }
      const next = links.flatMap((link) => {
        const projected = projectPlacement(link.point, frame.center, yaw, pitch, frame.fit, frame.width, frame.height, eye);
        return [{
          id: link.id,
          label: link.label,
          active: link.active,
          x: Math.min(frame.width - 8, Math.max(8, projected.x)),
          y: Math.min(frame.height - 8, Math.max(8, projected.y)),
        }];
      });
      setMarkers((current) => (
        current.length === next.length && current.every((item, index) => {
          const marker = next[index];
          return item.id === marker.id && item.label === marker.label && item.active === marker.active && Math.abs(item.x - marker.x) < 0.5 && Math.abs(item.y - marker.y) < 0.5;
        }) ? current : next
      ));
      const project = (point: Vec3) => projectPlacement(point, frame.center, yaw, pitch, frame.fit, frame.width, frame.height, eye);
      const overlay = measures.map((item) => {
        const a = project(item.a);
        const b = project(item.b);
        return { id: item.id, ax: a.x, ay: a.y, bx: b.x, by: b.y, label: item.label };
      });
      setMeasureOverlay((current) => (
        current.length === overlay.length && current.every((item, index) => {
          const nextItem = overlay[index];
          return item.id === nextItem.id && item.label === nextItem.label && Math.abs(item.ax - nextItem.ax) < 0.5 && Math.abs(item.ay - nextItem.ay) < 0.5 && Math.abs(item.bx - nextItem.bx) < 0.5 && Math.abs(item.by - nextItem.by) < 0.5;
        }) ? current : overlay
      ));
      const pending = pendingPoint ? project(pendingPoint) : null;
      setPendingOverlay((current) => (
        pending && current && Math.abs(current.x - pending.x) < 0.5 && Math.abs(current.y - pending.y) < 0.5 ? current : pending
      ));
      if (!sweep || t >= 1) {
        if (sweep && t >= 1 && !clock.done) {
          clock.done = true;
          sweepDoneRef.current?.();
        }
        return;
      }
      frameId = requestAnimationFrame(paint);
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(parent);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [eye, instances, links, lookAt, measures, pendingPoint, pitch, span, sweep, tone, yaw]);

  useEffect(() => {
    fitEyeRef.current = CANVAS_EYE;
  }, [span]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const currentEye = eyeRef.current;
      const currentFocus = focusRef.current;
      const factor = Math.exp(event.deltaY * 0.0012);
      const fit = fitEyeRef.current;
      const limit = fit * zoomOut;
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
      const scene = placementCenter(framed.length ? framed : instances);
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
        placementFit(span, aspect),
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
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [framed, instances, pitch, span, yaw, zoomOut]);

  const pick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !instances.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const center = lookAt;
    if (measuring && onMeasurePoint) {
      const hit = placementSurfaceHit(instances, x, y, rect.width, rect.height, center, yaw, pitch, placementFit(span, rect.width / Math.max(1, rect.height)), eye);
      if (hit) onMeasurePoint(hit);
      return;
    }
    const aspect = rect.width / Math.max(1, rect.height);
    const fit = placementFit(span, aspect);
    let best = instances.find((instance) => !instance.id.startsWith("guide:")) ?? null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestRadius = 0;
    for (const instance of instances) {
      if (instance.id.startsWith("guide:")) continue;
      const projected = projectPlacement(instance.translate, center, yaw, pitch, fit, rect.width, rect.height, eye);
      const edge = projectPlacement(
        { x: instance.translate.x + 0.62, y: instance.translate.y + 0.25, z: instance.translate.z },
        center,
        yaw,
        pitch,
        fit,
        rect.width,
        rect.height,
        eye,
      );
      const radius = Math.max(36, Math.hypot(edge.x - projected.x, edge.y - projected.y));
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance < bestDistance) {
        best = instance;
        bestDistance = distance;
        bestRadius = radius;
      }
    }
    if (!best || bestDistance > bestRadius) {
      onSelect(null);
      return;
    }
    onSelect(best.id);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="hybrid-stage-canvas"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          movedRef.current = false;
          dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch, button: event.button, shift: event.shiftKey, focus: focusRef.current };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Playback drags have no live pointer to capture. Move events still turn the view.
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.hypot(dx, dy) > 4) movedRef.current = true;
          if (drag.shift || drag.button === 1 || drag.button === 2) {
            const scale = Math.max(span, 8) * 0.0016 / Math.max(0.45, eye);
            const next = { x: drag.focus.x - dx * scale, y: drag.focus.y + dy * scale * 0.35, z: drag.focus.z - dy * scale };
            focusRef.current = next;
            setFocus(next);
            return;
          }
          setYaw(drag.yaw - dx * 0.008);
          setPitch(Math.min(1.2, Math.max(-1.2, drag.pitch - dy * 0.008)));
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          if (!movedRef.current) pick(event);
        }}
        data-orbit-yaw={yaw.toFixed(3)}
        data-orbit-pitch={pitch.toFixed(3)}
        data-camera-eye={eye.toFixed(3)}
        data-camera-target={`${lookAt.x.toFixed(3)},${lookAt.y.toFixed(3)},${lookAt.z.toFixed(3)}`}
        data-eye-min={MIN_CAMERA_DISTANCE}
        data-eye-max={CANVAS_EYE * zoomOut}
        data-ground="registration"
        data-measuring={measuring || undefined}
        aria-label={`Aggregation canvas, ${selectedId} selected`}
      />
      <svg className="hybrid-measure" aria-hidden="true">
        {measureOverlay.map((item) => (
          <g key={item.id}>
            <line x1={item.ax} y1={item.ay} x2={item.bx} y2={item.by} />
            <text x={(item.ax + item.bx) / 2} y={(item.ay + item.by) / 2 - 8}>{item.label}</text>
          </g>
        ))}
        {pendingOverlay ? <circle cx={pendingOverlay.x} cy={pendingOverlay.y} r="3" /> : null}
      </svg>
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className="hybrid-link"
          data-active={marker.active || undefined}
          data-connection-indicator={marker.id}
          style={{ left: marker.x, top: marker.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onSelectConnection(marker.id);
          }}
        >
          {marker.label}
        </button>
      ))}
    </>
  );
}
