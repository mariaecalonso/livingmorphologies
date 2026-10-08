"use client";

import Link from "next/link";
import { ProcessMorphology, ProcessPlate, ProcessStack } from "@/components/vertical-process-stage";
import type { ArchitecturalIntentProfile } from "@/lib/architectural-intent";
import type { NaturalContinuation } from "@/lib/skill3/continuations";
import { stackDisplayIndices } from "@/lib/skill3/stack-display";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

const RECIPE_COUNT = 24;
const SELECTED_COUNT = 12;

const RECIPE_GROUPS: readonly { title: string; range: string }[] = [
  { title: "F", range: "N01–N03" },
  { title: "S", range: "N04–N06" },
  { title: "A", range: "N07–N09" },
  { title: "F+S", range: "N10–N12" },
  { title: "F+A", range: "N13–N15" },
  { title: "S+A", range: "N16–N18" },
  { title: "F+S+A", range: "N19–N24" },
];

function PhaseMarks() {
  return (
    <span className="process-phases" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function eventLabel(reason: string | undefined) {
  if (reason === "z0") return "Z0";
  if (reason === "threshold") return "Accepted";
  if (reason === "max-gap") return "Held";
  return "";
}

export function ProcessStory({
  intent,
  archetypeId,
  archetypeName,
  candidateId,
  z0Status,
  z0Iteration,
  shown,
  generatedCount,
  selectedCount,
  catalogueHref,
  onTriangles,
  onRead,
}: {
  intent: ArchitecturalIntentProfile | null;
  archetypeId: string | null;
  archetypeName: string | null;
  candidateId: number | null;
  z0Status: string;
  z0Iteration: number | null;
  shown: NaturalContinuation | null;
  generatedCount: number;
  selectedCount: number;
  catalogueHref: string;
  onTriangles: (count: number | null) => void;
  onRead?: () => void;
}) {
  const sampleIndices = shown ? stackDisplayIndices(shown.field.slices.length) : [];
  const revealedField: VerticalViewerField | null = shown ? shown.field : null;
  const ready = Boolean(archetypeId);

  return (
    <div className="process-story" data-archetype={archetypeId ?? undefined} data-candidate={candidateId ?? undefined}>
      <div className="process-logic">
        <section className="process-step process-start" aria-label="Start">
          <header className="vertical-process-label">
            <p className="eyebrow">01</p>
            <h2 className="panel-title">Start</h2>
          </header>
          <p className="process-flow">Selected Skill 2 <span aria-hidden="true">→</span> Verified Z0</p>
          <dl>
            <div><dt>Archetype</dt><dd>{ready ? archetypeName ?? "Pending" : "Pending"}</dd></div>
            <div><dt>Candidate</dt><dd>{candidateId != null ? `#${candidateId}` : "Pending"}</dd></div>
            <div><dt>Z0</dt><dd>{ready ? z0Status : "Pending"}</dd></div>
            <div><dt>Iteration</dt><dd>{z0Iteration != null ? String(z0Iteration) : "Pending"}</dd></div>
          </dl>
        </section>

        <section className="process-step process-descriptors" aria-label="Inherit">
          <header className="vertical-process-label">
            <p className="eyebrow">02</p>
            <h2 className="panel-title">Inherit</h2>
          </header>
          <p className="process-kicker">Same descriptor logic carried forward</p>
          <div className="process-descriptor-row">
            {(["formal", "spatial", "atmospheric"] as const).map((family) => {
              const branch = intent?.[family];
              return (
                <article key={family} data-family={family}>
                  <h3>{family}</h3>
                  <p className="process-descriptor-name">{branch?.descriptor ?? "Pending"}</p>
                  <ul>
                    {(branch?.criteria ?? []).map((criterion) => (
                      <li key={criterion.id}>
                        <span>{criterion.label}</span>
                        <span className="process-rating" data-level={criterion.level} aria-label={criterion.level}>
                          <i /><i /><i />
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="process-step process-recipes" aria-label="Modulate">
          <header className="vertical-process-label">
            <p className="eyebrow">03</p>
            <h2 className="panel-title">Modulate</h2>
          </header>
          <p className="process-kicker">Same baseline + different temporal emphasis</p>
          <ol>
            {RECIPE_GROUPS.map((group) => (
              <li key={group.range}>
                <span>{group.title}</span>
                <span>{group.range}</span>
                <PhaseMarks />
              </li>
            ))}
          </ol>
          <p className="process-phase-legend" aria-hidden="true"><span>P1</span><span>P2</span><span>P3</span><span>P4</span></p>
        </section>
      </div>

      <section className="process-step process-band" aria-label="Sample">
        <header className="vertical-process-label">
          <p className="eyebrow">04</p>
          <h2 className="panel-title">Sample</h2>
          <p className="process-kicker">Evolve adaptively + retain meaningful states</p>
          {onRead && !shown ? <button type="button" className="process-read" onClick={onRead}>Read continuation</button> : null}
        </header>
        <ol className="process-band-flow">
          <li>Z0</li>
          <li>Development</li>
          <li>Accepted</li>
          <li data-kind="event">Opening change</li>
          <li data-kind="event">Merge / split</li>
          <li data-kind="event">Direction change</li>
          <li>Accepted</li>
          <li>{shown ? "Resolved horizon" : "Pending horizon"}</li>
        </ol>
        <div className="process-horizon-track">
          <span>Minimum 64</span>
          <span className="process-horizon-run" />
          <span>Maximum 400</span>
        </div>
        {shown && sampleIndices.length > 0 ? (
          <div className="process-band-samples">
            {sampleIndices.map((index) => (
              <figure key={shown.events[index]?.iteration ?? index}>
                <ProcessPlate slice={shown.field.slices[index]} />
                <figcaption>{eventLabel(shown.events[index]?.reason)}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </section>

      <div className="process-hero">
        <section className="process-step process-xyt" aria-label="Stack">
          <header className="vertical-process-label">
            <p className="eyebrow">05</p>
            <h2 className="panel-title">Stack</h2>
            <p className="vertical-process-aside">XY morphology · Z time · 20×20×20</p>
          </header>
          <div className="process-xyt-stage">
            <span className="process-xyt-axis" aria-hidden="true">Z</span>
            {revealedField && revealedField.slices.length > 0 ? (
              <ProcessStack field={revealedField} labels={revealedField.slices.map((_, index) => eventLabel(shown?.events[index]?.reason))} reasons={shown?.events.map((event) => event.reason)} />
            ) : (
              <div className="process-xyt-schematic" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
              </div>
            )}
          </div>
          <p className="process-kicker">Iteration count does not equal physical height.</p>
        </section>
        <p className="process-hero-cue" aria-hidden="true">→</p>
        <section className="process-preview" aria-label="3D morphology preview">
          <header className="vertical-process-label">
            <h2 className="panel-title">3D morphology</h2>
          </header>
          <div className="process-preview-stage">
            <div className="process-preview-square">
              {shown && revealedField ? (
                <ProcessMorphology
                  key={`${shown.archetypeId}:${shown.candidateId}:${shown.parentChecksum}`}
                  field={revealedField}
                  cacheIdentity={`${shown.archetypeId}:${shown.candidateId}:${shown.id}`}
                  onTriangles={onTriangles}
                />
              ) : (
                <p className="process-pending">Pending</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="process-step process-footer">
        <header className="vertical-process-label">
          <p className="eyebrow">06</p>
          <h2 className="panel-title">Curate</h2>
        </header>
        <p className="process-counts">
          <span>{generatedCount} / {RECIPE_COUNT} generated</span>
          <span aria-hidden="true">→</span>
          <span>Diversity analysis</span>
          <span aria-hidden="true">→</span>
          <span>{selectedCount} / {SELECTED_COUNT} selected</span>
        </p>
        <Link href={catalogueHref} className="vertical-process-catalogue">
          <span>Explore 3D catalogue</span>
          <span aria-hidden="true">→</span>
        </Link>
      </footer>
    </div>
  );
}
