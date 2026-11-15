"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { criteriaMatrix, ratingLabel, type ArchitecturalDnaDocument } from "@/lib/skill5/architectural-dna";
import { PROGRAM_LABEL, type SiteArchetype } from "@/lib/skill5/catalog";
import {
  COMPATIBILITY_LIMIT,
  compareTile,
  parseClientCompatibility,
  type ClientActivity,
  type ClientCompatibilityDocument,
  type CompatibilityResult,
} from "@/lib/skill5/client-compatibility";
import { readSuitability } from "@/lib/skill5/suitability";
import type { Rating, TypologyId } from "@/lib/types";

const LABELS = new Map(criteriaMatrix().flatMap((group) => group.criteria.map((item) => [item.id, item])));

const SHORT: Record<string, string> = {
  "public-lobby": "Lobby",
  "private-staff-lobby": "Staff Lobby",
  "architecture-design-studio": "Arch. Studio",
  "product-design-studio": "Product",
  "prototyping-fabrication-lab": "Fabrication",
  "biological-research-lab": "Cultivation",
  "interdisciplinary-collaboration-hub": "Hub",
  "public-exhibition-gallery": "Gallery",
  "indoor-public-gathering": "Commons",
  "waterfront-gathering": "Waterfront",
  "public-restaurant": "Dining",
  "staff-dining": "Staff Dining",
};

function ActivityMark({ id }: { id: string }) {
  const paths: Record<string, string> = {
    "public-lobby": "M10 26 V10 H22 V26 M14 26 V16 H18 V26",
    "private-staff-lobby": "M12 26 V12 H20 V26 M14 26 V18 H18 V26",
    "architecture-design-studio": "M7 8 H25 M7 16 H25 M7 24 H25 M12 6 V26 M20 6 V26",
    "product-design-studio": "M8 14 H24 V20 H8 Z M10 20 V25 M22 20 V25 M8 14 V11",
    "prototyping-fabrication-lab": "M16 6 L26 12 V22 L16 28 L6 22 V12 Z M16 6 V16 M6 12 L16 16 L26 12",
    "biological-research-lab": "M8 20 C8 12 14 8 16 8 C18 8 24 12 24 20 M16 8 C16 4 20 3 22 6 M12 16 C16 14 18 18 22 16",
    "interdisciplinary-collaboration-hub": "M11 12 a3 3 0 1 0 0.1 0 M21 12 a3 3 0 1 0 0.1 0 M7 24 c1-5 6-6 8-4 c2-2 7-1 8 4",
    "public-exhibition-gallery": "M8 10 H24 V24 H8 Z M12 14 H20 M12 18 H18",
    "indoor-public-gathering": "M6 22 H26 M8 22 V14 H24 V22 M12 14 V10 H20 V14",
    "waterfront-gathering": "M6 16 C10 12 14 20 18 16 C22 12 26 20 30 16 M6 22 C10 18 14 26 18 22 C22 18 26 26 30 22",
    "public-restaurant": "M8 18 H24 M10 18 V24 M22 18 V24 M12 14 H20",
    "staff-dining": "M9 16 H23 V22 H9 Z M11 22 V26 M21 22 V26",
  };
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d={paths[id] ?? paths["public-lobby"]} />
    </svg>
  );
}

function relation(similarity: number | null): "match" | "partial" | "conflict" | "missing" {
  if (similarity === null) return "missing";
  if (similarity === 1) return "match";
  if (similarity === 0) return "conflict";
  return "partial";
}

