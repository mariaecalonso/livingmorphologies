import { readFileSync } from "node:fs";
import { findTypology } from "../catalog";
import { openingMasks } from "./materialize";
import { branchSampledFutures } from "./futures";
import { DEFAULT_BOUNDARY_FUSION } from "./boundary-fusion";
import {
  deriveAdaptiveScale,
  expansionLimit,
  sampleScale,
  scaleTrail,
} from "./adaptive-scale";
import type { Rating, RatingsMap, TypologyId } from "../types";

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

function ratings(partial: Record<string, Rating>, typology: TypologyId): RatingsMap {
  const base: RatingsMap = {};
  for (const archetype of findTypology(typology).archetypes) {
    for (const key of Object.keys(archetype.ratings)) base[key] = 1;
    break;
  }
  return { ...base, ...partial };
}

function openingStats(trails: number[], size: number) {
  let peak = 1e-6;
  for (let i = 0; i < trails.length; i += 1) if (trails[i] > peak) peak = trails[i];
  const masks = openingMasks({ z: 0, trails, trailSize: size, peak });
  let cells = 0;
  let sx = 0;
  let sy = 0;
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < masks.opening.length; i += 1) {
    if (!masks.opening[i]) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    cells += 1;
    sx += x;
    sy += y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { count: masks.openingCount, cells, minX, minY, maxX, maxY };
}

function paintField(size: number, hole: number) {
  const trails = new Array<number>(size * size).fill(0);
  const inset = 8;
  for (let y = inset; y < size - inset; y += 1) {
    for (let x = inset; x < size - inset; x += 1) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      trails[y * size + x] = dx * dx + dy * dy <= hole * hole ? 0 : 0.6;
    }
  }
  return trails;
}

function contentExtent(trails: readonly number[], size: number) {
  let maxDx = 0;
  let maxDy = 0;
  const pivot = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (trails[y * size + x] <= 0.003) continue;
      maxDx = Math.max(maxDx, Math.abs(x - pivot));
      maxDy = Math.max(maxDy, Math.abs(y - pivot));
    }
  }
  return Math.max(maxDx, maxDy);
}

const materializeSource = readFileSync(new URL("./materialize.ts", import.meta.url), "utf8");
const meshSource = readFileSync(new URL("../scan/isomesh.ts", import.meta.url), "utf8");
assert(!materializeSource.includes("scaleTrail") && !materializeSource.includes("adaptive-scale"), "materialization scales the field");
assert(!meshSource.includes("scaleTrail") && !meshSource.includes("finalScale"), "isomesh scales the finished mesh");
ok("scale is not applied inside materialization or the mesh extractor");

const expansion = deriveAdaptiveScale("gathering", ratings({
  openness: 2,
  immersive: 0,
  "circulation-integration": 2,
  "spatial-permanence": 2,
  "social-proximity": 0,
  proportionality: 2,
}, "gathering"));
const contraction = deriveAdaptiveScale("gathering", ratings({
  openness: 0,
  immersive: 2,
  "circulation-integration": 0,
  "spatial-permanence": 0,
  "social-proximity": 2,
  proportionality: 2,
}, "gathering"));
const neutral = deriveAdaptiveScale("gathering", ratings({}, "gathering"));
assert(expansion.scaleDirection === "expansion" && Math.abs(expansion.finalScale - 1.25) < 1e-9, `expansion plan ${expansion.finalScale}`);
assert(contraction.scaleDirection === "contraction" && Math.abs(contraction.finalScale - 0.75) < 1e-9, `contraction plan ${contraction.finalScale}`);
assert(neutral.scaleDirection === "neutral" && neutral.finalScale === 1 && neutral.scaleStrength === 0, "medium ratings are not neutral");
assert(JSON.stringify(expansion) === JSON.stringify(deriveAdaptiveScale("gathering", ratings({
  openness: 2,
  immersive: 0,
  "circulation-integration": 2,
  "spatial-permanence": 2,
  "social-proximity": 0,
  proportionality: 2,
}, "gathering"))), "scale plan is not deterministic");
const compressed = findTypology("lobby").archetypes.find((item) => item.id === "compressed-sequential");
assert(Boolean(compressed), "compressed-sequential is missing");
const compressedPlan = deriveAdaptiveScale("lobby", compressed!.ratings);
assert(compressedPlan.scaleDirection === "contraction" && compressedPlan.finalScale < 1, `catalog contraction failed (${compressedPlan.finalScale})`);
ok(`catalog Compressed Sequential contracts to ${compressedPlan.finalScale.toFixed(3)}; a full expansion reaches ${expansion.finalScale}`);

