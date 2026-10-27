"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import context from "@/data/skill5/herald-site.json";
import { findArchetype, findTypology, groupsForArchetype, TYPOLOGIES } from "@/lib/catalog";
import { SKILL_WORKFLOW_STEPS } from "@/lib/home-workflow-steps";
import type { TypologyId } from "@/lib/types";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import { closeWorkflowPanel, markManualHold, PresentControls, usePresentClock, useRevealed } from "@/components/workflow-present";
import { CRITERION_TARGETS } from "@/lib/skill1/translate";
import { PROGRAM_LABEL, SITE_ARCHETYPES, SITE_PROGRAMS } from "@/lib/skill5/catalog";
import { SKILL5_MODULE_ENVELOPE_FEET } from "@/lib/skill5/contract";
import { SITE_GRID_FEET } from "@/lib/skill5/grid";

const ARCHETYPE = "vertical-void";
const VOID_GROWTH = [
  "/assets/skill0/void-growth-1.gif?v=7",
  "/assets/skill0/void-growth-2.gif?v=7",
  "/assets/skill0/void-growth-3.gif?v=7",
  "/assets/skill0/void-growth-4.gif?v=7",
];
const EXAMPLE = findArchetype(findTypology("lobby"), ARCHETYPE);
const LEVELS = ["Low", "Medium", "High"] as const;
const TONES = ["#ffffff", "var(--cyan-hot)", "var(--orange-hot)"] as const;
const DOT = 4;
const LOOP_FRAME = 4;

type Plate = { src: string; alt: string };
type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number; w: number };
type Slot = { left: number; top: number; width: number; height: number };
type Layout = {
  width: number;
  height: number;
  loop: string;
  arrow: string;
  leaders: { x: number; top: number; bottom: number }[];
  dots: { x: number; y: number }[];
  label: { x: number; y: number };
  slots: Slot[];
};

const GROUPS = groupsForArchetype("lobby", EXAMPLE, EXAMPLE.ratings);
const PHYSARUM_STEPS = SKILL_WORKFLOW_STEPS["skill-1"];

function PlateShot({ plate }: { plate: Plate }) {
  return (
    <span className="wf-opt-plate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={plate.src} alt={plate.alt} />
    </span>
  );
}

function Tracks({ rows }: { rows: { label: string; value: string; share: number; tone: string }[] }) {
  return (
    <div className="wf-opt-eval">
      <dl>
        {rows.map((row) => (
          <div key={row.label} style={{ "--share": `${Math.round(row.share * 100)}%`, "--tone": row.tone } as CSSProperties}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
            <i />
          </div>
        ))}
      </dl>
    </div>
  );
}

