/**
 * Autonomous Massing 04. Major volumes are defined first, then filled with the 20 ft tiles.
 * Keeps Massings 01–03 and the other configurations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { CONFIGURATION_CONTRACT, nextConfigurationId, parseConfigurationDocument } from "@/lib/skill5/configurations";
import type { SiteConfiguration } from "@/lib/skill5/configurations";
import { SKILL5_SITE_ID } from "@/lib/skill5/contract";
import { MASSING_CATALOG_CONTRACT, parseMassingCatalog } from "@/lib/skill5/massing-catalog";
import type { MassingStudy } from "@/lib/skill5/massing-catalog";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT } from "@/lib/skill5/placement";
import type { PlacedModule } from "@/lib/skill5/placement";
import type { SiteContext } from "@/lib/skill5/site-model";
import { polygonCentroid } from "@/lib/skill5/zoning";
import type { ZoningRegion } from "@/lib/skill5/zoning";
import { SiteNetworkStudy } from "./site-network";

const site = context as SiteContext;
const NAME = "Autonomous Massing — 04";
const STEP = 20;
const SOURCE = { x: -35.51, z: -452.37 };
const WATER_NODE = { x: 244.49, z: -592.37 };
const TILES = {
  lobby: ["continuous-hall", "vertical-void", "linear-gallery", "topographic-ground-field", "compressed-sequential"],
  workspace: ["terraced", "undulated", "open-hall", "void-edge", "flat-deep-plan"],
  gathering: ["stepped-amphitheater", "linear-edge-gallery", "inserted-horizontal-plate", "contained-room-within-volume", "void-field"],
} as const;

type Kind = keyof typeof TILES;
type Cell = { e: number; n: number; level: number; program: Kind; archetype: string; turn: number; cluster: string };

function block(cluster: string, program: Kind, e0: number, e1: number, n0: number, n1: number, levels: number[]): Cell[] {
  const cells: Cell[] = [];
  for (let e = e0; e <= e1; e += 1) {
    for (let n = n0; n <= n1; n += 1) {
      for (const level of levels) {
        const archetype = TILES[program][(e + n + level) % TILES[program].length];
        cells.push({ e, n, level, program, archetype, turn: (e + level) % 4, cluster });
      }
    }
  }
  return cells;
}

function without(cells: Cell[], holes: string[]) {
  const skip = new Set(holes);
  return cells.filter((cell) => !skip.has(`${cell.e}:${cell.n}:${cell.level}`) && !skip.has(`${cell.e}:${cell.n}`));
}

/** Volumes first. Holes are the court and the terraces. */
const PLAN: Cell[] = [
  ...without(block("Public Lobby", "lobby", 0, 1, 3, 5, [0, 1]), []),
  ...block("Public Lobby", "lobby", 0, 1, 4, 5, [2]),
  ...block("Private Staff Lobby", "lobby", 0, 1, 2, 2, [0, 1]),
  ...without(block("Architecture Design Studio", "workspace", 2, 5, 5, 6, [0, 1]), ["2:5:1"]),
  ...block("Architecture Design Studio", "workspace", 3, 5, 6, 6, [2]),
  ...block("Architecture Design Studio", "workspace", 6, 6, 6, 6, [1]),
  ...without(block("Product Design Studio", "workspace", 2, 5, 0, 1, [0, 1]), ["2:0:1", "5:0:1"]),
  ...block("Product Design Studio", "workspace", 3, 5, 1, 1, [2]),
  ...without(block("Collaboration Hub", "gathering", 2, 4, 2, 4, [0, 1, 2]), ["3:4", "4:4", "4:3", "2:2:2", "4:2:2", "2:4:1", "2:4:2"]),
  ...block("Biological Research and Fabrication", "workspace", 5, 6, 2, 3, [0, 1]),
  ...block("Biological Research and Fabrication", "workspace", 5, 5, 4, 4, [0, 1]),
  ...block("Exhibition and Indoor Gathering", "gathering", 0, 1, 1, 1, [0, 1]),
  ...block("Public Restaurant", "gathering", 6, 7, 0, 1, [0, 1]),
  ...block("Waterfront Gathering", "gathering", 7, 7, 2, 2, [0, 1]),
  ...block("Waterfront Gathering", "gathering", 8, 11, 1, 2, [0]),
  ...block("Waterfront Gathering", "gathering", 8, 9, 1, 2, [1, 2]),
  ...block("Waterfront Gathering", "gathering", 10, 12, 0, 1, [0]),
  ...block("Waterfront Gathering", "gathering", 12, 14, -1, 0, [0]),
];

