"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { sliceSpacing } from "@/lib/scan/isomesh";
import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import { moduleCorners, moduleScale, MODULE_HALF, projectModule, type ViewPoint } from "@/lib/skill3/view-project";
import { rasterTrailPlate } from "@/components/vertical-render";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

export const COMPARE_FUTURES = [
  {
    id: "F01",
    name: "Natural Continuation",
    line: "Continues the selected Physarum state without added transformation.",
  },
  {
    id: "F02",
    name: "Boundary Fusion",
    line: "Relaxes nearby boundaries so adjacent network regions can merge.",
  },
  {
    id: "F03",
    name: "Live Twist",
    line: "Gradually rotates the evolving network through time, creating directional torsion.",
  },
  {
    id: "F04",
    name: "Adaptive Scale",
    line: "Expands, contracts, or maintains scale based on the archetype’s criteria.",
  },
] as const;

/** Corner 3/4 view. Shared by every column; Single keeps its own camera. */
const COMPARE_YAW = Math.PI / 4;
const COMPARE_PITCH = Math.atan(Math.sin(Math.PI / 4));
const PLATE = 320;
const BOX_EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 4],
  [3, 1], [3, 2], [3, 7],
  [5, 1], [5, 4], [5, 7],
  [6, 2], [6, 4], [6, 7],
];

function rasterPlate(trails: ArrayLike<number>, trailSize: number, peak: number, iteration: number) {
  return rasterTrailPlate(trails, trailSize, peak, iteration, PLATE, { x: 0, y: 0 }, { x: 0, y: 0 });
}

function drawBox(ctx: CanvasRenderingContext2D, corners: ViewPoint[], dpr: number) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = "rgba(242, 242, 238, 0.38)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const [a, b] of BOX_EDGES) {
    ctx.moveTo(corners[a].x, corners[a].y);
    ctx.lineTo(corners[b].x, corners[b].y);
  }
  ctx.stroke();
  ctx.restore();
}

