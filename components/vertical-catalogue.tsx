"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogueField, type CatalogueModule } from "@/components/vertical-catalogue-scene";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { catalogueSlots } from "@/lib/skill3/catalogue";
import type { NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import {
  clearSelectedSkill3Morphology,
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

const REASON_LABEL: Record<string, string> = {
  z0: "Z0",
  threshold: "Threshold",
  "max-gap": "Max gap",
};

function ResultDetail({
  resultId,
  continuation,
  typology,
  archetype,
  moduleSize,
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
    <div className="vertical-catalogue-detail">
      <button type="button" className="vertical-catalogue-reset" onClick={onBack}>Back to catalogue</button>
      <h2 className="panel-title">Result {resultId}</h2>
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
      <button type="button" className="vertical-catalogue-reset" data-chosen={chosen || undefined} onClick={onChoose}>
        {chosen ? "Selected" : "Select this morphology"}
      </button>
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

  useEffect(() => {
    if (initial || !candidate) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      archetype: candidate.archetypeId,
      candidate: String(candidate.candidateId),
    });
    setPending(true);
    setError(null);
    void fetch(`/api/vertical?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as ApiSet & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The selected candidate could not be reconstructed.");
        if (!controller.signal.aborted) setSet(joinSet(body));
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(caught instanceof Error ? caught.message : "The selected candidate could not be reconstructed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [candidate, initial]);

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
  const modules = useMemo<CatalogueModule[]>(() => slots.map((item, index) => ({
    id: item.id,
    label: String(index + 1).padStart(2, "0"),
    cacheIdentity: `${set?.origin ?? "pending"}:${item.archetypeId}:${item.candidateId}:${item.id}`,
    field: item.field,
  })), [set?.origin, slots]);
  const chosenContinuation = storedChoice && matches && set && storedChoice.origin === set.origin
    ? set.continuations.find((item) => sameSelectedMorphology(storedChoice, item)) ?? null
    : null;

  const chooseInspected = () => {
    if (!set || !selected) return;
    const current = readSelectedSkill3Morphology(set.origin, set.archetypeId);
    if (current && current.origin === set.origin && sameSelectedMorphology(current, selected)) {
      clearSelectedSkill3Morphology(set.origin, set.archetypeId);
      setStoredChoice(null);
      return;
    }
    const next = selectedMorphologyFrom(set, selected);
    writeSelectedSkill3Morphology(next);
    setStoredChoice(next);
  };

  return (
    <main className="evo-page vertical-catalogue" data-origin={set?.origin ?? "pending"} data-inspect={inspecting && selected ? "" : undefined}>
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
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setInspecting(true);
            }}
            resetToken={viewReset}
            inspecting={inspecting && selected != null}
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
                morphology={set.rules.morphology}
                triangles={triangles[selected.id] ?? null}
                chosen={chosenContinuation?.id === selected.id}
                onBack={() => setInspecting(false)}
                onChoose={chooseInspected}
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
                {pending ? <p className="vertical-process-note">Checking handoff</p> : null}
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
          <section className="vertical-catalogue-frame">
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
