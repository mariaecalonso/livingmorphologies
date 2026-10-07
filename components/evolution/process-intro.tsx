"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { MetricInfo, type ExplainSection } from "@/components/evolution/metric-info";
import { ParetoCloud } from "@/components/evolution/pareto-space";
import { EvolutionImage, useEvolutionCatalog } from "@/components/evolution/evolution-data";
import { BRANCHES, TYPOLOGIES } from "@/lib/catalog";
import { labWorkspace } from "@/lib/site-map";
import type { EvolutionCandidateView, EvolutionCatalog } from "@/lib/skill2/evolution-index";
import type { SavedPick } from "@/lib/skill2/saved-picks";
import { readSkill2Selections, selectionPreviewSrc, SKILL2_SELECTIONS_KEY, type Skill2Selections } from "@/lib/skill2/published-selection";

const EXAMPLE_ID = "vertical-void";
const ARCHETYPE_STORAGE_KEY = "lm-evolution-archetype";

const RATING_LABEL = ["Low", "Medium", "High"] as const;

const EXAMPLE = TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === EXAMPLE_ID);

const SOURCE_GROUPS = BRANCHES.map((branch) => ({
  id: branch.id,
  title: branch.title,
  criteria: [...branch.shared, branch.specific.lobby].map((criterion) => ({
    id: criterion.id,
    label: criterion.label,
    value: EXAMPLE?.ratings[criterion.id] ?? 0,
  })),
}));

const PREVIEW_YAW = -0.65;
const PREVIEW_PITCH = 0.38;

const CUBE_EDGES: [number[], number[]][] = [
  [[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]],
];

const AXES: { label: string; to: number[] }[] = [
  { label: "Formal", to: [1.12, 0, 0] },
  { label: "Spatial", to: [0, 1.12, 0] },
  { label: "Atmospheric", to: [0, 0, 1.12] },
];

type MixRow = {
  id: string;
  generation: number;
  explorers: number;
  pareto: number;
  diversity: number;
  total: number;
};

const EXPLAIN: Record<string, ExplainSection[]> = {
  moo: [
    {
      label: "Multi-objective optimization",
      text: "Every new morphology is scored on Formal, Spatial, and Atmospheric. The three objectives stay separate. The search keeps the set of solutions, rather than folding them into one score.",
    },
    {
      label: "Non-dominated",
      text: "A feasible morphology is non-dominated when no other feasible morphology is at least as strong on all three objectives and stronger on one. A feasible morphology outranks an infeasible one.",
    },
    {
      label: "Pareto archive",
      text: "The Pareto archive is the globally non-dominated set. It holds every solution that nothing else dominates, including solutions that are extreme on a single objective.",
    },
    {
      label: "Preservation",
      text: "Specialists are off. A morphology stays in the catalog for one of two roles: it is non-dominated, or its phenotype is different enough from the morphologies already kept.",
    },
  ],
  strategy: [
    {
      label: "Broad search",
      text: "Generation 01 is a broad sample. All 100 new morphologies are explorers drawn from the Physarum translation of Vertical Void.",
    },
    {
      label: "Increasing refinement",
      text: "Later generations give more of the 100 new candidates to children of non-dominated parents, and a smaller share to children of diversity parents. The search spends more of the population on regions that already produced kept morphologies.",
    },
    {
      label: "Exploration remains",
      text: "The explorer share shrinks and stays present through generation 04. A late discovery can still enter the catalog.",
    },
  ],
  preservation: [
    {
      label: "Non-dominated",
      text: "A morphology is non-dominated when no other feasible morphology is at least as strong on Formal, Spatial, and Atmospheric and stronger on one. Those morphologies parent the Pareto share of the next generation.",
    },
    {
      label: "Morphological diversity",
      text: "A second role keeps a morphology because its phenotype sits apart from the ones already preserved. That role stops the catalog from collapsing into copies of one shape. Diversity parents are a smaller share than non-dominated parents.",
    },
  ],
  pareto: [
    {
      label: "Objective space",
      text: "Each point is an evaluated Vertical Void morphology, placed by its Formal, Spatial, and Atmospheric scores. Terracotta marks the non-dominated set.",
    },
    {
      label: "What the front contains",
      text: "The front is the globally non-dominated set. Extreme solutions remain when nothing else dominates them.",
    },
  ],
  selection: [
    {
      label: "One morphology",
      text: "A person chooses one drawing from the Vertical Void catalog. That choice is the section vertical propagation continues.",
    },
    {
      label: "The catalog",
      text: "The grid is the Skill 2 Vertical Void catalog. The terracotta frame is the human selection.",
    },
  ],
};

