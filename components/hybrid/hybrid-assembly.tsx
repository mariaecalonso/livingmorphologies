"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { evaluateAggregation } from "@/lib/skill4/aggregation";
import { evaluateBooleanReadiness, inspectBooleanReadiness, type BooleanReadiness } from "@/lib/skill4/boolean-conditioning";
import { booleanExecutionKey, executeBooleanAssembly, type BooleanExecutionResult } from "@/lib/skill4/boolean-execution";
import { buildBooleanPlan } from "@/lib/skill4/boolean-plan";
import { buildInterlocks } from "@/lib/skill4/interlock";
import { CONNECTION_DEBUG_STAGE } from "@/lib/skill4/connection-debug";
import { resolveAssemblyHybrid } from "@/lib/skill4/assembly-hybrid";
import { analyzeShrinkwrapVoid, placeTileMesh, type ShrinkwrapVoidReport } from "@/lib/skill4/cluster-void";
import { currentGeneratedField } from "@/lib/skill4/hybrid-display";
import { growConnectionPair } from "@/lib/skill4/parent-transition";
import { gridShape } from "@/lib/skill4/assembly-layout";
import { geometryStatus, HybridTiles } from "./hybrid-tiles";
import { detectAdjacencies, type TileConnection } from "@/lib/skill4/connections";
import type { Vec3 } from "@/lib/skill4/contract";
import { modelUnitsToFeet } from "@/lib/skill4/scale";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { FinishedIteration } from "@/lib/skill4/finished-catalog";
import { ClusterCriteriaView } from "./cluster-analysis-view";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
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
import { useAssemblyFilm } from "./validation-panel";
import { useHybrid } from "./hybrid-state";
import { HybridCatalog } from "./hybrid-catalog";
import { ClusterAnalysisBoard } from "./cluster-analysis-board";
import { SyntheticTestToggle } from "./synthetic-test-toggle";
import { captureCatalogEntry, nextCatalogId } from "@/lib/skill4/catalog";
import { readCatalog, writeCatalog } from "@/lib/skill4/catalog-store";

const CANVAS_WHITE: [number, number, number] = [1, 1, 1];
const VOID_TEAL: [number, number, number] = [0.22, 0.42, 0.36];
const VOID_ALPHA = 0.46;
/**
 * Void graphic under test.
 * Style A is the saved shell: plain shading, VOID_TEAL, opacity 0.46, outer faces only, no crease lines.
 * Style B is the kept glow: terracotta at the base, teal above, soft falloff. The solid stays white.
 */
const VOID_STYLE: "A" | "B" = "B";
const VOID_LOOK = VOID_STYLE === "A"
  ? { color: VOID_TEAL, opacity: VOID_ALPHA, plain: true as const }
  : { color: VOID_TEAL, opacity: 1, glow: true as const };

function StudyHead({ mark, title, aside }: { mark: string; title: string; aside?: ReactNode }) {
  return (
    <header className="panel-header cluster-study-head">
      <div className="panel-header-content">
        <p className="eyebrow">{mark}</p>
        <h2 className="panel-title">{title}</h2>
      </div>
      {aside ? <div className="panel-header-aside">{aside}</div> : null}
    </header>
  );
}

