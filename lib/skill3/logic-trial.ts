import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mulberry32 } from "../physarum";
import { stepMany } from "../skill1/engine";
import type { SimulationState } from "../skill1/types";
import { stateChecksum } from "../skill2/handoff";
import { architecturalIntentFor } from "./architectural-intent";
import {
  DEFAULT_ADAPTIVE_HORIZON,
  developmentalKinds,
  horizonDecision,
  type AdaptiveHorizonSample,
  type AdaptiveHorizonStatus,
  type DevelopmentalEvent,
} from "./adaptive-horizon";
import { continuationRecipesFor, type ContinuationFocus, type ContinuationRecipe } from "./continuation-recipes";
import { createIntegratedEmphasis } from "./diagnostic-emphasis";
import {
  acceptReason,
  DEFAULT_EVENT_CONFIG,
  measureChange,
  type AcceptedSample,
} from "./events";
import { openVerifiedSemanticHandoff } from "./semantic-handoff";
import type { LogicTrialFile, LogicTrialRun } from "./logic-trial-types";
import { toVerticalViewerField } from "./viewer-field";
import { cloneSimulationState, openContinuation, posedTranslation } from "./z0";

/** Development fixture. Not a catalogue selection. */
export const LOGIC_TRIAL_ARCHETYPE = "vertical-void";
export const LOGIC_TRIAL_CANDIDATE = 174;
export const LOGIC_TRIAL_RECIPE_IDS = ["N01", "N04", "N07", "N10", "N16", "N19"] as const;

export const LOGIC_TRIAL_PATH = path.join(process.cwd(), "data", "skill3-logic-trial", "vertical-void-174.json");

const FOCUS_LABEL: Record<ContinuationFocus, string> = {
  formal: "Formal",
  spatial: "Spatial",
  atmospheric: "Atmospheric",
  "formal+spatial": "Formal + Spatial",
  "formal+atmospheric": "Formal + Atmospheric",
  "spatial+atmospheric": "Spatial + Atmospheric",
  "formal+spatial+atmospheric": "Formal + Spatial + Atmospheric",
};

function snapshotAgents(state: SimulationState) {
  return state.agents.map((agent) => ({ x: agent.x, y: agent.y, heading: agent.heading }));
}

/**
 * One recipe, same loop as `resolveAdaptiveHorizon`, with that recipe's seed and schedule.
 * Stops on the adaptive quiet window or the cap. Does not write the verified Z0.
 */
function runRecipe(
  parent: SimulationState,
  opened: NonNullable<ReturnType<typeof openVerifiedSemanticHandoff>>,
  recipe: ContinuationRecipe,
): LogicTrialRun {
  const profile = architecturalIntentFor(recipe.archetypeId);
  const { transform, development } = createIntegratedEmphasis(parent, profile, recipe.schedule);
  const sampling = { ...DEFAULT_EVENT_CONFIG, horizon: DEFAULT_ADAPTIVE_HORIZON.cap };
  const config = DEFAULT_ADAPTIVE_HORIZON;
  const z0Iteration = parent.iteration;
  const future = cloneSimulationState(parent);
  const translation = posedTranslation(opened.handoff.selected.source);
  if (JSON.stringify(translation.recipe) !== JSON.stringify(opened.record.realization.recipe)) {
    throw new Error("continuation pose does not match the handoff recipe");
  }
  const rng = mulberry32(recipe.seed >>> 0);
  openContinuation(future, config.cap);
  let reference = {
    iteration: future.iteration,
    trailSize: future.trailSize,
    trails: future.trails.slice(),
    agents: snapshotAgents(future),
  };
  const opening = measureChange(reference, future, sampling);
  const accepted: AdaptiveHorizonSample[] = [{
    iteration: future.iteration,
    offset: 0,
    reason: "z0",
    components: opening.components,
    open: development.open(future.trails),
    growthDirection: null,
  }];
  const plates: AcceptedSample[] = [{
    index: 0,
    iteration: future.iteration,
    reason: "z0",
    referenceIteration: null,
    measures: opening,
    trailSize: future.trailSize,
    trails: Array.from(future.trails),
    agents: snapshotAgents(future),
    attractor: { ...future.attractor },
    seed: future.seed,
  }];
  const events: DevelopmentalEvent[] = [];
  let status: AdaptiveHorizonStatus = "ACTIVE_AT_CAP";
  const target = z0Iteration + config.cap;
  while (future.iteration < target) {
    if (future.converged || future.iteration >= future.maxIterations) {
      openContinuation(future, target - future.iteration);
    }
    const before = future.iteration;
    stepMany(future, translation, rng, 1, opened.record.realization.simulation.trailDecay, opened.record.realization.slime, false);
    if (future.iteration <= before) throw new Error("continuation made no progress");
    transform(future);
    const gap = future.iteration - reference.iteration;
    if (gap < sampling.minGap) continue;
    const measures = measureChange(reference, future, sampling);
    const reason = acceptReason(gap, measures.delta, sampling);
    if (!reason) continue;
    const sample: AdaptiveHorizonSample = {
      iteration: future.iteration,
      offset: future.iteration - z0Iteration,
      reason,
      components: measures.components,
      open: development.open(future.trails),
      growthDirection: development.growthDirection(future.trails),
    };
    const previous = accepted[accepted.length - 1];
    for (const kind of developmentalKinds(previous, sample, config)) {
      events.push({ iteration: sample.iteration, offset: sample.offset, kind });
    }
    accepted.push(sample);
    plates.push({
      index: plates.length,
      iteration: future.iteration,
      reason,
      referenceIteration: reference.iteration,
      measures,
      trailSize: future.trailSize,
      trails: Array.from(future.trails),
      agents: snapshotAgents(future),
      attractor: { ...future.attractor },
      seed: future.seed,
    });
    reference = {
      iteration: future.iteration,
      trailSize: future.trailSize,
      trails: future.trails.slice(),
      agents: snapshotAgents(future),
    };
    const lastDevelopmentalOffset = events.length ? events[events.length - 1].offset : 0;
    if (sample.offset >= config.minimum && sample.offset - lastDevelopmentalOffset >= config.quietWindow) {
      status = "STABILIZED";
      break;
    }
  }
  const probedOffset = future.iteration - z0Iteration;
  const decision = horizonDecision(accepted, events, probedOffset, config);
  if (status === "STABILIZED" && decision.status !== "STABILIZED") {
    throw new Error(`${recipe.id} quiet window did not resolve to a stabilized horizon`);
  }
  const counts = { components: 0, opening: 0, direction: 0 };
  for (const event of events) counts[event.kind] += 1;
  const field = toVerticalViewerField(
    {
      record: opened.record,
      z0: parent,
      future,
      samples: plates,
      startChecksum: stateChecksum(parent),
      config: sampling,
    },
    recipe.id,
  );
  return {
    id: recipe.id,
    focus: recipe.focus,
    focusLabel: FOCUS_LABEL[recipe.focus],
    seed: recipe.seed,
    resolvedHorizon: decision.resolvedHorizon,
    status: decision.status,
    lastDevelopmentalOffset: decision.lastDevelopmentalOffset,
    acceptedSampleCount: plates.length,
    developmentalEvents: counts,
    field,
  };
}

