/**
 * Autonomous Massing 03. Masses follow the saved site strategy.
 * Keeps Massing 01, Massing 02, and the other configurations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { CONFIGURATION_CONTRACT, nextConfigurationId, parseConfigurationDocument, type SiteConfiguration } from "@/lib/skill5/configurations";
import { SKILL5_SITE_ID } from "@/lib/skill5/contract";
import { MASSING_CATALOG_CONTRACT, parseMassingCatalog, type MassingStudy } from "@/lib/skill5/massing-catalog";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, type PlacedModule } from "@/lib/skill5/placement";
import type { SiteContext } from "@/lib/skill5/site-model";
import { polygonCentroid, type ZoningRegion } from "@/lib/skill5/zoning";
import { SiteNetworkStudy } from "./site-network";

const site = context as SiteContext;
const NAME = "Autonomous Massing — 03";
const STEP = 20;
const SOURCE = { x: -35.51, z: -452.37 };
const WATER_NODE = { x: 244.49, z: -592.37 };

type Kind = "lobby" | "workspace" | "gathering";
type Cell = { e: number; n: number; level: number; program: Kind; archetype: string; turn: number; cluster: string };

/** East index grows toward the water. North index grows inland. The east arm steps south. */
const PLAN: Cell[] = [
  { e: 0, n: 3, level: 0, program: "lobby", archetype: "continuous-hall", turn: 0, cluster: "Public Lobby" },
  { e: 1, n: 3, level: 0, program: "lobby", archetype: "topographic-ground-field", turn: 1, cluster: "Public Lobby" },
  { e: 0, n: 4, level: 0, program: "lobby", archetype: "vertical-void", turn: 0, cluster: "Public Lobby" },
  { e: 1, n: 4, level: 0, program: "lobby", archetype: "linear-gallery", turn: 1, cluster: "Public Lobby" },
  { e: 0, n: 3, level: 1, program: "lobby", archetype: "linear-gallery", turn: 2, cluster: "Public Lobby" },
  { e: 1, n: 4, level: 1, program: "lobby", archetype: "compressed-sequential", turn: 0, cluster: "Public Lobby" },
  { e: 1, n: 4, level: 2, program: "lobby", archetype: "vertical-void", turn: 0, cluster: "Public Lobby" },
  { e: 0, n: 2, level: 0, program: "lobby", archetype: "compressed-sequential", turn: 0, cluster: "Private Staff Lobby" },
  { e: 1, n: 2, level: 0, program: "lobby", archetype: "linear-gallery", turn: 1, cluster: "Private Staff Lobby" },
  { e: 0, n: 2, level: 1, program: "lobby", archetype: "continuous-hall", turn: 0, cluster: "Private Staff Lobby" },
  { e: 2, n: 4, level: 0, program: "workspace", archetype: "terraced", turn: 0, cluster: "Architecture Design Studio" },
  { e: 3, n: 4, level: 0, program: "workspace", archetype: "undulated", turn: 1, cluster: "Architecture Design Studio" },
  { e: 4, n: 4, level: 0, program: "workspace", archetype: "open-hall", turn: 2, cluster: "Architecture Design Studio" },
  { e: 5, n: 4, level: 0, program: "workspace", archetype: "void-edge", turn: 1, cluster: "Architecture Design Studio" },
  { e: 3, n: 5, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Architecture Design Studio" },
  { e: 4, n: 5, level: 0, program: "workspace", archetype: "terraced", turn: 3, cluster: "Architecture Design Studio" },
  { e: 4, n: 5, level: 1, program: "workspace", archetype: "void-edge", turn: 0, cluster: "Architecture Design Studio" },
  { e: 5, n: 4, level: 1, program: "workspace", archetype: "flat-deep-plan", turn: 1, cluster: "Architecture Design Studio" },
  { e: 4, n: 5, level: 2, program: "workspace", archetype: "undulated", turn: 2, cluster: "Architecture Design Studio" },
  { e: 2, n: 1, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Product Design Studio" },
  { e: 3, n: 1, level: 0, program: "workspace", archetype: "void-edge", turn: 1, cluster: "Product Design Studio" },
  { e: 4, n: 1, level: 0, program: "workspace", archetype: "undulated", turn: 2, cluster: "Product Design Studio" },
  { e: 5, n: 1, level: 0, program: "workspace", archetype: "open-hall", turn: 0, cluster: "Product Design Studio" },
  { e: 3, n: 0, level: 0, program: "workspace", archetype: "terraced", turn: 1, cluster: "Product Design Studio" },
  { e: 4, n: 0, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 2, cluster: "Product Design Studio" },
  { e: 4, n: 1, level: 1, program: "workspace", archetype: "undulated", turn: 0, cluster: "Product Design Studio" },
  { e: 5, n: 1, level: 1, program: "workspace", archetype: "open-hall", turn: 1, cluster: "Product Design Studio" },
  { e: 2, n: 2, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 0, cluster: "Collaboration Hub" },
  { e: 3, n: 2, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 1, cluster: "Collaboration Hub" },
  { e: 4, n: 2, level: 0, program: "gathering", archetype: "inserted-horizontal-plate", turn: 0, cluster: "Collaboration Hub" },
  { e: 2, n: 3, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 1, cluster: "Collaboration Hub" },
  { e: 3, n: 3, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 2, cluster: "Collaboration Hub" },
  { e: 4, n: 3, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 3, cluster: "Collaboration Hub" },
  { e: 3, n: 2, level: 1, program: "gathering", archetype: "inserted-horizontal-plate", turn: 0, cluster: "Collaboration Hub" },
  { e: 4, n: 2, level: 1, program: "gathering", archetype: "stepped-amphitheater", turn: 1, cluster: "Collaboration Hub" },
  { e: 4, n: 3, level: 1, program: "gathering", archetype: "contained-room-within-volume", turn: 2, cluster: "Collaboration Hub" },
  { e: 3, n: 2, level: 2, program: "gathering", archetype: "stepped-amphitheater", turn: 0, cluster: "Collaboration Hub" },
  { e: 4, n: 2, level: 2, program: "gathering", archetype: "linear-edge-gallery", turn: 1, cluster: "Collaboration Hub" },
  { e: 5, n: 2, level: 0, program: "workspace", archetype: "open-hall", turn: 0, cluster: "Biological Research and Fabrication" },
  { e: 6, n: 2, level: 0, program: "workspace", archetype: "terraced", turn: 1, cluster: "Biological Research and Fabrication" },
  { e: 7, n: 2, level: 0, program: "workspace", archetype: "void-edge", turn: 2, cluster: "Biological Research and Fabrication" },
  { e: 7, n: 3, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Biological Research and Fabrication" },
  { e: 6, n: 2, level: 1, program: "workspace", archetype: "undulated", turn: 1, cluster: "Biological Research and Fabrication" },
  { e: 1, n: 1, level: 0, program: "gathering", archetype: "void-field", turn: 0, cluster: "Exhibition and Indoor Gathering" },
  { e: 2, n: 0, level: 0, program: "gathering", archetype: "inserted-horizontal-plate", turn: 1, cluster: "Exhibition and Indoor Gathering" },
  { e: 1, n: 1, level: 1, program: "gathering", archetype: "contained-room-within-volume", turn: 0, cluster: "Exhibition and Indoor Gathering" },
  { e: 2, n: 0, level: 1, program: "gathering", archetype: "linear-edge-gallery", turn: 2, cluster: "Exhibition and Indoor Gathering" },
  { e: 6, n: 1, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 1, cluster: "Public Restaurant" },
  { e: 7, n: 1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 0, cluster: "Public Restaurant" },
  { e: 6, n: 0, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 2, cluster: "Public Restaurant" },
  { e: 7, n: 1, level: 1, program: "gathering", archetype: "stepped-amphitheater", turn: 3, cluster: "Public Restaurant" },
  { e: 8, n: 2, level: 0, program: "gathering", archetype: "void-field", turn: 0, cluster: "Waterfront Gathering" },
  { e: 8, n: 1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 1, cluster: "Waterfront Gathering" },
  { e: 9, n: 1, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 2, cluster: "Waterfront Gathering" },
  { e: 9, n: 0, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 0, cluster: "Waterfront Gathering" },
  { e: 10, n: 0, level: 0, program: "gathering", archetype: "void-field", turn: 1, cluster: "Waterfront Gathering" },
  { e: 10, n: -1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 2, cluster: "Waterfront Gathering" },
  { e: 11, n: -1, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 0, cluster: "Waterfront Gathering" },
  { e: 12, n: -1, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 1, cluster: "Waterfront Gathering" },
  { e: 12, n: -2, level: 0, program: "gathering", archetype: "void-field", turn: 2, cluster: "Waterfront Gathering" },
  { e: 8, n: 2, level: 1, program: "gathering", archetype: "linear-edge-gallery", turn: 0, cluster: "Waterfront Gathering" },
];

function diagnose(modules: readonly PlacedModule[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const levels = new Map<number, number>();
  let overlapPairs = 0;
  const nearest: number[] = [];
  for (const item of modules) {
    const { x, y, z } = item.transform.position;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    const level = Math.round((y - MODULE_GROUND_Y) / MODULE_HEIGHT_FT);
    levels.set(level, (levels.get(level) ?? 0) + 1);
  }
  for (let i = 0; i < modules.length; i += 1) {
    const a = modules[i].transform.position;
    let best = Infinity;
    for (let j = i + 1; j < modules.length; j += 1) {
      const b = modules[j].transform.position;
      const gap = Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y);
      best = Math.min(best, gap);
      const sameLevel = Math.abs(a.y - b.y) < 1;
      const plan = Math.hypot(a.x - b.x, a.z - b.z);
      if (sameLevel && plan < STEP - 0.5 && plan > 1) overlapPairs += 1;
    }
    nearest.push(best);
  }
  nearest.sort((left, right) => left - right);
  const cells = new Set(modules.map((item) => `${Math.round(item.transform.position.x)}:${Math.round(item.transform.position.z)}`));
  return {
    tiles: modules.length,
    levels: [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([level, count]) => ({ level, count })),
    spanFt: { east: Math.round(maxX - minX + STEP), north: Math.round(maxZ - minZ + STEP) },
    origin: { x: minX, z: minZ },
    footprintSqFt: cells.size * STEP * STEP,
    medianNeighborFt: nearest[Math.floor(nearest.length / 2)] ?? null,
    overlapPairsUnder20Ft: overlapPairs,
    distanceFromWestSourceFt: Math.round(Math.hypot(minX - SOURCE.x, ((minZ + maxZ) / 2) - SOURCE.z)),
    distanceFromWaterNodeFt: Math.round(Math.hypot(maxX - WATER_NODE.x, minZ - WATER_NODE.z)),
  };
}

function worldOf(origin: { x: number; z: number }, cell: Cell) {
  return { x: origin.x + cell.e * STEP, z: origin.z + cell.n * STEP };
}

function componentCount(modules: readonly PlacedModule[]) {
  const parent = modules.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (a: number, b: number) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent[right] = left;
  };
  for (let i = 0; i < modules.length; i += 1) {
    for (let j = i + 1; j < modules.length; j += 1) {
      const a = modules[i].transform.position;
      const b = modules[j].transform.position;
      const plan = Math.hypot(a.x - b.x, a.z - b.z);
      const dy = Math.abs(a.y - b.y);
      const beside = dy < 1 && plan > 1 && plan <= STEP + 0.5;
      const stacked = plan < 1 && dy > 10 && dy <= MODULE_HEIGHT_FT + 0.5;
      if (beside || stacked) join(i, j);
    }
  }
  return new Set(parent.map((_, index) => find(index))).size;
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
  const configPath = join(process.cwd(), "data", "skill5", "configurations.json");
  const catalogPath = join(process.cwd(), "data", "skill5", "massing-catalog.json");
  const configs = parseConfigurationDocument(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
  const catalog = parseMassingCatalog(JSON.parse(readFileSync(catalogPath, "utf8")) as unknown);
  const previous = configs.configurations.find((entry) => entry.name === "Autonomous Massing — 02");
  const priorStudy = catalog.studies.find((item) => item.name === "Autonomous Massing — 01");
  if (!previous || !priorStudy) throw new Error("Massing 02 or the saved network is missing.");
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: 1, persist: false, buildings: site.buildings });
  const land: { x: number; z: number }[] = [];
  for (let x = -80; x <= 260; x += STEP) {
    for (let z = -600; z <= 240; z += STEP) {
      if (study.canPlace("source", x, z)) land.push({ x, z });
    }
  }
  let best: { x: number; z: number; score: number } | null = null;
  for (const origin of land) {
    const fits = PLAN.every((cell) => {
      const point = worldOf(origin, cell);
      return study.canPlace("source", point.x, point.z);
    });
    if (!fits) continue;
    const arrival = worldOf(origin, PLAN[0]);
    const tip = worldOf(origin, PLAN.reduce((far, cell) => cell.e > far.e ? cell : far, PLAN[0]));
    const score = Math.hypot(arrival.x - SOURCE.x, arrival.z - SOURCE.z) + Math.hypot(tip.x - WATER_NODE.x, tip.z - WATER_NODE.z);
    if (!best || score < best.score) best = { x: origin.x, z: origin.z, score };
  }
  if (!best) throw new Error("No land corridor holds the building between the south source and the water.");
  const zoneIds = new Map<string, string>();
  const clusters = [...new Set(PLAN.map((cell) => cell.cluster))];
  clusters.forEach((name, index) => zoneIds.set(name, `b3z${index + 1}`));
  const modules = PLAN.map((cell, index) => {
    const point = worldOf(best, cell);
    return moduleAt(`m${index + 1}`, cell, point.x, point.z, zoneIds.get(cell.cluster) ?? "b3z1");
  });
  const parts = componentCount(modules);
  if (parts !== 1) throw new Error(`The plan is ${parts} separate pieces.`);
  const levelSets = [0, 1, 2].map((level) => new Set(PLAN.filter((cell) => cell.level === level).map((cell) => `${cell.e}:${cell.n}`)));
  if ([...levelSets[0]].sort().join() === [...levelSets[1]].sort().join()) throw new Error("The upper floor repeats the ground floor.");
  const measured = diagnose(modules);
  if (measured.spanFt.east < 180) throw new Error("The building is still too short toward the water.");
  const zones: ZoningRegion[] = clusters.map((name) => {
    const cells = modules.filter((item) => item.zoneIds[0] === zoneIds.get(name));
    const xs = cells.map((item) => item.transform.position.x);
    const zs = cells.map((item) => item.transform.position.z);
    const minX = Math.min(...xs) - 11;
    const maxX = Math.max(...xs) + 11;
    const minZ = Math.min(...zs) - 11;
    const maxZ = Math.max(...zs) + 11;
    const kind = cells[0].program ?? "gathering";
    return {
      id: zoneIds.get(name) ?? name,
      name,
      kind,
      points: [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }],
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
    id: "M03",
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
    levels: new Set(PLAN.map((cell) => cell.level)).size,
    lobby: modules.filter((item) => item.program === "lobby").length,
    workspace: modules.filter((item) => item.program === "workspace").length,
    gathering: modules.filter((item) => item.program === "gathering").length,
  };
  const studies = [...catalog.studies.filter((item) => item.name !== NAME), record];
  writeFileSync(catalogPath, `${JSON.stringify({ contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies }, null, 2)}\n`);
  const centroids = clusters.map((name) => {
    const cells = modules.filter((item) => item.zoneIds[0] === zoneIds.get(name));
    const x = cells.reduce((sum, item) => sum + item.transform.position.x, 0) / cells.length;
    const z = cells.reduce((sum, item) => sum + item.transform.position.z, 0) / cells.length;
    return { name, tiles: cells.length, x: Math.round(x), z: Math.round(z) };
  });
  console.log(JSON.stringify({
    massing02: diagnose(previous.modules),
    cause: "Massing 02 used one origin and 12 ft centers, scored so the whole plan sat against the southeast water. The saved network was copied for display and did not choose the placement. Renderer copies stored mesh coordinates with no scale.",
    id,
    origin: best,
    massing03: measured,
    components: parts,
    programs: { lobby: record.lobby, workspace: record.workspace, gathering: record.gathering },
    centroids,
  }, null, 2));
}

main();
