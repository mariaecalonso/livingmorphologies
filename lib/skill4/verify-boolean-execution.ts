import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { diagnoseTopology } from "./boolean-conditioning";
import type { BooleanAssemblyPlan, BooleanConnectionPlan } from "./boolean-plan";
import { executeBooleanAssembly, placeTileMesh } from "./boolean-execution";
import { loadProvisionalMock } from "./fixtures";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
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

function connection(connectionId: string, status: BooleanConnectionPlan["status"], connector: IsoMesh | null, tileAId = "A", tileBId = "B"): BooleanConnectionPlan {
  const ready = status === "ready" && connector !== null;
  return {
    connectionId,
    candidateId: ready ? "H13" : null,
    status,
    tileAId: ready ? tileAId : null,
    tileBId: ready ? tileBId : null,
    faceA: ready ? "E" : null,
    faceB: ready ? "W" : null,
    inwardA: ready ? { x: -1, y: 0, z: 0 } : null,
    inwardB: ready ? { x: 1, y: 0, z: 0 } : null,
    participants: ready
      ? [
        { role: "parent-a", id: tileAId, required: true },
        { role: "closed-hybrid", id: "H13", required: true },
        { role: "parent-b", id: tileBId, required: true },
      ]
      : [],
    connectorGeometry: connector,
    validation: { accepted: ready, failures: ready ? [] : [status] },
  };
}

function plan(connections: BooleanConnectionPlan[]): BooleanAssemblyPlan {
  const readyConnectionCount = connections.filter((item) => item.status === "ready").length;
  const tiles = new Map<string, string[]>();
  for (const item of connections) {
    if (item.status !== "ready" || !item.tileAId || !item.tileBId) continue;
    for (const tileId of [item.tileAId, item.tileBId]) {
      const list = tiles.get(tileId) ?? [];
      list.push(item.connectionId);
      tiles.set(tileId, list);
    }
  }
  return {
    connections,
    tiles: [...tiles.entries()].map(([tileId, connectionIds]) => ({ tileId, connectionIds })),
    readyConnectionCount,
    failedConnectionCount: connections.length - readyConnectionCount,
    requiredParticipantCount: connections.reduce((sum, item) => sum + item.participants.length, 0),
    status: readyConnectionCount === connections.length && connections.length > 0 ? "ready" : readyConnectionCount > 0 ? "partial" : "not-ready",
  };
}

