import { readFileSync } from "node:fs";
import {
  loadNaturalContinuations,
  NATURAL_CONTINUATION_COUNT,
  naturalContinuationId,
  naturalContinuationSeed,
  runNaturalContinuations,
} from "./continuations";
import { buildNetworkVolume } from "./network-morphology";
import type { VerticalViewerField } from "./viewer-field";

/**
 * Temporary development fixture. The generator itself takes any Skill 2 handoff request.
 * This candidate is not part of the Skill 3 architecture.
 */
const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

function fieldDigest(field: VerticalViewerField) {
  let hash = 0x811c9dc5;
  for (const slice of field.slices) {
    hash = Math.imul(hash ^ slice.iteration, 0x01000193) >>> 0;
    for (let i = 0; i < slice.trails.length; i += 1) {
      hash = Math.imul(hash ^ Math.round(slice.trails[i] * 1e6), 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

const generatorSource = readFileSync(new URL("./continuations.ts", import.meta.url), "utf8");
const futuresSource = readFileSync(new URL("./futures.ts", import.meta.url), "utf8");
assert(!generatorSource.includes("fuseOpeningBoundaries"), "default path applies Boundary Fusion");
assert(!generatorSource.includes("applyLiveTwist"), "default path applies Live Twist");
assert(!generatorSource.includes("applyLiveScale"), "default path applies Adaptive Scale");
assert(!generatorSource.includes("branchSampledFutures"), "default path still branches the experimental futures");
assert(!generatorSource.includes("buildNetworkVolume") && !generatorSource.includes("materializeOpenings"), "default path materializes meshes");
assert(generatorSource.includes("sampleFromParent"), "default path left the F01 sampler");
assert(futuresSource.includes("fuseOpeningBoundaries"), "Boundary Fusion implementation was removed");
assert(futuresSource.includes("applyLiveTwist"), "Live Twist implementation was removed");
assert(futuresSource.includes("applyLiveScale"), "Adaptive Scale implementation was removed");
ok("F02, F03, and F04 stay implemented and off the default path");

const started = Date.now();
const first = loadNaturalContinuations(FIXTURE);
const ids = first.continuations.map((continuation) => continuation.id);
assert(first.continuations.length === NATURAL_CONTINUATION_COUNT, `expected ${NATURAL_CONTINUATION_COUNT} continuations`);
assert(ids.join(",") === Array.from({ length: 24 }, (_, index) => naturalContinuationId(index + 1)).join(","), `ids ${ids.join(",")}`);
assert(new Set(first.continuations.map((continuation) => continuation.parentChecksum)).size === 1, "branches do not share one Z0 checksum");
assert(first.continuations.every((continuation) => continuation.parentChecksum === first.parentChecksum), "branch checksum drifted from the set");
assert(first.continuations.every((continuation) => continuation.z0Iteration === first.z0Iteration), "Z0 iteration differs across branches");
assert(first.rules.transform === "none" && first.rules.morphology === "network", "rules are not the shared natural continuation");
assert(first.rules.envelope.sizeX === 20 && first.rules.envelope.sizeY === 20 && first.rules.envelope.sizeZ === 20, "envelope is not 20×20×20");
assert(
  first.continuations.every(
    (continuation) =>
      continuation.typologyId === first.typologyId &&
      continuation.archetypeId === first.archetypeId &&
      continuation.candidateId === first.candidateId &&
      continuation.runKey === first.runKey,
  ),
  "handoff identity differs across branches",
);
ok(`Z0 ${first.z0Iteration} checksum ${first.parentChecksum} shared by N01–N24`);

const seeds = first.continuations.map((continuation) => continuation.continuationSeed);
assert(new Set(seeds).size === seeds.length, "continuation seeds are not distinct");
assert(
  seeds.every((seed, index) => seed === naturalContinuationSeed(first, index + 1)),
  "seeds do not match archetype + candidate id + branch index",
);
ok("24 distinct deterministic seeds");

const z0Plate = first.continuations[0].field.slices[0];
assert(z0Plate.iteration === first.z0Iteration, "first plate is not Z0");
for (const continuation of first.continuations) {
  assert(continuation.sampleCount >= 2, `${continuation.id} did not sample past Z0`);
  assert(continuation.events[0].reason === "z0" && continuation.events[0].iteration === first.z0Iteration, `${continuation.id} sample 0 is not Z0`);
  assert(continuation.eventCount === continuation.events.length - 1, `${continuation.id} event count mismatch`);
  assert(continuation.sampleCount === continuation.events.length, `${continuation.id} sample count mismatch`);
  assert(continuation.acceptedIterations.join(",") === continuation.events.map((event) => event.iteration).join(","), `${continuation.id} iterations mismatch`);
  for (let index = 1; index < continuation.events.length; index += 1) {
    const event = continuation.events[index];
    assert(event.iteration > continuation.events[index - 1].iteration, `${continuation.id} samples are not ordered`);
    assert(event.reason === "threshold" || event.reason === "max-gap", `${continuation.id} has an unknown event reason`);
    assert(Number.isFinite(event.delta), `${continuation.id} delta is not finite`);
  }
  assert(continuation.field.lineage.futureId === continuation.id, `${continuation.id} viewer id mismatch`);
  assert(continuation.field.slices.length === continuation.sampleCount, `${continuation.id} viewer dropped samples`);
  const plate = continuation.field.slices[0];
  assert(plate.trails.length === z0Plate.trails.length && plate.trails.every((value, index) => value === z0Plate.trails[index]), `${continuation.id} Z0 plate differs`);
}
ok("event sampling kept Z0 plus later reasons on every branch");

const digests = first.continuations.map((continuation) => fieldDigest(continuation.field));
assert(new Set(digests).size >= 2, "continuations did not produce different outcomes");
ok(`${new Set(digests).size} distinct natural outcomes`);

const volume = buildNetworkVolume(first.continuations[0].field.slices);
assert(volume.stats.acceptedSamples === first.continuations[0].sampleCount, "N01 morphology did not use the accepted sequence");
assert(volume.stats.occupancy > 0, "N01 network volume is empty");
ok(`N01 network volume occupancy ${volume.stats.occupancy.toFixed(3)} (one mesh source, not 24)`);

const again = runNaturalContinuations(FIXTURE);
assert(again.parentChecksum === first.parentChecksum && again.z0Iteration === first.z0Iteration, "rerun Z0 changed");
assert(JSON.stringify(again.slime) === JSON.stringify(first.slime), "rerun slime changed");
assert(JSON.stringify(again.rules) === JSON.stringify(first.rules), "rerun rules changed");
for (let index = 0; index < first.continuations.length; index += 1) {
  const left = first.continuations[index];
  const right = again.continuations[index];
  assert(left.id === right.id && left.continuationSeed === right.continuationSeed, `${left.id} seed changed on rerun`);
  assert(JSON.stringify(left.events) === JSON.stringify(right.events), `${left.id} events changed on rerun`);
  assert(fieldDigest(left.field) === fieldDigest(right.field), `${left.id} plates changed on rerun`);
}
ok("rerun reproduced N01–N24");

const cachedAgain = loadNaturalContinuations(FIXTURE);
assert(cachedAgain === first, "loader did not reuse the cached bundle");
ok("page loader caches the bundle");

console.log(`verify-continuations: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
