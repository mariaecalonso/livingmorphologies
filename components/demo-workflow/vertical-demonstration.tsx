"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ContinueFamilyFan } from "@/components/continue-family-fan";
import { InheritFamilySummary } from "@/components/inherit-criteria-profile";
import { ProcessGeneration } from "@/components/process-generation-view";
import { ProcessStartField } from "@/components/process-start-field";
import type { DevelopPlate } from "@/components/process-develop-view";
import { ProcessMorphology, SampleDecisionStack, type SampleFrame } from "@/components/vertical-process-stage";
import { VerticalCatalogue } from "@/components/vertical-catalogue";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import type { IsoMesh } from "@/lib/scan/isomesh";
import {
  PROCESS_ISO_PITCH,
  PROCESS_ISO_YAW,
  createProcessIsoCamera,
  orbitProcessIso,
  resetProcessIso,
  zoomProcessIso,
  type ProcessIsoCamera,
} from "@/lib/skill3/process-iso-camera";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import { capAddition, capProjectionExtent, solidClosure } from "@/lib/skill3/cap-accent";
import { decodeSolidifiedMesh, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import { DEMO_TIMING } from "@/lib/demo-workflow/chapters";
import styles from "@/components/demo-workflow/vertical-chapter.module.css";

const ARCHETYPE = "vertical-void";
const CANDIDATE = 351;
const CONTINUATIONS = Array.from({ length: 24 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`);
const CHOOSE_ORDER = ["N01", "N09", "N12", "N20", "N24"] as const;
const CATALOG_ORDER = ["N15", "N12", "N23", "N10"] as const;
const STAGES = ["sample", "develop", "form", "cap", "choose", "solidify", "handoff", "catalog"] as const;
const GROUPS: readonly { focus: string; start: number; end: number; count: number }[] = [
  { focus: "Formal", start: 1, end: 3, count: 3 },
  { focus: "Spatial", start: 4, end: 6, count: 3 },
  { focus: "Atmospheric", start: 7, end: 9, count: 3 },
  { focus: "Formal + Spatial", start: 10, end: 12, count: 3 },
  { focus: "Formal + Atmospheric", start: 13, end: 15, count: 3 },
  { focus: "Spatial + Atmospheric", start: 16, end: 18, count: 3 },
  { focus: "Formal + Spatial + Atmospheric", start: 19, end: 24, count: 6 },
];

type Stage = (typeof STAGES)[number] | "selected";

type DemoStore = {
  run: boolean;
  active: Stage;
  cursor: { x: number; y: number; visible: boolean };
  pressed: string | null;
  catalogId: string | null;
  catalogOpen: boolean;
  n24Final: boolean;
  handoff: boolean;
  portal: HTMLElement | null;
};

const initialStore: DemoStore = {
  run: true,
  active: "sample",
  cursor: { x: 28, y: 36, visible: false },
  pressed: null,
  catalogId: null,
  catalogOpen: false,
  n24Final: false,
  handoff: false,
  portal: null,
};

let store: DemoStore = initialStore;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function patch(next: Partial<DemoStore>) {
  store = { ...store, ...next };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useDemoStore() {
  return useSyncExternalStore(subscribe, () => store, () => initialStore);
}

function branchNumber(id: string) {
  return Number(id.slice(1));
}

function groupFor(id: string) {
  const number = branchNumber(id);
  return GROUPS.find((group) => number >= group.start && number <= group.end) ?? null;
}

async function readMesh(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { geometry?: EncodedSolidifiedMesh };
  if (!body.geometry?.positions || !body.geometry.normals || !body.geometry.indices) return null;
  return decodeSolidifiedMesh(body.geometry);
}

function openUrl(id: string, reading = "open") {
  const params = new URLSearchParams({ archetype: ARCHETYPE, continuation: id, reading });
  return `/api/vertical/experiments/criteria-hybrid?${params}`;
}

const meshCache = new Map<string, Promise<IsoMesh | null>>();

function loadOpen(id: string) {
  const cached = meshCache.get(id);
  if (cached) return cached;
  const pending = readMesh(openUrl(id)).catch(() => null);
  meshCache.set(id, pending);
  return pending;
}

function columnsOf(node: HTMLElement | null) {
  let current = node?.parentElement ?? null;
  while (current) {
    if ([...current.classList].some((name) => name.includes("detailColumns"))) return current;
    current = current.parentElement;
  }
  return null;
}

function pointIn(root: HTMLElement, el: HTMLElement, place: "control" | "mark" = "control") {
  const frame = root.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const scaleX = frame.width === 0 ? 1 : root.offsetWidth / frame.width;
  const scaleY = frame.height === 0 ? 1 : root.offsetHeight / frame.height;
  const along = place === "mark" ? 0.15 : 0.32;
  const down = place === "mark" ? 0.45 : 0.62;
  return {
    x: (box.left - frame.left + box.width * along) * scaleX,
    y: (box.top - frame.top + box.height * down) * scaleY,
  };
}

function DemoCursor() {
  const { cursor, pressed, portal } = useDemoStore();
  if (!portal || !cursor.visible) return null;
  return createPortal(
    <span className={styles.cursor} data-down={pressed ? "true" : undefined} style={{ left: cursor.x, top: cursor.y }} aria-hidden="true">
      <svg viewBox="0 0 18 22">
        <path d="M1 1v17l4.6-4.2 3.2 7 3-1.4-3.2-6.8 6.4-.2z" />
      </svg>
    </span>,
    portal,
  );
}

type ProcessFocus = "sample" | "develop" | "form" | "cap";

function ProcessSetup() {
  const intent = useMemo(() => {
    try {
      return architecturalIntentFor(ARCHETYPE);
    } catch {
      return null;
    }
  }, []);
  const [plate, setPlate] = useState<{ size: number; values: Uint8Array } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: ARCHETYPE, candidate: String(CANDIDATE) });
    fetch(`/api/vertical/z0/field?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ size?: number; plate?: string }> : null))
      .then((body) => {
        if (controller.signal.aborted || !body?.plate || !body.size) return;
        const values = Uint8Array.from(atob(body.plate), (char) => char.charCodeAt(0));
        if (values.length === body.size * body.size) setPlate({ size: body.size, values });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <div className="process-setup">
      <section className="process-step process-start" aria-label="Start">
        <div className="process-start-source">
          <header className="vertical-process-label">
            <p className="eyebrow">01</p>
            <h2 className="panel-title">Start</h2>
          </header>
          <p className="process-sentence">A verified Skill 2 state begins the sequence.</p>
          <p className="process-cue">Vertical Void</p>
        </div>
        <ProcessStartField plate={plate} />
      </section>
      <section className="process-step process-descriptors" aria-label="Inherit">
        <header className="vertical-process-label">
          <p className="eyebrow">02</p>
          <h2 className="panel-title">Inherit</h2>
        </header>
        <p className="process-sentence">Architectural criteria arrive as three families.</p>
        <InheritFamilySummary profile={intent} glow={0.17} />
      </section>
      <section className="process-step process-recipes" aria-label="Continue">
        <header className="vertical-process-label">
          <p className="eyebrow">03</p>
          <h2 className="panel-title">Continue</h2>
        </header>
        <p className="process-sentence">Twenty-four continuations grow from one verified state.</p>
        <ContinueFamilyFan groups={GROUPS} activeFocus="Formal + Spatial + Atmospheric" selectedId="N24" stance="final" plate={plate} />
      </section>
    </div>
  );
}

