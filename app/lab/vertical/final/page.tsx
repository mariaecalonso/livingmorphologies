import { FinalMorphologyCatalogue } from "@/components/final-morphology-catalogue";

export const metadata = {
  title: "Final Morphology Catalogue -+ Living Morphologies",
};

export default async function FinalMorphologyPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const params = await searchParams;
  return <FinalMorphologyCatalogue fixture={params.fixture === "1"} />;
}
