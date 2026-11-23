import { ClusterCatalogSheet } from "@/components/clustering/lab-sheets";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("clustering");
const tab = workspace.tabs.find((item) => item.href === "/lab/clustering/catalog") ?? workspace.tabs[2];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function ClusteringCatalogPage() {
  return <ClusterCatalogSheet />;
}