function StudyView({ instances, span, yaw = 0.9, pitch = -0.48 }: { instances: readonly PlacedMesh[]; span: number; yaw?: number; pitch?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fitCache = useRef<{ width: number; height: number; signature: string; fit: number; center: { x: number; y: number; z: number } } | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; button: number; shift: boolean } | null>(null);
  const [view, setView] = useState({ yaw, pitch, zoom: 1, panX: 0, panY: 0, panZ: 0 });
  const key = `${span}:${instances.map((instance) => `${instance.id}:${instance.opacity ?? 1}:${instance.hold ? "hold" : "draw"}:${instance.mesh.triangles}`).join("|")}`;
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const signature = `${span}:${instances.map((instance) => `${instance.id}:${instance.mesh.triangles}`).join("|")}`;
    const draw = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 8 || height < 8) return;
      const cached = fitCache.current;
      if (cached && cached.width === width && cached.height === height && cached.signature === signature) {
        const look = { x: cached.center.x + view.panX, y: cached.center.y + view.panY, z: cached.center.z + view.panZ };
        drawPlacedMeshes(canvas, instances, view.yaw, view.pitch, Math.max(8, span), false, 4.2, false, 0.82, look, false, false, cached.fit * view.zoom, 1, 960);
        return;
      }
      const frame = drawPlacedMeshes(canvas, instances, view.yaw, view.pitch, Math.max(8, span), false, 4.2, false, 0.82, undefined, true, true, undefined, 1, 960);
      if (frame) fitCache.current = { width, height, signature, fit: frame.fit, center: frame.center };
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [instances, key, span, view.panX, view.panY, view.panZ, view.pitch, view.yaw, view.zoom]);
  return (
    <div className="cluster-study-view">
      <canvas
        ref={canvasRef}
        className="hybrid-stage-canvas"
        onContextMenu={(event) => event.preventDefault()}
        onWheel={(event) => {
          event.preventDefault();
          setView((current) => ({ ...current, zoom: Math.min(2.4, Math.max(0.45, current.zoom * Math.exp(-event.deltaY * 0.0011))) }));
        }}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, button: event.button, shift: event.shiftKey };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (drag.shift || drag.button === 1 || drag.button === 2) {
            const scale = Math.max(8, span) * 0.0022 / view.zoom;
            setView((current) => ({ ...current, panX: current.panX - dx * scale, panY: current.panY + dy * scale * 0.35, panZ: current.panZ - dy * scale }));
            dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
            return;
          }
          setView((current) => ({ ...current, yaw: drag.yaw - dx * 0.008, pitch: Math.min(1.2, Math.max(-1.2, drag.pitch + dy * 0.004)) }));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      />
    </div>
  );
}