export function TileCompatibility({
  dna,
  entry,
  activityId,
  onActivity,
  activeId,
  onActive,
  onRate,
  thumb,
}: {
  dna: ArchitecturalDnaDocument | null;
  entry: SiteArchetype;
  activityId: string;
  onActivity: (activityId: string) => void;
  activeId: string | null;
  onActive: (criterionId: string) => void;
  onRate: (criterionId: string, value: Rating) => void;
  thumb?: ReactNode;
}) {
  const [record, setRecord] = useState<ClientCompatibilityDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activities = record?.activities ?? null;
  const profile = dna?.profiles.find((item) => item.archetypeId === entry.archetypeId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site/client-activities", { signal: controller.signal })
      .then(async (response) => {
        const parsed = parseClientCompatibility(await response.json() as unknown);
        if (!response.ok || !parsed) throw new Error("unread");
        setRecord(parsed);
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("The client activity record could not be read.");
      });
    return () => controller.abort();
  }, []);

  const rooms = useMemo(
    () => (activities ?? []).filter((item) => item.contexts.includes(entry.program)),
    [activities, entry.program],
  );
  const activity = rooms.find((item) => item.id === activityId) ?? null;
  const result = useMemo(() => (profile && activity ? compareTile(profile, activity) : null), [activity, profile]);

  useEffect(() => {
    if (rooms.length === 0 || rooms.some((item) => item.id === activityId)) return;
    onActivity(rooms[0].id);
  }, [activityId, onActivity, rooms]);

  const reading = useMemo(() => {
    if (!activity || !result || !profile) return null;
    const definitions = new Map([...LABELS].map(([id, item]) => [id, item]));
    const justifications = new Map(profile.ratings.map((score) => [score.criterionId, score.justification]));
    return readSuitability(activity, result, definitions, justifications);
  }, [activity, profile, result]);

  if (!activity || !result?.applicable || !reading) {
    return <p className="site-dna-note">{notice ?? "Reading the comparison."}</p>;
  }

  return (
    <div className="site-dna-analysis">
      <ActivityColumn
        activities={rooms}
        activity={activity}
        occupancy={record?.occupancy ?? null}
        result={result}
        tile={entry}
        activeId={activeId}
        onActivity={onActivity}
        onActive={onActive}
        onRate={onRate}
        thumb={thumb}
      />
      <ProgramColumn reading={reading} activeId={activeId} onActive={onActive} />
    </div>
  );
}

function MatchRing({ percent }: { percent: number | null }) {
  const turn = ((percent ?? 0) / 100) * 289;
  return (
    <div className="site-dna-dial" data-kind="universal">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="site-dna-ring" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#3e5856" />
            <stop offset="55%" stopColor="#5d7c79" />
            <stop offset="100%" stopColor="#a07a68" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="46" />
        <circle className="site-dna-dial-glow" cx="60" cy="60" r="46" stroke="url(#site-dna-ring)" style={{ strokeDasharray: `${turn} 289` }} />
        <circle className="site-dna-dial-core" cx="60" cy="60" r="46" stroke="#d5e4e2" style={{ strokeDasharray: `${turn} 289` }} />
      </svg>
      <strong>{percent === null ? "—" : `${percent}%`}</strong>
      <small>Match</small>
    </div>
  );
}

