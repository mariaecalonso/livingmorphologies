/**
 * Clustering expansion runner: five tiles first, then six, then seven where the previous size validated.
 * Writes data/skill6/experiments/clustering-expansion-v1/. Earlier collections, the catalog, and the source meshes are untouched.
 * Run: npx tsx lib/skill6/engines/run-expansion.ts
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "../assembly";
import { displaySizeOfCount, SKILL6_PARAMETERS, type ClusterAssembly, type ClusterMorphology, type ClusterRecord, type ClusterSize } from "../contract";
import { loadArchetypeMeshes } from "../source";
import { createBoard, placementKey, type EngineOutcome } from "./board";
import { runEvolution } from "./evolve";
import { runGraph } from "./graph";
import { readShape, shapeSummary } from "./morphology";
import { loadDockPool } from "./pool";
import { runRule } from "./rule";
import { runWfc } from "./wfc";

const COLLECTION = "clustering-expansion-v1";
const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", COLLECTION);
const ROOT = "open-hall";
const SEED = 101;
const SIZES = [5, 6, 7];
const TESTS_PER_TILE = 120;
const ASSEMBLIES = 2;
const PER_DIRECTION = 3;
/** Active generation. Evolutionary, vertical, and integrated stay in their modules and in earlier collections. */
const MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching"];
const ENGINES = ["rule", "graph", "wfc"] as const;
type EngineId = (typeof ENGINES)[number];

type Attempt = {
  candidate: string;
  tiles: number;
  passed: boolean;
  reasons: string[];
  lift: number | null;
  penetrations: number | null;
  maxPenetration: number | null;
  milliseconds: number;
  reusedFrom: string | null;
};

type Row = {
  id: string;
  engine: EngineId;
  morphology: ClusterMorphology;
  targetTiles: number;
  size: ClusterSize;
  tiles: number;
  status: ClusterRecord["status"];
  stop: string | null;
  validated: boolean;
  partial: boolean;
  penetrations: number | null;
  maxPenetration: number | null;
  lift: number | null;
  milliseconds: number;
  searchMilliseconds: number;
  assemblyMilliseconds: number;
  tests: number;
  alternatives: number;
  attempts: Attempt[];
  geometry: string;
  duplicateOf: string | null;
  shape: ReturnType<typeof shapeSummary>;
  trace: string;
  reason: string | null;
};

type Report = {
  version: string;
  note: string;
  budget: { testsPerTile: number; assembliesPerJob: number; perDirection: number };
  pool: { candidates: number; bySource: Record<string, number>; checked: true };
  seeds: number[];
  attempted: number;
  bySize: Record<"small" | "medium" | "large", { attempted: number; rigid: number; assembled: number; validated: number }>;
  validated: ClusterRecord[];
  records: ClusterRecord[];
  diagnostics: { id: string; targetTiles: number; rootId: string; seed: number; status: string; tiles: number; reason: string }[];
  validation: Record<string, never>;
  provisional: string[];
  rows: Row[];
};

function emptyReport(pool: ReturnType<typeof loadDockPool>): Report {
  const bySource: Record<string, number> = {};
  for (const candidate of pool.candidates) bySource[candidate.source] = (bySource[candidate.source] ?? 0) + 1;
  return {
    version: "clustering-expansion-v1",
    note: "Four refined engines on one pair-checked pool. Five tiles first; six and seven only where the previous size validated. Every assembly passes the full final-mesh check, including the 0.18 ground lift. Not promoted.",
    budget: { testsPerTile: TESTS_PER_TILE, assembliesPerJob: ASSEMBLIES, perDirection: PER_DIRECTION },
    pool: { candidates: pool.candidates.length, bySource, checked: true },
    seeds: [SEED],
    attempted: 0,
    bySize: {
      small: { attempted: 0, rigid: 0, assembled: 0, validated: 0 },
      medium: { attempted: 0, rigid: 0, assembled: 0, validated: 0 },
      large: { attempted: 0, rigid: 0, assembled: 0, validated: 0 },
    },
    validated: [],
    records: [],
    diagnostics: [],
    validation: {},
    provisional: [
      "The pool keeps only candidates whose pair contact and host crossing pass at identity. Each is still revalidated on the cluster.",
      "An engine may offer alternatives. At most two distinct candidates are assembled per run, and each is reported.",
      "Final validation: no failed patch, one union body, refined NoError with one body and no cavities, no penetration over 0.02, lift at or under 0.18.",
      "Identical geometry from two engines reuses the stored assembly and is marked as a duplicate.",
    ],
    rows: [],
  };
}

const GEOMETRY = path.join(DIRECTORY, "geometry");

function geometryOf(record: ClusterRecord): string {
  return createHash("sha1").update(placementKey(record.tiles)).digest("hex").slice(0, 12);
}

