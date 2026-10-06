"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MetricInfo, type ExplainSection } from "@/components/evolution/metric-info";
import { ParetoCloud } from "@/components/evolution/pareto-space";
import { EvolutionImage, useEvolutionCatalog } from "@/components/evolution/evolution-data";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { BRANCHES, TYPOLOGIES } from "@/lib/catalog";
import type { EvolutionCandidateView, EvolutionCatalog, EvolutionGenerationView } from "@/lib/skill2/evolution-index";
import { newGenerationMix } from "@/lib/skill2/specialists";

const EXAMPLE_ID = "void-edge";

const RATING_LABEL = ["Low", "Medium", "High"] as const;

const VOID_EDGE = TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === EXAMPLE_ID);

const SOURCE_GROUPS = BRANCHES.map((branch) => ({
  id: branch.id,
  title: branch.title,
  criteria: [...branch.shared, branch.specific.workspace].map((criterion) => ({
    id: criterion.id,
    label: criterion.label,
    value: VOID_EDGE?.ratings[criterion.id] ?? 0,
  })),
}));

const SPECIALIST_COPY = {
  formal: "Favoring formal performance",
  spatial: "Favoring spatial performance",
  atmospheric: "Favoring atmospheric performance",
} as const;

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
  specialist: number;
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
      label: "Specialist preference archive",
      text: "Specialists sit beside the Pareto archive. Each one favors Formal, Spatial, or Atmospheric, while the other two scores stay above a floor. At most four occupy each direction. This preference archive keeps those directions available as parents.",
    },
  ],
  strategy: [
    {
      label: "Broad search",
      text: "Generation 01 is a broad sample. All 80 new morphologies are explorers drawn from the Physarum catalog for this archetype.",
    },
    {
      label: "Increasing refinement",
      text: "Each later generation gives more of the 80 new candidates to mutants of the Pareto archive and the specialist preference archive. The search spends more of the population on regions that have already produced non-dominated solutions.",
    },
    {
      label: "Exploration remains",
      text: "The explorer share shrinks and stays present through generation 04. A late discovery can still enter the archives.",
    },
  ],
  carried: [
    {
      label: "Outside the 80",
      text: "After each optimization, the Pareto archive and the specialist preference archive continue into the next generation. They are carried as elites. They are not evaluated again inside the 80 new candidates.",
    },
    {
      label: "What the bar shows",
      text: "The composition bar is only the new population: explorers, Pareto-parent mutants, and specialist-parent mutants. Carried elites sit on their own line.",
    },
  ],
  pareto: [
    {
      label: "Objective space",
      text: "Each point is an evaluated Void Edge morphology, placed by its Formal, Spatial, and Atmospheric scores. Terracotta marks the Pareto archive.",
    },
    {
      label: "What the archive contains",
      text: "The archive is the globally non-dominated set. Extreme solutions remain when nothing else dominates them.",
    },
  ],
  specialist: [
    {
      label: "Three directions",
      text: "The specialist preference archive keeps morphologies that favor Formal, Spatial, or Atmospheric. A morphology is assigned to one direction. This set is not a second Pareto front.",
    },
  ],
  selection: [
    {
      label: "One per archetype",
      text: "A person chooses one morphology from the hybrid catalog for each archetype. Fifteen archetypes produce fifteen selected 2D morphologies.",
    },
    {
      label: "Handoff",
      text: "The chosen section is the base vertical propagation grows through successive states.",
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

function scheduledMix(generation: number): MixRow {
  const mix = newGenerationMix(generation);
  const total = mix.mutants + mix.explorers;
  const specialist = mix.mutants === 0 ? 0 : Math.floor(mix.mutants / 4);
  return {
    id: `G${String(generation).padStart(2, "0")}`,
    generation,
    explorers: mix.explorers,
    pareto: mix.mutants - specialist,
    specialist,
    total,
  };
}

const MIX: MixRow[] = [1, 2, 3, 4].map((generation) => scheduledMix(generation));

const GENERATION_ROLE = [
  {
    title: "Open the space",
    why: "Nothing has been scored, so every new candidate is an explorer from the Physarum catalog. No elites exist yet to inherit from.",
  },
  {
    title: "Begin refinement",
    why: "Elites from the first generation parent a minority of mutants. Most candidates still explore, so the search does not collapse onto one region.",
  },
  {
    title: "Hold both",
    why: "The archive is established. New candidates are split evenly between explorers and mutants of those elites.",
  },
  {
    title: "Concentrate",
    why: "Mutants of the elites become the majority. Explorers remain so a late discovery can still enter. The search then stops.",
  },
];

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
    { tone: "pareto", count: row.pareto, label: "Pareto-parent mutants" },
    { tone: "specialist", count: row.specialist, label: "Specialist-parent mutants" },
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

function CarriedElites({
  generation,
  previous,
}: {
  generation: number;
  previous: EvolutionGenerationView | undefined;
}) {
  if (generation === 1) {
    return (
      <div className="carried">
        <p className="comp-kicker">Carried elites</p>
        <p className="carried-note">None. This is the first population from the Physarum catalog.</p>
      </div>
    );
  }
  const count = previous?.archived ?? 0;
  return (
    <div className="carried">
      <div className="carried-head">
        <p className="comp-kicker">Carried elites</p>
        <MetricInfo label="Carried elites" sections={EXPLAIN.carried} />
      </div>
      <p className="carried-chips">
        <span data-tone="pareto">{count > 0 ? `${count} Pareto` : "Pareto archive"}</span>
        <span data-tone="specialist">Specialist preference</span>
      </p>
    </div>
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
        <span>Pareto archive</span>
        <span>Specialist preference</span>
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
    specialist: row.specialist / row.total,
  }));
  const explorer = fractions.map((row) => row.explorer);
  const pareto = fractions.map((row) => row.explorer + row.pareto);
  const full = fractions.map(() => 1);
  const base = fractions.map(() => 0);
  return (
    <GhNode title="Population composition across generations" kind="chart" info={{ label: "Why the mix changes", sections: EXPLAIN.strategy }}>
      <div className="strategy-layout">
        <svg className="strategy-area" viewBox="0 0 100 92" role="img" aria-label="Explorer share falls from generation 01 to generation 04 while mutant shares rise">
          <path d={chartBand(full, pareto)} data-tone="specialist" />
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
          <li data-tone="pareto">Pareto-parent mutants · 0 → 52.5</li>
          <li data-tone="specialist">Specialist-parent mutants · 0 → 17.5</li>
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
      const parentEl = node.parentElement;
      if (!parentEl) return;
      const box = parentEl.getBoundingClientRect();
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
      const pitchY = 0.04 + 0.1 * 0.42;
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
      const bounds = [rot(-0.5, yBottom, -0.5), rot(0.5, yBottom, 0.5), rot(-0.5, yTop, -0.5), rot(0.5, yTop, 0.5)];
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
      const scale = Math.min(width, height) * 0.72;
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

export function ProcessIntro({ initial, catalogImages: catalogImagesFromServer = [] }: { initial: EvolutionCatalog; catalogImages?: string[] }) {
  const catalog = useEvolutionCatalog(initial);
  const archetype = catalog.archetypes.find((item) => item.archetypeId === EXAMPLE_ID) ?? null;
  const candidates = archetype?.candidates ?? [];
  const generations = archetype?.generations ?? [];
  const catalogHref = useWorkflowHref("/lab/physarum/catalog");
  const paretoHref = useWorkflowHref("/lab/evolution/pareto");
  const hybridHref = useWorkflowHref("/lab/evolution/pareto-catalog");
  const verticalHref = useWorkflowHref("/lab/evolution/pareto-catalog");
  const [catalogImages, setCatalogImages] = useState<string[]>(catalogImagesFromServer);
  useEffect(() => {
    if (catalogImagesFromServer.length > 0) return;
    let cancelled = false;
    void fetch("/shared-catalog/void-edge/entries.json")
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows)) return;
        const images = rows
          .map((row) => (row && typeof row === "object" && "image" in row ? row.image : null))
          .filter((src): src is string => typeof src === "string" && src.startsWith("/shared-catalog/"));
        setCatalogImages(images);
      })
      .catch(() => {
        if (!cancelled) setCatalogImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogImagesFromServer]);
  const fieldImage = catalogImages[0] ?? null;
  const catalogSamples = catalogImages.slice(1, 7);
  const specialists = archetype?.specialists ?? { formal: [], spatial: [], atmospheric: [] };
  const combined = [
    ...candidates.filter((candidate) => candidate.archived && candidate.image),
    ...candidates.filter((candidate) => candidate.specialist && candidate.image),
  ];
  const specialistSamples = (["formal", "spatial", "atmospheric"] as const)
    .map((key) => candidates.find((candidate) => candidate.specialist === key && candidate.image))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null);
  const sampled = new Set(specialistSamples.map((candidate) => candidate.key));
  const strip = [
    ...specialistSamples,
    ...candidates.filter((candidate) => candidate.archived && candidate.image && !sampled.has(candidate.key)),
  ].slice(0, 10);
  const specialistShot = (key: "formal" | "spatial" | "atmospheric") => {
    const ids = new Set(specialists[key]);
    return candidates.find((candidate) => ids.has(candidate.id) && candidate.image) ?? null;
  };
  const picks = TYPOLOGIES.flatMap((typology) => typology.archetypes).map((item) => {
    const run = catalog.archetypes.find((entry) => entry.archetypeId === item.id);
    const chosen = run?.candidates.find((candidate) => candidate.image && (candidate.archived || candidate.specialist)) ?? null;
    return { id: item.id, name: item.name, chosen };
  });
  const pile = candidates.filter((candidate) => candidate.image && candidate.archetypeId === EXAMPLE_ID).slice(0, 8).map((candidate) => candidate.image as string);

  return (
    <main className="evo-page process-page">
      <EvolutionHeader title="2D Evolution · Process" detail="Void Edge · the search starts from Physarum logic and hands one morphology onward" />
      <div className="gh-canvas">
        <section className="gh-group gh-source" aria-label="Physarum logic">
          <p className="gh-group-label">Physarum logic</p>
          <article className="source-stage">
            <h2>Architectural input</h2>
            <p className="brief-path">
              <span>Workspace</span>
              <span>Void Edge</span>
            </p>
            <SourceCopy>The ratings collapse into three locked conditions. These are what the translation receives.</SourceCopy>
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
                    <em>{VOID_EDGE?.descriptors[group.id]}</em>
                    <span>{RATING_LABEL[level as 0 | 1 | 2]}</span>
                  </li>
                );
              })}
            </ul>
          </article>
          <span className="source-arrow" aria-hidden="true" />
          <article className="source-stage">
            <h2>Biological translation</h2>
            <SourceCopy>The ratings become Physarum behaviour.</SourceCopy>
            <p className="eyebrow source-field-label">Physarum field</p>
            <div className="source-field">
              {fieldImage ? <img src={fieldImage} alt="" /> : <p className="so-missing">No current shared-catalog image for Void Edge.</p>}
            </div>
          </article>
          <span className="source-arrow" aria-hidden="true" />
          <article className="source-stage">
            <h2>Iteration generation</h2>
            <SourceCopy>The Physarum catalog samples that translation. Generation 01 opens from these morphologies.</SourceCopy>
            <ul className="source-catalog">
              {catalogSamples.length > 0 ? catalogSamples.map((src) => (
                <li key={src}>
                  <img src={src} alt="" />
                </li>
              )) : (
                <li className="so-missing">Shared catalog entries are not available.</li>
              )}
            </ul>
            <Link href={catalogHref} className="process-open source-catalog-link">
              Open Physarum catalog
            </Link>
          </article>
        </section>

        <section className="gh-group gh-evolution" aria-label="Evolutionary process">
          <header className="evo-logic-head">
            <div>
              <p className="eyebrow">2D Evolution</p>
              <h2 className="panel-title">Evolutionary process</h2>
            </div>
            <span>Void Edge</span>
          </header>
          <div className="gh-chain">
            {MIX.map((row, index) => {
              const previous = generations.find((generation) => generation.index === row.generation - 1);
              const mutant = row.pareto + row.specialist;
              const role = GENERATION_ROLE[index];
              return (
                <article key={row.id} className="gen-step" data-open={row.generation === 1 || undefined}>
                  <header>
                    <h3>{row.id}</h3>
                    <p>{role.title}</p>
                  </header>
                  <ul className="gen-mix">
                    <li data-tone="explorer">
                      <span>Explorer</span>
                      <strong>{shareLabel(row.explorers, row.total)}</strong>
                      <i><b style={{ width: shareLabel(row.explorers, row.total) }} /></i>
                    </li>
                    <li data-tone="mutant">
                      <span>Mutant</span>
                      <strong>{shareLabel(mutant, row.total)}</strong>
                      <i><b style={{ width: shareLabel(mutant, row.total) }} /></i>
                    </li>
                    <li data-tone="elite">
                      <span>Elite</span>
                      <strong>{row.generation === 1 ? "0" : String(previous?.archived ?? "—")}</strong>
                      <em>{row.generation === 1 ? "None carried" : "Carried, not re-scored"}</em>
                    </li>
                  </ul>
                  <p>{role.why}</p>
                </article>
              );
            })}
          </div>
          <div className="evo-bottom">
            <StrategyChart />
            <article className="evo-diagram">
              <h3>Each generation</h3>
              <ol>
                <li>Score Formal, Spatial, Atmospheric</li>
                <li>Keep the non-dominated</li>
                <li>Split Pareto archive and specialist preference</li>
                <li>Mutate those parents and add explorers</li>
              </ol>
            </article>
            <article className="evo-diagram">
              <h3>Elites kept</h3>
              <ul className="evo-elite-bars">
                {generations.filter((generation) => generation.status === "done").map((generation) => (
                  <li key={generation.id}>
                    <span>{generation.id}</span>
                    <i aria-hidden="true">
                      <b data-kind="archive" style={{ width: `${generation.evaluated ? (generation.archived / generation.evaluated) * 100 : 0}%` }} />
                      <b data-kind="front" style={{ width: `${generation.evaluated ? (generation.pareto / generation.evaluated) * 100 : 0}%` }} />
                    </i>
                  </li>
                ))}
              </ul>
              <p className="evo-elite-key"><span data-kind="archive">Archive</span><span data-kind="front">Generation front</span></p>
            </article>
          </div>
        </section>

        <section className="gh-group gh-output" aria-label="Search output">
            <div className="so">
            <header className="so-head">
              <h2>Search output</h2>
              <p>From the final generation to the design selection for vertical propagation.</p>
            </header>
            <div className="so-top">
              <article className="so-panel">
                <header>
                  <div>
                    <h3>Pareto archive (non-dominated)</h3>
                    <p>Final non-dominated set from G04.</p>
                  </div>
                  <span className="so-mark" aria-hidden="true">i</span>
                </header>
                <Link href={paretoHref} className="so-plot" aria-label="Open the Pareto graph">
                  <ParetoCloud candidates={candidates} />
                </Link>
                <ul className="pareto-legend so-plot-key">
                  <li data-state="dominated">Dominated</li>
                  <li data-state="pareto">Pareto</li>
                  <li data-state="archive">Archive</li>
                </ul>
              </article>
              <article className="so-panel">
                <header>
                  <div>
                    <h3>Specialist preference archive</h3>
                    <p>Non-dominated solutions with objective favoring.</p>
                  </div>
                  <span className="so-mark" aria-hidden="true">i</span>
                </header>
                <ul className="so-specs">
                  {(["formal", "spatial", "atmospheric"] as const).map((key) => (
                    <li key={key} data-kind={key}>
                      <strong>{key}</strong>
                      <span>{SPECIALIST_COPY[key]}</span>
                      <span className="so-well">
                        <EvolutionImage src={specialistShot(key)?.image ?? null} />
                      </span>
                      <em>{specialists[key].length} candidates</em>
                    </li>
                  ))}
                </ul>
                <div className="so-elite-flow">
                  <ol>
                    <li>G01</li>
                    <li>G02</li>
                    <li>G03</li>
                    <li>G04</li>
                  </ol>
                  <span className="so-flow-arrow" aria-hidden="true" />
                  <p>Optimal solutions set</p>
                  <span className="so-flow-arrow" aria-hidden="true" />
                  <ul>
                    <li data-kind="formal">Formal</li>
                    <li data-kind="spatial">Spatial</li>
                    <li data-kind="atmospheric">Atmospheric</li>
                    <li data-kind="unweighted">Pareto</li>
                  </ul>
                </div>
              </article>
            </div>
            <span className="source-arrow" aria-hidden="true" />
            <article className="so-panel so-catalog">
              <header>
                <div>
                  <h3>Combined catalog</h3>
                  <p>Elites kept from the generations: the Pareto archive, plus Formal, Spatial, and Atmospheric specialists.</p>
                </div>
                <span className="so-mark" aria-hidden="true">i</span>
              </header>
              <ul className="so-key">
                <li data-kind="unweighted">Unweighted</li>
                <li data-kind="formal">Formal</li>
                <li data-kind="spatial">Spatial</li>
                <li data-kind="atmospheric">Atmospheric</li>
              </ul>
              <Link href={hybridHref} className="so-strip" aria-label="Open the combined catalog">
                {strip.map((candidate) => (
                  <span key={candidate.key} data-kind={candidate.specialist ?? "unweighted"}>
                    <EvolutionImage src={candidate.image} />
                  </span>
                ))}
              </Link>
            </article>
            <span className="source-arrow" aria-hidden="true" />
            <div className="so-bottom">
              <article className="so-panel">
                <header>
                  <div>
                    <h3>Human selection</h3>
                    <p>No per-archetype choice is stored in the evolution run. Each thumbnail is the first saved archive or specialist image, not a recorded selection.</p>
                  </div>
                  <span className="so-mark" aria-hidden="true">i</span>
                </header>
                <ul className="so-picks">
                  {picks.map((item) => (
                    <li key={item.id}>
                      <span>
                        <EvolutionImage src={item.chosen?.image ?? null} />
                      </span>
                      <em>{item.name}</em>
                      <small>
                        {item.chosen ? "Archive sample · selection not stored" : "No saved morphology"}
                      </small>
                    </li>
                  ))}
                </ul>
              </article>
              <div className="so-panel so-fifteen">
                <h3>Vertical propagation process</h3>
                <p className="so-missing">These are saved 2D archive images. Continuations are not stored on this board.</p>
                <div className="so-pile-frame">
                  <VoidPile urls={pile} />
                </div>
                <Link href={verticalHref} className="process-open">
                  Select an archive candidate for vertical propagation
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
