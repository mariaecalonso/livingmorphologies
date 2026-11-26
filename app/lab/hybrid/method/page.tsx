import { FinalClusterMethod } from "@/components/hybrid/final-cluster-method";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs.find((item) => item.href === "/lab/hybrid/method") ?? workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridMethodPage() {
  return <FinalClusterMethod />;
}
