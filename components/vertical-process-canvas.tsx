"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import handoffFile from "@/data/skill3/final-selection.json";
import { InheritCriteriaProfile } from "@/components/inherit-criteria-profile";
import { ProcessPlate, ProcessMorphology, ProcessStack } from "@/components/vertical-process-stage";
import type { SamplePresentation } from "@/components/vertical-render";
import { TYPOLOGIES } from "@/lib/catalog";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import type { CatalogueReadiness, ReadinessVerdict } from "@/lib/skill3/catalogue-readiness";
import type { ContinuationEvent, NaturalContinuation, NaturalContinuationRules, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import type { FinalHandoffSelection } from "@/lib/skill3/final-selection";
import { readActiveArchetype } from "@/lib/skill2/published-selection";
import type { ResolvedProcessSource } from "@/lib/skill3/selection";
import { decodeSolidifiedMesh, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

const HANDOFF = handoffFile.selections as FinalHandoffSelection[];

const BEHAVIOR_GROUPS: readonly { focus: string; start: number; end: number; count: number }[] = [
  { focus: "Formal", start: 1, end: 3, count: 3 },
  { focus: "Spatial", start: 4, end: 6, count: 3 },
  { focus: "Atmospheric", start: 7, end: 9, count: 3 },
  { focus: "Formal + Spatial", start: 10, end: 12, count: 3 },
  { focus: "Formal + Atmospheric", start: 13, end: 15, count: 3 },
  { focus: "Spatial + Atmospheric", start: 16, end: 18, count: 3 },
  { focus: "Formal + Spatial + Atmospheric", start: 19, end: 24, count: 6 },
];

type SolidifiedChecks = {
  components: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  manifold: "PASS" | "FAIL";
  preflight: "PASS" | "FAIL";
  triangles: number;
};

type ReplayBody = {
  rules: NaturalContinuationRules;
  continuation: NaturalContinuation;
};

type Identity = {
  z0Iteration: number | null;
  checksum: string | null;
  provenance: "skill2" | "solidified" | "fixture" | null;
};

function branchNumber(id: string | null) {
  if (!id || !/^N\d{2}$/.test(id)) return null;
  return Number(id.slice(1));
}

function groupFor(id: string | null) {
  const number = branchNumber(id);
  if (number == null) return null;
  return BEHAVIOR_GROUPS.find((group) => number >= group.start && number <= group.end) ?? null;
}

function meshVolume(mesh: IsoMesh) {
  const positions = mesh.positions;
  const indices = mesh.indices;
  let sum = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    sum += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]);
    sum += positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]);
    sum += positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return sum / 6;
}

function verdictLabel(verdict: ReadinessVerdict | null) {
  if (verdict === "ready") return "READY";
  if (verdict === "review") return "REVIEW";
  if (verdict === "fail") return "FAIL";
  return "Not audited";
}

async function readMesh(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { geometry?: EncodedSolidifiedMesh };
  if (!body.geometry?.positions || !body.geometry.normals || !body.geometry.indices) return null;
  return decodeSolidifiedMesh(body.geometry);
}

