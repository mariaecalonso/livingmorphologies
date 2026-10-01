import { readFileSync } from "node:fs";
import { stateChecksum } from "../skill2/handoff";
import { futureContinuationSeed } from "./events";
import { BRANCHED_FUTURE_COUNT, branchSampledFutures } from "./futures";
import { toVerticalViewerField, VIEWER_TRAIL_SIZE } from "./viewer-field";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };
const GENOME = {
  driftX: -0.9081753422591478,
  driftY: -0.2953264004183431,
  uniformRadiusScale: 1.0943419106770307,
  orientation: -0.7853981633974483,
};

const futuresSource = readFileSync(new URL("./futures.ts", import.meta.url), "utf8");
const branchSource = futuresSource.slice(futuresSource.indexOf("export function branchSampledFutures"));
assert(!branchSource.includes("replayZ0("), "live branch replays Z0 a second time");
assert((branchSource.match(/loadValidatedSkill2Handoff\(/g) ?? []).length === 1, "branch loads the candidate more than once");
assert(!branchSource.includes("createSimulation") && !branchSource.includes("startScan"), "branch starts a fresh simulation");
const sampleSource = readFileSync(new URL("./events.ts", import.meta.url), "utf8");
const sampler = sampleSource.slice(sampleSource.indexOf("export function sampleFromParent"), sampleSource.indexOf("export function sampleFutureEvents"));
assert(!sampler.includes("replayZ0(") && !sampler.includes("loadSkill2Handoff("), "sampler replays on its own");
ok("one validated Z0, then clones");

const started = Date.now();
const branched = branchSampledFutures(FIXTURE);
assert(branched.futures.length === BRANCHED_FUTURE_COUNT, `expected ${BRANCHED_FUTURE_COUNT} futures`);
assert(branched.futures.every((future) => future.sampling.z0 === branched.z0), "futures do not share one Z0 object");
assert(branched.futures.every((future) => future.parentChecksum === branched.parentChecksum), "parent checksums differ");
assert(branched.futures.every((future) => future.sampling.startChecksum === branched.parentChecksum), "a future left Z0 before it started");
assert(branched.z0.iteration === 600 && branched.z0.maxIterations === 600 && branched.z0.converged, "Z0 is no longer the closed Skill 2 state");
assert(stateChecksum(branched.z0) === branched.parentChecksum, "original Z0 checksum changed");
ok(`one Z0 shared (${branched.parentChecksum.slice(0, 12)})`);

const seeds = branched.futures.map((future) => future.continuationSeed);
const again = branched.futures.map((future) => futureContinuationSeed(branched.record, future.index));
assert(seeds.every((seed, index) => seed === again[index]), "continuation seeds are not stable");
assert(new Set(seeds).size === seeds.length, "continuation seeds are not distinct");
ok(`seeds ${seeds.join(", ")}`);

assert(JSON.stringify(branched.record.realization.genome) === JSON.stringify(GENOME), "Skill 2 genome changed");
const attractor = branched.z0.attractor;
assert(
  branched.futures.every((future) =>
    future.samples.every((sample) => sample.attractor.x === attractor.x && sample.attractor.y === attractor.y && sample.seed === branched.z0.seed),
  ),
  "attractor or evaluation seed changed",
);
assert(
  branched.futures.every((future) => future.sampling.future.agents.length === branched.z0.agents.length),
  "agent count changed",
);
ok("genome, attractor, and agent count unchanged");

assert(new Set(branched.futures.map((future) => future.endChecksum)).size >= 2, "futures did not diverge");
ok("at least two futures diverged");

for (const future of branched.futures) {
  assert(future.samples.length >= 2, `${future.id} has no continuation sample`);
  assert(future.samples[0].reason === "z0" && future.samples[0].iteration === branched.z0.iteration, `${future.id} sample 0 is not Z0`);
  assert(future.iterations.join(",") === future.samples.map((sample) => sample.iteration).join(","), `${future.id} iteration list mismatch`);
  for (let index = 1; index < future.samples.length; index += 1) {
    assert(future.samples[index].iteration > future.samples[index - 1].iteration, `${future.id} samples are not ordered`);
  }
  const field = toVerticalViewerField(future.sampling, future.id);
  assert(field.lineage.futureId === future.id, `${future.id} viewer id mismatch`);
  assert(field.lineage.candidateId === 39 && field.lineage.z0Iteration === 600, `${future.id} lineage mismatch`);
  assert(field.slices.length === future.samples.length, `${future.id} viewer dropped samples`);
  assert(
    field.slices.every((slice, index) => slice.iteration === future.iterations[index] && slice.trails.length === VIEWER_TRAIL_SIZE * VIEWER_TRAIL_SIZE),
    `${future.id} viewer slices do not match the samples`,
  );
  ok(`${future.id} samples ${future.iterations.join(", ")}`);
}

const sequences = new Set(branched.futures.map((future) => future.iterations.join(",")));
assert(sequences.size >= 1 && branched.futures.every((future) => future.iterations.length > 1), "missing event sequences");
console.log(`verify-futures: all checks passed (${Math.round((Date.now() - started) / 1000)}s, ${sequences.size} distinct sequences)`);
