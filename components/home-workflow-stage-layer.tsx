"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { findArchetype, findTypology, groupsForArchetype, TYPOLOGIES } from "@/lib/catalog";
import { SKILL_WORKFLOW_STEPS } from "@/lib/home-workflow-steps";
import type { TypologyId } from "@/lib/types";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import { HYBRID_EXAMPLE_ID, HybridDiagram, useHybridExample } from "@/components/home-hybrid-example";
import { HYBRID_LAB_FRAMES, HybridLabPanel, HybridPresentation, SelectedGeometries, warmHybridPresentation } from "@/components/home-hybrid-lab-frames";
import { closeWorkflowPanel, markManualHold, PresentControls, usePresentClock, useRevealed } from "@/components/workflow-present";
import { CRITERION_TARGETS } from "@/lib/skill1/translate";

const ARCHETYPE = "vertical-void";
/** Six saved Vertical Void runs, chosen because their plates read differently: open crescent, wide bowl, closed ring, ring with a separate island, solid mass, radial field. */
const VOID_ITERATIONS = [
  "/demo/skill1/vertical-void/vertical-void-360802-1790449934138-4.webp",
  "/demo/skill1/vertical-void/vertical-void-264709-1790449934138-7.webp",
  "/demo/skill1/vertical-void/vertical-void-53992-1790449934138-38.webp",
  "/demo/skill1/vertical-void/vertical-void-95095-1790449934138-29.webp",
  "/demo/skill1/vertical-void/vertical-void-863512-1790449934138-54.webp",
  "/demo/skill1/vertical-void/vertical-void-1031240-1790449934138-70.webp",
];
const VOID_MOTION = [
  "/assets/skill0/void-panel-1.gif",
  "/assets/skill0/void-panel-2.gif",
  "/assets/skill0/void-panel-3.gif",
  "/assets/skill0/void-panel-4.gif",
  "/assets/skill0/void-panel-5.gif",
  "/assets/skill0/void-panel-6.gif",
];
const CATALOG_ROWS = 4;
const CATALOG_COLS = 20;
const CATALOG_SHOWN = CATALOG_ROWS * CATALOG_COLS;
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

type PhysarumPanel = "generating" | "catalog" | "translation";

function catalogSelection(images: string[]) {
  if (images.length <= CATALOG_SHOWN) return images;
  const step = images.length / CATALOG_SHOWN;
  return Array.from({ length: CATALOG_SHOWN }, (_, index) => images[Math.min(images.length - 1, Math.floor(index * step))]);
}

function VoidIterations() {
  return (
    <div className="wf-phy-iterations">
      {VOID_ITERATIONS.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" decoding="async" />
      ))}
    </div>
  );
}

/** Shrink a plate so its drawing occupies the same inner area, without enlarging a sparser one. */
function contentScale(img: HTMLImageElement) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth || !img.naturalHeight) return 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  const ratio = img.naturalWidth / img.naturalHeight;
  const dw = ratio > 1 ? size : size * ratio;
  const dh = ratio > 1 ? size / ratio : size;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  const data = ctx.getImageData(0, 0, size, size).data;
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      if (data[index] + data[index + 1] + data[index + 2] <= 40) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return 1;
  const fill = Math.max(maxX - minX + 1, maxY - minY + 1) / size;
  return Math.min(1, 0.78 / fill);
}

