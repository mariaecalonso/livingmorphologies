"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogueField, type CatalogueModule } from "@/components/vertical-catalogue-scene";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { parseSkill2Selection, readActiveArchetype, readSkill2Selections, SKILL2_SELECTIONS_KEY } from "@/lib/skill2/published-selection";
import { CATALOGUE_SLOT_COUNT, catalogueSlots } from "@/lib/skill3/catalogue";
import type { NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import {
  readSelectedSkill3Morphology,
  sameSelectedMorphology,
  selectedMorphologyFrom,
  writeSelectedSkill3Morphology,
  type SelectedSkill3Morphology,
} from "@/lib/skill3/morphology-selection";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

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

function archetypesFor(typologyId: string) {
  return Object.values(ARCHETYPES).filter((item) => item.typologyId === typologyId);
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

const PLACEHOLDER_MODULES: CatalogueModule[] = Array.from({ length: CATALOGUE_SLOT_COUNT }, (_, index) => ({
  id: `slot-${String(index + 1).padStart(2, "0")}`,
  label: String(index + 1).padStart(2, "0"),
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
  chosen,
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
  chosen: boolean;
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
        {chosen ? "Saved to final catalogue" : "Save to final catalogue"}
      </button>
      <dl className="vertical-catalogue-facts">
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
        Save to final catalogue
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
}: {
  initial: NaturalContinuationSet | null;
  candidate: CandidateRequest | null;
}) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const [set, setSet] = useState<NaturalContinuationSet | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(initial == null && candidate != null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [storedChoice, setStoredChoice] = useState<SelectedSkill3Morphology | null>(null);
  const [triangles, setTriangles] = useState<Record<string, number>>({});
  const [viewReset, setViewReset] = useState(0);
  const [typologyId, setTypologyId] = useState(initial?.typologyId || candidate?.typologyId || "lobby");
  const [archetypeId, setArchetypeId] = useState(initial?.archetypeId || candidate?.archetypeId || "continuous-hall");
  const alignedSelection = useRef(false);

  useEffect(() => {
    if (initial || candidate || alignedSelection.current) return;
    alignedSelection.current = true;
    const activeId = readActiveArchetype();
    const selected = activeId ? selectionFor(activeId) : undefined;
    if (!selected) return;
    setTypologyId(selected.typologyId);
    setArchetypeId(selected.archetypeId);
  }, [candidate, initial]);

  useEffect(() => {
    if (initial) return;
    const fromProp = candidate?.archetypeId === archetypeId ? candidate.candidateId : null;
    const storedId = selectionFor(archetypeId)?.candidateId ?? null;
    const candidateId = fromProp ?? storedId;
    if (!candidateId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      archetype: archetypeId,
      candidate: String(candidateId),
      cache: "1",
    });
    if (preview) params.set("preview", "1");
    setPending(true);
    setError(null);
    void fetch(`/api/vertical?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return;
        const body = (await response.json()) as ApiSet & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The continuation bundle is not loaded.");
        if (!controller.signal.aborted) setSet(joinSet(body));
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(caught instanceof Error ? caught.message : "The continuation bundle is not loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [archetypeId, candidate, initial, preview]);

  useEffect(() => {
    if (!set) return;
    setStoredChoice(readSelectedSkill3Morphology(set.origin, set.archetypeId));
  }, [set]);

  const matches = set != null && set.typologyId === typologyId && set.archetypeId === archetypeId;
  const slots = useMemo(() => (matches && set ? catalogueSlots(set.continuations) : []), [matches, set]);
  const selected = slots.find((item) => item.id === selectedId) ?? null;
  const generated = matches && set ? set.continuations.length : 0;
  const archetypeName = archetypesFor(typologyId).find((item) => item.id === archetypeId)?.name
    ?? (matches ? set?.archetypeName : null)
    ?? "Archetype";
  const processParams = new URLSearchParams(search.toString());
  const processHref = processParams.toString() ? `/lab/vertical?${processParams.toString()}` : "/lab/vertical";
  const modules = useMemo<CatalogueModule[]>(() => {
    if (!matches || !set || slots.length === 0) return PLACEHOLDER_MODULES;
    return slots.map((item, index) => ({
      id: item.id,
      label: String(index + 1).padStart(2, "0"),
      cacheIdentity: `${set.origin}:${item.archetypeId}:${item.candidateId}:${item.id}`,
      field: item.field,
    }));
  }, [matches, set, slots]);
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
            <p className="vertical-catalogue-figure">{generated}</p>
            <p className="vertical-process-note">Generated</p>
            <p className="vertical-catalogue-figure">{slots.length}</p>
            <p className="vertical-process-note">Representative</p>
            <p className="vertical-catalogue-figure">{selected ? 1 : 0}</p>
            <p className="vertical-process-note">{selected ? `Selected ${modules.find((item) => item.id === selected.id)?.label}` : "No morphology selected"}</p>
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
            onSelect={(id) => {
              setSelectedId(id);
              setInspecting(id != null);
            }}
            resetToken={viewReset}
            inspecting={inspecting && selectedId != null}
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
                chosen={chosenContinuation?.id === selected.id}
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
                  <div><dt>Representative</dt><dd>{slots.length ? String(slots.length) : "—"}</dd></div>
                  <div><dt>Module</dt><dd>{set ? `${set.rules.envelope.sizeX}×${set.rules.envelope.sizeY}×${set.rules.envelope.sizeZ}` : "20×20×20"}</dd></div>
                </dl>
                {error ? <p className="vertical-process-note">{error}</p> : null}
                {pending ? <p className="vertical-process-note">{preview ? "Provisional replay" : "Checking handoff"}</p> : null}
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
            <h2 className="panel-title">Controls</h2>
            <dl className="vertical-catalogue-facts">
              <div><dt>Orbit</dt><dd>Drag</dd></div>
              <div><dt>Pan</dt><dd>Shift drag</dd></div>
              <div><dt>Zoom</dt><dd>Wheel</dd></div>
              <div><dt>Inspect</dt><dd>Click</dd></div>
            </dl>
            <button type="button" className="vertical-catalogue-reset" onClick={() => setViewReset((value) => value + 1)}>
              Reset view
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