function useSlices() {
  const [preview, setPreview] = useState<string | null>(null);
  const [slices, setSlices] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const previewUrl = `/demo/skill2/previews/${ARCHETYPE}/351.webp`;
    fetch(previewUrl, { signal: controller.signal })
      .then((response) => setPreview(response.ok ? previewUrl : null))
      .catch(() => {});
    fetch(`/demo/skill2/propagation/${ARCHETYPE}/351.json`, { signal: controller.signal })
      .then((response) => response.json())
      .then((body: { ready?: boolean; slices?: string[] }) => {
        if (body.ready && body.slices?.length) setSlices(body.slices);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return { preview, slices };
}

function useBoardLayout(loop: boolean) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  useEffect(() => {
    const board = document.querySelector<HTMLElement>(".wf-board[data-layered]");
    if (!board) return;
    const tracked = () => board.querySelectorAll(".wf-frame[data-frame], [data-route-end]");
    let signature = "";
    const measure = () => {
      signature = boardLayoutSignature(board, tracked());
      const width = board.clientWidth;
      const height = board.clientHeight;
      const box = board.getBoundingClientRect();
      if (width < 2 || height < 2 || box.width < 2) return;
      const scale = box.width / width;
      const local = (node: Element): Box => {
        const rect = node.getBoundingClientRect();
        const l = (rect.left - box.left) / scale;
        const t = (rect.top - box.top) / scale;
        const w = rect.width / scale;
        const r = l + w;
        const b = t + rect.height / scale;
        return { l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2, w };
      };
      const frames = [...board.querySelectorAll(".wf-frame[data-frame]")].map(local);
      const catalogue = board.querySelector("[data-route-end]");
      const stops = catalogue ? [...frames, local(catalogue)] : frames;
      const ceiling = height * 0.1;
      const gap = height * 0.08;
      const slots = stops.map((frame) => {
        const room = Math.max(0, frame.t - gap - ceiling);
        return { left: frame.l, top: ceiling, width: frame.w, height: Math.min(room, frame.w * 0.5) };
      });
      const frame = frames[LOOP_FRAME];
      let path = "";
      let arrow = "";
      let dots: Layout["dots"] = [];
      let label = { x: width / 2, y: height * 0.82 };
      if (loop && frame) {
        const y = frame.b + height * 0.16;
        const left = frame.cx - frame.w * 0.28;
        const right = frame.cx + frame.w * 0.28;
        const head = height * 0.012;
        path = `M ${right} ${frame.b} L ${right} ${y} L ${left} ${y} L ${left} ${frame.b}`;
        arrow = `M ${left - head} ${frame.b + head * 1.4} L ${left} ${frame.b} L ${left + head} ${frame.b + head * 1.4}`;
        dots = [{ x: right, y: frame.b }, { x: right, y }, { x: left, y }];
        label = { x: frame.cx, y: y + height * 0.07 };
      }
      setLayout({
        width,
        height,
        loop: path,
        arrow,
        leaders: stops.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slots[index].height, bottom: frame.t })),
        dots,
        label,
        slots,
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
      const node = board.querySelector<HTMLElement>(".wf-frame.is-lit[data-frame], [data-route-end].is-lit");
      const next = !node ? null : node.hasAttribute("data-route-end") ? board.querySelectorAll(".wf-frame[data-frame]").length : Number(node.dataset.frame);
      setLit(next);
    };
    const watch = new MutationObserver(read);
    watch.observe(board, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      window.clearInterval(follow);
      resize.disconnect();
      watch.disconnect();
    };
  }, [loop]);
  return { layout, lit };
}

