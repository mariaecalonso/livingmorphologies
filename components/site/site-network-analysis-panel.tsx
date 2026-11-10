"use client";

import type { NetworkAnalysisMode, NetworkFigures, NetworkMetric } from "./site-network-analysis";
import { SiteNetworkFigures } from "./site-network-figures";

const MODES: { id: NetworkAnalysisMode; label: string }[] = [
  { id: "density", label: "Density" },
  { id: "connectivity", label: "Connectivity" },
  { id: "branching", label: "Hierarchy" },
  { id: "direction", label: "Direction" },
  { id: "overlay", label: "Overlay" },
];

export function SiteNetworkAnalysisPanel({
  mode,
  active,
  metrics,
  notice,
  figures,
  onMode,
  onActive,
}: {
  mode: NetworkAnalysisMode;
  active: boolean;
  metrics: readonly NetworkMetric[];
  notice: string | null;
  figures: NetworkFigures | null;
  onMode: (mode: NetworkAnalysisMode) => void;
  onActive: (active: boolean) => void;
}) {
  return (
    <section className="site-block" aria-label="Network analysis">
      <h2 className="site-subtitle">Network analysis</h2>
      <div className="site-modes site-network-controls" role="tablist" aria-label="Analysis mode">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active && mode === item.id}
            data-active={(active && mode === item.id) || undefined}
            onClick={() => onMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="site-modes site-network-controls" role="group" aria-label="Analysis display">
        <button type="button" data-active={!active || undefined} onClick={() => onActive(false)}>Network</button>
        <button type="button" data-active={active || undefined} onClick={() => onActive(true)}>Analysis</button>
      </div>
      {notice ? <p className="site-note">{notice}</p> : null}
      {active && metrics.length > 0 ? (
        <>
          <ul className="site-analysis-metrics">
            {metrics.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {figures ? <SiteNetworkFigures figures={figures} /> : <p className="site-note">Select an iteration.</p>}
    </section>
  );
}
