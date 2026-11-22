import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "../scan/isomesh";
import { adaptModule } from "./adapt";
import { runAssemblyShrinkwrap } from "./assembly-shrinkwrap";
import { rankCompatibleFaces } from "./cluster-face-pair";
import { connectClusterHybrid } from "./cluster-hybrids";
import { evaluateClusterMorphology } from "./cluster-morphology";
import { analyzeShrinkwrapVoid, placeTileMesh } from "./cluster-void";
import type { TileConnection } from "./connections";
import { type FinishedIteration, type FinishedProgram, FINISHED_REQUESTED } from "./finished-catalog";
import { areaStanding, programAreaRange } from "./program-area";
import { generateSizedCluster, MAX_CLUSTER_TILES, MIN_CLUSTER_TILES } from "./program-cluster";
import { CLUSTER_PROGRAMS, eligibleTiles } from "./program-tiles";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { resolveTileModule } from "./tiles";

const ATTEMPT_LIMIT = 48;
const SEED_START = 100;
const WORKERS = 4;
const ROOT = path.join(process.cwd(), "data", "skill4", "iteration-run-2");
const PROGRAMS = path.join(ROOT, "programs");
const MESHES = path.join(ROOT, "meshes");
const BATCH = path.join(ROOT, "batch.json");

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

function programFile(programId: string) {
  return path.join(PROGRAMS, `${programId}.json`);
}

function meshFile(programId: string, id: string) {
  return path.join(MESHES, programId, `${id.replaceAll(":", "__")}.json`);
}

function setPhase(phase: string) {
  writeJson(BATCH, { running: true, phase });
}

function loadModules() {
  const records = loadSkill3HandoffRecords();
  return new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));
}

