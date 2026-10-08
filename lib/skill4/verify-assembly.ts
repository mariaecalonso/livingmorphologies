import { gridShape, layoutTiles, mockPlacementSupported, worldFace } from "./assembly-layout";
import { detectAdjacencies, reconcileConnections } from "./connections";
import { mockHybridField } from "./mock-hybrids";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "./fixtures";
import { loadModuleMap, resolveTileModule } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const loaded = loadModuleMap(PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id)));
const square = layoutTiles(4, "grid").map((tile) => ({ ...tile, moduleId: resolveTileModule(tile.archetypeId, loaded).moduleId }));
const squareIds = detectAdjacencies(square).map((item) => `${item.tileAId}-${item.tileBId}`).sort();
assert(squareIds.join() === ["A-B", "A-C", "B-D", "C-D"].sort().join(), "a 2x2 has four independent adjacencies");
assert(gridShape(4, "grid").columns === 2 && gridShape(4, "grid").rows === 2, "four tiles use a 2x2 grid");

const line = layoutTiles(4, "linear");
assert(detectAdjacencies(line).length === 3, "four linear tiles have three adjacencies");

const connections = reconcileConnections([], square, loaded);
assert(connections.length === 4, "each adjacency owns a matrix");
assert(connections.every((connection) => connection.selectedMockId === "H13"), "each connection starts with its own mock selection");
const changed = connections.map((connection, index) => index === 0 ? { ...connection, selectedMockId: "H02" } : connection);
assert(changed[0].selectedMockId === "H02" && changed[1].selectedMockId === "H13", "selecting a hybrid changes only that connection");

const field = mockHybridField(connections[0].signature);
const again = mockHybridField(connections[0].signature);
assert(field === again && field.candidates.length === 25, "mock candidates are cached by signature");
assert(field.candidates.every((candidate) => candidate.physicallyConnected === false && candidate.validation === "unverified"), "mocks are not marked connected");

const rotated = square.map((tile) => tile.instanceId === "A" ? { ...tile, rotationQuarter: 1 as const } : tile);
const pair = connections.find((connection) => connection.tileAId === "A" && connection.tileBId === "B");
assert(pair !== undefined, "A-B exists");
if (!pair) throw new Error("unreachable");
assert(worldFace("E", rotated[0]) === "N", "a quarter turn carries east to north");
assert(mockPlacementSupported(pair, rotated) === false, "a turned face is unsupported instead of retargeted");
assert(mockPlacementSupported(pair, square) === true, "the original east-west pairing is supported");

const tee = layoutTiles(4, "t");
assert(tee.map((tile) => tile.instanceId).join("") === "ABCD", "a T uses four tiles");
assert(tee.find((tile) => tile.instanceId === "D")?.transform.z === tee.find((tile) => tile.instanceId === "B")?.transform.x, "the T stem sits north of the center tile");
assert(detectAdjacencies(tee).map((item) => `${item.tileAId}:${item.faceA}-${item.tileBId}:${item.faceB}`).sort().join() === ["A:E-B:W", "B:E-C:W", "B:N-D:S"].sort().join(), "a T meets on the bar and the stem");
const cross = layoutTiles(4, "cross");
assert(cross.map((tile) => tile.instanceId).join("") === "ABCDE", "a cross uses five tiles");
assert(detectAdjacencies(cross).length === 4, "a cross has four arms and no diagonal pairs");
assert(gridShape(4, "t").columns === 3 && gridShape(4, "cross").rows === 3, "T and cross report their spans");

const missing = resolveTileModule("vertical-void", loaded);
assert(missing.status === "unavailable" && missing.geometry === null, "an unavailable archetype is not given another mesh");

console.log("skill4 assembly ok · 2x2 4 · linear 3");
