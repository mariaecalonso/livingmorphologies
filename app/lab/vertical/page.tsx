import { Skill2SelectionBoard } from "@/components/skill2-selected-candidate";
import { VerticalProcess } from "@/components/vertical-process";
import type { ProcessExample } from "@/components/vertical-process-story";

const example: ProcessExample = {
  typologyId: "lobby",
  archetypeId: "vertical-void",
  archetypeName: "Vertical Void",
  candidateId: 351,
  z0Iteration: 600,
  checksum: "ff0ebb8a99222bd15d12057caf5e95e12998acb35861c3d14e73a81a5fae5c74",
};

export const metadata = {
  title: "Vertical Propagation -+ Living Morphologies",
};

export default function VerticalPropagationPage() {
  return (
    <div className="vertical-lab runs-wall">
      <Skill2SelectionBoard />
      <div className="vertical-lab-main">
        <VerticalProcess
          initial={null}
          candidate={{
            archetypeId: example.archetypeId,
            archetypeName: example.archetypeName,
            typologyId: example.typologyId,
            candidateId: example.candidateId,
          }}
          resolved={{
            handoff: "verified",
            archetypeName: example.archetypeName,
            z0Iteration: example.z0Iteration,
            checksum: example.checksum,
            selection: {
              archetypeId: example.archetypeId,
              typologyId: example.typologyId,
              candidateId: example.candidateId,
              objectives: { formal: 0.8457632560105238, spatial: 0.7754639273355709, atmospheric: 0.6921068068952314 },
              pareto: true,
              specialist: null,
              diversity: "none",
              plan: { adapterId: "presentation", archetypeId: example.archetypeId, body: {} },
              state: {},
              previewFile: null,
            },
          }}
          example={example}
        />
      </div>
    </div>
  );
}
