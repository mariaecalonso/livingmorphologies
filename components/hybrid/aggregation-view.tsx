"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS_EYE, cursorZoomPoint, drawPlacedMeshes, MIN_CAMERA_DISTANCE, placementCenter, placementFit, projectPlacement, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Vec3 } from "@/lib/skill4/contract";

const MAX_ZOOM_OUT_MULTIPLIER = 1.2;

type CanvasLink = {
  id: string;
  label: string;
  point: Vec3;
  active: boolean;
};

export function AggregationView({
  instances,
  selectedId,
  onSelect,
  links,
  onSelectConnection,
  span,
  anchorIds,
}: {
  instances: readonly PlacedMesh[];
  selectedId: string;
  onSelect: (id: string | null) => void;
  links: readonly CanvasLink[];
  onSelectConnection: (id: string) => void;
  span: number;
  /** Camera frames these instances. Other meshes, such as a swapped connector, do not move it. */
  anchorIds?: readonly string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const movedRef = useRef(false);
  const [yaw, setYaw] = useState(0.7);
  const [pitch, setPitch] = useState(0.35);
  const [eye, setEye] = useState(CANVAS_EYE);
  const [focus, setFocus] = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const eyeRef = useRef(CANVAS_EYE);
  const focusRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const fitEyeRef = useRef(CANVAS_EYE);
  const [markers, setMarkers] = useState<Array<{ id: string; label: string; active: boolean; x: number; y: number }>>([]);
  const framed = anchorIds?.length ? instances.filter((item) => anchorIds.includes(item.id)) : instances;
  const base = placementCenter(framed.length ? framed : instances);
  const lookAt = { x: base.x + focus.x, y: base.y + focus.y, z: base.z + focus.z };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      const frame = drawPlacedMeshes(canvas, instances, yaw, pitch, span, false, eye, true, 1, lookAt);
      if (!frame) {
        setMarkers((current) => (current.length === 0 ? current : []));
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
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [eye, instances, links, lookAt, pitch, span, yaw]);

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
  }, [framed, instances, pitch, span, yaw]);

  const pick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !instances.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const center = lookAt;
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
        onPointerDown={(event) => {
          movedRef.current = false;
          dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.hypot(dx, dy) > 4) movedRef.current = true;
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
        data-eye-max={CANVAS_EYE * MAX_ZOOM_OUT_MULTIPLIER}
        data-ground="registration"
        aria-label={`Aggregation canvas, ${selectedId} selected`}
      />
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
