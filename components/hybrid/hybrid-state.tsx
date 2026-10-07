"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
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
import type { ModuleHandoff } from "@/lib/skill4/adapt";

type HybridStateValue = {
  loaded: ReadonlyMap<string, ModuleHandoff>;
  tiles: TileInstance[];
  connections: TileConnection[];
  selectedId: string;
  selectedConnectionId: string | null;
  setSelectedId: (id: string) => void;
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
};

const HybridContext = createContext<HybridStateValue | null>(null);

export function HybridState({ records, children }: { records: Skill4ModuleRecord[]; children: ReactNode }) {
  const router = useRouter();
  const loaded = useMemo(() => loadModuleMap(records), [records]);
  const [board, setBoard] = useState(() => {
    const tiles = layoutTiles(4, "grid").map((tile) => ({
      ...tile,
      moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
    }));
    return { tiles, connections: reconcileConnections([], tiles, loaded), count: 4 as AssemblyCount, arrangement: "grid" as AssemblyArrangement };
  });
  const [selectedId, setSelectedId] = useState("A");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

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
    const params = new URLSearchParams(window.location.search);
    const query = params.toString();
    router.push(query ? `/hybrid/connections?${query}` : "/hybrid/connections");
  };

  return (
    <HybridContext.Provider
      value={{
        loaded,
        tiles: board.tiles,
        connections: board.connections,
        selectedId,
        selectedConnectionId,
        setSelectedId,
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
