"use client";

import { useEffect, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import {
  readActiveArchetype,
  readSkill2Selections,
  selectionPreviewSrc,
  writeActiveArchetype,
  type Skill2Selection,
  type Skill2Selections,
} from "@/lib/skill2/published-selection";

type Handoff = "verified" | "pending";

const SLOTS = TYPOLOGIES.flatMap((typology) =>
  typology.archetypes.map((item) => ({
    archetypeId: item.id,
    name: item.name,
    typologyId: typology.id,
  })),
);

function statusLabel(selection: Skill2Selection | undefined, handoff: Handoff | undefined) {
  if (!selection) return "Not selected";
  if (handoff === "verified") return "Ready";
  return "Z0 pending";
}

/** Fifteen Skill 2 choices. Choosing one sets the Skill 3 source and does not propagate. */
export function Skill2SelectionBoard() {
  const [selections, setSelections] = useState<Skill2Selections>({});
  const [activeId, setActiveId] = useState(SLOTS[0]?.archetypeId ?? "");
  const [handoff, setHandoff] = useState<Record<string, Handoff>>({});

  useEffect(() => {
    const stored = readSkill2Selections();
    setSelections(stored);
    const remembered = readActiveArchetype();
    const fallback = Object.keys(stored)[0] ?? SLOTS[0]?.archetypeId ?? "";
    const next = remembered && SLOTS.some((slot) => slot.archetypeId === remembered) ? remembered : fallback;
    if (!next) return;
    setActiveId(next);
    writeActiveArchetype(next);
  }, []);

  useEffect(() => {
    const entries = Object.values(selections);
    if (entries.length === 0) return;
    const controller = new AbortController();
    for (const selection of entries) {
      void fetch(`/api/semantic-catalog/${selection.archetypeId}/${selection.candidateId}/selection`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { handoff?: string } | null) => {
          setHandoff((current) => ({
            ...current,
            [selection.archetypeId]: body?.handoff === "verified" ? "verified" : "pending",
          }));
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [selections]);

  const activate = (archetypeId: string) => {
    setActiveId(archetypeId);
    writeActiveArchetype(archetypeId);
    window.dispatchEvent(new Event("lm-skill3-source"));
  };

  const active = SLOTS.find((slot) => slot.archetypeId === activeId) ?? SLOTS[0];
  const activeSelection = active ? selections[active.archetypeId] : undefined;
  const activeStatus = active ? statusLabel(activeSelection, handoff[active.archetypeId]) : "Not selected";
  const src = activeSelection ? selectionPreviewSrc(activeSelection) : null;

  return (
    <section className="skill2-selection-board" aria-label="Selected Skill 2 morphologies">
      <div className="skill2-selection-grid">
        {SLOTS.map((slot) => {
          const selection = selections[slot.archetypeId];
          const status = statusLabel(selection, handoff[slot.archetypeId]);
          const preview = selection ? selectionPreviewSrc(selection) : null;
          return (
            <button
              key={slot.archetypeId}
              type="button"
              className="skill2-selection-slot"
              data-active={slot.archetypeId === activeId || undefined}
              data-status={status === "Ready" ? "ready" : status === "Z0 pending" ? "pending" : "empty"}
              aria-pressed={slot.archetypeId === activeId}
              onClick={() => activate(slot.archetypeId)}
            >
              {preview ? <img src={preview} alt="" /> : <span className="skill2-selection-empty" aria-hidden="true" />}
              <span className="skill2-selection-copy">
                <span className="skill2-selection-name">{slot.name}</span>
                <span className="skill2-selection-id">{selection ? `#${selection.candidateId}` : "—"}</span>
                <span className="skill2-selection-status">{status}</span>
              </span>
            </button>
          );
        })}
      </div>
      {active ? (
        <div className="skill2-selection-active">
          {src ? <img src={src} alt="" /> : null}
          <p className="skill2-selection-id">
            {active.name}
            {activeSelection ? ` · #${activeSelection.candidateId}` : ""}
          </p>
          <p className="skill2-selection-note">
            {activeStatus === "Z0 pending" ? "Selected — Z0 handoff pending" : activeStatus}
          </p>
        </div>
      ) : null}
    </section>
  );
}