export function runLogicTrial(): LogicTrialFile {
  const request = { archetypeId: LOGIC_TRIAL_ARCHETYPE, candidateId: LOGIC_TRIAL_CANDIDATE };
  const opened = openVerifiedSemanticHandoff(request);
  if (!opened) throw new Error(`verified Z0 missing for ${LOGIC_TRIAL_ARCHETYPE} ${LOGIC_TRIAL_CANDIDATE}`);
  const parent = opened.handoff.selected.simulationState;
  const parentChecksum = stateChecksum(parent);
  const recipes = continuationRecipesFor(LOGIC_TRIAL_ARCHETYPE, LOGIC_TRIAL_CANDIDATE);
  const wanted = new Map(LOGIC_TRIAL_RECIPE_IDS.map((id) => [id, true]));
  const selected = recipes.recipes.filter((recipe) => wanted.has(recipe.id));
  if (selected.map((recipe) => recipe.id).join(",") !== LOGIC_TRIAL_RECIPE_IDS.join(",")) {
    throw new Error(`recipe ids ${selected.map((recipe) => recipe.id).join(",")} do not match the trial`);
  }
  const runs: LogicTrialRun[] = [];
  for (const recipe of selected) {
    const started = Date.now();
    const run = runRecipe(parent, opened, recipe);
    if (stateChecksum(parent) !== parentChecksum) throw new Error(`${recipe.id} changed verified Z0`);
    const z0 = run.field.slices[0]?.trails.join(",");
    if (runs.length > 0 && z0 !== runs[0].field.slices[0]?.trails.join(",")) {
      throw new Error(`${recipe.id} did not start from the same Z0 plate`);
    }
    console.log(JSON.stringify({
      id: run.id,
      focus: run.focusLabel,
      resolvedHorizon: run.resolvedHorizon,
      status: run.status,
      acceptedSampleCount: run.acceptedSampleCount,
      events: run.developmentalEvents,
      ms: Date.now() - started,
    }));
    runs.push(run);
  }
  if (stateChecksum(parent) !== parentChecksum) throw new Error("verified Z0 changed");
  return {
    archetypeId: LOGIC_TRIAL_ARCHETYPE,
    candidateId: LOGIC_TRIAL_CANDIDATE,
    z0Iteration: parent.iteration,
    parentChecksum,
    runs,
  };
}

export function writeLogicTrial(trial: LogicTrialFile, file = LOGIC_TRIAL_PATH) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(trial));
  return file;
}
