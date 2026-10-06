import { ProcessIntro } from "@/components/evolution/process-intro";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "2D Evolution Process -+ Living Morphologies",
};

export default function EvolutionPage() {
  return <ProcessIntro initial={loadEvolutionCatalog()} />;
}
