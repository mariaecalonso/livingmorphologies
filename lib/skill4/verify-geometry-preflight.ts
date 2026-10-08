import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TYPOLOGIES } from "../catalog";
import type { IsoMesh } from "../scan/isomesh";
import { isoMeshToBooleanMesh } from "./boolean-adapter";
import { executeBooleanAssembly } from "./boolean-execution";
import type { BooleanAssemblyPlan } from "./boolean-plan";
import { readProvisionalMock } from "./fixtures";
import {
  ensureGeometryPreflight,
  geometryPreflightComputations,
  preflightGeometry,
} from "./geometry-preflight";
import { loadModuleMap } from "./tiles";
import type { TileInstance } from "./tiles";

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

function openTube(): IsoMesh {
  const ring = [
    [0, -0.2, -0.2],
    [0, 0.2, -0.2],
    [0, 0.2, 0.2],
    [0, -0.2, 0.2],
  ];
  const positions = [...ring.flat(), ...ring.map(([x, y, z]) => [x + 1, y, z]).flat()];
  const indices: number[] = [];
  for (let sample = 0; sample < 4; sample += 1) {
    const next = (sample + 1) % 4;
    indices.push(sample, next, 4 + next, sample, 4 + next, 4 + sample);
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

function sameBytes(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function dirtySolid(): IsoMesh {
  const clean = box([-0.2, -0.2, -0.2], [0.2, 0.2, 0.2]);
  const positions = Array.from(clean.positions);
  positions.push(clean.positions[0], clean.positions[1], clean.positions[2]);
  const duplicate = positions.length / 3 - 1;
  const indices = Array.from(clean.indices);
  indices[0] = duplicate;
  indices.push(0, 1, 1);
  positions.push(9, 9, 9);
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

async function main() {
const solid = box([-0.2, -0.2, -0.2], [0.2, 0.2, 0.2]);
const positions = Float32Array.from(solid.positions);
const indices = Uint32Array.from(solid.indices);
const normals = Float32Array.from(solid.normals);
const original: IsoMesh = { positions, normals, indices, triangles: solid.triangles };
const positionCopy = Float32Array.from(positions);
const indexCopy = Uint32Array.from(indices);
const normalCopy = Float32Array.from(normals);

const dirty = dirtySolid();
const dirtyPositions = Float32Array.from(dirty.positions);
const dirtyIndices = Uint32Array.from(dirty.indices);
const cleaned = await preflightGeometry(dirty);
assert(sameBytes(dirty.positions, dirtyPositions) && sameBytes(dirty.indices, dirtyIndices), "original geometry is unchanged");
assert(cleaned.originalGeometry === dirty, "preflight keeps the source mesh reference");
assert(cleaned.removedDuplicateVertices === 1, "exact duplicate vertices are removed");
assert(cleaned.removedDegenerateTriangles === 1, "degenerate triangles are removed");
assert(cleaned.removedUnusedVertices === 1, "unused vertices are removed");
assert(cleaned.normalsRebuilt && cleaned.physicalGeometry !== null, "normals are rebuilt on the copy");
if (cleaned.physicalGeometry) {
  let span = 0;
  for (let index = 0; index < cleaned.physicalGeometry.normals.length; index += 3) {
    span = Math.max(span, Math.hypot(
      cleaned.physicalGeometry.normals[index],
      cleaned.physicalGeometry.normals[index + 1],
      cleaned.physicalGeometry.normals[index + 2],
    ));
  }
  assert(span > 0.9 && span < 1.1, "rebuilt normals are unit length");
  assert(cleaned.physicalGeometry.positions !== dirty.positions, "the physical copy is a different buffer");
}
assert(cleaned.manifoldReady && cleaned.status === "ready", "trivial defects condition into a manifold");

const flipped = box([-0.2, -0.2, -0.2], [0.2, 0.2, 0.2]);
const flippedIndices = Uint32Array.from(flipped.indices);
const swap = flippedIndices[1];
flippedIndices[1] = flippedIndices[2];
flippedIndices[2] = swap;
const oriented = await preflightGeometry({ ...flipped, indices: flippedIndices });
assert(oriented.orientationRepaired && oriented.manifoldReady, "one reversed face is repaired without moving vertices");

const untouched = await preflightGeometry(original);
assert(sameBytes(original.positions, positionCopy) && sameBytes(original.indices, indexCopy) && sameBytes(original.normals, normalCopy), "a clean source stays byte-for-byte unchanged");
assert(untouched.topologyChanged === false && untouched.normalsRebuilt, "a clean mesh only rebuilds normals");

const open = await preflightGeometry(openTube());
assert(open.status === "unresolved" && open.manifoldReady === false, "an open mesh stays unresolved");
assert(open.reason.startsWith("boundary-edges:"), "an open mesh is not capped");
assert(open.physicalGeometry !== null && open.physicalGeometry.triangles === openTube().triangles, "an open mesh does not gain faces");

const separated = joinMeshes(box([-0.2, -0.2, -0.2], [0.2, 0.2, 0.2]), box([1.2, -0.2, -0.2], [1.6, 0.2, 0.2]));
const disconnected = await preflightGeometry(separated);
assert(disconnected.status === "unresolved" && disconnected.manifoldReady === false, "disconnected solids stay unresolved");
assert(disconnected.reason.startsWith("components:"), "disconnected solids are not joined");
assert(disconnected.toleranceWelded === false && disconnected.removedDuplicateVertices === 0, "distant components are not welded");

const near = box([-0.2, -0.2, -0.2], [0.2, 0.2, 0.2]);
const moved = Float32Array.from(near.positions);
const extra = moved.length / 3;
const positionsWithNear = new Float32Array(moved.length + 3);
positionsWithNear.set(moved);
positionsWithNear[moved.length] = moved[0] + 1e-7;
positionsWithNear[moved.length + 1] = moved[1];
positionsWithNear[moved.length + 2] = moved[2];
const nearIndices = Uint32Array.from(near.indices);
nearIndices[0] = extra;
const welded = await preflightGeometry({
  positions: positionsWithNear,
  normals: new Float32Array(positionsWithNear.length),
  indices: nearIndices,
  triangles: nearIndices.length / 3,
});
assert(welded.toleranceWelded && welded.manifoldReady, "a sub-tolerance weld stays on the physical copy");

const kernel = await isoMeshToBooleanMesh(dirty);
kernel.mesh?.release();
assert(kernel.status !== "ready", "the dirty source is not the boolean operand");

const base = readProvisionalMock("topographic-ground-field");
const ids = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((archetype) => archetype.id));
assert(ids.length === 15, "the catalog still has the final 15 archetypes");
const batch = ids.map((archetypeId, index) => ({
  ...base,
  moduleId: `skill03:${archetypeId}@1`,
  revision: 1,
  archetypeId,
  source: "skill03" as const,
  provisional: false,
  selectedFinal: true,
  geometry: index === 0 ? dirty : solid,
  provenance: { role: "skill03-output" as const, note: "Final Skill 03 geometry." },
}));
const before = geometryPreflightComputations();
const loaded = loadModuleMap(batch);
const started = geometryPreflightComputations();
assert(started === before + 15, "load schedules one preflight per final module");
loadModuleMap(batch);
assert(geometryPreflightComputations() === started, "a second load uses the preflight cache");
const first = loaded.get(ids[0]);
if (!first || first.status !== "ready") throw new Error("the first archetype did not adapt");
assert(first.geometry === dirty, "design handoff keeps the original mesh");
const report = await ensureGeometryPreflight(first.moduleId, first.revision, first.geometry);
assert(report.manifoldReady && report.physicalGeometry !== null && report.physicalGeometry !== first.geometry, "the cached physical copy is distinct");

const bite = box([0.05, 0.05, 0.05], [0.35, 0.35, 0.35]);
const plan: BooleanAssemblyPlan = {
  connections: [],
  tiles: [{
    tileId: "A",
    operations: [{
      connectionId: "A-B",
      candidateId: "H01",
      tileId: "A",
      face: "E",
      operation: "difference",
      sequence: 1,
      volume: bite,
      potentialCutConflict: false,
    }],
    order: ["difference", "preserve-tile", "union-connector-later"],
  }],
  connectorAdditions: [],
  readyConnectionCount: 0,
  failedConnectionCount: 0,
  status: "not-ready",
};
const tile: TileInstance = {
  instanceId: "A",
  archetypeId: ids[0],
  moduleId: first.moduleId,
  transform: { x: 0, y: 0, z: 0 },
  rotationQuarter: 0,
  mirror: null,
};
const execution = await executeBooleanAssembly(plan, [tile], loaded);
assert(sameBytes(dirty.positions, dirtyPositions), "boolean execution does not rewrite the original");
assert(execution.tiles[0]?.successfulCutCount === 1 && execution.tiles[0].derivedGeometry !== null, "boolean execution uses the conditioned manifold");
assert(first.geometry === dirty, "display geometry is still the original mesh");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return full.endsWith(".tsx") || full.endsWith(".css") ? [full] : [];
  });
}
const ui = filesUnder(path.join(process.cwd(), "components")).filter((file) => readFileSync(file, "utf8").includes("geometry-preflight") || readFileSync(file, "utf8").includes("physicalGeometry"));
assert(ui.length === 0, "preflight stays off the interface");

console.log("skill4 geometry preflight ok · 15 cached · conditioned boolean");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
