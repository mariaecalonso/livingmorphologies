"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
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

/** Interior lines on the three faces that meet at the origin. */
const GRID: [number[], number[]][] = [0.25, 0.5, 0.75].flatMap((t) => [
  [[t, 0, 0], [t, 0, 1]],
  [[0, 0, t], [1, 0, t]],
  [[0, t, 0], [0, t, 1]],
  [[0, 0, t], [0, 1, t]],
  [[t, 0, 0], [t, 1, 0]],
  [[0, t, 0], [1, t, 0]],
]);

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

type Focus = [number, number, number];
type AxisName = "Formal" | "Spatial" | "Atmospheric";

const FULL_CUBE = { yaw: -0.62, pitch: 0.42, zoom: 1.15, focus: [0.5, 0.5, 0.5] as Focus };
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 3.2;

function clampZoom(zoom: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/** Faces that hide one axis so the other two read flat. */
const AXIS_SNAP: Record<AxisName, { yaw: number; pitch: number }> = {
  Formal: { yaw: Math.PI / 2, pitch: 0.08 },
  Spatial: { yaw: -0.35, pitch: 1.35 },
  Atmospheric: { yaw: 0.04, pitch: 0.12 },
};

/** X = Formal, Y = Spatial (screen up), Z = Atmospheric. */
function project([x, y, z]: number[], yaw: number, pitch: number, zoom: number, focus: Focus = [0.5, 0.5, 0.5]) {
  const px = x - focus[0];
  const py = y - focus[1];
  const pz = z - focus[2];
  const rx = px * Math.cos(yaw) + pz * Math.sin(yaw);
  const rz = -px * Math.sin(yaw) + pz * Math.cos(yaw);
  const ry = py * Math.cos(pitch) - rz * Math.sin(pitch);
  const depth = py * Math.sin(pitch) + rz * Math.cos(pitch);
  const perspective = 1 / (2.05 - depth * 0.55);
  const spread = 78 * zoom;
  return { sx: 50 + rx * spread * perspective, sy: 50 - ry * spread * perspective, depth };
}

function frameOf(points: { formal: number; spatial: number; atmospheric: number }[]) {
  if (points.length === 0) return { focus: [0.5, 0.5, 0.5] as Focus, zoom: FULL_CUBE.zoom };
  const focus: Focus = [0, 0, 0];
  for (const point of points) {
    focus[0] += point.formal;
    focus[1] += point.spatial;
    focus[2] += point.atmospheric;
  }
  focus[0] /= points.length;
  focus[1] /= points.length;
  focus[2] /= points.length;
  let radius = 0.045;
  for (const point of points) {
    radius = Math.max(radius, Math.hypot(point.formal - focus[0], point.spatial - focus[1], point.atmospheric - focus[2]));
  }
  return { focus, zoom: clampZoom(24 / (radius * 78)) };
}

/** Edges between each archive member and its nearest neighbors. No surface is fitted. */
function neighborEdges(points: { id: number; formal: number; spatial: number; atmospheric: number }[], k = 2) {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const ranked: { id: number; distance: number }[] = [];
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      ranked.push({
        id: points[j].id,
        distance: Math.hypot(
          points[i].formal - points[j].formal,
          points[i].spatial - points[j].spatial,
          points[i].atmospheric - points[j].atmospheric,
        ),
      });
    }
    ranked.sort((a, b) => a.distance - b.distance);
    for (const next of ranked.slice(0, k)) {
      const low = Math.min(points[i].id, next.id);
      const high = Math.max(points[i].id, next.id);
      const key = `${low}:${high}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([low, high]);
    }
  }
  return edges;
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
  const [fit, setFit] = useState(true);
  const [snapped, setSnapped] = useState<AxisName | null>(null);
  const [view, setView] = useState({ yaw: FULL_CUBE.yaw, pitch: FULL_CUBE.pitch, zoom: FULL_CUBE.zoom, focus: FULL_CUBE.focus });
  const [camera, setCamera] = useState({ focus: FULL_CUBE.focus, zoom: FULL_CUBE.zoom });
  const cameraRef = useRef(camera);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; pointerId: number; moved: boolean } | null>(null);
  const completed = useMemo(
    () => archetype?.generations.filter((item) => item.status === "done") ?? [],
    [archetype?.generations],
  );
  const generationCount = completed.length;

  useEffect(() => {
    setPlayback(null);
    setGeneration("all");
    setEmphasis(null);
    setMembership(null);
    setHoveredKey(null);
    setFit(true);
    setSnapped(null);
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
  const shownGeneration = revealed ?? (generation === "all" ? null : generation);
  const frontIds = useMemo(() => {
    if (shownGeneration != null) return new Set(archives.find((item) => item.index === shownGeneration)?.archiveIds ?? []);
    return new Set((archetype?.candidates ?? []).filter((candidate) => candidate.archived).map((candidate) => candidate.id));
  }, [shownGeneration, archives, archetype?.candidates]);
  const ghostIds = useMemo(() => {
    if (shownGeneration == null || shownGeneration <= 1) return new Set<number>();
    const previous = new Set(archives.find((item) => item.index === shownGeneration - 1)?.archiveIds ?? []);
    for (const id of frontIds) previous.delete(id);
    return previous;
  }, [shownGeneration, archives, frontIds]);
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
        if (ghostIds.has(candidate.id) && filter === "all") return true;
        if (revealed != null) {
          if (candidate.generation > revealed) return false;
        } else if (generation !== "all" && candidate.generation !== generation) return false;
        if (filter === "pareto") return candidate.pareto;
        if (filter === "dominated") return !candidate.pareto;
        return true;
      }),
    [archetype?.candidates, revealed, generation, filter, ghostIds],
  );

  const frontPoints = useMemo(
    () => (archetype?.candidates ?? []).filter((candidate) => frontIds.has(candidate.id)),
    [archetype?.candidates, frontIds],
  );
  const frameTarget = useMemo(() => frameOf(frontPoints), [frontPoints]);
  const frameSignature = `${archetype?.archetypeId ?? ""}:${shownGeneration ?? "all"}:${frameTarget.zoom.toFixed(4)}:${frameTarget.focus.map((value) => value.toFixed(4)).join(",")}`;
  const frameTargetRef = useRef(frameTarget);
  frameTargetRef.current = frameTarget;
  useEffect(() => {
    if (!fit) return;
    const target = {
      focus: [...frameTargetRef.current.focus] as Focus,
      zoom: clampZoom(frameTargetRef.current.zoom),
    };
    const from = cameraRef.current;
    let frame = 0;
    const apply = (next: { zoom: number; focus: Focus }) => {
      const same =
        Math.abs(cameraRef.current.zoom - next.zoom) < 0.0001 &&
        cameraRef.current.focus.every((value, index) => Math.abs(value - next.focus[index]) < 0.0001);
      if (same) return;
      cameraRef.current = next;
      setCamera(next);
    };
    if (reducedMotion) {
      apply(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const blend = 1 - (1 - Math.min(1, (now - start) / 380)) ** 3;
      apply({
        zoom: from.zoom + (target.zoom - from.zoom) * blend,
        focus: [
          from.focus[0] + (target.focus[0] - from.focus[0]) * blend,
          from.focus[1] + (target.focus[1] - from.focus[1]) * blend,
          from.focus[2] + (target.focus[2] - from.focus[2]) * blend,
        ],
      });
      if (blend < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fit, frameSignature, reducedMotion]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoom = clampZoom(cameraRef.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08));
      const next = { focus: cameraRef.current.focus, zoom };
      cameraRef.current = next;
      setFit(false);
      setCamera(next);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      const start = drag.current;
      if (start && svg.hasPointerCapture(start.pointerId)) svg.releasePointerCapture(start.pointerId);
      drag.current = null;
    };
  }, []);

  const candidateById = useMemo(() => {
    const map = new Map<number, EvolutionCandidateView>();
    for (const candidate of archetype?.candidates ?? []) map.set(candidate.id, candidate);
    return map;
  }, [archetype?.candidates]);
  const frontEdges = useMemo(() => neighborEdges(frontPoints), [frontPoints]);
  const ghostEdges = useMemo(
    () => neighborEdges((archetype?.candidates ?? []).filter((candidate) => ghostIds.has(candidate.id))),
    [archetype?.candidates, ghostIds],
  );
  const linkedIds = useMemo(() => {
    if (!hoveredKey) return new Set<number>();
    const hoveredId = archetype?.candidates.find((candidate) => candidate.key === hoveredKey)?.id;
    if (hoveredId == null || !frontIds.has(hoveredId)) return new Set<number>();
    const linked = new Set<number>([hoveredId]);
    for (const [left, right] of frontEdges) {
      if (left === hoveredId) linked.add(right);
      if (right === hoveredId) linked.add(left);
    }
    return linked;
  }, [hoveredKey, archetype?.candidates, frontIds, frontEdges]);

  const points = useMemo(
    () =>
      visible
        .map((candidate) => ({
          candidate,
          ...project([candidate.formal, candidate.spatial, candidate.atmospheric], view.yaw, view.pitch, camera.zoom, camera.focus),
        }))
        .sort((a, b) => {
          if (a.candidate.key === selectedKey) return 1;
          if (b.candidate.key === selectedKey) return -1;
          return a.depth - b.depth;
        }),
    [visible, view.yaw, view.pitch, camera, selectedKey],
  );

  const selected = archetype?.candidates.find((candidate) => candidate.key === selectedKey) ?? null;
  const hovered = archetype?.candidates.find((candidate) => candidate.key === hoveredKey) ?? null;
  const focus = emphasis ?? revealed ?? (generation === "all" ? null : generation);

  const chooseGeneration = (next: GenerationPick) => {
    setPlayback(null);
    setMembership(null);
    setFit(true);
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
    setFit(true);
    setPlayback((current) => {
      const next = !current || current.index >= generationCount ? 1 : current.index + 1;
        return { index: next, running: false };
      });
      return;
    }
    setGeneration("all");
    setMembership(null);
    setFit(true);
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
    drag.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, pointerId: event.pointerId, moved: false };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setFit(false);
    }
    start.moved = true;
    setHoveredKey(null);
    setSnapped(null);
    setView((current) => ({
      ...current,
      yaw: start.yaw + dx * 0.008,
      pitch: Math.max(-1.4, Math.min(1.4, start.pitch + dy * 0.008)),
    }));
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(() => {
      drag.current = null;
    }, 0);
  };
  const showFullCube = () => {
    const next = { focus: FULL_CUBE.focus, zoom: FULL_CUBE.zoom };
    cameraRef.current = next;
    setFit(false);
    setSnapped(null);
    setCamera(next);
    setView((current) => ({ ...current, ...FULL_CUBE }));
  };
  const snapAxis = (axis: string) => {
    if (axis !== "Formal" && axis !== "Spatial" && axis !== "Atmospheric") return;
    setSnapped((current) => {
      const next = current === axis ? null : axis;
      setView((viewState) => ({ ...viewState, ...(next ? AXIS_SNAP[next] : { yaw: FULL_CUBE.yaw, pitch: FULL_CUBE.pitch }) }));
      return next;
    });
  };

  const membershipIds = useMemo(() => (membership ? new Set(membership.ids) : null), [membership]);

  const opacityFor = (candidate: EvolutionCandidateView) => {
    if (candidate.key === selectedKey) return 1;
    if (membershipIds) return membershipIds.has(candidate.id) ? 1 : 0.08;
    if (linkedIds.size > 1) return linkedIds.has(candidate.id) ? 1 : 0.14;
    if (ghostIds.has(candidate.id) && !frontIds.has(candidate.id)) return 0.38;
    if (frontIds.has(candidate.id)) return 1;
    if (candidate.pareto) return 0.22;
    let opacity = 0.1;
    if (focus != null && candidate.generation !== focus) opacity *= 0.35;
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

      <div className="pareto-layout">
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
            ref={svgRef}
            className="pareto-svg"
            viewBox="-6 -6 112 112"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
            onDoubleClick={showFullCube}
          >
            {GRID.map(([from, to], index) => {
              const a = project(from, view.yaw, view.pitch, camera.zoom, camera.focus);
              const b = project(to, view.yaw, view.pitch, camera.zoom, camera.focus);
              return <line key={`grid-${index}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-grid" />;
            })}
            {CUBE_EDGES.map(([from, to], index) => {
              const a = project(from, view.yaw, view.pitch, camera.zoom, camera.focus);
              const b = project(to, view.yaw, view.pitch, camera.zoom, camera.focus);
              return <line key={`edge-${index}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-cube" />;
            })}
            {AXES.map((axis) => {
              const origin = project([0, 0, 0], view.yaw, view.pitch, camera.zoom, camera.focus);
              const mid = project(axis.to.map((value) => value * (0.5 / 1.16)), view.yaw, view.pitch, camera.zoom, camera.focus);
              const end = project(axis.to, view.yaw, view.pitch, camera.zoom, camera.focus);
              const unit = project(
                axis.to.map((value) => (value === 0 ? 0 : 1)),
                view.yaw,
                view.pitch,
                camera.zoom,
                camera.focus,
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
                  <text
                    x={end.sx}
                    y={end.sy}
                    className="pareto-axis-label"
                    data-active={snapped === axis.label || undefined}
                    textAnchor={end.sx < 50 ? "end" : "start"}
                    dx={end.sx < 50 ? -1.2 : 1.2}
                    dy={-1.4}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      snapAxis(axis.label);
                    }}
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}
            {[...ghostEdges.map((edge) => ({ edge, ghost: true })), ...frontEdges.map((edge) => ({ edge, ghost: false }))].map(({ edge: [left, right], ghost }) => {
              const from = candidateById.get(left);
              const to = candidateById.get(right);
              if (!from || !to) return null;
              const a = project([from.formal, from.spatial, from.atmospheric], view.yaw, view.pitch, camera.zoom, camera.focus);
              const b = project([to.formal, to.spatial, to.atmospheric], view.yaw, view.pitch, camera.zoom, camera.focus);
              const hot = !ghost && linkedIds.has(left) && linkedIds.has(right);
              return (
                <line
                  key={`${ghost ? "g" : "f"}-${left}-${right}`}
                  x1={a.sx}
                  y1={a.sy}
                  x2={b.sx}
                  y2={b.sy}
                  className="pareto-front-edge"
                  data-ghost={ghost || undefined}
                  data-hot={hot || undefined}
                />
              );
            })}
            {points.map(({ candidate, sx, sy, depth }) => {
              const state = pointState(candidate, selectedKey);
              const ghost = ghostIds.has(candidate.id) && !frontIds.has(candidate.id);
              const entering = revealed != null && !reducedMotion && entrants.has(candidate.id) && candidate.generation === revealed;
              const radius =
                { dominated: 0.72, pareto: 1.05, archive: 1.7, selected: 2.2 }[state] * (ghost ? 0.9 : 1) * (0.82 + depth * 0.28);
              return (
                <circle
                  key={candidate.key}
                  cx={sx}
                  cy={sy}
                  r={radius}
                  className="pareto-point"
                  data-state={state}
                  data-role={ghost ? "ghost" : frontIds.has(candidate.id) ? "front" : undefined}
                  data-link={linkedIds.has(candidate.id) || undefined}
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
            <ul className="pareto-legend">
              <li data-state="dominated">Dominated</li>
              <li data-state="pareto">Pareto</li>
              <li data-state="archive">Archive</li>
              {ghostIds.size > 0 ? <li data-state="ghost">Previous</li> : null}
              <li data-state="selected">Selected</li>
            </ul>
            <span className="eyebrow pareto-hover-readout">
              {hovered
                ? `${formatCandidateId(hovered.id)} · ${formatGeneration(hovered.generation)} · F ${hovered.formal.toFixed(2)} · S ${hovered.spatial.toFixed(2)} · A ${hovered.atmospheric.toFixed(2)}`
                : "Drag to orbit · scroll to zoom · click an axis · double-click for 0–1"}
            </span>
          </div>
        </Panel>

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

      <ParetoAnalyticsBand
        series={series}
        turnovers={turnovers}
        focus={focus}
        membership={membership ? { generation: membership.generation, kind: membership.kind } : null}
        onFocus={setEmphasis}
        onPick={(index) => chooseGeneration(index)}
        onMembership={chooseMembership}
      />
    </main>
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
            {row.value.toFixed(2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
