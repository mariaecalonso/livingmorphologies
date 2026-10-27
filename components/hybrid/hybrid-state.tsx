"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { connectionsFromCatalog, tilesFromCatalog } from "@/lib/skill4/catalog";
import { catalogServerSnapshot, readCatalog, subscribeCatalog } from "@/lib/skill4/catalog-store";
import type { FaceId, Skill4ModuleRecord } from "@/lib/skill4/contract";
import {
  adjacencyMarker,
  assignGeneratedHybridField,
  connectionBlocked,
  reconcileConnections,
  type TileConnection,
} from "@/lib/skill4/connections";
import { generateCandidateField } from "@/lib/skill4/candidate-field";
import { layoutTiles, type AssemblyArrangement, type AssemblyCount, type MirrorAxis } from "@/lib/skill4/assembly-layout";
import { hybridFaceTargets } from "@/lib/skill4/hybrid-attachment";
import { HYBRID_GAP, loadModuleMap, resolveTileModule, tileStep, type TileInstance } from "@/lib/skill4/tiles";
import { liftConnectedToGround, meshAttachment, orientTiles, placedBoundsMinY } from "@/lib/skill4/tile-orientation";
import { loadSyntheticTestRecords, SKILL4_SYNTHETIC_KEY } from "@/lib/skill4/synthetic-modules";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { HYBRID_GENERATOR_SETTINGS } from "@/lib/skill4/hybrid-generator";
import { revealHybridField } from "@/lib/skill4/generated-hybrid-field";

type HybridStateValue = {
  loaded: ReadonlyMap<string, ModuleHandoff>;
  tiles: TileInstance[];
  connections: TileConnection[];
  selectedId: string;
  selectedConnectionId: string | null;
  canvasSelection: string | null;
  setSelectedId: (id: string) => void;
  setCanvasSelection: (id: string | null) => void;
  selectConnection: (id: string) => void;
  chooseArchetype: (instanceId: string, archetypeId: string) => void;
  chooseFace: (connectionId: string, side: "faceA" | "faceB", face: FaceId) => void;
  generateInputs: (connectionId: string) => string | null;
  generateHybridFieldForConnection: (connectionId: string) => string | null;
  focusConnection: (id: string) => void;
  count: AssemblyCount;
  arrangement: AssemblyArrangement;
  setLayout: (count: AssemblyCount, arrangement: AssemblyArrangement) => void;
  rotateSelected: () => void;
  mirrorSelected: (axis: MirrorAxis) => void;
  translateSelected: (x: number, z: number) => void;
  selectMock: (connectionId: string, mockId: string) => void;
  /** Transient network preview. Null means draw the stored final mesh. */
  growth: { connectionId: string; candidateId: string; mesh: IsoMesh; opacity: number } | null;
  restoreAssembly: (entry: CatalogEntry) => void;
  catalogNotice: string | null;
  syntheticMode: boolean;
  syntheticPending: boolean;
  syntheticError: string | null;
  toggleSyntheticTest: () => void;
};

function freshBoard() {
  const tiles = layoutTiles(2, "grid").map((tile) => ({
    ...tile,
    archetypeId: "",
    moduleId: "",
  }));
  return {
    tiles,
    connections: [] as TileConnection[],
    count: 2 as AssemblyCount,
    arrangement: "grid" as AssemblyArrangement,
  };
}

/** New connections stay unselected. Restored and user-chosen hybrids keep their id. */
function openConnections(
  previous: readonly TileConnection[],
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  count: AssemblyCount,
  arrangement: AssemblyArrangement,
  adjacencySource: readonly TileInstance[] = tiles,
) {
  const adjacency = layoutAdjacency(count, arrangement, adjacencySource).filter((tile) => tile.archetypeId);
  return reconcileConnections(previous, tiles, loaded, adjacency).map((connection) => {
    const prior = previous.find((item) => item.id === connection.id);
    if (prior?.selectedMockId) return connection;
    return { ...connection, selectedMockId: "" };
  });
}

