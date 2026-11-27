import { readFileSync } from "node:fs";
import site from "../data/skill5/herald-site.json";
import { selectedClusterAssembly } from "../lib/skill5/cluster-assemblies";
import { generatePlacementNetworkVoid } from "../lib/skill5/placement-network-void";
import { alignRingToVeinPaths, buildVeinChains } from "../components/site/site-network-vein-draw";
import { detectPockets } from "../lib/skill5/pockets";
import { polygonAreaSqFt, type ZonePoint } from "../lib/skill5/zoning";

const herald = site as {
  site: { ring: number[][] };
  water: { ring: number[][] };
};
const parcel = herald.site.ring.map((p) => ({ x: p[0]!, z: p[1]! }));
const water = herald.water.ring.map((p) => ({ x: p[0]!, z: p[1]! }));
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
const shells = outerShells(branches);
const fluid = buildVeinChains(branches, 1, 3);
const fluidSegs: { x0: number; z0: number; x1: number; z1: number }[] = [];
for (const chain of fluid) {
  for (let i = 0; i < chain.points.length - 1; i += 1) {
    const a = chain.points[i]!;
    const b = chain.points[i + 1]!;
    fluidSegs.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z });
  }
}

const p = report.voidMesh.positions;
let outsideShell = 0;
let maxOutsideShell = 0;
let outsideParcel = 0;
let maxOutsideParcel = 0;
let farFromFluid = 0;
let maxFluid = 0;

for (let i = 0; i < p.length; i += 3) {
  const x = p[i]!;
  const z = p[i + 2]!;

  let inShell = false;
  let dShell = Number.POSITIVE_INFINITY;
  for (const shell of shells) {
    dShell = Math.min(dShell, distToRing(x, z, shell));
    if (pointIn(x, z, shell)) inShell = true;
  }
  if (!inShell) {
    outsideShell += 1;
    if (dShell > maxOutsideShell) maxOutsideShell = dShell;
  }

  const dParcel = distToRing(x, z, parcel);
  if (!pointIn(x, z, parcel)) {
    outsideParcel += 1;
    if (dParcel > maxOutsideParcel) maxOutsideParcel = dParcel;
  }

  let dFluid = Number.POSITIVE_INFINITY;
  for (const s of fluidSegs) {
    dFluid = Math.min(dFluid, distSeg(x, z, s));
  }
  if (dFluid > maxFluid) maxFluid = dFluid;
  /** Far from any drawn fluid vein — likely past the outer ink if also near shell. */
  if (dFluid > 8 && !inShell) farFromFluid += 1;
}

console.log(
  JSON.stringify(
    {
      outsideShell,
      maxOutsideShellFt: Number(maxOutsideShell.toFixed(3)),
      outsideParcel,
      maxOutsideParcelFt: Number(maxOutsideParcel.toFixed(3)),
      maxDistToFluidVeinFt: Number(maxFluid.toFixed(2)),
      shellCount: shells.length,
      solidGap: report.minSolidGapFt,
      tris: report.voidMesh.triangles,
    },
    null,
    2,
  ),
);

function outerShells(veinEdges: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[]) {
  const reportPockets = detectPockets(
    veinEdges,
    herald.site.ring as unknown as { x: number; z: number }[],
    herald.water.ring as unknown as { x: number; z: number }[],
  );
  /** detectPockets expects XZ — check pockets API */
  const networkPockets = reportPockets.pockets.filter((pocket) => !pocket.touchesParcel);
  return dissolve(
    networkPockets.map((pocket) => pocket.points),
    veinEdges,
  );
}

