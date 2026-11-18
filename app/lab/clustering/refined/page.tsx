import { ClusteringPlaceholder } from "@/components/clustering/clustering-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("clustering");
const tab = workspace.tabs.find((item) => item.href === "/lab/clustering/refined") ?? workspace.tabs[2];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function RefinedClusteringPage() {
  return <ClusteringPlaceholder title="Refined Cluster" />;
}
