import { readFileSync } from "node:fs";
import { selectedClusterAssembly } from "../lib/skill5/cluster-assemblies";
import { generatePlacementNetworkVoid, NETWORK_LINE_OFFSET_FT } from "../lib/skill5/placement-network-void";
import { alignRingToVeinPaths } from "../components/site/site-network-vein-draw";
import { detectPockets } from "../lib/skill5/pockets";
import site from "../data/skill5/herald-site.json";
import { polygonAreaSqFt, type ZonePoint } from "../lib/skill5/zoning";

const herald = site as { site: { ring: { x: number; z: number }[] }; water: { ring: { x: number; z: number }[] } };
const assembly = selectedClusterAssembly();
if (!assembly) throw new Error("no assembly");
const raw = JSON.parse(readFileSync("data/skill5/herald-arrival-v1.json", "utf8")) as {
  iterations?: { id?: string; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity?: number }[] }[];
};
const iteration = raw.iterations?.find((item) => item.id === assembly.selectedNetworkId);
const branches = (iteration?.branches ?? []).map((b) => ({
  x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1,
  conductivity: typeof b.conductivity === "number" ? b.conductivity : 1,
}));

const report = generatePlacementNetworkVoid({ assembly, branches });
const shells = outerShells(branches);

let outside = 0;
let minInside = Number.POSITIVE_INFINITY;
let maxOutside = 0;
const p = report.voidMesh.positions;
for (let i = 0; i < p.length; i += 3) {
  const x = p[i]!;
  const z = p[i + 2]!;
  let inAny = false;
  let best = Number.POSITIVE_INFINITY;
  for (const shell of shells) {
    const d = distToRing(x, z, shell);
    if (d < best) best = d;
    if (pointIn(x, z, shell)) inAny = true;
  }
  if (!inAny) {
    outside += 1;
    if (best > maxOutside) maxOutside = best;
  } else if (best < minInside) minInside = best;
}

console.log(JSON.stringify({
  offsetFt: NETWORK_LINE_OFFSET_FT,
  reportOffset: report.offsetFt,
  voidVerts: p.length / 3,
  vertsOutsideOuterShell: outside,
  maxDistOutsideFt: Number(maxOutside.toFixed(3)),
  minDistInsideToShellFt: Number.isFinite(minInside) ? Number(minInside.toFixed(3)) : null,
  solidGap: report.minSolidGapFt,
  voidFt3: report.voidCubicFeet,
  shellCount: shells.length,
}, null, 2));

function outerShells(veinEdges: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[]) {
  const reportPockets = detectPockets(veinEdges, herald.site.ring, herald.water.ring);
  const networkPockets = reportPockets.pockets.filter((pocket) => !pocket.touchesParcel);
  return dissolve(networkPockets.map((pocket) => pocket.points), veinEdges);
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
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}
