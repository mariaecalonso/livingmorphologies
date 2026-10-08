import { VerticalCatalogue } from "@/components/vertical-catalogue";
import { VerticalSelectionNotice } from "@/components/vertical-selection";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { buildDevelopmentCatalogueSet } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const metadata = {
  title: "3D Catalogue -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

function archetypeOf(archetypeId: string) {
  return Object.values(ARCHETYPES).find((item) => item.id === archetypeId) ?? null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VerticalCataloguePage({
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
    return <VerticalCatalogue initial={buildDevelopmentCatalogueSet()} candidate={null} />;
  }
  const archetypeParam = firstParam(params.archetype);
  const candidateParam = firstParam(params.candidate);
  if (archetypeParam && (candidateParam == null || candidateParam === "")) {
    const archetype = archetypeOf(archetypeParam);
    if (!archetype) {
      return <VerticalSelectionNotice title="This candidate could not be opened." detail="The stored selection is not a Skill 2 candidate." />;
    }
    return <VerticalCatalogue initial={null} candidate={null} requestedArchetypeId={archetype.id} />;
  }
  const requested = selectionFromQuery(params);
  if ("missing" in requested) return <VerticalCatalogue initial={null} candidate={null} />;
  if ("error" in requested) return <VerticalSelectionNotice title="This candidate could not be opened." detail={requested.error} />;
  const archetype = archetypeOf(requested.selection.archetypeId);
  return (
    <VerticalCatalogue
      initial={null}
      candidate={{
        archetypeId: requested.selection.archetypeId,
        archetypeName: archetype?.name ?? requested.selection.archetypeId,
        typologyId: archetype?.typologyId ?? "",
        candidateId: requested.selection.candidateId,
      }}
    />
  );
}
