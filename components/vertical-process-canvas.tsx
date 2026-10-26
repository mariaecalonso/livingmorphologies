"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import handoffFile from "@/data/skill3/final-selection.json";
import { ContinueFamilyFan } from "@/components/continue-family-fan";
import { InheritFamilySummary } from "@/components/inherit-criteria-profile";
import { ProcessStartField } from "@/components/process-start-field";
import { ProcessDevelop, type DevelopPlate } from "@/components/process-develop-view";
import { ProcessFormEmergence, ProcessGuide, ProcessMorphology, SampleDecisionStack, type SampleFrame } from "@/components/vertical-process-stage";
import { TYPOLOGIES } from "@/lib/catalog";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import type { CatalogueReadiness, ReadinessVerdict } from "@/lib/skill3/catalogue-readiness";
import type { NaturalContinuation, NaturalContinuationRules, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import type { FinalHandoffSelection } from "@/lib/skill3/final-selection";
import { readActiveArchetype } from "@/lib/skill2/published-selection";
import type { ResolvedProcessSource } from "@/lib/skill3/selection";
import { decodeSolidifiedMesh, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";

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
  file?: string;
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

function useLabQuery() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("frame") === "1") return "?wall=1&frame=1";
      if (params.get("wall") === "1") return "?wall=1";
      return "";
    },
    () => "",
  );
}

function verdictLabel(verdict: ReadinessVerdict | null) {
  if (verdict === "ready") return "READY";
  if (verdict === "review") return "REVIEW";
  if (verdict === "fail") return "FAIL";
  return "Not audited";
}

type SequencePhase = "sample" | "stack" | "form" | "done";
type Sequence = { phase: SequencePhase; sample: number; stack: number; veil: number; form: number; playing: boolean };
const FORM_RISE_STEPS = 18;
const FORM_SHELL_STEPS = 10;
const FORM_RESOLVE_STEPS = 8;
const FORM_EMERGE_STEPS = FORM_RISE_STEPS + FORM_SHELL_STEPS + FORM_RESOLVE_STEPS;
const IDLE_SEQUENCE: Sequence = { phase: "sample", sample: 0, stack: 0, veil: 0, form: 0, playing: false };

function advanceSequence(current: Sequence, horizon: number, formGoal: number): Sequence {
  if (!current.playing) return current;
  if (current.phase === "sample") {
    if (horizon <= 0 || current.sample >= horizon) return { ...current, phase: "stack", stack: 0, veil: 0 };
    return { ...current, sample: current.sample + 1 };
  }
  if (current.phase === "stack") return current;
  if (current.phase === "form") {
    if (formGoal <= 0) return current;
    if (current.form >= formGoal) return { ...current, phase: "done", playing: false };
    return { ...current, form: current.form + 1 };
  }
  return { ...current, playing: false };
}

function phaseWord(step: Exclude<SequencePhase, "done">, sequence: Sequence) {
  if (sequence.phase === "done") return "Complete";
  const order = ["sample", "stack", "form"] as const;
  const current = order.indexOf(sequence.phase);
  const mine = order.indexOf(step);
  if (current === mine) return "Active";
  if (current > mine) return "Complete";
  return "Waiting";
}

async function readMesh(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { geometry?: EncodedSolidifiedMesh };
  if (!body.geometry?.positions || !body.geometry.normals || !body.geometry.indices) return null;
  return decodeSolidifiedMesh(body.geometry);
}

