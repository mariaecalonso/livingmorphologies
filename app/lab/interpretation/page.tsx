import { InterpretationReading } from "@/components/interpretation/interpretation-reading";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("interpretation");

export const metadata = {
  title: `${workspace.label} -+ Living Morphologies`,
};

export default function ArchitecturalInterpretationPage() {
  return <InterpretationReading />;
}
