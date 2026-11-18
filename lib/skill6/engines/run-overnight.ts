/**
 * Overnight batch: exact 2, 3, 4, then the validated 5s, then 6, then 7.
 * Writes data/skill6/experiments/clustering-overnight-v1/. Historical collections and the catalog are not rewritten.
 * Resumable. Run: npx tsx lib/skill6/engines/run-overnight.ts
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "../assembly";
import { displaySizeOfCount, SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterAssembly, type ClusterMorphology, type ClusterRecord, type ClusterSize, type GrowthDirection, type Skill6Pose } from "../contract";
import { measureEnvelope, scanCrossings } from "../envelope";
import { solidSummary, type PatchMesh } from "../patch";
import { crossingReport } from "../refine-mesh";
import { loadArchetypeMeshes, type ArchetypeMesh } from "../source";
import { createBoard, placementKey, type EngineOutcome } from "./board";
import { runGraph } from "./graph";
import { readShape, shapeSummary } from "./morphology";
import { loadDockPool } from "./pool";
import { runRule } from "./rule";
import { runWfc } from "./wfc";

const COLLECTION = "clustering-overnight-v1";
const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", COLLECTION);
const ROOT = "open-hall";
const SEED = 101;
const TESTS_PER_TILE = 120;
const ASSEMBLIES = 2;
const PER_DIRECTION = 3;
const SIZES = [2, 3, 4, 5, 6, 7] as const;
const MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching"];
const ENGINES = ["rule", "graph", "wfc"] as const;
type EngineId = (typeof ENGINES)[number];
const ALLOWED = new Set<GrowthDirection>(SKILL6_GROWTH_DIRECTIONS);

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
  reverifyMilliseconds: number | null;
  tests: number;
  alternatives: number;
  attempts: Attempt[];
  geometry: string;
  duplicateOf: string | null;
  shape: ReturnType<typeof shapeSummary> | null;
  trace: string;
  reason: string | null;
  reusedFrom: string | null;
  memory: { rss: number; heapUsed: number };
};

type Report = {
  version: string;
  note: string;
  budget: { testsPerTile: number; assembliesPerJob: number; perDirection: number; seed: number; rootId: string };
  pool: { candidates: number; bySource: Record<string, number>; checked: true };
  attempted: number;
  validated: ClusterRecord[];
  records: ClusterRecord[];
  diagnostics: { id: string; targetTiles: number; rootId: string; seed: number; status: string; tiles: number; reason: string }[];
  validation: Record<string, never>;
  provisional: string[];
  rows: Row[];
};

function memory() {
  const used = process.memoryUsage();
  return { rss: used.rss, heapUsed: used.heapUsed };
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

function geometryOf(record: ClusterRecord): string {
  return createHash("sha1").update(placementKey(record.tiles)).digest("hex").slice(0, 12);
}

function decodeMesh(encoded: { positions: string; indices: string }): PatchMesh {
  const positions = new Uint8Array(Buffer.from(encoded.positions, "base64"));
  const indices = new Uint8Array(Buffer.from(encoded.indices, "base64"));
  return {
    positions: new Float32Array(positions.buffer, positions.byteOffset, positions.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

function poseFor(record: ClusterRecord, instanceId: string): Skill6Pose | null {
  return record.assembly?.seatedTiles.find((tile) => tile.instanceId === instanceId)?.pose
    ?? record.tiles.find((tile) => tile.instanceId === instanceId)?.pose
    ?? null;
}

function contactReasons(record: ClusterRecord, meshes: Map<string, ArchetypeMesh>): string[] {
  const reasons: string[] = [];
  if (record.contacts.length < Math.max(0, record.tiles.length - 1)) reasons.push(`${record.contacts.length} contacts for ${record.tiles.length} tiles`);
  for (const contact of record.contacts) {
    const hostTile = record.tiles.find((tile) => tile.instanceId === contact.hostId);
    const guestTile = record.tiles.find((tile) => tile.instanceId === contact.guestId);
    const host = hostTile ? meshes.get(hostTile.archetypeId) : undefined;
    const guest = guestTile ? meshes.get(guestTile.archetypeId) : undefined;
    const hostPose = poseFor(record, contact.hostId);
    const guestPose = poseFor(record, contact.guestId);
    if (!host || !guest || !hostPose || !guestPose) {
      reasons.push(`contact ${contact.hostId}–${contact.guestId} is missing a mesh or pose`);
      continue;
    }
    const reading = measureEnvelope(host, guest, hostPose, guestPose);
    const crossing = scanCrossings(host, guest, hostPose, guestPose);
    const label = `${hostTile?.archetypeId}–${guestTile?.archetypeId}`;
    if (reading.coherentRegions !== 1) reasons.push(`${label} has ${reading.coherentRegions} contact regions`);
    if (reading.contactArea < SKILL6_PARAMETERS.minContactArea) reasons.push(`${label} contact area ${reading.contactArea.toFixed(2)}`);
    if (reading.residualGap == null || reading.residualGap > SKILL6_PARAMETERS.contactTolerance) reasons.push(`${label} residual gap ${reading.residualGap ?? "missing"}`);
    if (reading.normalAlignment == null || reading.normalAlignment > -SKILL6_PARAMETERS.normalOpposition) reasons.push(`${label} normal alignment ${reading.normalAlignment ?? "missing"}`);
    if (crossing.count > SKILL6_PARAMETERS.maxIntersectingTriangles || crossing.deepest > SKILL6_PARAMETERS.maxPenetration) {
      reasons.push(`${label} crossing count ${crossing.count}, depth ${crossing.deepest.toFixed(3)}`);
    }
  }
  return reasons;
}

function growthReasons(assembly: ClusterAssembly, tiles: number): string[] {
  const reasons: string[] = [];
  const guests = assembly.growth.filter((step) => step.placement !== "seed");
  if (!assembly.growth.some((step) => step.placement === "seed")) reasons.push("no grounded seed");
  if (guests.length !== tiles - 1) reasons.push(`${guests.length} growth steps for ${tiles} tiles`);
  for (const step of guests) {
    if (!step.direction || !ALLOWED.has(step.direction)) reasons.push(`${step.archetypeId} grows on ${step.direction ?? "no direction"}`);
  }
  return reasons;
}

function generate(engine: EngineId, job: { id: string; seed: number; tiles: number; rootId: string; morphology: ClusterMorphology; budget: number }, meshes: ReturnType<typeof loadArchetypeMeshes>, pool: ReturnType<typeof loadDockPool>): EngineOutcome {
  if (engine === "rule") return runRule(meshes, pool, job);
  const board = createBoard(meshes);
  if (engine === "graph") return runGraph(board, pool, job);
  return runWfc(board, pool, job);
}

function sourceOf(engine: EngineId, morphology: ClusterMorphology, tiles: number): { directory: string; id: string; meshCheck: boolean } | null {
  if (tiles === 5) return { directory: path.join(process.cwd(), "data", "skill6", "experiments", "clustering-five-tile-v1"), id: `ft-${engine}-${morphology}-5`, meshCheck: false };
  if (tiles === 3 || tiles === 4) return { directory: path.join(process.cwd(), "data", "skill6", "experiments", "initial-clustering-coverage"), id: `lab-${engine}-${morphology}-${tiles}`, meshCheck: true };
  return null;
}

async function meshReasons(meshPath: string): Promise<string[]> {
  const reasons: string[] = [];
  if (!existsSync(meshPath)) return ["refined mesh file is missing"];
  const stored = JSON.parse(readFileSync(meshPath, "utf8")) as { refined: { positions: string; indices: string; triangles: number } | null };
  if (!stored.refined) return ["refined mesh file is missing"];
  const mesh = decodeMesh(stored.refined);
  if (mesh.indices.length / 3 !== stored.refined.triangles) reasons.push("refined triangle count does not match the file");
  const solid = await solidSummary(mesh);
  if (solid.status !== "NoError") reasons.push(`recheck refined status ${solid.status}`);
  if (solid.components !== 1) reasons.push(`recheck refined has ${solid.components} bodies`);
  if ((solid.cavities ?? 0) > 0) reasons.push(`recheck ${solid.cavities} cavities`);
  const crossing = crossingReport(mesh);
  if (crossing.penetrations > 0 || crossing.maxPenetration > SKILL6_PARAMETERS.maxPenetration) {
    reasons.push(`recheck ${crossing.penetrations} penetrations, max ${crossing.maxPenetration.toFixed(3)}`);
  }
  return reasons;
}

async function main() {
  mkdirSync(path.join(DIRECTORY, "geometry"), { recursive: true });
  const cachePath = path.join(DIRECTORY, "pair-checks.json");
  const cacheSource = path.join(process.cwd(), "data", "skill6", "experiments", "clustering-five-tile-v1", "pair-checks.json");
  if (!existsSync(cachePath) && existsSync(cacheSource)) copyFileSync(cacheSource, cachePath);
  const indexPath = path.join(DIRECTORY, "index.json");
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: PER_DIRECTION, cachePath });
  const report: Report = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as Report : {
    version: COLLECTION,
    note: "Exact 2 through 7 tiles for Rule, Graph, and WFC, Compact and Branching. Validated 3-, 4-, and 5-tile meshes are copied when they still pass. Six is searched for every combination. Seven is searched only after that combination validated at six. Not promoted.",
    budget: { testsPerTile: TESTS_PER_TILE, assembliesPerJob: ASSEMBLIES, perDirection: PER_DIRECTION, seed: SEED, rootId: ROOT },
    pool: { candidates: pool.candidates.length, bySource: {}, checked: true },
    attempted: 0,
    validated: [],
    records: [],
    diagnostics: [],
    validation: {},
    provisional: [
      "Historical collections are read and copied. They are not rewritten.",
      "A result is validated only when the placed count equals the request and the refined mesh passes.",
      "A shorter clean mesh is partial. A failed mesh is not partial.",
      "Seven tiles is a new search from the same seed. It runs only when the six-tile result for that engine and morphology validated.",
    ],
    rows: [],
  };
  const bySource: Record<string, number> = {};
  for (const candidate of pool.candidates) bySource[candidate.source] = (bySource[candidate.source] ?? 0) + 1;
  report.pool = { candidates: pool.candidates.length, bySource, checked: true };
  console.log(`pool ${pool.candidates.length}`, bySource);
  const save = () => {
    report.attempted = report.rows.length;
    writeFileSync(indexPath, JSON.stringify(report, null, 1));
  };
  const assembled = new Map<string, { id: string; assembly: ClusterAssembly; reasons: string[] }>();

  for (const tiles of SIZES) {
    for (const morphology of MORPHOLOGIES) {
      for (const engine of ENGINES) {
        const id = `on-${engine}-${morphology}-${tiles}`;
        if (report.rows.some((row) => row.id === id)) {
          console.log("skip", id);
          continue;
        }
        if (tiles === 7) {
          const prior = report.rows.find((row) => row.id === `on-${engine}-${morphology}-6`);
          if (!prior?.validated) {
            const reason = "Not attempted: the 6-tile run did not validate, so there is no validated assembly to extend.";
            report.rows.push({
              id, engine, morphology, targetTiles: tiles, size: "medium", tiles: 0, status: "unsuccessful", stop: "not-attempted", validated: false, partial: false,
              penetrations: null, maxPenetration: null, lift: null, milliseconds: 0, searchMilliseconds: 0, assemblyMilliseconds: 0, reverifyMilliseconds: null,
              tests: 0, alternatives: 0, attempts: [], geometry: "", duplicateOf: null, shape: null, trace: "", reason, reusedFrom: null, memory: memory(),
            });
            report.diagnostics.push({ id, targetTiles: tiles, rootId: ROOT, seed: SEED, status: "unsuccessful", tiles: 0, reason });
            save();
            console.log("not attempted", id);
            continue;
          }
        }

        const source = sourceOf(engine, morphology, tiles);
        if (source && existsSync(path.join(source.directory, "index.json"))) {
          const sourceReport = JSON.parse(readFileSync(path.join(source.directory, "index.json"), "utf8")) as { rows: Row[]; records: ClusterRecord[] };
          const sourceRow = sourceReport.rows.find((row) => row.id === source.id);
          const sourceRecord = sourceReport.records.find((record) => record.id === source.id);
          const exact = sourceRow && sourceRecord?.assembly && sourceRow.validated && sourceRow.tiles === tiles && sourceRecord.tiles.length === tiles;
          if (exact && sourceRecord.assembly) {
            const started = Date.now();
            const record = JSON.parse(JSON.stringify(sourceRecord)) as ClusterRecord;
            const assembly = record.assembly;
            if (!assembly) throw new Error(`${source.id} lost its assembly.`);
            const reasons = [
              ...finalCheck(assembly, true),
              ...growthReasons(assembly, record.tiles.length),
              ...contactReasons(record, byId),
              ...(source.meshCheck ? await meshReasons(path.join(source.directory, `${source.id}.mesh.json`)) : []),
            ];
            if (reasons.length === 0) {
              const hash = geometryOf(record);
              const fromMesh = path.join(source.directory, `${source.id}.mesh.json`);
              copyFileSync(fromMesh, path.join(DIRECTORY, `${id}.mesh.json`));
              const hashed = path.join(source.directory, "geometry", `${hash}.mesh.json`);
              if (existsSync(hashed)) copyFileSync(hashed, path.join(DIRECTORY, "geometry", `${hash}.mesh.json`));
              record.id = id;
              assembly.meshFile = `data/skill6/experiments/${COLLECTION}/${id}.mesh.json`;
              if (record.search) record.search.trace = `${record.search.trace ?? ""} · reused ${source.id}; not regenerated`;
              const reverifyMilliseconds = Date.now() - started;
              const row: Row = {
                ...sourceRow,
                id,
                targetTiles: tiles,
                size: displaySizeOfCount(tiles) ?? "small",
                tiles,
                validated: true,
                partial: false,
                reverifyMilliseconds,
                geometry: hash,
                duplicateOf: report.rows.find((item) => item.geometry === hash)?.id ?? null,
                reusedFrom: source.id,
                shape: sourceRow.shape ?? shapeSummary(readShape(record.tiles, record.contacts, byId)),
                reason: `Reused ${source.id}. The mesh was not regenerated.`,
                trace: record.search?.trace ?? "",
                memory: memory(),
                attempts: [{ candidate: source.id, tiles, passed: true, reasons: [], lift: assembly.ground.lift, penetrations: assembly.refined.parameters.penetrations ?? 0, maxPenetration: assembly.refined.parameters.maxPenetration ?? 0, milliseconds: reverifyMilliseconds, reusedFrom: source.id }],
              };
              report.rows.push(row);
              report.records.push(record);
              report.validated.push(record);
              report.diagnostics.push({ id, targetTiles: tiles, rootId: ROOT, seed: SEED, status: record.status, tiles, reason: row.reason ?? "" });
              assembled.set(hash, { id, assembly, reasons: [] });
              save();
              console.log(id, "reused", source.id, `${reverifyMilliseconds}ms`);
              continue;
            }
            console.log(id, "stored result does not pass; generating", reasons.join("; "));
          }
        }
        if (tiles === 5) {
          const reason = "The validated five-tile mesh could not be reused. It was not regenerated.";
          report.rows.push({
            id, engine, morphology, targetTiles: tiles, size: "medium", tiles: 0, status: "unsuccessful", stop: "missing", validated: false, partial: false,
            penetrations: null, maxPenetration: null, lift: null, milliseconds: 0, searchMilliseconds: 0, assemblyMilliseconds: 0, reverifyMilliseconds: null,
            tests: 0, alternatives: 0, attempts: [], geometry: "", duplicateOf: null, shape: null, trace: "", reason, reusedFrom: null, memory: memory(),
          });
          report.diagnostics.push({ id, targetTiles: tiles, rootId: ROOT, seed: SEED, status: "unsuccessful", tiles: 0, reason });
          save();
          console.log("missing", id);
          continue;
        }

        const started = Date.now();
        console.log("run", id);
        const outcome = generate(engine, { id, seed: SEED, tiles, rootId: ROOT, morphology, budget: TESTS_PER_TILE * tiles }, meshes, pool);
        const searchMilliseconds = Date.now() - started;
        const candidates = [outcome.record, ...outcome.alternatives.filter((alt) => alt.tiles.length >= outcome.record.tiles.length)];
        const attempts: Attempt[] = [];
        let chosen: ClusterRecord = outcome.record;
        let passed = false;
        let cleanShort = false;
        let assemblyMilliseconds = 0;
        for (const candidate of candidates.slice(0, ASSEMBLIES)) {
          if (candidate.tiles.length < 2) break;
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
              reasons = [
                ...finalCheck(assembly, Boolean(built.meshes.refined)),
                ...growthReasons(assembly, candidate.tiles.length),
                ...contactReasons({ ...candidate, assembly }, byId),
              ];
              if (built.meshes.refined) {
                writeFileSync(path.join(DIRECTORY, "geometry", `${hash}.mesh.json`), JSON.stringify({
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
          const exactCount = candidate.tiles.length === tiles;
          const clean = reasons.length === 0;
          attempts.push({
            candidate: candidate.id,
            tiles: candidate.tiles.length,
            passed: clean && exactCount,
            reasons: exactCount ? reasons : [`${candidate.tiles.length} of ${tiles} tiles`, ...reasons],
            lift: assembly.ground.lift,
            penetrations: assembly.refined.parameters.penetrations ?? 0,
            maxPenetration: assembly.refined.parameters.maxPenetration ?? 0,
            milliseconds: Date.now() - assemblyStarted,
            reusedFrom,
          });
          console.log(`  ${candidate.id} ${candidate.tiles.length} tiles ${clean && exactCount ? "passed" : `failed: ${attempts.at(-1)?.reasons.join("; ")}`}${reusedFrom ? ` (reused ${reusedFrom})` : ""}`);
          if (clean && exactCount) {
            chosen = candidate;
            passed = true;
            break;
          }
          if (clean) {
            chosen = candidate;
            cleanShort = true;
          }
        }
        if (!passed && !cleanShort) chosen = outcome.record;
        const stored = path.join(DIRECTORY, "geometry", `${geometryOf(chosen)}.mesh.json`);
        if (chosen.assembly && existsSync(stored)) copyFileSync(stored, path.join(DIRECTORY, `${id}.mesh.json`));
        chosen.id = id;
        const validated = passed && chosen.tiles.length === tiles;
        const partial = !validated && cleanShort;
        if (!validated && chosen.assembly) {
          chosen.status = partial ? "accepted" : "unsuccessful";
          chosen.reason = partial
            ? `Partial: ${chosen.tiles.length} of ${tiles} tiles. The refined cluster passed the geometric checks. ${chosen.reason ?? ""}`.trim()
            : `Final validation failed: ${attempts.map((attempt) => `${attempt.candidate} ${attempt.reasons.join("; ")}`).join(" | ")}`.trim();
        }
        const geometry = chosen.tiles.length > 0 ? geometryOf(chosen) : "";
        const duplicateOf = geometry ? report.rows.find((row) => row.geometry === geometry)?.id ?? null : null;
        const shape = chosen.tiles.length > 0 ? shapeSummary(readShape(chosen.tiles, chosen.contacts, byId)) : null;
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
          reverifyMilliseconds: null,
          tests: chosen.search?.evaluations ?? 0,
          alternatives: outcome.alternatives.length,
          attempts,
          geometry,
          duplicateOf,
          shape,
          trace: chosen.search?.trace ?? "",
          reason: chosen.reason,
          reusedFrom: attempts.find((attempt) => attempt.passed)?.reusedFrom ?? null,
          memory: memory(),
        };
        report.rows.push(row);
        report.records.push(chosen);
        if (validated) report.validated.push(chosen);
        report.diagnostics.push({ id, targetTiles: tiles, rootId: ROOT, seed: SEED, status: chosen.status, tiles: chosen.tiles.length, reason: chosen.reason ?? (validated ? "Validated." : partial ? "Partial." : "Not validated.") });
        save();
        const flag = shape && (morphology === "branching" && shape.branchPoints === 0 ? "chain" : shape.minJointArea < 8 ? "narrow joint" : "");
        console.log(id, `${chosen.tiles.length}/${tiles}`, validated ? "validated" : partial ? "partial" : "not validated", `${row.milliseconds}ms`, duplicateOf ? `same as ${duplicateOf}` : "", flag);
      }
    }
  }
  save();
  console.log("overnight batch", report.rows.filter((row) => row.validated).length, "validated of", report.rows.length);
}

main();
