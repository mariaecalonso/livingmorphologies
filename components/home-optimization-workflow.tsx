"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TYPOLOGIES, findTypology } from "@/lib/catalog";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import { hashSeed, mulberry32 } from "@/lib/physarum";
import { semanticProductionConfig } from "@/lib/skill2/semantic/lobby-semantic-v1";
import { closeWorkflowPanel, markManualHold, PresentControls, usePresentClock, useRevealed } from "@/components/workflow-present";
import { crowdingDistances, nondominatedSort, type Rankable } from "@/lib/skill2/nsga";
import type { TypologyId } from "@/lib/types";

/** The board follows the human pick of one archetype through the real Skill 2 catalog. */
const ARCHETYPE = "vertical-void";
const ARCHETYPE_NAME = "Vertical Void";
/** Next Generation returns to Objective Evaluation. */
const LOOP_FROM = 4;
const LOOP_TO = 1;
/** Non Dominated Sorting and Diversity Preservation open their own boards. */
const ZOOM_STEP = 2;
const DIVERSITY_STEP = 3;
/** Next Generation opens its own board. The diagram above the frame stays the parent and child. */
const NEXT_STEP = 4;
/** The catalogue is the stop after the five step frames. The selection frame follows it. */
const CATALOGUE_STEP = 5;
const SELECTION_STEP = 6;
const GRID_PLATES = 9;
const DOT = 4;
/** The catalogue preview is two rows of fifteen, for every archetype. */
const CATALOG_SLOTS = 30;

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
  leaders: { x: number; top: number; bottom: number }[];
  dots: Point[];
  label: Point;
  slots: Slot[];
  zoomOrigin: Point;
  diversityOrigin: Point;
  nextOrigin: Point;
  generationOrigin: Point;
};

const OBJECTIVES = [
  { key: "formal", label: "Formal", color: "#ffffff" },
  { key: "spatial", label: "Spatial", color: "var(--cyan-hot)" },
  { key: "atmospheric", label: "Atmospheric", color: "var(--orange-hot)" },
] as const;

type ObjectiveKey = (typeof OBJECTIVES)[number]["key"];

const SORT_STEPS = [
  {
    title: "Plot Every Candidate",
    body: "Each candidate is placed by its Formal and Spatial scores. Dot size shows Atmospheric.",
  },
  {
    title: "Best Trade-offs",
    body: "A candidate is a best trade-off when no other candidate scores at least as well on all three objectives and better on one.",
  },
  {
    title: "Rank the Rest in Layers",
    body: "The best trade-offs are set aside and the test repeats on the rest, giving a second layer, then a third, until every candidate has a rank.",
  },
  {
    title: "Keep Variety Along the Front",
    body: "Inside the best trade-offs, candidates with the most room around them are kept first, and the two ends are always kept.",
  },
] as const;

/** Bars in the score cards start at this score, so differences between strong candidates stay visible. */
const SCORE_FLOOR = 0.5;
const SCORE_CARDS = 4;

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
  const [byArchetype, setByArchetype] = useState<Record<string, Candidate[]>>({});
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/demo/skill2/catalog.json", { signal: controller.signal }).then((response) => response.json()),
      fetch("/demo/skill2/picks.json", { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([catalog, loaded]: [{ archetypes: { archetypeId: string; candidates: Candidate[] }[] }, Pick[]]) => {
        setByArchetype(Object.fromEntries(catalog.archetypes.map((item) => [item.archetypeId, item.candidates])));
        setPicks(Object.fromEntries(loaded.map((item) => [item.archetypeId, item.candidateId])));
        setCandidates(catalog.archetypes.find((item) => item.archetypeId === ARCHETYPE)?.candidates ?? []);
        setPick(loaded.find((item) => item.archetypeId === ARCHETYPE)?.candidateId ?? null);
        setReady(true);
      })
      .catch(() => setReady(true));
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
    const families = new Map<number, Candidate[]>();
    for (const item of final) {
      if (!item.pareto || item.diversity !== "none" || item.parentId == null || item.id === subject?.id) continue;
      families.set(item.parentId, [...(families.get(item.parentId) ?? []), item]);
    }
    const siblings = [...families.values()].filter((group) => group.length > 1).sort((a, b) => b.length - a.length).flat();
    const diversity = {
      generation: lastGeneration,
      similar: siblings.slice(0, 6),
      kept: final.filter((item) => item.diversity === "rescue").slice(0, 6),
      both: final.filter((item) => item.diversity === "tag").slice(0, 2),
    };
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
    const strongest = (key: ObjectiveKey) => pictured.reduce<Candidate | null>((best, item) => (!best || item[key] > best[key] ? item : best), null);
    const scoreCards: Candidate[] = [];
    for (const item of [subject, parent, strongest("formal"), strongest("spatial"), strongest("atmospheric")]) {
      if (scoreCards.length < SCORE_CARDS && item?.image && !scoreCards.some((card) => card.id === item.id)) scoreCards.push(item);
    }
    const median = (key: ObjectiveKey) => {
      const sorted = candidates.map((item) => item[key]).sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    };
    const medians = { formal: median("formal"), spatial: median("spatial"), atmospheric: median("atmospheric") };
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
    return { candidates, subject, parent, seeds, scoreCards, medians, diversity, grid, fronts, rank, crowding, generations, links, byArchetype, picks, ready };
  }, [candidates, pick, byArchetype, picks, ready]);
}

