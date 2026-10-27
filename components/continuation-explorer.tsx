"use client";

import { useMemo } from "react";
import {
  branchEmphasis,
  type ContinuationFocus,
  type EmphasisFamily,
  type EmphasisSchedule,
} from "@/lib/skill3/emphasis-schedule";

const GROUPS: readonly { focus: ContinuationFocus; label: string; start: number; end: number }[] = [
  { focus: "formal", label: "Formal", start: 1, end: 3 },
  { focus: "spatial", label: "Spatial", start: 4, end: 6 },
  { focus: "atmospheric", label: "Atmospheric", start: 7, end: 9 },
  { focus: "formal+spatial", label: "Formal + Spatial", start: 10, end: 12 },
  { focus: "formal+atmospheric", label: "Formal + Atmospheric", start: 13, end: 15 },
  { focus: "spatial+atmospheric", label: "Spatial + Atmospheric", start: 16, end: 18 },
  { focus: "formal+spatial+atmospheric", label: "All Three", start: 19, end: 24 },
];

const FAMILY_LABEL: Record<EmphasisFamily, string> = {
  formal: "Formal",
  spatial: "Spatial",
  atmospheric: "Atmospheric",
};

function continuationId(index: number) {
  return `N${String(index).padStart(2, "0")}`;
}

function branchNumber(id: string | null) {
  if (!id || !/^N\d{2}$/.test(id)) return null;
  return Number(id.slice(1));
}

function groupFor(id: string | null) {
  const number = branchNumber(id);
  if (number == null) return null;
  return GROUPS.find((group) => number >= group.start && number <= group.end) ?? null;
}

export function ContinuationExplorer({
  activeId,
  officialId,
  extendedId = null,
  onSelect,
  showSchedule = false,
}: {
  activeId: string | null;
  officialId: string | null;
  /** Official continuation outside N01–N24. Shown as its own marker, without an invented recipe. */
  extendedId?: string | null;
  onSelect: (id: string) => void;
  showSchedule?: boolean;
}) {
  const order = useMemo(() => {
    const ids = GROUPS.flatMap((group) => Array.from({ length: group.end - group.start + 1 }, (_, index) => continuationId(group.start + index)));
    if (extendedId && !ids.includes(extendedId)) ids.push(extendedId);
    return ids;
  }, [extendedId]);
  const index = activeId ? order.indexOf(activeId) : -1;
  const group = groupFor(activeId);
  const extended = Boolean(activeId && extendedId && activeId === extendedId);
  const headline = extended ? "Extended" : group?.label ?? "Continuation";
  const branch = branchEmphasis(branchNumber(activeId) ?? 0);
  const schedule = !extended && branch && branch.id === activeId ? branch : null;
  const exploring = Boolean(activeId && officialId && activeId !== officialId);

  const step = (direction: -1 | 1) => {
    if (index < 0) {
      const fallback = officialId && order.includes(officialId) ? officialId : order[0];
      if (fallback) onSelect(fallback);
      return;
    }
    const next = order[index + direction];
    if (next) onSelect(next);
  };

  return (
    <div
      className="continuation-explorer"
      data-stance={exploring ? "alternate" : "final"}
      data-compact={showSchedule ? "false" : "true"}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        }
      }}
    >
      <div className="continuation-steer">
        <button type="button" aria-label="Previous continuation" onClick={() => step(-1)} disabled={index <= 0}>←</button>
        <p className="continuation-name"><strong>{activeId ?? "—"}</strong><span>/ {headline}</span></p>
        <button type="button" aria-label="Next continuation" onClick={() => step(1)} disabled={index < 0 || index >= order.length - 1}>→</button>
      </div>
      {showSchedule ? null : (
        <p className="continuation-index">
          {extended ? `Continuation ${activeId} · outside 01–24` : index >= 0 ? `Continuation ${index + 1} of 24` : "Continuation"}
        </p>
      )}
      <div className="continuation-strip" role="listbox" aria-label="Descriptor continuations">
        {GROUPS.map((item) => (
          <div key={item.focus} className="continuation-group" role="group" aria-label={`${item.label}, ${continuationId(item.start)} to ${continuationId(item.end)}`}>
            {Array.from({ length: item.end - item.start + 1 }, (_, offset) => {
              const id = continuationId(item.start + offset);
              return (
                <button
                  key={id}
                  type="button"
                  className="continuation-marker"
                  role="option"
                  aria-selected={id === activeId}
                  aria-label={`${id}, ${item.label}${id === officialId ? ", final selected" : ""}`}
                  data-active={id === activeId ? "true" : "false"}
                  data-official={id === officialId ? "true" : "false"}
                  onClick={() => onSelect(id)}
                />
              );
            })}
          </div>
        ))}
        {extendedId && !GROUPS.some((item) => {
          const number = branchNumber(extendedId);
          return number != null && number >= item.start && number <= item.end;
        }) ? (
          <div className="continuation-group continuation-group-extended" role="group" aria-label={`${extendedId}, extended continuation`}>
            <button
              type="button"
              className="continuation-marker"
              role="option"
              aria-selected={extendedId === activeId}
              aria-label={`${extendedId}, extended continuation, no descriptor recipe${extendedId === officialId ? ", final selected" : ""}`}
              data-active={extendedId === activeId ? "true" : "false"}
              data-official={extendedId === officialId ? "true" : "false"}
              onClick={() => onSelect(extendedId)}
            />
          </div>
        ) : null}
      </div>
      {showSchedule ? (
        exploring ? (
          <div className="continuation-stance">
            <button type="button" onClick={() => officialId && onSelect(officialId)}>Reset to final</button>
          </div>
        ) : null
      ) : (
        <div className="continuation-stance">
          <p>{exploring ? "Exploring alternative" : "Final selected"}</p>
          <button type="button" onClick={() => officialId && onSelect(officialId)} disabled={!exploring}>Reset to final</button>
        </div>
      )}
      {showSchedule ? (
        schedule ? (
          <EmphasisChart schedule={schedule.schedule} families={schedule.families} />
        ) : (
          <details className="continuation-technical">
            <summary>Technical details</summary>
            <p>Extended continuation. No descriptor-focus recipe.</p>
          </details>
        )
      ) : null}
    </div>
  );
}

function EmphasisChart({
  schedule,
  families,
}: {
  schedule: EmphasisSchedule;
  families: readonly EmphasisFamily[];
}) {
  const rows: readonly EmphasisFamily[] = ["formal", "spatial", "atmospheric"];
  return (
    <figure className="emphasis-schedule" aria-label="Descriptor influence">
      <ol>
        {rows.map((family) => {
          const targets = schedule[family];
          const focused = families.includes(family);
          return (
            <li key={family} data-focus={focused ? "true" : "false"}>
              <span>{FAMILY_LABEL[family]}</span>
              <span className="emphasis-phases" aria-label={targets.map((value, index) => `phase ${index + 1} ${value.toFixed(2)}`).join(", ")}>
                {targets.map((value, index) => (
                  <i key={index} style={{ height: `${Math.max(18, Math.round((value / 1.6) * 100))}%` }} />
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
