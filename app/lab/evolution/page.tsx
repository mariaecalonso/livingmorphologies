import { ProcessIntro } from "@/components/evolution/process-intro";
import { labWorkspace } from "@/lib/site-map";
import type { EvolutionCatalog } from "@/lib/skill2/evolution-index";
import type { SavedPick } from "@/lib/skill2/saved-picks";
import processCatalog from "@/public/demo/skill2/process.json";
import picks from "@/public/demo/skill2/picks.json";

const workspace = labWorkspace("optimization");
const tab = workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function EvolutionPage() {
  return <ProcessIntro initial={processCatalog as EvolutionCatalog} picks={picks as SavedPick[]} />;
}
