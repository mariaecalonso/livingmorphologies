/** Snap every field point onto the live network with an explicit stub edge. */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };
type Node = { id: string; x: number; z: number };

function nearest(x: number, z: number, branches: readonly Branch[]) {
  let best: { dist: number; x: number; z: number } | null = null;
  for (const edge of branches) {
    const dx = edge.x1 - edge.x0;
    const dz = edge.z1 - edge.z0;
    const length = dx * dx + dz * dz;
    const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
    const px = edge.x0 + dx * t;
    const pz = edge.z0 + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) best = { dist, x: px, z: pz };
  }
  return best;
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
  const base = (source.branches ?? []).map((edge) => ({ ...edge, conductivity: 1 }));
  const branches = [...base];
  const snaps: string[] = [];
  for (const node of source.nodes) {
    const hit = nearest(node.x, node.z, base);
    if (!hit) continue;
    if (hit.dist < 0.5) continue;
    branches.push({ x0: node.x, z0: node.z, x1: hit.x, z1: hit.z, conductivity: 1 });
    snaps.push(`${node.id}@${hit.dist.toFixed(1)}ft`);
  }
  const stamp = Date.now().toString(36);
  const clone = {
    ...source,
    id: `batch-${stamp}-snap-${source.seed ?? "x"}`,
    index: Math.max(...raw.iterations.map((item) => item.index), 0) + 1,
    branches,
    note: `Uniform veins. Explicit stub to every field point. Snapped ${snaps.join(", ") || "none"}.`,
  };
  const shortlist = [clone.id, ...(raw.zoningShortlist ?? []).filter((id) => id !== clone.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: clone.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [clone.id, clone.id, clone.id],
    iterations: [...raw.iterations, clone],
  }, null, 2)}\n`, "utf8");
  console.log(`published ${clone.id} snaps=${snaps.length} branches=${branches.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
