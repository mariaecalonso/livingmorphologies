import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { architecturalIntentFor } from "./architectural-intent";
import {
  naturalContinuationId,
  naturalContinuationSeed,
  type ContinuationEvent,
} from "./continuations";
import { continuationRecipesFor } from "./continuation-recipes";
import { createIntegratedEmphasis } from "./diagnostic-emphasis";
import { DEFAULT_EVENT_CONFIG, sampleFromParent, type SampleReason } from "./events";
import { openVerifiedSemanticHandoff } from "./semantic-handoff";
import { downsample, VIEWER_TRAIL_SIZE } from "./viewer-field";

/** Visualization log of one continuation. It is not a production field. */
export const PROCESS_REPLAY_CONTRACT = "process-replay-v1";

export const VERTICAL_VOID_PROCESS_REPLAY = {
  archetypeId: "vertical-void",
  candidateId: 351,
  continuationId: "N24",
} as const;

export type ProcessReplayFile = {
  contract: typeof PROCESS_REPLAY_CONTRACT;
  role: "visualization-only";
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  z0Iteration: number;
  horizon: number;
  parentChecksum: string;
  trailSize: number;
  /** One entry per generated iteration, Z0 through the horizon. Null means skipped. */
  decisions: { iteration: number; reason: SampleReason | null }[];
  /** Packed uint8 plates, row-major, peak normalized to 255. Length is decisions × trailSize². */
  plates: string;
};

export function processReplayPath(
  archetypeId: string = VERTICAL_VOID_PROCESS_REPLAY.archetypeId,
  candidateId: number = VERTICAL_VOID_PROCESS_REPLAY.candidateId,
  continuationId: string = VERTICAL_VOID_PROCESS_REPLAY.continuationId,
) {
  return join(process.cwd(), "data", "skill3", "process-replay", `${archetypeId}-${candidateId}-${continuationId}.json`);
}

function quantize(trails: readonly number[], peak: number) {
  const bytes = new Uint8Array(trails.length);
  const scale = peak > 0 ? 255 / peak : 0;
  for (let index = 0; index < trails.length; index += 1) {
    bytes[index] = Math.max(0, Math.min(255, Math.round(trails[index] * scale)));
  }
  return bytes;
}

/**
 * Replays the stored Vertical Void continuation and logs every XY field.
 * The sampler, seed, emphasis, and keep/skip rules are the existing ones.
 * The log is written only when the accepted samples match the stored bundle.
 */
export function buildVerticalVoidProcessReplay(): ProcessReplayFile {
  return buildProcessReplay(VERTICAL_VOID_PROCESS_REPLAY);
}

/**
 * Replays one selected continuation and logs every XY field.
 * The sampler, seed, emphasis, and keep/skip rules are the existing ones.
 * When a published lobby bundle stores that continuation, the log is kept only if the decisions match.
 */
export function buildProcessReplay(request: { archetypeId: string; candidateId: number; continuationId: string }): ProcessReplayFile {
  const { archetypeId, candidateId, continuationId } = request;
  const opened = openVerifiedSemanticHandoff({ archetypeId, candidateId });
  if (!opened) throw new Error(`verified Z0 for ${archetypeId} candidate ${candidateId} is not stored`);
  const { record, handoff } = opened;
  const branch = Number(continuationId.slice(1));
  const identity = { archetypeId: record.identity.archetypeId, candidateId: record.identity.candidateId };
  const seed = naturalContinuationSeed(identity, branch);
  const recipe = continuationRecipesFor(identity.archetypeId, identity.candidateId).recipes[branch - 1];
  if (!recipe || recipe.id !== naturalContinuationId(branch) || recipe.seed !== seed) {
    throw new Error(`${continuationId} recipe does not match the stored continuation`);
  }
  const profile = architecturalIntentFor(identity.archetypeId);
  const { transform } = createIntegratedEmphasis(handoff.selected.simulationState, profile, recipe.schedule);
  const plates: Uint8Array[] = [];
  const iterations: number[] = [];
  const sampling = sampleFromParent(
    handoff.selected.simulationState,
    handoff,
    record,
    seed,
    DEFAULT_EVENT_CONFIG,
    transform,
    (state) => {
      const plate = downsample(state.trails, state.trailSize, VIEWER_TRAIL_SIZE);
      iterations.push(state.iteration);
      plates.push(quantize(plate.trails, plate.peak));
    },
  );
  const stored = readStoredDecisions(archetypeId, candidateId, continuationId);
  const live = sampling.samples.map((sample) => `${sample.iteration}:${sample.reason}:${sample.measures.delta.toFixed(8)}`);
  if (stored && live.join("|") !== stored.join("|")) {
    throw new Error("process replay keep/skip decisions do not match the stored continuation");
  }
  const origin = sampling.samples[0]?.iteration ?? sampling.z0.iteration;
  const horizon = DEFAULT_EVENT_CONFIG.horizon;
  if (plates.length !== horizon + 1 || iterations.length !== horizon + 1) {
    throw new Error(`process replay logged ${plates.length} plates, expected ${horizon + 1}`);
  }
  for (let step = 0; step < iterations.length; step += 1) {
    if (iterations[step] !== origin + step) throw new Error(`missing iteration ${origin + step}`);
  }
  const accepted = new Map(sampling.samples.map((sample) => [sample.iteration, sample.reason]));
  const packed = new Uint8Array(plates.length * VIEWER_TRAIL_SIZE * VIEWER_TRAIL_SIZE);
  plates.forEach((plate, index) => packed.set(plate, index * plate.length));
  return {
    contract: PROCESS_REPLAY_CONTRACT,
    role: "visualization-only",
    archetypeId,
    candidateId,
    continuationId,
    z0Iteration: origin,
    horizon,
    parentChecksum: sampling.startChecksum,
    trailSize: VIEWER_TRAIL_SIZE,
    decisions: iterations.map((iteration) => ({ iteration, reason: accepted.get(iteration) ?? null })),
    plates: Buffer.from(packed).toString("base64"),
  };
}

function readStoredDecisions(archetypeId: string, candidateId: number, continuationId: string) {
  const file = join(process.cwd(), "data", "skill3", "published-lobby", `${archetypeId}-${candidateId}.json`);
  if (!existsSync(file)) return null;
  const bundle = JSON.parse(readFileSync(file, "utf8")) as {
    continuations?: { id: string; events?: ContinuationEvent[] }[];
  };
  const continuation = bundle.continuations?.find((item) => item.id === continuationId);
  if (!continuation?.events?.length) return null;
  return continuation.events.map((event) => `${event.iteration}:${event.reason}:${event.delta.toFixed(8)}`);
}