export function ProcessDemonstration({ focus }: { focus?: ProcessFocus }) {
  const host = useRef<HTMLDivElement>(null);
  const origin = useRef<Stage>("sample");
  const framesRef = useRef<SampleFrame[]>([]);
  const camera = useRef<ProcessIsoCamera>(createProcessIsoCamera());
  const capCamera = useRef<ProcessIsoCamera>(createProcessIsoCamera());
  const solidCamera = useRef<ProcessIsoCamera>(createProcessIsoCamera());
  const developDone = useRef<(() => void) | null>(null);
  const [frames, setFrames] = useState<SampleFrame[] | null>(null);
  const [sampleState, setSampleState] = useState<"loading" | "ready" | "missing">("loading");
  const sampleStateRef = useRef(sampleState);
  const [sampleStep, setSampleStep] = useState(0);
  const [developMeshes, setDevelopMeshes] = useState<Record<number, IsoMesh>>({});
  const [openMesh, setOpenMesh] = useState<IsoMesh | null>(null);
  const [cappedMesh, setCappedMesh] = useState<IsoMesh | null>(null);
  const [beforeMesh, setBeforeMesh] = useState<IsoMesh | null>(null);
  const [finalMesh, setFinalMesh] = useState<IsoMesh | null>(null);
  const [chooseId, setChooseId] = useState("N24");
  const [chooseMesh, setChooseMesh] = useState<IsoMesh | null>(null);
  const [solidShown, setSolidShown] = useState(false);
  const [isoTick, setIsoTick] = useState(0);
  const demo = useDemoStore();

  useLayoutEffect(() => {
    patch({
      active: focus === "cap" ? "cap" : focus ?? "sample",
      cursor: { x: 28, y: 36, visible: false },
      pressed: null,
      catalogId: null,
      catalogOpen: false,
      n24Final: false,
      handoff: false,
    });
  }, [focus]);

  useEffect(() => {
    sampleStateRef.current = sampleState;
  }, [sampleState]);

  useEffect(() => {
    patch({ portal: columnsOf(host.current) });
    const root = document.querySelector("[data-demo-root]");
    if (!root) return;
    let last = root.hasAttribute("data-playing");
    const observer = new MutationObserver(() => {
      const next = root.hasAttribute("data-playing");
      if (next === last) return;
      last = next;
      patch({ run: next });
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-playing"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: ARCHETYPE, candidate: String(CANDIDATE), continuation: "N24" });
    fetch(`/api/vertical/process-replay?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ trailSize: number; decisions: { iteration: number; reason: SampleFrame["reason"] }[]; plates: string }> : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!body?.plates || !body.decisions?.length) {
          setSampleState("missing");
          return;
        }
        const binary = atob(body.plates);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const cell = body.trailSize * body.trailSize;
        const next = body.decisions.map((decision, index) => ({
          iteration: decision.iteration,
          trails: bytes.subarray(index * cell, (index + 1) * cell),
          trailSize: body.trailSize,
          peak: 255,
          reason: decision.reason,
        }));
        framesRef.current = next;
        setFrames(next);
        setSampleState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSampleState("missing");
      });
    fetch(`/api/vertical/process-form?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ frames?: { retained: number; geometry?: EncodedSolidifiedMesh }[] }> : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        const next: Record<number, IsoMesh> = {};
        for (const frame of body?.frames ?? []) {
          if (!frame.geometry?.positions || !frame.geometry.normals || !frame.geometry.indices) continue;
          next[frame.retained] = decodeSolidifiedMesh(frame.geometry);
        }
        setDevelopMeshes(next);
      })
      .catch(() => undefined);
    void readMesh(openUrl("N24"), controller.signal).then((mesh) => {
      if (!controller.signal.aborted) setOpenMesh(mesh);
    }).catch(() => undefined);
    void readMesh(openUrl("N24", "capped"), controller.signal).then((mesh) => {
      if (!controller.signal.aborted) setCappedMesh(mesh);
    }).catch(() => undefined);
    fetch(`/api/vertical/solidified?archetype=${ARCHETYPE}&candidate=${CANDIDATE}&continuation=N24`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ checks?: { manifold?: string; components?: number; boundaryEdges?: number; nonManifoldEdges?: number; preflight?: string }; geometry?: EncodedSolidifiedMesh; original?: EncodedSolidifiedMesh | null }> : null))
      .then((body) => {
        if (controller.signal.aborted || !body) return;
        setBeforeMesh(body.original ? decodeSolidifiedMesh(body.original) : null);
        setFinalMesh(body.geometry ? decodeSolidifiedMesh(body.geometry) : null);
      })
      .catch(() => undefined);
    for (const id of CHOOSE_ORDER) void loadOpen(id);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let stop = false;
    const live = () => !stop;
    const sleep = (ms: number) => new Promise<void>((resolve) => {
      let elapsed = 0;
      let last = performance.now();
      const frame = (now: number) => {
        if (!live()) {
          resolve();
          return;
        }
        if (store.run) elapsed += Math.min(40, now - last);
        last = now;
        if (elapsed >= ms) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const target = (name: string) => {
      if (name === "develop-play") return host.current?.querySelector('[aria-label="Develop"] .process-transport button') ?? null;
      const marked = host.current?.querySelector(`[data-cursor="${name}"]`);
      if (marked) return marked;
      if (name.startsWith("cell-")) return document.querySelector(`#demo-workflow [data-demo-catalog] [data-module="${CSS.escape(name.slice(5))}"]`);
      return null;
    };
    const move = async (name: string) => {
      const root = store.portal;
      const el = target(name);
      if (!root || !(el instanceof HTMLElement)) return;
      const from = store.cursor;
      const to = pointIn(root, el);
      const steps = 14;
      for (let index = 1; index <= steps; index += 1) {
        if (!live()) return;
        const amount = index / steps;
        const ease = amount * amount * (3 - 2 * amount);
        patch({ cursor: { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease, visible: true } });
        await sleep(20);
      }
    };
    const click = async (name: string) => {
      patch({ pressed: name });
      await sleep(150);
      if (!live()) return;
      patch({ pressed: null });
    };
    const waitFor = async (ready: () => boolean, limit = 12000) => {
      const started = performance.now();
      while (live() && !ready() && performance.now() - started < limit) await sleep(80);
    };
    const scrubDevelop = () => {
      const input = host.current?.querySelector('[aria-label="Develop"] input[type="range"]');
      if (!(input instanceof HTMLInputElement)) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, input.max);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const playDevelop = () => {
      const button = host.current?.querySelector('[aria-label="Develop"] .process-transport button');
      if (button instanceof HTMLButtonElement && !button.disabled) button.click();
    };

    const play = async () => {
      if (focus === "cap") origin.current = "cap";
      else if (focus) origin.current = focus;
      await waitFor(() => framesRef.current.length > 1 || sampleStateRef.current === "missing", 8000);
      if (!live()) return;
      const start = origin.current;
      const begin = Math.max(0, STAGES.indexOf(start === "selected" ? "catalog" : start));
      const past = (stage: (typeof STAGES)[number]) => begin > STAGES.indexOf(stage);
      if (past("sample")) setSampleStep(Math.max(0, framesRef.current.length - 1));
      if (past("choose")) setChooseId("N24");
      if (past("solidify")) setSolidShown(true);
      if (!past("solidify")) setSolidShown(false);
      if (past("handoff")) patch({ n24Final: false, catalogOpen: false, catalogId: null });
      resetProcessIso(camera.current);
      setIsoTick((value) => value + 1);

      if (!past("sample")) {
        patch({ active: "sample", handoff: false, catalogOpen: false, catalogId: null, n24Final: false });
        setSampleStep(0);
        await move("sample-play");
        await click("sample-play");
        const horizon = Math.max(0, framesRef.current.length - 1);
        for (let step = 0; step <= horizon; step += 1) {
          if (!live()) return;
          setSampleStep(step);
          const frame = framesRef.current[step];
          await sleep(frame?.reason ? 160 : 72);
        }
        await sleep(280);
      }
      if (focus === "sample" || !live()) return;

      if (!past("develop")) {
        patch({ active: "develop" });
        await waitFor(() => {
          const button = host.current?.querySelector('[aria-label="Develop"] .process-transport button');
          return button instanceof HTMLButtonElement && !button.disabled;
        });
        await move("develop-play");
        await click("develop-play");
        await new Promise<void>((resolve) => {
          developDone.current = resolve;
          playDevelop();
          window.setTimeout(resolve, 14000);
        });
        developDone.current = null;
        if (!live()) return;
        await sleep(240);
      } else {
        await sleep(200);
        scrubDevelop();
      }
      if (focus === "develop" || !live()) return;

      if (!past("form")) {
        patch({ active: "form" });
        resetProcessIso(camera.current);
        setIsoTick((value) => value + 1);
        await move("form-view");
        patch({ pressed: "form-view" });
        for (let index = 0; index < 22; index += 1) {
          if (!live()) return;
          orbitProcessIso(camera.current, 16, index < 8 ? -5 : 3);
          setIsoTick((value) => value + 1);
          await sleep(46);
        }
        for (let index = 0; index < 7; index += 1) {
          if (!live()) return;
          zoomProcessIso(camera.current, -48);
          setIsoTick((value) => value + 1);
          await sleep(55);
        }
        await sleep(420);
        for (let index = 0; index < 7; index += 1) {
          if (!live()) return;
          zoomProcessIso(camera.current, 48);
          setIsoTick((value) => value + 1);
          await sleep(55);
        }
        const from = { ...camera.current };
        for (let index = 1; index <= 14; index += 1) {
          if (!live()) return;
          const amount = index / 14;
          camera.current.yaw = from.yaw + (PROCESS_ISO_YAW - from.yaw) * amount;
          camera.current.pitch = from.pitch + (PROCESS_ISO_PITCH - from.pitch) * amount;
          camera.current.zoom = from.zoom + (1 - from.zoom) * amount;
          setIsoTick((value) => value + 1);
          await sleep(36);
        }
        patch({ pressed: null });
      }
      if (focus === "form" || !live()) return;

      if (!past("cap")) {
        patch({ active: "cap" });
        await move("cap");
        await sleep(1800);
      }
      if (!live()) return;

      if (!past("choose")) {
        for (const id of CHOOSE_ORDER) {
          if (!live()) return;
          patch({ active: "choose" });
          setChooseId(id);
          const mesh = await loadOpen(id);
          if (!live()) return;
          setChooseMesh(mesh);
          await move(`mark-${id}`);
          await click(`mark-${id}`);
          await sleep(980);
        }
      } else if (begin > STAGES.indexOf("choose")) {
        setChooseId("N24");
        setChooseMesh(await loadOpen("N24"));
      }
      if (!live()) return;

      if (!past("solidify")) {
        patch({ active: "solidify" });
        setChooseId("N24");
        setSolidShown(false);
        await move("solidify");
        await sleep(360);
        setSolidShown(true);
        await sleep(1400);
      }
      if (!live()) return;

      if (!past("handoff")) {
        patch({ active: "handoff", handoff: true });
        await move("handoff");
        await sleep(1600);
        patch({ handoff: false });
      }
    };

    void play();
    return () => {
      stop = true;
      developDone.current?.();
      developDone.current = null;
    };
  }, [focus]);

  useEffect(() => {
    if (demo.active !== "develop") return;
    const button = host.current?.querySelector('[aria-label="Develop"] .process-transport button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    const label = button.textContent?.trim();
    if (!demo.run && label === "Pause") button.click();
    if (demo.run && label === "Play" && button.getAttribute("data-started") === "true") button.click();
    if (label === "Pause") button.setAttribute("data-started", "true");
  }, [demo.active, demo.run]);

  const plates: DevelopPlate[] = (() => {
    const kept = (frames ?? []).filter((frame) => frame.reason).sort((left, right) => left.iteration - right.iteration);
    if (kept.length < 2) return [];
    const span = Math.max(1, kept[kept.length - 1].iteration - kept[0].iteration);
    return kept.map((frame) => ({
      iteration: frame.iteration,
      z: (frame.iteration - kept[0].iteration) / span,
      trails: frame.trails,
      trailSize: frame.trailSize,
      peak: frame.peak,
    }));
  })();
  const playIteration = frames && frames.length > 0 ? frames[Math.min(sampleStep, frames.length - 1)].iteration : 0;
  const keptCount = frames?.filter((frame) => frame.reason).length ?? 0;
  const closing = useMemo(() => (openMesh && cappedMesh ? capAddition(openMesh, cappedMesh) : null), [openMesh, cappedMesh]);
  const capExtent = useMemo(() => (cappedMesh ? capProjectionExtent(cappedMesh) : null), [cappedMesh]);
  const solidExtent = useMemo(() => {
    const before = beforeMesh ? capProjectionExtent(beforeMesh) : null;
    const after = finalMesh ? capProjectionExtent(finalMesh) : null;
    if (before && after) {
      return {
        minX: Math.min(before.minX, after.minX),
        maxX: Math.max(before.maxX, after.maxX),
        minY: Math.min(before.minY, after.minY),
        maxY: Math.max(before.maxY, after.maxY),
      };
    }
    return after ?? before;
  }, [beforeMesh, finalMesh]);
  const solidAccent = useMemo(() => (beforeMesh && finalMesh ? solidClosure(beforeMesh, finalMesh) : null), [beforeMesh, finalMesh]);
  const live = (stage: Stage) => demo.active === "catalog" || demo.active === "selected" ? stage === "handoff" : demo.active === stage;
  const group = groupFor(chooseId);
  return (
    <div ref={host} className={styles.stage}>
      <div className={`${styles.labHost} demo-vert-lab`} data-focus={focus}>
        <div className={`process-canvas demo-run ${styles.demoRun}`}>
        <ProcessSetup />
        <div className="process-work">
          <section className="process-step process-live process-sample" aria-label="Sample" data-live={live("sample") || undefined}>
            <header className="vertical-process-label">
              <p className="eyebrow">04</p>
              <h2 className="panel-title">Sample</h2>
            </header>
            <p className="process-sentence">Significant moments are retained from the evolving 2D system.</p>
            <p className="process-cue">{frames && frames.length > 1 ? `N24 · ${keptCount} retained · ${playIteration}` : "N24"}</p>
            <div className="process-sample-stage">
              {frames && frames.length > 1 ? (
                <div className="process-sample-decision">
                  <SampleDecisionStack frames={frames} playIteration={playIteration} columns={0} labelSize={0} fit />
                  <aside className="process-sample-legend">
                    <ul>
                      <li data-reason="threshold"><span>Retained</span></li>
                      <li data-reason="max-gap"><span>Gap</span></li>
                      <li data-reason="skip"><span>Skipped</span></li>
                      <li data-reason="active"><span>Current</span></li>
                    </ul>
                  </aside>
                </div>
              ) : (
                <p className="process-pending">{sampleState === "loading" ? "Reading" : "Sampling record unavailable."}</p>
              )}
            </div>
            <div className="process-transport">
              <button type="button" data-cursor="sample-play" data-pressed={demo.pressed === "sample-play" || undefined}>Play</button>
              <label>
                <span>Scrub</span>
                <input type="range" min={0} max={Math.max(1, (frames?.length ?? 1) - 1)} value={Math.min(sampleStep, Math.max(1, (frames?.length ?? 1) - 1))} readOnly />
              </label>
            </div>
          </section>

          <section className="process-step process-live process-xyt" aria-label="Develop" data-live={live("develop") || undefined}>
            <header className="vertical-process-label">
              <p className="eyebrow">05</p>
              <h2 className="panel-title">Develop</h2>
            </header>
            <p className="process-sentence">A retained pattern changes into the next, and that change becomes the surface.</p>
            <p className="process-cue">N24</p>
            <div className={styles.developSlot} data-pressed={demo.pressed === "develop-play" || undefined}>
              <ProcessGeneration
                plates={plates}
                meshes={developMeshes}
                surface={openMesh}
                autoplay={false}
                loading={sampleState === "loading"}
                isoCamera={camera}
                isoTick={isoTick}
                onIsoCamera={() => setIsoTick((value) => value + 1)}
                onResetIso={() => {
                  resetProcessIso(camera.current);
                  setIsoTick((value) => value + 1);
                }}
                onEngage={() => undefined}
                onComplete={() => developDone.current?.()}
              />
            </div>
          </section>

          <section className="process-step process-live process-form" aria-label="Form" data-live={live("form") || undefined}>
            <header className="vertical-process-label">
              <p className="eyebrow">06</p>
              <h2 className="panel-title">Form</h2>
            </header>
            <p className="process-sentence">The processed field produces the final Open morphology.</p>
            <p className="process-cue">{openMesh ? "Open · N24" : "Reading"}</p>
            <div className="process-form-stage" data-cursor="form-view" data-pressed={demo.pressed === "form-view" || undefined}>
              <div className="process-form-layer">
                {openMesh ? (
                  <div className="process-form-reveal">
                    <ProcessMorphology mesh={openMesh} cacheIdentity="vertical-void:form:N24" frame="module" insideBox isoCamera={camera} isoTick={isoTick} />
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="process-down">
          <section className="process-step process-cap" aria-label="Cap" data-live={live("cap") || undefined} data-cursor="cap">
            <header className="vertical-process-label">
              <p className="eyebrow">07</p>
              <h2 className="panel-title">Cap</h2>
            </header>
            <p className="process-sentence">The Open form closes into a continuous mass.</p>
            <div className="process-cap-pair">
              <div className="process-cap-view">
                <div className="process-cap-stage">{openMesh ? <ProcessMorphology mesh={openMesh} cacheIdentity="vertical-void:cap-open:N24" frame="module" isoCamera={capCamera} isoExtent={capExtent} /> : null}</div>
                <p className="process-cap-name">Open</p>
              </div>
              <p className="process-cap-cue" aria-hidden="true">→</p>
              <div className="process-cap-view">
                <div className="process-cap-stage">{cappedMesh ? <ProcessMorphology mesh={cappedMesh} cacheIdentity="vertical-void:capped:N24" frame="module" isoCamera={capCamera} isoExtent={capExtent} accent={closing} /> : null}</div>
                <p className="process-cap-name">Capped</p>
              </div>
            </div>
          </section>

          <section className="process-step process-choose" aria-label="Choose" data-live={live("choose") || undefined}>
            <header className="vertical-process-label">
              <p className="eyebrow">08</p>
              <h2 className="panel-title">Choose</h2>
            </header>
            <p className="process-sentence">One continuation is chosen from the field.</p>
            <div className="process-choose-board">
              <div className="process-choose-field" role="list" aria-label="Stored continuations">
                {GROUPS.map((item) => (
                  <div key={item.focus} className="process-choose-group" data-count={item.count}>
                    {CONTINUATIONS.filter((id) => {
                      const number = branchNumber(id);
                      return number >= item.start && number <= item.end;
                    }).map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="process-choose-mark"
                        data-on={id === chooseId ? "true" : "false"}
                        data-cursor={`mark-${id}`}
                        data-pressed={demo.pressed === `mark-${id}` || undefined}
                        onClick={() => {
                          setChooseId(id);
                          void loadOpen(id).then((mesh) => setChooseMesh(mesh));
                        }}
                      >
                        {id.slice(1)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <figure className="process-choose-preview">
                <div className="process-choose-stage">
                  {(chooseMesh ?? (chooseId === "N24" ? openMesh : null)) ? <ProcessMorphology mesh={(chooseMesh ?? openMesh) as IsoMesh} cacheIdentity={`vertical-void:choose:${chooseId}`} frame="module" /> : null}
                </div>
                <figcaption>
                  <strong>{chooseId}</strong>
                  <span>{group?.focus ?? "Continuation"}</span>
                </figcaption>
              </figure>
            </div>
          </section>

          <section className="process-step process-solidify" aria-label="Solidify and validate" data-live={live("solidify") || undefined} data-cursor="solidify">
            <header className="vertical-process-label">
              <p className="eyebrow">09</p>
              <h2 className="panel-title">Solidify</h2>
            </header>
            <p className="process-sentence">The selected mesh becomes a validated module.</p>
            <div className="process-solid-pair" data-compare={beforeMesh ? "true" : "false"}>
              <div className="process-solid-view">
                <div className="process-solid-stage">{beforeMesh ? <ProcessMorphology mesh={beforeMesh} cacheIdentity="vertical-void:solid-before:N24" frame="module" isoCamera={solidCamera} isoExtent={solidExtent} /> : null}</div>
                <p className="process-cap-name">Before</p>
              </div>
              <p className="process-cap-cue" aria-hidden="true">→</p>
              <div className={`process-solid-view ${styles.solidAfter}`} data-shown={solidShown || undefined}>
                <div className="process-solid-stage">{finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity="vertical-void:solid-after:N24" frame="module" isoCamera={solidCamera} isoExtent={solidExtent} accent={solidAccent} /> : null}</div>
                <p className="process-cap-name">After</p>
              </div>
            </div>
          </section>

          <section className="process-step process-handoff-end" aria-label="Hand off" data-live={live("handoff") || undefined} data-transfer={demo.handoff || undefined} data-cursor="handoff">
            <header className="vertical-process-label">
              <p className="eyebrow">10</p>
              <h2 className="panel-title">Hand off</h2>
            </header>
            <p className="process-sentence">The validated module is ready for the next skill.</p>
            <div className="process-handoff-body">
              <div className="process-final-mesh">
                {finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity="vertical-void:handoff:N24" frame="module" /> : null}
              </div>
            </div>
          </section>
          </div>
        </div>
        </div>
      </div>
      <DemoCursor />
    </div>
  );
}

const VOID_CATALOGUE = {
  archetypeId: ARCHETYPES.vertical_void.id,
  archetypeName: ARCHETYPES.vertical_void.name,
  typologyId: ARCHETYPES.vertical_void.typologyId,
  candidateId: CANDIDATE,
};

export function CatalogDemonstration() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    const live = () => !stop;
    const sleep = (ms: number) => new Promise<void>((resolve) => {
      let elapsed = 0;
      let last = performance.now();
      const frame = (now: number) => {
        if (!live()) {
          resolve();
          return;
        }
        if (store.run) elapsed += Math.min(40, now - last);
        last = now;
        if (elapsed >= ms) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const moduleButton = (id: string) => host.current?.querySelector(`[data-module="${CSS.escape(id)}"]`) ?? null;
    const backButton = () => {
      const buttons = host.current?.querySelectorAll("button") ?? [];
      return [...buttons].find((button) => button.textContent?.trim() === "Back to catalogue") ?? null;
    };
    const glide = async (x: number, y: number, ms: number) => {
      const from = store.cursor;
      const steps = 28;
      for (let index = 1; index <= steps; index += 1) {
        if (!live()) return;
        const amount = index / steps;
        const ease = amount * amount * (3 - 2 * amount);
        patch({ cursor: { x: from.x + (x - from.x) * ease, y: from.y + (y - from.y) * ease, visible: true } });
        await sleep(ms / steps);
      }
    };
    const moveTo = async (el: Element | null) => {
      const root = store.portal;
      if (!root || !(el instanceof HTMLElement)) return;
      const to = pointIn(root, el, "mark");
      await glide(to.x, to.y, 2000);
    };
    const press = async (el: HTMLElement) => {
      patch({ pressed: el.getAttribute("data-module") ?? "back" });
      el.click();
      await sleep(160);
      if (!live()) return;
      patch({ pressed: null });
    };
    const spin = async () => {
      const stage = host.current?.querySelector(".vertical-catalogue-stage");
      const root = store.portal;
      if (!(stage instanceof HTMLElement) || !root) return;
      const box = stage.getBoundingClientRect();
      const frame = root.getBoundingClientRect();
      const scaleX = frame.width === 0 ? 1 : root.offsetWidth / frame.width;
      const scaleY = frame.height === 0 ? 1 : root.offsetHeight / frame.height;
      const originX = box.left + box.width * 0.5;
      const originY = box.top + box.height * 0.46;
      const sweep = Math.min(640, box.width * 0.78);
      const steps = 28;
      const point = (amount: number) => ({
        x: originX - sweep * 0.5 + sweep * amount,
        y: originY - sweep * 0.05 * Math.sin(amount * Math.PI),
      });
      const place = (clientX: number, clientY: number) => {
        patch({
          cursor: {
            x: (clientX - frame.left) * scaleX,
            y: (clientY - frame.top) * scaleY,
            visible: true,
          },
        });
      };
      const pointer = (type: string, clientX: number, clientY: number) => {
        try {
          stage.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pointerId: 1,
            pointerType: "mouse",
          }));
        } catch {
          /* A synthetic pointer cannot be captured. The drag still reaches the catalogue. */
        }
      };
      const start = point(0);
      place(start.x, start.y);
      pointer("pointerdown", start.x, start.y);
      for (let index = 1; index <= steps; index += 1) {
        if (!live()) return;
        const next = point(index / steps);
        pointer("pointermove", next.x, next.y);
        place(next.x, next.y);
        await sleep(160);
      }
      const end = point(1);
      pointer("pointerup", end.x, end.y);
    };
    const run = async () => {
      await sleep(DEMO_TIMING.transitionMs + 80);
      if (!live() || !host.current) return;
      const started = performance.now();
      while (live() && !moduleButton(CATALOG_ORDER[0]) && performance.now() - started < 12000) await sleep(80);
      if (!live() || !host.current) return;
      patch({
        portal: columnsOf(host.current),
        active: "catalog",
        catalogOpen: false,
        catalogId: null,
        n24Final: false,
        pressed: null,
        cursor: { x: 28, y: 36, visible: false },
      });
      for (const id of CATALOG_ORDER) {
        if (!live()) return;
        const target = moduleButton(id);
        if (!(target instanceof HTMLElement)) continue;
        await moveTo(target);
        await press(target);
        await sleep(1500);
        if (!live()) return;
        await spin();
        await sleep(420);
        const opened = performance.now();
        while (live() && !backButton() && performance.now() - opened < 2000) await sleep(80);
        const back = backButton();
        if (!(back instanceof HTMLElement)) continue;
        await moveTo(back);
        await press(back);
        await sleep(1600);
      }
    };
    void run();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div ref={host} className={styles.catalogField} data-demo-catalog="">
      <Suspense fallback={null}>
        <VerticalCatalogue initial={null} candidate={VOID_CATALOGUE} requestedArchetypeId={ARCHETYPE} embedded />
      </Suspense>
      <DemoCursor />
    </div>
  );
}
