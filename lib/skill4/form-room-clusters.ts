import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "../scan/isomesh";
import { adaptModule } from "./adapt";
import { connectClusterHybrid, validateClusterAssembly } from "./cluster-hybrids";
import type { StoredProgramCatalog } from "./program-catalog";
import { loadSkill3HandoffRecords } from "./skill3-handoff";

/** Two rooms only. The saved clusters are seated and validated, not regenerated. */
const ROOMS = ["public-lobby", "private-staff-lobby"];
const WORKERS = 8;
const CATALOG = path.join(process.cwd(), "data", "skill4", "program-catalog.json");
const FORMED = path.join(process.cwd(), "data", "skill4", "formed");
const JOBS = path.join(process.cwd(), "data", "skill4", "formed-jobs");

function pack(mesh: IsoMesh | null | undefined) {
  if (!mesh || mesh.triangles < 1) return null;
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return {
    triangles: mesh.triangles,
    positions: bytes(mesh.positions),
    normals: bytes(mesh.normals),
    indices: bytes(mesh.indices),
  };
}

function pendingIds() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as StoredProgramCatalog;
  const jobs: { id: string; edges: number }[] = [];
  for (const programId of ROOMS) {
    const program = catalog.programs.find((item) => item.programId === programId);
    if (!program) continue;
    for (const iteration of program.iterations) {
      const file = path.join(FORMED, programId, `${iteration.id.replaceAll(":", "__")}.json`);
      if (existsSync(file)) continue;
      jobs.push({ id: iteration.id, edges: iteration.connections.length });
    }
  }
  return jobs;
}

function launch() {
  const jobs = pendingIds().sort((a, b) => b.edges - a.edges);
  if (jobs.length === 0) {
    console.log("both rooms are already formed");
    return;
  }
  const workers = Math.min(WORKERS, jobs.length);
  const buckets: string[][] = Array.from({ length: workers }, () => []);
  const load = Array.from({ length: workers }, () => 0);
  for (const job of jobs) {
    let slot = 0;
    for (let index = 1; index < workers; index += 1) if (load[index] < load[slot]) slot = index;
    buckets[slot].push(job.id);
    load[slot] += job.edges;
  }
  mkdirSync(JOBS, { recursive: true });
  console.log(`${jobs.length} clusters across ${workers} workers`);
    const children = buckets.map((ids, index) => {
    const file = path.join("data", "skill4", "formed-jobs", `${index}.json`);
    writeFileSync(path.join(process.cwd(), file), JSON.stringify(ids));
    return new Promise<void>((resolve) => {
      const child = spawn(`npx tsx lib/skill4/form-room-clusters.ts --jobs ${file.replaceAll("\\", "/")}`, {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", () => resolve());
    });
  });
  void Promise.all(children).then(() => console.log("two rooms formed"));
}

const jobsFlag = process.argv.indexOf("--jobs");
if (jobsFlag < 0) {
  launch();
} else {
  const only = new Set(JSON.parse(readFileSync(process.argv[jobsFlag + 1], "utf8")) as string[]);
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as StoredProgramCatalog;
  const records = loadSkill3HandoffRecords();
  const loaded = new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));

  for (const programId of ROOMS) {
    const program = catalog.programs.find((item) => item.programId === programId);
    if (!program) continue;
    const dir = path.join(FORMED, programId);
    mkdirSync(dir, { recursive: true });
    for (const iteration of program.iterations) {
      if (!only.has(iteration.id)) continue;
      const file = path.join(dir, `${iteration.id.replaceAll(":", "__")}.json`);
      if (existsSync(file)) {
        console.log(`skip ${iteration.id}`);
        continue;
      }
      let connections = iteration.connections.slice();
      for (let index = 0; index < connections.length; index += 1) {
        console.log(`${iteration.id} connection ${index + 1} of ${connections.length}`);
        const next = connectClusterHybrid(connections[index], iteration.tiles, loaded);
        connections = connections.map((connection) => (connection.id === next.id ? next : connection));
      }
      const ready = connections.filter((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0).length;
      const film = ready === connections.length ? validateClusterAssembly(iteration.tiles, connections, loaded) : null;
      writeFileSync(file, JSON.stringify({
        id: iteration.id,
        hybrids: ready,
        expected: connections.length,
        validated: Boolean(film),
        film: pack(film),
        connections: connections.map((connection) => ({
          id: connection.id,
          validatedHybrid: pack(connection.validatedHybrid),
        })),
      }));
      console.log(`saved ${iteration.id} | ${ready} hybrids | validated ${Boolean(film)}`);
    }
  }
}
