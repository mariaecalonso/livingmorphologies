import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEMANTIC_RUN_ROOT } from "./run-root";
import { promoteArchiveZ0, writePendingZ0 } from "./z0-snapshot";
import { isLobbyArchetype } from "../../skill1/lobby-realization";
import { runSemanticEvolution } from "./controller";
import { evaluateLobbyCandidate, evaluateSearchCandidate, type SemanticEvaluation } from "./evaluate";
import { createEvaluationPool } from "./evaluate-pool";
import type { ArchetypeSearchAdapter } from "./adapter";
import { deriveG01Fidelity, fidelityDetailFor } from "./fidelity-method";
import { encodeGrayPng } from "./gray-png";
import { visibleIds } from "./catalog";
import { createLobbyAdapter } from "./lobby-adapter";
import { mutateSemanticPlan } from "./mutation";
import type { SemanticPlan, SemanticRun, SemanticSearchConfig, RealizationState } from "./types";

export { SEMANTIC_RUN_ROOT } from "./run-root";

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
export async function runLobbySemanticSearch(
  archetypeId: string,
  config: SemanticSearchConfig,
  evaluate: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation | Promise<SemanticEvaluation> = evaluateSearchCandidate,
  options?: {
    previous?: SemanticRun | null;
    root?: string;
    checkpoint?: boolean;
    /** Simulations in flight for this archetype. Archetypes themselves stay sequential. */
    workers?: number;
    mutate?: typeof mutateSemanticPlan;
    afterG01?: (run: SemanticRun) => { block?: string } | void;
    adapter?: ArchetypeSearchAdapter;
  },
): Promise<LobbySemanticBatch> {
  const adapter = options?.adapter ?? lobbyAdapter(archetypeId);
  const previews = new Map<number, InspectionPreview>();
  const root = options?.root ?? SEMANTIC_RUN_ROOT;
  const workers = Math.max(1, options?.workers ?? 1);
  const deferDrawings = evaluate === evaluateSearchCandidate || evaluate === evaluateLobbyCandidate;
  const pool = workers > 1 && deferDrawings ? createEvaluationPool(workers) : null;
  const draw = async (plan: SemanticPlan, state: RealizationState) =>
    pool
      ? pool.evaluate(plan, state, { preview: true })
      : evaluateSearchCandidate(plan, state, { preview: true });
  try {
    const run = await runSemanticEvolution({
      config,
      adapter,
      evaluate: deferDrawings
        ? (plan, state) => (pool ? pool.evaluate(plan, state) : evaluateSearchCandidate(plan, state, { preview: false }))
        : pool
          ? (plan, state) => pool.evaluate(plan, state)
          : evaluate,
      workers,
      previous: options?.previous,
      mutate: options?.mutate,
      afterG01: options?.afterG01,
      onEvaluated: (candidate, evaluation) => {
        if (config.purpose === "production" && evaluation.z0) {
          writePendingZ0(semanticRunDirectory(archetypeId, root), candidate, evaluation.z0, config.runSeed);
        }
        delete evaluation.z0;
        if (evaluation.preview) previews.set(candidate.id, { size: evaluation.previewSize, pixels: evaluation.preview });
      },
      checkpoint: options?.checkpoint
        ? async (current, phase) => {
            if (phase === "generation" && deferDrawings) {
              for (const id of visibleIds(current.catalog)) {
                if (previews.has(id)) continue;
                const candidate = current.candidates.find((item) => item.id === id);
                if (!candidate) continue;
                const drawn = await draw(candidate.plan, candidate.state);
                if (drawn.preview) previews.set(id, { size: drawn.previewSize, pixels: drawn.preview });
              }
            }
            saveLobbySemanticBatch({ run: current, previews }, root);
            if (phase === "generation") {
              const archived = current.candidates.filter((item) => item.current.pareto).map((item) => item.id);
              promoteArchiveZ0(semanticRunDirectory(archetypeId, root), archived);
            }
          }
        : undefined,
    });
    return { run, previews };
  } finally {
    pool?.close();
  }
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
export async function runLobbyCalibration(args: {
  archetypeId: string;
  count: number;
  runSeed: number;
  duplicateAttemptBudget: number;
  evaluate?: (plan: SemanticPlan, state: RealizationState) => SemanticEvaluation;
  checkpoint?: boolean;
  root?: string;
  workers?: number;
}): Promise<LobbySemanticBatch> {
  if (args.count < 1) throw new Error("calibration count is required");
  return await runLobbySemanticSearch(
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
    { checkpoint: args.checkpoint === true, root: args.root, workers: args.workers },
  );
}

/** Writes `run.json` and `previews/<id>.png`. Does not touch `data/evolution`. */
export function saveLobbySemanticBatch(batch: LobbySemanticBatch, root = SEMANTIC_RUN_ROOT) {
  const directory = semanticRunDirectory(batch.run.archetypeId, root);
  const previewDir = join(directory, "previews");
  mkdirSync(previewDir, { recursive: true });
  const ordered = [...batch.run.candidates].sort((left, right) => left.id - right.id);
  const run: SemanticRun = {
    ...batch.run,
    candidates: ordered.map((candidate) => {
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
