import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SavedPick = {
  archetypeId: string;
  candidateId: number;
  typologyId: string;
  formal: number;
  spatial: number;
  atmospheric: number;
};

export function loadSavedPicks(): SavedPick[] {
  const file = join(process.cwd(), "data", "skill2-picks.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, Omit<SavedPick, "archetypeId">>;
  return Object.entries(raw).map(([archetypeId, value]) => ({ archetypeId, ...value }));
}
