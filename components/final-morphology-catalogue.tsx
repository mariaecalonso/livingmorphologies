"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PRESENTATION_ARCHETYPE, PRESENTATION_CANDIDATE, presentationBundleUrl } from "@/lib/presentation/demo";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { FinalOrthographicViews } from "@/components/final-orthographic-drawing";
import { PlaceholderMorphology } from "@/components/final-placeholder-morphology";
import { ProcessMorphology } from "@/components/vertical-process-stage";
import type { NaturalContinuation, NaturalContinuationSet } from "@/lib/skill3/continuations";
import { representativeContinuations } from "@/lib/skill3/representatives";
import { readSkill2Selections, type Skill2Selection, type Skill2Selections } from "@/lib/skill2/published-selection";
import {
  readSelectedSkill3Collection,
  sameSelectedMorphology,
  selectedMorphologyFrom,
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

const CAROUSEL_PLACES = ["front-center", "front-right", "back-right", "back-left", "front-left"] as const;

function carouselPlace(slotIndex: number, selectedIndex: number) {
  return CAROUSEL_PLACES[(slotIndex - selectedIndex + CAROUSEL_PLACES.length) % CAROUSEL_PLACES.length];
}

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

function ModuleMark({ id, spin = false }: { id: string; spin?: boolean }) {
  return <PlaceholderMorphology id={id} spin={spin} />;
}

const DRAWING_TONE: Record<RowId, string> = {
  lobby: "#c77e5f",
  workspace: "#f2f2ee",
  gathering: "#7db8b8",
};

const ROW_SUBTITLE: Record<RowId, string> = {
  lobby: "Public Interface + Transition",
  workspace: "Productive Environments",
  gathering: "Social Nodes + Collective Space",
};

const TURN_SECONDS = 48;

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
    const stored = readSelectedSkill3Collection(origin);
    setSkill2Selections(readSkill2Selections());
    if (preview) {
      setIndexes((current) => ({ ...current, workspace: 0 }));
      setFocus({ row: "workspace", index: 0 });
    }
    if (stored[PRESENTATION_ARCHETYPE] || preview || fixture) {
      setCollection(stored);
      return;
    }
    const bundleUrl = presentationBundleUrl(PRESENTATION_ARCHETYPE, PRESENTATION_CANDIDATE);
    if (!bundleUrl) {
      setCollection(stored);
      return;
    }
    let cancel = false;
    void fetch(bundleUrl)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { continuations?: Array<Omit<NaturalContinuation, "field">>; fields?: VerticalViewerField[] } | null) => {
        if (cancel || !body?.continuations || !body.fields) {
          if (!cancel) setCollection(stored);
          return;
        }
        const set = {
          ...body,
          continuations: body.continuations.map((continuation, index) => ({
            ...continuation,
            field: body.fields?.[index],
          })),
        } as NaturalContinuationSet;
        const chosen = representativeContinuations(set.continuations, 1)[0] ?? set.continuations[0];
        if (!chosen) {
          setCollection(stored);
          return;
        }
        const morphology = selectedMorphologyFrom(set, chosen);
        setCollection({ ...stored, [morphology.archetypeId]: morphology });
      })
      .catch(() => {
        if (!cancel) setCollection(stored);
      });
    return () => {
      cancel = true;
    };
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
      <Summary rows={rows} collection={collection} indexes={indexes} selectedCount={selectedCount} preview={preview} />
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
      />
    </main>
  );
}

