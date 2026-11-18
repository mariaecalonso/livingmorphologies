/**
 * Initial Clustering Lab runner.
 * Writes data/skill6/experiments/initial-clustering-lab/. Does not touch the catalog or earlier experiments.
 * Run: npx tsx lib/skill6/engines/run.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "../assembly";
import type { ClusterMorphology, ClusterRecord } from "../contract";
import { loadArchetypeMeshes } from "../source";
import { createBoard } from "./board";
import { runEvolution } from "./evolve";
import { runGraph } from "./graph";
import { loadDockPool } from "./pool";
import { runRule } from "./rule";
import { runWfc } from "./wfc";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", "initial-clustering-coverage");
const ROOT = "open-hall";
const SEED = 101;
const MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching", "vertical", "integrated"];
const ENGINES = ["rule", "graph", "wfc", "evolve"] as const;
type EngineId = (typeof ENGINES)[number];

type Row = {
  id: string;
  engine: EngineId;
  morphology: ClusterMorphology;
  targetTiles: number;
  tiles: number;
  status: ClusterRecord["status"];
  stop: string | null;
  validated: boolean;
  partial: boolean;
  penetrations: number | null;
  maxPenetration: number | null;
  milliseconds: number;
  trace: string;
  reason: string | null;
};

type Report = {
  version: string;
  note: string;
  budget: { evaluations: number; backtracks: number; triesPerDepth: number };
  seeds: number[];
  order: "spread";
  attempted: number;
  bySize: Record<string, { attempted: number; rigid: number; assembled: number; validated: number }>;
  validated: ClusterRecord[];
  records: ClusterRecord[];
  diagnostics: { id: string; targetTiles: number; rootId: string; seed: number; status: string; tiles: number; reason: string }[];
  validation: Record<string, never>;
  provisional: string[];
  rows: Row[];
};

function emptyReport(): Report {
  return {
    version: "initial-clustering-coverage-v1",
    note: "Four engines share one candidate pool: accepted atlas poses, including adaptive seating, compatibility poses, and directional reseats. Each pose is revalidated in world space. A clean cluster shorter than its target is partial. The earlier two-tile lab is unchanged. Medium and large were not generated. Not promoted.",
    budget: { evaluations: 800, backtracks: 8, triesPerDepth: 96 },
    seeds: [SEED],
    order: "spread",
    attempted: 0,
    bySize: {
      small: { attempted: 0, rigid: 0, assembled: 0, validated: 0 },
      medium: { attempted: 0, rigid: 0, assembled: 0, validated: 0 },
      large: { attempted: 0, rigid: 0, assembled: 0, validated: 0 },
    },
    validated: [],
    records: [],
    diagnostics: [
      { id: "lab-medium", targetTiles: 7, rootId: ROOT, seed: SEED, status: "unsuccessful", tiles: 0, reason: "Medium (7–10) is selectable and was not generated in this pass." },
      { id: "lab-large", targetTiles: 11, rootId: ROOT, seed: SEED, status: "unsuccessful", tiles: 0, reason: "Large (11+) is selectable and was not generated in this pass." },
    ],
    validation: {},
    provisional: [
      "Directional reseats are generated from stored poses and accepted only after the same world-space contact and crossing tests.",
      "Each engine keeps its own search. They read the same capped pool.",
      "A cluster shorter than its target is partial. It is not counted as a completed target.",
      "Medium and large have no generated output.",
    ],
    rows: [],
  };
}

function generate(engine: EngineId, morphology: ClusterMorphology, tiles: number, meshes: ReturnType<typeof loadArchetypeMeshes>, pool: ReturnType<typeof loadDockPool>): ClusterRecord {
  const id = `lab-${engine}-${morphology}-${tiles}`;
  const job = { id, seed: SEED, tiles, rootId: ROOT, morphology };
  if (engine === "rule") return runRule(meshes, pool, job).record;
  const board = createBoard(meshes);
  if (engine === "graph") return runGraph(board, pool, job).record;
  if (engine === "wfc") return runWfc(board, pool, job).record;
  return runEvolution(board, pool, job).record;
}

async function main() {
  mkdirSync(DIRECTORY, { recursive: true });
  const indexPath = path.join(DIRECTORY, "index.json");
  const report = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as Report : emptyReport();
  const done = new Set(report.rows.map((row) => row.id));
  const meshes = loadArchetypeMeshes();
  const pool = loadDockPool(meshes);
  console.log(`pool ${pool.candidates.length} candidates, revision ${pool.revision}`);
  const jobs: { engine: EngineId; morphology: ClusterMorphology; tiles: number }[] = [];
  for (const morphology of MORPHOLOGIES) for (const engine of ENGINES) jobs.push({ engine, morphology, tiles: 3 });
  for (const engine of ENGINES) jobs.push({ engine, morphology: "compact", tiles: 4 });

  for (const job of jobs) {
    const id = `lab-${job.engine}-${job.morphology}-${job.tiles}`;
    if (done.has(id)) {
      console.log("skip", id);
      continue;
    }
    if (job.tiles === 4) {
      const prior = report.rows.find((row) => row.id === `lab-${job.engine}-compact-3`);
      if ((prior?.tiles ?? 0) < 3) {
        const row: Row = {
          id,
          engine: job.engine,
          morphology: job.morphology,
          targetTiles: 4,
          tiles: prior?.tiles ?? 0,
          status: "unsuccessful",
          stop: null,
          validated: false,
          partial: false,
          penetrations: null,
          maxPenetration: null,
          milliseconds: 0,
          trace: "skipped",
          reason: "The 3-tile compact cluster did not place 3 tiles, so the 4-tile attempt was not run.",
        };
        report.rows.push(row);
        report.diagnostics.push({ id, targetTiles: 4, rootId: ROOT, seed: SEED, status: "unsuccessful", tiles: row.tiles, reason: row.reason ?? "Not run." });
        writeFileSync(indexPath, JSON.stringify(report, null, 1));
        console.log("skip 4", job.engine);
        continue;
      }
    }
    const started = Date.now();
    console.log("run", id);
    const record = generate(job.engine, job.morphology, job.tiles, meshes, pool);
    let penetrations: number | null = null;
    let maxPenetration: number | null = null;
    let partial = false;
    let validated = false;
    if (record.tiles.length >= 3) {
      try {
        const built = await assembleCluster(record, meshes, `data/skill6/experiments/initial-clustering-coverage/${id}.mesh.json`);
        penetrations = built.assembly.refined.parameters.penetrations ?? 0;
        maxPenetration = built.assembly.refined.parameters.maxPenetration ?? 0;
        const solid = built.assembly.counts["failed-patch"] === 0
          && built.assembly.union.components === 1
          && built.assembly.refined.status === "NoError"
          && built.assembly.refined.components === 1
          && (built.assembly.refined.cavities ?? 0) === 0
          && Boolean(built.meshes.refined);
        const clear = solid && penetrations === 0;
        partial = clear;
        validated = clear && record.search?.stop === "reached" && record.tiles.length >= job.tiles;
        if (!clear) {
          record.status = "unsuccessful";
          record.reason = `Refined assembly did not pass (${penetrations} penetrations, max ${maxPenetration?.toFixed(3)}). ${record.reason ?? ""}`.trim();
        } else if (record.tiles.length < job.tiles) {
          record.status = "accepted";
          record.reason = `Partial: ${record.tiles.length} of ${job.tiles} tiles. The refined cluster passed. ${record.reason ?? ""}`.trim();
        }
        record.assembly = built.assembly;
        if (built.meshes.refined) {
          writeFileSync(path.join(DIRECTORY, `${id}.mesh.json`), JSON.stringify({
            id,
            raw: encodeMesh(built.meshes.raw),
            refined: encodeMesh(built.meshes.refined),
            patches: built.meshes.patches.map((mesh) => encodeMesh(mesh)),
          }));
        }
      } catch (error) {
        record.status = "unsuccessful";
        record.reason = error instanceof Error ? error.message : "Assembly failed.";
      }
    }
    const row: Row = {
      id,
      engine: job.engine,
      morphology: job.morphology,
      targetTiles: job.tiles,
      tiles: record.tiles.length,
      status: record.status,
      stop: record.search?.stop ?? null,
      validated,
      partial,
      penetrations,
      maxPenetration,
      milliseconds: Date.now() - started,
      trace: record.search?.trace ?? "",
      reason: record.reason,
    };
    report.rows.push(row);
    report.records.push(record);
    if (validated) report.validated.push(record);
    report.diagnostics.push({ id, targetTiles: job.tiles, rootId: ROOT, seed: SEED, status: record.status, tiles: record.tiles.length, reason: record.reason ?? (validated ? "Validated." : partial ? "Partial clean cluster." : "Not validated.") });
    report.attempted = report.rows.length;
    const band = report.bySize.small;
    band.attempted += 1;
    if (record.tiles.length >= 2) band.rigid += 1;
    if (record.assembly) band.assembled += 1;
    if (validated || partial) band.validated += 1;
    writeFileSync(indexPath, JSON.stringify(report, null, 1));
    console.log(id, record.status, record.tiles.length, validated ? "validated" : partial ? "partial" : "not validated", `${row.milliseconds}ms`, record.search?.trace ?? "");
  }
  console.log("initial clustering lab stored", report.rows.filter((row) => row.validated).length, "validated", report.rows.filter((row) => row.partial).length, "clean");
}

main();
