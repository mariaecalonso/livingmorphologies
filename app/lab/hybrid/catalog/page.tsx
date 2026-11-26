import { FinalClustersCatalog } from "@/components/hybrid/final-clusters-catalog";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs.find((item) => item.href === "/lab/hybrid/catalog") ?? workspace.tabs[1];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridCatalogPage() {
  return <FinalClustersCatalog />;
}
