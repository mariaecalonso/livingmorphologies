import type { IsoMesh } from "../scan/isomesh";
import { BOOLEAN_ADAPTER_SETTINGS, booleanDifference, booleanMeshToIsoMesh, booleanUnion, isoMeshToBooleanMesh, loadBooleanKernel } from "./boolean-adapter";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function box(min: [number, number, number], max: [number, number, number]): IsoMesh {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = [
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ];
  const quads = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
  ];
  const indices = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function bounds(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    minY = Math.min(minY, mesh.positions[index + 1]);
    minZ = Math.min(minZ, mesh.positions[index + 2]);
    maxX = Math.max(maxX, mesh.positions[index]);
    maxY = Math.max(maxY, mesh.positions[index + 1]);
    maxZ = Math.max(maxZ, mesh.positions[index + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function valid(mesh: IsoMesh, label: string) {
  assert(mesh.positions.length >= 9 && mesh.positions.length % 3 === 0, `${label} positions`);
  assert(mesh.normals.length === mesh.positions.length, `${label} normals`);
  assert(mesh.indices.length >= 3 && mesh.indices.length === mesh.triangles * 3, `${label} triangles`);
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 1) assert(Number.isFinite(mesh.positions[index]), `${label} finite position`);
  for (let index = 0; index < mesh.normals.length; index += 1) assert(Number.isFinite(mesh.normals[index]), `${label} finite normal`);
  for (let index = 0; index < mesh.indices.length; index += 1) {
    assert(mesh.indices[index] >= 0 && mesh.indices[index] < vertexCount, `${label} index`);
  }
}

function same(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function bytes(mesh: IsoMesh) {
  return {
    positions: Float32Array.from(mesh.positions),
    normals: Float32Array.from(mesh.normals),
    indices: Uint32Array.from(mesh.indices),
  };
}

async function main() {
const kernel = await loadBooleanKernel();
assert(typeof kernel.Manifold === "function" && typeof kernel.setup === "function", "manifold-3d loads");

const boxA = box([0, 0, 0], [1, 1, 1]);
const boxB = box([0.5, 0, 0], [1.5, 1, 1]);
const beforeA = bytes(boxA);
const beforeB = bytes(boxB);

const converted = await isoMeshToBooleanMesh(boxA);
assert(converted.status === "ready" && converted.mesh !== null, "a closed box enters the boolean kernel");
if (!converted.mesh) throw new Error("unreachable");
const roundTrip = await booleanMeshToIsoMesh(converted.mesh);
converted.mesh.release();
assert(roundTrip.status === "ready" && roundTrip.mesh !== null && roundTrip.kernelStatus === "NoError", "round trip returns a manifold mesh");
if (!roundTrip.mesh) throw new Error("unreachable");
valid(roundTrip.mesh, "round trip");
const trip = bounds(roundTrip.mesh);
assert(trip.minX > -0.01 && trip.maxX < 1.01 && trip.minY > -0.01 && trip.maxY < 1.01 && trip.minZ > -0.01 && trip.maxZ < 1.01, "round trip keeps the box bounds");
assert(roundTrip.mesh.positions !== boxA.positions && roundTrip.mesh.indices !== boxA.indices, "round trip uses new buffers");

const cut = await booleanDifference(boxA, boxB);
const again = await booleanDifference(boxA, boxB);
assert(cut.status === "ready" && cut.mesh !== null && cut.kernelStatus === "NoError", "difference runs in manifold-3d");
assert(again.status === "ready" && again.mesh !== null, "difference can be repeated");
if (!cut.mesh || !again.mesh) throw new Error("unreachable");
valid(cut.mesh, "difference");
assert(same(cut.mesh.positions, again.mesh.positions) && same(cut.mesh.indices, again.mesh.indices), "difference is deterministic");
const cutBounds = bounds(cut.mesh);
assert(cutBounds.maxX < 0.51 && cutBounds.maxX > 0.49, "difference removes the overlapping half of box A");
assert(!same(cut.mesh.positions, boxA.positions), "difference changes the derived mesh");
assert(cut.mesh.positions !== boxA.positions && cut.mesh.positions !== boxB.positions, "difference buffers are independent");

const joined = await booleanUnion(boxA, boxB);
const joinedAgain = await booleanUnion(boxA, boxB);
assert(joined.status === "ready" && joined.mesh !== null && joined.kernelStatus === "NoError", "union runs in manifold-3d");
assert(joinedAgain.mesh !== null, "union can be repeated");
if (!joined.mesh || !joinedAgain.mesh) throw new Error("unreachable");
valid(joined.mesh, "union");
assert(same(joined.mesh.positions, joinedAgain.mesh.positions) && same(joined.mesh.indices, joinedAgain.mesh.indices), "union is deterministic");
const joinedBounds = bounds(joined.mesh);
assert(joinedBounds.minX < 0.01 && joinedBounds.maxX > 1.49 && joined.mesh.triangles > boxA.triangles, "union spans both boxes");
assert(joined.mesh.positions !== boxA.positions && joined.mesh.indices !== boxA.indices, "union buffers are independent");

assert(same(boxA.positions, beforeA.positions) && same(boxA.indices, beforeA.indices), "box A is unchanged");
assert(same(boxB.positions, beforeB.positions) && same(boxB.indices, beforeB.indices), "box B is unchanged");

const broken = box([0, 0, 0], [1, 1, 1]);
broken.positions[0] = Number.NaN;
const rejected = await booleanDifference(broken, boxB);
assert(rejected.status === "invalid-input" && rejected.mesh === null, "non-finite input is rejected");
const empty = { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangles: 0 };
const emptyResult = await isoMeshToBooleanMesh(empty);
assert(emptyResult.status === "invalid-input" && emptyResult.mesh === null, "an empty mesh is rejected");

const openTriangle: IsoMesh = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array(9),
  indices: Uint32Array.from([0, 1, 2]),
  triangles: 1,
};
const openResult = await isoMeshToBooleanMesh(openTriangle);
assert(openResult.status === "non-manifold" && openResult.mesh === null, "a non-manifold mesh does not pretend success");

console.log(`skill4 boolean adapter ok · ${BOOLEAN_ADAPTER_SETTINGS.kernel}@${BOOLEAN_ADAPTER_SETTINGS.kernelVersion} · cut x ${cutBounds.maxX.toFixed(3)} · union x ${joinedBounds.maxX.toFixed(3)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
