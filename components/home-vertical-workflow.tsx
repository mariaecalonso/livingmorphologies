"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import handoff from "@/data/skill3/final-selection.json";
import { CatalogueField, type CatalogueModule } from "@/components/vertical-catalogue-scene";
import { closeWorkflowPanel, markManualHold, PresentControls, usePresentClock } from "@/components/workflow-present";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import { TYPOLOGIES } from "@/lib/catalog";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";

const ARCHETYPE = "vertical-void";
const CANDIDATE = 351;
const INTENT = architecturalIntentFor(ARCHETYPE);
const Z0_PLATE = `/demo/skill2/previews/${ARCHETYPE}/${CANDIDATE}.webp`;
const SUMMARY_URL = `/demo/skill3/${ARCHETYPE}/${CANDIDATE}-workflow.json`;

const AUTO = new Set(["4", "5"]);
const MANUAL = new Set(["1", "3"]);
const LAST_FRAME = 5;

type Panel = "continuations" | "geometry" | "selection" | "handoff";

const PANEL_OF: Record<string, Panel> = {
  "1": "continuations",
  "3": "geometry",
  "4": "selection",
  "5": "handoff",
};

const PANEL_TITLE: Record<Panel, string> = {
  continuations: "Continuations",
  geometry: "Geometry",
  selection: "Selection",
  handoff: "Selected for Hybrid Connection",
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
type Layout = { width: number; height: number; slots: Slot[]; leaders: { x: number; top: number; bottom: number }[] };

const FOCUS_LABEL: Record<string, string> = {
  formal: "Formal",
  spatial: "Spatial",
  atmospheric: "Atmospheric",
  "formal+spatial": "Formal + Spatial",
  "formal+atmospheric": "Formal + Atmospheric",
  "spatial+atmospheric": "Spatial + Atmospheric",
  "formal+spatial+atmospheric": "Formal + Spatial + Atmospheric",
};

const TYPOLOGY_LABEL: Record<string, string> = { lobby: "Lobby", workspace: "Workspace", gathering: "Gathering" };

function archetypeName(id: string) {
  for (const typology of TYPOLOGIES) {
    const found = typology.archetypes.find((item) => item.id === id);
    if (found) return found.name;
  }
  return id;
}

function statusLabel(status: "validated" | "review" | undefined) {
  if (status === "validated") return "Validated";
  if (status === "review") return "Review";
  return "Unread";
}

export function VerticalWorkflowLayer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [seen, setSeen] = useState(-1);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [sequence, setSequence] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [solids, setSolids] = useState<SolidEntry[] | null>(null);
  const [focusId, setFocusId] = useState("N24");
  const [meshId, setMeshId] = useState(handoff.selections[0]?.moduleId ?? "");
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
    const tracked = () => board.querySelectorAll(".wf-frame[data-frame]");
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
      const slots = frames.map((frame) => {
        const room = Math.max(0, frame.t - gap - ceiling);
        return { left: frame.l, top: ceiling, width: frame.w, height: Math.min(room, frame.w * 0.5) };
      });
      setLayout({
        width,
        height,
        slots,
        leaders: frames.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slots[index].height, bottom: frame.t })),
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
    const openable = [...tracked()].filter((node) => {
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
      if (!AUTO.has(frame)) return;
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
          setFocusId(body.selectedContinuationId);
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
    if (lit == null) return;
    setSeen((current) => (lit === 0 && current >= LAST_FRAME ? 0 : Math.max(current, lit)));
  }, [lit]);

  const focused = summary?.continuations.find((item) => item.id === focusId) ?? null;
  const published = summary?.continuations.find((item) => item.id === summary.selectedContinuationId) ?? null;
  const solid = solids?.find((item) => item.continuationId === focusId) ?? null;
  const families = useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, number>();
    for (const item of summary?.continuations ?? []) {
      const focus = item.focus ?? "unassigned";
      if (!counts.has(focus)) order.push(focus);
      counts.set(focus, (counts.get(focus) ?? 0) + 1);
    }
    return order.map((focus) => ({ focus, count: counts.get(focus) ?? 0, label: FOCUS_LABEL[focus] ?? focus }));
  }, [summary]);
  const mesh = useMemo<CatalogueModule | null>(() => {
    const entry = handoff.selections.find((item) => item.moduleId === meshId) ?? null;
    if (!entry) return null;
    return {
      id: entry.continuationId,
      label: `${archetypeName(entry.archetypeId)} ${entry.continuationId}`,
      cacheIdentity: entry.moduleId,
      meshUrl: `/api/vertical/solidified?archetype=${encodeURIComponent(entry.archetypeId)}&candidate=${entry.candidateId}&continuation=${entry.continuationId}`,
      status: entry.status === "Validated" ? "ready" : "review",
    };
  }, [meshId]);
  const capMesh = useMemo<CatalogueModule | null>(() => {
    const id = summary?.selectedContinuationId;
    if (!id) return null;
    const entry = solids?.find((item) => item.continuationId === id);
    return {
      id,
      label: id,
      cacheIdentity: `carved-mass:${ARCHETYPE}:${CANDIDATE}:${id}`,
      meshUrl: `/api/vertical/solidified?archetype=${ARCHETYPE}&candidate=${CANDIDATE}&continuation=${id}`,
      status: entry?.status === "validated" ? "ready" : entry?.status === "review" ? "review" : undefined,
    };
  }, [solids, summary]);

  return (
    <>
      <p className="wf-opt-caption wf-opt-note">Example shown: Vertical Void · 351 · published continuation {summary?.selectedContinuationId ?? "N24"}</p>
      <svg ref={svgRef} className="wf-opt-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout
          ? layout.leaders.map((leader, index) => (
              <g key={index} className="wf-opt-leader" data-on={index <= seen || undefined}>
                <path d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
                <circle cx={leader.x} cy={leader.bottom} r={2.4} />
              </g>
            ))
          : null}
      </svg>
      {layout
        ? layout.slots.map((slot, index) => (
            <div
              key={index}
              className="wf-opt-visual"
              data-on={index <= seen || undefined}
              style={{
                left: `${(slot.left / layout.width) * 100}%`,
                top: `${(slot.top / layout.height) * 100}%`,
                width: `${(slot.width / layout.width) * 100}%`,
                height: `${(slot.height / layout.height) * 100}%`,
              }}
            >
              <div className="wf-opt-visual-play">
                <Preview index={index} summary={summary} solids={solids} families={families} />
              </div>
            </div>
          ))
        : null}
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
            <>
              <Families families={families} summary={summary} solids={solids} />
              <Sample summary={summary} row={published} />
            </>
          ) : null}
          {panel === "geometry" ? <Readings summary={summary} row={published} mesh={capMesh} /> : null}
          {panel === "selection" ? (
            <>
              <Choose summary={summary} solids={solids} focusId={focusId} onFocus={setFocusId} />
              <Validate summary={summary} row={focused} solid={solid} />
            </>
          ) : null}
          {panel === "handoff" ? <Handoff meshId={meshId} mesh={mesh} onMesh={setMeshId} /> : null}
        </div>
        <PresentControls run={Boolean(sequence && panel)} clock={clock} onClose={closePanel} open={Boolean(panel)} />
      </section>
    </>
  );
}

