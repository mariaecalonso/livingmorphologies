import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateChecksum } from "../skill2/handoff";
import { INITIAL_FUTURE_HORIZON, runSingleFuture } from "./futures";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

/** Known completed archive member. The runner takes any Skill 2 handoff request. */
const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };
const HORIZON = INITIAL_FUTURE_HORIZON;

const started = Date.now();
assert(HORIZON >= 50 && HORIZON <= 100, "initial horizon is inside 50–100");
const source = readFileSync(join(process.cwd(), "lib", "skill3", "futures.ts"), "utf8");
assert(!source.includes("createSimulation") && !source.includes("startScan"), "future runner does not start a fresh simulation");
ok("no fresh createSimulation / startScan path is used");

const result = runSingleFuture({ runKey: FIXTURE.runKey, candidateId: FIXTURE.candidateId }, HORIZON);
const { record, handoff, z0, future, startChecksum } = result;
assert(record.identity.archetypeId === FIXTURE.archetypeId, "archetype identity");
assert(record.identity.candidateId === FIXTURE.candidateId, "candidate identity");
assert(record.identity.runKey === FIXTURE.runKey, "run key identity");
assert(record.realization.recipe.attractorFixed === true, "posed recipe");
assert(z0.iteration === 600 && record.z0.iteration === 600, "Z0 is the evaluated iteration");
assert(startChecksum === record.z0.checksum, "future starts from the handoff checksum");
assert(startChecksum === stateChecksum(z0), "future starts from the exact Z0 state");
assert(future !== z0 && future.trails !== z0.trails && future.agents !== z0.agents, "one clone is distinct from Z0");
ok("the future starts from the exact Z0 checksum/state");

assert(result.horizon === HORIZON, "configured horizon");
assert(future.iteration === z0.iteration + HORIZON, "future advances through the full horizon");
assert(future.iteration === 664, "fixture horizon lands on iteration 664");
ok("it advances through the full configured horizon");

assert(stateChecksum(z0) === startChecksum, "Z0 checksum unchanged");
assert(z0.iteration === record.z0.iteration, "Z0 iteration unchanged");
assert(z0.maxIterations === record.z0.iteration && z0.converged === true, "Z0 evaluation cap unchanged");
ok("Z0 itself remains unchanged");

assert(stateChecksum(future) !== startChecksum, "future checksum diverges");
let shift = 0;
for (let i = 0; i < z0.agents.length; i += 1) {
  shift += Math.hypot(future.agents[i].x - z0.agents[i].x, future.agents[i].y - z0.agents[i].y);
}
const meanShift = shift / Math.max(1, z0.agents.length);
assert(meanShift > 0.05, `agents move during the horizon (${meanShift.toFixed(3)})`);
ok("the future state changes meaningfully from Z0");

assert(future.agents.length === z0.agents.length && future.agents.length === record.realization.simulation.agentCount, "agent count inherited");
assert(future.trails.length === z0.trails.length, "trail length inherited");
assert(future.seed === z0.seed && future.seed === record.realization.simulation.seed, "seed inherited");
assert(future.attractor.x === z0.attractor.x && future.attractor.y === z0.attractor.y, "attractor inherited");
assert(
  future.attractor.x === record.realization.recipe.attractor.x && future.attractor.y === record.realization.recipe.attractor.y,
  "posed attractor preserved",
);
assert(JSON.stringify(handoff.selected.source.recipe) === JSON.stringify(record.realization.recipe), "posed recipe preserved");
assert(future.iteration !== HORIZON, "continuation is not a simulation that started at iteration 0");

let occupied = 0;
let stillOccupied = 0;
let z0Mass = 0;
let futureMass = 0;
for (let i = 0; i < z0.trails.length; i += 1) {
  z0Mass += z0.trails[i];
  futureMass += future.trails[i];
  if (z0.trails[i] > 0) {
    occupied += 1;
    if (future.trails[i] > 0) stillOccupied += 1;
  }
}
const occupiedShare = stillOccupied / Math.max(1, occupied);
const massRatio = futureMass / Math.max(1e-9, z0Mass);
assert(occupied > 1000, "Z0 trail field is occupied");
assert(occupiedShare > 0.5, `inherited trails remain occupied (${occupiedShare.toFixed(3)})`);
assert(massRatio > 0.5 && massRatio < 4, `trail mass stays on the inherited field (${massRatio.toFixed(3)})`);
ok("trails and agents continue from inherited state rather than being regenerated");

console.log(`verify-future: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
