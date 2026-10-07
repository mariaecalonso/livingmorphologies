"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import { readActiveArchetype, readSkill2Selections, type Skill2Selection } from "@/lib/skill2/published-selection";
import { DEVELOPMENT_BEHAVIOR, type BehaviorProfile } from "@/lib/skill3/behavior-profile";
import type { ContinuationEvent, NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { stackDisplayIndices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";
import { ProcessMorphology, ProcessPlate, ProcessStack } from "@/components/vertical-process-stage";

const TYPOLOGY: Record<string, string> = {
  lobby: "Lobby",
  workspace: "Workspace",
  gathering: "Gathering",
};

type CandidateRequest = {
  archetypeId: string;
  archetypeName: string;
  typologyId: string;
  candidateId: number;
};

type ObjectiveScores = { formal: number; spatial: number; atmospheric: number };

const CUBE_EDGES: [number[], number[]][] = [
  [[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]],
];

const OBJECTIVE_AXES: { label: string; to: number[] }[] = [
  { label: "F", to: [1.12, 0, 0] },
  { label: "S", to: [0, 1.12, 0] },
  { label: "A", to: [0, 0, 1.12] },
];

function projectObjective([x, y, z]: number[]) {
  const yaw = -0.65;
  const pitch = 0.38;
  const px = x - 0.5;
  const py = y - 0.5;
  const pz = z - 0.5;
  const rx = px * Math.cos(yaw) + pz * Math.sin(yaw);
  const rz = -px * Math.sin(yaw) + pz * Math.cos(yaw);
  const ry = py * Math.cos(pitch) - rz * Math.sin(pitch);
  const depth = py * Math.sin(pitch) + rz * Math.cos(pitch);
  const perspective = 1 / (1.9 - depth * 0.35);
  return { sx: 50 + rx * 62 * perspective, sy: 46 - ry * 62 * perspective };
}

type ApiContinuation = Omit<NaturalContinuation, "field">;

type ApiSet = Omit<NaturalContinuationSet, "continuations"> & {
  continuations: ApiContinuation[];
  fields: VerticalViewerField[];
};

function roundedScore(value: number | null | undefined) {
  return value == null ? "Waiting" : value.toFixed(2);
}

function paretoRole(pareto: boolean | undefined) {
  if (pareto == null) return "Waiting";
  return pareto ? "Front" : "Off the front";
}

function diversityRole(diversity: Skill2Selection["diversity"] | undefined) {
  if (diversity === "tag") return "Tag";
  if (diversity === "rescue") return "Rescue";
  if (diversity === "none") return "None";
  return "Waiting";
}

function specialistRole(specialist: Skill2Selection["specialist"] | undefined) {
  if (specialist === "formal") return "Formal";
  if (specialist === "spatial") return "Spatial";
  if (specialist === "atmospheric") return "Atmospheric";
  return null;
}

function handoffStatus(origin: string | undefined, pending: boolean, error: string | null, verified: boolean) {
  if (origin === "development-fixture") return "Fixture";
  if (origin === "provisional") return "Provisional";
  if (origin === "handoff" || verified) return "Verified";
  if (error) return "Failed";
  if (pending) return "Checking";
  return "Waiting";
}

function Strip({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <dl className="vertical-process-strip">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ParetoSketch({ objectives }: { objectives: ObjectiveScores | null }) {
  const selected = objectives ? projectObjective([objectives.formal, objectives.spatial, objectives.atmospheric]) : null;
  return (
    <svg className="vertical-process-pareto" viewBox="0 0 100 78" aria-label="Formal, spatial, and atmospheric objective space">
      {CUBE_EDGES.map(([from, to], index) => {
        const a = projectObjective(from);
        const b = projectObjective(to);
        return <line key={index} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} className="pareto-cube" />;
      })}
      {OBJECTIVE_AXES.map((axis) => {
        const origin = projectObjective([0, 0, 0]);
        const end = projectObjective(axis.to);
        return (
          <g key={axis.label}>
            <line x1={origin.sx} y1={origin.sy} x2={end.sx} y2={end.sy} className="pareto-axis" />
            <text x={end.sx} y={end.sy} className="pareto-axis-label" textAnchor="middle" dy={-0.8}>{axis.label}</text>
          </g>
        );
      })}
      {selected ? <circle cx={selected.sx} cy={selected.sy} r={1.8} className="pareto-point" data-state="selected" /> : null}
    </svg>
  );
}

function picturedStates(count: number) {
  if (count <= 0) return [] as { index: number; label: string }[];
  if (count === 1) return [{ index: 0, label: "Z0" }];
  if (count === 2) return [{ index: 0, label: "Z0" }, { index: 1, label: "LATE" }];
  return [
    { index: 0, label: "Z0" },
    { index: Math.round((count - 1) / 2), label: "MID" },
    { index: count - 1, label: "LATE" },
  ];
}

function planeTags(count: number) {
  const visible = stackDisplayIndices(count);
  const tags = new Array<string>(count).fill("");
  visible.forEach((index, order) => {
    if (index === 0) tags[index] = "Z0";
    else if (index === count - 1) tags[index] = "LATE";
    else tags[index] = String(order).padStart(2, "0");
  });
  return tags;
}

function HandoffMark({ status }: { status: string }) {
  return (
    <div className="vertical-process-handoff">
      <p className="vertical-process-handoff-flow">
        <span data-step="selected">Selected state</span>
        <span aria-hidden="true">↓</span>
        <span data-step="z0">Exact Z0</span>
      </p>
      <p>No regeneration</p>
      <p data-state={status}>{status}</p>
    </div>
  );
}

function iterationFromGraph(clientX: number, svg: SVGSVGElement, origin: number, horizon: number, left: number, right: number) {
  const rect = svg.getBoundingClientRect();
  const viewX = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
  const t = (viewX - left) / (right - left);
  return origin + Math.round(Math.min(1, Math.max(0, t)) * horizon);
}

function DeltaGraph({
  events,
  origin,
  horizon,
  threshold,
  marks,
  step,
  onSeek,
}: {
  events: readonly ContinuationEvent[];
  origin: number;
  horizon: number;
  threshold: number;
  marks: readonly { index: number; label: string }[];
  step: number;
  onSeek: (iteration: number) => void;
}) {
  if (events.length === 0 || horizon <= 0) return null;
  const max = Math.max(threshold, ...events.map((event) => event.delta), 0.001) * 1.18;
  const left = 14;
  const right = 96;
  const top = 8;
  const bottom = 82;
  const xAt = (iteration: number) => left + (Math.min(horizon, Math.max(0, iteration - origin)) / horizon) * (right - left);
  const yAt = (value: number) => bottom - (value / max) * (bottom - top);
  const path = events.map((event, index) => `${index === 0 ? "M" : "L"}${xAt(event.iteration)},${yAt(event.delta)}`).join(" ");
  const marked = new Map(marks.map((mark) => [mark.index, mark.label]));
  const now = xAt(origin + step);
  return (
    <svg
      className="vertical-process-graph"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Iteration against change for this continuation"
      onClick={(event) => onSeek(iterationFromGraph(event.clientX, event.currentTarget, origin, horizon, left, right))}
    >
      <text x={left} y={5} fontSize={4} className="vertical-process-graph-label">Δ</text>
      <text x={right} y={97} textAnchor="end" fontSize={4} className="vertical-process-graph-label">Iteration</text>
      <line x1={left} y1={yAt(0)} x2={right} y2={yAt(0)} className="vertical-process-axis" strokeWidth={0.35} />
      <line x1={left} y1={yAt(threshold)} x2={right} y2={yAt(threshold)} className="vertical-process-threshold" strokeWidth={0.4} />
      <text x={right} y={yAt(threshold) - 1.6} textAnchor="end" fontSize={4} className="vertical-process-graph-label" data-ink="copper">Δ {threshold}</text>
      <path d={path} strokeWidth={0.7} />
      <rect x={left} y={bottom - 8} width={Math.max(0, now - left)} height={8} className="vertical-process-progress" />
      <rect x={now - 1.3} y={top} width={2.6} height={bottom - top} className="vertical-process-playhead" />
      {events.map((event, index) => {
        const label = marked.get(index);
        const x = xAt(event.iteration);
        const ahead = event.iteration > origin + step;
        return (
          <g
            key={event.iteration}
            data-state={ahead ? "ahead" : "reached"}
            onClick={(pointer) => {
              pointer.stopPropagation();
              onSeek(event.iteration);
            }}
          >
            {label ? <line x1={x} y1={yAt(0)} x2={x} y2={top} className="vertical-process-guide" strokeWidth={0.25} /> : null}
            <circle cx={x} cy={yAt(event.delta)} r={4} fill="transparent" />
            <circle cx={x} cy={yAt(event.delta)} r={label ? 1.7 : 1.15} data-reason={event.reason} />
            {label ? <text x={x} y={yAt(event.delta) - 4} textAnchor="middle" fontSize={4} className="vertical-process-graph-label" data-ink="mark">{label}</text> : null}
          </g>
        );
      })}
      <line x1={now} y1={bottom} x2={now} y2={top} className="vertical-process-current" strokeWidth={2.4} />
      <circle cx={now} cy={bottom - 4} r={3.1} className="vertical-process-current-cap" />
      <text x={Math.min(right - 6, Math.max(left + 6, now))} y={18} textAnchor="middle" fontSize={8} className="vertical-process-graph-label" data-ink="current">{step}</text>
      <text x={xAt(origin)} y={90} fontSize={4} className="vertical-process-graph-label">{origin}</text>
      <text x={xAt(origin + horizon)} y={90} textAnchor="end" fontSize={4} className="vertical-process-graph-label">{origin + horizon}</text>
    </svg>
  );
}

function EventTimeline({
  events,
  origin,
  horizon,
  minGap,
  maxGap,
  tags,
  step,
  onSeek,
}: {
  events: readonly ContinuationEvent[];
  origin: number;
  horizon: number;
  minGap: number;
  maxGap: number;
  tags: readonly string[];
  step: number;
  onSeek: (iteration: number) => void;
}) {
  if (events.length === 0 || horizon <= 0) return null;
  const left = 8;
  const right = 96;
  const xAt = (iteration: number) => left + (Math.min(horizon, Math.max(0, iteration - origin)) / horizon) * (right - left);
  const band = (steps: number) => ((Math.min(horizon, steps) / horizon) * (right - left));
  const now = xAt(origin + step);
  return (
    <svg
      className="vertical-process-graph"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Accepted samples across the continuation horizon"
      onClick={(event) => onSeek(iterationFromGraph(event.clientX, event.currentTarget, origin, horizon, left, right))}
    >
      <text x={left} y={8} fontSize={4} className="vertical-process-graph-label">0</text>
      <text x={right} y={8} textAnchor="end" fontSize={4} className="vertical-process-graph-label">{horizon}</text>
      <rect x={left} y={28} width={band(maxGap)} height={10} className="vertical-process-gap" data-gap="max" />
      <rect x={left} y={28} width={band(minGap)} height={10} className="vertical-process-gap" data-gap="min" />
      <text x={left} y={26} fontSize={4} className="vertical-process-graph-label">Min {minGap}</text>
      <text x={left + band(maxGap)} y={26} textAnchor="end" fontSize={4} className="vertical-process-graph-label">Max {maxGap}</text>
      <line x1={left} y1={58} x2={right} y2={58} className="vertical-process-axis" strokeWidth={0.4} />
      <rect x={left} y={50} width={Math.max(0, now - left)} height={16} className="vertical-process-progress" />
      <rect x={now - 1.3} y={36} width={2.6} height={40} className="vertical-process-playhead" />
      <line x1={now} y1={36} x2={now} y2={76} className="vertical-process-current" strokeWidth={2.4} />
      <circle cx={now} cy={58} r={3.1} className="vertical-process-current-cap" />
      <text x={Math.min(right - 6, Math.max(left + 6, now))} y={34} textAnchor="middle" fontSize={8} className="vertical-process-graph-label" data-ink="current">{step}</text>
      {events.map((event, index) => {
        const x = xAt(event.iteration);
        const label = tags[index];
        const ahead = event.iteration > origin + step;
        return (
          <g
            key={event.iteration}
            data-state={ahead ? "ahead" : "reached"}
            onClick={(pointer) => {
              pointer.stopPropagation();
              onSeek(event.iteration);
            }}
          >
            <line x1={x} y1={48} x2={x} y2={68} className="vertical-process-stem" data-reason={event.reason} strokeWidth={0.45} />
            <circle cx={x} cy={58} r={4.2} fill="transparent" />
            <circle cx={x} cy={58} r={label ? 2.1 : 1.2} data-reason={event.reason} />
            {label ? <text x={x} y={80} textAnchor="middle" fontSize={4} className="vertical-process-graph-label" data-ink="mark">{label}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

function PropagationMarks({ iterations }: { iterations: number[] }) {
  const marks = iterations.length > 0 ? iterations : [0];
  return (
    <div className="vertical-process-tz" aria-hidden="true">
      <span>T</span>
      <div className="vertical-process-tz-track">
        {marks.map((iteration, index) => {
          const t = marks.length === 1 ? 0.5 : 0.14 + (index / (marks.length - 1)) * 0.72;
          return (
          <span key={`${iteration}-${index}`} style={{ bottom: `${t * 100}%` }}>
            <i />
            {iterations.length > 0 ? iteration : ""}
          </span>
          );
        })}
      </div>
      <span>Z</span>
    </div>
  );
}

function catalogueHref(search: string) {
  const params = new URLSearchParams(search);
  const query = params.toString();
  return query ? `/lab/vertical/catalogue?${query}` : "/lab/vertical/catalogue";
}

function joinSet(body: ApiSet): NaturalContinuationSet {
  const { fields, continuations, ...source } = body;
  return {
    ...source,
    continuations: continuations.map((continuation, index) => ({
      ...continuation,
      field: fields[index],
    })),
  };
}

function behaviorOf(set: NaturalContinuationSet | null): BehaviorProfile | null {
  if (!set) return null;
  if (set.origin === "development-fixture") return DEVELOPMENT_BEHAVIOR;
  const events = set.continuations[0]?.events.filter((event) => event.reason !== "z0") ?? [];
  const mean = (read: (event: (typeof events)[number]) => number) => {
    if (events.length === 0) return 0;
    return events.reduce((sum, event) => sum + read(event), 0) / events.length;
  };
  return {
    source: "event-measures" as const,
    persistence: mean((event) => event.persistence),
    migration: mean((event) => event.migration),
    reinforcement: mean((event) => event.reinforcement),
    connectivity: mean((event) => event.connectivityChange),
    spatialExtent: 0,
  };
}

export function VerticalProcess({
  initial,
  candidate,
}: {
  initial: NaturalContinuationSet | null;
  candidate: CandidateRequest | null;
}) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const [set, setSet] = useState<NaturalContinuationSet | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(initial == null && candidate != null);
  const [triangles, setTriangles] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [readyCandidate, setReadyCandidate] = useState<CandidateRequest | null>(null);
  const [semantic, setSemantic] = useState<Skill2Selection | null>(null);
  const [handoff, setHandoff] = useState<"verified" | "pending" | null>(null);
  const [storedZ0, setStoredZ0] = useState<number | null>(null);
  const onTriangles = useCallback((count: number | null) => setTriangles(count), []);
  const source = candidate ?? readyCandidate;

  useEffect(() => {
    if (initial || candidate) return;
    const controller = new AbortController();
    const load = () => {
      const activeId = readActiveArchetype();
      const selected = activeId ? readSkill2Selections()[activeId] : undefined;
      if (!selected) {
        setReadyCandidate(null);
        setSemantic(null);
        setHandoff(null);
        setStoredZ0(null);
        return;
      }
      setSemantic(selected);
      void fetch(`/api/semantic-catalog/${selected.archetypeId}/${selected.candidateId}/selection`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { handoff?: string; z0Iteration?: number | null } | null) => {
          if (controller.signal.aborted) return;
          if (body?.handoff !== "verified") {
            setReadyCandidate(null);
            setHandoff(body?.handoff === "pending" ? "pending" : null);
            setStoredZ0(null);
            return;
          }
          setHandoff("verified");
          setStoredZ0(typeof body.z0Iteration === "number" ? body.z0Iteration : null);
          const name = TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === selected.archetypeId)?.name;
          setReadyCandidate({
            archetypeId: selected.archetypeId,
            archetypeName: name ?? selected.archetypeId,
            typologyId: selected.typologyId,
            candidateId: selected.candidateId,
          });
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("lm-skill3-source", load);
    return () => {
      controller.abort();
      window.removeEventListener("lm-skill3-source", load);
    };
  }, [candidate, initial]);

  const continuationRequest = useRef(0);

  useEffect(() => {
    if (initial) return;
    setSet(null);
    setPlaying(false);
    setStep(0);
    setError(null);
  }, [initial, source?.archetypeId, source?.candidateId]);
  const beginContinuation = () => {
    if (initial || !source || pending) return;
    const token = ++continuationRequest.current;
    const params = new URLSearchParams({
      archetype: source.archetypeId,
      candidate: String(source.candidateId),
    });
    if (preview) params.set("preview", "1");
    setError(null);
    setPending(true);
    setPlaying(false);
    setStep(0);
    void fetch(`/api/vertical?${params}`)
      .then(async (response) => {
        const body = (await response.json()) as ApiSet & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The selected candidate could not be reconstructed.");
        if (token !== continuationRequest.current) return;
        setSet(joinSet(body));
        setPlaying(true);
      })
      .catch((caught) => {
        if (token !== continuationRequest.current) return;
        setSet(null);
        setError(caught instanceof Error ? caught.message : "The selected candidate could not be reconstructed.");
      })
      .finally(() => {
        if (token === continuationRequest.current) setPending(false);
      });
  };

  const matchesSelection = set != null && (
    source == null
    || (set.archetypeId === source.archetypeId && set.candidateId === source.candidateId)
  );
  const activeSet = matchesSelection ? set : null;
  const shown = activeSet?.continuations[0] ?? null;
  const horizon = activeSet?.rules.horizon ?? 0;
  const playOrigin = shown?.z0Iteration ?? 0;
  const playStep = horizon > 0 ? Math.min(horizon, Math.max(0, step)) : 0;
  const playIteration = playOrigin + playStep;

  useEffect(() => {
    setPlaying(false);
    setStep(0);
    setTriangles(null);
  }, [source?.archetypeId, source?.candidateId, shown?.parentChecksum, shown?.continuationSeed]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => (current >= horizon ? current : current + 1));
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, horizon]);

  useEffect(() => {
    if (playing && horizon > 0 && step >= horizon) setPlaying(false);
  }, [playing, step, horizon]);

  const seek = useCallback((iteration: number) => {
    if (!shown || horizon <= 0) return;
    setPlaying(false);
    const next = Math.min(horizon, Math.max(0, iteration - shown.z0Iteration));
    setStep(next);
  }, [shown, horizon]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!shown || horizon <= 0) {
      beginContinuation();
      return;
    }
    if (step >= horizon) setStep(0);
    setPlaying(true);
  };

  const resetReplay = () => {
    setPlaying(false);
    setStep(0);
  };
  const z0 = shown?.field.slices[0] ?? null;
  const identity = activeSet ?? source;
  const typology = identity ? TYPOLOGY[identity.typologyId] ?? identity.typologyId : "Archetype";
  const archetypeName = identity?.archetypeName ?? "Selected candidate";
  const candidateId = identity?.candidateId;
  const z0Iteration = activeSet?.z0Iteration ?? (pending || error ? null : storedZ0);
  const fixtureActive = search.get("fixture") === "1" || activeSet?.origin === "development-fixture";
  const verifiedZ0 = !fixtureActive && activeSet?.origin !== "provisional" && !preview && (handoff === "verified" || activeSet?.origin === "handoff");
  const objectives = semantic?.objectives ?? null;
  const specialist = specialistRole(semantic?.specialist ?? undefined);
  const context = [
    typology,
    archetypeName,
    candidateId != null ? `Candidate ${candidateId}` : "No candidate",
    z0Iteration != null ? `Z0 ${z0Iteration}` : error ? "Handoff validation failed" : pending ? "Checking handoff" : "Z0 withheld",
  ].join(" · ");
  const behavior = behaviorOf(activeSet);
  const bars = behavior
    ? ([
        ["Persistence", behavior.persistence],
        ["Migration", behavior.migration],
        ["Reinforcement", behavior.reinforcement],
        ["Connectivity", behavior.connectivity],
        ["Spatial extent", behavior.spatialExtent],
      ] as const)
    : [];

  const samples = shown?.acceptedIterations ?? [];
  const states = picturedStates(shown?.field.slices.length ?? 0);
  const tags = planeTags(shown?.events.length ?? 0);
  let activeIndex = 0;
  if (shown) {
    for (let index = 0; index < shown.events.length; index += 1) {
      if (shown.events[index].iteration <= playIteration) activeIndex = index;
    }
  }
  const revealedCount = shown ? activeIndex + 1 : 0;
  const activeSlice = shown?.field.slices[activeIndex] ?? null;
  const revealedField = useMemo(() => {
    if (!shown) return null;
    return { ...shown.field, slices: shown.field.slices.slice(0, revealedCount) };
  }, [shown, revealedCount]);
  const status = handoffStatus(activeSet?.origin, pending, error, verifiedZ0);

  const handoffFailed = error != null && !pending;

  return (
    <main className="evo-page vertical-process" data-origin={activeSet?.origin ?? "pending"} data-handoff={handoffFailed ? "failed" : undefined}>
      <header className="evo-header">
        <div>
          <p className="display evo-header-title">Vertical Propagation</p>
          <p className="eyebrow evo-header-detail">{context}</p>
        </div>
        {fixtureActive ? <p className="eyebrow vertical-process-flag">Development fixture</p> : null}
        {verifiedZ0 ? <p className="eyebrow vertical-process-flag">Skill 2 → Skill 3 · Verified Z0</p> : null}
        {preview || activeSet?.origin === "provisional" ? <p className="eyebrow vertical-process-flag">Provisional preview</p> : null}
      </header>

      <div className="vertical-process-body">
        <div className="vertical-process-inputs">
          <section className="vertical-process-frame">
            <header className="vertical-process-label">
              <p className="eyebrow">01</p>
              <h2 className="panel-title">Provenance</h2>
            </header>
            <ol className="vertical-process-search" aria-label="Semantic provenance">
              <li>
                <span>Archetype</span>
                <span>{archetypeName}</span>
              </li>
              <li>
                <span>Typology</span>
                <span>{typology}</span>
              </li>
              <li>
                <span>Candidate</span>
                <span>{candidateId != null ? String(candidateId) : "Waiting"}</span>
              </li>
              {semantic ? (
                <li>
                  <span>Pareto role</span>
                  <span>{paretoRole(semantic.pareto)}</span>
                </li>
              ) : null}
              {semantic ? (
                <li>
                  <span>Diversity role</span>
                  <span>{diversityRole(semantic.diversity)}</span>
                </li>
              ) : null}
              {specialist ? (
                <li>
                  <span>Specialist role</span>
                  <span>{specialist}</span>
                </li>
              ) : null}
              {z0Iteration != null ? (
                <li>
                  <span>Z0 iteration</span>
                  <span>{String(z0Iteration)}</span>
                </li>
              ) : null}
              <li>
                <span>Handoff</span>
                <span>{status}</span>
              </li>
            </ol>
          </section>
          <section className="vertical-process-frame">
            <header className="vertical-process-label">
              <p className="eyebrow">02</p>
              <h2 className="panel-title">Objectives</h2>
            </header>
            <ParetoSketch objectives={objectives} />
            <p className="vertical-process-note">{`Formal ${roundedScore(objectives?.formal)}`}</p>
            <p className="vertical-process-note">{`Spatial ${roundedScore(objectives?.spatial)}`}</p>
            <p className="vertical-process-note">{`Atmospheric ${roundedScore(objectives?.atmospheric)}`}</p>
          </section>
          <section className="vertical-process-frame vertical-process-selection">
            <header className="vertical-process-label">
              <p className="eyebrow">03</p>
              <h2 className="panel-title">Human selection</h2>
            </header>
            <div className="vertical-process-stage">
              {semantic?.previewFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${semantic.archetypeId}:${semantic.candidateId}`}
                  src={`/api/semantic-catalog/${semantic.archetypeId}/${semantic.candidateId}`}
                  alt={`${archetypeName} candidate ${semantic.candidateId}`}
                />
              ) : z0 ? (
                <ProcessPlate slice={z0} />
              ) : null}
            </div>
            <p className="vertical-process-note">Selected 2D state</p>
            <p className="vertical-process-note">{`Handoff → Skill 3 · ${status}`}</p>
          </section>
        </div>

        <section className="vertical-process-board" data-playing={playing || undefined}>
          <header className="vertical-process-label">
            <p className="eyebrow">Skill 3</p>
            <h2 className="panel-title">Process</h2>
            <div className="vertical-process-replay">
              <span>Playback {shown ? `${playStep} / ${horizon}` : "0 / 64"}</span>
              <button type="button" onClick={togglePlay} disabled={(!shown && !source) || handoffFailed || pending} title={handoffFailed ? "Unavailable until the handoff validates" : undefined}>{playing ? "Pause" : "Play"}</button>
              <button type="button" onClick={resetReplay} disabled={!shown || handoffFailed} title={handoffFailed ? "Unavailable until the handoff validates" : undefined}>Reset</button>
              <input
                type="range"
                min={0}
                max={Math.max(1, horizon)}
                value={playStep}
                aria-label="Continuation timeline"
                disabled={!shown || horizon <= 0 || handoffFailed}
                title={handoffFailed ? "Unavailable until the handoff validates" : undefined}
                onChange={(event) => seek(playOrigin + Number(event.target.value))}
              />
            </div>
          </header>
          <div className="vertical-process-replay-bar" aria-hidden="true">
            <span className="vertical-process-replay-fill" style={{ width: `${horizon ? (playStep / horizon) * 100 : 0}%` }} />
            <span className="vertical-process-replay-head" style={{ left: `${horizon ? (playStep / horizon) * 100 : 0}%` }} />
          </div>
          {handoffFailed && error ? (
            <div className="vertical-process-handoff-error" role="alert">
              <p className="vertical-process-handoff-error-title">Handoff validation failed</p>
              <p>The selected Skill 2 candidate cannot be reproduced exactly with the current upstream simulation state.</p>
              <p className="vertical-process-handoff-error-detail">{error}</p>
            </div>
          ) : null}
          <div className="vertical-process-center">
            <section className="vertical-process-region" data-step="initial" data-balance="visual">
              <header className="vertical-process-label">
                <p className="eyebrow">01</p>
                <h2 className="panel-title">Initial state</h2>
              </header>
              <div className="vertical-process-split">
                <div className="vertical-process-stage">{z0 ? <ProcessPlate slice={z0} /> : null}</div>
                <div className="vertical-process-meta">
                  <Strip
                    items={[
                      ["Candidate", candidateId != null ? String(candidateId) : "Waiting"],
                      ["Z0", z0Iteration != null ? String(z0Iteration) : "Waiting"],
                      ["Handoff", status],
                    ]}
                  />
                  <HandoffMark status={status} />
                </div>
              </div>
            </section>
            <section className="vertical-process-region" data-step="continuation" data-balance="graph">
              <header className="vertical-process-label">
                <p className="eyebrow">02</p>
                <h2 className="panel-title">Natural continuation</h2>
                <p className="vertical-process-aside">{shown ? `Horizon ${playStep} / ${horizon}` : "Continuation horizon"}</p>
              </header>
              <div className="vertical-process-split">
                <div className="vertical-process-stage">
                  {activeSlice ? <ProcessPlate slice={activeSlice} /> : null}
                  {shown ? (
                    <span className="vertical-process-now">
                      {playStep}
                      <small>{`Playback · horizon ${horizon}`}</small>
                    </span>
                  ) : null}
                </div>
                <div className="vertical-process-meta" data-layout="plot">
                  <Strip
                    items={[
                      ["Branch", shown?.id ?? "Waiting"],
                      ["Seed", shown ? String(shown.continuationSeed) : "Waiting"],
                      ["Horizon", set ? String(set.rules.horizon) : "Waiting"],
                    ]}
                  />
                  {shown && set ? (
                    <DeltaGraph
                      events={shown.events}
                      origin={shown.z0Iteration}
                      horizon={set.rules.horizon}
                      threshold={set.rules.deltaThreshold}
                      marks={states}
                      step={playStep}
                      onSeek={seek}
                    />
                  ) : null}
                </div>
              </div>
            </section>
            <section className="vertical-process-region" data-step="xyt" data-balance="graph">
              <header className="vertical-process-label">
                <p className="eyebrow">03</p>
                <h2 className="panel-title">Event sampling / XYT</h2>
                <p className="vertical-process-aside">T → Z</p>
              </header>
              <div className="vertical-process-split">
                <div className="vertical-process-stage">
                  {revealedField ? (
                    <ProcessStack
                      field={revealedField}
                      labels={tags}
                      reasons={shown?.events.map((event) => event.reason)}
                      plates={revealedField.slices.length}
                      onPick={(index) => {
                        const event = shown?.events[index];
                        if (event) seek(event.iteration);
                      }}
                    />
                  ) : null}
                </div>
                <div className="vertical-process-meta" data-layout="plot">
                  <Strip
                    items={[
                      ["Samples", shown ? String(shown.sampleCount) : "Waiting"],
                      ["Δ", set ? String(set.rules.deltaThreshold) : "Waiting"],
                      ["Gap", set ? `${set.rules.minGap}–${set.rules.maxGap}` : "Waiting"],
                    ]}
                  />
                  {shown && set ? (
                    <EventTimeline
                      events={shown.events}
                      origin={shown.z0Iteration}
                      horizon={set.rules.horizon}
                      minGap={set.rules.minGap}
                      maxGap={set.rules.maxGap}
                      tags={tags}
                      step={playStep}
                      onSeek={seek}
                    />
                  ) : null}
                </div>
              </div>
            </section>
            <section className="vertical-process-region" data-step="morphology" data-balance="visual">
              <header className="vertical-process-label">
                <p className="eyebrow">04</p>
                <h2 className="panel-title">3D morphology preview</h2>
                {shown ? <p className="vertical-process-aside">{shown.id} · {revealedCount < 2 ? "Z0 sample" : `${revealedCount} / ${shown.sampleCount} samples`}</p> : <p className="vertical-process-aside">Temporal sampling</p>}
              </header>
              <div className="vertical-process-split">
                <div className="vertical-process-stage">
                  {shown && revealedField ? (
                    <ProcessMorphology
                      key={`${activeSet?.origin ?? "pending"}:${shown.archetypeId}:${shown.candidateId}:${shown.parentChecksum}`}
                      field={revealedField}
                      cacheIdentity={`${activeSet?.origin ?? "pending"}:${shown.archetypeId}:${shown.candidateId}:${shown.id}`}
                      onTriangles={onTriangles}
                    />
                  ) : null}
                  {shown ? (
                    <span className="vertical-process-now">
                      {revealedCount < 2 ? "XYT at Z0" : `${revealedCount} / ${shown.sampleCount} samples`}
                    </span>
                  ) : null}
                </div>
                <div className="vertical-process-meta">
                  <Strip
                    items={[
                      ["Module", set ? `${set.rules.envelope.sizeX}×${set.rules.envelope.sizeY}×${set.rules.envelope.sizeZ}` : "Waiting"],
                      ["Samples", shown ? String(shown.sampleCount) : "Waiting"],
                      ["Mode", set?.rules.morphology ?? "Waiting"],
                      ["Triangles", triangles != null ? String(triangles) : "Waiting"],
                    ]}
                  />
                  <p className="vertical-process-reserved">Volume · Connectivity · Extent</p>
                </div>
              </div>
            </section>
          </div>
        </section>

        <aside className="vertical-process-logic">
          <section className="vertical-process-frame vertical-process-grow">
            <header className="vertical-process-label">
              <p className="eyebrow">T → Z</p>
              <h2 className="panel-title">Vertical propagation</h2>
            </header>
            <PropagationMarks iterations={samples} />
            <p className="vertical-process-note">Time becomes height. Sample gaps set Z.</p>
          </section>
          <section className="vertical-process-frame vertical-process-grow">
            <header className="vertical-process-label">
              <p className="eyebrow">Behavior</p>
              <h2 className="panel-title">Profile</h2>
            </header>
            <ul className="vertical-process-bars">
              {bars.map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <span className="vertical-process-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="vertical-process-note">
              {behavior?.source === "development-placeholder"
                ? "Placeholder. Describes behavior, not rank."
                : behavior
                  ? "Event measures. Extent is not measured yet."
                  : "After a verified continuation."}
            </p>
          </section>
          <details className="vertical-process-rules">
            <summary>Rules</summary>
            <p>
              {activeSet
                ? `Horizon ${activeSet.rules.horizon}. Samples no closer than ${activeSet.rules.minGap} steps, and at least every ${activeSet.rules.maxGap}. Envelope ${activeSet.rules.envelope.sizeX}×${activeSet.rules.envelope.sizeY}×${activeSet.rules.envelope.sizeZ}. Morphology ${activeSet.rules.morphology}.`
                : "The continuation uses the inherited slime and the current sampling horizon."}
            </p>
            <p>Further morphology rules can be added here if the 3D outcomes need them.</p>
          </details>
          <Link href={catalogueHref(search.toString())} className="vertical-process-catalogue">
            <span>Explore 3D catalogue</span>
            <span aria-hidden="true">→</span>
          </Link>
          <p className="vertical-process-note">Compare alternative natural continuation outcomes.</p>
        </aside>
      </div>
    </main>
  );
}
