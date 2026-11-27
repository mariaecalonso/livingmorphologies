import { readFileSync } from "node:fs";
import site from "../data/skill5/herald-site.json";
import { selectedClusterAssembly } from "../lib/skill5/cluster-assemblies";
import { generatePlacementNetworkVoid } from "../lib/skill5/placement-network-void";

const herald = site as { site: { ring: { x: number; z: number }[] } };
const parcel = herald.site.ring;
const assembly = selectedClusterAssembly();
if (!assembly) throw new Error("no assembly");
const raw = JSON.parse(readFileSync("data/skill5/herald-arrival-v1.json", "utf8")) as {
  iterations?: { id?: string; branches?: { x0: number; z0: number; x1: number; z1: number }[] }[];
};
const iteration = raw.iterations?.find((item) => item.id === assembly.selectedNetworkId);
const branches = (iteration?.branches ?? []).map((b) => ({
  x0: b.x0,
  z0: b.z0,
  x1: b.x1,
  z1: b.z1,
  conductivity: 1,
}));

const report = generatePlacementNetworkVoid({ assembly, branches });
const p = report.voidMesh.positions;

function pointIn(x: number, z: number, ring: readonly { x: number; z: number }[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const crosses = a.z > z !== b.z > z;
    if (crosses && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function distToRing(x: number, z: number, ring: readonly { x: number; z: number }[]) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}

let outsideParcel = 0;
let maxParcel = 0;
let maxVein = 0;
let sumVein = 0;
const n = p.length / 3;
for (let i = 0; i < p.length; i += 3) {
  const x = p[i]!;
  const z = p[i + 2]!;
  const dParcel = distToRing(x, z, parcel);
  if (!pointIn(x, z, parcel)) {
    outsideParcel += 1;
    if (dParcel > maxParcel) maxParcel = dParcel;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const b of branches) {
    const abx = b.x1 - b.x0;
    const abz = b.z1 - b.z0;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - b.x0) * abx + (z - b.z0) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (b.x0 + abx * t), z - (b.z0 + abz * t)));
  }
  if (best > maxVein) maxVein = best;
  sumVein += best;
}

console.log(
  JSON.stringify(
    {
      outsideParcel,
      maxDistOutsideParcelFt: Number(maxParcel.toFixed(2)),
      voidVerts: n,
      maxDistToAnyVeinFt: Number(maxVein.toFixed(2)),
      avgDistToAnyVeinFt: Number((sumVein / n).toFixed(2)),
      solidGap: report.minSolidGapFt,
      tris: report.voidMesh.triangles,
    },
    null,
    2,
  ),
);
