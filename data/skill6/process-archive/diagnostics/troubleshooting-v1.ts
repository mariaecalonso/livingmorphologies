/**
 * Read-only troubleshooting run. Writes under the process archive.
 * Does not change ranking, thresholds, refinement settings, or stored experiments.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster } from "../../../../lib/skill6/assembly";
import { createBoard, placementKey } from "../../../../lib/skill6/engines/board";
import { runGraph } from "../../../../lib/skill6/engines/graph";
import { narrowLargeGuest, readShape, shapeSummary } from "../../../../lib/skill6/engines/morphology";
import { loadDockPool } from "../../../../lib/skill6/engines/pool";
import { runRule } from "../../../../lib/skill6/engines/rule";
import { crossingReport } from "../../../../lib/skill6/refine-mesh";
import { loadArchetypeMeshes } from "../../../../lib/skill6/source";
import { posedMesh, unionSolids } from "../../../../lib/skill6/patch";
import type { ClusterRecord } from "../../../../lib/skill6/contract";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v1");
const SEED = 101;
const ROOT_ID = "open-hall";
const TESTS_PER_TILE = 120;

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function counts(report: ReturnType<typeof crossingReport>) {
  return { penetrations: report.penetrations, grazes: report.grazes, maxPenetration: round(report.maxPenetration, 4) };
}

function readingOf(record: ClusterRecord, meshes: ReturnType<typeof loadArchetypeMeshes>) {
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const shape = shapeSummary(readShape(record.tiles, record.contacts, byId));
  const solid = record.tiles.reduce((sum, tile) => sum + (byId.get(tile.archetypeId)?.solidVolume ?? 0), 0);
  const primary = new Set<string>();
  const joints = record.contacts.map((contact) => {
    const secondary = primary.has(contact.guestId);
    primary.add(contact.guestId);
    const guest = byId.get(record.tiles.find((tile) => tile.instanceId === contact.guestId)?.archetypeId ?? "");
    const guestSolid = guest?.solidVolume ?? 0;
    return {
      host: contact.hostId,
      guest: contact.guestId,
      archetype: guest?.archetypeId ?? "",
      area: round(contact.contactArea, 2),
      rigidCrossing: round(contact.deepestCrossing, 4),
      secondary,
      narrowLargeGuest: !secondary && narrowLargeGuest(contact.contactArea, guestSolid, solid),
      guestShare: solid > 0 ? round(guestSolid / solid) : 0,
    };
  });
  return { shape, solid: round(solid, 1), joints };
}

function contactSvg(record: ClusterRecord) {
  const points = record.tiles.map((tile, index) => ({ id: tile.instanceId, x: 40 + (index % 4) * 90, y: 50 + Math.floor(index / 4) * 70 }));
  const at = (id: string) => points.find((point) => point.id === id)!;
  const seen = new Set<string>();
  const lines = record.contacts.map((contact) => {
    const secondary = seen.has(contact.guestId);
    seen.add(contact.guestId);
    const host = at(contact.hostId);
    const guest = at(contact.guestId);
    return `<line x1="${host.x}" y1="${host.y}" x2="${guest.x}" y2="${guest.y}" stroke="${secondary ? "#c77e5f" : "#49d7de"}" stroke-width="${secondary ? 1 : 2}" /><text x="${(host.x + guest.x) / 2}" y="${(host.y + guest.y) / 2}" fill="#d6d6d6" font-size="11">${contact.contactArea.toFixed(1)}</text>`;
  });
  const nodes = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="8" fill="#111" stroke="#d6d6d6" /><text x="${point.x + 12}" y="${point.y + 4}" fill="#d6d6d6" font-size="12">${point.id}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220" viewBox="0 0 420 220"><rect width="420" height="220" fill="#000"/>${lines.join("")}${nodes.join("")}</svg>`;
}

async function stages(record: ClusterRecord, meshes: ReturnType<typeof loadArchetypeMeshes>) {
  const rigidMax = record.contacts.reduce((max, contact) => Math.max(max, contact.deepestCrossing), 0);
  const rigidOver = record.contacts.filter((contact) => contact.deepestCrossing > 0.02).length;
  const tileUnion = await unionSolids(record.tiles.map((tile) => posedMesh(meshes.find((mesh) => mesh.archetypeId === tile.archetypeId)!, tile.pose)));
  const tileCrossing = tileUnion.mesh ? counts(crossingReport(tileUnion.mesh)) : null;
  const built = await assembleCluster(record, meshes, `data/skill6/process-archive/diagnostics/troubleshooting-v1/${record.id}.mesh.json`);
  const patchCrossings = (built.meshes.patches ?? []).map((mesh) => counts(crossingReport(mesh)));
  const raw = built.meshes.raw ? counts(crossingReport(built.meshes.raw)) : null;
  const refined = built.meshes.refined ? counts(crossingReport(built.meshes.refined)) : null;
  const firstFail = rigidOver > 0 ? "rigid seating"
    : patchCrossings.some((item) => item.penetrations > 0) ? "patch"
    : (tileCrossing && tileCrossing.penetrations > 0) ? "tiles-only union"
    : (raw && raw.penetrations > 0) ? "raw union"
    : (refined && refined.penetrations > 0) ? "refinement"
    : "none";
  return {
    label: "Recomputed from the reproduced poses with the unchanged patch, union, and refinement settings. This is not the stored overnight mesh.",
    rigid: { contactsOver002: rigidOver, maxCrossing: round(rigidMax, 4) },
    patch: { selfIntersections: built.assembly.joints.map((joint) => joint.patch?.selfIntersections ?? 0), crossing: patchCrossings },
    tilesOnlyUnion: { label: "Reconstruction. The historical record has no tiles-only union.", status: tileUnion.status, crossing: tileCrossing },
    rawUnion: raw,
    refined,
    firstFailingStage: firstFail,
    assembly: {
      lift: built.assembly.ground.lift,
      growth: built.assembly.growth,
      branchPoints: built.assembly.graph.branchPoints,
      refinedPenetrations: built.assembly.refined.parameters.penetrations,
      refinedMax: built.assembly.refined.parameters.maxPenetration,
    },
  };
}

function verifyWarnings() {
  const measured = JSON.parse(readFileSync(path.join(ROOT, "data/skill6/process-archive/diagnostics/geometry-v1/measurements.json"), "utf8")) as {
    clusters: { id: string; tiles: { instanceId: string; shareOfSolid: number; jointArea: number | null }[] }[];
  };
  const expect: Record<string, string[]> = {
    "on-rule-compact-6": ["t05"],
    "on-graph-branching-7": ["t05"],
    "on-graph-branching-5": ["t03"],
    "on-wfc-branching-5": ["t03"],
    "on-wfc-branching-7": ["t03"],
    "on-rule-branching-5": [],
    "on-rule-compact-5": [],
    "on-rule-branching-4": [],
  };
  const mismatches = [];
  for (const cluster of measured.clusters) {
    const flagged = cluster.tiles.filter((tile) => tile.jointArea != null && narrowLargeGuest(tile.jointArea, tile.shareOfSolid, 1)).map((tile) => tile.instanceId);
    const wanted = expect[cluster.id];
    if (!wanted) continue;
    if (flagged.join(",") !== wanted.join(",")) mismatches.push(`${cluster.id} flagged ${flagged.join(",") || "none"} expected ${wanted.join(",") || "none"}`);
  }
  return mismatches;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const mismatches = verifyWarnings();
  writeFileSync(path.join(OUT, "camera.json"), JSON.stringify({
    projection: "isometric axonometric",
    x: "(x - y) * cos(30°)",
    y: "-z + (x + y) * sin(30°)",
    depth: "-(x - y + z)",
    up: "+Z",
    palette: { step0: "#d6d6d6", step1: "#49d7de", step2: "#c77e5f", step3: "#78a8c4", step4: "#e8c48c", step5: "#96c4a8", step6: "#c4a0be", refined: "#d6d6d6", primaryContact: "#49d7de", secondaryContact: "#c77e5f" },
    note: "Views rendered from stored or reproduced poses. A tiles-only union is labeled as a reconstruction.",
  }, null, 2));
  console.log("warning check", mismatches.length ? mismatches.join(" | ") : "matches geometry-v1");
  const cacheSource = path.join(ROOT, "data/skill6/experiments/clustering-overnight-v1/pair-checks.json");
  const cachePath = path.join(OUT, "pair-checks.json");
  if (!existsSync(cachePath)) copyFileSync(cacheSource, cachePath);
  const meshes = loadArchetypeMeshes();
  const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath });
  const overnight = JSON.parse(readFileSync(path.join(ROOT, "data/skill6/experiments/clustering-overnight-v1/index.json"), "utf8")) as { records: ClusterRecord[] };
  const storedGraph = overnight.records.find((record) => record.id === "on-graph-branching-7");
  const storedRule = overnight.records.find((record) => record.id === "on-rule-branching-4");

  console.log("graph search");
  const board = createBoard(meshes);
  const graph = runGraph(board, pool, { id: "diag-graph-branching-7", seed: SEED, tiles: 7, rootId: ROOT_ID, morphology: "branching", budget: TESTS_PER_TILE * 7 });
  const graphRecords = [graph.record, ...graph.alternatives];
  const graphPlans = graphRecords.map((record) => {
    const read = readingOf(record, meshes);
    writeFileSync(path.join(OUT, `${record.id}-contacts.svg`), contactSvg(record));
    return {
      id: record.id,
      tiles: record.tiles.length,
      status: record.status,
      reason: record.reason,
      trace: record.search?.trace,
      samePlacementAsStored: storedGraph ? placementKey(record.tiles) === placementKey(storedGraph.tiles) : false,
      sequence: record.tiles.map((tile) => tile.archetypeId),
      ...read,
    };
  });
  writeFileSync(path.join(OUT, "graph-plans.json"), JSON.stringify({
    note: "All distinct plans returned by the unchanged ranker. Ranking was not edited. Incomplete plans are included.",
    plans: graphPlans,
  }, null, 2));
  console.log("graph plans", graphPlans.map((plan) => `${plan.id} ${plan.tiles}`).join(" · "));

  console.log("rule search");
  const rule = runRule(meshes, pool, { id: "diag-rule-branching-4", seed: SEED, tiles: 4, rootId: ROOT_ID, morphology: "branching", budget: TESTS_PER_TILE * 4 });
  const ruleRecords = [rule.record, ...rule.alternatives];
  const complete = ruleRecords.filter((record) => record.tiles.length >= 4);
  const ruleSummaries = [];
  for (const record of ruleRecords) {
    writeFileSync(path.join(OUT, `${record.id}-contacts.svg`), contactSvg(record));
    const summary = {
      id: record.id,
      tiles: record.tiles.length,
      complete: record.tiles.length >= 4,
      reason: record.reason,
      trace: record.search?.trace,
      samePlacementAsStored: storedRule ? placementKey(record.tiles) === placementKey(storedRule.tiles) : false,
      sequence: record.tiles.map((tile) => tile.archetypeId),
      ...readingOf(record, meshes),
      stages: record.tiles.length >= 4 ? await stages(record, meshes) : null,
    };
    ruleSummaries.push(summary);
    console.log("rule", record.id, record.tiles.length, summary.stages?.firstFailingStage ?? "not complete");
  }
  writeFileSync(path.join(OUT, "rule-candidates.json"), JSON.stringify({
    note: "The ranked winner is first. A later candidate is assembled only when it also places four tiles. Incomplete candidates are recorded and not treated as a repair.",
    completeCandidates: complete.length,
    candidates: ruleSummaries,
  }, null, 2));
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
    version: "skill6-troubleshooting-v1",
    archive: "data/skill6/process-archive/v1.json",
    baseline: "data/skill6/process-archive/diagnostics/geometry-v1/report.json",
    warningMismatches: mismatches,
    graph: "graph-plans.json",
    rule: "rule-candidates.json",
    camera: "camera.json",
  }, null, 2));
  console.log("troubleshooting done", "rule complete", complete.length);
}

main();
