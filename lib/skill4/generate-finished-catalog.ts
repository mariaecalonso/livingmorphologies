import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "../scan/isomesh";
import { adaptModule } from "./adapt";
import { runAssemblyShrinkwrap } from "./assembly-shrinkwrap";
import { rankCompatibleFaces } from "./cluster-face-pair";
import { connectClusterHybrid } from "./cluster-hybrids";
import { evaluateClusterMorphology } from "./cluster-morphology";
import { analyzeClusterVoid, placeTileMesh } from "./cluster-void";
import type { TileConnection } from "./connections";
import { type FinishedCatalog, type FinishedIteration, type FinishedProgram, FINISHED_REQUESTED } from "./finished-catalog";
import { areaStanding, programAreaRange } from "./program-area";
import { generateSizedCluster, MAX_CLUSTER_TILES, MIN_CLUSTER_TILES } from "./program-cluster";
import { CLUSTER_PROGRAMS, eligibleTiles } from "./program-tiles";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { resolveTileModule } from "./tiles";

const ATTEMPT_LIMIT = 64;
const WORKERS = 6;
const ROOT = path.join(process.cwd(), "data", "skill4");
const PROGRAMS = path.join(ROOT, "finished-programs");
const MESHES = path.join(ROOT, "finished");
const CATALOG = path.join(ROOT, "finished-catalog.json");
const LOCK = path.join(ROOT, "finished-batch.lock");
const BATCH = path.join(ROOT, "finished-batch.json");

function writeJson(file: string, body: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
}

function pack(mesh: IsoMesh) {
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return {
    triangles: mesh.triangles,
    positions: bytes(mesh.positions),
    normals: bytes(mesh.normals),
    indices: bytes(mesh.indices),
  };
}

function stripConnection(connection: TileConnection): TileConnection {
  const field = connection.generatedHybridField;
  return {
    ...connection,
    rawHybrid: null,
    validatedHybrid: null,
    generatedHybridField: field ? {
      ...field,
      candidates: field.candidates.map((candidate) => ({ ...candidate, geometry: null })),
    } : null,
  };
}

function pairCount(programId: string) {
  const tiles = eligibleTiles(programId);
  let usable = 0;
  for (let left = 0; left < tiles.length; left += 1) {
    for (let right = left; right < tiles.length; right += 1) {
      if (rankCompatibleFaces(tiles[left].id, tiles[right].id).length > 0) usable += 1;
    }
  }
  return { eligible: tiles.length, usable };
}

function emptyProgram(programId: string, name: string, reason?: string): FinishedProgram {
  return {
    programId,
    name,
    requested: FINISHED_REQUESTED,
    finished: 0,
    failed: reason ? FINISHED_REQUESTED : 0,
    validationRuns: 0,
    shrinkwrapRuns: 0,
    persisted: 0,
    reason,
    iterations: [],
  };
}

function programFile(programId: string) {
  return path.join(PROGRAMS, `${programId}.json`);
}

function meshFile(programId: string, id: string) {
  return path.join(MESHES, programId, `${id.replaceAll(":", "__")}.json`);
}

function setPhase(phase: string) {
  writeJson(BATCH, { running: true, phase });
}

