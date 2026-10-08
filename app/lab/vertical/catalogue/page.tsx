import { VerticalCatalogue } from "@/components/vertical-catalogue";
import { VerticalSelectionNotice, VerticalSelectionResume } from "@/components/vertical-selection";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { buildDevelopmentCatalogueSet } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";

import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("vertical");
const tab = workspace.tabs[1];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export const dynamic = "force-dynamic";

function archetypeOf(archetypeId: string) {
  return Object.values(ARCHETYPES).find((item) => item.id === archetypeId) ?? null;
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
  const requested = selectionFromQuery(params);
  if ("missing" in requested) return <VerticalSelectionResume />;
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
