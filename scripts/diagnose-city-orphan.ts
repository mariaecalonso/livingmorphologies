import { readFile } from "fs/promises";
import context from "../data/skill5/herald-site.json";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };
type Node = {
  id: string;
  kind: string;
  x: number;
  z: number;
  surface?: string;
  architecture?: { role?: string };
  strategy?: { note?: string };
};

function distToEdge(x: number, z: number, edge: Branch) {
  const dx = edge.x1 - edge.x0;
  const dz = edge.z1 - edge.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
  return Math.hypot(x - (edge.x0 + dx * t), z - (edge.z0 + dz * t));
}

function near(x: number, z: number, branches: readonly Branch[]) {
  let best = Infinity;
  for (const edge of branches) best = Math.min(best, distToEdge(x, z, edge));
  return best;
}

function pointInRing(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile("data/skill5/herald-arrival-v1.json", "utf8")) as {
    massingNetworkId: string;
    iterations: Array<{ id: string; nodes: Node[]; branches?: Branch[]; reachedIds?: string[] }>;
  };
  const it = raw.iterations.find((item) => item.id === raw.massingNetworkId);
  if (!it) throw new Error("missing active");
  const branches = it.branches ?? [];
  const reached = new Set(it.reachedIds ?? []);

  // City side is west / higher X (north-up plan: city toward +X in this project? check centroid vs water)
  const [sx, sz] = site.site.ring.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0] as [number, number]);
  const siteC = { x: sx / site.site.ring.length, z: sz / site.site.ring.length };
  const [wx, wz] = site.water.ring.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0] as [number, number]);
  const waterC = { x: wx / site.water.ring.length, z: wz / site.water.ring.length };
  // City is opposite the bay: from site toward -water direction
  const bayDir = { x: waterC.x - siteC.x, z: waterC.z - siteC.z };

  console.log(`active=${it.id} branches=${branches.length}`);
  console.log(`siteC=${siteC.x.toFixed(1)},${siteC.z.toFixed(1)} waterC=${waterC.x.toFixed(1)},${waterC.z.toFixed(1)}`);

  const ranked = it.nodes.map((node) => {
    // City-side score: farther from bay (negative projection onto bayDir)
    const toBay = ((node.x - siteC.x) * bayDir.x + (node.z - siteC.z) * bayDir.z)
      / (Math.hypot(bayDir.x, bayDir.z) || 1);
    const feet = near(node.x, node.z, branches);
    const inParcel = pointInRing(node.x, node.z, site.site.ring);
    return { node, toBay, feet, inParcel };
  }).sort((a, b) => a.toBay - b.toBay); // most city-side first (away from bay)

  console.log("\nCity-side first (away from bay):");
  for (const item of ranked) {
    const n = item.node;
    console.log(
      `${item.feet > 12 ? "ORPHAN" : "ok    "} ${n.kind.padEnd(9)} ${n.id.padEnd(22)} `
      + `dist=${item.feet.toFixed(1)}ft toBay=${item.toBay.toFixed(1)} `
      + `inParcel=${item.inParcel} reached=${reached.has(n.id)} `
      + `role=${n.architecture?.role ?? "-"} note=${n.strategy?.note ?? "-"}`,
    );
  }
}

main();
