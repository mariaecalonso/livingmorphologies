import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adaptModule } from "./adapt";
import { rankCompatibleFaces } from "./cluster-face-pair";
import { CLUSTER_PROGRAMS, eligibleTiles } from "./program-tiles";
import { areaStanding, programAreaRange } from "./program-area";
import { generateSizedCluster, MAX_CLUSTER_TILES, MIN_CLUSTER_TILES } from "./program-cluster";
import { measureFinishedCluster, type StoredProgram, type StoredProgramCatalog } from "./program-catalog";
import { loadSkill3HandoffRecords } from "./skill3-handoff";

const OUTPUT = path.join(process.cwd(), "data", "skill4", "program-catalog.json");
const ATTEMPT_LIMIT = 64;
const TARGET_COUNT = 10;
const GATHERING_PROGRAMS = [
  "public-exhibition-gallery",
  "indoor-public-gathering",
  "waterfront-gathering",
  "public-restaurant",
  "staff-dining",
];

function write(programs: StoredProgram[]) {
  const body: StoredProgramCatalog = { scale: "1 model unit = 1 foot", programs };
  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(body));
}

function pairCheck(programId: string) {
  const tiles = eligibleTiles(programId);
  let usable = 0;
  for (let left = 0; left < tiles.length; left += 1) {
    for (let right = left; right < tiles.length; right += 1) {
      if (rankCompatibleFaces(tiles[left].id, tiles[right].id).length > 0) usable += 1;
    }
  }
  return { eligible: tiles.length, usable };
}

const records = loadSkill3HandoffRecords();
const loaded = new Map(records.map((record) => {
  const handoff = adaptModule(record);
  return [record.archetypeId, handoff] as const;
}));
const programs: StoredProgram[] = [];

console.log("COMPATIBLE PAIRS");
for (const program of CLUSTER_PROGRAMS) {
  if (!GATHERING_PROGRAMS.includes(program.id)) continue;
  const pairs = pairCheck(program.id);
  console.log(`${program.name} | ${pairs.eligible} | ${pairs.usable}`);
}

for (const program of CLUSTER_PROGRAMS) {
  const range = programAreaRange(program.id);
  const pairs = pairCheck(program.id);
  const iterations: StoredProgram["iterations"] = [];
  if (pairs.usable === 0) {
    const reason = `no compatible tile pairs in the Skill 6 cache (${pairs.eligible} eligible tiles)`;
    programs.push({
      programId: program.id,
      name: program.name,
      targetMin: range.min,
      targetMax: range.max,
      iterations,
      bestArea: 0,
      reached: false,
      reason,
    });
    write(programs);
    console.log(`${program.name} | ${reason}`);
    continue;
  }
  let attempt = 0;
  let unfinished = 0;
  while (iterations.length < TARGET_COUNT && attempt < ATTEMPT_LIMIT) {
    const size = MIN_CLUSTER_TILES + (attempt % (MAX_CLUSTER_TILES - MIN_CLUSTER_TILES + 1));
    const cluster = generateSizedCluster(program.id, size, attempt);
    attempt += 1;
    if (!cluster) {
      unfinished += 1;
      continue;
    }
    let measured: ReturnType<typeof measureFinishedCluster> = null;
    try {
      measured = measureFinishedCluster(cluster, loaded);
    } catch (error) {
      unfinished += 1;
      console.log(`${program.id} size ${size} failed: ${error instanceof Error ? error.message : "error"}`);
      continue;
    }
    if (!measured) {
      unfinished += 1;
      continue;
    }
    const area = Math.round(measured.floorSquareFeet);
    const standing = areaStanding(measured.floorSquareFeet, range);
    iterations.push({
      id: `${program.id}:${iterations.length}`,
      iteration: iterations.length + 1,
      tileCount: measured.tiles.length,
      habitableArea: area,
      targetMin: range.min,
      targetMax: range.max,
      areaStatus: standing,
      validated: true,
      tiles: measured.tiles,
      connections: measured.connections,
    });
    console.log(`${program.name} · ${measured.tiles.length} tiles · ${area} sf · ${standing} · saved ${iterations.length}`);
    write([...programs, {
      programId: program.id,
      name: program.name,
      targetMin: range.min,
      targetMax: range.max,
      iterations,
      bestArea: Math.max(...iterations.map((item) => item.habitableArea)),
      reached: iterations.length >= TARGET_COUNT,
    }]);
  }
  const saved = iterations.length;
  const reason = saved >= TARGET_COUNT ? undefined : saved === 0
    ? `no structurally complete cluster in ${attempt} attempts (${unfinished} unfinished)`
    : `stopped at ${saved} structurally complete clusters after ${attempt} attempts`;
  programs.push({
    programId: program.id,
    name: program.name,
    targetMin: range.min,
    targetMax: range.max,
    iterations,
    bestArea: saved ? Math.max(...iterations.map((item) => item.habitableArea)) : 0,
    reached: saved >= TARGET_COUNT,
    reason,
  });
  write(programs);
}

console.log("CATALOG COMPLETE");
for (const program of programs) {
  if (program.iterations.length === 0) {
    console.log(`${program.name} | ${program.reason ?? "no iterations"}`);
    continue;
  }
  const areas = program.iterations.map((item) => item.habitableArea);
  const within = program.iterations.filter((item) => item.areaStatus === "within").length;
  const below = program.iterations.filter((item) => item.areaStatus === "below").length;
  const above = program.iterations.filter((item) => item.areaStatus === "above").length;
  console.log(`${program.name} | ${program.iterations.length} | ${Math.min(...areas)}–${Math.max(...areas)} | ${within} | ${below} | ${above}`);
  if (program.reason) console.log(`${program.name} | ${program.reason}`);
}
