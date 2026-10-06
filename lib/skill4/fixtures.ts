import { readFileSync } from "node:fs";
import path from "node:path";
import { adaptModule } from "./adapt";
import type { Skill4ModuleRecord } from "./contract";

const FIXTURE_DIR = path.join(process.cwd(), "lib", "skill4", "fixtures");

export const PROVISIONAL_MOCK_IDS = ["topographic-ground-field", "linear-gallery"] as const;

export type ProvisionalMockId = (typeof PROVISIONAL_MOCK_IDS)[number];

export function readProvisionalMock(archetypeId: ProvisionalMockId): Skill4ModuleRecord {
  const file = path.join(FIXTURE_DIR, `${archetypeId}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Skill4ModuleRecord;
}

export function loadProvisionalMock(archetypeId: ProvisionalMockId) {
  return adaptModule(readProvisionalMock(archetypeId));
}
