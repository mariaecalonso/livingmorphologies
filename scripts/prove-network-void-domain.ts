/**
 * Provisional checks for the network void domain and occupancy.
 * Reads frozen clusters. Writes nothing.
 */
import { buildNetworkDomain, pointInBuiltDomain } from "../lib/skill5/network-void-domain";
import { generateNetworkConstrainedVoid, type PositionedSolid } from "../lib/skill5/network-constrained-void";
import { loadPositionedCluster } from "../lib/skill5/network-void-assembly";

const SOURCE = "provisional-network-void-test";

function box(id: string, min: [number, number, number], max: [number, number, number]): PositionedSolid {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 3, 6, 2, 3, 7, 6,
    0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]);
  return { id, positions, indices };
}

function tunnel(): PositionedSolid {
  const positions = new Float32Array([
    0, 0, 0, 12, 0, 0, 12, 8, 0, 0, 8, 0,
    0, 0, 8, 12, 0, 8, 12, 8, 8, 0, 8, 8,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
  ]);
  return { id: "tunnel", positions, indices };
}

const failures: string[] = [];
const started = Date.now();

const built = buildNetworkDomain({
  source: SOURCE,
  provisional: true,
  zones: [
    { id: "zone-a", plan: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 }], baseFt: 0, heightFt: 24 },
    { id: "zone-b", plan: [{ x: 80, z: 0 }, { x: 110, z: 0 }, { x: 110, z: 20 }, { x: 80, z: 20 }] },
  ],
  corridors: [
    { id: "link", from: { x: 30, z: 10 }, to: { x: 80, z: 10 }, baseFt: 0, heightFt: 16 },
    { id: "given", from: { x: 30, z: 10 }, to: { x: 80, z: 10 }, widthFt: 12, baseFt: 0, heightFt: 16 },
  ],
  transitions: [{ id: "step", plan: [{ x: 28, z: 8 }, { x: 36, z: 8 }, { x: 36, z: 14 }, { x: 28, z: 14 }], minY: 16, maxY: 28 }],
  exclusions: [{ id: "court", plan: [{ x: 8, z: 6 }, { x: 16, z: 6 }, { x: 16, z: 14 }, { x: 8, z: 14 }], minY: 0, maxY: 24 }],
  siteBoundary: null,
});
if (!built.missing.some((item) => item.id === "zone-b" && item.parameter.includes("height"))) failures.push("missing height");
if (!built.missing.some((item) => item.id === "link" && item.parameter === "widthFt")) failures.push("missing width");
if (!built.domain) failures.push("domain");
if (built.domain && pointInBuiltDomain({ x: 55, y: 8, z: 10 }, built) !== true) failures.push("corridor");
if (built.domain && pointInBuiltDomain({ x: 55, y: 8, z: 40 }, built) !== false) failures.push("outside corridor");
if (built.domain && pointInBuiltDomain({ x: 12, y: 8, z: 10 }, built) !== false) failures.push("exclusion");

const gap = generateNetworkConstrainedVoid({
  solids: [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [24, 10, 10])],
  domain: { kind: "bounds", min: { x: -2, y: -2, z: -2 }, max: { x: 40, y: 14, z: 14 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 2, shelter: 8 },
  minimumComponent: 4,
  cell: 1,
});
const tight = generateNetworkConstrainedVoid({
  solids: [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [24, 10, 10])],
  domain: { kind: "bounds", min: { x: -2, y: -2, z: -2 }, max: { x: 40, y: 14, z: 14 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 2, shelter: 1.5 },
  minimumComponent: 4,
  cell: 1,
});
if (gap.voidCount < 8 || gap.leaked !== 0) failures.push("gap");
if (!(tight.voidCount < gap.voidCount)) failures.push("shelter");

const excluded = generateNetworkConstrainedVoid({
  solids: [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [24, 10, 10])],
  domain: {
    kind: "bounds",
    min: { x: -2, y: -2, z: -2 },
    max: { x: 40, y: 14, z: 14 },
    source: SOURCE,
    provisional: true,
    exclusions: [{ kind: "bounds", min: { x: 9, y: -1, z: -1 }, max: { x: 16, y: 12, z: 12 }, source: SOURCE, provisional: true }],
  },
  clearance: { minimumGap: 2, shelter: 8 },
  minimumComponent: 4,
  cell: 1,
});
if (!(excluded.voidCount < gap.voidCount / 4) || excluded.leaked !== 0) failures.push("exclusion-void");

