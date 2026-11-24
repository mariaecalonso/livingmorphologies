import { DownstreamLab } from "@/components/pipeline/downstream-lab";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("drawing");

export const metadata = {
  title: `${workspace.label} -+ Living Morphologies`,
};

export default function DrawingPage() {
  return <DownstreamLab stage="drawing" />;
}
