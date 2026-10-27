import { mulberry32 } from "../physarum";
import { findArchetype, findTypology } from "../catalog";
import {
  ANALYSIS_TABS,
  createAnalysisSession,
  exportAnalysisPayload,
  extractTopology,
  fieldToDisplayRow,
  frameForTab,
  gridsFromState,
  recordAnalysisSample,
  trailChecksum,
  type AnalysisInput,
} from "./analysis";
import { createSimulation, stepMany, stepSimulation } from "./engine";
import { translateArchetype } from "./translate";
import type { BiologicalTranslation, SimulationState } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function inputFor(translation: BiologicalTranslation, ratings = translation.ratings): AnalysisInput {
  return {
    ratings,
    typologyId: translation.typologyId,
    isolationRadius: translation.recipe.isolationRadius,
    attractors: (translation.recipe.attractors ?? []).map((item) => ({ x: item.x, y: item.y })),
  };
}

function sessionFor(translation: BiologicalTranslation, seed: number, generation: number) {
  return createAnalysisSession({
    simulationId: `${translation.archetypeId}:${seed}:${generation}`,
    seed,
    archetypeId: translation.archetypeId,
    archetypeName: translation.archetypeName,
    typologyId: translation.typologyId,
  });
}

function runFixed(archetypeId: string, seed: number, agents: number, steps: number) {
  const translation = translateArchetype(archetypeId);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state = createSimulation(translation, seed, agents);
  state.maxIterations = steps + 1;
  let session = sessionFor(translation, seed, 1);
  const input = inputFor(translation);
  session = recordAnalysisSample(session, state, input, { interval: 1, force: true });
  for (let i = 0; i < steps; i += 1) {
    stepSimulation(state, translation, rng);
    session = recordAnalysisSample(session, state, input, { interval: 1, force: true });
  }
  return { translation, state, session, input };
}

function fingerprint(state: SimulationState) {
  return JSON.stringify(exportAnalysisPayload(recordAnalysisSample(
    sessionFor(translateArchetype(state.agents.length ? "vertical-void" : "vertical-void"), state.seed, 1),
    state,
    inputFor(translateArchetype("vertical-void")),
    { force: true },
  )));
}

const archetypeId = "vertical-void";
const first = runFixed(archetypeId, 11, 36, 10);
const second = runFixed(archetypeId, 11, 36, 10);
const firstPayload = exportAnalysisPayload(first.session);
const secondPayload = exportAnalysisPayload(second.session);
assert(firstPayload != null && secondPayload != null, "A. analysis payload exists");
assert(JSON.stringify(firstPayload) === JSON.stringify(secondPayload), "A. repeated seed and parameters produce the same analysis");
assert(first.state.iteration === 10, "A. simulation reached the requested iteration");

const otherSeed = runFixed(archetypeId, 29, 36, 10);
assert(
  trailChecksum(first.state.trails) !== trailChecksum(otherSeed.state.trails),
  "B. a different seed changes the trail field",
);
assert(
  JSON.stringify(exportAnalysisPayload(otherSeed.session)?.dna) !== JSON.stringify(firstPayload?.dna) ||
    otherSeed.session.latest?.trailSum !== first.session.latest?.trailSum,
  "B. analysis follows the changed trail field",
);

const few = runFixed(archetypeId, 11, 12, 10);
const many = runFixed(archetypeId, 11, 80, 10);
assert(
  (few.session.latest?.trailSum ?? 0) !== (many.session.latest?.trailSum ?? 0),
  "C. agent count changes the measured trail sum",
);

const paused = runFixed(archetypeId, 11, 36, 6);
const held = paused.session;
const heldIteration = paused.state.iteration;
const heldTrail = paused.state.trails[0];
const heldX = paused.state.agents[0]?.x;
stepSimulation(paused.state, paused.translation, mulberry32(99));
const reread = recordAnalysisSample(held, paused.state, paused.input, { interval: 100, force: false });
assert(reread === held, "D. a paused recorder does not take a new sample inside the interval");
assert(held.latest?.iteration === heldIteration, "D. held analysis iteration stays at the pause");
assert(paused.state.iteration === heldIteration + 1, "D. the simulator itself can still be stepped by the caller");
paused.state.trails[0] = heldTrail;
if (paused.state.agents[0]) paused.state.agents[0].x = heldX ?? paused.state.agents[0].x;

const reset = createAnalysisSession({
  simulationId: `${archetypeId}:11:2`,
  seed: 11,
  archetypeId,
  archetypeName: first.translation.archetypeName,
  typologyId: first.translation.typologyId,
});
assert(reset.samples.length === 0 && reset.latest == null, "E. a new session after reset has no history");
assert(reset.simulationId !== held.simulationId, "E. the reset session is not the paused simulation");
const resetRecorded = recordAnalysisSample(reset, createSimulation(first.translation, 11, 36), first.input, { force: true });
assert(resetRecorded.samples.length === 1 && resetRecorded.samples[0].iteration === 0, "E. the reset history starts at iteration 0");
assert(held.samples[held.samples.length - 1].iteration === 6, "E. discarding a session does not rewrite the old one");

const beforeSum = trailChecksum(first.state.trails);
const beforeIteration = first.state.iteration;
const beforeX = first.state.agents[0].x;
for (const tab of ANALYSIS_TABS) {
  assert(frameForTab(first.session, tab.id) === first.session.latest, "F. every tab reads the same frame");
}
assert(trailChecksum(first.state.trails) === beforeSum, "F. reading analysis does not change trails");
assert(first.state.iteration === beforeIteration && first.state.agents[0].x === beforeX, "F. reading analysis does not move the simulation");

