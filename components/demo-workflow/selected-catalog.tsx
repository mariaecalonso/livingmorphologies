"use client";

import { useEffect, useMemo, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import styles from "@/components/demo-workflow/selected-catalog.module.css";

type Pick = { archetypeId: string; candidateId: number };

/** The stored human selection: one 2D candidate for each archetype. */
export function SelectedCatalog() {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/demo/skill2/picks.json", { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as Pick[];
        if (controller.signal.aborted) return;
        setPicks(next);
        setStatus(next.length ? "ready" : "missing");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("missing");
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => TYPOLOGIES.map((typology) => ({
    label: typology.label,
    plates: typology.archetypes.map((archetype) => {
      const pick = picks?.find((item) => item.archetypeId === archetype.id);
      return {
        id: archetype.id,
        name: archetype.name,
        candidateId: pick?.candidateId ?? null,
        image: pick ? `/demo/skill2/previews/${archetype.id}/${pick.candidateId}.webp` : null,
      };
    }),
  })), [picks]);
  const count = groups.reduce((sum, group) => sum + group.plates.filter((plate) => plate.candidateId != null).length, 0);

  return (
    <section className={styles.frame} aria-label="Selected for vertical propagation">
      <header>
        <h3>Selected for vertical propagation</h3>
        <p>{status === "ready" ? `${count} candidates · one per archetype · chosen by hand` : status === "missing" ? "The selected candidates are not stored." : "Loading the selected candidates."}</p>
      </header>
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <h4>{group.label}</h4>
          <div className={styles.plates}>
            {group.plates.map((plate) => (
              <figure key={plate.id}>
                {plate.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={plate.image} alt="" decoding="async" />
                ) : <span>Not stored</span>}
                <figcaption>{plate.name}<b>{plate.candidateId ?? "—"}</b></figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
