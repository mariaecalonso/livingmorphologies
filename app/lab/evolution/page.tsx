import { ProcessIntro } from "@/components/evolution/process-intro";
import { labWorkspace } from "@/lib/site-map";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";
import { loadSavedPicks } from "@/lib/skill2/saved-picks";

const workspace = labWorkspace("optimization");
const tab = workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function EvolutionPage() {
  return <ProcessIntro initial={loadEvolutionCatalog()} picks={loadSavedPicks()} />;
}