function runProgram(programId: string, name: string, loaded: ReturnType<typeof loadModules>) {
  const existingFile = programFile(programId);
  if (existsSync(existingFile)) {
    const existing = JSON.parse(readFileSync(existingFile, "utf8")) as FinishedProgram;
    if (existing.finished >= FINISHED_REQUESTED || existing.reason) {
      console.log(`skip ${name}`);
      return;
    }
  }
  const pairs = pairCount(programId);
  if (pairs.usable === 0) {
    const reason = `no compatible tile pairs in the Skill 6 cache (${pairs.eligible} eligible tiles)`;
    writeJson(programFile(programId), emptyProgram(programId, name, reason));
    console.log(`${name} | ${FINISHED_REQUESTED} | 0 | ${FINISHED_REQUESTED} | 0 | 0 | 0`);
    return;
  }
  const range = programAreaRange(programId);
  const prior = existsSync(existingFile) ? JSON.parse(readFileSync(existingFile, "utf8")) as FinishedProgram : null;
  const iterations: FinishedIteration[] = prior?.iterations.slice() ?? [];
  let attempt = iterations.reduce((max, item) => Math.max(max, item.seed + 1), 0);
  let rejected = 0;
  while (iterations.length < FINISHED_REQUESTED && attempt < ATTEMPT_LIMIT) {
    const seed = attempt;
    const size = MIN_CLUSTER_TILES + (attempt % (MAX_CLUSTER_TILES - MIN_CLUSTER_TILES + 1));
    attempt += 1;
    setPhase(`Generating tiles · ${name}`);
    const cluster = generateSizedCluster(programId, size, seed);
    if (!cluster || cluster.connections.length < 1) {
      rejected += 1;
      continue;
    }
    let connections = cluster.connections.slice();
    let hybrids = true;
    for (let index = 0; index < connections.length; index += 1) {
      setPhase(`Generating hybrids · ${name} · ${index + 1} of ${connections.length}`);
      try {
        const next = connectClusterHybrid(connections[index], cluster.tiles, loaded);
        connections = connections.map((connection) => (connection.id === next.id ? next : connection));
        if ((next.validatedHybrid?.triangles ?? 0) < 1) hybrids = false;
      } catch {
        hybrids = false;
      }
      if (!hybrids) break;
    }
    if (!hybrids || connections.length !== cluster.connections.length) {
      rejected += 1;
      continue;
    }
    const worlds = [
      ...cluster.tiles.flatMap((tile) => {
        const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
        if (!geometry) return [];
        const placed = placeTileMesh(tile, geometry);
        return [{ positions: placed.positions, indices: placed.indices }];
      }),
      ...connections.flatMap((connection) => (
        connection.validatedHybrid ? [{ positions: connection.validatedHybrid.positions, indices: connection.validatedHybrid.indices }] : []
      )),
    ];
    if (worlds.length !== cluster.tiles.length + connections.length) {
      rejected += 1;
      continue;
    }
    setPhase(`Validating · ${name}`);
    setPhase(`Shrinkwrapping · ${name}`);
    const film = runAssemblyShrinkwrap(worlds);
    if (!film) {
      rejected += 1;
      continue;
    }
    const solidMeshes = [
      ...cluster.tiles.flatMap((tile) => {
        const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
        return geometry ? [placeTileMesh(tile, geometry)] : [];
      }),
      ...connections.flatMap((connection) => connection.validatedHybrid ? [connection.validatedHybrid] : []),
    ];
    const morphology = evaluateClusterMorphology(cluster.tiles, connections, programId, solidMeshes);
    if (!morphology.pass) {
      rejected += 1;
      console.log(`morphology rejected ${programId} seed ${seed} | ${morphology.score} | ${morphology.flags.join(", ")}`);
      continue;
    }
    setPhase(`Measuring void · ${name}`);
    const report = analyzeClusterVoid(cluster.tiles, connections, [film.mesh]);
    const id = `${programId}:${iterations.length}`;
    const iteration: FinishedIteration = {
      id,
      iteration: iterations.length + 1,
      seed,
      status: "FINISHED",
      tileCount: cluster.tiles.length,
      habitableArea: Math.round(report.floorSquareFeet),
      targetMin: range.min,
      targetMax: range.max,
      areaStatus: areaStanding(report.floorSquareFeet, range),
      tiles: cluster.tiles,
      connections: connections.map(stripConnection),
      validation: { executed: true, adopted: true, triangles: film.mesh.triangles, note: film.check.note },
      shrinkwrap: { executed: true, triangles: film.mesh.triangles },
      void: {
        floorSquareFeet: report.floorSquareFeet,
        volumeCubicFeet: report.volumeCubicFeet,
        verticalExtent: report.verticalExtent,
        clearance: report.clearance,
      },
    };
    if (iteration.validation.executed !== true || iteration.shrinkwrap.executed !== true || film.mesh.triangles <= 4) {
      rejected += 1;
      continue;
    }
    setPhase(`Saving · ${name}`);
    writeJson(meshFile(programId, id), { id, mesh: pack(film.mesh) });
    iterations.push(iteration);
    const program: FinishedProgram = {
      programId,
      name,
      requested: FINISHED_REQUESTED,
      finished: iterations.length,
      failed: 0,
      validationRuns: iterations.length,
      shrinkwrapRuns: iterations.length,
      persisted: iterations.length,
      iterations,
    };
    writeJson(programFile(programId), program);
    console.log(`saved ${id} | shrinkwrap ${film.mesh.triangles} tris | seed ${seed}`);
  }
  const finished = iterations.length;
  const failed = FINISHED_REQUESTED - finished;
  const reason = finished >= FINISHED_REQUESTED ? undefined : finished === 0
    ? `no shrink-wrapped cluster in ${attempt} attempts (${rejected} rejected before the shrink-wrap was adopted)`
    : `stopped at ${finished} shrink-wrapped clusters after ${attempt} attempts (${rejected} rejected)`;
  writeJson(programFile(programId), {
    programId,
    name,
    requested: FINISHED_REQUESTED,
    finished,
    failed,
    validationRuns: finished,
    shrinkwrapRuns: finished,
    persisted: finished,
    reason,
    iterations,
  } satisfies FinishedProgram);
  console.log(`${name} | ${FINISHED_REQUESTED} | ${finished} | ${failed} | ${finished} | ${finished} | ${finished}`);
}

