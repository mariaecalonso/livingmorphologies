"use client";

import { useState } from "react";
import { columnHeight } from "@/lib/scan/isomesh";
import { VIEW_SCAN } from "@/lib/skill4/contract";
import { gridShape, mockPlacementSupported, mockSummary } from "@/lib/skill4/assembly-layout";
import { geometryStatus, HybridTiles } from "./hybrid-tiles";
import { detectAdjacencies } from "@/lib/skill4/connections";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { selectedMock } from "./mock-matrix";
import { envelopeWidth, resolveTileModule } from "@/lib/skill4/tiles";
import { moduleMock, TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { Panel } from "@/components/hud";
import { AggregationView } from "./aggregation-view";
import { ConnectionHeader } from "./connection-header";
import { MeshPreview } from "./mesh-preview";
import { MockMatrix } from "./mock-matrix";
import { useConnectionBlocked, useHybrid } from "./hybrid-state";
import type { TileConnection } from "@/lib/skill4/connections";

const MIRROR = { x: 1, y: 2, z: 3 } as const;

export function HybridAssembly({ view = "process" }: { view?: "process" | "catalog" }) {
  const {
    loaded,
    tiles,
    connections,
    selectedId,
    setSelectedId,
    selectedConnectionId,
    selectConnection,
    selectMock,
    count,
    arrangement,
    setLayout,
    rotateSelected,
    mirrorSelected,
    translateSelected,
  } = useHybrid();
  const width = envelopeWidth();
  const shape = gridShape(count, arrangement);
  const span = Math.max(columnHeight(VIEW_SCAN.spacing, VIEW_SCAN.yaw), width * Math.max(shape.columns, shape.rows));
  const detected = detectAdjacencies(tiles);
  const placed: PlacedMesh[] = [
    ...tiles.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (!handoff.identity) return [];
      return [{
        id: tile.instanceId,
        mesh: moduleMock(tile.archetypeId),
        translate: tile.transform,
        selected: tile.instanceId === selectedId,
        spin: tile.rotationQuarter * Math.PI / 2,
        mirror: (tile.mirror ? MIRROR[tile.mirror] : 0) as 0 | 1 | 2 | 3,
        kind: 0 as const,
        color: TYPOLOGY_COLOR[handoff.identity.typologyId],
      }];
    }),
    ...connections.flatMap((connection) => {
      if (!mockPlacementSupported(connection, tiles)) return [];
      const pair = detected.find((item) => item.id === connection.id);
      if (!pair) return [];
      const hybrid = selectedMock(connection.signature, connection.selectedMockId);
      const spin = pair.faceA === "N" || pair.faceA === "S" ? Math.PI / 2 : 0;
      return [{
        id: `mock:${connection.id}`,
        mesh: hybrid.mesh,
        translate: pair.marker,
        selected: connection.id === selectedConnectionId,
        spin,
        kind: 1 as const,
        color: [0.85, 0.62, 0.48] as [number, number, number],
      }];
    }),
  ];

  return (
    <main className="hybrid-view hybrid-assembly" data-hybrid-view={view}>
      <div className="hybrid-work">
      <Panel className="hybrid-tile">
        <div className="frame-title"><p className="eyebrow">01</p><h2 className="panel-title">Tile Selection</h2></div>
        <div className="hybrid-layout-controls">
          {([2, 4, 6, 8] as const).map((value) => (
            <button key={value} type="button" data-active={count === value || undefined} onClick={() => setLayout(value, arrangement)}>
              {value}
            </button>
          ))}
          <button type="button" data-active={arrangement === "linear" || undefined} onClick={() => setLayout(count, arrangement === "linear" ? "grid" : "linear")}>
            Linear
          </button>
        </div>
        <HybridTiles />
        <div className="hybrid-layout-controls">
          <button type="button" onClick={rotateSelected}>Rotate 90</button>
          <button type="button" onClick={() => mirrorSelected("x")}>Mirror X</button>
          <button type="button" onClick={() => mirrorSelected("z")}>Mirror Z</button>
          <button type="button" onClick={() => translateSelected(-1, 0)}>West</button>
          <button type="button" onClick={() => translateSelected(1, 0)}>East</button>
          <button type="button" onClick={() => translateSelected(0, -1)}>South</button>
          <button type="button" onClick={() => translateSelected(0, 1)}>North</button>
        </div>
      </Panel>
      <Panel className="hybrid-canvas">
        <div className="frame-title"><p className="eyebrow">02</p><h2 className="panel-title">Aggregation Canvas</h2></div>
        <div className="hybrid-stage">
          <AggregationView
            instances={placed}
            selectedId={selectedId}
            onSelect={setSelectedId}
            connectionLabel={connections[0] ? `${connections[0].tileAId}:${connections[0].faceA} ↔ ${connections[0].tileBId}:${connections[0].faceB}` : null}
            connectionPoint={detected[0]?.marker ?? null}
            connectionActive={connections[0]?.id === selectedConnectionId}
            onSelectConnection={() => connections[0] && selectConnection(connections[0].id)}
            span={span}
          />
          <div className="hybrid-stage-keys">
            {tiles.map((tile) => {
              const handoff = resolveTileModule(tile.archetypeId, loaded);
              const status = geometryStatus(handoff);
              return (
                <button key={tile.instanceId} type="button" data-active={tile.instanceId === selectedId || undefined} onClick={() => setSelectedId(tile.instanceId)}>
                  <span>{tile.instanceId}</span>
                  <span>{handoff.identity?.name ?? tile.archetypeId}</span>
                  <span>{status.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="hybrid-units">Each module mock is a 20×20×20 isomesh, drawn into one registration cell. Each tile keeps its own archetype. Mock connectors stay separate. Preview depth is 0.35 registration units and is not production policy.</p>
      </Panel>
      <Panel className="hybrid-som">
        <div className="frame-title"><p className="eyebrow">03</p><h2 className="panel-title">Hybrid SOM Matrices</h2></div>
        <div className="hybrid-som-board">
          {connections.map((connection) => {
            const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
            const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
            const colorA = TYPOLOGY_COLOR[resolveTileModule(tileA?.archetypeId ?? "", loaded).identity?.typologyId ?? "lobby"];
            const colorB = TYPOLOGY_COLOR[resolveTileModule(tileB?.archetypeId ?? "", loaded).identity?.typologyId ?? "lobby"];
            return (
              <article key={connection.id} className="hybrid-som-mini">
                <ConnectionHeader connection={connection} />
                <ConnectionActions connection={connection} />
                <MockMatrix
                  signature={connection.signature}
                  selectedId={connection.selectedMockId}
                  onSelect={(id) => selectMock(connection.id, id)}
                  colorA={colorA}
                  colorB={colorB}
                />
                <p className="hybrid-units">{connection.selectedMockId} · mock · unverified</p>
                <div className="hybrid-axon">
                  <MeshPreview mesh={selectedMock(connection.signature, connection.selectedMockId).mesh} />
                </div>
                <p className="hybrid-similarity">Similarity · Pending</p>
                <p className="hybrid-pending">Production connector · Pending</p>
              </article>
            );
          })}
        </div>
      </Panel>
      <Panel className="hybrid-summary">
        <div className="frame-title"><p className="eyebrow">05</p><h2 className="panel-title">Connection Summary</h2></div>
        {connections.map((connection) => (
          <AssemblySummary key={connection.id} connection={connection} />
        ))}
      </Panel>
      <Panel className="hybrid-operations">
        <div className="frame-title"><p className="eyebrow">06</p><h2 className="panel-title">Aggregation Operations</h2></div>
        <p className="hybrid-pending">Repeat · Pending</p>
        <p className="hybrid-pending">Interlock · Pending</p>
      </Panel>
      </div>
    </main>
  );
}

function ConnectionActions({ connection }: { connection: TileConnection }) {
  const { generateInputs, tiles } = useHybrid();
  const [notice, setNotice] = useState<string | null>(null);
  const blocked = useConnectionBlocked(connection);
  const supported = mockPlacementSupported(connection, tiles);
  const field = connection.candidateField?.signature === connection.signature ? connection.candidateField : null;
  return (
    <>
      <button type="button" className="hybrid-generate" disabled={blocked} onClick={() => setNotice(generateInputs(connection.id))}>
        Generate candidate inputs
      </button>
      <p className="hybrid-units" data-input-readiness={field ? "ready" : blocked ? "blocked" : "not-generated"}>
        {blocked ? "Input readiness · blocked" : field ? "Input readiness · 25 candidate inputs" : "Input readiness · not generated"}
      </p>
      {notice ? <p className="hybrid-pending">{notice}</p> : null}
      <p className="hybrid-units">Validation · unverified · not physically connected</p>
      {!supported ? <p className="hybrid-pending">Unsupported placement · the selected faces do not meet on this adjacency.</p> : null}
    </>
  );
}

function AssemblySummary({ connection }: { connection: TileConnection }) {
  const { tiles } = useHybrid();
  const blocked = useConnectionBlocked(connection);
  return <p className="hybrid-summary-line" data-connection-summary={connection.id}>{mockSummary(connection, tiles, blocked)}</p>;
}
