import { FinalMorphologyCatalogue, type FinalArchiveHandoff } from "@/components/final-morphology-catalogue";
import { readFinalSelection } from "@/lib/skill3/final-selection";

export const metadata = {
  title: "Final Morphology Catalogue -+ Living Morphologies",
};

export default async function FinalMorphologyPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const params = await searchParams;
  const fixture = params.fixture === "1";
  const handoff: FinalArchiveHandoff[] = fixture
    ? []
    : readFinalSelection().selections.map((entry) => ({
        archetypeId: entry.archetypeId,
        candidateId: entry.candidateId,
        continuationId: entry.continuationId,
        moduleId: entry.moduleId,
        status: entry.status === "Validated" ? "validated" : "review",
      }));
  return <FinalMorphologyCatalogue fixture={fixture} handoff={handoff} />;
}
