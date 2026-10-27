import { ConfigurationCatalog } from "@/components/site/configuration-catalog";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("site");
const tab = workspace.tabs[1];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function SiteConfigurationsPage() {
  return <ConfigurationCatalog />;
}
