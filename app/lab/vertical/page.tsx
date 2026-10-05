import { VerticalProcess, type Skill2Provenance } from "@/components/vertical-process";
import { VerticalSelectionNotice, VerticalSelectionResume } from "@/components/vertical-selection";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";
import { buildDevelopmentFixture } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const metadata = {
  title: "Vertical Propagation -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

function archetypeOf(archetypeId: string) {
  return Object.values(ARCHETYPES).find((item) => item.id === archetypeId) ?? null;
}

function skill2Provenance(archetypeId: string, candidateId: number): Skill2Provenance | null {
  try {
    const archetype = loadEvolutionCatalog().archetypes.find((item) => item.archetypeId === archetypeId);
    if (!archetype) return null;
    const selected = archetype.candidates.find((item) => item.id === candidateId);
    return {
      generations: archetype.generations.map((generation) => ({
        id: generation.id,
        status: generation.status,
        archived: generation.archived,
        pareto: generation.pareto,
      })),
      objectives: selected
        ? { formal: selected.formal, spatial: selected.spatial, atmospheric: selected.atmospheric }
        : null,
    };
  } catch {
    return null;
  }
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
      provenance={skill2Provenance(requested.selection.archetypeId, requested.selection.candidateId)}
    />
  );
}
