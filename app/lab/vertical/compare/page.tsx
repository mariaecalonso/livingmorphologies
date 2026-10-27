import { Skill2SelectionBoard } from "@/components/skill2-selected-candidate";
import { GeneratorCompare } from "@/components/generator-compare";

export const metadata = {
  title: "Generator compare -+ Vertical Propagation -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

export default function GeneratorComparePage() {
  return (
    <div className="vertical-lab runs-wall">
      <Skill2SelectionBoard />
      <div className="vertical-lab-main">
        <GeneratorCompare />
      </div>
    </div>
  );
}
