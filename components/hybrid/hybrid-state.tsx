"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { connectionsFromCatalog, tilesFromCatalog } from "@/lib/skill4/catalog";
import type { FaceId, Skill4ModuleRecord } from "@/lib/skill4/contract";
import {
  adjacencyMarker,
  connectionBlocked,
  generateConnectionHybridField,
  reconcileConnections,
  type TileConnection,
} from "@/lib/skill4/connections";
import { generateCandidateField } from "@/lib/skill4/candidate-field";
import { layoutTiles, type AssemblyArrangement, type AssemblyCount, type MirrorAxis } from "@/lib/skill4/assembly-layout";
import { liftConnectedToGround, orientTiles, placedBoundsMinY } from "@/lib/skill4/tile-orientation";
import { loadModuleMap, resolveTileModule, tileStep, type TileInstance } from "@/lib/skill4/tiles";
import { loadSyntheticTestRecords, SKILL4_SYNTHETIC_KEY } from "@/lib/skill4/synthetic-modules";
import type { ModuleHandoff } from "@/lib/skill4/adapt";

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
  restoreAssembly: (entry: CatalogEntry) => void;
  catalogNotice: string | null;
  syntheticMode: boolean;
  syntheticPending: boolean;
  syntheticError: string | null;
  toggleSyntheticTest: () => void;
};

function freshBoard(loaded: ReadonlyMap<string, ModuleHandoff>) {
  const tiles = layoutTiles(4, "grid").map((tile) => ({
    ...tile,
    moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
  }));
  return {
    ...settle(tiles, reconcileConnections([], tiles, loaded), 4, "grid", loaded),
    count: 4 as AssemblyCount,
    arrangement: "grid" as AssemblyArrangement,
  };
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
  const oriented = orientTiles(slots, connections, focusConnectionId);
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
    connections: reconcileConnections(connections, nextTiles, loaded).map((connection) => ({
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
  const [board, setBoard] = useState<AssemblyBoard>(() => freshBoard(provisional));
  useEffect(() => {
    if (window.localStorage.getItem(SKILL4_SYNTHETIC_KEY) !== "1") return;
    let cancel = false;
    setSyntheticPending(true);
    void loadSyntheticTestRecords().then((next) => {
      if (cancel) return;
      const map = loadModuleMap(next);
      setSynthetic(map);
      setSyntheticMode(true);
      setBoard(freshBoard(map));
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
  const archetypeKey = board.tiles.map((tile) => tile.archetypeId).join("|");
  useEffect(() => {
    const ids = [...new Set(archetypeKey.split("|").filter(Boolean))];
    for (const archetypeId of ids) {
      if (requested.current.has(archetypeId)) continue;
      requested.current.add(archetypeId);
      void fetch(`/api/skill4/handoff?archetype=${encodeURIComponent(archetypeId)}`)
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
      return { ...current, tiles, connections: reconcileConnections(current.connections, tiles, provisional) };
    });
  }, [provisional, syntheticMode]);

  const [selectedId, setSelectedId] = useState("A");
  const [canvasSelection, setCanvasSelection] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);

  const chooseArchetype = (instanceId: string, archetypeId: string) => {
    const handoff = resolveTileModule(archetypeId, loaded);
    setBoard((current) => {
      const tiles = current.tiles.map((tile) =>
        tile.instanceId === instanceId ? { ...tile, archetypeId, moduleId: handoff.moduleId } : tile,
      );
      return { ...current, tiles, connections: reconcileConnections(current.connections, tiles, loaded) };
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
    const result = generateConnectionHybridField(connection, board.tiles, loaded);
    if (!result.ok) return result.reason;
    if (result.reused) return null;
    setBoard((current) => ({
      ...current,
      connections: current.connections.map((item) => (item.id === connectionId ? result.connection : item)),
    }));
    return null;
  };

  const setLayout = (count: AssemblyCount, arrangement: AssemblyArrangement) => {
    setBoard((current) => {
      const tiles = layoutTiles(count, arrangement, current.tiles).map((tile) => ({
        ...tile,
        moduleId: tile.moduleId || resolveTileModule(tile.archetypeId, loaded).moduleId,
        manualQuarter: current.tiles.find((item) => item.instanceId === tile.instanceId)?.manualQuarter ?? 0,
        manualMirror: current.tiles.find((item) => item.instanceId === tile.instanceId)?.manualMirror ?? null,
      }));
      const connections = reconcileConnections(current.connections, tiles, loaded);
      return { ...settle(tiles, connections, count, arrangement, loaded), count, arrangement };
    });
  };

  const poseTiles = (change: (tile: TileInstance) => TileInstance) => {
    setBoard((current) => {
      const tiles = current.tiles.map((tile) => (tile.instanceId === selectedId ? change(tile) : tile));
      return { ...current, tiles, connections: reconcileConnections(current.connections, tiles, loaded) };
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
    setBoard((current) => ({
      ...current,
      connections: current.connections.map((connection) =>
        connection.id === connectionId ? { ...connection, selectedMockId: mockId } : connection,
      ),
    }));
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
      setBoard(freshBoard(provisional));
      return;
    }
    setSyntheticPending(true);
    setSyntheticError(null);
    void loadSyntheticTestRecords().then((next) => {
      const map = loadModuleMap(next);
      setSynthetic(map);
      setSyntheticMode(true);
      setBoard(freshBoard(map));
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
    setCatalogNotice(
      entry.regenerationRequired
        ? "Saved connector geometry is not stored. Generate real hybrids again before the connectors return."
        : null,
    );
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