function ActivityColumn({
  activities,
  activity,
  occupancy,
  result,
  tile,
  activeId,
  onActivity,
  onActive,
  onRate,
  thumb,
}: {
  activities: ClientActivity[];
  activity: ClientActivity;
  occupancy: ClientCompatibilityDocument["occupancy"] | null;
  result: CompatibilityResult;
  tile: SiteArchetype;
  activeId: string | null;
  onActivity: (activityId: string) => void;
  onActive: (criterionId: string) => void;
  onRate: (criterionId: string, value: Rating) => void;
  thumb?: ReactNode;
}) {
  const program = PROGRAM_LABEL[tile.program as TypologyId];
  const universal = result.universalEvidence;
  const compared = new Set(result.matches.map((match) => match.criterionId));
  const outside = activity.desires.filter((desire) => !compared.has(desire.criterionId));
  return (
    <div className="site-dna-activity">
      <section className="site-dna-panel site-dna-client-head">
        <header>
          <h2>Client compatibility — Tile analysis</h2>
          <p>How this tile aligns with the selected activity, including match, purpose, and spatial considerations.</p>
        </header>
        <div className="site-dna-activity-switch" role="listbox" aria-label="Building spaces" style={{ gridTemplateColumns: `repeat(${activities.length}, minmax(0, 1fr))` }}>
          {activities.map((item) => (
            <button key={item.id} type="button" role="option" aria-selected={item.id === activity.id} data-active={item.id === activity.id || undefined} onClick={() => onActivity(item.id)}>
              <ActivityMark id={item.id} />
              <span>{SHORT[item.id] ?? item.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="site-dna-panel site-dna-matchband">
        <MatchRing percent={result.universalPercent} />
        <div className="site-dna-matchcopy">
          <h2>{activity.name}</h2>
          <p>{activity.spaces}</p>
          <p className="site-dna-chips">
            <span>{activity.access}</span>
            {activity.contexts.map((context) => <span key={context}>{PROGRAM_LABEL[context]}</span>)}
          </p>
          <p className="site-dna-typology-line">
            {result.specificApplied
              ? `${program} typology ${result.specificPercent === null ? "—" : `${result.specificPercent}%`}`
              : "Typology-specific match is not applicable"}
          </p>
        </div>
        <dl>
          <div>
            <dt>Daytime occupancy</dt>
            <dd>{occupancy ? occupancy.daytime : "—"}</dd>
          </div>
          <div>
            <dt>Evening occupancy</dt>
            <dd>{occupancy ? occupancy.evening : "—"}</dd>
          </div>
          <div>
            <dt>Spatial character</dt>
            <dd>{program}</dd>
          </div>
        </dl>
        <div className="site-dna-thumb">{thumb}</div>
      </section>
      <div className="site-dna-lower">
        <section className="site-dna-panel site-dna-compare-panel">
          <div className="site-dna-compare-head">
            <h2>Criteria comparison</h2>
            <p><i data-fit="tile" /> Tile DNA (0–2) <i data-fit="client" /> Client need (0–2)</p>
          </div>
          <div className="site-dna-compare" role="list">
            {result.matches.map((match) => {
              const state = relation(match.similarity);
              const basis = match.basis === "geometry" ? "Measured" : match.basis === "review" ? "Review" : match.basis === "manual" ? "Adjusted" : "No rating";
              return (
                <button
                  key={match.criterionId}
                  type="button"
                  title={`Priority ${match.weight}. ${match.scope === "universal" ? "Universal" : "Typology"}. ${state}. ${basis}.`}
                  data-active={match.criterionId === activeId || undefined}
                  data-relation={state}
                  data-basis={match.basis ?? "missing"}
                  onClick={() => onActive(match.criterionId)}
                >
                  <b>{LABELS.get(match.criterionId)?.label ?? match.criterionId}</b>
                  <span data-kind="tile">{match.actual === null ? "—" : ratingLabel(match.actual)}</span>
                  <span data-kind="client">{ratingLabel(match.desired)}</span>
                  <i aria-hidden="true"><em style={{ width: `${((match.actual ?? 0) / 2) * 100}%` }} /></i>
                  <i data-desired="true" aria-hidden="true"><em style={{ width: `${(match.desired / 2) * 100}%` }} /></i>
                </button>
              );
            })}
            {outside.map((desire) => (
              <p key={desire.criterionId} title="Not applied to this tile">
                <b>{LABELS.get(desire.criterionId)?.label ?? desire.criterionId}</b>
                <span data-kind="tile">—</span>
                <span data-kind="client">{ratingLabel(desire.value)}</span>
                <i aria-hidden="true"><em style={{ width: "0%" }} /></i>
                <i data-desired="true" aria-hidden="true"><em style={{ width: `${(desire.value / 2) * 100}%` }} /></i>
              </p>
            ))}
          </div>
          <p className="site-compat-limit">{universal.geometry} measured · {universal.review} review. {COMPATIBILITY_LIMIT}</p>
          {activeId ? (
            <div className="site-dna-rate">
              {([0, 1, 2] as const).map((value) => (
                <button key={value} type="button" data-active={result.matches.find((match) => match.criterionId === activeId)?.actual === value || undefined} onClick={() => onRate(activeId, value)}>Tile {ratingLabel(value)}</button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ProgramColumn({
  reading,
  activeId,
  onActive,
}: {
  reading: ReturnType<typeof readSuitability>;
  activeId: string | null;
  onActive: (criterionId: string) => void;
}) {
  const panels = [
    ["work", "Why it might work", reading.works],
    ["conflict", "Potential conflicts", reading.conflicts],
    ["check", "Requires checking", reading.checks],
  ] as const;
  return (
    <div className="site-dna-suitability">
      <section className="site-dna-panel site-dna-reason">
        <h2>Compatibility reasoning</h2>
        {panels.map(([kind, title, notes]) => (
          <div key={kind} data-kind={kind}>
            <h3>{title}</h3>
            {notes.slice(0, 3).map((note) => (
              <article key={`${note.title}-${note.criterionId ?? "none"}`} data-active={note.criterionId !== null && note.criterionId === activeId || undefined}>
                {note.criterionId ? <button type="button" onClick={() => onActive(note.criterionId!)}>{note.title}</button> : <b>{note.title}</b>}
                <p>{note.text}</p>
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
