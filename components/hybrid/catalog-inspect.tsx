"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import { resolveAssemblyHybrid } from "@/lib/skill4/assembly-hybrid";
import { connectionsFromCatalog, tilesFromCatalog, type CatalogEntry } from "@/lib/skill4/catalog";
import { groundPlaneY, MODULE_SIZE, type Vec3 } from "@/lib/skill4/contract";
import {
  CANVAS_EYE,
  CANVAS_EYE_MIN,
  cursorZoomPoint,
  drawPlacedMeshes,
  placedAssemblyBounds,
  placementFit,
  type PlacedMesh,
} from "@/lib/skill4/draw-placed";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { resolveTileModule } from "@/lib/skill4/tiles";

const TURN_SECONDS = 32;
const RESUME_MS = 4000;
const MAX_ZOOM_OUT_MULTIPLIER = 1.2;
const WHITE: [number, number, number] = [1, 1, 1];
/** Fifteen degrees downward. Negative pitch sits the camera above the look target. */
const PRESENT_PITCH = -15 * Math.PI / 180;
const LOOK_LIFT = 0.1;
const FRAME_MARGIN = 1.75;
const GROUND_MARGIN = MODULE_SIZE * 0.15;

/** Read-only placed copy of a catalog entry. Does not read or write the working assembly. */
export function catalogInspectionMeshes(entry: CatalogEntry, loaded: ReadonlyMap<string, ModuleHandoff>): { meshes: PlacedMesh[]; missing: boolean } {
  const tiles = tilesFromCatalog(entry);
  const connections = connectionsFromCatalog(entry, tiles, loaded);
  const parents = tiles.flatMap((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    if (handoff.status !== "ready" || !handoff.geometry) return [];
    return [{
      id: tile.instanceId,
      mesh: handoff.geometry,
      translate: tile.transform,
      selected: false,
      spin: 0,
      mirror: 0 as const,
      basis: tileBasis(tile),
      kind: 0 as const,
      color: WHITE,
    }];
  });
  const connectors = connections.flatMap((connection) => {
    const hybrid = resolveAssemblyHybrid(connection, tiles, loaded);
    if (!hybrid.geometry) return [];
    return [{
      id: `${hybrid.source}:${connection.id}`,
      mesh: hybrid.geometry,
      translate: hybrid.translate,
      selected: false,
      spin: hybrid.spin,
      kind: 1 as const,
      palette: true,
    }];
  });
  return {
    meshes: [...parents, ...connectors],
    missing: connections.some((connection) => connection.catalogHybrid === "missing"),
  };
}

export function CatalogInspect({
  entry,
  loaded,
  onClose,
  onRestore,
  onSaveFinal,
  saved = false,
}: {
  entry: CatalogEntry;
  loaded: ReadonlyMap<string, ModuleHandoff>;
  onClose: () => void;
  onRestore: () => void;
  onSaveFinal?: () => void;
  saved?: boolean;
}) {
  const viewed = useMemo(() => catalogInspectionMeshes(entry, loaded), [entry, loaded]);
  const instances = viewed.meshes;
  const framed = useMemo(() => placedAssemblyBounds(instances), [instances]);
  const names = [...new Set(entry.tiles.map((tile) => tile.name))];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="hybrid-catalog-inspect" data-catalog-inspect={entry.id} onClick={onClose}>
      <div
        className="hybrid-catalog-inspect-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Assembly ${entry.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hybrid-stage hybrid-catalog-inspect-stage">
          <CatalogTurntable instances={instances} center={framed.center} span={framed.span * FRAME_MARGIN} height={framed.height} label={entry.id} />
          {onSaveFinal ? (
            <button type="button" className="hybrid-generate hybrid-final-save-stage" disabled={saved} onClick={onSaveFinal}>
              {saved ? "Saved" : "Save to Final Catalog"}
            </button>
          ) : null}
        </div>
        <aside className="hybrid-catalog-inspect-info">
          <button type="button" className="hybrid-som-close" onClick={onClose}>Close</button>
          <p>Assembly</p>
          <strong>{entry.id}</strong>
          {entry.batchId ? <p>Batch</p> : null}
          {entry.batchId ? <strong>{entry.batchId.replace("_", " ")}</strong> : null}
          {entry.batch ? <p>Connection</p> : null}
          {entry.batch ? <strong>{viewed.meshes.some((mesh) => mesh.kind === 1) ? "PLACED" : `${entry.batch.connected} · floating ${entry.batch.floating}`}</strong> : null}
          <p>Archetypes</p>
          <ul>
            {names.map((name) => <li key={name}>{name}</li>)}
          </ul>
          <p>Tiles</p>
          <strong>{entry.tileCount}</strong>
          <p>Layout</p>
          <strong>{entry.arrangement}</strong>
          <p>Connections</p>
          <strong>{entry.connections.length}</strong>
          {entry.connections.length > 0 ? (
            <ul>
              {entry.connections.map((connection) => (
                <li key={connection.id}>
                  {connection.tileAId}:{connection.faceA} ↔ {connection.tileBId}:{connection.faceB} · {connection.selectedMockId}
                </li>
              ))}
            </ul>
          ) : null}
          {viewed.missing ? <p>SAVED_HYBRID_MISSING</p> : null}
          <button type="button" className="hybrid-som-close" onClick={onRestore}>Open in Assembly</button>
        </aside>
      </div>
    </div>
  );
}