function useWorkflowHref(path: string) {
  const suffix = useSyncExternalStore(
    () => () => {},
    () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("frame") === "1") return "?wall=1&frame=1";
      if (params.get("wall") === "1") return "?wall=1";
      return "";
    },
    () => "",
  );
  return `${path}${suffix}`;
}

function shareLabel(count: number, total: number) {
  const value = (count / total) * 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text}%`;
}

/** Production mix. Generation 01 is entirely explorers. Later rows match the locked search composition. */
const MIX: MixRow[] = [
  { id: "G01", generation: 1, explorers: 100, pareto: 0, diversity: 0, total: 100 },
  { id: "G02", generation: 2, explorers: 70, pareto: 22, diversity: 8, total: 100 },
  { id: "G03", generation: 3, explorers: 50, pareto: 37, diversity: 13, total: 100 },
  { id: "G04", generation: 4, explorers: 30, pareto: 52, diversity: 18, total: 100 },
];

const GENERATION_ROLE = [
  {
    title: "Open the space",
    why: "Nothing has been scored, so every new candidate is an explorer from the Physarum translation.",
  },
  {
    title: "Begin refinement",
    why: "Most candidates still explore. A minority are children of non-dominated parents, and a smaller share come from diversity parents.",
  },
  {
    title: "Shift the weight",
    why: "Explorers and children of kept morphologies share the population. Non-dominated parents are the larger inherited share.",
  },
  {
    title: "Concentrate",
    why: "Children of non-dominated parents become the majority. Explorers and diversity parents remain. The search then stops.",
  },
];

const EMPTY_SELECTIONS: Skill2Selections = {};
let cachedSelectionRaw = "";
let cachedSelections: Skill2Selections = EMPTY_SELECTIONS;

function selectionSnapshot() {
  if (typeof window === "undefined") return EMPTY_SELECTIONS;
  const raw = window.sessionStorage.getItem(SKILL2_SELECTIONS_KEY) ?? "";
  if (raw !== cachedSelectionRaw) {
    cachedSelectionRaw = raw;
    cachedSelections = raw ? readSkill2Selections() : EMPTY_SELECTIONS;
  }
  return cachedSelections;
}

function useSkill2Selections() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const onChange = () => onStoreChange();
      window.addEventListener("focus", onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener("focus", onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    selectionSnapshot,
    () => EMPTY_SELECTIONS,
  );
}

function projectPreview([x, y, z]: number[]) {
  const px = x - 0.5;
  const py = y - 0.5;
  const pz = z - 0.5;
  const rx = px * Math.cos(PREVIEW_YAW) + pz * Math.sin(PREVIEW_YAW);
  const rz = -px * Math.sin(PREVIEW_YAW) + pz * Math.cos(PREVIEW_YAW);
  const ry = py * Math.cos(PREVIEW_PITCH) - rz * Math.sin(PREVIEW_PITCH);
  const depth = py * Math.sin(PREVIEW_PITCH) + rz * Math.cos(PREVIEW_PITCH);
  const perspective = 1 / (1.9 - depth * 0.35);
  return { sx: 50 + rx * 72 * perspective, sy: 52 - ry * 72 * perspective, depth };
}

function pointState(candidate: EvolutionCandidateView) {
  if (candidate.archived) return "archive";
  if (candidate.pareto) return "pareto";
  return "dominated";
}

function CompositionBar({ row }: { row: MixRow }) {
  if (row.generation === 1) {
    return (
      <div className="comp comp-open">
        <p className="mix-hero">
          <strong>100%</strong>
          <span>Explorers</span>
        </p>
        <div className="comp-bar comp-bar-single" aria-hidden="true">
          <span data-tone="explorer" />
        </div>
      </div>
    );
  }
  const parts = [
    { tone: "explorer", count: row.explorers, label: "Explorers" },
    { tone: "pareto", count: row.pareto, label: "Non-dominated parents" },
    { tone: "diversity", count: row.diversity, label: "Diversity parents" },
  ];
  return (
    <ul className="mix-rows">
      {parts.map((part) => (
        <li key={part.tone} data-tone={part.tone}>
          <span className="mix-row-label">{part.label}</span>
          <strong>{shareLabel(part.count, row.total)}</strong>
          <span className="mix-row-track" aria-hidden="true">
            <span style={{ width: shareLabel(part.count, row.total) }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ThumbRow({ items, label }: { items: EvolutionCandidateView[]; label: string }) {
  if (items.length === 0) return <p className="spine-empty">Morphologies appear here after this generation is saved.</p>;
  return (
    <ul className="spine-thumbs" aria-label={label}>
      {items.map((candidate) => (
        <li key={candidate.key}>
          <EvolutionImage src={candidate.image} />
        </li>
      ))}
    </ul>
  );
}

function GhNode({
  title,
  kind,
  info,
  children,
}: {
  title: string;
  kind: string;
  info?: { label: string; sections: ExplainSection[] };
  children: ReactNode;
}) {
  return (
    <article className="gh-node" data-kind={kind}>
      <header>
        <h2>{title}</h2>
        {info ? <MetricInfo label={info.label} sections={info.sections} /> : null}
      </header>
      <div className="gh-body">{children}</div>
    </article>
  );
}

function SourceCopy({ children }: { children: string }) {
  return <p className="source-copy">{children}</p>;
}

function MooFrame({ rich = false }: { rich?: boolean }) {
  if (!rich) {
    return (
      <GhNode title="MOO" kind="moo-mini">
        <ol className="moo-mini">
          <li>Archives</li>
          <li>Mutation + explorers</li>
        </ol>
      </GhNode>
    );
  }
  return (
    <GhNode title="Multi-objective optimization" kind="moo" info={{ label: "Multi-objective optimization", sections: EXPLAIN.moo }}>
      <div className="moo-triad" aria-hidden="true">
        <span>Formal</span>
        <span>Atmospheric</span>
        <i />
        <span>Spatial</span>
      </div>
      <ol className="moo-steps">
        <li>Evaluate every morphology</li>
        <li>Non-dominated comparison</li>
      </ol>
      <div className="moo-split">
        <span>Non-dominated</span>
        <span>Diversity</span>
      </div>
    </GhNode>
  );
}

const CHART_X = [8, 36, 64, 92];
const CHART_TOP = 8;
const CHART_BOTTOM = 78;

function chartY(fraction: number) {
  return CHART_BOTTOM - fraction * (CHART_BOTTOM - CHART_TOP);
}

function chartBand(upper: number[], lower: number[]) {
  const forward = upper.map((value, index) => `${index === 0 ? "M" : "L"}${CHART_X[index]},${chartY(value)}`).join(" ");
  const back = [...lower].reverse().map((value, index) => `L${CHART_X[CHART_X.length - 1 - index]},${chartY(value)}`).join(" ");
  return `${forward} ${back} Z`;
}

function StrategyChart() {
  const fractions = MIX.map((row) => ({
    id: row.id,
    explorer: row.explorers / row.total,
    pareto: row.pareto / row.total,
    diversity: row.diversity / row.total,
  }));
  const explorer = fractions.map((row) => row.explorer);
  const pareto = fractions.map((row) => row.explorer + row.pareto);
  const full = fractions.map(() => 1);
  const base = fractions.map(() => 0);
  return (
    <GhNode title="Population composition across generations" kind="chart" info={{ label: "Why the mix changes", sections: EXPLAIN.strategy }}>
      <div className="strategy-layout">
        <svg className="strategy-area" viewBox="0 0 100 92" role="img" aria-label="Explorer share falls from generation 01 to generation 04 while inherited shares rise">
          <path d={chartBand(full, pareto)} data-tone="diversity" />
          <path d={chartBand(pareto, explorer)} data-tone="pareto" />
          <path d={chartBand(explorer, base)} data-tone="explorer" />
          {fractions.map((row, index) => (
            <text key={row.id} x={CHART_X[index]} y="90" textAnchor="middle">
              {row.id}
            </text>
          ))}
        </svg>
        <ul className="strategy-legend">
          <li data-tone="explorer">Explorers · 100 → 30</li>
          <li data-tone="pareto">Non-dominated parents · 0 → 52</li>
          <li data-tone="diversity">Diversity parents · 0 → 18</li>
        </ul>
      </div>
      <p className="strategy-read">Exploration decreases. Refinement increases. Explorers remain through generation 04.</p>
    </GhNode>
  );
}

function VoidPile({ urls }: { urls: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || urls.length === 0) return;
    let cancelled = false;
    const images = urls.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    const draw = () => {
      if (cancelled || !ref.current || !ref.current.parentElement) return;
      const node = ref.current;
      const parent = node.parentElement;
      if (!parent) return;
      const box = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(box.width));
      const height = Math.max(1, Math.floor(box.height));
      node.width = Math.floor(width * dpr);
      node.height = Math.floor(height * dpr);
      const ctx = node.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      const ready = images.filter((img) => img.complete && img.naturalWidth > 0);
      const count = ready.length;
      if (!count) return;
      const yaw = 0.86;
      const pitch = 0.35;
      const meshYaw = 0.7;
      const pitchY = 0.18;
      const full = (count - 1) * pitchY;
      const cy = Math.cos(meshYaw);
      const sy = Math.sin(meshYaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const rot = (x: number, y: number, z: number) => {
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
      };
      const yBottom = -full * 0.5;
      const yTop = yBottom + full;
      const plateCorners = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].map((z) => [x, z] as const));
      const bounds = [yBottom, yTop].flatMap((y) => plateCorners.map(([x, z]) => rot(x, y, z)));
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const point of bounds) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      const spanX = Math.max(0.001, maxX - minX);
      const spanY = Math.max(0.001, maxY - minY);
      const side = width * 0.18;
      const end = height * 0.05;
      const scale = Math.min((width - side * 2) / spanX, (height - end * 2) / spanY);
      const xMid = (minX + maxX) / 2;
      const yMid = (minY + maxY) / 2;
      const du = rot(1, 0, 0);
      const dv = rot(0, 0, 1);
      const order = ready.map((_, index) => index).sort(
        (a, b) => rot(0, a * pitchY - full * 0.5, 0).z - rot(0, b * pitchY - full * 0.5, 0).z,
      );
      for (const index of order) {
        const origin = rot(-0.5, index * pitchY - full * 0.5, -0.5);
        const near = index === count - 1;
        ctx.save();
        ctx.setTransform(
          dpr * du.x * scale,
          dpr * -du.y * scale,
          dpr * dv.x * scale,
          dpr * -dv.y * scale,
          dpr * (width / 2 + (origin.x - xMid) * scale),
          dpr * (height / 2 - (origin.y - yMid) * scale),
        );
        ctx.globalAlpha = near ? 0.2 : 0.08;
        ctx.fillStyle = "#f2f2ee";
        ctx.fillRect(0, 0, 1, 1);
        ctx.globalAlpha = near ? 1 : 0.55;
        ctx.drawImage(ready[index], 0, 0, 1, 1);
        ctx.globalAlpha = near ? 0.95 : 0.35;
        ctx.strokeStyle = near ? "rgba(199,126,95,1)" : "rgba(242,242,238,0.7)";
        ctx.lineWidth = near ? 0.012 : 0.006;
        ctx.strokeRect(0, 0, 1, 1);
        ctx.restore();
      }
    };
    void Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [urls]);
  return <canvas ref={ref} className="so-pile" />;
}

function ParetoPlot({ candidates }: { candidates: EvolutionCandidateView[] }) {
  const points = candidates
    .map((candidate) => ({ candidate, ...projectPreview([candidate.formal, candidate.spatial, candidate.atmospheric]) }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <svg className="handoff-plot" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pareto archive in Formal, Spatial, and Atmospheric space">
      {CUBE_EDGES.map(([from, to], index) => {
        const a = projectPreview(from);
        const b = projectPreview(to);
        return <line key={index} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-cube" />;
      })}
      {AXES.map((axis) => {
        const origin = projectPreview([0, 0, 0]);
        const end = projectPreview(axis.to);
        return (
          <g key={axis.label}>
            <line x1={origin.sx} y1={origin.sy} x2={end.sx} y2={end.sy} className="pareto-axis" />
            <text x={end.sx} y={end.sy} className="pareto-axis-label" textAnchor="middle" dy={-1.2}>
              {axis.label}
            </text>
          </g>
        );
      })}
      {points.map(({ candidate, sx, sy, depth }) => {
        const state = pointState(candidate);
        const radius = { dominated: 0.7, pareto: 1, archive: 1.35 }[state] * (0.85 + depth * 0.3);
        return <circle key={candidate.key} cx={sx} cy={sy} r={radius} className="pareto-point" data-state={state} />;
      })}
    </svg>
  );
}

function GenRing({ title, slices }: { title: string; slices: { id: string; tone: string; value: number }[] }) {
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let cursor = 0;
  return (
    <div className="evo-ring evo-gen-ring">
      <p className="evo-ring-title">{title}</p>
      <span className="evo-ring-plot">
        <svg viewBox="0 0 42 42" aria-hidden="true">
          <circle className="evo-donut-track" cx="21" cy="21" r={radius} />
          {slices.map((slice) => {
            const share = (slice.value / total) * circumference;
            const arc = (
              <circle
                key={slice.id}
                cx="21"
                cy="21"
                r={radius}
                data-tone={slice.tone}
                strokeDasharray={`${share} ${circumference - share}`}
                strokeDashoffset={-cursor}
              />
            );
            cursor += share;
            return arc;
          })}
        </svg>
      </span>
    </div>
  );
}

export function ProcessIntro({ initial, picks }: { initial: EvolutionCatalog; picks: SavedPick[] }) {
  const catalog = useEvolutionCatalog(initial);
  const archetype = catalog.archetypes.find((item) => item.archetypeId === EXAMPLE_ID) ?? null;
  const candidates = archetype?.candidates ?? [];
  const paretoHref = useWorkflowHref(labWorkspace("optimization").tabs[1].href);
  const hybridHref = useWorkflowHref(labWorkspace("optimization").tabs[2].href);
  const selections = useSkill2Selections();
  const selection = selections[EXAMPLE_ID] ?? null;
  const filedPick = (archetypeId: string) => picks.find((pick) => pick.archetypeId === archetypeId);
  const withImage = candidates.filter((candidate) => candidate.image);
  const nonDominated = withImage.find((candidate) => candidate.pareto || candidate.archived) ?? null;
  const diversityKept =
    withImage.find(
      (candidate) =>
        candidate.diversity === "tag" ||
        candidate.diversity === "rescue" ||
        candidate.preservationRoles?.includes("diversity"),
    ) ?? null;
  const voidShots = withImage.map((candidate) => candidate.image as string);
  const physarumField = voidShots[0] ?? null;
  const physarumCatalog = Array.from({ length: 6 }, (_, index) => voidShots[index + 1] ?? null);
  const voidPickId = selection?.candidateId ?? filedPick(EXAMPLE_ID)?.candidateId;
  const savedPicks = TYPOLOGIES.flatMap((typology) =>
    typology.archetypes.map((item) => {
      const saved = selections[item.id];
      const filed = filedPick(item.id);
      const candidateId = saved?.candidateId ?? filed?.candidateId;
      const objectives = saved?.objectives ?? (filed ? { formal: filed.formal, spatial: filed.spatial, atmospheric: filed.atmospheric } : null);
      const run = catalog.archetypes.find((entry) => entry.archetypeId === item.id);
      const plate = candidateId != null ? run?.candidates.find((candidate) => candidate.id === candidateId) : undefined;
      const image = plate?.image ?? (saved ? selectionPreviewSrc(saved) : null) ?? (candidateId != null ? `/api/evolution/${item.id}/${candidateId}` : null);
      return {
        id: item.id,
        name: item.name,
        image,
        picked: candidateId != null,
        meta: objectives
          ? `#${String(candidateId).padStart(3, "0")} · F ${objectives.formal.toFixed(2)} · S ${objectives.spatial.toFixed(2)} · A ${objectives.atmospheric.toFixed(2)}`
          : "Not selected",
      };
    }),
  );
  const rememberVerticalVoid = () => {
    window.sessionStorage.setItem(ARCHETYPE_STORAGE_KEY, EXAMPLE_ID);
  };

  return (
    <main className="evo-page process-page">
      <div className="lab-tools">
        <p className="eyebrow">Vertical Void · Physarum logic, four generations, then one morphology for vertical propagation</p>
      </div>
      <div className="gh-canvas">
        <section className="gh-group gh-source" aria-label="Physarum logic">
          <p className="gh-group-label">Physarum logic</p>
          <article className="source-stage">
            <h2>Architectural input</h2>
            <p className="brief-path">
              <span>Lobby</span>
              <span>Vertical Void</span>
            </p>
            <SourceCopy>Three categories of analysis. Formal, Spatial, and Atmospheric are what the translation receives.</SourceCopy>
            <ul className="brief-chart">
              {SOURCE_GROUPS.map((group) => {
                const average = group.criteria.reduce((sum, criterion) => sum + criterion.value, 0) / group.criteria.length;
                const level = Math.round(average);
                return (
                  <li key={group.id} data-kind={group.id}>
                    <span className="brief-meter" aria-hidden="true">
                      {[0, 1, 2].map((step) => (
                        <i key={step} data-on={step <= level || undefined} />
                      ))}
                    </span>
                    <strong>{group.title}</strong>
                    <em>{EXAMPLE?.descriptors[group.id]}</em>
                    <span>{RATING_LABEL[level as 0 | 1 | 2]}</span>
                  </li>
                );
              })}
            </ul>
          </article>
          <span className="source-arrow" aria-hidden="true" />
          <article className="source-stage">
            <h2>Biological translation</h2>
            <SourceCopy>The ratings become Physarum behaviour. This field is one drawing from the Vertical Void catalog.</SourceCopy>
            <p className="eyebrow source-field-label">Vertical Void</p>
            <div className="source-field glass-plate">
              {physarumField ? <img src={physarumField} alt="" /> : null}
            </div>
          </article>
          <span className="source-arrow" aria-hidden="true" />
          <article className="source-stage">
            <h2>Catalog</h2>
            <SourceCopy>Iterations from the Vertical Void catalog. Generation 01 opens from this kind of morphology.</SourceCopy>
            <ul className="source-catalog">
              {physarumCatalog.map((src, index) => (
                <li key={src ?? `empty-${index}`} className="glass-plate" data-chosen={src != null && voidPickId != null && src.includes(`/${EXAMPLE_ID}/${voidPickId}`) || undefined}>
                  {src ? <img src={src} alt="" /> : null}
                </li>
              ))}
            </ul>
            <Link href={hybridHref} className="process-open source-catalog-link" onClick={rememberVerticalVoid}>
              Open Vertical Void catalog
            </Link>
          </article>
        </section>

        <section className="gh-group gh-evolution" aria-label="Evolutionary process">
          <header className="evo-logic-head">
            <div>
              <p className="eyebrow">02</p>
              <h2 className="panel-title">Evolutionary process</h2>
            </div>
            <span>Vertical Void</span>
          </header>
          <div className="evo-gen-board">
            {MIX.map((row, index) => {
              const cohort = candidates.filter((candidate) => candidate.generation === row.generation && candidate.image);
              const shot =
                cohort.find((candidate) => candidate.pareto || candidate.archived) ??
                cohort[0] ??
                null;
              const shares = [
                ["explorer", "Explorers", row.explorers],
                ["pareto", "Non-dominated", row.pareto],
                ["diversity", "Diversity", row.diversity],
              ] as const;
              return (
                <article key={row.id} className="evo-gen-frame">
                  <header>
                    <p className="eyebrow">{GENERATION_ROLE[index].title}</p>
                    <h2>Generation {String(row.generation).padStart(2, "0")}</h2>
                  </header>
                  <p className="evo-gen-why">{GENERATION_ROLE[index].why}</p>
                  <figure className="evo-gen-shot glass-plate">
                    <EvolutionImage src={shot?.image ?? null} />
                  </figure>
                  <ul className="evo-gen-mix">
                    {shares.map(([tone, label, count]) => (
                      <li key={tone} data-tone={tone}>
                        <span>{label}</span>
                        <b>{row.generation === 1 && tone !== "explorer" ? "—" : shareLabel(count, row.total)}</b>
                        <i>
                          <b style={{ width: shareLabel(count, row.total) }} />
                        </i>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="gh-group gh-output" aria-label="Optimization output">
          <div className="so">
            <header className="so-head">
              <h2>Optimization output</h2>
              <p>The Pareto front, the roles that keep a morphology, and the human selection.</p>
            </header>
            <div className="so-top">
              <article className="so-panel">
                <header>
                  <div>
                    <h3>Pareto</h3>
                    <p>The non-dominated set, continued on the Pareto tab.</p>
                  </div>
                  <MetricInfo label="Pareto" sections={EXPLAIN.pareto} />
                </header>
                <Link href={paretoHref} className="so-plot" aria-label="Open the Pareto graph" onClick={rememberVerticalVoid}>
                  <ParetoCloud candidates={candidates} />
                </Link>
                <ul className="pareto-legend so-plot-key">
                  <li data-state="dominated">Dominated</li>
                  <li data-state="pareto">Non-dominated</li>
                  <li data-state="archive">Kept</li>
                </ul>
              </article>
              <article className="so-panel so-roles">
                <header>
                  <div>
                    <h3>Preservation roles</h3>
                    <p>Specialists are off. A morphology is kept for one of these roles.</p>
                  </div>
                  <MetricInfo label="Preservation roles" sections={EXPLAIN.preservation} />
                </header>
                <ul className="so-role-list">
                  <li data-tone="pareto">
                    <strong>Non-dominated</strong>
                    <p>Nothing else is at least as strong on all three objectives and stronger on one.</p>
                    <span className="so-well glass-plate">
                      <EvolutionImage src={nonDominated?.image ?? null} />
                    </span>
                  </li>
                  <li data-tone="diversity">
                    <strong>Morphological diversity</strong>
                    <p>The phenotype sits apart from the morphologies already kept, so the catalog does not collapse to one shape.</p>
                    <span className="so-well glass-plate">
                      <EvolutionImage src={diversityKept?.image ?? null} />
                    </span>
                  </li>
                </ul>
              </article>
            </div>
            <span className="source-arrow" aria-hidden="true" />
            <div className="so-bottom">
              <article className="so-panel">
                <header>
                  <div>
                    <h3>Human selection</h3>
                    <p>Saved drawings, one for each archetype, with the scores from the search.</p>
                  </div>
                  <MetricInfo label="Human selection" sections={EXPLAIN.selection} />
                </header>
                <ul className="so-saved">
                  {savedPicks.map((item) => (
                    <li key={item.id}>
                      <span className="glass-plate" data-chosen={item.picked || undefined}>
                        <EvolutionImage src={item.image} />
                      </span>
                      <em>{item.name}</em>
                      <small>{item.meta}</small>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
