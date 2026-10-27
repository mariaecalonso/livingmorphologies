"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { evaluateAggregation } from "@/lib/skill4/aggregation";
import { evaluateBooleanReadiness, inspectBooleanReadiness, type BooleanReadiness } from "@/lib/skill4/boolean-conditioning";
import { booleanExecutionKey, executeBooleanAssembly, type BooleanExecutionResult } from "@/lib/skill4/boolean-execution";
import { buildBooleanPlan } from "@/lib/skill4/boolean-plan";
import { buildInterlocks } from "@/lib/skill4/interlock";
import { CONNECTION_DEBUG_STAGE } from "@/lib/skill4/connection-debug";
import { resolveAssemblyHybrid } from "@/lib/skill4/assembly-hybrid";
import { growConnectionPair } from "@/lib/skill4/parent-transition";
import { gridShape } from "@/lib/skill4/assembly-layout";
import { geometryStatus, HybridTiles } from "./hybrid-tiles";
import { detectAdjacencies } from "@/lib/skill4/connections";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { generationStatusLabel } from "@/lib/skill4/hybrid-display";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { TypologyId } from "@/lib/types";
import { envelopeWidth, resolveTileModule, tileStep, type TileInstance } from "@/lib/skill4/tiles";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { FACE_HIGHLIGHT_COLOR, FACE_HIGHLIGHT_OPACITY, faceSurfaceHighlight } from "@/lib/skill4/face-outline";
import { Panel, PanelHeader } from "@/components/hud";
import { AggregationView } from "./aggregation-view";
import { MockMatrix } from "./mock-matrix";
import { SomCandidateFacts } from "./som-inspect";
import { ProcessRow } from "./process-row";
import { useHybrid } from "./hybrid-state";
import { HybridCatalog } from "./hybrid-catalog";
import { SyntheticTestToggle } from "./synthetic-test-toggle";
import { captureCatalogEntry, nextCatalogId } from "@/lib/skill4/catalog";
import { readCatalog, writeCatalog } from "@/lib/skill4/catalog-store";

const CANVAS_WHITE: [number, number, number] = [1, 1, 1];

