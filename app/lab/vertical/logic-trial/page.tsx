import { readFile } from "node:fs/promises";
import { Skill3LogicTrial } from "@/components/skill3-logic-trial";
import { LOGIC_TRIAL_PATH } from "@/lib/skill3/logic-trial";
import type { LogicTrialFile } from "@/lib/skill3/logic-trial-types";

export const metadata = {
  title: "Skill 3 logic trial -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

export default async function LogicTrialPage() {
  const trial = JSON.parse(await readFile(LOGIC_TRIAL_PATH, "utf8")) as LogicTrialFile;
  return <Skill3LogicTrial trial={trial} />;
}
