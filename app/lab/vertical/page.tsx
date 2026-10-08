import { Skill2SelectionBoard } from "@/components/skill2-selected-candidate";
import { VerticalProcess } from "@/components/vertical-process";
import type { ProcessExample } from "@/components/vertical-process-story";
import { VerticalSelectionNotice } from "@/components/vertical-selection";
import { buildDevelopmentFixture } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";
import snapshot from "@/data/semantic-runs/vertical-void/z0/351.json";

function verticalVoidExample(): ProcessExample | null {
  const meta = snapshot as {
    identity?: { typologyId?: string; archetypeId?: string; archetypeName?: string; candidateId?: number };
    z0?: { iteration?: number };
    validation?: { algorithm?: string; checksum?: string };
  };
  if (meta.identity?.typologyId !== "lobby" || meta.identity.archetypeId !== "vertical-void" || meta.identity.candidateId !== 351) return null;
  if (typeof meta.identity.archetypeName !== "string" || typeof meta.z0?.iteration !== "number") return null;
  if (meta.validation?.algorithm !== "z0-sha256-v1" || typeof meta.validation.checksum !== "string") return null;
  return {
    typologyId: "lobby",
    archetypeName: meta.identity.archetypeName,
    candidateId: 351,
    z0Iteration: meta.z0.iteration,
    checksum: meta.validation.checksum,
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
  const example = verticalVoidExample();
  if (params.fixture === "1") {
    return <VerticalProcess initial={buildDevelopmentFixture()} candidate={null} example={example} />;
  }

  const requested = selectionFromQuery(params);
  if ("error" in requested) return <VerticalSelectionNotice title="This candidate could not be opened." detail={requested.error} />;

  return (
    <div className="vertical-lab runs-wall">
      <Skill2SelectionBoard />
      <div className="vertical-lab-main">
        <VerticalProcess initial={null} candidate={null} example={example} />
      </div>
    </div>
  );
}
