import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff } from "./adapt";
import { layoutTiles, type AssemblyArrangement, type AssemblyCount } from "./assembly-layout";
import type { CandidateField, HybridCandidate } from "./candidate-field";
import type { FaceId } from "./contract";
import type { FaceSelection, TileConnection } from "./connections";
import { reconcileConnections } from "./connections";
import type { PlacedMesh } from "./draw-placed";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridCandidate, type GeneratedHybridField } from "./generated-hybrid-field";
import { catalogDna, HYBRID_GENERATOR_SETTINGS, pendingHybridGenerator } from "./hybrid-generator";
import { TYPOLOGY_COLOR } from "./module-mock";
import type { Mat3 } from "./tile-basis";
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
  rotation?: Mat3;
};

/** Final selected connector only. Growth frames and the other 24 candidates are not archived. */
export type CatalogHybridMesh = {
  encoding: "isomesh-base64";
  positions: string;
  normals: string;
  indices: string;
  triangles: number;
};

export type CatalogSelectedHybrid = {
  candidateId: string;
  generatorVersion: string;
  fieldVersion: string;
  candidate: HybridCandidate;
  branches: number;
  openings: number;
  mesh: CatalogHybridMesh;
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
  /** Settled mesh for the selected H##. Absent on entries saved before snapshots. */
  selectedHybrid?: CatalogSelectedHybrid | null;
};

export type CatalogBatchRecord = {
  seed: string;
  status: "success" | "failed";
  terminalA: "PASS" | "FAIL";
  terminalB: "PASS" | "FAIL";
  connected: "PASS" | "FAIL";
  floating: number;
  coreIntact: "YES" | "NO";
  boolean: string;
  physical: string;
  manifold?: "YES" | "NO";
  componentCount?: number | null;
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
  /** Chosen from the experimental catalog for import on the site. */
  selected?: boolean;
  /** A Skill 5 proposal returned for another hybrid connection. Generation is not run. */
  rerunNeeded?: boolean;
  parentAssemblyId?: string | null;
  sourceConfigurationId?: string | null;
  sourcePlacementId?: string | null;
  /** Stress-test batch. Absent on ordinary catalog saves. */
  batchId?: string;
  batch?: CatalogBatchRecord;
};

export function siteLibraryEntries(entries: readonly CatalogEntry[]) {
  return entries.filter((entry) => entry.selected === true);
}

export function rerunEntries(entries: readonly CatalogEntry[]) {
  return entries.filter((entry) => entry.rerunNeeded === true);
}

/** Existing S04 TEST entries belong to the first batch. Geometry is not read. */
export function catalogBatch(entry: CatalogEntry): string | null {
  if (entry.batchId) return entry.batchId;
  if (/^S04 TEST \d+$/.test(entry.id)) return "TEST_1";
  return null;
}

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
      ...(tile.rotation ? { rotation: tile.rotation } : {}),
    };
  });
  const savedConnections = connections.map((connection) => {
    const selectedHybrid = snapshotSelectedHybrid(connection);
    return {
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
      ...(selectedHybrid ? { selectedHybrid } : {}),
    };
  });
  return {
    id,
    tileCount: tiles.length,
    arrangement,
    count,
    tiles: savedTiles,
    connections: savedConnections,
    regenerationRequired: savedConnections.some((connection) => connection.hadGeneratedField && !connection.selectedHybrid),
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
    ...(tile.rotation ? { rotation: tile.rotation } : {}),
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
  // Posed tiles sit on the hybrid gap after face seating, so box contact no longer matches.
  // The layout grid is the same adjacency the working board used when the entry was saved.
  const adjacency = layoutTiles(entry.count, entry.arrangement, tiles).map((tile) => ({
    ...tile,
    rotationQuarter: 0 as const,
    mirror: null,
    rotation: undefined,
  }));
  return reconcileConnections(previous, tiles, loaded, adjacency).map((connection) => attachArchivedHybrid(connection, entry, tiles, loaded));
}

function snapshotSelectedHybrid(connection: TileConnection): CatalogSelectedHybrid | null {
  const field = connection.generatedHybridField;
  if (!field || field.connectionSignature !== connection.signature) return null;
  const candidate = field.candidates.find((item) => item.candidateId === connection.selectedMockId);
  if (!candidate?.geometry || candidate.status !== "ready") return null;
  return {
    candidateId: candidate.candidateId,
    generatorVersion: HYBRID_GENERATOR_SETTINGS.version,
    fieldVersion: field.version,
    candidate: candidate.candidate,
    branches: candidate.branches,
    openings: candidate.openings,
    mesh: encodeMesh(candidate.geometry),
  };
}

