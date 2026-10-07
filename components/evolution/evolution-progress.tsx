"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Panel, PanelHeader } from "@/components/hud";
import { useViewMode } from "@/components/view-mode";
import {
  ArchetypeSwitch,
  EvolutionImage,
  formatCandidateId,
  useEvolutionCatalog,
  useSelectedArchetype,
} from "@/components/evolution/evolution-data";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { SearchStats } from "@/components/evolution/search-stats";
import { ParetoAnalyticsBand } from "@/components/evolution/pareto-analytics-band";
import { archiveTurnover, generationAnalytics } from "@/lib/skill2/pareto-analytics";
import type { EvolutionCandidateView, EvolutionCatalog, EvolutionGenerationView } from "@/lib/skill2/evolution-index";

/** Same opening camera as the Pareto page, so this thumbnail matches that view. */
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

function ParetoDestination({
  candidates,
  generations,
  archiveCandidates,
}: {
  candidates: EvolutionCandidateView[];
  generations: EvolutionGenerationView[];
  archiveCandidates: EvolutionCandidateView[];
}) {
  const href = useWorkflowHref("/evolution/pareto");
  const presentation = useViewMode() === "presentation";
  const [focus, setFocus] = useState<number | null>(null);
  const evidence = useMemo(() => {
    const done = generations.filter((generation) => generation.status === "done");
    const archives = done.map((generation) => ({ index: generation.index, archiveIds: generation.archiveIds }));
    const byId = new Map(
      archiveCandidates.map((candidate) => [
        candidate.id,
        { id: candidate.id, formal: candidate.formal, spatial: candidate.spatial, atmospheric: candidate.atmospheric },
      ]),
    );
    return {
      series: generationAnalytics(archives, byId),
      turnovers: archives
        .slice(1)
        .map((item, index) => archiveTurnover(archives[index].archiveIds, item.archiveIds, archives[index].index, item.index)),
    };
  }, [generations, archiveCandidates]);
  const points = candidates
    .map((candidate) => ({ candidate, ...projectPreview([candidate.formal, candidate.spatial, candidate.atmospheric]) }))
    .sort((a, b) => a.depth - b.depth);
  const plot = (
    <svg className="evo-pareto-plot" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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
        const radius = { dominated: 0.7, pareto: 1, archive: 1.2 }[state] * (0.85 + depth * 0.3);
        return <circle key={candidate.key} cx={sx} cy={sy} r={radius} className="pareto-point" data-state={state} />;
      })}
    </svg>
  );
  const legend = (
    <ul className="pareto-legend evo-destination-legend">
      <li data-state="dominated">Dominated</li>
      <li data-state="pareto">Pareto</li>
      <li data-state="archive">Archive</li>
    </ul>
  );
  const header = (
    <header className="evo-destination-head">
      <div>
        <p className="eyebrow">Next · Objective space</p>
        <h2 className="panel-title">Pareto</h2>
      </div>
      <span className="evo-destination-open" aria-hidden="true">Open</span>
    </header>
  );

  if (presentation) {
    return (
      <div className="panel evo-destination">
        {header}
        {points.length === 0 ? (
          <p className="evo-empty">The final front appears here after a generation is saved.</p>
        ) : (
          <div className="evo-destination-plot">
            <ParetoAnalyticsBand
              series={evidence.series}
              turnovers={evidence.turnovers}
              focus={focus}
              membership={null}
              onFocus={setFocus}
              onPick={setFocus}
              onMembership={() => {}}
            />
            <Link href={href} className="evo-pareto-open" aria-label="Open Pareto">
              {plot}
            </Link>
          </div>
        )}
        {legend}
      </div>
    );
  }

  return (
    <Link href={href} className="panel evo-destination" aria-label="Open Pareto">
      {header}
      {points.length === 0 ? (
        <p className="evo-empty">The final front appears here after a generation is saved.</p>
      ) : (
        <div className="evo-destination-plot">{plot}</div>
      )}
      {legend}
    </Link>
  );
}

function CatalogDestination({ archive }: { archive: EvolutionCandidateView[] }) {
  const href = useWorkflowHref("/evolution/pareto-catalog");
  const thumbs = archive.filter((candidate) => candidate.image).slice(0, 72);

  return (
    <Link href={href} className="panel evo-destination" aria-label="Open Pareto Catalog">
      <header className="evo-destination-head">
        <div>
          <p className="eyebrow">Next · Nondominated archive</p>
          <h2 className="panel-title">Pareto Catalog</h2>
        </div>
        <span className="evo-destination-open" aria-hidden="true">Open</span>
      </header>
      {thumbs.length === 0 ? (
        <p className="evo-empty">Archive morphologies appear here after a generation is saved.</p>
      ) : (
        <ul className="evo-mosaic" aria-hidden="true">
          {thumbs.map((candidate) => (
            <li key={candidate.key}>
              <EvolutionImage src={candidate.image} />
            </li>
          ))}
        </ul>
      )}
      <p className="eyebrow evo-destination-caption">
        {archive.length === 0 ? "No alternatives yet" : `${archive.length} alternatives`}
      </p>
    </Link>
  );
}

