/**
 * Version-1 evolutionary search runner. One archetype per invocation.
 *
 *   npx --yes tsx scripts/evolve.ts --archetype void-field [--workers 3] [--controller-seed 20260928] [--out data/evolution]
 *
 * Writes <out>/<archetypeId>/run.json. Full 1280 catalog images are compressed
 * grayscale PNGs kept only for the current global archive (archive/<id>.png).
 * Resumes after the last completed generation. Default worker count is 3.
 */
import { fork, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { EVALUATION_SEED, PREVIEW_SIZE, evaluateGenome, type GenomeEvaluation } from "../lib/skill2/evolution-evaluate";
import { EVOLUTION_CONFIG, createRun, runEvolution, type Candidate, type EvolutionRun } from "../lib/skill2/evolution";
import { genomeKey, type Genome } from "../lib/skill2/genome";

type Job = { id: number; archetypeId: string; genome: Genome };
type Reply = { id: number; result?: GenomeEvaluation; error?: string };

if (process.argv.includes("--worker")) {
  process.on("message", (job: Job) => {
    let reply: Reply;
    try {
      reply = { id: job.id, result: evaluateGenome(job.archetypeId, job.genome) };
    } catch (error) {
      reply = { id: job.id, error: error instanceof Error ? error.stack ?? error.message : String(error) };
    }
    process.send?.(reply);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function writeAtomic(path: string, data: string | Uint8Array) {
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const header = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])), 0);
  return Buffer.concat([length, header, data, crc]);
}

/** Grayscale PNG of the full 1280 trail field. Same bytes the catalog will draw. */
function encodeGrayPng(size: number, pixels: Uint8Array) {
  const stride = size + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) raw[row + 1 + x] = pixels[y * size + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}


function ask(worker: ChildProcess, job: Job): Promise<GenomeEvaluation> {
  return new Promise((resolve, reject) => {
    const onMessage = (reply: Reply) => {
      if (reply.id !== job.id) return;
      cleanup();
      if (reply.error || !reply.result) reject(new Error(reply.error ?? "empty worker reply"));
      else resolve(reply.result);
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`worker exited (${code}) during job ${job.id}`));
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("exit", onExit);
    };
    worker.on("message", onMessage);
    worker.on("exit", onExit);
    worker.send(job);
  });
}

