"use client";

import { useEffect, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import {
  readActiveArchetype,
  readSkill2Selections,
  writeActiveArchetype,
} from "@/lib/skill2/published-selection";

const GROUPS = TYPOLOGIES.map((typology) => ({
  id: typology.id,
  label: typology.label,
  slots: typology.archetypes.map((item) => ({
    archetypeId: item.id,
    name: item.name,
  })),
}));

const SLOTS = GROUPS.flatMap((group) => group.slots);

/** Fifteen Skill 2 choices. Choosing one sets the Skill 3 source and does not propagate. */
export function Skill2SelectionBoard() {
  const [activeId, setActiveId] = useState(SLOTS[0]?.archetypeId ?? "");
  const [selections, setSelections] = useState<Record<string, { candidateId: number }>>({});

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

  const activate = (archetypeId: string) => {
    setActiveId(archetypeId);
    writeActiveArchetype(archetypeId);
    window.dispatchEvent(new Event("lm-skill3-source"));
  };

  return (
    <aside className="runs-aside panel m-2 flex w-[15.5rem] shrink-0 flex-col" aria-label="Archetype">
      <header className="panel-header">
        <div className="panel-header-content">
          <p className="hud-panel-kicker">Input</p>
          <h2 className="panel-title">Archetype</h2>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {GROUPS.map((group) => (
          <section key={group.id} className="flex min-h-0 flex-1 flex-col gap-1.5">
            <p className="eyebrow shrink-0">{group.label}</p>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5" role="group" aria-label={group.label}>
              {group.slots.map((slot) => {
                const active = slot.archetypeId === activeId;
                const selection = selections[slot.archetypeId];
                return (
                  <button
                    key={slot.archetypeId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => activate(slot.archetypeId)}
                    className={`flex min-h-0 flex-1 items-center border px-1.5 py-1.5 text-left text-[0.58rem] leading-tight tracking-[0.08em] uppercase transition ${
                      active
                        ? "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.14),rgba(199,126,95,0.14))] text-white"
                        : "border-[rgba(242,242,238,0.16)] text-[var(--muted)] hover:border-[rgba(242,242,238,0.32)] hover:text-[var(--text)]"
                    }`}
                  >
                    {slot.name}{selection ? ` · ${selection.candidateId}` : ""}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
