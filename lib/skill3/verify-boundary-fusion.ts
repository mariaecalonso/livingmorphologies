import { stateChecksum } from "../skill2/handoff";
import {
  assertBoundaryFusionConfig,
  circularOpenings,
  DEFAULT_BOUNDARY_FUSION,
  fuseOpeningBoundaries,
  openingGap,
  type CircularOpening,
} from "./boundary-fusion";
import { sampleFromParent } from "./events";
import { branchSampledFutures } from "./futures";
import { toVerticalViewerField } from "./viewer-field";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);
const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };
const F01_ITERATIONS = "600,615,634,649,663";

function trailsEqual(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

function sameEmptyComponent(
  trails: readonly number[],
  trailSize: number,
  fieldSize: number,
  from: CircularOpening,
  to: CircularOpening,
) {
  const epsilon = 0.003;
  const scale = trailSize / fieldSize;
  const cell = (opening: CircularOpening) => {
    const x = Math.min(trailSize - 1, Math.max(0, Math.round(opening.x * scale)));
    const y = Math.min(trailSize - 1, Math.max(0, Math.round(opening.y * scale)));
    return y * trailSize + x;
  };
  const start = cell(from);
  const goal = cell(to);
  assert(trails[start] <= epsilon && trails[goal] <= epsilon, "an opening center is filled");
  const seen = new Uint8Array(trails.length);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const index = stack.pop() as number;
    if (index === goal) return true;
    const x = index % trailSize;
    const y = Math.floor(index / trailSize);
    if (x > 0) visit(index - 1);
    if (x + 1 < trailSize) visit(index + 1);
    if (y > 0) visit(index - trailSize);
    if (y + 1 < trailSize) visit(index + trailSize);
  }
  return false;

  function visit(index: number) {
    if (seen[index] || trails[index] > epsilon) return;
    seen[index] = 1;
    stack.push(index);
  }
}

function syntheticField() {
  const trailSize = 64;
  const fieldSize = 16;
  const closeA: CircularOpening = { x: 5, y: 8, radius: 1.2 };
  const closeB: CircularOpening = { x: 8, y: 8, radius: 1.2 };
  const farA: CircularOpening = { x: 4, y: 2, radius: 1 };
  const farB: CircularOpening = { x: 13, y: 2, radius: 1 };
  const trails = new Array<number>(trailSize * trailSize).fill(0.9);
  const scale = trailSize / fieldSize;
  for (const opening of [closeA, closeB, farA, farB]) {
    for (let y = 0; y < trailSize; y += 1) {
      for (let x = 0; x < trailSize; x += 1) {
        if (Math.hypot(x / scale - opening.x, y / scale - opening.y) < opening.radius) trails[y * trailSize + x] = 0;
      }
    }
  }
  return { trails, trailSize, fieldSize, closeA, closeB, farA, farB };
}

assertBoundaryFusionConfig(DEFAULT_BOUNDARY_FUSION);
assert(
  DEFAULT_BOUNDARY_FUSION.proximity === 1.8
    && DEFAULT_BOUNDARY_FUSION.relaxationRadius === 2.4
    && DEFAULT_BOUNDARY_FUSION.blendStrength === 1,
  "F02 default is not the medium preset",
);
const synthetic = syntheticField();
const before = synthetic.trails.slice();
assert(openingGap(synthetic.closeA, synthetic.closeB) <= DEFAULT_BOUNDARY_FUSION.proximity, "close pair is outside the proximity threshold");
assert(openingGap(synthetic.farA, synthetic.farB) > DEFAULT_BOUNDARY_FUSION.proximity, "distant pair is inside the proximity threshold");
const distantOnly = fuseOpeningBoundaries(synthetic.trails, synthetic.trailSize, synthetic.fieldSize, [synthetic.farA, synthetic.farB]);
assert(distantOnly.pairsFused === 0 && distantOnly.cellsRelaxed === 0, "distant openings were edited");
assert(trailsEqual(before, synthetic.trails), "distant fusion changed the field");
ok("distant openings stay separate");