async function main() {
  const archetypeId = arg("archetype");
  if (!archetypeId) throw new Error("--archetype is required (one archetype per run)");
  const workerCount = Math.max(1, Math.round(Number(arg("workers", "3"))));
  const controllerSeed = Math.round(Number(arg("controller-seed", "20260928"))) >>> 0;
  const dir = join(arg("out", "data/evolution")!, archetypeId);
  mkdirSync(dir, { recursive: true });
  const runPath = join(dir, "run.json");

  let run: EvolutionRun;
  if (existsSync(runPath)) {
    run = JSON.parse(readFileSync(runPath, "utf8")) as EvolutionRun;
    if (run.archetypeId !== archetypeId) throw new Error(`${runPath} belongs to ${run.archetypeId}`);
    if (run.evaluationSeed !== EVALUATION_SEED) throw new Error(`${runPath} used evaluation seed ${run.evaluationSeed}`);
    if (run.controllerSeed !== controllerSeed) throw new Error(`${runPath} used controller seed ${run.controllerSeed}`);
    if (JSON.stringify(run.config) !== JSON.stringify(EVOLUTION_CONFIG)) throw new Error(`${runPath} used a different config`);
    console.error(`resuming ${archetypeId} after G${String(run.completedGenerations).padStart(2, "0")}`);
  } else {
    run = createRun(archetypeId, controllerSeed);
  }
  if (run.completedGenerations >= run.config.generations) {
    console.error(`${archetypeId} already complete`);
    return;
  }

  const workers = Array.from({ length: workerCount }, () =>
    fork(process.argv[1], ["--worker"], { execArgv: process.execArgv, serialization: "advanced" }),
  );
  const cache = new Map<string, GenomeEvaluation>();
  const archiveDir = join(dir, "archive");
  mkdirSync(archiveDir, { recursive: true });
  const imageByGenome = new Map<string, string>();
  for (const candidate of run.candidates) {
    if (candidate.preview.file.startsWith("archive/") && existsSync(join(dir, candidate.preview.file))) {
      imageByGenome.set(genomeKey(candidate.genome), candidate.preview.file);
    }
  }
  const keepImage = (candidate: Candidate, pixels: Uint8Array | null) => {
    const rel = `archive/${candidate.id}.png`;
    const path = join(dir, rel);
    if (pixels && pixels.length === PREVIEW_SIZE * PREVIEW_SIZE) writeAtomic(path, encodeGrayPng(PREVIEW_SIZE, pixels));
    else if (!existsSync(path)) {
      const prior = imageByGenome.get(genomeKey(candidate.genome));
      if (!prior || !existsSync(join(dir, prior))) return;
      copyFileSync(join(dir, prior), path);
    }
    candidate.preview = { file: rel, index: 0 };
    imageByGenome.set(genomeKey(candidate.genome), rel);
  };
  const dropImage = (candidate: Candidate) => {
    if (imageByGenome.get(genomeKey(candidate.genome)) === candidate.preview.file) {
      imageByGenome.delete(genomeKey(candidate.genome));
    }
    if (candidate.preview.file.startsWith("archive/")) {
      const path = join(dir, candidate.preview.file);
      if (existsSync(path)) unlinkSync(path);
    }
    candidate.preview = { file: "", index: -1 };
  };
  let nextJob = 1;
  console.error(`${archetypeId}: ${workerCount} workers, evaluation seed ${EVALUATION_SEED}, controller seed ${controllerSeed}`);

  try {
    await runEvolution({
      run,
      evaluate: async (genomes) => {
        const generation = run.completedGenerations + 1;
        const results: GenomeEvaluation[] = new Array(genomes.length);
        let cursor = 0;
        let done = 0;
        const started = Date.now();
        await Promise.all(
          workers.map(async (worker) => {
            while (cursor < genomes.length) {
              const index = cursor++;
              const key = genomeKey(genomes[index]);
              const t0 = Date.now();
              let result = cache.get(key);
              if (!result) {
                result = await ask(worker, { id: nextJob++, archetypeId, genome: genomes[index] });
                cache.set(key, result);
              }
              results[index] = result;
              done += 1;
              const o = result.objectives;
              console.error(
                `G${String(generation).padStart(2, "0")} ${done}/${genomes.length} F=${o.formal.toFixed(3)} S=${o.spatial.toFixed(3)} A=${o.atmospheric.toFixed(3)}${result.feasible ? "" : " infeasible"} ${Math.round((Date.now() - t0) / 1000)}s`,
              );
            }
          }),
        );
        console.error(`G${String(generation).padStart(2, "0")} evaluated in ${Math.round((Date.now() - started) / 60000)} min`);
        return results;
      },
      onGeneration: (current, previews) => {
        const record = current.generations[current.generations.length - 1];
        const born = current.candidates.filter((candidate) => candidate.generation === record.generation);
        const pixels = new Map(born.map((candidate, index) => [candidate.id, previews[index]]));
        const archived = new Set(current.archiveIds);
        let bytes = 0;
        for (const candidate of current.candidates) {
          if (archived.has(candidate.id)) keepImage(candidate, pixels.get(candidate.id) ?? null);
          else dropImage(candidate);
          if (candidate.preview.file) {
            const path = join(dir, candidate.preview.file);
            if (existsSync(path)) bytes += statSync(path).size;
          }
        }
        for (const result of cache.values()) result.preview = new Uint8Array();
        writeAtomic(runPath, JSON.stringify(current));
        console.error(
          `G${String(record.generation).padStart(2, "0")} saved: feasible ${record.feasible}/${record.evaluated}, front ${record.frontIds.length}, archive ${record.archiveIds.length}, images ${(bytes / 1e6).toFixed(1)} MB`,
        );
      },
    });
  } finally {
    for (const worker of workers) worker.kill();
  }
}
