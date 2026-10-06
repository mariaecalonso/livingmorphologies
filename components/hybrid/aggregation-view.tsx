"use client";

import { useEffect, useRef, useState } from "react";
import { drawPlacedMeshes, placementCenter, placementFit, projectPlacement, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { Vec3 } from "@/lib/skill4/contract";

export function AggregationView({
  instances,
  selectedId,
  onSelect,
  connectionLabel,
  connectionPoint,
  connectionActive,
  onSelectConnection,
  span,
}: {
  instances: readonly PlacedMesh[];
  selectedId: string;
  onSelect: (id: string) => void;
  connectionLabel: string | null;
  connectionPoint: Vec3 | null;
  connectionActive: boolean;
  onSelectConnection: () => void;
  span: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const movedRef = useRef(false);
  const [yaw, setYaw] = useState(0.7);
  const [pitch, setPitch] = useState(0.35);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      const frame = drawPlacedMeshes(canvas, instances, yaw, pitch, span);
      if (!frame || !connectionPoint) {
        setMarker((current) => (current === null ? current : null));
        return;
      }
      const projected = projectPlacement(
        connectionPoint,
        frame.center,
        yaw,
        pitch,
        frame.fit,
        frame.width,
        frame.height,
      );
      const next = {
        x: Math.min(frame.width - 8, Math.max(8, projected.x)),
        y: Math.min(frame.height - 8, Math.max(8, projected.y)),
      };
      setMarker((current) => (current && Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5 ? current : next));
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [connectionPoint, instances, pitch, span, yaw]);

  const pick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !instances.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const center = placementCenter(instances);
    const aspect = rect.width / Math.max(1, rect.height);
    const fit = placementFit(span, aspect);
    let best = instances[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const instance of instances) {
      const projected = projectPlacement(instance.translate, center, yaw, pitch, fit, rect.width, rect.height);
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance < bestDistance) {
        best = instance;
        bestDistance = distance;
      }
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
          setYaw(drag.yaw + dx * 0.008);
          setPitch(Math.min(1.2, Math.max(-1.2, drag.pitch + dy * 0.008)));
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          if (!movedRef.current) pick(event);
        }}
        aria-label={`Aggregation canvas, ${selectedId} selected`}
      />
      {connectionLabel && marker ? (
        <button
          type="button"
          className="hybrid-link"
          data-active={connectionActive || undefined}
          data-connection-indicator
          style={{ left: marker.x, top: marker.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onSelectConnection();
          }}
        >
          {connectionLabel}
        </button>
      ) : null}
    </>
  );
}
