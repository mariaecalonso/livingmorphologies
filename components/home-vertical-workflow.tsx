"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import handoff from "@/data/skill3/final-selection.json";
import { ContinueFamilyFan } from "@/components/continue-family-fan";
import { InheritFamilySummary } from "@/components/inherit-criteria-profile";
import { ProcessStartField } from "@/components/process-start-field";
import { type DevelopPlate } from "@/components/process-develop-view";
import { ProcessGeneration } from "@/components/process-generation-view";
import { FinalMorphologyCatalogue, type FinalArchiveHandoff } from "@/components/final-morphology-catalogue";
import { CatalogueField, type CatalogueModule } from "@/components/vertical-catalogue-scene";
import "./final-catalogue-frame.css";
import { ProcessMorphology, SampleDecisionStack, type SampleFrame } from "@/components/vertical-process-stage";
import { closeWorkflowPanel, markManualHold, PresentControls, usePresentClock } from "@/components/workflow-present";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import { TYPOLOGIES } from "@/lib/catalog";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { decodeSolidifiedMesh, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";

const ARCHETYPE = "vertical-void";
const CANDIDATE = 351;
const INTENT = architecturalIntentFor(ARCHETYPE);
const SUMMARY_URL = `/demo/skill3/${ARCHETYPE}/${CANDIDATE}-workflow.json`;

const AUTO = new Set(["4", "5"]);
const MANUAL = new Set(["2", "3", "catalog", "skill4"]);
const ASIDE = new Set(["catalog", "skill4"]);
const LAST_FRAME = 5;
const CONTINUATION_IDS = Array.from({ length: 24 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`);
const FINAL_HANDOFF: FinalArchiveHandoff[] = handoff.selections.map((entry) => ({
  archetypeId: entry.archetypeId,
  candidateId: entry.candidateId,
  continuationId: entry.continuationId,
  moduleId: entry.moduleId,
  status: entry.status === "Validated" ? "validated" : "review",
}));

/** Same seven families the Process page uses for N01–N24. Display only. */
const BEHAVIOR_GROUPS: readonly { focus: string; start: number; end: number; count: number }[] = [
  { focus: "Formal", start: 1, end: 3, count: 3 },
  { focus: "Spatial", start: 4, end: 6, count: 3 },
  { focus: "Atmospheric", start: 7, end: 9, count: 3 },
  { focus: "Formal + Spatial", start: 10, end: 12, count: 3 },
  { focus: "Formal + Atmospheric", start: 13, end: 15, count: 3 },
  { focus: "Spatial + Atmospheric", start: 16, end: 18, count: 3 },
  { focus: "Formal + Spatial + Atmospheric", start: 19, end: 24, count: 6 },
];

async function readStoredMesh(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { geometry?: EncodedSolidifiedMesh };
  if (!body.geometry?.positions || !body.geometry.normals || !body.geometry.indices) return null;
  return decodeSolidifiedMesh(body.geometry);
}

type Panel = "continuations" | "geometry" | "selection" | "catalog" | "handoff" | "skill4";

const PANEL_OF: Record<string, Panel> = {
  "2": "continuations",
  "3": "geometry",
  "4": "selection",
  catalog: "catalog",
  "5": "handoff",
  skill4: "skill4",
};

const PANEL_TITLE: Record<Panel, string> = {
  continuations: "Stack",
  geometry: "Geometry",
  selection: "Selection",
  catalog: "Catalog",
  handoff: "Selected for Hybrid Connection",
  skill4: "Skill 4",
};

type EventRow = { iteration: number; reason: string; delta: number };
type PlateRow = { iteration: number; z: number; src: string };
type ContinuationRow = {
  id: string;
  index: number;
  focus: string | null;
  sampleCount: number;
  eventCount: number;
  z0Iteration: number;
  parentChecksum: string;
  acceptedIterations: number[];
  events: EventRow[];
  plates: PlateRow[];
};
type Summary = {
  origin: string;
  archetypeName: string;
  candidateId: number;
  z0Iteration: number;
  parentChecksum: string;
  selectedContinuationId: string;
  rules: { horizon: number; minGap: number; maxGap: number; deltaThreshold: number; envelope: { sizeX: number; sizeY: number; sizeZ: number } };
  continuations: ContinuationRow[];
};
type SolidEntry = {
  continuationId: string;
  status: "validated" | "review";
  manifold: "PASS" | "FAIL";
  preflight: "PASS" | "FAIL";
  components: number;
  triangles: number;
  z0Iteration: number;
  parentChecksum: string;
};
type Slot = { left: number; top: number; width: number; height: number };
type Layout = { width: number; height: number; slots: Slot[]; under: Slot | null; leaders: { x: number; top: number; bottom: number }[]; drop: { x: number; top: number; bottom: number } | null };

function archetypeName(id: string) {
  for (const typology of TYPOLOGIES) {
    const found = typology.archetypes.find((item) => item.id === id);
    if (found) return found.name;
  }
  return id;
}

export function VerticalWorkflowLayer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [seen, setSeen] = useState(-1);
  const [z0Play, setZ0Play] = useState(0);
  const [stackPlay, setStackPlay] = useState(0);
  const [geometryPlay, setGeometryPlay] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [sequence, setSequence] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [solids, setSolids] = useState<SolidEntry[] | null>(null);
  const [z0Field, setZ0Field] = useState<{ size: number; values: Uint8Array } | null>(null);
  const [sampleFrames, setSampleFrames] = useState<SampleFrame[] | null>(null);
  const [developMeshes, setDevelopMeshes] = useState<Record<number, IsoMesh>>({});
  const [openMesh, setOpenMesh] = useState<IsoMesh | null>(null);
  const boardOf = () => svgRef.current?.parentElement ?? null;
  const closePanel = () => {
    closeWorkflowPanel(boardOf());
    setSequence(false);
    setPanel(null);
  };
  const clock = usePresentClock(Boolean(sequence && panel), closePanel);

  useEffect(() => {
    const board = svgRef.current?.parentElement;
    if (!board) return;
    const tracked = () => [...board.querySelectorAll<HTMLElement>(".wf-frame[data-frame]")].filter((node) => !ASIDE.has(node.dataset.frame ?? ""));
    let signature = "";
    const measure = () => {
      signature = boardLayoutSignature(board, tracked());
      const width = board.clientWidth;
      const height = board.clientHeight;
      const box = board.getBoundingClientRect();
      if (width < 2 || height < 2 || box.width < 2) return;
      const scale = box.width / width;
      const frames = [...tracked()].map((node) => {
        const rect = node.getBoundingClientRect();
        const l = (rect.left - box.left) / scale;
        const t = (rect.top - box.top) / scale;
        const w = rect.width / scale;
        const r = l + w;
        const b = t + rect.height / scale;
        return { l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2, w };
      });
      const ceiling = height * 0.1;
      const gap = height * 0.08;
      const lower: { plate: Slot | null } = { plate: null };
      const slots: Slot[] = frames.map((frame, index) => {
        const room = Math.max(0, frame.t - gap - ceiling);
        if (index === 2) {
          const leader = Math.max(14, height * 0.03);
          const next = frames[3];
          const prev = frames[1];
          const slotHeight = Math.min(frame.w * 1.35, Math.max(0, frame.t - leader - 8));
          const slotWidth = Math.min(frame.w * 0.78, slotHeight * 0.7);
          const minLeft = (prev?.r ?? 8) + 10;
          const maxLeft = (next?.l ?? width) - 10 - slotWidth;
          const left = Math.min(Math.max(frame.cx - slotWidth / 2, minLeft), Math.max(minLeft, maxLeft));
          return { left, top: frame.t - leader - slotHeight, width: slotWidth, height: slotHeight };
        }
        if (index === 3) {
          const leader = Math.max(14, height * 0.03);
          const next = frames[4];
          const size = Math.min(frame.w * 0.46, Math.max(0, frame.t - leader - 8));
          const slotWidth = size * 2.15;
          const maxLeft = (next?.l ?? width) - 10 - slotWidth;
          const left = Math.min(Math.max(8, frame.cx - slotWidth / 2), Math.max(8, maxLeft));
          return { left, top: frame.t - leader - size, width: slotWidth, height: size };
        }
        if (index === 4) {
          const leader = Math.max(14, height * 0.03);
          const next = frames[5];
          const prev = frames[3];
          const slotHeight = Math.min(frame.w * 0.62, Math.max(0, frame.t - leader - 8));
          const slotWidth = Math.min(frame.w * 1.45, slotHeight * 1.85);
          const minLeft = (prev?.r ?? 8) + 12;
          const maxLeft = (next?.l ?? width) - 12 - slotWidth;
          const left = Math.min(Math.max(frame.cx - slotWidth / 2, minLeft), Math.max(minLeft, maxLeft));
          return { left, top: frame.t - leader - slotHeight, width: slotWidth, height: slotHeight };
        }
        if (index === 5) {
          const leader = Math.max(14, height * 0.03);
          const prev = frames[4];
          const slotHeight = Math.min(frame.w * 0.9, Math.max(0, frame.t - leader - 8));
          const slotWidth = slotHeight;
          const minLeft = (prev?.r ?? 8) + 12;
          const maxLeft = width - 8 - slotWidth;
          const left = Math.min(Math.max(frame.cx - slotWidth / 2, minLeft), Math.max(minLeft, maxLeft));
          return { left, top: frame.t - leader - slotHeight, width: slotWidth, height: slotHeight };
        }
        if (index !== 0 && index !== 1) return { left: frame.l, top: ceiling, width: frame.w, height: Math.min(room, frame.w * 0.5) };
        if (index === 1) {
          const leader = Math.max(12, height * 0.028);
          const full = Math.max(0, frame.t - leader - Math.max(8, height * 0.02));
          const slotWidth = frame.w;
          const slotHeight = Math.min(full, slotWidth / 2.1);
          const left = Math.min(Math.max(8, frame.cx - slotWidth / 2), Math.max(8, width - slotWidth - 8));
          return { left, top: frame.t - leader - slotHeight, width: slotWidth, height: slotHeight };
        }
        const leader = Math.max(8, height * 0.016);
        const next = frames[1];
        const fanWidth = (next?.w ?? frame.w) * 1.22;
        const fanLeft = Math.max(frame.r + 12, next ? next.cx - fanWidth / 2 : width);
        const aboveRoom = Math.max(0, frame.t - leader - height * 0.045);
        const beside = Math.max(0, (fanLeft - 18 - frame.cx) * 2);
        const slotSize = Math.min(frame.w * 0.87, aboveRoom, beside);
        const belowGap = 14;
        const belowTop = frame.b + belowGap;
        const belowWidth = Math.min(frame.w * 1.05, width - 24);
        const belowHeight = Math.min(frame.w * 0.38, Math.max(0, height - belowTop - 8));
        lower.plate = { left: Math.max(10, frame.cx - belowWidth / 2), top: belowTop, width: belowWidth, height: belowHeight };
        return { left: frame.cx - slotSize / 2, top: frame.t - leader - slotSize, width: slotSize, height: slotSize };
      });
      setLayout({
        width,
        height,
        slots,
        under: lower.plate,
        leaders: frames.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slots[index].height, bottom: frame.t })),
        drop: lower.plate ? { x: frames[0].cx, top: frames[0].b, bottom: lower.plate.top } : null,
      });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(board);
    tracked().forEach((node) => resize.observe(node));
    const follow = window.setInterval(() => {
      if (boardLayoutSignature(board, tracked()) !== signature) measure();
    }, 150);
    const read = () => {
      const node = board.querySelector<HTMLElement>(".wf-frame.is-lit[data-frame]");
      const next = node ? Number(node.dataset.frame) : null;
      setLit(Number.isFinite(next) ? next : null);
    };
    const watch = new MutationObserver(read);
    watch.observe(board, { subtree: true, attributes: true, attributeFilter: ["class"] });
    read();
    const openManual = (event: Event) => {
      const node = event.currentTarget as HTMLElement;
      const next = PANEL_OF[node.dataset.frame ?? ""];
      if (!next) return;
      event.stopPropagation();
      setSequence(false);
      markManualHold(board);
      const box = board.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      const scale = box.width / board.clientWidth || 1;
      setOrigin({ x: (rect.left + rect.width / 2 - box.left) / scale, y: (rect.top + rect.height / 2 - box.top) / scale });
      setPanel(next);
    };
    const aside = [...board.querySelectorAll<HTMLElement>(".wf-frame[data-frame]")].filter((node) => ASIDE.has(node.dataset.frame ?? ""));
    const frames = [...tracked(), ...aside];
    frames.forEach((node) => {
      const id = (node as HTMLElement).dataset.frame ?? "";
      if (!MANUAL.has(id)) node.removeAttribute("data-vert-open");
    });
    const openable = frames.filter((node) => {
      const id = (node as HTMLElement).dataset.frame ?? "";
      return AUTO.has(id) || MANUAL.has(id);
    });
    openable.forEach((node) => {
      const id = (node as HTMLElement).dataset.frame ?? "";
      if (AUTO.has(id)) {
        node.setAttribute("data-zoomable", "");
        node.setAttribute("data-auto", "");
      } else node.setAttribute("data-vert-open", "");
      node.addEventListener("click", openManual);
    });
    return () => {
      window.clearInterval(follow);
      resize.disconnect();
      watch.disconnect();
      openable.forEach((node) => node.removeEventListener("click", openManual));
    };
  }, []);

  useEffect(() => {
    const board = svgRef.current?.parentElement;
    if (!board) return;
    const onArrive = (event: Event) => {
      const frame = String((event as CustomEvent<{ frame: string }>).detail.frame);
      const next = PANEL_OF[frame];
      if (!next) return;
      const node = board.querySelector<HTMLElement>(`[data-frame="${frame}"]`);
      if (node) {
        const box = board.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        const scale = box.width / board.clientWidth || 1;
        setOrigin({ x: (rect.left + rect.width / 2 - box.left) / scale, y: (rect.top + rect.height / 2 - box.top) / scale });
      }
      setSequence(true);
      setPanel(next);
    };
    board.addEventListener("wf-frame-arrive", onArrive);
    return () => board.removeEventListener("wf-frame-arrive", onArrive);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePanel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(SUMMARY_URL, { signal: controller.signal })
      .then((response) => response.json())
      .then((body: Summary) => {
        if (body?.continuations?.length === 24 && body.origin === "handoff") {
          setSummary(body);
        }
      })
      .catch(() => undefined);
    fetch(`/api/vertical/solidified?archetype=${ARCHETYPE}&candidate=${CANDIDATE}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((body: { continuations?: SolidEntry[] }) => {
        if (body.continuations?.length) setSolids(body.continuations);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: ARCHETYPE, candidate: String(CANDIDATE) });
    fetch(`/api/vertical/z0/field?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ size?: number; plate?: string }> : null))
      .then((body) => {
        if (controller.signal.aborted || !body?.plate || !body.size) return;
        const values = Uint8Array.from(atob(body.plate), (char) => char.charCodeAt(0));
        if (values.length === body.size * body.size) setZ0Field({ size: body.size, values });
      })
      .catch(() => undefined);
    const replay = new URLSearchParams({ archetype: ARCHETYPE, candidate: String(CANDIDATE), continuation: "N24" });
    fetch(`/api/vertical/process-replay?${replay}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{
        trailSize: number;
        decisions: { iteration: number; reason: SampleFrame["reason"] }[];
        plates: string;
      }> : null))
      .then((body) => {
        if (controller.signal.aborted || !body?.plates || !body.decisions?.length) return;
        const binary = atob(body.plates);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const cell = body.trailSize * body.trailSize;
        setSampleFrames(body.decisions.map((decision, index) => ({
          iteration: decision.iteration,
          trails: bytes.subarray(index * cell, (index + 1) * cell),
          trailSize: body.trailSize,
          peak: 255,
          reason: decision.reason,
        })));
      })
      .catch(() => undefined);
    fetch(`/api/vertical/process-form?${replay}`, { signal: controller.signal, cache: "no-store" })
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
    const meshBase = `/api/vertical/experiments/criteria-hybrid?archetype=${ARCHETYPE}&continuation=N24`;
    readStoredMesh(`${meshBase}&reading=open`, controller.signal).then((mesh) => {
      if (!controller.signal.aborted) setOpenMesh(mesh);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (lit == null) return;
    setSeen((current) => (lit === 0 && current >= LAST_FRAME ? 0 : Math.max(current, lit)));
    if (lit === 0) setZ0Play((count) => count + 1);
    if (lit === 2) setStackPlay((count) => count + 1);
    if (lit === 3) setGeometryPlay((count) => count + 1);
  }, [lit]);

  const publishedId = summary?.selectedContinuationId ?? "N24";
  const publishedGroup = BEHAVIOR_GROUPS.find((group) => {
    const number = Number(publishedId.slice(1));
    return number >= group.start && number <= group.end;
  }) ?? null;
  const retainedPlates = useMemo<DevelopPlate[]>(() => {
    const kept = (sampleFrames ?? []).filter((frame) => frame.reason).sort((a, b) => a.iteration - b.iteration);
    if (kept.length < 2) return [];
    const span = Math.max(1, kept[kept.length - 1].iteration - kept[0].iteration);
    return kept.map((frame) => ({
      iteration: frame.iteration,
      z: (frame.iteration - kept[0].iteration) / span,
      trails: frame.trails,
      trailSize: frame.trailSize,
      peak: frame.peak,
    }));
  }, [sampleFrames]);

  return (
    <>
      <p className="wf-opt-caption wf-opt-note">Example shown: Vertical Void · 351 · published continuation {summary?.selectedContinuationId ?? "N24"}</p>
      <svg ref={svgRef} className="wf-opt-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout
          ? <>
              {layout.leaders.map((leader, index) => (
              <g key={index} className="wf-opt-leader" data-on={index <= seen || undefined}>
                <path d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
                <circle cx={leader.x} cy={leader.bottom} r={2.4} />
              </g>
              ))}
              {layout.drop ? (
                <g className="wf-opt-leader" data-on={seen >= 0 || undefined}>
                  <path d={`M ${layout.drop.x} ${layout.drop.top} L ${layout.drop.x} ${layout.drop.bottom}`} />
                  <circle cx={layout.drop.x} cy={layout.drop.top} r={2.4} />
                </g>
              ) : null}
            </>
          : null}
      </svg>
      {layout
        ? layout.slots.map((slot, index) => (
            <div
              key={index}
              className="wf-opt-visual"
              data-on={index <= seen || undefined}
              data-hot={index === 1 && lit === 1 ? "" : undefined}
              style={{
                left: `${(slot.left / layout.width) * 100}%`,
                top: `${(slot.top / layout.height) * 100}%`,
                width: `${(slot.width / layout.width) * 100}%`,
                height: `${(slot.height / layout.height) * 100}%`,
              }}
            >
              <div key={index === 0 ? z0Play : index === 2 ? stackPlay : index === 3 ? geometryPlay : "stay"} className="wf-opt-visual-play">
                <Preview
                  index={index}
                  summary={summary}
                  solids={solids}
                  z0Field={z0Field}
                  sampleFrames={sampleFrames}
                  retainedPlates={retainedPlates}
                  developMeshes={developMeshes}
                  openMesh={openMesh}
                  publishedId={publishedId}
                  activeFocus={publishedGroup?.focus ?? null}
                />
              </div>
            </div>
          ))
        : null}
      {layout?.under ? (
        <div
          className="wf-opt-visual wf-vert-init-below"
          data-on={seen >= 0 || undefined}
          style={{
            left: `${(layout.under.left / layout.width) * 100}%`,
            top: `${(layout.under.top / layout.height) * 100}%`,
            width: `${(layout.under.width / layout.width) * 100}%`,
            height: `${(layout.under.height / layout.height) * 100}%`,
          }}
        >
          <div className="wf-opt-visual-play">
            <div className="wf-vert-init">
              <div className="process-canvas wf-vert-inherit-chart">
                <InheritFamilySummary profile={INTENT} glow={0.17} initials />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <section
        className="wf-opt-zoom"
        data-open={panel || undefined}
        data-vert-panel={panel ?? undefined}
        data-opt-panel={panel ? "" : undefined}
        aria-hidden={!panel}
        onPointerDown={clock.hold}
        style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
      >
        <p className="wf-opt-trail">
          Vertical Propagation <span aria-hidden="true">›</span> {panel ? PANEL_TITLE[panel] : ""}
        </p>
        <div className="wf-phy-panel wf-vert-sheet">
          {panel === "continuations" ? (
            <div className="wf-vert-stack-frame">
              <SampleStackPlay frames={sampleFrames} columns={0} labelSize={0} fit />
              <ul className="wf-vert-stack-legend" aria-label="Sample marks">
                <li data-reason="threshold">Retained</li>
                <li data-reason="max-gap">Gap</li>
                <li data-reason="skip">Skipped</li>
                <li data-reason="active">Current</li>
              </ul>
            </div>
          ) : null}
          {panel === "geometry" ? (
            <GeometrySequence
              plates={retainedPlates}
              meshes={developMeshes}
              loading={sampleFrames == null}
              openMesh={openMesh}
            />
          ) : null}
          {panel === "selection" ? <SelectionCatalogue solids={solids} publishedId={publishedId} /> : null}
          {panel === "catalog" ? <FullCatalogue /> : null}
          {panel === "skill4" ? (
            <div className="wf-vert-final">
              <Suspense fallback={null}>
                <FinalMorphologyCatalogue fixture={false} handoff={FINAL_HANDOFF} />
              </Suspense>
            </div>
          ) : null}
          {panel === "handoff" ? <RepairSteps /> : null}
        </div>
        <PresentControls run={Boolean(sequence && panel)} clock={clock} onClose={closePanel} open={Boolean(panel)} />
      </section>
    </>
  );
}

function Preview({
  index,
  solids,
  z0Field,
  sampleFrames,
  retainedPlates,
  developMeshes,
  openMesh,
  publishedId,
  activeFocus,
}: {
  index: number;
  summary: Summary | null;
  solids: SolidEntry[] | null;
  z0Field: { size: number; values: Uint8Array } | null;
  sampleFrames: SampleFrame[] | null;
  retainedPlates: DevelopPlate[];
  developMeshes: Record<number, IsoMesh>;
  openMesh: IsoMesh | null;
  publishedId: string;
  activeFocus: string | null;
}) {
  if (index === 0) {
    return (
      <div className="wf-vert-init wf-vert-z0" aria-label="Z0">
        <div className="process-canvas">
          <ProcessStartField plate={z0Field} chrome={false} />
        </div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="wf-vert-continue-frame">
        <div className="process-canvas">
          <ContinueFamilyFan
            groups={BEHAVIOR_GROUPS}
            activeFocus={activeFocus}
            selectedId={publishedId}
            plate={z0Field}
            stance="final"
            compact
          />
        </div>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="wf-vert-stack-thumb">
        <SampleStackPlay frames={sampleFrames} columns={1} labelSize={0} fit simple />
      </div>
    );
  }
  if (index === 3) {
    return (
      <GeometrySequence
        plates={retainedPlates}
        meshes={developMeshes}
        loading={sampleFrames == null}
        openMesh={openMesh}
        compact
      />
    );
  }
  if (index === 4) {
    return (
      <div className="wf-vert-select-thumb">
        <SelectionCatalogue solids={solids} publishedId={publishedId} />
      </div>
    );
  }
  return (
    <div className="wf-vert-chosen">
      <ChosenMorphology />
    </div>
  );
}

function simplifyStack(frames: SampleFrame[]) {
  const kept = frames.filter((frame) => frame.reason);
  if (kept.length >= 2) return kept;
  return frames;
}

function SampleStackPlay({ frames, columns = 4, labelSize = 16, fit = false, simple = false }: { frames: SampleFrame[] | null; columns?: number; labelSize?: number; fit?: boolean; simple?: boolean }) {
  const shown = frames ? (simple ? simplifyStack(frames) : frames) : null;
  const [step, setStep] = useState(0);
  const count = shown?.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    setStep(0);
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      if (current >= count - 1) {
        setStep(count - 1);
        window.clearInterval(timer);
        return;
      }
      setStep(current);
    }, 90);
    return () => window.clearInterval(timer);
  }, [count]);
  if (!shown || shown.length < 2) return null;
  return <SampleDecisionStack frames={shown} playIteration={shown[Math.min(step, shown.length - 1)].iteration} columns={columns} labelSize={labelSize} fit={fit} />;
}

