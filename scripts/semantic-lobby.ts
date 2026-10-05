/**
 * Semantic Lobby entry point.
 *
 * Calibration, one archetype, no reproduction:
 *   npx tsx scripts/semantic-lobby.ts calibrate --archetype vertical-void --count 100 --seed 1
 *
 * Later evolutionary search, from an explicit config file:
 *   npx tsx scripts/semantic-lobby.ts search --archetype vertical-void --config path/to/config.json
 *
 * Records are written to data/semantic-runs/<archetypeId>/.
 * data/evolution pose runs are not read or replaced.
 * This script does not choose fidelity floors or run unless those arguments are present.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSemanticRun, runLobbyCalibration, runLobbySemanticSearch, saveLobbySemanticBatch, semanticRunDirectory } from "../lib/skill2/semantic/lobby-run";
import type { SemanticSearchConfig } from "../lib/skill2/semantic/types";

const command = process.argv[2];
const archetype = flag("archetype");

if (command === "calibrate") {
  const count = Number(flag("count"));
  const seed = Number(flag("seed"));
  const budget = Number(flag("duplicate-budget", "30"));
  if (!archetype || !Number.isInteger(count) || count < 1 || !Number.isInteger(seed)) {
    throw new Error("calibrate requires --archetype, --count, and --seed");
  }
  const batch = runLobbyCalibration({
    archetypeId: archetype,
    count,
    runSeed: seed,
    duplicateAttemptBudget: budget,
    checkpoint: true,
  });
  const directory = saveLobbySemanticBatch(batch);
  console.log(`calibration ${archetype}: ${batch.run.candidates.length} explorers in ${directory}`);
} else if (command === "search") {
  const configPath = flag("config");
  if (!archetype || !configPath) throw new Error("search requires --archetype and --config");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as SemanticSearchConfig;
  if (config.purpose === "calibration") throw new Error("use the calibrate command for calibration batches");
  const previous = existsSync(join(semanticRunDirectory(archetype), "run.json")) ? loadSemanticRun(archetype) : null;
  const batch = runLobbySemanticSearch(archetype, config, undefined, { previous, checkpoint: true });
  const directory = saveLobbySemanticBatch(batch);
  console.log(`semantic search ${archetype}: ${batch.run.candidates.length} candidates in ${directory}`);
} else {
  throw new Error("use calibrate or search");
}

function flag(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1];
}
