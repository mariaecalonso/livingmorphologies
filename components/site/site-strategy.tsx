"use client";

import { useSyncExternalStore } from "react";
import type { NetworkNodeKind, SiteNetworkStudy } from "./site-network";

export type StrategyMode = "site-network" | "assemblies-network";

export const STRATEGY_MODES: { id: StrategyMode; label: string; title: string; body: string }[] = [
  {
    id: "site-network",
    label: "Method 01",
    title: "Site → Network",
    body: "Sources and attractors on the open land shape one branching network.",
  },
];

const EMPTY_EDIT = { nodes: [], selectedId: null, candidates: [], selectedCandidateId: null };

function feet(value: number) {
  return `${value.toFixed(1)} ft`;
}

function useNetworkEdit(study: SiteNetworkStudy | null) {
  return useSyncExternalStore(
    (listener) => study ? study.subscribe(listener) : () => {},
    () => study?.edit ?? EMPTY_EDIT,
    () => EMPTY_EDIT,
  );
}

export function SiteStrategyPanel({
  mode,
  onMode: _onMode,
  network,
}: {
  mode: StrategyMode;
  onMode: (mode: StrategyMode) => void;
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
  return (
    <div className="site-strategy-panel">
      {siteNetwork ? (
        <section className="site-strategy-section" aria-label="Sources and attractors">
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
      {siteNetwork?.study ? <PedestrianCandidates study={siteNetwork.study} edit={edit} /> : null}
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
    </div>
  );
}

function PedestrianCandidates({
  study,
  edit,
}: {
  study: SiteNetworkStudy;
  edit: { nodes: readonly { id: string; kind: NetworkNodeKind; x: number; z: number }[]; candidates: SiteNetworkStudy["edit"]["candidates"]; selectedCandidateId: string | null };
}) {
  const selected = edit.candidates.find((item) => item.id === edit.selectedCandidateId) ?? null;
  const approved = selected ? edit.nodes.find((node) => node.id === selected.id) ?? null : null;
  return (
    <section className="site-strategy-section" aria-label="Pedestrian access">
      <h3>Pedestrian access</h3>
      <ul className="site-strategy-nodes site-candidate-list">
        {edit.candidates.map((candidate) => {
          const role = edit.nodes.find((node) => node.id === candidate.id)?.kind;
          return (
            <li key={candidate.id}>
              <button
                type="button"
                data-kind={role ?? "candidate"}
                data-active={candidate.id === edit.selectedCandidateId || undefined}
                onClick={() => study.selectCandidate(candidate.id)}
              >
                <i />
                <b>{candidate.title}</b>
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <div className="site-candidate-detail">
          <p>{selected.id}</p>
          <p>Measured {feet(selected.measuredX)} east, {feet(selected.measuredZ)} north.{selected.side ? ` ${selected.side} side.` : ""}{selected.gapFeet != null ? ` Gap ${feet(selected.gapFeet)}.` : ""}{selected.parcelDistanceFeet != null ? ` ${feet(selected.parcelDistanceFeet)} from the parcel.` : ""}</p>
          {selected.approvable && selected.resolvedX != null && selected.resolvedZ != null ? (
            <p>Growth position {feet(approved?.x ?? selected.resolvedX)} east, {feet(approved?.z ?? selected.resolvedZ)} north. The measured point stays where it was recorded.</p>
          ) : (
            <p>No recorded point is on the parcel, so this cannot enter the growth.</p>
          )}
          <p>{selected.limitation}</p>
          <div className="site-kind-toggle">
            <button type="button" data-kind="source" disabled={!selected.approvable} aria-pressed={approved?.kind === "source"} data-active={approved?.kind === "source" || undefined} onClick={() => study.approveCandidate(selected.id, "source")}>Source</button>
            <button type="button" data-kind="attractor" disabled={!selected.approvable} aria-pressed={approved?.kind === "attractor"} data-active={approved?.kind === "attractor" || undefined} onClick={() => study.approveCandidate(selected.id, "attractor")}>Attractor</button>
          </div>
        </div>
      ) : <p className="site-strategy-note">Access contacts stay out of the growth until approved.</p>}
    </section>
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
