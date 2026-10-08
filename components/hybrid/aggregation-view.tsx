"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS_EYE, CANVAS_EYE_MAX, CANVAS_EYE_MIN, drawPlacedMeshes, placementCenter, placementFit, projectPlacement, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Vec3 } from "@/lib/skill4/contract";

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
}: {
  instances: readonly PlacedMesh[];
  selectedId: string;
  onSelect: (id: string | null) => void;
  links: readonly CanvasLink[];
  onSelectConnection: (id: string) => void;
  span: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const movedRef = useRef(false);
  const [yaw, setYaw] = useState(0.7);
  const [pitch, setPitch] = useState(0.35);
  const [eye, setEye] = useState(CANVAS_EYE);
  const [markers, setMarkers] = useState<Array<{ id: string; label: string; active: boolean; x: number; y: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      const frame = drawPlacedMeshes(canvas, instances, yaw, pitch, span, false, eye, true);
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
  }, [eye, instances, links, pitch, span, yaw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = Math.exp(event.deltaY * 0.0012);
      setEye((current) => Math.min(CANVAS_EYE_MAX, Math.max(CANVAS_EYE_MIN, current * factor)));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const pick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !instances.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const center = placementCenter(instances);
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
        data-eye-min={CANVAS_EYE_MIN}
        data-eye-max={CANVAS_EYE_MAX}
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
