/** Temporary. Rule solver reach by budget and order. Writes nothing. */
import path from "node:path";
import { SKILL6_COVERAGE_ALGORITHM, SKILL6_GROWTH_DIRECTIONS } from "../contract";
import { aggregateCoverage } from "../grow";
import { loadArchetypeMeshes } from "../source";
import { loadDockPool } from "./pool";

const meshes = loadArchetypeMeshes();
const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath: path.join(process.cwd(), "data/skill6/experiments/clustering-expansion-v1/pair-checks.json") });
for (const [evaluations, order, tries, backtracks] of [[600, "spread", 96, 8], [600, "shuffle", 96, 8], [600, "spread", 24, 24], [1200, "spread", 32, 40]] as const) {
  const started = Date.now();
  const record = aggregateCoverage(meshes, {
    id: "x", seed: 101, tiles: 5, rootId: "open-hall",
    compatibility: { poses: (h, g) => pool.knownFor(h, g) },
    triesPerDepth: tries, budget: { evaluations, backtracks }, directions: SKILL6_GROWTH_DIRECTIONS,
    order, aims: false, select: "scored", organization: "compact", profile: 2, algorithm: SKILL6_COVERAGE_ALGORITHM,
  });
  console.log(evaluations, order, tries, backtracks, record.tiles.length, `${((Date.now() - started) / 1000).toFixed(1)}s`, record.search?.stop, record.search?.evaluations, record.search?.backtracks, record.reason?.slice(0, 120));
  console.log("  ", record.tiles.map((tile) => tile.name).join(" > "));
}
