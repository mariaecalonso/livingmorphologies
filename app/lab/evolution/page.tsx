import { ProcessIntro } from "@/components/evolution/process-intro";
import { labWorkspace } from "@/lib/site-map";
import { loadShownCatalog } from "@/lib/skill2/published-catalog-view";
import { loadSavedPicks } from "@/lib/skill2/saved-picks";

const workspace = labWorkspace("optimization");
const tab = workspace.tabs[0];

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function EvolutionPage() {
  return <ProcessIntro initial={loadShownCatalog()} picks={loadSavedPicks()} />;
}