function finalCheck(assembly: ClusterAssembly, refined: boolean): string[] {
  const reasons: string[] = [];
  if (assembly.counts["failed-patch"] > 0) reasons.push(`${assembly.counts["failed-patch"]} failed patch`);
  if (assembly.union.components !== 1) reasons.push(`union has ${assembly.union.components} bodies`);
  if (assembly.refined.status !== "NoError") reasons.push(`refined status ${assembly.refined.status}`);
  if (assembly.refined.components !== 1) reasons.push(`refined has ${assembly.refined.components} bodies`);
  if ((assembly.refined.cavities ?? 0) > 0) reasons.push(`${assembly.refined.cavities} cavities remain`);
  if (!refined) reasons.push("no refined mesh");
  const penetrations = assembly.refined.parameters.penetrations ?? 0;
  if (penetrations > 0) reasons.push(`${penetrations} penetrations, max ${(assembly.refined.parameters.maxPenetration ?? 0).toFixed(3)} over ${SKILL6_PARAMETERS.maxPenetration}`);
  if (assembly.ground.lift > SKILL6_PARAMETERS.contactTolerance) reasons.push(`ground lift ${assembly.ground.lift.toFixed(3)} over ${SKILL6_PARAMETERS.contactTolerance}`);
  if (assembly.ground.minZAfter < -1e-3) reasons.push(`min Z ${assembly.ground.minZAfter.toFixed(3)} after lift`);
  return reasons;
}

function generate(engine: EngineId, job: { id: string; seed: number; tiles: number; rootId: string; morphology: ClusterMorphology; budget: number }, meshes: ReturnType<typeof loadArchetypeMeshes>, pool: ReturnType<typeof loadDockPool>): EngineOutcome {
  if (engine === "rule") return runRule(meshes, pool, job);
  const board = createBoard(meshes);
  if (engine === "graph") return runGraph(board, pool, job);
  if (engine === "wfc") return runWfc(board, pool, job);
  return runEvolution(board, pool, job);
}

