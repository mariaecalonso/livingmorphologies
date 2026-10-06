"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent, type WheelEvent } from "react";
import Link from "next/link";
import { Panel, PanelHeader } from "@/components/hud";
import {
  ArchetypeSwitch,
  EvolutionImage,
  formatCandidateId,
  formatGeneration,
  useEvolutionCatalog,
  useSelectedArchetype,
} from "@/components/evolution/evolution-data";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { formatMatch } from "@/components/evolution/format-match";
import { ParetoAnalyticsBand } from "@/components/evolution/pareto-analytics-band";
import {
  archiveTurnover,
  generationAnalytics,
  type ObjectiveVector,
  type TurnoverKind,
} from "@/lib/skill2/pareto-analytics";
import type { EvolutionCandidateView, EvolutionCatalog } from "@/lib/skill2/evolution-index";

type Filter = "all" | "pareto" | "dominated";
type GenerationPick = number | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pareto", label: "Pareto" },
  { id: "dominated", label: "Dominated" },
];

const SELECTION_KEY = "lm-pareto-selected";
const CATALOG_FOCUS_KEY = "lm-pareto-candidate";

const CUBE_EDGES: [number[], number[]][] = [
  [[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]],
];

const AXES: { label: string; to: number[] }[] = [
  { label: "Formal", to: [1.16, 0, 0] },
  { label: "Spatial", to: [0, 1.16, 0] },
  { label: "Atmospheric", to: [0, 0, 1.16] },
];

/** Face grid on all six sides. The half lines are the stronger spatial reference. */
const GRID: { from: number[]; to: number[]; major: boolean }[] = [0.25, 0.5, 0.75].flatMap((t) => {
  const major = t === 0.5;
  const lines: { from: number[]; to: number[]; major: boolean }[] = [];
  for (const z of [0, 1]) {
    lines.push({ from: [t, 0, z], to: [t, 1, z], major }, { from: [0, t, z], to: [1, t, z], major });
  }
  for (const y of [0, 1]) {
    lines.push({ from: [t, y, 0], to: [t, y, 1], major }, { from: [0, y, t], to: [1, y, t], major });
  }
  for (const x of [0, 1]) {
    lines.push({ from: [x, t, 0], to: [x, t, 1], major }, { from: [x, 0, t], to: [x, 1, t], major });
  }
  return lines;
});

const KEY_AXES: { letter: string; name: string; to: number[] }[] = [
  { letter: "F", name: "Formal", to: [1, 0, 0] },
  { letter: "S", name: "Spatial", to: [0, 1, 0] },
  { letter: "A", name: "Atmospheric", to: [0, 0, 1] },
];

