import { readFile } from "fs/promises";

async function main() {
  const raw = JSON.parse(await readFile("data/skill5/herald-arrival-v1.json", "utf8")) as {
    massingNetworkId?: string;
    zoningShortlist?: string[];
    iterations: Array<{
      id: string;
      index: number;
      seed: number;
      reached: number;
      total: number;
      reachedIds?: string[];
      nodes: Array<{ id: string; kind: string; x: number; z: number; surface?: string }>;
      branches?: Array<{ x0: number; z0: number; x1: number; z1: number; conductivity: number }>;
    }>;
  };

  const it = raw.iterations.find((item) => item.id.includes("reach-")) ?? raw.iterations.at(-1);
  if (!it) throw new Error("missing");
  const branches = it.branches ?? [];
  const reached = new Set(it.reachedIds ?? []);

  function dist(x: number, z: number, edge: (typeof branches)[number]) {
    const dx = edge.x1 - edge.x0;
    const dz = edge.z1 - edge.z0;
    const length = dx * dx + dz * dz;
    const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
    return Math.hypot(x - (edge.x0 + dx * t), z - (edge.z0 + dz * t));
  }

  function near(x: number, z: number) {
    let best = Infinity;
    for (const edge of branches) best = Math.min(best, dist(x, z, edge));
    return best;
  }

  console.log(`active=${raw.massingNetworkId}`);
  console.log(`shortlist=${JSON.stringify(raw.zoningShortlist)}`);
  console.log(`check=${it.id} index=${it.index} seed=${it.seed} reached=${it.reached}/${it.total} branches=${branches.length}`);
  for (const node of it.nodes) {
    const feet = near(node.x, node.z);
    const flag = feet > 18 ? "ORPHAN" : "ok";
    console.log(`${flag.padEnd(6)} ${node.kind.padEnd(9)} ${node.id.padEnd(24)} dist=${feet.toFixed(1)}ft attractorReached=${reached.has(node.id)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
