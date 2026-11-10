import assert from "node:assert/strict";
import { faceBook, matchTileFaces, type FaceId } from "../../lib/skill5/face-match";
import type { PlacedModule } from "../../lib/skill5/placement";

function mesh(openFace: FaceId | null, high = false) {
  const positions: number[] = [];
  const stamp = (x: number, north: number, up: number) => {
    positions.push(x, north, up);
  };
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
        const door = face.id === openFace && col >= 3 && col <= 4 && (high ? row >= 5 && row <= 7 : row <= 3);
        if (door) continue;
        const [x, north, up] = face.point(row, col);
        stamp(x, north, up);
      }
    }
  }
  return new Float32Array(positions);
}

function placed(id: string, x: number, y: number, z: number, positions: Float32Array): PlacedModule {
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

const eastDoor = mesh("E");
const book = faceBook(eastDoor);
assert.ok(book.E.openings >= 2, "the east door is read from the face vertices");
assert.equal(book.W.openings, 0, "a solid face does not gain an opening");
assert.equal(book.N.openings, 0);

const host = placed("host", 0, 0.7, 0, eastDoor);
const guestNorth = mesh("N");
const side = matchTileFaces({
  positions: guestNorth,
  pointer: { x: 20, y: 0.7, z: 0 },
  instances: [host],
  meshes: { host: { positions: eastDoor } },
  auto: true,
  manual: null,
  cycle: 0,
});
assert.equal(side.valid, true);
assert.equal(side.x, 20);
assert.ok(Math.abs(side.pose.rotationY - Math.PI / 2) < 0.01, "the north opening turns to face the east door");
assert.equal(side.pair, "North · East");
assert.ok(side.highlights.some((mark) => mark.kind === "opening"));

const alreadyWest = matchTileFaces({
  positions: mesh("W"),
  pointer: { x: 20, y: 0.7, z: 0 },
  instances: [host],
  meshes: { host: { positions: eastDoor } },
  auto: true,
  manual: null,
  cycle: 0,
});
assert.equal(alreadyWest.valid, true);
assert.ok(Math.abs(alreadyWest.pose.rotationY) < 0.01);
assert.equal(alreadyWest.pose.mirror, null);

const mirrored = matchTileFaces({
  positions: mesh("E"),
  pointer: { x: 20, y: 0.7, z: 0 },
  instances: [host],
  meshes: { host: { positions: eastDoor } },
  auto: true,
  manual: null,
  cycle: 0,
});
assert.equal(mirrored.valid, true);
assert.ok(mirrored.pose.mirror === "x" || Math.abs(mirrored.pose.rotationY - Math.PI) < 0.01);

const low = matchTileFaces({
  positions: mesh("W"),
  pointer: { x: 20, y: 0.7, z: 0 },
  instances: [host],
  meshes: { host: { positions: eastDoor } },
  auto: true,
  manual: null,
  cycle: 0,
});
const highHost = placed("high", 0, 0.7, 40, mesh("E", true));
const high = matchTileFaces({
  positions: mesh("W"),
  pointer: { x: 20, y: 0.7, z: 40 },
  instances: [highHost],
  meshes: { high: { positions: mesh("E", true) } },
  auto: true,
  manual: null,
  cycle: 0,
});
assert.ok(low.score > high.score, "a floor-aligned door scores above a high door");

const below = placed("below", 40, 0.7, 40, mesh("T"));
const stacked = matchTileFaces({
  positions: mesh("B"),
  pointer: { x: 40, y: 0.7, z: 40 },
  instances: [below],
  meshes: { below: { positions: mesh("T") } },
  auto: true,
  manual: null,
  cycle: 0,
});
assert.equal(stacked.valid, true);
assert.equal(stacked.y, 20.7);
assert.equal(stacked.pair, "Bottom · Top");
assert.ok(Math.abs(stacked.pose.rotationY) < 0.01 || Math.abs(stacked.pose.rotationY - Math.PI) < 0.01);

const solid = matchTileFaces({
  positions: mesh(null),
  pointer: { x: 20, y: 0.7, z: 0 },
  instances: [host],
  meshes: { host: { positions: eastDoor } },
  auto: true,
  manual: null,
  cycle: 0,
});
assert.equal(solid.valid, false);
assert.match(solid.warning ?? "", /not invented|cannot be matched|No opening/);

const manual = matchTileFaces({
  positions: guestNorth,
  pointer: { x: 20, y: 0.7, z: 0 },
  instances: [host],
  meshes: { host: { positions: eastDoor } },
  auto: false,
  manual: { rotationY: 0, mirror: null },
  cycle: 0,
});
assert.equal(manual.pose.rotationY, 0, "a manual pose is left as set");

console.log("face match checks passed");
