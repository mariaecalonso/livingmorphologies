/**
 * Find surviving branches that sit far from every terminal — empty-zone veins.
 */
import { readFile } from "fs/promises";

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };
type Node = { id: string; kind: string; x: number; z: number; surface?: string };

function mid(edge: Branch) {
  return { x: (edge.x0 + edge.x1) / 2, z: (edge.z0 + edge.z1) / 2 };
}

function distPoint(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

async function main() {
  const raw = JSON.parse(await readFile("data/skill5/herald-arrival-v1.json", "utf8")) as {
    massingNetworkId: string;
    iterations: Array<{ id: string; nodes: Node[]; branches?: Branch[] }>;
  };
  const it = raw.iterations.find((item) => item.id === raw.massingNetworkId);
  if (!it) throw new Error("missing");
  const branches = it.branches ?? [];
  const nodes = it.nodes;

  const thresholds = [40, 60, 80, 100];
  console.log(`active=${it.id} branches=${branches.length} terminals=${nodes.length}`);
  for (const feet of thresholds) {
    let far = 0;
    let length = 0;
    for (const edge of branches) {
      const m = mid(edge);
      const nearest = Math.min(...nodes.map((node) => distPoint(m, node)));
      if (nearest > feet) {
        far += 1;
        length += Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0);
      }
    }
    console.log(`> ${feet}ft from any terminal: ${far} edges · ${Math.round(length)} ft`);
  }

  // Cluster far edges by roughly where they sit
  const far80: { x: number; z: number; nearest: number; nearestId: string }[] = [];
  for (const edge of branches) {
    const m = mid(edge);
    let nearest = Infinity;
    let nearestId = "";
    for (const node of nodes) {
      const d = distPoint(m, node);
      if (d < nearest) {
        nearest = d;
        nearestId = node.id;
      }
    }
    if (nearest > 80) far80.push({ ...m, nearest, nearestId });
  }
  far80.sort((a, b) => b.nearest - a.nearest);
  console.log("\nFarthest empty-zone edge midpoints:");
  for (const item of far80.slice(0, 12)) {
    console.log(`  ${item.nearest.toFixed(0)}ft from ${item.nearestId} @ ${item.x.toFixed(0)},${item.z.toFixed(0)}`);
  }
}

main();