function Summary({
  rows,
  collection,
  indexes,
  selectedCount,
  preview,
}: {
  rows: { id: RowId; label: string; slots: Slot[] }[];
  collection: SelectedSkill3Collection;
  indexes: Record<RowId, number>;
  selectedCount: number;
  preview: boolean;
}) {
  return (
    <aside className="final-summary">
      <div className="final-summary-head">
        <p className="eyebrow">{preview ? "Provisional preview" : "Curated morphology archive"}</p>
        <h1 className="display">Final Morphology Catalogue</h1>
        <p className="final-summary-lead">One selected morphology per archetype</p>
      </div>
      <div className="final-summary-meter">
        <p className="final-summary-count">
          <strong>{String(selectedCount).padStart(2, "0")}</strong>
          <span>/ 15</span>
        </p>
        <p className="final-summary-state">{selectedCount === rows.reduce((sum, row) => sum + row.slots.length, 0) ? "Collection complete" : "Collection in progress"}</p>
      </div>
      <div className="final-summary-types">
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
      </div>
      <figure className="final-index" aria-label="Fifteen morphologies, five in each typology">
        {rows.map((row) => (
          <div key={row.id} data-tone={row.id}>
            {row.slots.map((slot, index) => (
              <span
                key={slot.id}
                data-place={carouselPlace(index, indexes[row.id])}
                data-selected={collection[slot.id] ? "true" : undefined}
                title={`${archetypeCode(row.id, index)} ${slot.name}`}
              />
            ))}
          </div>
        ))}
      </figure>
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
    <section className="final-row" data-tone={rowId} data-focused={focused ? "true" : undefined} aria-label={label}>
      <div className="final-stage">
        <p className="final-row-name">
          <strong>{label}</strong>
          <span>{ROW_SUBTITLE[rowId]}</span>
        </p>
        <span className="final-platform" aria-hidden="true" />
        {slots.map((slot, slotIndex) => {
          const selection = collection[slot.id] ?? null;
          const skill2Input = selection ? null : skill2Selections[slot.id] ?? null;
          const field = selection ? fields[slot.id] ?? null : null;
          const place = carouselPlace(slotIndex, index);
          return (
            <button
              key={slot.id}
              type="button"
              className="final-item"
              data-place={place}
              data-selected={selection ? "true" : undefined}
              data-skill2={skill2Input ? "awaiting" : undefined}
              data-geometry={field ? "real" : "placeholder"}
              aria-current={place === "front-center" ? "true" : undefined}
              onClick={() => onChoose(slotIndex)}
              aria-label={skill2Input ? `${slot.name}. Skill 2 input awaiting vertical propagation` : slot.name}
            >
              <span className="final-item-label">
                <small>{archetypeCode(rowId, slotIndex)}</small>
                <b>{slot.name}</b>
              </span>
              {field && selection ? (
                <SlotMesh
                  selection={selection}
                  field={field}
                  orbit={place === "front-center"}
                  onTriangles={onTriangles}
                />
              ) : (
                <ModuleMark id={slot.id} spin={place === "front-center"} />
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
}: {
  slot: Slot | undefined;
  code: string;
  selection: SelectedSkill3Morphology | null;
  skill2Input: Skill2Selection | null;
  field: VerticalViewerField | null;
  triangles: number | null;
}) {
  if (!slot) return null;
  const samples = selection?.acceptedIterations.length ?? null;
  const envelope = selection?.rules.envelope;
  return (
    <aside className="final-detail" data-tone={slot.typologyId} aria-live="polite">
      <p className="eyebrow">{code} · {slot.typology}</p>
      <h2 className="panel-title">{slot.name}</h2>
      <FinalOrthographicViews
        field={field}
        cacheIdentity={selection ? `${selection.origin}:${selection.archetypeId}:${selection.candidateId}:${selection.continuationId}:${selection.parentChecksum}` : null}
        placeholderId={slot.id}
        accent={DRAWING_TONE[slot.typologyId as RowId] ?? "#f2f2ee"}
      />
      <p className="final-detail-status" data-selected={selection ? "true" : undefined}>
        {selection ? "Selected final morphology" : skill2Input ? "Selected Skill 2 input awaiting vertical propagation" : "Awaiting selection"}
      </p>
      <dl>
        {[
          ["Archetype", slot.id],
          ["Candidate", selection ? String(selection.candidateId) : skill2Input ? String(skill2Input.candidateId) : "—"],
          ["Continuation", selection?.continuationId ?? "—"],
          ["Branch", selection ? String(selection.branchIndex) : "—"],
          ["Samples", samples == null ? "—" : String(samples)],
          ["Module", envelope ? `${envelope.sizeX}×${envelope.sizeY}×${envelope.sizeZ}` : "—"],
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
        turnSeconds={TURN_SECONDS}
        cacheIdentity={`${selection.origin}:${selection.archetypeId}:${selection.candidateId}:${selection.continuationId}:${selection.parentChecksum}:refined`}
        onTriangles={report}
        refine
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
    const bundleUrl = presentationBundleUrl(selection.archetypeId, selection.candidateId);
    if (!bundleUrl || source === "fixture") return null;
    const response = await fetch(bundleUrl, { signal });
    if (!response.ok) return null;
    const body = await response.json() as {
      continuations?: Array<Omit<NaturalContinuation, "field">>;
      fields?: VerticalViewerField[];
    };
    const index = body.continuations?.findIndex((item) => item.id === selection.continuationId) ?? -1;
    const meta = index >= 0 ? body.continuations?.[index] : null;
    const field = index >= 0 ? body.fields?.[index] : null;
    if (!meta || !field) return null;
    const continuation = { ...meta, field };
    if (!sameSelectedMorphology(selection, continuation)) return null;
    return continuation.field;
  } catch {
    return null;
  }
}
