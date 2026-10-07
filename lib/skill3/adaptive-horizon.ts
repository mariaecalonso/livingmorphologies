import { mulberry32 } from "../physarum";
import { stepMany } from "../skill1/engine";
import type { SimulationState } from "../skill1/types";
import { stateChecksum } from "../skill2/handoff";
import { architecturalIntentFor } from "./architectural-intent";
import { naturalContinuationSeed } from "./continuations";
import { createIntegratedEmphasis } from "./diagnostic-emphasis";
import {
  acceptReason,
  DEFAULT_EVENT_CONFIG,
  measureChange,
  type SampleReason,
} from "./events";
import { openVerifiedSemanticHandoff } from "./semantic-handoff";
import { cloneSimulationState, openContinuation, posedTranslation } from "./z0";

/**
 * Diagnostic horizon resolver. The continuation runs at least `minimum` post-Z0
 * steps and at most `cap`. The resolved length is a step count. It does not
 * change the 20×20×20 module height.
 */
export type AdaptiveHorizonConfig = {
  /** Post-Z0 steps that are always kept. */
  minimum: number;
  /** Probe stops here even if development is still going. */
  cap: number;
  /** Quiet steps required after the last developmental sample. Matches max-gap sampling. */
  quietWindow: number;
  /** Interior empty-pixel change that counts as an opening event. */
  openChange: number;
  /** Growth-direction change, in degrees, that counts as a directional event. */
  directionChange: number;
};

export const DEFAULT_ADAPTIVE_HORIZON: AdaptiveHorizonConfig = {
  minimum: 64,
  cap: 400,
  quietWindow: DEFAULT_EVENT_CONFIG.maxGap,
  openChange: 800,
  directionChange: 8,
};

export type AdaptiveHorizonStatus = "STABILIZED" | "ACTIVE_AT_CAP";

export type DevelopmentalEventKind = "components" | "opening" | "direction";

export type DevelopmentalEvent = {
  iteration: number;
  offset: number;
  kind: DevelopmentalEventKind;
};

export type AdaptiveHorizonSample = {
  iteration: number;
  offset: number;
  reason: SampleReason;
  components: number;
  open: number;
  growthDirection: number | null;
};

export type AdaptiveHorizonResult = {
  resolvedHorizon: number;
  status: AdaptiveHorizonStatus;
  lastDevelopmentalOffset: number;
  developmentalEvents: DevelopmentalEvent[];
  acceptedSamples: AdaptiveHorizonSample[];
};

export function assertAdaptiveHorizonConfig(config: AdaptiveHorizonConfig) {
  if (!Number.isInteger(config.minimum) || config.minimum < 1) throw new Error(`minimum horizon ${config.minimum} is not a positive integer`);
  if (!Number.isInteger(config.cap) || config.cap < config.minimum) throw new Error(`horizon cap ${config.cap} is below the minimum ${config.minimum}`);
  if (!Number.isInteger(config.quietWindow) || config.quietWindow < 1) throw new Error(`quiet window ${config.quietWindow} is not a positive integer`);
  if (!Number.isFinite(config.openChange) || config.openChange < 0) throw new Error(`open change ${config.openChange} must be a non-negative number`);
  if (!Number.isFinite(config.directionChange) || config.directionChange < 0) throw new Error(`direction change ${config.directionChange} must be a non-negative number`);
}

/** Smallest absolute degree change, so a turn across ±180° is not read as a full circle. */
export function directionDelta(before: number, after: number) {
  let delta = after - before;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return Math.abs(delta);
}

export function developmentalKinds(
  previous: AdaptiveHorizonSample,
  next: Pick<AdaptiveHorizonSample, "reason" | "components" | "open" | "growthDirection">,
  config: AdaptiveHorizonConfig,
): DevelopmentalEventKind[] {
  if (next.reason !== "threshold") return [];
  const kinds: DevelopmentalEventKind[] = [];
  if (next.components !== previous.components) kinds.push("components");
  if (Math.abs(next.open - previous.open) >= config.openChange) kinds.push("opening");
  if (
    previous.growthDirection != null
    && next.growthDirection != null
    && directionDelta(previous.growthDirection, next.growthDirection) >= config.directionChange
  ) {
    kinds.push("direction");
  }
  return kinds;
}

