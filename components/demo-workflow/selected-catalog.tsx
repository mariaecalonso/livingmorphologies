"use client";

import { useMemo } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import { propagatedCandidate, propagatedPreview } from "@/lib/demo-workflow/propagated-candidates";
import styles from "@/components/demo-workflow/selected-catalog.module.css";

/** The fifteen candidates vertical propagation continues, one for each archetype. */
export function SelectedCatalog() {
  const groups = useMemo(() => TYPOLOGIES.map((typology) => ({
    label: typology.label,
    plates: typology.archetypes.map((archetype) => {
      const pick = propagatedCandidate(archetype.id);
      return {
        id: archetype.id,
        name: archetype.name,
        candidateId: pick?.candidateId ?? null,
        image: propagatedPreview(archetype.id),
      };
    }),
  })), []);
  const count = groups.reduce((sum, group) => sum + group.plates.filter((plate) => plate.candidateId != null).length, 0);
  const status = count === 15 ? "ready" : "missing";

  return (
    <section className={styles.frame} aria-label="Selected for vertical propagation">
      <header>
        <h3>Selected for vertical propagation</h3>
        <p>{status === "ready" ? `${count} candidates · one per archetype · carried into vertical propagation` : "The propagated candidates are not stored."}</p>
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
