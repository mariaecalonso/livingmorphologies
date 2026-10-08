import type { IsoMesh } from "../scan/isomesh";
import { booleanUnion } from "./boolean-adapter";
import { closeConnectorLoft, conditionTileCopy, diagnoseTopology, evaluateBooleanReadiness, PHYSICAL_TILE_REQUIREMENT } from "./boolean-conditioning";
import { loadProvisionalMock } from "./fixtures";

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
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const indices = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

/** Open square tube. Ring-major, same quad winding as an unflipped loft. */
function openTube(): IsoMesh {
  const ring = [
    [0, -0.2, -0.2],
    [0, 0.2, -0.2],
    [0, 0.2, 0.2],
    [0, -0.2, 0.2],
  ];
  const positions = [
    ...ring.flat(),
    ...ring.map(([x, y, z]) => [x + 1, y, z]).flat(),
  ];
  const indices: number[] = [];
  for (let sample = 0; sample < 4; sample += 1) {
    const next = (sample + 1) % 4;
    const a = sample;
    const b = next;
    const c = 4 + next;
    const d = 4 + sample;
    indices.push(a, b, c, a, c, d);
  }
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function joinMeshes(left: IsoMesh, right: IsoMesh): IsoMesh {
  const shift = left.positions.length / 3;
  return {
    positions: Float32Array.from([...left.positions, ...right.positions]),
    normals: Float32Array.from([...left.normals, ...right.normals]),
    indices: Uint32Array.from([...left.indices, ...Array.from(right.indices, (index) => index + shift)]),
    triangles: left.triangles + right.triangles,
  };
}

function same(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function finiteMesh(mesh: IsoMesh, label: string) {
  assert(mesh.positions.length >= 9 && mesh.normals.length === mesh.positions.length, `${label} buffers`);
  assert(mesh.triangles > 0 && mesh.indices.length === mesh.triangles * 3, `${label} triangles`);
  for (let index = 0; index < mesh.positions.length; index += 1) {
    assert(Number.isFinite(mesh.positions[index]) && Number.isFinite(mesh.normals[index]), `${label} finite`);
  }
}

function maxAxis(mesh: IsoMesh, axis: number) {
  let max = -Infinity;
  let min = Infinity;
  for (let index = axis; index < mesh.positions.length; index += 3) {
    max = Math.max(max, mesh.positions[index]);
    min = Math.min(min, mesh.positions[index]);
  }
  return { min, max };
}

async function main() {
  const tube = openTube();
  const beforePositions = Float32Array.from(tube.positions);
  const beforeIndices = Uint32Array.from(tube.indices);
  const open = diagnoseTopology(tube);
  assert(!open.closed && open.boundaryEdgeCount === 8 && open.nonManifoldEdgeCount === 0, "the open loft is detected as open");

  const capped = closeConnectorLoft(tube, 4, 2);
  if (!capped.mesh) throw new Error(`the capped connector was not created: ${capped.reason}`);
  const closed = diagnoseTopology(capped.mesh);
  assert(capped.status === "ready" && closed.closed && closed.boundaryEdgeCount === 0 && closed.nonManifoldEdgeCount === 0, "the derived connector is closed");
  finiteMesh(capped.mesh, "capped connector");
  assert(capped.mesh.positions !== tube.positions && capped.mesh.indices !== tube.indices, "the cap uses new buffers");
  assert(same(tube.positions, beforePositions) && same(tube.indices, beforeIndices), "the canonical connector is unchanged");

  const insertionA = box([-0.15, -0.1, -0.1], [0.15, 0.1, 0.1]);
  const insertionB = box([0.85, -0.1, -0.1], [1.15, 0.1, 0.1]);
  const beforeA = Float32Array.from(insertionA.positions);
  const beforeB = Float32Array.from(insertionB.positions);
  const beforeCap = Float32Array.from(capped.mesh.positions);
  const first = await booleanUnion(capped.mesh, insertionA);
  if (!first.mesh) throw new Error(`connector union insertion A failed: ${first.status} ${first.reason}`);
  const second = await booleanUnion(first.mesh, insertionB);
  assert(first.status === "ready" && first.kernelStatus === "NoError", "insertion A unions through the kernel");
  assert(second.status === "ready" && second.kernelStatus === "NoError" && second.mesh !== null, "insertion B unions through the kernel");
  if (!second.mesh) throw new Error("addition mesh missing");
  const span = maxAxis(second.mesh, 0);
  assert(span.min < -0.14 && span.max > 1.14, "the addition solid spans both insertions");
  assert(second.mesh.triangles !== capped.mesh.triangles + insertionA.triangles + insertionB.triangles, `the addition is not a buffer concatenation · tris ${second.mesh.triangles} vs ${capped.mesh.triangles}+${insertionA.triangles}+${insertionB.triangles}`);
  assert(second.mesh.positions !== capped.mesh.positions && second.mesh.positions !== insertionA.positions, "the addition owns its buffers");
  assert(same(tube.positions, beforePositions) && same(capped.mesh.positions, beforeCap), "connector inputs stay unchanged");
  assert(same(insertionA.positions, beforeA) && same(insertionB.positions, beforeB), "insertion inputs stay unchanged");

  const solid = box([0, 0, 0], [1, 1, 1]);
  const solidTopology = diagnoseTopology(solid);
  assert(solidTopology.closed && solidTopology.boundaryEdgeCount === 0 && solidTopology.nonManifoldEdgeCount === 0 && solidTopology.componentCount === 1, "a closed box is diagnosed as closed");
  const withUnused = {
    positions: Float32Array.from([...solid.positions, 4, 4, 4]),
    normals: new Float32Array(solid.normals.length + 3),
    indices: Uint32Array.from(solid.indices),
    triangles: solid.triangles,
  };
  const beforeUnused = Float32Array.from(withUnused.positions);
  const unusedResult = await conditionTileCopy(withUnused);
  assert(unusedResult.status === "ready" && unusedResult.mesh !== null && unusedResult.operations.includes("drop-unused-vertices"), "an unused vertex is removed on a derived copy");
  if (!unusedResult.mesh) throw new Error("conditioned box missing");
  assert(unusedResult.mesh.positions !== withUnused.positions && unusedResult.after?.closed === true, "the conditioned copy is an independent closed mesh");
  assert(same(withUnused.positions, beforeUnused), "exact conditioning does not rewrite its input");
  const openMesh = {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array(9),
    indices: Uint32Array.from([0, 1, 2]),
    triangles: 1,
  };
  const triangle = diagnoseTopology(openMesh);
  assert(!triangle.closed && triangle.boundaryEdgeCount === 3, "an open triangle is diagnosed as open");
  const openReadiness = await evaluateBooleanReadiness(openMesh);
  assert(openReadiness.status === "open" && openReadiness.booleanReady === false && openReadiness.kernelStatus === null, "an open tile is not boolean-ready");
  const closedReadiness = await evaluateBooleanReadiness(solid);
  assert(closedReadiness.status === "ready" && closedReadiness.booleanReady && closedReadiness.kernelStatus === "NoError" && closedReadiness.boundaryEdgeCount === 0, "a closed synthetic tile is boolean-ready");
  const shifted = box([3, 0, 0], [4, 1, 1]);
  const disconnected = await evaluateBooleanReadiness(joinMeshes(solid, shifted));
  assert(disconnected.status === "disconnected" && disconnected.componentCount === 2 && disconnected.booleanReady === false, "a disconnected tile is not boolean-ready");
  const pinched = {
    positions: Float32Array.from(solid.positions),
    normals: Float32Array.from(solid.normals),
    indices: Uint32Array.from([...solid.indices, 0, 1, 2]),
    triangles: solid.triangles + 1,
  };
  const pinchedReadiness = await evaluateBooleanReadiness(pinched);
  assert(pinchedReadiness.status === "non-manifold" && pinchedReadiness.nonManifoldEdgeCount > 0 && pinchedReadiness.booleanReady === false, "a non-manifold tile is not boolean-ready");
  assert(PHYSICAL_TILE_REQUIREMENT.closed && PHYSICAL_TILE_REQUIREMENT.components === 1, "physical interlocking requires one closed manifold component");

  const ground = loadProvisionalMock("topographic-ground-field");
  if (ground.status !== "ready") throw new Error("the topographic ground field fixture is not ready");
  const groundPositions = Float32Array.from(ground.geometry.positions);
  const groundIndices = Uint32Array.from(ground.geometry.indices);
  const conditioned = await conditionTileCopy(ground.geometry);
  assert(same(ground.geometry.positions, groundPositions) && same(ground.geometry.indices, groundIndices), "the source tile is unchanged");
  const before = conditioned.before;
  assert(before.vertexCount > 0 && before.triangleCount === ground.geometry.triangles, "the project tile diagnostic counts its triangles");
  assert(!before.closed && before.boundaryEdgeCount === 10 && before.componentCount === 4, "the current topographic ground field is an open four-component mesh");
  const groundReadiness = await evaluateBooleanReadiness(ground.geometry);
  assert(groundReadiness.status === "open" && groundReadiness.booleanReady === false && groundReadiness.boundaryEdgeCount === 10 && groundReadiness.componentCount === 4, "the ground field reports why it is not boolean-ready");
  assert(ground.status === "ready", "the ground field remains available to Skill 04");
  assert(conditioned.status === "unresolved" && conditioned.mesh === null && conditioned.adapterStatus === "not-run", "no safe conditioning is applied, and the tile stays unresolved");

  const report = conditioned.after
    ? `after verts ${conditioned.after.vertexCount} tris ${conditioned.after.triangleCount} boundary ${conditioned.after.boundaryEdgeCount} nonmanifold ${conditioned.after.nonManifoldEdgeCount} adapter ${conditioned.adapterStatus}`
    : "no safe conditioning";
  console.log(`skill4 boolean conditioning ok · cap closed ${closed.closed} · addition x ${span.min.toFixed(3)}..${span.max.toFixed(3)} · ground verts ${before.vertexCount} tris ${before.triangleCount} boundary ${before.boundaryEdgeCount} nonmanifold ${before.nonManifoldEdgeCount} duplicate-pos ${before.duplicatePositionCount} weld-candidates ${before.weldCandidateCount} degenerate ${before.degenerateTriangleCount} duplicate-tri ${before.duplicateTriangleCount} components ${before.componentCount} · ${conditioned.status} · ${conditioned.operations.join(",") || "none"} · ${report} · ${conditioned.reason}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
