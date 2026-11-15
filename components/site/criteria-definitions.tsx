"use client";

import { useEffect } from "react";
import { criteriaMatrix } from "@/lib/skill5/architectural-dna";

/** The existing criteria table. It only displays the catalog definitions. */
export function CriteriaDefinitions() {
  return (
    <div className="site-dna-matrix" aria-label="Criteria definitions">
      <h2>Criteria definitions</h2>
      <div className="site-dna-head">
        <span />
        <span>Criterion</span>
        <span>Low 0</span>
        <span>Medium 1</span>
        <span>High 2</span>
      </div>
      {criteriaMatrix().map((group) => (
        <div className="site-dna-group" key={group.id}>
          <h3>{group.title}</h3>
          <div>
            {group.criteria.map((criterion) => (
              <div key={criterion.id} className="site-dna-definition" data-applies="">
                <b>{criterion.label}{criterion.typology ? ` · ${criterion.typology}` : ""}</b>
                {criterion.levels.map((level) => (
                  <span key={level.value}>{level.description}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CriteriaDefinitionsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="site-criteria-modal" role="dialog" aria-modal="true" aria-label="Criteria definitions">
      <header>
        <p>Criteria definitions</p>
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <CriteriaDefinitions />
    </div>
  );
}
