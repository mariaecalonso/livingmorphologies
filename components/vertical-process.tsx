"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import { readActiveArchetype, readSkill2Selections, writeActiveArchetype, type Skill2Selection } from "@/lib/skill2/published-selection";
import {
  readSelectedSkill3Morphology,
  sameSelectedMorphology,
  selectedMorphologyFrom,
  writeSelectedSkill3Morphology,
} from "@/lib/skill3/morphology-selection";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import { DEVELOPMENT_BEHAVIOR, type BehaviorProfile } from "@/lib/skill3/behavior-profile";
import type { ContinuationEvent, NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { stackDisplayIndices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";
import { ProcessStory, type ProcessExample } from "@/components/vertical-process-story";

/** One published candidate used only when the browser has no Skill 2 selection. */
const TRIAL_ARCHETYPE = "vertical-void";
const TRIAL_CANDIDATE = 174;

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


type ApiContinuation = Omit<NaturalContinuation, "field">;

type ApiSet = Omit<NaturalContinuationSet, "continuations"> & {
  continuations: ApiContinuation[];
  fields: VerticalViewerField[];
};

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
  example = null,
}: {
  initial: NaturalContinuationSet | null;
  candidate: CandidateRequest | null;
  example?: ProcessExample | null;
}) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const [set, setSet] = useState<NaturalContinuationSet | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(initial == null && candidate != null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [readyCandidate, setReadyCandidate] = useState<CandidateRequest | null>(null);
  const [semantic, setSemantic] = useState<Skill2Selection | null>(null);
  const [handoff, setHandoff] = useState<"verified" | "pending" | null>(null);
  const [storedZ0, setStoredZ0] = useState<number | null>(null);
  const [activeArchetypeId, setActiveArchetypeId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const pinnedSelection = useRef<Skill2Selection | null>(null);
  const source = candidate ?? readyCandidate;

  const acceptSelection = useCallback((selected: Skill2Selection, signal?: AbortSignal) => {
    setSemantic(selected);
    setSaveNote(null);
    void fetch(`/api/semantic-catalog/${selected.archetypeId}/${selected.candidateId}/selection`, { signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { handoff?: string; z0Iteration?: number | null } | null) => {
        if (signal?.aborted) return;
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
  }, []);

  useEffect(() => {
    if (initial || candidate) return;
    const controller = new AbortController();
    const loadStored = () => {
      const activeId = readActiveArchetype();
      setActiveArchetypeId(activeId);
      const selected = activeId ? readSkill2Selections()[activeId] : undefined;
      if (!selected) {
        if (pinnedSelection.current) {
          acceptSelection(pinnedSelection.current, controller.signal);
          return;
        }
        setReadyCandidate(null);
        setSemantic(null);
        setHandoff(null);
        setStoredZ0(null);
        return;
      }
      pinnedSelection.current = null;
      acceptSelection(selected, controller.signal);
    };
    loadStored();
    const onSource = () => {
      pinnedSelection.current = null;
      loadStored();
    };
    window.addEventListener("lm-skill3-source", onSource);
    return () => {
      controller.abort();
      window.removeEventListener("lm-skill3-source", onSource);
    };
  }, [acceptSelection, candidate, initial]);

  const loadOneSelection = () => {
    if (initial || candidate) return;
    const stored = readSkill2Selections();
    const activeId = readActiveArchetype();
    const selected = (activeId ? stored[activeId] : undefined) ?? Object.values(stored)[0];
    if (selected) {
      pinnedSelection.current = null;
      writeActiveArchetype(selected.archetypeId);
      window.dispatchEvent(new Event("lm-skill3-source"));
      return;
    }
    setError(null);
    void fetch(`/api/semantic-catalog/${TRIAL_ARCHETYPE}/${TRIAL_CANDIDATE}/selection`)
      .then(async (response) => {
        const body = (await response.json()) as { selection?: Skill2Selection; error?: string };
        if (!response.ok || !body.selection) throw new Error(body.error ?? "No published Skill 2 selection was found.");
        pinnedSelection.current = body.selection;
        setActiveArchetypeId(body.selection.archetypeId);
        acceptSelection(body.selection);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "No published Skill 2 selection was found.");
      });
  };

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
  const watchedId = semantic?.archetypeId ?? activeArchetypeId;
  const watched = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((item) => ({ ...item, typologyId: typology.id, typologyLabel: TYPOLOGY[typology.id] ?? typology.label }))).find((item) => item.id === watchedId);
  const identity = activeSet ?? source;
  const typology = watched?.typologyLabel ?? (identity ? TYPOLOGY[identity.typologyId] ?? identity.typologyId : "Archetype");
  const archetypeName = watched?.name ?? identity?.archetypeName ?? "Selected candidate";
  const candidateId = semantic?.candidateId ?? identity?.candidateId;
  const z0Iteration = activeSet?.z0Iteration ?? (pending || error ? null : storedZ0);
  const checksum = shown?.parentChecksum ?? activeSet?.parentChecksum ?? null;
  const intent = useMemo(() => {
    if (!watchedId) return null;
    try {
      return architecturalIntentFor(watchedId);
    } catch {
      return null;
    }
  }, [watchedId]);
  const fixtureActive = search.get("fixture") === "1" || activeSet?.origin === "development-fixture";
  const verifiedZ0 = !fixtureActive && activeSet?.origin !== "provisional" && !preview && (handoff === "verified" || activeSet?.origin === "handoff");
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

  const saveOneResult = () => {
    if (!activeSet || activeSet.origin !== "handoff" || !shown) return;
    const next = selectedMorphologyFrom(activeSet, shown);
    writeSelectedSkill3Morphology(next);
    const stored = readSelectedSkill3Morphology("handoff", next.archetypeId);
    setSaveNote(stored && sameSelectedMorphology(stored, shown) ? `Saved ${stored.continuationId} for ${stored.archetypeId}` : "Save did not write lm-skill3-morphology");
  };

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
        <div data-temporary="skill3-run">
          <button type="button" onClick={loadOneSelection} disabled={Boolean(initial || candidate)}>Load Skill 2 selection</button>
          <button type="button" onClick={beginContinuation} disabled={!source || pending || Boolean(initial)}>Run vertical propagation</button>
          <button type="button" onClick={saveOneResult} disabled={!shown || activeSet?.origin !== "handoff"}>Save result</button>
          {saveNote ? <span>{saveNote}</span> : null}
        </div>
      </header>

      <div className="vertical-process-body">
        <div className="vertical-process-inputs" aria-label="Skill 2 Input">
          <section className="vertical-process-frame vertical-process-input-identity">
            <h2 className="panel-title">{archetypeName}</h2>
            <p className="vertical-process-note">{candidateId != null ? `Candidate ${candidateId}` : "Candidate waiting"}</p>
          </section>
          <section className="vertical-process-frame vertical-process-input-descriptors" aria-label="Inherited descriptors">
            <dl>
              {(["formal", "spatial", "atmospheric"] as const).map((family) => (
                <div key={family}>
                  <dt>{family}</dt>
                  <dd>{intent?.[family].descriptor ?? "Pending"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="vertical-process-frame vertical-process-selection">
            <p className="vertical-process-input-kicker">Selected 2D morphology</p>
            <div className="vertical-process-stage">
              {semantic ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${semantic.archetypeId}:${semantic.candidateId}`}
                  className="evolution-image"
                  src={`/api/semantic-catalog/${semantic.archetypeId}/${semantic.candidateId}`}
                  alt={`${archetypeName} selected Skill 2 morphology ${semantic.candidateId}`}
                />
              ) : null}
            </div>
            <p className="vertical-process-input-kicker">Verified Z0</p>
            <p className="vertical-process-note">
              {z0Iteration != null ? `Iteration ${z0Iteration}` : "Iteration waiting"}
              {" · "}
              {verifiedZ0 ? "Verified" : handoff === "pending" ? "Pending" : semantic ? "Not verified" : "Waiting"}
              {" · "}
              {checksum ?? "Checksum waiting"}
            </p>
          </section>
        </div>

        <div className="process-story-wrap">
          {handoffFailed && error ? (
            <div className="vertical-process-handoff-error" role="alert">
              <p className="vertical-process-handoff-error-title">Handoff validation failed</p>
              <p>The selected Skill 2 candidate cannot be reproduced exactly with the current upstream simulation state.</p>
              <p className="vertical-process-handoff-error-detail">{error}</p>
            </div>
          ) : null}
          <ProcessStory
            example={example}
            catalogueHref={catalogueHref(search.toString())}
            saveNote={saveNote}
          />
        </div>
      </div>
    </main>
  );
}
