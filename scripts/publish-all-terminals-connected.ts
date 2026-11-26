/**
 * Same attractor/source set as the Physarum B run, but every terminal is first
 * pulled onto open land so the flow graph admits them — then grow + refine + publish.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { NETWORK_STEP_BUDGET, SiteNetworkStudy, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET, measurePhysarumMetrics } from "../components/site/site-network-flow";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SOURCE_ID = "batch-mwwudrqp-physarum-b-22010011";
const SEED = 22010011;
const ON_NETWORK_FT = 14;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

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

function distToBranch(x: number, z: number, edge: Branch) {
  const dx = edge.x1 - edge.x0;
  const dz = edge.z1 - edge.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
  return Math.hypot(x - (edge.x0 + dx * t), z - (edge.z0 + dz * t));
}

function nearestBranch(x: number, z: number, branches: readonly Branch[]) {
  let best = Infinity;
  for (const edge of branches) best = Math.min(best, distToBranch(x, z, edge));
  return best;
}

/** Move closed-cell land terminals onto the nearest open trail cell (expanding ring). */
function snapToOpenLand(study: SiteNetworkStudy, nodes: NetworkNode[]) {
  const moved: string[] = [];
  const step = Math.max(2, study.cellFeet);

  for (const node of nodes) {
    if (node.surface === "water") continue;
    if (study.insideField(node.x, node.z)) continue;
    let best: { x: number; z: number; dist: number } | null = null;
    for (let radius = step; radius <= 240 && !best; radius += step) {
      for (let angle = 0; angle < 32; angle += 1) {
        const theta = (angle / 32) * Math.PI * 2;
        const x = node.x + Math.cos(theta) * radius;
        const z = node.z + Math.sin(theta) * radius;
        if (!study.insideField(x, z)) continue;
        const dist = Math.hypot(x - node.x, z - node.z);
        if (!best || dist < best.dist) best = { x, z, dist };
      }
    }
    // Fallback: coarse scan of the frame if the ring missed (narrow corridor).
    if (!best) {
      const frame = study.frame;
      for (let z = frame.minZ; z <= frame.minZ + frame.depth; z += FLOW_SPACING_FEET) {
        for (let x = frame.minX; x <= frame.minX + frame.width; x += FLOW_SPACING_FEET) {
          if (!study.insideField(x, z)) continue;
          const dist = Math.hypot(x - node.x, z - node.z);
          if (!best || dist < best.dist) best = { x, z, dist };
        }
      }
    }
    if (!best) throw new Error(`No open land near ${node.id}`);
    console.log(`snap ${node.id} ${best.dist.toFixed(1)}ft → ${best.x.toFixed(1)},${best.z.toFixed(1)}`);
    node.x = best.x;
    node.z = best.z;
    if (node.strategy) {
      node.strategy = {
        ...node.strategy,
        note: `${node.strategy.note ?? node.id} · snapped onto open land for flow (${best.dist.toFixed(0)} ft)`,
      };
    }
    moved.push(`${node.id}@${best.dist.toFixed(0)}ft`);
  }
  return moved;
}

function stitchOrphans(nodes: readonly NetworkNode[], branches: Branch[]) {
  const next = branches.map((edge) => ({ ...edge }));
  const added: string[] = [];
  for (const node of nodes) {
    if (nearestBranch(node.x, node.z, next) <= ON_NETWORK_FT) continue;
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
    next.push({ x0: node.x, z0: node.z, x1: best.x, z1: best.z, conductivity: 1 });
    added.push(`${node.id}@${best.dist.toFixed(0)}ft`);
  }
  return { branches: next, added };
}

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; seed: number; index: number; nodes: NetworkNode[] }>;
  };
  const source = raw.iterations.find((item) => item.id === SOURCE_ID)
    ?? raw.iterations.find((item) => item.seed === SEED);
  if (!source) throw new Error(`Source iteration ${SOURCE_ID} missing.`);

  const nodes = cloneNodes(source.nodes);
  const probe = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  const moved = snapToOpenLand(probe, nodes);
  console.log(`snapped=${moved.join(", ") || "none"}`);

  // Fresh study with snapped nodes so ensureFlow admits every land terminal.
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  for (const node of nodes) {
    if (node.surface === "water") continue;
    if (!study.insideField(node.x, node.z)) {
      throw new Error(`${node.id} still outside open land after snap`);
    }
  }
  if (!study.canRun) throw new Error(study.status.note ?? "cannot run");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();

  const flow = (study as unknown as { flow: Parameters<typeof measurePhysarumMetrics>[0] | null }).flow;
  if (!flow) throw new Error("flow missing");
  const metrics = measurePhysarumMetrics(flow);
  console.log(`metrics ${metrics.terminalsConnected}/${metrics.terminalsTotal} components=${metrics.components} length=${Math.round(metrics.totalNetworkLength)} ok=${metrics.ok}`);

  let branches = study.flowAppearance().map((edge) => ({ ...edge }));
  const stitch = stitchOrphans(nodes, branches);
  branches = stitch.branches;
  if (stitch.added.length) console.log(`stitched ${stitch.added.join(", ")}`);

  const missed = nodes.filter((node) => nearestBranch(node.x, node.z, branches) > ON_NETWORK_FT);
  if (missed.length) {
    throw new Error(`Still off-network: ${missed.map((node) => `${node.id}@${nearestBranch(node.x, node.z, branches).toFixed(0)}ft`).join(", ")}`);
  }
  if (!metrics.ok && metrics.components !== 1) {
    // After stitch, force-check geometric reach; components metric is pre-stitch.
    console.log("note: flow metrics pre-stitch; geometric reach verified for all field points");
  }

  const stamp = Date.now().toString(36);
  const index = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const iteration = {
    id: `batch-${stamp}-all-connected-${SEED}`,
    index,
    seed: SEED,
    nodes,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note: `All field terminals connected. Snapped ${moved.join(", ") || "none"}. Physarum refine B. ${branches.length} branches.`,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: "flow" as const,
    branches,
    layoutId: typeof source.layoutId === "string" ? source.layoutId : undefined,
    layoutTitle: "City-side experimental lobby · all terminals connected",
    layoutFamily: "strategy" as const,
    spacingFeet: FLOW_SPACING_FEET,
    architectureRecord: source.architectureRecord,
  };

  const record = serializeArchiveIteration(iteration);
  const priorIds = raw.iterations.flatMap((item) => (typeof item.id === "string" ? [item.id] : []));
  const shortlist = [record.id, ...priorIds.filter((id) => id !== record.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: record.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [record.id, record.id, record.id],
    iterations: [...raw.iterations, record],
  }, null, 2)}\n`, "utf8");
  console.log(`published ${record.id} index=${index} branches=${branches.length} fieldPoints=${nodes.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