function typologyOf(archetypeId: string, loaded: ReadonlyMap<string, ModuleHandoff>): TypologyId | null {
  return resolveTileModule(archetypeId, loaded).identity?.typologyId ?? null;
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
    growth,
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
  const span = tileStep(width) * (Math.max(shape.columns, shape.rows) - 1) + width;
  const detected = detectAdjacencies(tiles);
  const aggregation = evaluateAggregation(connections, tiles, loaded);
  const interlocks = buildInterlocks(aggregation, tiles, loaded);
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
  const showBoolean = CONNECTION_DEBUG_STAGE >= 5 && execution?.status === "ready";
  const joinedMesh = showBoolean && execution?.status === "ready" ? execution.assembly.mesh : null;
  const joinedTiles = new Set(showBoolean && execution?.status === "ready" ? execution.tiles.filter((tile) => tile.status === "ready").map((tile) => tile.tileId) : []);
  const liveHybrids = connections.map((connection) => {
    const preview = growth && growth.connectionId === connection.id && growth.candidateId === connection.selectedMockId ? growth : null;
    return { connection, preview, hybrid: resolveAssemblyHybrid(connection, tiles, loaded, preview?.mesh) };
  });
  const grownParents = new Map<string, IsoMesh>();
  const grownConnectors = new Map<string, IsoMesh>();
  for (const item of liveHybrids) {
    if (!item.hybrid.geometry || item.hybrid.source === "mock") continue;
    const tileA = tiles.find((tile) => tile.instanceId === item.connection.tileAId);
    const tileB = tiles.find((tile) => tile.instanceId === item.connection.tileBId);
    const moduleA = tileA ? loaded.get(tileA.archetypeId) : undefined;
    const moduleB = tileB ? loaded.get(tileB.archetypeId) : undefined;
    if (!tileA || !tileB || moduleA?.status !== "ready" || moduleB?.status !== "ready") continue;
    const grown = growConnectionPair(item.hybrid.geometry, tileA, tileB, moduleA, moduleB, item.connection.faceA, item.connection.faceB);
    if (!grown) continue;
    grownParents.set(tileA.instanceId, grown.parentA);
    grownParents.set(tileB.instanceId, grown.parentB);
    grownConnectors.set(item.connection.id, grown.connector);
  }
  const developmentShift = (tileId: string) => {
    for (const item of liveHybrids) {
      const shift = item.hybrid.development?.tileShift;
      if (shift?.tileId === tileId) return shift.offset;
    }
    return null;
  };
  const coveredFaces = new Set<string>();
  const placed: PlacedMesh[] = [
    ...tiles.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (!handoff.identity) return [];
      const handoffMesh = handoff.status === "ready" && (syntheticMode || handoff.source === "skill03") ? handoff.geometry : null;
      if (!handoffMesh) return [];
      const chosen = tile.instanceId === canvasSelection;
      const color = chosen ? TYPOLOGY_COLOR[handoff.identity.typologyId] : CANVAS_WHITE;
      const shift = developmentShift(tile.instanceId);
      const pose = {
        translate: shift
          ? { x: tile.transform.x + shift.x, y: tile.transform.y + shift.y, z: tile.transform.z + shift.z }
          : tile.transform,
        spin: 0,
        mirror: 0 as const,
        basis: tileBasis(tile),
      };
      const solids: PlacedMesh[] = joinedTiles.has(tile.instanceId) ? [] : [{
        id: tile.instanceId,
        mesh: grownParents.get(tile.instanceId) ?? handoffMesh,
        selected: chosen,
        kind: 0 as const,
        color,
        ...pose,
      }];
      if (!handoffMesh || handoff.status !== "ready") return solids;
      const current = connections.find((connection) => connection.id === selectedConnectionId && (connection.tileAId === tile.instanceId || connection.tileBId === tile.instanceId));
      const face = current
        ? (current.tileAId === tile.instanceId ? current.faceA : current.faceB)
        : null;
      const coat = face ? faceSurfaceHighlight(handoffMesh, handoff.faces[face]) : null;
      if (!coat || coveredFaces.has(`${tile.instanceId}:${face}`)) return solids;
      solids.push({
        id: `guide:${tile.instanceId}:${face}`,
        mesh: coat,
        selected: false,
        kind: 0,
        color: FACE_HIGHLIGHT_COLOR,
        opacity: FACE_HIGHLIGHT_OPACITY,
        ...pose,
      });
      return solids;
    }),
    ...liveHybrids.flatMap(({ connection, preview, hybrid }) => {
      if (!connection.selectedMockId) return [];
      if (!hybrid.geometry || hybrid.source === "mock") return [];
      const id = `${hybrid.source}:${connection.id}`;
      return [{
        id,
        mesh: grownConnectors.get(connection.id) ?? hybrid.geometry,
        translate: hybrid.translate,
        selected: id === canvasSelection,
        spin: hybrid.spin,
        kind: 1 as const,
        palette: true,
        opacity: preview ? preview.opacity : undefined,
      }, ...(hybrid.guides ? [{
        id: `contact:${connection.id}`,
        mesh: hybrid.guides,
        translate: hybrid.translate,
        selected: false,
        spin: 0,
        kind: 0 as const,
        color: [0.93, 0.28, 0.16] as [number, number, number],
      }] : [])];
    }),
  ];
  if (joinedMesh) {
    placed.push({
      id: "joined-assembly",
      mesh: joinedMesh,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      kind: 0,
      color: CANVAS_WHITE,
    });
  }
  const canvasDebugKey = placed.map((item) => `${item.id}:${item.mesh.triangles}:${item.mesh.positions.length}:${item.palette ? "hybrid" : "solid"}`).join("|");
  useEffect(() => {
    const rows = placed.map((item) => {
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < item.mesh.positions.length; index += 3) {
        minX = Math.min(minX, item.mesh.positions[index]);
        minY = Math.min(minY, item.mesh.positions[index + 1]);
        minZ = Math.min(minZ, item.mesh.positions[index + 2]);
        maxX = Math.max(maxX, item.mesh.positions[index]);
        maxY = Math.max(maxY, item.mesh.positions[index + 1]);
        maxZ = Math.max(maxZ, item.mesh.positions[index + 2]);
      }
      return {
        source: item.id.startsWith("real:") ? "ASSEMBLY_HYBRID" : item.id === "joined-assembly" ? "BOOLEAN_RESULT" : item.id.startsWith("guide:") ? "FACE_HIGHLIGHT" : "PARENT",
        id: item.id,
        vertices: item.mesh.positions.length / 3,
        triangles: item.mesh.triangles,
        bounds: [maxX - minX, maxY - minY, maxZ - minZ].map((value) => Number(value.toFixed(2))),
        palette: item.palette === true,
        opacity: item.opacity ?? 1,
        stage: CONNECTION_DEBUG_STAGE,
        generator: item.id.startsWith("real:") ? "rigidCopy" : item.id === "joined-assembly" ? "executeBooleanAssembly" : "parent mesh",
      };
    });
    console.info("[connection-debug] canvas meshes", rows);
  }, [canvasDebugKey]);
  const canvasModules = tiles.map((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    return handoff.status === "ready" ? handoff.moduleId : "";
  }).join(" ");
  const canvasSource = syntheticMode
    ? "synthetic"
    : tiles.every((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      return handoff.status === "ready" && handoff.source === "skill03" && handoff.selectedFinal;
    })
      ? "skill03"
      : "mock";
  return (
    <main className="hybrid-view hybrid-assembly">
      {catalogNotice ? <p className="hybrid-units">{catalogNotice}</p> : null}
      {generationNotice ? <p className="hybrid-pending">{generationNotice}</p> : null}
      <SyntheticTestToggle />
      <Panel className="hybrid-tile major-section-frame">
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
      <Panel className="hybrid-canvas major-section-frame">
        <PanelHeader mark="02" title="Aggregation Canvas" />
        <div className="hybrid-stage" data-canvas-source={canvasSource} data-canvas-modules={canvasModules} data-canvas-selection={canvasSelection ?? ""} data-tile-pose={tiles.map((tile) => `${tile.instanceId}:${tile.rotationQuarter}:${tile.mirror ?? "none"}:${tile.transform.x.toFixed(2)},${tile.transform.y.toFixed(2)},${tile.transform.z.toFixed(2)}:${(tile.rotation ?? tileBasis(tile)).map((value) => value.toFixed(2)).join(",")}`).join("|")}>
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
              if (connection.id !== selectedConnectionId) return [];
              const marker = detected.find((item) => item.id === connection.id)?.marker;
              if (!marker) return [];
              return [{
                id: connection.id,
                label: `${connection.tileAId}:${connection.faceA} ↔ ${connection.tileBId}:${connection.faceB}`,
                point: marker,
                active: true,
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
                  <span>{tile.archetypeId ? (handoff.identity?.name ?? tile.archetypeId) : "Select geometry"}</span>
                  <span>{tile.archetypeId ? status.label : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>
      <Panel className="hybrid-som major-section-frame">
        <PanelHeader mark="03" title="Hybrid SOM Matrices" aside={<SaveCurrentAssembly />} />
        <div className="hybrid-som-board">
          {connections.length === 0 ? <p className="hybrid-missing">Select two geometries and connection faces to generate SOM</p> : null}
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
                {connection.generatedHybridField ? <MockMatrix
                  signature={connection.signature}
                  selectedId={connection.selectedMockId}
                  generatedField={connection.generatedHybridField}
                  onSelect={(id) => selectMock(connection.id, id)}
                  colorA={colorA}
                  colorB={colorB}
                  previewId={growth?.connectionId === connection.id ? growth.candidateId : null}
                  previewMesh={growth?.connectionId === connection.id ? growth.mesh : null}
                /> : <p className="hybrid-missing">Select two geometries and connection faces to generate SOM</p>}
                <div className="hybrid-layout-controls">
                  <button type="button" className="hybrid-generate" onClick={() => setGenerationNotice(generateInputs(connection.id))}>
                    Generate candidate inputs
                  </button>
                  <button type="button" className="hybrid-generate" onClick={() => setGenerationNotice(generateHybridFieldForConnection(connection.id))}>
                    Generate real hybrids
                  </button>
                </div>
                <p className="hybrid-units">{generationStatusLabel(connection.generationStatus)}</p>
                <SomCandidateFacts
                  connection={{
                    id: connection.id,
                    signature: connection.signature,
                    faceA: connection.faceA,
                    faceB: connection.faceB,
                    tileAId: connection.tileAId,
                    tileBId: connection.tileBId,
                    parentAName: resolveTileModule(tileA?.archetypeId ?? "", loaded).identity?.name ?? connection.tileAId,
                    parentBName: resolveTileModule(tileB?.archetypeId ?? "", loaded).identity?.name ?? connection.tileBId,
                    selectedId: connection.selectedMockId,
                    generatedField: connection.generatedHybridField,
                  }}
                />
              </article>
            );
          })}
        </div>
      </Panel>
      <ProcessRow
        connection={connections.find((connection) => connection.id === selectedConnectionId) ?? connections[0] ?? null}
        tiles={tiles}
        loaded={loaded}
        syntheticMode={syntheticMode}
        growth={growth}
      />
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
