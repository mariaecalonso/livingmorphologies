import { ParetoCatalog } from "@/components/evolution/pareto-catalog";
import { loadShownCatalog } from "@/lib/skill2/published-catalog-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pareto Catalog · 2D Evolution · Living Morphologies",
};

export default function ParetoCatalogPage() {
  return <ParetoCatalog initial={loadShownCatalog()} picks={[]} />;
}
