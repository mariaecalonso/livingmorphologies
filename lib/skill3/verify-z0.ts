import { stateChecksum } from "../skill2/handoff";
import { loadSkill2Handoff, readEvolutionRun } from "./source";
import { cloneSimulationState, continueOpenedClone, openContinuation, replayZ0 } from "./z0";

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

/** Known completed archive member. The library itself takes any handoff request. */
const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };

const started = Date.now();
const run = readEvolutionRun(FIXTURE.archetypeId);
assert(run.archiveIds.includes(FIXTURE.candidateId), "fixture is in the global archive");
assert(run.candidates.some((candidate) => candidate.id === FIXTURE.candidateId && candidate.archived), "fixture candidate is archived");
const outsider = run.candidates.find((candidate) => !run.archiveIds.includes(candidate.id));
assert(outsider != null, "run contains a non-archive candidate");
assert(
  throws(() => loadSkill2Handoff({ archetypeId: FIXTURE.archetypeId, candidateId: outsider.id }), "not in the global Pareto archive"),
  "non-archive candidate rejected",
);
assert(
  throws(() => loadSkill2Handoff({ runKey: "void-field@1", candidateId: FIXTURE.candidateId }), "does not match controller seed"),
  "wrong run key rejected",
);
assert(throws(() => loadSkill2Handoff({ candidateId: FIXTURE.candidateId }), "required"), "missing source rejected");
ok("candidate 39 is a valid archive candidate");

const record = loadSkill2Handoff({ runKey: FIXTURE.runKey, candidateId: FIXTURE.candidateId });
assert(record.identity.archetypeId === FIXTURE.archetypeId, "archetype");
assert(record.identity.candidateId === FIXTURE.candidateId, "candidate id");
assert(record.identity.runKey === FIXTURE.runKey, "run key");
assert(record.realization.recipe.attractorFixed === true, "posed attractor is fixed");
assert(record.z0.iteration === 600, "handoff records iteration 600");

const handoff = replayZ0(record);
const z0 = handoff.selected.simulationState;
assert(z0.iteration === 600, "replay reaches iteration 600");
assert(z0.iteration === record.z0.iteration, "replay iteration matches the record");
assert(stateChecksum(z0) === record.z0.checksum, "replay checksum matches the record");
assert(z0.trails.length === record.realization.trailSize * record.realization.trailSize, "trail buffer carried");
assert(z0.agents.length === record.realization.simulation.agentCount, "agents carried");
assert(z0.seed === record.realization.simulation.seed, "evaluation seed carried");
assert(z0.attractor.x === record.realization.recipe.attractor.x && z0.attractor.y === record.realization.recipe.attractor.y, "posed attractor carried");
assert(JSON.stringify(handoff.selected.source.recipe) === JSON.stringify(record.realization.recipe), "posed recipe carried");

const again = replayZ0(record);
assert(stateChecksum(again.selected.simulationState) === stateChecksum(z0), "second replay matches");
assert(again.selected.simulationState.iteration === z0.iteration, "second replay iteration matches");
ok("replay checksum is deterministic");

const z0Checksum = stateChecksum(z0);
const z0Iteration = z0.iteration;
const z0MaxIterations = z0.maxIterations;
const z0Converged = z0.converged;
const z0Streak = z0.streak;
const z0TrailSample = z0.trails[0];
const clone = cloneSimulationState(z0);
assert(clone !== z0 && clone.trails !== z0.trails && clone.agents !== z0.agents && clone.agents[0] !== z0.agents[0], "clone is a distinct state");
assert(stateChecksum(clone) === z0Checksum, "clone starts identical to Z0");
assert(clone.iteration === z0.iteration && clone.maxIterations === z0.maxIterations && clone.converged === z0.converged, "clone keeps the closed evaluation cap");
assert(clone.attractor.x === z0.attractor.x && clone.attractor.y === z0.attractor.y, "clone keeps the attractor");
ok("cloned state starts identical to Z0");

const closed = cloneSimulationState(z0);
assert(throws(() => continueOpenedClone(closed, handoff, record, 1), "continuation is closed"), "closed clone refuses to step");
openContinuation(clone, 1);
assert(clone.iteration === z0Iteration, "opening does not reset iteration");
assert(clone.maxIterations === z0Iteration + 1 && clone.converged === false && clone.streak === 0, "clone cap reopened");
assert(z0.maxIterations === z0MaxIterations && z0.converged === z0Converged && z0.streak === z0Streak, "opening does not touch Z0");

const beforeAgents = clone.agents.map((agent) => ({ x: agent.x, y: agent.y, heading: agent.heading }));
const continued = continueOpenedClone(clone, handoff, record, 1);
assert(continued === clone, "continuation steps the clone");
assert(continued.iteration >= 601, "continuation advances to iteration 601+");
assert(continued.iteration === z0Iteration + 1, "one opened step adds one iteration");
assert(continued.agents.length === beforeAgents.length, "agent count inherited");
assert(continued.trails.length === z0.trails.length, "trail length inherited");
assert(continued.seed === z0.seed, "seed inherited");
assert(continued.attractor.x === z0.attractor.x && continued.attractor.y === z0.attractor.y, "attractor inherited");

let occupied = 0;
let inheritedOccupied = 0;
let z0Mass = 0;
let continuedMass = 0;
for (let i = 0; i < z0.trails.length; i += 1) {
  z0Mass += z0.trails[i];
  continuedMass += continued.trails[i];
  if (z0.trails[i] > 0) {
    occupied += 1;
    if (continued.trails[i] === z0.trails[i]) inheritedOccupied += 1;
  }
}
const occupiedShare = inheritedOccupied / Math.max(1, occupied);
const massRatio = continuedMass / Math.max(1e-9, z0Mass);
assert(occupied > 1000, "Z0 trail field is occupied");
assert(occupiedShare > 0.7, `occupied trails inherited (${occupiedShare.toFixed(3)})`);
assert(massRatio > 0.5 && massRatio < 1.5, `trail mass inherited (${massRatio.toFixed(3)})`);
let near = 0;
let shift = 0;
for (let i = 0; i < beforeAgents.length; i += 1) {
  const agent = continued.agents[i];
  const previous = beforeAgents[i];
  const distance = Math.hypot(agent.x - previous.x, agent.y - previous.y);
  shift += distance;
  if (distance < 2.5) near += 1;
}
const nearShare = near / beforeAgents.length;
const meanShift = shift / beforeAgents.length;
assert(nearShare > 0.8, `agents continue from their Z0 positions (${nearShare.toFixed(3)})`);
assert(meanShift < 3, `agent shift stays on the inherited population (${meanShift.toFixed(3)})`);
assert(meanShift > 0 || occupiedShare < 1, "the inherited state actually stepped");
ok("trails and agents are inherited rather than regenerated");

assert(z0.iteration === z0Iteration, "Z0 iteration unchanged");
assert(z0.maxIterations === z0MaxIterations && z0.converged === z0Converged && z0.streak === z0Streak, "Z0 cap unchanged");
assert(z0.trails[0] === z0TrailSample, "Z0 trail sample unchanged");
assert(stateChecksum(z0) === z0Checksum, "Z0 checksum unchanged after the clone continues");
ok("original Z0 remains unchanged");

console.log(`verify-z0: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
