"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { ProcessMorphology } from "@/components/vertical-process-stage";
import type { NaturalContinuation } from "@/lib/skill3/continuations";
import {
  readSelectedSkill3Collection,
  sameSelectedMorphology,
  type SelectedSkill3Collection,
  type SelectedSkill3Morphology,
} from "@/lib/skill3/morphology-selection";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

const ROWS = [
  {
    id: "lobby",
    label: "Lobby",
    ids: ["vertical-void", "compressed-sequential", "continuous-hall", "topographic-ground-field", "linear-gallery"],
  },
  {
    id: "workspace",
    label: "Workspace",
    ids: ["open-hall", "terraced", "flat-deep-plan", "void-edge", "undulated"],
  },
  {
    id: "gathering",
    label: "Gathering",
    ids: ["stepped-amphitheater", "void-field", "inserted-horizontal-plate", "contained-room-within-volume", "linear-edge-gallery"],
  },
] as const;

type RowId = (typeof ROWS)[number]["id"];

type Slot = {
  id: string;
  name: string;
  typologyId: string;
  typology: string;
};

type Focus = { row: RowId; index: number };

const TYPOLOGY: Record<string, string> = {
  lobby: "Lobby",
  workspace: "Workspace",
  gathering: "Gathering",
};

function archetypeCode(rowId: RowId, index: number) {
  const prefix = rowId === "lobby" ? "L" : rowId === "workspace" ? "W" : "G";
  return `${prefix}${String(index + 1).padStart(2, "0")}`;
}

function slotsFor(row: (typeof ROWS)[number]): Slot[] {
  return row.ids.flatMap((id) => {
    const archetype = Object.values(ARCHETYPES).find((item) => item.id === id);
    if (!archetype) return [];
    return [{ id: archetype.id, name: archetype.name, typologyId: archetype.typologyId, typology: TYPOLOGY[archetype.typologyId] ?? archetype.typologyId }];
  });
}

function ModuleMark({ id }: { id: string }) {
  const n = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const half = 16 + (n % 5) * 5;
  const depth = 10 + (n % 4) * 4;
  const height = 22 + (n % 6) * 6;
  const cut = 8 + (n % 3) * 6;
  const left = 60 - half;
  const right = 60 + half;
  const front = 78;
  const back = front - depth;
  const top = back - height;
  return (
    <svg className="final-mark" viewBox="0 0 120 104" aria-hidden="true">
      <path d={`M60 ${front + 8} L${left} ${back} L60 ${back - depth} L${right} ${back} Z`} />
      <path d={`M${left} ${back} L${left} ${top} L60 ${top - depth} L60 ${back - depth}`} />
      <path d={`M${right} ${back} L${right} ${top} L60 ${top - depth}`} />
      <path d={`M${left + cut} ${top + height * 0.45} L${right - cut} ${top + height * 0.45}`} />
      <path d={`M60 ${top - depth} L60 ${top - depth - (n % 5) * 2}`} />
    </svg>
  );
}

