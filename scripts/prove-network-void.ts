/**
 * Provisional proof of Network Constrained Void Generation.
 * Reads frozen Final Cluster meshes and does not write them.
 * Does not read or write Site Strategy, Designer Zoning, or Cluster Assemblies.
 */
import { readFileSync } from "node:fs";
import { decodeSolidifiedMesh } from "../lib/skill3/solidified-mesh";
import { loadSkill3HandoffRecord } from "../lib/skill4/skill3-handoff";
import { placeTileMesh } from "../lib/skill4/cluster-void";
import type { TileInstance } from "../lib/skill4/tiles";
import {
  generateNetworkConstrainedVoid,
  placeSolidOnSite,
  type PositionedSolid,
  type VoidDomain,
} from "../lib/skill5/network-constrained-void";

const PROVISIONAL = "provisional-network-void-test";

function box(id: string, min: [number, number, number], max: [number, number, number]): PositionedSolid {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
  ]);
  return { id, positions, indices };
}

function domain(min: [number, number, number], max: [number, number, number], source: string): VoidDomain {
  return {
    kind: "bounds",
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] },
    source,
    provisional: true,
  };
}

function run(name: string, solids: PositionedSolid[], volume: VoidDomain, cell = 1) {
  const started = Date.now();
  const result = generateNetworkConstrainedVoid({
    solids,
    domain: volume,
    clearance: { minimumGap: 2, shelter: 8 },
    minimumComponent: 4,
    cell,
  });
  return {
    name,
    ms: Date.now() - started,
    provisional: result.provisional,
    occupied: result.occupiedCount,
    void: result.voidCount,
    voidCubicFeet: Number(result.voidCubicFeet.toFixed(1)),
    components: result.voidComponents,
    unclaimed: result.unclaimedDomain,
    leaked: result.leaked,
    boundaryTriangles: result.boundary.triangles,
    grid: `${result.grid.nx}×${result.grid.ny}×${result.grid.nz} @ ${result.grid.cell} ft`,
  };
}

function clusterSolid(id: string, pose: { x: number; y: number; z: number }): PositionedSolid {
  const pair = JSON.parse(readFileSync("data/skill4/final-clusters-pairs/workspace-workspace.json", "utf8")) as {
    clusters: { id: string; tiles: TileInstance[] }[];
  };
  const cluster = pair.clusters.find((item) => item.id === "workspace-workspace:0");
  if (!cluster) throw new Error("workspace-workspace:0 missing");
  const parts = cluster.tiles.map((tile) => {
    const record = loadSkill3HandoffRecord(tile.archetypeId);
    if (!record) throw new Error(`missing ${tile.archetypeId}`);
    const local = decodeSolidifiedMesh(record.geometry);
    return placeTileMesh(tile, local);
  });
  let count = 0;
  parts.forEach((part) => {
    count += part.positions.length;
  });
  const positions = new Float32Array(count);
  const indices: number[] = [];
  let vertex = 0;
  let offset = 0;
  parts.forEach((part) => {
    positions.set(part.positions, offset);
    part.indices.forEach((index) => indices.push(index + vertex));
    vertex += part.positions.length / 3;
    offset += part.positions.length;
  });
  return placeSolidOnSite(id, { positions, indices: Uint32Array.from(indices) }, { x: pose.x, y: pose.y, z: pose.z, rotationY: 0 });
}

function bounds(solid: PositionedSolid) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < solid.positions.length; index += 3) {
    minX = Math.min(minX, solid.positions[index]);
    minY = Math.min(minY, solid.positions[index + 1]);
    minZ = Math.min(minZ, solid.positions[index + 2]);
    maxX = Math.max(maxX, solid.positions[index]);
    maxY = Math.max(maxY, solid.positions[index + 1]);
    maxZ = Math.max(maxZ, solid.positions[index + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

const horizontal = run(
  "horizontal gap",
  [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [24, 10, 10])],
  domain([-2, -2, -2], [26, 14, 24], PROVISIONAL),
);
const vertical = run(
  "vertical gap",
  [box("lower", [0, 0, 0], [10, 10, 10]), box("upper", [0, 14, 0], [10, 24, 10])],
  domain([-2, -2, -2], [12, 26, 12], PROVISIONAL),
);
const connected = run(
  "one connected gap",
  [box("west", [0, 0, 0], [8, 12, 24]), box("east", [12, 0, 0], [20, 12, 24])],
  domain([-1, -1, -1], [21, 14, 25], PROVISIONAL),
);
const separated = run(
  "two separated gaps",
  [
    box("a", [0, 0, 0], [8, 8, 8]),
    box("b", [12, 0, 0], [20, 8, 8]),
    box("c", [40, 0, 0], [48, 8, 8]),
    box("d", [52, 0, 0], [60, 8, 8]),
  ],
  domain([-2, -2, -2], [62, 12, 12], PROVISIONAL),
);
const sealed = run(
  "domain excludes the gap",
  [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [24, 10, 10])],
  domain([-2, -2, -2], [11, 12, 12], PROVISIONAL),
);

const left = clusterSolid("cluster-west", { x: 0, y: 0, z: 0 });
const leftBounds = bounds(left);
const shift = leftBounds.maxX - leftBounds.minX + 6;
const right = clusterSolid("cluster-east", { x: shift, y: 0, z: 0 });
const rightBounds = bounds(right);
const stamp = left.positions[0];
const clusters = run(
  "two final clusters",
  [left, right],
  domain(
    [Math.min(leftBounds.minX, rightBounds.minX) - 2, Math.min(leftBounds.minY, rightBounds.minY) - 2, Math.min(leftBounds.minZ, rightBounds.minZ) - 2],
    [Math.max(leftBounds.maxX, rightBounds.maxX) + 2, Math.max(leftBounds.maxY, rightBounds.maxY) + 8, Math.max(leftBounds.maxZ, rightBounds.maxZ) + 8],
    PROVISIONAL,
  ),
  2,
);

const failures: string[] = [];
if (horizontal.void < 8 || horizontal.leaked !== 0 || horizontal.unclaimed < 1) failures.push("horizontal");
if (vertical.void < 8 || vertical.leaked !== 0) failures.push("vertical");
if (connected.components !== 1 || connected.leaked !== 0) failures.push("connected");
if (separated.components !== 2 || separated.leaked !== 0) failures.push("separated");
if (sealed.void !== 0 || sealed.leaked !== 0) failures.push("sealed");
if (clusters.occupied < 100 || clusters.leaked !== 0 || clusters.boundaryTriangles < 10) failures.push("clusters");
if (left.positions[0] !== stamp) failures.push("solid mutated");
if (horizontal.boundaryTriangles < 10 || vertical.boundaryTriangles < 10) failures.push("boundary");

console.log(JSON.stringify({
  provisional: true,
  catalogWritten: false,
  siteAuthoritiesWritten: false,
  cases: [horizontal, vertical, connected, separated, sealed, clusters],
  solidPreserved: left.positions[0] === stamp,
  failures,
}, null, 2));
if (failures.length) process.exit(1);
