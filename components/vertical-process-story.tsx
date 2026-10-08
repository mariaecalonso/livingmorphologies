"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ProcessStack } from "@/components/vertical-process-stage";
import { TYPOLOGIES } from "@/lib/catalog";
import type { ArchitecturalIntentProfile } from "@/lib/architectural-intent";
import { architecturalIntentFor } from "@/lib/skill3/architectural-intent";
import type { ContinuationEvent, NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z } from "@/lib/skill3/envelope";
import { readSelectedSkill3Morphology } from "@/lib/skill3/morphology-selection";
import { DISPLAY_COUNT, representativeContinuations } from "@/lib/skill3/representatives";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

export type ProcessExample = {
  archetypeId: string;
  typologyId: string;
  archetypeName: string;
  candidateId: number;
  z0Iteration: number;
  checksum: string;
};

type ApiContinuation = Omit<NaturalContinuation, "field">;

type ApiSet = Omit<NaturalContinuationSet, "continuations"> & {
  continuations: ApiContinuation[];
  fields: VerticalViewerField[];
};

function subscribeMorphology(onChange: () => void) {
  window.addEventListener("lm-skill3-morphology", onChange);
  return () => window.removeEventListener("lm-skill3-morphology", onChange);
}

function readSavedContinuation(archetypeId: string | null, candidateId: number | null) {
  if (!archetypeId || candidateId == null) return null;
  const saved = readSelectedSkill3Morphology("handoff", archetypeId);
  return saved && saved.candidateId === candidateId ? saved.continuationId : null;
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

/** Authored continuation-recipe groups. Counts match `PLAN` in continuation-recipes. */
const BEHAVIOR_GROUPS: readonly { focus: string; range: string; count: number }[] = [
  { focus: "Formal", range: "N01–N03", count: 3 },
  { focus: "Spatial", range: "N04–N06", count: 3 },
  { focus: "Atmospheric", range: "N07–N09", count: 3 },
  { focus: "Formal + Spatial", range: "N10–N12", count: 3 },
  { focus: "Formal + Atmospheric", range: "N13–N15", count: 3 },
  { focus: "Spatial + Atmospheric", range: "N16–N18", count: 3 },
  { focus: "Formal + Spatial + Atmospheric", range: "N19–N24", count: 6 },
];

const BEHAVIOR_COUNT = BEHAVIOR_GROUPS.reduce((sum, group) => sum + group.count, 0);

function reasonLabel(reason: string) {
  if (reason === "z0") return "Retained";
  if (reason === "threshold") return "Meaningful";
  if (reason === "max-gap") return "Retained";
  return reason;
}

function deltaText(value: number) {
  if (!Number.isFinite(value)) return null;
  return value.toFixed(3);
}

function timelineRows(events: readonly ContinuationEvent[], origin: number, horizon: number) {
  const rows: Array<{ kind: "event"; event: ContinuationEvent } | { kind: "skipped"; count: number; key: string }> = [];
  const end = origin + horizon;
  events.forEach((event, index) => {
    rows.push({ kind: "event", event });
    const following = events[index + 1];
    const skipped = following ? following.iteration - event.iteration - 1 : end - event.iteration;
    if (skipped > 0) rows.push({ kind: "skipped", count: skipped, key: `${event.iteration}:${skipped}` });
  });
  return rows;
}

export function ProcessStory({
  example,
  archetypeId = null,
  candidateId = null,
  catalogueHref,
}: {
  example: ProcessExample | null;
  archetypeId?: string | null;
  candidateId?: number | null;
  catalogueHref: string;
}) {
  const focusArchetype = archetypeId ?? example?.archetypeId ?? null;
  const focusCandidate = candidateId ?? example?.candidateId ?? null;
  const [set, setSet] = useState<NaturalContinuationSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(focusArchetype != null && focusCandidate != null);
  const finalId = useSyncExternalStore(
    subscribeMorphology,
    () => readSavedContinuation(focusArchetype, focusCandidate),
    () => null,
  );
  const intent = useMemo<ArchitecturalIntentProfile | null>(() => {
    if (!focusArchetype) return null;
    try {
      return architecturalIntentFor(focusArchetype);
    } catch {
      return null;
    }
  }, [focusArchetype]);
  const shown = set?.continuations.find((continuation) => continuation.id === "N01") ?? null;
  const archetype = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((item) => ({ ...item, typologyLabel: typology.label }))).find((item) => item.id === focusArchetype);
  const generated = set?.continuations.length ?? BEHAVIOR_COUNT;
  const representative = set ? representativeContinuations(set.continuations, DISPLAY_COUNT).length : DISPLAY_COUNT;
  const envelope = set?.rules.envelope;
  const moduleLabel = envelope
    ? `${envelope.sizeX}×${envelope.sizeY}×${envelope.sizeZ}`
    : `${MODULE_SIZE_X}×${MODULE_SIZE_Y}×${MODULE_SIZE_Z}`;
  const shownExample = example && focusArchetype === example.archetypeId && focusCandidate === example.candidateId ? example : null;
  const aligned = Boolean(shown && shown.field.slices.length === shown.events.length && shown.field.slices.length > 0);
  const rows = shown && set ? timelineRows(shown.events, shown.z0Iteration, set.rules.horizon) : [];

  useEffect(() => {
    if (!focusArchetype || focusCandidate == null) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      archetype: focusArchetype,
      candidate: String(focusCandidate),
      cache: "1",
    });
    fetch(`/api/vertical?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted || response.status === 404) return;
        const body = (await response.json()) as ApiSet & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The stored continuation was not readable.");
        if (body.archetypeId !== focusArchetype || body.candidateId !== focusCandidate) {
          throw new Error("Continuation identity did not match the selected candidate.");
        }
        if (body.origin !== "handoff") throw new Error(`Continuation origin ${body.origin}.`);
        setSet(joinSet(body));
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setSet(null);
        setError(caught instanceof Error ? caught.message : "The stored continuation was not readable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [focusArchetype, focusCandidate]);

  return (
    <div className="process-story" data-archetype={focusArchetype ?? ""} data-candidate={focusCandidate ?? ""}>
      <div className="process-rail">
        <section className="process-step process-start" aria-label="Start">
          <header className="vertical-process-label">
            <p className="eyebrow">01</p>
            <h2 className="panel-title">Start</h2>
          </header>
          <p className="process-kicker">Verified Z0</p>
          <p className="process-flow">{shownExample ? archetype?.typologyLabel ?? shownExample.typologyId : "Pending"} <span aria-hidden="true">→</span> {shownExample?.archetypeName ?? archetype?.name ?? "Pending"} <span aria-hidden="true">→</span> {shownExample ? shownExample.candidateId : focusCandidate ?? "Pending"}</p>
          <dl>
            <div><dt>Z0</dt><dd>{shownExample ? "Verified" : "Pending"}</dd></div>
            <div><dt>Iteration</dt><dd>{shownExample ? String(shownExample.z0Iteration) : "Pending"}</dd></div>
            <div><dt>Checksum</dt><dd>{shownExample?.checksum ?? "Pending"}</dd></div>
          </dl>
        </section>

        <section className="process-step process-descriptors" aria-label="Inherit">
          <header className="vertical-process-label">
            <p className="eyebrow">02</p>
            <h2 className="panel-title">Inherit</h2>
          </header>
          <p className="process-kicker">Descriptors</p>
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

        <section className="process-step process-recipes" aria-label="Evolve">
          <header className="vertical-process-label">
            <p className="eyebrow">03</p>
            <h2 className="panel-title">Evolve</h2>
          </header>
          <p className="process-kicker">{BEHAVIOR_COUNT} temporal behaviors</p>
          <ol>
            {BEHAVIOR_GROUPS.map((group) => (
              <li key={group.range}>
                <span>{group.focus}</span>
                <span>{group.range}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="process-step process-curate" aria-label="Curate">
          <header className="vertical-process-label">
            <p className="eyebrow">06</p>
            <h2 className="panel-title">Curate</h2>
          </header>
          <p className="process-kicker">Diversity selection</p>
          <p className="process-counts">
            <span>{generated > 0 ? generated : "Pending"} generated</span>
            <span aria-hidden="true">→</span>
            <span>{representative > 0 ? representative : "Pending"} representative</span>
            <span aria-hidden="true">→</span>
            <span>{finalId ?? "Final pending"}</span>
          </p>
          <Link href={catalogueHref} className="vertical-process-catalogue">
            <span>Catalogue</span>
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>

      <section className="process-step process-sample" aria-label="Sample">
        <header className="vertical-process-label">
          <p className="eyebrow">04</p>
          <h2 className="panel-title">Sample</h2>
          <p className="process-kicker">Adaptive evolution{shown ? ` · ${shown.id}` : ""}</p>
        </header>
        <p className="process-legend">
          <span data-reason="threshold">Meaningful</span>
          <span data-reason="max-gap">Retained</span>
          <span data-kind="skipped">Skipped</span>
        </p>
        {set && shown ? (
          <p className="process-sample-rule">Horizon {set.rules.horizon} · min {set.rules.minGap} · max {set.rules.maxGap} · Δ {set.rules.deltaThreshold}</p>
        ) : null}
        {error ? <p className="process-pending">{error}</p> : null}
        {pending && !shown ? <p className="process-pending">Reading N01</p> : null}
        {!pending && !error && !shown ? <p className="process-pending">N01 pending</p> : null}
        {shown && rows.length > 0 ? (
          <ol className="process-timeline">
            {rows.map((row) => row.kind === "event" ? (
              <li key={row.event.iteration} className="process-timeline-event" data-reason={row.event.reason}>
                <span>{row.event.iteration}</span>
                <span>{reasonLabel(row.event.reason)}</span>
                <span>{row.event.reason === "z0" ? "" : deltaText(row.event.delta) ? `Δ ${deltaText(row.event.delta)}` : ""}</span>
              </li>
            ) : (
              <li key={row.key} className="process-timeline-skip" data-kind="skipped" style={{ flexGrow: row.count }}>
                {row.count} skipped
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="process-step process-xyt" aria-label="Stack">
        <header className="vertical-process-label">
          <p className="eyebrow">05</p>
          <h2 className="panel-title">Stack</h2>
          <p className="vertical-process-aside">T → Z · {moduleLabel}</p>
        </header>
        <p className="process-kicker">XYT construction</p>
        <div className="process-xyt-stage">
          {shown && aligned ? (
            <ProcessStack
              field={shown.field}
              plates={shown.field.slices.length}
              labels={shown.events.map((event) => String(event.iteration))}
              reasons={shown.events.map((event) => event.reason)}
            />
          ) : (
            <p className="process-pending">{pending ? "Reading N01" : "Pending"}</p>
          )}
        </div>
        <p className="process-kicker">Iteration count does not equal physical height.</p>
      </section>
    </div>
  );
}
