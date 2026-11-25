import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "../scan/isomesh";
import { adaptModule } from "./adapt";
import { connectClusterHybrid, hybridReady, validateClusterAssembly } from "./cluster-hybrids";
import type { TileConnection } from "./connections";
import {
  attemptDirectCluster,
  emptyCatalog,
  FINAL_CLUSTER_GENERATOR,
  FINAL_CLUSTER_PAIRS,
  FINAL_CLUSTERS_PER_PAIR,
  scheduleForPair,
  structureSignature,
  uniquePoolSizeForPair,
  type FinalClusterPair,
  type FinalClusterPairId,
  type FinalClusterRecord,
  type FinalClustersCatalogDocument,
  summarizeCluster,
  tilesForKinds,
  kindsForPair,
} from "./final-clusters";
import { loadSkill3HandoffRecords } from "./skill3-handoff";

const ATTEMPT_LIMIT = 900;
const WORKERS = 6;
const ROOT = path.join(process.cwd(), "data", "skill4");
const PAIRS = path.join(ROOT, "final-clusters-pairs");
const MESHES = path.join(ROOT, "final-clusters");
const CATALOG = path.join(ROOT, "final-clusters-catalog.json");
const BATCH = path.join(ROOT, "final-clusters-batch.json");
const JOBS = path.join(ROOT, "final-clusters-jobs");

function writeJson(file: string, body: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
}

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

function stripConnection(connection: TileConnection): TileConnection {
  const field = connection.generatedHybridField;
  return {
    ...connection,
    rawHybrid: null,
    validatedHybrid: null,
    generatedHybridField: field
      ? {
          ...field,
          candidates: field.candidates.map((candidate) => ({ ...candidate, geometry: null })),
        }
      : null,
  };
}

function pairFile(pairId: FinalClusterPairId) {
  return path.join(PAIRS, `${pairId}.json`);
}

function meshFile(pairId: FinalClusterPairId, id: string) {
  return path.join(MESHES, pairId, `${id.replaceAll(":", "__")}.json`);
}

function setPhase(phase: string) {
  writeJson(BATCH, { running: true, phase });
}

function typologyMix(tiles: FinalClusterRecord["tiles"], pair: FinalClusterPair) {
  const pool = tilesForKinds(kindsForPair(pair));
  const mix = { workspace: 0, lobby: 0, gathering: 0 };
  for (const tile of tiles) {
    const hit = pool.find((item) => item.id === tile.archetypeId);
    if (hit?.typologyId === "workspace" || hit?.typologyId === "lobby" || hit?.typologyId === "gathering") {
      mix[hit.typologyId] += 1;
    }
  }
  return mix;
}

function emptyPair(pair: FinalClusterPair, reason?: string) {
  return {
    pairId: pair.id,
    label: pair.label,
    requested: FINAL_CLUSTERS_PER_PAIR,
    finished: 0,
    failed: reason ? FINAL_CLUSTERS_PER_PAIR : 0,
    reason,
    clusters: [] as FinalClusterRecord[],
  };
}