function DeltaClock({
  events,
  origin,
  horizon,
  threshold,
  step,
  onSeek,
}: {
  events: readonly ContinuationEvent[];
  origin: number;
  horizon: number;
  threshold: number;
  step: number;
  onSeek: (iteration: number) => void;
}) {
  if (events.length === 0 || horizon <= 0) return null;
  const max = Math.max(threshold, ...events.map((event) => event.delta), 0.001) * 1.18;
  const left = 12;
  const right = 97;
  const top = 10;
  const bottom = 78;
  const xAt = (iteration: number) => left + (Math.min(horizon, Math.max(0, iteration - origin)) / horizon) * (right - left);
  const yAt = (value: number) => bottom - (value / max) * (bottom - top);
  const path = events.map((event, index) => `${index === 0 ? "M" : "L"}${xAt(event.iteration)},${yAt(event.delta)}`).join(" ");
  const now = xAt(origin + step);
  const seek = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const t = (viewX - left) / (right - left);
    onSeek(origin + Math.round(Math.min(1, Math.max(0, t)) * horizon));
  };
  return (
    <svg
      className="vertical-process-graph process-clock"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Iteration against change"
      onClick={(event) => seek(event.clientX, event.currentTarget)}
    >
      <text x={left} y={6} fontSize={4} className="vertical-process-graph-label">Δ</text>
      <line x1={left} y1={yAt(0)} x2={right} y2={yAt(0)} className="vertical-process-axis" strokeWidth={0.35} />
      <line x1={left} y1={yAt(threshold)} x2={right} y2={yAt(threshold)} className="vertical-process-threshold" strokeWidth={0.4} />
      <text x={right} y={yAt(threshold) - 1.5} textAnchor="end" fontSize={3.4} className="vertical-process-graph-label" data-ink="copper">Δ {threshold}</text>
      <path d={path} strokeWidth={0.7} />
      <line x1={now} y1={bottom} x2={now} y2={top} className="vertical-process-current" strokeWidth={1.6} />
      {events.map((event) => {
        const ahead = event.iteration > origin + step;
        return (
          <g key={event.iteration} data-state={ahead ? "ahead" : "reached"} onClick={(pointer) => { pointer.stopPropagation(); onSeek(event.iteration); }}>
            <circle cx={xAt(event.iteration)} cy={yAt(event.delta)} r={3.2} fill="transparent" />
            <circle cx={xAt(event.iteration)} cy={yAt(event.delta)} r={1.15} data-reason={event.reason} />
          </g>
        );
      })}
      <text x={xAt(origin)} y={92} fontSize={3.4} className="vertical-process-graph-label">{origin}</text>
      <text x={xAt(origin + horizon)} y={92} textAnchor="end" fontSize={3.4} className="vertical-process-graph-label">{origin + horizon}</text>
    </svg>
  );
}

