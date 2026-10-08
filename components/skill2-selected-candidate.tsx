"use client";

import { useEffect, useState } from "react";
import { ArchetypeRail } from "@/components/archetype-rail";
import { TYPOLOGIES } from "@/lib/catalog";
import {
  readActiveArchetype,
  readSkill2Selections,
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

  return (
    <ArchetypeRail
      framed
      activeId={activeId}
      onPick={activate}
      note={(id) => {
        const selection = selections[id];
        const status = statusLabel(selection, handoff[id]);
        if (status === "Ready") return " · ready";
        if (status === "Z0 pending") return " · pending";
        return "";
      }}
    />
  );
}
