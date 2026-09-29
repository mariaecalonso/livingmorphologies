"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { drawPlanField } from "@/components/skill1-viz";
import { mulberry32 } from "@/lib/physarum";
import { drawIsoMesh } from "@/lib/scan/draw-mesh";
import { columnHeight, extractIsomesh, type IsoMesh } from "@/lib/scan/isomesh";
import { takeSlice, type ScanSlice } from "@/lib/scan/volume";
import { captureSnapshot, createSimulation, stepSimulation } from "@/lib/skill1/engine";
import { translateArchetype } from "@/lib/skill1/translate";
import type { BiologicalTranslation, FieldSnapshot, SimulationState } from "@/lib/skill1/types";

const ARCHETYPE_ID = "void-field";
const SEED = 7;
const TRAIL_SCALE = 12;
const SLICE_COUNT = 8;
const PHYSARUM_MS = 6800;
const PLAN_MS = 5200;
const VOLUME_MS = 7200;
const HOLD_MS = 2000;
const SPACING = 0.1;
const ISO = 0.32;
const PLATE_COUNT = 4;
const PLATE_GAP = 0.46;
const PLATE_PITCH = 0.38;

type Phase = "physarum" | "plan" | "volume";

type PreviewRun = {
  translation: BiologicalTranslation;
  state: SimulationState;
  rng: () => number;
  agents: number;
  density: number;
  decay: number;
  steps: number;
  slices: ScanSlice[];
  respawned: boolean;
};

const PHASE_LABEL: Record<Phase, string> = {
  physarum: "Physarum",
  plan: "2D Evolution",
  volume: "Vertical Propagation",
};

const EVAL = [
  { at: 0, text: "Population generation", count: 0 },
  { at: 650, text: "Morphological measurement", count: 1 },
  { at: 1450, text: "Formal / Spatial / Atmospheric", count: 2 },
  { at: 2300, text: "Evolutionary search", count: 3 },
  { at: 3100, text: "Selected", count: 4 },
];

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}

function createRun(agents: number): PreviewRun {
  const translation = translateArchetype(ARCHETYPE_ID);
  const seed = SEED ^ agents;
  return {
    translation,
    state: createSimulation(translation, seed, agents, TRAIL_SCALE),
    rng: mulberry32(seed ^ 0x9e3779b9),
    agents,
    density: 3,
    decay: 0.992,
    steps: 0,
    slices: [],
    respawned: false,
  };
}

function stepRun(run: PreviewRun, budget: number) {
  for (let taken = 0; taken < budget; taken += 1) {
    run.state = stepSimulation(run.state, run.translation, run.rng, run.decay, undefined, true, false);
    run.steps += 1;
    if (run.steps % 28 !== 0) continue;
    const index = Math.min(run.slices.length, SLICE_COUNT - 1);
    const slice = takeSlice(run.state, index);
    if (run.slices.length < SLICE_COUNT) run.slices.push(slice);
    else run.slices[index] = slice;
  }
}

function snapshotOf(run: PreviewRun, slice: ScanSlice): FieldSnapshot {
  return {
    iteration: slice.iteration,
    size: run.state.size,
    trailSize: slice.trailSize,
    trails: Array.from(slice.trails),
    occupancy: [],
    agents: [],
    paths: [],
    source: slice.source,
    attractor: slice.attractor,
  };
}