function diagnose(modules: readonly PlacedModule[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  const levels = new Map<number, number>();
  for (const item of modules) {
    const { x, y, z } = item.transform.position;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    maxY = Math.max(maxY, y);
    const level = Math.round((y - MODULE_GROUND_Y) / MODULE_HEIGHT_FT);
    levels.set(level, (levels.get(level) ?? 0) + 1);
  }
  const cells = new Set(modules.map((item) => `${Math.round(item.transform.position.x)}:${Math.round(item.transform.position.z)}`));
  return {
    tiles: modules.length,
    levels: [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([level, count]) => ({ level, count })),
    spanFt: { east: Math.round(maxX - minX + STEP), north: Math.round(maxZ - minZ + STEP) },
    heightFt: Math.round(maxY - MODULE_GROUND_Y + STEP),
    footprintSqFt: cells.size * STEP * STEP,
    origin: { x: minX, z: minZ },
  };
}

function worldOf(origin: { x: number; z: number }, cell: Cell) {
  return { x: origin.x + cell.e * STEP, z: origin.z + cell.n * STEP };
}

function componentCount(modules: readonly PlacedModule[]) {
  const parent = modules.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  for (let i = 0; i < modules.length; i += 1) {
    for (let j = i + 1; j < modules.length; j += 1) {
      const a = modules[i].transform.position;
      const b = modules[j].transform.position;
      const plan = Math.hypot(a.x - b.x, a.z - b.z);
      const dy = Math.abs(a.y - b.y);
      const beside = dy < 1 && plan > 1 && plan <= STEP + 0.5;
      const stacked = plan < 1 && dy > 10 && dy <= MODULE_HEIGHT_FT + 0.5;
      if (beside || stacked) {
        const left = find(i);
        const right = find(j);
        if (left !== right) parent[right] = left;
      }
    }
  }
  return new Set(parent.map((_, index) => find(index))).size;
}

function assertSupported(cells: readonly Cell[]) {
  const occupied = new Set(cells.map((cell) => `${cell.e}:${cell.n}:${cell.level}`));
  for (const cell of cells) {
    if (cell.level === 0) continue;
    const below = occupied.has(`${cell.e}:${cell.n}:${cell.level - 1}`);
    const held = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([de, dn]) => occupied.has(`${cell.e + de}:${cell.n + dn}:${cell.level}`) && occupied.has(`${cell.e + de}:${cell.n + dn}:${cell.level - 1}`));
    if (!below && !held) throw new Error(`Unsupported tile at ${cell.e},${cell.n} level ${cell.level}`);
  }
}

function moduleAt(id: string, cell: Cell, x: number, z: number, zoneId: string): PlacedModule {
  const item = SITE_ARCHETYPES.find((entry) => entry.archetypeId === cell.archetype);
  if (!item?.program || item.program !== cell.program) throw new Error(`${cell.archetype} is not ${cell.program}`);
  return {
    instanceId: id,
    kind: "archetype",
    name: item.name,
    status: item.status,
    geometryState: "available",
    program: item.program,
    programSource: "assigned",
    provenance: { moduleId: item.moduleId, archetypeId: cell.archetype, source: "skill3", candidateId: item.candidateId, continuationId: item.continuationId },
    transform: { position: { x, y: MODULE_GROUND_Y + cell.level * MODULE_HEIGHT_FT, z }, rotationY: cell.turn * Math.PI / 2 },
    zoneIds: [zoneId],
  };
}

