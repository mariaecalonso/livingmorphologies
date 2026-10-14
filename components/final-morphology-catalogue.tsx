"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { FinalOrthographicViews } from "@/components/final-orthographic-drawing";
import { PlaceholderMorphology } from "@/components/final-placeholder-morphology";
import { ProcessMorphology } from "@/components/vertical-process-stage";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { NaturalContinuation } from "@/lib/skill3/continuations";
import { readSkill2Selections, type Skill2Selection, type Skill2Selections } from "@/lib/skill2/published-selection";
import { decodeSolidifiedMesh, solidifiedModuleId, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
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

export type FinalArchiveHandoff = {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  moduleId: string;
  status: "validated" | "review";
};

type SolidifiedStatus = "validated" | "review";

type SolidifiedPick = {
  moduleId: string;
  status: SolidifiedStatus;
  mesh: IsoMesh;
};

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

export function FinalMorphologyCatalogue({ fixture, handoff = [] }: { fixture: boolean; handoff?: FinalArchiveHandoff[] }) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const rows = ROWS.map((row) => ({ ...row, slots: slotsFor(row) }));
  const [indexes, setIndexes] = useState<Record<RowId, number>>({ lobby: 2, workspace: 2, gathering: 2 });
  const [focus, setFocus] = useState<Focus>({ row: "lobby", index: 2 });
  const [collection, setCollection] = useState<SelectedSkill3Collection>({});
  const [skill2Selections, setSkill2Selections] = useState<Skill2Selections>({});
  const [fields, setFields] = useState<Record<string, VerticalViewerField | null>>({});
  const [picks, setPicks] = useState<Record<string, SolidifiedPick | null>>({});
  const [triangles, setTriangles] = useState<Record<string, number | null>>({});
  const reportTriangles = useCallback((archetypeId: string, count: number | null) => {
    setTriangles((current) => current[archetypeId] === count ? current : { ...current, [archetypeId]: count });
  }, []);

  useEffect(() => {
    const origin = preview ? "provisional" : fixture ? "development-fixture" : "handoff";
    const read = () => {
      setCollection(readSelectedSkill3Collection(origin));
      setSkill2Selections(readSkill2Selections());
    };
    read();
    if (preview) {
      setIndexes((current) => ({ ...current, workspace: 0 }));
      setFocus({ row: "workspace", index: 0 });
    }
    const onShow = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", read);
    window.addEventListener("storage", read);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", read);
      window.removeEventListener("storage", read);
    };
  }, [fixture, preview]);

  const tracked = preview || fixture ? [] : handoff;
  const sourceFor = useCallback((archetypeId: string) => {
    return collection[archetypeId] ?? tracked.find((entry) => entry.archetypeId === archetypeId) ?? null;
  }, [collection, tracked]);

  useEffect(() => {
    const selections = Object.values(collection);
    const sources: { archetypeId: string; candidateId: number; continuationId: string }[] = [];
    for (const row of ROWS) {
      for (const archetypeId of row.ids) {
        const saved = collection[archetypeId];
        if (saved) sources.push(saved);
        else if (!preview && !fixture) {
          const entry = handoff.find((item) => item.archetypeId === archetypeId);
          if (entry) sources.push(entry);
        }
      }
    }
    let cancel = false;
    const controller = new AbortController();
    const apply = (next: Record<string, VerticalViewerField | null>) => {
      if (!cancel) setFields(next);
    };
    if (sources.length === 0) {
      apply({});
      if (!cancel) setPicks({});
      return () => {
        cancel = true;
      };
    }
    const production = !preview && !fixture;
    if (production) {
      setFields({});
      const next: Record<string, SolidifiedPick | null> = {};
      void Promise.all(sources.map(async (selection) => {
        next[selection.archetypeId] = await loadSolidifiedPick(selection, controller.signal);
      })).then(() => {
        if (!cancel) setPicks(next);
      });
      return () => {
        cancel = true;
        controller.abort();
      };
    }
    setPicks({});
    const next: Record<string, VerticalViewerField | null> = {};
    void Promise.all(selections.map(async (selection) => {
      next[selection.archetypeId] = await loadCachedField(selection, controller.signal, preview ? "provisional" : "fixture");
    })).then(() => apply(next));
    return () => {
      cancel = true;
      controller.abort();
    };
  }, [collection, fixture, preview, handoff]);

  const focusRow = rows.find((row) => row.id === focus.row) ?? rows[0];
  const focusSlot = focusRow.slots[focus.index] ?? focusRow.slots[0];
  const match = focusSlot ? collection[focusSlot.id] ?? null : null;
  const focusHandoff = focusSlot && !match ? tracked.find((entry) => entry.archetypeId === focusSlot.id) ?? null : null;
  const focusSource = match ?? focusHandoff;
  const focusInput = focusSource ? null : focusSlot ? skill2Selections[focusSlot.id] ?? null : null;
  const selectedCount = rows.reduce((sum, row) => sum + row.slots.filter((slot) => sourceFor(slot.id)).length, 0);
  const focusPick = pickFor(focusSource, picks);
  const focusField = focusSlot && !focusPick ? fields[focusSlot.id] ?? null : null;
  const focusCode = focusSlot ? archetypeCode(focus.row, focus.index) : "";

  const choose = (row: RowId, index: number) => {
    setIndexes((current) => ({ ...current, [row]: index }));
    setFocus({ row, index });
  };

  return (
    <main className="final-catalogue">
      <Summary rows={rows} occupied={(id) => Boolean(sourceFor(id))} indexes={indexes} selectedCount={selectedCount} preview={preview} />
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
            handoff={tracked}
            skill2Selections={skill2Selections}
            fields={fields}
            picks={picks}
            onTriangles={reportTriangles}
            onChoose={(index) => choose(row.id, index)}
          />
        ))}
      </div>
      <Detail
        slot={focusSlot}
        code={focusCode}
        selection={match}
        handoff={focusHandoff}
        skill2Input={focusInput}
        field={focusField}
        pick={focusPick}
        triangles={focusSource && (focusPick || focusField) ? triangles[focusSource.archetypeId] ?? focusPick?.mesh.triangles ?? null : null}
      />
    </main>
  );
}

