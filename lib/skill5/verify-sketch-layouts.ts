import { writeFileSync } from "node:fs";
import context from "@/data/skill5/herald-site.json";
import { runNetworkIteration } from "@/components/site/site-network";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import type { SiteContext } from "@/lib/skill5/site-model";
import { evaluateNetwork, openNetworkField } from "@/lib/skill5/strategy-evaluation";
import { SKETCH_RECESSION_FT, STRATEGY_LAYOUT_DEFAULTS, buildSketchLayouts, buildStrategyLayouts } from "@/lib/skill5/strategy-layouts";

const site = context as SiteContext;
const exploratory = buildStrategyLayouts(site, STRATEGY_LAYOUT_DEFAULTS);
if (exploratory.length !== 6) throw new Error(`Exploratory layouts changed: ${exploratory.length}.`);
if (exploratory.some((layout) => layout.family === "sketch")) throw new Error("A sketch layout was stored with the exploratory set.");

const layouts = buildSketchLayouts(site, { recessionFt: SKETCH_RECESSION_FT, seedsPerLayout: 3 });
if (layouts.length !== 2) throw new Error(`Expected two sketch alternatives, got ${layouts.length}.`);
const withNortheast = layouts.find((layout) => layout.id === "sketch-with-northeast");
const withoutNortheast = layouts.find((layout) => layout.id === "sketch-without-northeast");
if (!withNortheast || !withoutNortheast) throw new Error("The two source alternatives are missing.");

function sources(layout: (typeof layouts)[number]) {
  return layout.nodes.filter((node) => node.kind === "source");
}
function attractors(layout: (typeof layouts)[number]) {
  return layout.nodes.filter((node) => node.kind === "attractor");
}
for (const layout of layouts) {
  if (layout.seeds.length !== 3) throw new Error(`${layout.id} does not have three seeds.`);
  if (layout.family !== "sketch") throw new Error(`${layout.id} is not marked sketch.`);
  const access = sources(layout).filter((node) => node.strategy?.origin === "measured-access");
  const proposed = sources(layout).filter((node) => node.strategy?.origin === "city-edge");
  if (access.length + proposed.length !== sources(layout).length) throw new Error(`${layout.id} has a source that is neither access nor a city-edge proposal.`);
  if (!access.some((node) => node.recordId === "pedestrian:access:Potential City-Side Access")) throw new Error(`${layout.id} dropped the Herald contact.`);
  const roles = attractors(layout).map((node) => node.strategy?.note ?? "");
  if (roles.filter((note) => note.startsWith("Gathering.")).length !== 2) throw new Error(`${layout.id} does not have two gathering attractors.`);
  if (roles.filter((note) => note.startsWith("Workspace.")).length !== 3) throw new Error(`${layout.id} does not have three workspace attractors.`);
  if (roles.some((note) => !note.includes("Strength 1."))) throw new Error(`${layout.id} changed an attractor strength.`);
  const central = attractors(layout)[0];
  const others = attractors(layout).slice(1);
  const centralShore = central.strategy?.waterfrontFeet ?? Infinity;
  for (const node of others) {
    const shore = node.strategy?.waterfrontFeet ?? 0;
    if (shore + 0.5 < centralShore + SKETCH_RECESSION_FT) throw new Error(`${layout.id} ${node.id} is not recessed by ${SKETCH_RECESSION_FT} ft.`);
  }
}
const northeastId = "pedestrian:access:Potential Northeast Access";
if (!sources(withNortheast).some((node) => node.recordId === northeastId)) throw new Error("The with-northeast alternative omitted the measured contact.");
if (sources(withoutNortheast).some((node) => node.recordId === northeastId)) throw new Error("The without-northeast alternative still used that source.");
if (sources(withNortheast).length === sources(withoutNortheast).length) throw new Error("The optional source did not change the source count.");

const field = openNetworkField(site);
const runs: {
  id: string;
  layoutId: string;
  title: string;
  seed: number;
  sources: { id: string; origin: string; x: number; z: number; recordId?: string }[];
  attractors: { id: string; note: string; x: number; z: number; waterfrontFeet: number | null }[];
  status: string;
  step: number;
  settled: boolean;
  connectedAttractors: number;
  attractorCount: number;
  reachShare: number;
  branchFeet: number;
  pockets: { count: number; areaSqFt: number; north: number; central: number; south: number; eastGapFt: number | null; spans: { east: number; north: number; band: string; area: number }[] };
}[] = [];

async function main() {
  for (const layout of layouts) {
    console.log(`\n${layout.title}`);
    console.log(layout.notes.join(" ") || "Placed.");
    for (const node of layout.nodes) {
      console.log(`  ${node.kind} ${node.id} ${node.strategy?.origin ?? ""} ${Math.round(node.x)} east, ${Math.round(node.z)} north. ${node.strategy?.note ?? ""}`);
    }
    for (const seed of layout.seeds) {
      const iteration = await runNetworkIteration(site.site.ring, site.water.ring, layout.nodes.map((node) => ({ ...node })), seed, undefined, site.buildings);
      iteration.id = `sketch-${layout.id}-${seed}`;
      iteration.layoutId = layout.id;
      iteration.layoutTitle = layout.title;
      iteration.layoutFamily = "sketch";
      iteration.spacingFeet = FLOW_SPACING_FEET;
      const evaluation = evaluateNetwork(iteration, field);
      const pockets = evaluation.pockets;
      runs.push({
        id: iteration.id,
        layoutId: layout.id,
        title: layout.title,
        seed,
        sources: sources(layout).map((node) => ({ id: node.id, origin: node.strategy?.origin ?? "", x: node.x, z: node.z, recordId: node.recordId })),
        attractors: attractors(layout).map((node) => ({ id: node.id, note: node.strategy?.note ?? "", x: node.x, z: node.z, waterfrontFeet: node.strategy?.waterfrontFeet ?? null })),
        status: evaluation.status,
        step: iteration.step,
        settled: iteration.settled,
        connectedAttractors: evaluation.connectedAttractors,
        attractorCount: evaluation.attractors,
        reachShare: evaluation.reachShare,
        branchFeet: evaluation.branchFeet,
        pockets: {
          count: pockets.count,
          areaSqFt: pockets.areaSqFt,
          north: pockets.north,
          central: pockets.central,
          south: pockets.south,
          eastGapFt: pockets.eastGapFt,
          spans: pockets.readings.map((reading) => ({ east: reading.spanEastFt, north: reading.spanNorthFt, band: reading.band, area: reading.areaSqFt })),
        },
      });
      console.log(`  seed ${seed}: ${evaluation.status}, step ${iteration.step}, ${evaluation.connectedAttractors}/${evaluation.attractors}, reach ${(evaluation.reachShare * 100).toFixed(1)}%, ${pockets.count} pockets, ${Math.round(pockets.areaSqFt)} ft2, N/C/S ${pockets.north}/${pockets.central}/${pockets.south}`);
    }
  }
  const record = {
    id: "sketch-experiment-v1",
    recessionFt: SKETCH_RECESSION_FT,
    strength: 1,
    exploratoryPreserved: exploratory.map((layout) => layout.id),
    runs,
  };
  writeFileSync("data/skill5/sketch-experiment-v1.json", `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nWrote ${runs.length} runs. No run was selected.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
