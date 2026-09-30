import { EvolutionProgress } from "@/components/evolution/evolution-progress";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "2D Evolution -+ Living Morphologies",
};

export default function EvolutionPage() {
  return <EvolutionProgress initial={loadEvolutionCatalog()} />;
}