function Summary({
  rows,
  occupied,
  indexes,
  selectedCount,
  preview,
}: {
  rows: { id: RowId; label: string; slots: Slot[] }[];
  occupied: (archetypeId: string) => boolean;
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
            const count = row.slots.filter((slot) => occupied(slot.id)).length;
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
                data-selected={occupied(slot.id) ? "true" : undefined}
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
  handoff,
  skill2Selections,
  fields,
  picks,
  onTriangles,
  onChoose,
}: {
  rowId: RowId;
  label: string;
  slots: Slot[];
  index: number;
  focused: boolean;
  collection: SelectedSkill3Collection;
  handoff: FinalArchiveHandoff[];
  skill2Selections: Skill2Selections;
  fields: Record<string, VerticalViewerField | null>;
  picks: Record<string, SolidifiedPick | null>;
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
        {slots.map((slot, slotIndex) => {
          const selection = collection[slot.id] ?? null;
          const tracked = selection ? null : handoff.find((entry) => entry.archetypeId === slot.id) ?? null;
          const source = selection ?? tracked;
          const skill2Input = source ? null : skill2Selections[slot.id] ?? null;
          const pick = pickFor(source, picks);
          const field = selection && !pick ? fields[slot.id] ?? null : null;
          const place = carouselPlace(slotIndex, index);
          return (
            <button
              key={slot.id}
              type="button"
              className="final-item"
              data-place={place}
              data-selected={source ? "true" : undefined}
              data-skill2={skill2Input ? "awaiting" : undefined}
              data-geometry={pick || field ? "real" : "placeholder"}
              data-source={pick ? "carved-mass-solidified" : undefined}
              data-module={pick?.moduleId}
              data-continuation={source?.continuationId}
              data-status={pick?.status}
              aria-current={place === "front-center" ? "true" : undefined}
              onClick={() => onChoose(slotIndex)}
              aria-label={skill2Input ? `${slot.name}. Skill 2 input awaiting vertical propagation` : slot.name}
            >
              <span className="final-item-label">
                <small>{archetypeCode(rowId, slotIndex)}</small>
                <b>{slot.name}</b>
                {pick?.status === "review" ? <em>Review</em> : null}
              </span>
              {pick && source ? (
                <SlotMesh
                  archetypeId={source.archetypeId}
                  cacheIdentity={meshIdentity(selection, tracked) ?? source.archetypeId}
                  mesh={pick.mesh}
                  orbit={place === "front-center"}
                  onTriangles={onTriangles}
                />
              ) : field && selection ? (
                <SlotMesh
                  archetypeId={selection.archetypeId}
                  cacheIdentity={meshIdentity(selection, null) ?? selection.archetypeId}
                  field={field}
                  orbit={place === "front-center"}
                  onTriangles={onTriangles}
                />
              ) : (
                <ModuleMark id={slot.id} spin={place === "front-center"} />
              )}
              <span className="final-plinth" aria-hidden="true"><span className="final-plinth-top" /></span>
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
  handoff,
  skill2Input,
  field,
  pick,
  triangles,
}: {
  slot: Slot | undefined;
  code: string;
  selection: SelectedSkill3Morphology | null;
  handoff: FinalArchiveHandoff | null;
  skill2Input: Skill2Selection | null;
  field: VerticalViewerField | null;
  pick: SolidifiedPick | null;
  triangles: number | null;
}) {
  if (!slot) return null;
  const source = selection ?? handoff;
  const samples = selection?.acceptedIterations.length ?? null;
  const envelope = selection?.rules.envelope;
  return (
    <aside className="final-detail" data-tone={slot.typologyId} aria-live="polite">
      <p className="eyebrow">{code} · {slot.typology}</p>
      <h2 className="panel-title">{slot.name}</h2>
      <FinalOrthographicViews
        field={pick ? null : field}
        mesh={pick?.mesh ?? null}
        cacheIdentity={meshIdentity(selection, handoff)}
        placeholderId={slot.id}
        accent={DRAWING_TONE[slot.typologyId as RowId] ?? "#f2f2ee"}
      />
      <p className="final-detail-status" data-selected={source ? "true" : undefined}>
        {source ? "Selected final morphology" : skill2Input ? "Selected Skill 2 input awaiting vertical propagation" : "Awaiting selection"}
      </p>
      <dl>
        {[
          ["Archetype", slot.id],
          ["Candidate", source ? String(source.candidateId) : skill2Input ? String(skill2Input.candidateId) : "—"],
          ["Continuation", source?.continuationId ?? "—"],
          ["Status", pick ? (pick.status === "validated" ? "Validated" : "Review") : "—"],
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

function meshIdentity(selection: SelectedSkill3Morphology | null, handoff: FinalArchiveHandoff | null) {
  if (selection) return `${selection.origin}:${selection.archetypeId}:${selection.candidateId}:${selection.continuationId}:${selection.parentChecksum}`;
  if (handoff) return `handoff:${handoff.archetypeId}:${handoff.candidateId}:${handoff.continuationId}:${handoff.moduleId}`;
  return null;
}

function SlotMesh({
  archetypeId,
  cacheIdentity,
  field = null,
  mesh,
  orbit = false,
  onTriangles,
}: {
  archetypeId: string;
  cacheIdentity: string;
  field?: VerticalViewerField | null;
  mesh?: IsoMesh | null;
  orbit?: boolean;
  onTriangles: (archetypeId: string, count: number | null) => void;
}) {
  const report = useCallback((count: number | null) => {
    onTriangles(archetypeId, count);
  }, [onTriangles, archetypeId]);
  return (
    <span className="final-mesh" aria-hidden="true">
      <ProcessMorphology
        field={field}
        mesh={mesh}
        float
        orbit={orbit}
        turnSeconds={TURN_SECONDS}
        cacheIdentity={`${cacheIdentity}:refined`}
        onTriangles={report}
        refine
        uniformFrame
      />
    </span>
  );
}

function pickFor(
  selection: { archetypeId: string; candidateId: number; continuationId: string } | null,
  picks: Record<string, SolidifiedPick | null>,
) {
  if (!selection) return null;
  const pick = picks[selection.archetypeId] ?? null;
  if (!pick) return null;
  const expected = solidifiedModuleId(selection.archetypeId, selection.candidateId, selection.continuationId);
  return pick.moduleId === expected ? pick : null;
}

async function loadSolidifiedPick(
  selection: { archetypeId: string; candidateId: number; continuationId: string },
  signal: AbortSignal,
): Promise<SolidifiedPick | null> {
  const moduleId = solidifiedModuleId(selection.archetypeId, selection.candidateId, selection.continuationId);
  const params = new URLSearchParams({
    archetype: selection.archetypeId,
    candidate: String(selection.candidateId),
    continuation: selection.continuationId,
  });
  try {
    const response = await fetch(`/api/vertical/solidified?${params}`, { signal });
    if (!response.ok) return null;
    const body = await response.json() as {
      source?: string;
      moduleId?: string;
      archetypeId?: string;
      candidateId?: number;
      continuationId?: string;
      status?: string;
      geometry?: EncodedSolidifiedMesh;
    };
    if (body.source !== "carved-mass-solidified" || body.moduleId !== moduleId) return null;
    if (body.archetypeId !== selection.archetypeId || body.candidateId !== selection.candidateId) return null;
    if (body.continuationId !== selection.continuationId) return null;
    if ((body.status !== "validated" && body.status !== "review") || !body.geometry || body.geometry.triangles < 1) return null;
    return { moduleId, status: body.status, mesh: decodeSolidifiedMesh(body.geometry) };
  } catch {
    return null;
  }
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