/**
 * Last developmental offset plus one quiet window, never below the minimum.
 * The sum is already a whole post-Z0 step, so rounding does not shorten it.
 * Callers only use this after the quiet window has been observed inside the cap.
 */
export function stabilizedHorizon(lastDevelopmentalOffset: number, config: AdaptiveHorizonConfig) {
  const buffered = Math.ceil(lastDevelopmentalOffset + config.quietWindow);
  return Math.max(config.minimum, buffered);
}

export function horizonDecision(
  samples: readonly AdaptiveHorizonSample[],
  events: readonly DevelopmentalEvent[],
  probedOffset: number,
  config: AdaptiveHorizonConfig,
): Pick<AdaptiveHorizonResult, "resolvedHorizon" | "status" | "lastDevelopmentalOffset"> {
  const lastDevelopmentalOffset = events.length ? events[events.length - 1].offset : 0;
  const quietSample = samples.some((sample) => sample.offset - lastDevelopmentalOffset >= config.quietWindow);
  const windowFits = lastDevelopmentalOffset + config.quietWindow <= config.cap;
  if (probedOffset >= config.minimum && quietSample && windowFits) {
    return {
      resolvedHorizon: Math.min(config.cap, stabilizedHorizon(lastDevelopmentalOffset, config)),
      status: "STABILIZED",
      lastDevelopmentalOffset,
    };
  }
  return { resolvedHorizon: config.cap, status: "ACTIVE_AT_CAP", lastDevelopmentalOffset };
}

function snapshotAgents(state: SimulationState) {
  return state.agents.map((agent) => ({ x: agent.x, y: agent.y, heading: agent.heading }));
}

/**
 * Probes one integrated continuation from a verified Z0 and resolves its horizon.
 * Stops once a quiet max-gap window has passed after the last developmental sample,
 * and never continues past the cap. Does not write catalogue data.
 */
export function resolveAdaptiveHorizon(
  request: { archetypeId: string; candidateId: number },
  config: AdaptiveHorizonConfig = DEFAULT_ADAPTIVE_HORIZON,
): AdaptiveHorizonResult {
  assertAdaptiveHorizonConfig(config);
  const opened = openVerifiedSemanticHandoff(request);
  if (!opened) throw new Error(`verified Z0 missing for ${request.archetypeId} ${request.candidateId}`);
  const parent = opened.handoff.selected.simulationState;
  const parentChecksum = stateChecksum(parent);
  const z0Iteration = parent.iteration;
  const profile = architecturalIntentFor(request.archetypeId);
  const { transform, development } = createIntegratedEmphasis(parent, profile);
  const sampling = { ...DEFAULT_EVENT_CONFIG, horizon: config.cap };
  const future = cloneSimulationState(parent);
  const translation = posedTranslation(opened.handoff.selected.source);
  if (JSON.stringify(translation.recipe) !== JSON.stringify(opened.record.realization.recipe)) {
    throw new Error("continuation pose does not match the handoff recipe");
  }
  const seed = naturalContinuationSeed(request, 1);
  const rng = mulberry32(seed >>> 0);
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
  if (stateChecksum(parent) !== parentChecksum) throw new Error(`${request.archetypeId} changed verified Z0`);
  const probedOffset = future.iteration - z0Iteration;
  const decision = horizonDecision(accepted, events, probedOffset, config);
  if (status === "STABILIZED" && decision.status !== "STABILIZED") {
    throw new Error("quiet window did not resolve to a stabilized horizon");
  }
  return {
    resolvedHorizon: decision.resolvedHorizon,
    status: decision.status,
    lastDevelopmentalOffset: decision.lastDevelopmentalOffset,
    developmentalEvents: events,
    acceptedSamples: accepted,
  };
}
