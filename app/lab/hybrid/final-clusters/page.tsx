import { FinalClustersCatalog } from "@/components/hybrid/final-clusters-catalog";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs.find((item) => item.href === "/lab/hybrid/final-clusters") ?? workspace.tabs[3];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridFinalClustersPage() {
  return <FinalClustersCatalog />;
}
