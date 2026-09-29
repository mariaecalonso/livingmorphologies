"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { MockMorphology } from "@/components/evolution/mock-morphology";
import {
  formatCandidateId,
  formatGeneration,
  MOCK_CANDIDATES,
  MOCK_GENERATION_COUNT,
  type MockCandidate,
} from "@/lib/ui-mock/evolution-mock";

type Scope = "final" | "all";
type Filter = "all" | "pareto" | "dominated";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "final", label: "Final front" },
  { id: "all", label: "All generations" },
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pareto", label: "Pareto" },
  { id: "dominated", label: "Dominated" },
];

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

/** X = Formal, Y = Spatial (screen up), Z = Atmospheric. */
function project([x, y, z]: number[], yaw: number, pitch: number) {
  const px = x - 0.5;
  const py = y - 0.5;
  const pz = z - 0.5;
  const rx = px * Math.cos(yaw) + pz * Math.sin(yaw);
  const rz = -px * Math.sin(yaw) + pz * Math.cos(yaw);
  const ry = py * Math.cos(pitch) - rz * Math.sin(pitch);
  const depth = py * Math.sin(pitch) + rz * Math.cos(pitch);
  const perspective = 1 / (1.9 - depth * 0.35);
  return { sx: 50 + rx * 72 * perspective, sy: 52 - ry * 72 * perspective, depth };
}

function pointState(candidate: MockCandidate, selectedId: number | null) {
  if (candidate.id === selectedId) return "selected";
  if (candidate.archived) return "archive";
  if (candidate.pareto) return "pareto";
  return "dominated";
}

export function ParetoSpace() {
  const [scope, setScope] = useState<Scope>("final");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState({ yaw: -0.65, pitch: 0.38 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);

  const visible = useMemo(
    () =>
      MOCK_CANDIDATES.filter((candidate) => {
        if (scope === "final" && candidate.generation !== MOCK_GENERATION_COUNT) return false;
        if (filter === "pareto") return candidate.pareto;
        if (filter === "dominated") return !candidate.pareto;
        return true;
      }),
    [scope, filter],
  );

  const points = useMemo(
    () =>
      visible
        .map((candidate) => ({
          candidate,
          ...project([candidate.formal, candidate.spatial, candidate.atmospheric], view.yaw, view.pitch),
        }))
        .sort((a, b) => a.depth - b.depth),
    [visible, view],
  );

  const selected = MOCK_CANDIDATES.find((candidate) => candidate.id === selectedId) ?? null;

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
    setView({
      yaw: start.yaw + dx * 0.008,
      pitch: Math.max(-1.2, Math.min(1.2, start.pitch + dy * 0.008)),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const selectPoint = (id: number) => {
    setSelectedId((current) => (current === id ? null : id));
  };

  return (
    <main className="evo-page">
      <EvolutionHeader title="Objective Space" detail="X Formal match · Y Spatial match · Z Atmospheric match" />

      <div className="pareto-layout">
        <Panel className="pareto-stage">
          <div className="pareto-toolbar">
            <div className="evo-segment" role="group" aria-label="Scope">
              {SCOPES.map((item) => (
                <button key={item.id} type="button" data-active={scope === item.id || undefined} onClick={() => setScope(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="evo-segment" role="group" aria-label="Filter">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" data-active={filter === item.id || undefined} onClick={() => setFilter(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <span className="eyebrow pareto-count">{visible.length} candidates</span>
          </div>

          <svg
            className="pareto-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {CUBE_EDGES.map(([from, to], index) => {
              const a = project(from, view.yaw, view.pitch);
              const b = project(to, view.yaw, view.pitch);
              return <line key={index} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-cube" />;
            })}
            {AXES.map((axis) => {
              const origin = project([0, 0, 0], view.yaw, view.pitch);
              const end = project(axis.to, view.yaw, view.pitch);
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
              const state = pointState(candidate, selectedId);
              const age = scope === "all" ? 0.45 + (candidate.generation / MOCK_GENERATION_COUNT) * 0.55 : 1;
              const radius = { dominated: 0.75, pareto: 1.05, archive: 1.25, selected: 1.7 }[state] * (0.85 + depth * 0.3);
              return (
                <circle
                  key={candidate.id}
                  cx={sx}
                  cy={sy}
                  r={radius}
                  className="pareto-point"
                  data-state={state}
                  style={{ opacity: state === "selected" ? 1 : age }}
                  onClick={() => selectPoint(candidate.id)}
                >
                  <title>{`${formatCandidateId(candidate.id)} · ${formatGeneration(candidate.generation)}`}</title>
                </circle>
              );
            })}
          </svg>

          <div className="pareto-footer">
            <ul className="pareto-legend">
              <li data-state="dominated">Dominated</li>
              <li data-state="pareto">Pareto</li>
              <li data-state="archive">Archive</li>
              <li data-state="selected">Selected</li>
            </ul>
            <span className="eyebrow">Drag to orbit · click a point to inspect</span>
          </div>
        </Panel>

        <Panel className="pareto-detail">
          {selected ? (
            <>
              <PanelHeader kicker="Candidate" title={formatCandidateId(selected.id)} />
              <div className="evo-preview-frame">
                <MockMorphology seed={selected.previewSeed} generation={selected.generation} />
              </div>
              <ObjectiveBars candidate={selected} />
              <dl className="evo-meta">
                <div>
                  <dt>Generation</dt>
                  <dd>{formatGeneration(selected.generation)}</dd>
                </div>
                <div>
                  <dt>Pareto rank</dt>
                  <dd>{selected.paretoRank}</dd>
                </div>
                <div>
                  <dt>Archive</dt>
                  <dd>{selected.archived ? "Yes" : "No"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <PanelHeader kicker="Candidate" title="None selected" />
              <p className="evo-empty">
                Select a point to inspect its objective values. There is no single best candidate; the front is a set
                of trade-offs between the three objectives.
              </p>
            </>
          )}
        </Panel>
      </div>
    </main>
  );
}

export function ObjectiveBars({ candidate }: { candidate: MockCandidate }) {
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
              <span style={{ width: `${row.value * 100}%` }} />
            </span>
            {row.value.toFixed(2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
