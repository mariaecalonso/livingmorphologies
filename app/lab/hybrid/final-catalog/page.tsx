import { HybridCatalog } from "@/components/hybrid/hybrid-catalog";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs[2];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridFinalCatalogPage() {
  return <HybridCatalog final />;
}