function main() {
  const unique = new Map<string, Cell>();
  for (const cell of PLAN) unique.set(`${cell.e}:${cell.n}:${cell.level}`, cell);
  const plan = [...unique.values()];
  assertSupported(plan);
  const configPath = join(process.cwd(), "data", "skill5", "configurations.json");
  const catalogPath = join(process.cwd(), "data", "skill5", "massing-catalog.json");
  const configs = parseConfigurationDocument(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
  const catalog = parseMassingCatalog(JSON.parse(readFileSync(catalogPath, "utf8")) as unknown);
  const massing03 = configs.configurations.find((entry) => entry.name === "Autonomous Massing — 03");
  const priorStudy = catalog.studies.find((item) => item.name === "Autonomous Massing — 01");
  if (!massing03 || !priorStudy) throw new Error("Massing 03 or the saved network is missing.");
  const verified = diagnose(massing03.modules);
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: 1, persist: false, buildings: site.buildings });
  const land: { x: number; z: number }[] = [];
  for (let x = -80; x <= 260; x += STEP) {
    for (let z = -620; z <= 240; z += STEP) {
      if (study.canPlace("source", x, z)) land.push({ x, z });
    }
  }
  let best: { x: number; z: number; score: number } | null = null;
  for (const origin of land) {
    const fits = plan.every((cell) => study.canPlace("source", worldOf(origin, cell).x, worldOf(origin, cell).z));
    if (!fits) continue;
    const arrival = worldOf(origin, plan[0]);
    const tip = worldOf(origin, plan.reduce((far, cell) => cell.e > far.e || (cell.e === far.e && cell.n < far.n) ? cell : far, plan[0]));
    const score = Math.hypot(arrival.x - SOURCE.x, arrival.z - SOURCE.z) + Math.hypot(tip.x - WATER_NODE.x, tip.z - WATER_NODE.z);
    if (!best || score < best.score) best = { x: origin.x, z: origin.z, score };
  }
  if (!best) throw new Error("No land corridor holds the massing between the south source and the water.");
  const zoneIds = new Map<string, string>();
  const clusters = [...new Set(plan.map((cell) => cell.cluster))];
  clusters.forEach((name, index) => zoneIds.set(name, `b4z${index + 1}`));
  const modules = plan.map((cell, index) => {
    const point = worldOf(best, cell);
    return moduleAt(`m${index + 1}`, cell, point.x, point.z, zoneIds.get(cell.cluster) ?? "b4z1");
  });
  const parts = componentCount(modules);
  if (parts !== 1) throw new Error(`The plan is ${parts} separate pieces.`);
  const measured = diagnose(modules);
  if (measured.spanFt.east < 200 || measured.levels.length < 3) throw new Error("The massing is still too small.");
  const zones: ZoningRegion[] = clusters.map((name) => {
    const cells = modules.filter((item) => item.zoneIds[0] === zoneIds.get(name));
    const xs = cells.map((item) => item.transform.position.x);
    const zs = cells.map((item) => item.transform.position.z);
    const kind = cells[0].program ?? "gathering";
    return {
      id: zoneIds.get(name) ?? name,
      name,
      kind,
      points: [
        { x: Math.min(...xs) - 11, z: Math.min(...zs) - 11 },
        { x: Math.max(...xs) + 11, z: Math.min(...zs) - 11 },
        { x: Math.max(...xs) + 11, z: Math.max(...zs) + 11 },
        { x: Math.min(...xs) - 11, z: Math.max(...zs) + 11 },
      ],
      baseFt: 0,
      heightFt: 12,
      visible: true,
      networkId: priorStudy.iterationId,
      pocketId: null,
      sourcePocketIds: [],
    };
  });
  const markers = zones.map((zone) => {
    const center = polygonCentroid(zone.points);
    return { id: `intent-${zone.id}`, typology: zone.kind, x: center.x, z: center.z };
  });
  const kept = configs.configurations.filter((entry) => entry.name !== NAME);
  const id = nextConfigurationId(kept);
  const now = new Date().toISOString();
  const entry: SiteConfiguration = {
    id,
    name: NAME,
    parentConfigurationId: null,
    createdAt: now,
    updatedAt: now,
    modules,
    assemblies: [],
    annotations: [],
    zones,
    networkId: priorStudy.iterationId,
    directJoins: [],
    hybridJoins: [],
    view: { showZones: false, showTiles: true, showConnections: false, showNetwork: true },
  };
  kept.push(entry);
  writeFileSync(configPath, `${JSON.stringify({ contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations: kept, priorities: configs.priorities }, null, 2)}\n`);
  const record: MassingStudy = {
    id: "M04",
    name: NAME,
    configurationId: id,
    createdAt: now,
    seed: priorStudy.seed,
    iterationId: priorStudy.iterationId,
    step: priorStudy.step,
    reached: priorStudy.reached,
    total: priorStudy.total,
    note: priorStudy.note,
    connectedIds: priorStudy.connectedIds,
    nodes: priorStudy.nodes,
    markers,
    branches: priorStudy.branches,
    tiles: modules.length,
    levels: measured.levels.length,
    lobby: modules.filter((item) => item.program === "lobby").length,
    workspace: modules.filter((item) => item.program === "workspace").length,
    gathering: modules.filter((item) => item.program === "gathering").length,
  };
  const studies = [...catalog.studies.filter((item) => item.name !== NAME), record];
  writeFileSync(catalogPath, `${JSON.stringify({ contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies }, null, 2)}\n`);
  const tip = worldOf(best, plan.reduce((far, cell) => cell.e > far.e || (cell.e === far.e && cell.n < far.n) ? cell : far, plan[0]));
  console.log(JSON.stringify({
    massing03: verified,
    id,
    origin: best,
    tip,
    shoreFromTipFt: Math.round(Math.hypot(tip.x - WATER_NODE.x, tip.z - WATER_NODE.z)),
    arrivalFromSourceFt: Math.round(Math.hypot(worldOf(best, plan[0]).x - SOURCE.x, worldOf(best, plan[0]).z - SOURCE.z)),
    massing04: measured,
    components: parts,
    programs: { lobby: record.lobby, workspace: record.workspace, gathering: record.gathering },
  }, null, 2));
}

main();
