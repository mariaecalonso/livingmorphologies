/**
 * Five-tile checkpoint. Reuses the three validated Expansion compact clusters and generates Branching at five tiles.
 * Writes data/skill6/experiments/clustering-five-tile-v1/. Expansion, earlier collections, the catalog, and the source meshes are untouched.
 * Stops at five tiles. Run: npx tsx lib/skill6/engines/run-five-tile.ts
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

const COLLECTION = "clustering-five-tile-v1";
const EXPANSION = "clustering-expansion-v1";
const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", COLLECTION);
const EXPANSION_DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", EXPANSION);
const ROOT = "open-hall";
const SEED = 101;
const TILES = 5;
const TESTS_PER_TILE = 120;
const ASSEMBLIES = 2;
const PER_DIRECTION = 3;
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
  shape: ReturnType<typeof shapeSummary>;
  trace: string;
  reason: string | null;
  reusedFrom: string | null;
  memory: { rss: number; heapUsed: number };
};

type InventoryEntry = {
  collection: string;
  id: string;
  engine: string;
  morphology: string;
  targetTiles: number;
  tiles: number;
  outcome: "complete" | "partial" | "failed";
  penetrations: number | null;
  maxPenetration: number | null;
  lift: number | null;
  unionBodies: number | null;
  refinedStatus: string | null;
  cavities: number | null;
  failedPatches: number | null;
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
  inventory: InventoryEntry[];
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
  if (record.contacts.length < record.tiles.length - 1) reasons.push(`${record.contacts.length} contacts for ${record.tiles.length} tiles`);
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

function inventoryOf(): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  for (const collection of ["initial-clustering-lab", "initial-clustering-coverage"]) {
    const file = path.join(process.cwd(), "data", "skill6", "experiments", collection, "index.json");
    if (!existsSync(file)) continue;
    const report = JSON.parse(readFileSync(file, "utf8")) as { rows?: { id: string; engine: string; morphology: string; targetTiles: number; tiles: number; validated: boolean; partial: boolean; penetrations: number | null; maxPenetration: number | null; lift?: number | null }[]; records?: ClusterRecord[] };
    const records = new Map((report.records ?? []).map((record) => [record.id, record]));
    for (const row of report.rows ?? []) {
      if (!ENGINES.includes(row.engine as EngineId) || (row.morphology !== "compact" && row.morphology !== "branching")) continue;
      if (row.tiles < 2 || row.tiles > 4) continue;
      const assembly = records.get(row.id)?.assembly;
      entries.push({
        collection,
        id: row.id,
        engine: row.engine,
        morphology: row.morphology,
        targetTiles: row.targetTiles,
        tiles: row.tiles,
        outcome: row.validated ? "complete" : row.partial ? "partial" : "failed",
        penetrations: row.penetrations,
        maxPenetration: row.maxPenetration,
        lift: assembly?.ground.lift ?? row.lift ?? null,
        unionBodies: assembly?.union.components ?? null,
        refinedStatus: assembly?.refined.status ?? null,
        cavities: assembly?.refined.cavities ?? null,
        failedPatches: assembly?.counts["failed-patch"] ?? null,
      });
    }
  }
  return entries;
}

async function reverifyCompact(engine: EngineId, meshes: Map<string, ArchetypeMesh>, report: Report, assembled: Map<string, { id: string; assembly: ClusterAssembly; reasons: string[] }>) {
  const sourceId = `ex-${engine}-compact-${TILES}`;
  const id = `ft-${engine}-compact-${TILES}`;
  if (report.rows.some((row) => row.id === id)) {
    console.log("skip", id);
    return;
  }
  const sourceReport = JSON.parse(readFileSync(path.join(EXPANSION_DIRECTORY, "index.json"), "utf8")) as { rows: Row[]; records: ClusterRecord[] };
  const sourceRow = sourceReport.rows.find((row) => row.id === sourceId);
  const source = sourceReport.records.find((record) => record.id === sourceId);
  if (!sourceRow || !source?.assembly) throw new Error(`${sourceId} is not a stored assembly.`);
  const record = JSON.parse(JSON.stringify(source)) as ClusterRecord;
  const assembly = record.assembly;
  if (!assembly) throw new Error(`${sourceId} has no assembly.`);
  const started = Date.now();
  const reasons = [
    ...finalCheck(assembly, true),
    ...growthReasons(assembly, record.tiles.length),
    ...contactReasons(record, meshes),
  ];
  if (record.tiles.length !== TILES) reasons.push(`${record.tiles.length} tiles`);
  const meshPath = path.join(EXPANSION_DIRECTORY, `${sourceId}.mesh.json`);
  const stored = JSON.parse(readFileSync(meshPath, "utf8")) as { refined: { positions: string; indices: string; triangles: number } | null };
  if (!stored.refined) reasons.push("refined mesh file is missing");
  else {
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
  }
  const hash = geometryOf(record);
  mkdirSync(path.join(DIRECTORY, "geometry"), { recursive: true });
  copyFileSync(meshPath, path.join(DIRECTORY, `${id}.mesh.json`));
  copyFileSync(path.join(EXPANSION_DIRECTORY, "geometry", `${hash}.mesh.json`), path.join(DIRECTORY, "geometry", `${hash}.mesh.json`));
  record.id = id;
  assembly.meshFile = `data/skill6/experiments/${COLLECTION}/${id}.mesh.json`;
  if (record.search) record.search.trace = `${record.search.trace ?? ""} · reused ${sourceId}; rechecked, not regenerated`;
  const validated = reasons.length === 0 && record.tiles.length === TILES;
  const reverifyMilliseconds = Date.now() - started;
  const row: Row = {
    ...sourceRow,
    id,
    validated,
    partial: false,
    milliseconds: sourceRow.milliseconds,
    reverifyMilliseconds,
    geometry: hash,
    duplicateOf: null,
    reusedFrom: sourceId,
    reason: validated ? `Reused ${sourceId}. Rechecked against the current thresholds; the mesh was not regenerated.` : `Recheck failed: ${reasons.join("; ")}`,
    trace: record.search?.trace ?? sourceRow.trace,
    memory: memory(),
    attempts: [{
      candidate: sourceId,
      tiles: record.tiles.length,
      passed: validated,
      reasons,
      lift: assembly.ground.lift,
      penetrations: assembly.refined.parameters.penetrations ?? 0,
      maxPenetration: assembly.refined.parameters.maxPenetration ?? 0,
      milliseconds: reverifyMilliseconds,
      reusedFrom: sourceId,
    }],
  };
  if (!validated) {
    record.status = "unsuccessful";
    record.reason = row.reason;
  }
  report.rows.push(row);
  report.records.push(record);
  if (validated) report.validated.push(record);
  report.diagnostics.push({ id, targetTiles: TILES, rootId: ROOT, seed: SEED, status: record.status, tiles: record.tiles.length, reason: row.reason ?? "" });
  assembled.set(hash, { id, assembly, reasons });
  console.log(id, validated ? "reverified" : `failed: ${reasons.join("; ")}`, `${reverifyMilliseconds}ms`);
}

async function main() {
  mkdirSync(path.join(DIRECTORY, "geometry"), { recursive: true });
  const cacheSource = path.join(EXPANSION_DIRECTORY, "pair-checks.json");
  const cachePath = path.join(DIRECTORY, "pair-checks.json");
  if (!existsSync(cachePath) && existsSync(cacheSource)) copyFileSync(cacheSource, cachePath);
  const indexPath = path.join(DIRECTORY, "index.json");
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: PER_DIRECTION, cachePath });
  const report: Report = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as Report : {
    version: COLLECTION,
    note: "Five-tile checkpoint. Compact reuses the validated Expansion meshes and rechecks them. Branching is generated on the same pair-checked pool, seed, and budget. Six and seven tiles are not attempted. Not promoted.",
    budget: { testsPerTile: TESTS_PER_TILE, assembliesPerJob: ASSEMBLIES, perDirection: PER_DIRECTION, seed: SEED, rootId: ROOT },
    pool: { candidates: pool.candidates.length, bySource: {}, checked: true },
    attempted: 0,
    validated: [],
    records: [],
    diagnostics: [],
    validation: {},
    provisional: [
      "Compact clusters are copied from clustering-expansion-v1 and rechecked. Their meshes are not regenerated.",
      "Branching uses the same engines, seed 101, root open-hall, and 120 tests per tile. At most two candidates are assembled.",
      "Acceptance is unchanged: exact tile count, growth on +X -X +Y -Y +Z, coherent contacts, no failed patch, one union body, one refined body, no cavities, penetration at or under 0.02, and lift at or under 0.18.",
    ],
    rows: [],
    inventory: inventoryOf(),
  };
  const bySource: Record<string, number> = {};
  for (const candidate of pool.candidates) bySource[candidate.source] = (bySource[candidate.source] ?? 0) + 1;
  report.pool = { candidates: pool.candidates.length, bySource, checked: true };
  report.inventory = inventoryOf();
  console.log(`pool ${pool.candidates.length}`, bySource, `inventory ${report.inventory.length}`);
  const save = () => {
    report.attempted = report.rows.length;
    writeFileSync(indexPath, JSON.stringify(report, null, 1));
  };
  const assembled = new Map<string, { id: string; assembly: ClusterAssembly; reasons: string[] }>();
  for (const engine of ENGINES) await reverifyCompact(engine, byId, report, assembled);
  save();

  for (const engine of ENGINES) {
    const id = `ft-${engine}-branching-${TILES}`;
    if (report.rows.some((row) => row.id === id)) {
      console.log("skip", id);
      continue;
    }
    const started = Date.now();
    console.log("run", id);
    const outcome = generate(engine, { id, seed: SEED, tiles: TILES, rootId: ROOT, morphology: "branching", budget: TESTS_PER_TILE * TILES }, meshes, pool);
    const searchMilliseconds = Date.now() - started;
    const candidates = [outcome.record, ...outcome.alternatives.filter((alt) => alt.tiles.length >= outcome.record.tiles.length)];
    const attempts: Attempt[] = [];
    let chosen: ClusterRecord = outcome.record;
    let passed = false;
    let cleanShort = false;
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
      const exact = candidate.tiles.length === TILES;
      const clean = reasons.length === 0;
      attempts.push({
        candidate: candidate.id,
        tiles: candidate.tiles.length,
        passed: clean && exact,
        reasons: exact ? reasons : [`${candidate.tiles.length} of ${TILES} tiles`, ...reasons],
        lift: assembly.ground.lift,
        penetrations: assembly.refined.parameters.penetrations ?? 0,
        maxPenetration: assembly.refined.parameters.maxPenetration ?? 0,
        milliseconds: Date.now() - assemblyStarted,
        reusedFrom,
      });
      console.log(`  ${candidate.id} ${candidate.tiles.length} tiles ${clean && exact ? "passed" : `failed: ${attempts.at(-1)?.reasons.join("; ")}`}${reusedFrom ? ` (reused ${reusedFrom})` : ""}`);
      if (clean && exact) {
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
    const validated = passed && chosen.tiles.length === TILES;
    const partial = !validated && cleanShort;
    if (!validated && chosen.assembly) {
      chosen.status = partial ? "accepted" : "unsuccessful";
      chosen.reason = partial
        ? `Partial: ${chosen.tiles.length} of ${TILES} tiles. The refined cluster passed the geometric checks. ${chosen.reason ?? ""}`.trim()
        : `Final validation failed: ${attempts.map((attempt) => `${attempt.candidate} ${attempt.reasons.join("; ")}`).join(" | ")}`.trim();
    }
    const geometry = geometryOf(chosen);
    const duplicateOf = report.rows.find((row) => row.geometry === geometry)?.id ?? null;
    const row: Row = {
      id,
      engine,
      morphology: "branching",
      targetTiles: TILES,
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
      shape: shapeSummary(readShape(chosen.tiles, chosen.contacts, byId)),
      trace: chosen.search?.trace ?? "",
      reason: chosen.reason,
      reusedFrom: attempts.find((attempt) => attempt.passed)?.reusedFrom ?? null,
      memory: memory(),
    };
    report.rows.push(row);
    report.records.push(chosen);
    if (validated) report.validated.push(chosen);
    report.diagnostics.push({ id, targetTiles: TILES, rootId: ROOT, seed: SEED, status: chosen.status, tiles: chosen.tiles.length, reason: chosen.reason ?? (validated ? "Validated." : "Not validated.") });
    save();
    console.log(id, `${chosen.tiles.length}/${TILES}`, validated ? "validated" : partial ? "partial" : "not validated", `${row.milliseconds}ms`, duplicateOf ? `same as ${duplicateOf}` : "");
  }
  save();
  console.log("five-tile checkpoint", report.rows.filter((row) => row.validated).length, "validated of", report.rows.length);
}

main();
