import { LivingInstrument } from "@/components/living-instrument";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("physarum");
const tab = workspace.tabs[0];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default function PhysarumTranslationPage() {
  return <LivingInstrument />;
}
