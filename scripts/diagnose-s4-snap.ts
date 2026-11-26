/**
 * Why s4 (city-edge lobby) sits off the refined network.
 */
import { readFile } from "fs/promises";
import context from "../data/skill5/herald-site.json";
import { SiteNetworkStudy, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET, createFlowGraph, createFlowState } from "../components/site/site-network-flow";
import type { SiteContext } from "../lib/skill5/site-model";

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile("data/skill5/herald-arrival-v1.json", "utf8")) as {
    massingNetworkId: string;
    iterations: Array<{ id: string; seed: number; nodes: NetworkNode[]; branches?: { x0: number; z0: number; x1: number; z1: number }[] }>;
  };
  const it = raw.iterations.find((item) => item.id === raw.massingNetworkId)!;
  const s4 = it.nodes.find((node) => node.id === "s4");
  if (!s4) throw new Error("s4 missing");
  console.log(`s4 kind=${s4.kind} x=${s4.x.toFixed(2)} z=${s4.z.toFixed(2)} role=${s4.architecture?.role} note=${s4.strategy?.note}`);

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: it.seed,
    nodes: it.nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  const terminals = it.nodes
    .filter((node) => node.kind === "source" || node.kind === "attractor")
    .map((node) => ({ id: node.id, kind: node.kind as "source" | "attractor", x: node.x, z: node.z }));
  const graph = createFlowGraph(
    terminals,
    FLOW_SPACING_FEET,
    study.cellFeet,
    study.frame,
    study.inkSize,
    (study as unknown as { open: Uint8Array }).open,
    () => 0.5,
  );
  const idx = graph.attractorIds.indexOf("s4");
  const srcIdx = graph.sourceIds.indexOf("s4");
  const node = idx >= 0 ? graph.attractorAt[idx] : srcIdx >= 0 ? graph.sourceAt[srcIdx] : -1;
  console.log(`flow terminalNode=${node} attractorIndex=${idx} sourceIndex=${srcIdx}`);
  console.log(`snap radius=${(FLOW_SPACING_FEET * 1.6).toFixed(1)} ft · spacing=${FLOW_SPACING_FEET} ft`);

  // Nearest open sample
  let best = Infinity;
  let bestI = -1;
  for (let i = 0; i < graph.east.length; i += 1) {
    const d = Math.hypot(graph.east[i] - s4.x, graph.north[i] - s4.z);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  console.log(`nearest open sample ${best.toFixed(1)} ft away (node ${bestI})`);
  if (bestI >= 0) {
    console.log(`  sample at ${graph.east[bestI].toFixed(2)}, ${graph.north[bestI].toFixed(2)}`);
  }

  const branches = it.branches ?? [];
  let branchDist = Infinity;
  for (const edge of branches) {
    const dx = edge.x1 - edge.x0;
    const dz = edge.z1 - edge.z0;
    const length = dx * dx + dz * dz;
    const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((s4.x - edge.x0) * dx + (s4.z - edge.z0) * dz) / length));
    branchDist = Math.min(branchDist, Math.hypot(s4.x - (edge.x0 + dx * t), s4.z - (edge.z0 + dz * t)));
  }
  console.log(`nearest surviving branch ${branchDist.toFixed(1)} ft`);
  console.log(`insideField=${study.insideField?.(s4.x, s4.z) ?? "n/a"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