function attachArchivedHybrid(
  connection: TileConnection,
  entry: CatalogEntry,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): TileConnection {
  const record = entry.connections.find((item) => item.id === connection.id);
  if (!record) return connection;
  const selectedId = record.selectedHybrid?.candidateId ?? record.selectedMockId;
  let mesh: IsoMesh | null = null;
  if (record.selectedHybrid) {
    try {
      mesh = decodeMesh(record.selectedHybrid.mesh);
    } catch {
      mesh = null;
    }
  } else {
    mesh = rebuildLegacyHybrid(record, tiles, loaded);
  }
  if (!mesh) {
    if (!record.hadGeneratedField && !record.selectedHybrid) return { ...connection, selectedMockId: selectedId };
    return {
      ...connection,
      selectedMockId: selectedId,
      generatedHybridField: null,
      generationStatus: "invalid",
      catalogHybrid: "missing",
    };
  }
  const source = record.selectedHybrid ? "snapshot" as const : "reconstructed" as const;
  const stored = record.selectedHybrid;
  const selectedCandidate = stored?.candidate ?? record.candidateField?.candidates.find((item) => item.id === selectedId) ?? null;
  if (!selectedCandidate) {
    return { ...connection, selectedMockId: selectedId, generatedHybridField: null, generationStatus: "invalid", catalogHybrid: "missing" };
  }
  const roster = record.candidateField?.candidates ?? [selectedCandidate];
  const candidates = roster.map((item) => archivedCandidate(item, item.id === selectedId ? mesh : null, stored));
  const readyCount = candidates.filter((item) => item.status === "ready").length;
  const field: GeneratedHybridField = {
    version: GENERATED_HYBRID_FIELD_SETTINGS.version,
    status: readyCount === candidates.length ? "ready" : "partial",
    connectionSignature: connection.signature,
    candidates,
    readyCount,
    blockedCount: 0,
    emptyCount: candidates.length - readyCount,
    invalidCount: 0,
  };
  return {
    ...connection,
    selectedMockId: selectedId,
    generatedHybridField: field,
    generationStatus: field.status,
    catalogHybrid: source,
    inputsChanged: false,
  };
}

function archivedCandidate(candidate: HybridCandidate, mesh: IsoMesh | null, stored: CatalogSelectedHybrid | null | undefined): GeneratedHybridCandidate {
  if (!mesh) {
    return {
      candidateId: candidate.id,
      candidate,
      status: "empty",
      geometry: null,
      vertexCount: 0,
      triangleCount: 0,
      reason: "This candidate was not the saved connector.",
      branches: 0,
      openings: 0,
    };
  }
  return {
    candidateId: candidate.id,
    candidate,
    status: "ready",
    geometry: mesh,
    vertexCount: mesh.positions.length / 3,
    triangleCount: mesh.triangles,
    reason: "",
    branches: stored?.branches ?? 0,
    openings: stored?.openings ?? 0,
  };
}

/** Same generator version and saved candidate only. A version mismatch is left missing. */
function rebuildLegacyHybrid(
  record: CatalogConnectionRecord,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): IsoMesh | null {
  if (!record.hadGeneratedField || !record.candidateField) return null;
  if (!record.signature.includes(HYBRID_GENERATOR_SETTINGS.version)) return null;
  const candidate = record.candidateField.candidates.find((item) => item.id === record.selectedMockId);
  const tileA = tiles.find((tile) => tile.instanceId === record.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === record.tileBId);
  const moduleA = tileA ? resolveTileModule(tileA.archetypeId, loaded) : null;
  const moduleB = tileB ? resolveTileModule(tileB.archetypeId, loaded) : null;
  if (!candidate || moduleA?.status !== "ready" || moduleB?.status !== "ready") return null;
  const frameA = moduleA.faces[record.faceA];
  const frameB = moduleB.faces[record.faceB];
  if (!frameA || !frameB) return null;
  try {
  const result = pendingHybridGenerator.generate({
    moduleA,
    moduleB,
    catalogA: catalogDna(moduleA),
    catalogB: catalogDna(moduleB),
    faceA: record.faceA,
    faceB: record.faceB,
    frameA,
    frameB,
    observationA: record.candidateField.faceA,
    observationB: record.candidateField.faceB,
    candidate,
    settings: HYBRID_GENERATOR_SETTINGS,
  });
  return result.status === "ready" ? result.geometry : null;
  } catch {
    return null;
  }
}

function encodeMesh(mesh: IsoMesh): CatalogHybridMesh {
  const bytes = (view: ArrayBufferView) => {
    const raw = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let binary = "";
    const size = 0x4000;
    for (let index = 0; index < raw.length; index += size) {
      binary += String.fromCharCode(...raw.subarray(index, index + size));
    }
    return btoa(binary);
  };
  return {
    encoding: "isomesh-base64",
    positions: bytes(mesh.positions),
    normals: bytes(mesh.normals),
    indices: bytes(mesh.indices),
    triangles: mesh.triangles,
  };
}

function decodeMesh(mesh: CatalogHybridMesh): IsoMesh {
  const floats = (value: string) => {
    const raw = base64Bytes(value);
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return new Float32Array(copy.buffer);
  };
  const ints = (value: string) => {
    const raw = base64Bytes(value);
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return new Uint32Array(copy.buffer);
  };
  return {
    positions: floats(mesh.positions),
    normals: floats(mesh.normals),
    indices: ints(mesh.indices),
    triangles: mesh.triangles,
  };
}

function base64Bytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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
