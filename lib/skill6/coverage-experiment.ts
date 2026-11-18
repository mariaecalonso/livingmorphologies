/**
 * Compare rule-based-envelope-v2 with rule-based-envelope-v2.1.
 * Reads the stored pose library. Does not rewrite it.
 * Opening the catalog does not run this file.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SKILL6_COVERAGE_ALGORITHM, SKILL6_PARAMETERS, SKILL6_SHIFT_ALGORITHM, type ClusterRecord, type Skill6Pose } from "./contract";
import { CATALOG_TARGETS, COVERAGE_REPORT_PATH } from "./catalog";
import { scanCrossings } from "./envelope";
import { aggregateCoverage, aggregateTranslated } from "./grow";
import { connectedGroups } from "./metrics";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes } from "./source";
import { placeSolid, scanPlaced } from "./world-solid";

const BUDGETS = [
  { id: "tight", evaluations: 160, backtracks: 14, triesPerDepth: null },
  { id: "catalog", evaluations: 420, backtracks: 22, triesPerDepth: null },
  { id: "wide", evaluations: 800, backtracks: 40, triesPerDepth: null },
  { id: "depth-40", evaluations: 420, backtracks: 22, triesPerDepth: 40 },
  { id: "depth-80", evaluations: 800, backtracks: 40, triesPerDepth: 80 },
  { id: "depth-80-long", evaluations: 1600, backtracks: 48, triesPerDepth: 80 },
] as const;

type RunRow = {
  algorithm: string;
  budgetId: string;
  evaluationsBudget: number;
  backtracksBudget: number;
  id: string;
  seed: number;
  targetTiles: number;
  status: ClusterRecord["status"];
  maxTiles: number;
  connected: boolean;
  evaluations: number;
  untried: number;
  geometricRejections: number;
  rejectionCounts: { intersection: number; containment: number; contact: number } | null;
  depthLimit: number | null;
  backtracks: number;
  milliseconds: number;
  truncated: boolean;
  stop: string;
  reason: string | null;
  contacts: {
    verdict: string;
    contactArea: number;
    residualGap: number | null;
    normalAlignment: number;
    deepestCrossing: number;
    overlapVolume: number | null;
  }[];
};

type Report = {
  version: 1;
  algorithm: typeof SKILL6_COVERAGE_ALGORITHM;
  note: string;
  budgets: typeof BUDGETS;
  benchmark: {
    poses: number;
    agreements: number;
    disagreements: number;
    localMilliseconds: number;
    worldMilliseconds: number;
  } | null;
  runs: RunRow[];
  catalogClusters: ClusterRecord[];
};

function loadReport(): Report {
  if (!existsSync(COVERAGE_REPORT_PATH)) {
    return {
      version: 1,
      algorithm: SKILL6_COVERAGE_ALGORITHM,
      note: "v2 keeps a 20-pose depth cap and a 72-choice shuffle. v2.1 keeps every stored pose, orders axes with vertical first, and caches world-space triangle hashes. Final acceptance still uses the local triangle scan. Thresholds are unchanged.",
      budgets: BUDGETS,
      benchmark: null,
      runs: [],
      catalogClusters: [],
    };
  }
  return JSON.parse(readFileSync(COVERAGE_REPORT_PATH, "utf8")) as Report;
}

function save(report: Report) {
  mkdirSync(path.dirname(COVERAGE_REPORT_PATH), { recursive: true });
  writeFileSync(COVERAGE_REPORT_PATH, JSON.stringify(report));
}

function rowOf(algorithm: string, budgetId: string, budget: { evaluations: number; backtracks: number }, targetTiles: number, record: ClusterRecord): RunRow {
  const contacts = record.contacts.filter((contact) => contact.verdict === "surface-contact" || contact.verdict === "near-contact");
  return {
    algorithm,
    budgetId,
    evaluationsBudget: budget.evaluations,
    backtracksBudget: budget.backtracks,
    id: record.id,
    seed: record.seed,
    targetTiles,
    status: record.status,
    maxTiles: record.tiles.length,
    connected: record.tiles.length === 0 || connectedGroups(record.tiles, contacts).length === 1,
    evaluations: record.search?.evaluations ?? 0,
    untried: record.search?.untried ?? 0,
    geometricRejections: record.search?.geometricRejections ?? 0,
    rejectionCounts: record.search?.rejectionCounts ?? null,
    depthLimit: record.search?.depthLimit ?? null,
    backtracks: record.search?.backtracks ?? 0,
    milliseconds: record.search?.milliseconds ?? 0,
    truncated: record.search?.truncated ?? false,
    stop: record.search?.stop ?? "",
    reason: record.reason,
    contacts: record.contacts.map((contact) => ({
      verdict: contact.verdict,
      contactArea: contact.contactArea,
      residualGap: contact.residualGap,
      normalAlignment: contact.normalAlignment,
      deepestCrossing: contact.deepestCrossing,
      overlapVolume: contact.overlapVolume,
    })),
  };
}

function assertClear(record: ClusterRecord, meshes: ReturnType<typeof loadArchetypeMeshes>) {
  if (record.tiles.length < 2) return;
  const contacts = record.contacts.filter((contact) => contact.verdict === "surface-contact" || contact.verdict === "near-contact");
  if (connectedGroups(record.tiles, contacts).length !== 1) throw new Error(`${record.id} is not connected`);
  for (let later = 1; later < record.tiles.length; later += 1) {
    for (let earlier = 0; earlier < later; earlier += 1) {
      const host = meshes.find((mesh) => mesh.archetypeId === record.tiles[earlier].archetypeId);
      const guest = meshes.find((mesh) => mesh.archetypeId === record.tiles[later].archetypeId);
      if (!host || !guest) throw new Error(`${record.id} is missing a mesh`);
      const hit = scanCrossings(host, guest, record.tiles[earlier].pose, record.tiles[later].pose);
      if (hit.count > SKILL6_PARAMETERS.maxIntersectingTriangles) throw new Error(`${record.id} collides`);
    }
  }
}

const meshes = loadArchetypeMeshes();
const table = loadTranslatedTable();
const report = loadReport();
report.budgets = BUDGETS;
report.note = "v2 keeps a 20-pose depth cap and a 72-choice shuffle. v2.1 keeps every stored pose and orders axes with vertical first. triesPerDepth null evaluates a depth until the evaluation budget ends. triesPerDepth 40 and 80 backtrack after that many poses and leave the rest untried. The world-space hash is a search cache. Final acceptance still uses the local triangle scan. Thresholds are unchanged.";

if (!report.benchmark || report.benchmark.poses < 24) {
  const sample: { host: (typeof meshes)[number]; guest: (typeof meshes)[number]; guestPose: Skill6Pose }[] = [];
  for (const host of meshes) {
    for (const guest of meshes) {
      const known = table.poses(host.archetypeId, guest.archetypeId)[0];
      if (!known) continue;
      sample.push({ host, guest, guestPose: known.pose });
      if (sample.length >= 24) break;
    }
    if (sample.length >= 24) break;
  }
  const identity = { basis: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const, translation: [0, 0, 0] as [number, number, number] };
  const solids = new Map(sample.map((item) => [item.host.archetypeId, placeSolid(item.host, identity)]));
  let agreements = 0;
  let disagreements = 0;
  const localStarted = Date.now();
  const localHits = sample.map((item) => scanCrossings(item.host, item.guest, identity, item.guestPose));
  const localMilliseconds = Date.now() - localStarted;
  const worldStarted = Date.now();
  const worldHits = sample.map((item) => scanPlaced(solids.get(item.host.archetypeId)!, item.guest, item.guestPose));
  const worldMilliseconds = Date.now() - worldStarted;
  localHits.forEach((local, index) => {
    const world = worldHits[index];
    const localBlocked = local.count > SKILL6_PARAMETERS.maxIntersectingTriangles;
    const worldBlocked = world.count > SKILL6_PARAMETERS.maxIntersectingTriangles;
    if (localBlocked === worldBlocked && Math.abs(local.deepest - world.deepest) < 1e-4) agreements += 1;
    else disagreements += 1;
  });
  report.benchmark = { poses: sample.length, agreements, disagreements, localMilliseconds, worldMilliseconds };
  save(report);
  console.log(JSON.stringify(report.benchmark));
  if (disagreements > 0) throw new Error("World-space cache disagreed with the local triangle scan.");
}

for (const budget of BUDGETS) {
  for (const target of CATALOG_TARGETS) {
    for (const algorithm of [SKILL6_SHIFT_ALGORITHM, SKILL6_COVERAGE_ALGORITHM] as const) {
      const id = `${target.id}-${algorithm}-${budget.id}`;
      if (report.runs.some((run) => run.id === id)) continue;
      const record = algorithm === SKILL6_COVERAGE_ALGORITHM
        ? aggregateCoverage(meshes, { ...target, id, compatibility: table, triesPerDepth: budget.triesPerDepth, budget: { evaluations: budget.evaluations, backtracks: budget.backtracks } })
        : aggregateTranslated(meshes, { ...target, id, compatibility: table, budget: { evaluations: budget.evaluations, backtracks: budget.backtracks } });
      assertClear(record, meshes);
      report.runs.push(rowOf(algorithm, budget.id, budget, target.tiles, record));
      if (algorithm === SKILL6_COVERAGE_ALGORITHM) {
        const index = report.catalogClusters.findIndex((cluster) => cluster.id.startsWith(`${target.id}-`));
        const current = index >= 0 ? report.catalogClusters[index] : null;
        const better = !current
          || record.tiles.length > current.tiles.length
          || (record.tiles.length === current.tiles.length && record.status === "accepted" && current.status !== "accepted");
        if (better) {
          if (index >= 0) report.catalogClusters[index] = record;
          else report.catalogClusters.push(record);
        }
      }
      save(report);
      console.log(`${id} ${record.status} tiles ${record.tiles.length} eval ${record.search?.evaluations} untried ${record.search?.untried} ${record.search?.milliseconds}ms`);
    }
  }
}

save(report);
console.log("coverage experiment stored");
