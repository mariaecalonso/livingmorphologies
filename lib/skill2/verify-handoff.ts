import { toHandoff, translateArchetype } from "../skill1/translate";
import { createRun, type Candidate } from "./evolution";
import { EVALUATION_SEED, evaluateGenome } from "./evolution-evaluate";
import { CANONICAL_GENOME } from "./genome";
import { buildSkill2HandoffRecord, replaySkill2Handoff, stateChecksum, type Skill2HandoffRecord } from "./handoff";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);
const throws = (fn: () => unknown, text: string) => {
  try {
    fn();
  } catch (error) {
    return String(error).includes(text);
  }
  return false;
};

const started = Date.now();
const archetypeId = "void-field";
const run = createRun(archetypeId, 20260928);
const evaluated = evaluateGenome(archetypeId, CANONICAL_GENOME);
const candidate: Candidate = {
  id: 1,
  archetypeId,
  typologyId: run.typologyId,
  generation: 1,
  parentId: null,
  genome: { ...CANONICAL_GENOME },
  evaluationSeed: evaluated.evaluationSeed,
  feasible: evaluated.feasible,
  objectives: evaluated.objectives,
  criterionMatch: evaluated.criterionMatch,
  observed: evaluated.observed,
  flags: ["canonical"],
  rank: 1,
  crowding: Infinity,
  archived: true,
  preview: { file: "previews-g01.bin", index: 0 },
};
const outsider: Candidate = { ...candidate, id: 2, archived: false, genome: { ...CANONICAL_GENOME, driftX: 0.5 } };
run.candidates.push(candidate, outsider);
run.archiveIds = [1];
run.completedGenerations = 1;
const stored = JSON.parse(JSON.stringify(run));

assert(throws(() => buildSkill2HandoffRecord(stored, 2), "not in the global Pareto archive"), "only archived candidates can be handed off");
assert(throws(() => buildSkill2HandoffRecord(stored, 99), "is not in"), "unknown candidate rejected");
ok("selection limited to the global Pareto archive");

const record = JSON.parse(JSON.stringify(buildSkill2HandoffRecord(stored, 1, { note: "verification" }))) as Skill2HandoffRecord;
assert(record.skill === 2 && record.contractVersion === 1, "contract version");
assert(record.realization.simulation.seed === EVALUATION_SEED, "fixed seed in record");
assert(record.realization.trailSize === 1280 && record.realization.fieldSize === 20, "standard field and trail size");
assert(JSON.stringify(record.source) === JSON.stringify(toHandoff(translateArchetype(archetypeId))), "source is the unposed Skill 1 handoff");
assert(record.realization.recipe.attractorFixed === true, "posed recipe has a fixed attractor");
assert(record.identity.runKey === "void-field@20260928" && record.identity.candidateId === 1, "identity");
ok("record built, serializable, standard protocol");

const handoff = replaySkill2Handoff(record);
const state = handoff.selected.simulationState;
assert(state.iteration === 600 && state.trailSize === 1280 && state.seed === EVALUATION_SEED, "Z0 state protocol");
assert(stateChecksum(state) === record.z0.checksum, "Z0 checksum");
assert(state.agents.length === record.realization.simulation.agentCount, "agents carried in Z0");
assert(handoff.selected.section.field.trails.length === 1280 * 1280, "section field snapshot");
assert(handoff.selected.section.interpretation != null, "section interpretation");
assert(JSON.stringify(handoff.selected.source.recipe) === JSON.stringify(record.realization.recipe), "runtime source is the simulated pose");
assert(JSON.stringify(handoff.selected.source.params) === JSON.stringify(record.source.params), "biology unchanged");
assert(handoff.selected.evaluation.feasible === record.evaluation.feasible, "evaluation carried");
ok("replay rebuilds the exact evaluated Z0 state as Skill2Handoff");

const tamperedGenome = { ...record, realization: { ...record.realization, genome: { ...record.realization.genome, driftX: 0.3 } } };
assert(throws(() => replaySkill2Handoff(tamperedGenome), "recipe does not match"), "genome/recipe mismatch rejected");
assert(throws(() => replaySkill2Handoff({ ...record, contractVersion: 2 as 1 }), "unsupported"), "unknown contract rejected");
const tamperedState = { ...record, z0: { ...record.z0, checksum: "00000000" } };
assert(throws(() => replaySkill2Handoff(tamperedState), "Z0 checksum"), "checksum mismatch rejected");
ok("tampered records rejected");

console.log(`verify-handoff: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
