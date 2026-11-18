import { ClusteringPlaceholder } from "@/components/clustering/clustering-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("clustering");
const tab = workspace.tabs.find((item) => item.href === "/lab/clustering/process") ?? workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function ClusteringProcessPage() {
  return <ClusteringPlaceholder title="Process" />;
}
