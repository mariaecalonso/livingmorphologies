"use client";

import { useSyncExternalStore } from "react";
import { ARCHITECTURAL_STRATEGY_ID, ARRANGEMENT_FAMILY } from "@/lib/skill5/architectural-strategy";
import { pedestrianCandidates } from "./site-network-candidates";
import type { NetworkNodeKind, SiteNetworkStudy, StrategyOrigin } from "./site-network";
import { TYPOLOGY_INTENTS, type TypologyAttractor, type TypologyIntent } from "./typology-attractors";
import { TYPOLOGY_COLOR } from "./typology-attractor-layer";

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
          <button type="button" title="The bay stays closed outside this zone." onClick={() => study.clearGrowth(selected.id)}>Remove growth zone</button>
        </>
      ) : (
        <>
          <button type="button" title="No growth zone. The attractor stays disconnected from the land." onClick={() => study.restoreGrowth(selected.id)}>Open growth zone</button>
        </>
      )}
    </div>
  );
}

const ORIGIN_LABEL: Record<StrategyOrigin, string> = {
  "measured-access": "Measured access",
  "city-edge": "City-edge proposal",
  "mapped-approach": "Mapped approach",
  waterfront: "Waterfront",
  internal: "Inland",
  "road-buffered": "Road distance",
};

function originLabel(origin: StrategyOrigin) {
  return ORIGIN_LABEL[origin];
}

function nodeRecord(node: { strategy?: { origin: StrategyOrigin; unverified: boolean } | null }) {
  if (!node.strategy) return "placed" as const;
  if (node.strategy.unverified) return "unverified" as const;
  if (node.strategy.origin === "city-edge" || node.strategy.origin === "mapped-approach") return "proposed" as const;
  return "measured" as const;
}

const RECORD_LABEL = { unverified: "Unverified", measured: "Measured", proposed: "Proposed", placed: "Placed" };

function nodeEvidence(node: { strategy?: { unverified: boolean; waterfrontFeet: number | null; shoreFeet: number | null; openRays: number | null; macarthurFeet: number | null; exposed: boolean | null; shaded: boolean | null } | null }) {
  const trace = node.strategy;
  if (!trace) return "Placed by hand. No site-analysis record on this node.";
  const parts: string[] = [];
  if (trace.unverified) parts.push("Unverified access contact");
  if (typeof trace.waterfrontFeet === "number") parts.push(`${Math.round(trace.waterfrontFeet)} ft from the coastline`);
  if (trace.openRays === null) parts.push("Sightlines were not measured");
  else if (trace.shoreFeet === null) parts.push(`${trace.openRays} open sightlines, none to the shore`);
  else parts.push(`${trace.openRays} open sightlines, open shore ${Math.round(trace.shoreFeet)} ft`);
  if (typeof trace.macarthurFeet === "number") parts.push(`MacArthur ${Math.round(trace.macarthurFeet)} ft`);
  if (trace.exposed === true) parts.push("Sun exposed");
  if (trace.shaded === true) parts.push("Sun shaded");
  return parts.join(". ");
}

function useNetworkEdit(study: SiteNetworkStudy | null) {
  return useSyncExternalStore(
    (listener) => study ? study.subscribe(listener) : () => {},
    () => study?.edit ?? EMPTY_EDIT,
    () => EMPTY_EDIT,
  );
}

