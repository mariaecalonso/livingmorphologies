import type { ModuleHandoff } from "./adapt";
import type { AssemblyArrangement, AssemblyCount } from "./assembly-layout";
import type { CandidateField } from "./candidate-field";
import type { FaceId } from "./contract";
import type { FaceSelection, TileConnection } from "./connections";
import { reconcileConnections } from "./connections";
import type { PlacedMesh } from "./draw-placed";
import { TYPOLOGY_COLOR } from "./module-mock";
import { resolveTileModule, type TileInstance } from "./tiles";

export const SKILL4_CATALOG_KEY = "lm-skill4-catalog";

export const CATALOG_FILTERS = [2, 4, 6, 8, "custom"] as const;

export type CatalogFilter = (typeof CATALOG_FILTERS)[number];

export type CatalogTileRecord = {
  instanceId: string;
  archetypeId: string;
  name: string;
  moduleId: string;
  revision: number;
  transform: TileInstance["transform"];
  rotationQuarter: TileInstance["rotationQuarter"];
  mirror: TileInstance["mirror"];
};

export type CatalogConnectionRecord = {
  id: string;
  tileAId: string;
  tileBId: string;
  faceA: FaceId;
  faceB: FaceId;
  faceSelection: FaceSelection;
  selectedMockId: string;
  signature: string;
  hadCandidateField: boolean;
  hadGeneratedField: boolean;
  candidateField: CandidateField | null;
};

export type CatalogEntry = {
  id: string;
  tileCount: number;
  arrangement: AssemblyArrangement;
  count: AssemblyCount;
  tiles: CatalogTileRecord[];
  connections: CatalogConnectionRecord[];
  regenerationRequired: boolean;
  testData?: boolean;
};

const PRESETS = new Set<number>([2, 4, 6, 8]);

export function catalogBucket(tileCount: number): CatalogFilter {
  return PRESETS.has(tileCount) ? (tileCount as 2 | 4 | 6 | 8) : "custom";
}

export function filterCatalog(entries: readonly CatalogEntry[], filter: CatalogFilter) {
  return entries.filter((entry) => catalogBucket(entry.tileCount) === filter);
}

export function nextCatalogId(entries: readonly CatalogEntry[]) {
  let max = 0;
  for (const entry of entries) {
    const match = /^H(\d+)$/.exec(entry.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `H${String(max + 1).padStart(2, "0")}`;
}

export function captureCatalogEntry(
  id: string,
  tiles: readonly TileInstance[],
  connections: readonly TileConnection[],
  count: AssemblyCount,
  arrangement: AssemblyArrangement,
  loaded: ReadonlyMap<string, ModuleHandoff>,
  testData = false,
): CatalogEntry {
  const savedTiles = tiles.map((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    return {
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      name: handoff.identity?.name ?? tile.archetypeId,
      moduleId: handoff.moduleId || tile.moduleId,
      revision: handoff.revision,
      transform: { ...tile.transform },
      rotationQuarter: tile.rotationQuarter,
      mirror: tile.mirror,
    };
  });
  const savedConnections = connections.map((connection) => ({
    id: connection.id,
    tileAId: connection.tileAId,
    tileBId: connection.tileBId,
    faceA: connection.faceA,
    faceB: connection.faceB,
    faceSelection: connection.faceSelection,
    selectedMockId: connection.selectedMockId,
    signature: connection.signature,
    hadCandidateField: connection.candidateField !== null,
    hadGeneratedField: connection.generatedHybridField !== null,
    candidateField: connection.candidateField,
  }));
  return {
    id,
    tileCount: tiles.length,
    arrangement,
    count,
    tiles: savedTiles,
    connections: savedConnections,
    regenerationRequired: savedConnections.some((connection) => connection.hadGeneratedField),
    ...(testData ? { testData: true } : {}),
  };
}

export function tilesFromCatalog(entry: CatalogEntry): TileInstance[] {
  return entry.tiles.map((tile) => ({
    instanceId: tile.instanceId,
    archetypeId: tile.archetypeId,
    moduleId: tile.moduleId,
    transform: { ...tile.transform },
    rotationQuarter: tile.rotationQuarter,
    mirror: tile.mirror,
  }));
}

export function connectionsFromCatalog(entry: CatalogEntry, tiles: readonly TileInstance[], loaded: ReadonlyMap<string, ModuleHandoff>) {
  const previous: TileConnection[] = entry.connections.map((connection) => ({
    id: connection.id,
    tileAId: connection.tileAId,
    tileBId: connection.tileBId,
    faceA: connection.faceA,
    faceB: connection.faceB,
    origin: "detected",
    generationStatus: "not-generated",
    faceSelection: connection.faceSelection,
    inputsChanged: connection.hadGeneratedField,
    signature: connection.signature,
    candidateField: connection.candidateField,
    generatedHybridField: null,
    selectedMockId: connection.selectedMockId,
  }));
  return reconcileConnections(previous, tiles, loaded);
}

export function catalogPreview(entry: CatalogEntry, loaded: ReadonlyMap<string, ModuleHandoff>): PlacedMesh[] {
  return entry.tiles.flatMap((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    if (handoff.status !== "ready" || !handoff.geometry || !handoff.identity) return [];
    return [{
      id: tile.instanceId,
      mesh: handoff.geometry,
      translate: tile.transform,
      selected: false,
      spin: tile.rotationQuarter * Math.PI / 2,
      mirror: (tile.mirror === "x" ? 1 : tile.mirror === "y" ? 2 : tile.mirror === "z" ? 3 : 0) as 0 | 1 | 2 | 3,
      kind: 0 as const,
      color: TYPOLOGY_COLOR[handoff.identity.typologyId],
    }];
  });
}

export function emptyCatalogLabel(filter: CatalogFilter) {
  if (filter === "custom") return "NO SAVED CUSTOM ASSEMBLIES";
  return `NO SAVED ${filter}-TILE ASSEMBLIES`;
}

export function catalogCountLabel(filter: CatalogFilter, saved: number) {
  const size = filter === "custom" ? "CUSTOM" : `${filter} TILES`;
  return `${size} · ${saved} SAVED`;
}
