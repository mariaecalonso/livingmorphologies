/**
 * Compare CURRENT adaptive-flow settle vs REFINED Physarum settle.
 * Same zoning terminals, seed, and parcel. Does not write production archive.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { NETWORK_STEP_BUDGET, SiteNetworkStudy, type NetworkNode } from "../components/site/site-network";
import {
  measurePhysarumMetrics,
  refinePhysarumSettle,
  survivingFlowEdges,
  type PhysarumNetworkMetrics,
} from "../components/site/site-network-flow";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const BOARD = path.join(process.env.TEMP || process.env.TMP || ".", "physarum-refine-compare");
const BASELINE_ID = "batch-mwwtvzry-uniform-22010011";
const SEED = 22010011;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number; length?: number };

function cloneNodes(nodes: readonly NetworkNode[]): NetworkNode[] {
  return nodes.map((node) => ({
    ...node,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
    water: node.water ? { ...node.water } : undefined,
    strategy: node.strategy ? { ...node.strategy } : undefined,
  }));
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

function panelSvg(
  title: string,
  tag: string,
  recommended: boolean,
  metrics: PhysarumNetworkMetrics,
  nodes: readonly NetworkNode[],
  branches: readonly Branch[],
  parcel: readonly XZ[],
  water: readonly XZ[],
) {
  const box = bounds(parcel, nodes, branches);
  const width = 900;
  const height = 420;
  const scale = Math.min(width / Math.max(1, box.maxZ - box.minZ), height / Math.max(1, box.maxX - box.minX)) * 0.9;
  const ox = (width - (box.maxZ - box.minZ) * scale) / 2;
  const oy = (height - (box.maxX - box.minX) * scale) / 2;
  const map = (x: number, z: number) => ({
    x: ox + (z - box.minZ) * scale,
    y: oy + (x - box.minX) * scale,
  });
  const poly = (ring: readonly XZ[]) => ring.map(([x, z]) => {
    const point = map(x, z);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ");
  const lines = branches.map((edge) => {
    const a = map(edge.x0, edge.z0);
    const b = map(edge.x1, edge.z1);
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,0.92)" stroke-width="2.2" stroke-linecap="round"/>`;
  }).join("\n");
  const marks = nodes.map((node) => {
    const point = map(node.x, node.z);
    const fill = node.kind === "source" ? "#c77e5f" : node.surface === "water" ? "#e2c27a" : "#49d7de";
    return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5.5" fill="${fill}"/>`;
  }).join("\n");
  const detour = metrics.avgDetourRatio == null ? "—" : metrics.avgDetourRatio.toFixed(2);
  const status = metrics.ok ? "ONE COMPONENT" : "FAIL · SPLIT / UNREACHED";
  const statusColor = metrics.ok ? "#49d7de" : "#c77e5f";
  return `
  <div class="panel${recommended ? " recommended" : ""}">
    <div class="tag">${tag}${recommended ? " · recommended" : ""}</div>
    <div class="title">${title}</div>
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <polygon points="${poly(water)}" fill="rgba(226,194,122,0.06)" stroke="rgba(226,194,122,0.25)" stroke-width="1"/>
      <polygon points="${poly(parcel)}" fill="none" stroke="rgba(73,215,222,0.45)" stroke-width="1.2"/>
      ${lines}
      ${marks}
    </svg>
    <div class="stats">
      <span>terminals ${metrics.terminalsConnected}/${metrics.terminalsTotal}</span>
      <span>components ${metrics.components}</span>
      <span>length ${Math.round(metrics.totalNetworkLength)} ft</span>
      <span>avg detour ${detour}</span>
      <span style="color:${statusColor}">${status}</span>
    </div>
  </div>`;
}

function formatRow(version: string, metrics: PhysarumNetworkMetrics) {
  const detour = metrics.avgDetourRatio == null ? "—" : metrics.avgDetourRatio.toFixed(3);
  return `${version.padEnd(10)} | ${`${metrics.terminalsConnected}/${metrics.terminalsTotal}`.padStart(9)} | ${String(metrics.components).padStart(10)} | ${`${Math.round(metrics.totalNetworkLength)} ft`.padStart(20)} | ${detour.padStart(10)}`;
}

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<{ id: string; seed: number; nodes: NetworkNode[] }>;
  };
  const baseline = raw.iterations.find((item) => item.id === BASELINE_ID)
    ?? raw.iterations.find((item) => item.seed === SEED);
  if (!baseline) throw new Error(`Baseline ${BASELINE_ID} not found.`);
  const nodes = cloneNodes(baseline.nodes);
  console.log(`baseline=${baseline.id} seed=${SEED} nodes=${nodes.length}`);

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  if (!study.canRun) throw new Error(study.status.note ?? "Study cannot run.");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) {
    study.step(8, false);
  }
  study.finish();
  const flow = (study as unknown as { flow: Parameters<typeof refinePhysarumSettle>[0] | null }).flow;
  if (!flow) throw new Error("Flow state missing after settle.");

  const currentMetrics = measurePhysarumMetrics(flow);
  const currentBranches = survivingFlowEdges(flow).map((edge) => ({ ...edge }));
  const currentSteps = flow.step;

  const refinedMetrics = refinePhysarumSettle(flow, 96);
  const refinedBranches = survivingFlowEdges(flow).map((edge) => ({ ...edge }));
  const refinedSteps = flow.step;

  console.log("version    | terminals | components | total network length | avg detour");
  console.log(formatRow("CURRENT", currentMetrics));
  console.log(formatRow("REFINED", refinedMetrics));
  console.log(`CURRENT ok=${currentMetrics.ok} branches=${currentBranches.length} steps=${currentSteps}`);
  console.log(`REFINED ok=${refinedMetrics.ok} branches=${refinedBranches.length} steps=${refinedSteps}`);

  const table = `
  <table>
    <thead>
      <tr><th>version</th><th>terminals connected</th><th>components</th><th>total network length</th><th>avg detour</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>CURRENT</td>
        <td>${currentMetrics.terminalsConnected}/${currentMetrics.terminalsTotal}</td>
        <td>${currentMetrics.components}</td>
        <td>${Math.round(currentMetrics.totalNetworkLength)} ft</td>
        <td>${currentMetrics.avgDetourRatio?.toFixed(3) ?? "—"}</td>
      </tr>
      <tr class="rec">
        <td>REFINED</td>
        <td>${refinedMetrics.terminalsConnected}/${refinedMetrics.terminalsTotal}</td>
        <td>${refinedMetrics.components}</td>
        <td>${Math.round(refinedMetrics.totalNetworkLength)} ft</td>
        <td>${refinedMetrics.avgDetourRatio?.toFixed(3) ?? "—"}</td>
      </tr>
    </tbody>
  </table>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Physarum refine compare</title>
<style>
  html,body{margin:0;background:#000;color:#c8c8c8;font:12px/1.45 ui-monospace,Consolas,monospace}
  .sheet{width:1920px;margin:24px auto;padding:20px 24px 28px;border:1px solid #2a2a2a;box-sizing:border-box}
  h1{margin:0 0 8px;font:11px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#49d7de}
  .sub{color:#777;margin-bottom:16px}
  table{border-collapse:collapse;margin:0 0 22px;width:100%;max-width:1100px}
  th,td{border:1px solid #2a2a2a;padding:8px 12px;text-align:left}
  th{color:#49d7de;letter-spacing:.08em;text-transform:uppercase;font-weight:500}
  tr.rec td{color:#49d7de}
  .row{display:flex;gap:24px}
  .panel{flex:1;border:1px solid #2a2a2a;padding:12px 12px 10px;background:#050505}
  .panel.recommended{border-color:#49d7de}
  .tag{color:#c77e5f;letter-spacing:.12em;text-transform:uppercase;font-size:10px;margin-bottom:4px}
  .title{color:#ddd;margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase;font-size:11px}
  .stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;color:#888}
</style></head>
<body>
  <div class="sheet">
    <h1>Site Network settle · Current vs Refined Physarum</h1>
    <div class="sub">Same arrangement · seed ${SEED} · baseline ${baseline.id} · zoning/terminals unchanged · production archive not written</div>
    ${table}
    <div class="row">
      ${panelSvg("Current adaptive-flow settle", "Option A · Current", false, currentMetrics, nodes, currentBranches, site.site.ring, site.water.ring)}
      ${panelSvg("Refined Physarum settle", "Option B · Refined", true, refinedMetrics, nodes, refinedBranches, site.site.ring, site.water.ring)}
    </div>
  </div>
</body></html>`;

  await mkdir(BOARD, { recursive: true });
  const boardPath = path.join(BOARD, "index.html");
  await writeFile(boardPath, html, "utf8");
  await writeFile(path.join(BOARD, "metrics.json"), `${JSON.stringify({
    seed: SEED,
    baselineId: baseline.id,
    current: { ...currentMetrics, branches: currentBranches.length, steps: currentSteps },
    refined: { ...refinedMetrics, branches: refinedBranches.length, steps: refinedSteps },
  }, null, 2)}\n`, "utf8");
  console.log(`board=${boardPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
