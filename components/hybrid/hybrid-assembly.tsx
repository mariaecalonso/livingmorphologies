"use client";

import { columnHeight } from "@/lib/scan/isomesh";
import { VIEW_SCAN } from "@/lib/skill4/contract";
import { aggregationAssemblyLabel, aggregationStatusLabel, evaluateAggregation, type AggregationStatus } from "@/lib/skill4/aggregation";
import { booleanPlanLabel, buildBooleanPlan } from "@/lib/skill4/boolean-plan";
import { buildInterlocks, interlockAssemblyLabel } from "@/lib/skill4/interlock";
import { resolveAssemblyHybrid } from "@/lib/skill4/assembly-hybrid";
import { gridShape, mockSummary } from "@/lib/skill4/assembly-layout";
import { geometryStatus, HybridTiles } from "./hybrid-tiles";
import { detectAdjacencies } from "@/lib/skill4/connections";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { hybridDisplay } from "@/lib/skill4/hybrid-display";
import { envelopeWidth, resolveTileModule } from "@/lib/skill4/tiles";
import { moduleMock, TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { Panel, PanelHeader } from "@/components/hud";
import { AggregationView } from "./aggregation-view";
import { MockMatrix } from "./mock-matrix";
import { useConnectionBlocked, useHybrid } from "./hybrid-state";
import type { TileConnection } from "@/lib/skill4/connections";

const MIRROR = { x: 1, y: 2, z: 3 } as const;

export function HybridAssembly() {
  const {
    loaded,
    tiles,
    connections,
    selectedId,
    setSelectedId,
    selectedConnectionId,
    focusConnection,
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
  const aggregation = evaluateAggregation(connections, tiles, loaded);
  const interlocks = buildInterlocks(aggregation, tiles);
  const booleanPlan = buildBooleanPlan(interlocks);
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
      const hybrid = resolveAssemblyHybrid(connection, tiles, loaded);
      if (!hybrid.geometry) return [];
      return [{
        id: `${hybrid.source}:${connection.id}`,
        mesh: hybrid.geometry,
        translate: hybrid.translate,
        selected: connection.id === selectedConnectionId,
        spin: hybrid.spin,
        kind: 1 as const,
        color: [0.85, 0.62, 0.48] as [number, number, number],
      }];
    }),
  ];

  return (
    <main className="hybrid-view hybrid-assembly">
      <Panel className="hybrid-tile">
        <PanelHeader kicker="01" title="Tile Selection" />
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
        <PanelHeader kicker="02" title="Aggregation Canvas" />
        <div className="hybrid-stage">
          <AggregationView
            instances={placed}
            selectedId={selectedId}
            onSelect={setSelectedId}
            connectionLabel={connections[0] ? `${connections[0].tileAId}:${connections[0].faceA} ↔ ${connections[0].tileBId}:${connections[0].faceB}` : null}
            connectionPoint={detected[0]?.marker ?? null}
            connectionActive={connections[0]?.id === selectedConnectionId}
            onSelectConnection={() => connections[0] && focusConnection(connections[0].id)}
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
        <p className="hybrid-units">Each module mock is a 20×20×20 isomesh, drawn into one registration cell. Lobby is terracotta, workspace is white, gathering is cyan. A stored connector is mapped so its end rings meet the two placed faces. Before generation, the placeholder stays on the contact. Preview depth is 0.35 registration units and is not production policy.</p>
      </Panel>
      <Panel className="hybrid-som">
        <PanelHeader kicker="03" title="Hybrid SOM Matrices" />
        <div className="hybrid-som-board">
          {connections.map((connection) => {
            const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
            const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
            const colorA = TYPOLOGY_COLOR[resolveTileModule(tileA?.archetypeId ?? "", loaded).identity?.typologyId ?? "lobby"];
            const colorB = TYPOLOGY_COLOR[resolveTileModule(tileB?.archetypeId ?? "", loaded).identity?.typologyId ?? "lobby"];
            return (
              <article key={connection.id} className="hybrid-som-mini">
                <button type="button" className="hybrid-connection-label" onClick={() => focusConnection(connection.id)}>
                  {connection.tileAId}:{connection.faceA} ↔ {connection.tileBId}:{connection.faceB}
                </button>
                <MockMatrix
                  signature={connection.signature}
                  selectedId={connection.selectedMockId}
                  generatedField={connection.generatedHybridField}
                  onSelect={(id) => selectMock(connection.id, id)}
                  colorA={colorA}
                  colorB={colorB}
                />
                <AssemblySelection connection={connection} />
              </article>
            );
          })}
        </div>
      </Panel>
      <Panel className="hybrid-summary">
        <PanelHeader kicker="05" title="Connection Summary" />
        <p className="hybrid-units" data-aggregation={aggregation.status}>
          {aggregationAssemblyLabel(aggregation.status)} · {aggregation.readyCount} / {aggregation.connections.length} connections ready
        </p>
        {connections.map((connection) => (
          <AssemblySummary key={connection.id} connection={connection} status={aggregation.connections.find((item) => item.connectionId === connection.id)?.status} />
        ))}
      </Panel>
      <Panel className="hybrid-operations">
        <PanelHeader kicker="06" title="Aggregation Operations" />
        <p className="hybrid-units" data-interlock={interlocks.status}>
          INTERLOCK GEOMETRY · {interlockAssemblyLabel(interlocks.status)} · {interlocks.readyCount} / {interlocks.connections.length}
        </p>
        <p className="hybrid-units" data-boolean-plan={booleanPlan.status}>
          BOOLEAN PLAN · {booleanPlanLabel(booleanPlan.status)} · {booleanPlan.readyConnectionCount} / {booleanPlan.connections.length}
        </p>
        {booleanPlan.tiles.map((tile) => (
          <p key={tile.tileId} className="hybrid-units" data-boolean-tile={tile.tileId}>
            Tile {tile.tileId} · {tile.operations.length} cuts{tile.operations.some((cut) => cut.potentialCutConflict) ? " · potential conflict" : ""}
          </p>
        ))}
        <p className="hybrid-pending">Repeat · Pending</p>
      </Panel>
    </main>
  );
}

function AssemblySelection({ connection }: { connection: TileConnection }) {
  const display = hybridDisplay(connection);
  const note = display.source === "mock" ? "mock · unverified" : display.selected.label;
  return <p className="hybrid-units">{display.selected.id} · {note}</p>;
}

function AssemblySummary({ connection, status }: { connection: TileConnection; status?: AggregationStatus }) {
  const { tiles } = useHybrid();
  const blocked = useConnectionBlocked(connection);
  const fit = status ? ` · ${aggregationStatusLabel(status)}` : "";
  return <p className="hybrid-summary-line" data-connection-summary={connection.id} data-aggregation-status={status}>{mockSummary(connection, tiles, blocked)}{fit}</p>;
}
