"use client";

import { useEffect, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import { connectionBlocked, connectionPairLabel } from "@/lib/skill4/connections";
import { mockPlacementSupported } from "@/lib/skill4/assembly-layout";
import { hybridDisplay } from "@/lib/skill4/hybrid-display";
import { ConnectionHeader } from "./connection-header";
import { MockMatrix } from "./mock-matrix";
import { MeshPreview } from "./mesh-preview";
import { useHybrid } from "./hybrid-state";

export function HybridConnections() {
  const { connections, selectedConnectionId, tiles, loaded, generateInputs, generateHybridFieldForConnection, selectMock } = useHybrid();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedConnectionId) return;
    document.querySelector(`[data-connection="${CSS.escape(selectedConnectionId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedConnectionId]);

  return (
    <main className="hybrid-view hybrid-connections">
      {connections.length === 0 ? <p className="hybrid-units">No adjacent tiles.</p> : null}
      {connections.map((connection) => {
        const blocked = connectionBlocked(connection, tiles, loaded);
        const field = connection.candidateField?.signature === connection.signature ? connection.candidateField : null;
        const supported = mockPlacementSupported(connection, tiles);
        const display = hybridDisplay(connection);
        return (
          <Panel key={connection.id} className="hybrid-som-card">
            <PanelHeader kicker="03" title={connectionPairLabel(connection)} />
            <ConnectionHeader connection={connection} />
            <button type="button" className="hybrid-generate" disabled={blocked} onClick={() => setNotice(generateInputs(connection.id))}>
              Generate candidate inputs
            </button>
            <button type="button" className="hybrid-generate" disabled={blocked || !field} onClick={() => setNotice(generateHybridFieldForConnection(connection.id))}>
              Generate real hybrids
            </button>
            <p className="hybrid-units" data-input-readiness={field ? "ready" : blocked ? "blocked" : "not-generated"}>
              {blocked ? "Input readiness · blocked" : field ? "Input readiness · 25 candidate inputs" : "Input readiness · not generated"}
            </p>
            {notice ? <p className="hybrid-pending">{notice}</p> : null}
            <p className="hybrid-mock-banner">{display.banner}</p>
            <p className="hybrid-units">Validation · unverified · not physically connected</p>
            {!supported ? <p className="hybrid-pending">Unsupported placement · the selected faces do not meet on this adjacency.</p> : null}
            <MockMatrix
              signature={connection.signature}
              selectedId={connection.selectedMockId}
              generatedField={connection.generatedHybridField}
              onSelect={(id) => selectMock(connection.id, id)}
            />
            <p className="hybrid-identity" data-selected-mock={display.selected.id}>{display.selected.id}</p>
            <div className="hybrid-axon">
              {display.selected.mesh ? <MeshPreview mesh={display.selected.mesh} /> : <p className="hybrid-matrix-pending">{display.selected.label}</p>}
            </div>
            <p className="hybrid-similarity">Similarity · Pending</p>
            <p className="hybrid-pending">Production connector · Pending</p>
          </Panel>
        );
      })}
    </main>
  );
}
