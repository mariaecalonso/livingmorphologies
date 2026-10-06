"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import { connectionPairLabel, type TileConnection } from "@/lib/skill4/connections";
import { mockSummary } from "@/lib/skill4/assembly-layout";
import { resolveTileModule } from "@/lib/skill4/tiles";
import { useConnectionBlocked, useHybrid } from "./hybrid-state";
import { HybridTiles } from "./hybrid-tiles";

const FLOW = [
  { href: "/hybrid/assembly", label: "Tiles selected", pending: false },
  { href: "/hybrid/assembly", label: "Adjacencies detected", pending: false },
  { href: "/hybrid/connections", label: "Mock candidate fields available", pending: false },
  { href: "/hybrid/connections", label: "Mock connectors selected", pending: false },
  { href: "/hybrid/connections", label: "Production generation pending", pending: true },
  { href: "/hybrid/assembly", label: "Repeat and interlock pending", pending: true },
] as const;

function subscribeSearch(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function HybridProcess() {
  const { loaded, tiles, connections, focusConnection } = useHybrid();
  const search = useSyncExternalStore(subscribeSearch, () => window.location.search, () => "");
  const hrefFor = (path: string) => (search ? `${path}${search}` : path);

  return (
    <main className="hybrid-view hybrid-process">
      <ol className="hybrid-flow">
        {FLOW.map((step) => (
          <li key={step.label} data-pending={step.pending || undefined}>
            <Link href={hrefFor(step.href)}>{step.label}</Link>
            {step.pending ? <span className="hybrid-pending">Pending</span> : null}
          </li>
        ))}
      </ol>
      <div className="hybrid-process-grid">
        <Panel className="hybrid-tile">
          <PanelHeader kicker="01" title="Tile Selection" />
          <HybridTiles compact />
        </Panel>
        <Panel className="hybrid-canvas">
          <PanelHeader kicker="02" title="Aggregation Canvas" />
          <p className="hybrid-units">{tiles.length} tiles in neighboring registration envelopes.</p>
          {connections.length === 0 ? <p className="hybrid-units">No adjacent tiles.</p> : null}
          {connections.map((connection) => (
            <button key={connection.id} type="button" className="hybrid-connection-label" onClick={() => focusConnection(connection.id)}>
              {connectionPairLabel(connection)}
            </button>
          ))}
        </Panel>
        <Panel className="hybrid-som">
          <PanelHeader kicker="03" title="Hybrid SOM Matrices" />
          <p className="hybrid-pending">Pending</p>
          <p className="hybrid-units">Each adjacent pair will keep its own 5×5 matrix. No hybrid geometry yet.</p>
        </Panel>
        <Panel className="hybrid-summary">
          <PanelHeader kicker="05" title="Connection Summary" />
          {connections.length === 0 ? (
            <p className="hybrid-units">No adjacent connection.</p>
          ) : (
            connections.map((connection) => <SummaryLine key={connection.id} connection={connection} />)
          )}
        </Panel>
        <Panel className="hybrid-operations">
          <PanelHeader kicker="06" title="Aggregation Operations" />
          <p className="hybrid-pending">Pending</p>
        </Panel>
      </div>
      <p className="hybrid-units">
        {tiles.map((tile) => {
          const handoff = resolveTileModule(tile.archetypeId, loaded);
          return `${tile.instanceId} ${handoff.identity?.name ?? tile.archetypeId}`;
        }).join(" · ")}
      </p>
    </main>
  );
}

function SummaryLine({ connection }: { connection: TileConnection }) {
  const { tiles } = useHybrid();
  const blocked = useConnectionBlocked(connection);
  return (
    <p className="hybrid-summary-line" data-connection-summary={connection.id}>
      {mockSummary(connection, tiles, blocked)}
    </p>
  );
}
