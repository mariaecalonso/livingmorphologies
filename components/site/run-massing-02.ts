/**
 * Autonomous Massing 02. One building. Keeps Massing 01 and the other configurations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "@/lib/skill3/solidified-catalogue";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { CONFIGURATION_CONTRACT, nextConfigurationId, parseConfigurationDocument, type SiteConfiguration } from "@/lib/skill5/configurations";
import { SKILL5_SITE_ID } from "@/lib/skill5/contract";
import { MASSING_CATALOG_CONTRACT, parseMassingCatalog, type MassingStudy } from "@/lib/skill5/massing-catalog";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, type PlacedModule } from "@/lib/skill5/placement";
import type { SiteContext } from "@/lib/skill5/site-model";
import { polygonCentroid, type ZoningRegion } from "@/lib/skill5/zoning";
import { SiteNetworkStudy } from "./site-network";

const site = context as SiteContext;
const NAME = "Autonomous Massing — 02";
const STEP = 12;

type Kind = "lobby" | "workspace" | "gathering";
type Cell = { c: number; r: number; level: number; program: Kind; archetype: string; turn: number; cluster: string; sx?: number; sz?: number };

/** Centers are 12 ft apart so the sculpted tiles, about 16 ft across, interlock into masses. Upper floors shift 8 ft. */
const PLAN: Cell[] = [
  { c: 0, r: 1, level: 0, program: "lobby", archetype: "continuous-hall", turn: 0, cluster: "Public Lobby" },
  { c: 1, r: 1, level: 0, program: "lobby", archetype: "topographic-ground-field", turn: 1, cluster: "Public Lobby" },
  { c: 0, r: 2, level: 0, program: "lobby", archetype: "vertical-void", turn: 0, cluster: "Public Lobby" },
  { c: 1, r: 2, level: 0, program: "lobby", archetype: "linear-gallery", turn: 1, cluster: "Public Lobby" },
  { c: 0, r: 1, level: 1, program: "lobby", archetype: "linear-gallery", turn: 2, cluster: "Public Lobby" },
  { c: 1, r: 1, level: 1, program: "lobby", archetype: "compressed-sequential", turn: 0, cluster: "Public Lobby" },
  { c: 0, r: 2, level: 1, program: "lobby", archetype: "vertical-void", turn: 1, cluster: "Public Lobby" },
  { c: 1, r: 2, level: 1, program: "lobby", archetype: "compressed-sequential", turn: 2, cluster: "Public Lobby" },
  { c: 0, r: 2, level: 2, program: "lobby", archetype: "continuous-hall", turn: 0, cluster: "Public Lobby" },
  { c: 0, r: 0, level: 0, program: "lobby", archetype: "compressed-sequential", turn: 0, cluster: "Private Staff Lobby" },
  { c: 1, r: 0, level: 0, program: "lobby", archetype: "linear-gallery", turn: 1, cluster: "Private Staff Lobby" },
  { c: 0, r: 0, level: 1, program: "lobby", archetype: "topographic-ground-field", turn: 2, cluster: "Private Staff Lobby" },
  { c: 1, r: 0, level: 1, program: "lobby", archetype: "continuous-hall", turn: 0, cluster: "Private Staff Lobby" },
  { c: 2, r: 3, level: 0, program: "workspace", archetype: "terraced", turn: 0, cluster: "Architecture Design Studio" },
  { c: 3, r: 3, level: 0, program: "workspace", archetype: "undulated", turn: 1, cluster: "Architecture Design Studio" },
  { c: 4, r: 3, level: 0, program: "workspace", archetype: "open-hall", turn: 2, cluster: "Architecture Design Studio" },
  { c: 3, r: 4, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Architecture Design Studio" },
  { c: 4, r: 4, level: 0, program: "workspace", archetype: "void-edge", turn: 1, cluster: "Architecture Design Studio" },
  { c: 3, r: 3, level: 1, program: "workspace", archetype: "terraced", turn: 3, cluster: "Architecture Design Studio", sx: 8 },
  { c: 4, r: 3, level: 1, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Architecture Design Studio", sx: 8 },
  { c: 4, r: 4, level: 1, program: "workspace", archetype: "undulated", turn: 2, cluster: "Architecture Design Studio", sx: 8 },
  { c: 4, r: 3, level: 2, program: "workspace", archetype: "open-hall", turn: 1, cluster: "Architecture Design Studio", sx: 8 },
  { c: 2, r: 0, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Product Design Studio" },
  { c: 3, r: 0, level: 0, program: "workspace", archetype: "void-edge", turn: 1, cluster: "Product Design Studio" },
  { c: 4, r: 0, level: 0, program: "workspace", archetype: "undulated", turn: 2, cluster: "Product Design Studio" },
  { c: 2, r: 0, level: 1, program: "workspace", archetype: "open-hall", turn: 1, cluster: "Product Design Studio", sx: -8 },
  { c: 3, r: 0, level: 1, program: "workspace", archetype: "terraced", turn: 0, cluster: "Product Design Studio", sx: -8 },
  { c: 4, r: 0, level: 1, program: "workspace", archetype: "flat-deep-plan", turn: 3, cluster: "Product Design Studio", sx: -8 },
  { c: 4, r: 0, level: 2, program: "workspace", archetype: "undulated", turn: 2, cluster: "Product Design Studio", sx: -8 },
  { c: 2, r: 1, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 0, cluster: "Collaboration Hub" },
  { c: 3, r: 1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 1, cluster: "Collaboration Hub" },
  { c: 2, r: 2, level: 0, program: "gathering", archetype: "inserted-horizontal-plate", turn: 0, cluster: "Collaboration Hub" },
  { c: 3, r: 2, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 1, cluster: "Collaboration Hub" },
  { c: 2, r: 1, level: 1, program: "gathering", archetype: "inserted-horizontal-plate", turn: 2, cluster: "Collaboration Hub" },
  { c: 3, r: 1, level: 1, program: "gathering", archetype: "stepped-amphitheater", turn: 0, cluster: "Collaboration Hub" },
  { c: 2, r: 2, level: 1, program: "gathering", archetype: "linear-edge-gallery", turn: 3, cluster: "Collaboration Hub" },
  { c: 3, r: 2, level: 1, program: "gathering", archetype: "contained-room-within-volume", turn: 1, cluster: "Collaboration Hub" },
  { c: 2, r: 1, level: 2, program: "gathering", archetype: "stepped-amphitheater", turn: 2, cluster: "Collaboration Hub" },
  { c: 3, r: 2, level: 2, program: "gathering", archetype: "linear-edge-gallery", turn: 0, cluster: "Collaboration Hub" },
  { c: 4, r: 1, level: 0, program: "workspace", archetype: "open-hall", turn: 0, cluster: "Biological Research and Fabrication" },
  { c: 4, r: 2, level: 0, program: "workspace", archetype: "terraced", turn: 1, cluster: "Biological Research and Fabrication" },
  { c: 5, r: 1, level: 0, program: "workspace", archetype: "void-edge", turn: 2, cluster: "Biological Research and Fabrication" },
  { c: 5, r: 2, level: 0, program: "workspace", archetype: "flat-deep-plan", turn: 0, cluster: "Biological Research and Fabrication" },
  { c: 4, r: 1, level: 1, program: "workspace", archetype: "undulated", turn: 1, cluster: "Biological Research and Fabrication" },
  { c: 5, r: 2, level: 1, program: "workspace", archetype: "open-hall", turn: 3, cluster: "Biological Research and Fabrication" },
  { c: 1, r: -1, level: 0, program: "gathering", archetype: "void-field", turn: 0, cluster: "Exhibition and Indoor Gathering" },
  { c: 2, r: -1, level: 0, program: "gathering", archetype: "inserted-horizontal-plate", turn: 1, cluster: "Exhibition and Indoor Gathering" },
  { c: 3, r: -1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 2, cluster: "Exhibition and Indoor Gathering" },
  { c: 1, r: -1, level: 1, program: "gathering", archetype: "contained-room-within-volume", turn: 0, cluster: "Exhibition and Indoor Gathering" },
  { c: 2, r: -1, level: 1, program: "gathering", archetype: "void-field", turn: 1, cluster: "Exhibition and Indoor Gathering" },
  { c: 4, r: -1, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 1, cluster: "Public Restaurant" },
  { c: 5, r: -1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 0, cluster: "Public Restaurant" },
  { c: 5, r: 0, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 2, cluster: "Public Restaurant" },
  { c: 4, r: -1, level: 1, program: "gathering", archetype: "stepped-amphitheater", turn: 3, cluster: "Public Restaurant" },
  { c: 6, r: -1, level: 0, program: "gathering", archetype: "void-field", turn: 0, cluster: "Waterfront Gathering" },
  { c: 6, r: 0, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 1, cluster: "Waterfront Gathering" },
  { c: 7, r: -1, level: 0, program: "gathering", archetype: "stepped-amphitheater", turn: 2, cluster: "Waterfront Gathering" },
  { c: 7, r: 0, level: 0, program: "gathering", archetype: "contained-room-within-volume", turn: 0, cluster: "Waterfront Gathering" },
  { c: 6, r: -1, level: 1, program: "gathering", archetype: "void-field", turn: 1, cluster: "Waterfront Gathering" },
  { c: 8, r: -1, level: 0, program: "gathering", archetype: "linear-edge-gallery", turn: 2, cluster: "Waterfront Gathering" },
];

function meshSpan(id: string) {
  const item = SITE_ARCHETYPES.find((entry) => entry.archetypeId === id);
  if (!item) return null;
  const stored = readSolidifiedMesh(item.archetypeId, item.candidateId, item.continuationId);
  if (!stored) return null;
  const mesh = decodeSolidifiedMesh(stored.geometry);
  const p = mesh.positions;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < p.length; index += 3) {
    minX = Math.min(minX, p[index]);
    maxX = Math.max(maxX, p[index]);
    minY = Math.min(minY, p[index + 1]);
    maxY = Math.max(maxY, p[index + 1]);
    minZ = Math.min(minZ, p[index + 2]);
    maxZ = Math.max(maxZ, p[index + 2]);
  }
  return {
    id,
    triangles: mesh.triangles,
    eastFt: maxX - minX,
    northFt: maxY - minY,
    upFt: maxZ - minZ,
  };
}

function spread(modules: readonly PlacedModule[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const levels = new Set<number>();
  const nearest: number[] = [];
  for (const item of modules) {
    minX = Math.min(minX, item.transform.position.x);
    maxX = Math.max(maxX, item.transform.position.x);
    minZ = Math.min(minZ, item.transform.position.z);
    maxZ = Math.max(maxZ, item.transform.position.z);
    levels.add(Math.round((item.transform.position.y - MODULE_GROUND_Y) / MODULE_HEIGHT_FT));
  }
  for (const item of modules) {
    let best = Infinity;
    for (const other of modules) {
      if (other === item) continue;
      best = Math.min(best, Math.hypot(item.transform.position.x - other.transform.position.x, item.transform.position.z - other.transform.position.z, item.transform.position.y - other.transform.position.y));
    }
    nearest.push(best);
  }
  nearest.sort((a, b) => a - b);
  const isolated = nearest.filter((gap) => gap > 30).length;
  return {
    tiles: modules.length,
    levels: levels.size,
    spanFt: { east: maxX - minX + 20, north: maxZ - minZ + 20 },
    medianNeighborFt: nearest[Math.floor(nearest.length / 2)] ?? null,
    isolatedOver30Ft: isolated,
  };
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
      const dx = Math.abs(a.x - b.x);
      const dz = Math.abs(a.z - b.z);
      const dy = Math.abs(a.y - b.y);
      const plan = Math.hypot(dx, dz);
      const stacked = plan <= 12 && dy > 10 && dy <= MODULE_HEIGHT_FT + 0.5;
      const beside = dy < 1 && plan > 1 && plan <= STEP + 2.5;
      if (stacked || beside) join(i, j);
    }
  }
  return new Set(parent.map((_, index) => find(index))).size;
}

function placeOf(origin: { x: number; z: number }, cell: Cell) {
  return { x: origin.x + cell.c * STEP + (cell.sx ?? 0), z: origin.z + cell.r * STEP + (cell.sz ?? 0) };
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
  const previous = configs.configurations.find((entry) => entry.name === "Autonomous Massing — 01");
  const priorStudy = catalog.studies.find((item) => item.name === "Autonomous Massing — 01");
  if (!previous || !priorStudy) throw new Error("Massing 01 is missing.");
  const diagnosis = {
    massing01: spread(previous.modules),
    mesh: meshSpan("continuous-hall"),
    siteFt: { east: 331.4, north: 829.7 },
    cause: "The tiles use the stored meshes, about 20 ft on a side. They were placed in separate zones across the parcel, and the camera frames the whole site, so the building reads as scattered objects.",
  };
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: 1, persist: false, buildings: site.buildings });
  const land: { x: number; z: number }[] = [];
  const water: { x: number; z: number }[] = [];
  for (let x = -80; x <= 260; x += STEP) {
    for (let z = -600; z <= 240; z += STEP) {
      if (study.canPlace("source", x, z)) land.push({ x, z });
      else if (study.canPlace("attractor", x, z) && study.onWater(x, z)) water.push({ x, z });
    }
  }
  let best: { x: number; z: number; score: number } | null = null;
  for (const origin of land) {
    const fits = PLAN.every((cell) => {
      const point = placeOf(origin, cell);
      return study.canPlace("source", point.x, point.z);
    });
    if (!fits) continue;
    const tip = placeOf(origin, PLAN.reduce((far, cell) => cell.c > far.c ? cell : far, PLAN[0]));
    const tipX = tip.x;
    const tipZ = tip.z;
    let shore = Infinity;
    for (const cell of water) shore = Math.min(shore, Math.hypot(tipX - cell.x, tipZ - cell.z));
    const score = tipX - shore * 0.35;
    if (!best || score > best.score) best = { x: origin.x, z: origin.z, score };
  }
  if (!best) throw new Error("No land patch holds the building.");
  const zoneIds = new Map<string, string>();
  const clusters = [...new Set(PLAN.map((cell) => cell.cluster))];
  clusters.forEach((name, index) => zoneIds.set(name, `b2z${index + 1}`));
  const modules = PLAN.map((cell, index) => {
    const point = placeOf(best, cell);
    return moduleAt(`m${index + 1}`, cell, point.x, point.z, zoneIds.get(cell.cluster) ?? "b2z1");
  });
  const parts = componentCount(modules);
  if (parts !== 1) throw new Error(`The plan is ${parts} separate pieces.`);
  const zones: ZoningRegion[] = clusters.map((name) => {
    const cells = PLAN.filter((cell) => cell.cluster === name);
    const xs = cells.map((cell) => placeOf(best, cell).x);
    const zs = cells.map((cell) => placeOf(best, cell).z);
    const minX = Math.min(...xs) - 12;
    const maxX = Math.max(...xs) + 12;
    const minZ = Math.min(...zs) - 12;
    const maxZ = Math.max(...zs) + 12;
    const kind = cells[0].program;
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
    id: "M02",
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
  const tip = placeOf(best, PLAN.reduce((far, cell) => cell.c > far.c ? cell : far, PLAN[0]));
  let shore = Infinity;
  for (const cell of water) shore = Math.min(shore, Math.hypot(tip.x - cell.x, tip.z - cell.z));
  console.log(JSON.stringify({
    diagnosis,
    id,
    origin: best,
    shoreFromTipFt: Number(shore.toFixed(1)),
    massing02: spread(modules),
    components: parts,
    programs: { lobby: record.lobby, workspace: record.workspace, gathering: record.gathering },
    clusters: clusters,
  }, null, 2));
}

main();
