"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import { crowdingDistances, nondominatedSort, type Rankable } from "@/lib/skill2/nsga";

/** The board follows the human pick of one archetype through the real Skill 2 catalog. */
const ARCHETYPE = "vertical-void";
const ARCHETYPE_NAME = "Vertical Void";
/** Next Generation returns to Objective Evaluation. */
const LOOP_FROM = 4;
const LOOP_TO = 1;
/** Non Dominated Sorting opens its own board. */
const ZOOM_STEP = 2;
/** The catalogue is the stop after the five step frames. */
const CATALOGUE_STEP = 5;
const GRID_PLATES = 9;
const DOT = 4;

type Candidate = {
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  pareto: boolean;
  diversity: string;
  image: string | null;
  parentId: number | null;
  catalogVisible?: boolean;
};

type Pick = { archetypeId: string; candidateId: number };

type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number; w: number };
type Point = { x: number; y: number };
type Slot = { left: number; top: number; width: number; height: number };
type Layout = {
  width: number;
  height: number;
  loop: string;
  arrow: string;
  leaders: { x: number; top: number; bottom: number }[];
  dots: Point[];
  label: Point;
  slots: Slot[];
  zoomOrigin: Point;
};

const OBJECTIVES = [
  { key: "formal", label: "Formal", color: "#ffffff" },
  { key: "spatial", label: "Spatial", color: "var(--cyan-hot)" },
  { key: "atmospheric", label: "Atmospheric", color: "var(--orange-hot)" },
] as const;

const SORT_STEPS = [
  {
    title: "Score Every Candidate",
    body: "Each archived candidate is placed by its Formal and Spatial scores. Dot size shows Atmospheric.",
  },
  {
    title: "Front 1",
    body: "A candidate is non-dominated when no other candidate scores at least as well on all three objectives and better on one.",
  },
  {
    title: "Peel and Repeat",
    body: "Front 1 is set aside and the sort repeats on the rest, giving front 2, then front 3, until every candidate has a rank.",
  },
  {
    title: "Spread Within a Front",
    body: "Crowding distance measures how isolated each candidate is. Boundary candidates and wide gaps are kept first, so the front stays diverse.",
  },
] as const;

const SORT_MODES = ["all", "front", "fronts", "crowding"] as const;

const GENERATION_NOTES = [
  "The seed population from the Physarum Logic Catalogue is evaluated and sorted for the first time.",
  "Selected candidates generate the next population. Candidate 174, the parent of the pick, appears here.",
  "The cycle repeats on the new population, and the front moves toward stronger tradeoffs.",
  "The last pass. The front is at its widest, and candidate 351, the human pick, comes from it.",
] as const;