function FitPlate({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  return (
    <span className="wf-opt-plate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} decoding="async" style={{ transform: `scale(${scale})` }} onLoad={(event) => setScale(contentScale(event.currentTarget))} />
    </span>
  );
}

function GrowthFrames() {
  const [play, setPlay] = useState(0);
  useEffect(() => {
    let live = true;
    const stamp = Date.now();
    Promise.all(
      VOID_MOTION.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = `${src}?play=${stamp}`;
          }),
      ),
    ).then(() => {
      if (live) setPlay(stamp);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!play) return null;
  return (
    <div className="wf-phy-iterations" data-motion="">
      {VOID_MOTION.map((src) => (
        <span key={src} className="wf-opt-plate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${src}?play=${play}`} alt="" />
        </span>
      ))}
    </div>
  );
}

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
    <div className="wf-phy-input" aria-label="Formal ratings lead to Dynamic Core">
      <Tracks
        rows={formal.criteria.map((item) => ({
          label: item.label,
          value: LEVELS[item.rating],
          share: (item.rating + 1) / 3,
          tone: TONES[0],
        }))}
      />
      <div className="wf-phy-lead" aria-hidden="true">
        <i />
        <p>{formal.descriptor}</p>
      </div>
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

function meterShare(rating: number) {
  if (rating >= 2) return 1;
  if (rating === 1) return 0.5;
  return 0.18;
}

const FIELD_READING: Record<string, { together: string; marks: { caption: string; kind: string }[] }> = {
  formal: {
    together: "One ring. Variation, size, and center act together.",
    marks: [
      { caption: "Ring varies", kind: "vary" },
      { caption: "Ring scale", kind: "scale" },
      { caption: "Attractor center", kind: "center" },
    ],
  },
  spatial: {
    together: "Movement can cross, areas join, and the turn toward the attractor stays mild.",
    marks: [
      { caption: "Crosses freely", kind: "cross" },
      { caption: "Areas join", kind: "join" },
      { caption: "Toward the attractor", kind: "favor" },
    ],
  },
  atmospheric: {
    together: "Pull and reach are one band. Medium adds no extra release from the source.",
    marks: [
      { caption: "Pull strengthens", kind: "pull" },
      { caption: "Pull widens", kind: "reach" },
      { caption: "No extra release", kind: "leave" },
    ],
  },
};

function FieldMark({ kind }: { kind: string }) {
  const frame = <rect className="frame" x="3" y="3" width="74" height="58" rx="6" />;
  if (kind === "vary") {
    return <svg viewBox="0 0 80 64" aria-hidden="true">{frame}<ellipse className="ink wf-phy-mark-vary" cx="40" cy="30" rx="16" ry="11" /></svg>;
  }
  if (kind === "scale") {
    return <svg viewBox="0 0 80 64" aria-hidden="true">{frame}<circle className="ink wf-phy-mark-scale" cx="40" cy="30" r="16" /></svg>;
  }
  if (kind === "center") {
    return (
      <svg viewBox="0 0 80 64" aria-hidden="true">
        {frame}
        <circle className="ink" cx="40" cy="30" r="12" strokeOpacity="0.35" />
        <circle className="source" cx="16" cy="46" r="2.4" />
        <circle className="core wf-phy-mark-sit" cx="40" cy="30" r="3.2" />
      </svg>
    );
  }
  if (kind === "cross") {
    return (
      <svg viewBox="0 0 80 64" aria-hidden="true">
        {frame}
        <path className="ink wf-phy-mark-cross" d="M10 22 H70" />
        <path className="ink wf-phy-mark-cross is-soft" d="M12 34 H68" />
        <path className="ink wf-phy-mark-cross is-soft" d="M14 46 H66" />
      </svg>
    );
  }
  if (kind === "join") {
    return (
      <svg viewBox="0 0 80 64" aria-hidden="true">
        {frame}
        <circle className="core" cx="18" cy="40" r="2.4" />
        <circle className="core" cx="40" cy="28" r="2.4" />
        <circle className="core" cx="62" cy="42" r="2.4" />
        <path className="ink wf-phy-mark-join" d="M20 39 L38 29" />
        <path className="ink wf-phy-mark-join" d="M42 29 L60 41" />
      </svg>
    );
  }
  if (kind === "favor") {
    return (
      <svg viewBox="0 0 80 64" aria-hidden="true">
        {frame}
        <circle className="ink" cx="40" cy="26" r="5" strokeOpacity="0.45" />
        <circle className="source" cx="16" cy="48" r="2.4" />
        <path className="ink wf-phy-mark-favor" d="M18 46 C 28 44, 30 40, 36 32" />
      </svg>
    );
  }
  if (kind === "pull") {
    return (
      <svg viewBox="0 0 80 64" aria-hidden="true">
        {frame}
        <circle className="ink wf-phy-mark-pull" cx="40" cy="30" r="14" />
        <circle className="core" cx="40" cy="30" r="3" />
      </svg>
    );
  }
  if (kind === "reach") {
    return (
      <svg viewBox="0 0 80 64" aria-hidden="true">
        {frame}
        <circle className="ink wf-phy-mark-reach" cx="40" cy="30" r="14" />
        <circle className="core" cx="40" cy="30" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 64" aria-hidden="true">
      {frame}
      <circle className="ink" cx="40" cy="28" r="8" strokeOpacity="0.35" />
      <circle className="source" cx="16" cy="46" r="2.4" />
      <circle className="source wf-phy-mark-leave" cx="16" cy="46" r="2" />
    </svg>
  );
}

function TranslationMap() {
  return (
    <div className="wf-phy-void" aria-label="How Vertical Void ratings become field instructions">
      <div className="wf-phy-fields">
        {GROUPS.map((group) => {
          const reading = FIELD_READING[group.id];
          return (
            <section key={group.id} className="wf-phy-field-col" data-branch={group.id}>
              <p className="wf-opt-caption">{group.title}</p>
              <p className="wf-phy-void-descriptor">{group.descriptor}</p>
              <ul className="wf-phy-meters">
                {group.criteria.map((item) => {
                  if (!CRITERION_TARGETS[item.id] || !INSTRUCTION[item.id]) return null;
                  return (
                    <li key={item.id} style={{ "--share": `${Math.round(meterShare(item.rating) * 100)}%` } as CSSProperties}>
                      <span>{item.label}</span>
                      <i aria-hidden="true" />
                      <span>{LEVELS[item.rating]}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="wf-phy-marks">
                {reading.marks.map((mark) => (
                  <figure key={mark.kind}>
                    <FieldMark kind={mark.kind} />
                    <figcaption>{mark.caption}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="wf-phy-together">{reading.together}</p>
            </section>
          );
        })}
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
      const next: PhysarumPanel | null = frame === "2" ? "translation" : frame === "3" ? "generating" : frame === "catalogue" ? "catalog" : null;
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
    <VoidIterations key="generating" />,
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
          data-zoomable={index === 2 || index === 3 ? "" : undefined}
          style={places[index]}
          onClick={index === 2 || index === 3 ? (event) => openPanel(index === 2 ? "translation" : "generating", event.currentTarget) : undefined}
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
          {panel === "translation" ? "Translation" : panel === "generating" ? "Rule-Based Generation" : "Catalog"}
          {panel === "catalog" ? (
            <a className="wf-phy-lab" href="/lab/physarum/catalog">Open Physarum Logic Catalog</a>
          ) : null}
        </p>
        <div className="wf-phy-panel">
          {panel === "translation" ? <TranslationMap /> : null}
          {panel === "generating" ? <GrowthFrames /> : null}
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
                    <div className="wf-opt-cat-sheet" style={{ "--rows": CATALOG_ROWS, "--cols": CATALOG_COLS } as CSSProperties}>
                      {catalogSelection(catalog.images).map((src) => (
                        <FitPlate key={src} src={src} alt="" />
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

type HybridPanel = "parents" | "sections" | "frames" | "descendant" | "assembly";

const HYBRID_PANELS: Record<string, { id: HybridPanel; title: string }> = {
  "1": { id: "parents", title: "Select Parent Geometries + Connection Faces" },
  "2": { id: "sections", title: "Extract Sectional Information" },
  "3": { id: "frames", title: "Generate Hybrid Possibilities" },
  "4": { id: "descendant", title: "Select + Develop a Hybrid Descendant" },
  "5": { id: "assembly", title: "Negotiate + Integrate the Hybrid Connection" },
};

export function HybridWorkflowLayer() {
  const { layout, lit } = useBoardLayout(false);
  const revealed = useRevealed(lit);
  const { example, status } = useHybridExample();
  const panelRef = useRef<HTMLElement>(null);
  const [panel, setPanel] = useState<HybridPanel | null>(null);
  const [sequence, setSequence] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const waiting = useRef<{ id: HybridPanel; sequenced: boolean } | null>(null);
  const preparedRef = useRef(false);
  preparedRef.current = prepared;
  const closePanel = () => {
    closeWorkflowPanel(panelRef.current?.closest<HTMLElement>(".wf-board") ?? null);
    setSequence(false);
    setPanel(null);
  };
  const clock = usePresentClock(Boolean(sequence && panel && prepared), closePanel);
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
  useEffect(() => {
    warmHybridPresentation();
  }, []);
  useEffect(() => {
    if (!prepared || !waiting.current) return;
    setSequence(waiting.current.sequenced);
    setPanel(waiting.current.id);
    waiting.current = null;
  }, [prepared]);
  const openFrame = (id: HybridPanel, sequenced: boolean, node: HTMLElement) => {
    placeOrigin(node);
    if (!preparedRef.current) {
      waiting.current = { id, sequenced };
      setSequence(sequenced);
      return;
    }
    setSequence(sequenced);
    setPanel(id);
  };
  const openFrameRef = useRef(openFrame);
  openFrameRef.current = openFrame;
  useEffect(() => {
    const board = document.querySelector<HTMLElement>('.wf-board[data-stage="recombination"]');
    if (!board) return;
    const listeners = [...board.querySelectorAll<HTMLElement>(".wf-frame[data-frame]")].flatMap((node) => {
      const spec = HYBRID_PANELS[node.dataset.frame ?? ""];
      if (!spec) return [];
      node.setAttribute("data-zoomable", "");
      node.removeAttribute("data-zoom-manual");
      const onClick = () => {
        setSequence(false);
        markManualHold(board);
        openFrameRef.current(spec.id, false, node);
      };
      node.addEventListener("click", onClick);
      return [{ node, onClick }];
    });
    const onArrive = (event: Event) => {
      const frame = String((event as CustomEvent<{ frame: string }>).detail.frame);
      const spec = HYBRID_PANELS[frame];
      if (!spec) return;
      const node = board.querySelector<HTMLElement>(`.wf-frame[data-frame="${frame}"]`);
      if (node) openFrameRef.current(spec.id, true, node);
      else {
        setSequence(true);
        setPanel(spec.id);
      }
    };
    board.addEventListener("wf-frame-arrive", onArrive);
    return () => {
      board.removeEventListener("wf-frame-arrive", onArrive);
      listeners.forEach(({ node, onClick }) => node.removeEventListener("click", onClick));
    };
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
  const open = Object.values(HYBRID_PANELS).find((item) => item.id === panel) ?? null;
  return (
    <HybridPresentation onReady={() => setPrepared(true)}>
      <p className="wf-site-note">Example shown: {HYBRID_EXAMPLE_ID}</p>
      {layout ? layout.slots.map((slot, index) => {
        const spec = HYBRID_PANELS[String(index)];
        return (
        <div
          key={index}
          className="wf-opt-visual"
          data-on={index === 0 || revealed >= index || undefined}
          style={{
            left: `${(slot.left / layout.width) * 100}%`,
            top: `${(slot.top / layout.height) * 100}%`,
            width: `${(slot.width / layout.width) * 100}%`,
            height: `${(slot.height / layout.height) * 100}%`,
          }}
        >
          <div className="wf-opt-visual-play">
            {index === 0 ? (
              <SelectedGeometries compact />
            ) : example && spec ? (
              <HybridDiagram example={example} kind={spec.id} compact />
            ) : (
              <p className="wf-frame-body">{status}</p>
            )}
          </div>
        </div>
        );
      }) : null}
      {layout ? (
        <svg className="wf-site-links" viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
          {layout.leaders.map((leader, index) => (
            <path key={index} className="wf-opt-leader" data-on={revealed >= index || undefined} d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
          ))}
        </svg>
      ) : null}
      <section
        ref={panelRef}
        className="wf-opt-zoom"
        data-open={panel || undefined}
        data-hyb-panel={panel ?? undefined}
        aria-hidden={!panel}
        onPointerDown={clock.hold}
        style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
      >
        <p className="wf-opt-trail">
          Hybrid Connection <span aria-hidden="true">›</span> {open?.title}
        </p>
        <div className="wf-phy-panel">
          {open ? <HybridLabPanel frame={HYBRID_LAB_FRAMES[open.id]} /> : <p className="wf-frame-body">{status}</p>}
        </div>
        <PresentControls run={Boolean(sequence && panel && prepared)} clock={clock} onClose={closePanel} open={Boolean(panel)} />
      </section>
    </HybridPresentation>
  );
}

export { VerticalWorkflowLayer } from "@/components/home-vertical-workflow";
