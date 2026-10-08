"use client";

import { useEffect, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import type { EvolutionCatalog } from "@/lib/skill2/evolution-index";
import type { TypologyId } from "@/lib/types";

const STORAGE_KEY = "lm-evolution-archetype";

export function useEvolutionCatalog(initial: EvolutionCatalog) {
  return initial;
}

export function useSelectedArchetype(catalog: EvolutionCatalog) {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored && catalog.archetypes.some((item) => item.archetypeId === stored)) setChosen(stored);
  }, [catalog.archetypes]);
  const archetype =
    catalog.archetypes.find((item) => item.archetypeId === chosen) ?? catalog.archetypes[0] ?? null;
  const select = (archetypeId: string) => {
    window.sessionStorage.setItem(STORAGE_KEY, archetypeId);
    setChosen(archetypeId);
  };
  return { archetype, select };
}

export function ArchetypeSwitch({
  catalog,
  archetypeId,
  onChange,
}: {
  catalog: EvolutionCatalog;
  archetypeId: string | null;
  onChange: (archetypeId: string) => void;
}) {
  const selected = catalog.archetypes.find((item) => item.archetypeId === archetypeId);
  const [typologyId, setTypologyId] = useState<TypologyId>(selected?.typologyId ?? "lobby");
  useEffect(() => {
    if (selected) setTypologyId(selected.typologyId);
  }, [selected?.archetypeId, selected?.typologyId]);
  const typology = TYPOLOGIES.find((item) => item.id === typologyId) ?? TYPOLOGIES[0];
  const chooseTypology = (id: TypologyId) => {
    setTypologyId(id);
    const next = TYPOLOGIES.find((item) => item.id === id)?.archetypes.find((item) =>
      catalog.archetypes.some((run) => run.archetypeId === item.id),
    );
    if (next) onChange(next.id);
  };
  return (
    <div className="evo-archetype-switch">
      <div role="group" aria-label="Typology">
        {TYPOLOGIES.map((item) => (
          <button key={item.id} type="button" data-active={item.id === typology.id || undefined} onClick={() => chooseTypology(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Archetype">
        {typology.archetypes.map((item) => {
          const run = catalog.archetypes.find((entry) => entry.archetypeId === item.id);
          return (
            <button
              key={item.id}
              type="button"
              disabled={!run}
              title={run ? undefined : "Search not run yet"}
              data-active={item.id === archetypeId || undefined}
              onClick={() => run && onChange(item.id)}
            >
              {item.name}
              {run && run.completedGenerations < run.generationCount ? ` ${run.completedGenerations}/${run.generationCount}` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EvolutionImage({ src, className = "" }: { src: string | null; className?: string }) {
  if (!src) return <span className={`evolution-image evolution-image-empty ${className}`} />;
  return <img className={`evolution-image ${className}`} src={src} alt="" />;
}

export const formatCandidateId = (id: number) => `#${String(id).padStart(3, "0")}`;
export const formatGeneration = (generation: number) => `G${String(generation).padStart(2, "0")}`;
