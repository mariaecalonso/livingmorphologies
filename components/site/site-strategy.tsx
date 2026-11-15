"use client";

import { useSyncExternalStore } from "react";
import type { NetworkNodeKind, SiteNetworkStudy } from "./site-network";
import { TYPOLOGY_INTENTS, type TypologyAttractor, type TypologyIntent } from "./typology-attractors";
import { TYPOLOGY_COLOR } from "./typology-attractor-layer";

export type StrategyMode = "site-network" | "assemblies-network";

export const STRATEGY_MODES: { id: StrategyMode; label: string; title: string; body: string }[] = [
  {
    id: "site-network",
    label: "Method 01",
    title: "Site → Network",
    body: "Sources stay on land. Attractors may sit on land or in a limited bay zone, and one branching network grows through the open region.",
  },
];

const EMPTY_EDIT = { nodes: [], selectedId: null, candidates: [], selectedCandidateId: null };

function WaterGrowthControls({ study, selectedId }: { study: SiteNetworkStudy; selectedId: string | null }) {
  const selected = study.edit.nodes.find((node) => node.id === selectedId);
  if (selected?.surface !== "water") return null;
  return (
    <div className="site-growth-zone">
      <h3>Over-water growth</h3>
      {selected.water ? (
        <>
          <label>
            Width, ft
            <input
              type="number"
              min={36}
              max={160}
              step={2}
              value={selected.water.widthFt}
              onChange={(event) => study.setGrowthWidth(selected.id, Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => study.clearGrowth(selected.id)}>Remove growth zone</button>
          <p className="site-strategy-note">The bay stays closed outside this zone. The network finds its own path.</p>
        </>
      ) : (
        <>
          <p className="site-strategy-note">This water attractor has no growth zone, so it stays disconnected from the land.</p>
          <button type="button" onClick={() => study.restoreGrowth(selected.id)}>Open growth zone</button>
        </>
      )}
    </div>
  );
}

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
  canClear,
  onClearField,
  typology,
}: {
  mode: StrategyMode;
  onMode: (mode: StrategyMode) => void;
  canClear: boolean;
  onClearField: () => void;
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
  typology: {
    points: readonly TypologyAttractor[];
    placing: TypologyIntent | null;
    visible: boolean;
    types: Record<TypologyIntent, boolean>;
    selectedId: string | null;
    onPlacing: (kind: TypologyIntent | null) => void;
    onVisible: (visible: boolean) => void;
    onType: (kind: TypologyIntent, visible: boolean) => void;
    onSelect: (id: string | null) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
  };
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
          {siteNetwork.study && !ready ? <p className="site-strategy-note">Place a source and an attractor. Attractors can sit in the bay.</p> : null}
          {siteNetwork.study ? (
            <ul className="site-strategy-nodes">
              {edit.nodes.map((node) => {
                const number = edit.nodes.filter((item) => item.kind === node.kind && edit.nodes.indexOf(item) <= edit.nodes.indexOf(node)).length;
                const water = node.surface === "water";
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      data-kind={water ? "water" : node.kind}
                      data-active={node.id === edit.selectedId || undefined}
                      onClick={() => siteNetwork.onSelect(node.id)}
                    >
                      <i />
                      <b>{node.kind === "source" ? "Source" : water ? "Water attractor" : "Attractor"} {number}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="site-strategy-note">Preparing the land.</p>}
          {siteNetwork.study ? <WaterGrowthControls study={siteNetwork.study} selectedId={edit.selectedId} /> : null}
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
      <ArchitecturalAttractors typology={typology} />
      <section className="site-strategy-section" aria-label="Clear the site">
        <button type="button" className="site-clear-field" disabled={!canClear} onClick={onClearField}>Clear all</button>
      </section>
    </div>
  );
}

function ArchitecturalAttractors({
  typology,
}: {
  typology: {
    points: readonly TypologyAttractor[];
    placing: TypologyIntent | null;
    visible: boolean;
    types: Record<TypologyIntent, boolean>;
    selectedId: string | null;
    onPlacing: (kind: TypologyIntent | null) => void;
    onVisible: (visible: boolean) => void;
    onType: (kind: TypologyIntent, visible: boolean) => void;
    onSelect: (id: string | null) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
  };
}) {
  const label: Record<TypologyIntent, string> = { lobby: "Lobby", gathering: "Gathering", workspace: "Workspace" };
  return (
    <section className="site-strategy-section site-arch-attractors" aria-label="Architectural attractors">
      <details open>
        <summary>Architectural attractors</summary>
        <p className="site-strategy-note">Planning markers only. They do not feed the Physarum network.</p>
        <div className="site-arch-types" role="group" aria-label="Typology to place">
          {TYPOLOGY_INTENTS.map((kind) => {
            const count = typology.points.filter((point) => point.typology === kind).length;
            return (
              <button
                key={kind}
                type="button"
                data-typology={kind}
                aria-pressed={typology.placing === kind}
                data-active={typology.placing === kind || undefined}
                onClick={() => typology.onPlacing(typology.placing === kind ? null : kind)}
              >
                <i style={{ background: TYPOLOGY_COLOR[kind], color: TYPOLOGY_COLOR[kind] }} />
                <b>{label[kind]}</b>
                <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="site-arch-visibility">
          <label>
            <input type="checkbox" checked={typology.visible} onChange={(event) => typology.onVisible(event.target.checked)} />
            Show layer
          </label>
          {TYPOLOGY_INTENTS.map((kind) => (
            <label key={kind}>
              <input type="checkbox" checked={typology.types[kind]} onChange={(event) => typology.onType(kind, event.target.checked)} />
              {label[kind]}
            </label>
          ))}
        </div>
        {typology.placing ? <button type="button" onClick={() => typology.onPlacing(null)}>Navigate</button> : null}
        {typology.points.length > 0 ? (
          <ul className="site-strategy-nodes">
            {typology.points.map((point, index) => (
              <li key={point.id}>
                <button type="button" data-typology={point.typology} data-active={point.id === typology.selectedId || undefined} onClick={() => typology.onSelect(point.id)}>
                  <i style={{ background: TYPOLOGY_COLOR[point.typology] }} />
                  <b>{label[point.typology]} {typology.points.filter((item) => item.typology === point.typology).indexOf(point) + 1 || index + 1}</b>
                </button>
                <button type="button" aria-label={`Delete ${label[point.typology]}`} onClick={() => typology.onDelete(point.id)}>Delete</button>
              </li>
            ))}
          </ul>
        ) : <p className="site-strategy-note">No markers yet. Choose a typology, then click the site.</p>}
        <button type="button" disabled={typology.points.length === 0} onClick={typology.onClear}>Clear architectural attractors</button>
      </details>
    </section>
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
