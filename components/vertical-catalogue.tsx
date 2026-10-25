"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import savedPicks from "@/data/skill2/pareto-catalog/selections.json";
import { CatalogueField, type CatalogueModule, type CatalogueSurface } from "@/components/vertical-catalogue-scene";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { parseSkill2Selection, readActiveArchetype, readSkill2Selections, SKILL2_SELECTIONS_KEY } from "@/lib/skill2/published-selection";
import { CATALOGUE_COLUMNS, CATALOGUE_ROWS, catalogueSlots } from "@/lib/skill3/catalogue";
import type { CatalogueReadiness, MaterializationState, ReadinessVerdict } from "@/lib/skill3/catalogue-readiness";
import type { ContinuationEvent, NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z } from "@/lib/skill3/envelope";
import {
  readSelectedSkill3Morphology,
  sameSelectedMorphology,
  selectedMorphologyFrom,
  writeSelectedSkill3Morphology,
  type SelectedSkill3Morphology,
} from "@/lib/skill3/morphology-selection";

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

type SolidifiedStatus = "validated" | "review";

type SolidifiedEntry = {
  moduleId: string;
  typologyId: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  continuationId: string;
  branchIndex: number;
  continuationSeed: number;
  z0Iteration: number;
  parentChecksum: string;
  status: SolidifiedStatus;
};

type SolidifiedIndex = {
  typologyId: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  continuations: SolidifiedEntry[];
};

const SOLIDIFIED_RULES = {
  horizon: 64,
  minGap: 8,
  maxGap: 24,
  deltaThreshold: 0.08,
  weights: { persistence: 0.35, migration: 0.25, reinforcement: 0.2, connectivity: 0.2 },
  trailEpsilon: 0.003,
  connectivityResolution: 32,
  envelope: { sizeX: MODULE_SIZE_X, sizeY: MODULE_SIZE_Y, sizeZ: MODULE_SIZE_Z },
  morphology: "network" as const,
  transform: "none" as const,
};

function z0Event(iteration: number): ContinuationEvent {
  return {
    index: 0,
    iteration,
    reason: "z0",
    referenceIteration: null,
    delta: 0,
    persistence: 0,
    migration: 0,
    reinforcement: 0,
    connectivityChange: 0,
  };
}

