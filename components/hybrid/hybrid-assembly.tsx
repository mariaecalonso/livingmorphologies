"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { columnHeight, type IsoMesh } from "@/lib/scan/isomesh";
import { VIEW_SCAN } from "@/lib/skill4/contract";
import { aggregationAssemblyLabel, aggregationStatusLabel, evaluateAggregation, type AggregationStatus } from "@/lib/skill4/aggregation";
import { booleanReadinessLabel, evaluateBooleanReadiness, inspectBooleanReadiness, type BooleanReadiness } from "@/lib/skill4/boolean-conditioning";
import { booleanExecutionKey, booleanExecutionLabel, executeBooleanAssembly, type BooleanExecutionResult } from "@/lib/skill4/boolean-execution";
import { booleanPlanLabel, buildBooleanPlan } from "@/lib/skill4/boolean-plan";
import { buildInterlocks, interlockAssemblyLabel } from "@/lib/skill4/interlock";
import { resolveAssemblyHybrid } from "@/lib/skill4/assembly-hybrid";
import { gridShape, mockPlacementSupported } from "@/lib/skill4/assembly-layout";
import { geometryStatus, HybridTiles } from "./hybrid-tiles";
import { detectAdjacencies } from "@/lib/skill4/connections";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { generationStatusLabel, hybridDisplay } from "@/lib/skill4/hybrid-display";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { TypologyId } from "@/lib/types";
import { envelopeWidth, resolveTileModule } from "@/lib/skill4/tiles";
import { moduleMock, TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { faceFrameOutline } from "@/lib/skill4/face-outline";
import { Panel, PanelHeader } from "@/components/hud";
import { AggregationView } from "./aggregation-view";
import { MockMatrix } from "./mock-matrix";
import { MeshPreview } from "./mesh-preview";
import { useConnectionBlocked, useHybrid } from "./hybrid-state";
import { ConnectionHeader } from "./connection-header";
import { HybridCatalog } from "./hybrid-catalog";
import { SyntheticTestToggle } from "./synthetic-test-toggle";
import { captureCatalogEntry, nextCatalogId } from "@/lib/skill4/catalog";
import { readCatalog, writeCatalog } from "@/lib/skill4/catalog-store";
import type { TileConnection } from "@/lib/skill4/connections";

const MIRROR = { x: 1, y: 2, z: 3 } as const;
const CANVAS_WHITE: [number, number, number] = [1, 1, 1];

function typologyOf(archetypeId: string, loaded: ReadonlyMap<string, ModuleHandoff>): TypologyId | null {
  return resolveTileModule(archetypeId, loaded).identity?.typologyId ?? null;
}

function hybridSelectionColor(
  connection: TileConnection,
  tiles: readonly { instanceId: string; archetypeId: string }[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  selectedId: string,
): [number, number, number] | null {
  const selected = tiles.find((tile) => tile.instanceId === selectedId);
  if (selected && (selected.instanceId === connection.tileAId || selected.instanceId === connection.tileBId)) {
    const typology = typologyOf(selected.archetypeId, loaded);
    return typology ? TYPOLOGY_COLOR[typology] : null;
  }
  const left = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const right = tiles.find((tile) => tile.instanceId === connection.tileBId);
  const typologyA = left ? typologyOf(left.archetypeId, loaded) : null;
  const typologyB = right ? typologyOf(right.archetypeId, loaded) : null;
  if (typologyA && typologyA === typologyB) return TYPOLOGY_COLOR[typologyA];
  return null;
}

export function HybridAssembly({ view = "process" }: { view?: "process" | "catalog" }) {
  if (view === "catalog") return <HybridCatalog />;
  const {
    loaded,
    tiles,
    connections,
    selectedId,
    setSelectedId,
    selectedConnectionId,
    focusConnection,
    selectMock,
    generateInputs,
    generateHybridFieldForConnection,
    catalogNotice,
    count,
    arrangement,
    setLayout,
    rotateSelected,
    mirrorSelected,
    translateSelected,
    syntheticMode,
    canvasSelection,
    setCanvasSelection,
  } = useHybrid();
  const width = envelopeWidth();
  const shape = gridShape(count, arrangement);
  const span = Math.max(columnHeight(VIEW_SCAN.spacing, VIEW_SCAN.yaw), width * Math.max(shape.columns, shape.rows));
  const detected = detectAdjacencies(tiles);
  const aggregation = evaluateAggregation(connections, tiles, loaded);
  const interlocks = buildInterlocks(aggregation, tiles);
  const booleanPlan = buildBooleanPlan(interlocks);
  const executionKey = booleanExecutionKey(booleanPlan, tiles);
  const [execution, setExecution] = useState<BooleanExecutionResult | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const executionInput = useRef({ booleanPlan, tiles, loaded });
  executionInput.current = { booleanPlan, tiles, loaded };
  useEffect(() => {
    if (executionInput.current.booleanPlan.readyConnectionCount === 0) {
      setExecution(null);
      return;
    }
    let cancel = false;
    void executeBooleanAssembly(executionInput.current.booleanPlan, executionInput.current.tiles, executionInput.current.loaded).then((result) => {
      if (!cancel) setExecution(result);
    });
    return () => {
      cancel = true;
    };
  }, [executionKey]);
  const readinessKey = tiles.map((tile) => `${tile.instanceId}:${tile.archetypeId}`).join("|");
  const [kernelReadiness, setKernelReadiness] = useState<ReadonlyMap<string, BooleanReadiness>>(new Map());
  useEffect(() => {
    let cancel = false;
    const pending = tiles.flatMap((tile) => {
      const module = loaded.get(tile.archetypeId);
      if (!module || module.status !== "ready" || !module.geometry) return [];
      return inspectBooleanReadiness(module.geometry).reason === "kernel-unchecked" ? [tile] : [];
    });
    if (pending.length === 0) {
      setKernelReadiness(new Map());
      return;
    }
    void Promise.all(pending.map(async (tile) => {
      const module = loaded.get(tile.archetypeId);
      if (!module || module.status !== "ready" || !module.geometry) return null;
      return [tile.instanceId, await evaluateBooleanReadiness(module.geometry)] as const;
    })).then((rows) => {
      if (cancel) return;
      setKernelReadiness(new Map(rows.filter((row): row is readonly [string, BooleanReadiness] => row !== null)));
    });
    return () => {
      cancel = true;
    };
  }, [readinessKey, loaded, tiles]);
  const executionStatus = booleanPlan.readyConnectionCount === 0 ? "unresolved" : execution?.status;
  const placed: PlacedMesh[] = [
    ...tiles.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (!handoff.identity) return [];
      const syntheticMesh = syntheticMode && handoff.status === "ready" ? handoff.geometry : null;
      const chosen = tile.instanceId === canvasSelection;
      const color = chosen ? TYPOLOGY_COLOR[handoff.identity.typologyId] : CANVAS_WHITE;
      const pose = {
        translate: tile.transform,
        spin: tile.rotationQuarter * Math.PI / 2,
        mirror: (tile.mirror ? MIRROR[tile.mirror] : 0) as 0 | 1 | 2 | 3,
      };
      const solids: PlacedMesh[] = [{
        id: tile.instanceId,
        mesh: syntheticMesh ?? moduleMock(tile.archetypeId),
        selected: chosen,
        kind: 0 as const,
        color,
        ...pose,
      }];
      if (!syntheticMesh || handoff.status !== "ready") return solids;
      const involved = connections.filter((connection) => connection.tileAId === tile.instanceId || connection.tileBId === tile.instanceId);
      const current = involved.find((connection) => connection.id === selectedConnectionId) ?? involved[0];
      const face = current
        ? (current.tileAId === tile.instanceId ? current.faceA : current.faceB)
        : null;
      if (!face) return solids;
      solids.push({
        id: `guide:${tile.instanceId}:${face}`,
        mesh: faceFrameOutline(handoff.faces[face]),
        selected: false,
        kind: 1,
        color: chosen ? color : CANVAS_WHITE,
        ...pose,
      });
      return solids;
    }),
    ...connections.flatMap((connection) => {
      const hybrid = resolveAssemblyHybrid(connection, tiles, loaded);
      if (!hybrid.geometry) return [];
      const id = `${hybrid.source}:${connection.id}`;
      const chosen = id === canvasSelection;
      return [{
        id,
        mesh: hybrid.geometry,
        translate: hybrid.translate,
        selected: chosen,
        spin: hybrid.spin,
        kind: 1 as const,
        color: chosen ? hybridSelectionColor(connection, tiles, loaded, selectedId) ?? CANVAS_WHITE : CANVAS_WHITE,
      }];
    }),
  ];

  return (
    <main className="hybrid-view hybrid-assembly">
      {catalogNotice ? <p className="hybrid-units">{catalogNotice}</p> : null}
      {generationNotice ? <p className="hybrid-pending">{generationNotice}</p> : null}
      <SyntheticTestToggle />
      <Panel className="hybrid-tile">
        <PanelHeader mark="01" title="Tile Selection" />
        <div className="hybrid-layout-controls hybrid-count-row">
          {([2, 4, 6, 8] as const).map((value) => (
            <button key={value} type="button" data-active={(arrangement === "grid" || arrangement === "linear") && count === value || undefined} onClick={() => setLayout(value, arrangement === "linear" ? "linear" : "grid")}>
              {value}
            </button>
          ))}
          <button type="button" data-active={arrangement === "linear" || undefined} onClick={() => setLayout(arrangement === "t" || arrangement === "cross" ? 4 : count, "linear")}>
            Linear
          </button>
          <button type="button" data-active={arrangement === "grid" || undefined} onClick={() => setLayout(arrangement === "t" || arrangement === "cross" ? 4 : count, "grid")}>
            Grid
          </button>
          <button type="button" data-active={arrangement === "t" || undefined} onClick={() => setLayout(4, "t")}>
            T
          </button>
          <button type="button" data-active={arrangement === "cross" || undefined} onClick={() => setLayout(4, "cross")}>
            Cross
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
        <PanelHeader mark="02" title="Aggregation Canvas" />
        <div className="hybrid-stage" data-canvas-source={syntheticMode ? "synthetic" : "mock"} data-canvas-selection={canvasSelection ?? ""}>
          <AggregationView
            instances={placed}
            selectedId={canvasSelection ?? ""}
            onSelect={(id) => {
              if (!id) {
                setCanvasSelection(null);
                setSelectedId("");
                return;
              }
              setCanvasSelection(id);
              if (!id.includes(":")) setSelectedId(id);
            }}
            links={connections.flatMap((connection) => {
              const marker = detected.find((item) => item.id === connection.id)?.marker;
              if (!marker) return [];
              return [{
                id: connection.id,
                label: `${connection.tileAId}:${connection.faceA} ↔ ${connection.tileBId}:${connection.faceB}`,
                point: marker,
                active: connection.id === selectedConnectionId,
              }];
            })}
            onSelectConnection={focusConnection}
            span={span}
          />
          <div className="hybrid-stage-keys">
            {tiles.map((tile) => {
              const handoff = resolveTileModule(tile.archetypeId, loaded);
              const status = geometryStatus(handoff);
              return (
                <button key={tile.instanceId} type="button" data-active={tile.instanceId === canvasSelection || undefined} onClick={() => { setSelectedId(tile.instanceId); setCanvasSelection(tile.instanceId); }}>
                  <span>{tile.instanceId}</span>
                  <span>{handoff.identity?.name ?? tile.archetypeId}</span>
                  <span>{status.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>
      <Panel className="hybrid-som">
        <PanelHeader mark="03" title="Hybrid SOM Matrices" />
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
                <div className="hybrid-layout-controls">
                  <button type="button" className="hybrid-generate" onClick={() => setGenerationNotice(generateInputs(connection.id))}>
                    Generate candidate inputs
                  </button>
                  <button type="button" className="hybrid-generate" onClick={() => setGenerationNotice(generateHybridFieldForConnection(connection.id))}>
                    Generate real hybrids
                  </button>
                </div>
                <p className="hybrid-units">{generationStatusLabel(connection.generationStatus)}</p>
                <AssemblySelection connection={connection} />
              </article>
            );
          })}
        </div>
      </Panel>
      <Panel className="hybrid-summary">
        <PanelHeader mark="04" title="Connection Summary" />
        <p className="hybrid-units" data-aggregation={aggregation.status}>
          {aggregationAssemblyLabel(aggregation.status)} · {aggregation.readyCount} / {aggregation.connections.length} connections ready
        </p>
        <div className="hybrid-record-board">
          {connections.map((connection) => (
            <ConnectionRecord
              key={connection.id}
              connection={connection}
              status={aggregation.connections.find((item) => item.connectionId === connection.id)?.status}
              onOpen={() => focusConnection(connection.id)}
            />
          ))}
        </div>
      </Panel>
      <Panel className="hybrid-operations">
        <PanelHeader mark="05" title="Aggregation Operations" aside={<SaveCurrentAssembly />} />
        <div className="hybrid-record-board">
          <OperationRecord
            title="Interlock"
            status={`${interlockAssemblyLabel(interlocks.status)} · ${interlocks.readyCount} / ${interlocks.connections.length}`}
            mesh={interlocks.connections.find((item) => item.insertionA)?.insertionA ?? null}
            empty={interlockAssemblyLabel(interlocks.status)}
            note={interlocks.connections.find((item) => item.insertionA) ? "Insertion volume" : "No insertion geometry"}
            marker="interlock"
            markerValue={interlocks.status}
          />
          <OperationRecord
            title="Boolean plan"
            status={`${booleanPlanLabel(booleanPlan.status)} · ${booleanPlan.readyConnectionCount} / ${booleanPlan.connections.length}`}
            mesh={booleanPlan.connections.find((item) => item.connectorGeometry)?.connectorGeometry ?? null}
            empty={booleanPlanLabel(booleanPlan.status)}
            note={booleanPlan.connections.find((item) => item.connectorGeometry) ? "Recorded connector" : "No recorded connector"}
            marker="boolean-plan"
            markerValue={booleanPlan.status}
          >
            {booleanPlan.tiles.map((tile) => (
              <p key={tile.tileId} className="hybrid-units" data-boolean-tile={tile.tileId}>
                Tile {tile.tileId} · {tile.operations.length} cuts{tile.operations.some((cut) => cut.potentialCutConflict) ? " · potential conflict" : ""}
              </p>
            ))}
          </OperationRecord>
          <OperationRecord
            title="Boolean execution"
            status={executionStatus ? booleanExecutionLabel(executionStatus) : "…"}
            mesh={executionPreview(execution).mesh}
            empty={executionStatus ? booleanExecutionLabel(executionStatus) : "Unresolved"}
            note={executionPreview(execution).note}
            marker="boolean-execution"
            markerValue={executionStatus ?? "pending"}
          >
            {execution?.tiles.map((tile) => (
              <p key={`execution-${tile.tileId}`} className="hybrid-units" data-boolean-execution-tile={tile.tileId}>
                Tile {tile.tileId} · {tile.successfulCutCount} / {tile.plannedCutCount} cuts
              </p>
            ))}
          </OperationRecord>
          <OperationRecord
            title="Physical tile readiness"
            status={tiles.every((tile) => kernelReadiness.get(tile.instanceId)?.booleanReady) && tiles.length > 0 ? booleanReadinessLabel("ready") : "NOT READY"}
            mesh={null}
            empty={tiles.length > 0 && tiles.every((tile) => kernelReadiness.get(tile.instanceId)?.booleanReady) ? "Ready" : "Not ready"}
            note="No conditioned tile solid"
          >
            {tiles.map((tile) => {
              const module = loaded.get(tile.archetypeId);
              const inspected = module?.status === "ready" && module.geometry ? inspectBooleanReadiness(module.geometry) : null;
              const readiness = kernelReadiness.get(tile.instanceId) ?? inspected;
              const components = readiness ? `${readiness.componentCount} component${readiness.componentCount === 1 ? "" : "s"}` : "";
              const edges = readiness && readiness.nonManifoldEdgeCount > 0 ? ` · ${readiness.nonManifoldEdgeCount} non-manifold edges` : "";
              const kernel = readiness?.kernelStatus && readiness.kernelStatus !== "NoError" ? ` · ${readiness.kernelStatus}` : "";
              return (
                <p key={`readiness-${tile.instanceId}`} className="hybrid-units" data-physical-readiness={tile.instanceId}>
                  {tile.instanceId} · {readiness?.booleanReady ? booleanReadinessLabel("ready") : "NOT READY"}
                  {readiness ? ` · ${readiness.boundaryEdgeCount} boundary edges · ${components}${edges}${kernel}` : ""}
                </p>
              );
            })}
          </OperationRecord>
          <OperationRecord title="Repeat" status="Pending" mesh={null} empty="Pending" note="Not computed" />
        </div>
      </Panel>
    </main>
  );
}

function SaveCurrentAssembly() {
  const { loaded, tiles, connections, count, arrangement, syntheticMode } = useHybrid();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const save = () => {
    try {
      const entry = captureCatalogEntry(nextCatalogId(readCatalog()), tiles, connections, count, arrangement, loaded, syntheticMode);
      writeCatalog([entry, ...readCatalog()]);
      setNotice(`Saved to catalog · ${entry.id}`);
    } catch {
      setNotice("The catalog could not be saved in this browser.");
    }
  };
  return (
    <div className="hybrid-layout-controls" data-save-assembly="">
      <button type="button" className="hybrid-generate" onClick={save}>
        Save current assembly
      </button>
      {notice ? (
        <>
          <p className="hybrid-units" data-save-notice="">{notice}</p>
          <Link href="/lab/hybrid/catalog" className="hybrid-generate">View catalog</Link>
        </>
      ) : null}
    </div>
  );
}

function ConnectionRecord({
  connection,
  status,
  onOpen,
}: {
  connection: TileConnection;
  status?: AggregationStatus;
  onOpen: () => void;
}) {
  const { tiles } = useHybrid();
  const blocked = useConnectionBlocked(connection);
  const display = hybridDisplay(connection);
  const generated = display.source === "generated";
  const mesh = generated ? display.selected.mesh : null;
  const placement = mockPlacementSupported(connection, tiles) ? "" : " · unsupported placement";
  return (
    <article className="hybrid-record" data-connection-summary={connection.id} data-aggregation-status={status}>
      <ConnectionHeader connection={connection} openOnSelect />
      <button type="button" className="hybrid-connection-label" onClick={onOpen}>
        {connection.tileAId}:{connection.faceA} ↔ {connection.tileBId}:{connection.faceB}
      </button>
      <RecordPreview mesh={mesh} label={generated ? display.selected.label : "Not generated"} />
      <p className="hybrid-identity">{display.selected.id}</p>
      <p className="hybrid-units">{connection.tileAId}:{connection.faceA} · {connection.tileBId}:{connection.faceB}</p>
      <p className="hybrid-units">
        {blocked ? "Blocked" : `Generation · ${generationStatusLabel(connection.generationStatus)}`}
        {status ? ` · Fit · ${aggregationStatusLabel(status)}` : ""}
        {placement}
      </p>
    </article>
  );
}

function executionPreview(execution: BooleanExecutionResult | null) {
  if (execution?.assembly.mesh) return { mesh: execution.assembly.mesh, note: "Assembly union" };
  const addition = execution?.connections.find((item) => item.additionGeometry);
  if (addition?.additionGeometry) return { mesh: addition.additionGeometry, note: "Connector union" };
  const tile = execution?.tiles.find((item) => item.derivedGeometry);
  if (tile?.derivedGeometry) return { mesh: tile.derivedGeometry, note: `Tile ${tile.tileId} derived` };
  return { mesh: null, note: "No boolean result" };
}

function OperationRecord({
  title,
  status,
  mesh,
  empty,
  note,
  marker,
  markerValue,
  children,
}: {
  title: string;
  status: string;
  mesh: IsoMesh | null;
  empty: string;
  note: string;
  marker?: string;
  markerValue?: string;
  children?: ReactNode;
}) {
  return (
    <article className="hybrid-record" {...(marker ? { [`data-${marker}`]: markerValue } : {})}>
      <p className="hybrid-connection-label">{title}</p>
      <RecordPreview mesh={mesh} label={empty} />
      <p className="hybrid-units">{status}</p>
      <p className="hybrid-units">{note}</p>
      {children}
    </article>
  );
}

function RecordPreview({ mesh, label }: { mesh: IsoMesh | null; label: string }) {
  return (
    <div className="hybrid-record-preview">
      {mesh ? <MeshPreview mesh={mesh} /> : <p className="hybrid-matrix-pending">{label}</p>}
    </div>
  );
}

function AssemblySelection({ connection }: { connection: TileConnection }) {
  const display = hybridDisplay(connection);
  const note = display.source === "mock" ? "mock · unverified" : display.selected.label;
  return <p className="hybrid-units">{display.selected.id} · {note}</p>;
}
