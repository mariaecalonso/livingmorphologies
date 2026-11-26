/** Stitch orphan field points onto the active reach-all iteration and refresh the board. */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import type { NetworkNode } from "../components/site/site-network";
import { STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const BOARD = path.join(process.env.TEMP || process.env.TMP || ".", "strategy-grow-board");
const ON_NETWORK_FT = 18;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

function pointOnBranch(x: number, z: number, branch: Branch) {
  const dx = branch.x1 - branch.x0;
  const dz = branch.z1 - branch.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - branch.x0) * dx + (z - branch.z0) * dz) / length));
  return Math.hypot(x - (branch.x0 + dx * t), z - (branch.z0 + dz * t));
}

function onNetwork(x: number, z: number, branches: readonly Branch[]) {
  return branches.some((branch) => pointOnBranch(x, z, branch) <= ON_NETWORK_FT);
}

function stitch(nodes: readonly NetworkNode[], branches: Branch[]) {
  const next = branches.map((edge) => ({ ...edge }));
  const added: string[] = [];
  for (const node of nodes) {
    if (onNetwork(node.x, node.z, next)) continue;
    let best: { x: number; z: number; dist: number } | null = null;
    for (const edge of next) {
      for (const point of [
        { x: edge.x0, z: edge.z0 },
        { x: edge.x1, z: edge.z1 },
      ]) {
        const dist = Math.hypot(node.x - point.x, node.z - point.z);
        if (!best || dist < best.dist) best = { ...point, dist };
      }
    }
    if (!best) continue;
    next.push({ x0: node.x, z0: node.z, x1: best.x, z1: best.z, conductivity: 1.15 });
    added.push(`${node.id}@${best.dist.toFixed(0)}ft`);
  }
  return { branches: next, added };
}

function bounds(parcel: readonly XZ[], nodes: readonly NetworkNode[], branches: readonly Branch[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const push = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const [x, z] of parcel) push(x, z);
  for (const node of nodes) push(node.x, node.z);
  for (const edge of branches) {
    push(edge.x0, edge.z0);
    push(edge.x1, edge.z1);
  }
  const pad = 28;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    strategyId?: string;
    massingNetworkId?: string | null;
    zoningShortlist?: string[];
    iterations: Array<Record<string, unknown> & {
      id: string;
      index: number;
      seed: number;
      reached: number;
      total: number;
      nodes: NetworkNode[];
      branches?: Branch[];
      note?: string | null;
    }>;
  };
  const target = raw.iterations.find((item) => item.id === raw.massingNetworkId)
    ?? raw.iterations.find((item) => item.id.includes("reach-"))
    ?? raw.iterations.at(-1);
  if (!target) throw new Error("No iteration.");
  const result = stitch(target.nodes, target.branches ?? []);
  target.branches = result.branches;
  target.note = `Every field point on network. Stitched ${result.added.join(", ") || "none"}.`;
  const shortlist = [target.id, ...(raw.zoningShortlist ?? []).filter((id) => id !== target.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: target.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [target.id, target.id, target.id],
    iterations: raw.iterations,
  }, null, 2)}\n`, "utf8");

  const box = bounds(site.site.ring, target.nodes, result.branches);
  const width = 1920;
  const height = 560;
  const scale = Math.min(width / Math.max(1, box.maxZ - box.minZ), height / Math.max(1, box.maxX - box.minX)) * 0.92;
  const ox = (width - (box.maxZ - box.minZ) * scale) / 2;
  const oy = (height - (box.maxX - box.minX) * scale) / 2;
  const map = (x: number, z: number) => ({ x: ox + (z - box.minZ) * scale, y: oy + (x - box.minX) * scale });
  const poly = (ring: readonly XZ[]) => ring.map(([x, z]) => {
    const point = map(x, z);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ");
  const lines = result.branches.map((edge) => {
    const a = map(edge.x0, edge.z0);
    const b = map(edge.x1, edge.z1);
    const tone = Math.min(1, Math.max(0.45, edge.conductivity ?? 0.6));
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,${(0.75 + tone * 0.25).toFixed(2)})" stroke-width="${(2.4 + tone * 3.2).toFixed(2)}" stroke-linecap="round"/>`;
  }).join("\n");
  const marks = target.nodes.map((node) => {
    const point = map(node.x, node.z);
    const fill = node.kind === "source" ? "#c77e5f" : node.surface === "water" ? "#e2c27a" : "#49d7de";
    return `<g><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="10" fill="${fill}"/><text x="${(point.x + 12).toFixed(1)}" y="${(point.y - 10).toFixed(1)}" fill="#b0b0b0" font-size="11">${node.id}</text></g>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Reach-all Strategy Growth</title>
<style>
  html,body{margin:0;background:#000;color:#c8c8c8;font:12px/1.4 ui-monospace,Consolas,monospace}
  .board{width:1920px;height:560px;margin:24px auto;border:1px solid #2a2a2a;position:relative;background:#000}
  .label{position:absolute;left:20px;top:14px;letter-spacing:.12em;text-transform:uppercase;font-size:11px;color:#49d7de}
  .meta{position:absolute;left:20px;bottom:14px;color:#888;max-width:1700px}
  .tag{color:#c77e5f}
  .ok{color:#49d7de}
</style></head>
<body>
  <div class="board">
    <div class="label">Every field point on the network · <span class="tag">stitched orphans</span></div>
    <svg width="1920" height="560" viewBox="0 0 1920 560">
      <polygon points="${poly(site.water.ring)}" fill="rgba(226,194,122,0.06)" stroke="rgba(226,194,122,0.25)" stroke-width="1"/>
      <polygon points="${poly(site.site.ring)}" fill="none" stroke="rgba(73,215,222,0.55)" stroke-width="1.4"/>
      ${lines}
      ${marks}
    </svg>
    <div class="meta">DONE ${target.id} · <span class="ok">${target.reached}/${target.total}</span> attractors · branches ${result.branches.length} · stitch ${result.added.join(", ") || "none"}</div>
  </div>
</body></html>`;
  await mkdir(BOARD, { recursive: true });
  await writeFile(path.join(BOARD, "index.html"), html, "utf8");
  console.log(`stitched ${result.added.join(", ") || "none"} branches=${result.branches.length} id=${target.id}`);
  console.log(`board=${path.join(BOARD, "index.html")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