function Preview({
  index,
  summary,
  solids,
  families,
}: {
  index: number;
  summary: Summary | null;
  solids: SolidEntry[] | null;
  families: { focus: string; count: number; label: string }[];
}) {
  const published = summary?.continuations.find((item) => item.id === summary.selectedContinuationId) ?? null;
  const plates = (
    <div className="wf-vert-plates">
      {(published?.plates ?? []).map((plate) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={plate.iteration} src={plate.src} alt="" />
      ))}
    </div>
  );
  if (index === 0) {
    return (
      <div className="wf-vert-init">
        <figure className="wf-vert-z0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={Z0_PLATE} alt="Vertical Void 351" />
          <figcaption>{summary ? `Iteration ${summary.z0Iteration}` : "Published Z0"}</figcaption>
        </figure>
        <ul className="wf-vert-inherit">
          {(["formal", "spatial", "atmospheric"] as const).map((family) => (
            <li key={family}>
              <span>{family}</span>
              <b>{INTENT[family].descriptor}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (index === 1) {
    return (
      <>
        <ol className="wf-vert-branches">
          {(families.length ? families : [{ focus: "pending", count: 24, label: "24 branches" }]).map((family) => (
            <li key={family.focus}><i style={{ flexGrow: family.count }} /><span>{family.count}</span></li>
          ))}
        </ol>
        <Timeline summary={summary} row={published} />
      </>
    );
  }
  if (index === 2) {
    const envelope = summary?.rules.envelope;
    return (
      <>
        <p className="wf-vert-cap">{envelope ? `${published?.plates.length ?? 0} plates · envelope ${envelope.sizeX}×${envelope.sizeY}×${envelope.sizeZ}` : "XYT record"}</p>
        {plates}
      </>
    );
  }
  if (index === 3) {
    const entry = solids?.find((item) => item.continuationId === summary?.selectedContinuationId);
    return (
      <div className="wf-vert-pair-inline">
        {plates}
        <span className="wf-vert-dash" />
        <p className="wf-vert-cap">{entry ? `Capped · ${statusLabel(entry.status)}` : "Capped mesh"}</p>
      </div>
    );
  }
  if (index === 4) {
    const entry = solids?.find((item) => item.continuationId === summary?.selectedContinuationId);
    return (
      <>
        <ol className="wf-vert-dots">
          {(summary?.continuations ?? []).map((item) => {
            const status = solids?.find((solidEntry) => solidEntry.continuationId === item.id)?.status;
            return <li key={item.id} data-status={status} data-chosen={item.id === summary?.selectedContinuationId || undefined} />;
          })}
        </ol>
        <ul className="wf-vert-checks">
          <li data-pass={entry?.components === 1 ? "yes" : undefined}>One body</li>
          <li data-pass={entry?.manifold === "PASS" ? "yes" : undefined}>Manifold</li>
          <li data-pass={entry?.preflight === "PASS" ? "yes" : undefined}>Kernel</li>
        </ul>
      </>
    );
  }
  return (
    <ol className="wf-vert-handoff">
      {["lobby", "workspace", "gathering"].map((category) => (
        <li key={category}>
          <strong>{handoff.selections.filter((item) => item.category === category).length}</strong>
          <span>{TYPOLOGY_LABEL[category] ?? category}</span>
        </li>
      ))}
    </ol>
  );
}

function Timeline({ summary, row }: { summary: Summary | null; row: ContinuationRow | null }) {
  if (!summary || !row) return <p className="wf-vert-cap">Sampling record</p>;
  const origin = row.z0Iteration;
  const span = Math.max(1, summary.rules.horizon);
  return (
    <div className="wf-vert-time" aria-hidden="true">
      <i />
      {row.events.map((event) => (
        <span key={event.iteration} data-reason={event.reason} style={{ left: `${((event.iteration - origin) / span) * 100}%` }} />
      ))}
    </div>
  );
}

function Families({
  families,
  summary,
  solids,
}: {
  families: { focus: string; count: number; label: string }[];
  summary: Summary | null;
  solids: SolidEntry[] | null;
}) {
  return (
    <div className="wf-vert-detail">
      <p>{summary ? `${summary.continuations.length} continuations from one verified Z0. Counts follow the continuation recipes.` : "Reading the stored continuation set."}</p>
      <ol className="wf-vert-family-list">
        {families.map((family) => {
          const members = summary?.continuations.filter((item) => item.focus === family.focus) ?? [];
          return (
            <li key={family.focus}>
              <span>{family.label}</span>
              <span>{members[0] ? `${members[0].id}–${members[members.length - 1].id}` : family.count}</span>
              <span>{members.filter((item) => solids?.find((entry) => entry.continuationId === item.id)?.status === "validated").length} validated</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Sample({ summary, row }: { summary: Summary | null; row: ContinuationRow | null }) {
  if (!summary || !row) return <p>Reading the sampling record.</p>;
  const end = row.z0Iteration + summary.rules.horizon;
  return (
    <div className="wf-vert-detail">
      <p>
        {row.id} · horizon {summary.rules.horizon} · minimum gap {summary.rules.minGap} · maximum gap {summary.rules.maxGap} · threshold {summary.rules.deltaThreshold}. {row.sampleCount} plates retained. Intermediate states are skipped.
      </p>
      <ol className="wf-vert-events">
        {row.events.map((event, index) => {
          const next = row.events[index + 1]?.iteration ?? end;
          const skipped = next - event.iteration - 1;
          return (
            <li key={event.iteration} data-reason={event.reason}>
              <span>{event.iteration}</span>
              <span>{event.reason === "z0" ? "Initial state" : event.reason === "threshold" ? "Threshold" : "Maximum interval"}</span>
              <span>{event.reason === "z0" ? "" : `Δ ${event.delta.toFixed(3)}`}</span>
              <span>{skipped > 0 ? `${skipped} skipped` : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Readings({ summary, row, mesh }: { summary: Summary | null; row: ContinuationRow | null; mesh: CatalogueModule | null }) {
  return (
    <div className="wf-vert-pair">
      <figure>
        <figcaption>Open · saddle-shell · {row?.id ?? "pending"}</figcaption>
        <div className="wf-vert-plate-row">
          {(row?.plates ?? []).map((plate) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={plate.iteration} src={plate.src} alt="" />
          ))}
        </div>
        <p>These retained plates are the XYT record. The open reading is that record. An open mesh is not stored in the handoff.</p>
      </figure>
      <figure>
        <figcaption>Capped · carved mass · {row?.id ?? "pending"}</figcaption>
        <div className="wf-vert-mesh">
          {mesh && summary?.origin === "handoff" ? (
            <CatalogueField modules={[mesh]} origin="handoff" selectedId={mesh.id} onSelect={() => undefined} resetToken={0} inspecting />
          ) : (
            <p>Reading the stored mesh.</p>
          )}
        </div>
      </figure>
    </div>
  );
}

function Choose({
  summary,
  solids,
  focusId,
  onFocus,
}: {
  summary: Summary | null;
  solids: SolidEntry[] | null;
  focusId: string;
  onFocus: (id: string) => void;
}) {
  return (
    <div className="wf-vert-detail">
      <p>Readiness is stored as Validated or Review. It does not select the continuation. The published handoff for this archetype is {summary?.selectedContinuationId ?? "pending"}.</p>
      <ol className="wf-vert-choose">
        {(summary?.continuations ?? []).map((item) => {
          const status = solids?.find((entry) => entry.continuationId === item.id)?.status;
          return (
            <li key={item.id}>
              <button type="button" data-status={status} aria-pressed={item.id === focusId} onClick={() => onFocus(item.id)}>
                <span>{item.id}</span>
                <small>{statusLabel(status)}</small>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Validate({ summary, row, solid }: { summary: Summary | null; row: ContinuationRow | null; solid: SolidEntry | null }) {
  if (!row || !solid || !summary) return <p>Reading the stored checks.</p>;
  return (
    <div className="wf-vert-detail">
      <p>
        {row.id} · iteration {solid.z0Iteration} · checksum {solid.parentChecksum}. The stored status is {statusLabel(solid.status)}. These checks freeze the selected carved mass. They do not build another morphology. A volume figure is not in the stored metric.
      </p>
      <ul className="wf-vert-checks wf-vert-checks-full">
        <li data-pass={solid.components === 1 ? "yes" : undefined}>Components {solid.components}</li>
        <li data-pass={solid.manifold === "PASS" ? "yes" : undefined}>Manifold {solid.manifold}</li>
        <li data-pass={solid.preflight === "PASS" ? "yes" : undefined}>Preflight {solid.preflight}</li>
        <li>Triangles {solid.triangles.toLocaleString("en-US")}</li>
      </ul>
    </div>
  );
}

function Handoff({
  meshId,
  mesh,
  onMesh,
}: {
  meshId: string;
  mesh: CatalogueModule | null;
  onMesh: (id: string) => void;
}) {
  const groups = ["lobby", "workspace", "gathering"];
  return (
    <div className="wf-vert-pair">
      <ol className="wf-vert-catalog">
        {groups.map((category) => (
          <li key={category}>
            <p>{TYPOLOGY_LABEL[category] ?? category}</p>
            <div>
              {handoff.selections.filter((item) => item.category === category).map((item) => (
                <button key={item.moduleId} type="button" aria-pressed={item.moduleId === meshId} onClick={() => onMesh(item.moduleId)}>
                  <span>{archetypeName(item.archetypeId)}</span>
                  <small>{item.continuationId} · {item.status}</small>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="wf-vert-mesh">
        {mesh ? (
          <CatalogueField modules={[mesh]} origin="handoff" selectedId={mesh.id} onSelect={() => undefined} resetToken={handoff.selections.findIndex((item) => item.moduleId === meshId)} inspecting />
        ) : null}
      </div>
    </div>
  );
}
