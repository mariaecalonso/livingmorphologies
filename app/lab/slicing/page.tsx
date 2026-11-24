import { DownstreamLab } from "@/components/pipeline/downstream-lab";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("slicing");

export const metadata = {
  title: `${workspace.label} -+ Living Morphologies`,
};

export default function SlicingPage() {
  return <DownstreamLab stage="slicing" />;
}
