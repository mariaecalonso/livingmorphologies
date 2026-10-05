import type { SlimeControls } from "../skill1/slime-controls";
import { DEVELOPMENT_BEHAVIOR } from "./behavior-profile";
import {
  NATURAL_CONTINUATION_COUNT,
  naturalContinuationId,
  naturalContinuationSeed,
  type ContinuationEvent,
  type NaturalContinuation,
  type NaturalContinuationSet,
} from "./continuations";
import { iterationSpanZ, type ViewerSlice } from "./viewer-field";

/**
 * Development-only stand-in for a NaturalContinuationSet.
 * It does not call the Skill 2 handoff, and it is not archived Skill 1 or Skill 2 data.
 * The plates are drawn so the process page can use the existing renderers.
 */
export const DEVELOPMENT_FIXTURE_CHECKSUM = "development-fixture";

const PLATE = 64;
const SAMPLE_COUNT = 5;
const Z0_ITERATION = 600;

const SLIME: SlimeControls = {
  sensorAngle: 0.6,
  sensorDistance: 2.4,
  turnAngle: 0.4,
  stepSize: 1,
  deposit: 0.5,
  depositWidth: 1.5,
  diffusion: 0.2,
  decay: 0.986,
  trailInfluence: 1,
  resistance: 0,
  randomness: 0.1,
  persistence: 0.8,
  trailCap: 1.8,
  foodPoints: [{ x: 10, y: 10 }],
  crowdingLimit: 0.4,
  voidElongation: 1,
  voidRotation: 0,
  voidLobes: 0,
  voidNotch: 0,
};

function stroke(trails: number[], size: number, x0: number, y0: number, x1: number, y1: number, radius: number, amount: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    stamp(trails, size, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, amount * (0.55 + 0.45 * (1 - Math.abs(t - 0.5) * 2)));
  }
}

function stamp(trails: number[], size: number, cx: number, cy: number, radius: number, amount: number) {
  const r = Math.ceil(radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(size - 1, Math.ceil(cx + r));
  const y1 = Math.min(size - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) continue;
      const index = y * size + x;
      trails[index] = Math.max(trails[index], amount * (1 - distance / radius));
    }
  }
}

const EARLY_ITERATIONS = [Z0_ITERATION, 616, 632, 648, 664];

/** N13–N24 shift only the middle sample. The shared Z0 and the outer samples stay put. */
function iterationsFor(branch: number) {
  if (branch <= 12) return EARLY_ITERATIONS;
  const middle = 624 + ((branch - 13) % 5) * 4;
  return [Z0_ITERATION, 616, middle, 648, 664];
}

function plate(step: number, branch: number) {
  const trails = new Array<number>(PLATE * PLATE).fill(0);
  const drift = step * (2.2 + (branch % 5) * 0.15);
  const turn = ((branch - 1) / NATURAL_CONTINUATION_COUNT) * Math.PI;
  const mid = PLATE * 0.5;
  const rootX = mid;
  const rootY = mid + 8;
  const leftX = mid - 14 + drift * Math.cos(turn);
  const leftY = mid - 6 - step * 1.4;
  const rightX = mid + 12 + drift * Math.sin(turn);
  const rightY = mid - 4 - step;
  stamp(trails, PLATE, rootX, rootY, 6.5, 0.95);
  stamp(trails, PLATE, leftX, leftY, 4.2, 0.8);
  stamp(trails, PLATE, rightX, rightY, 4, 0.75);
  stroke(trails, PLATE, rootX, rootY, leftX, leftY, 1.6, 0.7);
  stroke(trails, PLATE, rootX, rootY, rightX, rightY, 1.6, 0.66);
  if (step > 1) {
    const tipX = mid + step * 1.6;
    const tipY = mid + 16 - step;
    stroke(trails, PLATE, rootX, rootY, tipX, tipY, 1.35, 0.6);
    stamp(trails, PLATE, tipX, tipY, 3, 0.55);
  }
  if (branch > 12 && step > 0) addLaterHook(trails, step, branch, rootX, rootY);
  let peak = 0.0001;
  for (const value of trails) if (value > peak) peak = value;
  return { trails, peak };
}