function useOptimizationData() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/demo/skill2/catalog.json", { signal: controller.signal }).then((response) => response.json()),
      fetch("/demo/skill2/picks.json", { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([catalog, picks]: [{ archetypes: { archetypeId: string; candidates: Candidate[] }[] }, Pick[]]) => {
        setCandidates(catalog.archetypes.find((item) => item.archetypeId === ARCHETYPE)?.candidates ?? []);
        setPick(picks.find((item) => item.archetypeId === ARCHETYPE)?.candidateId ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return useMemo(() => {
    const byId = new Map(candidates.map((item) => [item.id, item]));
    const subject = pick != null ? byId.get(pick) ?? null : null;
    const parent = subject?.parentId != null ? byId.get(subject.parentId) ?? null : null;
    const pictured = candidates.filter((item) => item.image);
    const seeds = pictured.filter((item) => item.generation === 1).slice(0, 6);
    const lastGeneration = subject?.generation ?? Math.max(0, ...candidates.map((item) => item.generation));
    const final = pictured.filter((item) => item.generation === lastGeneration);
    const front = final.filter((item) => item.pareto).slice(0, 4);
    const rescued = final.filter((item) => item.diversity === "rescue").slice(0, 4);
    const visible = pictured.filter((item) => item.catalogVisible !== false && item.id !== subject?.id).sort((a, b) => b.generation - a.generation);
    const grid = subject?.image ? [subject, ...visible.slice(0, GRID_PLATES - 1)] : visible.slice(0, GRID_PLATES);
    const items: Rankable[] = candidates.map((item) => ({
      feasible: true,
      objectives: { formal: item.formal, spatial: item.spatial, atmospheric: item.atmospheric },
    }));
    const fronts = items.length > 0 ? nondominatedSort(items) : [];
    const rank = new Map<number, number>();
    fronts.forEach((members, index) => members.forEach((member) => rank.set(member, index + 1)));
    const crowding = fronts[0] ? crowdingDistances(items, fronts[0]) : new Map<number, number>();
    const lineage = [subject, parent].filter((item): item is Candidate => Boolean(item?.image));
    const generations = [1, 2, 3, 4].map((generation) => {
      const members = candidates.filter((item) => item.generation === generation);
      const plates = pictured.filter((item) => item.generation === generation && (item.pareto || lineage.includes(item)));
      const mean = (key: "formal" | "spatial" | "atmospheric") => members.reduce((sum, item) => sum + item[key], 0) / Math.max(1, members.length);
      return { generation, members, plates, scores: { formal: mean("formal"), spatial: mean("spatial"), atmospheric: mean("atmospheric") } };
    });
    const shown = new Set(generations.flatMap((item) => item.plates.map((plate) => plate.id)));
    const links = generations
      .flatMap((item) => item.plates)
      .filter((item) => item.parentId != null && shown.has(item.parentId))
      .map((item) => ({ from: item.parentId as number, to: item.id, lit: item.id === subject?.id }));
    return { candidates, subject, parent, seeds, front, rescued, grid, fronts, rank, crowding, generations, links };
  }, [candidates, pick]);
}

type Data = ReturnType<typeof useOptimizationData>;

function Plate({ candidate, chosen, index = 0, dashed }: { candidate: Candidate; chosen?: boolean; index?: number; dashed?: boolean }) {
  const classes = ["wf-opt-plate", chosen ? "frame-primary" : "", dashed ? "is-rescued" : ""].filter(Boolean).join(" ");
  return (
    <span className={classes} data-candidate={candidate.id} style={{ "--i": index } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={candidate.image ?? ""} alt={`${ARCHETYPE_NAME} ${candidate.id}`} />
    </span>
  );
}

type Key = { label: string; tone: string; r?: number; boundary?: boolean };

function cloudKey(data: Data, mode: "front" | "all" | "fronts" | "crowding"): Key[] {
  const total = data.candidates.length;
  const first = data.fronts[0]?.length ?? 0;
  if (mode === "all") return [{ label: `${total} candidates`, tone: "rest", r: 1.1 }, { label: "Larger = more Atmospheric", tone: "rest", r: 1.8 }];
  if (mode === "front") return [{ label: `Front 1 · ${first}`, tone: "front" }, { label: `Dominated · ${total - first}`, tone: "rest" }];
  if (mode === "fronts") return [{ label: "Front 1", tone: "f1" }, { label: "Front 2", tone: "f2" }, { label: "Front 3", tone: "f3" }, { label: "Later", tone: "rest" }];
  return [{ label: "Edge, always kept", tone: "front", boundary: true }, { label: "Larger = more space", tone: "front", r: 1.8 }];
}

function Cloud({ data, mode, legend }: { data: Data; mode: "front" | "all" | "fronts" | "crowding"; legend?: boolean }) {
  const max = Math.max(1, ...[...data.crowding.values()].filter(Number.isFinite));
  let keyX = 10;
  const keys = legend
    ? cloudKey(data, mode).map((item) => {
        const x = keyX;
        keyX += 6 + item.label.length * 2.25;
        return { ...item, x };
      })
    : [];
  const subjectIndex = data.candidates.findIndex((item) => item.id === data.subject?.id);
  const span = (key: "formal" | "spatial") => {
    const values = data.candidates.map((item) => item[key]);
    const low = Math.min(...values);
    const range = Math.max(...values) - low || 1;
    return (value: number) => (value - low) / range;
  };
  const fx = span("formal");
  const fy = span("spatial");
  return (
    <svg className="wf-opt-cloud" viewBox={legend ? "0 -6 100 78" : "0 0 100 72"} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="wf-opt-axis" d="M 6 4 L 6 66 L 98 66" />
      {legend ? <path className="wf-opt-axis" d="M 4.6 6 L 6 4 L 7.4 6 M 96 64.6 L 98 66 L 96 67.4" /> : null}
      <text x="98" y="71" textAnchor="end">Formal</text>
      <text x="4.5" y="35" textAnchor="middle" transform="rotate(-90 4.5 35)">Spatial</text>
      {keys.map((item) => (
        <g key={item.label} className="wf-opt-cloud-key">
          <circle cx={item.x + 1.6} cy={-3} r={item.r ?? 1.2} data-tone={item.tone} data-boundary={item.boundary ? "" : undefined} />
          <text x={item.x + 4.2} y={-1.9}>{item.label}</text>
        </g>
      ))}
      {data.candidates.map((item, index) => {
        const rank = data.rank.get(index) ?? 0;
        const crowd = data.crowding.get(index);
        const subject = item.id === data.subject?.id;
        let tone = "rest";
        if (mode === "front" && item.pareto) tone = "front";
        if (mode === "fronts") tone = rank <= 3 ? `f${rank}` : "rest";
        if ((mode === "crowding" || mode === "all") && rank === 1) tone = mode === "all" ? "rest" : "front";
        const r = mode === "crowding" && rank === 1
          ? 0.9 + 2.2 * (crowd == null || !Number.isFinite(crowd) ? 1 : crowd / max)
          : 0.7 + 1.4 * item.atmospheric;
        return (
          <circle
            key={item.id}
            cx={10 + fx(item.formal) * 84}
            cy={62 - fy(item.spatial) * 54}
            r={r}
            data-tone={subject && mode !== "all" ? "subject" : tone}
            data-boundary={mode === "crowding" && rank === 1 && crowd != null && !Number.isFinite(crowd) ? "" : undefined}
            style={{ "--i": index % 24 } as CSSProperties}
          />
        );
      })}
      {legend && mode !== "all" && subjectIndex >= 0 ? (
        <text
          className="wf-opt-cloud-pick"
          x={10 + fx(data.candidates[subjectIndex].formal) * 84 + 3}
          y={62 - fy(data.candidates[subjectIndex].spatial) * 54 + 1.2}
        >
          {data.subject?.id}
        </text>
      ) : null}
    </svg>
  );
}

function StepVisual({ step, data }: { step: number; data: Data }) {
  if (step === 0) {
    return (
      <div className="wf-opt-seeds">
        {data.seeds.map((item, index) => <Plate key={item.id} candidate={item} index={index} />)}
        <p className="wf-opt-caption">Generation 1 · {ARCHETYPE_NAME}</p>
      </div>
    );
  }
  if (step === 1 && data.subject) {
    const subject = data.subject;
    return (
      <div className="wf-opt-eval">
        <Plate candidate={subject} />
        <dl>
          {OBJECTIVES.map((objective, index) => (
            <div key={objective.key} style={{ "--i": index, "--share": `${subject[objective.key] * 100}%`, "--tone": objective.color } as CSSProperties}>
              <dt>{objective.label}</dt>
              <dd>{Math.round(subject[objective.key] * 100)}%</dd>
              <i />
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="wf-opt-sort">
        <Cloud data={data} mode="front" />
        <p className="wf-opt-caption">Front 1 · {data.fronts[0]?.length ?? 0} of {data.candidates.length}</p>
      </div>
    );
  }
  if (step === 3) {
    return (
      <div className="wf-opt-diversity">
        <p className="wf-opt-caption">Pareto front</p>
        <div>{data.front.map((item, index) => <Plate key={item.id} candidate={item} index={index} chosen={item.id === data.subject?.id} />)}</div>
        <p className="wf-opt-caption">Kept for diversity</p>
        <div>{data.rescued.map((item, index) => <Plate key={item.id} candidate={item} index={index + 4} dashed />)}</div>
      </div>
    );
  }
  if (step === 5 && data.subject?.image) {
    return (
      <div className="wf-opt-lineage">
        <figure>
          <Plate candidate={data.subject} chosen />
          <figcaption>Selected for propagation</figcaption>
        </figure>
      </div>
    );
  }
  if (step === 4 && data.subject) {
    return (
      <div className="wf-opt-lineage">
        {data.parent?.image ? (
          <figure>
            <Plate candidate={data.parent} />
            <figcaption>G{data.parent.generation} · {data.parent.id}</figcaption>
          </figure>
        ) : null}
        {data.parent?.image ? <span className="wf-opt-lineage-arrow" aria-hidden="true" /> : null}
        <figure>
          <Plate candidate={data.subject} index={1} />
          <figcaption>G{data.subject.generation} · {data.subject.id}</figcaption>
        </figure>
      </div>
    );
  }
  return null;
}

function GenerationVisual({ data, generation }: { data: Data; generation: number }) {
  const entry = data.generations[generation - 1];
  if (!entry) return null;
  const lineage = new Set([data.subject?.id, data.parent?.id]);
  return (
    <div className="wf-opt-gen">
      <div className="wf-opt-gen-plates">
        {entry.plates.map((item, index) => (
          <Plate key={item.id} candidate={item} index={index} chosen={lineage.has(item.id)} />
        ))}
      </div>
      <dl className="wf-opt-gen-score">
        {OBJECTIVES.map((objective) => (
          <div key={objective.key} style={{ "--share": `${entry.scores[objective.key] * 100}%`, "--tone": objective.color } as CSSProperties}>
            <dt>{objective.label}</dt>
            <i />
            <dd>{Math.round(entry.scores[objective.key] * 100)}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type Link = { from: number; to: number; lit: boolean };

function LineageLinks({ links, open, host }: { links: Link[]; open: boolean; host: HTMLElement | null }) {
  const [paths, setPaths] = useState<{ d: string; lit: boolean; x1: number; x2: number }[]>([]);
  useEffect(() => {
    if (!open || !host) return;
    const measure = () => {
      const box = host.getBoundingClientRect();
      const scale = box.width / Math.max(1, host.offsetWidth);
      const at = (id: number) => host.querySelector(`[data-candidate="${id}"]`)?.getBoundingClientRect() ?? null;
      setPaths(
        links.flatMap((link) => {
          const a = at(link.from);
          const b = at(link.to);
          if (!a || !b) return [];
          const x1 = (a.right - box.left) / scale;
          const y1 = (a.top + a.height / 2 - box.top) / scale;
          const x2 = (b.left - box.left) / scale;
          const y2 = (b.top + b.height / 2 - box.top) / scale;
          const bend = (x2 - x1) * 0.5;
          return [{ d: `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`, lit: link.lit, x1, x2 }];
        }).sort((a, b) => Number(a.lit) - Number(b.lit)),
      );
    };
    measure();
    const settle = window.setTimeout(measure, 1500);
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    return () => {
      window.clearTimeout(settle);
      resize.disconnect();
    };
  }, [links, open, host]);
  return (
    <svg className="wf-opt-lineage-links" aria-hidden="true">
      {paths.map((path, index) =>
        path.lit ? (
          <g key={index}>
            <defs>
              <linearGradient id={`wf-opt-lineage-lit-${index}`} gradientUnits="userSpaceOnUse" x1={path.x1} y1={0} x2={path.x2} y2={0}>
                <stop offset="0" stopColor="#49d7de" />
                <stop offset="0.34" stopColor="#9af6f8" />
                <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.92" />
                <stop offset="0.76" stopColor="#f0b08a" />
                <stop offset="1" stopColor="#c77e5f" />
              </linearGradient>
            </defs>
            <path d={path.d} data-lit="" style={{ stroke: `url(#wf-opt-lineage-lit-${index})` }} />
          </g>
        ) : (
          <path key={index} d={path.d} />
        ),
      )}
    </svg>
  );
}

type ZoomStep = { title: string; body: string; visual: ReactNode };

function ZoomBoard({ title, count, steps, open, origin, onClose, links }: { title: string; count: string; steps: ZoomStep[]; open: boolean; origin: Point | null; onClose: () => void; links?: Link[] }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <section
      ref={setHost}
      className="wf-opt-zoom"
      data-open={open || undefined}
      aria-hidden={!open}
      style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
    >
      <p className="wf-opt-trail">
        Optimization <span aria-hidden="true">›</span> {title}
        <span className="wf-opt-trail-count">{count}</span>
      </p>
      <ol className="wf-opt-zoom-steps">
        {steps.map((step) => (
          <li key={step.title} className="wf-opt-zoom-step">
            <div className="wf-opt-zoom-visual">{open ? step.visual : null}</div>
            <p className="wf-proto-label">{step.title}</p>
            <p className="wf-frame-body">{step.body}</p>
          </li>
        ))}
      </ol>
      {links ? <LineageLinks links={links} open={open} host={host} /> : null}
      <button type="button" className="wf-board-exit wf-opt-back" onClick={onClose} tabIndex={open ? 0 : -1}>
        <span aria-hidden="true">←</span> Back to Optimization
      </button>
    </section>
  );
}

export function OptimizationWorkflowLayer({ cycle }: { cycle: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const litRef = useRef<number | null>(null);
  const [plays, setPlays] = useState<number[]>(() => [0, 0, 0, 0, 0, 0]);
  const [zoomed, setZoomed] = useState<"sorting" | "generations" | null>(null);
  const data = useOptimizationData();
  const sortSteps = SORT_STEPS.map((step, index) => ({ ...step, visual: <Cloud data={data} mode={SORT_MODES[index]} legend /> }));
  const generationSteps = GENERATION_NOTES.map((note, index) => {
    const generation = index + 1;
    const members = data.candidates.filter((item) => item.generation === generation);
    return {
      title: `Generation ${generation}`,
      body: `${members.length} candidates, ${members.filter((item) => item.pareto).length} on the front. ${note}`,
      visual: <GenerationVisual data={data} generation={generation} />,
    };
  });

  useEffect(() => {
    const board = svgRef.current?.parentElement;
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
      const from = frames[LOOP_FROM];
      const to = frames[LOOP_TO];
      if (!from || !to) return;
      const span = frames.slice(LOOP_TO, LOOP_FROM + 1);
      const y = Math.max(...span.map((item) => item.b)) + height * 0.17;
      const head = height * 0.012;
      const ceiling = height * 0.1;
      const gap = height * 0.08;
      const catalogue = board.querySelector("[data-route-end]");
      const stops = catalogue ? [...frames, local(catalogue)] : frames;
      const slots = stops.map((frame) => {
        const room = Math.max(0, frame.t - gap - ceiling);
        const slotHeight = Math.min(room, frame.w * 0.5);
        return { left: frame.l, top: ceiling, width: frame.w, height: slotHeight };
      });
      setLayout({
        width,
        height,
        loop: `M ${from.cx} ${from.b} L ${from.cx} ${y} L ${to.cx} ${y} L ${to.cx} ${to.b}`,
        arrow: `M ${to.cx - head} ${to.b + head * 1.4} L ${to.cx} ${to.b} L ${to.cx + head} ${to.b + head * 1.4}`,
        leaders: stops.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slots[index].height, bottom: frame.t })),
        dots: [
          { x: from.cx, y: from.b },
          { x: from.cx, y },
          { x: to.cx, y },
        ],
        label: { x: (from.cx + to.cx) / 2, y },
        slots,
        zoomOrigin: { x: frames[ZOOM_STEP]?.cx ?? width / 2, y: frames[ZOOM_STEP]?.cy ?? height / 2 },
      });
    };
    measure();
    void document.fonts.ready.then(measure);
    const resize = new ResizeObserver(measure);
    resize.observe(board);
    tracked().forEach((node) => resize.observe(node));
    const follow = window.setInterval(() => {
      if (boardLayoutSignature(board, tracked()) !== signature) measure();
    }, 150);
    const read = () => {
      const node = board.querySelector<HTMLElement>(".wf-frame.is-lit[data-frame], [data-route-end].is-lit");
      const next = !node ? null : node.hasAttribute("data-route-end") ? board.querySelectorAll(".wf-frame[data-frame]").length : Number(node.dataset.frame);
      if (next == null || next === litRef.current) return;
      litRef.current = next;
      setLit(next);
      if (next != null) setPlays((counts) => counts.map((count, index) => (index === next ? count + 1 : count)));
    };
    const watch = new MutationObserver(read);
    watch.observe(board, { subtree: true, attributes: true, attributeFilter: ["class"] });
    const zoomFrame = board.querySelector<HTMLElement>(`.wf-frame[data-frame="${ZOOM_STEP}"]`);
    const openZoom = (event: MouseEvent) => {
      event.stopPropagation();
      setZoomed("sorting");
    };
    zoomFrame?.setAttribute("data-zoomable", "");
    zoomFrame?.addEventListener("click", openZoom);
    return () => {
      window.clearInterval(follow);
      resize.disconnect();
      watch.disconnect();
      zoomFrame?.removeEventListener("click", openZoom);
    };
  }, []);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setZoomed(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomed]);

  return (
    <>
      <p className="wf-opt-caption wf-opt-note">Example shown: {ARCHETYPE_NAME}</p>
      <svg ref={svgRef} className="wf-opt-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout ? (
          <>
            <path className="wf-opt-loop" d={layout.loop} />
            <path className="wf-opt-arrow" d={layout.arrow} />
            {layout.leaders.map((leader, index) => (
              <g key={index} className="wf-opt-leader" data-on={lit === index || undefined}>
                <defs>
                  <linearGradient id={`wf-opt-leader-${index}`} gradientUnits="userSpaceOnUse" x1={leader.x} y1={leader.top} x2={leader.x} y2={leader.bottom}>
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0.45" />
                  </linearGradient>
                </defs>
                <path d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} style={{ stroke: `url(#wf-opt-leader-${index})` }} />
                <circle cx={leader.x} cy={leader.bottom} r={DOT * 0.6} />
              </g>
            ))}
            {layout.dots.map((dot, index) => (
              <circle key={index} className="wf-opt-loop-dot" cx={dot.x} cy={dot.y} r={DOT * 0.6} />
            ))}
          </>
        ) : null}
      </svg>
      {layout ? (
        <button
          type="button"
          className="wf-opt-cycle"
          data-zoomable=""
          style={{ left: `${(layout.label.x / layout.width) * 100}%`, top: `${(layout.label.y / layout.height) * 100}%` }}
          onClick={(event) => {
            event.stopPropagation();
            setZoomed("generations");
          }}
        >
          <span className="wf-proto-label">Four Generations</span>
          <span className="wf-frame-body">The loop runs four times. Each pass evaluates, sorts and selects a new population.</span>
        </button>
      ) : null}
      {layout && data.candidates.length > 0
        ? layout.slots.map((slot, index) => (
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
              <div key={plays[index]} className="wf-opt-visual-play">
                <StepVisual step={index} data={data} />
              </div>
            </div>
          ))
        : null}
      <div className="wf-opt-results" data-route-end="" data-frame="catalogue">
        <p className="wf-proto-label">Optimization Catalogue</p>
        <div className="wf-opt-plates">
          {data.grid.map((item, index) => (
            <Plate key={item.id} candidate={item} index={index} chosen={lit === CATALOGUE_STEP && item.id === data.subject?.id} />
          ))}
        </div>
      </div>
      <ZoomBoard
        title="Non Dominated Sorting"
        count={`${data.candidates.length} ${ARCHETYPE_NAME} candidates · ${data.fronts.length} fronts`}
        steps={sortSteps}
        open={zoomed === "sorting"}
        origin={layout?.zoomOrigin ?? null}
        onClose={() => setZoomed(null)}
      />
      <ZoomBoard
        title="Four Generations"
        count={cycle}
        steps={generationSteps}
        links={data.links}
        open={zoomed === "generations"}
        origin={layout?.label ?? null}
        onClose={() => setZoomed(null)}
      />
    </>
  );
}