export function ProcessCanvas({
  initial = null,
  resolved = null,
}: {
  initial?: NaturalContinuationSet | null;
  resolved?: ResolvedProcessSource | null;
}) {
  const [archetypeId, setArchetypeId] = useState(initial?.archetypeId ?? resolved?.selection.archetypeId ?? CARVED_MASS_SOURCES[0].archetypeId);
  const [presentation, setPresentation] = useState<SamplePresentation>("raw");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [generated, setGenerated] = useState<number | null>(null);
  const [identity, setIdentity] = useState<Identity>({
    z0Iteration: resolved?.z0Iteration ?? null,
    checksum: resolved?.checksum ?? null,
    provenance: resolved?.handoff === "verified" ? "skill2" : null,
  });
  const [readiness, setReadiness] = useState<CatalogueReadiness | null>(null);
  const [replay, setReplay] = useState<ReplayBody | null>(null);
  const [replayNote, setReplayNote] = useState<string | null>(initial ? null : "Reading stored replay");
  const [openMesh, setOpenMesh] = useState<IsoMesh | null>(null);
  const [formReading, setFormReading] = useState<{ id: string; total: number; frames: Map<number, IsoMesh> } | null>(null);
  const [cappedMesh, setCappedMesh] = useState<IsoMesh | null>(null);
  const [adaptMesh, setAdaptMesh] = useState<IsoMesh | null>(null);
  const [finalMesh, setFinalMesh] = useState<IsoMesh | null>(null);
  const [checks, setChecks] = useState<SolidifiedChecks | null>(null);
  const [volume, setVolume] = useState<number | null>(null);

  useEffect(() => {
    if (initial) return;
    const sync = () => {
      const active = readActiveArchetype();
      if (active && CARVED_MASS_SOURCES.some((item) => item.archetypeId === active)) setArchetypeId(active);
    };
    sync();
    window.addEventListener("lm-skill3-source", sync);
    return () => window.removeEventListener("lm-skill3-source", sync);
  }, [initial]);

  const source = CARVED_MASS_SOURCES.find((item) => item.archetypeId === archetypeId) ?? null;
  const selected = HANDOFF.find((item) => item.archetypeId === archetypeId && item.candidateId === source?.candidateId) ?? null;
  const intent = useMemo(() => {
    try {
      return architecturalIntentFor(archetypeId);
    } catch {
      return null;
    }
  }, [archetypeId]);

  useEffect(() => {
    if (initial) {
      const continuation = initial.continuations.find((item) => item.field.slices.length > 0) ?? null;
      setReplay(continuation ? { rules: initial.rules, continuation } : null);
      setReplayNote(continuation ? null : "Temporal replay is not stored");
      setIdentity({ z0Iteration: initial.z0Iteration, checksum: initial.parentChecksum, provenance: "fixture" });
      return;
    }
    if (!source) return;
    const controller = new AbortController();
    setPlaying(false);
    setStep(0);
    setReplay(null);
    setFormReading(null);
    setOpenMesh(null);
    setCappedMesh(null);
    setAdaptMesh(null);
    setFinalMesh(null);
    setChecks(null);
    setVolume(null);
    setGenerated(null);
    setReadiness(null);
    setReplayNote("Reading stored replay");
    const sameResolved = resolved?.selection.archetypeId === source.archetypeId && resolved.selection.candidateId === source.candidateId;
    setIdentity({
      z0Iteration: sameResolved ? resolved?.z0Iteration ?? null : null,
      checksum: sameResolved ? resolved?.checksum ?? null : null,
      provenance: sameResolved && resolved?.handoff === "verified" ? "skill2" : null,
    });

    const loadReplay = async (continuationId: string) => {
      const params = new URLSearchParams({
        archetype: source.archetypeId,
        candidate: String(source.candidateId),
        continuation: continuationId,
        stored: "1",
      });
      const response = await fetch(`/api/vertical?${params}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) return null;
      const body = (await response.json()) as ReplayBody;
      if (!body.continuation?.field?.slices?.length || !body.rules) return null;
      return body;
    };

    const run = async () => {
      const chosenId = selected?.continuationId ?? "N01";
      let body = await loadReplay(chosenId);
      let note: string | null = null;
      if (!body && chosenId !== "N01") {
        body = await loadReplay("N01");
        if (body) note = "PROCESS REPLAY · N01";
      }
      if (controller.signal.aborted) return;
      setReplay(body);
      setReplayNote(body ? note : "Temporal replay is not stored for this archetype");
      const shownId = body?.continuation.id ?? chosenId;
      const meshBase = `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(source.archetypeId)}&continuation=${shownId}`;
      const [open, capped, adapted, solid, list, ready, catalogue, publishedZ0] = await Promise.all([
        readMesh(`${meshBase}&reading=open`, controller.signal),
        readMesh(`${meshBase}&reading=capped`, controller.signal),
        source.archetypeId === "inserted-horizontal-plate" ? readMesh(`${meshBase}&reading=adapted`, controller.signal) : Promise.resolve(null),
        fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}&continuation=${chosenId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ checks?: SolidifiedChecks; geometry?: EncodedSolidifiedMesh }> : null),
        fetch(`/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(source.archetypeId)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ continuations?: string[] }> : null),
        fetch(`/api/vertical/catalogue-readiness?archetype=${encodeURIComponent(source.archetypeId)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<CatalogueReadiness> : null),
        fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ continuations?: { z0Iteration?: number; parentChecksum?: string; triangles?: number }[] }> : null),
        fetch(`/api/vertical/z0?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ iteration?: number; checksum?: string }> : null),
      ]);
      if (controller.signal.aborted) return;
      setOpenMesh(open);
      setCappedMesh(capped);
      setAdaptMesh(adapted);
      setReadiness(ready);
      setGenerated(list?.continuations?.length ?? null);
      const recorded = catalogue?.continuations?.find((item) => (item.triangles ?? 0) > 0) ?? catalogue?.continuations?.[0];
      if (typeof publishedZ0?.iteration === "number" && publishedZ0.checksum) {
        setIdentity({ z0Iteration: publishedZ0.iteration, checksum: publishedZ0.checksum, provenance: "skill2" });
      } else if (recorded) {
        setIdentity({
          z0Iteration: typeof recorded.z0Iteration === "number" ? recorded.z0Iteration : null,
          checksum: recorded.parentChecksum ?? null,
          provenance: "solidified",
        });
      }
      const geometry = solid?.geometry;
      const mesh = geometry ? decodeSolidifiedMesh(geometry) : null;
      setFinalMesh(mesh);
      setChecks(solid?.checks ?? null);
      setVolume(mesh ? meshVolume(mesh) : null);
    };

    void run().catch((caught) => {
      if (controller.signal.aborted) return;
      setReplayNote(caught instanceof Error ? caught.message : "The stored process could not be read");
    });
    return () => controller.abort();
  }, [archetypeId, initial, resolved, selected?.continuationId, source]);

  const horizon = replay?.rules.horizon ?? 0;
  const origin = replay?.continuation.z0Iteration ?? identity.z0Iteration ?? 0;
  const playStep = horizon > 0 ? Math.min(horizon, Math.max(0, step)) : 0;
  const playIteration = origin + playStep;
  const keptIndex = useMemo(() => {
    if (!replay) return -1;
    let index = -1;
    replay.continuation.events.forEach((event, eventIndex) => {
      if (event.iteration <= playIteration) index = eventIndex;
    });
    return index;
  }, [playIteration, replay]);
  const exactEvent = replay?.continuation.events.find((event) => event.iteration === playIteration) ?? null;
  const revealedField = useMemo<VerticalViewerField | null>(() => {
    if (!replay || keptIndex < 0) return null;
    return { ...replay.continuation.field, slices: replay.continuation.field.slices.slice(0, keptIndex + 1) };
  }, [keptIndex, replay]);
  const activeSlice = revealedField?.slices[revealedField.slices.length - 1] ?? null;
  const retainedPlates = revealedField?.slices.length ?? 0;
  const formForReplay = replay && formReading?.id === replay.continuation.id ? formReading : null;
  const formTotal = formForReplay?.total ?? replay?.continuation.field.slices.length ?? 0;
  const formComplete = Boolean(replay) && formTotal > 0 && retainedPlates >= formTotal;
  const formMesh = !replay
    ? openMesh
    : formComplete
      ? openMesh
      : retainedPlates >= 2
        ? formForReplay?.frames.get(retainedPlates) ?? null
        : null;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => (current >= horizon ? current : current + 1));
    }, 120);
    return () => window.clearInterval(timer);
  }, [horizon, playing]);

  useEffect(() => {
    if (playing && horizon > 0 && step >= horizon) setPlaying(false);
  }, [horizon, playing, step]);

  const seek = useCallback((iteration: number) => {
    if (!replay || horizon <= 0) return;
    setPlaying(false);
    setStep(Math.min(horizon, Math.max(0, iteration - replay.continuation.z0Iteration)));
  }, [horizon, replay]);

  useEffect(() => {
    if (!replay || initial) return;
    const continuationId = replay.continuation.id;
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: archetypeId, continuation: continuationId });
    fetch(`/api/vertical/process-form?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ retainedTotal?: number; frames?: { retained: number; geometry?: EncodedSolidifiedMesh }[] }> : null)
      .then((body) => {
        if (!body?.frames?.length) return;
        const frames = new Map<number, IsoMesh>();
        for (const frame of body.frames) {
          if (!frame.geometry?.positions || !frame.geometry.normals || !frame.geometry.indices) continue;
          frames.set(frame.retained, decodeSolidifiedMesh(frame.geometry));
        }
        if (frames.size === 0) return;
        setFormReading({ id: continuationId, total: body.retainedTotal ?? replay.continuation.field.slices.length, frames });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [archetypeId, initial, replay]);

  const replayId = replay?.continuation.id ?? null;
  const replayGroup = groupFor(replayId);
  const selectedGroup = groupFor(selected?.continuationId ?? null);
  const cappedVerdict = selected ? readiness?.downstream.capped?.candidates[selected.continuationId]?.status ?? null : null;
  const adaptedVerdict = selected && archetypeId === "inserted-horizontal-plate"
    ? readiness?.downstream.adapted?.candidates[selected.continuationId]?.status ?? null
    : null;
  const catalogueVerdict = cappedVerdict ?? adaptedVerdict;
  const archetypeName = source?.archetypeName ?? TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === archetypeId)?.name ?? archetypeId;
  const catalogueHref = source ? `/lab/vertical/catalogue?archetype=${source.archetypeId}&candidate=${source.candidateId}` : "/lab/vertical/catalogue";
  const recordedReplay = archetypeId === "vertical-void" && replay != null;
  const recordedReplayLabel = recordedReplay ? `Recorded process replay · ${selected?.continuationId ?? replayId}` : null;

  return (
    <main className="vertical-process process-canvas" data-archetype={archetypeId}>
      <div className="process-setup">
        <section className="process-step process-start" aria-label="Start">
          <header className="vertical-process-label">
            <p className="eyebrow">01</p>
            <h2 className="panel-title">Start</h2>
          </header>
          <p className="process-kicker">{identity.provenance === "skill2" ? "Published Skill 2 Z0" : "Verified Z0"}</p>
          <p className="process-flow">{archetypeName}</p>
          <dl>
            <div><dt>Candidate</dt><dd>{source ? source.candidateId : "Pending"}</dd></div>
            <div><dt>Iteration</dt><dd>{identity.z0Iteration ?? "Pending"}</dd></div>
            <div><dt>Checksum</dt><dd>{identity.checksum ?? "Pending"}</dd></div>
            <div><dt>Source</dt><dd>{identity.provenance === "skill2" ? "Skill 2 snapshot" : identity.provenance === "solidified" ? "Solidified header" : identity.provenance === "fixture" ? "Fixture" : "Pending"}</dd></div>
          </dl>
        </section>

        <section className="process-step process-descriptors" aria-label="Inherit">
          <header className="vertical-process-label">
            <p className="eyebrow">02</p>
            <h2 className="panel-title">Inherit</h2>
          </header>
          <p className="process-kicker">Skill 2 state + criteria</p>
          <div className="process-descriptor-row process-inherit">
            {(["formal", "spatial", "atmospheric"] as const).map((family) => {
              const branch = intent?.[family];
              return (
                <article key={family} data-family={family}>
                  <h3>{family}</h3>
                  <p className="process-descriptor-name">{branch?.descriptor ?? "Pending"}</p>
                  {branch ? <InheritCriteriaProfile family={family} criteria={branch.criteria} /> : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="process-step process-recipes" aria-label="Continue">
          <header className="vertical-process-label">
            <p className="eyebrow">03</p>
            <h2 className="panel-title">Continue</h2>
          </header>
          <p className="process-kicker">N01–N24</p>
          <ol>
            {BEHAVIOR_GROUPS.map((group) => {
              const active = replayGroup?.focus === group.focus;
              return (
                <li key={group.focus} data-active={active ? "true" : "false"}>
                  <span>{group.count} {group.focus}</span>
                  <span>N{String(group.start).padStart(2, "0")}–N{String(group.end).padStart(2, "0")}</span>
                </li>
              );
            })}
          </ol>
          {replayNote === "PROCESS REPLAY · N01" ? <p className="process-pending">N01 is the stored replay. It is not the selected continuation.</p> : null}
          {selected && branchNumber(selected.continuationId) != null && (branchNumber(selected.continuationId) ?? 0) > 24 ? <p className="process-pending">Extended continuations stay in the catalogue.</p> : null}
          {selectedGroup && replayId && selected?.continuationId !== replayId ? <p className="process-pending">Selected {selected.continuationId} is chosen later.</p> : null}
        </section>
      </div>

      <div className="process-work">
        <section className="process-step process-live process-sample" aria-label="Sample">
          <header className="vertical-process-label">
            <p className="eyebrow">04</p>
            <h2 className="panel-title">Sample</h2>
            {recordedReplayLabel ? <p className="process-kicker">{recordedReplayLabel}</p> : null}
          </header>
          <div className="process-transport">
            <button type="button" onClick={() => { if (step >= horizon) setStep(0); setPlaying(true); }} disabled={!replay || playing}>Play</button>
            <button type="button" onClick={() => setPlaying(false)} disabled={!playing}>Pause</button>
            <button type="button" onClick={() => { setPlaying(false); setStep(0); }} disabled={!replay}>Restart</button>
            <label>
              <span>Scrub</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, horizon)}
                value={playStep}
                disabled={!replay}
                onChange={(event) => { setPlaying(false); setStep(Number(event.target.value)); }}
              />
            </label>
          </div>
          <p className="process-sample-read">
            <span>Δ clock {replay ? playIteration : "—"}</span>
            <span data-state={exactEvent ? "keep" : replay ? "skip" : "wait"} className="process-verdict">{replay ? exactEvent ? "Keep" : "Skip · field not stored" : "Waiting"}</span>
            <span>Δ {exactEvent ? exactEvent.delta.toFixed(3) : "—"}</span>
            <span>Threshold {replay ? replay.rules.deltaThreshold : "—"}</span>
          </p>
          <div className="process-field-mode" role="group" aria-label="Sample presentation">
            <button type="button" className="process-read" data-active={presentation === "raw" ? "true" : "false"} onClick={() => setPresentation("raw")}>Raw field</button>
            <button type="button" className="process-read" data-active={presentation === "contour" ? "true" : "false"} onClick={() => setPresentation("contour")}>Clean contour</button>
          </div>
          {activeSlice ? <p className="process-pending">Sample plate · stored iteration {activeSlice.iteration}</p> : null}
          <div className="process-plate-stage">
            {activeSlice ? <ProcessPlate slice={activeSlice} presentation={presentation} /> : <p className="process-pending">{replayNote ?? "Pending"}</p>}
          </div>
          {replay ? <p className="process-pending">Δ clock · every iteration</p> : null}
          {replay ? (
            <DeltaClock
              events={replay.continuation.events}
              origin={origin}
              horizon={horizon}
              threshold={replay.rules.deltaThreshold}
              step={playStep}
              onSeek={seek}
            />
          ) : null}
          {replay ? <p className="process-sample-rule">Kept at the start, when Δ crosses {replay.rules.deltaThreshold}, and when the gap reaches {replay.rules.maxGap}. Min gap {replay.rules.minGap}.</p> : null}
        </section>

        <section className="process-step process-live process-xyt" aria-label="Stack">
          <header className="vertical-process-label">
            <p className="eyebrow">05</p>
            <h2 className="panel-title">Stack</h2>
          </header>
          {recordedReplayLabel ? <p className="process-kicker">{recordedReplayLabel}</p> : null}
          <p className="process-kicker">Recorded XYT field</p>
          <p className="process-pending">{revealedField ? `${revealedField.slices.length} ${revealedField.slices.length === 1 ? "plate" : "plates"}` : "No plate yet"} · sample count, not module height</p>
          <div className="process-xyt-stage">
            {revealedField && revealedField.slices.length > 0 ? (
              <ProcessStack
                field={revealedField}
                plates={revealedField.slices.length}
                presentation={presentation}
                labels={replay?.continuation.events.slice(0, revealedField.slices.length).map((event) => String(event.iteration))}
                reasons={replay?.continuation.events.slice(0, revealedField.slices.length).map((event) => event.reason)}
              />
            ) : (
              <p className="process-pending">{replayNote ?? "Pending"}</p>
            )}
          </div>
        </section>

        <section className="process-step process-live process-form" aria-label="Form">
          <header className="vertical-process-label">
            <p className="eyebrow">06</p>
            <h2 className="panel-title">Form</h2>
          </header>
          {recordedReplayLabel ? <p className="process-kicker">{recordedReplayLabel}</p> : null}
          {replay ? (
            <>
              <p className="process-kicker">Formation state</p>
              <p className="process-pending">{retainedPlates} / {formTotal} retained plates</p>
              <p className="process-pending">{formComplete ? "Complete XYT reading" : "Partial XYT reading"}</p>
              {formComplete ? <p className="process-pending">Open · {replay.continuation.id}</p> : null}
            </>
          ) : (
            <p className="process-kicker">Recorded field → shared formation → open</p>
          )}
          <div className="process-form-stage">
            <div className="process-form-layer">
              {formMesh ? (
                <ProcessMorphology
                  mesh={formMesh}
                  cacheIdentity={replay ? `${archetypeId}:form:${replay.continuation.id}:${formComplete ? "open" : retainedPlates}` : `${archetypeId}:open:${replayId ?? selected?.continuationId ?? ""}`}
                  frame={replay ? "module" : "bounds"}
                  steer={Boolean(replay) && !playing}
                />
              ) : (
                <p className="process-pending">{replay ? (retainedPlates < 2 ? "Two retained plates" : "Formation frame pending") : "Open mesh pending"}</p>
              )}
            </div>
          </div>
          <ul className="process-form-notes">
            <li>Saddle shell</li>
            <li>Criteria release</li>
            <li>Side caves off</li>
            <li>Open reading</li>
          </ul>
        </section>

        <div className="process-down">
          <section className="process-step" aria-label="Cap">
            <header className="vertical-process-label">
              <p className="eyebrow">07</p>
              <h2 className="panel-title">Cap</h2>
            </header>
            <p className="process-kicker">Open → capped</p>
            <div className="process-cap-pair">
              <div>{openMesh ? <ProcessMorphology mesh={openMesh} cacheIdentity={`${archetypeId}:cap-open:${replayId ?? ""}`} /> : <p className="process-pending">Open</p>}</div>
              <span aria-hidden="true">→</span>
              <div>{cappedMesh ? <ProcessMorphology mesh={cappedMesh} cacheIdentity={`${archetypeId}:capped:${replayId ?? ""}`} /> : <p className="process-pending">Capped</p>}</div>
            </div>
            {adaptMesh ? (
              <p className="process-pending">Capped → Capped + Adapt · {replayId ?? selected?.continuationId}</p>
            ) : null}
            {adaptMesh ? (
              <div className="process-adapt-mesh">
                <ProcessMorphology mesh={adaptMesh} cacheIdentity={`${archetypeId}:adapted:${replayId ?? ""}`} />
              </div>
            ) : null}
          </section>

          <section className="process-step" aria-label="Choose">
            <header className="vertical-process-label">
              <p className="eyebrow">08</p>
              <h2 className="panel-title">Choose</h2>
            </header>
            <dl className="process-facts">
              <div><dt>Generated</dt><dd>{generated ?? "Pending"}</dd></div>
              <div><dt>Selected</dt><dd>{selected?.continuationId ?? "Pending"}</dd></div>
              <div><dt>Readiness</dt><dd>{verdictLabel(catalogueVerdict)}</dd></div>
            </dl>
            <p className="process-pending">One continuation is chosen by hand.</p>
            <Link href={catalogueHref} className="vertical-process-catalogue">Catalogue</Link>
          </section>

          <section className="process-step" aria-label="Solidify and validate">
            <header className="vertical-process-label">
              <p className="eyebrow">09</p>
              <h2 className="panel-title">Solidify</h2>
            </header>
            <p className="process-kicker">{selected ? selected.continuationId : "Selected continuation"}</p>
            <div className="process-final-mesh">
              {finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity={`${archetypeId}:solid:${selected?.continuationId ?? ""}`} /> : <p className="process-pending">Solidified module pending</p>}
            </div>
            <ul className="process-checks">
              <li data-pass={checks ? checks.components === 1 : undefined}>Single body {checks ? checks.components : "—"}</li>
              <li data-pass={checks ? checks.boundaryEdges === 0 : undefined}>Boundary edges {checks ? checks.boundaryEdges : "—"}</li>
              <li data-pass={checks ? checks.nonManifoldEdges === 0 : undefined}>Non-manifold {checks ? checks.nonManifoldEdges : "—"}</li>
              <li data-pass={volume != null ? volume > 0 : undefined}>Signed volume {volume == null ? "—" : volume > 0 ? "Positive" : "Not positive"}</li>
              <li data-pass={checks ? checks.preflight === "PASS" : undefined}>Kernel {checks?.preflight ?? "—"}</li>
            </ul>
          </section>

          <section className="process-step process-handoff-end" aria-label="Hand off">
            <header className="vertical-process-label">
              <p className="eyebrow">10</p>
              <h2 className="panel-title">Hand off</h2>
            </header>
            <p className="process-kicker">Skill 3 final module → Skill 4 input</p>
            <dl className="process-facts">
              <div><dt>Archetype</dt><dd>{archetypeName}</dd></div>
              <div><dt>Continuation</dt><dd>{selected?.continuationId ?? "Pending"}</dd></div>
              <div><dt>Material</dt><dd>Carved mass solidified</dd></div>
              <div><dt>Status</dt><dd>{selected?.status ?? "Pending"}</dd></div>
            </dl>
            <Link href="/lab/hybrid" className="vertical-process-catalogue">Skill 4</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