export function FinalMorphologyCatalogue({ fixture }: { fixture: boolean }) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const rows = ROWS.map((row) => ({ ...row, slots: slotsFor(row) }));
  const [indexes, setIndexes] = useState<Record<RowId, number>>({ lobby: 2, workspace: 2, gathering: 2 });
  const [focus, setFocus] = useState<Focus>({ row: "lobby", index: 2 });
  const [collection, setCollection] = useState<SelectedSkill3Collection>({});
  const [fields, setFields] = useState<Record<string, VerticalViewerField | null>>({});
  const [triangles, setTriangles] = useState<Record<string, number | null>>({});
  const reportTriangles = useCallback((archetypeId: string, count: number | null) => {
    setTriangles((current) => current[archetypeId] === count ? current : { ...current, [archetypeId]: count });
  }, []);

  useEffect(() => {
    const origin = preview ? "provisional" : fixture ? "development-fixture" : "handoff";
    setCollection(readSelectedSkill3Collection(origin));
    if (preview) {
      setIndexes((current) => ({ ...current, workspace: 0 }));
      setFocus({ row: "workspace", index: 0 });
    }
  }, [fixture, preview]);

  useEffect(() => {
    const selections = Object.values(collection);
    let cancel = false;
    const controller = new AbortController();
    const apply = (next: Record<string, VerticalViewerField | null>) => {
      if (!cancel) setFields(next);
    };
    if (selections.length === 0) {
      apply({});
      return () => {
        cancel = true;
      };
    }
    const next: Record<string, VerticalViewerField | null> = {};
    void Promise.all(selections.map(async (selection) => {
      next[selection.archetypeId] = await loadCachedField(selection, controller.signal, preview ? "provisional" : fixture ? "fixture" : "handoff");
    })).then(() => apply(next));
    return () => {
      cancel = true;
      controller.abort();
    };
  }, [collection, fixture, preview]);

  const focusRow = rows.find((row) => row.id === focus.row) ?? rows[0];
  const focusSlot = focusRow.slots[focus.index] ?? focusRow.slots[0];
  const match = focusSlot ? collection[focusSlot.id] ?? null : null;
  const selectedCount = rows.reduce((sum, row) => sum + row.slots.filter((slot) => collection[slot.id]).length, 0);
  const focusField = focusSlot ? fields[focusSlot.id] ?? null : null;
  const focusCode = focusSlot ? archetypeCode(focus.row, focus.index) : "";

  const choose = (row: RowId, index: number) => {
    setIndexes((current) => ({ ...current, [row]: index }));
    setFocus({ row, index });
  };

  return (
    <main className="final-catalogue">
      <Summary rows={rows} collection={collection} selectedCount={selectedCount} preview={preview} />
      <div className="final-rows">
        {rows.map((row) => (
          <TypologyBand
            key={row.id}
            rowId={row.id}
            label={row.label}
            slots={row.slots}
            index={indexes[row.id]}
            focused={focus.row === row.id}
            collection={collection}
            fields={fields}
            onTriangles={reportTriangles}
            onChoose={(index) => choose(row.id, index)}
          />
        ))}
      </div>
      <Detail
        slot={focusSlot}
        code={focusCode}
        selection={match}
        field={focusField}
        triangles={match && focusField ? triangles[match.archetypeId] ?? null : null}
        onTriangles={reportTriangles}
      />
    </main>
  );
}

function Summary({
  rows,
  collection,
  selectedCount,
  preview,
}: {
  rows: { id: RowId; label: string; slots: Slot[] }[];
  collection: SelectedSkill3Collection;
  selectedCount: number;
  preview: boolean;
}) {
  return (
    <aside className="final-summary">
      <p className="eyebrow">{preview ? "Provisional preview" : "Curated morphology archive"}</p>
      <p className="final-summary-lead">One selected morphology per archetype</p>
      <p className="final-summary-count">
        <strong>{String(selectedCount).padStart(2, "0")}</strong>
        <span>/ 15</span>
      </p>
      <p className="final-summary-state">{selectedCount === rows.reduce((sum, row) => sum + row.slots.length, 0) ? "Collection complete" : "Collection in progress"}</p>
      <p className="eyebrow">Typologies</p>
      <ul>
        {rows.map((row) => {
          const count = row.slots.filter((slot) => collection[slot.id]).length;
          return (
            <li key={row.id} data-tone={row.id}>
              <span aria-hidden="true" />
              {row.label}
              <b>{count} / {row.slots.length}</b>
            </li>
          );
        })}
      </ul>
      <svg className="final-summary-mark" viewBox="0 0 88 46" aria-hidden="true">
        <ellipse cx="44" cy="38" rx="36" ry="10" />
        <ellipse cx="44" cy="32" rx="26" ry="8" />
        <ellipse cx="44" cy="26" rx="16" ry="6" />
      </svg>
    </aside>
  );
}