function storedReadingSeed(archetypeId: string, candidateId: number, branchIndex: number) {
  const text = `${archetypeId}#${candidateId}#${branchIndex}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

function withStoredReadings(set: NaturalContinuationSet, ids: readonly string[]): NaturalContinuationSet {
  const template = set.continuations[0];
  if (!template) return set;
  const known = new Set(set.continuations.map((item) => item.id));
  const added = ids.flatMap((id) => {
    if (!/^N\d{2}$/.test(id) || known.has(id)) return [];
    const index = Number(id.slice(1));
    if (!Number.isInteger(index) || index < 1) return [];
    return [{
      ...template,
      id,
      index,
      continuationSeed: storedReadingSeed(set.archetypeId, set.candidateId, index),
      acceptedIterations: [template.z0Iteration],
      sampleCount: 1,
      eventCount: 0,
      events: [z0Event(template.z0Iteration)],
      field: {
        lineage: { ...template.field.lineage, futureId: id },
        slices: [],
      },
    }];
  });
  if (added.length === 0) return set;
  return { ...set, continuations: [...set.continuations, ...added] };
}

function setFromSolidified(body: SolidifiedIndex): NaturalContinuationSet {
  const first = body.continuations[0];
  return {
    origin: "handoff",
    typologyId: body.typologyId,
    archetypeId: body.archetypeId,
    archetypeName: body.archetypeName,
    candidateId: body.candidateId,
    runKey: `${body.archetypeId}@solidified`,
    z0Iteration: first?.z0Iteration ?? 0,
    parentChecksum: first?.parentChecksum ?? "",
    slime: {} as NaturalContinuationSet["slime"],
    rules: SOLIDIFIED_RULES,
    continuations: body.continuations.map((entry) => ({
      id: entry.continuationId,
      index: entry.branchIndex,
      continuationSeed: entry.continuationSeed,
      typologyId: entry.typologyId,
      archetypeId: entry.archetypeId,
      archetypeName: entry.archetypeName,
      candidateId: entry.candidateId,
      runKey: `${entry.archetypeId}@solidified`,
      z0Iteration: entry.z0Iteration,
      parentChecksum: entry.parentChecksum,
      acceptedIterations: [entry.z0Iteration],
      sampleCount: 1,
      eventCount: 0,
      events: [z0Event(entry.z0Iteration)],
      field: {
        lineage: {
          archetypeId: entry.archetypeId,
          archetypeName: entry.archetypeName,
          candidateId: entry.candidateId,
          z0Iteration: entry.z0Iteration,
          futureId: entry.continuationId,
        },
        slices: [],
      },
    })),
  };
}

function archetypesFor(typologyId: string) {
  return Object.values(ARCHETYPES).filter((item) => item.typologyId === typologyId);
}

function canonicalCandidateId(archetypeId: string) {
  const pick = (savedPicks as Record<string, { candidateId?: number }>)[archetypeId];
  const candidateId = pick?.candidateId;
  return Number.isInteger(candidateId) && candidateId != null && candidateId >= 1 ? candidateId : null;
}

function selectionFor(archetypeId: string) {
  const stored = readSkill2Selections()[archetypeId];
  if (stored) return stored;
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SKILL2_SELECTIONS_KEY);
  if (!raw) return null;
  try {
    const parsed = parseSkill2Selection(JSON.parse(raw)[archetypeId]);
    return parsed?.archetypeId === archetypeId ? parsed : null;
  } catch {
    return null;
  }
}

const REASON_LABEL: Record<string, string> = {
  z0: "Z0",
  threshold: "Threshold",
  "max-gap": "Max gap",
};

const PLACEHOLDER_MODULES: CatalogueModule[] = Array.from({ length: CATALOGUE_COLUMNS * CATALOGUE_ROWS }, (_, index) => ({
  id: `slot-${String(index + 1).padStart(2, "0")}`,
  label: `N${String(index + 1).padStart(2, "0")}`,
  cacheIdentity: `placeholder:${index + 1}`,
  placeholder: true,
}));

function ResultDetail({
  resultId,
  continuation,
  typology,
  archetype,
  moduleSize,
  horizon,
  morphology,
  triangles,
  readiness,
  stateLabel,
  unaudited,
  chosen,
  savedContinuationId,
  finalHref,
  surface,
  onSurface,
  onBack,
  onChoose,
}: {
  resultId: string;
  continuation: NaturalContinuation;
  typology: string;
  archetype: string;
  moduleSize: string;
  horizon: string;
  morphology: string;
  triangles: number | null;
  readiness: { status: ReadinessVerdict; reasons: string[]; facts?: Record<string, string> } | null;
  stateLabel: string | null;
  unaudited: boolean;
  chosen: boolean;
  savedContinuationId: string | null;
  finalHref: string;
  surface: CatalogueSurface;
  onSurface: (surface: CatalogueSurface) => void;
  onBack: () => void;
  onChoose: () => void;
}) {
  const marks = continuation.events.slice(0, 8).map((event, index, list) => ({
    key: `${event.iteration}-${index}`,
    label: index === 0 ? "Z0" : index === list.length - 1 && continuation.events.length <= 8 && list.length > 1 ? "Late" : String(index).padStart(2, "0"),
    reason: REASON_LABEL[event.reason] ?? event.reason,
  }));
  const hidden = Math.max(0, continuation.events.length - marks.length);
  return (
    <div className="vertical-catalogue-detail vertical-catalogue-card">
      <button type="button" className="vertical-catalogue-reset" onClick={onBack}>Back to catalogue</button>
      <h2 className="panel-title">Result {resultId}</h2>
      <button type="button" className="vertical-catalogue-reset" data-chosen={chosen || undefined} onClick={onChoose}>
        {chosen ? "Selected ✓" : "Select morphology"}
      </button>
      {chosen ? <Link href={finalHref} className="vertical-catalogue-reset">View in final</Link> : null}
      {!chosen && savedContinuationId ? <p className="vertical-process-note">Final selection {savedContinuationId}</p> : null}
      {CATALOGUE_SURFACE_CONTROL ? <PreviewToggle surface={surface} onSurface={onSurface} /> : null}
      <dl className="vertical-catalogue-facts">
        {stateLabel ? <div><dt>State</dt><dd>{stateLabel}</dd></div> : null}
        {readiness ? <div><dt>Status</dt><dd>{readiness.status}</dd></div> : null}
        {readiness?.facts ? Object.entries(readiness.facts).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
        )) : null}
        {readiness && readiness.reasons.length > 0 ? (
          <div><dt>Reason</dt><dd className="vertical-catalogue-reason">{readiness.reasons.join(" · ")}</dd></div>
        ) : null}
        <div><dt>Result</dt><dd>{resultId}</dd></div>
        <div><dt>Continuation</dt><dd>{continuation.id}</dd></div>
        <div><dt>Seed</dt><dd>{String(continuation.continuationSeed)}</dd></div>
        <div><dt>Typology</dt><dd>{typology}</dd></div>
        <div><dt>Archetype</dt><dd>{archetype}</dd></div>
        <div><dt>Candidate</dt><dd>{String(continuation.candidateId)}</dd></div>
        <div><dt>Z0</dt><dd>{String(continuation.z0Iteration)}</dd></div>
        <div><dt>Samples</dt><dd>{String(continuation.sampleCount)}</dd></div>
        <div><dt>Events</dt><dd>{String(continuation.eventCount)}</dd></div>
        <div><dt>Module</dt><dd>{moduleSize}</dd></div>
        <div><dt>Horizon</dt><dd>{horizon}</dd></div>
        <div><dt>Rank</dt><dd>{resultId}</dd></div>
        <div><dt>Mode</dt><dd>{morphology}</dd></div>
        <div><dt>Triangles</dt><dd>{triangles != null ? String(triangles) : "—"}</dd></div>
      </dl>
      {unaudited ? <p className="vertical-process-note">Readiness not audited</p> : null}
      <h2 className="panel-title">Behavior profile</h2>
      <p className="vertical-process-note">Behavior descriptors pending</p>
      <h2 className="panel-title">Accepted samples</h2>
      <p className="vertical-process-note">{continuation.events.length} accepted {continuation.events.length === 1 ? "sample" : "samples"}</p>
      <div className="vertical-catalogue-events">
        {marks.map((mark) => (
          <span key={mark.key}>
            {mark.label}
            <small>{mark.reason}</small>
          </span>
        ))}
        {hidden > 0 ? <span>+{hidden}</span> : null}
      </div>
    </div>
  );
}

function PreviewToggle({
  surface,
  onSurface,
}: {
  surface: CatalogueSurface;
  onSurface: (surface: CatalogueSurface) => void;
}) {
  return (
    <div className="vertical-catalogue-choices" role="group" aria-label="Morphology preview">
      <button type="button" data-active={surface === "refined" || undefined} onClick={() => onSurface("refined")}>Refined</button>
      <button type="button" data-active={surface === "raw" || undefined} onClick={() => onSurface("raw")}>Raw</button>
    </div>
  );
}

const CATALOGUE_SURFACE_CONTROL = false;

type CatalogueReading = MaterializationState;

const STATE_LABEL: Record<CatalogueReading, string> = {
  open: "Open",
  capped: "Capped",
  adapted: "Capped + Adapt",
  shrinkwrapped: "Shrinkwrapped",
  thickened: "Thickened",
};

const OPEN_ONLY: CatalogueReading[] = ["open"];
const HIDDEN_READINGS = new Set<CatalogueReading>(["shrinkwrapped", "thickened"]);

function ReadingToggle({
  reading,
  states,
  onReading,
}: {
  reading: CatalogueReading;
  states: readonly CatalogueReading[];
  onReading: (reading: CatalogueReading) => void;
}) {
  return (
    <div className="vertical-catalogue-choices" role="group" aria-label="State">
      {states.map((state) => (
        <button key={state} type="button" data-active={reading === state || undefined} onClick={() => onReading(state)}>
          {STATE_LABEL[state]}
        </button>
      ))}
    </div>
  );
}

function PlaceholderDetail({
  rank,
  archetype,
  typology,
  onBack,
}: {
  rank: string;
  archetype: string;
  typology: string;
  onBack: () => void;
}) {
  return (
    <div className="vertical-catalogue-detail vertical-catalogue-card">
      <button type="button" className="vertical-catalogue-reset" onClick={onBack}>Back to catalogue</button>
      <h2 className="panel-title">Result {rank}</h2>
      <button type="button" className="vertical-catalogue-reset" disabled>
        Select morphology
      </button>
      <p className="vertical-process-note">A continuation is required for this archetype</p>
      <dl className="vertical-catalogue-facts">
        <div><dt>Branch</dt><dd>—</dd></div>
        <div><dt>Archetype</dt><dd>{archetype}</dd></div>
        <div><dt>Typology</dt><dd>{typology}</dd></div>
        <div><dt>Candidate</dt><dd>—</dd></div>
        <div><dt>Samples</dt><dd>—</dd></div>
        <div><dt>Horizon</dt><dd>—</dd></div>
        <div><dt>Rank</dt><dd>{rank}</dd></div>
        <div><dt>Focus</dt><dd>—</dd></div>
        <div><dt>Geometry</dt><dd>Placeholder</dd></div>
        <div><dt>Triangles</dt><dd>—</dd></div>
      </dl>
    </div>
  );
}

export function VerticalCatalogue({
  initial,
  candidate,
  requestedArchetypeId = null,
}: {
  initial: NaturalContinuationSet | null;
  candidate: CandidateRequest | null;
  requestedArchetypeId?: string | null;
}) {
  const search = useSearchParams();
  const searchString = search.toString();
  const router = useRouter();
  const preview = search.get("preview") === "1";
  const requestedArchetype = requestedArchetypeId
    ? Object.values(ARCHETYPES).find((item) => item.id === requestedArchetypeId) ?? null
    : null;
  const [set, setSet] = useState<NaturalContinuationSet | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(initial == null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [storedChoice, setStoredChoice] = useState<SelectedSkill3Morphology | null>(null);
  const [triangles, setTriangles] = useState<Record<string, number>>({});
  const [readiness, setReadiness] = useState<{ archetypeId: string; body: CatalogueReadiness } | null>(null);
  const viewReset = 0;
  const [surface, setSurface] = useState<CatalogueSurface>("refined");
  const [reading, setReading] = useState<CatalogueReading>("open");
  const [typologyId, setTypologyId] = useState(initial?.typologyId || candidate?.typologyId || requestedArchetype?.typologyId || "lobby");
  const [archetypeId, setArchetypeId] = useState(initial?.archetypeId || candidate?.archetypeId || requestedArchetype?.id || "continuous-hall");
  const alignedSelection = useRef(false);
  const loadedKey = useRef<string | null>(initial ? `${initial.archetypeId}:${initial.candidateId}` : null);

  useEffect(() => {
    if (initial || candidate || requestedArchetypeId || alignedSelection.current) return;
    alignedSelection.current = true;
    const activeId = readActiveArchetype();
    const selected = activeId ? selectionFor(activeId) : undefined;
    if (!selected) return;
    setTypologyId(selected.typologyId);
    setArchetypeId(selected.archetypeId);
  }, [candidate, initial, requestedArchetypeId]);

  useEffect(() => {
    if (initial) return;
    const fromQuery = candidate?.archetypeId === archetypeId ? candidate.candidateId : null;
    const fromSession = fromQuery == null ? selectionFor(archetypeId)?.candidateId ?? null : null;
    const candidateId = fromQuery ?? fromSession ?? canonicalCandidateId(archetypeId);
    const key = `solidified:${archetypeId}:${candidateId ?? ""}`;
    if (loadedKey.current === key || loadedKey.current === `miss:${key}`) return;
    const controller = new AbortController();
    const replaceQuery = (nextCandidateId: number | null) => {
      const params = new URLSearchParams(searchString);
      params.set("archetype", archetypeId);
      if (nextCandidateId == null) params.delete("candidate");
      else params.set("candidate", String(nextCandidateId));
      const next = params.toString();
      if (next === searchString) return;
      router.replace(next ? `/lab/vertical/catalogue?${next}` : "/lab/vertical/catalogue", { scroll: false });
    };
    if (candidateId == null) {
      loadedKey.current = `miss:${key}`;
      setSet(null);
      setPending(false);
      setError(null);
      replaceQuery(null);
      return;
    }
    const params = new URLSearchParams({
      archetype: archetypeId,
      candidate: String(candidateId),
    });
    setPending(true);
    setError(null);
    void fetch(`/api/vertical/solidified?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          loadedKey.current = `miss:${key}`;
          setSet(null);
          replaceQuery(fromQuery == null && fromSession == null ? null : candidateId);
          return;
        }
        const body = (await response.json()) as SolidifiedIndex & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The solidified catalogue is not loaded.");
        const listed = await fetch(`/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(archetypeId)}`, { signal: controller.signal })
          .then(async (reading) => reading.ok ? reading.json() as Promise<{ continuations?: string[] }> : { continuations: [] as string[] })
          .catch(() => ({ continuations: [] as string[] }));
        if (controller.signal.aborted) return;
        loadedKey.current = `solidified:${archetypeId}:${body.candidateId}`;
        setSet(withStoredReadings(setFromSolidified(body), listed.continuations ?? []));
        replaceQuery(body.candidateId);
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(caught instanceof Error ? caught.message : "The continuation bundle is not loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [archetypeId, candidate, initial, router, searchString]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/vertical/catalogue-readiness?archetype=${encodeURIComponent(archetypeId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The materialization status is not loaded.");
        return response.json() as Promise<CatalogueReadiness>;
      })
      .then((body) => {
        if (!controller.signal.aborted) setReadiness({ archetypeId, body });
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setReadiness({ archetypeId, body: { states: OPEN_ONLY, downstream: {} } });
      });
    return () => controller.abort();
  }, [archetypeId]);

  const currentReadiness = readiness?.archetypeId === archetypeId ? readiness.body : null;
  const availableStates = (currentReadiness?.states ?? OPEN_ONLY).filter((state) => !HIDDEN_READINGS.has(state));

  useEffect(() => {
    if (!currentReadiness) return;
    if (HIDDEN_READINGS.has(reading) || !currentReadiness.states.includes(reading)) setReading("open");
  }, [currentReadiness, reading]);

  useEffect(() => {
    if (!set) return;
    setStoredChoice(readSelectedSkill3Morphology(set.origin, set.archetypeId));
  }, [set]);

  const matches = set != null && set.typologyId === typologyId && set.archetypeId === archetypeId;
  const slots = useMemo(() => (matches && set ? catalogueSlots(set.continuations) : []), [matches, set]);
  const selected = slots.find((item) => item.id === selectedId) ?? null;
  const generated = matches && set ? set.continuations.length : 0;
  const downstream = reading === "open" ? null : currentReadiness?.downstream[reading] ?? null;
  const auditedDownstream = downstream?.audited ? downstream : null;
  const archetypeName = archetypesFor(typologyId).find((item) => item.id === archetypeId)?.name
    ?? (matches ? set?.archetypeName : null)
    ?? "Archetype";
  const processParams = new URLSearchParams(search.toString());
  const processHref = processParams.toString() ? `/lab/vertical?${processParams.toString()}` : "/lab/vertical";
  const modules = useMemo<CatalogueModule[]>(() => {
    if (!matches || !set || slots.length === 0) return PLACEHOLDER_MODULES;
    return slots.map((item) => ({
      id: item.id,
      label: item.id,
      cacheIdentity: `hybrid:${reading}:${item.archetypeId}:${item.candidateId}:${item.id}:${item.parentChecksum}`,
      status: reading === "adapted" ? undefined : auditedDownstream?.candidates[item.id]?.status,
      meshUrl: `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(item.archetypeId)}&continuation=${item.id}&reading=${reading}`,
    }));
  }, [auditedDownstream, matches, reading, set, slots]);
  const chosenContinuation = storedChoice && matches && set && storedChoice.origin === set.origin
    ? set.continuations.find((item) => sameSelectedMorphology(storedChoice, item)) ?? null
    : null;

  const chooseInspected = () => {
    if (!set || !selected) return;
    const next = selectedMorphologyFrom(set, selected);
    writeSelectedSkill3Morphology(next);
    setStoredChoice(next);
  };

  return (
    <main className="evo-page vertical-catalogue" data-origin={set?.origin ?? "pending"} data-tone={typologyId} data-inspect={inspecting && selectedId ? "" : undefined}>
      <header className="evo-header">
        <div>
          <p className="display evo-header-title">3D Catalogue</p>
          <p className="eyebrow evo-header-detail">
            {TYPOLOGY[typologyId] ?? typologyId} · {archetypeName}
            {matches && set ? ` · Candidate ${set.candidateId}` : ""}
          </p>
        </div>
        <div className="vertical-catalogue-nav">
          {set?.origin === "development-fixture" ? <p className="eyebrow vertical-process-flag">Development fixture</p> : null}
          {preview || set?.origin === "provisional" ? <p className="eyebrow vertical-process-flag">Provisional preview</p> : null}
          <Link href={processHref} className="vertical-catalogue-back">Process</Link>
        </div>
      </header>
      <div className="vertical-catalogue-body">
        <aside className="vertical-catalogue-side">
          <section className="vertical-catalogue-frame">
            {reading !== "open" && downstream ? <p className="vertical-process-note">State · {STATE_LABEL[reading]}</p> : null}
            <p className="vertical-catalogue-figure">{generated}</p>
            <p className="vertical-process-note">Generated</p>
            {reading === "open" ? (
              <>
                <p className="vertical-catalogue-figure">{slots.length || generated}</p>
                <p className="vertical-process-note">Temporal futures</p>
              </>
            ) : !downstream ? (
              <p className="vertical-process-note">Reading status</p>
            ) : auditedDownstream ? (
              <>
                <p className="vertical-catalogue-figure">{auditedDownstream.ready}</p>
                <p className="vertical-process-note">{reading === "adapted" ? "Ready" : "Ready for Skill 4"}</p>
                <p className="vertical-catalogue-figure">{auditedDownstream.review}</p>
                <p className="vertical-process-note">Review</p>
                <p className="vertical-catalogue-figure">{auditedDownstream.fail}</p>
                <p className="vertical-process-note">Fail</p>
              </>
            ) : (
              <p className="vertical-process-note">Readiness not audited</p>
            )}
            <p className="vertical-catalogue-figure">{selected ? 1 : 0}</p>
            <p className="vertical-process-note">{selected ? `Selected ${selected.id}` : "No morphology selected"}</p>
          </section>
          <section className="vertical-catalogue-frame">
            <h2 className="panel-title">Select typology</h2>
            <div className="vertical-catalogue-choices">
              {Object.entries(TYPOLOGY).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  data-active={id === typologyId || undefined}
                  onClick={() => {
                    setTypologyId(id);
                    const next = archetypesFor(id)[0];
                    if (next) setArchetypeId(next.id);
                    setSelectedId(null);
                    setInspecting(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          <section className="vertical-catalogue-frame vertical-catalogue-grow">
            <h2 className="panel-title">Select archetype</h2>
            <div className="vertical-catalogue-choices">
              {archetypesFor(typologyId).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-active={item.id === archetypeId || undefined}
                  onClick={() => {
                    setArchetypeId(item.id);
                    setSelectedId(null);
                    setInspecting(false);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </section>
        </aside>
        <section className="vertical-catalogue-field">
          <CatalogueField
            modules={modules}
            origin={set?.origin ?? "pending"}
            selectedId={selectedId}
            chosenId={chosenContinuation?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id);
              setInspecting(id != null);
            }}
            resetToken={viewReset}
            inspecting={inspecting && selectedId != null}
            surface={surface}
            onTriangles={(id, count) => {
              setTriangles((current) => current[id] === count ? current : { ...current, [id]: count });
            }}
          />
        </section>
        <aside className="vertical-catalogue-side">
          <section className="vertical-catalogue-frame vertical-catalogue-grow">
            {inspecting && selected && set ? (
              <ResultDetail
                resultId={modules.find((item) => item.id === selected.id)?.label ?? selected.id}
                continuation={selected}
                typology={TYPOLOGY[typologyId] ?? typologyId}
                archetype={archetypeName}
                moduleSize={`${set.rules.envelope.sizeX}×${set.rules.envelope.sizeY}×${set.rules.envelope.sizeZ}`}
                horizon={String(set.rules.horizon)}
                morphology={set.rules.morphology}
                triangles={triangles[selected.id] ?? null}
                readiness={auditedDownstream?.candidates[selected.id] ?? null}
                stateLabel={reading === "open" ? null : STATE_LABEL[reading]}
                unaudited={reading !== "open" && downstream != null && !downstream.audited}
                chosen={chosenContinuation?.id === selected.id}
                savedContinuationId={storedChoice?.archetypeId === set.archetypeId ? storedChoice.continuationId : null}
                finalHref={preview ? "/lab/vertical/final?preview=1" : "/lab/vertical/final"}
                surface={surface}
                onSurface={setSurface}
                onBack={() => {
                  setInspecting(false);
                  setSelectedId(null);
                }}
                onChoose={chooseInspected}
              />
            ) : inspecting && selectedId && !selected ? (
              <PlaceholderDetail
                rank={modules.find((item) => item.id === selectedId)?.label ?? "—"}
                archetype={archetypeName}
                typology={TYPOLOGY[typologyId] ?? typologyId}
                onBack={() => {
                  setInspecting(false);
                  setSelectedId(null);
                }}
              />
            ) : (
              <>
                <h2 className="panel-title">Collection</h2>
                <dl className="vertical-catalogue-facts">
                  <div><dt>Typology</dt><dd>{TYPOLOGY[typologyId] ?? typologyId}</dd></div>
                  <div><dt>Archetype</dt><dd>{archetypeName}</dd></div>
                  <div><dt>Candidate</dt><dd>{matches && set ? String(set.candidateId) : "—"}</dd></div>
                  <div><dt>Generated</dt><dd>{generated ? String(generated) : "—"}</dd></div>
                  {reading === "open" ? (
                    <div><dt>Temporal futures</dt><dd>{slots.length ? String(slots.length) : "—"}</dd></div>
                  ) : !downstream ? (
                    <div><dt>Status</dt><dd>Reading</dd></div>
                  ) : auditedDownstream ? (
                    <>
                      <div><dt>{reading === "adapted" ? "Ready" : "Ready for Skill 4"}</dt><dd>{String(auditedDownstream.ready)}</dd></div>
                      <div><dt>Review</dt><dd>{String(auditedDownstream.review)}</dd></div>
                      <div><dt>Fail</dt><dd>{String(auditedDownstream.fail)}</dd></div>
                      <div><dt>State</dt><dd>{STATE_LABEL[reading]}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt>State</dt><dd>{STATE_LABEL[reading]}</dd></div>
                      <div><dt>Readiness</dt><dd>Not audited</dd></div>
                    </>
                  )}
                  <div><dt>Module</dt><dd>{set ? `${set.rules.envelope.sizeX}×${set.rules.envelope.sizeY}×${set.rules.envelope.sizeZ}` : "20×20×20"}</dd></div>
                </dl>
                {error ? <p className="vertical-process-note">{error}</p> : null}
                {pending ? <p className="vertical-process-note">Reading modules</p> : null}
                {!matches && !pending && !error ? <p className="vertical-process-note">No continuation set for this archetype</p> : null}
                {selected ? (
                  <dl className="vertical-catalogue-facts">
                    <div><dt>Result</dt><dd>{modules.find((item) => item.id === selected.id)?.label}</dd></div>
                    <div><dt>Continuation</dt><dd>{selected.id}</dd></div>
                    <div><dt>Seed</dt><dd>{String(selected.continuationSeed)}</dd></div>
                    <div><dt>Z0</dt><dd>{String(selected.z0Iteration)}</dd></div>
                    <div><dt>Samples</dt><dd>{String(selected.sampleCount)}</dd></div>
                  </dl>
                ) : null}
                {chosenContinuation ? <p className="vertical-process-note">Selected {chosenContinuation.id}</p> : null}
              </>
            )}
          </section>
          <section className="vertical-catalogue-frame vertical-catalogue-controls">
            <h2 className="panel-title">State</h2>
            <ReadingToggle reading={reading} states={availableStates} onReading={setReading} />
            <h2 className="panel-title">Orbit</h2>
            <p className="vertical-process-note">Drag</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
