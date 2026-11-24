import { DownstreamLab } from "@/components/pipeline/downstream-lab";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("rendering");

export const metadata = {
  title: `${workspace.label} -+ Living Morphologies`,
};

export default function RenderingPage() {
  return <DownstreamLab stage="rendering" />;
}
