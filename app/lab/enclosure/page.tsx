import { DownstreamLab } from "@/components/pipeline/downstream-lab";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("enclosure");

export const metadata = {
  title: `${workspace.label} -+ Living Morphologies`,
};

export default function EnclosurePage() {
  return <DownstreamLab stage="enclosure" />;
}
