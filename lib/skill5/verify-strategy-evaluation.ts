import context from "@/data/skill5/herald-site.json";
import { runNetworkIteration, type NetworkIteration } from "@/components/site/site-network";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import type { SiteContext } from "@/lib/skill5/site-model";
import { STRATEGY_LAYOUT_DEFAULTS, buildStrategyLayouts } from "@/lib/skill5/strategy-layouts";
import { evaluateLayouts, evaluateNetwork, metricSpread, openNetworkField } from "@/lib/skill5/strategy-evaluation";

const site = context as SiteContext;
const layouts = buildStrategyLayouts(site, STRATEGY_LAYOUT_DEFAULTS);
if (layouts.length !== 6) throw new Error(`Expected 6 layouts, got ${layouts.length}.`);
if (layouts.some((layout) => layout.seeds.length !== 3)) throw new Error("Each layout should carry three seeds.");

const field = openNetworkField(site);
const iterations: NetworkIteration[] = [];
const times: { title: string; seed: number; ms: number; status: string; step: number }[] = [];
const started = performance.now();

async function main() {
for (const layout of layouts) {
  for (const seed of layout.seeds) {
    const mark = performance.now();
    const iteration = await runNetworkIteration(site.site.ring, site.water.ring, layout.nodes.map((node) => ({ ...node })), seed, undefined, site.buildings);
    iteration.id = `layout-${layout.id}-${seed}`;
    iteration.layoutId = layout.id;
    iteration.layoutTitle = layout.title;
    iteration.layoutFamily = layout.family;
    iteration.spacingFeet = FLOW_SPACING_FEET;
    iteration.windFromDegrees = layout.windFromDegrees;
    const evaluation = evaluateNetwork(iteration, field);
    const elapsed = performance.now() - mark;
    times.push({ title: layout.title, seed, ms: Math.round(elapsed), status: evaluation.status, step: iteration.step });
    if (iteration.spacingFeet !== 15) throw new Error(`${layout.id} did not keep 15 ft spacing.`);
    if (iteration.nodes.some((node) => node.strategy?.layoutId !== layout.id)) throw new Error(`${layout.id} lost its layout trace.`);
    if (evaluation.reachFeet < 7 || evaluation.reachFeet > 8) throw new Error(`Reach is ${evaluation.reachFeet} ft, expected about 7.5.`);
    if (evaluation.reachShare < 0 || evaluation.reachShare > 1) throw new Error("Reach share is outside 0–1.");
    if (evaluation.connectedAttractors > evaluation.attractors) throw new Error("Connected attractors exceed the layout count.");
    if (evaluation.status === "connected" && evaluation.connectedAttractors !== evaluation.attractors) throw new Error("A connected run left an attractor out.");
    if (evaluation.status === "failed" && evaluation.branchFeet > 0 && evaluation.connectedAttractors === evaluation.attractors) throw new Error("A finished network was marked failed.");
    if (evaluation.branchFeet > 0 && evaluation.northFeet + evaluation.southFeet > evaluation.branchFeet + 1) throw new Error("Regional lengths exceed the network.");
    const length = (iteration.branches ?? []).reduce((sum, edge) => sum + Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0), 0);
    if (Math.abs(length - evaluation.branchFeet) > 1) throw new Error(`Branch length ${evaluation.branchFeet} does not match the geometry ${length}.`);
    iterations.push(iteration);
    console.log(`${layout.title} seed ${seed}: ${evaluation.status}, ${evaluation.connectedAttractors}/${evaluation.attractors} attractors, reach ${(evaluation.reachShare * 100).toFixed(1)}%, ${Math.round(evaluation.branchFeet)} ft, ${Math.round(elapsed)} ms`);
  }
}

const evaluations = iterations.map((item) => evaluateNetwork(item, field));
const summaries = evaluateLayouts(iterations, evaluations);
if (summaries.length !== 6) throw new Error("Layout summaries should stay separate from the 18 runs.");
for (const summary of summaries) {
  for (const spread of [summary.reachShare, summary.connectedShare, summary.branchFeet, summary.junctions, summary.components]) {
    if (spread.min > spread.median || spread.median > spread.max) throw new Error(`${summary.title} has an unordered spread.`);
  }
  if (summary.connectedRuns + summary.failedRuns + summary.disconnectedRuns + summary.unconvergedRuns !== summary.runs) {
    throw new Error(`${summary.title} does not account for every run.`);
  }
}

const failed: NetworkIteration = {
  ...iterations[0],
  id: "failed-check",
  step: 0,
  settled: false,
  branches: [],
  connectedIds: [],
  reached: 0,
  note: "The run did not grow a network.",
};
if (evaluateNetwork(failed, field).status !== "failed") throw new Error("An empty run was treated as successful.");
const spread = metricSpread([0.2, 0.9, 0.4]);
if (spread.min !== 0.2 || spread.median !== 0.4 || spread.max !== 0.9) throw new Error("Median is wrong.");
if ("score" in evaluations[0]) throw new Error("Evaluation invented a combined score.");

const total = Math.round(performance.now() - started);
const slow = times.filter((item) => item.ms > 2000);
console.log(`18 runs in ${total} ms. Slow runs over 2 s: ${slow.length}.`);
console.log(summaries.map((item) => `${item.title}: ${item.connectedRuns}/${item.runs} connected, reach ${(item.reachShare.min * 100).toFixed(1)}–${(item.reachShare.max * 100).toFixed(1)}%`).join("\n"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