function dissolve(
  pockets: readonly (readonly ZonePoint[])[],
  veinEdges: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[],
): ZonePoint[][] {
  const edgeCount = new Map<string, { ax: number; az: number; bx: number; bz: number; count: number }>();
  const edgeKey = (ax: number, az: number, bx: number, bz: number) => {
    const a = `${Math.round(ax * 20) / 20}:${Math.round(az * 20) / 20}`;
    const b = `${Math.round(bx * 20) / 20}:${Math.round(bz * 20) / 20}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  for (const ring of pockets) {
    for (let i = 0; i < ring.length; i += 1) {
      const from = ring[i]!;
      const to = ring[(i + 1) % ring.length]!;
      const key = edgeKey(from.x, from.z, to.x, to.z);
      const cur = edgeCount.get(key);
      if (cur) cur.count += 1;
      else edgeCount.set(key, { ax: from.x, az: from.z, bx: to.x, bz: to.z, count: 1 });
    }
  }
  const boundary = [...edgeCount.values()].filter((e) => e.count === 1);
  const nodeKey = (x: number, z: number) => `${Math.round(x * 20) / 20}:${Math.round(z * 20) / 20}`;
  const adj = new Map<string, { x: number; z: number; links: { key: string; x: number; z: number }[] }>();
  const ensure = (x: number, z: number) => {
    const k = nodeKey(x, z);
    if (!adj.has(k)) adj.set(k, { x, z, links: [] });
    return k;
  };
  for (const e of boundary) {
    const A = ensure(e.ax, e.az);
    const B = ensure(e.bx, e.bz);
    if (A === B) continue;
    adj.get(A)!.links.push({ key: B, x: e.bx, z: e.bz });
    adj.get(B)!.links.push({ key: A, x: e.ax, z: e.az });
  }
  const used = new Set<string>();
  const shells: ZonePoint[][] = [];
  const dir = (a: string, b: string) => `${a}>${b}`;
  for (const [startKey, startNode] of adj) {
    for (const first of startNode.links) {
      if (used.has(dir(startKey, first.key))) continue;
      const ring: ZonePoint[] = [];
      let current = startKey;
      let next = first.key;
      let closed = false;
      for (let g = 0; g < boundary.length + 4; g += 1) {
        const mark = dir(current, next);
        if (used.has(mark)) break;
        used.add(mark);
        const node = adj.get(current);
        if (!node) break;
        ring.push({ x: node.x, z: node.z });
        const arrival = adj.get(next);
        if (!arrival) break;
        const incoming = Math.atan2(node.z - arrival.z, node.x - arrival.x);
        let best = -1;
        let bestDelta = Infinity;
        arrival.links.forEach((link, index) => {
          if (link.key === current) return;
          const angle = Math.atan2(link.z - arrival.z, link.x - arrival.x);
          const delta = Math.atan2(Math.sin(angle - incoming), Math.cos(angle - incoming));
          if (delta < bestDelta) {
            bestDelta = delta;
            best = index;
          }
        });
        const prev = current;
        current = next;
        if (best < 0) {
          const back = arrival.links.find((l) => l.key === prev);
          if (!back || arrival.links.length !== 1) break;
          next = back.key;
        } else next = arrival.links[best]!.key;
        if (current === startKey && next === first.key) {
          closed = true;
          break;
        }
      }
      if (!closed || ring.length < 3) continue;
      if (Math.abs(polygonAreaSqFt(ring)) < 80) continue;
      const area = polygonAreaSqFt(ring);
      shells.push(area < 0 ? [...ring].reverse() : ring);
    }
  }
  shells.sort((a, b) => Math.abs(polygonAreaSqFt(b)) - Math.abs(polygonAreaSqFt(a)));
  return shells.slice(0, 3).map((shell) => {
    const aligned = alignRingToVeinPaths(shell, veinEdges, [], 3);
    return aligned.length >= 3 ? aligned : shell;
  });
}

function pointIn(x: number, z: number, ring: readonly ZonePoint[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const crosses = a.z > z !== b.z > z;
    if (crosses && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function distToRing(x: number, z: number, ring: readonly ZonePoint[]) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    best = Math.min(best, distSeg(x, z, { x0: a.x, z0: a.z, x1: b.x, z1: b.z }));
  }
  return best;
}

function distSeg(x: number, z: number, s: { x0: number; z0: number; x1: number; z1: number }) {
  const abx = s.x1 - s.x0;
  const abz = s.z1 - s.z0;
  const len2 = abx * abx + abz * abz || 1;
  let t = ((x - s.x0) * abx + (z - s.z0) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (s.x0 + abx * t), z - (s.z0 + abz * t));
}
