import { AllArchetypeFutures } from "@/components/all-archetype-futures";
import "../carved-mass/carved-mass.css";

export const metadata = {
  title: "All archetypes, 24 temporal futures",
};

export const dynamic = "force-dynamic";

export default function AllFuturesPage() {
  return <AllArchetypeFutures />;
}