export function VerticalCompare({
  futures,
  materialization,
  onFocus,
}: {
  futures: readonly VerticalViewerField[];
  materialization: "void" | "trail" | "shell";
  onFocus: (index: number) => void;
}) {
  const [viz, setViz] = useState<"stack" | "mesh">("mesh");
  const [yaw, setYaw] = useState(COMPARE_YAW);
  const [pitch, setPitch] = useState(COMPARE_PITCH);
  const [growth, setGrowth] = useState(0);
  const [iso, setIso] = useState(0.48);
  const [spacing, setSpacing] = useState(0.1);
  const [cut, setCut] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const framesRef = useRef<Array<HTMLDivElement | null>>([]);
  const meshRef = useRef<Array<HTMLCanvasElement | null>>([]);
  const stackRef = useRef<Array<HTMLCanvasElement | null>>([]);
  const boxRef = useRef<Array<HTMLCanvasElement | null>>([]);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false);

  const steps = Math.max(1, ...futures.map((field) => field.slices.length));
  const growthStep = Math.min(steps - 1, Math.max(0, growth));

  const plates = useMemo(
    () => futures.map((field) => field.slices.map((slice) => rasterPlate(slice.trails, slice.trailSize, slice.peak, slice.iteration))),
    [futures],
  );

  const meshes = useMemo(() => {
    if (viz !== "mesh" || materialization === "trail") return futures.map(() => null);
    const solidField = materialization === "shell" ? "dual" : "network";
    return futures.map((field) => {
      if (field.slices.length < 2) return null;
      return cachedOpeningMesh(field.slices, {
        identity: `${field.lineage.archetypeId}:${field.lineage.candidateId}:${field.lineage.futureId}`,
        sequence: field.slices.map((slice) => slice.iteration).join(","),
        field: solidField,
        mode: "isomesh",
        iso,
        sizeZ: MODULE_SIZE_Z,
      });
    });
  }, [futures, iso, materialization, viz]);

  useEffect(() => {
    if (!playing || steps < 2) return;
    const timer = window.setInterval(() => {
      setGrowth((current) => (current + 1) % steps);
    }, 140);
    return () => window.clearInterval(timer);
  }, [playing, steps]);

  useEffect(() => {
    const identityPitch = sliceSpacing(0.1);
    const zScale = Math.min(1, sliceSpacing(spacing) / identityPitch);
    const paint = () => {
      const sample = framesRef.current.find((frame) => frame && frame.clientWidth > 0 && frame.clientHeight > 0);
      const width = sample?.clientWidth ?? 0;
      const height = sample?.clientHeight ?? 0;
      if (width < 2 || height < 2) return;
      const scale = moduleScale(width, height, yaw, pitch);
      const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z));
      framesRef.current.forEach((frame, index) => {
        if (!frame) return;
        frame.style.transform = `scale(${scale})`;
        const meshCanvas = meshRef.current[index];
        const stackCanvas = stackRef.current[index];
        const boxCanvas = boxRef.current[index];
        if (viz === "mesh" && meshCanvas) drawIsoMesh(meshCanvas, meshes[index] ?? null, yaw, pitch, column, "shell");
        const dpr = window.devicePixelRatio || 1;
        const pixelsW = Math.floor(width * dpr);
        const pixelsH = Math.floor(height * dpr);
        const prepare = (canvas: HTMLCanvasElement | null) => {
          if (!canvas) return null;
          if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
            canvas.width = pixelsW;
            canvas.height = pixelsH;
          }
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);
          return ctx;
        };
        if (viz === "stack" && stackCanvas) {
          const ctx = prepare(stackCanvas);
          if (ctx) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);
          }
          const field = futures[index];
          const drawn = plates[index];
          if (ctx && field && drawn) {
            const count = field.slices.length;
            const active = count <= 1 ? 0 : Math.round((growthStep / Math.max(1, steps - 1)) * (count - 1));
            const order = field.slices
              .map((slice, plateIndex) => ({
                plateIndex,
                depth: projectModule(0, (slice.z - 0.5) * MODULE_SIZE_Z * zScale, 0, yaw, pitch, width, height).depth,
              }))
              .sort((a, b) => b.depth - a.depth);
            for (const item of order) {
              const slice = field.slices[item.plateIndex];
              const plate = drawn[item.plateIndex];
              if (!plate) continue;
              const y = (slice.z - 0.5) * MODULE_SIZE_Z * zScale;
              const origin = projectModule(-MODULE_HALF, y, -MODULE_HALF, yaw, pitch, width, height);
              const across = projectModule(MODULE_HALF, y, -MODULE_HALF, yaw, pitch, width, height);
              const down = projectModule(-MODULE_HALF, y, MODULE_HALF, yaw, pitch, width, height);
              const live = item.plateIndex === active;
              ctx.save();
              ctx.setTransform(
                dpr * (across.x - origin.x),
                dpr * (across.y - origin.y),
                dpr * (down.x - origin.x),
                dpr * (down.y - origin.y),
                dpr * origin.x,
                dpr * origin.y,
              );
              ctx.globalAlpha = live ? 1 : 0.38;
              ctx.drawImage(plate, 0, 0, 1, 1);
              ctx.globalAlpha = live ? 0.9 : 0.28;
              ctx.strokeStyle = live ? "rgba(199,126,95,0.9)" : "rgba(242,242,238,0.45)";
              ctx.lineWidth = live ? 0.012 : 0.006;
              ctx.strokeRect(0, 0, 1, 1);
              ctx.beginPath();
              ctx.moveTo(cut, 0);
              ctx.lineTo(cut, 1);
              ctx.strokeStyle = live ? "rgba(15,115,119,0.9)" : "rgba(15,115,119,0.28)";
              ctx.lineWidth = 0.008;
              ctx.stroke();
              ctx.restore();
            }
          }
        }
        const boxCtx = prepare(boxCanvas);
        if (boxCtx) drawBox(boxCtx, moduleCorners(yaw, pitch, width, height), dpr);
      });
    };
    paint();
    const observer = new ResizeObserver(paint);
    framesRef.current.forEach((frame) => {
      if (frame) observer.observe(frame);
    });
    return () => observer.disconnect();
  }, [cut, futures, growthStep, meshes, pitch, plates, spacing, steps, viz, yaw]);

  const onCamera = (nextYaw: number, nextPitch: number) => {
    setYaw(nextYaw);
    setPitch(Math.min(1.2, Math.max(-1.2, nextPitch)));
  };

  return (
    <div className="vertical-compare">
      <div className="vertical-compare-futures">
        {COMPARE_FUTURES.map((copy, index) => {
          const field = futures[index];
          return (
            <article
              key={copy.id}
              className="vertical-compare-column"
              onClick={() => {
                if (draggedRef.current) {
                  draggedRef.current = false;
                  return;
                }
                if (field) onFocus(index);
              }}
            >
              <p className="vertical-compare-id">{copy.id}</p>
              <h2 className="display vertical-compare-name">{copy.name}</h2>
              <div
                className="vertical-compare-well"
                onPointerDown={(event) => {
                  dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag) return;
                  const dx = event.clientX - drag.x;
                  const dy = event.clientY - drag.y;
                  if (Math.hypot(dx, dy) > 4) drag.moved = true;
                  onCamera(drag.yaw + dx * 0.008, drag.pitch + dy * 0.008);
                }}
                onPointerUp={() => {
                  draggedRef.current = dragRef.current?.moved ?? false;
                  dragRef.current = null;
                }}
              >
                <div
                  className="vertical-compare-frame"
                  ref={(node) => {
                    framesRef.current[index] = node;
                  }}
                >
                  <canvas
                    ref={(node) => {
                      meshRef.current[index] = node;
                    }}
                    className="vertical-compare-canvas"
                    hidden={viz !== "mesh"}
                    aria-label={`${copy.id} 3D morphology`}
                  />
                  <canvas
                    ref={(node) => {
                      stackRef.current[index] = node;
                    }}
                    className="vertical-compare-stack"
                    hidden={viz !== "stack"}
                    aria-label={`${copy.id} stack`}
                  />
                  <canvas
                    ref={(node) => {
                      boxRef.current[index] = node;
                    }}
                    className="vertical-compare-box"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <p className="vertical-compare-note">{copy.line}</p>
            </article>
          );
        })}
      </div>
      <aside className="vertical-compare-rail" aria-label="Shared compare controls">
        <div className="vertical-compare-mode" role="group" aria-label="Visualization">
          <button type="button" data-active={viz === "stack" || undefined} onClick={() => setViz("stack")}>
            Stack
          </button>
          <button type="button" data-active={viz === "mesh" || undefined} onClick={() => setViz("mesh")}>
            3D Morphology
          </button>
        </div>
        <label>
          Growth <span>{String(growthStep + 1).padStart(2, "0")} / {String(steps).padStart(2, "0")}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, steps - 1)}
            value={growthStep}
            onChange={(event) => {
              setPlaying(false);
              setGrowth(Number(event.target.value));
            }}
          />
        </label>
        <label>
          Threshold <span>{iso.toFixed(2)}</span>
          <input
            type="range"
            min={0.08}
            max={0.72}
            step={0.01}
            value={iso}
            onChange={(event) => setIso(Number(event.target.value))}
          />
        </label>
        <label>
          Slice gap <span>{spacing.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={spacing}
            onChange={(event) => setSpacing(Number(event.target.value))}
          />
        </label>
        <label>
          Cut <span>{cut.toFixed(2)}</span>
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.01}
            value={cut}
            onChange={(event) => setCut(Number(event.target.value))}
          />
        </label>
        <button type="button" className="vertical-compare-play" data-active={playing || undefined} onClick={() => setPlaying((current) => !current)}>
          {playing ? "Pause" : "Play"}
        </button>
      </aside>
    </div>
  );
}
