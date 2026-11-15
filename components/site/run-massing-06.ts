/**
 * Autonomous Massing 06.
 * Runs the site solver, zones the pockets it actually produces, places tiles in those zones,
 * then attempts direct joins and Skill 04 hybrids. Massings 01–05 stay untouched.
 * Adjacency that never produces a mesh is reported as unresolved.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import type { Skill4ModuleRecord } from "@/lib/skill4/contract";
import { loadModuleMap } from "@/lib/skill4/tiles";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { CONFIGURATION_CONTRACT, nextConfigurationId, parseConfigurationDocument } from "@/lib/skill5/configurations";
import type { SiteConfiguration } from "@/lib/skill5/configurations";
import { SKILL5_SITE_ID } from "@/lib/skill5/contract";
import { proposeDirectJoin } from "@/lib/skill5/direct-join";
import { buildHybridOffer, placeHybridCandidate, suggestedSiteFaces } from "@/lib/skill5/hybrid-join";
import { MASSING_CATALOG_CONTRACT, parseMassingCatalog } from "@/lib/skill5/massing-catalog";
import type { MassingStudy } from "@/lib/skill5/massing-catalog";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, pointInRing, snapModuleOrigin } from "@/lib/skill5/placement";
import type { PlacedModule } from "@/lib/skill5/placement";
import { detectPockets } from "@/lib/skill5/pockets";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { consolidatePockets, type PocketAssignment } from "@/lib/skill5/zone-consolidation";
import { polygonCentroid, type ZoneKind, type ZoningRegion } from "@/lib/skill5/zoning";
import { runNetworkIteration, SiteNetworkStudy, type NetworkIteration, type NetworkNode } from "./site-network";

const site = context as SiteContext;
const NAME = "Autonomous Massing — 06";
const API = "http://127.0.0.1:43141";
const STEP = 20;

type Marker = { id: string; name: string; typology: ZoneKind; x: number; z: number };
type Intent = { label: string; typology: ZoneKind; x: number; z: number; water?: boolean };

const MARKER_INTENT: Intent[] = [
  { label: "Public Lobby", typology: "lobby", x: -10, z: -400 },
  { label: "Private Staff Lobby", typology: "lobby", x: -40, z: -260 },
  { label: "Architecture Design Studio", typology: "workspace", x: 30, z: 120 },
  { label: "Product Design Studio", typology: "workspace", x: 50, z: -160 },
  { label: "Biological Research Lab", typology: "workspace", x: 160, z: 40 },
  { label: "Prototyping Lab", typology: "workspace", x: 150, z: -200 },
  { label: "Collaboration Hub", typology: "gathering", x: 40, z: -20 },
  { label: "Exhibition and Indoor Gathering", typology: "gathering", x: 10, z: -300 },
  { label: "Public Restaurant", typology: "gathering", x: 170, z: -450 },
  { label: "Waterfront Gathering", typology: "gathering", x: 190, z: -340 },
];

const LAYOUTS: { name: string; sources: Intent[]; attractors: Intent[] }[] = [
  {
    name: "north-center-south-east",
    sources: [
      { label: "Northern source", typology: "workspace", x: 30, z: 150 },
      { label: "Southern arrival source", typology: "lobby", x: -20, z: -430 },
    ],
    attractors: [
      { label: "Central attractor", typology: "gathering", x: 70, z: -40 },
      { label: "Northeast attractor", typology: "workspace", x: 180, z: 100 },
      { label: "Mid-south connector", typology: "workspace", x: 40, z: -180 },
      { label: "Eastern waterfront attractor", typology: "gathering", x: 190, z: -280 },
      { label: "Southeast water attractor", typology: "gathering", x: 230, z: -520, water: true },
    ],
  },
  {
    name: "shifted-across-the-parcel",
    sources: [
      { label: "North-central source", typology: "workspace", x: 80, z: 60 },
      { label: "Southern source", typology: "lobby", x: 30, z: -380 },
    ],
    attractors: [
      { label: "Northwest attractor", typology: "workspace", x: -10, z: 170 },
      { label: "Central-east attractor", typology: "gathering", x: 150, z: -100 },
      { label: "Southeast land attractor", typology: "gathering", x: 140, z: -400 },
      { label: "East edge attractor", typology: "gathering", x: 210, z: -180 },
    ],
  },
];

function ringOf(points: readonly { x: number; z: number }[]): XZ[] {
  return points.map((point) => [point.x, point.z]);
}

function boundsOf(points: readonly { x: number; z: number }[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function findLegal(study: SiteNetworkStudy, kind: "source" | "attractor", x: number, z: number, taken: readonly { x: number; z: number }[], water = false) {
  for (let radius = 0; radius <= 220; radius += STEP) {
    for (let dx = -radius; dx <= radius; dx += STEP) {
      for (let dz = -radius; dz <= radius; dz += STEP) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const point = { x: x + dx, z: z + dz };
        if (!study.canPlace(kind, point.x, point.z)) continue;
        if (water && !study.onWater(point.x, point.z)) continue;
        if (taken.some((node) => Math.hypot(node.x - point.x, node.z - point.z) < 70)) continue;
        return point;
      }
    }
  }
  return water ? findLegal(study, kind, x, z, taken, false) : null;
}

function placeLayout(layout: (typeof LAYOUTS)[number], seed: number) {
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed, persist: false, buildings: site.buildings });
  const placed: { label: string; kind: "source" | "attractor"; x: number; z: number }[] = [];
  const missed: string[] = [];
  const put = (kind: "source" | "attractor", intent: Intent) => {
    const point = findLegal(study, kind, intent.x, intent.z, placed, intent.water === true);
    if (!point || !study.place(kind, point.x, point.z)) {
      missed.push(intent.label);
      return;
    }
    placed.push({ label: intent.label, kind, x: point.x, z: point.z });
  };
  for (const source of layout.sources) put("source", source);
  for (const attractor of layout.attractors) put("attractor", attractor);
  return { nodes: study.edit.nodes.map((node) => ({ ...node })), placed, missed };
}

function spreadOf(iteration: NetworkIteration) {
  const points = (iteration.branches ?? []).flatMap((edge) => [{ x: edge.x0, z: edge.z0 }, { x: edge.x1, z: edge.z1 }]);
  if (points.length === 0) return { east: 0, north: 0 };
  const box = boundsOf(points);
  return { east: Math.round(box.maxX - box.minX), north: Math.round(box.maxZ - box.minZ) };
}

function assignPockets(pockets: ReturnType<typeof detectPockets>["pockets"], markers: readonly Marker[]) {
  const centers = new Map(pockets.map((pocket) => [pocket.id, polygonCentroid(pocket.points)]));
  const owner = new Map<string, Marker>();
  const ranked = markers.flatMap((marker) => pockets.flatMap((pocket) => {
    const center = centers.get(pocket.id);
    if (!center) return [];
    const distance = Math.hypot(marker.x - center.x, marker.z - center.z);
    return distance <= 150 ? [{ marker, pocketId: pocket.id, distance }] : [];
  })).sort((a, b) => a.distance - b.distance);
  for (const claim of ranked) {
    if (owner.has(claim.pocketId)) continue;
    if ([...owner.values()].includes(claim.marker)) continue;
    owner.set(claim.pocketId, claim.marker);
  }
  for (const pocket of pockets) {
    if (owner.has(pocket.id)) continue;
    const center = centers.get(pocket.id);
    if (!center) continue;
    const near = markers
      .map((marker) => ({ marker, distance: Math.hypot(marker.x - center.x, marker.z - center.z) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!near || near.distance > 90) continue;
    if (![...owner.values()].includes(near.marker)) continue;
    owner.set(pocket.id, near.marker);
  }
  const counts: Record<ZoneKind, number> = { lobby: 0, workspace: 0, gathering: 0 };
  const assignments: PocketAssignment[] = [];
  for (const [pocketId, marker] of owner) {
    counts[marker.typology] += 1;
    assignments.push({ pocketId, kind: marker.typology });
  }
  return { assignments, counts, considered: owner.size, owner };
}

function cellsInside(points: readonly { x: number; z: number }[]) {
  const ring = ringOf(points);
  const box = boundsOf(points);
  const cells: { x: number; z: number }[] = [];
  const start = snapModuleOrigin(box.minX, box.minZ);
  for (let x = start.x - STEP * 2; x <= box.maxX + STEP; x += STEP) {
    for (let z = start.z - STEP * 2; z <= box.maxZ + STEP; z += STEP) {
      const snapped = snapModuleOrigin(x, z);
      if (cells.some((cell) => cell.x === snapped.x && cell.z === snapped.z)) continue;
      if (!pointInRing(snapped.x, snapped.z, ring)) continue;
      const corners: XZ[] = [[snapped.x - 10, snapped.z - 10], [snapped.x + 10, snapped.z - 10], [snapped.x + 10, snapped.z + 10], [snapped.x - 10, snapped.z + 10]];
      const inside = corners.filter((corner) => pointInRing(corner[0], corner[1], ring)).length;
      if (inside < 2) continue;
      cells.push(snapped);
    }
  }
  return cells;
}

function moduleAt(id: string, archetypeId: string, program: ZoneKind, x: number, z: number, level: number, turn: number, zoneId: string): PlacedModule {
  const item = SITE_ARCHETYPES.find((entry) => entry.archetypeId === archetypeId);
  if (!item?.program || item.program !== program) throw new Error(`${archetypeId} is not ${program}`);
  return {
    instanceId: id,
    kind: "archetype",
    name: item.name,
    status: item.status,
    geometryState: "available",
    program: item.program,
    programSource: "assigned",
    provenance: { moduleId: item.moduleId, archetypeId, source: "skill3", candidateId: item.candidateId, continuationId: item.continuationId },
    transform: { position: { x, y: MODULE_GROUND_Y + level * MODULE_HEIGHT_FT, z }, rotationY: turn * Math.PI / 2 },
    zoneIds: [zoneId],
  };
}

async function loadMesh(archetypeId: string) {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  if (!entry) return null;
  const params = new URLSearchParams({ archetype: entry.archetypeId, candidate: String(entry.candidateId), continuation: entry.continuationId });
  const response = await fetch(`${API}/api/vertical/solidified?${params}`);
  if (!response.ok) return null;
  const body = await response.json() as { source?: string; moduleId?: string; geometry?: Parameters<typeof decodeSolidifiedMesh>[0] };
  if (body.source !== "carved-mass-solidified" || body.moduleId !== entry.moduleId || !body.geometry) return null;
  return decodeSolidifiedMesh(body.geometry);
}

async function loadHandoff(archetypeId: string) {
  const response = await fetch(`${API}/api/skill4/handoff?archetype=${encodeURIComponent(archetypeId)}`);
  if (!response.ok) return null;
  return await response.json() as Skill4ModuleRecord;
}

async function main() {
  const parcel = boundsOf(site.site.ring.map(([x, z]) => ({ x, z })));
  const markerStudy = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: 20261114, persist: false, buildings: site.buildings });
  const markers: Marker[] = [];
  MARKER_INTENT.forEach((intent, index) => {
    const point = findLegal(markerStudy, "source", intent.x, intent.z, markers);
    if (!point) return;
    markers.push({ id: `intent-m06-${index + 1}`, name: intent.label, typology: intent.typology, x: point.x, z: point.z });
  });
  const seeds = [20261114, 20261115, 20261116];
  let best: { layout: string; iteration: NetworkIteration; nodes: NetworkNode[]; missed: string[]; spread: { east: number; north: number }; score: number } | null = null;
  for (const layout of LAYOUTS) {
    for (const seed of seeds) {
      const placed = placeLayout(layout, seed);
      if (placed.nodes.filter((node) => node.kind === "source").length < 1 || placed.nodes.filter((node) => node.kind === "attractor").length < 2) continue;
      process.stderr.write(`running ${layout.name} seed ${seed}\n`);
      const iteration = await runNetworkIteration(site.site.ring, site.water.ring, placed.nodes, seed, undefined, site.buildings);
      const spread = spreadOf(iteration);
      const pockets = detectPockets(iteration.branches ?? [], site.site.ring);
      const covered = markers.filter((marker) => pockets.pockets.some((pocket) => {
        const center = polygonCentroid(pocket.points);
        return Math.hypot(marker.x - center.x, marker.z - center.z) <= 140;
      })).length;
      const score = covered * 1000 + iteration.reached * 100 + spread.north;
      process.stderr.write(`reached ${iteration.reached}/${iteration.total} span ${spread.east} x ${spread.north} markers ${covered}\n`);
      if (!best || score > best.score) {
        best = { layout: layout.name, iteration: { ...iteration, trails: new Float32Array(0) }, nodes: placed.nodes, missed: placed.missed, spread, score };
      }
    }
  }
  if (!best || !best.iteration.branches || best.iteration.branches.length === 0) throw new Error("The solver did not produce a network.");

  const pockets = detectPockets(best.iteration.branches, site.site.ring);
  const assigned = assignPockets(pockets.pockets, markers);
  const consolidated = consolidatePockets(pockets.pockets, assigned.assignments);
  const assignedIds = new Set(assigned.assignments.map((item) => item.pocketId));
  const selected = consolidated.zones.flatMap((zone, index) => {
    if (!zone.pocketIds.some((id) => assignedIds.has(id))) return [];
    const center = polygonCentroid(zone.points);
    const owners = zone.pocketIds.flatMap((id) => {
      const marker = assigned.owner.get(id);
      return marker ? [marker] : [];
    });
    const marker = owners.sort((a, b) => owners.filter((item) => item === b).length - owners.filter((item) => item === a).length)[0] ?? null;
    return [{ zone, index, marker, center }];
  });

  const catalog = SITE_ARCHETYPES.filter((item) => item.program);
  const used = new Map<string, number>();
  const occupied = new Set<string>();
  const modules: PlacedModule[] = [];
  const zones: ZoningRegion[] = [];
  for (const entry of selected) {
    const slots = cellsInside(entry.zone.points)
      .sort((a, b) => Math.hypot(a.x - entry.center.x, a.z - entry.center.z) - Math.hypot(b.x - entry.center.x, b.z - entry.center.z));
    const cap = entry.zone.kind === "workspace" ? 8 : 6;
    const ground = slots.filter((cell) => !occupied.has(`${cell.x}:${cell.z}:0`)).slice(0, cap);
    if (ground.length < 2) continue;
    const zoneId = `b6z${zones.length + 1}`;
    const name = entry.marker?.name ?? `${entry.zone.kind} ${zones.length + 1}`;
    const program = entry.zone.kind;
    const choices = catalog.filter((item) => item.program === program);
    const place = (cell: { x: number; z: number }, level: number) => {
      const key = `${cell.x}:${cell.z}:${level}`;
      if (occupied.has(key)) return;
      if (level > 0 && !occupied.has(`${cell.x}:${cell.z}:${level - 1}`)) return;
      occupied.add(key);
      const choice = choices[(used.get(program) ?? 0) % choices.length];
      used.set(program, (used.get(program) ?? 0) + 1);
      const turn = (Math.round(cell.x / STEP) + level) % 4;
      modules.push(moduleAt(`m${modules.length + 1}`, choice.archetypeId, program, cell.x, cell.z, level, turn, zoneId));
    };
    for (const cell of ground) place(cell, 0);
    if (name !== "Waterfront Gathering") {
      for (const cell of ground.slice(0, Math.max(1, Math.floor(ground.length * 0.55)))) place(cell, 1);
    }
    if (program === "workspace") {
      for (const cell of ground.slice(0, Math.min(3, Math.floor(ground.length / 2)))) place(cell, 2);
    }
    const placedHere = modules.filter((item) => item.zoneIds[0] === zoneId);
    if (placedHere.length === 0) continue;
    const ys = placedHere.map((item) => item.transform.position.y);
    zones.push({
      id: zoneId,
      name,
      kind: program,
      points: entry.zone.points,
      baseFt: 0,
      heightFt: Math.max(...ys) - MODULE_GROUND_Y + STEP,
      visible: true,
      networkId: best.iteration.id,
      pocketId: entry.zone.pocketIds[0] ?? null,
      sourcePocketIds: entry.zone.pocketIds,
    });
  }

  const tileBox = boundsOf(modules.map((item) => item.transform.position));
  const southCut = parcel.minZ + (parcel.maxZ - parcel.minZ) * 0.33;
  const northCut = parcel.minZ + (parcel.maxZ - parcel.minZ) * 0.66;
  const bands = { south: 0, central: 0, north: 0 };
  for (const item of modules) {
    const z = item.transform.position.z;
    if (z < southCut) bands.south += 1;
    else if (z > northCut) bands.north += 1;
    else bands.central += 1;
  }
  const populatedBands = [bands.south, bands.central, bands.north].filter((count) => count > 0).length;
  if (modules.length < 12 || populatedBands < 2) {
    throw new Error(`The placement stays too local (${modules.length} tiles, bands ${JSON.stringify(bands)}).`);
  }

  const meshes = new Map<string, IsoMesh>();
  for (const archetypeId of [...new Set(modules.map((item) => item.provenance.archetypeId))]) {
    const mesh = await loadMesh(archetypeId);
    if (mesh) meshes.set(archetypeId, mesh);
  }
  const neighbors: [PlacedModule, PlacedModule][] = [];
  for (let i = 0; i < modules.length; i += 1) {
    for (let j = i + 1; j < modules.length; j += 1) {
      const a = modules[i].transform.position;
      const b = modules[j].transform.position;
      const plan = Math.hypot(a.x - b.x, a.z - b.z);
      const dy = Math.abs(a.y - b.y);
      const beside = dy < 1 && plan > 8 && plan <= STEP + 1;
      const stacked = plan < 1 && dy > 10 && dy <= MODULE_HEIGHT_FT + 1;
      if (beside || stacked) neighbors.push([modules[i], modules[j]]);
    }
  }
  const directJoins = [];
  const directAttempts = { tried: 0, validated: 0, unresolved: 0 };
  const pairsByZone = new Map<string, [PlacedModule, PlacedModule][]>();
  for (const pair of neighbors) pairsByZone.set(pair[0].zoneIds[0], [...(pairsByZone.get(pair[0].zoneIds[0]) ?? []), pair]);
  const sampled: [PlacedModule, PlacedModule][] = [];
  const cursors = [...pairsByZone.values()].map((pairs) => ({ pairs, index: 0 }));
  while (sampled.length < 48 && cursors.some((cursor) => cursor.index < cursor.pairs.length)) {
    for (const cursor of cursors) {
      if (sampled.length >= 48 || cursor.index >= cursor.pairs.length) continue;
      sampled.push(cursor.pairs[cursor.index]);
      cursor.index += 1;
    }
  }
  for (const [first, second] of sampled) {
    directAttempts.tried += 1;
    const proposal = proposeDirectJoin(first, second, meshes.get(first.provenance.archetypeId)?.positions ?? null, meshes.get(second.provenance.archetypeId)?.positions ?? null);
    if (!proposal.valid || !proposal.passage || !proposal.faceA || !proposal.faceB || !proposal.type) {
      directAttempts.unresolved += 1;
      continue;
    }
    directAttempts.validated += 1;
    directJoins.push({
      id: `c${directJoins.length + 1}`,
      tileA: first.instanceId,
      tileB: second.instanceId,
      faceA: proposal.faceA,
      faceB: proposal.faceB,
      joinType: proposal.type,
      alignment: proposal.alignment,
      floorDelta: proposal.floorDelta,
      integrity: "closed" as const,
      passage: proposal.passage,
    });
  }
  const joined = new Set(directJoins.flatMap((link) => [`${link.tileA}:${link.tileB}`, `${link.tileB}:${link.tileA}`]));
  const hybridTargets: [PlacedModule, PlacedModule][] = [];
  const hybridZones = new Set<string>();
  for (const pair of neighbors) {
    if (joined.has(`${pair[0].instanceId}:${pair[1].instanceId}`)) continue;
    const zone = pair[0].zoneIds[0];
    if (hybridZones.has(zone)) continue;
    hybridZones.add(zone);
    hybridTargets.push(pair);
    if (hybridTargets.length >= 10) break;
  }
  const handoffs = new Map<string, Skill4ModuleRecord>();
  for (const archetypeId of [...new Set(hybridTargets.flatMap(([first, second]) => [first.provenance.archetypeId, second.provenance.archetypeId]))]) {
    const record = await loadHandoff(archetypeId);
    if (record) handoffs.set(archetypeId, record);
  }
  const hybridJoins = [];
  const hybridAttempts: { pair: string; result: string }[] = [];
  for (const [first, second] of hybridTargets) {
    const recordA = handoffs.get(first.provenance.archetypeId);
    const recordB = handoffs.get(second.provenance.archetypeId);
    const pair = `${first.instanceId}:${second.instanceId}`;
    if (!recordA || !recordB) {
      hybridAttempts.push({ pair, result: "Skill 04 handoff was not available." });
      continue;
    }
    const [faceA, faceB] = suggestedSiteFaces(first, second);
    const offer = buildHybridOffer({
      tileA: first,
      tileB: second,
      faceA,
      faceB,
      rawA: meshes.get(first.provenance.archetypeId)?.positions ?? null,
      rawB: meshes.get(second.provenance.archetypeId)?.positions ?? null,
      loaded: loadModuleMap([recordA, recordB]),
    });
    if (!offer.ok) {
      hybridAttempts.push({ pair, result: offer.reason });
      continue;
    }
    const ready = offer.offer.candidates.find((candidate) => candidate.status === "ready");
    if (!ready) {
      hybridAttempts.push({ pair, result: offer.offer.candidates[0]?.reason || "No ready hybrid candidate." });
      continue;
    }
    const seated = placeHybridCandidate(offer.offer, ready.id);
    if (!seated.ok) {
      hybridAttempts.push({ pair, result: seated.reason });
      continue;
    }
    hybridJoins.push({
      id: `h${hybridJoins.length + 1}`,
      tileA: first.instanceId,
      tileB: second.instanceId,
      faceA: seated.placement.faceA,
      faceB: seated.placement.faceB,
      joinType: seated.placement.joinType,
      alignment: seated.placement.alignment,
      floorDelta: seated.placement.floorDelta,
      integrity: seated.placement.integrity,
      candidateId: seated.placement.candidateId,
      note: seated.placement.note,
      passage: seated.placement.passage,
    });
    hybridAttempts.push({ pair, result: `seated ${seated.placement.candidateId} (${seated.placement.integrity})` });
  }

  const configPath = join(process.cwd(), "data", "skill5", "configurations.json");
  const catalogPath = join(process.cwd(), "data", "skill5", "massing-catalog.json");
  const configs = parseConfigurationDocument(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
  const massingCatalog = parseMassingCatalog(JSON.parse(readFileSync(catalogPath, "utf8")) as unknown);
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
    networkId: best.iteration.id,
    directJoins,
    hybridJoins,
    view: { showZones: true, showTiles: true, showConnections: true, showNetwork: true },
  };
  kept.push(entry);
  writeFileSync(configPath, `${JSON.stringify({ contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations: kept, priorities: configs.priorities }, null, 2)}\n`);
  const levels = new Map<number, number>();
  for (const item of modules) {
    const level = Math.round((item.transform.position.y - MODULE_GROUND_Y) / MODULE_HEIGHT_FT);
    levels.set(level, (levels.get(level) ?? 0) + 1);
  }
  const record: MassingStudy = {
    id: "M06",
    name: NAME,
    configurationId: id,
    createdAt: now,
    seed: best.iteration.seed,
    iterationId: best.iteration.id,
    step: best.iteration.step,
    reached: best.iteration.reached,
    total: best.iteration.total,
    note: best.iteration.note,
    connectedIds: [...best.iteration.connectedIds],
    nodes: best.nodes,
    markers: markers.map((marker) => ({ id: marker.id, typology: marker.typology, x: marker.x, z: marker.z })),
    branches: best.iteration.branches,
    tiles: modules.length,
    levels: levels.size,
    lobby: modules.filter((item) => item.program === "lobby").length,
    workspace: modules.filter((item) => item.program === "workspace").length,
    gathering: modules.filter((item) => item.program === "gathering").length,
  };
  const studies = [...massingCatalog.studies.filter((item) => item.name !== NAME), record];
  writeFileSync(catalogPath, `${JSON.stringify({ contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies }, null, 2)}\n`);
  const byZone = Object.fromEntries(zones.map((zone) => [zone.name, modules.filter((item) => item.zoneIds[0] === zone.id).length]));
  const byArchetype = Object.fromEntries([...new Set(modules.map((item) => item.provenance.archetypeId))].map((name) => [name, modules.filter((item) => item.provenance.archetypeId === name).length]));
  console.log(JSON.stringify({
    id,
    layout: best.layout,
    seed: best.iteration.seed,
    iteration: best.iteration.id,
    step: best.iteration.step,
    nodes: best.nodes.map((node) => ({ id: node.id, kind: node.kind, x: Math.round(node.x), z: Math.round(node.z), water: node.surface === "water" })),
    missedNodes: best.missed,
    reached: `${best.iteration.reached}/${best.iteration.total}`,
    reachedIds: best.iteration.reachedIds,
    note: best.iteration.note,
    networkSpanFt: best.spread,
    branches: best.iteration.branches.length,
    rawPockets: pockets.pockets.length,
    openSegments: pockets.openSegments,
    consolidatedZones: consolidated.zones.length,
    fragments: consolidated.fragments.length,
    assignmentCounts: assigned.counts,
    selectedZones: zones.map((zone) => ({ id: zone.id, name: zone.name, kind: zone.kind, pockets: zone.sourcePocketIds?.length ?? 0 })),
    unresolvedPrograms: markers.filter((marker) => !zones.some((zone) => zone.name === marker.name)).map((marker) => marker.name),
    tiles: modules.length,
    levels: [...levels.entries()].sort((a, b) => a[0] - b[0]),
    spanFt: { east: Math.round(tileBox.maxX - tileBox.minX + STEP), north: Math.round(tileBox.maxZ - tileBox.minZ + STEP) },
    bands,
    byZone,
    byArchetype,
    directAttempts,
    hybridAttempts,
    storedHybrids: hybridJoins.length,
    preserved: configs.configurations.map((item) => item.name).filter((name) => name.startsWith("Autonomous")),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
