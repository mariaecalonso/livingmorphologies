import { HybridAssembly } from "@/components/hybrid/hybrid-assembly";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs[1];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridCatalogPage() {
  return <HybridAssembly view="catalog" />;
}
