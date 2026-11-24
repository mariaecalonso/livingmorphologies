"use client";

import { SYNTHETIC_TEST_LABEL } from "@/lib/skill4/synthetic-modules";
import { useHybrid } from "./hybrid-state";

export function SyntheticTestToggle() {
  const { syntheticMode, syntheticPending, syntheticError, toggleSyntheticTest } = useHybrid();
  return (
    <div className="hybrid-layout-controls">
      <button type="button" data-active={syntheticMode || undefined} onClick={toggleSyntheticTest} disabled={syntheticPending}>
        {syntheticPending ? "Building test modules" : syntheticMode ? "Use Skill 3 Final Handoff" : "Use synthetic test modules"}
      </button>
      <p className="hybrid-units">{syntheticMode ? "TEST DATA ACTIVE" : "Skill 3 Final Handoff"}</p>
      <p className="hybrid-units">
        {syntheticMode ? `${SYNTHETIC_TEST_LABEL}. Tiles are closed test solids.` : "Skill 3 Final Handoff. 15 designer-selected final geometries."}
      </p>
      {syntheticError ? <p className="hybrid-pending">{syntheticError}</p> : null}
    </div>
  );
}
