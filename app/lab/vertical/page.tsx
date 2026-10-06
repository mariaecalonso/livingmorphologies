import { VerticalProcess } from "@/components/vertical-process";
import { VerticalSelectionNotice, VerticalSelectionResume } from "@/components/vertical-selection";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { buildDevelopmentFixture } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";
import { loadSemanticProvenance } from "@/lib/skill3/semantic-provenance";

export const metadata = {
  title: "Vertical Propagation -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

function archetypeOf(archetypeId: string) {
  return Object.values(ARCHETYPES).find((item) => item.id === archetypeId) ?? null;
}

export default async function VerticalPropagationPage({
  searchParams,
}: {
  searchParams: Promise<{
    fixture?: string;
    archetype?: string | string[];
    candidate?: string | string[];
  }>;
}) {
  const params = await searchParams;
  if (params.fixture === "1") {
    return <VerticalProcess initial={buildDevelopmentFixture()} candidate={null} provenance={null} />;
  }

  const requested = selectionFromQuery(params);
  if ("missing" in requested) return <VerticalSelectionResume />;
  if ("error" in requested) return <VerticalSelectionNotice title="This candidate could not be opened." detail={requested.error} />;
  const archetype = archetypeOf(requested.selection.archetypeId);
  return (
    <VerticalProcess
      initial={null}
      candidate={{
        archetypeId: requested.selection.archetypeId,
        archetypeName: archetype?.name ?? requested.selection.archetypeId,
        typologyId: archetype?.typologyId ?? "",
        candidateId: requested.selection.candidateId,
      }}
      provenance={loadSemanticProvenance(requested.selection.archetypeId, requested.selection.candidateId)}
    />
  );
}