const topology = first.session.latest?.topology;
assert(topology != null, "G. topology exists");
if (topology) {
  for (let i = 0; i < topology.skeleton.length; i += 1) {
    if (topology.skeleton[i]) assert(topology.mask[i] === 1, "G. every skeleton cell is an occupied cell");
  }
  const peak = Math.max(...(first.session.latest?.density.trailDensity ?? [0]));
  topology.mask.forEach((bit, index) => {
    const value = first.session.latest?.density.trailDensity[index] ?? 0;
    assert(bit === (peak > 0 && value >= peak * topology.thresholdRatio ? 1 : 0), "G. the mask is the thresholded trail grid");
  });
}
const plus = new Array<number>(81).fill(0);
for (const [x, y] of [
  [4, 4],
  [4, 3],
  [4, 2],
  [4, 5],
  [4, 6],
  [2, 4],
  [3, 4],
  [5, 4],
  [6, 4],
]) {
  plus[y * 9 + x] = 1;
}
const plusTopology = extractTopology(plus, 9);
assert(plusTopology.branchCount === 1, "G. a plus-shaped trail has one branch pixel");
assert(plusTopology.endpointCount === 4, "G. a plus-shaped trail has four endpoints");
assert(plusTopology.componentCount === 1 && plusTopology.cycleRank === 0, "G. the plus is one tree component");
assert(fieldToDisplayRow(0, 20) === 19 && fieldToDisplayRow(19, 20) === 0, "G. display rows use the generator's upward field Y");

const grids = gridsFromState(first.state);
assert(grids.occupancy != null && grids.occupancyAligned === true, "H. trail-density aggregation matches state.occupancy");
const batched = createSimulation(first.translation, 11, 36);
batched.maxIterations = 6;
stepMany(batched, first.translation, mulberry32(11 ^ 0x9e3779b9), 4);
assert(gridsFromState(batched).occupancyAligned === true, "H. occupancy still matches after a stepped batch");

const lobby = findArchetype(findTypology("lobby"), archetypeId);
const centrality = first.session.latest?.dna.find((axis) => axis.id === "centrality");
assert(centrality != null, "I. centrality axis exists");
assert(centrality?.target === (lobby.ratings.centrality ?? 0) / 2, "I. centrality target is the catalog rating / 2");
const low = recordAnalysisSample(
  sessionFor(first.translation, 11, 9),
  first.state,
  inputFor(first.translation, { ...first.translation.ratings, centrality: 0 }),
  { force: true },
);
const high = recordAnalysisSample(
  sessionFor(first.translation, 11, 9),
  first.state,
  inputFor(first.translation, { ...first.translation.ratings, centrality: 2 }),
  { force: true },
);
assert(low.latest?.dna.find((axis) => axis.id === "centrality")?.target === 0, "I. target follows the supplied rating");
assert(high.latest?.dna.find((axis) => axis.id === "centrality")?.target === 1, "I. a high rating is 1 on the target scale");
assert(
  low.latest?.dna.find((axis) => axis.id === "centrality")?.generated ===
    high.latest?.dna.find((axis) => axis.id === "centrality")?.generated,
  "I. generated centrality stays on the measured field when only the rating changes",
);

const immersion = first.session.latest?.dna.find((axis) => axis.id === "immersion");
assert(immersion?.generated == null && immersion?.generatedDisplay === "Not available", "J. immersion is not given a fake generated value");
const plate = translateArchetype("inserted-horizontal-plate");
const plateSession = recordAnalysisSample(
  sessionFor(plate, 3, 1),
  createSimulation(plate, 3, 20),
  inputFor(plate),
  { force: true },
);
const plateDirection = plateSession.latest?.dna.find((axis) => axis.id === "directionality");
const plateCentrality = plateSession.latest?.dna.find((axis) => axis.id === "centrality");
assert(plateDirection?.target == null && plateDirection?.targetDisplay === "Not available", "J. directionality has no target outside its typology");
assert(plateCentrality?.target == null && plateCentrality?.targetDisplay === "Not available", "J. centrality has no target outside its typology");
assert(plateSession.latest?.flow != null, "J. a live simulation still exposes its flow field");
const restored = createSimulation(plate, 3, 20);
restored.agents = [];
restored.flow = [];
const restoredSession = recordAnalysisSample(sessionFor(plate, 3, 4), restored, inputFor(plate), { force: true });
assert(
  restoredSession.latest?.dna.find((axis) => axis.id === "directionality")?.generatedDisplay === "Not available",
  "J. missing headings stay unavailable",
);
assert(restoredSession.latest?.flow == null, "J. a missing flow field stays unavailable");

const exported = exportAnalysisPayload(first.session);
assert(exported?.simulationId === first.session.simulationId, "K. export uses the session id");
assert(exported?.iteration === first.session.latest?.iteration, "K. export uses the sampled iteration");
assert(exported?.seed === 11 && exported?.archetypeId === archetypeId, "K. export names the simulation that was measured");
assert(exported?.growth[exported.growth.length - 1].iteration === first.session.latest?.iteration, "K. export history ends at the current sample");

if (fingerprint(first.state).length < 10) throw new Error("fingerprint failed to serialize");

console.log("skill 1 analysis checks passed");
console.log(`seed 11 trail ${first.session.latest?.trailSum.toFixed(4)} occupied ${first.session.latest?.topology.occupiedCells}`);
console.log(`seed 29 trail ${otherSeed.session.latest?.trailSum.toFixed(4)} occupied ${otherSeed.session.latest?.topology.occupiedCells}`);
console.log(`agents 12 trail ${few.session.latest?.trailSum.toFixed(4)} / agents 80 trail ${many.session.latest?.trailSum.toFixed(4)}`);
