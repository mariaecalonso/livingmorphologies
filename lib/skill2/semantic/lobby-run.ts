import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isLobbyArchetype } from "../../skill1/lobby-realization";
import { runSemanticEvolution } from "./controller";
import { evaluateLobbyCandidate, type SemanticEvaluation } from "./evaluate";
import type { ArchetypeSearchAdapter } from "./adapter";
import { deriveG01Fidelity, fidelityDetailFor } from "./fidelity-method";
import { encodeGrayPng } from "./gray-png";
import { createLobbyAdapter } from "./lobby-adapter";
import { mutateSemanticPlan } from "./mutation";
import type { SemanticPlan, SemanticRun, SemanticSearchConfig, RealizationState } from "./types";

/** New semantic records. Legacy pose runs stay in `data/evolution`. */
export const SEMANTIC_RUN_ROOT = join("data", "semantic-runs");

export type InspectionPreview = { size: number; pixels: Uint8Array };

export type LobbySemanticBatch = {
  run: SemanticRun;
  previews: Map<number, InspectionPreview>;
};

export function semanticRunDirectory(archetypeId: string, root = SEMANTIC_RUN_ROOT) {
  if (!/^[a-z0-9-]+$/.test(archetypeId)) throw new Error(`unsafe archetype id ${archetypeId}`);
  const directory = join(root, archetypeId);
  if (directory.replace(/\\/g, "/").includes("/evolution/") || directory.replace(/\\/g, "/").endsWith("/evolution")) {
    throw new Error("semantic runs are not written into the legacy pose catalog");
  }
  return directory;
}

export function loadSemanticRun(archetypeId: string, root = SEMANTIC_RUN_ROOT): SemanticRun | null {
  const file = join(semanticRunDirectory(archetypeId, root), "run.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as SemanticRun;
}

/**
 * Full semantic search for one Lobby archetype.
 * A checkpoint writes `run.json` after every completed evaluation.
 * Fidelity is derived from stored G01 and is not a second simulation.
 */
export function runLobbySemanticSearch(
  archetypeId: string,
  config: SemanticSearchConfig,
  evaluate: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation = evaluateLobbyCandidate,
  options?: {
    previous?: SemanticRun | null;
    root?: string;
    checkpoint?: boolean;
    mutate?: typeof mutateSemanticPlan;
    afterG01?: (run: SemanticRun) => { block?: string } | void;
    adapter?: ArchetypeSearchAdapter;
  },
): LobbySemanticBatch {
  const adapter = options?.adapter ?? lobbyAdapter(archetypeId);
  const previews = new Map<number, InspectionPreview>();
  const root = options?.root ?? SEMANTIC_RUN_ROOT;
  const run = runSemanticEvolution({
    config,
    adapter,
    evaluate,
    previous: options?.previous,
    mutate: options?.mutate,
    afterG01: options?.afterG01,
    onEvaluated: (candidate, evaluation) => {
      if (evaluation.preview) previews.set(candidate.id, { size: evaluation.previewSize, pixels: evaluation.preview });
    },
    checkpoint: options?.checkpoint ? (current) => saveLobbySemanticBatch({ run: current, previews }, root) : undefined,
  });
  return { run, previews };
}

/**
 * Recompute `g01-lower-mode-v1` from candidates already stored on the run.
 * Does not simulate.
 */
export function recomputeStoredG01Fidelity(
  run: SemanticRun,
  source: Pick<ArchetypeSearchAdapter, "archetypeId" | "primaryFamilyGene" | "genes" | "readGene"> = lobbyAdapter(run.archetypeId),
): SemanticRun {
  const record = deriveG01Fidelity(
    run.candidates.filter((candidate) => candidate.generation === 1),
    source,
  );
  return {
    ...run,
    fidelityCalibration: record,
    fidelityProfileId: record.method,
    calibration: record.status === "block" ? "uncalibrated" : "calibrated",
    provisional: run.purpose !== "production" || record.status !== "pass",
    candidates: run.candidates.map((candidate) =>
      candidate.generation === 1 ? { ...candidate, fidelity: fidelityDetailFor(candidate, record) } : candidate,
    ),
  };
}

/**
 * One generation of independent Lobby explorers.
 * Uncalibrated. No fidelity pass. No mutation. No G02–G04.
 * Every evaluated candidate is kept, including technical failures.
 */
export function runLobbyCalibration(args: {
  archetypeId: string;
  count: number;
  runSeed: number;
  duplicateAttemptBudget: number;
  evaluate?: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation;
  checkpoint?: boolean;
  root?: string;
}): LobbySemanticBatch {
  if (args.count < 1) throw new Error("calibration count is required");
  return runLobbySemanticSearch(
    args.archetypeId,
    {
      purpose: "calibration",
      populationSize: args.count,
      generations: 1,
      runSeed: args.runSeed,
      duplicateAttemptBudget: args.duplicateAttemptBudget,
      specialists: false,
    },
    args.evaluate,
    { checkpoint: args.checkpoint === true, root: args.root },
  );
}

/** Writes `run.json` and `previews/<id>.png`. Does not touch `data/evolution`. */
export function saveLobbySemanticBatch(batch: LobbySemanticBatch, root = SEMANTIC_RUN_ROOT) {
  const directory = semanticRunDirectory(batch.run.archetypeId, root);
  const previewDir = join(directory, "previews");
  mkdirSync(previewDir, { recursive: true });
  const run: SemanticRun = {
    ...batch.run,
    candidates: batch.run.candidates.map((candidate) => {
      const preview = batch.previews.get(candidate.id);
      if (!preview) return candidate;
      const file = join("previews", `${candidate.id}.png`).replace(/\\/g, "/");
      writeFileSync(join(directory, file), encodeGrayPng(preview.size, preview.pixels));
      return { ...candidate, preview: { size: preview.size, file } };
    }),
  };
  writeFileSync(`${join(directory, "run.json")}.tmp`, JSON.stringify(run));
  renameSync(`${join(directory, "run.json")}.tmp`, join(directory, "run.json"));
  return directory;
}

function lobbyAdapter(archetypeId: string) {
  if (!isLobbyArchetype(archetypeId)) throw new Error(`${archetypeId} is not one of the five Lobby archetypes`);
  return createLobbyAdapter(archetypeId);
}
