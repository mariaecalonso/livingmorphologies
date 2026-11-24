"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClusterCriteriaView } from "./cluster-analysis-view";
import { levelName, readClusterCriteria } from "@/lib/skill4/cluster-criteria-reading";
import { drawPlacedMeshes, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { FinishedIteration } from "@/lib/skill4/finished-catalog";
import type { ShrinkwrapVoidReport } from "@/lib/skill4/cluster-void";
import type { IsoMesh } from "@/lib/scan/isomesh";

const ORANGE: [number, number, number] = [0.78, 0.494, 0.373];
/** Same ground reading as the catalog cards: yaw around the vertical, looking down onto the floor. */
const GROUND_YAW = 0.8;
const GROUND_PITCH = -0.58;

type Plate = { solid: IsoMesh | null; void: IsoMesh | null };

function StudyCanvas({
  instances,
  span,
  yaw = GROUND_YAW,
  pitch = GROUND_PITCH,
  ground = false,
  fitScale = 0.7,
  detail = 1280,
  orbit = false,
}: {
  instances: readonly PlacedMesh[];
  span: number;
  yaw?: number;
  pitch?: number;
  ground?: boolean;
  fitScale?: number;
  detail?: number;
  /** Drag turns the view. The floor stays the floor. */
  orbit?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fitCache = useRef<{ width: number; height: number; signature: string; fit: number; center: { x: number; y: number; z: number } } | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const meshKey = instances.map((instance) => `${instance.id}:${instance.mesh.triangles}`).join("|");
  const [turn, setTurn] = useState({ yaw, pitch, meshKey });
  if (orbit && turn.meshKey !== meshKey) setTurn({ yaw, pitch, meshKey });
  const viewYaw = orbit ? turn.yaw : yaw;
  const viewPitch = orbit ? turn.pitch : pitch;
  const key = `${span}:${viewYaw}:${viewPitch}:${ground}:${fitScale}:${instances.map((instance) => `${instance.id}:${instance.opacity ?? 1}:${instance.hold ? "hold" : "draw"}:${instance.mesh.triangles}`).join("|")}`;
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const signature = `${span}:${ground}:${fitScale}:${meshKey}`;
    const draw = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 8 || height < 8) return;
      const cached = fitCache.current;
      if (cached && cached.width === width && cached.height === height && cached.signature === signature) {
        drawPlacedMeshes(canvas, instances, viewYaw, viewPitch, Math.max(8, span), false, 4.2, ground, 1, cached.center, false, false, cached.fit, 1, detail);
        return;
      }
      const frame = drawPlacedMeshes(canvas, instances, viewYaw, viewPitch, Math.max(8, span), false, 4.2, ground, fitScale, undefined, true, true, undefined, 1, detail);
      if (frame) fitCache.current = { width, height, signature, fit: frame.fit, center: frame.center };
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [detail, fitScale, ground, instances, key, meshKey, span, viewPitch, viewYaw]);
  return (
    <div className="cluster-study-view">
      <canvas
        ref={canvasRef}
        className="hybrid-stage-canvas"
        data-orbit-yaw={orbit ? viewYaw.toFixed(3) : undefined}
        data-orbit-pitch={orbit ? viewPitch.toFixed(3) : undefined}
        onPointerDown={orbit ? (event) => {
          dragRef.current = { x: event.clientX, y: event.clientY, yaw: viewYaw, pitch: viewPitch };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // A drag without a live pointer still receives the move events.
          }
        } : undefined}
        onPointerMove={orbit ? (event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          setTurn({
            yaw: drag.yaw - dx * 0.008,
            pitch: Math.min(1.2, Math.max(-1.2, drag.pitch - dy * 0.008)),
            meshKey,
          });
        } : undefined}
        onPointerUp={orbit ? () => {
          dragRef.current = null;
        } : undefined}
      />
    </div>
  );
}

function plateMeshes(plate: Plate, id: string): PlacedMesh[] {
  const meshes: PlacedMesh[] = [];
  if (plate.solid && plate.solid.triangles > 0) {
    meshes.push({ id: `${id}-solid`, mesh: plate.solid, translate: { x: 0, y: 0, z: 0 }, selected: false, color: ORANGE, opacity: 1, plain: true });
  }
  if (plate.void && plate.void.triangles > 0) {
    meshes.push({ id: `${id}-void`, mesh: plate.void, translate: { x: 0, y: 0, z: 0 }, selected: false, color: ORANGE, opacity: 1, plain: true });
  }
  return meshes;
}

function shownPlates(plates: readonly Plate[]) {
  if (plates.length <= 4) return plates.map((plate, index) => ({ plate, label: index }));
  return [0, 1, 2, 3].map((slot) => {
    const index = Math.round((slot * (plates.length - 1)) / 3);
    return { plate: plates[index]!, label: slot };
  });
}

function criterionFigure(value: number | null, unit: string, measured: number | null) {
  if (value === null) return measured === null ? "—" : levelName(measured);
  if (unit === "levels" || unit === "archetypes") return String(Math.round(value));
  if (Math.abs(value) < 10) return value.toFixed(2);
  return Math.round(value).toLocaleString("en-US");
}

