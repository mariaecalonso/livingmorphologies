"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { CtScan } from "@/components/ct-scan";
import { VerticalSelectionNotice } from "@/components/vertical-selection";
import { orthoStackFrame } from "@/lib/skill3/view-project";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

const STEPS = [
  "Reconstructing Z0",
  "Generating F01–F04",
  "Sampling temporal states",
  "Building 3D morphology",
] as const;

/** Matches the stack viewer’s resting camera and slice gap. */
const VIEW_YAW = 0.86;
const VIEW_PITCH = 0.35;
const PLATE_COUNT = 7;
const FINAL_PITCH = 0.04 + 0.1 * 0.42;
const LOOP_MS = 10000;
const HANDOFF_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const HANDOFF_MOVE_MS = 880;
const HANDOFF_FADE_MS = 280;
const HANDOFF_UI_MS = 340;
const HANDOFF_LABEL_MS = 240;
const HANDOFF_REDUCED_MS = 160;

type HandoffPhase = "loading" | "glide" | "crossfade" | "reveal" | "ready";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
}

function formatCandidate(id: number) {
  return `#${String(id).padStart(3, "0")}`;
}

function smooth(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function sequenceAt(t: number) {
  const grow = t < 0.18 ? 0 : t < 0.48 ? smooth((t - 0.18) / 0.3) : 1;
  const spacing = t < 0.48 ? 0 : t < 0.72 ? smooth((t - 0.48) / 0.24) : 1;
  const shell = t < 0.72 ? 0 : t < 0.88 ? smooth((t - 0.72) / 0.16) : 1;
  const pitch = VIEW_PITCH;
  const revealed = 1 + grow * (PLATE_COUNT - 1);
  const step = t < 0.18 ? 0 : t < 0.48 ? 1 : t < 0.72 ? 2 : 3;
  return { revealed, spacing, shell, pitch, step };
}

function paintPreview(canvas: HTMLCanvasElement, image: HTMLImageElement | null, t: number) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(parent.clientWidth));
  const height = Math.max(1, Math.floor(parent.clientHeight));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const { revealed, spacing, shell, pitch } = sequenceAt(t);
  const count = Math.max(1, Math.ceil(revealed));
  const pitchY = FINAL_PITCH * (0.28 + 0.72 * spacing);
  const full = (PLATE_COUNT - 1) * FINAL_PITCH;
  const frame = orthoStackFrame(width, height, VIEW_YAW, pitch, full);
  const rot = frame.rotate;
  const project = frame.project;
  const span = Math.max(0, count - 1) * pitchY;
  const plates = Array.from({ length: count }, (_, index) => index * pitchY - span * 0.5);
  const order = plates.map((_, index) => index).sort((a, b) => rot(0, plates[a], 0).z - rot(0, plates[b], 0).z);
  const focus = Math.floor((count - 1) / 2);

  for (const index of order) {
    const newest = index === count - 1 && count > 1 ? revealed - (count - 1) : 1;
    const origin = rot(-0.5, plates[index], -0.5);
    const basis = frame.plateBasis(dpr, origin);
    ctx.save();
    ctx.setTransform(basis.a, basis.b, basis.c, basis.d, basis.e, basis.f);
    ctx.globalAlpha = (index === focus ? 0.2 : 0.08) * newest;
    ctx.fillStyle = "#f2f2ee";
    ctx.fillRect(0, 0, 1, 1);
    ctx.globalAlpha = (index === focus ? 0.96 : 0.42) * newest;
    if (image) ctx.drawImage(image, 0, 0, 1, 1);
    ctx.globalAlpha = (index === focus ? 0.95 : 0.28) * newest;
    ctx.strokeStyle = index === focus ? "rgba(199,126,95,1)" : "rgba(242,242,238,0.7)";
    ctx.lineWidth = index === focus ? 0.012 : 0.006;
    ctx.strokeRect(0, 0, 1, 1);
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, 1);
    ctx.strokeStyle = index === focus ? "rgba(125,184,184,0.9)" : "rgba(125,184,184,0.28)";
    ctx.lineWidth = 0.008;
    ctx.stroke();
    ctx.restore();
  }

  if (shell > 0.02) {
    const y0 = plates[0] ?? 0;
    const y1 = plates[plates.length - 1] ?? 0;
    const ring = (y: number) =>
      [
        [-0.5, y, -0.5],
        [0.5, y, -0.5],
        [0.5, y, 0.5],
        [-0.5, y, 0.5],
      ].map(([x, py, z]) => project(x, py, z));
    const bottom = ring(y0);
    const top = ring(y1);
    ctx.save();
    ctx.globalAlpha = 0.16 * shell;
    ctx.fillStyle = "rgba(15,115,119,1)";
    ctx.beginPath();
    bottom.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    top.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.85 * shell;
    ctx.strokeStyle = "rgba(125,184,184,0.9)";
    ctx.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath();
      ctx.moveTo(bottom[index].x, bottom[index].y);
      ctx.lineTo(top[index].x, top[index].y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(199,126,95,0.85)";
    ctx.beginPath();
    top.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

export function VerticalPrepareOverview({
  archetypeName,
  candidateId,
  plate,
  hold = false,
  canvasRef: canvasRefProp,
}: {
  archetypeName?: string;
  candidateId?: number;
  plate?: HTMLImageElement | null;
  /** Freeze the current loading frame. The handoff moves this canvas; it does not redraw the morphology. */
  hold?: boolean;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}) {
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = canvasRefProp ?? localCanvasRef;
  const imageRef = useRef<HTMLImageElement | null>(plate ?? null);
  const stepRef = useRef(0);
  const [step, setStep] = useState(0);
  imageRef.current = plate ?? null;

  useEffect(() => {
    if (hold) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const started = performance.now();
    const draw = (now: number) => {
      const t = reduced ? 0.94 : ((now - started) % LOOP_MS) / LOOP_MS;
      paintPreview(canvas, imageRef.current, t);
      const next = sequenceAt(t).step;
      if (next !== stepRef.current) {
        stepRef.current = next;
        setStep(next);
      }
      if (!reduced) frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    const parent = canvas.parentElement;
    const observer = new ResizeObserver(() => {
      const t = reduced ? 0.94 : ((performance.now() - started) % LOOP_MS) / LOOP_MS;
      paintPreview(canvas, imageRef.current, t);
    });
    if (parent) observer.observe(parent);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [canvasRef, hold]);

  return (
    <main className="vertical-prepare-root flex h-full flex-col text-[var(--text)]" aria-busy="true" aria-live="polite">
      <header className="vertical-prepare-chrome flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <div>
          <p className="display text-[0.95rem] text-white">Preparing Vertical Propagation</p>
          <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            {archetypeName ?? "Selected candidate"}
            {candidateId != null ? ` · candidate ${formatCandidate(candidateId)}` : ""}
          </p>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[420px]">
          <canvas ref={canvasRef} className="vertical-prepare-stack absolute inset-0 h-full w-full" aria-hidden="true" />
        </div>
        <aside className="vertical-prepare-chrome flex min-h-0 flex-col gap-3 overflow-auto border-t border-[var(--line)] p-3 lg:border-l lg:border-t-0">
          <div>
            <p className="eyebrow">Propagation</p>
            <ol className="vertical-prepare-steps">
              {STEPS.map((label, index) => (
                <li key={label} data-active={index === step || undefined}>
                  {label}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
      <footer
        className="vertical-prepare-chrome grid gap-3 border-t border-[var(--line)] px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))]"
        aria-hidden="true"
      >
        {["Slice", "Ghost", "Slice gap", "Cut"].map((label) => (
          <div key={label} className="invisible text-[0.62rem] uppercase tracking-[0.14em]">
            {label}
            <div className="mt-1 h-4" />
          </div>
        ))}
        <div className="invisible md:col-span-4">
          <span className="inline-block border px-3 py-1.5 text-[0.72rem]">Play</span>
        </div>
      </footer>
    </main>
  );
}

export function VerticalPrepare({
  archetypeId,
  archetypeName,
  candidateId,
  materialization,
}: {
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  materialization: "void" | "trail" | "shell";
}) {
  const [fields, setFields] = useState<VerticalViewerField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plate, setPlate] = useState<HTMLImageElement | null>(null);
  const [phase, setPhase] = useState<HandoffPhase>("loading");
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const fadeMs = reduced ? HANDOFF_REDUCED_MS : HANDOFF_FADE_MS;
  const uiMs = reduced ? HANDOFF_REDUCED_MS : HANDOFF_UI_MS;
  const handoffStyle = {
    "--handoff-ease": HANDOFF_EASE,
    "--handoff-fade": `${fadeMs}ms`,
    "--handoff-ui": `${uiMs}ms`,
    "--handoff-labels": `${reduced ? 120 : HANDOFF_LABEL_MS}ms`,
  } as CSSProperties;

  useEffect(() => {
    const controller = new AbortController();
    const previewSrc = `/api/evolution/${encodeURIComponent(archetypeId)}/${candidateId}`;
    const params = new URLSearchParams({ archetype: archetypeId, candidate: String(candidateId) });
    let objectUrl: string | null = null;
    setPhase("loading");
    setFields(null);
    setError(null);
    setPlate(null);

    const run = async () => {
      try {
        const imageResponse = await fetch(previewSrc, { signal: controller.signal });
        if (imageResponse.ok) {
          const blob = await imageResponse.blob();
          objectUrl = URL.createObjectURL(blob);
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("preview"));
            image.src = objectUrl as string;
          });
          if (!controller.signal.aborted) setPlate(image);
        }
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      }
      if (controller.signal.aborted) return;

      try {
        const response = await fetch(`/api/vertical?${params}`, { signal: controller.signal });
        const body = (await response.json()) as { fields?: VerticalViewerField[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "The selected candidate could not be reconstructed.");
        if (!body.fields?.length) throw new Error("The selected candidate could not be reconstructed.");
        if (!controller.signal.aborted) setFields(body.fields);
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        const detail = caught instanceof Error ? caught.message : "The selected candidate could not be reconstructed.";
        setError(detail);
      }
    };

    void run();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [archetypeId, candidateId]);

  useEffect(() => {
    if (phase !== "loading") return;
    const preview = canvasRef.current;
    if (!preview) return;
    preview.style.transition = "";
    preview.style.transform = "";
    preview.style.transformOrigin = "";
  }, [phase]);

  useEffect(() => {
    if (!fields || phase !== "loading") return;
    setPhase(reduced ? "crossfade" : "glide");
  }, [fields, phase, reduced]);

  useEffect(() => {
    if (phase === "crossfade") {
      const timer = window.setTimeout(() => setPhase("reveal"), fadeMs);
      return () => window.clearTimeout(timer);
    }
    if (phase === "reveal") {
      const timer = window.setTimeout(() => setPhase("ready"), uiMs);
      return () => window.clearTimeout(timer);
    }
    if (phase !== "glide") return;

    let cancelled = false;
    let timer = 0;
    let frame = 0;
    let attempts = 0;

    const align = () => {
      const preview = canvasRef.current;
      const stack = viewerRef.current?.querySelector("canvas");
      const frameEl = stack && stack.getBoundingClientRect().width > 2 ? stack : stack?.parentElement;
      if (!preview || !frameEl) return false;
      const start = preview.getBoundingClientRect();
      const target = frameEl.getBoundingClientRect();
      if (start.width < 2 || start.height < 2 || target.width < 2 || target.height < 2) return false;
      // Both canvases center the stack and size plates by min(width, height) * 0.52.
      const dx = target.left + target.width / 2 - (start.left + start.width / 2);
      const dy = target.top + target.height / 2 - (start.top + start.height / 2);
      const scale = Math.min(target.width, target.height) / Math.min(start.width, start.height);
      if (!Number.isFinite(scale) || scale <= 0) return false;
      preview.style.transformOrigin = "center center";
      preview.style.transition = "none";
      preview.style.transform = "none";
      void preview.offsetHeight;
      preview.style.transition = `transform ${HANDOFF_MOVE_MS}ms ${HANDOFF_EASE}, opacity ${fadeMs}ms ${HANDOFF_EASE}`;
      preview.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
      return true;
    };

    const kick = () => {
      if (cancelled) return;
      if (align() || attempts >= 20) {
        timer = window.setTimeout(() => {
          if (!cancelled) setPhase("crossfade");
        }, HANDOFF_MOVE_MS);
        return;
      }
      attempts += 1;
      frame = window.requestAnimationFrame(kick);
    };
    frame = window.requestAnimationFrame(kick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [fadeMs, phase]);

  if (error) return <VerticalSelectionNotice title="This candidate could not be opened." detail={error} />;

  const showViewer = Boolean(fields) && phase !== "loading";

  return (
    <div className="vertical-handoff relative h-full min-h-0" data-phase={phase} style={handoffStyle}>
      {showViewer && fields ? (
        <div
          ref={viewerRef}
          className={`vertical-handoff-viewer h-full ${phase === "ready" ? "relative" : "absolute inset-0"}`}
          inert={phase === "ready" ? undefined : true}
          aria-hidden={phase === "ready" ? undefined : true}
        >
          <CtScan fields={fields} materialization={materialization} />
        </div>
      ) : null}
      {phase !== "ready" ? (
        <div className="vertical-handoff-preview relative h-full" aria-hidden={phase === "loading" ? undefined : true}>
          <VerticalPrepareOverview
            archetypeName={archetypeName}
            candidateId={candidateId}
            plate={plate}
            hold={phase !== "loading"}
            canvasRef={canvasRef}
          />
        </div>
      ) : null}
    </div>
  );
}
