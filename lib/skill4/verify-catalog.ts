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

console.log("skill4 catalog ok");
