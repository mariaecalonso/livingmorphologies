/**
 * Autonomous Massing 01. Uses the existing network, zoning, and tile records.
 * Appends one configuration and one catalog study. Does not remove other saves.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { CONFIGURATION_CONTRACT, nextConfigurationId, parseConfigurationDocument } from "@/lib/skill5/configurations";
import { MASSING_CATALOG_CONTRACT, parseMassingCatalog, type MassingStudy } from "@/lib/skill5/massing-catalog";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, pointInRing, snapModuleOrigin, type PlacedModule } from "@/lib/skill5/placement";
import { detectPockets } from "@/lib/skill5/pockets";
import { SKILL5_SITE_ID } from "@/lib/skill5/contract";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { consolidatePockets } from "@/lib/skill5/zone-consolidation";
import { polygonCentroid, type ZoningRegion } from "@/lib/skill5/zoning";
import { runNetworkIteration, SiteNetworkStudy, type NetworkNode } from "./site-network";
import { chooseSiteCoverage } from "./strategy-coverage";

const site = context as SiteContext;
const SEED = 20261113;
const NAME = "Autonomous Massing — 01";
const CYCLES = {
  lobby: ["continuous-hall", "vertical-void", "linear-gallery", "compressed-sequential", "topographic-ground-field"],
  workspace: ["terraced", "undulated", "open-hall", "flat-deep-plan", "void-edge"],
  gathering: ["stepped-amphitheater", "linear-edge-gallery", "void-field", "inserted-horizontal-plate", "contained-room-within-volume"],
} as const;

function bounds(ring: readonly XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function eligible(study: SiteNetworkStudy) {
  const box = bounds(site.site.ring);
  const land: { x: number; z: number }[] = [];
  const water: { x: number; z: number }[] = [];
  for (let x = box.minX; x <= box.maxX; x += 20) {
    for (let z = box.minZ; z <= box.maxZ; z += 20) {
      if (study.canPlace("source", x, z)) land.push({ x, z });
      else if (study.canPlace("attractor", x, z) && study.onWater(x, z)) water.push({ x, z });
    }
  }
  return { land, water };
}

function cellsIn(points: { x: number; z: number }[], study: SiteNetworkStudy) {
  const box = bounds(points.map((point) => [point.x, point.z]));
  const cells: { x: number; z: number }[] = [];
  for (let x = box.minX - 20; x <= box.maxX + 20; x += 20) {
    for (let z = box.minZ - 20; z <= box.maxZ + 20; z += 20) {
      const snapped = snapModuleOrigin(x, z);
      if (!pointInRing(snapped.x, snapped.z, points.map((point) => [point.x, point.z] as XZ))) continue;
      if (!study.canPlace("source", snapped.x, snapped.z)) continue;
      if (cells.some((cell) => cell.x === snapped.x && cell.z === snapped.z)) continue;
      cells.push(snapped);
    }
  }
  return cells;
}

function moduleAt(id: string, archetypeId: string, x: number, y: number, z: number, rotationY: number, zoneId: string): PlacedModule {
  const item = SITE_ARCHETYPES.find((entry) => entry.archetypeId === archetypeId);
  if (!item?.program) throw new Error(archetypeId);
  return {
    instanceId: id,
    kind: "archetype",
    name: item.name,
    status: item.status,
    geometryState: "available",
    program: item.program,
    programSource: "assigned",
    provenance: {
      moduleId: item.moduleId,
      archetypeId,
      source: "skill3",
      candidateId: item.candidateId,
      continuationId: item.continuationId,
    },
    transform: { position: { x, y, z }, rotationY },
    zoneIds: [zoneId],
  };
}

async function main() {
  const probe = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: 1, persist: false, buildings: site.buildings });
  const { land, water } = eligible(probe);
  const choices = chooseSiteCoverage(land, water);
  const planter = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: SEED, persist: false, buildings: site.buildings });
  for (const choice of choices) planter.place(choice.kind, choice.x, choice.z);
  const nodes = planter.edit.nodes.map((node) => ({ ...node })) as NetworkNode[];
  console.log(`nodes ${nodes.length}`);
  const iteration = await runNetworkIteration(site.site.ring, site.water.ring, nodes, SEED, (step) => console.log(`step ${step}`), site.buildings);
  const branches = iteration.branches ?? [];
  const pockets = detectPockets(branches, site.site.ring);
  const consolidated = consolidatePockets(pockets.pockets);
  const take = (kind: "lobby" | "workspace" | "gathering", count: number) => consolidated.zones
    .filter((zone) => zone.kind === kind)
    .sort((a, b) => b.areaSqFt - a.areaSqFt)
    .slice(0, count);
  const chosen = [
    ...take("lobby", 2).map((zone, index) => ({ ...zone, name: index === 0 ? "Public Lobby" : "Private Staff Lobby" })),
    ...take("workspace", 2).map((zone, index) => ({ ...zone, name: index === 0 ? "Architecture and Product Design Studios" : "Prototyping and Biological Research" })),
    ...take("gathering", 3).map((zone, index) => ({ ...zone, name: ["Waterfront Gathering", "Exhibition and Indoor Gathering", "Collaboration Hub and Dining"][index] })),
  ];
  const networkId = `i-massing-01-${SEED}`;
  const zones: ZoningRegion[] = chosen.map((zone, index) => ({
    id: `mz${index + 1}`,
    name: zone.name,
    kind: zone.kind,
    points: zone.points,
    baseFt: 0,
    heightFt: 12,
    visible: true,
    networkId,
    pocketId: null,
    sourcePocketIds: zone.pocketIds,
  }));
  const occupied = new Set<string>();
  const modules: PlacedModule[] = [];
  let serial = 1;
  const cursors = { lobby: 0, workspace: 0, gathering: 0 };
  const place = (archetypeId: string, x: number, level: number, z: number, zoneId: string, turn: number) => {
    const key = `${x}:${level}:${z}`;
    if (occupied.has(key) || modules.length >= 42) return;
    occupied.add(key);
    modules.push(moduleAt(`m${serial}`, archetypeId, x, MODULE_GROUND_Y + level * MODULE_HEIGHT_FT, z, turn * Math.PI / 2, zoneId));
    serial += 1;
  };
  zones.forEach((zone, zoneIndex) => {
    const center = polygonCentroid(zone.points);
    const spots = cellsIn(zone.points, probe).sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z));
    const ground = spots.slice(0, zone.kind === "gathering" ? 4 : 3);
    ground.forEach((spot, index) => {
      const list = CYCLES[zone.kind];
      const archetypeId = list[cursors[zone.kind] % list.length];
      cursors[zone.kind] += 1;
      const turn = (zoneIndex + index) % 4;
      place(archetypeId, spot.x, 0, spot.z, zone.id, turn);
      if (index < 2) {
        const upperId = list[cursors[zone.kind] % list.length];
        cursors[zone.kind] += 1;
        const shifted = index === 1 ? snapModuleOrigin(spot.x + 20, spot.z) : spot;
        const upper = probe.canPlace("source", shifted.x, shifted.z) ? shifted : spot;
        place(upperId, upper.x, 1, upper.z, zone.id, (turn + 1) % 4);
      }
      if (index === 0 && (zone.kind === "lobby" || zone.name === "Waterfront Gathering")) {
        const crownId = list[cursors[zone.kind] % list.length];
        cursors[zone.kind] += 1;
        place(crownId, spot.x, 2, spot.z, zone.id, turn);
      }
    });
  });
  const markers = zones.map((zone) => {
    const center = polygonCentroid(zone.points);
    return { id: `intent-${zone.id}`, typology: zone.kind, x: center.x, z: center.z };
  });
  const levels = new Set(modules.map((item) => Math.round((item.transform.position.y - MODULE_GROUND_Y) / MODULE_HEIGHT_FT))).size;
  const count = (kind: PlacedModule["program"]) => modules.filter((item) => item.program === kind).length;
  const configPath = join(process.cwd(), "data", "skill5", "configurations.json");
  const catalogPath = join(process.cwd(), "data", "skill5", "massing-catalog.json");
  const configs = parseConfigurationDocument(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
  const kept = configs.configurations.filter((entry) => entry.name !== NAME);
  const id = nextConfigurationId(kept);
  const now = new Date().toISOString();
  kept.push({
    id,
    name: NAME,
    parentConfigurationId: null,
    createdAt: now,
    updatedAt: now,
    modules,
    assemblies: [],
    annotations: [],
    zones,
    networkId,
    directJoins: [],
    hybridJoins: [],
    view: { showZones: true, showTiles: true, showConnections: true, showNetwork: true },
  });
  writeFileSync(configPath, `${JSON.stringify({ contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations: kept, priorities: configs.priorities }, null, 2)}\n`);
  let catalog = emptyCatalog();
  try {
    catalog = parseMassingCatalog(JSON.parse(readFileSync(catalogPath, "utf8")) as unknown);
  } catch {
    catalog = emptyCatalog();
  }
  const study: MassingStudy = {
    id: "M01",
    name: NAME,
    configurationId: id,
    createdAt: now,
    seed: SEED,
    iterationId: networkId,
    step: iteration.step,
    reached: iteration.reached,
    total: iteration.total,
    note: iteration.note,
    connectedIds: [...iteration.connectedIds],
    nodes,
    markers,
    branches,
    tiles: modules.length,
    levels,
    lobby: count("lobby"),
    workspace: count("workspace"),
    gathering: count("gathering"),
  };
  const studies = [...catalog.studies.filter((item) => item.name !== NAME), study];
  writeFileSync(catalogPath, `${JSON.stringify({ contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies }, null, 2)}\n`);
  console.log(JSON.stringify({
    id,
    tiles: modules.length,
    levels,
    lobby: count("lobby"),
    workspace: count("workspace"),
    gathering: count("gathering"),
    zones: zones.map((zone) => zone.name),
    reached: `${iteration.reached}/${iteration.total}`,
    note: iteration.note,
    archetypes: [...new Set(modules.map((item) => item.provenance.archetypeId))],
  }, null, 2));
}

function emptyCatalog() {
  return { contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies: [] as MassingStudy[] };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
