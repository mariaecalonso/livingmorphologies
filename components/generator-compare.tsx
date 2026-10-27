"use client";

import { useEffect, useState } from "react";
import handoffFile from "@/data/skill3/final-selection.json";
import { ProcessMorphology } from "@/components/vertical-process-stage";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";
import type { FinalHandoffSelection } from "@/lib/skill3/final-selection";
import { decodeSolidifiedMesh, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import { readActiveArchetype } from "@/lib/skill2/published-selection";
import type { IsoMesh } from "@/lib/scan/isomesh";

const HANDOFF = (handoffFile as { selections: FinalHandoffSelection[] }).selections;

type Bounds = { size: [number, number, number] };

type MeshRecord = {
  source: string;
  continuationId: string;
  triangles: number;
  bounds: Bounds;
  geometry: EncodedSolidifiedMesh;
};

type CompareBody = {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  stored: MeshRecord;
  generated: MeshRecord;
};

function sizeLabel(size: [number, number, number]) {
  return size.map((value) => value.toFixed(1)).join(" × ");
}

function MeshFacts({ record, label }: { record: MeshRecord; label: string }) {
  return (
    <dl className="generator-compare-facts">
      <div><dt>View</dt><dd>{label}</dd></div>
      <div><dt>Continuation</dt><dd>{record.continuationId}</dd></div>
      <div><dt>Triangles</dt><dd>{record.triangles.toLocaleString()}</dd></div>
      <div><dt>Bounds</dt><dd>{sizeLabel(record.bounds.size)}</dd></div>
      <div><dt>Source</dt><dd>{record.source}</dd></div>
    </dl>
  );
}

function MeshView({ mesh, identity }: { mesh: IsoMesh; identity: string }) {
  return (
    <ProcessMorphology
      mesh={mesh}
      cacheIdentity={identity}
      frame="module"
    />
  );
}

export function GeneratorCompare() {
  const [archetypeId, setArchetypeId] = useState(CARVED_MASS_SOURCES[0].archetypeId);
  const [mode, setMode] = useState<"pair" | "overlay">("pair");
  const [body, setBody] = useState<CompareBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const sync = () => {
      const active = readActiveArchetype();
      if (active && CARVED_MASS_SOURCES.some((item) => item.archetypeId === active)) setArchetypeId(active);
    };
    sync();
    window.addEventListener("lm-skill3-source", sync);
    return () => window.removeEventListener("lm-skill3-source", sync);
  }, []);

  const source = CARVED_MASS_SOURCES.find((item) => item.archetypeId === archetypeId) ?? null;
  const selected = HANDOFF.find((item) => item.archetypeId === archetypeId && item.candidateId === source?.candidateId) ?? null;

  useEffect(() => {
    if (!source || !selected) return;
    const controller = new AbortController();
    setPending(true);
    setError(null);
    setBody(null);
    const params = new URLSearchParams({
      archetype: source.archetypeId,
      candidate: String(source.candidateId),
      continuation: selected.continuationId,
    });
    fetch(`/api/vertical/debug/open-compare?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as CompareBody & { error?: string };
        if (!response.ok) throw new Error(payload.error || "The comparison could not be read.");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setBody(payload);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "The comparison could not be read.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [selected, source]);

  const storedMesh = body ? decodeSolidifiedMesh(body.stored.geometry) : null;
  const generatedMesh = body ? decodeSolidifiedMesh(body.generated.geometry) : null;

  return (
    <section className={`generator-compare${mode === "overlay" ? " is-overlay" : ""}`} aria-label="Stored Open and current generator">
      <header className="generator-compare-head">
        <p className="eyebrow">Debug</p>
        <h2 className="panel-title">Stored Open and current generator</h2>
        <p className="generator-compare-note">
          {selected ? `${source?.archetypeName ?? archetypeId} · ${selected.continuationId}` : archetypeId}
          {" · "}Temporary comparison. Neither mesh is written.
        </p>
        <div className="generator-compare-modes" role="group" aria-label="Comparison mode">
          <button type="button" data-on={mode === "pair"} onClick={() => setMode("pair")}>Side by side</button>
          <button type="button" data-on={mode === "overlay"} onClick={() => setMode("overlay")}>Stored Open / Current generator</button>
        </div>
      </header>
      {pending ? <p className="generator-compare-note">Running the current generator for this continuation.</p> : null}
      {error ? <p className="generator-compare-note">{error}</p> : null}
      {body && storedMesh && generatedMesh ? (
        <div className="generator-compare-pair">
          {mode === "pair" ? (
            <>
              <article className="generator-compare-stage">
                <h3>Stored Open</h3>
                <div className="generator-compare-view">
                  <MeshView mesh={storedMesh} identity={`${body.archetypeId}:stored:${body.continuationId}`} />
                </div>
                <MeshFacts record={body.stored} label="Stored Open" />
              </article>
              <article className="generator-compare-stage">
                <h3>Current generator</h3>
                <div className="generator-compare-view">
                  <MeshView mesh={generatedMesh} identity={`${body.archetypeId}:generated:${body.continuationId}`} />
                </div>
                <MeshFacts record={body.generated} label="Current generator" />
              </article>
            </>
          ) : (
            <article className="generator-compare-stage">
              <h3>Stored Open / Current generator</h3>
              <div className="generator-compare-view">
                <div className="compare-stored">
                  <MeshView mesh={storedMesh} identity={`${body.archetypeId}:overlay-stored:${body.continuationId}`} />
                </div>
                <div className="compare-generated">
                  <MeshView mesh={generatedMesh} identity={`${body.archetypeId}:overlay-generated:${body.continuationId}`} />
                </div>
              </div>
              <div className="generator-compare-facts-pair">
                <MeshFacts record={body.stored} label="Stored Open" />
                <MeshFacts record={body.generated} label="Current generator" />
              </div>
            </article>
          )}
        </div>
      ) : null}
    </section>
  );
}