function Frame({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`cluster-analysis-frame ${className}`}>
      <h3 className="cluster-analysis-label">{title}</h3>
      {children}
    </section>
  );
}

export function ClusterAnalysisBoard({
  instances,
  voidInstances,
  solidInstances,
  plates,
  stackInstances,
  span,
  iteration,
  programId,
  solidMesh,
}: {
  instances: readonly PlacedMesh[];
  voidInstances: readonly PlacedMesh[];
  solidInstances: readonly PlacedMesh[];
  plates: readonly Plate[];
  stackInstances: readonly PlacedMesh[];
  span: number;
  iteration: FinishedIteration | null;
  programId: string;
  solidMesh: IsoMesh;
  voidReport: ShrinkwrapVoidReport | null;
}) {
  const reading = useMemo(() => (iteration && programId ? readClusterCriteria(programId, iteration) : null), [iteration, programId]);
  const cuts = shownPlates(plates);
  const id = iteration ? String(iteration.iteration).padStart(2, "0") : "—";

  return (
    <div className="cluster-analysis">
      <header className="cluster-analysis-title">
        <div className="cluster-analysis-name">
          <p className="eyebrow">Cluster Integration</p>
          <h2>Cluster Analysis</h2>
        </div>
        <p className="cluster-analysis-id">ID {id}</p>
        <p className="cluster-analysis-kind">Aggregated Morphology</p>
        <svg className="cluster-analysis-wave" viewBox="0 0 640 72" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 46 C 70 16, 130 64, 210 36 S 340 8, 430 34 S 560 62, 640 24" />
          <path d="M0 54 C 90 24, 160 66, 250 40 S 390 14, 500 38 S 590 58, 640 32" />
          <path d="M30 40 C 110 14, 190 58, 290 30 S 450 6, 640 44" />
        </svg>
      </header>
      <div className="cluster-analysis-board">
        <div className="cluster-analysis-tools" aria-hidden="true">
          <span>
            <svg viewBox="0 0 24 24"><path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Z" /><path d="M12 12.2 20 7.6M12 12.2 4 7.6M12 12.2v8.6" /></svg>
          </span>
          <span>
            <svg viewBox="0 0 24 24"><path d="M12 3.5v17M3.5 12h17" /><path d="M12 3.5 9.2 6.4M12 3.5l2.8 2.9M12 20.5l-2.8-2.9M12 20.5l2.8-2.9M3.5 12l2.9-2.8M3.5 12l2.9 2.8M20.5 12l-2.9-2.8M20.5 12l-2.9 2.8" /></svg>
          </span>
          <span>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.2" /><path d="M12 3.2v3.2M12 17.6v3.2M3.2 12h3.2M17.6 12h3.2" /><circle cx="12" cy="12" r="1.3" /></svg>
          </span>
        </div>
        <section className="cluster-analysis-hero">
          <span className="cluster-analysis-axis" aria-hidden="true">
            <svg viewBox="0 0 36 36"><path d="M8 28 V8" /><path d="M8 28 H28" /><path d="M8 28 22 14" /></svg>
          </span>
          <div className="cluster-analysis-stage">
            <StudyCanvas instances={instances} span={span} ground fitScale={0.62} detail={2048} orbit />
          </div>
          <p className="cluster-analysis-caption"><span>3D Cluster</span> / Solid + Void</p>
        </section>
        <Frame title="Void">
          <StudyCanvas instances={voidInstances} span={span} detail={1400} />
        </Frame>
        <Frame title="Solid">
          <StudyCanvas instances={solidInstances} span={span} detail={1400} />
        </Frame>
        <section className="cluster-analysis-frame cluster-analysis-criteria-frame">
          <h3 className="cluster-analysis-label">Criteria</h3>
          {iteration && programId ? (
            <ClusterCriteriaView key={`${programId}:${iteration.id}`} programId={programId} item={iteration} mesh={solidMesh} span={span} />
          ) : <p className="cluster-analysis-wait">Reading criteria</p>}
          {reading ? (
            <ol className="cluster-analysis-rank">
              {reading.criteria.filter((criterion) => criterion.relation !== "unmeasured").map((criterion) => {
                const width = criterion.measured === null ? 0 : (criterion.measured + 1) / 3;
                return (
                  <li key={criterion.id}>
                    <span>{criterion.label}</span>
                    <span className="cluster-analysis-bar" data-relation={criterion.relation}><i style={{ width: `${Math.round(width * 100)}%` }} /></span>
                    <b>{criterionFigure(criterion.value, criterion.unit, criterion.measured)}</b>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>
        <Frame title="Void Section">
          <StudyCanvas instances={stackInstances} span={span} detail={1400} />
        </Frame>
        <Frame title="Cut Plates" className="cluster-analysis-plates-frame">
          <ol className="cluster-analysis-plates">
            {cuts.map(({ plate, label }) => (
              <li key={label}>
                <StudyCanvas instances={plateMeshes(plate, `plate-${label}`)} span={span} yaw={0.15} pitch={-1.25} fitScale={0.88} detail={720} />
                <span>P {String(label).padStart(2, "0")}</span>
              </li>
            ))}
          </ol>
        </Frame>
      </div>
    </div>
  );
}
