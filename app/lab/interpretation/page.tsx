import { InterpretationLab } from "@/components/interpretation/interpretation-lab";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("interpretation");

export const metadata = {
  title: `${workspace.label} -+ Living Morphologies`,
};

export default function ArchitecturalInterpretationPage() {
  return <InterpretationLab />;
}
