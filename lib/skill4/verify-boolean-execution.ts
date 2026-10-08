import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { booleanDifference } from "./boolean-adapter";
import { diagnoseTopology } from "./boolean-conditioning";
import type { BooleanAssemblyPlan, BooleanConnectionPlan, BooleanCut } from "./boolean-plan";
import { executeBooleanAssembly, placeTileMesh } from "./boolean-execution";
import { loadProvisionalMock } from "./fixtures";
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

function openTriangle(): IsoMesh {
  return {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array(9),
    indices: Uint32Array.from([0, 1, 2]),
    triangles: 1,
  };
}

function tile(id: string, archetypeId: string, transformX = 0, mirror: TileInstance["mirror"] = null): TileInstance {
  return {
    instanceId: id,
    archetypeId,
    moduleId: archetypeId,
    transform: { x: transformX, y: 0, z: 0 },
    rotationQuarter: 0,
    mirror,
  };
}

function moduleFor(id: string, mesh: IsoMesh) {
  return new Map([[id, { status: "ready", moduleId: id, geometry: mesh } as ReadyModule]]);
}

function cut(connectionId: string, tileId: string, volume: IsoMesh, sequence: number, conflict = false): BooleanCut {
  return {
    connectionId,
    candidateId: "H05",
    tileId,
    face: "E",
    operation: "difference",
    sequence,
    volume,
    potentialCutConflict: conflict,
  };
}

function connection(connectionId: string, status: BooleanConnectionPlan["status"], pieces?: { connector: IsoMesh; insertionA: IsoMesh; insertionB: IsoMesh }, cuts?: { a: BooleanCut | null; b: BooleanCut | null }): BooleanConnectionPlan {
  return {
    connectionId,
    candidateId: "H05",
    status,
    tileAOperation: cuts?.a ?? null,
    tileBOperation: cuts?.b ?? null,
    connectorOperation: pieces
      ? {
        operation: "union-later",
        connectionId,
        candidateId: "H05",
        connector: pieces.connector,
        insertionA: pieces.insertionA,
        insertionB: pieces.insertionB,
        interfaceA: null as never,
        interfaceB: null as never,
      }
      : null,
    cutVolumeA: cuts?.a?.volume ?? null,
    cutVolumeB: cuts?.b?.volume ?? null,
    connectorGeometry: pieces?.connector ?? null,
    validation: { accepted: status === "ready", failures: status === "ready" ? [] : [status] },
  };
}

function plan(connections: BooleanConnectionPlan[], cutsByTile: Map<string, BooleanCut[]>): BooleanAssemblyPlan {
  const readyConnectionCount = connections.filter((item) => item.status === "ready").length;
  return {
    connections,
    tiles: [...cutsByTile.entries()].map(([tileId, operations]) => ({
      tileId,
      operations,
      order: ["difference", "preserve-tile", "union-connector-later"] as const,
    })),
    connectorAdditions: connections.flatMap((item) => (item.connectorOperation ? [item.connectorOperation] : [])),
    readyConnectionCount,
    failedConnectionCount: connections.length - readyConnectionCount,
    status: readyConnectionCount === connections.length && connections.length > 0 ? "ready" : readyConnectionCount > 0 ? "partial" : "not-ready",
  };
}