const scales = [600, 616, 632, 648, 664].map((iteration) => sampleScale(iteration, 600, 64, expansion.finalScale));
assert(scales[0] === 1, "Z0 scale is not 1");
for (let index = 1; index < scales.length; index += 1) assert(scales[index] > scales[index - 1], "scale does not increase toward the target");
assert(Math.abs(scales[scales.length - 1] - expansion.finalScale) < 1e-12, "horizon does not reach finalScale");
ok("scale moves from 1 toward the archetype target");

const source = paintField(48, 5);
const plain = openingStats(source, 48);
const grown = scaleTrail(source, 48, 1.15);
const shrunk = scaleTrail(source, 48, 0.85);
const grownStats = openingStats(grown, 48);
const shrunkStats = openingStats(shrunk, 48);
function interiorHole(trails: number[], size: number) {
  let cells = 0;
  const pivot = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (Math.hypot(x - pivot, y - pivot) > 12) continue;
      if (trails[y * size + x] <= 0.02) cells += 1;
    }
  }
  return cells;
}
const plainHole = interiorHole(source, 48);
const grownHole = interiorHole(grown, 48);
const shrunkHole = interiorHole(shrunk, 48);
assert(plain.count === 1 && grownStats.count === 1 && shrunkStats.count === 1, "scale changed the opening count");
assert(grownHole > plainHole && shrunkHole < plainHole, `opening size did not follow the scale (${plainHole}, ${grownHole}, ${shrunkHole})`);
assert(grownStats.minX > 1 && grownStats.minY > 1 && grownStats.maxX < 46 && grownStats.maxY < 46, "expanded opening left the module");
assert(contentExtent(grown, 48) <= 48 / 2 - 1, "expanded mass left the module");
const edge = new Array<number>(48 * 48).fill(0.6);
assert(expansionLimit(edge, 48) === 1, "edge-filling mass can still expand");
assert(trailsEqual(scaleTrail(source, 48, 1.15), scaleTrail(source, 48, 1.15)), "scale is not deterministic");
ok("expansion and contraction stay inside the module and keep one opening");

const started = Date.now();
const branched = branchSampledFutures(FIXTURE);
const [f01, f02, , f04] = branched.futures;
assert(f01.iterations.join(",") === F01_ITERATIONS, `F01 iterations changed (${f01.iterations.join(",")})`);
assert(f02.iterations.join(",") === F02_ITERATIONS, `F02 iterations changed (${f02.iterations.join(",")})`);
assert(
  DEFAULT_BOUNDARY_FUSION.proximity === 1.8
    && DEFAULT_BOUNDARY_FUSION.relaxationRadius === 2.4
    && DEFAULT_BOUNDARY_FUSION.blendStrength === 1,
  "F02 left the medium preset",
);
const futuresSource = readFileSync(new URL("./futures.ts", import.meta.url), "utf8");
assert(!futuresSource.includes("scaleSample("), "F04 still scales stored samples after sampling");
assert(futuresSource.includes("applyLiveScale"), "F04 does not scale the live state");
ok("F01 and F02 iterations are unchanged");

assert(f01.parentChecksum === f04.parentChecksum, "F04 does not share Z0");
assert(trailsEqual(f01.samples[0].trails, f04.samples[0].trails), "F04 Z0 trails differ");
assert(sampleScale(f04.samples[0].iteration, f04.samples[0].iteration, 64, 1.2) === 1, "Z0 scale helper is not 1");
const plan = deriveAdaptiveScale(branched.handoff.selected.source.typologyId, branched.handoff.selected.source.ratings);
const again = deriveAdaptiveScale(branched.handoff.selected.source.typologyId, branched.handoff.selected.source.ratings);
assert(JSON.stringify(plan) === JSON.stringify(again), "live scale plan is not deterministic");
assert(Math.abs(sampleScale(f04.sampling.future.iteration, 600, f04.sampling.config.horizon, plan.finalScale) - plan.finalScale) < 1e-12, "F04 did not reach its final scale");
const margin = 0.18;
const limit = f04.sampling.future.size - margin;
assert(
  f04.sampling.future.agents.every((agent) =>
    Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.heading)
    && agent.x >= margin && agent.y >= margin && agent.x <= limit && agent.y <= limit,
  ),
  "F04 agents left the field",
);
assert(f04.samples.every((sample) => sample.trails.every((value) => Number.isFinite(value))), "F04 trails are not finite");
ok(`Void Field F04 is ${plan.scaleDirection} at ${plan.finalScale.toFixed(3)} (strength ${plan.scaleStrength.toFixed(3)})`);

console.log(`verify-adaptive-scale: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