function meshBounds(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function unionBounds(boxes: readonly { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[]) {
  return boxes.reduce((box, item) => ({
    minX: Math.min(box.minX, item.minX),
    minY: Math.min(box.minY, item.minY),
    minZ: Math.min(box.minZ, item.minZ),
    maxX: Math.max(box.maxX, item.maxX),
    maxY: Math.max(box.maxY, item.maxY),
    maxZ: Math.max(box.maxZ, item.maxZ),
  }), boxes[0]);
}

function clusterMeasureLabel(
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } | null,
  report: ShrinkwrapVoidReport | null,
) {
  if (!bounds) return "";
  const width = modelUnitsToFeet(bounds.maxX - bounds.minX);
  const depth = modelUnitsToFeet(bounds.maxZ - bounds.minZ);
  const height = modelUnitsToFeet(bounds.maxY - bounds.minY);
  const cluster = `Cluster: ${width.toFixed(1)}' × ${depth.toFixed(1)}' × ${height.toFixed(1)}'`;
  if (!report) return cluster;
  return `${cluster} · Main void ${Math.round(report.floorSquareFeet)} sf · ${Math.round(report.volumeCubicFeet)} cf · ${Math.round(report.maxHeightFeet)} ft high · ${Math.round(report.widthFeet)} × ${Math.round(report.depthFeet)} ft · regions ${report.regionsBefore} → ${report.regionsRetained}`;
}

function typologyOf(archetypeId: string, loaded: ReadonlyMap<string, ModuleHandoff>): TypologyId | null {
  return resolveTileModule(archetypeId, loaded).identity?.typologyId ?? null;
}

export type HybridLabFrame = "tile" | "canvas" | "som" | "clipping" | "descendant";

export function HybridAssembly({ view = "process", frame, presentation = false, assemblyFilm = null, assemblyTiles: _assemblyTiles = null, assemblyConnections: _assemblyConnections = null, clusterValidated = false, studyProgramId = "", studyIteration = null }: { view?: "process" | "catalog" | "final-catalog"; frame?: HybridLabFrame; presentation?: boolean; assemblyFilm?: IsoMesh | null; assemblyTiles?: readonly TileInstance[] | null; assemblyConnections?: readonly TileConnection[] | null; clusterValidated?: boolean; studyProgramId?: string; studyIteration?: FinishedIteration | null }) {
  if (view === "catalog") return <HybridCatalog />;
  if (view === "final-catalog") return <HybridCatalog final />;
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
    sectionPlay,
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
    cluster,
  } = useHybrid();
  const width = envelopeWidth();
  const shape = gridShape(count, arrangement);
  const span = cluster
    ? Math.max(width, ...tiles.flatMap((tile) => [Math.abs(tile.transform.x), Math.abs(tile.transform.y), Math.abs(tile.transform.z)])) * 2 + width
    : tileStep(width) * (Math.max(shape.columns, shape.rows) - 1) + width;
  const detected = detectAdjacencies(tiles);
  const aggregation = evaluateAggregation(connections, tiles, loaded);
  const interlocks = buildInterlocks(aggregation, tiles, loaded);
  const booleanPlan = buildBooleanPlan(interlocks);
  const executionKey = booleanExecutionKey(booleanPlan, tiles);
  const [execution, setExecution] = useState<BooleanExecutionResult | null>(null);
  const [voidView, setVoidView] = useState<"solid" | "void" | "section">("solid");
  const [sectionHeight, setSectionHeight] = useState(0.45);
  const [measuring, setMeasuring] = useState(false);
  const [measurePending, setMeasurePending] = useState<Vec3 | null>(null);
  const [measures, setMeasures] = useState<Array<{ id: string; a: Vec3; b: Vec3 }>>([]);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const executionInput = useRef({ booleanPlan, tiles, loaded });
  executionInput.current = { booleanPlan, tiles, loaded };
  useEffect(() => {
    if (presentation) return;
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
  }, [executionKey, presentation]);
  const readinessKey = tiles.map((tile) => `${tile.instanceId}:${tile.archetypeId}`).join("|");
  const [kernelReadiness, setKernelReadiness] = useState<ReadonlyMap<string, BooleanReadiness>>(new Map());
  useEffect(() => {
    if (presentation) return;
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
  }, [readinessKey, loaded, tiles, presentation]);
  const executionStatus = booleanPlan.readyConnectionCount === 0 ? "unresolved" : execution?.status;
  const showBoolean = CONNECTION_DEBUG_STAGE >= 5 && execution?.status === "ready";
  const joinedMesh = showBoolean && execution?.status === "ready" ? execution.assembly.mesh : null;
  const joinedTiles = new Set(showBoolean && execution?.status === "ready" ? execution.tiles.filter((tile) => tile.status === "ready").map((tile) => tile.tileId) : []);
  const grownCache = useRef(new Map<string, { mesh: IsoMesh; parents: [string, IsoMesh, string, IsoMesh]; connector: IsoMesh }>());
  const liveHybrids = connections.map((connection) => {
    const preview = growth && growth.connectionId === connection.id && growth.candidateId === connection.selectedMockId ? growth : null;
    const validated = connection.validatedHybrid;
    const hybrid = validated && validated.triangles > 0
      ? {
        source: "real" as const,
        candidateId: connection.selectedMockId,
        geometry: validated,
        status: "ready" as const,
        placement: "placed-faces" as const,
        translate: { x: 0, y: 0, z: 0 },
        spin: 0,
      }
      : resolveAssemblyHybrid(connection, tiles, loaded, preview?.mesh);
    return { connection, preview, hybrid };
  });
  const grownParents = new Map<string, IsoMesh>();
  const grownConnectors = new Map<string, IsoMesh>();
  for (const item of liveHybrids) {
    if (presentation || item.connection.generationStatus === "generating" || item.connection.validatedHybrid) continue;
    if (!item.hybrid.geometry || item.hybrid.source === "mock") continue;
    const tileA = tiles.find((tile) => tile.instanceId === item.connection.tileAId);
    const tileB = tiles.find((tile) => tile.instanceId === item.connection.tileBId);
    const moduleA = tileA ? loaded.get(tileA.archetypeId) : undefined;
    const moduleB = tileB ? loaded.get(tileB.archetypeId) : undefined;
    if (!tileA || !tileB || moduleA?.status !== "ready" || moduleB?.status !== "ready") continue;
    const cached = grownCache.current.get(item.connection.id);
    if (cached && cached.mesh === item.hybrid.geometry) {
      grownParents.set(cached.parents[0], cached.parents[1]);
      grownParents.set(cached.parents[2], cached.parents[3]);
      grownConnectors.set(item.connection.id, cached.connector);
      continue;
    }
    const grown = growConnectionPair(item.hybrid.geometry, tileA, tileB, moduleA, moduleB, item.connection.faceA, item.connection.faceB);
    if (!grown) continue;
    grownCache.current.set(item.connection.id, {
      mesh: item.hybrid.geometry,
      parents: [tileA.instanceId, grown.parentA, tileB.instanceId, grown.parentB],
      connector: grown.connector,
    });
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
      const color = !chosen ? CANVAS_WHITE : TYPOLOGY_COLOR[handoff.identity.typologyId];
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
      const seated = (connection.validatedHybrid?.triangles ?? 0) > 0;
      if (!connection.selectedMockId && !seated) return [];
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
  const film = useAssemblyFilm(placed);
  const adoptedFilm = assemblyFilm ? [{
    id: "film-wrap",
    mesh: assemblyFilm,
    translate: { x: 0, y: 0, z: 0 },
    selected: false,
    color: CANVAS_WHITE,
    opacity: 1,
    plain: true,
  }] : null;
  const bodySolids = adoptedFilm ?? placed.filter((instance) => !instance.id.startsWith("guide:") && !instance.id.startsWith("contact:") && instance.mesh.triangles > 0);
  const hybridSolids = useMemo(() => connections.flatMap((connection) => {
    if (connection.validatedHybrid && connection.validatedHybrid.triangles > 0) return [connection.validatedHybrid];
    if (connection.rawHybrid) return [];
    if (!currentGeneratedField(connection)) return [];
    const hybrid = resolveAssemblyHybrid(connection, tiles, loaded);
    return hybrid.source === "real" && hybrid.geometry ? [hybrid.geometry] : [];
  }), [connections, loaded, tiles]);
  const voidSolids = useMemo(() => {
    const meshes = tiles.flatMap((tile) => {
      const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
      return geometry ? [placeTileMesh(tile, geometry)] : [];
    });
    return [...meshes, ...hybridSolids];
  }, [hybridSolids, loaded, tiles]);
  const clusterBounds = useMemo(() => {
    if (assemblyFilm && assemblyFilm.triangles > 0) return meshBounds(assemblyFilm);
    const boxes = voidSolids.filter((mesh) => mesh.triangles > 0).map(meshBounds);
    return boxes.length > 0 ? unionBounds(boxes) : null;
  }, [assemblyFilm, voidSolids]);
  const measureMarks = measures.map((item) => ({
    ...item,
    label: `${modelUnitsToFeet(Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y, item.b.z - item.a.z)).toFixed(1)} ft`,
  }));
  const addMeasurePoint = (point: Vec3) => {
    if (!measurePending) {
      setMeasurePending(point);
      return;
    }
    setMeasures((current) => [...current, { id: `measure-${current.length + 1}`, a: measurePending, b: point }]);
    setMeasurePending(null);
  };
  const filmKey = assemblyFilm ? `${assemblyFilm.triangles}:${assemblyFilm.positions.length}:${assemblyFilm.positions[0] ?? 0}:${assemblyFilm.positions[assemblyFilm.positions.length - 1] ?? 0}` : "";
  const voidKey = `${filmKey}:field6`;
  const voidCache = useRef<{ key: string; report: ShrinkwrapVoidReport } | null>(null);
  const filmRef = useRef(assemblyFilm);
  filmRef.current = assemblyFilm;
  const [voidVersion, setVoidVersion] = useState(0);
  useEffect(() => {
    const filmMesh = filmRef.current;
    if (!filmMesh || voidCache.current?.key === voidKey) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      if (cancel || voidCache.current?.key === voidKey || !filmRef.current) return;
      const report = analyzeShrinkwrapVoid(filmRef.current);
      voidCache.current = { key: voidKey, report };
      setVoidVersion((version) => version + 1);
    }, 0);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [voidKey]);
  const voidReport = voidVersion >= 0 && voidCache.current?.key === voidKey ? voidCache.current.report : null;
  const voidMesh = voidReport?.mesh ?? null;
  const voidInstance = voidMesh ? {
    id: "habitable-void",
    mesh: voidMesh,
    translate: { x: 0, y: 0, z: 0 },
    selected: false,
    kind: 0 as const,
    color: VOID_LOOK.color,
    opacity: VOID_LOOK.opacity,
    plain: "plain" in VOID_LOOK ? VOID_LOOK.plain : undefined,
    glow: "glow" in VOID_LOOK ? VOID_LOOK.glow : undefined,
  } : null;
  const pocketInstance = voidReport?.pocketsMesh && voidReport.pocketsMesh.triangles > 4 ? {
    id: "void-pockets",
    mesh: voidReport.pocketsMesh,
    translate: { x: 0, y: 0, z: 0 },
    selected: false,
    kind: 0 as const,
    color: VOID_LOOK.color,
    opacity: VOID_LOOK.opacity,
    plain: "plain" in VOID_LOOK ? VOID_LOOK.plain : undefined,
    glow: "glow" in VOID_LOOK ? VOID_LOOK.glow : undefined,
  } : null;
  const pocketInstances = voidView === "void" && pocketInstance ? [pocketInstance] : [];
  const sectionCut = voidView === "section" && voidReport ? voidReport.section(sectionHeight) : null;
  const sectionInstances = sectionCut ? [
    ...(sectionCut.solid ? [{
      id: "void-section-solid",
      mesh: sectionCut.solid,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      kind: 0 as const,
      color: CANVAS_WHITE,
      opacity: 1,
      plain: true,
    }] : []),
    ...(sectionCut.void ? [{
      id: "void-section-void",
      mesh: sectionCut.void,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      kind: 0 as const,
      color: VOID_LOOK.color,
      opacity: VOID_LOOK.opacity,
      plain: "plain" in VOID_LOOK ? VOID_LOOK.plain : undefined,
      glow: "glow" in VOID_LOOK ? VOID_LOOK.glow : undefined,
    }] : []),
  ] : [];
  const plainSolid = bodySolids.map((instance) => ({ ...instance, opacity: 1, palette: false as const, plain: true, quiet: false }));
  const voidRoom = voidInstance && voidInstance.mesh.triangles > 4 ? voidInstance : null;
  const withVoid = [...plainSolid, ...(voidRoom ? [voidRoom] : [])];
  const canvasInstances = assemblyFilm
    ? [...withVoid, ...(pocketInstance ? [pocketInstance] : [])]
    : voidView === "section"
      ? sectionInstances
      : voidView === "void"
        ? [...withVoid, ...pocketInstances]
        : plainSolid;
  const studySpan = useMemo(() => {
    if (!assemblyFilm || assemblyFilm.triangles < 4) return span;
    const box = meshBounds(assemblyFilm);
    return Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ, 8);
  }, [assemblyFilm, span]);
  const studyPlates = useMemo(() => {
    if (!assemblyFilm || !voidReport) return [];
    const seen = new Set<number>();
    const plates: Array<{ solid: IsoMesh | null; void: IsoMesh | null }> = [];
    const samples = 18;
    for (let index = 0; index < samples; index += 1) {
      const cut = voidReport.section(index / (samples - 1));
      const mark = cut.void?.positions[1] ?? cut.solid?.positions[1];
      const key = mark === undefined ? -1 : Math.round(mark * 20);
      if (key < 0 || seen.has(key)) continue;
      seen.add(key);
      plates.push(cut);
    }
    return plates;
  }, [assemblyFilm, voidReport]);
  const [stackCount, setStackCount] = useState(0);
  useEffect(() => {
    if (!studyPlates.length) return;
    let count = 0;
    let hold = 0;
    const timer = window.setInterval(() => {
      if (hold > 0) {
        hold -= 1;
        if (hold === 0) {
          count = 0;
          setStackCount(0);
        }
        return;
      }
      count += 1;
      setStackCount(count);
      if (count >= studyPlates.length) hold = 6;
    }, 520);
    return () => window.clearInterval(timer);
  }, [studyPlates]);
  const isolatedVoid = useMemo((): PlacedMesh[] => {
    if (!voidReport?.mesh || voidReport.mesh.triangles <= 4) return [];
    const room: PlacedMesh = {
      id: "study-void",
      mesh: voidReport.mesh,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      ...VOID_LOOK,
    };
    if (!voidReport.pocketsMesh || voidReport.pocketsMesh.triangles <= 4) return [room];
    return [room, {
      id: "study-pockets",
      mesh: voidReport.pocketsMesh,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      ...VOID_LOOK,
    }];
  }, [voidReport]);
  const isolatedSolid = useMemo((): PlacedMesh[] => {
    if (!assemblyFilm || assemblyFilm.triangles <= 4) return [];
    return [{
      id: "study-solid",
      mesh: assemblyFilm,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      color: CANVAS_WHITE,
      opacity: 1,
      plain: true,
    }];
  }, [assemblyFilm]);
  const stackInstances = useMemo(() => studyPlates.flatMap((plate, index) => {
    const visible = index < stackCount;
    const items: PlacedMesh[] = [];
    if (plate.solid && plate.solid.triangles > 0) items.push({
      id: `stack-solid-${index}`,
      mesh: plate.solid,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      color: CANVAS_WHITE,
      opacity: 1,
      plain: true,
      hold: !visible,
    });
    if (plate.void && plate.void.triangles > 0) items.push({
      id: `stack-void-${index}`,
      mesh: plate.void,
      selected: false,
      ...VOID_LOOK,
      translate: { x: 0, y: 0.45, z: 0 },
      hold: !visible,
    });
    return items;
  }), [studyPlates, stackCount]);
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
  const single = Boolean(frame);
  return (
    <main className={single ? "hybrid-view hybrid-frame" : "hybrid-view hybrid-assembly"}>
      {!single && catalogNotice ? <p className="hybrid-units">{catalogNotice}</p> : null}
      {!single && !presentation && generationNotice ? <p className="hybrid-pending">{generationNotice}</p> : null}
      {single ? null : <SyntheticTestToggle />}
      {!frame || frame === "tile" ? <Panel className="hybrid-tile major-section-frame">
        <PanelHeader mark="01" title="Tile Selection" />
        {presentation ? null : <div className="hybrid-layout-controls hybrid-count-row">
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
        </div>}
        <HybridTiles locked={presentation} />
        {presentation ? null : <div className="hybrid-layout-controls">
          <button type="button" onClick={rotateSelected}>Rotate 90</button>
          <button type="button" onClick={() => mirrorSelected("x")}>Mirror X</button>
          <button type="button" onClick={() => mirrorSelected("z")}>Mirror Z</button>
          <button type="button" onClick={() => translateSelected(-1, 0)}>West</button>
          <button type="button" onClick={() => translateSelected(1, 0)}>East</button>
          <button type="button" onClick={() => translateSelected(0, -1)}>South</button>
          <button type="button" onClick={() => translateSelected(0, 1)}>North</button>
        </div>}
      </Panel> : null}
      {!frame || frame === "canvas" ? <Panel className="hybrid-canvas major-section-frame">
        {assemblyFilm ? (
          <ClusterAnalysisBoard
            instances={canvasInstances}
            voidInstances={isolatedVoid}
            solidInstances={isolatedSolid}
            plates={studyPlates}
            stackInstances={stackInstances}
            span={studySpan}
            iteration={studyIteration}
            programId={studyProgramId}
            solidMesh={assemblyFilm}
            voidReport={voidReport}
          />
        ) : <>
        <PanelHeader mark="02" title="Aggregation Canvas" />
        <div className="cluster-study-plain">
        <div className={assemblyFilm ? "cluster-study-lead" : "cluster-study-plain"}>
        {assemblyFilm ? <StudyHead mark="01" title="Solid and void" /> : null}
        <div className={assemblyFilm ? "hybrid-stage frame-primary" : "hybrid-stage"} data-canvas-source={canvasSource} data-canvas-modules={canvasModules} data-canvas-selection={canvasSelection ?? ""} data-tile-pose={tiles.map((tile) => `${tile.instanceId}:${tile.rotationQuarter}:${tile.mirror ?? "none"}:${tile.transform.x.toFixed(2)},${tile.transform.y.toFixed(2)},${tile.transform.z.toFixed(2)}:${(tile.rotation ?? tileBasis(tile)).map((value) => value.toFixed(2)).join(",")}`).join("|")}>
          <AggregationView
            initialPitch={presentation ? -1.15 : undefined}
            instances={canvasInstances}
            selectedId={canvasSelection ?? ""}
            onSelect={(id) => {
              if (!id || id === "film-wrap" || id === "guide:film-wrap" || id === "guide:veil") {
                if (!id) {
                  setCanvasSelection(null);
                  setSelectedId("");
                }
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
            span={assemblyFilm ? span * 1.6 : span}
            zoomOut={assemblyFilm ? 6 : undefined}
            sweep={film.sweep}
            onSweepDone={film.finishSweep}
            measuring={measuring}
            measures={measureMarks}
            pendingPoint={measurePending}
            onMeasurePoint={addMeasurePoint}
          />
          <div className="hybrid-layout-controls hybrid-stage-save" data-save-assembly="">
            <button type="button" className="hybrid-validate-run" data-validation={film.phase} disabled={!film.ready || film.running} onClick={film.start}>
              {film.running ? "Running" : "Run validation"}
            </button>
            {adoptedFilm || clusterValidated ? <p className="hybrid-validate-badge" data-state="clear">VALIDATED</p> : film.status ? <p className="hybrid-validate-badge" data-state={film.status === "VALIDATED" ? "clear" : "unresolved"}>{film.status}</p> : null}
            {assemblyFilm ? null : (
              <>
                <button type="button" data-void-view="solid" data-active={voidView === "solid" || undefined} onClick={() => setVoidView("solid")}>
                  Solid
                </button>
                <button type="button" data-void-view="void" data-active={voidView === "void" || undefined} onClick={() => setVoidView("void")}>
                  Habitable Void
                </button>
                <button type="button" data-void-view="section" data-active={voidView === "section" || undefined} onClick={() => setVoidView("section")}>
                  Void Section
                </button>
                {voidView === "section" ? (
                  <input type="range" min={0} max={1} step={0.01} value={sectionHeight} aria-label="Void section height" onChange={(event) => setSectionHeight(Number(event.target.value))} />
                ) : null}
              </>
            )}
            <button type="button" data-measure="" data-active={measuring || undefined} onClick={() => { setMeasuring((current) => !current); setMeasurePending(null); }}>
              MEASURE
            </button>
            <button type="button" data-measure-clear="" onClick={() => { setMeasures([]); setMeasurePending(null); }}>
              Clear
            </button>
            <p className="hybrid-units" data-cluster-measure="">
              {clusterMeasureLabel(clusterBounds, voidReport)}
            </p>
            {presentation ? null : <SaveCurrentAssembly />}
          </div>
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
        </div>
        {assemblyFilm ? (
          <aside className="cluster-study" data-cluster-study="">
            <div className="cluster-study-group">
              <div className="cluster-study-slot">
                <StudyHead mark="02" title="Habitable void" aside={voidReport && voidReport.floorSquareFeet > 0 ? <span>{Math.round(voidReport.floorSquareFeet).toLocaleString("en-US")} sf</span> : null} />
                <figure className="frame-teal">
                  <StudyView instances={isolatedVoid} span={studySpan} />
                </figure>
              </div>
              <div className="cluster-study-slot">
                <StudyHead mark="03" title="Solid" />
                <figure>
                  <StudyView instances={isolatedSolid} span={studySpan} />
                </figure>
              </div>
            </div>
            <div className="cluster-study-group cluster-study-group-secondary">
              <div className="cluster-study-slot">
                <StudyHead mark="04" title="Void section" />
                <figure>
                  <StudyView instances={stackInstances} span={studySpan} />
                </figure>
              </div>
              {studyIteration && studyProgramId ? (
                <div className="cluster-study-slot">
                  <StudyHead mark="05" title="Criteria" aside={<p className="cluster-study-key"><span data-relation="meets">Meets</span><span data-relation="above">Above</span><span data-relation="below">Below</span></p>} />
                  <figure className="frame-copper">
                    <ClusterCriteriaView programId={studyProgramId} item={studyIteration} mesh={assemblyFilm} span={studySpan} />
                  </figure>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
        </div>
        </>}
      </Panel> : null}
      {!frame || frame === "som" ? <Panel className="hybrid-som major-section-frame">
        <PanelHeader mark="03" title="SOM-inspired parametric connector field" />
        <div className="hybrid-som-board">
          {connections.length === 0 ? <p className="hybrid-missing">Select two geometries and connection faces to generate the connector field</p> : null}
          {connections.map((connection) => {
            const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
            const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
            const colorA = TYPOLOGY_COLOR[resolveTileModule(tileA?.archetypeId ?? "", loaded).identity?.typologyId ?? "lobby"];
            const colorB = TYPOLOGY_COLOR[resolveTileModule(tileB?.archetypeId ?? "", loaded).identity?.typologyId ?? "lobby"];
            const detailed = connection.id === (selectedConnectionId || connections[0]?.id);
            return (
              <article key={connection.id} className="hybrid-som-mini">
                <button type="button" className="hybrid-connection-label" onClick={() => focusConnection(connection.id)}>
                  {connection.tileAId}:{connection.faceA} ↔ {connection.tileBId}:{connection.faceB}
                </button>
                {detailed && (connection.generatedHybridField || connection.generationStatus === "generating") ? <MockMatrix
                  signature={connection.signature}
                  selectedId={connection.selectedMockId}
                  generatedField={connection.generatedHybridField ?? {
                    version: "skill4-generated-hybrid-field-v1",
                    status: "partial",
                    connectionSignature: connection.signature,
                    candidates: [],
                    readyCount: 0,
                    blockedCount: 0,
                    emptyCount: 0,
                    invalidCount: 0,
                  }}
                  onSelect={(id) => selectMock(connection.id, id)}
                  colorA={colorA}
                  colorB={colorB}
                  previewId={
                    growth?.connectionId === connection.id
                      ? growth.candidateId
                      : sectionPlay?.connectionId === connection.id
                        ? sectionPlay.candidateId
                        : connection.generationStatus === "generating"
                          ? connection.generatedHybridField?.candidates.at(-1)?.candidateId ?? null
                          : null
                  }
                  previewMesh={growth?.connectionId === connection.id ? growth.mesh : null}
                /> : <p className="hybrid-missing">Select two geometries and connection faces to generate the connector field</p>}
                {presentation ? (
                  <button type="button" className="hybrid-generate" onClick={() => generateHybridFieldForConnection(connection.id, true)}>
                    Generate real hybrids
                  </button>
                ) : <div className="hybrid-layout-controls">
                  <button type="button" className="hybrid-generate" onClick={() => setGenerationNotice(generateInputs(connection.id))}>
                    Generate candidate inputs
                  </button>
                  <button type="button" className="hybrid-generate" onClick={() => setGenerationNotice(generateHybridFieldForConnection(connection.id))}>
                    Generate real hybrids
                  </button>
                </div>}
                <p className="hybrid-units">{generationStatusLabel(connection.generationStatus)}</p>
                {detailed ? <SomCandidateFacts
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
                /> : null}
              </article>
            );
          })}
        </div>
      </Panel> : null}
      {!frame || frame === "clipping" || frame === "descendant" ? <ProcessRow
        connection={connections.find((connection) => connection.id === selectedConnectionId) ?? connections[0] ?? null}
        tiles={tiles}
        loaded={loaded}
        syntheticMode={syntheticMode}
        growth={growth}
        sectionPlay={sectionPlay}
        part={frame === "descendant" ? "descendant" : frame === "clipping" ? "clipping" : "all"}
      /> : null}
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
    <>
      <button type="button" className="hybrid-generate" onClick={save}>
        Save assembly
      </button>
      {notice ? (
        <>
          <p className="hybrid-units" data-save-notice="">{notice}</p>
          <Link href="/lab/hybrid/legacy/catalog" className="hybrid-generate">View catalog</Link>
        </>
      ) : null}
    </>
  );
}
