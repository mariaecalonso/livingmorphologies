/**
 * Assemblies for the two six-tile Graph plans, and stage penetrations
 * for the stored Rule failure and one validated cluster from each engine.
 * Writes only under troubleshooting-v2. Does not change ranking or earlier files.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster } from "../../../../lib/skill6/assembly";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord, type Vec3 } from "../../../../lib/skill6/contract";
import { createBoard, placementKey } from "../../../../lib/skill6/engines/board";
import { runGraph } from "../../../../lib/skill6/engines/graph";
import { readShape, shapeSummary } from "../../../../lib/skill6/engines/morphology";
import { loadDockPool } from "../../../../lib/skill6/engines/pool";
import { posedMesh as posedPatch, unionSolids } from "../../../../lib/skill6/patch";
import { crossingReport, type CrossingReport } from "../../../../lib/skill6/refine-mesh";
import { loadArchetypeMeshes, type ArchetypeMesh } from "../../../../lib/skill6/source";
import { STEP_COLORS, poseMesh, render } from "./measure-geometry-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v2");
const STORED = ["on-rule-branching-4", "on-rule-compact-5", "on-graph-branching-5", "on-wfc-branching-5"] as const;
const ALLOWED = new Set<string>(SKILL6_GROWTH_DIRECTIONS);

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function decode(encoded: { positions: string; indices: string } | null) {
  if (!encoded?.positions) return null;
  const positions = new Uint8Array(Buffer.from(encoded.positions, "base64"));
  const indices = new Uint8Array(Buffer.from(encoded.indices, "base64"));
  return {
    positions: new Float32Array(positions.buffer, positions.byteOffset, positions.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

function liftMesh(mesh: { positions: Float32Array; indices: Uint32Array }, lift: number) {
  const positions = new Float32Array(mesh.positions);
  for (let index = 2; index < positions.length; index += 3) positions[index] += lift;
  return { positions, indices: mesh.indices };
}

function counts(report: CrossingReport) {
  return { penetrations: report.penetrations, grazes: report.grazes, maxPenetration: round(report.maxPenetration) };
}

function centroid(mesh: { positions: Float32Array; indices: Uint32Array }, triangle: number): Vec3 {
  const index = mesh.indices;
  const point = mesh.positions;
  const sum: Vec3 = [0, 0, 0];
  for (let corner = 0; corner < 3; corner += 1) {
    const vertex = index[triangle * 3 + corner] * 3;
    sum[0] += point[vertex];
    sum[1] += point[vertex + 1];
    sum[2] += point[vertex + 2];
  }
  return [sum[0] / 3, sum[1] / 3, sum[2] / 3];
}

function locate(mesh: { positions: Float32Array; indices: Uint32Array }, report: CrossingReport, samples: Vec3[]) {
  const bins = new Map<string, { count: number; max: number; atContact: number }>();
  let atContact = 0;
  let away = 0;
  for (const pair of report.pairs) {
    if (pair.depth <= SKILL6_PARAMETERS.maxPenetration) continue;
    const point = centroid(mesh, pair.triangle);
    const near = samples.some((sample) => Math.hypot(point[0] - sample[0], point[1] - sample[1], point[2] - sample[2]) <= 2);
    if (near) atContact += 1;
    else away += 1;
    const key = [0, 1, 2].map((axis) => Math.round(point[axis] / 2) * 2).join(",");
    const bin = bins.get(key) ?? { count: 0, max: 0, atContact: 0 };
    bin.count += 1;
    bin.max = Math.max(bin.max, pair.depth);
    if (near) bin.atContact += 1;
    bins.set(key, bin);
  }
  const clusters = [...bins.entries()].sort((left, right) => right[1].count - left[1].count).slice(0, 5).map(([at, bin]) => ({
    at, count: bin.count, maxPenetration: round(bin.max), atContact: bin.atContact,
  }));
  return { atContact, awayFromContact: away, clusters };
}

function contactSamples(record: ClusterRecord, lift: number): Vec3[] {
  const points: Vec3[] = [];
  for (const contact of record.contacts) {
    for (const sample of contact.samples) points.push([sample.host[0], sample.host[1], sample.host[2] + lift]);
  }
  return points;
}

function stageMesh(name: string, mesh: { positions: Float32Array; indices: Uint32Array } | null, samples: Vec3[]) {
  if (!mesh) return { name, missing: true };
  const report = crossingReport(mesh);
  return { name, ...counts(report), location: locate(mesh, report, samples), measurement: "crossingReport on one mesh, graze 0.02. Same function at every mesh stage." };
}

function validateSix(record: ClusterRecord, assembly: Awaited<ReturnType<typeof assembleCluster>>["assembly"]) {
  const reasons: string[] = [];
  if (record.tiles.length !== 6) reasons.push(`placed ${record.tiles.length} of a seven-tile attempt`);
  if (assembly.counts["failed-patch"] > 0) reasons.push(`${assembly.counts["failed-patch"]} failed patches`);
  if (assembly.union.components !== 1) reasons.push(`union bodies ${assembly.union.components}`);
  if (assembly.refined.status !== "NoError") reasons.push(`refined ${assembly.refined.status}`);
  if (assembly.refined.components !== 1) reasons.push(`refined bodies ${assembly.refined.components}`);
  if ((assembly.refined.cavities ?? 0) > 0) reasons.push(`${assembly.refined.cavities} cavities`);
  const penetrations = assembly.refined.parameters.penetrations ?? 0;
  const maxPenetration = assembly.refined.parameters.maxPenetration ?? 0;
  if (penetrations > 0 || maxPenetration > SKILL6_PARAMETERS.maxPenetration) reasons.push(`${penetrations} penetrations, max ${maxPenetration.toFixed(3)}`);
  if (assembly.ground.lift > 0.18) reasons.push(`lift ${assembly.ground.lift.toFixed(3)}`);
  if (assembly.ground.minZAfter < -1e-3) reasons.push("below ground");
  for (const step of assembly.growth) {
    if (step.direction && !ALLOWED.has(step.direction)) reasons.push(`direction ${step.direction}`);
  }
  return reasons;
}

function encode(mesh: { positions: Float32Array; indices: Uint32Array }) {
  return {
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
    triangles: mesh.indices.length / 3,
  };
}

function draw(record: ClusterRecord, meshes: ArchetypeMesh[], refined: { positions: Float32Array; indices: Uint32Array } | null, id: string) {
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const seated = new Map(record.assembly?.seatedTiles.map((tile) => [tile.instanceId, tile.pose]) ?? []);
  if (refined) render([{ positions: refined.positions, indices: refined.indices, color: [214, 214, 214] }], path.join(OUT, `${id}-refined.png`));
  render(record.tiles.map((tile, index) => ({ ...poseMesh(byId.get(tile.archetypeId)!, seated.get(tile.instanceId) ?? tile.pose), color: STEP_COLORS[index % STEP_COLORS.length] })), path.join(OUT, `${id}-rigid.png`));
}

async function stagesOf(record: ClusterRecord, meshes: ArchetypeMesh[], raw: { positions: Float32Array; indices: Uint32Array } | null, refined: { positions: Float32Array; indices: Uint32Array } | null, lift: number) {
  const samples = contactSamples(record, lift);
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const tileUnion = await unionSolids(record.tiles.map((tile) => posedPatch(byId.get(tile.archetypeId)!, tile.pose)));
  const liftedTiles = tileUnion.mesh ? liftMesh(tileUnion.mesh, lift) : null;
  const rigidMax = record.contacts.reduce((max, contact) => Math.max(max, contact.deepestCrossing), 0);
  return {
    rigidSeating: {
      measurement: "Pair crossing recorded on the contact. Not a union self-intersection.",
      contactsOver002: record.contacts.filter((contact) => contact.deepestCrossing > SKILL6_PARAMETERS.maxPenetration).length,
      maxCrossing: round(rigidMax),
    },
    tilesOnlyUnion: {
      label: "Reconstruction. No historical tiles-only union was stored.",
      status: tileUnion.status,
      ...stageMesh("tiles-only union", liftedTiles, samples),
    },
    patchedUnion: stageMesh("stored or assembled raw union", raw, samples),
    refined: stageMesh("refined", refined, samples),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cacheSource = path.join(ROOT, "data/skill6/experiments/clustering-overnight-v1/pair-checks.json");
  const cachePath = path.join(OUT, "pair-checks.json");
  if (!existsSync(cachePath)) copyFileSync(cacheSource, cachePath);
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath });
  const overnight = JSON.parse(readFileSync(path.join(ROOT, "data/skill6/experiments/clustering-overnight-v1/index.json"), "utf8")) as { records: ClusterRecord[] };
  const storedChain = overnight.records.find((record) => record.id === "on-graph-branching-7")!;

  console.log("recover graph plans");
  const graph = runGraph(createBoard(meshes), pool, { id: "graph-branching-7", seed: 101, tiles: 7, rootId: "open-hall", morphology: "branching", budget: 120 * 7 });
  const plans = [graph.record, ...graph.alternatives].map((record) => ({
    id: record.id,
    plan: record.reason,
    tiles: record.tiles.length,
    target: 7,
    sevenTileStatus: record.tiles.length >= 7 ? "complete" : "incomplete",
    trace: record.search?.trace,
    samePlacementAsStoredChain: placementKey(record.tiles) === placementKey(storedChain.tiles),
    shape: shapeSummary(readShape(record.tiles, record.contacts, byId)),
    sequence: record.tiles.map((tile) => ({ instanceId: tile.instanceId, archetypeId: tile.archetypeId, pose: tile.pose })),
    record,
  }));
  writeFileSync(path.join(OUT, "graph-plan-poses.json"), JSON.stringify({
    note: "Poses recovered by repeating the unchanged seven-tile Graph search. troubleshooting-v1 stored scores and sequences, not poses. The chain placement is checked against on-graph-branching-7.",
    plans: plans.map(({ record: _record, ...plan }) => plan),
  }, null, 2));

  const six = plans.filter((plan) => plan.tiles === 6);
  const assemblies = [];
  for (const plan of six) {
    console.log("assemble", plan.id);
    const built = await assembleCluster(plan.record, meshes, `data/skill6/process-archive/diagnostics/troubleshooting-v2/${plan.id}.mesh.json`);
    plan.record.assembly = built.assembly;
    const reasons = validateSix(plan.record, built.assembly);
    writeFileSync(path.join(OUT, `${plan.id}.mesh.json`), JSON.stringify({ id: plan.id, raw: built.meshes.raw ? encode(built.meshes.raw) : null, refined: built.meshes.refined ? encode(built.meshes.refined) : null, patches: built.meshes.patches.map((mesh) => encode(mesh)) }));
    draw(plan.record, meshes, built.meshes.refined, plan.id);
    const stage = await stagesOf(plan.record, meshes, built.meshes.raw, built.meshes.refined, built.assembly.ground.lift);
    assemblies.push({
      id: plan.id,
      sevenTileStatus: "incomplete",
      sixTileAlternative: reasons.length === 0 ? "validated" : "failed",
      validationReasons: reasons,
      shape: plan.shape,
      growth: built.assembly.growth,
      graph: built.assembly.graph,
      joints: built.assembly.joints.map((joint) => ({ id: joint.id, primary: joint.primary, direction: joint.direction, area: round(joint.contact.contactArea, 2), classification: joint.classification })),
      refined: { penetrations: built.assembly.refined.parameters.penetrations, maxPenetration: built.assembly.refined.parameters.maxPenetration, components: built.assembly.refined.components, cavities: built.assembly.refined.cavities },
      stage,
    });
    console.log(plan.id, reasons.length ? reasons.join("; ") : "six-tile geometry passed");
  }
  writeFileSync(path.join(OUT, "graph-six-tile.json"), JSON.stringify({
    beside: "on-graph-branching-7 remains the ranked seven-tile winner in clustering-overnight-v1. It was not reassembled.",
    chainDiagrams: "data/skill6/process-archive/diagnostics/geometry-v1/on-graph-branching-7-refined.png",
    assemblies,
  }, null, 2));

  console.log("stage comparison");
  const comparison = [];
  for (const id of STORED) {
    const record = overnight.records.find((item) => item.id === id)!;
    const file = JSON.parse(readFileSync(path.join(ROOT, "data/skill6/experiments/clustering-overnight-v1", `${id}.mesh.json`), "utf8")) as { raw: { positions: string; indices: string } | null; refined: { positions: string; indices: string } | null };
    const stage = await stagesOf(record, meshes, decode(file.raw), decode(file.refined), record.assembly?.ground.lift ?? 0);
    comparison.push({ id, validated: id !== "on-rule-branching-4", tiles: record.tiles.length, stage });
    console.log(id, "tiles-only", stage.tilesOnlyUnion.penetrations, "raw", stage.patchedUnion.penetrations, "refined", stage.refined.penetrations);
  }
  writeFileSync(path.join(OUT, "union-stages.json"), JSON.stringify({
    comparability: "Rigid seating is the stored pair-crossing depth. Tiles-only, raw union, and refined use crossingReport on one mesh with the same 0.02 graze. A penetration within 2 of a stored contact sample is marked at the contact. The tiles-only union is a reconstruction.",
    stored: comparison,
  }, null, 2));
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
    version: "skill6-troubleshooting-v2",
    archive: "data/skill6/process-archive/v1.json",
    prior: "data/skill6/process-archive/diagnostics/troubleshooting-v1",
    poses: "graph-plan-poses.json",
    sixTile: "graph-six-tile.json",
    stages: "union-stages.json",
    camera: "data/skill6/process-archive/diagnostics/troubleshooting-v1/camera.json",
  }, null, 2));
  console.log("troubleshooting v2 done");
}

main();