type Data = ReturnType<typeof useOptimizationData>;

/** Seeded draw without replacement, so each archetype always shows the same plates. Shown in catalogue order. */
function sampleCatalog(items: Candidate[], count: number, archetypeId: string) {
  if (items.length <= count) return [...items].sort((a, b) => a.generation - b.generation || a.id - b.id);
  const rng = mulberry32(hashSeed(["optimization-catalogue", archetypeId]));
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, count).sort((a, b) => a.generation - b.generation || a.id - b.id);
}

function Plate({ candidate, chosen, index = 0, dashed, name = ARCHETYPE_NAME }: { candidate: Candidate; chosen?: boolean; index?: number; dashed?: boolean; name?: string }) {
  const classes = ["wf-opt-plate", chosen ? "frame-primary" : "", dashed ? "is-rescued" : ""].filter(Boolean).join(" ");
  return (
    <span className={classes} data-candidate={candidate.id} style={{ "--i": index } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={candidate.image ?? ""} alt={`${name} ${candidate.id}`} />
    </span>
  );
}

type Key = { label: string; tone: string; r?: number; boundary?: boolean };

function cloudKey(data: Data, mode: "front" | "all" | "fronts" | "crowding"): Key[] {
  const total = data.candidates.length;
  const first = data.fronts[0]?.length ?? 0;
  if (mode === "all") return [{ label: `${total} candidates`, tone: "rest", r: 1.1 }, { label: "Larger = more Atmospheric", tone: "rest", r: 1.8 }];
  if (mode === "front") return [{ label: `Best trade-offs · ${first}`, tone: "front" }, { label: `Beaten · ${total - first}`, tone: "rest" }];
  if (mode === "fronts") return [{ label: "Layer 1", tone: "f1" }, { label: "Layer 2", tone: "f2" }, { label: "Layer 3", tone: "f3" }, { label: "Later", tone: "rest" }];
  return [{ label: "End, always kept", tone: "front", boundary: true }, { label: "Larger = more room", tone: "front", r: 1.8 }];
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

function selectionRows(data: Data) {
  return TYPOLOGIES.map((typology) => ({
    id: typology.id,
    label: typology.label,
    archetypes: typology.archetypes.map((archetype) => {
      const candidateId = data.picks[archetype.id];
      const candidate = candidateId == null ? null : data.byArchetype[archetype.id]?.find((item) => item.id === candidateId) ?? null;
      return { archetype, candidateId: candidateId ?? null, candidate: candidate?.image ? candidate : null };
    }),
  }));
}

function SelectionMatrix({ data, compact = false }: { data: Data; compact?: boolean }) {
  const rows = selectionRows(data);
  return (
    <div className={compact ? "wf-opt-select-preview" : "wf-opt-select-strip"}>
      {rows.map((family) => (
        <div key={family.id} className={compact ? "wf-opt-select-row" : "wf-opt-select-group"}>
          {compact ? null : <p className="wf-proto-label">{family.label}</p>}
          {family.archetypes.map((item) => (
            <figure key={item.archetype.id}>
              <span className="wf-opt-plate wf-opt-choice">
                {item.candidate ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.candidate.image ?? ""} alt={`${item.archetype.name} ${item.candidate.id}`} />
                ) : (
                  <span className="wf-opt-pending">Pending</span>
                )}
              </span>
              {compact ? null : (
                <figcaption>
                  <span>{item.archetype.name}</span>
                  <span>{item.candidateId ?? "Pending"}</span>
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Same projection as the lab Pareto board: X formal, Y spatial, Z atmospheric. */
function projectPareto([x, y, z]: number[], yaw: number, pitch: number, zoom: number) {
  const px = x - 0.5;
  const py = y - 0.5;
  const pz = z - 0.5;
  const rx = px * Math.cos(yaw) + pz * Math.sin(yaw);
  const rz = -px * Math.sin(yaw) + pz * Math.cos(yaw);
  const ry = py * Math.cos(pitch) - rz * Math.sin(pitch);
  const depth = py * Math.sin(pitch) + rz * Math.cos(pitch);
  const perspective = 1 / (2.05 - depth * 0.55);
  const spread = 78 * zoom;
  return { sx: 50 + rx * spread * perspective, sy: 50 - ry * spread * perspective, depth };
}

const PARETO_EDGES: [number[], number[]][] = [
  [[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]],
];

const PARETO_AXIS = [
  { label: "F", to: [1.12, 0, 0] },
  { label: "S", to: [0, 1.12, 0] },
  { label: "A", to: [0, 0, 1.12] },
];

function ParetoSpin({ data }: { data: Data }) {
  const [yaw, setYaw] = useState(-0.62);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      setYaw((value) => value + dt * 0.00018);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  const pitch = 0.42;
  const zoom = 1.05;
  const points = data.candidates
    .map((item) => {
      const point = projectPareto([item.formal, item.spatial, item.atmospheric], yaw, pitch, zoom);
      const tone = item.id === data.subject?.id ? "subject" : item.pareto ? "front" : "rest";
      return { ...point, tone, id: item.id };
    })
    .sort((a, b) => a.depth - b.depth);
  return (
    <div className="wf-opt-sort wf-opt-pareto">
      <svg viewBox="-4 -4 108 108" aria-hidden="true">
        {PARETO_EDGES.map(([from, to], index) => {
          const a = projectPareto(from, yaw, pitch, zoom);
          const b = projectPareto(to, yaw, pitch, zoom);
          return <line key={index} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} />;
        })}
        {PARETO_AXIS.map((axis) => {
          const origin = projectPareto([0, 0, 0], yaw, pitch, zoom);
          const end = projectPareto(axis.to, yaw, pitch, zoom);
          return (
            <g key={axis.label}>
              <line x1={origin.sx} y1={origin.sy} x2={end.sx} y2={end.sy} />
              <text x={end.sx} y={end.sy}>{axis.label}</text>
            </g>
          );
        })}
        {points.map((point) => (
          <circle key={point.id} cx={point.sx} cy={point.sy} r={point.tone === "subject" ? 1.7 : point.tone === "front" ? 1.25 : 0.85} data-tone={point.tone} />
        ))}
      </svg>
      <p className="wf-opt-caption">Best trade-offs · {data.fronts[0]?.length ?? 0} of {data.candidates.length}</p>
    </div>
  );
}

function StepVisual({ step, data, seeds }: { step: number; data: Data; seeds: string[] }) {
  if (step === 0) {
    return (
      <div className="wf-opt-seeds">
        {seeds.map((src, index) => (
          <span key={src} className="wf-opt-plate" style={{ "--i": index } as CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" />
          </span>
        ))}
        <p className="wf-opt-caption">Generation 1</p>
      </div>
    );
  }
  if (step === 1 && data.scoreCards.length > 0) {
    return <ScoreCards data={data} />;
  }
  if (step === 2) {
    return <ParetoSpin data={data} />;
  }
  if (step === 3) {
    return (
      <div className="wf-opt-diversity">
        <figure>
          <div className="wf-opt-diversity-stack">
            {data.diversity.similar.slice(0, 3).map((item, index) => <Plate key={item.id} candidate={item} index={index} />)}
          </div>
          <figcaption className="wf-opt-caption">Similar</figcaption>
        </figure>
        <span className="wf-opt-diversity-arrow" aria-hidden="true" />
        <figure>
          <div>{data.diversity.kept.slice(0, 2).map((item, index) => <Plate key={item.id} candidate={item} index={index + 3} dashed />)}</div>
          <figcaption className="wf-opt-caption">Different · kept</figcaption>
        </figure>
      </div>
    );
  }
  if (step === CATALOGUE_STEP || step === SELECTION_STEP) return null;
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

const scoreHeight = (value: number) => Math.max(0, Math.min(1, (value - SCORE_FLOOR) / (1 - SCORE_FLOOR)));

function ScoreCards({ data }: { data: Data }) {
  return (
    <div className="wf-opt-score-cards" aria-label="Scores of selected candidates on the three objectives">
      {data.scoreCards.map((item, index) => (
        <figure key={item.id} className="wf-opt-score-card">
          <Plate candidate={item} index={index} chosen={item.id === data.subject?.id} />
          <figcaption>{item.id} · G{item.generation}</figcaption>
          <div className="wf-opt-score-bars">
            {OBJECTIVES.map((objective) => (
              <span
                key={objective.key}
                style={{ "--score": scoreHeight(item[objective.key]), "--median": scoreHeight(data.medians[objective.key]), "--tone": objective.color } as CSSProperties}
              >
                <b>{item[objective.key].toFixed(2)}</b>
                <i />
                <em>{objective.label[0]}</em>
              </span>
            ))}
          </div>
        </figure>
      ))}
    </div>
  );
}

/** Kept plates from earlier generations, parent first, then two from each generation. */
function keptSources(data: Data) {
  const earlier = data.candidates.filter((item) => item.image && item.generation < 4 && (item.pareto || item.diversity !== "none"));
  const chosen: Candidate[] = [];
  if (data.parent?.image) chosen.push(data.parent);
  for (const generation of [1, 2, 3]) {
    for (const item of earlier.filter((candidate) => candidate.generation === generation)) {
      if (chosen.length >= 6) return chosen;
      if (!chosen.some((picked) => picked.id === item.id)) chosen.push(item);
    }
  }
  return chosen;
}

const NEXT_LANES = [
  { tone: "explorer", title: "Explorers", body: "New candidates sampled from the Physarum translation. No parent." },
  { tone: "pareto", title: "Children of best trade-offs", body: "The parent is copied and one refinement setting, Aspect, is changed." },
  { tone: "diversity", title: "Children of different shapes", body: "These would change a growth setting. Vertical Void has none, so the slots go to Explorers." },
] as const;

function NextGenerationBoard({ data, open, origin, onClose, sequence }: { data: Data; open: boolean; origin: Point | null; onClose: () => void; sequence: boolean }) {
  const clock = usePresentClock(sequence && open, onClose);
  return (
    <section
      className="wf-opt-zoom"
      data-open={open || undefined}
      aria-hidden={!open}
      onPointerDown={clock.hold}
      style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
    >
      <p className="wf-opt-trail">
        Optimization <span aria-hidden="true">›</span> Next Generation
        <span className="wf-opt-trail-count">{ARCHETYPE_NAME}</span>
      </p>
      {open ? <NextGenerationDiagram data={data} /> : null}
      <PresentControls run={sequence && open} clock={clock} onClose={onClose} open={open} />
    </section>
  );
}

function NextGenerationDiagram({ data }: { data: Data }) {
  const kept = keptSources(data);
  const parent = data.parent?.image ? data.parent : null;
  const child = data.subject?.image ? data.subject : null;
  return (
    <div className="wf-opt-next">
      <div className="wf-opt-next-kept">
        <p className="wf-opt-caption">Kept candidates · Generations 1–3</p>
        <div>
          {kept.map((item, index) => <Plate key={item.id} candidate={item} index={index} chosen={item.id === parent?.id} />)}
        </div>
        <p className="wf-frame-body">Best trade-offs and different shapes stay in the catalogue and compete again.</p>
      </div>
      <div className="wf-opt-next-lanes">
        {NEXT_LANES.map((lane, index) => (
          <div key={lane.tone} data-tone={lane.tone} style={{ "--i": index } as CSSProperties}>
            <div className="wf-opt-next-copy">
              <p className="wf-proto-label">{lane.title}</p>
              <p className="wf-frame-body">{lane.body}</p>
              {lane.tone === "pareto" && parent && child ? (
                <span className="wf-opt-next-pair">
                  <Plate candidate={parent} />
                  <span className="wf-opt-lineage-arrow" aria-hidden="true" />
                  <Plate candidate={child} index={1} />
                </span>
              ) : null}
            </div>
            <span className="wf-opt-next-line" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="wf-opt-next-out">
        <p className="wf-opt-caption">Generation {child?.generation ?? 4} · 100 new candidates</p>
        <div className="wf-opt-next-load" role="img" aria-label="Generation 4 filling with 100 new candidates">
          <i />
        </div>
        <p className="wf-frame-body">Explorers and children of best trade-offs. The realized split is not recorded.</p>
      </div>
    </div>
  );
}

function DiversityPlates({ items, dashed, chosen }: { items: Candidate[]; dashed?: boolean; chosen?: boolean }) {
  return (
    <div className="wf-opt-diversity-fit">
      <div className="wf-opt-diversity-grid" data-count={items.length} style={{ "--cols": Math.min(3, items.length) } as CSSProperties}>
        {items.map((item, index) => (
          <figure key={item.id}>
            <Plate candidate={item} index={index} dashed={dashed} chosen={chosen} />
            <figcaption>{item.id}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
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
      <GenerationMix generation={generation} />
    </div>
  );
}

type MixPart = { tone: "explorer" | "pareto" | "diversity"; label: string; count: number; share: number | null };

/**
 * Same production mix the Evolutionary Process page prints.
 * Generation 1 is all explorers. Generations 2–4 use the locked composition.
 * The three counts are one origin each, so they do not overlap and their sum is the denominator.
 */
const PRODUCTION_MIX = semanticProductionConfig(ARCHETYPE);

function generationMix(generation: number): { total: number; parts: MixPart[] } | null {
  const births = PRODUCTION_MIX.populationSize;
  const requested = generation === 1
    ? { explorers: births, pareto: 0, diversity: 0 }
    : PRODUCTION_MIX.composition?.[generation as 2 | 3 | 4];
  if (!requested) return null;
  const total = requested.explorers + requested.pareto + requested.diversity;
  const denominator = total === births ? total : null;
  const share = (count: number) => (denominator == null || denominator === 0 ? null : (count / denominator) * 100);
  return {
    total,
    parts: [
      { tone: "explorer", label: "Explorers", count: requested.explorers, share: share(requested.explorers) },
      { tone: "pareto", label: "Nondominated parents", count: requested.pareto, share: share(requested.pareto) },
      { tone: "diversity", label: "Diversity parents", count: requested.diversity, share: share(requested.diversity) },
    ],
  };
}

function mixPercent(generation: number, count: number, share: number | null) {
  if (generation === 1 && count === 0) return "—";
  if (share == null) return "—";
  return Number.isInteger(share) ? `${share}%` : `${share.toFixed(1)}%`;
}

function GenerationMix({ generation }: { generation: number }) {
  const mix = generationMix(generation);
  if (!mix) return <p className="wf-opt-gen-scope">Mix not in the production record</p>;
  return (
    <div className="wf-opt-gen-mix" aria-label={`Generation ${generation}: origin of ${mix.total} new candidates`}>
      <p className="wf-opt-gen-scope">{mix.total} new candidates</p>
      <div className="wf-opt-gen-bar">
        {mix.parts.filter((part) => part.count > 0).map((part) => (
          <i key={part.tone} data-tone={part.tone} style={{ "--share": part.count } as CSSProperties} />
        ))}
      </div>
      <dl className="wf-opt-gen-key">
        {mix.parts.map((part) => (
          <div key={part.tone} data-tone={part.tone} data-empty={part.count === 0 || undefined}>
            <dt>{part.label}</dt>
            <dd>{mixPercent(generation, part.count, part.share)}</dd>
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

function ZoomBoard({ title, count, steps, open, origin, onClose, links, sequence = false }: { title: string; count: string; steps: readonly ZoomStep[]; open: boolean; origin: Point | null; onClose: () => void; links?: Link[]; sequence?: boolean }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const clock = usePresentClock(sequence && open, onClose);
  return (
    <section
      ref={setHost}
      className="wf-opt-zoom"
      data-open={open || undefined}
      aria-hidden={!open}
      onPointerDown={clock.hold}
      style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
    >
      <p className="wf-opt-trail">
        Optimization <span aria-hidden="true">›</span> {title}
        <span className="wf-opt-trail-count">{count}</span>
      </p>
      <ol className="wf-opt-zoom-steps" style={{ "--steps": steps.length } as CSSProperties}>
        {steps.map((step) => (
          <li key={step.title} className="wf-opt-zoom-step">
            <div className="wf-opt-zoom-visual">{open ? step.visual : null}</div>
            <p className="wf-proto-label">{step.title}</p>
            <p className="wf-frame-body">{step.body}</p>
          </li>
        ))}
      </ol>
      {links ? <LineageLinks links={links} open={open} host={host} /> : null}
      <PresentControls run={sequence && open} clock={clock} onClose={onClose} open={open} />
    </section>
  );
}

export function OptimizationWorkflowLayer({ cycle }: { cycle: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const revealed = useRevealed(lit);
  const litRef = useRef<number | null>(null);
  const [plays, setPlays] = useState<number[]>(() => [0, 0, 0, 0, 0, 0, 0]);
  const [zoomed, setZoomed] = useState<"sorting" | "diversity" | "next" | "generations" | null>(null);
  const [panel, setPanel] = useState<"catalog" | "selection" | null>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [typologyId, setTypologyId] = useState<TypologyId>("lobby");
  const [archetypeId, setArchetypeId] = useState(ARCHETYPE);
  const [sequence, setSequence] = useState(false);
  const [seeds, setSeeds] = useState<string[]>([]);
  const data = useOptimizationData();
  const boardOf = () => svgRef.current?.parentElement ?? null;
  const closePanel = () => {
    closeWorkflowPanel(boardOf());
    setSequence(false);
    setPanel(null);
  };
  const closeZoom = () => {
    closeWorkflowPanel(boardOf());
    setSequence(false);
    setZoomed(null);
  };
  const panelClock = usePresentClock(Boolean(sequence && panel), closePanel);
  const sortSteps = SORT_STEPS.map((step, index) => ({ ...step, visual: <Cloud data={data} mode={SORT_MODES[index]} legend /> }));
  const bothIds = data.diversity.both.map((item) => item.id).join(" and ");
  const diversitySteps: ZoomStep[] = [
    {
      title: "Similar Shapes",
      body: "Best trade-offs that share a parent. Each one is kept for its scores, but the shapes repeat.",
      visual: <DiversityPlates items={data.diversity.similar} />,
    },
    {
      title: "Different Shapes Kept",
      body: "Not best trade-offs. Each one is kept because its shape is farther than the set distance from every shape already kept.",
      visual: <DiversityPlates items={data.diversity.kept} dashed />,
    },
    ...(data.diversity.both.length
      ? [{
          title: "Both Marks",
          body: `${bothIds} ${data.diversity.both.length > 1 ? "are best trade-offs" : "is a best trade-off"} and also unlike every other kept shape.`,
          visual: <DiversityPlates items={data.diversity.both} dashed chosen />,
        }]
      : []),
  ];
  const generationSteps = GENERATION_NOTES.map((note, index) => {
    const generation = index + 1;
    const members = data.candidates.filter((item) => item.generation === generation);
    return {
      title: `Generation ${generation}`,
      body: `100 new candidates, ${members.length} kept in the catalogue, ${members.filter((item) => item.pareto).length} on the front. ${note}`,
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
      const ceiling = height * 0.1;
      const gap = height * 0.08;
      const ends = [...board.querySelectorAll("[data-route-end]")].map(local);
      const stops = [...frames, ...ends];
      const slots = stops.map((frame, index) => {
        const room = Math.max(0, frame.t - gap - ceiling);
        if (index === 0) {
          const margin = height * 0.02;
          const bottom = frame.t - height * 0.035;
          const size = Math.min(frame.w, Math.max(36, bottom - margin));
          return { left: frame.cx - size / 2, top: bottom - size, width: size, height: size };
        }
        if (index === 2) {
          const slotHeight = Math.min(room, frame.w);
          return { left: frame.l, top: Math.max(ceiling, frame.t - gap - slotHeight), width: frame.w, height: slotHeight };
        }
        const slotHeight = Math.min(room, frame.w * 0.5);
        return { left: frame.l, top: ceiling, width: frame.w, height: slotHeight };
      });
      setLayout({
        width,
        height,
        loop: `M ${from.cx} ${from.b} L ${from.cx} ${y} L ${to.cx} ${y} L ${to.cx} ${to.b}`,
        leaders: stops.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slots[index].height, bottom: frame.t })),
        dots: [
          { x: from.cx, y: from.b },
          { x: from.cx, y },
          { x: to.cx, y },
        ],
        label: { x: (from.cx + to.cx) / 2, y },
        slots,
        zoomOrigin: { x: frames[ZOOM_STEP]?.cx ?? width / 2, y: frames[ZOOM_STEP]?.cy ?? height / 2 },
        diversityOrigin: { x: frames[DIVERSITY_STEP]?.cx ?? width / 2, y: frames[DIVERSITY_STEP]?.cy ?? height / 2 },
        nextOrigin: { x: frames[NEXT_STEP]?.cx ?? width / 2, y: frames[NEXT_STEP]?.cy ?? height / 2 },
        generationOrigin: (() => {
          const node = board.querySelector("[data-frame='generations']");
          if (!node) return { x: (from.cx + to.cx) / 2, y };
          const box = local(node);
          return { x: box.cx, y: box.cy };
        })(),
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
      const frame = Number(node?.dataset.frame);
      const next = !node ? null : Number.isFinite(frame) ? frame : node.hasAttribute("data-route-end") ? board.querySelectorAll(".wf-frame[data-frame]").length : null;
      if (next == null || next === litRef.current) return;
      litRef.current = next;
      setLit(next);
      if (next != null) {
        setPlays((counts) => {
          const filled = counts.length > next ? counts : [...counts, ...Array(next - counts.length + 1).fill(0)];
          return filled.map((count, index) => (index === next ? count + 1 : count));
        });
      }
    };
    const watch = new MutationObserver(read);
    watch.observe(board, { subtree: true, attributes: true, attributeFilter: ["class"] });
    const zoomFrames = [
      { node: board.querySelector<HTMLElement>(`.wf-frame[data-frame="${ZOOM_STEP}"]`), board: "sorting" as const },
      { node: board.querySelector<HTMLElement>(`.wf-frame[data-frame="${DIVERSITY_STEP}"]`), board: "diversity" as const },
      { node: board.querySelector<HTMLElement>(`.wf-frame[data-frame="${NEXT_STEP}"]`), board: "next" as const },
    ].map((item) => {
      const open = (event: MouseEvent) => {
        event.stopPropagation();
        setSequence(false);
        markManualHold(board);
        setZoomed(item.board);
      };
      item.node?.setAttribute("data-zoomable", "");
      item.node?.addEventListener("click", open);
      return { node: item.node, open };
    });
    return () => {
      window.clearInterval(follow);
      resize.disconnect();
      watch.disconnect();
      zoomFrames.forEach((item) => item.node?.removeEventListener("click", item.open));
    };
  }, []);

  useEffect(() => {
    if (!zoomed && !panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeWorkflowPanel(svgRef.current?.parentElement ?? null);
      setSequence(false);
      if (panel) setPanel(null);
      else setZoomed(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomed, panel]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/demo/skill1/vertical-void/entries.json", { signal: controller.signal })
      .then((response) => response.json())
      .then((entries: { image?: string }[]) => {
        setSeeds(entries.map((entry) => entry.image).filter((src): src is string => Boolean(src)).slice(0, 9));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const board = svgRef.current?.parentElement;
    if (!board) return;
    const onArrive = (event: Event) => {
      const frame = String((event as CustomEvent<{ frame: string }>).detail.frame);
      if (frame === String(ZOOM_STEP) || frame === String(DIVERSITY_STEP) || frame === String(NEXT_STEP)) {
        setSequence(true);
        setZoomed(frame === String(ZOOM_STEP) ? "sorting" : frame === String(DIVERSITY_STEP) ? "diversity" : "next");
        return;
      }
      if (frame === "generations") {
        setSequence(true);
        setZoomed("generations");
        return;
      }
      if (frame !== String(CATALOGUE_STEP) && frame !== String(SELECTION_STEP)) return;
      const node = board.querySelector<HTMLElement>(`[data-frame="${frame}"]`);
      if (!node) return;
      const box = board.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      const scale = box.width / board.clientWidth || 1;
      setOrigin({
        x: (rect.left + rect.width / 2 - box.left) / scale,
        y: (rect.top + rect.height / 2 - box.top) / scale,
      });
      setSequence(true);
      setPanel(frame === String(CATALOGUE_STEP) ? "catalog" : "selection");
    };
    board.addEventListener("wf-frame-arrive", onArrive);
    return () => board.removeEventListener("wf-frame-arrive", onArrive);
  }, []);

  const openPanel = (next: "catalog" | "selection", node: HTMLElement) => {
    setSequence(false);
    const board = node.closest<HTMLElement>(".wf-board");
    if (board) markManualHold(board);
    if (board) {
      const box = board.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      const scale = box.width / board.clientWidth || 1;
      setOrigin({
        x: (rect.left + rect.width / 2 - box.left) / scale,
        y: (rect.top + rect.height / 2 - box.top) / scale,
      });
    }
    setPanel(next);
  };
  const catalogPlates = useMemo(() => {
    const list = data.byArchetype[archetypeId] ?? [];
    const pickId = data.picks[archetypeId] ?? null;
    const pictured = list.filter((item) => item.image && item.catalogVisible !== false);
    const selected = pickId == null ? null : pictured.find((item) => item.id === pickId) ?? null;
    const rest = pictured.filter((item) => item.id !== selected?.id);
    const sample = sampleCatalog(rest, CATALOG_SLOTS - (selected ? 1 : 0), archetypeId);
    return { plates: selected ? [selected, ...sample] : sample, pickId, total: pictured.length };
  }, [archetypeId, data.byArchetype, data.picks]);
  const catalogName = findTypology(typologyId).archetypes.find((item) => item.id === archetypeId)?.name ?? ARCHETYPE_NAME;

  return (
    <>
      <p className="wf-opt-caption wf-opt-note">Example shown: {ARCHETYPE_NAME}</p>
      <svg ref={svgRef} className="wf-opt-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout ? (
          <>
            <path className="wf-opt-loop" d={layout.loop} />
            {layout.leaders.map((leader, index) => index >= CATALOGUE_STEP ? null : (
              <g key={index} className="wf-opt-leader" data-on={revealed >= index || undefined}>
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
          data-route-node=""
          data-frame="generations"
          data-zoomable=""
          style={{ left: `${(layout.label.x / layout.width) * 100}%`, top: `${(layout.label.y / layout.height) * 100}%` }}
          onClick={(event) => {
            event.stopPropagation();
            setSequence(false);
            const board = event.currentTarget.closest<HTMLElement>(".wf-board");
            if (board) markManualHold(board);
            setZoomed("generations");
          }}
        >
          <span className="wf-proto-label">Four Generations</span>
          <span className="wf-frame-body">The loop runs four times. Each pass evaluates, sorts and selects a new population.</span>
        </button>
      ) : null}
      {layout && data.candidates.length > 0
        ? layout.slots.map((slot, index) => (
            index >= CATALOGUE_STEP ? null : (
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
              <div key={plays[index]} className="wf-opt-visual-play">
                <StepVisual step={index} data={data} seeds={seeds} />
              </div>
            </div>
            )
          ))
        : null}
      <div
        className="wf-opt-results"
        data-route-end=""
        data-frame={String(CATALOGUE_STEP)}
        data-zoomable=""
        onClick={(event) => {
          event.stopPropagation();
          openPanel("catalog", event.currentTarget);
        }}
      >
        <p className="wf-proto-label">Optimization Catalogue</p>
        <div className="wf-opt-plates">
          {data.grid.map((item, index) => (
            <Plate key={item.id} candidate={item} index={index} chosen={lit === CATALOGUE_STEP && item.id === data.subject?.id} />
          ))}
        </div>
      </div>
      <div
        className="wf-opt-results wf-opt-selection"
        data-route-end=""
        data-frame={String(SELECTION_STEP)}
        data-zoomable=""
        onClick={(event) => {
          event.stopPropagation();
          openPanel("selection", event.currentTarget);
        }}
      >
        <p className="wf-proto-label">Selected for Vertical Propagation</p>
        <p className="wf-frame-body">One iteration from each archetype.</p>
      </div>
      <ZoomBoard
        title="Non Dominated Sorting"
        count={`${data.candidates.length} ${ARCHETYPE_NAME} candidates · ${data.fronts.length} layers`}
        steps={sortSteps}
        open={zoomed === "sorting"}
        origin={layout?.zoomOrigin ?? null}
        onClose={closeZoom}
        sequence={sequence && zoomed === "sorting"}
      />
      <ZoomBoard
        title="Diversity Preservation"
        count={`${ARCHETYPE_NAME} · Generation ${data.diversity.generation}`}
        steps={diversitySteps}
        open={zoomed === "diversity"}
        origin={layout?.diversityOrigin ?? null}
        onClose={closeZoom}
        sequence={sequence && zoomed === "diversity"}
      />
      <NextGenerationBoard
        data={data}
        open={zoomed === "next"}
        origin={layout?.nextOrigin ?? null}
        onClose={closeZoom}
        sequence={sequence && zoomed === "next"}
      />
      <ZoomBoard
        title="Four Generations"
        count={cycle}
        steps={generationSteps}
        links={data.links}
        open={zoomed === "generations"}
        origin={layout?.generationOrigin ?? null}
        onClose={closeZoom}
        sequence={sequence && zoomed === "generations"}
      />
      <section
        className="wf-opt-zoom"
        data-open={panel || undefined}
        data-opt-panel={panel ?? undefined}
        aria-hidden={!panel}
        onPointerDown={panelClock.hold}
        style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
      >
        <p className="wf-opt-trail">
          Optimization <span aria-hidden="true">›</span>{" "}
          {panel === "selection" ? "Selected for Vertical Propagation" : `Optimization Catalogue · ${catalogName}`}
          {panel === "catalog" ? (
            <>
              <span className="wf-opt-trail-count">
                {Math.min(catalogPlates.plates.length, catalogPlates.total)} of {catalogPlates.total} iterations
              </span>
              <a className="wf-phy-lab wf-opt-cat-link" href="/lab/evolution/pareto-catalog">Open Optimization Catalogue</a>
            </>
          ) : null}
        </p>
        <div className="wf-phy-panel">
          {panel === "catalog" ? (
            <>
              <div className="wf-phy-tabs">
                {TYPOLOGIES.map((typology) => (
                  <button
                    key={typology.id}
                    type="button"
                    aria-pressed={typology.id === typologyId}
                    onClick={() => {
                      setTypologyId(typology.id);
                      setArchetypeId(typology.archetypes[0]?.id ?? ARCHETYPE);
                    }}
                  >
                    {typology.label}
                  </button>
                ))}
              </div>
              <div className="wf-phy-tabs">
                {findTypology(typologyId).archetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    type="button"
                    aria-pressed={archetype.id === archetypeId}
                    onClick={() => setArchetypeId(archetype.id)}
                  >
                    {archetype.name}
                  </button>
                ))}
              </div>
              <div className="wf-phy-fit">
                <div className="wf-phy-fit-size">
                  {!data.ready ? (
                    <p className="wf-frame-body">Loading saved plates.</p>
                  ) : catalogPlates.plates.length === 0 ? (
                    <p className="wf-frame-body">Catalog plates for this archetype are pending.</p>
                  ) : (
                    <div className="wf-opt-cat-sheet">
                      {catalogPlates.plates.map((item, index) => (
                        <Plate key={item.id} candidate={item} index={index} name={catalogName} chosen={item.id === catalogPlates.pickId} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
          {panel === "selection" ? (
            data.ready ? <SelectionMatrix data={data} /> : <p className="wf-frame-body">Selection pending</p>
          ) : null}
        </div>
        <PresentControls run={Boolean(sequence && panel)} clock={panelClock} onClose={closePanel} open={Boolean(panel)} />
      </section>
    </>
  );
}
