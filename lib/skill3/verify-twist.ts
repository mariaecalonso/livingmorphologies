import { readFileSync } from "node:fs";
import { openingMasks } from "./materialize";
import { branchSampledFutures } from "./futures";
import { DEFAULT_BOUNDARY_FUSION } from "./boundary-fusion";
import {
  DEFAULT_MAX_TWIST_ANGLE,
  modulePivot,
  rotateTrail,
  twistAngle,
} from "./twist";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);
const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };
const F01_ITERATIONS = "600,615,634,649,663";
const F02_ITERATIONS = "600,608,625,641,655";

function trailsEqual(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

function paintHole(size: number, cx: number, cy: number, radius: number) {
  const trails = new Array<number>(size * size).fill(0.6);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) trails[y * size + x] = 0;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) trails[y * size + x] = 0;
    }
  }
  return trails;
}

function openingCentroid(trails: number[], size: number) {
  let peak = 1e-6;
  for (let i = 0; i < trails.length; i += 1) if (trails[i] > peak) peak = trails[i];
  const masks = openingMasks({ z: 0, trails, trailSize: size, peak });
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < masks.opening.length; i += 1) {
    if (!masks.opening[i]) continue;
    count += 1;
    sx += i % size;
    sy += Math.floor(i / size);
  }
  return { count: masks.openingCount, cells: count, x: sx / count, y: sy / count };
}

const pivot = modulePivot(48);
assert(pivot.x === 24 && pivot.y === 24, "module pivot is not the trail center");
assert(twistAngle(600, 600, 64) === 0, "Z0 twist is not 0");
const mid = twistAngle(632, 600, 64);
const end = twistAngle(664, 600, 64);
assert(mid > 0 && mid < end && Math.abs(end - DEFAULT_MAX_TWIST_ANGLE) < 1e-12, "twist does not grow with iteration");
assert(Math.abs(DEFAULT_MAX_TWIST_ANGLE - (2 * Math.PI) / 3) < 1e-12, "default twist is not 120 degrees");
ok("twist is 0° at Z0 and reaches 120° at the horizon");

const source = paintHole(48, 34, 24, 5);
const plain = openingCentroid(source, 48);
const turned = [Math.PI / 6, Math.PI / 3].map((angle) => rotateTrail(source, 48, angle, pivot));
const centroids = turned.map((trails) => openingCentroid(trails, 48));
assert(plain.count === 1 && centroids.every((item) => item.count === 1), "rotation changed the opening count");
const baseAngle = Math.atan2(plain.y - pivot.y, plain.x - pivot.x);
const turnedAngles = centroids.map((item) => Math.atan2(item.y - pivot.y, item.x - pivot.x));
const deltaA = turnedAngles[0] - baseAngle;
const deltaB = turnedAngles[1] - baseAngle;
assert(deltaA > 0.4 && deltaA < 0.7, `30° turn landed at ${deltaA}`);
assert(deltaB > deltaA && deltaB < 1.3, `60° turn landed at ${deltaB}`);
assert(centroids.every((item) => item.x > 2 && item.y > 2 && item.x < 46 && item.y < 46), "rotated opening left the envelope");
const again = rotateTrail(source, 48, Math.PI / 3, pivot);
assert(trailsEqual(turned[1], again), "rotation is not deterministic");
ok("a rigid turn keeps one opening inside the module");

const started = Date.now();
const branched = branchSampledFutures(FIXTURE);
const [f01, f02, f03] = branched.futures;
assert(f01.iterations.join(",") === F01_ITERATIONS, `F01 iterations changed (${f01.iterations.join(",")})`);
assert(f02.iterations.join(",") === F02_ITERATIONS, `F02 iterations changed (${f02.iterations.join(",")})`);
assert(
  DEFAULT_BOUNDARY_FUSION.proximity === 1.8
    && DEFAULT_BOUNDARY_FUSION.relaxationRadius === 2.4
    && DEFAULT_BOUNDARY_FUSION.blendStrength === 1,
  "F02 left the medium preset",
);
assert(f01.parentChecksum === f02.parentChecksum && f02.parentChecksum === f03.parentChecksum, "futures do not share Z0");
assert(trailsEqual(f01.samples[0].trails, f02.samples[0].trails) && trailsEqual(f01.samples[0].trails, f03.samples[0].trails), "Z0 samples differ");
assert(f03.samples[0].iteration === 600, "F03 Z0 iteration changed");
ok("F01, F02, and F03 share one unrotated Z0");

const futuresSource = readFileSync(new URL("./futures.ts", import.meta.url), "utf8");
assert(!futuresSource.includes("twistSample("), "F03 still rotates stored samples after sampling");
assert(futuresSource.includes("applyLiveTwist"), "F03 does not turn the live state");
assert(f03.sampling.future.iteration === 664, `F03 did not finish the horizon (${f03.sampling.future.iteration})`);
assert(Math.abs(twistAngle(f03.sampling.future.iteration, 600, f03.sampling.config.horizon) - DEFAULT_MAX_TWIST_ANGLE) < 1e-12, "F03 did not accumulate the horizon twist");
const margin = 0.18;
const limit = f03.sampling.future.size - margin;
assert(
  f03.sampling.future.agents.every((agent) =>
    Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.heading)
    && agent.x >= margin && agent.y >= margin && agent.x <= limit && agent.y <= limit,
  ),
  "F03 agents left the field",
);
assert(f03.samples.every((sample) => sample.trails.every((value) => Number.isFinite(value))), "F03 trails are not finite");
assert(f03.samples.slice(1).some((sample) => !trailsEqual(sample.trails, f01.samples[0].trails)), "F03 never left Z0");
ok(`F03 live twist reaches ${Math.round((DEFAULT_MAX_TWIST_ANGLE * 180) / Math.PI)}°`);

console.log(`verify-twist: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
