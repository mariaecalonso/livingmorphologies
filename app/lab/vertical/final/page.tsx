import { FinalMorphologyCatalogue } from "@/components/final-morphology-catalogue";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("vertical");
const tab = workspace.tabs[2];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default async function FinalMorphologyPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const params = await searchParams;
  return <FinalMorphologyCatalogue fixture={params.fixture === "1"} />;
}
