"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { PlaceholderMorphology } from "@/components/final-placeholder-morphology";
import { ProcessMorphology } from "@/components/vertical-process-stage";
import type { NaturalContinuation } from "@/lib/skill3/continuations";
import { readSkill2Selections, type Skill2Selection, type Skill2Selections } from "@/lib/skill2/published-selection";
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
  return <PlaceholderMorphology id={id} />;
}

export function FinalMorphologyCatalogue({ fixture }: { fixture: boolean }) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const rows = ROWS.map((row) => ({ ...row, slots: slotsFor(row) }));
  const [indexes, setIndexes] = useState<Record<RowId, number>>({ lobby: 2, workspace: 2, gathering: 2 });
  const [focus, setFocus] = useState<Focus>({ row: "lobby", index: 2 });
  const [collection, setCollection] = useState<SelectedSkill3Collection>({});
  const [skill2Selections, setSkill2Selections] = useState<Skill2Selections>({});
  const [fields, setFields] = useState<Record<string, VerticalViewerField | null>>({});
  const [triangles, setTriangles] = useState<Record<string, number | null>>({});
  const reportTriangles = useCallback((archetypeId: string, count: number | null) => {
    setTriangles((current) => current[archetypeId] === count ? current : { ...current, [archetypeId]: count });
  }, []);

  useEffect(() => {
    const origin = preview ? "provisional" : fixture ? "development-fixture" : "handoff";
    setCollection(readSelectedSkill3Collection(origin));
    setSkill2Selections(readSkill2Selections());
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
  const focusInput = match ? null : focusSlot ? skill2Selections[focusSlot.id] ?? null : null;
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
            skill2Selections={skill2Selections}
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
        skill2Input={focusInput}
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
      <h1 className="display">Final Morphology Catalogue</h1>
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
  index: _index,
  focused: _focused,
  collection,
  skill2Selections,
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
  skill2Selections: Skill2Selections;
  fields: Record<string, VerticalViewerField | null>;
  onTriangles: (archetypeId: string, count: number | null) => void;
  onChoose: (index: number) => void;
}) {
  return (
    <section className="final-row" data-tone={rowId} aria-label={label}>
      <div className="final-stage">
        <p className="final-row-name">{label}</p>
        <span className="final-platform" aria-hidden="true" />
        {slots.map((slot, slotIndex) => {
          const selection = collection[slot.id] ?? null;
          const skill2Input = selection ? null : skill2Selections[slot.id] ?? null;
          const field = selection ? fields[slot.id] ?? null : null;
          const lift = [9, 3.5, 0, 3.5, 9][slotIndex] ?? 0;
          return (
            <button
              key={slot.id}
              type="button"
              className="final-item"
              data-selected={selection ? "true" : undefined}
              data-skill2={skill2Input ? "awaiting" : undefined}
              data-geometry={field ? "real" : "placeholder"}
              style={{
                ["--slot" as string]: String(slotIndex),
                ["--lift" as string]: `${lift}%`,
              }}
              onClick={() => onChoose(slotIndex)}
              aria-label={skill2Input ? `${slot.name}. Skill 2 input awaiting vertical propagation` : slot.name}
            >
              <span className="final-item-label">
                <small>{archetypeCode(rowId, slotIndex)}</small>
              </span>
              {field && selection ? (
                <SlotMesh selection={selection} field={field} onTriangles={onTriangles} />
              ) : (
                <ModuleMark id={slot.id} />
              )}
              <span className="final-plinth" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Detail({
  slot,
  code,
  selection,
  skill2Input,
  field,
  triangles,
  onTriangles,
}: {
  slot: Slot | undefined;
  code: string;
  selection: SelectedSkill3Morphology | null;
  skill2Input: Skill2Selection | null;
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
      <p className="final-detail-status" data-selected={selection ? "true" : undefined}>
        {selection ? "Selected final morphology" : skill2Input ? "Selected Skill 2 input awaiting vertical propagation" : "Awaiting selection"}
      </p>
      <dl>
        {[
          ["Archetype", slot.id],
          ["Continuation", selection?.continuationId ?? "—"],
          ["Candidate", selection ? String(selection.candidateId) : skill2Input ? String(skill2Input.candidateId) : "—"],
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