export function ProcessCanvas({
  initial = null,
  resolved = null,
}: {
  initial?: NaturalContinuationSet | null;
  resolved?: ResolvedProcessSource | null;
}) {
  const [archetypeId, setArchetypeId] = useState(initial?.archetypeId ?? resolved?.selection.archetypeId ?? CARVED_MASS_SOURCES[0].archetypeId);
  const [sequence, setSequence] = useState<Sequence>(IDLE_SEQUENCE);
  const [identity, setIdentity] = useState<Identity>({
    z0Iteration: resolved?.z0Iteration ?? null,
    checksum: resolved?.checksum ?? null,
    provenance: resolved?.handoff === "verified" ? "skill2" : null,
  });
  const [readiness, setReadiness] = useState<CatalogueReadiness | null>(null);
  const [replay, setReplay] = useState<ReplayBody | null>(null);
  const [sampleFrames, setSampleFrames] = useState<SampleFrame[] | null>(null);
  const [replayNote, setReplayNote] = useState<string | null>(initial ? null : "Reading stored replay");
  const [openMesh, setOpenMesh] = useState<IsoMesh | null>(null);
  const [developMeshes, setDevelopMeshes] = useState<Record<number, IsoMesh>>({});
  const [cappedMesh, setCappedMesh] = useState<IsoMesh | null>(null);
  const [adaptMesh, setAdaptMesh] = useState<IsoMesh | null>(null);
  const [finalMesh, setFinalMesh] = useState<IsoMesh | null>(null);
  const [checks, setChecks] = useState<SolidifiedChecks | null>(null);
  const [z0Plate, setZ0Plate] = useState<{ size: number; values: Uint8Array } | null>(null);

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

  useEffect(() => {
    if (!source) {
      setZ0Plate(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: source.archetypeId, candidate: String(source.candidateId) });
    fetch(`/api/vertical/z0/field?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ size?: number; plate?: string }> : null)
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!body?.plate || !body.size) {
          setZ0Plate(null);
          return;
        }
        const values = Uint8Array.from(atob(body.plate), (char) => char.charCodeAt(0));
        setZ0Plate(values.length === body.size * body.size ? { size: body.size, values } : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setZ0Plate(null);
      });
    return () => controller.abort();
  }, [source]);
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
    setSequence(IDLE_SEQUENCE);
    setReplay(null);
      setDevelopMeshes({});
      setOpenMesh(null);
    setCappedMesh(null);
    setAdaptMesh(null);
    setFinalMesh(null);
    setChecks(null);
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
      const chosenId = selected?.continuationId ?? null;
      if (!chosenId) {
        if (!controller.signal.aborted) setReplayNote("No continuation is selected for this archetype");
        return;
      }
      const body = await loadReplay(chosenId);
      if (controller.signal.aborted) return;
      setReplay(body);
      setReplayNote(body ? null : `The stored field for ${chosenId} is not on this archetype`);
      const meshBase = `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(source.archetypeId)}&continuation=${chosenId}`;
      const [open, capped, adapted, solid, ready, catalogue, publishedZ0] = await Promise.all([
        readMesh(`${meshBase}&reading=open`, controller.signal),
        readMesh(`${meshBase}&reading=capped`, controller.signal),
        source.archetypeId === "inserted-horizontal-plate" ? readMesh(`${meshBase}&reading=adapted`, controller.signal) : Promise.resolve(null),
        fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}&continuation=${chosenId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ checks?: SolidifiedChecks; geometry?: EncodedSolidifiedMesh }> : null),
        fetch(`/api/vertical/catalogue-readiness?archetype=${encodeURIComponent(source.archetypeId)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<CatalogueReadiness> : null),
        fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ continuations?: { z0Iteration?: number; parentChecksum?: string; triangles?: number }[] }> : null),
        fetch(`/api/vertical/z0?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ iteration?: number; checksum?: string }> : null),
      ]);
      if (controller.signal.aborted) return;
      setOpenMesh(open);
      setCappedMesh(capped);
      setAdaptMesh(adapted);
      setReadiness(ready);
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
    };

    void run().catch((caught) => {
      if (controller.signal.aborted) return;
      setReplayNote(caught instanceof Error ? caught.message : "The stored process could not be read");
    });
    return () => controller.abort();
  }, [archetypeId, initial, resolved, selected?.continuationId, source]);

  useEffect(() => {
    const continuationId = selected?.continuationId;
    if (!source || !continuationId) {
      setSampleFrames(null);
      return;
    }
    const controller = new AbortController();
    setSampleFrames(null);
    const params = new URLSearchParams({
      archetype: source.archetypeId,
      candidate: String(source.candidateId),
      continuation: continuationId,
    });
    fetch(`/api/vertical/process-replay?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{
        trailSize: number;
        decisions: { iteration: number; reason: SampleFrame["reason"] }[];
        plates: string;
      }> : null)
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!body?.plates || !body.decisions?.length) {
          setSampleFrames(null);
          return;
        }
        const binary = atob(body.plates);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const cell = body.trailSize * body.trailSize;
        setSampleFrames(body.decisions.map((decision, index) => ({
          iteration: decision.iteration,
          trails: bytes.subarray(index * cell, (index + 1) * cell),
          trailSize: body.trailSize,
          peak: 255,
          reason: decision.reason,
        })));
      })
      .catch(() => {
        if (!controller.signal.aborted) setSampleFrames(null);
      });
    return () => controller.abort();
  }, [selected?.continuationId, source]);

  useEffect(() => {
    if (!source || !selected) {
      setDevelopMeshes({});
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: source.archetypeId, continuation: selected.continuationId });
    fetch(`/api/vertical/process-form?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ frames?: { retained: number; geometry?: EncodedSolidifiedMesh }[] }> : null)
      .then((body) => {
        if (controller.signal.aborted) return;
        const next: Record<number, IsoMesh> = {};
        for (const frame of body?.frames ?? []) {
          if (!frame.geometry?.positions || !frame.geometry.normals || !frame.geometry.indices) continue;
          next[frame.retained] = decodeSolidifiedMesh(frame.geometry);
        }
        setDevelopMeshes(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDevelopMeshes({});
      });
    return () => controller.abort();
  }, [selected, source]);

  const horizon = replay?.rules.horizon ?? (sampleFrames && sampleFrames.length > 1 ? sampleFrames.length - 1 : 0);
  const origin = replay?.continuation.z0Iteration ?? sampleFrames?.[0]?.iteration ?? identity.z0Iteration ?? 0;
  const playStep = horizon > 0 ? Math.min(horizon, Math.max(0, sequence.sample)) : 0;
  const playIteration = origin + playStep;
  const formGoal = openMesh ? FORM_EMERGE_STEPS : 0;
  const formStep = sequence.phase === "done" ? FORM_EMERGE_STEPS : sequence.form;
  const formRise = Math.min(1, formStep / FORM_RISE_STEPS);
  const formShellStart = Math.round(FORM_RISE_STEPS * 0.55);
  const formShell = formStep <= formShellStart
    ? 0
    : Math.min(1, (formStep - formShellStart) / (FORM_RISE_STEPS + FORM_SHELL_STEPS - formShellStart));
  const formResolveStart = FORM_RISE_STEPS + FORM_SHELL_STEPS;
  const formResolve = sequence.phase === "done" || formStep >= FORM_EMERGE_STEPS
    ? 1
    : formStep <= formResolveStart
      ? 0
      : (formStep - formResolveStart) / FORM_RESOLVE_STEPS;
  const formVisible = sequence.phase === "form" || sequence.phase === "done";
  const retainedPlates = useMemo<DevelopPlate[]>(() => {
    const kept = (sampleFrames ?? []).filter((frame) => frame.reason).sort((a, b) => a.iteration - b.iteration);
    if (kept.length < 2) return [];
    const span = Math.max(1, kept[kept.length - 1].iteration - kept[0].iteration);
    return kept.map((frame) => ({
      iteration: frame.iteration,
      z: (frame.iteration - kept[0].iteration) / span,
      trails: frame.trails,
      trailSize: frame.trailSize,
      peak: frame.peak,
    }));
  }, [sampleFrames]);

  useEffect(() => {
    if (!sequence.playing || sequence.phase === "stack") return;
    const delay = sequence.phase === "sample" ? 90 : 130;
    const timer = window.setInterval(() => {
      setSequence((current) => advanceSequence(current, horizon, formGoal));
    }, delay);
    return () => window.clearInterval(timer);
  }, [formGoal, horizon, sequence.phase, sequence.playing]);

  const replayId = replay?.continuation.id ?? null;
  const selectedGroup = groupFor(selected?.continuationId ?? null);
  const cappedVerdict = selected ? readiness?.downstream.capped?.candidates[selected.continuationId]?.status ?? null : null;
  const adaptedVerdict = selected && archetypeId === "inserted-horizontal-plate"
    ? readiness?.downstream.adapted?.candidates[selected.continuationId]?.status ?? null
    : null;
  const catalogueVerdict = cappedVerdict ?? adaptedVerdict;
  const archetypeName = source?.archetypeName ?? TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === archetypeId)?.name ?? archetypeId;
  const labQuery = useLabQuery();
  const paretoHref = `/lab/evolution/pareto-catalog${labQuery}`;
  const finalHref = `/lab/vertical/final${labQuery}`;
  const skill4Href = `/lab/hybrid${labQuery}`;
  const selectedBranch = branchNumber(selected?.continuationId ?? null);
  const identityMark = selected ? (
    <p className="process-identity">
      <span>Selected continuation</span>
      <strong>{selected.continuationId} / {selectedBranch != null && selectedBranch > 24 ? 48 : 24}</strong>
      <span>{archetypeName}</span>
      <span>Family {selectedGroup?.focus ?? (selectedBranch != null && selectedBranch > 24 ? "Extended" : "Pending")}</span>
    </p>
  ) : null;
  const samplingRule = replay
    ? `Δ ≥ ${replay.rules.deltaThreshold} after ${replay.rules.minGap} iterations. Maximum gap ${replay.rules.maxGap}.`
    : "Δ ≥ 0.08 after 8 iterations. Maximum gap 24.";
  const canPlay = Boolean(sampleFrames && sampleFrames.length > 1 && horizon > 0);
  const seek = (iteration: number) => {
    if (horizon <= 0) return;
    setSequence({ phase: "sample", sample: Math.min(horizon, Math.max(0, iteration - origin)), stack: 0, veil: 0, form: 0, playing: false });
  };
  const stackStatus = phaseWord("stack", sequence);
  const formStatus = phaseWord("form", sequence);
  return (
    <main className="vertical-process process-canvas" data-archetype={archetypeId}>
      <div className="process-setup">
        <section className="process-step process-start" aria-label="Start">
          <div className="process-start-source">
            <header className="vertical-process-label">
              <p className="eyebrow">01</p>
              <h2 className="panel-title">Start</h2>
            </header>
            <p className="process-start-status">Verified Z0</p>
            <dl className="process-start-meta">
              <div><dt>Archetype</dt><dd>{archetypeName}</dd></div>
              <div><dt>Skill 2 candidate</dt><dd>{source ? String(source.candidateId) : "Pending"}</dd></div>
              <div><dt>Iteration</dt><dd>{identity.z0Iteration ?? "Pending"}</dd></div>
              <div><dt>Checksum</dt><dd title={identity.checksum ?? undefined}>{identity.checksum && identity.checksum.length > 12 ? `${identity.checksum.slice(0, 6)}...${identity.checksum.slice(-4)}` : identity.checksum ?? "Pending"}</dd></div>
              <div className="process-start-state"><dt>Status</dt><dd>{identity.provenance === "skill2" ? "Verified" : "Pending"}</dd></div>
            </dl>
            <p className="process-start-note"><span>Stored Skill 2 state</span><span>Not regenerated</span></p>
          </div>
          <ProcessStartField plate={z0Plate} />
        </section>

        <section className="process-step process-descriptors" aria-label="Inherit">
          <header className="vertical-process-label">
            <p className="eyebrow">02</p>
            <h2 className="panel-title">Inherit</h2>
            <p className="inherit-summary-pill">Inherited criteria profile</p>
          </header>
          <p className="inherit-summary-kicker">3 family summary</p>
          <InheritFamilySummary profile={intent} />
        </section>

        <section className="process-step process-recipes" aria-label="Continue">
          <header className="vertical-process-label">
            <p className="eyebrow">03</p>
            <h2 className="panel-title">Continue</h2>
          </header>
          <ContinueFamilyFan groups={BEHAVIOR_GROUPS} activeFocus={selectedGroup?.focus ?? null} selectedId={selected?.continuationId ?? null} plate={z0Plate} />
          {identityMark}
        </section>
      </div>

      <div className="process-work">
        <section className="process-step process-live process-sample" aria-label="Sample">
          <header className="vertical-process-label">
            <p className="eyebrow">04</p>
            <h2 className="panel-title">Sample</h2>
            <p className="process-phase" data-phase={phaseWord("sample", sequence).toLowerCase()}>{phaseWord("sample", sequence)}</p>
          </header>
          {identityMark}
          <p className="process-kicker">Which temporal states are worth keeping?</p>
          <p className="process-kicker">{samplingRule}</p>
          <div className="process-transport">
            <button type="button" onClick={() => setSequence((current) => current.phase === "done" ? { ...IDLE_SEQUENCE, playing: true } : { ...current, playing: true })} disabled={!canPlay || sequence.playing}>Play</button>
            <button type="button" onClick={() => setSequence((current) => ({ ...current, playing: false }))} disabled={!sequence.playing}>Pause</button>
            <button type="button" onClick={() => setSequence(IDLE_SEQUENCE)} disabled={!canPlay}>Restart</button>
            <label>
              <span>Scrub</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, horizon)}
                value={playStep}
                disabled={!canPlay || sequence.phase !== "sample"}
                onChange={(event) => setSequence({ phase: "sample", sample: Number(event.target.value), stack: 0, veil: 0, form: 0, playing: false })}
              />
            </label>
          </div>
          <div className="process-sample-stage">
            {sampleFrames && sampleFrames.length > 1 ? (
              <div className="process-sample-decision">
                <SampleDecisionStack
                  frames={sampleFrames}
                  playIteration={playIteration}
                  onSeek={seek}
                />
                <aside className="process-sample-legend">
                  <ul>
                    <li data-reason="threshold"><span>Teal</span><span>Retained · Δ threshold</span></li>
                    <li data-reason="max-gap"><span>Copper</span><span>Retained · max gap</span></li>
                    <li data-reason="skip"><span>Gray</span><span>Generated · skipped</span></li>
                    <li data-reason="active"><span>White outline</span><span>Current plate</span></li>
                  </ul>
                </aside>
              </div>
            ) : selected ? (
              <p className="process-pending">{replayNote ?? `Reading the temporal record for ${selected.continuationId}`}</p>
            ) : (
              <p className="process-pending">Pending</p>
            )}
          </div>
        </section>

        <section className="process-step process-live process-xyt" aria-label="Develop">
          <header className="vertical-process-label">
            <p className="eyebrow">05</p>
            <h2 className="panel-title">Develop</h2>
            <p className="process-phase" data-phase={stackStatus.toLowerCase()}>{stackStatus}</p>
          </header>
          {identityMark}
          <ProcessDevelop
            plates={retainedPlates}
            meshes={developMeshes}
            autoplay={sequence.phase === "stack" && sequence.playing}
            onEngage={() => setSequence((current) => current.phase === "form" || current.phase === "done" ? current : { ...current, phase: "stack", playing: false })}
            onComplete={() => setSequence((current) => ({ ...current, phase: "form", form: 0, playing: true }))}
          />
        </section>

        <section className="process-step process-live process-form" aria-label="Form">
          <header className="vertical-process-label">
            <p className="eyebrow">06</p>
            <h2 className="panel-title">Form</h2>
            <p className="process-phase" data-phase={formStatus.toLowerCase()}>{formStatus}</p>
          </header>
          {identityMark}
          <p className="process-kicker">Vertical propagation → emerging body → Open morphology</p>
          <p className="process-pending">{formStatus === "Complete" && selected ? `Open · ${selected.continuationId}` : formStatus === "Active" ? "Propagating upward" : "Waiting for the retained stack"}</p>
          <div className="process-form-stage">
            <div className="process-form-layer">
              {formVisible && openMesh && formResolve < 1 ? (
                <div className="process-form-layer" style={{ opacity: Math.max(0, 1 - Math.max(0, formResolve - 0.25) / 0.75), pointerEvents: "none" }}>
                  <ProcessFormEmergence mesh={openMesh} rise={formRise} shell={formShell} />
                </div>
              ) : null}
              {formVisible && openMesh && formResolve > 0 ? (
                <div className="process-form-layer" style={{ opacity: formResolve }}>
                  <ProcessMorphology
                    mesh={openMesh}
                    cacheIdentity={`${archetypeId}:form:${selected?.continuationId ?? ""}`}
                    frame="module"
                    steer={sequence.phase === "done"}
                    insideBox
                  />
                </div>
              ) : null}
              {!formVisible || !openMesh ? (
                <ProcessGuide label={formStatus === "Waiting" ? "Waiting" : "Open morphology"} clear />
              ) : null}
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
          <p className="process-close-cue">
            <span>Open</span>
            <span data-arrow="true" aria-hidden="true">↓</span>
            <span>Capped</span>
            <span data-arrow="true" aria-hidden="true">↓</span>
            <span>Selected</span>
            <span data-arrow="true" aria-hidden="true">↓</span>
            <span>Validated</span>
            <span data-arrow="true" aria-hidden="true">↓</span>
            <span>Hand off</span>
          </p>

          <section className="process-step process-cap" aria-label="Cap">
            <header className="vertical-process-label">
              <p className="eyebrow">07</p>
              <h2 className="panel-title">Cap</h2>
            </header>
            <div className="process-cap-pair">
              <div className="process-cap-view">
                <p className="process-cap-name">Open</p>
                <div className="process-cap-stage">
                  {openMesh ? <ProcessMorphology mesh={openMesh} cacheIdentity={`${archetypeId}:cap-open:${replayId ?? ""}`} frame="module" /> : <p className="process-pending">Open</p>}
                </div>
              </div>
              <div className="process-cap-cue">
                <p>Open → closed mass</p>
                <svg className="process-boundary-mark" viewBox="0 0 92 28" aria-hidden="true">
                  <path d="M8 18 A 7 7 0 1 1 22 18" fill="none" stroke="#7ec8c6" strokeWidth="1.4" />
                  <path d="M30 14 H46" fill="none" stroke="rgba(242,242,238,0.45)" strokeWidth="1.2" />
                  <path d="M42 10 L48 14 L42 18" fill="none" stroke="rgba(242,242,238,0.45)" strokeWidth="1.2" />
                  <circle cx="68" cy="14" r="7" fill="none" stroke="#e0a080" strokeWidth="1.4" />
                </svg>
              </div>
              <div className="process-cap-view">
                <p className="process-cap-name">Capped</p>
                <div className="process-cap-stage">
                  {cappedMesh ? <ProcessMorphology mesh={cappedMesh} cacheIdentity={`${archetypeId}:capped:${replayId ?? ""}`} frame="module" /> : <p className="process-pending">Capped</p>}
                </div>
              </div>
            </div>
            {adaptMesh ? (
              <div className="process-adapt-note">
                <p>Open → capped → capped + adapt</p>
                <div className="process-adapt-mesh">
                  <ProcessMorphology mesh={adaptMesh} cacheIdentity={`${archetypeId}:adapted:${replayId ?? ""}`} frame="module" />
                </div>
              </div>
            ) : null}
          </section>

          <section className="process-step process-choose" aria-label="Choose">
            <header className="vertical-process-label">
              <p className="eyebrow">08</p>
              <h2 className="panel-title">Choose</h2>
            </header>
            <p className="process-choose-hero">Selected · <strong>{selected?.continuationId ?? "Pending"}</strong></p>
            <p className="process-pending">{archetypeName}</p>
            <p className="process-pending" data-mark={catalogueVerdict ?? undefined}>Readiness · {verdictLabel(catalogueVerdict)}</p>
            {selectedGroup ? <p className="process-pending">Family · {selectedGroup.focus}</p> : null}
            <div className="process-choose-field" aria-hidden="true">
              {Array.from({ length: 24 }, (_, index) => (
                <span key={index} data-on={selectedBranch === index + 1 ? "true" : "false"} />
              ))}
            </div>
            <p className="process-kicker">24 candidates → 1 selected</p>
            <Link href={paretoHref} className="vertical-process-catalogue process-catalogue-open">Open catalogue →</Link>
          </section>

          <section className="process-step process-solidify" aria-label="Solidify and validate">
            <header className="vertical-process-label">
              <p className="eyebrow">09</p>
              <h2 className="panel-title">Solidify</h2>
            </header>
            <div className="process-solid-body">
              <div className="process-final-mesh">
                {finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity={`${archetypeId}:solid:${selected?.continuationId ?? ""}`} frame="module" /> : <p className="process-pending">Solidified module pending</p>}
              </div>
              <div className="process-solid-panel">
                <p className="process-solid-ask">Is this geometry ready to become the final module?</p>
                <p className="process-solid-answer" data-mark={selected?.status === "Validated" ? "pass" : selected?.status === "Review" ? "review" : undefined}>
                  {selected?.status === "Validated" ? "✓ Ready" : selected?.status === "Review" ? "△ Review" : "Pending"}
                </p>
                {checks ? (
                  <ul className="process-checks">
                    <li data-mark={checks.components === 1 ? "pass" : "fail"}><span aria-hidden="true">{checks.components === 1 ? "✓" : "✕"}</span><span>Single body</span><span>{checks.components}</span></li>
                    <li data-mark={checks.boundaryEdges === 0 ? "pass" : "fail"}><span aria-hidden="true">{checks.boundaryEdges === 0 ? "✓" : "✕"}</span><span>Boundary</span><span>{checks.boundaryEdges}</span></li>
                    <li data-mark={checks.nonManifoldEdges === 0 ? "pass" : "fail"}><span aria-hidden="true">{checks.nonManifoldEdges === 0 ? "✓" : "✕"}</span><span>Nonmanifold</span><span>{checks.nonManifoldEdges}</span></li>
                    <li data-mark={checks.manifold === "PASS" ? "pass" : "fail"}><span aria-hidden="true">{checks.manifold === "PASS" ? "✓" : "✕"}</span><span>Manifold</span><span>{checks.manifold}</span></li>
                    <li data-mark={checks.preflight === "PASS" ? "pass" : "fail"}><span aria-hidden="true">{checks.preflight === "PASS" ? "✓" : "✕"}</span><span>Kernel accepted</span><span>{checks.preflight}</span></li>
                  </ul>
                ) : (
                  <p className="process-pending">Stored checks pending</p>
                )}
              </div>
            </div>
          </section>

          <section className="process-step process-handoff-end" aria-label="Hand off">
            <header className="vertical-process-label">
              <p className="eyebrow">10</p>
              <h2 className="panel-title">Hand off</h2>
            </header>
            <div className="process-handoff-body">
              <div className="process-final-mesh">
                {finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity={`${archetypeId}:handoff:${selected?.continuationId ?? ""}`} frame="module" /> : <p className="process-pending">Final module pending</p>}
              </div>
              <div className="process-handoff-panel">
                <p className="process-handoff-ready">{selected?.status === "Validated" ? "Ready for Skill 4" : selected?.status === "Review" ? "Review before Skill 4" : "Pending"}</p>
                <dl className="process-facts">
                  <div><dt>Archetype</dt><dd>{archetypeName}</dd></div>
                  <div><dt>Continuation</dt><dd>{selected?.continuationId ?? "Pending"}</dd></div>
                  <div><dt>Status</dt><dd>{selected?.status ?? "Pending"}</dd></div>
                  {selected?.moduleId ? <div><dt>Module</dt><dd>{selected.moduleId}</dd></div> : null}
                  {checks?.file ? <div><dt>File</dt><dd>{checks.file}</dd></div> : null}
                </dl>
                <p className="process-handoff-path">
                  <span>Selected module</span>
                  <span data-arrow="true" aria-hidden="true">→</span>
                  <span>Skill 3 final</span>
                  <span data-arrow="true" aria-hidden="true">→</span>
                  <span>Skill 4 input</span>
                </p>
                <div className="process-handoff-links">
                  <Link href={finalHref} className="vertical-process-catalogue process-catalogue-open">View final catalogue →</Link>
                  <Link href={skill4Href} className="vertical-process-catalogue process-skill4">Skill 4 →</Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