/** Layout neighbors, before face orientation moves the registration boxes. */
function layoutAdjacency(count: AssemblyCount, arrangement: AssemblyArrangement, tiles: readonly TileInstance[]) {
  return layoutTiles(count, arrangement, tiles).map((tile) => ({
    ...tile,
    rotationQuarter: 0 as const,
    mirror: null,
    rotation: undefined,
  }));
}

function settle(
  tiles: TileInstance[],
  connections: TileConnection[],
  count: AssemblyCount,
  arrangement: AssemblyArrangement,
  loaded: ReadonlyMap<string, ModuleHandoff>,
  focusConnectionId?: string,
) {
  const slots = layoutTiles(count, arrangement, tiles).map((tile) => {
    const prior = tiles.find((item) => item.instanceId === tile.instanceId);
    return {
      ...tile,
      moduleId: prior?.moduleId || tile.moduleId,
      manualQuarter: prior?.manualQuarter ?? 0,
      manualMirror: prior?.manualMirror ?? null,
    };
  });
  const oriented = orientTiles(slots, connections, focusConnectionId, (tileId, face) => {
    const tile = slots.find((item) => item.instanceId === tileId);
    if (!tile) return null;
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    if (handoff.status !== "ready" || !handoff.geometry) return null;
    return meshAttachment(handoff.geometry.positions, handoff.faces[face]);
  }, (connection) => connectionSpan(connection, slots, loaded));
  const nextTiles = liftConnectedToGround(oriented.tiles, connections, (tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    const positions = handoff.status === "ready" ? handoff.geometry?.positions : undefined;
    return placedBoundsMinY({ ...tile, moduleId: tile.moduleId || handoff.moduleId }, positions);
  }).map((tile) => ({
    ...tile,
    moduleId: tile.moduleId || resolveTileModule(tile.archetypeId, loaded).moduleId,
  }));
  return {
    tiles: nextTiles,
    connections: openConnections(connections, nextTiles, loaded, count, arrangement, slots).map((connection) => ({
      ...connection,
      orientation: oriented.unresolved.has(connection.id) ? "unresolved" as const : "ready" as const,
    })),
  };
}

type AssemblyBoard = {
  tiles: TileInstance[];
  connections: TileConnection[];
  count: AssemblyCount;
  arrangement: AssemblyArrangement;
};

function connectionSpan(connection: TileConnection, slots: readonly TileInstance[], loaded: ReadonlyMap<string, ModuleHandoff>) {
  const selected = connection.generatedHybridField?.candidates.find((item) => item.candidateId === connection.selectedMockId);
  const mesh = selected?.status === "ready" ? selected.geometry : null;
  const tileA = slots.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = slots.find((tile) => tile.instanceId === connection.tileBId);
  if (!mesh || !tileA || !tileB) return HYBRID_GAP;
  const moduleA = resolveTileModule(tileA.archetypeId, loaded);
  const moduleB = resolveTileModule(tileB.archetypeId, loaded);
  if (moduleA.status !== "ready" || moduleB.status !== "ready" || !moduleA.geometry || !moduleB.geometry) return HYBRID_GAP;
  return hybridFaceTargets(mesh, moduleA.geometry, moduleA.faces[connection.faceA], moduleB.geometry, moduleB.faces[connection.faceB]) ?? HYBRID_GAP;
}

const HybridContext = createContext<HybridStateValue | null>(null);

