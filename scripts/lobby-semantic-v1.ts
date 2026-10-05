/**
 * Resumable launcher for the five lobby-semantic-v1 searches.
 * One archetype at a time. `--workers` is candidate simulations inside that archetype.
 *
 *   npx tsx scripts/lobby-semantic-v1.ts --workers 5 --publish
 *   npx tsx scripts/lobby-semantic-v1.ts --archetype topographic-ground-field --workers 5 --publish
 */
import { createLobbyAdapter } from "../lib/skill2/semantic/lobby-adapter";
import { diversityFromDescriptor } from "../lib/skill2/semantic/descriptor-v1";
import { loadSemanticRun, runLobbySemanticSearch } from "../lib/skill2/semantic/lobby-run";
import {
  LOBBY_SEMANTIC_V1_ARCHETYPES,
  installLobbyDescriptorV1,
  lobbySemanticV1Config,
  mutateLobbySemanticV1,
} from "../lib/skill2/semantic/lobby-semantic-v1";
import { publishLobbyCatalog } from "./publish-lobby-catalog";

const requested = flag("archetype");
const concurrency = Math.max(1, Math.round(Number(flag("concurrency", "1"))));
const workers = Math.max(1, Math.round(Number(flag("workers", "1"))));
const publish = process.argv.includes("--publish");
if (publish && concurrency !== 1) throw new Error("publishing runs one archetype at a time; use --concurrency 1");
const publishRoot = process.env.LM_PUBLISH_WORKTREE || "C:\\Users\\User\\Desktop\\lm-skill2-publish";
const archetypes = requested ? [requested] : [...LOBBY_SEMANTIC_V1_ARCHETYPES];
const failures: string[] = [];

main();

async function main() {
  for (const archetypeId of archetypes) {
    let blocked = false;
    try {
      await runOne(archetypeId);
      console.log(`finished ${archetypeId}`);
    } catch (error) {
      blocked = true;
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${archetypeId}: ${message}`);
      console.error(`BLOCKED ${archetypeId}: ${message}`);
    }
    if (!publish) continue;
    try {
      if (blocked) publishLobbyCatalog({ archetypeId, publishRoot, status: "blocked" });
      else publishLobbyCatalog({ archetypeId, publishRoot, status: "complete" });
      console.log(`published ${archetypeId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`publishing stopped at ${archetypeId}: ${message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (failures.length && !process.exitCode) process.exitCode = 1;
}

async function runOne(archetypeId: string) {
  const config = lobbySemanticV1Config(archetypeId);
  const stored = loadSemanticRun(archetypeId);
  if (stored?.fidelityCalibration?.status === "block" || stored?.descriptorProfile?.block) {
    throw new Error(stored.descriptorProfile?.block ?? stored.fidelityCalibration?.diagnostics.blocks.join("; ") ?? "blocked");
  }
  if (stored?.descriptorProfile) {
    const diversity = diversityFromDescriptor(stored.descriptorProfile);
    if (diversity) config.diversity = diversity;
  }
  await runLobbySemanticSearch(archetypeId, config, undefined, {
    previous: stored,
    checkpoint: true,
    workers,
    mutate: mutateLobbySemanticV1,
    afterG01: installLobbyDescriptorV1,
    adapter: createLobbyAdapter(archetypeId),
  });
}

function flag(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1];
}
