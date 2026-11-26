import { FinalClusterProcess } from "@/components/hybrid/final-cluster-process";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridPage() {
  return <FinalClusterProcess />;
}