for (let pass = 0; pass < 8; pass += 1) {
  fuseOpeningBoundaries(synthetic.trails, synthetic.trailSize, synthetic.fieldSize, [synthetic.closeA, synthetic.closeB, synthetic.farA, synthetic.farB]);
}
assert(sameEmptyComponent(synthetic.trails, synthetic.trailSize, synthetic.fieldSize, synthetic.closeA, synthetic.closeB), "close openings did not fuse");
assert(!sameEmptyComponent(synthetic.trails, synthetic.trailSize, synthetic.fieldSize, synthetic.farA, synthetic.farB), "distant openings fused");
let changed = 0;
for (let i = 0; i < before.length; i += 1) if (before[i] !== synthetic.trails[i]) changed += 1;
assert(changed > 0 && changed < before.length * 0.2, `fusion edited ${changed} cells`);
assert(synthetic.trails[0] === 0.9, "a far cell was blurred");
ok(`close openings fused (${changed} cells relaxed)`);

const started = Date.now();
const branched = branchSampledFutures(FIXTURE);
const f01 = branched.futures[0];
const f02 = branched.futures[1];
assert(f01.id === "F01" && f02.id === "F02", "future order changed");
assert(f01.iterations.join(",") === F01_ITERATIONS, `F01 iterations changed (${f01.iterations.join(",")})`);
assert(f01.parentChecksum === f02.parentChecksum && f01.parentChecksum === branched.parentChecksum, "F01 and F02 do not share Z0");
assert(trailsEqual(f01.samples[0].trails, f02.samples[0].trails), "Z0 samples differ");
assert(stateChecksum(branched.z0) === branched.parentChecksum, "original Z0 changed");
assert(branched.z0.iteration === 600 && branched.z0.converged && branched.z0.maxIterations === 600, "Z0 is no longer closed");
ok("F01 unchanged and both futures share the closed Z0");

const openings = circularOpenings(branched.handoff.selected.source.recipe.attractors ?? []);
const gaps = openings.flatMap((opening, index) => openings.slice(index + 1).map((other) => openingGap(opening, other)));
assert(gaps.some((gap) => gap <= DEFAULT_BOUNDARY_FUSION.proximity), "the fixture has no close opening pair");
assert(gaps.some((gap) => gap > DEFAULT_BOUNDARY_FUSION.proximity), "the fixture has no distant opening pair");
ok(`opening gaps ${gaps.map((gap) => gap.toFixed(2)).join(", ")}`);

const plainF01 = sampleFromParent(branched.z0, branched.handoff, branched.record, f01.continuationSeed);
assert(plainF01.samples.map((sample) => sample.iteration).join(",") === f01.iterations.join(","), "baseline F01 diverged");
assert(stateChecksum(plainF01.future) === f01.endChecksum, "baseline F01 end state diverged");
const plainF02 = sampleFromParent(branched.z0, branched.handoff, branched.record, f02.continuationSeed);
assert(plainF02.samples[0].iteration === f02.samples[0].iteration, "F02 left Z0 early");
assert(stateChecksum(plainF02.future) !== f02.endChecksum, "fusion did not change F02");
assert(!trailsEqual(f02.samples[f02.samples.length - 1].trails, f01.samples[f01.samples.length - 1].trails), "F02 samples match F01");
assert(stateChecksum(branched.z0) === branched.parentChecksum, "extra continuations changed Z0");
ok("F02 differs from the same seed only after Z0");

const viewA = toVerticalViewerField(f01.sampling, "F01");
const viewB = toVerticalViewerField(f02.sampling, "F02");
assert(viewA.lineage.z0Iteration === 600 && viewB.lineage.z0Iteration === 600, "viewer lost Z0");
assert(viewA.slices[0].iteration === viewB.slices[0].iteration, "viewer Z0 iterations differ");
const later = viewB.slices[viewB.slices.length - 1];
const matched = viewA.slices.find((slice) => slice.iteration === later.iteration) ?? viewA.slices[viewA.slices.length - 1];
assert(!trailsEqual(later.trails, matched.trails), "viewer fields match");
ok(`viewer F02 iterations ${f02.iterations.join(", ")}`);

console.log(`verify-boundary-fusion: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