function same(left: ArrayLike<number> | undefined, right: ArrayLike<number>) {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function openLoft(): IsoMesh {
  const samples = 4;
  const steps = 5;
  const positions: number[] = [];
  for (let ring = 0; ring < steps; ring += 1) {
    const x = 0.9 + (ring / (steps - 1)) * 0.8;
    const ringPoints = [
      [x, 0.4, 0.4],
      [x, 0.6, 0.4],
      [x, 0.6, 0.6],
      [x, 0.4, 0.6],
    ];
    positions.push(...ringPoints.flat());
  }
  const indices: number[] = [];
  for (let ring = 0; ring < steps - 1; ring += 1) {
    for (let sample = 0; sample < samples; sample += 1) {
      const next = (sample + 1) % samples;
      const a = ring * samples + sample;
      const b = ring * samples + next;
      const c = (ring + 1) * samples + next;
      const d = (ring + 1) * samples + sample;
      indices.push(a, b, c, a, c, d);
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function bounds(mesh: IsoMesh) {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    maxX = Math.max(maxX, mesh.positions[index]);
  }
  return { minX, maxX };
}

function finiteMesh(mesh: IsoMesh, label: string) {
  assert(mesh.positions.length >= 9 && mesh.normals.length === mesh.positions.length, `${label} buffers`);
  assert(mesh.indices.length === mesh.triangles * 3 && mesh.triangles > 0, `${label} triangles`);
  for (let index = 0; index < mesh.positions.length; index += 1) assert(Number.isFinite(mesh.positions[index]) && Number.isFinite(mesh.normals[index]), `${label} finite`);
}

async function main() {
const source = box([0, 0, 0], [1, 1, 1]);
const biteA = box([1.5, -0.2, -0.2], [2.4, 1.2, 1.2]);
const biteB = box([0.6, -0.2, -0.2], [1.25, 1.2, 1.2]);
const beforeSource = Float32Array.from(source.positions);
const beforeBiteA = Float32Array.from(biteA.positions);
const beforeBiteB = Float32Array.from(biteB.positions);
const loaded = moduleFor("box", source);
const tiles = [tile("A", "box", 1)];
const first = cut("connection:a", "A", biteA, 0);
const second = cut("connection:b", "A", biteB, 1);
const multi = plan([
  connection("connection:a", "ready", undefined, { a: first, b: null }),
  connection("connection:b", "ready", undefined, { a: second, b: null }),
], new Map([["A", [first, second]]]));

const once = await executeBooleanAssembly(multi, tiles, loaded);
const twice = await executeBooleanAssembly(multi, tiles, loaded);
const tileA = once.tiles[0];
if (!tileA?.derivedGeometry || !tileA.placedSource || !twice.tiles[0]?.derivedGeometry) throw new Error("two cuts did not produce a derived tile");
assert(tileA.status === "ready" && tileA.successfulCutCount === 2 && tileA.failedCutCount === 0, "both ordered cuts succeed");
assert(tileA.cuts.map((item) => item.connectionId).join() === "connection:a,connection:b", "cuts stay in plan order");
assert(tileA.cuts.every((item) => item.success && item.kernelStatus === "NoError" && item.adapterStatus === "ready"), "each cut records a kernel success");
finiteMesh(tileA.derivedGeometry, "derived tile");
const placedBounds = bounds(tileA.placedSource);
const derivedBounds = bounds(tileA.derivedGeometry);
assert(tileA.cuts[1].inputTriangleCount === tileA.cuts[0].outputTriangleCount, "later cuts use the previous result");
assert(derivedBounds.minX > 1.24 && derivedBounds.maxX < 1.51, `ordered cuts remove both ends · derived ${derivedBounds.minX.toFixed(3)}-${derivedBounds.maxX.toFixed(3)}`);
assert(placedBounds.minX > 0.99 && placedBounds.maxX < 2.01, "the placed copy is translated into assembly coordinates");
assert(same(tileA.derivedGeometry.positions, twice.tiles[0].derivedGeometry.positions) && same(tileA.derivedGeometry.indices, twice.tiles[0].derivedGeometry.indices), "repeated execution is deterministic");
assert(tileA.derivedGeometry.positions !== source.positions && tileA.derivedGeometry.positions !== tileA.placedSource.positions, "derived buffers are independent");
assert(same(source.positions, beforeSource) && same(biteA.positions, beforeBiteA) && same(biteB.positions, beforeBiteB), "source tile and cut volumes stay unchanged");
const placedAgain = placeTileMesh(source, tiles[0]);
assert(placedAgain !== null && same(tileA.placedSource.positions, placedAgain.positions), "the placed copy is not rewritten by the cuts");

const onlyFirst = await booleanDifference(tileA.placedSource, biteA);
if (!onlyFirst.mesh) throw new Error("the first cut alone should succeed");
const failedTool = openTriangle();
const failedCut = cut("connection:fail", "A", failedTool, 1);
const kept = plan([
  connection("connection:a", "ready", undefined, { a: first, b: null }),
  connection("connection:fail", "ready", undefined, { a: failedCut, b: null }),
], new Map([["A", [first, failedCut]]]));
const partial = await executeBooleanAssembly(kept, tiles, loaded);
const partialTile = partial.tiles[0];
assert(partial.status === "partial" && partialTile?.status === "partial", "a later failed cut leaves a partial tile");
assert(partialTile?.successfulCutCount === 1 && partialTile.failedCutCount === 1, "the failed cut is counted");
assert(partialTile?.cuts[1].success === false && partialTile.cuts[1].adapterStatus !== "ready", "the failed cut does not report success");
assert(partialTile?.derivedGeometry !== null && same(partialTile?.derivedGeometry?.positions, onlyFirst.mesh.positions), "the earlier valid difference is preserved");

const overlapA = box([1.2, 0.2, 0.2], [1.7, 0.8, 0.8]);
const overlapB = box([1.4, 0.3, 0.3], [1.8, 0.9, 0.9]);
const conflictA = cut("connection:a", "A", overlapA, 0, true);
const conflictB = cut("connection:b", "A", overlapB, 1, true);
const conflicted = await executeBooleanAssembly(plan([
  connection("connection:a", "ready"),
  connection("connection:b", "ready"),
], new Map([["A", [conflictA, conflictB]]])), tiles, loaded);
assert(conflicted.tiles[0]?.cuts.every((item) => item.warning === "potential-cut-conflict" && item.potentialCutConflict), "potential cut conflicts are kept on the cut records");
assert(conflicted.warnings.includes("potential-cut-conflict"), "the conflict warning reaches the execution result");

const connector = openLoft();
const insertionA = box([0.8, 0.42, 0.42], [1.05, 0.58, 0.58]);
const insertionB = box([1.55, 0.42, 0.42], [1.9, 0.58, 0.58]);
const beforeConnector = Float32Array.from(connector.positions);
const beforeInsertionA = Float32Array.from(insertionA.positions);
const beforeInsertionB = Float32Array.from(insertionB.positions);
const joinedPlan = plan([
  connection("connection:a", "ready", { connector, insertionA, insertionB }, { a: first, b: null }),
], new Map([["A", [first]]]));
const joined = await executeBooleanAssembly(joinedPlan, tiles, loaded);
const addition = joined.connections[0];
if (!addition?.additionGeometry || !joined.assembly.mesh || !joined.tiles[0]?.derivedGeometry) throw new Error("the full union did not produce meshes");
assert(addition.status === "ready" && addition.unionStatus === "ready" && addition.kernelStatus === "NoError", "connector and insertions union through the kernel");
assert(addition.connectorSourceOpen === true && addition.connectorConditionStatus === "closed", "the open loft is closed before the union");
assert(addition.derivedConnector !== null && addition.derivedConnector !== connector && diagnoseTopology(addition.derivedConnector).closed, "the derived connector is a new closed solid");
assert(diagnoseTopology(connector).boundaryEdgeCount > 0, "the canonical connector stays open");
assert(addition.unitedPieceCount === 3, "all three addition pieces are in the union");
finiteMesh(addition.additionGeometry, "addition");
assert(bounds(addition.additionGeometry).maxX > 1.89 && bounds(addition.additionGeometry).minX < 0.81, "the addition union spans both insertions");
assert(addition.additionGeometry.positions !== connector.positions && addition.additionGeometry.positions !== insertionA.positions, "addition buffers are independent");
assert(same(connector.positions, beforeConnector) && same(insertionA.positions, beforeInsertionA) && same(insertionB.positions, beforeInsertionB), "connector and insertion buffers stay unchanged");
assert(joined.assembly.status === "ready" && joined.assembly.kernelStatus === "NoError" && joined.status === "ready", "the derived tile and addition form one manifold union");
finiteMesh(joined.assembly.mesh, "assembly");
assert(joined.assembly.mesh.positions.length !== joined.tiles[0].derivedGeometry.positions.length + addition.additionGeometry.positions.length, "the assembly union is not a buffer concatenation");
assert(joined.tiles[0].readiness?.booleanReady === true, "the closed synthetic tile is boolean-ready");

const mirrored = [tile("A", "box", 2, "x")];
const mirroredCut = cut("connection:a", "A", box([1, 0, 0], [1.4, 1, 1]), 0);
const mirroredRun = await executeBooleanAssembly(plan([
  connection("connection:a", "ready", undefined, { a: mirroredCut, b: null }),
], new Map([["A", [mirroredCut]]])), mirrored, loaded);
const mirroredTile = mirroredRun.tiles[0];
assert(mirroredTile?.status === "ready" && mirroredTile.derivedGeometry !== null, "a mirrored placed box remains a valid solid");
if (!mirroredTile?.derivedGeometry) throw new Error("mirrored cut missing");
assert(bounds(mirroredTile.derivedGeometry).minX > 1.39, "the mirrored tile is cut after placement");

const openLoaded = moduleFor("open", openTriangle());
const openTiles = [tile("A", "open")];
const openCut = cut("connection:a", "A", biteA, 0);
const openRun = await executeBooleanAssembly(plan([
  connection("connection:a", "ready", undefined, { a: openCut, b: null }),
], new Map([["A", [openCut]]])), openTiles, openLoaded);
assert(openRun.status === "unresolved" && openRun.tiles[0]?.status === "unresolved", "an open tile is unresolved");
assert(openRun.tiles[0]?.successfulCutCount === 0 && openRun.tiles[0].derivedGeometry === null, "an open tile does not pretend its cuts succeeded");
assert(openRun.tiles[0]?.readiness?.status === "open" && openRun.tiles[0].readiness.reason.includes("boundary-edges"), "an open tile reports its boundary edges");
assert(openRun.tiles[0]?.cuts[0].adapterStatus === "not-run", "an open tile is not sent to the boolean kernel");

const skipped = await executeBooleanAssembly(plan([
  connection("connection:skip", "not-ready"),
], new Map()), [], new Map());
assert(skipped.status === "unresolved" && skipped.connections[0]?.unionStatus === "not-run" && skipped.connections[0].additionGeometry === null, "a not-ready connection is not executed");

const executionSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "boolean-execution.ts"), "utf8");
assert(executionSource.includes("closeConnectorLoft(") && executionSource.includes("evaluateBooleanReadiness("), "execution closes connectors and checks tile readiness");
assert(!executionSource.includes("conditionTileCopy"), "execution does not repair tile meshes");
assert(!executionSource.includes(".concat(") && !/new Float32Array\(\[/.test(executionSource), "execution does not concatenate mesh buffers");

const ground = loadProvisionalMock("topographic-ground-field");
if (ground.status !== "ready") throw new Error("the current topographic ground field fixture is not ready");
const groundPositions = Float32Array.from(ground.geometry.positions);
const groundTiles = [tile("A", "topographic-ground-field")];
const groundLoaded = new Map([["topographic-ground-field", ground]]);
const groundCut = cut("connection:a", "A", box([0, 0, 0], [0.2, 0.2, 0.2]), 0);
const groundRun = await executeBooleanAssembly(plan([
  connection("connection:a", "ready", undefined, { a: groundCut, b: null }),
], new Map([["A", [groundCut]]])), groundTiles, groundLoaded);
const groundTile = groundRun.tiles[0];
assert(same(ground.geometry.positions, groundPositions), "the project tile mesh is not modified");
assert(groundTile?.readiness?.status === "open" && groundTile.readiness.boundaryEdgeCount === 10 && groundTile.readiness.componentCount === 4, "the project tile stays not boolean-ready");
assert(groundTile?.status === "unresolved" && groundTile.successfulCutCount === 0 && groundTile.derivedGeometry === null, "physical cuts are not attempted on the open project tile");
assert(ground.status === "ready", "the project tile remains available to Skill 04");

console.log(`skill4 boolean execution ok · assembly ${joined.status} · connector ${addition?.connectorConditionStatus} · cuts ${tileA.successfulCutCount}/${tileA.plannedCutCount} · project tile ${ground.identity.name} ${groundTile?.readiness?.status} boundary ${groundTile?.readiness?.boundaryEdgeCount} components ${groundTile?.readiness?.componentCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
