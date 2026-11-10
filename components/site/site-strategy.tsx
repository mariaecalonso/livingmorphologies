"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { NetworkNodeKind, NetworkStatus, SiteNetworkStudy } from "./site-network";

export type SiteSheet = "assembly" | "strategy";

export type StrategyMode = "site-network" | "assemblies-network";

const SHEETS: { id: SiteSheet; label: string }[] = [
  { id: "assembly", label: "Site Assembly" },
  { id: "strategy", label: "Site Strategy" },
];

export const STRATEGY_MODES: { id: StrategyMode; label: string; title: string; body: string }[] = [
  {
    id: "site-network",
    label: "Method 01",
    title: "Site → Network",
    body: "Sources and attractors placed on the site drive the network.",
  },
];

export function SiteSheetTabs({ sheet, onChange }: { sheet: SiteSheet; onChange: (sheet: SiteSheet) => void }) {
  return (
    <>
      <div className="site-modes site-sheet-tabs" role="tablist" aria-label="Site Integration">
        {SHEETS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={sheet === item.id}
            data-active={sheet === item.id || undefined}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {sheet === "strategy" ? (
        <div className="site-strategy-head">
          <p>Site Integration</p>
          <h2>Site Strategy</h2>
        </div>
      ) : null}
    </>
  );
}

const EMPTY_EDIT = { nodes: [], selectedId: null };

function useNetworkEdit(study: SiteNetworkStudy | null) {
  return useSyncExternalStore(
    (listener) => study ? study.subscribe(listener) : () => {},
    () => study?.edit ?? EMPTY_EDIT,
    () => EMPTY_EDIT,
  );
}

function useNetworkStatus(study: SiteNetworkStudy | null) {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  useEffect(() => {
    if (!study) {
      setStatus(null);
      return;
    }
    let signature = "";
    const read = () => {
      const next = study.status;
      const mark = `${next.step}|${next.settled}|${next.reached}|${next.connected}|${next.total}|${next.note ?? ""}|${next.reachedIds.join(",")}|${next.connectedIds.join(",")}|${next.visitIds.join(",")}`;
      if (mark === signature) return;
      signature = mark;
      setStatus(next);
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [study]);
  return status;
}

export function SiteStrategyPanel({
  mode,
  onMode,
  assemblies,
  modules,
  network,
}: {
  mode: StrategyMode;
  onMode: (mode: StrategyMode) => void;
  assemblies: number;
  modules: number;
  network: {
    study: SiteNetworkStudy | null;
    running: boolean;
    tool: NetworkNodeKind;
    onTool: (tool: NetworkNodeKind) => void;
    onRun: () => void;
    onPause: () => void;
    onReset: () => void;
    onClear: () => void;
    onDelete: () => void;
    onSelect: (id: string) => void;
  } | null;
}) {
  const active = STRATEGY_MODES.find((item) => item.id === mode) ?? STRATEGY_MODES[0];
  const siteNetwork = mode === "site-network" ? network : null;
  const edit = useNetworkEdit(siteNetwork?.study ?? null);
  const sources = edit.nodes.filter((node) => node.kind === "source").length;
  const attractors = edit.nodes.filter((node) => node.kind === "attractor").length;
  const ready = sources > 0 && attractors > 0;
  const status = useNetworkStatus(siteNetwork?.study ?? null);
  const statusLine = status
    ? `${status.settled && status.step > 0 ? `Settled at step ${status.step}` : `Step ${status.step}`}${status.total > 0 ? `. Persistent ${status.reached}/${status.total}. Connected ${status.connected}/${status.total}. Visits ${status.visitIds.length}.` : "."}`
    : null;
  return (
    <div className="site-strategy-panel">
      <section className="site-strategy-section" aria-label="Simulation mode">
        <h3>Simulation</h3>
        <div className="site-strategy-methods" role="group" aria-label="Simulation mode">
          {STRATEGY_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              data-active={mode === item.id || undefined}
              onClick={() => onMode(item.id)}
            >
              <strong>{item.label}</strong>
              <b>{item.title}</b>
              <span>{item.body}</span>
            </button>
          ))}
        </div>
      </section>
      {siteNetwork ? (
        <section className="site-strategy-section" aria-label="Sources and attractors">
          <h3>Source &amp; Attractor</h3>
          <div className="site-kind-toggle" role="group" aria-label="Node type">
            <button type="button" data-kind="source" aria-pressed={siteNetwork.tool === "source"} data-active={siteNetwork.tool === "source" || undefined} onClick={() => siteNetwork.onTool("source")}>Source</button>
            <button type="button" data-kind="attractor" aria-pressed={siteNetwork.tool === "attractor"} data-active={siteNetwork.tool === "attractor" || undefined} onClick={() => siteNetwork.onTool("attractor")}>Attractor</button>
          </div>
          <div className="site-strategy-icons" role="group" aria-label="Node actions">
            <button type="button" data-active aria-pressed="true" aria-label="Place on the site">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" /></svg>
            </button>
            <button type="button" disabled={!edit.selectedId} aria-label="Delete the selected node" onClick={siteNetwork.onDelete}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8M9 7V5h6v2M8 9l1 11h6l1-11" /></svg>
            </button>
            <button type="button" disabled={edit.nodes.length === 0} aria-label="Clear nodes" onClick={siteNetwork.onClear}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M9 8V6h6v2M8 8l1 12h6l1-12" /></svg>
            </button>
          </div>
          {siteNetwork.study && !ready ? <p className="site-strategy-note">Place a source and an attractor.</p> : null}
          {siteNetwork.study ? (
            <ul className="site-strategy-nodes">
              {edit.nodes.map((node) => {
                const number = edit.nodes.filter((item) => item.kind === node.kind && edit.nodes.indexOf(item) <= edit.nodes.indexOf(node)).length;
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      data-kind={node.kind}
                      data-active={node.id === edit.selectedId || undefined}
                      onClick={() => siteNetwork.onSelect(node.id)}
                    >
                      <i />
                      <b>{node.kind === "source" ? "Source" : "Attractor"} {number}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="site-strategy-note">Preparing the land.</p>}
        </section>
      ) : <p className="site-strategy-note">{active.title} uses the assemblies on this site.</p>}
      {siteNetwork ? (
        <section className="site-strategy-section" aria-label="Simulation control">
          <h3>Simulation Control</h3>
          <div className="site-run-row" role="group" aria-label="Run controls">
            <button type="button" data-active={siteNetwork.running || undefined} disabled={!siteNetwork.study || !ready} onClick={siteNetwork.onRun}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              Run
            </button>
            <button type="button" disabled={!siteNetwork.running} onClick={siteNetwork.onPause}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
              Pause
            </button>
            <button type="button" disabled={!siteNetwork.study} onClick={siteNetwork.onReset}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 4" /><path d="M5 4v5h5" /></svg>
              Reset
            </button>
          </div>
        </section>
      ) : null}
      <section className="site-placement-card" aria-label="Current placement">
        <h3>Current Placement</h3>
        <div>
          <span>Assemblies</span>
          <strong>{assemblies}</strong>
        </div>
        <div>
          <span>Modules</span>
          <strong>{modules}</strong>
        </div>
      </section>
      {statusLine ? <p className="site-strategy-status" role="status">{statusLine}</p> : null}
      {status?.note ? <p className="site-strategy-note">{status.note}</p> : null}
    </div>
  );
}

export function SiteStrategyAnalysis({ mode }: { mode: StrategyMode }) {
  const active = STRATEGY_MODES.find((item) => item.id === mode) ?? STRATEGY_MODES[0];
  return (
    <section className="site-block site-specs" aria-label="Network analysis">
      <h2 className="site-subtitle">Analysis</h2>
      <p className="site-identity">{active.title}</p>
      <p className="site-note">Waiting for a study.</p>
    </section>
  );
}
