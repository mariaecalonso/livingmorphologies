import { ParetoCatalog } from "@/components/evolution/pareto-catalog";
import { labWorkspace } from "@/lib/site-map";
import type { EvolutionCatalog } from "@/lib/skill2/evolution-index";
import type { SavedPick } from "@/lib/skill2/saved-picks";
import shownCatalog from "@/public/demo/skill2/catalog.json";
import picks from "@/public/demo/skill2/picks.json";

const workspace = labWorkspace("optimization");
const catalog = workspace.tabs.find((tab) => "results" in tab && tab.results);

export const metadata = {
  title: `${catalog?.label ?? workspace.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function ParetoCatalogPage() {
  return <ParetoCatalog initial={shownCatalog as EvolutionCatalog} picks={picks as SavedPick[]} />;
}
