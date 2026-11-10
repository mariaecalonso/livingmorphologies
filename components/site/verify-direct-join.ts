import assert from "node:assert/strict";
import { proposeDirectJoin, readStoredJoins } from "../../lib/skill5/direct-join";
import type { FaceId } from "../../lib/skill5/face-match";
import type { PlacedModule } from "../../lib/skill5/placement";

function mesh(openFace: FaceId | null, rows = [0, 1, 2, 3]) {
  const positions: number[] = [];
  const stamp = (x: number, north: number, up: number) => positions.push(x, north, up);
  const faces: { id: FaceId; point: (row: number, col: number) => [number, number, number] }[] = [
    { id: "E", point: (row, col) => [10, col * 2.5 + 1.25 - 10, row * 2.5 + 1.25] },
    { id: "W", point: (row, col) => [-10, col * 2.5 + 1.25 - 10, row * 2.5 + 1.25] },
    { id: "N", point: (row, col) => [col * 2.5 + 1.25 - 10, 10, row * 2.5 + 1.25] },
    { id: "S", point: (row, col) => [col * 2.5 + 1.25 - 10, -10, row * 2.5 + 1.25] },
    { id: "T", point: (row, col) => [row * 2.5 + 1.25 - 10, col * 2.5 + 1.25 - 10, 20] },
    { id: "B", point: (row, col) => [row * 2.5 + 1.25 - 10, col * 2.5 + 1.25 - 10, 0] },
  ];
  for (const face of faces) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const door = face.id === openFace && col >= 3 && col <= 4 && rows.includes(row);
        if (door) continue;
        const [x, north, up] = face.point(row, col);
        stamp(x, north, up);
      }
    }
  }
  return new Float32Array(positions);
}

function tile(id: string, x: number, y: number, z: number): PlacedModule {
  return {
    instanceId: id,
    kind: "archetype",
    name: id,
    status: "Validated",
    geometryState: "available",
    program: "gathering",
    programSource: "suggested",
    provenance: { moduleId: id, archetypeId: id, source: "skill3", candidateId: 1, continuationId: "c" },
    transform: { position: { x, y, z }, rotationY: 0 },
  };
}

const east = mesh("E");
const west = mesh("W");
const eastCopy = new Float32Array(east);
const westCopy = new Float32Array(west);
const side = proposeDirectJoin(tile("hall", 0, 0.7, 0), tile("void", 20, 0.7, 0), east, west);
assert.equal(side.valid, true);
assert.equal(side.faceA, "E");
assert.equal(side.faceB, "W");
assert.equal(side.type, "side");
assert.equal(side.integrity, "closed");
assert.equal(side.traversable, true);
assert.ok(side.passage && side.passage.indices.length >= 12);
assert.deepEqual(east, eastCopy);
assert.deepEqual(west, westCopy);

const narrow = proposeDirectJoin(tile("hall", 0, 0.7, 0), tile("gallery", 20, 0.7, 0), east, mesh("W", [0, 1, 2]));
assert.equal(narrow.valid, true, "a smaller opening still joins where the two doors overlap");
assert.ok(narrow.alignment < side.alignment);

const stacked = proposeDirectJoin(tile("lower", 40, 0.7, 0), tile("upper", 40, 20.7, 0), mesh("T"), mesh("B"));
assert.equal(stacked.valid, true);
assert.equal(stacked.type, "stack");
assert.equal(stacked.faceA, "T");
assert.equal(stacked.faceB, "B");
assert.equal(stacked.integrity, "closed");

const blocked = proposeDirectJoin(tile("hall", 0, 0.7, 0), tile("solid", 20, 0.7, 0), east, mesh(null));
assert.equal(blocked.valid, false);
assert.equal(blocked.passage, null);
assert.match(blocked.issues[0] ?? "", /No passage was cut/);

const shifted = proposeDirectJoin(tile("hall", 0, 0.7, 0), tile("high", 20, 0.7, 0), east, mesh("W", [5, 6, 7]));
assert.equal(shifted.valid, false);
assert.match(shifted.issues[0] ?? "", /do not overlap|floors differ|No passage/);

const apart = proposeDirectJoin(tile("hall", 0, 0.7, 0), tile("far", 60, 0.7, 0), east, west);
assert.equal(apart.valid, false);
assert.match(apart.issues[0] ?? "", /do not share/);

const again = proposeDirectJoin(tile("hall", 0, 0.7, 0), tile("void", 20, 0.7, 0), east, west);
assert.equal(again.valid, true, "dropping the join and reading the original meshes builds the same passage");
assert.equal(again.passage?.indices.length, side.passage?.indices.length);

const saved = readStoredJoins([{
  id: "c1",
  tileA: "hall",
  tileB: "void",
  faceA: side.faceA,
  faceB: side.faceB,
  joinType: side.type,
  alignment: side.alignment,
  floorDelta: side.floorDelta,
  integrity: "closed",
  passage: side.passage,
}]);
assert.equal(saved.length, 1);
assert.equal(saved[0]?.passage.indices.length, side.passage?.indices.length);
assert.equal(readStoredJoins([{ id: "c2", tileA: "hall", tileB: "void" }]).length, 0);
assert.deepEqual(east, eastCopy);

console.log("direct join checks passed");
