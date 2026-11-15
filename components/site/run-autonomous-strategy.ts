/**
 * Isolated Site Strategy stress test.
 * Calls the live network, pocket, compatibility, placement, and join functions.
 * Does not write configurations, localStorage, or the live network store.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import dnaJson from "@/data/skill5/architectural-dna.json";
import activityJson from "@/data/skill5/client-activities.json";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "@/lib/skill3/solidified-catalogue";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { parseArchitecturalDna } from "@/lib/skill5/architectural-dna";
import { compareTile, parseClientCompatibility } from "@/lib/skill5/client-compatibility";
import { proposeDirectJoin } from "@/lib/skill5/direct-join";
import { buildHybridOffer, suggestedSiteFaces } from "@/lib/skill5/hybrid-join";
import { loadSkill3HandoffRecords } from "@/lib/skill4/skill3-handoff";
import { loadModuleMap } from "@/lib/skill4/tiles";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, placementWarnings, snapModuleOrigin, type PlacedModule } from "@/lib/skill5/placement";
import { detectPockets } from "@/lib/skill5/pockets";
import { reportTiles } from "@/lib/skill5/tile-placement";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { polygonAreaSqFt, polygonCentroid, polygonIssue, type ZoneKind, type ZoningRegion } from "@/lib/skill5/zoning";
import { NETWORK_STEP_BUDGET, runNetworkIteration, SiteNetworkStudy, type NetworkNode } from "./site-network";
import { chooseSiteCoverage } from "./strategy-coverage";
import { chooseByScoreAndOpening, hasSideOpening } from "@/lib/skill5/connection-faces";

const SEED = 20261113;
const OUT = join(process.cwd(), "data", "skill5", "autonomous-test");
const site = context as SiteContext;

type Marker = { id: string; typology: ZoneKind; x: number; z: number; reason: string };

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

function spread(points: { x: number; z: number }[], count: number, gap: number) {
  const chosen: { x: number; z: number }[] = [];
  for (const point of points) {
    if (chosen.every((item) => Math.hypot(item.x - point.x, item.z - point.z) >= gap)) chosen.push(point);
    if (chosen.length === count) break;
  }
  return chosen;
}

function tileOf(archetypeId: string, id: string, x: number, y: number, z: number, program: ZoneKind): PlacedModule {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  if (!entry) throw new Error(`Missing archetype ${archetypeId}`);
  return {
    instanceId: id,
    kind: "archetype",
    name: entry.name,
    status: entry.status,
    geometryState: "available",
    program,
    programSource: "suggested",
    provenance: {
      moduleId: entry.moduleId,
      archetypeId: entry.archetypeId,
      source: "skill3",
      candidateId: entry.candidateId,
      continuationId: entry.continuationId,
    },
    transform: { position: { x, y, z }, rotationY: 0 },
  };
}

function rawPositions(archetypeId: string) {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  if (!entry) return null;
  const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
  if (!stored) return null;
  return decodeSolidifiedMesh(stored.geometry).positions;
}

async function main() {
  const box = bounds(site.site.ring);
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: SEED, persist: false, buildings: site.buildings });
  const land: { x: number; z: number }[] = [];
  const water: { x: number; z: number }[] = [];
  for (let x = box.minX; x <= box.maxX; x += 20) {
    for (let z = box.minZ; z <= box.maxZ; z += 20) {
      if (study.canPlace("source", x, z)) land.push({ x, z });
      else if (study.canPlace("attractor", x, z) && study.onWater(x, z)) water.push({ x, z });
    }
  }
  const coverage = chooseSiteCoverage(land, water);
  const placed: { kind: "source" | "attractor"; x: number; z: number; ok: boolean; surface: string }[] = [];
  for (const choice of coverage) placed.push({ kind: choice.kind, x: choice.x, z: choice.z, ok: study.place(choice.kind, choice.x, choice.z), surface: choice.surface });
  const sources = coverage.filter((choice) => choice.kind === "source");
  const east = [...land].sort((a, b) => b.x - a.x);
  const nodes = study.edit.nodes.map((node) => ({ ...node, water: node.water ? { ...node.water } : node.water })) as NetworkNode[];

  const mid = land[Math.floor(land.length / 2)] ?? { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
  const markers: Marker[] = [
    ...sources.map((point, index) => ({ id: `intent-lobby-${index + 1}`, typology: "lobby" as const, x: point.x, z: point.z, reason: "Open land on the city side, beside a biological source. Arrival is planned here. This marker is not a simulation input." })),
    ...spread(land.filter((point) => Math.abs(point.x - mid.x) < 80), 3, 40).map((point, index) => ({ id: `intent-workspace-${index + 1}`, typology: "workspace" as const, x: point.x, z: point.z, reason: "Interior open land, away from the bay edge, for the studios, cultivation, and fabrication. Not passed to the solver." })),
    ...spread(east, 3, 40).map((point, index) => ({ id: `intent-gathering-${index + 1}`, typology: "gathering" as const, x: point.x, z: point.z, reason: "Eastern open land, toward the water side of the parcel, for gathering, exhibition, and dining. Not passed to the solver." })),
  ];

  console.log(`running seed ${SEED} with ${nodes.length} biological nodes`);
  const iteration = await runNetworkIteration(site.site.ring, site.water.ring, nodes, SEED, (step) => console.log(`step ${step}`), site.buildings);
  const branches = iteration.branches ?? [];
  const pockets = detectPockets(branches, site.site.ring);
  const zones: ZoningRegion[] = [];
  const zoneNotes: { id: string; kind: ZoneKind; area: number; issue: string | null; nearestMarker: string | null; distanceFt: number | null }[] = [];
  let serial = 1;
  for (const pocket of pockets.pockets) {
    const center = polygonCentroid(pocket.points);
    let nearest = markers[0];
    let distance = Number.POSITIVE_INFINITY;
    for (const marker of markers) {
      const gap = Math.hypot(marker.x - center.x, marker.z - center.z);
      if (gap < distance) {
        distance = gap;
        nearest = marker;
      }
    }
    const kind = nearest?.typology ?? "workspace";
    const issue = polygonIssue(pocket.points);
    const region: ZoningRegion = {
      id: `auto-z${serial}`,
      name: `${kind} ${serial}`,
      kind,
      points: pocket.points.map((point) => ({ ...point })),
      baseFt: 0,
      heightFt: 12,
      visible: true,
      networkId: iteration.id,
      pocketId: pocket.id,
    };
    serial += 1;
    if (!issue) zones.push(region);
    zoneNotes.push({ id: region.id, kind, area: polygonAreaSqFt(pocket.points), issue, nearestMarker: nearest?.id ?? null, distanceFt: Number.isFinite(distance) ? Math.round(distance) : null });
  }

  const dna = parseArchitecturalDna(dnaJson);
  const activities = parseClientCompatibility(activityJson);
  if (!dna || !activities) throw new Error("DNA or client profiles did not parse.");
  const roomsByKind: Record<ZoneKind, typeof activities.activities> = { lobby: [], workspace: [], gathering: [] };
  for (const activity of activities.activities) {
    const kind = activity.contexts[0];
    if (kind === "lobby" || kind === "workspace" || kind === "gathering") roomsByKind[kind].push(activity);
  }
  const instances: PlacedModule[] = [];
  const selections: { zoneId: string; archetypeId: string; room: string; universal: number | null; typology: number | null; level: number; x: number; z: number; warning: string | null }[] = [];
  const meshes = new Map<string, Float32Array>();
  for (const zone of zones) {
    const archetypes = SITE_ARCHETYPES.filter((item) => item.program === zone.kind);
    const scored: { archetypeId: string; room: string; universal: number; specific: number | null }[] = [];
    for (const archetype of archetypes) {
      const profile = dna.profiles.find((item) => item.archetypeId === archetype.archetypeId);
      if (!profile) continue;
      for (const room of roomsByKind[zone.kind]) {
        const score = compareTile(profile, room);
        if (!score.applicable || score.percent == null) continue;
        scored.push({ archetypeId: archetype.archetypeId, room: room.name, universal: score.percent, specific: score.specificPercent });
      }
    }
    const best = chooseByScoreAndOpening(scored, (archetypeId) => {
      const mesh = rawPositions(archetypeId);
      return mesh ? hasSideOpening(mesh) : false;
    });
    if (!best) {
      selections.push({ zoneId: zone.id, archetypeId: "", room: "", universal: null, typology: null, level: 0, x: 0, z: 0, warning: "No same-typology compatibility score." });
      continue;
    }
    const center = polygonCentroid(zone.points);
    const snapped = snapModuleOrigin(center.x, center.z);
    const ground = tileOf(best.archetypeId, `auto-${zone.id}`, snapped.x, MODULE_GROUND_Y, snapped.z, zone.kind);
    const trial = [...instances, ground];
    const warning = placementWarnings(trial, site.site.ring)[ground.instanceId];
    const problem = warning?.outside ? "Outside the parcel." : warning?.overlap ? "Overlaps another tile." : null;
    if (problem) {
      selections.push({ zoneId: zone.id, archetypeId: best.archetypeId, room: best.room, universal: best.universal, typology: best.specific, level: 0, x: snapped.x, z: snapped.z, warning: problem });
      continue;
    }
    instances.push(ground);
    meshes.set(ground.instanceId, rawPositions(best.archetypeId) ?? new Float32Array());
    selections.push({ zoneId: zone.id, archetypeId: best.archetypeId, room: best.room, universal: best.universal, typology: best.specific, level: 0, x: snapped.x, z: snapped.z, warning: null });
    const upper = tileOf(best.archetypeId, `auto-${zone.id}-up`, snapped.x, MODULE_GROUND_Y + MODULE_HEIGHT_FT, snapped.z, zone.kind);
    const upperWarning = placementWarnings([...instances, upper], site.site.ring)[upper.instanceId];
    if (!upperWarning?.outside && !upperWarning?.overlap) {
      instances.push(upper);
      meshes.set(upper.instanceId, meshes.get(ground.instanceId) ?? new Float32Array());
      selections.push({ zoneId: zone.id, archetypeId: best.archetypeId, room: best.room, universal: best.universal, typology: best.specific, level: 1, x: snapped.x, z: snapped.z, warning: null });
    } else {
      selections.push({ zoneId: zone.id, archetypeId: best.archetypeId, room: best.room, universal: best.universal, typology: best.specific, level: 1, x: snapped.x, z: snapped.z, warning: upperWarning?.outside ? "Upper tile outside the parcel." : "Upper tile overlaps." });
    }
  }
  const support = reportTiles(instances, zones);

  const joins: { a: string; b: string; mode: "direct" | "hybrid"; valid: boolean; type: string | null; issues: string[] }[] = [];
  let loaded: ReturnType<typeof loadModuleMap> | null = null;
  for (let left = 0; left < instances.length; left += 1) {
    for (let right = left + 1; right < instances.length; right += 1) {
      const a = instances[left];
      const b = instances[right];
      const gap = Math.hypot(a.transform.position.x - b.transform.position.x, a.transform.position.z - b.transform.position.z);
      const vertical = Math.abs(a.transform.position.y - b.transform.position.y);
      if (gap > 30 && vertical < 1) continue;
      if (gap > 8 && vertical > 1) continue;
      const meshA = meshes.get(a.instanceId) ?? null;
      const meshB = meshes.get(b.instanceId) ?? null;
      const direct = proposeDirectJoin(a, b, meshA, meshB);
      joins.push({ a: a.instanceId, b: b.instanceId, mode: "direct", valid: direct.valid, type: direct.type, issues: direct.issues });
      if (direct.valid) continue;
      if (gap > 40) continue;
      if (!loaded) loaded = loadModuleMap(loadSkill3HandoffRecords());
      const [faceA, faceB] = suggestedSiteFaces(a, b);
      const offer = buildHybridOffer({ tileA: a, tileB: b, faceA, faceB, rawA: meshA, rawB: meshB, loaded });
      joins.push({ a: a.instanceId, b: b.instanceId, mode: "hybrid", valid: offer.ok, type: offer.ok ? `${faceA}-${faceB}` : null, issues: offer.ok ? [] : [offer.reason] });
    }
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const known = parent.get(id) ?? id;
    if (known === id) return id;
    const root = find(known);
    parent.set(id, root);
    return root;
  };
  for (const instance of instances) parent.set(instance.instanceId, instance.instanceId);
  for (const join of joins) {
    if (!join.valid) continue;
    parent.set(find(join.a), find(join.b));
  }
  const components = new Set(instances.map((item) => find(item.instanceId)));
  const placedCount = selections.filter((item) => item.warning == null).length;
  const report = {
    seed: SEED,
    generator: iteration.generator,
    stepBudget: NETWORK_STEP_BUDGET,
    iteration: {
      id: iteration.id,
      step: iteration.step,
      settled: iteration.settled,
      reached: iteration.reached,
      total: iteration.total,
      reachedIds: iteration.reachedIds,
      connectedIds: iteration.connectedIds,
      note: iteration.note,
      branchCount: branches.length,
      openSegments: pockets.openSegments,
    },
    biological: placed,
    nodes: nodes.map((node) => ({ id: node.id, kind: node.kind, x: node.x, z: node.z, surface: node.surface ?? "land" })),
    markers,
    markersEnteredSolver: nodes.some((node) => node.id.startsWith("intent-")),
    zones: zoneNotes,
    pocketCount: pockets.pockets.length,
    selections,
    support,
    joins,
    components: components.size,
    placedCount,
    phases: {
      attractors: placed.some((item) => item.kind === "source" && item.ok) && placed.some((item) => item.kind === "attractor" && item.ok) ? "completed" : "failed",
      network: iteration.settled && iteration.reached === iteration.total ? "completed" : branches.length ? "partial" : "failed",
      zoning: zones.length > 0 ? "completed" : "failed",
      placement: placedCount > 0 ? "partial" : "failed",
      assembly: joins.some((item) => item.valid) ? (components.size === 1 ? "completed" : "partial") : "failed",
    },
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "scenario.json"), JSON.stringify({
    report,
    iteration: { ...iteration, trails: undefined, branches },
    zones,
    instances,
  }, null, 2));
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, "index.html"), html(site.site.ring, site.water.ring, report, branches, zones, instances, joins));
  console.log(JSON.stringify({ phases: report.phases, reached: `${iteration.reached}/${iteration.total}`, branches: branches.length, pockets: pockets.pockets.length, open: pockets.openSegments, tiles: instances.length, joins: joins.length, validJoins: joins.filter((item) => item.valid).length, components: components.size }, null, 2));
}

function html(
  parcel: readonly XZ[],
  water: readonly XZ[],
  report: {
    biological: { kind: string; x: number; z: number; ok: boolean }[];
    markers: Marker[];
    nodes: { kind: string; x: number; z: number }[];
    selections: { archetypeId: string; level: number; x: number; z: number; warning: string | null; zoneId: string }[];
    joins: { a: string; b: string; valid: boolean }[];
    phases: Record<string, string>;
  },
  branches: { x0: number; z0: number; x1: number; z1: number }[],
  zones: ZoningRegion[],
  instances: PlacedModule[],
  joins: { a: string; b: string; valid: boolean; mode: string }[],
) {
  const all = [...parcel, ...water, ...report.markers.map((item) => [item.x, item.z] as XZ)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of all) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const pad = 30;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;
  const width = 900;
  const height = 700;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * width;
  const sy = (z: number) => height - ((z - minZ) / (maxZ - minZ)) * height;
  const ring = (points: readonly XZ[] | { x: number; z: number }[]) => points.map((point) => Array.isArray(point) ? `${sx(point[0])},${sy(point[1])}` : `${sx(point.x)},${sy(point.z)}`).join(" ");
  const color = { lobby: "#a07a68", workspace: "#7f96a8", gathering: "#5d7c79" };
  const plan = `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#000"/>
      <polygon points="${ring(water)}" fill="none" stroke="#334044" stroke-width="1"/>
      <polygon points="${ring(parcel)}" fill="#111" stroke="#666" stroke-width="1.5"/>
      ${branches.map((edge) => `<line x1="${sx(edge.x0)}" y1="${sy(edge.z0)}" x2="${sx(edge.x1)}" y2="${sy(edge.z1)}" stroke="#f4f4f0" stroke-width="1.2"/>`).join("")}
      ${zones.map((zone) => `<polygon points="${ring(zone.points)}" fill="${color[zone.kind]}33" stroke="${color[zone.kind]}" stroke-width="1.4"/>`).join("")}
      ${report.markers.map((marker) => `<circle cx="${sx(marker.x)}" cy="${sy(marker.z)}" r="5" fill="none" stroke="${color[marker.typology]}" stroke-width="1.4"/><circle cx="${sx(marker.x)}" cy="${sy(marker.z)}" r="1.6" fill="${color[marker.typology]}"/>`).join("")}
      ${report.nodes.map((node) => `<circle cx="${sx(node.x)}" cy="${sy(node.z)}" r="3.5" fill="${node.kind === "source" ? "#c77e5f" : "#49d7de"}"/>`).join("")}
      ${instances.map((item) => `<rect x="${sx(item.transform.position.x) - 8}" y="${sy(item.transform.position.z) - 8}" width="16" height="16" fill="none" stroke="${item.program && item.program !== "unassigned" ? color[item.program] : "#fff"}" stroke-width="${item.transform.position.y > 1 ? 2.4 : 1}"/>`).join("")}
    </svg>`;
  const axon = instances.map((item) => {
    const x = item.transform.position.x;
    const y = item.transform.position.y;
    const z = item.transform.position.z;
    const px = 80 + (x - minX) * 1.1 - (z - minZ) * 0.45;
    const py = 520 - y * 4 - (z - minZ) * 0.35;
    const tone = item.program && item.program !== "unassigned" ? color[item.program] : "#fff";
    return `<rect x="${px}" y="${py}" width="28" height="22" fill="#050505" stroke="${tone}" stroke-width="1.2"/>`;
  }).join("");
  const lines = joins.filter((item) => item.valid).map((item) => {
    const a = instances.find((tile) => tile.instanceId === item.a);
    const b = instances.find((tile) => tile.instanceId === item.b);
    if (!a || !b) return "";
    const ax = 80 + (a.transform.position.x - minX) * 1.1 - (a.transform.position.z - minZ) * 0.45 + 14;
    const ay = 520 - a.transform.position.y * 4 - (a.transform.position.z - minZ) * 0.35 + 11;
    const bx = 80 + (b.transform.position.x - minX) * 1.1 - (b.transform.position.z - minZ) * 0.45 + 14;
    const by = 520 - b.transform.position.y * 4 - (b.transform.position.z - minZ) * 0.35 + 11;
    return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#c77e5f" stroke-width="1"/>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Autonomous Site Strategy test</title>
    <style>body{margin:0;background:#000;color:#fff;font:14px sans-serif} section{padding:24px} h1,h2{font-weight:500;letter-spacing:.12em;text-transform:uppercase} p{color:#bbb;max-width:860px}</style></head>
    <body>
      <section><h1>Autonomous test · seed ${SEED}</h1><p>Phases: ${Object.entries(report.phases).map(([key, value]) => `${key} ${value}`).join(" · ")}. White lines are the generated network. Rings are architectural markers. Filled dots are biological nodes. Colored outlines are zones and tiles.</p>${plan}</section>
      <section><h2>Assembly axonometric</h2><p>Valid connectors only. Failed joins are omitted from the drawing and listed in report.json.</p><svg viewBox="0 0 900 600" width="900" height="600"><rect width="100%" height="100%" fill="#000"/>${lines}${axon}</svg></section>
    </body></html>`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
