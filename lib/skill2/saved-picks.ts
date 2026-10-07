import { readFileSync, writeFileSync } from "node:fs";
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
  return Object.entries(readPickFile()).map(([archetypeId, value]) => ({ archetypeId, ...value }));
}

/** Replaces this archetype's saved drawing. Every other archetype stays. */
export function writeSavedPick(pick: SavedPick) {
  if (!/^[a-z0-9-]+$/.test(pick.archetypeId)) throw new Error("bad archetype");
  if (!Number.isInteger(pick.candidateId) || pick.candidateId < 1) throw new Error("bad candidate");
  const map = readPickFile();
  map[pick.archetypeId] = {
    candidateId: pick.candidateId,
    typologyId: pick.typologyId,
    formal: pick.formal,
    spatial: pick.spatial,
    atmospheric: pick.atmospheric,
  };
  writeFileSync(pickFile(), `${JSON.stringify(map, null, 2)}\n`);
}

function pickFile() {
  return join(process.cwd(), "data", "skill2-picks.json");
}

function readPickFile(): Record<string, Omit<SavedPick, "archetypeId">> {
  try {
    return JSON.parse(readFileSync(pickFile(), "utf8")) as Record<string, Omit<SavedPick, "archetypeId">>;
  } catch {
    return {};
  }
}