export function SiteStrategyPanel({
  network,
  typology,
}: {
  network: {
    study: SiteNetworkStudy | null;
    running: boolean;
    tool: NetworkNodeKind;
    onTool: (tool: NetworkNodeKind) => void;
    onRun: () => void;
    onPause: () => void;
    onReset: () => void;
    onDelete: () => void;
    onSelect: (id: string) => void;
    onGenerateStrategy: () => void;
    generating: boolean;
    notice: string | null;
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
  const edit = useNetworkEdit(network?.study ?? null);
  const sources = edit.nodes.filter((node) => node.kind === "source").length;
  const attractors = edit.nodes.filter((node) => node.kind === "attractor").length;
  const ready = sources > 0 && attractors > 0;
  const access = pedestrianCandidates().filter((candidate) => candidate.role === "access");
  return (
    <div className="site-strategy-panel">
      <section className="site-strategy-section" aria-label="Site conclusions">
        <h3>Site conclusions</h3>
        {access.map((candidate) => (
          <p key={candidate.id} className="site-strategy-note" title={candidate.gapFeet == null ? "No gap is stored." : `Gap ${candidate.gapFeet.toFixed(1)} ft.`}>
            {candidate.title}. Unverified.
          </p>
        ))}
      </section>
      <section className="site-strategy-section" aria-label="Architectural strategy" title={ARCHITECTURAL_STRATEGY_ID}>
        <h3>Herald arrival</h3>
        <p className="site-strategy-note">Public → central gathering</p>
        <p className="site-strategy-note">Private → workspace, private gathering</p>
        <p className="site-strategy-note">Experimental → northern gathering</p>
        <h3>Arrangements</h3>
        <ul className="site-strategy-nodes">
          {ARRANGEMENT_FAMILY.map((item) => (
            <li key={item.id}>
              <p className="site-strategy-note" title={item.reason}>{item.title}</p>
            </li>
          ))}
        </ul>
      </section>
      {network ? (
        <section className="site-strategy-section" aria-label="Generation">
          <h3>Generate strategy variations</h3>
          <button type="button" disabled={!network.study || network.generating} onClick={network.onGenerateStrategy}>{network.generating ? "Generating" : "Generate strategy variations"}</button>
          {network.notice ? <p className="site-strategy-note">{network.notice}</p> : null}
          <div className="site-run-row" role="group" aria-label="Live playback">
            <button type="button" title="Plays the editor simulation. It does not archive a network." data-active={network.running || undefined} disabled={!network.study || !ready} onClick={network.onRun}>Run</button>
            <button type="button" title="Pauses the editor simulation." disabled={!network.running} onClick={network.onPause}>Pause</button>
            <button type="button" title="Clears the live trails in the editor. Saved networks stay." disabled={!network.study} onClick={network.onReset}>Reset</button>
          </div>
        </section>
      ) : null}
      <details className="site-strategy-section">
        <summary>Advanced</summary>
        {network ? (
          <div className="site-kind-toggle" role="group" aria-label="Place in the view">
            <button type="button" data-kind="source" aria-pressed={network.tool === "source"} data-active={network.tool === "source" || undefined} onClick={() => network.onTool("source")}>Source</button>
            <button type="button" data-kind="attractor" aria-pressed={network.tool === "attractor"} data-active={network.tool === "attractor" || undefined} onClick={() => network.onTool("attractor")}>Attractor</button>
          </div>
        ) : null}
        {network?.study ? <WaterGrowthControls study={network.study} selectedId={edit.selectedId} /> : null}
        {network?.study ? (
          <ul className="site-strategy-nodes">
            {edit.nodes.map((node) => {
              const record = nodeRecord(node);
              const selected = node.id === edit.selectedId;
              return (
                <li key={node.id}>
                  <button type="button" data-kind={node.surface === "water" ? "water" : node.kind} data-record={record} data-active={selected || undefined} onClick={() => network.onSelect(node.id)}>
                    <i />
                    <b>{node.kind === "source" ? "Source" : "Attractor"}</b>
                    <span>{RECORD_LABEL[record]}{node.strategy ? ` · ${originLabel(node.strategy.origin)}` : ""}</span>
                  </button>
                  {selected ? <p className="site-strategy-note">{nodeEvidence(node)}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {network ? <button type="button" disabled={!edit.selectedId} onClick={network.onDelete}>Delete selected</button> : null}
        <ArchitecturalAttractors typology={typology} />
      </details>
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
      <details>
        <summary title="Planning markers. They do not feed the network.">Architectural attractors</summary>
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
        ) : null}
        <button type="button" disabled={typology.points.length === 0} onClick={typology.onClear}>Clear architectural attractors</button>
      </details>
    </section>
  );
}