export function EvolutionProgress({ initial }: { initial: EvolutionCatalog }) {
  const catalog = useEvolutionCatalog(initial);
  const { archetype, select } = useSelectedArchetype(catalog);
  const generations = archetype?.generations ?? [];
  const completed = generations.filter((generation) => generation.status === "done");
  const [focus, setFocus] = useState<number | null>(null);
  const selected = completed.find((generation) => generation.index === focus) ?? completed[completed.length - 1] ?? null;
  const preview =
    archetype?.candidates.find((candidate) => candidate.image && candidate.generation === selected?.index && candidate.archived) ??
    archetype?.candidates.find((candidate) => candidate.image && candidate.generation === selected?.index) ??
    archetype?.candidates.find((candidate) => candidate.image) ??
    null;
  const cohort = archetype?.candidates.filter((candidate) => candidate.generation === selected?.index) ?? [];
  const archive = archetype?.candidates.filter((candidate) => candidate.archived && candidate.image) ?? [];

  return (
    <main className="evo-page" style={{ ["--evo-cols" as string]: Math.max(generations.length, 1) }}>
      <EvolutionHeader
        title="Evolutionary Search"
        detail={
          archetype
            ? `${archetype.name} · ${archetype.generationCount} generations · ${archetype.populationSize} candidates per generation · Formal / Spatial / Atmospheric`
            : "No searches yet. A completed generation appears here automatically."
        }
        aside={<ArchetypeSwitch catalog={catalog} archetypeId={archetype?.archetypeId ?? null} onChange={select} />}
      />

      <ol
        className="evo-generations"
        aria-label="Generations"
        style={{ gridTemplateColumns: `repeat(${Math.max(generations.length, 1)}, minmax(0, 1fr))` }}
      >
        {generations.map((generation) => {
          const thumb = archetype?.candidates.find((candidate) => candidate.image && candidate.generation === generation.index);
          const done = generation.status === "done";
          return (
            <li key={generation.id}>
              <button
                type="button"
                className="evo-generation"
                data-status={generation.status}
                data-selected={done && generation.index === selected?.index ? "" : undefined}
                disabled={!done}
                aria-pressed={done ? generation.index === selected?.index : undefined}
                onClick={() => setFocus(generation.index)}
              >
                <span className="evo-generation-thumb" aria-hidden="true">
                  {done ? <EvolutionImage src={thumb?.image ?? null} /> : null}
                </span>
                <span className="evo-generation-text">
                  <span className="display evo-generation-id">{generation.id}</span>
                  <span className="evo-generation-status">{done ? "Complete" : "Waiting"}</span>
                  <span className="evo-generation-bar" aria-hidden="true">
                    <span style={{ width: `${archetype ? (generation.evaluated / archetype.populationSize) * 100 : 0}%` }} />
                  </span>
                  <span className="evo-generation-meta">
                    {done ? (
                      <>
                        <span>{generation.pareto} Pareto</span>
                        <span>{generation.archived} archived</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="evo-main">
        <Panel className="evo-active">
          <PanelHeader
            kicker="This run"
            title={selected ? selected.id : "Waiting"}
            aside={<span className="eyebrow">{archetype?.name ?? ""}</span>}
          />
          <div className="evo-active-body">
            <SearchStats
              generations={generations}
              candidates={archetype?.candidates ?? []}
              selectedIndex={selected?.index ?? null}
              onSelect={setFocus}
            />
          </div>
        </Panel>

        <Panel className="evo-preview">
          <PanelHeader
            kicker="Current morphology"
            title={preview ? formatCandidateId(preview.id) : "None yet"}
            aside={<span className="eyebrow">{archetype?.name ?? ""}</span>}
          />
          <div className="evo-preview-frame">
            <EvolutionImage src={preview?.image ?? null} />
          </div>
          <p className="eyebrow evo-preview-caption">
            {selected ? `Nondominated morphology from ${selected.id}` : "Nondominated morphology from the latest saved generation"}
          </p>
        </Panel>

        <div className="evo-next">
          <ParetoDestination candidates={cohort} generations={generations} archiveCandidates={archetype?.candidates ?? []} />
          <CatalogDestination archive={archive} />
        </div>
      </div>
    </main>
  );
}