function highestPitch(lookY: number, radius: number) {
  const room = (lookY - (groundPlaneY() + GROUND_MARGIN)) / Math.max(radius, 1e-3);
  return Math.asin(Math.max(-1, Math.min(1, room)));
}

function CatalogTurntable({
  instances,
  center,
  span,
  height,
  label,
}: {
  instances: readonly PlacedMesh[];
  center: Vec3;
  span: number;
  height: number;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const yawRef = useRef(0.7);
  const pitchRef = useRef(PRESENT_PITCH);
  const eyeRef = useRef(CANVAS_EYE);
  const focusRef = useRef<Vec3>({ x: 0, y: height * LOOK_LIFT, z: 0 });
  const heldRef = useRef(false);
  const aimedRef = useRef(false);
  const resumeAtRef = useRef(0);
  const [yaw, setYaw] = useState(0.7);
  const [pitch, setPitch] = useState(PRESENT_PITCH);
  const [eye, setEye] = useState(CANVAS_EYE);
  const [focus, setFocus] = useState<Vec3>({ x: 0, y: height * LOOK_LIFT, z: 0 });
  const lookX = center.x + focus.x;
  const lookY = center.y + focus.y;
  const lookZ = center.z + focus.z;
  const lookAt = { x: lookX, y: lookY, z: lookZ };

  useEffect(() => {
    if (aimedRef.current) return;
    const next = { x: 0, y: height * LOOK_LIFT, z: 0 };
    focusRef.current = next;
    pitchRef.current = PRESENT_PITCH;
    setFocus(next);
    setPitch(PRESENT_PITCH);
  }, [height]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!heldRef.current && now >= resumeAtRef.current) {
        const next = yawRef.current + (Math.PI * 2 / TURN_SECONDS) * dt;
        yawRef.current = next;
        setYaw(next);
        const stage = canvasRef.current?.parentElement;
        if (stage) {
          const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
          const radius = eyeRef.current / Math.max(1e-4, placementFit(span, aspect));
          const capped = Math.min(pitchRef.current, highestPitch(center.y + focusRef.current.y, radius));
          if (capped < pitchRef.current - 1e-4) {
            pitchRef.current = capped;
            setPitch(capped);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [center, span]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      drawPlacedMeshes(canvas, instances, yaw, pitch, span, false, eye, true, 1, lookAt);
      const stage = canvas.parentElement;
      if (!stage) return;
      const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
      const radius = eye / Math.max(1e-4, placementFit(span, aspect));
      canvas.dataset.cameraY = (lookAt.y - radius * Math.sin(pitch)).toFixed(2);
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [eye, instances, lookX, lookY, lookZ, pitch, span, yaw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resumeAtRef.current = performance.now() + RESUME_MS;
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
      const nextEye = Math.max(CANVAS_EYE_MIN, currentEye * factor);
      const applied = nextEye / currentEye;
      const target = { x: center.x + currentFocus.x, y: center.y + currentFocus.y, z: center.z + currentFocus.z };
      const aspect = rect.width / Math.max(1, rect.height);
      const hit = cursorZoomPoint(
        instances,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        target,
        yawRef.current,
        pitchRef.current,
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
  }, [center, instances, span]);

  return (
    <canvas
      ref={canvasRef}
      className="hybrid-stage-canvas"
      data-catalog-turntable={label}
      data-orbit-yaw={yaw.toFixed(3)}
      data-orbit-pitch={pitch.toFixed(3)}
      data-camera-eye={eye.toFixed(3)}
      data-camera-target={`${lookAt.x.toFixed(3)},${lookAt.y.toFixed(3)},${lookAt.z.toFixed(3)}`}
      aria-label={`Saved assembly ${label}`}
      onPointerDown={(event) => {
        heldRef.current = true;
        aimedRef.current = true;
        dragRef.current = { x: event.clientX, y: event.clientY, yaw: yawRef.current, pitch: pitchRef.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const nextYaw = drag.yaw - (event.clientX - drag.x) * 0.008;
        const stage = event.currentTarget.parentElement;
        const aspect = (stage?.clientWidth ?? 1) / Math.max(1, stage?.clientHeight ?? 1);
        const radius = eyeRef.current / Math.max(1e-4, placementFit(span, aspect));
        const nextPitch = Math.min(
          highestPitch(center.y + focusRef.current.y, radius),
          Math.max(-1.2, drag.pitch - (event.clientY - drag.y) * 0.008),
        );
        yawRef.current = nextYaw;
        pitchRef.current = nextPitch;
        setYaw(nextYaw);
        setPitch(nextPitch);
      }}
      onPointerUp={() => {
        dragRef.current = null;
        heldRef.current = false;
        resumeAtRef.current = performance.now() + RESUME_MS;
      }}
    />
  );
}
