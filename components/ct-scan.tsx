"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawPlanField } from "@/components/skill1-viz";
import { useVerticalView } from "@/components/vertical-view";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { FIELD_SIZE, trailMaskCutoff } from "@/lib/skill1/maps";
import type { FieldSnapshot } from "@/lib/skill1/types";
import { drawSlimeFieldGl } from "@/lib/render/slime-field-gl";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { columnHeight, extractIsomesh, extractVoxels, sliceSpacing, VOXEL_RESOLUTION } from "@/lib/scan/isomesh";
import { materializeOpenings } from "@/lib/skill3/materialize";
import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import {
  SCAN_SLICES,
  advanceScan,
  sampleSlice,
  startScan,
  takeSlice,
  type ScanSlice,
} from "@/lib/scan/volume";
import { stackDisplaySlices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

const ARCHETYPE_LIST = Object.values(ARCHETYPES);
const TYPOLOGY_LABEL = {
  lobby: "Lobby",
  workspace: "Workspace",
  gathering: "Gathering",
} as const;
const PLATE = 512;

/**
 * Skill 2 catalog field, drawn with the same trail renderer as the Pareto cards.
 * Catalog thumbnails are white and light gray on black, so the copper and teal
 * ink of the live shader is shown as gray. Openings stay clear.
 */
function rasterPlate(slice: ScanSlice) {
  const canvas = document.createElement("canvas");
  canvas.width = PLATE;
  canvas.height = PLATE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, PLATE, PLATE);
  const painted = drawSlimeFieldGl(
    ctx,
    slice.trails,
    slice.trailSize,
    Math.max(slice.peak, 0.0001),
    PLATE,
    PLATE,
    trailMaskCutoff(5),
  );
  if (!painted) {
    const snapshot: FieldSnapshot = {
      iteration: slice.iteration,
      size: FIELD_SIZE,
      trailSize: slice.trailSize,
      trails: Array.from(slice.trails),
      occupancy: [],
      agents: [],
      source: slice.source,
      attractor: slice.attractor,
    };
    drawPlanField(ctx, snapshot, PLATE, PLATE, {
      showHud: false,
      fine: true,
      density: 5,
      showAttractors: false,
    });
  }
  const image = ctx.getImageData(0, 0, PLATE, PLATE);
  const data = image.data;
  let peak = 0;
  for (let i = 0; i < data.length; i += 4) {
    peak = Math.max(peak, data[i], data[i + 1], data[i + 2]);
  }
  const gain = peak > 8 ? 1 / peak : 0;
  for (let i = 0; i < data.length; i += 4) {
    const ink = Math.max(data[i], data[i + 1], data[i + 2]);
    if (ink < 8 || gain === 0) {
      data[i + 3] = 0;
      continue;
    }
    const v = Math.round(255 * Math.pow(ink * gain, 0.72));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = v < 8 ? 0 : 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function veinColor(amount: number) {
  const t = Math.max(0, Math.min(1, amount));
  if (t < 0.02) return "rgba(0,0,0,0)";
  const r = Math.round(90 + 165 * t);
  const g = Math.round(140 + 100 * t);
  const b = Math.round(18 + 12 * t);
  return `rgba(${r},${g},${b},${0.15 + t * 0.85})`;
}

function slicesFromField(field: VerticalViewerField): ScanSlice[] {
  return field.slices.map((slice) => ({
    index: slice.index,
    iteration: slice.iteration,
    trails: Float32Array.from(slice.trails),
    trailSize: slice.trailSize,
    peak: slice.peak,
    source: { ...slice.source },
    attractor: { ...slice.attractor },
  }));
}

function plateCenterY(index: number, count: number, pitchY: number, zNorm: readonly number[] | null) {
  if (!zNorm) {
    const full = (SCAN_SLICES - 1) * pitchY;
    return { y: index * pitchY - full * 0.5, full };
  }
  const full = Math.max(1, count - 1) * pitchY;
  return { y: zNorm[index] * full - full * 0.5, full };
}

export function CtScan({
  field,
  fields,
  materialization = "void",
}: {
  field?: VerticalViewerField;
  fields?: readonly VerticalViewerField[];
  /** Skill 3 solid. `trail` keeps the legacy trail-density mesh for comparison. */
  materialization?: "void" | "trail";
} = {}) {
  const catalog = fields && fields.length > 0 ? fields : field ? [field] : [];
  const [futureIndex, setFutureIndex] = useState(0);
  const shown = catalog[Math.min(futureIndex, Math.max(0, catalog.length - 1))];
  const [archetypeId, setArchetypeId] = useState("vertical-void");
  const [seed, setSeed] = useState(7);
  const [runId, setRunId] = useState(0);
  const [slices, setSlices] = useState<ScanSlice[]>([]);
  /** Vertical positions for the plates currently drawn. The mesh keeps the full accepted list. */
  const [zNorm, setZNorm] = useState<number[] | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState(0.55);
  const [spacing, setSpacing] = useState(0.1);
  const [yaw, setYaw] = useState(0.86);
  const [cut, setCut] = useState(0.5);
  const mode = useVerticalView();
  const [iso, setIso] = useState(0.48);
  const [meshYaw, setMeshYaw] = useState(0.7);
  const [pitch, setPitch] = useState(0.35);
  const platesRef = useRef<HTMLCanvasElement[]>([]);
  const stackRef = useRef<HTMLCanvasElement>(null);
  const meshRef = useRef<HTMLCanvasElement>(null);
  const axialRef = useRef<HTMLCanvasElement>(null);
  const sagittalRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const followRef = useRef(true);

  const archetype = ARCHETYPE_LIST.find((item) => item.id === archetypeId) ?? ARCHETYPE_LIST[0];

  useEffect(() => {
    if (shown) return;
    let cancelled = false;
    const run = startScan(archetypeId, seed);
    platesRef.current = [];
    setSlices([]);
    setZNorm(null);
    setActive(0);
    setPlaying(false);
    followRef.current = true;

    const pump = () => {
      if (cancelled) return;
      const index = platesRef.current.length;
      if (index >= SCAN_SLICES) return;
      const slice = takeSlice(run.state, index);
      platesRef.current.push(rasterPlate(slice));
      setSlices((current) => [...current, slice]);
      if (followRef.current) setActive(index);
      if (index + 1 >= SCAN_SLICES || run.state.converged) return;
      advanceScan(run);
      window.setTimeout(pump, 0);
    };
    pump();
    return () => {
      cancelled = true;
    };
  }, [archetypeId, shown, runId, seed]);

  useEffect(() => {
    if (!shown) return;
    const source = mode === "stack" ? stackDisplaySlices(shown.slices) : shown.slices;
    const next = slicesFromField({ ...shown, slices: source });
    platesRef.current = next.map(rasterPlate);
    setSlices(next);
    setZNorm(source.map((slice) => slice.z));
    setActive(0);
    setPlaying(false);
    followRef.current = false;
  }, [mode, shown]);

  useEffect(() => {
    if (mode === "stack") return;
    followRef.current = false;
    setActive(0);
    setPlaying(true);
  }, [mode]);

  useEffect(() => {
    if (!playing || slices.length < 2) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slices.length);
    }, 140);
    return () => window.clearInterval(timer);
  }, [playing, slices.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") followRef.current = false;
      if (event.key === "ArrowRight") setActive((current) => Math.min(slices.length - 1, current + 1));
      if (event.key === "ArrowLeft") setActive((current) => Math.max(0, current - 1));
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slices.length]);

  const activeSlice = slices[Math.min(active, Math.max(0, slices.length - 1))] ?? null;
  const meshCache = useRef(new Map<string, ReturnType<typeof extractIsomesh>>());
  const mesh = useMemo(() => {
    if (mode === "stack") return null;
    if (shown && materialization !== "trail") {
      const samples = shown.slices;
      if (samples.length < (mode === "voxel" ? 1 : 2)) return null;
      const key = `${shown.lineage.futureId}:void:${MODULE_SIZE_Z}:${mode}:${iso}:${samples.map((slice) => slice.iteration).join(",")}`;
      const cached = meshCache.current.get(key);
      if (cached) return cached;
      const next = materializeOpenings(samples, {
        mode: mode === "voxel" ? "voxel" : "isomesh",
        iso,
        spacing,
        yaw,
        sizeZ: MODULE_SIZE_Z,
      });
      meshCache.current.set(key, next);
      return next;
    }
    const fullTrail = shown ? slicesFromField(shown) : null;
    const grown = fullTrail ?? slices.slice(0, Math.min(slices.length, active + 1));
    const count = grown.length;
    if (count < (mode === "voxel" ? 1 : 2)) return null;
    const pitchY = sliceSpacing(spacing, yaw);
    const trailZ = shown ? shown.slices.map((slice) => slice.z) : null;
    if (trailZ && trailZ.length !== count) return null;
    const meshZ = trailZ ? trailZ.map((z) => z * Math.max(1, trailZ.length - 1) * pitchY) : undefined;
    const key = `${shown?.lineage.futureId ?? ""}:trail:${mode}:${shown ? `field:${count}` : count}:${iso}:${spacing}:${yaw}:${grown.length}:${VOXEL_RESOLUTION}:${meshZ?.join(",") ?? ""}`;
    const cached = meshCache.current.get(key);
    if (cached) return cached;
    const next = mode === "voxel"
      ? extractVoxels(grown, iso, spacing, yaw, meshZ)
      : extractIsomesh(grown, iso, spacing, yaw, meshZ);
    meshCache.current.set(key, next);
    return next;
  }, [active, materialization, shown, iso, mode, slices, spacing, yaw]);

  const drawStack = useMemo(() => {
    return () => {
      const canvas = stackRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(parent.clientWidth));
      const height = Math.max(1, Math.floor(parent.clientHeight));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      const count = platesRef.current.length;
      if (!count) return;
      const pitchY = sliceSpacing(spacing, yaw);
      const placed = Array.from({ length: count }, (_, index) => plateCenterY(index, count, pitchY, zNorm));
      const full = placed[0]?.full ?? 0;
      const cy = Math.cos(meshYaw);
      const sy = Math.sin(meshYaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const rot = (x: number, y: number, z: number) => {
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
      };
      const yBottom = -full * 0.5;
      const yTop = yBottom + full;
      const bounds = [rot(-0.5, yBottom, -0.5), rot(0.5, yBottom, 0.5), rot(-0.5, yTop, -0.5), rot(0.5, yTop, 0.5)];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const point of bounds) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      const scale = Math.min(width, height) * 0.52;
      const xMid = (minX + maxX) / 2;
      const yMid = (minY + maxY) / 2;
      const du = rot(1, 0, 0);
      const dv = rot(0, 0, 1);
      const order = Array.from({ length: count }, (_, index) => index).sort(
        (a, b) => rot(0, placed[a].y, 0).z - rot(0, placed[b].y, 0).z,
      );

      for (const i of order) {
        const plateCanvas = platesRef.current[i];
        if (!plateCanvas) continue;
        const dist = Math.abs(i - active);
        const alpha = i === active ? 1 : Math.max(0.28, ghost * Math.exp(-dist * 0.12));
        const origin = rot(-0.5, placed[i].y, -0.5);
        ctx.save();
        ctx.setTransform(
          dpr * du.x * scale,
          dpr * -du.y * scale,
          dpr * dv.x * scale,
          dpr * -dv.y * scale,
          dpr * (width / 2 + (origin.x - xMid) * scale),
          dpr * (height / 2 - (origin.y - yMid) * scale),
        );
        ctx.globalAlpha = alpha;
        ctx.drawImage(plateCanvas, 0, 0, 1, 1);
        ctx.globalAlpha = i === active ? 0.95 : 0.28;
        ctx.strokeStyle = i === active ? "rgba(199,126,95,1)" : "rgba(242,242,238,1)";
        ctx.lineWidth = i === active ? 0.012 : 0.006;
        ctx.strokeRect(0, 0, 1, 1);
        ctx.beginPath();
        ctx.moveTo(cut, 0);
        ctx.lineTo(cut, 1);
        ctx.strokeStyle = i === active ? "rgba(125,184,184,0.9)" : "rgba(125,184,184,0.25)";
        ctx.lineWidth = 0.008;
        ctx.stroke();
        ctx.restore();
      }
    };
  }, [active, cut, ghost, meshYaw, pitch, spacing, yaw, zNorm, slices.length]);

  useEffect(() => {
    drawStack();
  }, [drawStack]);

  useEffect(() => {
    const parent = stackRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => drawStack());
    observer.observe(parent);
    return () => observer.disconnect();
  }, [drawStack]);

  useEffect(() => {
    const canvas = axialRef.current;
    const slice = activeSlice;
    const plate = slice ? platesRef.current[Math.min(active, platesRef.current.length - 1)] : null;
    if (!canvas || !slice || !plate) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(plate, 8, 8, size - 16, size - 16);
    const x = 8 + cut * (size - 16);
    ctx.strokeStyle = "rgba(125,184,184,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, size - 8);
    ctx.stroke();
    ctx.strokeStyle = "rgba(199,126,95,0.8)";
    ctx.strokeRect(8, 8, size - 16, size - 16);
  }, [activeSlice, cut, slices.length]);

  useEffect(() => {
    const canvas = sagittalRef.current;
    if (!canvas || slices.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = 280;
    const height = 160;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const cols = slices.length;
    const rows = 72;
    const cellH = height / rows;
    const bands = zNorm && zNorm.length === cols
      ? zNorm.map((z, index) => {
          const x0 = z * width;
          const x1 = index + 1 < cols ? zNorm[index + 1] * width : width;
          return { x: x0, w: Math.max(1, x1 - x0) };
        })
      : Array.from({ length: cols }, (_, index) => ({ x: (index * width) / cols, w: width / cols }));
    for (let z = 0; z < cols; z += 1) {
      for (let row = 0; row < rows; row += 1) {
        const yNorm = 1 - row / (rows - 1);
        const amount = sampleSlice(slices[z], cut, yNorm);
        ctx.fillStyle = veinColor(amount);
        ctx.fillRect(bands[z].x, row * cellH, bands[z].w + 0.5, cellH + 0.5);
      }
    }
    const marker = bands[Math.min(active, cols - 1)];
    ctx.strokeStyle = "rgba(199,126,95,0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marker.x + marker.w * 0.5, 0);
    ctx.lineTo(marker.x + marker.w * 0.5, height);
    ctx.stroke();
  }, [active, cut, slices, zNorm]);

  useEffect(() => {
    if (mode === "stack") return;
    const canvas = meshRef.current;
    if (!canvas) return;
    const paint = () => {
      const column = shown && materialization !== "trail"
        ? moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z))
        : shown
          ? Math.max(1, Math.max(0, slices.length - 1)) * sliceSpacing(spacing, yaw)
          : columnHeight(spacing, yaw);
      drawIsoMesh(canvas, mesh, meshYaw, pitch, column, mode === "mesh" ? "shell" : "field");
    };
    paint();
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [shown, mesh, meshYaw, mode, pitch, slices.length, spacing, yaw, materialization]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, yaw: meshYaw, pitch };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const nextYaw = dragRef.current.yaw + (event.clientX - dragRef.current.x) * 0.008;
    const nextPitch = dragRef.current.pitch + (event.clientY - dragRef.current.y) * 0.008;
    setMeshYaw(nextYaw);
    setPitch(Math.min(1.2, Math.max(-1.2, nextPitch)));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <main
      className="flex h-full flex-col bg-black text-[var(--text)]"
      data-skill3-future={shown?.lineage.futureId}
      data-skill3-futures={catalog.map((item) => item.lineage.futureId).join(",")}
      data-skill3-candidate={shown?.lineage.candidateId}
      data-skill3-z0={shown?.lineage.z0Iteration}
      data-skill3-iterations={shown?.slices.map((slice) => slice.iteration).join(",")}
      data-skill3-displayed={
        shown && mode === "stack"
          ? stackDisplaySlices(shown.slices).map((slice) => slice.iteration).join(",")
          : undefined
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <div>
          <p className="display text-[0.95rem] text-white">CT Scan Stack</p>
          <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            {shown
              ? `${shown.lineage.archetypeName} · candidate ${shown.lineage.candidateId} · Z0 ${shown.lineage.z0Iteration} · ${shown.lineage.futureId}`
              : archetype.name}
            {mode === "stack"
              ? " · successive states of one run"
              : ` · ${mode === "voxel" ? "voxels" : "isomesh"}${mesh ? ` · ${mesh.triangles.toLocaleString()} triangles` : ""}`}
          </p>
        </div>
        {shown ? (
          catalog.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1">
              {catalog.map((item, index) => (
                <button
                  key={item.lineage.futureId}
                  type="button"
                  data-active={index === futureIndex || undefined}
                  onClick={() => {
                    setFutureIndex(index);
                    setPlaying(false);
                  }}
                  className={`border px-2.5 py-1.5 text-[0.72rem] uppercase tracking-[0.16em] ${
                    index === futureIndex
                      ? "border-[var(--text)] text-[var(--text)]"
                      : "border-[rgba(242,242,238,0.18)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.lineage.futureId}
                </button>
              ))}
            </div>
          ) : null
        ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
            Archetype
            <select
              value={archetypeId}
              onChange={(event) => setArchetypeId(event.target.value)}
              className="ml-2 border border-[rgba(242,242,238,0.18)] bg-black px-2 py-1 text-[0.72rem] uppercase tracking-[0.12em] text-[var(--text)]"
            >
              {(["lobby", "workspace", "gathering"] as const).map((typologyId) => (
                <optgroup key={typologyId} label={TYPOLOGY_LABEL[typologyId]}>
                  {ARCHETYPE_LIST.filter((item) => item.typologyId === typologyId).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
            Seed
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value) || 0)}
              className="ml-2 w-16 border border-[rgba(242,242,238,0.18)] bg-black px-2 py-1 text-[0.72rem] text-[var(--text)]"
            />
          </label>
          <button
            type="button"
            onClick={() => setRunId((current) => current + 1)}
            className="border border-[rgba(242,242,238,0.18)] px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--text)]"
          >
            Rescan
          </button>
        </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[420px]">
          <canvas
            ref={stackRef}
            className={`absolute inset-0 h-full w-full cursor-grab ${mode === "stack" ? "" : "hidden"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <canvas
            ref={meshRef}
            className={`absolute inset-0 h-full w-full cursor-grab ${mode === "stack" ? "hidden" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <p className="pointer-events-none absolute bottom-3 left-3 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            {mode === "stack"
              ? "Drag to orbit · arrows scrub · space plays"
              : "Play or scrub to grow the volume · drag to orbit"}
          </p>
        </div>
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto border-t border-[var(--line)] p-3 lg:border-l lg:border-t-0">
          <div>
            <p className="eyebrow">Axial slice</p>
            <p className="mt-1 text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)]">
              {activeSlice
                ? shown
                  ? `${String(active + 1).padStart(2, "0")} / ${String(slices.length).padStart(2, "0")} · iter ${activeSlice.iteration}`
                  : `${String(activeSlice.index + 1).padStart(2, "0")} / ${String(SCAN_SLICES).padStart(2, "0")} · iter ${activeSlice.iteration}`
                : "Recording"}
              {!shown && slices.length < SCAN_SLICES ? ` · ${slices.length} captured` : ""}
            </p>
            <canvas ref={axialRef} className="mt-2 w-full border border-[rgba(242,242,238,0.16)]" />
          </div>
          <div>
            <p className="eyebrow">Sagittal cut</p>
            <p className="mt-1 text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)]">
              Vertical plane through the stack
            </p>
            <canvas ref={sagittalRef} className="mt-2 w-full border border-[rgba(242,242,238,0.16)]" />
          </div>
        </aside>
      </div>

      <footer className="grid gap-3 border-t border-[var(--line)] px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))]">
        <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          {mode === "stack" ? "Slice" : "Growth"} {slices.length ? active + 1 : 0}
          <input
            type="range"
            min={0}
            max={Math.max(0, slices.length - 1)}
            value={Math.min(active, Math.max(0, slices.length - 1))}
            onChange={(event) => {
              setPlaying(false);
              followRef.current = false;
              setActive(Number(event.target.value));
            }}
            className="mt-1 block w-full"
          />
        </label>
        {mode !== "stack" ? (
          <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
            Threshold {iso.toFixed(2)}
            <input
              type="range"
              min={0.08}
              max={0.72}
              step={0.01}
              value={iso}
              onChange={(event) => setIso(Number(event.target.value))}
              className="mt-1 block w-full"
            />
          </label>
        ) : (
          <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
            Ghost {ghost.toFixed(2)}
          <input
            type="range"
            min={0.05}
            max={0.85}
            step={0.01}
            value={ghost}
            onChange={(event) => setGhost(Number(event.target.value))}
            className="mt-1 block w-full"
          />
          </label>
        )}
        <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          Slice gap {spacing.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={spacing}
            onChange={(event) => setSpacing(Number(event.target.value))}
            className="mt-1 block w-full"
          />
        </label>
        <label className="text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          Cut {cut.toFixed(2)}
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.01}
            value={cut}
            onChange={(event) => setCut(Number(event.target.value))}
            className="mt-1 block w-full"
          />
        </label>
        <div className="md:col-span-4">
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            className="border border-[rgba(242,242,238,0.18)] px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--text)]"
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </footer>
    </main>
  );
}