const overflow = generateNetworkConstrainedVoid({
  solids: [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [30, 10, 10])],
  domain: { kind: "bounds", min: { x: -2, y: -2, z: -2 }, max: { x: 20, y: 14, z: 14 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 2, shelter: 8 },
  minimumComponent: 4,
  cell: 1,
});
if (overflow.solidConflicts < 1 || overflow.leaked !== 0) failures.push("conflict");

const opened = generateNetworkConstrainedVoid({
  solids: [tunnel(), box("cap", [20, 0, 0], [28, 8, 8])],
  domain: { kind: "bounds", min: { x: -2, y: -2, z: -2 }, max: { x: 32, y: 12, z: 12 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 2, shelter: 6 },
  minimumComponent: 1,
  cell: 1,
});
const tunnelCell = (x: number) => {
  const gx = Math.round((x - opened.grid.origin.x) / opened.grid.cell - 0.5);
  const gy = Math.round((4 - opened.grid.origin.y) / opened.grid.cell - 0.5);
  const gz = Math.round((4 - opened.grid.origin.z) / opened.grid.cell - 0.5);
  return opened.occupied[(gz * opened.grid.ny + gy) * opened.grid.nx + gx] === 1;
};
if (opened.processing !== "dense" || tunnelCell(6)) failures.push("opening");

const west = loadPositionedCluster("workspace-workspace", "workspace-workspace:0", { x: 0, y: 0, z: 0, rotationY: 0 });
const east = loadPositionedCluster("workspace-workspace", "workspace-workspace:0", { x: 70, y: 0, z: 0, rotationY: 90 });
if (west.shrinkWrapTriangles < 8) failures.push("shrink-wrap");
const stamp = west.positions[0];
const clusters = generateNetworkConstrainedVoid({
  solids: [west, east],
  domain: built.domain ?? { kind: "bounds", min: { x: -20, y: -5, z: -20 }, max: { x: 120, y: 40, z: 40 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 3, shelter: 12 },
  minimumComponent: 8,
  cell: 2,
});
if (west.positions[0] !== stamp) failures.push("mutated");
if (clusters.leaked !== 0) failures.push("cluster-leak");
if (clusters.occupiedCount < 100) failures.push("cluster-occupied");

const chunked = generateNetworkConstrainedVoid({
  solids: [box("a", [0, 0, 0], [8, 8, 8]), box("b", [12, 0, 0], [20, 8, 8])],
  domain: { kind: "bounds", min: { x: -4, y: -4, z: -4 }, max: { x: 220, y: 100, z: 100 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 2, shelter: 6 },
  minimumComponent: 4,
  cell: 1,
});
if (chunked.processing !== "chunked" || chunked.leaked !== 0 || chunked.voidCount < 1) failures.push("chunked");

const continuousStarted = Date.now();
const continuous = generateNetworkConstrainedVoid({
  solids: [box("a", [0, 0, 0], [10, 10, 10]), box("b", [14, 0, 0], [24, 10, 10])],
  domain: { kind: "bounds", min: { x: -2, y: -2, z: -2 }, max: { x: 26, y: 12, z: 12 }, source: SOURCE, provisional: true },
  clearance: { minimumGap: 2, shelter: 8 },
  minimumComponent: 4,
  cell: 1,
  continuous: true,
});
if (!continuous.continuous || continuous.leaked !== 0 || continuous.voidCount < 8) failures.push("continuous");

console.log(JSON.stringify({
  provisional: true,
  ms: Date.now() - started,
  missing: built.missing,
  gap: { void: gap.voidCount, leaked: gap.leaked, conflicts: gap.solidConflicts },
  shelterReducedVoid: tight.voidCount,
  exclusionVoid: excluded.voidCount,
  conflicts: overflow.solidConflicts,
  openingOccupied: tunnelCell(6),
  shrinkWrapTriangles: west.shrinkWrapTriangles,
  clusters: { occupied: clusters.occupiedCount, void: clusters.voidCount, leaked: clusters.leaked, conflicts: clusters.solidConflicts, msNote: "included above" },
  chunked: { processing: chunked.processing, void: chunked.voidCount, leaked: chunked.leaked },
  continuous: { triangles: continuous.continuous?.triangles ?? 0, note: continuous.continuousNote, ms: Date.now() - continuousStarted, voxelTriangles: continuous.boundary.triangles },
  failures,
}, null, 2));
if (failures.length) process.exit(1);
