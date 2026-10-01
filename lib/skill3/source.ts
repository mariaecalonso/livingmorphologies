import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvolutionRun } from "../skill2/evolution";
import { evolutionDir } from "../skill2/evolution-index";
import { buildSkill2HandoffRecord, openValidatedHandoff, type Skill2HandoffRecord } from "../skill2/handoff";
import type { Skill2Handoff } from "../skill2/types";

/**
 * One archived Skill 2 candidate. `runKey` is `${archetypeId}@${controllerSeed}`.
 * Either the archetype id or the run key selects the stored run.
 */
export type Skill3SourceRequest = {
  archetypeId?: string;
  runKey?: string;
  candidateId: number;
};

const ARCHETYPE_ID = /^[a-z0-9-]+$/;

export function readEvolutionRun(archetypeId: string): EvolutionRun {
  if (!ARCHETYPE_ID.test(archetypeId)) throw new Error(`invalid archetype id ${archetypeId}`);
  const file = join(evolutionDir(), archetypeId, "run.json");
  if (!existsSync(file)) throw new Error(`no Skill 2 run for ${archetypeId}`);
  const run = JSON.parse(readFileSync(file, "utf8")) as EvolutionRun;
  if (run.archetypeId !== archetypeId) {
    throw new Error(`run archetype ${run.archetypeId} does not match ${archetypeId}`);
  }
  return run;
}

export function parseRunKey(runKey: string) {
  const at = runKey.lastIndexOf("@");
  if (at <= 0 || at === runKey.length - 1) throw new Error(`invalid run key ${runKey}`);
  const archetypeId = runKey.slice(0, at);
  const controllerSeed = Number(runKey.slice(at + 1));
  if (!ARCHETYPE_ID.test(archetypeId) || !Number.isInteger(controllerSeed)) {
    throw new Error(`invalid run key ${runKey}`);
  }
  return { archetypeId, controllerSeed };
}

/** Loads an archived candidate and builds its Skill 2 handoff record. */
export function loadSkill2Handoff(request: Skill3SourceRequest): Skill2HandoffRecord {
  return buildSkill2HandoffRecord(resolveEvolutionRun(request), request.candidateId);
}

/**
 * Live Skill 3 load. One `simulateGenome` pass. The handoff state is that
 * pass, after the archive checks and the replay mismatch checks.
 */
export function loadValidatedSkill2Handoff(request: Skill3SourceRequest): { record: Skill2HandoffRecord; handoff: Skill2Handoff } {
  return openValidatedHandoff(resolveEvolutionRun(request), request.candidateId);
}

function resolveEvolutionRun(request: Skill3SourceRequest): EvolutionRun {
  const fromKey = request.runKey ? parseRunKey(request.runKey) : null;
  const archetypeId = request.archetypeId ?? fromKey?.archetypeId;
  if (!archetypeId) throw new Error("archetype id or run key is required");
  if (fromKey && request.archetypeId && request.archetypeId !== fromKey.archetypeId) {
    throw new Error(`archetype ${request.archetypeId} does not match run key ${request.runKey}`);
  }
  const run = readEvolutionRun(archetypeId);
  if (fromKey && run.controllerSeed !== fromKey.controllerSeed) {
    throw new Error(`run key ${request.runKey} does not match controller seed ${run.controllerSeed}`);
  }
  return run;
}