function GeometrySequence({
  plates,
  meshes,
  loading,
  openMesh,
  compact = false,
}: {
  plates: DevelopPlate[];
  meshes: Record<number, IsoMesh>;
  loading: boolean;
  openMesh: IsoMesh | null;
  compact?: boolean;
}) {
  const [formed, setFormed] = useState(false);
  return (
    <div className={compact ? "wf-vert-geometry-thumb" : "wf-vert-geometry-frame"} data-formed={formed || undefined}>
      <div className="wf-vert-geometry-develop" aria-label="Develop">
        <ProcessGeneration
          plates={plates}
          meshes={meshes}
          surface={openMesh}
          surfaceDots
          autoplay
          loading={loading}
          onEngage={() => undefined}
          onComplete={() => setFormed(true)}
        />
      </div>
      <div className="wf-vert-geometry-form" aria-label="Form">
        <div className="process-form-stage">
          <div className="process-form-layer">
            {formed && openMesh ? (
              <div className="process-form-reveal">
                <ProcessMorphology
                  mesh={openMesh}
                  cacheIdentity={`${ARCHETYPE}:form:N24`}
                  frame="module"
                  insideBox={compact}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FullCatalogue() {
  const [typologyId, setTypologyId] = useState("lobby");
  const [archetypeId, setArchetypeId] = useState(ARCHETYPE);
  const typology = TYPOLOGIES.find((item) => item.id === typologyId) ?? TYPOLOGIES[0];
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    fetch(`/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(archetypeId)}&reading=open`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ continuations?: string[] }> : { continuations: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        setIds((body.continuations ?? []).filter((id) => /^N\d{2}$/.test(id) && Number(id.slice(1)) <= 24).sort());
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIds([]);
          setReady(true);
        }
      });
    return () => controller.abort();
  }, [archetypeId]);
  const modules = useMemo<CatalogueModule[]>(() => ids.map((id) => ({
    id,
    label: id,
    cacheIdentity: `hybrid:open:${archetypeId}:${id}`,
    meshUrl: `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(archetypeId)}&continuation=${id}&reading=open`,
  })), [archetypeId, ids]);
  const chosenId = handoff.selections.find((item) => item.archetypeId === archetypeId)?.continuationId ?? null;
  return (
    <div className="wf-vert-fullcat">
      <div className="wf-phy-tabs" role="tablist" aria-label="Typology">
        {TYPOLOGIES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === typology.id}
            onClick={() => {
              setTypologyId(item.id);
              setArchetypeId(item.archetypes[0]?.id ?? ARCHETYPE);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="wf-phy-tabs" role="tablist" aria-label="Archetype">
        {typology.archetypes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === archetypeId}
            onClick={() => setArchetypeId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="wf-vert-catalogue">
        {ready && modules.length > 0 ? (
          <CatalogueField
            key={archetypeId}
            modules={modules}
            origin="catalogue"
            selectedId={null}
            chosenId={chosenId}
            onSelect={() => undefined}
            resetToken={0}
          />
        ) : null}
      </div>
    </div>
  );
}

function SelectionCatalogue({ solids, publishedId }: { solids: SolidEntry[] | null; publishedId: string }) {
  const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(ARCHETYPE)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ continuations?: string[] }> : { continuations: [] }))
      .then((body) => {
        if (!controller.signal.aborted) setExtra(body.continuations ?? []);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const modules = useMemo<CatalogueModule[]>(() => {
    const known = new Map((solids ?? []).map((item) => [item.continuationId, item]));
    const ids = [...new Set([...known.keys(), ...extra])].filter((id) => /^N\d{2}$/.test(id)).sort();
    if (ids.length === 0) {
      return Array.from({ length: 24 }, (_, index) => {
        const id = `N${String(index + 1).padStart(2, "0")}`;
        return { id, label: id, cacheIdentity: `placeholder:${id}`, placeholder: true };
      });
    }
    const checksum = solids?.[0]?.parentChecksum ?? "";
    return ids.map((id) => {
      const entry = known.get(id);
      return {
        id,
        label: id,
        cacheIdentity: `hybrid:open:${ARCHETYPE}:${CANDIDATE}:${id}:${entry?.parentChecksum ?? checksum}`,
        meshUrl: `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(ARCHETYPE)}&continuation=${id}&reading=open`,
      };
    });
  }, [extra, solids]);
  return (
    <div className="wf-vert-catalogue">
      <CatalogueField
        modules={modules}
        origin="handoff"
        selectedId={null}
        chosenId={publishedId}
        onSelect={() => undefined}
        resetToken={0}
      />
    </div>
  );
}

type RepairState = {
  open: IsoMesh | null;
  capped: IsoMesh | null;
  before: IsoMesh | null;
  after: IsoMesh | null;
  checks: { components: number; boundaryEdges: number; nonManifoldEdges: number; manifold: "PASS" | "FAIL" } | null;
};

function useRepair() {
  const [repair, setRepair] = useState<RepairState>({ open: null, capped: null, before: null, after: null, checks: null });
  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(ARCHETYPE)}&continuation=N24`;
    const solid = `/api/vertical/solidified?archetype=${encodeURIComponent(ARCHETYPE)}&candidate=${CANDIDATE}&continuation=N24`;
    Promise.all([
      readStoredMesh(`${base}&reading=open`, controller.signal),
      readStoredMesh(`${base}&reading=capped`, controller.signal),
      fetch(solid, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ checks?: RepairState["checks"]; geometry?: EncodedSolidifiedMesh; original?: EncodedSolidifiedMesh | null }> : null),
    ]).then(([open, capped, body]) => {
      if (controller.signal.aborted) return;
      setRepair({
        open,
        capped,
        before: body?.original?.positions ? decodeSolidifiedMesh(body.original) : null,
        after: body?.geometry?.positions ? decodeSolidifiedMesh(body.geometry) : null,
        checks: body?.checks ?? null,
      });
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return repair;
}

function ChosenMorphology() {
  const repair = useRepair();
  const mesh = repair.after ?? repair.capped ?? repair.open;
  if (!mesh) return null;
  return <ProcessMorphology mesh={mesh} cacheIdentity={`${ARCHETYPE}:chosen:N24`} frame="module" />;
}

function RepairMesh({ mesh, identity }: { mesh: IsoMesh | null; identity: string }) {
  if (!mesh) return null;
  return <ProcessMorphology mesh={mesh} cacheIdentity={identity} frame="module" />;
}

function RepairSteps() {
  const repair = useRepair();
  const mark = (pass: boolean | null) => pass == null ? "pending" : pass ? "pass" : "fail";
  return (
    <div className="wf-vert-repair">
      <div className="process-cap-pair">
        <div className="process-cap-view">
          <div className="process-cap-stage">
            <RepairMesh mesh={repair.open} identity={`${ARCHETYPE}:cap-open:N24`} />
          </div>
          <p className="process-cap-name">Open</p>
        </div>
        <p className="process-cap-cue" aria-hidden="true">→</p>
        <div className="process-cap-view">
          <div className="process-cap-stage">
            <RepairMesh mesh={repair.capped} identity={`${ARCHETYPE}:capped:N24`} />
          </div>
          <p className="process-cap-name">Capped</p>
        </div>
      </div>
      <div className="process-solid-pair" data-compare={repair.before ? "true" : "false"}>
        {repair.before ? (
          <div className="process-solid-view">
            <div className="process-solid-stage">
              <RepairMesh mesh={repair.before} identity={`${ARCHETYPE}:solid-before:N24`} />
            </div>
            <p className="process-solid-name">Before</p>
          </div>
        ) : null}
        {repair.before ? <p className="process-solid-cue" aria-hidden="true">→</p> : null}
        <div className="process-solid-view">
          <div className="process-solid-stage">
            <RepairMesh mesh={repair.after} identity={`${ARCHETYPE}:solid:N24`} />
          </div>
          <p className="process-solid-name">After</p>
        </div>
      </div>
      <ul className="process-solid-marks">
        <li className="process-solid-mark" data-mark={mark(repair.checks ? repair.checks.components === 1 : null)}>One component</li>
        <li className="process-solid-mark" data-mark={mark(repair.checks ? repair.checks.boundaryEdges === 0 : null)}>Watertight</li>
        <li className="process-solid-mark" data-mark={mark(repair.checks ? repair.checks.manifold === "PASS" : null)}>Manifold</li>
      </ul>
    </div>
  );
}