function Chrome({
  note,
  visuals,
  catalogue,
  cycle,
}: {
  note: string;
  visuals: (ReactNode | null)[];
  catalogue?: { title: string; body?: string; plates: Plate[] };
  cycle?: string;
}) {
  const { layout, lit } = useBoardLayout(Boolean(cycle));
  return (
    <>
      <p className="wf-opt-caption wf-opt-note">{note}</p>
      <svg className="wf-opt-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout ? (
          <>
            {cycle ? <path className="wf-opt-loop" d={layout.loop} /> : null}
            {cycle ? <path className="wf-opt-arrow" d={layout.arrow} /> : null}
            {layout.leaders.map((leader, index) => (
              <g key={index} className="wf-opt-leader" data-on={lit === index || undefined}>
                <path d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
                <circle cx={leader.x} cy={leader.bottom} r={DOT * 0.6} />
              </g>
            ))}
            {layout.dots.map((dot, index) => (
              <circle key={index} className="wf-opt-loop-dot" cx={dot.x} cy={dot.y} r={DOT * 0.6} />
            ))}
          </>
        ) : null}
      </svg>
      {layout && cycle ? (
        <p
          className="wf-opt-cycle"
          style={{ left: `${(layout.label.x / layout.width) * 100}%`, top: `${(layout.label.y / layout.height) * 100}%` }}
        >
          <span className="wf-frame-body">{cycle}</span>
        </p>
      ) : null}
      {layout
        ? layout.slots.slice(0, visuals.length).map((slot, index) => (
            <div
              key={index}
              className="wf-opt-visual"
              data-on={lit === index || undefined}
              style={{
                left: `${(slot.left / layout.width) * 100}%`,
                top: `${(slot.top / layout.height) * 100}%`,
                width: `${(slot.width / layout.width) * 100}%`,
                height: `${(slot.height / layout.height) * 100}%`,
              }}
            >
              <div className="wf-opt-visual-play">{visuals[index]}</div>
            </div>
          ))
        : null}
      {catalogue ? (
        <div className="wf-opt-results" data-route-end="" data-frame="catalogue">
          <p className="wf-proto-label">{catalogue.title}</p>
          {catalogue.body ? <p className="wf-frame-body">{catalogue.body}</p> : null}
          <div className="wf-opt-plates">
            {catalogue.plates.map((plate, index) => (
              <PlateShot key={`${plate.src}-${index}`} plate={plate} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

type PhysarumPanel = "input" | "generating" | "catalog" | "translation";

function useCatalogImages(id: string, enabled: boolean) {
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "pending">("idle");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/demo/skill1/${id}/entries.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((entries: { image?: string }[]) => {
        const next = entries.map((entry) => entry.image).filter((src): src is string => Boolean(src));
        setImages(next);
        setStatus(next.length ? "ready" : "pending");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setImages([]);
        setStatus("pending");
      });
    return () => controller.abort();
  }, [enabled, id]);
  return { images, status };
}

const RULE_NOTES = ["Criteria → Growth Instinct", "Descriptors → Spatial Recipe"] as const;

type RuleMap = {
  width: number;
  height: number;
  note: string;
  dots: { x: number; y: number }[];
  label: { x: number; y: number };
};

function useRuleLinks() {
  const [map, setMap] = useState<RuleMap | null>(null);
  useEffect(() => {
    const board = document.querySelector<HTMLElement>('.wf-board[data-stage="skill-1"]');
    if (!board) return;
    let signature = "";
    const measure = () => {
      const box = board.getBoundingClientRect();
      const scale = box.width / board.clientWidth || 1;
      const hosts = [0, 1].map((index) => board.querySelector(`.wf-frame[data-frame="${index}"]`));
      const placed = hosts.map((node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const x = (rect.left + rect.width / 2 - box.left) / scale;
        const bottom = (rect.bottom - box.top) / scale;
        return { x, bottom };
      });
      const input = placed[0];
      const rules = placed[1];
      const y = input && rules ? Math.max(input.bottom, rules.bottom) + board.clientHeight * 0.17 : 0;
      const note = input && rules
        ? `M ${input.x.toFixed(1)} ${input.bottom.toFixed(1)} L ${input.x.toFixed(1)} ${y.toFixed(1)} L ${rules.x.toFixed(1)} ${y.toFixed(1)} L ${rules.x.toFixed(1)} ${rules.bottom.toFixed(1)}`
        : "";
      const dots = input && rules
        ? [
            { x: input.x, y: input.bottom },
            { x: input.x, y },
            { x: rules.x, y },
            { x: rules.x, y: rules.bottom },
          ]
        : [];
      const label = input && rules ? { x: (input.x + rules.x) / 2, y } : { x: 0, y: 0 };
      const key = note;
      if (key === signature) return;
      signature = key;
      setMap({ width: board.clientWidth, height: board.clientHeight, note, dots, label });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(board);
    [0, 1].forEach((index) => {
      const node = board.querySelector(`.wf-frame[data-frame="${index}"]`);
      if (node) resize.observe(node);
    });
    return () => resize.disconnect();
  }, []);
  return map;
}

function InputCue() {
  const formal = GROUPS.find((group) => group.id === "formal") ?? GROUPS[0];
  return (
    <div className="wf-phy-input" aria-label="Formal criteria and descriptor for Vertical Void">
      <p className="wf-opt-caption">Formal</p>
      <Tracks
        rows={formal.criteria.map((item) => ({
          label: item.label,
          value: LEVELS[item.rating],
          share: (item.rating + 1) / 3,
          tone: TONES[0],
        }))}
      />
      <p className="wf-opt-caption">{formal.descriptor}</p>
    </div>
  );
}

function RulesCue() {
  return (
    <div className="wf-phy-map" aria-label="Criteria become growth instinct. Descriptors become the spatial recipe.">
      <p><span>Criteria</span><i aria-hidden="true" /><span>Growth Instinct</span></p>
      <p><span>Descriptors</span><i aria-hidden="true" /><span>Spatial Recipe</span></p>
    </div>
  );
}

function TranslationCue() {
  return (
    <div className="wf-phy-field" aria-hidden="true">
      <span className="is-source" />
      <span className="is-reach" />
      <span className="is-attractor" />
    </div>
  );
}

const INSTRUCTION: Record<string, string> = {
  complexity: "How much the field varies",
  proportionality: "How the field is scaled",
  centrality: "Where the attractor sits",
  "plate-articulation": "How repeated units shift",
  "circulation-integration": "How movement writes a trail",
  openness: "How freely movement crosses the field",
  connectivity: "How strongly areas link",
  directionality: "Whether movement prefers a direction",
  modularity: "How often a node repeats",
  "spatial-permanence": "How long a trail remains",
  immersive: "How strongly the attractor pulls",
  visibility: "How far the attractor reaches",
  receptivity: "How easily movement leaves the source",
  collaboration: "How strongly agents affect one another",
  "social-proximity": "How closely agents gather",
};

function TranslationMap() {
  return (
    <div className="wf-phy-void" aria-label="How Vertical Void ratings become field instructions">
      <p className="wf-opt-caption">Criteria set the strength. Descriptors place the field.</p>
      <div className="wf-phy-void-row">
        {GROUPS.map((group) => (
          <div key={group.id} className="wf-phy-void-group">
            <p className="wf-opt-caption">{group.title}</p>
            <p className="wf-phy-void-descriptor">{group.descriptor}</p>
            <ul className="wf-phy-instruct">
              {group.criteria.map((item) => {
                const instruction = CRITERION_TARGETS[item.id] ? INSTRUCTION[item.id] : undefined;
                if (!instruction) return null;
                return (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <span>{LEVELS[item.rating]}</span>
                    <span>{instruction}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoidCategories() {
  return (
    <div className="wf-phy-void" aria-label="Vertical Void categories and descriptors">
      <p className="wf-opt-caption">Vertical Void</p>
      <div className="wf-phy-void-row">
        {GROUPS.map((group, index) => (
          <div key={group.id} className="wf-phy-void-group">
            <p className="wf-opt-caption">{group.title}</p>
            <span className="wf-phy-void-link" aria-hidden="true" />
            <p className="wf-phy-void-descriptor" style={{ color: TONES[index] }}>{group.descriptor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PhysarumWorkflowLayer(_props?: { cycle?: string }) {
  const { layout, lit } = useBoardLayout(false);
  const revealed = useRevealed(lit);
  const rules = useRuleLinks();
  const preview = useCatalogImages(ARCHETYPE, true);
  const panelRef = useRef<HTMLElement>(null);
  const [panel, setPanel] = useState<PhysarumPanel | null>(null);
  const [sequence, setSequence] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const closePanel = () => {
    closeWorkflowPanel(panelRef.current?.closest<HTMLElement>(".wf-board") ?? null);
    setSequence(false);
    setPanel(null);
  };
  const panelClock = usePresentClock(Boolean(sequence && panel), closePanel);
  const [catalogTypologyId, setCatalogTypologyId] = useState<TypologyId>("lobby");
  const [archetypeId, setArchetypeId] = useState(ARCHETYPE);
  const catalog = useCatalogImages(archetypeId, panel === "catalog");
  const plate = preview.images[0];
  const steps = PHYSARUM_STEPS;
  const placeOrigin = (node: HTMLElement) => {
    const board = node.closest<HTMLElement>(".wf-board");
    if (!board) return;
    const box = board.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const scale = box.width / board.clientWidth || 1;
    setOrigin({
      x: (rect.left + rect.width / 2 - box.left) / scale,
      y: (rect.top + rect.height / 2 - box.top) / scale,
    });
  };
  const openPanel = (next: PhysarumPanel, node: HTMLElement) => {
    setSequence(false);
    const board = node.closest<HTMLElement>(".wf-board");
    if (board) markManualHold(board);
    placeOrigin(node);
    setPanel(next);
  };
  useEffect(() => {
    const board = panelRef.current?.closest<HTMLElement>(".wf-board");
    if (!board) return;
    const onArrive = (event: Event) => {
      const frame = String((event as CustomEvent<{ frame: string }>).detail.frame);
      const next: PhysarumPanel | null = frame === "0" ? "input" : frame === "2" ? "translation" : frame === "3" ? "generating" : frame === "catalogue" ? "catalog" : null;
      if (!next) return;
      const node = board.querySelector<HTMLElement>(`[data-frame="${frame}"]`);
      if (node) placeOrigin(node);
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
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);
  const places = [
    { left: "9%", top: "57%" },
    { left: "30.3%", top: "49%" },
    { left: "51.7%", top: "59%" },
    { left: "73%", top: "50%" },
  ];
  const visuals = [
    <InputCue key="input" />,
    <RulesCue key="rules" />,
    <TranslationCue key="translation" />,
    plate ? <PlateShot key="generating" plate={{ src: plate, alt: `${EXAMPLE.name}` }} /> : <p key="generating" className="wf-opt-caption">Iteration sequence pending</p>,
    plate ? (
      <div key="catalog" className="wf-opt-lineage">
        <figure>
          <PlateShot plate={{ src: plate, alt: EXAMPLE.name }} />
          <figcaption>{EXAMPLE.name}</figcaption>
        </figure>
      </div>
    ) : (
      <p key="catalog" className="wf-opt-caption">Catalog pending</p>
    ),
  ];
  return (
    <>
      <p className="wf-opt-caption wf-opt-note">{`Example shown: ${EXAMPLE.name}`}</p>
      {steps.slice(0, 4).map((step, index) => (
        <span
          key={step.title}
          className="wf-frame is-detail"
          data-frame={String(index)}
          data-tone="teal"
          data-zoomable={index === 0 || index === 2 || index === 3 ? "" : undefined}
          style={places[index]}
          onClick={index === 0 || index === 2 || index === 3 ? (event) => openPanel(index === 0 ? "input" : index === 2 ? "translation" : "generating", event.currentTarget) : undefined}
        >
          <p className="wf-proto-label">{step.title}</p>
          {index === 0 ? (
            <div className="wf-phy-stack">
              <div className="wf-phy-cell" data-cell="criteria"><p className="wf-proto-label">Criteria</p></div>
              <span className="wf-phy-arrow" aria-hidden="true" />
              <div className="wf-phy-cell" data-cell="descriptor"><p className="wf-proto-label">Descriptor</p></div>
            </div>
          ) : null}
          {index === 1 ? (
            <div className="wf-phy-stack">
              <div className="wf-phy-cell" data-cell="instinct"><p className="wf-proto-label">Growth Instinct</p></div>
              <div className="wf-phy-cell" data-cell="recipe"><p className="wf-proto-label">Spatial Recipe</p></div>
            </div>
          ) : null}
          {index === 2 ? <p className="wf-frame-body">Ratings set the strength. Descriptors place the field.</p> : null}
          {index === 3 ? <p className="wf-frame-body">{step.body}</p> : null}
        </span>
      ))}
      <div
        className="wf-opt-results"
        data-route-end=""
        data-frame="catalogue"
        data-zoomable=""
        onClick={(event) => openPanel("catalog", event.currentTarget)}
      >
        <p className="wf-proto-label">Catalog</p>
        {preview.status === "ready" ? (
          <div className="wf-opt-plates">
            {preview.images.slice(0, 9).map((src) => (
              <PlateShot key={src} plate={{ src, alt: EXAMPLE.name }} />
            ))}
          </div>
        ) : (
          <p className="wf-frame-body">Catalog pending</p>
        )}
      </div>
      <svg className="wf-opt-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {rules?.note ? <path className="wf-opt-loop" d={rules.note} /> : null}
        {rules?.dots.map((dot) => (
          <circle key={`${dot.x}-${dot.y}`} className="wf-opt-loop-dot" cx={dot.x} cy={dot.y} r={DOT * 0.6} />
        ))}
        {layout
          ? layout.leaders.map((leader, index) => (
              <g key={index} className="wf-opt-leader" data-on={revealed >= index || undefined}>
                <path d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
                <circle cx={leader.x} cy={leader.bottom} r={DOT * 0.6} />
              </g>
            ))
          : null}
      </svg>
      {layout
        ? layout.slots.slice(0, visuals.length).map((slot, index) => (
            <div
              key={index}
              className="wf-opt-visual"
              data-on={revealed >= index || undefined}
              style={{
                left: `${(slot.left / layout.width) * 100}%`,
                top: `${(slot.top / layout.height) * 100}%`,
                width: `${(slot.width / layout.width) * 100}%`,
                height: `${(slot.height / layout.height) * 100}%`,
              }}
            >
              <div className="wf-opt-visual-play">{visuals[index]}</div>
            </div>
          ))
        : null}
      {rules?.note ? (
        <div
          className="wf-opt-cycle wf-phy-relations"
          style={{ left: `${(rules.label.x / rules.width) * 100}%`, top: `${(rules.label.y / rules.height) * 100}%` }}
        >
          {RULE_NOTES.map((note) => (
            <span key={note} className="wf-frame-body">{note}</span>
          ))}
        </div>
      ) : null}
      <section
        ref={panelRef}
        className="wf-opt-zoom"
        data-open={panel || undefined}
        data-phy-panel={panel ?? undefined}
        aria-hidden={!panel}
        onPointerDown={panelClock.hold}
        style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
      >
        <p className="wf-opt-trail">
          Physarum Logic <span aria-hidden="true">›</span>{" "}
          {panel === "input" ? "Architecture Input" : panel === "translation" ? "Translation" : panel === "generating" ? "Rule-Based Generation" : "Catalog"}
          {panel === "catalog" ? (
            <a className="wf-phy-lab" href="/lab/physarum/catalog">Open Physarum Logic Catalog</a>
          ) : null}
        </p>
        <div className="wf-phy-panel">
          {panel === "input" ? <VoidCategories /> : null}
          {panel === "translation" ? <TranslationMap /> : null}
          {panel === "generating" ? (
            <div className="wf-phy-growth">
              {VOID_GROWTH.map((src) => (
                <img key={src} src={src} alt="" />
              ))}
            </div>
          ) : null}
          {panel === "catalog" ? (
            <>
              <div className="wf-phy-tabs">
                {TYPOLOGIES.map((typology) => (
                  <button
                    key={typology.id}
                    type="button"
                    aria-pressed={typology.id === catalogTypologyId}
                    onClick={() => {
                      setCatalogTypologyId(typology.id);
                      setArchetypeId(typology.archetypes[0]?.id ?? ARCHETYPE);
                    }}
                  >
                    {typology.label}
                  </button>
                ))}
              </div>
              <div className="wf-phy-tabs">
                {findTypology(catalogTypologyId).archetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    type="button"
                    className={archetype.id === ARCHETYPE ? "is-void" : undefined}
                    aria-pressed={archetype.id === archetypeId}
                    onClick={() => setArchetypeId(archetype.id)}
                  >
                    {archetype.name}
                  </button>
                ))}
              </div>
              <div className="wf-phy-fit">
                <div className="wf-phy-fit-size">
                  {catalog.status === "ready" ? (
                    <div
                      className="wf-phy-sheet"
                      style={{
                      "--rows": 4,
                      "--cols": Math.ceil(catalog.images.length / 4),
                      gridTemplateColumns: `repeat(${Math.ceil(catalog.images.length / 4)}, minmax(0, 1fr))`,
                    } as CSSProperties}
                    >
                      {catalog.images.map((src) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={src} src={src} alt="" decoding="async" />
                      ))}
                    </div>
                  ) : (
                    <p className="wf-frame-body">
                      {catalog.status === "pending" ? "Catalog plates for this archetype are pending." : "Loading saved plates."}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
        <PresentControls run={Boolean(sequence && panel)} clock={panelClock} onClose={closePanel} open={Boolean(panel)} />
      </section>
    </>
  );
}

export function HybridWorkflowLayer() {
  const { slices } = useSlices();
  const pair = [slices[0], slices[slices.length - 1]].filter((item): item is string => Boolean(item));
  const tiles = pair.map((src, index) => ({ src, alt: `${EXAMPLE.name} tile ${index + 1}` }));
  return (
    <Chrome
      note={`Example shown: ${EXAMPLE.name}`}
      visuals={[
        <div key="tiles" className="wf-opt-seeds">
          {tiles.map((item) => (
            <PlateShot key={item.alt} plate={item} />
          ))}
        </div>,
        <div key="matrix" className="wf-opt-matrix" aria-hidden="true">
          {Array.from({ length: 25 }, (_, index) => (
            <span key={index} />
          ))}
        </div>,
        <div key="between" className="wf-opt-join">
          {tiles[0] ? <PlateShot plate={tiles[0]} /> : null}
          <span />
          {tiles[1] ? <PlateShot plate={tiles[1]} /> : null}
        </div>,
        <div key="joined" className="wf-opt-seeds">
          {tiles.map((item) => (
            <PlateShot key={`joined-${item.alt}`} plate={item} />
          ))}
        </div>,
      ]}
    />
  );
}

export function SiteWorkflowLayer() {
  const site = context.site;
  const span = Math.max(site.widthFeet, site.depthFeet);
  const total = Math.max(1, SITE_ARCHETYPES.length);
  return (
    <Chrome
      note="Example shown: One Herald Plaza"
      visuals={[
        <Tracks
          key="site"
          rows={[
            { label: "East–west", value: `${site.widthFeet.toLocaleString("en-US")} ft`, share: site.widthFeet / span, tone: TONES[0] },
            { label: "North–south", value: `${site.depthFeet.toLocaleString("en-US")} ft`, share: site.depthFeet / span, tone: TONES[1] },
          ]}
        />,
        <Tracks
          key="library"
          rows={SITE_PROGRAMS.map((program, index) => {
            const count = SITE_ARCHETYPES.filter((entry) => entry.program === program).length;
            return { label: PROGRAM_LABEL[program], value: String(count), share: count / total, tone: TONES[index] ?? TONES[0] };
          })}
        />,
        <Tracks
          key="grid"
          rows={[
            { label: "Grid", value: `${SITE_GRID_FEET} ft`, share: SITE_GRID_FEET / SKILL5_MODULE_ENVELOPE_FEET, tone: TONES[0] },
            { label: "Envelope", value: `${SKILL5_MODULE_ENVELOPE_FEET} ft`, share: 1, tone: TONES[1] },
          ]}
        />,
        <Tracks
          key="composition"
          rows={[
            { label: "Modules", value: String(total), share: 1, tone: TONES[0] },
            { label: "Saved", value: "Not saved", share: 0, tone: TONES[2] },
          ]}
        />,
      ]}
    />
  );
}

export { VerticalWorkflowLayer } from "@/components/home-vertical-workflow";
