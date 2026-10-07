import { ParetoSpace } from "@/components/evolution/pareto-space";
import { labWorkspace } from "@/lib/site-map";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";

const workspace = labWorkspace("optimization");

export const metadata = {
  title: `Pareto -+ ${workspace.label} -+ Living Morphologies`,
};

export default function ParetoPage() {
  return <ParetoSpace initial={loadEvolutionCatalog()} />;
}