export function HybridState({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<Skill4ModuleRecord[]>([]);
  const requested = useRef(new Set<string>());
  const provisional = useMemo(() => loadModuleMap(records), [records]);
  const [synthetic, setSynthetic] = useState<ReadonlyMap<string, ModuleHandoff> | null>(null);
  const [syntheticMode, setSyntheticMode] = useState(false);
  const [syntheticPending, setSyntheticPending] = useState(false);
  const [syntheticError, setSyntheticError] = useState<string | null>(null);
  const loaded = syntheticMode && synthetic ? synthetic : provisional;
  const [board, setBoard] = useState<AssemblyBoard>(() => freshBoard());
  useEffect(() => {
    if (window.localStorage.getItem(SKILL4_SYNTHETIC_KEY) !== "1") return;
    let cancel = false;
    setSyntheticPending(true);
    void loadSyntheticTestRecords().then((next) => {
      if (cancel) return;
      const map = loadModuleMap(next);
      setSynthetic(map);
      setSyntheticMode(true);
      setBoard(freshBoard());
      setSyntheticPending(false);
    }).catch(() => {
      if (cancel) return;
      setSyntheticError("Synthetic test modules could not be built.");
      setSyntheticPending(false);
    });
    return () => {
      cancel = true;
    };
  }, []);
  const catalogEntries = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const archetypeKey = [...new Set([
    ...board.tiles.map((tile) => tile.archetypeId),
    ...catalogEntries.flatMap((entry) => entry.tiles.map((tile) => tile.archetypeId)),
  ])].filter(Boolean).sort().join("|");
  useEffect(() => {
    const ids = [...new Set(archetypeKey.split("|").filter(Boolean))];
    for (const archetypeId of ids) {
      if (requested.current.has(archetypeId)) continue;
      requested.current.add(archetypeId);
      void fetch(`/api/skill4/handoff?archetype=${encodeURIComponent(archetypeId)}&cell=20`, { cache: "no-store" })
        .then(async (response) => (response.ok ? response.json() as Promise<Skill4ModuleRecord> : null))
        .then((record) => {
          if (!record?.geometry || record.archetypeId !== archetypeId) {
            requested.current.delete(archetypeId);
            return;
          }
          setRecords((current) => current.some((item) => item.archetypeId === record.archetypeId) ? current : [...current, record]);
        })
        .catch(() => {
          requested.current.delete(archetypeId);
        });
    }
  }, [archetypeKey]);
  useEffect(() => {
    if (syntheticMode) return;
    setBoard((current) => {
      let changed = false;
      const tiles = current.tiles.map((tile) => {
        const handoff = provisional.get(tile.archetypeId);
        if (!handoff?.geometry || tile.moduleId === handoff.moduleId) return tile;
        changed = true;
        return { ...tile, moduleId: handoff.moduleId };
      });
      if (!changed) return current;
      return { ...current, tiles, connections: openConnections(current.connections, tiles, provisional, current.count, current.arrangement) };
    });
  }, [provisional, syntheticMode]);

  const [selectedId, setSelectedId] = useState("A");
  const [canvasSelection, setCanvasSelection] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [growth, setGrowth] = useState<HybridStateValue["growth"]>(null);
  const playback = useRef(0);
  const generationTokens = useRef(new Map<string, number>());

  const chooseArchetype = (instanceId: string, archetypeId: string) => {
    const handoff = resolveTileModule(archetypeId, loaded);
    setBoard((current) => {
      const tiles = current.tiles.map((tile) =>
        tile.instanceId === instanceId ? { ...tile, archetypeId, moduleId: handoff.moduleId } : tile,
      );
      return { ...current, tiles, connections: openConnections(current.connections, tiles, loaded, current.count, current.arrangement) };
    });
    setSelectedId(instanceId);
  };

  const chooseFace = (connectionId: string, side: "faceA" | "faceB", face: FaceId) => {
    setSelectedConnectionId(connectionId);
    setBoard((current) => {
      const connections = current.connections.map((connection) => (
        connection.id === connectionId ? { ...connection, [side]: face, faceSelection: "user" as const } : connection
      ));
      return { ...current, ...settle(current.tiles, connections, current.count, current.arrangement, loaded, connectionId) };
    });
  };

  const generateInputs = (connectionId: string) => {
    const connection = board.connections.find((item) => item.id === connectionId);
    if (!connection) return "The connection is no longer adjacent.";
    const tileA = board.tiles.find((tile) => tile.instanceId === connection.tileAId);
    const tileB = board.tiles.find((tile) => tile.instanceId === connection.tileBId);
    if (!tileA || !tileB) return "The connection tiles are missing.";
    const result = generateCandidateField({
      signature: connection.signature,
      faceA: connection.faceA,
      faceB: connection.faceB,
      moduleA: resolveTileModule(tileA.archetypeId, loaded),
      moduleB: resolveTileModule(tileB.archetypeId, loaded),
    });
    if (!result.ok) return result.reason;
    setBoard((current) => ({
      ...current,
      connections: current.connections.map((item) =>
        item.id === connectionId ? { ...item, candidateField: result.field, inputsChanged: false } : item,
      ),
    }));
    return null;
  };

  const playGrowth = (connectionId: string, candidateId: string, frames: IsoMesh[], hold: number) => {
    const token = playback.current + 1;
    playback.current = token;
    if (frames.length === 0) {
      setGrowth(null);
      return;
    }
    let index = 0;
    const step = () => {
      if (playback.current !== token) return;
      if (index >= frames.length) {
        setGrowth(null);
        return;
      }
      setGrowth({
        connectionId,
        candidateId,
        mesh: frames[index],
        opacity: 0.38 + (index / frames.length) * 0.5,
      });
      index += 1;
      window.setTimeout(step, hold);
    };
    step();
  };

  const generateHybridFieldForConnection = (connectionId: string) => {
    const found = board.connections.find((item) => item.id === connectionId);
    if (!found) return "The connection is no longer adjacent.";
    let connection = found;
    if (!connection.candidateField || connection.candidateField.signature !== connection.signature) {
      const tileA = board.tiles.find((tile) => tile.instanceId === connection.tileAId);
      const tileB = board.tiles.find((tile) => tile.instanceId === connection.tileBId);
      if (!tileA || !tileB) return "The connection tiles are missing.";
      const inputs = generateCandidateField({
        signature: connection.signature,
        faceA: connection.faceA,
        faceB: connection.faceB,
        moduleA: resolveTileModule(tileA.archetypeId, loaded),
        moduleB: resolveTileModule(tileB.archetypeId, loaded),
      });
      if (!inputs.ok) return inputs.reason;
      connection = { ...connection, candidateField: inputs.field, inputsChanged: false };
    }
    const expected = connection.candidateField?.candidates.length ?? 0;
    const finished = connection.generatedHybridField?.connectionSignature === connection.signature
      && connection.generatedHybridField.candidates.length >= expected
      && expected > 0
      ? connection.generatedHybridField
      : null;
    if (finished) {
      const seated = assignGeneratedHybridField(connection, finished);
      const chosen = seated.generatedHybridField?.candidates.find((item) => item.candidateId === seated.selectedMockId);
      if (chosen?.growth?.length) playGrowth(connectionId, chosen.candidateId, chosen.growth, 280);
      setBoard((current) => {
        const connections = current.connections.map((item) => (
          item.id === connectionId ? assignGeneratedHybridField(item, finished) : item
        ));
        return { ...current, ...settle(current.tiles, connections, current.count, current.arrangement, loaded, connectionId) };
      });
      return null;
    }
    const tileA = board.tiles.find((tile) => tile.instanceId === connection.tileAId);
    const tileB = board.tiles.find((tile) => tile.instanceId === connection.tileBId);
    if (!tileA || !tileB || !connection.candidateField) return "The connection tiles are missing.";
    const moduleA = resolveTileModule(tileA.archetypeId, loaded);
    const moduleB = resolveTileModule(tileB.archetypeId, loaded);
    if (moduleA.status !== "ready" || moduleB.status !== "ready") return "Geometry is unavailable for this connection.";
    const token = (generationTokens.current.get(connectionId) ?? 0) + 1;
    generationTokens.current.set(connectionId, token);
    const live = () => generationTokens.current.get(connectionId) === token;
    void revealHybridField({
      moduleA,
      moduleB,
      faceA: connection.faceA,
      faceB: connection.faceB,
      candidateField: connection.candidateField,
      settings: HYBRID_GENERATOR_SETTINGS,
    }, async (field) => {
      if (!live()) return;
      setBoard((current) => {
        let seat = false;
        const connections = current.connections.map((item) => {
          if (item.id !== connectionId) return item;
          const withInputs = connection.candidateField ? { ...item, candidateField: connection.candidateField, inputsChanged: false } : item;
          const assigned = assignGeneratedHybridField(withInputs, field);
          const chosen = assigned.generatedHybridField?.candidates.find((candidate) => candidate.candidateId === assigned.selectedMockId);
          const previous = item.generatedHybridField?.candidates.find((candidate) => candidate.candidateId === item.selectedMockId);
          if (chosen?.status === "ready" && chosen.geometry && (assigned.selectedMockId !== item.selectedMockId || chosen.geometry !== previous?.geometry)) {
            seat = true;
          }
          return assigned;
        });
        if (!seat) return { ...current, connections };
        return { ...current, ...settle(current.tiles, connections, current.count, current.arrangement, loaded, connectionId) };
      });
      const latest = field.candidates[field.candidates.length - 1];
      const frames = latest?.growth ?? [];
      for (let index = 0; index < frames.length; index += 1) {
        if (!live()) return;
        setGrowth({ connectionId, candidateId: latest.candidateId, mesh: frames[index], opacity: 0.36 + (index / frames.length) * 0.5 });
        await new Promise((resolve) => window.setTimeout(resolve, 55));
      }
    }, () => !live()).then(() => {
      if (live()) setGrowth((current) => (current?.connectionId === connectionId ? null : current));
    });
    return "Sensing";
  };

  const setLayout = (count: AssemblyCount, arrangement: AssemblyArrangement) => {
    setBoard((current) => {
      const prior = new Set(current.tiles.map((tile) => tile.instanceId));
      const tiles = layoutTiles(count, arrangement, current.tiles).map((tile) => {
        const previous = current.tiles.find((item) => item.instanceId === tile.instanceId);
        if (!prior.has(tile.instanceId)) {
          return { ...tile, archetypeId: "", moduleId: "", manualQuarter: 0 as const, manualMirror: null };
        }
        return {
          ...tile,
          moduleId: tile.moduleId || (tile.archetypeId ? resolveTileModule(tile.archetypeId, loaded).moduleId : ""),
          manualQuarter: previous?.manualQuarter ?? 0,
          manualMirror: previous?.manualMirror ?? null,
        };
      });
      const connections = openConnections(current.connections, tiles, loaded, count, arrangement);
      return { ...settle(tiles, connections, count, arrangement, loaded), count, arrangement };
    });
  };

  const poseTiles = (change: (tile: TileInstance) => TileInstance) => {
    setBoard((current) => {
      const tiles = current.tiles.map((tile) => (tile.instanceId === selectedId ? change(tile) : tile));
      return { ...current, tiles, connections: openConnections(current.connections, tiles, loaded, current.count, current.arrangement) };
    });
  };

  const rotateSelected = () => {
    setBoard((current) => {
      const anchor = [...current.tiles].sort((a, b) => (a.instanceId < b.instanceId ? -1 : 1))[0]?.instanceId;
      const bump = new Set([selectedId]);
      if (anchor && anchor !== selectedId) bump.add(anchor);
      const tiles = current.tiles.map((tile) => {
        if (!bump.has(tile.instanceId)) return tile;
        const manualQuarter = ((tile.manualQuarter ?? 0) + 1) % 4 as 0 | 1 | 2 | 3;
        return { ...tile, manualQuarter };
      });
      return { ...current, ...settle(tiles, current.connections, current.count, current.arrangement, loaded) };
    });
  };

  const mirrorSelected = (axis: MirrorAxis) => {
    setBoard((current) => {
      const tiles = current.tiles.map((tile) => {
        if (tile.instanceId !== selectedId) return tile;
        const manualMirror = (tile.manualMirror ?? null) === axis ? null : axis;
        return { ...tile, manualMirror };
      });
      return { ...current, ...settle(tiles, current.connections, current.count, current.arrangement, loaded) };
    });
  };

  const translateSelected = (x: number, z: number) => {
    const step = tileStep();
    poseTiles((tile) => ({ ...tile, transform: { ...tile.transform, x: tile.transform.x + x * step, z: tile.transform.z + z * step } }));
  };

  const selectMock = (connectionId: string, mockId: string) => {
    setSelectedConnectionId(connectionId);
    const found = board.connections.find((item) => item.id === connectionId);
    const candidate = found?.generatedHybridField?.candidates.find((item) => item.candidateId === mockId);
    if (candidate?.growth?.length) playGrowth(connectionId, mockId, candidate.growth, 280);
    else setGrowth(null);
    setBoard((current) => {
      const connections = current.connections.map((connection) =>
        connection.id === connectionId ? { ...connection, selectedMockId: mockId } : connection,
      );
      return { ...current, ...settle(current.tiles, connections, current.count, current.arrangement, loaded, connectionId) };
    });
  };

  const focusConnection = (id: string) => {
    setSelectedConnectionId(id);
  };

  const toggleSyntheticTest = () => {
    if (syntheticPending) return;
    if (syntheticMode) {
      window.localStorage.setItem(SKILL4_SYNTHETIC_KEY, "0");
      setSyntheticMode(false);
      setSyntheticError(null);
      setBoard(freshBoard());
      return;
    }
    setSyntheticPending(true);
    setSyntheticError(null);
    void loadSyntheticTestRecords().then((next) => {
      const map = loadModuleMap(next);
      setSynthetic(map);
      setSyntheticMode(true);
      setBoard(freshBoard());
      window.localStorage.setItem(SKILL4_SYNTHETIC_KEY, "1");
      setSyntheticPending(false);
    }).catch(() => {
      setSyntheticError("Synthetic test modules could not be built.");
      setSyntheticPending(false);
    });
  };

  const restoreAssembly = (entry: CatalogEntry) => {
    const tiles = tilesFromCatalog(entry);
    const connections = connectionsFromCatalog(entry, tiles, loaded);
    setBoard({
      tiles,
      connections,
      count: entry.count,
      arrangement: entry.arrangement,
    });
    setSelectedId(tiles[0]?.instanceId ?? "A");
    setSelectedConnectionId(connections[0]?.id ?? null);
    setCatalogNotice(connections.some((connection) => connection.catalogHybrid === "missing") ? "SAVED_HYBRID_MISSING" : null);
  };

  return (
    <HybridContext.Provider
      value={{
        loaded,
        tiles: board.tiles,
        connections: board.connections,
        selectedId,
        selectedConnectionId,
        canvasSelection,
        setSelectedId,
        setCanvasSelection,
        selectConnection: setSelectedConnectionId,
        chooseArchetype,
        chooseFace,
        generateInputs,
        generateHybridFieldForConnection,
        focusConnection,
        count: board.count,
        arrangement: board.arrangement,
        setLayout,
        rotateSelected,
        mirrorSelected,
        translateSelected,
        selectMock,
        growth,
        restoreAssembly,
        catalogNotice,
        syntheticMode,
        syntheticPending,
        syntheticError,
        toggleSyntheticTest,
      }}
    >
      {children}
    </HybridContext.Provider>
  );
}

export function useHybrid() {
  const value = useContext(HybridContext);
  if (!value) throw new Error("Hybrid views must render inside HybridState");
  return value;
}

export function useConnectionMarker(connection: TileConnection | undefined) {
  const { tiles } = useHybrid();
  if (!connection) return null;
  return adjacencyMarker(tiles, connection);
}

export function useConnectionBlocked(connection: TileConnection) {
  const { tiles, loaded } = useHybrid();
  return connectionBlocked(connection, tiles, loaded);
}
