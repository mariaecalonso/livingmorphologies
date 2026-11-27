import { readFileSync } from "node:fs";
import {
  generatePlacementNetworkVoid,
  NETWORK_LINE_OFFSET_FT,
  PLACEMENT_VOID_MORPHOLOGY_REACH_FT,
} from "../lib/skill5/placement-network-void";
import { selectedClusterAssembly } from "../lib/skill5/cluster-assemblies";
import { detectPockets } from "../lib/skill5/pockets";
import site from "../data/skill5/herald-site.json";
import { polygonAreaSqFt, type ZonePoint } from "../lib/skill5/zoning";

const herald = site as { site: { ring: { x: number; z: number }[] }; water: { ring: { x: number; z: number }[] } };

const assembly = selectedClusterAssembly();
if (!assembly) throw new Error("No selected cluster assembly.");

const raw = JSON.parse(readFileSync("data/skill5/herald-arrival-v1.json", "utf8")) as {
  iterations?: { id?: string; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity?: number }[] }[];
};
const iteration = raw.iterations?.find((item) => item.id === assembly.selectedNetworkId);
const branches = (iteration?.branches ?? []).map((branch) => ({
  x0: branch.x0,
  z0: branch.z0,
  x1: branch.x1,
  z1: branch.z1,
  conductivity: typeof branch.conductivity === "number" ? branch.conductivity : 1,
}));

const report = generatePlacementNetworkVoid({ assembly, branches });
const shell = outerShell(branches);
const positions = report.voidMesh.positions;

/** Sample void verts near the plan perimeter (low density interior skipped). */
let minToShell = Number.POSITIVE_INFINITY;
let nearShell = 0;
let farFromShell = 0;
const thresholdClose = NETWORK_LINE_OFFSET_FT * 0.5; // would mean nearly flush despite offset
const thresholdFollow = NETWORK_LINE_OFFSET_FT + 2; // expected band if clipped by inset
const thresholdMorph = PLACEMENT_VOID_MORPHOLOGY_REACH_FT; // solid-field morphology

for (let i = 0; i < positions.length; i += 9) {
  const x = positions[i]!;
  const z = positions[i + 2]!;
  const d = distPointToRingEdges(x, z, shell);
  if (!(d < Number.POSITIVE_INFINITY)) continue;
  if (d < minToShell) minToShell = d;
  if (d <= thresholdFollow) nearShell += 1;
  else farFromShell += 1;
}

console.log(
  JSON.stringify(
    {
      networkOffsetFt: report.offsetFt,
      configuredOffsetFt: NETWORK_LINE_OFFSET_FT,
      morphologyReachFt: PLACEMENT_VOID_MORPHOLOGY_REACH_FT,
      minVoidVertToNetworkShellFt: Number.isFinite(minToShell) ? Number(minToShell.toFixed(3)) : null,
      /** True if void stays at least ~offset from the outer shell ink. */
      notFlushToInk: minToShell + 1e-6 >= NETWORK_LINE_OFFSET_FT * 0.85,
      /** True if some outer skin sits near the stop (path-following), not only deep inside. */
      reachesNearPath: nearShell > 0,
      nearShellSamples: nearShell,
      farFromShellSamples: farFromShell,
      voidCubicFeet: report.voidCubicFeet,
      voidComponents: report.voidComponents,
      solidGapFt: report.minSolidGapFt,
      ok:
        report.offsetFt === NETWORK_LINE_OFFSET_FT &&
        Number.isFinite(minToShell) &&
        minToShell + 1e-6 >= NETWORK_LINE_OFFSET_FT * 0.85 &&
        nearShell > 0,
      note:
        minToShell >= thresholdMorph
          ? "Outer skin is set by solid morphology (farther than network stop) — independent of shell outline."
          : "Some outer skin sits near the network stop — path followed with inset clearance.",
    },
    null,
    2,
  ),
);

function outerShell(veinEdges: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[]): ZonePoint[] {
  const reportPockets = detectPockets(veinEdges, herald.site.ring, herald.water.ring);
  const networkPockets = reportPockets.pockets.filter((pocket) => !pocket.touchesParcel);
  const shells = dissolveOuterShells(networkPockets.map((pocket) => pocket.points));
  if (!shells.length) throw new Error("No outer shell");
  return shells[0]!;
}

function dissolveOuterShells(pockets: readonly (readonly ZonePoint[])[]): ZonePoint[][] {
  const edgeCount = new Map<string, { ax: number; az: number; bx: number; bz: number; count: number }>();
  const edgeKey = (ax: number, az: number, bx: number, bz: number) => {
    const a = `${Math.round(ax * 20) / 20}:${Math.round(az * 20) / 20}`;
    const b = `${Math.round(bx * 20) / 20}:${Math.round(bz * 20) / 20}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  for (const ring of pockets) {
    if (ring.length < 3) continue;
    for (let index = 0; index < ring.length; index += 1) {
      const from = ring[index]!;
      const to = ring[(index + 1) % ring.length]!;
      const key = edgeKey(from.x, from.z, to.x, to.z);
      const current = edgeCount.get(key);
      if (current) current.count += 1;
      else edgeCount.set(key, { ax: from.x, az: from.z, bx: to.x, bz: to.z, count: 1 });
    }
  }
  const boundary = [...edgeCount.values()].filter((edge) => edge.count === 1);
  const nodeKey = (x: number, z: number) => `${Math.round(x * 20) / 20}:${Math.round(z * 20) / 20}`;
  const adjacency = new Map<string, { x: number; z: number; links: { key: string; x: number; z: number }[] }>();
  const ensure = (x: number, z: number) => {
    const key = nodeKey(x, z);
    if (!adjacency.has(key)) adjacency.set(key, { x, z, links: [] });
    return key;
  };
  for (const edge of boundary) {
    const a = ensure(edge.ax, edge.az);
    const b = ensure(edge.bx, edge.bz);
    if (a === b) continue;
    adjacency.get(a)!.links.push({ key: b, x: edge.bx, z: edge.bz });
    adjacency.get(b)!.links.push({ key: a, x: edge.ax, z: edge.az });
  }
  const used = new Set<string>();
  const shells: ZonePoint[][] = [];
  const directed = (from: string, to: string) => `${from}>${to}`;
  for (const [startKey, startNode] of adjacency) {
    for (const first of startNode.links) {
      const open = directed(startKey, first.key);
      if (used.has(open)) continue;
      const ring: ZonePoint[] = [];
      let current = startKey;
      let next = first.key;
      let guard = 0;
      let closed = false;
      while (guard < boundary.length + 4) {
        guard += 1;
        const mark = directed(current, next);
        if (used.has(mark)) break;
        used.add(mark);
        const node = adjacency.get(current);
        if (!node) break;
        ring.push({ x: node.x, z: node.z });
        const arrival = adjacency.get(next);
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
        const previous = current;
        current = next;
        if (best < 0) {
          const back = arrival.links.find((link) => link.key === previous);
          if (!back || arrival.links.length !== 1) break;
          next = back.key;
        } else {
          next = arrival.links[best]!.key;
        }
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
  return shells.slice(0, 1);
}

function distPointToRingEdges(x: number, z: number, ring: readonly ZonePoint[]) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const d = distPointToSegment(x, z, a.x, a.z, b.x, b.z);
    if (d < best) best = d;
  }
  return best;
}

function distPointToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}
