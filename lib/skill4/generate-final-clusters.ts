import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "../scan/isomesh";
import { SITE_ARCHETYPES } from "../skill5/catalog";
import { currentSelectionHash } from "./final-cluster-placement";
import { adaptModule } from "./adapt";
import { validateClusterAssembly } from "./cluster-hybrids";
import { connectAdaptive, probeHybridPair } from "./connector-select";
import { hasAnyOffer, offersBetween } from "./connection-pool";
import { readFinalSelection } from "../skill3/final-selection";
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
import { readGrowth } from "./growth-reading";
import { loadSkill3HandoffRecords } from "./skill3-handoff";

function selectionHash() {
  return currentSelectionHash();
}
const WORKERS = 6;
const PILOT = process.argv.includes("--pilot");
const ATTEMPT_LIMIT = PILOT ? 8 : 720;
const ROOT = path.join(process.cwd(), "data", "skill4", ...(PILOT ? ["final-clusters-pilot"] : []));
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
    connectorsEvaluated: connection.connectorsEvaluated,
    selectedMockId: connection.selectedMockId,
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

function leastUsedSize(clusters: readonly { tileCount: number }[], sizes: readonly number[]) {
  const counts = new Map(sizes.map((size) => [size, 0]));
  for (const cluster of clusters) {
    if (counts.has(cluster.tileCount)) counts.set(cluster.tileCount, (counts.get(cluster.tileCount) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]?.[0] ?? 7;
}

function runPair(pair: FinalClusterPair, loaded: ReturnType<typeof loadModules>) {
  const goal = process.argv.includes("--pilot") ? 1 : FINAL_CLUSTERS_PER_PAIR;
  const existingFile = pairFile(pair.id);
  if (process.argv.includes("--fresh")) {
    console.error("--fresh would replace the protected v5 catalog.");
    process.exit(1);
  }
  if (existsSync(existingFile)) {
    const existing = JSON.parse(readFileSync(existingFile, "utf8")) as ReturnType<typeof emptyPair> & { generator?: string };
    const current = existing.clusters.every((item) => item.generator === FINAL_CLUSTER_GENERATOR);
    if (current && existing.finished >= goal) {
      console.log(`skip ${pair.label}`);
      return;
    }
    if (!current && existing.clusters.length < 19) {
      writeJson(existingFile, emptyPair(pair));
    }
    if (!current && existing.clusters.length >= 19) {
      console.error(`refusing to reset ${pair.label}; protected clusters are present`);
      return;
    }
  }

  const prior = existsSync(existingFile)
    ? (JSON.parse(readFileSync(existingFile, "utf8")) as ReturnType<typeof emptyPair>)
    : null;
  const clusters: FinalClusterRecord[] = prior?.clusters.slice() ?? [];
  const protectedCount = Math.min(19, clusters.length);
  const protectedSnap = JSON.stringify(clusters.slice(0, protectedCount));
  const geometryKey = (tiles: FinalClusterRecord["tiles"]) => tiles
    .map((tile) => `${tile.archetypeId}@${Math.round(tile.transform.x)}:${Math.round(tile.transform.y)}:${Math.round(tile.transform.z)}:q${tile.rotationQuarter}`)
    .sort()
    .join("|");
  const diversityKey = (record: {
    structure?: string | null;
    intent?: string | null;
    tiles: FinalClusterRecord["tiles"];
    seed?: number;
  }) => {
    const structure = record.structure ?? structureSignature(record.tiles, []);
    const modules = record.tiles.map((tile) => tile.archetypeId).slice().sort().join("+");
    const smallPool = uniquePoolSizeForPair(pair) <= 5;
    if (smallPool) {
      return `${record.intent ?? "any"}|${modules}|n${record.tiles.length}|${record.seed ?? 0}`;
    }
    return `${structure}|${modules}|${record.intent ?? "any"}`;
  };
  const usedDiversity = new Set(clusters.map((item) => item.tileCount >= 7 ? geometryKey(item.tiles) : diversityKey(item)));
  for (const item of clusters) usedDiversity.add(geometryKey(item.tiles));
  let attempt = clusters.reduce((max, item) => Math.max(max, item.seed + 1), 0);
  let rejected = 0;
  const rejectReasons: Record<string, number> = {};
  const noteReject = (reason: string) => {
    rejected += 1;
    rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
  };

  const sizeSchedule = scheduleForPair(pair);
  const closingSize = leastUsedSize(clusters, [6, 7, 8]);
  const sizeBudget = new Map<number, number>();
  for (const size of sizeSchedule) sizeBudget.set(size, (sizeBudget.get(size) ?? 0) + 1);
  if (clusters.length >= 19) sizeBudget.set(closingSize, (sizeBudget.get(closingSize) ?? 0) + 1);
  const sizeUsed = new Map<number, number>();
  for (const cluster of clusters) {
    sizeUsed.set(cluster.tileCount, (sizeUsed.get(cluster.tileCount) ?? 0) + 1);
  }
  // Resume past a prior soft stop: keep validated clusters, clear the stop reason.
  if (prior?.reason && clusters.length < goal) {
    console.log(`resume ${pair.label} from ${clusters.length}/${goal}`);
  }
  const pressure = new Map<string, number>();
  for (const cluster of clusters) {
    for (const tile of cluster.tiles) pressure.set(tile.archetypeId, (pressure.get(tile.archetypeId) ?? 0) + 1);
  }

  let growStreak = 0;
  let ease = 0;
  const minimumSize = pair.id === "mixed" ? 3 : 2;
  const attemptLimit = clusters.length >= 15 ? 1600 : ATTEMPT_LIMIT;
  while (clusters.length < goal && attempt < attemptLimit) {
    const index = clusters.length;
    const scheduled = index >= 19 ? closingSize : (sizeSchedule[index] ?? sizeSchedule[sizeSchedule.length - 1] ?? 4);
    const size = index >= 19 ? scheduled : Math.max(minimumSize, scheduled - ease);
    const seed = attempt;
    attempt += 1;
    setPhase(`Seating · ${pair.label} · ${index + 1}/${goal} · ${size} tiles`);
    const grown = attemptDirectCluster(pair, index, size, seed, pressure);
    if (!grown || grown.connections.length < 1) {
      noteReject("grow");
      growStreak += 1;
      if (index < 19 && scheduled < 7 && growStreak >= 12 && ease < scheduled - minimumSize) ease += 1;
      continue;
    }
    growStreak = 0;
    ease = 0;
    if (grown.tiles.length !== size) {
      noteReject("size-mismatch");
      continue;
    }
    const usedOfSize = sizeUsed.get(grown.tiles.length) ?? 0;
    const allowedOfSize = sizeBudget.get(grown.tiles.length) ?? 1;
    if (grown.tiles.length === scheduled && usedOfSize >= allowedOfSize) {
      noteReject("size-budget");
      continue;
    }
    const structure = grown.structure ?? structureSignature(grown.tiles, grown.connections);
    const key = index >= 15
      ? geometryKey(grown.tiles)
      : diversityKey({ structure, intent: grown.intent, tiles: grown.tiles, seed });
    if (usedDiversity.has(key)) {
      noteReject("structure");
      continue;
    }

    let connections = grown.connections.slice();
    let hybrids = true;
    for (let edge = 0; edge < connections.length; edge += 1) {
      const current = connections[edge];
      setPhase(`Connector field · ${pair.label} · cluster ${index + 1} · edge ${edge + 1}/${connections.length}`);
      try {
        const next = connectAdaptive(current, grown.tiles, loaded, current.separation ?? 29);
        if (!next || (next.validatedHybrid?.triangles ?? 0) < 8) {
          hybrids = false;
          break;
        }
        connections = connections.map((connection) => (connection.id === next.id ? next : connection));
      } catch {
        hybrids = false;
        break;
      }
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
      character: index >= 19 ? readGrowth(grown.tiles, connections).primary : (grown.character ?? grown.intent),
      provenance: {
        selectionHash: selectionHash(),
        modules: grown.tiles.map((tile) => {
          const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === tile.archetypeId);
          return {
            archetypeId: tile.archetypeId,
            moduleId: entry?.moduleId ?? tile.moduleId,
            candidateId: entry?.candidateId ?? null,
            continuationId: entry?.continuationId ?? null,
          };
        }),
      },
      hybridReady: true,
      validated: true,
      generator: FINAL_CLUSTER_GENERATOR,
    };
    if (JSON.stringify(clusters.slice(0, protectedCount)) !== protectedSnap) {
      throw new Error(`protected ${pair.label} clusters changed before save`);
    }
    usedDiversity.add(key);
    usedDiversity.add(geometryKey(grown.tiles));
    sizeUsed.set(grown.tiles.length, (sizeUsed.get(grown.tiles.length) ?? 0) + 1);
    for (const tile of grown.tiles) pressure.set(tile.archetypeId, (pressure.get(tile.archetypeId) ?? 0) + 1);
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
  const failed = goal - finished;
  const reasonDetail = Object.entries(rejectReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key}:${count}`)
    .join(",");
  const reason = finished >= goal
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
  const perCategory = FINAL_CLUSTER_PAIRS.map((pair) => clusters.filter((item) => item.pairId === pair.id).length);
  const even = perCategory.length > 0 && perCategory.every((count) => count === perCategory[0]);
  return {
    ...emptyCatalog(),
    generatedAt: new Date().toISOString(),
    perPair: even ? perCategory[0]! : FINAL_CLUSTERS_PER_PAIR,
    clusters,
  };
}

function probeWeakPairs(loaded: ReturnType<typeof loadModules>) {
  const pool = readFinalSelection().selections.map((item) => item.archetypeId);
  const weak = pool.filter((id) => !hasAnyOffer(id, pool));
  for (const id of weak) {
    const partners = pool.filter((other) => other !== id);
    for (const partner of partners.slice(0, 4)) {
      if (offersBetween(id, partner).length > 0) continue;
      console.log(`probe ${id} ↔ ${partner}`);
      probeHybridPair(id, partner, "A", "B", loaded);
    }
  }
}

function archiveV4Catalog() {
  const archive = path.join(process.cwd(), "data", "skill4", "archive", "final-clusters-v4");
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const target = path.join(archive, stamp);
  const manifest = {
    archivedAt: new Date().toISOString(),
    from: ["data/skill4/final-clusters-catalog.json", "data/skill4/final-clusters-pairs", "data/skill4/final-clusters"],
    note: "Pre-hybrid-only v4 production catalog preserved before v5 regeneration.",
  };
  mkdirSync(target, { recursive: true });
  writeJson(path.join(target, "manifest.json"), manifest);
  for (const rel of manifest.from) {
    const source = path.join(process.cwd(), rel);
    if (!existsSync(source)) continue;
    const dest = path.join(target, rel.replace(/^data[/\\]/, ""));
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(source, dest, { recursive: true });
  }
}

function launch() {
  const loaded = loadModules();
  if (process.argv.includes("--fresh")) {
    console.error("--fresh would replace the protected v5 catalog. Append with a normal run; do not pass --fresh.");
    process.exit(1);
  }
  if (!PILOT) probeWeakPairs(loaded);
  mkdirSync(PAIRS, { recursive: true });
  mkdirSync(MESHES, { recursive: true });
  mkdirSync(JOBS, { recursive: true });
  writeJson(BATCH, { running: true, phase: "Starting Final Clusters" });
  const pending = FINAL_CLUSTER_PAIRS.filter((pair) => {
    const file = pairFile(pair.id);
    if (!existsSync(file)) return true;
    const saved = JSON.parse(readFileSync(file, "utf8")) as ReturnType<typeof emptyPair>;
    const current = saved.clusters.every((item) => item.generator === FINAL_CLUSTER_GENERATOR);
    return !current || saved.finished < FINAL_CLUSTERS_PER_PAIR;
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
      const current = saved.clusters.every((item) => item.generator === FINAL_CLUSTER_GENERATOR);
      if (current && saved.finished >= (process.argv.includes("--pilot") ? 1 : FINAL_CLUSTERS_PER_PAIR)) {
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
} else if (process.argv.includes("--pilot")) {
  const loaded = loadModules();
  const started = Date.now();
  for (const pair of FINAL_CLUSTER_PAIRS) {
    const mark = Date.now();
    runPair(pair, loaded);
    console.log(`PILOT ${pair.id} ${((Date.now() - mark) / 1000).toFixed(1)}s`);
  }
  writeJson(CATALOG, mergeCatalog());
  writeJson(BATCH, { running: false, phase: "" });
  console.log(`PILOT TOTAL ${((Date.now() - started) / 1000).toFixed(1)}s hash ${selectionHash()}`);
} else {
  launch();
}
