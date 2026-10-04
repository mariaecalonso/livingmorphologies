"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VerticalCompare } from "@/components/vertical-compare";
import { useVerticalView } from "@/components/vertical-view";
import { useViewMode } from "@/components/view-mode";
import { rasterTrailPlate } from "@/components/vertical-render";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { columnHeight, extractIsomesh, extractVoxels, sliceSpacing, VOXEL_RESOLUTION } from "@/lib/scan/isomesh";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import { orthoStackFrame } from "@/lib/skill3/view-project";
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

function rasterPlate(slice: ScanSlice) {
  return rasterTrailPlate(slice.trails, slice.trailSize, slice.peak, slice.iteration, PLATE, slice.source, slice.attractor);
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
  /** Skill 3 solid. `network` is the trail morphology. `shell` is the previous carved mass. `trail` is the legacy density mesh. */
  materialization?: "void" | "trail" | "shell";
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
  const presentation = useViewMode() === "presentation";
  const [layout, setLayout] = useState<"single" | "compare">("single");
  const [iso, setIso] = useState(0.48);
  const [meshYaw, setMeshYaw] = useState(0.7);
  const [pitch, setPitch] = useState(0.35);
  const platesRef = useRef<HTMLCanvasElement[]>([]);
  const platesStaleRef = useRef(false);
  const stackRef = useRef<HTMLCanvasElement>(null);
  const meshRef = useRef<HTMLCanvasElement>(null);
  const axialRef = useRef<HTMLCanvasElement>(null);
  const sagittalRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const followRef = useRef(true);

  const archetype = ARCHETYPE_LIST.find((item) => item.id === archetypeId) ?? ARCHETYPE_LIST[0];
  const orderedFutures = useMemo(() => {
    return ["F01", "F02", "F03", "F04"].map((id) => catalog.find((item) => item.lineage.futureId === id) ?? null);
  }, [catalog]);
  const canCompare = orderedFutures.every((item) => item !== null);
  const compare = presentation && layout === "compare" && canCompare;
  const compareRef = useRef(false);
  compareRef.current = compare;

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
    if (!shown) {
      platesStaleRef.current = false;
      return;
    }
    const source = mode === "stack" ? stackDisplaySlices(shown.slices) : shown.slices;
    const next = slicesFromField({ ...shown, slices: source });
    if (compareRef.current) platesStaleRef.current = true;
    else platesRef.current = next.map(rasterPlate);
    setSlices(next);
    setZNorm(source.map((slice) => slice.z));
    setActive(0);
    setPlaying(false);
    followRef.current = false;
  }, [mode, shown]);

  useEffect(() => {
    if (compare || !platesStaleRef.current || !shown) return;
    const source = mode === "stack" ? stackDisplaySlices(shown.slices) : shown.slices;
    const next = slicesFromField({ ...shown, slices: source });
    platesRef.current = next.map(rasterPlate);
    platesStaleRef.current = false;
  }, [compare, mode, shown]);

  useEffect(() => {
    if (mode === "stack") return;
    followRef.current = false;
    setActive(0);
    setPlaying(true);
  }, [mode]);

  useEffect(() => {
    if (compare || !playing || slices.length < 2) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slices.length);
    }, 140);
    return () => window.clearInterval(timer);
  }, [compare, playing, slices.length]);

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
    if (compare || mode === "stack") return null;
    if (shown && materialization !== "trail") {
      // Full accepted sequence. The stack's six-plate subset is not this volume.
      const samples = shown.slices;
      if (samples.length < (mode === "voxel" ? 1 : 2)) return null;
      const solidField = materialization === "shell" ? "dual" : "network";
      if (samples.length < 2 && solidField === "network") return null;
      return cachedOpeningMesh(samples, {
        identity: `${shown.lineage.archetypeId}:${shown.lineage.candidateId}:${shown.lineage.futureId}`,
        sequence: samples.map((slice) => slice.iteration).join(","),
        field: solidField,
        mode: mode === "voxel" ? "voxel" : "isomesh",
        iso,
        sizeZ: MODULE_SIZE_Z,
      });
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
  }, [active, compare, materialization, shown, iso, mode, slices, spacing, yaw]);

  const focusFuture = (index: number) => {
    const field = orderedFutures[index];
    if (!field) return;
    const catalogIndex = catalog.findIndex((item) => item.lineage.futureId === field.lineage.futureId);
    setFutureIndex(catalogIndex >= 0 ? catalogIndex : 0);
    setPlaying(false);
    setLayout("single");
    if (window.location.hash !== "#isomesh") window.location.hash = "#isomesh";
  };

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
      const frame = orthoStackFrame(width, height, meshYaw, pitch, full);
      const order = Array.from({ length: count }, (_, index) => index).sort(
        (a, b) => frame.rotate(0, placed[a].y, 0).z - frame.rotate(0, placed[b].y, 0).z,
      );

      for (const i of order) {
        const plateCanvas = platesRef.current[i];
        if (!plateCanvas) continue;
        const dist = Math.abs(i - active);
        const alpha = i === active ? 1 : Math.max(0.28, ghost * Math.exp(-dist * 0.12));
        const origin = frame.rotate(-0.5, placed[i].y, -0.5);
        const basis = frame.plateBasis(dpr, origin);
        ctx.save();
        ctx.setTransform(basis.a, basis.b, basis.c, basis.d, basis.e, basis.f);
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
    if (compare) return;
    drawStack();
  }, [compare, drawStack]);

  useEffect(() => {
    if (compare) return;
    const parent = stackRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => drawStack());
    observer.observe(parent);
    return () => observer.disconnect();
  }, [compare, drawStack]);

  useEffect(() => {
    if (compare) return;
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
  }, [activeSlice, compare, cut, slices.length]);

  useEffect(() => {
    if (compare) return;
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
  }, [active, compare, cut, slices, zNorm]);

  useEffect(() => {
    if (compare || mode === "stack") return;
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
  }, [compare, shown, mesh, meshYaw, mode, pitch, slices.length, spacing, yaw, materialization]);

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
      className={`flex h-full flex-col bg-black text-[var(--text)]${compare ? " min-h-0 overflow-hidden" : ""}`}
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
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2${compare ? " shrink-0" : ""}`}>
        <div>
          <p className="display text-[0.95rem] text-white">CT Scan Stack</p>
          <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            {shown
              ? `${shown.lineage.archetypeName} · candidate ${shown.lineage.candidateId} · Z0 ${shown.lineage.z0Iteration} · ${shown.lineage.futureId}`
              : archetype.name}
            {compare
              ? " · F01–F04"
              : mode === "stack"
              ? " · successive states of one run"
              : ` · ${mode === "voxel" ? "voxels" : "3D morphology"}${mesh ? ` · ${mesh.triangles.toLocaleString()} triangles` : ""}`}
          </p>
        </div>
        {shown ? (
          <div className="flex flex-wrap items-center gap-2">
          {presentation && canCompare ? (
            <div className="vertical-compare-toggle" role="group" aria-label="Presentation layout">
              <button type="button" data-active={layout === "single" || undefined} onClick={() => setLayout("single")}>
                Single
              </button>
              <button type="button" data-active={layout === "compare" || undefined} onClick={() => setLayout("compare")}>
                Compare
              </button>
            </div>
          ) : null}
          {!compare && catalog.length > 1 ? (
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
          ) : null}
          </div>
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

      {compare ? (
        <VerticalCompare
          futures={orderedFutures.filter((item): item is NonNullable<typeof item> => item !== null)}
          materialization={materialization}
          onFocus={focusFuture}
        />
      ) : (
      <>
      <div className={`vertical-stage grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]${mode === "mesh" ? " vertical-stage-mesh" : ""}`}>
        <div className="vertical-stage-view relative min-h-[420px]">
          <canvas
            ref={stackRef}
            className={`absolute inset-0 h-full w-full cursor-grab ${mode === "stack" ? "" : "hidden"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <canvas
            ref={meshRef}
            className={`absolute inset-0 h-full w-full cursor-grab ${mode === "mesh" ? "vertical-mesh-canvas" : ""} ${mode === "stack" ? "hidden" : ""}`}
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
      </>
      )}
    </main>
  );
}
