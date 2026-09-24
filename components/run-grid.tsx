"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import { DISPLAY_ITERATIONS } from "@/lib/skill1/maps";
import { slimeControlsFromTranslation, varySlimeControls } from "@/lib/skill1/slime-controls";
import { translateArchetype } from "@/lib/skill1/translate";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { BiologicalTranslation, FieldSnapshot } from "@/lib/skill1/types";
import { mulberry32 } from "@/lib/physarum";
import { drawPlanField } from "@/components/skill1-viz";

const COLUMNS = 20;
const ROWS = 4;
const RUN_COUNT = COLUMNS * ROWS;
const ARCHETYPE_ID = "vertical-void";

function seedFor(id: string, run: number) {
  return (0x51c11 ^ (run * 9973) ^ id.length * 131) >>> 0;
}

function paintSnapshot(canvas: HTMLCanvasElement, snapshot: FieldSnapshot, fine = false) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPlanField(ctx, snapshot, width, height, { showHud: false, fine, density: 5 });
}

function labelize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (value && typeof value === "object" && "x" in value && "y" in value) {
    const point = value as { x: number; y: number };
    return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}`;
  }
  return String(value);
}

function ParamList({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, unknown]>;
}) {
  return (
    <section>
      <h3 className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--orange-hot)]">{title}</h3>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.78rem]">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-[var(--muted)]">{labelize(key)}</dt>
            <dd className="text-right text-[var(--text)]">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RunGrid() {
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const snapshotsRef = useRef<Array<FieldSnapshot | null>>(Array.from({ length: RUN_COUNT }, () => null));
  const [completed, setCompleted] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const translation = useMemo(() => translateArchetype(ARCHETYPE_ID), []);
  const slime = useMemo(() => slimeControlsFromTranslation(translation), [translation]);
  const seeds = useMemo(
    () => Array.from({ length: RUN_COUNT }, (_, index) => seedFor(ARCHETYPE_ID, index)),
    [],
  );
  const variants = useMemo(
    () =>
      seeds.map((seed) => ({
        seed,
        agents: 350 + (seed % 1100),
        slime: varySlimeControls(slime, seed),
      })),
    [seeds, slime],
  );

  useEffect(() => {
    let cancelled = false;
    let index = 0;
    const startRun = (run: number) => {
      const variant = variants[run];
      const next = createSimulation(translation, variant.seed, variant.agents);
      next.maxIterations = DISPLAY_ITERATIONS;
      return { sim: next, rng: mulberry32(variant.seed ^ 0x9e3779b9), slime: variant.slime };
    };
    let current = startRun(0);

    const frame = () => {
      if (cancelled) return;
      const budget = performance.now() + 14;
      while (performance.now() < budget && index < RUN_COUNT) {
        if (current.sim.converged || current.sim.iteration >= DISPLAY_ITERATIONS) {
          const snapshot = captureSnapshot(current.sim);
          snapshotsRef.current[index] = snapshot;
          const canvas = canvasRefs.current[index];
          if (canvas) paintSnapshot(canvas, snapshot);
          index += 1;
          setCompleted(index);
          if (index >= RUN_COUNT) return;
          current = startRun(index);
        }
        stepMany(current.sim, translation, current.rng, 20, current.slime.decay, current.slime);
      }
      if (index < RUN_COUNT) requestAnimationFrame(frame);
    };

    const start = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(start);
    };
  }, [translation, variants]);

  useEffect(() => {
    const onResize = () => {
      snapshotsRef.current.forEach((snapshot, index) => {
        const canvas = canvasRefs.current[index];
        if (snapshot && canvas) paintSnapshot(canvas, snapshot);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (selected == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowRight") {
        setSelected((current) => (current == null ? current : Math.min(RUN_COUNT - 1, current + 1)));
      }
      if (event.key === "ArrowLeft") {
        setSelected((current) => (current == null ? current : Math.max(0, current - 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    if (selected == null) return;
    const snapshot = snapshotsRef.current[selected];
    const canvas = detailRef.current;
    if (!snapshot || !canvas) return;
    const paint = () => paintSnapshot(canvas, snapshot, true);
    const frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [selected, completed]);

  const selectedSnapshot = selected == null ? null : snapshotsRef.current[selected];

  return (
    <main className="flex h-dvh flex-col bg-black text-[var(--text)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <div>
          <p className="display text-[0.95rem] text-white">20 × 4 runs</p>
          <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            Vertical Void · {RUN_COUNT} growth variants · {DISPLAY_ITERATIONS} iterations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)]">
            {completed} / {RUN_COUNT}
          </p>
          <a
            href="/"
            className="border border-[rgba(242,242,238,0.18)] px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--text)]"
          >
            Board
          </a>
        </div>
      </header>
      <div
        className="grid min-h-0 flex-1 gap-px bg-[rgba(242,242,238,0.12)]"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: RUN_COUNT }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSelected(index)}
            className={`relative min-h-0 min-w-0 bg-black text-left ${
              selected === index ? "outline outline-1 outline-[var(--orange)]" : ""
            }`}
            aria-label={`Enlarge run ${String(index + 1).padStart(2, "0")}`}
          >
            <canvas
              ref={(node) => {
                canvasRefs.current[index] = node;
              }}
              className="pointer-events-none block h-full w-full"
            />
            <span className="pointer-events-none absolute left-1 top-0.5 text-[0.55rem] tracking-[0.08em] text-[rgba(242,242,238,0.55)]">
              {String(index + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
      </div>
      {selected != null ? (
        <RunDetail
          index={selected}
          seed={variants[selected].seed}
          agents={variants[selected].agents}
          snapshot={selectedSnapshot}
          translation={translation}
          slime={variants[selected].slime}
          canvasRef={detailRef}
          onClose={() => setSelected(null)}
          onStep={(delta) =>
            setSelected((current) =>
              current == null ? current : Math.min(RUN_COUNT - 1, Math.max(0, current + delta)),
            )
          }
        />
      ) : null}
    </main>
  );
}

function RunDetail({
  index,
  seed,
  agents,
  snapshot,
  translation,
  slime,
  canvasRef,
  onClose,
  onStep,
}: {
  index: number;
  seed: number;
  agents: number;
  snapshot: FieldSnapshot | null;
  translation: BiologicalTranslation;
  slime: SlimeControls;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const { params, behavior, recipe } = translation;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[min(92dvh,860px)] w-[min(96vw,1180px)] overflow-hidden border border-[var(--line)] bg-[#050505]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Run ${String(index + 1).padStart(2, "0")} parameters`}
      >
        <div className="relative min-w-0 flex-1 bg-black">
          {snapshot ? (
            <canvas ref={canvasRef} className="block h-full w-full" />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-[0.72rem] uppercase tracking-[0.16em] text-[var(--muted)]">
              Still generating
            </p>
          )}
        </div>
        <aside className="flex w-[22rem] shrink-0 flex-col border-l border-[var(--line)]">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="display text-[0.95rem] text-white">Run {String(index + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                {translation.archetypeName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="border border-[rgba(242,242,238,0.18)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--text)]"
            >
              Close
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4">
            <ParamList
              title="Simulation"
              rows={[
                ["seed", seed],
                ["agents", agents],
                ["iterations", snapshot?.iteration ?? DISPLAY_ITERATIONS],
                ["maxIterations", DISPLAY_ITERATIONS],
                ["field", `${snapshot?.size ?? 20} × ${snapshot?.size ?? 20}`],
              ]}
            />
            <ParamList
              title="Slime mold"
              rows={[
                ["sensorAngle", slime.sensorAngle],
                ["sensorDistance", slime.sensorDistance],
                ["turnAngle", slime.turnAngle],
                ["stepSize", slime.stepSize],
                ["deposit", slime.deposit],
                ["depositWidth", slime.depositWidth],
                ["diffusion", slime.diffusion],
                ["decay", slime.decay],
                ["randomness", slime.randomness],
                ["persistence", slime.persistence],
                ["trailCap", slime.trailCap],
                ["crowdingLimit", slime.crowdingLimit],
                ["voidElongation", slime.voidElongation],
                ["voidRotation", slime.voidRotation],
                ["voidLobes", slime.voidLobes],
                ["voidNotch", slime.voidNotch],
                ["foodPoints", slime.foodPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" · ")],
              ]}
            />
            <ParamList title="Physarum" rows={Object.entries(params)} />
            <ParamList title="Behavior" rows={Object.entries(behavior)} />
            <ParamList
              title="Recipe"
              rows={[
                ["topology", translation.topology],
                ["sourceCorner", recipe.sourceCorner],
                ["attractor", recipe.attractor],
                ["coreExposure", recipe.coreExposure],
                ["enclosureCollar", recipe.enclosureCollar],
                ["isolationRadius", recipe.isolationRadius],
                ["clustering", recipe.clustering],
                ["approachWidth", recipe.approachWidth],
              ]}
            />
          </div>
          <footer className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={index === 0}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={index === RUN_COUNT - 1}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Next
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}
