import { layoutTiles } from "./assembly-layout";
import {
  captureCatalogEntry,
  catalogBucket,
  catalogCountLabel,
  catalogPreview,
  connectionsFromCatalog,
  emptyCatalogLabel,
  filterCatalog,
  nextCatalogId,
  tilesFromCatalog,
  type CatalogEntry,
} from "./catalog";
import { reconcileConnections } from "./connections";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { unavailableFace } from "./face-sample";
import { loadModuleMap, resolveTileModule } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const tiles = layoutTiles(4, "grid").map((tile) => ({
  ...tile,
  moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId,
}));
const connections = reconcileConnections([], tiles, loaded);
const eastWest = connections.find((connection) => connection.tileAId === "A" && connection.tileBId === "B");
if (!eastWest) throw new Error("the four-tile grid has an A-B connection");
eastWest.faceA = "T";
eastWest.selectedMockId = "H12";
eastWest.faceSelection = "user";

const entry = captureCatalogEntry("H01", tiles, connections, 4, "grid", loaded);
assert(entry.tileCount === 4, "a four-tile board records four tiles");
assert(entry.tiles.map((tile) => tile.name).filter((name) => name === "Topographic Ground Field").length === 2, "names come from the loaded archetypes");
assert(entry.connections[0].faceA === "T" && entry.connections[0].selectedMockId === "H12", "faces and the selected hybrid id are stored");
assert(!("savedAt" in entry), "a catalog entry does not store a date");
assert(entry.regenerationRequired === false, "an ungenerated board does not ask for regeneration");

const restoredTiles = tilesFromCatalog(entry);
const restored = connectionsFromCatalog(entry, restoredTiles, loaded);
const east = restored.find((connection) => connection.tileAId === "A" && connection.tileBId === "B");
assert(east?.faceA === "T" && east.selectedMockId === "H12", "reopen keeps the saved face and selected hybrid");
assert(restoredTiles[1].transform.x === tiles[1].transform.x, "reopen keeps the tile transform");

assert(catalogBucket(4) === 4 && catalogBucket(5) === "custom", "only 2, 4, 6, and 8 are preset sizes");
const custom = { ...entry, id: "H02", tileCount: 5 } satisfies CatalogEntry;
assert(filterCatalog([entry, custom], 4).map((item) => item.id).join() === "H01", "the size filter keeps matching saves");
assert(filterCatalog([entry, custom], "custom").length === 1, "custom holds counts outside the presets");
assert(nextCatalogId([entry, custom]) === "H03", "the next id follows the highest saved id");
assert(emptyCatalogLabel(4) === "NO SAVED 4-TILE ASSEMBLIES", "empty preset copy names the size");
assert(catalogCountLabel(4, 1) === "4 TILES · 1 SAVED", "the count is the number of stored items");

const preview = catalogPreview(entry, loaded);
assert(preview.length === 4, "ready modules supply the catalog preview");
assert(preview.every((item) => item.mesh.triangles > 0), "the preview uses the module mesh");
const unavailable = catalogPreview({ ...entry, tiles: entry.tiles.map((tile) => ({ ...tile, archetypeId: "vertical-void" })) }, loaded);
assert(unavailable.length === 0, "a missing module does not invent preview geometry");

const triangle = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: Uint32Array.from([0, 1, 2]),
  triangles: 1,
};
const faceA = eastWest.candidateField?.faceA ?? unavailableFace(eastWest.faceA);
const faceB = eastWest.candidateField?.faceB ?? unavailableFace(eastWest.faceB);
const stub = (id: string) => ({
  id,
  row: 0,
  column: 0,
  parentAWeight: 0.5,
  parentBWeight: 0.5,
  transformationIntensity: 0.5,
  criteria: [],
  generationInput: { faceA, faceB, physicalConnection: false as const, note: "" },
});
const generatedBoard = connections.map((connection, index) => {
  const id = ["H03", "H13", "H25", "H07"][index] ?? "H03";
  const mesh = {
    ...triangle,
    positions: Float32Array.from([index, 0, 0, index + 1, 0, 0, index, 1, 0]),
  };
  return {
    ...connection,
    selectedMockId: id,
    signature: connection.signature || `sig-${connection.id}`,
    generatedHybridField: {
      version: "skill4-generated-hybrid-field-v1" as const,
      status: "ready" as const,
      connectionSignature: connection.signature || `sig-${connection.id}`,
      candidates: [{
        candidateId: id,
        candidate: stub(id),
        status: "ready" as const,
        geometry: mesh,
        vertexCount: 3,
        triangleCount: 1,
        reason: "",
        branches: 2,
        openings: 0,
        growth: [mesh],
      }],
      readyCount: 1,
      blockedCount: 0,
      emptyCount: 0,
      invalidCount: 0,
    },
  };
});
const archived = captureCatalogEntry("H04", tiles, generatedBoard, 4, "grid", loaded);
assert(archived.regenerationRequired === false, "a snapshotted connector does not ask to be generated again");
assert(archived.connections.map((item) => item.selectedMockId).join() === "H03,H13,H25,H07", "each connection keeps its own selected hybrid");
assert(archived.connections.every((item) => item.selectedHybrid?.mesh.encoding === "isomesh-base64" && !("growth" in (item.selectedHybrid ?? {}))), "only the final selected mesh is stored");
const roundTrip = JSON.parse(JSON.stringify(archived)) as CatalogEntry;
const reopened = connectionsFromCatalog(roundTrip, tilesFromCatalog(roundTrip), loaded);
assert(reopened.map((item) => item.selectedMockId).join() === "H03,H13,H25,H07", "reopen keeps every saved hybrid id");
assert(reopened.every((item) => item.catalogHybrid === "snapshot"), "reopen uses the saved mesh");
assert(reopened[0]?.generatedHybridField?.candidates.find((item) => item.candidateId === "H03")?.geometry?.positions[0] === 0, "the H03 mesh is the saved mesh");
assert(reopened[2]?.generatedHybridField?.candidates.find((item) => item.candidateId === "H25")?.geometry?.positions[0] === 2, "the H25 mesh is the saved mesh");
assert(reopened.every((item) => item.generatedHybridField?.candidates.every((candidate) => !candidate.growth)), "playback frames are not restored");
const legacy = { ...archived, connections: archived.connections.map((item) => ({ ...item, selectedHybrid: null })) };
const legacyOpen = connectionsFromCatalog(legacy, tilesFromCatalog(legacy), loaded);
assert(legacyOpen.every((item) => item.catalogHybrid === "missing" && item.generatedHybridField === null), "an old save without a mesh is not replaced by a default hybrid");

console.log("skill4 catalog ok");
