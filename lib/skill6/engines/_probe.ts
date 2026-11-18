/** Temporary rigid-only probe of the four refined engines. Writes only the pair-check cache. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ClusterMorphology } from "../contract";
import { loadArchetypeMeshes } from "../source";
import { createBoard, placementKey, type EngineOutcome } from "./board";
import { runEvolution } from "./evolve";
import { runGraph } from "./graph";
import { readShape, shapeSummary } from "./morphology";
import { loadDockPool } from "./pool";
import { runRule } from "./rule";
import { runWfc } from "./wfc";

const directory = path.join(process.cwd(), "data", "skill6", "experiments", "clustering-expansion-v1");
mkdirSync(directory, { recursive: true });
const meshes = loadArchetypeMeshes();
const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
let started = Date.now();
const pool = loadDockPool(meshes, { checked: true, perDirection: Number(process.argv[3] ?? 3), cachePath: path.join(directory, "pair-checks.json") });
console.log(`pool ${pool.candidates.length} checked in ${((Date.now() - started) / 1000).toFixed(1)}s`, [...new Set(pool.candidates.map((c) => c.source))].map((source) => `${source} ${pool.candidates.filter((c) => c.source === source).length}`).join(", "));
const sizes = (process.argv[2] ?? "5").split(",").map(Number);
const engines = (process.argv[4] ?? "rule,graph,wfc,evolve").split(",");
const morphologies: ClusterMorphology[] = ["compact", "branching", "vertical", "integrated"];
const keys = new Map<string, string>();
for (const tiles of sizes) {
  for (const morphology of morphologies) {
    for (const engine of engines) {
      started = Date.now();
      const job = { id: `probe-${engine}-${morphology}-${tiles}`, seed: 101, tiles, rootId: "open-hall", morphology, budget: 120 * tiles };
      const board = createBoard(meshes);
      const outcome: EngineOutcome = engine === "rule" ? runRule(meshes, pool, job) : engine === "graph" ? runGraph(board, pool, job) : engine === "wfc" ? runWfc(board, pool, job) : runEvolution(board, pool, job);
      const record = outcome.record;
      const key = placementKey(record.tiles);
      const twin = keys.get(key);
      keys.set(key, keys.get(key) ?? job.id);
      const shape = shapeSummary(readShape(record.tiles, record.contacts, byId));
      console.log(`${engine} ${morphology} ${tiles}: ${record.tiles.length}/${tiles} alts ${outcome.alternatives.map((alt) => alt.tiles.length).join(",") || "-"} ${((Date.now() - started) / 1000).toFixed(1)}s ${twin ? `SAME AS ${twin}` : ""}`);
      console.log(`   C ${shape.compact} B ${shape.branching} V ${shape.vertical} Q ${shape.quality} depth ${shape.depth} levels ${shape.levels} dirs ${shape.directions.join("")} minJoint ${shape.minJointArea} seams ${shape.groundSeams} unique ${shape.unique}`);
      console.log(`   ${record.tiles.map((tile) => tile.name).join(" > ")}`);
      console.log(`   ${record.search?.trace}`);
    }
  }
}