function useStageHref(path: string) {
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

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** X = Formal, Y = Spatial (screen up), Z = Atmospheric. */
function project([x, y, z]: number[], yaw: number, pitch: number, zoom: number) {
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

function AxisKey({ yaw, pitch }: { yaw: number; pitch: number }) {
  const origin = project([0, 0, 0], yaw, pitch, 1);
  return (
    <span className="pareto-axis-key">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        {KEY_AXES.map((axis) => {
          const end = project(axis.to, yaw, pitch, 1);
          const x2 = 20 + (end.sx - origin.sx) * 0.2;
          const y2 = 22 + (end.sy - origin.sy) * 0.2;
          const labelX = 20 + (end.sx - origin.sx) * 0.28;
          const labelY = 22 + (end.sy - origin.sy) * 0.28;
          return (
            <g key={axis.letter}>
              <line x1={20} y1={22} x2={x2} y2={y2} />
              <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle">
                {axis.letter}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="pareto-axis-key-caption">
        {KEY_AXES.map((axis) => (
          <span key={axis.letter}>
            {axis.letter} {axis.name}
          </span>
        ))}
      </span>
    </span>
  );
}

function pointState(candidate: EvolutionCandidateView, selectedKey: string | null) {
  if (candidate.key === selectedKey) return "selected";
  if (candidate.archived) return "archive";
  if (candidate.pareto) return "pareto";
  return "dominated";
}

function statusLabel(candidate: EvolutionCandidateView) {
  if (candidate.archived) return "Unweighted archive";
  if (candidate.pareto) return "Generation Pareto";
  return "Dominated";
}

export function ParetoSpace({ initial }: { initial: EvolutionCatalog }) {
  const catalog = useEvolutionCatalog(initial);
  const { archetype, select } = useSelectedArchetype(catalog);
  const catalogHref = useStageHref("/evolution/pareto-catalog");
  const reducedMotion = useReducedMotion();
  const [generation, setGeneration] = useState<GenerationPick>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [emphasis, setEmphasis] = useState<number | null>(null);
  const [membership, setMembership] = useState<{ generation: number; kind: TurnoverKind; ids: number[] } | null>(null);
  const [playback, setPlayback] = useState<{ index: number; running: boolean } | null>(null);
  const [view, setView] = useState({ yaw: -0.62, pitch: 0.42, zoom: 1.15 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    const layout = layoutRef.current;
    if (!frame || !layout) return;
    const apply = () => layout.style.setProperty("--pareto-frame", `${Math.round(frame.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(apply);
    observer.observe(frame);
    apply();
    return () => observer.disconnect();
  }, []);
  const completed = archetype?.generations.filter((item) => item.status === "done") ?? [];
  const generationCount = completed.length;

  useEffect(() => {
    setPlayback(null);
    setGeneration("all");
    setEmphasis(null);
    setMembership(null);
    setHoveredKey(null);
    const stored = window.sessionStorage.getItem(SELECTION_KEY);
    const candidates = archetype?.candidates ?? [];
    if (stored && candidates.some((candidate) => candidate.key === stored)) setSelectedKey(stored);
    else setSelectedKey(null);
  }, [archetype?.archetypeId]);

  useEffect(() => {
    if (!playback?.running || reducedMotion) return;
    const timer = window.setInterval(() => {
      setPlayback((current) => {
        if (!current?.running) return current;
        if (current.index >= generationCount) return { index: generationCount, running: false };
        return { index: current.index + 1, running: true };
      });
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playback?.running, reducedMotion, generationCount]);

  const byId = useMemo(() => {
    const map = new Map<number, ObjectiveVector>();
    for (const candidate of archetype?.candidates ?? []) {
      map.set(candidate.id, {
        id: candidate.id,
        formal: candidate.formal,
        spatial: candidate.spatial,
        atmospheric: candidate.atmospheric,
      });
    }
    return map;
  }, [archetype?.candidates]);

  const archives = useMemo(
    () => completed.map((item) => ({ index: item.index, archiveIds: item.archiveIds })),
    [completed],
  );

  const series = useMemo(() => generationAnalytics(archives, byId), [archives, byId]);
  const turnovers = useMemo(
    () =>
      archives.slice(1).map((item, index) => archiveTurnover(archives[index].archiveIds, item.archiveIds, archives[index].index, item.index)),
    [archives],
  );
  const revealed = playback?.index ?? null;
  const entrants = useMemo(() => {
    if (revealed == null || revealed <= 1) return new Set<number>();
    const current = archives.find((item) => item.index === revealed);
    const previous = archives.find((item) => item.index === revealed - 1);
    if (!current || !previous) return new Set<number>();
    const before = new Set(previous.archiveIds);
    return new Set(current.archiveIds.filter((id) => !before.has(id)));
  }, [archives, revealed]);

  const visible = useMemo(
    () =>
      (archetype?.candidates ?? []).filter((candidate) => {
        if (revealed != null) {
          if (candidate.generation > revealed) return false;
        } else if (generation !== "all" && candidate.generation !== generation) return false;
        if (filter === "pareto") return candidate.pareto;
        if (filter === "dominated") return !candidate.pareto;
        return true;
      }),
    [archetype?.candidates, revealed, generation, filter],
  );

  const points = useMemo(
    () =>
      visible
        .map((candidate) => ({
          candidate,
          ...project([candidate.formal, candidate.spatial, candidate.atmospheric], view.yaw, view.pitch, view.zoom),
        }))
        .sort((a, b) => {
          if (a.candidate.key === selectedKey) return 1;
          if (b.candidate.key === selectedKey) return -1;
          return a.depth - b.depth;
        }),
    [visible, view, selectedKey],
  );

  const selected = archetype?.candidates.find((candidate) => candidate.key === selectedKey) ?? null;
  const hovered = archetype?.candidates.find((candidate) => candidate.key === hoveredKey) ?? null;
  const focus = emphasis ?? revealed ?? (generation === "all" ? null : generation);

  const chooseGeneration = (next: GenerationPick) => {
    setPlayback(null);
    setMembership(null);
    setGeneration(next);
  };

  const chooseMembership = (generationIndex: number, kind: TurnoverKind, ids: number[]) => {
    setPlayback(null);
    setGeneration("all");
    setFilter("all");
    setEmphasis(generationIndex);
    setMembership((current) => (current && current.generation === generationIndex && current.kind === kind ? null : { generation: generationIndex, kind, ids }));
  };

  const play = () => {
    if (generationCount === 0) return;
    if (reducedMotion) {
    setGeneration("all");
    setMembership(null);
    setPlayback((current) => {
      const next = !current || current.index >= generationCount ? 1 : current.index + 1;
        return { index: next, running: false };
      });
      return;
    }
    setGeneration("all");
    setMembership(null);
    setPlayback((current) => {
      if (current?.running) return { index: current.index, running: false };
      if (!current || current.index >= generationCount) return { index: 1, running: true };
      return { index: current.index, running: true };
    });
  };

  const playLabel = playback?.running ? "Pause" : playback && playback.index >= generationCount ? "Replay" : "Play evolution";

  const selectPoint = (key: string) => {
    if (drag.current?.moved) return;
    setSelectedKey((current) => {
      const next = current === key ? null : key;
      if (next) window.sessionStorage.setItem(SELECTION_KEY, next);
      else window.sessionStorage.removeItem(SELECTION_KEY);
      return next;
    });
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, moved: false };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) event.currentTarget.setPointerCapture(event.pointerId);
    start.moved = true;
    setHoveredKey(null);
    setView((current) => ({
      ...current,
      yaw: start.yaw + dx * 0.008,
      pitch: Math.max(-1.15, Math.min(1.15, start.pitch + dy * 0.008)),
    }));
  };
  const onPointerUp = () => {
    window.setTimeout(() => {
      drag.current = null;
    }, 0);
  };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    setView((current) => ({ ...current, zoom: Math.max(0.85, Math.min(2.2, current.zoom * factor)) }));
  };

  const membershipIds = useMemo(() => (membership ? new Set(membership.ids) : null), [membership]);

  const opacityFor = (candidate: EvolutionCandidateView) => {
    if (candidate.key === selectedKey) return 1;
    if (membershipIds) return membershipIds.has(candidate.id) ? 1 : 0.08;
    let opacity = 1;
    if (revealed != null) opacity = candidate.generation < revealed ? 0.22 : 1;
    else if (generation === "all") opacity = 0.4 + (candidate.generation / Math.max(generationCount, 1)) * 0.6;
    if (focus != null && candidate.generation !== focus) opacity *= 0.16;
    return opacity;
  };

  return (
    <main className="evo-page pareto-page">
      <EvolutionHeader
        title="Objective Space"
        detail={archetype ? `${archetype.name} · X Formal · Y Spatial · Z Atmospheric` : "No completed searches yet"}
        aside={
          <ArchetypeSwitch
            catalog={catalog}
            archetypeId={archetype?.archetypeId ?? null}
            onChange={(id) => {
              setSelectedKey(null);
              select(id);
            }}
          />
        }
      />

      <div className="pareto-layout" ref={layoutRef}>
        <ParetoAnalyticsBand
          series={series}
          turnovers={turnovers}
          focus={focus}
          membership={membership ? { generation: membership.generation, kind: membership.kind } : null}
          onFocus={setEmphasis}
          onPick={(index) => chooseGeneration(index)}
          onMembership={chooseMembership}
        />
        <div className="pareto-stage-slot" ref={frameRef}>
        <Panel className="pareto-stage">
          <div className="pareto-toolbar">
            <div className="evo-segment" role="group" aria-label="Generation">
              {completed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-active={(playback ? playback.index === item.index : generation === item.index) || undefined}
                  onClick={() => chooseGeneration(item.index)}
                >
                  {item.id}
                </button>
              ))}
              <button type="button" data-active={(!playback && generation === "all") || undefined} onClick={() => chooseGeneration("all")}>
                All
              </button>
            </div>
            <div className="evo-segment" role="group" aria-label="Filter">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" data-active={filter === item.id || undefined} onClick={() => setFilter(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="pareto-play" data-active={playback?.running || undefined} onClick={play} disabled={generationCount === 0}>
              {playLabel}
            </button>
            <span className="eyebrow pareto-count">{visible.length} shown</span>
          </div>

          <svg
            className="pareto-svg"
            viewBox="-6 -6 112 112"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={() => setView({ yaw: -0.62, pitch: 0.42, zoom: 1.15 })}
          >
            {GRID.map(({ from, to, major }, index) => {
              const a = project(from, view.yaw, view.pitch, view.zoom);
              const b = project(to, view.yaw, view.pitch, view.zoom);
              return (
                <line
                  key={`grid-${index}`}
                  x1={a.sx}
                  y1={a.sy}
                  x2={b.sx}
                  y2={b.sy}
                  className="pareto-grid"
                  data-major={major || undefined}
                />
              );
            })}
            {CUBE_EDGES.map(([from, to], index) => {
              const a = project(from, view.yaw, view.pitch, view.zoom);
              const b = project(to, view.yaw, view.pitch, view.zoom);
              return <line key={`edge-${index}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-cube" />;
            })}
            {AXES.map((axis) => {
              const origin = project([0, 0, 0], view.yaw, view.pitch, view.zoom);
              const mid = project(axis.to.map((value) => value * (0.5 / 1.16)), view.yaw, view.pitch, view.zoom);
              const end = project(axis.to, view.yaw, view.pitch, view.zoom);
              const unit = project(
                axis.to.map((value) => (value === 0 ? 0 : 1)),
                view.yaw,
                view.pitch,
                view.zoom,
              );
              return (
                <g key={axis.label}>
                  <line x1={origin.sx} y1={origin.sy} x2={end.sx} y2={end.sy} className="pareto-axis" />
                  {axis.label === "Formal" ? (
                    <text className="pareto-tick" x={origin.sx} y={origin.sy} dy={2.4}>
                      0
                    </text>
                  ) : null}
                  <text className="pareto-tick" x={mid.sx} y={mid.sy} dy={-0.8}>
                    0.5
                  </text>
                  <text className="pareto-tick" x={unit.sx} y={unit.sy} dy={-0.8}>
                    1
                  </text>
                </g>
              );
            })}
            {points.map(({ candidate, sx, sy, depth }) => {
              const state = pointState(candidate, selectedKey);
              const entering = revealed != null && !reducedMotion && entrants.has(candidate.id) && candidate.generation === revealed;
              const radius = { dominated: 1.075, pareto: 1.35, archive: 1.45, selected: 1.8 }[state] * (0.82 + depth * 0.28);
              return (
                <circle
                  key={candidate.key}
                  cx={sx}
                  cy={sy}
                  r={radius}
                  className="pareto-point"
                  data-state={state}
                  data-member={membershipIds?.has(candidate.id) || undefined}
                  data-enter={entering || undefined}
                  style={entering ? undefined : { opacity: opacityFor(candidate) }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => setHoveredKey(candidate.key)}
                  onPointerLeave={() => setHoveredKey((current) => (current === candidate.key ? null : current))}
                  onClick={() => selectPoint(candidate.key)}
                />
              );
            })}
          </svg>

          <div className="pareto-footer">
            <AxisKey yaw={view.yaw} pitch={view.pitch} />
            <ul className="pareto-legend">
              <li data-state="dominated">Dominated</li>
              <li data-state="pareto">Pareto</li>
              <li data-state="archive">Archive</li>
              <li data-state="selected">Selected</li>
            </ul>
            <span className="eyebrow pareto-hover-readout">
              {hovered
                ? `${formatCandidateId(hovered.id)} · ${formatGeneration(hovered.generation)} · F ${formatMatch(hovered.formal)} · S ${formatMatch(hovered.spatial)} · A ${formatMatch(hovered.atmospheric)}`
                : "Drag to orbit · scroll to zoom · click a point"}
            </span>
          </div>
        </Panel>
        </div>

        <Panel className="pareto-detail">
          {selected ? (
            <>
              <PanelHeader
                kicker={formatGeneration(selected.generation)}
                title={formatCandidateId(selected.id)}
                aside={<span className="eyebrow">{statusLabel(selected)}</span>}
              />
              {selected.image ? (
                <div className="evo-preview-frame">
                  <EvolutionImage src={selected.image} />
                </div>
              ) : null}
              <ObjectiveBars candidate={selected} />
              <dl className="evo-meta pareto-detail-meta">
                <div>
                  <dt>Parent</dt>
                  <dd>{selected.parentId == null ? "Founder" : formatCandidateId(selected.parentId)}</dd>
                </div>
                <div>
                  <dt>Rank</dt>
                  <dd>{selected.paretoRank}</dd>
                </div>
              </dl>
              {selected.genome ? (
                <dl className="pareto-genome">
                  <div>
                    Drift <b>{selected.genome.driftX.toFixed(2)}</b>, <b>{selected.genome.driftY.toFixed(2)}</b>
                  </div>
                  <div>
                    Radius <b>{selected.genome.uniformRadiusScale.toFixed(3)}</b>
                  </div>
                  <div>
                    Orientation <b>{selected.genome.orientation.toFixed(2)}</b>
                  </div>
                </dl>
              ) : (
                <p className="evo-empty">
                  Semantic plan. Roles: {(selected.preservationRoles ?? []).join(", ") || "none"}. Fidelity: {selected.fidelity ?? "unrecorded"}.
                </p>
              )}
              {selected.archived && selected.image ? (
                <Link
                  className="pareto-catalog-link"
                  href={catalogHref}
                  onClick={() => window.sessionStorage.setItem(CATALOG_FOCUS_KEY, selected.key)}
                >
                  Inspect in Pareto Catalog
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <PanelHeader kicker="Candidate" title="None selected" />
              <p className="evo-empty">
                Orbit the space and select a point. The panel reads that candidate’s objectives, parent, and genome from the saved run.
              </p>
            </>
          )}
        </Panel>
      </div>
    </main>
  );
}

/** The same objective-space drawing as the Pareto tab, at the tab’s opening camera. */
export function ParetoCloud({ candidates }: { candidates: EvolutionCandidateView[] }) {
  const view = { yaw: -0.62, pitch: 0.42, zoom: 1.15 };
  const points = candidates
    .map((candidate) => ({
      candidate,
      ...project([candidate.formal, candidate.spatial, candidate.atmospheric], view.yaw, view.pitch, view.zoom),
    }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <svg className="pareto-svg so-cloud" viewBox="-6 -6 112 112" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pareto graph">
      {GRID.map(({ from, to, major }, index) => {
        const a = project(from, view.yaw, view.pitch, view.zoom);
        const b = project(to, view.yaw, view.pitch, view.zoom);
        return <line key={`grid-${index}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-grid" data-major={major || undefined} />;
      })}
      {CUBE_EDGES.map(([from, to], index) => {
        const a = project(from, view.yaw, view.pitch, view.zoom);
        const b = project(to, view.yaw, view.pitch, view.zoom);
        return <line key={`edge-${index}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-cube" />;
      })}
      {AXES.map((axis) => {
        const origin = project([0, 0, 0], view.yaw, view.pitch, view.zoom);
        const end = project(axis.to, view.yaw, view.pitch, view.zoom);
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
        const state = pointState(candidate, null);
        const radius = { dominated: 1.075, pareto: 1.35, archive: 1.45, selected: 1.8 }[state] * (0.82 + depth * 0.28);
        return <circle key={candidate.key} cx={sx} cy={sy} r={radius} className="pareto-point" data-state={state} />;
      })}
    </svg>
  );
}

export function ObjectiveBars({ candidate }: { candidate: { formal: number; spatial: number; atmospheric: number } }) {
  const rows = [
    { label: "Formal", value: candidate.formal },
    { label: "Spatial", value: candidate.spatial },
    { label: "Atmospheric", value: candidate.atmospheric },
  ];
  return (
    <dl className="evo-objectives">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <span className="evo-objective-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(1, row.value)) * 100}%` }} />
            </span>
            {formatMatch(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