function TypologyBand({
  rowId,
  label,
  slots,
  index,
  focused,
  collection,
  fields,
  onTriangles,
  onChoose,
}: {
  rowId: RowId;
  label: string;
  slots: Slot[];
  index: number;
  focused: boolean;
  collection: SelectedSkill3Collection;
  fields: Record<string, VerticalViewerField | null>;
  onTriangles: (archetypeId: string, count: number | null) => void;
  onChoose: (index: number) => void;
}) {
  const shift = (direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= slots.length) return;
    onChoose(next);
  };

  return (
    <section className="final-row" data-tone={rowId} data-focused={focused || undefined} aria-label={label}>
      <div className="final-band">
        <button type="button" className="final-nudge" onClick={() => shift(-1)} disabled={index === 0} aria-label={`Previous ${label} morphology`}>
          ‹
        </button>
        <div className="final-stage">
          <p className="final-row-name">{label}</p>
          <span className="final-rail" aria-hidden="true" />
          {slots.map((slot, slotIndex) => {
            const offset = slotIndex - index;
            const abs = Math.abs(offset);
            const selection = collection[slot.id] ?? null;
            const field = fields[slot.id] ?? null;
            return (
              <button
                key={slot.id}
                type="button"
                className="final-item"
                data-center={offset === 0 || undefined}
                data-selected={selection ? "true" : undefined}
                data-geometry={field ? "real" : "placeholder"}
                style={{
                  ["--offset" as string]: String(offset),
                  ["--abs" as string]: String(abs),
                  ["--scale" as string]: abs === 0 ? "1" : abs === 1 ? "0.86" : "0.72",
                  zIndex: 8 - abs,
                }}
                onClick={() => onChoose(slotIndex)}
                aria-current={offset === 0 ? "true" : undefined}
                aria-label={slot.name}
              >
                <span className="final-item-label">
                  <small>{archetypeCode(rowId, slotIndex)}</small>
                  {slot.name}
                </span>
                {field && selection ? (
                  <SlotMesh selection={selection} field={field} orbit={offset === 0} onTriangles={onTriangles} />
                ) : (
                  <ModuleMark id={slot.id} />
                )}
                <span className="final-plinth" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <button type="button" className="final-nudge" onClick={() => shift(1)} disabled={index === slots.length - 1} aria-label={`Next ${label} morphology`}>
          ›
        </button>
      </div>
    </section>
  );
}

function Detail({
  slot,
  code,
  selection,
  field,
  triangles,
  onTriangles,
}: {
  slot: Slot | undefined;
  code: string;
  selection: SelectedSkill3Morphology | null;
  field: VerticalViewerField | null;
  triangles: number | null;
  onTriangles: (archetypeId: string, count: number | null) => void;
}) {
  if (!slot) return null;
  const samples = selection?.acceptedIterations.length ?? null;
  const events = samples == null ? null : Math.max(0, samples - 1);
  const envelope = selection?.rules.envelope;
  return (
    <aside className="final-detail" data-tone={slot.typologyId} aria-live="polite">
      <p className="eyebrow">{code} · {slot.typology}</p>
      <h2 className="panel-title">{slot.name}</h2>
      <div className="final-detail-preview" data-geometry={field ? "real" : "placeholder"}>
        {field && selection ? (
          <SlotMesh selection={selection} field={field} orbit onTriangles={onTriangles} />
        ) : (
          <ModuleMark id={slot.id} />
        )}
      </div>
      <p className="final-detail-status" data-selected={selection ? "true" : undefined}>{selection ? "Selected final morphology" : "Awaiting selection"}</p>
      <dl>
        {[
          ["Archetype", slot.id],
          ["Continuation", selection?.continuationId ?? "—"],
          ["Candidate", selection ? String(selection.candidateId) : "—"],
          ["Branch", selection ? String(selection.branchIndex) : "—"],
          ["Samples", samples == null ? "—" : String(samples)],
          ["Events", events == null ? "—" : String(events)],
          ["Module", envelope ? `${envelope.sizeX}×${envelope.sizeY}×${envelope.sizeZ}` : "—"],
          ["Mode", selection?.rules.morphology ?? "—"],
          ["Triangles", triangles != null ? String(triangles) : "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function SlotMesh({
  selection,
  field,
  orbit = false,
  onTriangles,
}: {
  selection: SelectedSkill3Morphology;
  field: VerticalViewerField;
  orbit?: boolean;
  onTriangles: (archetypeId: string, count: number | null) => void;
}) {
  const report = useCallback((count: number | null) => {
    onTriangles(selection.archetypeId, count);
  }, [onTriangles, selection.archetypeId]);
  return (
    <span className="final-mesh" aria-hidden="true">
      <ProcessMorphology
        field={field}
        float
        orbit={orbit}
        cacheIdentity={`${selection.origin}:${selection.archetypeId}:${selection.candidateId}:${selection.continuationId}:${selection.parentChecksum}`}
        onTriangles={report}
      />
    </span>
  );
}

async function loadCachedField(
  selection: SelectedSkill3Morphology,
  signal: AbortSignal,
  source: "handoff" | "fixture" | "provisional",
): Promise<VerticalViewerField | null> {
  const params = new URLSearchParams({
    continuation: selection.continuationId,
  });
  if (source === "fixture") params.set("fixture", "1");
  else {
    params.set("cache", "1");
    params.set("archetype", selection.archetypeId);
    params.set("candidate", String(selection.candidateId));
    if (source === "provisional") params.set("preview", "1");
  }
  try {
    const response = await fetch(`/api/vertical?${params}`, { signal });
    if (!response.ok) return null;
    const body = await response.json() as { continuation?: NaturalContinuation };
    const continuation = body.continuation;
    if (!continuation?.field || !sameSelectedMorphology(selection, continuation)) return null;
    if (source === "fixture" && continuation.archetypeId !== selection.archetypeId) return null;
    return continuation.field;
  } catch {
    return null;
  }
}
