"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import handoffFile from "@/data/skill3/final-selection.json";
import { ContinuationExplorer } from "@/components/continuation-explorer";
import { ContinueFamilyFan } from "@/components/continue-family-fan";
import { InheritFamilySummary } from "@/components/inherit-criteria-profile";
import { ProcessStartField } from "@/components/process-start-field";
import { ProcessDevelop, type DevelopPlate } from "@/components/process-develop-view";
import { ProcessGeneration } from "@/components/process-generation-view";
import { ProcessGuide, ProcessMorphology, SampleDecisionStack, type SampleFrame } from "@/components/vertical-process-stage";
import { TYPOLOGIES } from "@/lib/catalog";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import { capAddition, capProjectionExtent } from "@/lib/skill3/cap-accent";
import { createProcessIsoCamera, resetProcessIso } from "@/lib/skill3/process-iso-camera";
import type { CatalogueReadiness, ReadinessVerdict } from "@/lib/skill3/catalogue-readiness";
import type { NaturalContinuationSet } from "@/lib/skill3/continuations";
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

/** Stored continuation ids, or the twenty-four field plus an official id outside it. */
function continuationChoices(ids: readonly string[], officialId: string | null) {
  const stored = [...new Set(ids.filter((id) => /^N\d{2}$/.test(id)))];
  const base = stored.length > 0
    ? stored
    : Array.from({ length: 24 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`);
  if (officialId && /^N\d{2}$/.test(officialId) && !base.includes(officialId)) base.push(officialId);
  return base.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
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

function TechnicalDetails({ children }: { children: ReactNode }) {
  return (
    <details className="process-technical">
      <summary>Technical details</summary>
      <div className="process-technical-body">{children}</div>
    </details>
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
const IDLE_SEQUENCE: Sequence = { phase: "sample", sample: 0, stack: 0, veil: 0, form: 0, playing: false };
type RecordState = "idle" | "loading" | "ready" | "missing";

function advanceSequence(current: Sequence, horizon: number): Sequence {
  if (!current.playing) return current;
  if (current.phase === "sample") {
    if (horizon <= 0 || current.sample >= horizon) return { ...current, phase: "stack", stack: 0, veil: 0 };
    return { ...current, sample: current.sample + 1 };
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
  const [sampleFrames, setSampleFrames] = useState<SampleFrame[] | null>(null);
  const [sampleState, setSampleState] = useState<RecordState>(initial ? "missing" : "loading");
  const [meshState, setMeshState] = useState<RecordState>(initial ? "missing" : "loading");
  const [exploreOpen, setExploreOpen] = useState<IsoMesh | null>(null);
  const [exploreOpenState, setExploreOpenState] = useState<RecordState>(initial ? "missing" : "loading");
  const [officialOpen, setOfficialOpen] = useState<IsoMesh | null>(null);
  const [developMeshes, setDevelopMeshes] = useState<Record<number, IsoMesh>>({});
  const [generationReady, setGenerationReady] = useState(false);
  const [exploredId, setExploredId] = useState<string | null>(null);
  const [exploredScope, setExploredScope] = useState<string | null>(null);
  const [cappedMesh, setCappedMesh] = useState<IsoMesh | null>(null);
  const [adaptMesh, setAdaptMesh] = useState<IsoMesh | null>(null);
  const [finalMesh, setFinalMesh] = useState<IsoMesh | null>(null);
  const [checks, setChecks] = useState<SolidifiedChecks | null>(null);
  const [choiceIds, setChoiceIds] = useState<string[]>([]);
  const [z0Plate, setZ0Plate] = useState<{ size: number; values: Uint8Array } | null>(null);
  const isoCamera = useRef(createProcessIsoCamera());
  const capCamera = useRef(createProcessIsoCamera());
  const [isoTick, setIsoTick] = useState(0);
  const nudgeIso = useCallback(() => setIsoTick((value) => value + 1), []);
  const resetIso = useCallback(() => {
    resetProcessIso(isoCamera.current);
    setIsoTick((value) => value + 1);
  }, []);

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
  const officialId = selected?.continuationId ?? null;
  let activeId = exploredScope === archetypeId ? exploredId ?? officialId : officialId;
  if (exploredScope !== archetypeId) {
    activeId = officialId;
    setExploredScope(archetypeId);
    setExploredId(officialId);
  }
  const extendedId = officialId && branchNumber(officialId) != null && (branchNumber(officialId) ?? 0) > 24 ? officialId : null;
  const intent = useMemo(() => {
    try {
      return architecturalIntentFor(archetypeId);
    } catch {
      return null;
    }
  }, [archetypeId]);

  useEffect(() => {
    if (initial) {
      setIdentity({ z0Iteration: initial.z0Iteration, checksum: initial.parentChecksum, provenance: "fixture" });
      return;
    }
    if (!source || !officialId) return;
    const controller = new AbortController();
    setOfficialOpen(null);
    setCappedMesh(null);
    setAdaptMesh(null);
    setFinalMesh(null);
    setChecks(null);
    setReadiness(null);
    setChoiceIds([]);
    const sameResolved = resolved?.selection.archetypeId === source.archetypeId && resolved.selection.candidateId === source.candidateId;
    setIdentity({
      z0Iteration: sameResolved ? resolved?.z0Iteration ?? null : null,
      checksum: sameResolved ? resolved?.checksum ?? null : null,
      provenance: sameResolved && resolved?.handoff === "verified" ? "skill2" : null,
    });

    const run = async () => {
      const meshBase = `/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(source.archetypeId)}&continuation=${officialId}`;
      const [open, capped, adapted, solid, ready, catalogue, publishedZ0] = await Promise.all([
        readMesh(`${meshBase}&reading=open`, controller.signal),
        readMesh(`${meshBase}&reading=capped`, controller.signal),
        source.archetypeId === "inserted-horizontal-plate" ? readMesh(`${meshBase}&reading=adapted`, controller.signal) : Promise.resolve(null),
        fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}&continuation=${officialId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ checks?: SolidifiedChecks; geometry?: EncodedSolidifiedMesh }> : null),
        fetch(`/api/vertical/catalogue-readiness?archetype=${encodeURIComponent(source.archetypeId)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<CatalogueReadiness> : null),
        fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ continuations?: { continuationId?: string; z0Iteration?: number; parentChecksum?: string; triangles?: number }[] }> : null),
        fetch(`/api/vertical/z0?archetype=${encodeURIComponent(source.archetypeId)}&candidate=${source.candidateId}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ iteration?: number; checksum?: string }> : null),
      ]);
      if (controller.signal.aborted) return;
      setOfficialOpen(open);
      setCappedMesh(capped);
      setAdaptMesh(adapted);
      setReadiness(ready);
      setChoiceIds((catalogue?.continuations ?? []).flatMap((item) => typeof item.continuationId === "string" ? [item.continuationId] : []));
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
      setFinalMesh(geometry ? decodeSolidifiedMesh(geometry) : null);
      setChecks(solid?.checks ?? null);
    };

    void run().catch(() => {
      if (controller.signal.aborted) return;
      setOfficialOpen(null);
      setFinalMesh(null);
    });
    return () => controller.abort();
  }, [archetypeId, initial, officialId, resolved, source]);

  useEffect(() => {
    if (!source || !activeId) {
      setSampleFrames(null);
      setSampleState("missing");
      setDevelopMeshes({});
      setMeshState("missing");
      setExploreOpen(null);
      setExploreOpenState("missing");
      return;
    }
    const controller = new AbortController();
    setSequence(IDLE_SEQUENCE);
    setSampleFrames(null);
    setSampleState("loading");
    setDevelopMeshes({});
    setMeshState("loading");
    setExploreOpen(null);
    setExploreOpenState("loading");
    const params = new URLSearchParams({
      archetype: source.archetypeId,
      candidate: String(source.candidateId),
      continuation: activeId,
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
          setSampleState("missing");
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
        setSampleState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSampleFrames(null);
          setSampleState("missing");
        }
      });
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
        setMeshState(Object.keys(next).length > 0 ? "ready" : "missing");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDevelopMeshes({});
          setMeshState("missing");
        }
      });
    readMesh(`/api/vertical/experiments/criteria-hybrid?archetype=${encodeURIComponent(source.archetypeId)}&continuation=${activeId}&reading=open`, controller.signal)
      .then((mesh) => {
        if (controller.signal.aborted) return;
        setExploreOpen(mesh);
        setExploreOpenState(mesh ? "ready" : "missing");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setExploreOpen(null);
          setExploreOpenState("missing");
        }
      });
    return () => controller.abort();
  }, [activeId, source]);

  useEffect(() => {
    if (source?.archetypeId !== "vertical-void" || source.candidateId !== 351 || activeId !== "N24") {
      setGenerationReady(false);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ archetype: "vertical-void", candidate: "351", continuation: "N24" });
    fetch(`/api/vertical/process-generation?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ contract?: string }> : null)
      .then((body) => {
        if (!controller.signal.aborted) setGenerationReady(body?.contract === "process-generation-replay-v1");
      })
      .catch(() => {
        if (!controller.signal.aborted) setGenerationReady(false);
      });
    return () => controller.abort();
  }, [activeId, source]);

  const horizon = sampleFrames && sampleFrames.length > 1 ? sampleFrames.length - 1 : 0;
  const origin = sampleFrames?.[0]?.iteration ?? identity.z0Iteration ?? 0;
  const playStep = horizon > 0 ? Math.min(horizon, Math.max(0, sequence.sample)) : 0;
  const playIteration = origin + playStep;
  const liveGeneration = source?.archetypeId === "vertical-void" && source.candidateId === 351 && activeId === "N24" && generationReady;
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
      setSequence((current) => advanceSequence(current, horizon));
    }, delay);
    return () => window.clearInterval(timer);
  }, [horizon, sequence.phase, sequence.playing]);
  const selectedGroup = groupFor(officialId);
  const activeGroup = groupFor(activeId);
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
  const choices = continuationChoices(choiceIds, officialId);
  const capAccentMesh = useMemo(
    () => (officialOpen && cappedMesh ? capAddition(officialOpen, cappedMesh) : null),
    [cappedMesh, officialOpen],
  );
  const capExtent = useMemo(() => (cappedMesh ? capProjectionExtent(cappedMesh) : null), [cappedMesh]);
  const retainedCount = sampleFrames?.reduce((count, frame) => count + (frame.reason ? 1 : 0), 0) ?? null;
  const samplingRule = "Δ ≥ 0.08 after 8 iterations. Maximum gap 24.";
  const sampleNote = sampleState === "loading"
    ? `Reading the temporal record for ${activeId ?? "this continuation"}`
    : `Sampling replay is not stored for ${activeId ?? "this continuation"}.`;
  const canPlay = Boolean(sampleFrames && sampleFrames.length > 1 && horizon > 0);
  const seek = (iteration: number) => {
    if (horizon <= 0) return;
    setSequence({ phase: "sample", sample: Math.min(horizon, Math.max(0, iteration - origin)), stack: 0, veil: 0, form: 0, playing: false });
  };
  const stackStatus = phaseWord("stack", sequence);
  return (
    <main className="vertical-process process-canvas" data-archetype={archetypeId}>
      <div className="process-setup">
        <section className="process-step process-start" aria-label="Start">
          <div className="process-start-source">
            <header className="vertical-process-label">
              <p className="eyebrow">01</p>
              <h2 className="panel-title">Start</h2>
            </header>
            <p className="process-sentence">A verified Skill 2 state begins the sequence.</p>
            <p className="process-cue">{archetypeName}</p>
          </div>
          <ProcessStartField plate={z0Plate} />
          <TechnicalDetails>
            <dl className="process-start-meta">
              <div><dt>Archetype</dt><dd>{archetypeName}</dd></div>
              <div><dt>Skill 2 candidate</dt><dd>{source ? String(source.candidateId) : "Pending"}</dd></div>
              <div><dt>Iteration</dt><dd>{identity.z0Iteration ?? "Pending"}</dd></div>
              <div><dt>Checksum</dt><dd>{identity.checksum ?? "Pending"}</dd></div>
              <div className="process-start-state"><dt>Status</dt><dd>{identity.provenance === "skill2" ? "Verified" : "Pending"}</dd></div>
            </dl>
            <p>Stored Skill 2 state. Not regenerated.</p>
          </TechnicalDetails>
        </section>

        <section className="process-step process-descriptors" aria-label="Inherit">
          <header className="vertical-process-label">
            <p className="eyebrow">02</p>
            <h2 className="panel-title">Inherit</h2>
          </header>
          <p className="process-sentence">Architectural criteria arrive as three families.</p>
          <InheritFamilySummary profile={intent} />
          <TechnicalDetails>
            <p>Formal, Spatial, and Atmospheric ratings are inherited from the architectural profile. The chart reads those stored ratings.</p>
          </TechnicalDetails>
        </section>

        <section className="process-step process-recipes" aria-label="Continue">
          <header className="vertical-process-label">
            <p className="eyebrow">03</p>
            <h2 className="panel-title">Continue</h2>
          </header>
          <p className="process-sentence">Twenty-four continuations grow from one verified state.</p>
          <ContinueFamilyFan
            groups={BEHAVIOR_GROUPS}
            activeFocus={activeGroup?.focus ?? null}
            selectedId={activeId}
            stance={activeId && activeId === officialId ? "final" : "alternate"}
            plate={z0Plate}
          />
        </section>
      </div>

      <div className="process-work">
        <section className="process-step process-live process-sample" aria-label="Sample">
          <header className="vertical-process-label">
            <p className="eyebrow">04</p>
            <h2 className="panel-title">Sample</h2>
            <p className="process-phase" data-phase={phaseWord("sample", sequence).toLowerCase()}>{phaseWord("sample", sequence)}</p>
          </header>
          <p className="process-sentence">Significant moments are retained from the evolving 2D system.</p>
          {officialId ? (
            <ContinuationExplorer activeId={activeId} officialId={officialId} extendedId={extendedId} onSelect={setExploredId} />
          ) : null}
          <p className="process-cue">
            {activeId ?? "Continuation"}
            {sampleState === "ready" && retainedCount != null ? ` · ${retainedCount} retained` : ""}
            {canPlay ? ` · ${playIteration}` : ""}
          </p>
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
                    <li data-reason="threshold"><span>Retained</span></li>
                    <li data-reason="max-gap"><span>Gap</span></li>
                    <li data-reason="skip"><span>Skipped</span></li>
                    <li data-reason="active"><span>Current</span></li>
                  </ul>
                </aside>
              </div>
            ) : (
              <p className="process-pending">{sampleState === "loading" ? "Reading" : "Sampling record unavailable."}</p>
            )}
          </div>
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
          <TechnicalDetails>
            <p>{samplingRule}</p>
            <p>Teal marks a sample kept because the change crossed the threshold. Copper marks a sample kept because the gap reached its maximum. Gray was generated and skipped. The white outline is the current plate.</p>
            <p>{activeGroup?.focus ?? (extendedId && activeId === extendedId ? "Extended continuation." : "Descriptor focus follows the active continuation.")}</p>
            {sampleState !== "ready" ? <p>{sampleNote}</p> : null}
          </TechnicalDetails>
        </section>

        <section className="process-step process-live process-xyt" aria-label="Develop">
          <header className="vertical-process-label">
            <p className="eyebrow">05</p>
            <h2 className="panel-title">Develop</h2>
            <p className="process-phase" data-phase={stackStatus.toLowerCase()}>{stackStatus}</p>
          </header>
          <p className="process-sentence">{liveGeneration ? "Retained samples become a continuous field, and that field becomes a surface." : "Each retained plate opens the next interval, and the body grows through it."}</p>
          {officialId ? (
            <ContinuationExplorer activeId={activeId} officialId={officialId} extendedId={extendedId} onSelect={setExploredId} />
          ) : null}
          {liveGeneration ? (
            <ProcessGeneration
              key={`${archetypeId}:${activeId ?? ""}`}
              plates={retainedPlates}
              meshes={developMeshes}
              loading={sampleState === "loading" || meshState === "loading"}
              autoplay={sequence.phase === "stack" && sequence.playing}
              isoCamera={isoCamera}
              isoTick={isoTick}
              onIsoCamera={nudgeIso}
              onResetIso={resetIso}
              onEngage={() => setSequence((current) => current.phase === "done" ? current : { ...current, phase: "stack", playing: false })}
              onComplete={() => setSequence((current) => ({ ...current, phase: "done", playing: false }))}
            />
          ) : (
            <ProcessDevelop
              key={`${archetypeId}:${activeId ?? ""}`}
              plates={retainedPlates}
              meshes={developMeshes}
              loading={sampleState === "loading" || meshState === "loading"}
              autoplay={sequence.phase === "stack" && sequence.playing}
              isoCamera={isoCamera}
              isoTick={isoTick}
              onIsoCamera={nudgeIso}
              onResetIso={resetIso}
              onEngage={() => setSequence((current) => current.phase === "done" ? current : { ...current, phase: "stack", playing: false })}
              onComplete={() => setSequence((current) => ({ ...current, phase: "done", playing: false }))}
            />
          )}
        </section>

        <section className="process-step process-live process-form" aria-label="Form">
          <header className="vertical-process-label">
            <p className="eyebrow">06</p>
            <h2 className="panel-title">Form</h2>
          </header>
          <p className="process-sentence">The processed field produces the final Open morphology.</p>
          {officialId ? (
            <ContinuationExplorer activeId={activeId} officialId={officialId} extendedId={extendedId} onSelect={setExploredId} />
          ) : null}
          <p className="process-cue">
            {exploreOpen ? `Open · ${activeId}` : exploreOpenState === "loading" ? "Reading" : "Not stored"}
          </p>
          <div className="process-form-stage">
            <div className="process-form-layer">
              {exploreOpen ? (
                <div className="process-form-reveal" key={activeId ?? "open"}>
                  <ProcessMorphology
                    mesh={exploreOpen}
                    cacheIdentity={`${archetypeId}:form:${activeId ?? ""}`}
                    frame="module"
                    steer
                    zoomable
                    insideBox
                    isoCamera={isoCamera}
                    isoTick={isoTick}
                    onIsoCamera={nudgeIso}
                  />
                </div>
              ) : (
                <ProcessGuide label={exploreOpenState === "loading" ? "Reading" : "Open morphology"} clear />
              )}
            </div>
          </div>
          <div className="process-transport">
            <button type="button" onClick={resetIso}>Reset to isometric</button>
          </div>
          <TechnicalDetails>
            <p>Saddle sculpt, retained mass, a smooth body envelope, surface-nets extraction, and mesh fairing.</p>
            <p>{exploreOpen ? `Stored Open morphology for ${activeId}.` : exploreOpenState === "loading" ? `Reading the stored Open for ${activeId ?? "this continuation"}.` : `Open morphology is not stored for ${activeId ?? "this continuation"}.`}</p>
          </TechnicalDetails>
        </section>

        <div className="process-down">
          {activeId !== officialId ? (
            <p className="process-cue" data-exploring="true">Later stages stay on {officialId ?? "the official selection"}.</p>
          ) : null}

          <section className="process-step process-cap" aria-label="Cap">
            <header className="vertical-process-label">
              <p className="eyebrow">07</p>
              <h2 className="panel-title">Cap</h2>
            </header>
            <p className="process-sentence">The Open form closes into a continuous mass.</p>
            <div className="process-cap-pair">
              <div className="process-cap-view">
                <div className="process-cap-stage">
                  {officialOpen ? (
                    <ProcessMorphology
                      mesh={officialOpen}
                      cacheIdentity={`${archetypeId}:cap-open:${officialId ?? ""}`}
                      frame="module"
                      isoCamera={capCamera}
                      isoExtent={capExtent}
                    />
                  ) : <p className="process-pending">Open</p>}
                </div>
                <p className="process-cap-name">Open</p>
              </div>
              <p className="process-cap-cue" aria-hidden="true">→</p>
              <div className="process-cap-view">
                <div className="process-cap-stage">
                  {cappedMesh ? (
                    <ProcessMorphology
                      mesh={cappedMesh}
                      cacheIdentity={`${archetypeId}:capped:${officialId ?? ""}`}
                      frame="module"
                      isoCamera={capCamera}
                      isoExtent={capExtent}
                      accent={capAccentMesh}
                    />
                  ) : <p className="process-pending">Capped</p>}
                </div>
                <p className="process-cap-name">Capped</p>
              </div>
            </div>
            {adaptMesh ? (
              <div className="process-adapt-note">
                <p>Open → capped → capped + adapt</p>
                <div className="process-adapt-mesh">
                  <ProcessMorphology mesh={adaptMesh} cacheIdentity={`${archetypeId}:adapted:${officialId ?? ""}`} frame="module" />
                </div>
              </div>
            ) : null}
            <TechnicalDetails>
              <p>Open, then capped, then the selected module is validated and handed on. Steps 07–10 follow the official selection {officialId ?? "pending"}.</p>
              {adaptMesh ? <p>Inserted Horizontal Plate continues from capped to capped and adapted.</p> : null}
            </TechnicalDetails>
          </section>

          <section className="process-step process-choose" aria-label="Choose">
            <header className="vertical-process-label">
              <p className="eyebrow">08</p>
              <h2 className="panel-title">Choose</h2>
            </header>
            <p className="process-sentence">One continuation is chosen from the field.</p>
            <div className="process-choose-board">
              <div className="process-choose-field" role="list" aria-label="Stored continuations">
                {BEHAVIOR_GROUPS.map((group) => {
                  const members = choices.filter((id) => {
                    const number = branchNumber(id);
                    return number != null && number >= group.start && number <= group.end;
                  });
                  if (members.length === 0) return null;
                  return (
                    <div key={group.focus} className="process-choose-group" role="presentation" data-count={members.length}>
                      {members.map((id) => (
                        <span
                          key={id}
                          className="process-choose-mark"
                          role="listitem"
                          data-on={id === officialId ? "true" : "false"}
                          title={`${id} · ${group.focus}`}
                        >
                          <i aria-hidden="true" />
                          <span>{id.slice(1)}</span>
                        </span>
                      ))}
                    </div>
                  );
                })}
                {choices.filter((id) => (branchNumber(id) ?? 0) > 24).map((id) => (
                  <div key={id} className="process-choose-group process-choose-extended" role="presentation">
                    <span
                      className="process-choose-mark"
                      role="listitem"
                      data-on={id === officialId ? "true" : "false"}
                      title={`${id} · Extended`}
                    >
                      <i aria-hidden="true" />
                      <span>{id.slice(1)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <figure className="process-choose-preview">
                <div className="process-choose-stage">
                  {officialOpen ? (
                    <ProcessMorphology
                      mesh={officialOpen}
                      cacheIdentity={`${archetypeId}:choose:${officialId ?? ""}`}
                      frame="module"
                    />
                  ) : null}
                </div>
                <figcaption>
                  <strong>{officialId ?? "Pending"}</strong>
                  <span>{selectedGroup?.focus ?? (extendedId ? "Extended" : "Continuation")}</span>
                </figcaption>
              </figure>
            </div>
            <Link href={paretoHref} className="vertical-process-catalogue process-catalogue-open">Open catalogue</Link>
            <TechnicalDetails>
              <p>{archetypeName}. {selectedGroup ? `${selectedGroup.focus}. ` : extendedId ? "Extended continuation. " : ""}Readiness {verdictLabel(catalogueVerdict)}. {choices.length} stored continuations, one selected.</p>
            </TechnicalDetails>
          </section>

          <section className="process-step process-solidify" aria-label="Solidify and validate">
            <header className="vertical-process-label">
              <p className="eyebrow">09</p>
              <h2 className="panel-title">Solidify</h2>
            </header>
            <p className="process-sentence">The geometry is checked before it becomes the final module.</p>
            <div className="process-solid-body">
              <div className="process-final-mesh">
                {finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity={`${archetypeId}:solid:${selected?.continuationId ?? ""}`} frame="module" /> : <p className="process-pending">Pending</p>}
              </div>
              <div className="process-solid-panel">
                <p className="process-solid-answer" data-mark={selected?.status === "Validated" ? "pass" : selected?.status === "Review" ? "review" : undefined}>
                  {selected?.status === "Validated" ? "Ready" : selected?.status === "Review" ? "Review" : "Pending"}
                </p>
              </div>
            </div>
            <TechnicalDetails>
              {checks ? (
                <ul className="process-checks">
                  <li data-mark={checks.components === 1 ? "pass" : "fail"}><span aria-hidden="true">{checks.components === 1 ? "✓" : "✕"}</span><span>Single body</span><span>{checks.components}</span></li>
                  <li data-mark={checks.boundaryEdges === 0 ? "pass" : "fail"}><span aria-hidden="true">{checks.boundaryEdges === 0 ? "✓" : "✕"}</span><span>Boundary</span><span>{checks.boundaryEdges}</span></li>
                  <li data-mark={checks.nonManifoldEdges === 0 ? "pass" : "fail"}><span aria-hidden="true">{checks.nonManifoldEdges === 0 ? "✓" : "✕"}</span><span>Nonmanifold</span><span>{checks.nonManifoldEdges}</span></li>
                  <li data-mark={checks.manifold === "PASS" ? "pass" : "fail"}><span aria-hidden="true">{checks.manifold === "PASS" ? "✓" : "✕"}</span><span>Manifold</span><span>{checks.manifold}</span></li>
                  <li data-mark={checks.preflight === "PASS" ? "pass" : "fail"}><span aria-hidden="true">{checks.preflight === "PASS" ? "✓" : "✕"}</span><span>Kernel accepted</span><span>{checks.preflight}</span></li>
                </ul>
              ) : (
                <p>Stored checks pending.</p>
              )}
            </TechnicalDetails>
          </section>

          <section className="process-step process-handoff-end" aria-label="Hand off">
            <header className="vertical-process-label">
              <p className="eyebrow">10</p>
              <h2 className="panel-title">Hand off</h2>
            </header>
            <p className="process-sentence">The validated module is ready for the next skill.</p>
            <div className="process-handoff-body">
              <div className="process-final-mesh">
                {finalMesh ? <ProcessMorphology mesh={finalMesh} cacheIdentity={`${archetypeId}:handoff:${selected?.continuationId ?? ""}`} frame="module" /> : <p className="process-pending">Pending</p>}
              </div>
              <div className="process-handoff-panel">
                <p className="process-handoff-ready">{selected?.status === "Validated" ? "Ready for Skill 4" : selected?.status === "Review" ? "Review before Skill 4" : "Pending"}</p>
              </div>
            </div>
            <TechnicalDetails>
              <dl className="process-facts">
                <div><dt>Archetype</dt><dd>{archetypeName}</dd></div>
                <div><dt>Continuation</dt><dd>{selected?.continuationId ?? "Pending"}</dd></div>
                <div><dt>Status</dt><dd>{selected?.status ?? "Pending"}</dd></div>
                {selected?.moduleId ? <div><dt>Module</dt><dd>{selected.moduleId}</dd></div> : null}
                {checks?.file ? <div><dt>File</dt><dd>{checks.file}</dd></div> : null}
              </dl>
              <p>Selected module, then Skill 3 final, then Skill 4 input.</p>
            </TechnicalDetails>
            <div className="process-handoff-links">
              <Link href={finalHref} className="vertical-process-catalogue process-catalogue-open">View finals</Link>
              <Link href={skill4Href} className="vertical-process-catalogue process-skill4">Skill 4</Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