function same(left: ArrayLike<number> | undefined, right: ArrayLike<number>) {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function openLoft(x0: number, x1: number): IsoMesh {
  const samples = 4;
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const positions: number[] = [];
  for (let ring = 0; ring < steps; ring += 1) {
    const x = x0 + ((x1 - x0) * ring) / (steps - 1);
    positions.push(x, 0.4, 0.4, x, 0.6, 0.4, x, 0.6, 0.6, x, 0.4, 0.6);
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

function finiteMesh(mesh: IsoMesh, label: string) {
  assert(mesh.positions.length >= 9 && mesh.normals.length === mesh.positions.length, `${label} buffers`);
  assert(mesh.indices.length === mesh.triangles * 3 && mesh.triangles > 0, `${label} triangles`);
  for (let index = 0; index < mesh.positions.length; index += 1) assert(Number.isFinite(mesh.positions[index]) && Number.isFinite(mesh.normals[index]), `${label} finite`);
}

async function main() {
  const parent = box([0, 0, 0], [1, 1, 1]);
  const beforeParent = Float32Array.from(parent.positions);
  const loaded = moduleFor("box", parent);
  const tiles = [tile("A", "box", 0), tile("B", "box", 1.2)];
  const connector = openLoft(0.7, 1.5);
  const beforeConnector = Float32Array.from(connector.positions);
  const joinedPlan = plan([connection("connection:a", "ready", connector)]);
  const once = await executeBooleanAssembly(joinedPlan, tiles, loaded);
  const twice = await executeBooleanAssembly(joinedPlan, tiles, loaded);
  const joined = once.connections[0];
  if (!joined?.additionGeometry || !once.assembly.mesh || !joined.derivedConnector || !twice.assembly.mesh) throw new Error("the direct union did not produce a mesh");
  assert(once.status === "ready" && once.assembly.kernelStatus === "NoError", "parent A, the hybrid, and parent B join");
  assert(once.assembly.componentCount === 1 && once.assembly.boundaryEdgeCount === 0, "the assembly is one closed solid");
  assert(joined.parentAPresent && joined.hybridPresent && joined.parentBPresent && joined.unitedPieceCount === 3, "all three participants are present");
  assert(joined.overlapExtension === 0, "the existing overlap is enough for the box pair");
  assert(joined.stepAStatus === "ready" && joined.stepBStatus === "ready", "both union steps succeed");
  assert(joined.connectorSourceOpen === true && joined.connectorConditionStatus === "closed", "the open loft is closed before the union");
  assert(diagnoseTopology(joined.derivedConnector).boundaryEdgeCount === 0 && diagnoseTopology(joined.derivedConnector).componentCount === 1, "the derived hybrid is one closed solid");
  assert(diagnoseTopology(connector).boundaryEdgeCount > 0, "the source hybrid stays open");
  assert(joined.derivedConnector !== connector && once.assembly.mesh.positions !== parent.positions, "derived buffers are independent");
  finiteMesh(once.assembly.mesh, "assembly");
  assert(same(once.assembly.mesh.positions, twice.assembly.mesh.positions) && same(once.assembly.mesh.indices, twice.assembly.mesh.indices), "repeated execution is deterministic");
  assert(same(parent.positions, beforeParent) && same(connector.positions, beforeConnector), "source parent and hybrid buffers stay unchanged");
  const placedAgain = placeTileMesh(parent, tiles[0]);
  assert(placedAgain !== null && same(once.tiles[0]?.placedSource?.positions, placedAgain.positions), "the placed parent is not rewritten");

  const distant = await executeBooleanAssembly(plan([connection("connection:far", "ready", openLoft(3, 4))]), tiles, loaded);
  assert(distant.status === "unresolved" && distant.assembly.mesh === null, "a hybrid that misses both parents does not become a ready assembly");
  assert(distant.connections[0]?.parentAPresent === false && distant.connections[0]?.parentBPresent === false, "a failed join does not claim the parents are present");
  assert(distant.connections[0]?.additionGeometry === null, "a failed join does not publish a partial solid");

  const openLoaded = moduleFor("open", openTriangle());
  const openTiles = [tile("A", "open"), tile("B", "open", 1.2)];
  const openRun = await executeBooleanAssembly(plan([connection("connection:open", "ready", connector)]), openTiles, openLoaded);
  assert(openRun.status === "unresolved" && openRun.assembly.mesh === null, "open parents stay unresolved");
  assert(openRun.tiles.every((item) => item.status === "unresolved" && item.derivedGeometry === null), "open parents are not sent into the union");
  assert(openRun.tiles[0]?.readiness?.status === "open", "an open parent reports its boundary");

  const skipped = await executeBooleanAssembly(plan([connection("connection:skip", "not-ready", null)]), [], new Map());
  assert(skipped.status === "unresolved" && skipped.connections[0]?.unionStatus === "not-run" && skipped.assembly.mesh === null, "a not-ready connection is not executed");

  const mirrored = [tile("A", "box", 0, "x"), tile("B", "box", 1.2)];
  const mirroredRun = await executeBooleanAssembly(plan([connection("connection:mirror", "ready", openLoft(-0.3, 1.5))]), mirrored, loaded);
  assert(mirroredRun.status === "ready" && mirroredRun.connections[0]?.parentAPresent && mirroredRun.connections[0].parentBPresent, "a mirrored parent still joins");

  const executionSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "boolean-execution.ts"), "utf8");
  assert(executionSource.includes("closeConnectorLoft(") && executionSource.includes("booleanUnion(") && executionSource.includes("evaluateBooleanReadiness("), "execution closes the hybrid and unions both parents");
  assert(!executionSource.includes("booleanDifference("), "execution does not subtract insertion volumes");
  assert(!executionSource.includes("conditionTileCopy"), "execution does not repair tile meshes");
  assert(!executionSource.includes(".concat(") && !/new Float32Array\(\[/.test(executionSource), "execution does not concatenate mesh buffers");

  const ground = loadProvisionalMock("topographic-ground-field");
  if (ground.status !== "ready") throw new Error("the current topographic ground field fixture is not ready");
  const groundPositions = Float32Array.from(ground.geometry.positions);
  const groundTiles = [tile("A", "topographic-ground-field"), tile("B", "topographic-ground-field", 1.2)];
  const groundLoaded = new Map([["topographic-ground-field", ground]]);
  const groundRun = await executeBooleanAssembly(plan([connection("connection:ground", "ready", connector)]), groundTiles, groundLoaded);
  const groundTile = groundRun.tiles[0];
  assert(same(ground.geometry.positions, groundPositions), "the project tile mesh is not modified");
  assert(groundTile?.readiness?.status === "open" && groundTile.readiness.boundaryEdgeCount === 10 && groundTile.readiness.componentCount === 4, "the project tile stays not boolean-ready");
  assert(groundRun.status === "unresolved" && groundRun.assembly.mesh === null, "an open project tile does not become a joined assembly");
  assert(ground.status === "ready", "the project tile remains available to Skill 04");

  console.log(`skill4 boolean execution ok · assembly ${once.status} · overlap ${joined.overlapExtension} · components ${once.assembly.componentCount} · boundary ${once.assembly.boundaryEdgeCount} · project tile ${ground.identity.name} ${groundTile?.readiness?.status}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