/** Extra arm on N13–N24 after Z0. The shared fork stays; the hook direction follows the branch. */
function addLaterHook(trails: number[], step: number, branch: number, rootX: number, rootY: number) {
  const slot = branch - 13;
  const sweep = -0.2 + (slot / 11) * 1.6;
  const reach = 5 + step * 3.2;
  const armX = rootX + Math.cos(sweep) * reach;
  const armY = rootY - 4 - Math.sin(sweep + 0.6) * reach;
  stroke(trails, PLATE, rootX, rootY, armX, armY, 1.45, 0.7);
  stamp(trails, PLATE, armX, armY, 2.8 + (slot % 3) * 0.35, 0.66);
}

function eventsFor(iterations: number[]): ContinuationEvent[] {
  return iterations.map((iteration, index) => ({
    index,
    iteration,
    reason: index === 0 ? "z0" : index % 2 === 0 ? "max-gap" : "threshold",
    referenceIteration: index === 0 ? null : iterations[index - 1],
    delta: index === 0 ? 0 : 0.08 + index * 0.03,
    persistence: DEVELOPMENT_BEHAVIOR.persistence - index * 0.04,
    migration: index === 0 ? 0 : DEVELOPMENT_BEHAVIOR.migration,
    reinforcement: index === 0 ? 0 : DEVELOPMENT_BEHAVIOR.reinforcement,
    connectivityChange: index === 0 ? 0 : DEVELOPMENT_BEHAVIOR.connectivity,
  }));
}

function buildDevelopmentSet(richThrough: number): NaturalContinuationSet {
  const identity = {
    typologyId: "lobby",
    archetypeId: "continuous-hall",
    archetypeName: "Continuous Hall",
    candidateId: 300,
    runKey: "continuous-hall@development-fixture",
  };
  const continuations: NaturalContinuation[] = [];
  for (let branch = 1; branch <= NATURAL_CONTINUATION_COUNT; branch += 1) {
    const id = naturalContinuationId(branch);
    const shown = branch <= richThrough;
    const branchIterations = shown ? iterationsFor(branch) : [Z0_ITERATION];
    const branchHeights = iterationSpanZ(branchIterations);
    const events = eventsFor(branchIterations);
    const slices: ViewerSlice[] = branchIterations.map((iteration, index) => {
      const drawn = plate(index, branch);
      return {
        index,
        iteration,
        z: branchHeights[index] ?? 0,
        trails: drawn.trails,
        trailSize: PLATE,
        peak: drawn.peak,
        source: { x: 0, y: 0 },
        attractor: { x: 10, y: 10 },
      };
    });
    continuations.push({
      id,
      index: branch,
      continuationSeed: naturalContinuationSeed(identity, branch),
      ...identity,
      z0Iteration: Z0_ITERATION,
      parentChecksum: DEVELOPMENT_FIXTURE_CHECKSUM,
      acceptedIterations: branchIterations,
      sampleCount: events.length,
      eventCount: events.length - 1,
      events,
      field: {
        lineage: {
          archetypeId: identity.archetypeId,
          archetypeName: identity.archetypeName,
          candidateId: identity.candidateId,
          z0Iteration: Z0_ITERATION,
          futureId: id,
        },
        slices,
      },
    });
  }
  return {
    origin: "development-fixture",
    ...identity,
    z0Iteration: Z0_ITERATION,
    parentChecksum: DEVELOPMENT_FIXTURE_CHECKSUM,
    slime: SLIME,
    rules: {
      horizon: 64,
      minGap: 8,
      maxGap: 24,
      deltaThreshold: 0.08,
      weights: { persistence: 0.35, migration: 0.25, reinforcement: 0.2, connectivity: 0.2 },
      trailEpsilon: 0.003,
      connectivityResolution: 32,
      envelope: { sizeX: 20, sizeY: 20, sizeZ: 20 },
      morphology: "network",
      transform: "none",
    },
    continuations,
  };
}

/** Process page stand-in. Only N01 carries a multi-sample field. */
export function buildDevelopmentFixture(): NaturalContinuationSet {
  return buildDevelopmentSet(1);
}

/**
 * Catalogue stand-in. All 24 branches carry a developed multi-sample field.
 * N13–N24 keep the shared Z0, then add a branch hook and a shifted middle sample.
 * This is not the representative filter.
 */
export function buildDevelopmentCatalogueSet(): NaturalContinuationSet {
  return buildDevelopmentSet(NATURAL_CONTINUATION_COUNT);
}
