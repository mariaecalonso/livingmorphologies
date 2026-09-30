import { ParetoSpace } from "@/components/evolution/pareto-space";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pareto · 2D Evolution · Living Morphologies",
};

export default function ParetoPage() {
  return <ParetoSpace initial={loadEvolutionCatalog()} />;
}
