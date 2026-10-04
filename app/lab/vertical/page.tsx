import { VerticalPrepare } from "@/components/vertical-prepare";
import { VerticalSelectionNotice, VerticalSelectionResume } from "@/components/vertical-selection";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const metadata = {
  title: "Vertical Propagation -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

function archetypeName(archetypeId: string) {
  return Object.values(ARCHETYPES).find((item) => item.id === archetypeId)?.name ?? archetypeId;
}

export default async function VerticalPropagationPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string; archetype?: string | string[]; candidate?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = selectionFromQuery(params);
  if ("missing" in requested) return <VerticalSelectionResume />;
  if ("error" in requested) return <VerticalSelectionNotice title="This candidate could not be opened." detail={requested.error} />;

  return (
    <VerticalPrepare
      archetypeId={requested.selection.archetypeId}
      archetypeName={archetypeName(requested.selection.archetypeId)}
      candidateId={requested.selection.candidateId}
      materialization={params.material === "trail" ? "trail" : params.material === "shell" ? "shell" : "void"}
    />
  );
}
