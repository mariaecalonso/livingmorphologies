import { ParetoCatalog } from "@/components/evolution/pareto-catalog";
import { labWorkspace } from "@/lib/site-map";
import { loadShownCatalog } from "@/lib/skill2/published-catalog-view";
import { loadSavedPicks } from "@/lib/skill2/saved-picks";

const workspace = labWorkspace("optimization");
const catalog = workspace.tabs.find((tab) => "results" in tab && tab.results);

export const metadata = {
  title: `${catalog?.label ?? workspace.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function ParetoCatalogPage() {
  return <ParetoCatalog initial={loadShownCatalog()} picks={loadSavedPicks()} />;
}