function runProgram(programId: string, name: string, loaded: ReturnType<typeof loadModules>) {
  const existingFile = programFile(programId);
  if (existsSync(existingFile)) {
    const existing = JSON.parse(readFileSync(existingFile, "utf8")) as FinishedProgram;
    if (existing.finished >= FINISHED_REQUESTED) {
      console.log(`skip ${name}`);
      return;
    }
  }
  const pairs = pairCount(programId);
  if (pairs.usable === 0) {
    writeJson(programFile(programId), {
      programId,
      name,
      requested: FINISHED_REQUESTED,
      finished: 0,
      failed: FINISHED_REQUESTED,
      validationRuns: 0,
      shrinkwrapRuns: 0,
      persisted: 0,
      reason: `no compatible tile pairs in the Skill 6 cache (${pairs.eligible} eligible tiles)`,
      iterations: [],
    } satisfies FinishedProgram);
    console.log(`${name} | 0 saved | no compatible pairs`);
    return;
  }
  const range = programAreaRange(programId);
  const prior = existsSync(existingFile) ? JSON.parse(readFileSync(existingFile, "utf8")) as FinishedProgram : null;
  const iterations: FinishedIteration[] = prior?.iterations.slice() ?? [];
  let attempt = SEED_START + iterations.reduce((max, item) => Math.max(max, item.seed + 1 - SEED_START), 0);
  let rejected = 0;
  while (iterations.length < FINISHED_REQUESTED && attempt < SEED_START + ATTEMPT_LIMIT) {
    const seed = attempt;
    const size = MIN_CLUSTER_TILES + (attempt % (MAX_CLUSTER_TILES - MIN_CLUSTER_TILES + 1));
    attempt += 1;
    setPhase(`Generating tiles · ${name}`);
    const cluster = generateSizedCluster(programId, size, seed);
    if (!cluster || cluster.connections.length < 1) {
      rejected += 1;
      console.log(`shape rejected ${programId} seed ${seed}`);
      continue;
    }
    let connections = cluster.connections.slice();
    let hybrids = true;
    for (let index = 0; index < connections.length; index += 1) {
      setPhase(`Generating hybrids · ${name} · ${iterations.length + 1} · ${index + 1} of ${connections.length}`);
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
      console.log(`hybrid rejected ${programId} seed ${seed}`);
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
    setPhase(`Shrinkwrapping · ${name} · ${iterations.length + 1}`);
    const film = runAssemblyShrinkwrap(worlds);
    if (!film) {
      rejected += 1;
      console.log(`shrinkwrap rejected ${programId} seed ${seed}`);
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
    setPhase(`Measuring void · ${name} · ${iterations.length + 1}`);
    const report = analyzeShrinkwrapVoid(film.mesh);
    if (!report.mesh || report.mesh.triangles <= 4 || report.floorSquareFeet <= 0) {
      rejected += 1;
      console.log(`void rejected ${programId} seed ${seed} | regions ${report.regionsBefore}`);
      continue;
    }
    const id = `${programId}:${iterations.length}`;
    const standing = areaStanding(report.floorSquareFeet, range);
    const iteration: FinishedIteration = {
      id,
      iteration: iterations.length + 1,
      seed,
      status: "FINISHED",
      tileCount: cluster.tiles.length,
      habitableArea: Math.round(report.floorSquareFeet),
      targetMin: range.min,
      targetMax: range.max,
      areaStatus: standing,
      tiles: cluster.tiles,
      connections: connections.map(stripConnection),
      validation: { executed: true, adopted: true, triangles: film.mesh.triangles, note: film.check.note },
      shrinkwrap: { executed: true, triangles: film.mesh.triangles },
      void: {
        floorSquareFeet: report.floorSquareFeet,
        volumeCubicFeet: report.volumeCubicFeet,
        verticalExtent: report.maxHeightFeet,
        clearance: report.maxHeightFeet,
      },
      review: {
        clusterWidth: morphology.width,
        clusterDepth: morphology.depth,
        clusterHeight: morphology.height,
        verticalLevels: morphology.verticalLevels,
        planSpread: morphology.planSpread,
        branches: morphology.meaningfulBranches,
        morphologyScore: morphology.score,
        morphologyPass: morphology.pass,
        regionsBefore: report.regionsBefore,
        regionsRetained: report.regionsRetained,
        voidHeight: Math.round(report.maxHeightFeet),
        voidWidth: Math.round(report.widthFeet),
        voidDepth: Math.round(report.depthFeet),
      },
    };
    setPhase(`Saving · ${name} · ${iteration.iteration}`);
    writeJson(meshFile(programId, id), { id, mesh: pack(film.mesh) });
    iterations.push(iteration);
    writeJson(programFile(programId), {
      programId,
      name,
      requested: FINISHED_REQUESTED,
      finished: iterations.length,
      failed: 0,
      validationRuns: iterations.length,
      shrinkwrapRuns: iterations.length,
      persisted: iterations.length,
      iterations,
    } satisfies FinishedProgram);
    console.log([
      `saved ${id}`,
      `tiles ${cluster.tiles.length}`,
      `${morphology.width}x${morphology.depth}x${morphology.height}`,
      `void ${Math.round(report.floorSquareFeet)} sf`,
      `${Math.round(report.volumeCubicFeet)} cf`,
      `${Math.round(report.maxHeightFeet)} ft`,
      `regions ${report.regionsBefore} -> ${report.regionsRetained}`,
      standing,
      `morphology ${morphology.score}`,
      `seed ${seed}`,
    ].join(" | "));
  }
  const finished = iterations.length;
  const failed = FINISHED_REQUESTED - finished;
  writeJson(programFile(programId), {
    programId,
    name,
    requested: FINISHED_REQUESTED,
    finished,
    failed,
    validationRuns: finished,
    shrinkwrapRuns: finished,
    persisted: finished,
    reason: finished >= FINISHED_REQUESTED ? undefined : `stopped at ${finished} finished clusters after ${attempt - SEED_START} attempts (${rejected} rejected)`,
    iterations,
  } satisfies FinishedProgram);
  console.log(`${name} | saved ${finished} | rejected ${rejected}`);
}

function catalogAverages() {
  const catalogRoot = path.join(process.cwd(), "data", "skill4", "finished-programs");
  const rows: string[] = [];
  for (const program of CLUSTER_PROGRAMS) {
    const file = path.join(catalogRoot, `${program.id}.json`);
    if (!existsSync(file)) {
      rows.push(`${program.name} | no saved catalog`);
      continue;
    }
    const saved = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
    const iterations = saved.iterations.filter((item) => item.tiles?.length);
    if (iterations.length === 0) {
      rows.push(`${program.name} | catalog iterations have no tile graphs`);
      continue;
    }
    const orgs = iterations.map((item) => evaluateClusterMorphology(item.tiles, item.connections, program.id));
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    rows.push([
      program.name,
      `tiles ${mean(iterations.map((item) => item.tileCount)).toFixed(1)}`,
      `span ${Math.round(mean(orgs.map((item) => item.width)))}x${Math.round(mean(orgs.map((item) => item.depth)))}x${Math.round(mean(orgs.map((item) => item.height)))}`,
      `spread ${mean(orgs.map((item) => item.planSpread)).toFixed(2)}`,
      `branches ${mean(orgs.map((item) => item.meaningfulBranches)).toFixed(1)}`,
      `levels ${mean(orgs.map((item) => item.verticalLevels)).toFixed(1)}`,
      `stored void ${Math.round(mean(iterations.map((item) => item.habitableArea)))} sf`,
    ].join(" | "));
  }
  return rows;
}

function runSummary() {
  const lines = ["RUN 2"];
  for (const program of CLUSTER_PROGRAMS) {
    const file = programFile(program.id);
    if (!existsSync(file)) {
      lines.push(`${program.name} | 0 generated`);
      continue;
    }
    const saved = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
    const items = saved.iterations.filter((item) => item.review);
    if (items.length === 0) {
      lines.push(`${program.name} | 0 generated`);
      continue;
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const floors = items.map((item) => item.habitableArea);
    const within = items.filter((item) => item.areaStatus === "within").length;
    const pass = items.filter((item) => item.review?.morphologyPass).length;
    lines.push([
      program.name,
      `${items.length} generated`,
      `avg tiles ${mean(items.map((item) => item.tileCount)).toFixed(1)}`,
      `avg cluster ${Math.round(mean(items.map((item) => item.review?.clusterWidth ?? 0)))}x${Math.round(mean(items.map((item) => item.review?.clusterDepth ?? 0)))}x${Math.round(mean(items.map((item) => item.review?.clusterHeight ?? 0)))}`,
      `avg void ${Math.round(mean(floors))} sf`,
      `void range ${Math.min(...floors)}–${Math.max(...floors)} sf`,
      `avg void height ${Math.round(mean(items.map((item) => item.review?.voidHeight ?? 0)))} ft`,
      `morphology ${pass}/${items.length}`,
      `within target ${within}`,
    ].join(" | "));
  }
  lines.push("CATALOG");
  lines.push(...catalogAverages());
  writeJson(path.join(ROOT, "summary.txt"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

function launch() {
  mkdirSync(PROGRAMS, { recursive: true });
  mkdirSync(MESHES, { recursive: true });
  writeJson(BATCH, { running: true, phase: "Generating tiles" });
  const pending = CLUSTER_PROGRAMS.filter((program) => {
    const file = programFile(program.id);
    if (!existsSync(file)) return true;
    const saved = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
    return saved.finished < FINISHED_REQUESTED;
  });
  if (pending.length === 0) {
    writeJson(BATCH, { running: false, phase: "" });
    runSummary();
    return;
  }
  const workers = Math.min(WORKERS, pending.length);
  const buckets: string[][] = Array.from({ length: workers }, () => []);
  pending.forEach((program, index) => buckets[index % workers].push(program.id));
  console.log(`run 2 | ${pending.length} programs across ${workers} workers`);
  const children = buckets.map((ids, index) => {
    const file = path.join("data", "skill4", "iteration-run-2", "jobs", `${index}.json`);
    writeJson(path.join(process.cwd(), file), ids);
    return new Promise<void>((resolve) => {
      const child = spawn(`npx tsx lib/skill4/generate-iteration-run-2.ts --jobs ${file.replaceAll("\\", "/")}`, {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", () => resolve());
    });
  });
  void Promise.all(children).then(() => {
    writeJson(BATCH, { running: false, phase: "" });
    console.log("RUN 2 COMPLETE");
    runSummary();
  });
}

const jobsFlag = process.argv.indexOf("--jobs");
if (jobsFlag < 0) {
  launch();
} else {
  const ids = JSON.parse(readFileSync(process.argv[jobsFlag + 1], "utf8")) as string[];
  const loaded = loadModules();
  for (const programId of ids) {
    const program = CLUSTER_PROGRAMS.find((item) => item.id === programId);
    if (!program) continue;
    runProgram(program.id, program.name, loaded);
  }
}
