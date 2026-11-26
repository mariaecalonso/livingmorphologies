/**
 * Grow five herald-arrival-v1 networks from the city-side zoning arrangement
 * and append them to the published strategy archive.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { runNetworkIteration } from "../components/site/site-network";
import { FLOW_SPACING_FEET } from "../components/site/site-network-flow";
import { buildArrivalArrangement } from "../lib/skill5/architectural-strategy";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext } from "../lib/skill5/site-model";

const FILE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SEEDS = [20365850, 20470579, 20575308, 20680037, 20784766] as const;

async function main() {
  const site = context as SiteContext;
  const arrangement = buildArrivalArrangement(site);
  if (!arrangement) {
    throw new Error("City-side arrival arrangement could not be placed from the site evidence.");
  }
  const raw = JSON.parse(await readFile(FILE, "utf8")) as {
    strategyId?: string;
    massingNetworkId?: string | null;
    zoningShortlist?: string[];
    iterations?: unknown[];
  };
  const existing = Array.isArray(raw.iterations) ? raw.iterations : [];
  const startIndex = existing.reduce((max, item) => {
    const index = item && typeof item === "object" && typeof (item as { index?: unknown }).index === "number"
      ? (item as { index: number }).index
      : 0;
    return Math.max(max, index);
  }, 0);
  const stamp = Date.now().toString(36);
  const created: ReturnType<typeof serializeArchiveIteration>[] = [];
  for (let n = 0; n < SEEDS.length; n += 1) {
    const seed = SEEDS[n];
    process.stdout.write(`growing ${n + 1}/${SEEDS.length} seed=${seed}… `);
    const nodes = arrangement.nodes.map((node) => ({
      ...node,
      architecture: node.architecture
        ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
        : undefined,
    }));
    const iteration = await runNetworkIteration(
      site.site.ring,
      site.water.ring,
      nodes,
      seed,
      undefined,
      site.buildings,
    );
    iteration.index = startIndex + n + 1;
    iteration.id = `batch-${stamp}-${arrangement.arrangementId}-${seed}`;
    iteration.layoutId = arrangement.arrangementId;
    iteration.layoutTitle = arrangement.title;
    iteration.layoutFamily = "strategy";
    iteration.spacingFeet = FLOW_SPACING_FEET;
    iteration.architectureRecord = {
      strategyId: arrangement.strategyId,
      arrangementId: arrangement.arrangementId,
      relationships: arrangement.relationships,
      northLobby: arrangement.northLobby,
      parameters: arrangement.parameters,
    };
    const record = serializeArchiveIteration(iteration);
    created.push(record);
    console.log(`branches=${iteration.branches?.length ?? 0} step=${iteration.step}`);
  }
  const shortlist = created.slice(0, 3).map((item) => item.id);
  const next = {
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: created[0]?.id ?? raw.massingNetworkId ?? null,
    zoningShortlist: shortlist.length === 3 ? shortlist : raw.zoningShortlist ?? [],
    iterations: [...existing, ...created],
  };
  await writeFile(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`wrote ${created.length} networks → ${FILE}`);
  console.log(`massingNetworkId=${next.massingNetworkId}`);
  for (const item of created) console.log(`  ${item.index} ${item.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
