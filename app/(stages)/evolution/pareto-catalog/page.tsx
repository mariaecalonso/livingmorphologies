import { ParetoCatalog } from "@/components/evolution/pareto-catalog";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";
import { loadSavedPicks } from "@/lib/skill2/saved-picks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pareto Catalog · 2D Evolution · Living Morphologies",
};

export default function ParetoCatalogPage() {
  return <ParetoCatalog initial={loadEvolutionCatalog()} picks={loadSavedPicks()} />;
}