function runPair(pair: FinalClusterPair, loaded: ReturnType<typeof loadModules>) {
  const existingFile = pairFile(pair.id);
  if (existsSync(existingFile)) {
    const existing = JSON.parse(readFileSync(existingFile, "utf8")) as ReturnType<typeof emptyPair>;
    if (existing.finished >= FINAL_CLUSTERS_PER_PAIR) {
      console.log(`skip ${pair.label}`);
      return;
    }
  }

  const prior = existsSync(existingFile)
    ? (JSON.parse(readFileSync(existingFile, "utf8")) as ReturnType<typeof emptyPair>)
    : null;
  const clusters: FinalClusterRecord[] = prior?.clusters.slice() ?? [];
  const smallPool = uniquePoolSizeForPair(pair) <= 3;
  const diversityKey = (record: {
    structure?: string | null;
    intent?: string | null;
    tiles: FinalClusterRecord["tiles"];
  }) => {
    const structure = record.structure ?? structureSignature(record.tiles, []);
    if (!smallPool) return structure;
    // Tiny same-typology pools only have a handful of graphs; keep slots
    // distinct by module set + intent instead of rejecting every reuse.
    const modules = record.tiles.map((tile) => tile.archetypeId).slice().sort().join("+");
    return `${record.intent ?? "any"}|${modules}|n${record.tiles.length}|${structure}`;
  };
  const usedDiversity = new Set(clusters.map((item) => diversityKey(item)));
  let attempt = clusters.reduce((max, item) => Math.max(max, item.seed + 1), 0);
  let rejected = 0;
  const rejectReasons: Record<string, number> = {};
  const noteReject = (reason: string) => {
    rejected += 1;
    rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
  };

  const sizeSchedule = scheduleForPair(pair);
  const sizeBudget = new Map<number, number>();
  for (const size of sizeSchedule) sizeBudget.set(size, (sizeBudget.get(size) ?? 0) + 1);
  const sizeUsed = new Map<number, number>();
  for (const cluster of clusters) {
    sizeUsed.set(cluster.tileCount, (sizeUsed.get(cluster.tileCount) ?? 0) + 1);
  }
  // Resume past a prior soft stop: keep validated clusters, clear the stop reason.
  if (prior?.reason && clusters.length < FINAL_CLUSTERS_PER_PAIR) {
    console.log(`resume ${pair.label} from ${clusters.length}/${FINAL_CLUSTERS_PER_PAIR}`);
  }

  while (clusters.length < FINAL_CLUSTERS_PER_PAIR && attempt < ATTEMPT_LIMIT) {
    const index = clusters.length;
    const size = sizeSchedule[index] ?? sizeSchedule[sizeSchedule.length - 1] ?? 4;
    const seed = attempt;
    attempt += 1;
    setPhase(`Seating · ${pair.label} · ${index + 1}/${FINAL_CLUSTERS_PER_PAIR} · ${size} tiles`);
    const grown = attemptDirectCluster(pair, index, size, seed);
    if (!grown || grown.connections.length < 1) {
      noteReject("grow");
      continue;
    }
    if (grown.tiles.length !== size) {
      noteReject("size-mismatch");
      continue;
    }
    const usedOfSize = sizeUsed.get(grown.tiles.length) ?? 0;
    const allowedOfSize = sizeBudget.get(grown.tiles.length) ?? 1;
    if (usedOfSize >= allowedOfSize) {
      noteReject("size-budget");
      continue;
    }
    const structure = grown.structure ?? structureSignature(grown.tiles, grown.connections);
    const key = diversityKey({ structure, intent: grown.intent, tiles: grown.tiles });
    if (usedDiversity.has(key)) {
      noteReject("structure");
      continue;
    }

    let connections = grown.connections.slice();
    let hybrids = true;
    for (let edge = 0; edge < connections.length; edge += 1) {
      setPhase(`Hybrids · ${pair.label} · cluster ${index + 1} · edge ${edge + 1}/${connections.length}`);
      try {
        const next = connectClusterHybrid(connections[edge], grown.tiles, loaded);
        connections = connections.map((connection) => (connection.id === next.id ? next : connection));
        if (!hybridReady(next) && (next.validatedHybrid?.triangles ?? 0) < 1) hybrids = false;
      } catch {
        hybrids = false;
      }
      if (!hybrids) break;
    }
    if (!hybrids || connections.length !== grown.connections.length) {
      noteReject("hybrid");
      continue;
    }

    setPhase(`Validating · ${pair.label} · cluster ${index + 1}`);
    let film: IsoMesh | null = null;
    try {
      film = validateClusterAssembly(grown.tiles, connections, loaded);
    } catch {
      film = null;
    }
    if (!film) {
      noteReject("validate");
      continue;
    }

    const id = `${pair.id}:${clusters.length}`;
    const record: FinalClusterRecord = {
      id,
      pairId: pair.id,
      label: `${pair.label} ${clusters.length + 1}`,
      seed,
      targetTiles: size,
      tileCount: grown.tiles.length,
      tiles: grown.tiles,
      connections: connections.map(stripConnection),
      names: grown.names,
      typologyMix: typologyMix(grown.tiles, pair),
      structure,
      intent: grown.intent,
      hybridReady: true,
      validated: true,
      generator: FINAL_CLUSTER_GENERATOR,
    };
    usedDiversity.add(key);
    sizeUsed.set(grown.tiles.length, (sizeUsed.get(grown.tiles.length) ?? 0) + 1);
    writeJson(meshFile(pair.id, id), {
      id,
      mesh: pack(film),
      connections: connections.map((connection) => ({
        id: connection.id,
        validatedHybrid: pack(connection.validatedHybrid),
      })),
    });
    clusters.push(record);
    writeJson(pairFile(pair.id), {
      pairId: pair.id,
      label: pair.label,
      requested: FINAL_CLUSTERS_PER_PAIR,
      finished: clusters.length,
      failed: 0,
      clusters,
    });
    console.log(`saved ${id} | ${grown.tiles.length} tiles | seed ${seed} | film ${film.triangles} tris`);
  }

  const finished = clusters.length;
  const failed = FINAL_CLUSTERS_PER_PAIR - finished;
  const reasonDetail = Object.entries(rejectReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key}:${count}`)
    .join(",");
  const reason = finished >= FINAL_CLUSTERS_PER_PAIR
    ? undefined
    : finished === 0
      ? `no validated cluster in ${attempt} attempts (${rejected} rejected${reasonDetail ? `; ${reasonDetail}` : ""})`
      : `stopped at ${finished} validated clusters after ${attempt} attempts (${rejected} rejected${reasonDetail ? `; ${reasonDetail}` : ""})`;
  writeJson(pairFile(pair.id), {
    pairId: pair.id,
    label: pair.label,
    requested: FINAL_CLUSTERS_PER_PAIR,
    finished,
    failed,
    reason,
    clusters,
  });
  console.log(`${pair.label} | ${FINAL_CLUSTERS_PER_PAIR} | ${finished} | ${failed}${reasonDetail ? ` | ${reasonDetail}` : ""}`);
}

function loadModules() {
  const records = loadSkill3HandoffRecords();
  return new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));
}

function mergeCatalog(): FinalClustersCatalogDocument {
  const clusters = [];
  for (const pair of FINAL_CLUSTER_PAIRS) {
    const file = pairFile(pair.id);
    if (!existsSync(file)) continue;
    const body = JSON.parse(readFileSync(file, "utf8")) as ReturnType<typeof emptyPair>;
    clusters.push(...body.clusters.map(summarizeCluster));
  }
  return {
    ...emptyCatalog(),
    generatedAt: new Date().toISOString(),
    clusters,
  };
}

function launch() {
  mkdirSync(PAIRS, { recursive: true });
  mkdirSync(MESHES, { recursive: true });
  mkdirSync(JOBS, { recursive: true });
  writeJson(BATCH, { running: true, phase: "Starting Final Clusters" });
  const pending = FINAL_CLUSTER_PAIRS.filter((pair) => {
    const file = pairFile(pair.id);
    if (!existsSync(file)) return true;
    const saved = JSON.parse(readFileSync(file, "utf8")) as ReturnType<typeof emptyPair>;
    return saved.finished < FINAL_CLUSTERS_PER_PAIR;
  });
  if (pending.length === 0) {
    writeJson(CATALOG, mergeCatalog());
    writeJson(BATCH, { running: false, phase: "" });
    console.log("all pair families already finished");
    return;
  }
  const workers = Math.min(WORKERS, pending.length);
  const buckets: FinalClusterPairId[][] = Array.from({ length: workers }, () => []);
  pending.forEach((pair, index) => buckets[index % workers].push(pair.id));
  console.log(`${pending.length} pair families across ${workers} workers`);
  const children = buckets.map((ids, index) => {
    const file = path.join("data", "skill4", "final-clusters-jobs", `${index}.json`);
    writeJson(path.join(process.cwd(), file), ids);
    return new Promise<void>((resolve) => {
      const child = spawn(`npx tsx lib/skill4/generate-final-clusters.ts --jobs ${file.replaceAll("\\", "/")}`, {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", () => resolve());
    });
  });
  void Promise.all(children).then(() => {
    writeJson(CATALOG, mergeCatalog());
    writeJson(BATCH, { running: false, phase: "" });
    console.log("FINAL CLUSTERS BATCH COMPLETE");
    for (const pair of FINAL_CLUSTER_PAIRS) {
      const file = pairFile(pair.id);
      if (!existsSync(file)) {
        console.log(`${pair.label} | missing`);
        continue;
      }
      const body = JSON.parse(readFileSync(file, "utf8")) as ReturnType<typeof emptyPair>;
      console.log(`${pair.label} | ${body.requested} | ${body.finished} | ${body.failed}${body.reason ? ` | ${body.reason}` : ""}`);
    }
  });
}

const jobsFlag = process.argv.indexOf("--jobs");
const pairFlag = process.argv.indexOf("--pair");
if (jobsFlag >= 0) {
  const ids = JSON.parse(readFileSync(process.argv[jobsFlag + 1], "utf8")) as FinalClusterPairId[];
  const loaded = loadModules();
  for (const pairId of ids) {
    const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === pairId);
    if (!pair) continue;
    if (existsSync(pairFile(pair.id))) {
      const saved = JSON.parse(readFileSync(pairFile(pair.id), "utf8")) as ReturnType<typeof emptyPair>;
      if (saved.finished >= FINAL_CLUSTERS_PER_PAIR) {
        console.log(`skip ${pair.label}`);
        continue;
      }
    }
    runPair(pair, loaded);
  }
} else if (pairFlag >= 0) {
  const pairId = process.argv[pairFlag + 1] as FinalClusterPairId;
  const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === pairId);
  if (!pair) {
    console.error(`unknown pair ${pairId}`);
    process.exit(1);
  }
  writeJson(BATCH, { running: true, phase: `Generating · ${pair.label}` });
  const loaded = loadModules();
  runPair(pair, loaded);
  writeJson(CATALOG, mergeCatalog());
  writeJson(BATCH, { running: false, phase: "" });
  console.log("PAIR COMPLETE", pair.label);
} else {
  launch();
}
