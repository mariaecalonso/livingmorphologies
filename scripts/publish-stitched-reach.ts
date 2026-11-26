/** Clone the stitched reach-all as a new archive id so IndexedDB installs it. */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");

async function main() {
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    strategyId?: string;
    massingNetworkId?: string | null;
    zoningShortlist?: string[];
    iterations: Array<Record<string, unknown> & { id: string; index: number; note?: string | null }>;
  };
  const source = raw.iterations.find((item) => item.id.includes("reach-21300101"))
    ?? raw.iterations.find((item) => item.id === raw.massingNetworkId)
    ?? raw.iterations.at(-1);
  if (!source) throw new Error("No source iteration.");
  const stamp = Date.now().toString(36);
  const clone = {
    ...source,
    id: `batch-${stamp}-reach-all-${source.seed ?? "x"}`,
    index: Math.max(...raw.iterations.map((item) => item.index), 0) + 1,
    note: "Every field point on the network (attractors + sources). Secondary veins thickened.",
  };
  const shortlist = [clone.id, ...raw.iterations.map((item) => item.id).filter((id) => id !== clone.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: clone.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [clone.id, clone.id, clone.id],
    iterations: [...raw.iterations, clone],
  }, null, 2)}\n`, "utf8");
  console.log(`published ${clone.id} index=${clone.index} shortlist=${JSON.stringify(shortlist)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
