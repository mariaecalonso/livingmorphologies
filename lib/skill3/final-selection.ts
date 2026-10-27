import path from "node:path";
import handoffFile from "@/data/skill3/final-selection.json";
import { solidifiedModuleId } from "./solidified-mesh";

export const FINAL_SELECTION_CONTRACT = "skill3-final-selection-v1" as const;

export type FinalHandoffStatus = "Validated" | "Review";

export type FinalHandoffSelection = {
  category: string;
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  moduleId: string;
  status: FinalHandoffStatus;
};

export type FinalHandoffManifest = {
  contract: typeof FINAL_SELECTION_CONTRACT;
  purpose: string;
  source: "lm-skill3-morphology";
  geometry: "data/experiments/carved-mass-solidified";
  selections: FinalHandoffSelection[];
};

export function finalSelectionPath() {
  return path.join(process.cwd(), "data", "skill3", "final-selection.json");
}

/** The tracked 15-archetype handoff. The JSON is compiled in, so production does not read the file from disk. */
export function readFinalSelection(): FinalHandoffManifest {
  const manifest = handoffFile as FinalHandoffManifest;
  if (manifest.contract !== FINAL_SELECTION_CONTRACT) throw new Error("Skill 3 final selection contract does not match.");
  if (!Array.isArray(manifest.selections) || manifest.selections.length !== 15) {
    throw new Error("Skill 3 final selection must list 15 archetypes.");
  }
  for (const entry of manifest.selections) {
    if (entry.status !== "Validated" && entry.status !== "Review") throw new Error(`${entry.archetypeId} has no handoff status.`);
    const moduleId = solidifiedModuleId(entry.archetypeId, entry.candidateId, entry.continuationId);
    if (entry.moduleId !== moduleId) throw new Error(`${entry.archetypeId} module id does not match its continuation.`);
  }
  return manifest;
}
