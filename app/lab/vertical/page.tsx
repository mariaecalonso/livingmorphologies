import { Skill2SelectionBoard } from "@/components/skill2-selected-candidate";
import { VerticalProcess } from "@/components/vertical-process";
import type { ProcessExample } from "@/components/vertical-process-story";
import { VerticalSelectionNotice } from "@/components/vertical-selection";
import { buildDevelopmentFixture } from "@/lib/skill3/fixture";
import { readProcessSource } from "@/lib/skill3/process-source";
import {
  DEFAULT_PROCESS_ARCHETYPE_ID,
  DEFAULT_PROCESS_CANDIDATE_ID,
  selectionFromQuery,
  type ResolvedProcessSource,
} from "@/lib/skill3/selection";

function exampleFrom(source: ResolvedProcessSource | null): ProcessExample | null {
  if (!source || source.handoff !== "verified" || source.z0Iteration == null || source.checksum == null) return null;
  return {
    archetypeId: source.selection.archetypeId,
    typologyId: source.selection.typologyId,
    archetypeName: source.archetypeName,
    candidateId: source.selection.candidateId,
    z0Iteration: source.z0Iteration,
    checksum: source.checksum,
  };
}

export const metadata = {
  title: "Vertical Propagation -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

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
    const source = readProcessSource(DEFAULT_PROCESS_ARCHETYPE_ID, DEFAULT_PROCESS_CANDIDATE_ID);
    return <VerticalProcess initial={buildDevelopmentFixture()} candidate={null} resolved={null} example={exampleFrom(source)} />;
  }

  const requested = selectionFromQuery(params);
  if ("error" in requested) return <VerticalSelectionNotice title="This candidate could not be opened." detail={requested.error} />;

  const explicit = "selection" in requested ? requested.selection : null;
  const source = readProcessSource(
    explicit?.archetypeId ?? DEFAULT_PROCESS_ARCHETYPE_ID,
    explicit?.candidateId ?? DEFAULT_PROCESS_CANDIDATE_ID,
  );
  const example = exampleFrom(source);
  if (explicit && !source) {
    return <VerticalSelectionNotice title="This candidate could not be opened." detail="The stored selection is not a published Skill 2 candidate." />;
  }

  return (
    <div className="vertical-lab runs-wall">
      <Skill2SelectionBoard />
      <div className="vertical-lab-main">
        <VerticalProcess
          initial={null}
          candidate={explicit && source ? {
            archetypeId: source.selection.archetypeId,
            archetypeName: source.archetypeName,
            typologyId: source.selection.typologyId,
            candidateId: source.selection.candidateId,
          } : null}
          resolved={source}
          example={example}
        />
      </div>
    </div>
  );
}
