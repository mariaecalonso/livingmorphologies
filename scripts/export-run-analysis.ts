/**
 * The Lab's analysis of saved Vertical Void run 23 for the Demo Workflow's 2D Generation panel.
 * Replays the run exactly as `scripts/capture-void-growth.ts` does (same seed, agents, controls and
 * 600 iterations), samples it with the Lab's own analysis at the Lab's interval, and writes the
 * final frame. Does not change the engine, the analysis, or the catalog.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createSimulation, stepMany } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE } from "../lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "../lib/skill1/run-variants";
import { slimeControlsFromTranslation, varySlimeControls, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import { createAnalysisSession, DEFAULT_SAMPLE_INTERVAL, recordAnalysisSample } from "../lib/skill1/analysis";
import { mulberry32 } from "../lib/physarum";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, SpatialRecipe, TopologyKind } from "../lib/skill1/types";
import type { LabRunData } from "../lib/demo-workflow/lab-run";

const RUN = 23;
const RUN_TRAIL_SCALE = 8;
const COLUMNS = 20;
const ROW_KINDS: AttractorKind[] = ["point", "ring", "line", "curve"];
const ENTRIES = "public/demo/skill1/vertical-void/entries.json";
const OUT = `public/demo/skill1/vertical-void/analysis-run-${RUN}.json`;
const RECORDING = "/assets/skill0/void-growth-2.gif";

type Entry = {
  run: number;
  seed: number;
  agents: number;
  archetypeId: string;
  archetypeName?: string;
  image: string;
  slime?: SlimeControls;
  params?: BiologicalParams;
  behavior?: BiologicalBehavior;
  recipe?: SpatialRecipe;
  topology?: TopologyKind;
};

const entry = (JSON.parse(readFileSync(ENTRIES, "utf8")) as Entry[]).find((item) => item.run === RUN);
if (!entry) throw new Error(`missing run ${RUN}`);

const base = translateArchetype(entry.archetypeId);
const kind = ROW_KINDS[Math.floor((entry.run - 1) / COLUMNS) % ROW_KINDS.length];
const marks = attractorsAsKind(runAttractorsFor(base.archetypeId, entry.seed, base.recipe.attractors ?? [], kind), kind, entry.seed, base.archetypeId);
const translation: BiologicalTranslation = {
  ...base,
  params: entry.params ?? base.params,
  behavior: entry.behavior ?? base.behavior,
  recipe: entry.recipe ?? { ...base.recipe, attractorFixed: true, attractorsOnly: true, attractor: { x: marks[0].x, y: marks[0].y }, attractors: marks },
  topology: entry.topology ?? base.topology,
  archetypeName: entry.archetypeName ?? base.archetypeName,
};
const saved = entry.slime ?? {
  ...varySlimeControls(slimeControlsFromTranslation(base), entry.seed, entry.archetypeId),
  foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
};
const slime = { ...saved, diffusion: Math.min(saved.diffusion, 0.04) };

const state = createSimulation(translation, entry.seed, entry.agents, RUN_TRAIL_SCALE);
state.maxIterations = DISPLAY_ITERATIONS;
const rng = mulberry32(entry.seed ^ 0x9e3779b9);
const input = {
  ratings: translation.ratings,
  typologyId: translation.typologyId,
  isolationRadius: translation.recipe.isolationRadius,
  attractors: (translation.recipe.attractors ?? []).map((item) => ({ x: item.x, y: item.y })),
};
let session = createAnalysisSession({
  simulationId: `${translation.archetypeId}:${entry.seed}:run-${RUN}`,
  seed: entry.seed,
  archetypeId: translation.archetypeId,
  archetypeName: translation.archetypeName,
  typologyId: translation.typologyId,
});
session = recordAnalysisSample(session, state, input, { force: true });
while (state.iteration < DISPLAY_ITERATIONS && !state.converged) {
  stepMany(state, translation, rng, Math.min(DEFAULT_SAMPLE_INTERVAL, DISPLAY_ITERATIONS - state.iteration), slime.decay, slime);
  session = recordAnalysisSample(session, state, input, { force: state.iteration >= DISPLAY_ITERATIONS || state.converged });
}
const frame = session.latest;
if (!frame) throw new Error("no analysis frame");

const round = (value: number) => Number(value.toPrecision(5));
const maybe = (value: number | null) => (value == null ? null : round(value));
const list = (values: ArrayLike<number>) => Array.from(values, round);

const data: LabRunData = {
  run: RUN,
  seed: entry.seed,
  agents: entry.agents,
  iterations: frame.iteration,
  archetypeName: translation.archetypeName,
  plate: entry.image,
  recording: RECORDING,
  settings: {
    sensorDistance: round(saved.sensorDistance),
    sensorAngle: round(saved.sensorAngle),
    turnAngle: round(saved.turnAngle),
    moveDistance: round(saved.stepSize),
    deposit: round(saved.deposit),
    diffusion: round(saved.diffusion),
    diffusionUsed: round(slime.diffusion),
    trailInfluence: round(saved.trailInfluence),
    resistance: round(saved.resistance),
    fieldSize: FIELD_SIZE,
    attractors: (translation.recipe.attractors ?? []).map((item) => item.kind ?? "point"),
  },
  marks: (translation.recipe.attractors ?? []).map((item) => ({
    kind: item.kind ?? "point",
    x: round(item.x),
    y: round(item.y),
    ...(item.x2 == null ? {} : { x2: round(item.x2), y2: round(item.y2 ?? item.y) }),
    ...(item.radius == null ? {} : { radius: round(item.radius) }),
  })),
  sampleInterval: DEFAULT_SAMPLE_INTERVAL,
  dna: frame.dna.map((axis) => ({ id: axis.id, label: axis.label, target: maybe(axis.target), generated: maybe(axis.generated), difference: maybe(axis.difference) })),
  growth: session.samples.map((sample) => ({
    iteration: sample.iteration,
    occupied: maybe(sample.occupiedFraction),
    branches: sample.branchCount,
    meanTrail: round(sample.meanTrail),
    stabilization: maybe(sample.stabilization),
    regime: sample.regime,
  })),
  topology: {
    size: frame.topology.size,
    mask: Array.from(frame.topology.mask),
    skeleton: Array.from(frame.topology.skeleton),
    endpoints: frame.topology.endpoints,
    branches: frame.topology.branches,
    branchCount: frame.topology.branchCount,
    endpointCount: frame.topology.endpointCount,
    componentCount: frame.topology.componentCount,
    connectivity: maybe(frame.topology.connectivity),
    cycleRank: frame.topology.cycleRank,
    averagePathLength: maybe(frame.topology.averagePathLength),
    diameter: frame.topology.diameter,
  },
  density: { size: frame.density.size, trail: list(frame.density.trailDensity) },
  direction: {
    bins: frame.direction.accumulatedBins,
    coherence: maybe(frame.direction.accumulatedCoherence),
    bias: maybe(frame.direction.accumulatedBias),
    meanSegmentLength: maybe(frame.direction.meanSegmentLength),
    x: list(frame.direction.sumX),
    y: list(frame.direction.sumY),
    count: Array.from(frame.direction.sumCount),
  },
};

writeFileSync(OUT, JSON.stringify(data));
console.log(OUT, `iteration ${frame.iteration}`, `${session.samples.length} samples`);
