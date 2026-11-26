/** Pull every field point onto a visible branch (≤4ft) and republish. */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const LIMIT = 4;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };
type Node = { id: string; x: number; z: number };

function distToEdge(x: number, z: number, edge: Branch) {
  const dx = edge.x1 - edge.x0;
  const dz = edge.z1 - edge.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
  const px = edge.x0 + dx * t;
  const pz = edge.z0 + dz * t;
  return { dist: Math.hypot(x - px, z - pz), x: px, z: pz };
}

async function main() {
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    massingNetworkId?: string;
    zoningShortlist?: string[];
    iterations: Array<Record<string, unknown> & {
      id: string;
      index: number;
      seed?: number;
      nodes: Node[];
      branches?: Branch[];
      note?: string | null;
    }>;
  };
  const source = raw.iterations.find((item) => item.id === raw.massingNetworkId) ?? raw.iterations.at(-1);
  if (!source) throw new Error("missing");
  const branches = (source.branches ?? []).map((edge) => ({ ...edge, conductivity: 1 }));
  const added: string[] = [];
  for (const node of source.nodes) {
    let best: { dist: number; x: number; z: number } | null = null;
    for (const edge of branches) {
      const hit = distToEdge(node.x, node.z, edge);
      if (!best || hit.dist < best.dist) best = hit;
    }
    if (!best || best.dist <= LIMIT) continue;
    branches.push({ x0: node.x, z0: node.z, x1: best.x, z1: best.z, conductivity: 1 });
    added.push(`${node.id}@${best.dist.toFixed(1)}ft`);
  }
  const stamp = Date.now().toString(36);
  const clone = {
    ...source,
    id: `batch-${stamp}-tight-${source.seed ?? "x"}`,
    index: Math.max(...raw.iterations.map((item) => item.index), 0) + 1,
    branches,
    note: `Uniform veins. Every field point within ${LIMIT}ft of a branch. ${added.length ? `Linked ${added.join(", ")}.` : "Already tight."}`,
  };
  const shortlist = [clone.id, ...(raw.zoningShortlist ?? []).filter((id) => id !== clone.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: clone.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [clone.id, clone.id, clone.id],
    iterations: [...raw.iterations, clone],
  }, null, 2)}\n`, "utf8");
  console.log(`published ${clone.id} added=${added.join(", ") || "none"} branches=${branches.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