async function main() {
  mkdirSync(GEOMETRY, { recursive: true });
  const indexPath = path.join(DIRECTORY, "index.json");
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: PER_DIRECTION, cachePath: path.join(DIRECTORY, "pair-checks.json") });
  const report = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as Report : emptyReport(pool);
  console.log(`pool ${pool.candidates.length} checked candidates`, report.pool.bySource);
  const save = () => writeFileSync(indexPath, JSON.stringify(report, null, 1));
  const assembled = new Map<string, { id: string; assembly: ClusterAssembly; reasons: string[] }>();
  for (const record of report.records) {
    if (!record.assembly) continue;
    const row = report.rows.find((item) => item.id === record.id);
    const attempt = row?.attempts.find((item) => item.passed) ?? row?.attempts.at(-1);
    const stored = path.join(GEOMETRY, `${geometryOf(record)}.mesh.json`);
    if (!existsSync(stored) && existsSync(path.join(DIRECTORY, `${record.id}.mesh.json`))) {
      copyFileSync(path.join(DIRECTORY, `${record.id}.mesh.json`), stored);
    }
    assembled.set(geometryOf(record), { id: record.id, assembly: record.assembly, reasons: attempt?.reasons ?? [] });
  }

  for (const tiles of SIZES) {
    for (const morphology of MORPHOLOGIES) {
      for (const engine of ENGINES) {
        const id = `ex-${engine}-${morphology}-${tiles}`;
        if (report.rows.some((row) => row.id === id) || report.diagnostics.some((entry) => entry.id === id)) {
          console.log("skip", id);
          continue;
        }
        if (tiles > SIZES[0]) {
          const prior = report.rows.find((row) => row.id === `ex-${engine}-${morphology}-${tiles - 1}`);
          if (!prior?.validated) {
            report.diagnostics.push({ id, targetTiles: tiles, rootId: ROOT, seed: SEED, status: "unsuccessful", tiles: 0, reason: `Not attempted: the ${tiles - 1}-tile run did not validate.` });
            save();
            console.log("not attempted", id);
            continue;
          }
        }
        const started = Date.now();
        console.log("run", id);
        const outcome = generate(engine, { id, seed: SEED, tiles, rootId: ROOT, morphology, budget: TESTS_PER_TILE * tiles }, meshes, pool);
        const searchMilliseconds = Date.now() - started;
        const candidates = [outcome.record, ...outcome.alternatives.filter((alt) => alt.tiles.length >= outcome.record.tiles.length)];
        const attempts: Attempt[] = [];
        let chosen: ClusterRecord = outcome.record;
        let passed = false;
        let assemblyMilliseconds = 0;
        for (const candidate of candidates.slice(0, ASSEMBLIES)) {
          if (candidate.tiles.length < 3) break;
          const hash = geometryOf(candidate);
          const cached = assembled.get(hash);
          const assemblyStarted = Date.now();
          let assembly: ClusterAssembly;
          let reasons: string[];
          let reusedFrom: string | null = null;
          if (cached) {
            assembly = cached.assembly;
            reasons = cached.reasons;
            reusedFrom = cached.id;
          } else {
            try {
              const built = await assembleCluster(candidate, meshes, `data/skill6/experiments/${COLLECTION}/geometry/${hash}.mesh.json`);
              assembly = built.assembly;
              reasons = finalCheck(assembly, Boolean(built.meshes.refined));
              if (built.meshes.refined) {
                writeFileSync(path.join(GEOMETRY, `${hash}.mesh.json`), JSON.stringify({
                  id: hash,
                  raw: encodeMesh(built.meshes.raw),
                  refined: encodeMesh(built.meshes.refined),
                  patches: built.meshes.patches.map((mesh) => encodeMesh(mesh)),
                }));
              }
              assembled.set(hash, { id, assembly, reasons });
            } catch (error) {
              attempts.push({ candidate: candidate.id, tiles: candidate.tiles.length, passed: false, reasons: [error instanceof Error ? error.message : "Assembly failed."], lift: null, penetrations: null, maxPenetration: null, milliseconds: Date.now() - assemblyStarted, reusedFrom: null });
              continue;
            }
          }
          assemblyMilliseconds += Date.now() - assemblyStarted;
          candidate.assembly = { ...assembly, meshFile: `data/skill6/experiments/${COLLECTION}/${id}.mesh.json` };
          attempts.push({
            candidate: candidate.id,
            tiles: candidate.tiles.length,
            passed: reasons.length === 0,
            reasons,
            lift: assembly.ground.lift,
            penetrations: assembly.refined.parameters.penetrations ?? 0,
            maxPenetration: assembly.refined.parameters.maxPenetration ?? 0,
            milliseconds: Date.now() - assemblyStarted,
            reusedFrom,
          });
          console.log(`  ${candidate.id} ${candidate.tiles.length} tiles ${reasons.length === 0 ? "passed" : `failed: ${reasons.join("; ")}`}${reusedFrom ? ` (reused ${reusedFrom})` : ""}`);
          if (reasons.length === 0) {
            chosen = candidate;
            passed = true;
            break;
          }
        }
        if (!passed) chosen = outcome.record;
        const stored = path.join(GEOMETRY, `${geometryOf(chosen)}.mesh.json`);
        if (chosen.assembly && existsSync(stored)) copyFileSync(stored, path.join(DIRECTORY, `${id}.mesh.json`));
        const alternate = chosen !== outcome.record;
        chosen.id = id;
        const reached = chosen.tiles.length >= tiles;
        const validated = passed && reached;
        const partial = passed && !reached;
        const lastAttempt = attempts.at(-1);
        if (!passed && chosen.assembly) {
          chosen.status = "unsuccessful";
          chosen.reason = `Final validation failed: ${attempts.map((attempt) => `${attempt.candidate} ${attempt.reasons.join("; ")}`).join(" | ")}. ${chosen.reason ?? ""}`.trim();
        } else if (partial) {
          chosen.status = "accepted";
          chosen.reason = `Partial: ${chosen.tiles.length} of ${tiles} tiles. The refined cluster passed. ${chosen.reason ?? ""}`.trim();
        } else if (alternate) {
          chosen.reason = `Assembled the engine's alternative after the first candidate failed: ${attempts[0].reasons.join("; ")}.`;
        }
        if (chosen.search) chosen.search.trace = `${chosen.search.trace ?? ""}${alternate ? " · alternative assembled" : ""}`;
        const geometry = geometryOf(chosen);
        const duplicateOf = report.rows.find((row) => row.geometry === geometry)?.id ?? null;
        const row: Row = {
          id,
          engine,
          morphology,
          targetTiles: tiles,
          size: displaySizeOfCount(chosen.tiles.length) ?? "small",
          tiles: chosen.tiles.length,
          status: chosen.status,
          stop: chosen.search?.stop ?? null,
          validated,
          partial,
          penetrations: chosen.assembly ? chosen.assembly.refined.parameters.penetrations ?? 0 : null,
          maxPenetration: chosen.assembly ? chosen.assembly.refined.parameters.maxPenetration ?? 0 : null,
          lift: chosen.assembly ? chosen.assembly.ground.lift : null,
          milliseconds: Date.now() - started,
          searchMilliseconds,
          assemblyMilliseconds,
          tests: chosen.search?.evaluations ?? 0,
          alternatives: outcome.alternatives.length,
          attempts,
          geometry,
          duplicateOf,
          shape: shapeSummary(readShape(chosen.tiles, chosen.contacts, byId)),
          trace: chosen.search?.trace ?? "",
          reason: chosen.reason,
        };
        report.rows.push(row);
        report.records.push(chosen);
        if (validated) report.validated.push(chosen);
        report.diagnostics.push({ id, targetTiles: tiles, rootId: ROOT, seed: SEED, status: chosen.status, tiles: chosen.tiles.length, reason: chosen.reason ?? (validated ? "Validated." : "Not validated.") });
        report.attempted = report.rows.length;
        const band = report.bySize[row.size];
        band.attempted += 1;
        if (chosen.tiles.length >= 2) band.rigid += 1;
        if (chosen.assembly) band.assembled += 1;
        if (validated) band.validated += 1;
        save();
        console.log(id, `${chosen.tiles.length}/${tiles}`, validated ? "validated" : partial ? "partial" : "not validated", `${row.milliseconds}ms`, duplicateOf ? `same as ${duplicateOf}` : "", lastAttempt ? "" : "(not assembled)");
      }
    }
  }
  console.log("clustering expansion stored", report.rows.filter((row) => row.validated).length, "validated of", report.rows.length);
}

main();
