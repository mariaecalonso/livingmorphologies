import { RunGrid } from "@/components/run-grid";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("physarum");
const tab = workspace.tabs[1];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function PhysarumRunsPage() {
  return <RunGrid />;
}
