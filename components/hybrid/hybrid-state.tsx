"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { connectionsFromCatalog, tilesFromCatalog } from "@/lib/skill4/catalog";
import type { FaceId, Skill4ModuleRecord } from "@/lib/skill4/contract";
import {
  adjacencyMarker,
  connectionBlocked,
  connectionInputSignature,
  generateConnectionHybridField,
  reconcileConnections,
  syncConnectionInputs,
  type TileConnection,
} from "@/lib/skill4/connections";
import { generateCandidateField } from "@/lib/skill4/candidate-field";
import { layoutTiles, type AssemblyArrangement, type AssemblyCount, type MirrorAxis } from "@/lib/skill4/assembly-layout";
import { envelopeWidth, loadModuleMap, resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
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
    tiles,
    connections: reconcileConnections([], tiles, loaded),
    count: 4 as AssemblyCount,
    arrangement: "grid" as AssemblyArrangement,
  };
}

const HybridContext = createContext<HybridStateValue | null>(null);

export function HybridState({ records, children }: { records: Skill4ModuleRecord[]; children: ReactNode }) {
  const provisional = useMemo(() => loadModuleMap(records), [records]);
  const [synthetic, setSynthetic] = useState<ReadonlyMap<string, ModuleHandoff> | null>(null);
  const [syntheticMode, setSyntheticMode] = useState(false);
  const [syntheticPending, setSyntheticPending] = useState(false);
  const [syntheticError, setSyntheticError] = useState<string | null>(null);
  const loaded = syntheticMode && synthetic ? synthetic : provisional;
  const [board, setBoard] = useState(() => freshBoard(provisional));
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
    setBoard((current) => ({
      ...current,
      connections: current.connections.map((connection) => {
        if (connection.id !== connectionId) return connection;
        const next = { ...connection, [side]: face, faceSelection: "user" as const };
        return syncConnectionInputs(next, connectionInputSignature(next, current.tiles, loaded));
      }),
    }));
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
    const connection = board.connections.find((item) => item.id === connectionId);
    if (!connection) return "The connection is no longer adjacent.";
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
      }));
      return { tiles, connections: reconcileConnections(current.connections, tiles, loaded), count, arrangement };
    });
  };

  const poseTiles = (change: (tile: TileInstance) => TileInstance) => {
    setBoard((current) => {
      const tiles = current.tiles.map((tile) => (tile.instanceId === selectedId ? change(tile) : tile));
      return { ...current, tiles, connections: reconcileConnections(current.connections, tiles, loaded) };
    });
  };

  const rotateSelected = () => {
    poseTiles((tile) => ({ ...tile, rotationQuarter: ((tile.rotationQuarter + 1) % 4) as 0 | 1 | 2 | 3 }));
  };

  const mirrorSelected = (axis: MirrorAxis) => {
    poseTiles((tile) => ({ ...tile, mirror: tile.mirror === axis ? null : axis }));
  };

  const translateSelected = (x: number, z: number) => {
    const step = envelopeWidth();
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
