import { mulberry32 } from "../physarum";
import { stepMany } from "../skill1/engine";
import type { BiologicalTranslation, SimAgent, SimulationState, Skill1Handoff } from "../skill1/types";
import { replaySkill2Handoff, type Skill2HandoffRecord } from "../skill2/handoff";
import type { Skill2Handoff } from "../skill2/types";

/** Rebuilds the exact evaluated Skill 2 state. The returned object is Z0. */
export function replayZ0(record: Skill2HandoffRecord): Skill2Handoff {
  return replaySkill2Handoff(record);
}

/** Posed translation carried on the replayed handoff. This does not create a simulation. */
export function posedTranslation(source: Skill1Handoff): BiologicalTranslation {
  return {
    archetypeId: source.archetypeId,
    archetypeName: source.archetypeName,
    typologyId: source.typologyId,
    topology: source.topology,
    descriptors: source.descriptors,
    ratings: source.ratings,
    params: source.params,
    recipe: source.recipe,
    traces: source.traces,
    rankings: source.rankings,
    behavior: source.behavior,
  };
}

function cloneAgent(agent: SimAgent): SimAgent {
  return {
    x: agent.x,
    y: agent.y,
    heading: agent.heading,
    speed: agent.speed,
    trailStrength: agent.trailStrength,
    pathX: agent.pathX.slice(),
    pathY: agent.pathY.slice(),
    hold: agent.hold,
  };
}

/** Deep copy. Later steps on the copy leave the original Z0 in place. */
export function cloneSimulationState(state: SimulationState): SimulationState {
  return {
    size: state.size,
    trailSize: state.trailSize,
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    converged: state.converged,
    streak: state.streak,
    totalDelta: state.totalDelta,
    seed: state.seed,
    source: { ...state.source },
    attractor: { ...state.attractor },
    attraction: state.attraction.slice(),
    permeabilityField: state.permeabilityField.slice(),
    occupancy: state.occupancy.slice(),
    trails: state.trails.slice(),
    flow: state.flow.slice(),
    agents: state.agents.map(cloneAgent),
  };
}

/**
 * Lets a clone step past the evaluation cap. Mutates only the state it is given.
 * Iteration, trails, agents, seed, and attractor stay as replayed.
 */
export function openContinuation(state: SimulationState, extraIterations: number) {
  if (!Number.isInteger(extraIterations) || extraIterations < 1) {
    throw new Error(`continuation length ${extraIterations} is not a positive integer`);
  }
  state.maxIterations = state.iteration + extraIterations;
  state.converged = false;
  state.streak = 0;
}

function continuationSeed(record: Skill2HandoffRecord) {
  let hash = 0x811c9dc5;
  const text = `${record.identity.runKey}#${record.identity.candidateId}`;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/**
 * Steps an already opened clone with the posed recipe and the handoff slime.
 * The continuation RNG is a new stream. It is not the evaluation RNG.
 */
export function continueOpenedClone(
  state: SimulationState,
  handoff: Skill2Handoff,
  record: Skill2HandoffRecord,
  steps = 1,
): SimulationState {
  if (!Number.isInteger(steps) || steps < 1) throw new Error(`continuation steps ${steps} is not a positive integer`);
  if (state.converged || state.iteration >= state.maxIterations) {
    throw new Error("continuation is closed; open the clone before stepping");
  }
  const translation = posedTranslation(handoff.selected.source);
  if (JSON.stringify(translation.recipe) !== JSON.stringify(record.realization.recipe)) {
    throw new Error("continuation pose does not match the handoff recipe");
  }
  return stepMany(
    state,
    translation,
    mulberry32(continuationSeed(record)),
    steps,
    record.realization.simulation.trailDecay,
    record.realization.slime,
    false,
  );
}
