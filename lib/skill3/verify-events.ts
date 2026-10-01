import type { SimulationState } from "../skill1/types";
import { stateChecksum } from "../skill2/handoff";
import { acceptReason, assertEventConfig, DEFAULT_EVENT_CONFIG, measureChange, sampleFutureEvents, type AcceptedSample } from "./events";

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

/** Known completed archive member. Sampling itself takes any Skill 2 handoff request. */
const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };

function blankState(trails: number[], agents: Array<{ x: number; y: number; heading: number }>): SimulationState {
  return {
    size: 4,
    trailSize: 2,
    iteration: 0,
    maxIterations: 1,
    converged: false,
    streak: 0,
    totalDelta: 0,
    seed: 1,
    source: { x: 0, y: 0 },
    attractor: { x: 2, y: 2 },
    attraction: [],
    permeabilityField: [],
    occupancy: [],
    trails,
    flow: [],
    agents: agents.map((agent) => ({ ...agent, speed: 0.2, trailStrength: 1, pathX: [], pathY: [], hold: 0 })),
  };
}

const config = DEFAULT_EVENT_CONFIG;
assertEventConfig(config);
assert(config.minGap === 8 && config.maxGap === 24 && config.deltaThreshold === 0.08, "default gaps and threshold stay explicit");
assert(acceptReason(config.minGap - 1, 1, config) === null, "minimum gap blocks a sample");
assert(acceptReason(config.minGap, config.deltaThreshold, config) === "threshold", "threshold accepts after the minimum gap");
assert(acceptReason(config.minGap, config.deltaThreshold - 0.01, config) === null, "quiet change inside the max gap is skipped");
assert(acceptReason(config.maxGap, 0, config) === "max-gap", "maximum gap accepts a quiet interval");
assert(throws(() => assertEventConfig({ ...config, maxGap: config.minGap - 1 }), "maxGap"), "max gap below the minimum gap is rejected");

const quiet = [1, 0, 0, 0];
const moved = [1, 0.5, 0, 0];
const reference: AcceptedSample = {
  index: 0,
  iteration: 10,
  reason: "z0",
  referenceIteration: null,
  measures: { persistence: 1, migration: 0, reinforcement: 0, connectivityChange: 0, components: 1, delta: 0 },
  trailSize: 2,
  trails: quiet,
  agents: [{ x: 1, y: 1, heading: 0 }],
  attractor: { x: 2, y: 2 },
  seed: 1,
};
const older: AcceptedSample = { ...reference, iteration: 0, trails: [0, 0, 0, 1], agents: [{ x: 0, y: 0, heading: 0 }] };
const live = blankState(moved, [{ x: 1.4, y: 1.2, heading: 0.2 }]);
const againstLast = measureChange(reference, live, { ...config, connectivityResolution: 2 });
const againstOlder = measureChange(older, live, { ...config, connectivityResolution: 2 });
assert(againstLast.delta < againstOlder.delta, "the supplied reference, not an older sample, sets the change");
ok("acceptance rules and reference comparison");

const started = Date.now();
const result = sampleFutureEvents({ runKey: FIXTURE.runKey, candidateId: FIXTURE.candidateId }, config);
const { record, z0, future, samples, startChecksum } = result;
assert(samples[0].reason === "z0" && samples[0].index === 0, "Z0 is sample 0");
assert(samples[0].iteration === z0.iteration && samples[0].iteration === 600, "sample 0 is the evaluated iteration");
assert(samples[0].referenceIteration === null && samples[0].measures.delta === 0, "sample 0 has no prior reference");
assert(samples[0].trails.length === z0.trails.length && samples[0].agents.length === z0.agents.length, "sample 0 stores trails and agents");
assert(samples[0].trails !== z0.trails, "sample 0 keeps its own trail copy");
ok("Z0 is sample 0");

assert(startChecksum === record.z0.checksum && startChecksum === stateChecksum(z0), "continuation starts from the replayed Z0");
assert(future.iteration === z0.iteration + config.horizon, "continuation runs forward from Z0");
assert(future.seed === z0.seed && future.attractor.x === record.realization.recipe.attractor.x, "identity and pose carried");
ok("continuation runs forward from Z0");

assert(samples.length > 1, "the horizon produces samples after Z0");
assert(samples.length < config.horizon + 1, "not every iteration becomes a sample");
let gapGreaterThanOne = false;
for (let i = 1; i < samples.length; i += 1) {
  const sample = samples[i];
  const previous = samples[i - 1];
  assert(sample.iteration > previous.iteration, "accepted samples have increasing iterations");
  assert(sample.referenceIteration === previous.iteration, "the last accepted sample is the reference");
  if (sample.iteration - previous.iteration > 1) gapGreaterThanOne = true;
  const gap = sample.iteration - previous.iteration;
  if (sample.reason === "max-gap") assert(gap >= config.maxGap, "max-gap sample waited for the maximum gap");
  if (sample.reason === "threshold") {
    assert(gap >= config.minGap && gap < config.maxGap, "threshold sample sits inside the gap window");
    assert(sample.measures.delta >= config.deltaThreshold, "threshold sample crossed Δ");
  }
  assert(sample.reason === "threshold" || sample.reason === "max-gap", "later samples name a sampling rule");
  assert(sample.trails.length === future.trails.length && sample.agents.length === future.agents.length, "sample stores trail and agent state");
}
assert(gapGreaterThanOne, "samples skip iterations between references");
assert(samples.some((sample) => sample.reason === "threshold" || sample.reason === "max-gap"), "a sample is caused by threshold or max-gap logic");
ok("event rules accept a sparse increasing sequence");

assert(stateChecksum(z0) === startChecksum, "Z0 checksum unchanged");
assert(z0.iteration === 600 && z0.converged === true && z0.maxIterations === 600, "Z0 evaluation cap unchanged");
ok("original Z0 remains unchanged");

console.log(
  `verify-events: all checks passed (${Math.round((Date.now() - started) / 1000)}s, ${samples.length} samples, iterations ${samples.map((sample) => sample.iteration).join(", ")})`,
);
