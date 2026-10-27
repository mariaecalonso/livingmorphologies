import { HybridAssembly } from "@/components/hybrid/hybrid-assembly";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("hybrid");
const tab = workspace.tabs[2];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function HybridFinalCatalogPage() {
  return <HybridAssembly view="final-catalog" />;
}
