/**
 * Repair check: saved-pocket consolidation, then two isolated network runs.
 * Does not write the live configuration store or the network node store.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import context from "@/data/skill5/herald-site.json";
import { detectPockets } from "@/lib/skill5/pockets";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { consolidatePockets } from "@/lib/skill5/zone-consolidation";
import { polygonAreaSqFt, polygonCentroid, polygonIssue } from "@/lib/skill5/zoning";
import { runNetworkIteration, SiteNetworkStudy, type NetworkNode } from "./site-network";
import { chooseSiteCoverage } from "./strategy-coverage";

const site = context as SiteContext;
const OUT = join(process.cwd(), "data", "skill5", "autonomous-test", "repair-01");

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

function pointIn(x: number, z: number, points: { x: number; z: number }[]) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    const crosses = a.z > z !== b.z > z;
    if (crosses && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function eligible() {
  const box = bounds(site.site.ring);
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed: 1, persist: false, buildings: site.buildings });
  const land: { x: number; z: number }[] = [];
  const water: { x: number; z: number }[] = [];
  for (let x = box.minX; x <= box.maxX; x += 20) {
    for (let z = box.minZ; z <= box.maxZ; z += 20) {
      if (study.canPlace("source", x, z)) land.push({ x, z });
      else if (study.canPlace("attractor", x, z) && study.onWater(x, z)) water.push({ x, z });
    }
  }
  return { box, land, water };
}

async function runSeed(seed: number, choices: ReturnType<typeof chooseSiteCoverage>) {
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, { seed, persist: false, buildings: site.buildings });
  const placed = choices.map((choice) => ({
    ...choice,
    ok: study.place(choice.kind, choice.x, choice.z),
  }));
  const nodes = study.edit.nodes.map((node) => ({ ...node, water: node.water ? { ...node.water } : node.water })) as NetworkNode[];
  console.log(`seed ${seed} nodes ${nodes.length}`);
  const iteration = await runNetworkIteration(site.site.ring, site.water.ring, nodes, seed, (step) => console.log(`seed ${seed} step ${step}`), site.buildings);
  const branches = iteration.branches ?? [];
  const pockets = detectPockets(branches, site.site.ring);
  const consolidated = consolidatePockets(pockets.pockets);
  const branchBox = bounds(branches.flatMap((edge) => [[edge.x0, edge.z0], [edge.x1, edge.z1]] as XZ[]));
  return {
    seed,
    placed,
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
    },
    branchSpan: { width: branchBox.maxX - branchBox.minX, depth: branchBox.maxZ - branchBox.minZ },
    rawPockets: pockets.pockets.length,
    openSegments: pockets.openSegments,
    consolidated,
    branches,
    nodes: iteration.nodes.map((node) => ({ id: node.id, kind: node.kind, x: node.x, z: node.z, surface: node.surface ?? "land" })),
  };
}

function summarize(report: Awaited<ReturnType<typeof runSeed>>["consolidated"]) {
  const byKind: Record<string, { count: number; area: number; tiles: number }> = {};
  let overlap = 0;
  for (const zone of report.zones) {
    const entry = byKind[zone.kind] ?? { count: 0, area: 0, tiles: 0 };
    entry.count += 1;
    entry.area += zone.areaSqFt;
    entry.tiles += zone.tileSlots;
    byKind[zone.kind] = entry;
    const center = polygonCentroid(zone.points);
    const others = report.zones.filter((item) => item !== zone && pointIn(center.x, center.z, item.points));
    if (others.length > 0) overlap += 1;
  }
  const issues = report.zones.filter((zone) => polygonIssue(zone.points)).length;
  const fragmentArea = report.fragments.reduce((sum, item) => sum + item.areaSqFt, 0);
  const reasons: Record<string, number> = {};
  for (const item of report.fragments) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  return {
    zones: report.zones.length,
    byKind,
    overlap,
    issues,
    fragments: report.fragments.length,
    fragmentArea: Math.round(fragmentArea),
    reasons,
    minArea: report.zones.length ? Math.min(...report.zones.map((zone) => zone.areaSqFt)) : 0,
    maxArea: report.zones.length ? Math.max(...report.zones.map((zone) => zone.areaSqFt)) : 0,
  };
}

function board(parcel: readonly XZ[], water: readonly XZ[], runs: Awaited<ReturnType<typeof runSeed>>[]) {
  const color = { lobby: "#a07a68", workspace: "#7f96a8", gathering: "#5d7c79" };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of [...parcel, ...water]) {
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
  const height = 1400;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * (width - 40) + 20;
  const sy = (z: number) => height - 20 - ((z - minZ) / (maxZ - minZ)) * (height - 40);
  const ring = (points: readonly (readonly [number, number] | { x: number; z: number })[]) => points.map((point) => Array.isArray(point) ? `${sx(point[0])},${sy(point[1])}` : `${sx(point.x)},${sy(point.z)}`).join(" ");
  const sections = runs.map((run) => {
    const network = run.branches.map((edge) => `<line x1="${sx(edge.x0)}" y1="${sy(edge.z0)}" x2="${sx(edge.x1)}" y2="${sy(edge.z1)}" stroke="#f3f3ee" stroke-width="0.6"/>`).join("");
    const zones = run.consolidated.zones.map((zone) => `<polygon points="${ring(zone.points)}" fill="${color[zone.kind]}33" stroke="${color[zone.kind]}" stroke-width="1"/>`).join("");
    const nodes = run.nodes.map((node) => `<circle cx="${sx(node.x)}" cy="${sy(node.z)}" r="5" fill="${node.surface === "water" ? "#e2c27a" : node.kind === "source" ? "#c77e5f" : "#49d7de"}"/>`).join("");
    const missed = run.nodes.filter((node) => node.kind === "attractor" && !run.iteration.connectedIds.includes(node.id)).map((node) => `<circle cx="${sx(node.x)}" cy="${sy(node.z)}" r="9" fill="none" stroke="#c77e5f"/>`).join("");
    return `<section><h2>Seed ${run.seed} · ${run.iteration.reached}/${run.iteration.total} attractors · ${run.consolidated.zones.length} zones from ${run.rawPockets} pockets</h2><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/><polygon points="${ring(water)}" fill="none" stroke="#3a4446"/><polygon points="${ring(parcel)}" fill="#101010" stroke="#777"/>${network}${zones}${missed}${nodes}</svg></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Repair 01</title><style>body{margin:0;background:#000;color:#fff;font:13px ui-sans-serif,sans-serif}h1,h2{font-weight:500;letter-spacing:.12em;text-transform:uppercase;font-size:13px;padding:24px 24px 0}p{color:#bbb;padding:0 24px 12px}</style></head><body><h1>Repair 01 · network and consolidated zones</h1><p>White lines are the solver branches. Filled dots are sources and attractors. A copper ring is an attractor with no surviving connection. Zone colors are Lobby, Workspace, and Gathering. Raw pockets are not drawn as rooms.</p>${sections}</body></html>`;
}

async function main() {
  const saved = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(join(process.cwd(), "data", "skill5", "autonomous-test", "scenario.json"), "utf8"))) as {
    zones: { id: string; points: { x: number; z: number }[] }[];
  };
  const savedPockets = saved.zones.filter((zone) => zone.points.length >= 3).map((zone) => ({
    id: zone.id,
    points: zone.points,
    touchesParcel: false,
  }));
  const beforeAreas = savedPockets.map((pocket) => polygonAreaSqFt(pocket.points));
  const savedReport = consolidatePockets(savedPockets);
  const { box, land, water } = eligible();
  const choices = chooseSiteCoverage(land, water);
  console.log(JSON.stringify({
    parcel: { width: box.maxX - box.minX, depth: box.maxZ - box.minZ },
    land: land.length,
    water: water.length,
    coverage: choices,
    savedPockets: savedPockets.length,
    savedUnder400: beforeAreas.filter((area) => area < 400).length,
    savedConsolidation: summarize(savedReport),
  }, null, 2));
  const first = await runSeed(20261113, choices);
  const second = await runSeed(20261114, choices);
  mkdirSync(OUT, { recursive: true });
  const body = {
    coverage: choices,
    saved: { pockets: savedPockets.length, under400: beforeAreas.filter((area) => area < 400).length, consolidation: summarize(savedReport) },
    runs: [first, second].map((run) => ({
      ...run,
      consolidated: undefined,
      summary: summarize(run.consolidated),
      zones: run.consolidated.zones.map((zone) => ({ kind: zone.kind, area: Math.round(zone.areaSqFt), span: Math.round(zone.spanFt), tiles: zone.tileSlots, pockets: zone.pocketIds.length, points: zone.points })),
    })),
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(body, null, 2));
  writeFileSync(join(OUT, "index.html"), board(site.site.ring, site.water.ring, [first, second]));
  console.log(JSON.stringify(body.runs.map((run) => ({ seed: run.seed, iteration: run.iteration, branchSpan: run.branchSpan, rawPockets: run.rawPockets, summary: run.summary })), null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
