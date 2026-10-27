import { SiteWorkspace } from "@/components/site/site-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("site");
const tab = workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function SitePage() {
  return <SiteWorkspace />;
}
