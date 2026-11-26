/**
 * Grow Option B (Physarum refine) from the same terminals/seed and publish it
 * as the live Site Strategy network on the field.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { NETWORK_STEP_BUDGET, SiteNetworkStudy, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET, measurePhysarumMetrics } from "../components/site/site-network-flow";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const BASELINE_ID = "batch-mwwtvzry-uniform-22010011";
const SEED = 22010011;

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

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; seed: number; index: number; nodes: NetworkNode[] }>;
  };
  const baseline = raw.iterations.find((item) => item.id === BASELINE_ID)
    ?? raw.iterations.find((item) => item.seed === SEED);
  if (!baseline) throw new Error(`Baseline ${BASELINE_ID} missing.`);
  const nodes = cloneNodes(baseline.nodes);

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  if (!study.canRun) throw new Error(study.status.note ?? "cannot run");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();

  const flow = (study as unknown as { flow: Parameters<typeof measurePhysarumMetrics>[0] | null }).flow;
  if (!flow) throw new Error("flow missing");
  const metrics = measurePhysarumMetrics(flow);
  console.log(`metrics terminals=${metrics.terminalsConnected}/${metrics.terminalsTotal} components=${metrics.components} length=${Math.round(metrics.totalNetworkLength)} detour=${metrics.avgDetourRatio?.toFixed(3)} ok=${metrics.ok}`);
  if (!metrics.ok) throw new Error("Refined network failed the one-component rule.");

  const stamp = Date.now().toString(36);
  const index = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const branches = study.flowAppearance().map((edge) => ({ ...edge }));
  const iteration = {
    id: `batch-${stamp}-physarum-b-${SEED}`,
    index,
    seed: SEED,
    nodes,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note: `Option B Physarum refine. ${metrics.terminalsConnected}/${metrics.terminalsTotal} terminals · 1 component · ${Math.round(metrics.totalNetworkLength)} ft.`,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: "flow" as const,
    branches,
    layoutId: typeof baseline.layoutId === "string" ? baseline.layoutId : undefined,
    layoutTitle: "City-side experimental lobby · Physarum refine B",
    layoutFamily: "strategy" as const,
    spacingFeet: FLOW_SPACING_FEET,
    architectureRecord: baseline.architectureRecord,
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
  console.log(`published ${record.id} index=${index} branches=${branches.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
