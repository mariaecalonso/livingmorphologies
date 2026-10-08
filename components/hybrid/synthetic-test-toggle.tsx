"use client";

import { SYNTHETIC_TEST_LABEL } from "@/lib/skill4/synthetic-modules";
import { useHybrid } from "./hybrid-state";

export function SyntheticTestToggle() {
  const { syntheticMode, syntheticPending, syntheticError, toggleSyntheticTest } = useHybrid();
  return (
    <div className="hybrid-layout-controls">
      <button type="button" data-active={syntheticMode || undefined} onClick={toggleSyntheticTest} disabled={syntheticPending}>
        {syntheticPending ? "Building test modules" : syntheticMode ? "Use provisional fixtures" : "Use synthetic test modules"}
      </button>
      <p className="hybrid-units">{syntheticMode ? "TEST DATA ACTIVE" : "Provisional fixtures"}</p>
      <p className="hybrid-units">
        {syntheticMode ? `${SYNTHETIC_TEST_LABEL}. Tiles are closed test solids.` : `${SYNTHETIC_TEST_LABEL}. Provisional fixtures stay loaded.`}
      </p>
      {syntheticError ? <p className="hybrid-pending">{syntheticError}</p> : null}
    </div>
  );
}