function drawPlateStack(
  canvas: HTMLCanvasElement,
  plates: HTMLCanvasElement[],
  shown: number,
  yaw: number,
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, parent.clientWidth);
  const height = Math.max(1, parent.clientHeight);
  const pixelsW = Math.floor(width * dpr);
  const pixelsH = Math.floor(height * dpr);
  if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
    canvas.width = pixelsW;
    canvas.height = pixelsH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(PLATE_PITCH);
  const sp = Math.sin(PLATE_PITCH);
  const rot = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
  };
  const full = (PLATE_COUNT - 1) * PLATE_GAP;
  const y0 = -full * 0.5;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < PLATE_COUNT; index += 1) {
    const y = y0 + index * PLATE_GAP;
    for (const x of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        const point = rot(x, y, z);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const scale = Math.min((width * 0.9) / spanX, (height * 0.86) / spanY);
  const xMid = (minX + maxX) / 2;
  const yMid = (minY + maxY) / 2;
  const du = rot(1, 0, 0);
  const dv = rot(0, 0, 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const order = Array.from({ length: Math.min(shown, plates.length) }, (_, index) => index).sort(
    (a, b) => rot(0, y0 + a * PLATE_GAP, 0).z - rot(0, y0 + b * PLATE_GAP, 0).z,
  );
  for (const index of order) {
    const plate = plates[index];
    if (!plate) continue;
    const origin = rot(-0.5, y0 + index * PLATE_GAP, -0.5);
    ctx.save();
    ctx.setTransform(
      dpr * du.x * scale,
      dpr * -du.y * scale,
      dpr * dv.x * scale,
      dpr * -dv.y * scale,
      dpr * (width / 2 + (origin.x - xMid) * scale),
      dpr * (height / 2 - (origin.y - yMid) * scale),
    );
    ctx.drawImage(plate, 0, 0, 1, 1);
    ctx.strokeStyle = index === shown - 1 ? "rgba(199,126,95,0.95)" : "rgba(242,242,238,0.42)";
    ctx.lineWidth = index === shown - 1 ? 0.014 : 0.007;
    ctx.strokeRect(0, 0, 1, 1);
    ctx.restore();
  }
}

function paintSquare(canvas: HTMLCanvasElement, snapshot: FieldSnapshot, side: number, density: number) {
  const length = Math.max(8, Math.floor(side));
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const pixels = Math.floor(length * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, length, length);
  drawPlanField(ctx, snapshot, length, length, { showHud: false, fine: false, density, showAttractors: false });
}

export function HomeLabPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const stackRef = useRef<HTMLCanvasElement>(null);
  const meshRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest<HTMLElement>("#lab");
    const shell = section?.closest<HTMLElement>(".site-shell");
    const field = fieldRef.current;
    const stackCanvas = stackRef.current;
    const meshCanvas = meshRef.current;
    if (!root || !section || !field || !stackCanvas || !meshCanvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let running = false;
    let inView = false;
    let run: PreviewRun | null = null;
    let mesh: IsoMesh | null = null;
    let phase: Phase = "physarum";
    let phaseStarted = 0;
    let planMark = -1;
    let stackCount = 0;
    let picks: ScanSlice[] = [];
    let plates: HTMLCanvasElement[] = [];
    let observer: IntersectionObserver | null = null;

    const setting = (name: string) => root.querySelector<HTMLElement>(`[data-chip="${name}"]`);

    const setValue = (name: string, value: string, fill: number, active: boolean) => {
      const node = setting(name);
      if (!node) return;
      const strong = node.querySelector("strong");
      const meter = node.querySelector<HTMLElement>(".home-lab-meter b");
      if (strong) strong.textContent = value;
      if (meter) meter.style.setProperty("--fill", `${Math.round(fill * 100)}%`);
      node.classList.toggle("is-active", active);
    };

    const setPhase = (next: Phase) => {
      phase = next;
      if (phaseRef.current) phaseRef.current.textContent = PHASE_LABEL[next];
      root.querySelectorAll<HTMLElement>("[data-set]").forEach((node) => {
        node.hidden = node.dataset.set !== next;
      });
    };

    const paintLive = () => {
      const box = field.parentElement;
      if (!box || !run) return;
      const side = Math.min(box.clientWidth, box.clientHeight);
      paintSquare(field, captureSnapshot(run.state, true), side, run.density);
    };

    const paintPick = (canvas: HTMLCanvasElement | null, slice: ScanSlice | undefined) => {
      if (!canvas || !slice || !run) return;
      const side = canvas.clientWidth || 64;
      paintSquare(canvas, snapshotOf(run, slice), side, 6);
    };

    const buildMesh = (count: number) => {
      const grown = picks.slice(0, Math.max(2, count));
      if (grown.length < 2) return;
      try {
        mesh = extractIsomesh(grown, ISO, SPACING);
      } catch {
        mesh = null;
      }
    };

    const beginCycle = () => {
      run = createRun(180);
      stepRun(run, 8);
      mesh = null;
      picks = [];
      plates = [];
      stackCanvas.style.opacity = "1";
      if (meshCanvas.parentElement) meshCanvas.parentElement.style.opacity = "0";
      planMark = -1;
      stackCount = 0;
      phaseStarted = performance.now();
      setPhase("physarum");
      setValue("agents", "180", 180 / 480, false);
      setValue("density", "3", 3 / 10, false);
      setValue("iterations", "0", 0, false);
      setValue("decay", "0.992", (0.992 - 0.9) / 0.098, false);
      paintLive();
    };

    const showPlan = () => {
      if (!run) return;
      const finalIndex = Math.min(run.slices.length, SLICE_COUNT - 1);
      run.slices[finalIndex] = takeSlice(run.state, finalIndex);
      const slices = run.slices.length > 0 ? run.slices : [takeSlice(run.state, 0)];
      picks = [0, 1, 2, 3].map((index) => slices[Math.min(slices.length - 1, Math.round((index / 3) * (slices.length - 1)))]);
      planMark = -1;
      phaseStarted = performance.now();
      setPhase("plan");
      picks.forEach((slice, index) => {
        paintPick(root.querySelector(`[data-chip="c${index}"] canvas`), slice);
      });
    };

    const paintVolumeStill = () => {
      const selected = picks[picks.length - 1];
      paintPick(root.querySelector("[data-chip='selected2d'] canvas"), selected);
      picks.forEach((slice, index) => {
        paintPick(root.querySelector(`[data-slice="${index}"]`), slice);
      });
    };

    const paintPlates = () => {
      if (!run) return;
      picks.forEach((slice, index) => {
        const plate = plates[index] ?? document.createElement("canvas");
        plates[index] = plate;
        paintSquare(plate, snapshotOf(run, slice), 220, 6);
      });
    };

    const showVolume = () => {
      stackCount = 0;
      phaseStarted = performance.now();
      setPhase("volume");
      stackCanvas.style.opacity = "1";
      if (meshCanvas.parentElement) meshCanvas.parentElement.style.opacity = "0";
      paintVolumeStill();
      paintPlates();
      requestAnimationFrame(() => {
        paintVolumeStill();
        paintPlates();
      });
      buildMesh(PLATE_COUNT);
    };

    const drivePhysarum = (elapsed: number) => {
      if (!run) return;
      const iterationFill = Math.min(1, run.state.iteration / 160);
      setValue("iterations", String(run.state.iteration), iterationFill, elapsed >= 3400 && elapsed < 4900);

      if (elapsed >= 400) {
        const t = (elapsed - 400) / 900;
        const agents = Math.round(lerp(180, 420, t));
        setValue("agents", String(agents), agents / 480, t < 1);
        if (t >= 1 && !run.respawned) {
          const kept = takeSlice(run.state, run.slices.length);
          if (run.slices.length < SLICE_COUNT) run.slices.push(kept);
          const next = createRun(420);
          next.slices = run.slices;
          next.density = run.density;
          next.respawned = true;
          run = next;
        }
      }

      if (elapsed >= 1900) {
        const t = (elapsed - 1900) / 800;
        run.density = Math.round(lerp(3, 8, t));
        setValue("density", String(run.density), run.density / 10, t < 1);
      }

      if (elapsed >= 5000) {
        const t = (elapsed - 5000) / 900;
        run.decay = lerp(0.992, 0.948, t);
        setValue("decay", run.decay.toFixed(3), (run.decay - 0.9) / 0.098, t < 1);
      }

      const pace = elapsed >= 3400 && elapsed < 4900 ? 3 : 2;
      stepRun(run, pace);
      paintLive();
      if (elapsed >= PHYSARUM_MS && run.slices.length >= 2) showPlan();
    };

    const drivePlan = (elapsed: number) => {
      const beat = EVAL.reduce((current, item, index) => (elapsed >= item.at ? index : current), 0);
      if (beat !== planMark) {
        planMark = beat;
        const item = EVAL[beat];
        const status = root.querySelector<HTMLElement>("[data-evo='status']");
        const count = root.querySelector<HTMLElement>("[data-evo='count']");
        const bar = root.querySelector<HTMLElement>("[data-evo='bar']");
        if (status) status.textContent = item.text;
        if (count) count.textContent = `${item.count} / 4 evaluated`;
        if (bar) bar.style.width = `${(item.count / 4) * 100}%`;
        picks.forEach((_, index) => {
          const node = root.querySelector<HTMLElement>(`[data-chip="c${index}"]`);
          node?.classList.toggle("is-active", item.count > 0 && index === item.count - 1 && item.count < 4);
          node?.classList.toggle("is-selected", item.count === 4 && index === picks.length - 1);
        });
        const shown = picks[Math.max(0, Math.min(picks.length - 1, item.count - 1))];
        if (shown) paintPick(field, shown);
      }
      if (elapsed >= PLAN_MS) showVolume();
    };

    const driveVolume = (elapsed: number) => {
      const nextCount = elapsed < 700 ? 1 : elapsed < 1500 ? 2 : elapsed < 2300 ? 3 : 4;
      if (nextCount !== stackCount) {
        stackCount = nextCount;
        root.querySelectorAll<HTMLCanvasElement>("[data-slice]").forEach((canvas, index) => {
          canvas.classList.toggle("is-on", index < nextCount);
        });
      }
      const yaw = lerp(0.58, 0.92, Math.min(1, elapsed / (VOLUME_MS - HOLD_MS)));
      drawPlateStack(stackCanvas, plates, stackCount, yaw);
      if (elapsed >= VOLUME_MS - HOLD_MS && mesh) {
        drawIsoMesh(meshCanvas, mesh, yaw, PLATE_PITCH, columnHeight(SPACING));
      }
      if (elapsed >= VOLUME_MS) beginCycle();
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
      frame = 0;
      run = null;
      mesh = null;
    };

    const tick = (now: number) => {
      if (!running || !run) return;
      const elapsed = now - phaseStarted;
      if (phase === "physarum") drivePhysarum(elapsed);
      else if (phase === "plan") drivePlan(elapsed);
      else driveVolume(elapsed);
      if (!running) return;
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      beginCycle();
      if (reduced) {
        showPlan();
        const status = root.querySelector<HTMLElement>("[data-evo='status']");
        if (status) status.textContent = "Selected";
        root.querySelector<HTMLElement>("[data-chip='c3']")?.classList.add("is-selected");
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      if (inView && !document.hidden) start();
      else stop();
    };

    const onIntersect: IntersectionObserverCallback = (entries) => {
      const entry = entries[entries.length - 1];
      const rootHeight = entry?.rootBounds?.height ?? 0;
      const visible = entry?.intersectionRect.height ?? 0;
      inView = rootHeight > 0 && visible / rootHeight >= 0.65;
      sync();
    };

    const connect = () => {
      observer?.disconnect();
      const scrollRoot = shell?.dataset.siteDisplay === "classroom" ? shell : section.closest(".site-main");
      observer = new IntersectionObserver(onIntersect, {
        root: scrollRoot,
        threshold: Array.from({ length: 21 }, (_, index) => index / 20),
      });
      observer.observe(section);
    };

    const onResize = () => {
      if (!running || !run) return;
      if (phase === "physarum") paintLive();
    };

    connect();
    const displayObserver = new MutationObserver(connect);
    if (shell) displayObserver.observe(shell, { attributes: true, attributeFilter: ["data-site-display"] });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", onResize);

    return () => {
      stop();
      observer?.disconnect();
      displayObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="home-lab-preview" ref={rootRef}>
      <div className="home-lab-frame">
        <div className="home-lab-bar">
          <p className="home-lab-phase" ref={phaseRef}>
            Physarum
          </p>
        </div>
        <div className="home-lab-stage">
          <div className="home-lab-board home-lab-physarum" data-set="physarum">
            <aside className="home-lab-panel">
              <p className="home-lab-panel-kicker">Simulation settings</p>
              <div className="home-lab-setting" data-chip="agents">
                <span>
                  <em>Agents</em>
                  <strong>180</strong>
                </span>
                <i className="home-lab-meter">
                  <b />
                </i>
              </div>
              <div className="home-lab-setting" data-chip="density">
                <span>
                  <em>Density</em>
                  <strong>3</strong>
                </span>
                <i className="home-lab-meter">
                  <b />
                </i>
              </div>
              <div className="home-lab-setting" data-chip="iterations">
                <span>
                  <em>Iterations</em>
                  <strong>0</strong>
                </span>
                <i className="home-lab-meter">
                  <b />
                </i>
              </div>
              <div className="home-lab-setting" data-chip="decay">
                <span>
                  <em>Trail decay</em>
                  <strong>0.992</strong>
                </span>
                <i className="home-lab-meter">
                  <b />
                </i>
              </div>
            </aside>
            <div className="home-lab-field">
              <canvas ref={fieldRef} aria-hidden="true" />
            </div>
          </div>

          <div className="home-lab-board home-lab-evolution" data-set="plan" hidden>
            <div className="home-lab-evo-head">
              <p className="home-lab-panel-kicker">2D Evolution</p>
              <p className="home-lab-note" data-evo="status">
                Population generation
              </p>
            </div>
            <div>
              <div className="home-lab-progress" aria-hidden="true">
                <span data-evo="bar" />
              </div>
              <p className="home-lab-note" data-evo="count">
                0 / 4 evaluated
              </p>
            </div>
            <div className="home-lab-candidates">
              {["01", "02", "03", "04"].map((label, index) => (
                <figure className="home-lab-candidate" data-chip={`c${index}`} key={label}>
                  <canvas aria-hidden="true" />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="home-lab-board home-lab-vertical" data-set="volume" hidden>
            <aside className="home-lab-panel home-lab-selected-panel">
              <p className="home-lab-panel-kicker">Selected 2D</p>
              <div className="home-lab-selected" data-chip="selected2d">
                <canvas aria-hidden="true" />
              </div>
            </aside>
            <aside className="home-lab-panel home-lab-slice-panel">
              <p className="home-lab-panel-kicker">XYT slices</p>
              <div className="home-lab-slicecol">
                {[0, 1, 2, 3].map((index) => (
                  <canvas key={index} data-slice={index} aria-hidden="true" />
                ))}
              </div>
            </aside>
            <div className="home-lab-view">
              <canvas className="home-lab-stack" ref={stackRef} aria-hidden="true" />
              <div className="home-lab-mesh">
                <canvas className="is-mesh" ref={meshRef} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
        <div className="home-lab-foot">
          <Link className="home-lab-enter" href="/lab">
            <span>Enter Lab</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