function loadModules() {
  const records = loadSkill3HandoffRecords();
  return new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));
}

function mergeCatalog(): FinishedCatalog {
  const programs = CLUSTER_PROGRAMS.map((program) => {
    const file = programFile(program.id);
    if (!existsSync(file)) return emptyProgram(program.id, program.name);
    return JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
  });
  return { scale: "1 model unit = 1 foot", programs };
}

function launch() {
  mkdirSync(PROGRAMS, { recursive: true });
  mkdirSync(MESHES, { recursive: true });
  writeJson(LOCK, { started: new Date().toISOString() });
  writeJson(BATCH, { running: true, phase: "Generating tiles" });
  const pending = CLUSTER_PROGRAMS.filter((program) => {
    const file = programFile(program.id);
    if (!existsSync(file)) return true;
    const saved = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
    return saved.finished < FINISHED_REQUESTED && !saved.reason;
  });
  if (pending.length === 0) {
    writeJson(CATALOG, { ...mergeCatalog(), batch: { running: false, phase: "" } });
    writeJson(BATCH, { running: false, phase: "" });
    return;
  }
  const workers = Math.min(WORKERS, pending.length);
  const buckets: string[][] = Array.from({ length: workers }, () => []);
  pending.forEach((program, index) => buckets[index % workers].push(program.id));
  console.log(`${pending.length} programs across ${workers} workers`);
  const children = buckets.map((ids, index) => {
    const file = path.join("data", "skill4", "finished-jobs", `${index}.json`);
    writeJson(path.join(process.cwd(), file), ids);
    return new Promise<void>((resolve) => {
      const child = spawn(`npx tsx lib/skill4/generate-finished-catalog.ts --jobs ${file.replaceAll("\\", "/")}`, {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", () => resolve());
    });
  });
  void Promise.all(children).then(() => {
    const catalog = mergeCatalog();
    writeJson(CATALOG, { ...catalog, batch: { running: false, phase: "" } });
    writeJson(BATCH, { running: false, phase: "" });
    console.log("BATCH COMPLETE");
    for (const program of catalog.programs) {
      console.log(`${program.name} | ${program.requested} | ${program.finished} | ${program.failed} | ${program.validationRuns} | ${program.shrinkwrapRuns} | ${program.persisted}`);
    }
  });
}

const jobsFlag = process.argv.indexOf("--jobs");
if (jobsFlag < 0) {
  launch();
} else {
  const ids = JSON.parse(readFileSync(process.argv[jobsFlag + 1], "utf8")) as string[];
  const loaded = loadModules();
  for (const programId of ids) {
    if (existsSync(programFile(programId))) {
      const saved = JSON.parse(readFileSync(programFile(programId), "utf8")) as FinishedProgram;
      if (saved.finished >= FINISHED_REQUESTED || saved.reason) {
        console.log(`skip ${programId}`);
        continue;
      }
    }
    const program = CLUSTER_PROGRAMS.find((item) => item.id === programId);
    if (!program) continue;
    runProgram(program.id, program.name, loaded);
  }
}
