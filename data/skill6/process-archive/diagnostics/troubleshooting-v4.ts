/**
 * Registers the 420-test Graph sevens as their own collection, and tests a
 * local separation on the stored Rule Branching 4 mesh.
 * Does not rewrite overnight files, thresholds, budgets, or refinement settings.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster } from "../../../../lib/skill6/assembly";
import { SKILL6_GRAPH_ALGORITHM, SKILL6_PARAMETERS, type ClusterRecord, type SearchStats, type Vec3 } from "../../../../lib/skill6/contract";
import { createBoard, placementKey } from "../../../../lib/skill6/engines/board";
import { readShape, shapeSummary } from "../../../../lib/skill6/engines/morphology";
import { loadDockPool } from "../../../../lib/skill6/engines/pool";
import { crossingPenetration } from "../../../../lib/skill6/geometry";
import { solidSummary } from "../../../../lib/skill6/patch";
import { crossingReport } from "../../../../lib/skill6/refine-mesh";
import { loadArchetypeMeshes } from "../../../../lib/skill6/source";
import { STEP_COLORS, poseMesh, render } from "./measure-geometry-v1";
import { runPlan } from "./troubleshooting-v3";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v4");
const V2 = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v2");
const V3 = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v3");
const OVERNIGHT = path.join(ROOT, "data", "skill6", "experiments", "clustering-overnight-v1");
const COLLECTION = path.join(ROOT, "data", "skill6", "experiments", "clustering-graph-budget-v1");

type Mesh = { positions: Float32Array; indices: Uint32Array };

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function decode(encoded: { positions: string; indices: string }): Mesh {
  const positions = new Uint8Array(Buffer.from(encoded.positions, "base64"));
  const indices = new Uint8Array(Buffer.from(encoded.indices, "base64"));
  return {
    positions: new Float32Array(positions.buffer, positions.byteOffset, positions.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

function encode(mesh: Mesh) {
  return {
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
    triangles: mesh.indices.length / 3,
  };
}

function ids(indices: Uint32Array, triangle: number) {
  return [indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]];
}

function centroid(positions: Float32Array, corners: number[]): Vec3 {
  const sum = [0, 0, 0];
  for (const corner of corners) {
    sum[0] += positions[corner * 3];
    sum[1] += positions[corner * 3 + 1];
    sum[2] += positions[corner * 3 + 2];
  }
  return [sum[0] / corners.length, sum[1] / corners.length, sum[2] / corners.length];
}

function pairCenter(mesh: Mesh, triangle: number, other: number): Vec3 {
  const first = centroid(mesh.positions, ids(mesh.indices, triangle));
  const second = centroid(mesh.positions, ids(mesh.indices, other));
  return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2, (first[2] + second[2]) / 2];
}

function points(mesh: Mesh, triangle: number): [Vec3, Vec3, Vec3] {
  return ids(mesh.indices, triangle).map((corner) => [mesh.positions[corner * 3], mesh.positions[corner * 3 + 1], mesh.positions[corner * 3 + 2]] as Vec3) as [Vec3, Vec3, Vec3];
}

function depthOf(mesh: Mesh, triangle: number, other: number) {
  return crossingPenetration(...points(mesh, triangle), ...points(mesh, other));
}

function normal(positions: Float32Array, corners: number[]): Vec3 {
  const a = corners[0] * 3;
  const b = corners[1] * 3;
  const c = corners[2] * 3;
  const n: Vec3 = [
    (positions[b + 1] - positions[a + 1]) * (positions[c + 2] - positions[a + 2]) - (positions[b + 2] - positions[a + 2]) * (positions[c + 1] - positions[a + 1]),
    (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) - (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]),
    (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) - (positions[b + 1] - positions[a + 1]) * (positions[c] - positions[a]),
  ];
  const span = Math.hypot(...n) || 1;
  return [n[0] / span, n[1] / span, n[2] / span];
}

function oneRing(indices: Uint32Array, seed: number[]) {
  const start = new Set(seed);
  const keep = new Set(seed);
  for (let triangle = 0; triangle < indices.length / 3; triangle += 1) {
    const corners = ids(indices, triangle);
    if (corners.some((corner) => start.has(corner))) corners.forEach((corner) => keep.add(corner));
  }
  return keep;
}

function shift(before: Float32Array, after: Float32Array, allowed: Set<number>) {
  let max = 0;
  let outside = 0;
  let outsideMax = 0;
  for (let vertex = 0; vertex < before.length / 3; vertex += 1) {
    const distance = Math.hypot(after[vertex * 3] - before[vertex * 3], after[vertex * 3 + 1] - before[vertex * 3 + 1], after[vertex * 3 + 2] - before[vertex * 3 + 2]);
    max = Math.max(max, distance);
    if (distance > 1e-5 && !allowed.has(vertex)) {
      outside += 1;
      outsideMax = Math.max(outsideMax, distance);
    }
  }
  return { maxShift: round(max), verticesOutside: outside, outsideMax: round(outsideMax) };
}

function move(source: Float32Array, corners: number[], axis: Vec3, distance: number) {
  const next = new Float32Array(source);
  for (const corner of corners) {
    next[corner * 3] += axis[0] * distance;
    next[corner * 3 + 1] += axis[1] * distance;
    next[corner * 3 + 2] = Math.max(0, next[corner * 3 + 2] + axis[2] * distance);
  }
  return next;
}

function searchStats(tests: number, tiles: number, milliseconds: number, backtracks: number, trace: string): SearchStats {
  return {
    evaluations: tests,
    acceptedPoses: Math.max(0, tiles - 1),
    backtracks,
    milliseconds,
    exhausted: false,
    truncated: false,
    untried: 0,
    geometricRejections: Math.max(0, tests - tiles + 1),
    rejectionCounts: { intersection: 0, containment: 0, contact: Math.max(0, tests - tiles + 1) },
    depthLimit: 8,
    stop: "reached",
    organization: "branching",
    engine: "graph-based",
    trace,
  };
}

function priorKey(id: string) {
  const stored = JSON.parse(readFileSync(path.join(V2, "graph-plan-poses.json"), "utf8")) as { plans: { id: string; sequence: { archetypeId: string; pose: ClusterRecord["tiles"][number]["pose"] }[] }[] };
  const plan = stored.plans.find((item) => item.id === id)!;
  return placementKey(plan.sequence.map((tile, index) => ({ archetypeId: tile.archetypeId, pose: tile.pose, instanceId: `t${index}` } as ClusterRecord["tiles"][number])));
}

async function registerGraph(meshes: ReturnType<typeof loadArchetypeMeshes>) {
  mkdirSync(COLLECTION, { recursive: true });
  const cachePath = path.join(OUT, "pair-checks.json");
  if (!existsSync(cachePath)) copyFileSync(path.join(V3, "pair-checks.json"), cachePath);
  const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath });
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const wideningKey = priorKey("graph-branching-7-alt2");
  const wideKey = priorKey("graph-branching-7-alt1");
  console.log("register widening");
  const widening = runPlan(createBoard(meshes), pool, "widening", 420, wideningKey);
  console.log("register wide fan");
  const warmed = createBoard(meshes);
  runPlan(warmed, pool, "paired generations", 210, null);
  const warmedWidening = runPlan(warmed, pool, "widening", 210, wideningKey);
  const wide = runPlan(warmed, pool, "wide fan", 420, wideKey);
  console.log("widening", widening.tiles, widening.matchesPriorSix, "wide", wide.tiles, wide.matchesPriorSix, "warm", warmedWidening.matchesPriorSix);
  const plans = [
    { id: "graph-budget-widening-7", name: "widening", plan: widening, cache: "Fresh board. The placement at 210 tests is the stored six-tile widening plan." },
    { id: "graph-budget-wide-fan-7", name: "wide fan", plan: wide, cache: "Same board after paired generations and widening each used 210 tests. The placement at 210 tests is the stored six-tile wide-fan plan." },
  ];
  const records: ClusterRecord[] = [];
  const rows = [];
  for (const item of plans) {
    if (!item.plan.seventhTile || !item.plan.matchesPriorSix) throw new Error(`${item.name} did not reproduce the troubleshooting-v3 seven-tile search.`);
    const trace = `${item.name} 7/7 · 420-test experiment · ${item.plan.tests} tests · ${item.cache}`;
    const record = createBoard(meshes).record(item.id, 101, item.plan.placement, "accepted", trace, SKILL6_GRAPH_ALGORITHM, searchStats(item.plan.tests, item.plan.tiles, item.plan.milliseconds, item.plan.backtracks, trace));
    console.log("assemble", item.id);
    const built = await assembleCluster(record, meshes, `data/skill6/experiments/clustering-graph-budget-v1/${item.id}.mesh.json`);
    record.assembly = { ...built.assembly, meshFile: `data/skill6/experiments/clustering-graph-budget-v1/${item.id}.mesh.json` };
    const reasons = [];
    if ((built.assembly.refined.parameters.penetrations ?? 0) > 0 || (built.assembly.refined.parameters.maxPenetration ?? 0) > SKILL6_PARAMETERS.maxPenetration) reasons.push("penetration");
    if (built.assembly.refined.components !== 1 || built.assembly.union.components !== 1) reasons.push("bodies");
    if ((built.assembly.refined.cavities ?? 0) > 0) reasons.push("cavities");
    if (built.assembly.refined.status !== "NoError") reasons.push(built.assembly.refined.status);
    if (built.assembly.ground.lift > 0.18 || built.assembly.ground.minZAfter < -1e-3) reasons.push("ground");
    if (reasons.length) throw new Error(`${item.id} failed validation: ${reasons.join(", ")}`);
    writeFileSync(path.join(COLLECTION, `${item.id}.mesh.json`), JSON.stringify({ id: item.id, raw: built.meshes.raw ? encode(built.meshes.raw) : null, refined: built.meshes.refined ? encode(built.meshes.refined) : null, patches: built.meshes.patches.map((mesh) => encode(mesh)) }));
    const shape = shapeSummary(readShape(record.tiles, record.contacts, byId));
    records.push(record);
    rows.push({
      id: item.id,
      engine: "graph",
      morphology: "branching",
      targetTiles: 7,
      tiles: 7,
      status: "accepted",
      stop: "reached",
      validated: true,
      partial: true,
      penetrations: built.assembly.refined.parameters.penetrations ?? 0,
      maxPenetration: built.assembly.refined.parameters.maxPenetration ?? 0,
      milliseconds: item.plan.milliseconds,
      trace,
      reason: null,
      shape,
      lift: built.assembly.ground.lift,
    });
  }
  writeFileSync(path.join(COLLECTION, "index.json"), JSON.stringify({
    version: "clustering-graph-budget-v1",
    note: "Experimental seven-tile alternatives from widening and wide fan at 420 tests. The overnight chain and the default 210-test share are unchanged. Not promoted.",
    budget: { testsPerPlan: 420, defaultTestsPerPlan: 210, seed: 101, rootId: "open-hall" },
    attempted: 2,
    validated: records,
    records,
    diagnostics: records.map((record) => ({ id: record.id, targetTiles: 7, rootId: "open-hall", seed: 101, status: record.status, tiles: record.tiles.length, reason: record.reason ?? "" })),
    validation: {},
    rows,
    provisional: [],
  }, null, 2));
  writeFileSync(path.join(COLLECTION, "provenance.json"), JSON.stringify({
    source: "data/skill6/process-archive/diagnostics/troubleshooting-v3",
    chain: "on-graph-branching-7 remains the ranked winner in clustering-overnight-v1",
    plans: plans.map((item) => ({
      id: item.id,
      cache: item.cache,
      tests: item.plan.tests,
      milliseconds: item.plan.milliseconds,
      matchesPlacementAt210: item.plan.matchesPriorSix,
      rejectionCounts: item.plan.rejectionCounts,
    })),
  }, null, 2));
  console.log("graph collection written");
}

function locate(mesh: Mesh, at: number[]) {
  const report = crossingReport(mesh);
  let best: { triangle: number; other: number; depth: number; distance: number } | null = null;
  for (const pair of report.pairs) {
    const center = pairCenter(mesh, pair.triangle, pair.other);
    const distance = Math.hypot(center[0] - at[0], center[1] - at[1], center[2] - at[2]);
    if (!best || distance < best.distance) best = { ...pair, distance };
  }
  return best;
}

function candidate(source: Float32Array, indices: Uint32Array, triangle: number, other: number, allowed: Set<number>, positions: Float32Array, operation: string) {
  const mesh = { positions, indices };
  const report = crossingReport(mesh);
  return {
    operation,
    positions,
    penetrations: report.penetrations,
    maxPenetration: round(report.maxPenetration),
    pairDepth: round(depthOf(mesh, triangle, other)),
    ...shift(source, positions, allowed),
  };
}

function separate(source: Float32Array, indices: Uint32Array, triangle: number, other: number) {
  const first = ids(indices, triangle);
  const second = ids(indices, other);
  const pairVertices = new Set([...first, ...second]);
  const ring = oneRing(indices, [...first, ...second]);
  const depth = depthOf({ positions: source, indices }, triangle, other);
  const gap = Math.max(0, depth - SKILL6_PARAMETERS.maxPenetration) + 0.002;
  const from = centroid(source, first);
  const toward = centroid(source, second);
  const delta: Vec3 = [toward[0] - from[0], toward[1] - from[1], toward[2] - from[2]];
  const span = Math.hypot(...delta) || 1;
  const axis: Vec3 = [delta[0] / span, delta[1] / span, delta[2] / span];
  const left = normal(source, first);
  const right = normal(source, second);
  const leftAway: Vec3 = (left[0] * axis[0] + left[1] * axis[1] + left[2] * axis[2]) >= 0 ? [-left[0], -left[1], -left[2]] : left;
  const rightAway: Vec3 = (right[0] * axis[0] + right[1] * axis[1] + right[2] * axis[2]) <= 0 ? right : [-right[0], -right[1], -right[2]];
  const trials = [];
  const full = move(move(source, first, [-axis[0], -axis[1], -axis[2]], gap / 2), second, axis, gap / 2);
  trials.push(candidate(source, indices, triangle, other, pairVertices, full, "centroid split of the two triangles"));
  const along = move(move(source, first, leftAway, gap / 2), second, rightAway, gap / 2);
  trials.push(candidate(source, indices, triangle, other, pairVertices, along, "normal split of the two triangles"));
  let stepped = new Float32Array(source);
  const originalPenetrations = 2;
  for (let step = 0; step < 4; step += 1) {
    const next = move(move(stepped, first, [-axis[0], -axis[1], -axis[2]], gap / 8), second, axis, gap / 8);
    const reading = candidate(source, indices, triangle, other, pairVertices, next, "centroid steps on the two triangles");
    if (reading.penetrations > originalPenetrations) break;
    stepped = next;
    trials.push(reading);
  }
  const mid: Vec3 = [(from[0] + toward[0]) / 2, (from[1] + toward[1]) / 2, (from[2] + toward[2]) / 2];
  const ringPositions = new Float32Array(source);
  for (const vertex of ring) {
    const side = (source[vertex * 3] - mid[0]) * axis[0] + (source[vertex * 3 + 1] - mid[1]) * axis[1] + (source[vertex * 3 + 2] - mid[2]) * axis[2];
    const direction: Vec3 = side >= 0 ? axis : [-axis[0], -axis[1], -axis[2]];
    ringPositions[vertex * 3] += direction[0] * gap / 2;
    ringPositions[vertex * 3 + 1] += direction[1] * gap / 2;
    ringPositions[vertex * 3 + 2] = Math.max(0, ringPositions[vertex * 3 + 2] + direction[2] * gap / 2);
  }
  trials.push(candidate(source, indices, triangle, other, ring, ringPositions, "centroid split across one adjacent ring"));
  trials.sort((leftTrial, rightTrial) => leftTrial.pairDepth - rightTrial.pairDepth || leftTrial.penetrations - rightTrial.penetrations || leftTrial.maxShift - rightTrial.maxShift);
  return { depth: round(depth), gap: round(gap), trials };
}

async function correctRule() {
  console.log("rule neighborhoods");
  const overnight = JSON.parse(readFileSync(path.join(OVERNIGHT, "index.json"), "utf8")) as { records: ClusterRecord[] };
  const record = overnight.records.find((item) => item.id === "on-rule-branching-4")!;
  const stored = JSON.parse(readFileSync(path.join(OVERNIGHT, "on-rule-branching-4.mesh.json"), "utf8")) as { refined: { positions: string; indices: string } };
  const before = decode(stored.refined);
  const beforeReport = crossingReport(before);
  const beforeSolid = await solidSummary(before);
  const targets = [
    { name: "patch-neighborhood", at: [-10.15, 9.94, 14.4], expected: 0.0354 },
    { name: "tile-neighborhood", at: [-10.21, 12.72, 21.84], expected: 0.0256 },
  ];
  const found = targets.map((target) => ({ ...target, pair: locate(before, target.at) }));
  const tile = found.find((target) => target.name === "tile-neighborhood")?.pair;
  const tileSweep = tile ? [0.01, 0.02, 0.04, 0.08].map((distance) => {
    const first = ids(before.indices, tile.triangle);
    const second = ids(before.indices, tile.other);
    const from = centroid(before.positions, first);
    const toward = centroid(before.positions, second);
    const axis: Vec3 = [toward[0] - from[0], toward[1] - from[1], toward[2] - from[2]];
    const span = Math.hypot(...axis) || 1;
    const unit: Vec3 = [axis[0] / span, axis[1] / span, axis[2] / span];
    const face = normal(before.positions, first);
    const away: Vec3 = (face[0] * unit[0] + face[1] * unit[1] + face[2] * unit[2]) >= 0 ? [-face[0], -face[1], -face[2]] : face;
    const other = normal(before.positions, second);
    const otherAway: Vec3 = (other[0] * unit[0] + other[1] * unit[1] + other[2] * unit[2]) <= 0 ? other : [-other[0], -other[1], -other[2]];
    const positions = move(move(before.positions, first, away, distance / 2), second, otherAway, distance / 2);
    const report = crossingReport({ positions, indices: before.indices });
    return {
      distance,
      penetrations: report.penetrations,
      maxPenetration: round(report.maxPenetration),
      pairDepth: round(depthOf({ positions, indices: before.indices }, tile.triangle, tile.other)),
      maxShift: shift(before.positions, positions, new Set([...first, ...second])).maxShift,
      remaining: report.pairs.map((pair) => round(pair.depth)),
    };
  }) : [];
  const separated = found.map((target) => {
    if (!target.pair) return { ...target, result: null };
    console.log("separate", target.name);
    return { ...target, result: separate(before.positions, before.indices, target.pair.triangle, target.pair.other) };
  });
  const chosen = separated.map((target) => {
    const usable = target.result?.trials.filter((trial) => trial.verticesOutside === 0 && trial.penetrations <= beforeReport.penetrations && trial.pairDepth <= SKILL6_PARAMETERS.maxPenetration) ?? [];
    return { name: target.name, chosen: usable[0] ?? null, best: target.result?.trials[0] ?? null };
  });
  let combined: { positions: Float32Array; penetrations: number; maxPenetration: number; maxShift: number; verticesOutside: number } | null = null;
  if (chosen.every((item) => item.chosen)) {
    const next = new Float32Array(before.positions);
    for (const item of chosen) {
      const moved = item.chosen!.positions;
      for (let index = 0; index < next.length; index += 1) next[index] += moved[index] - before.positions[index];
    }
    for (let index = 2; index < next.length; index += 3) next[index] = Math.max(0, next[index]);
    const allowed = new Set<number>();
    for (const target of separated) {
      if (!target.pair || !target.result) continue;
      const corners = [...ids(before.indices, target.pair.triangle), ...ids(before.indices, target.pair.other)];
      const region = target.result.trials.find((trial) => trial.operation === chosen.find((item) => item.name === target.name)?.chosen?.operation);
      const useRing = region?.operation.includes("ring");
      for (const vertex of useRing ? oneRing(before.indices, corners) : corners) allowed.add(vertex);
    }
    const report = crossingReport({ positions: next, indices: before.indices });
    const moved = shift(before.positions, next, allowed);
    combined = { positions: next, penetrations: report.penetrations, maxPenetration: round(report.maxPenetration), ...moved };
  }
  const passedMesh = combined && combined.penetrations === 0 && combined.maxPenetration <= SKILL6_PARAMETERS.maxPenetration && combined.verticesOutside === 0
    ? { positions: combined.positions, indices: before.indices }
    : null;
  const remainingOf = (positions: Float32Array | undefined) => {
    if (!positions) return [];
    return crossingReport({ positions, indices: before.indices }).pairs.map((pair) => ({
      depth: round(pair.depth),
      centroid: pairCenter({ positions, indices: before.indices }, pair.triangle, pair.other).map((value) => round(value, 2)),
      triangles: [pair.triangle, pair.other],
    }));
  };
  const afterSolid = passedMesh ? await solidSummary(passedMesh) : null;
  const minZ = (positions: Float32Array) => {
    let value = Infinity;
    for (let index = 2; index < positions.length; index += 3) value = Math.min(value, positions[index]);
    return value;
  };
  const reasons: string[] = [];
  if (!passedMesh || !afterSolid || !combined) reasons.push("the two neighborhoods were not both cleared without a new penetration");
  if (afterSolid && (afterSolid.components !== 1 || afterSolid.status !== "NoError")) reasons.push(`solid ${afterSolid.status}, bodies ${afterSolid.components}`);
  if (afterSolid && (afterSolid.cavities ?? 0) !== (beforeSolid.cavities ?? 0)) reasons.push("cavity count changed");
  if (passedMesh && minZ(passedMesh.positions) < -1e-3) reasons.push("below ground");
  if (combined && combined.verticesOutside > 0) reasons.push("vertices moved outside the neighborhoods");
  if (beforeSolid.volume && afterSolid?.volume && Math.abs(afterSolid.volume - beforeSolid.volume) / beforeSolid.volume > 0.01) reasons.push("volume changed by more than 1%");
  const validated = reasons.length === 0;
  const meshes = loadArchetypeMeshes();
  const seated = new Map((record.assembly?.seatedTiles ?? []).map((tile) => [tile.instanceId, tile.pose]));
  render([{ positions: before.positions, indices: before.indices, color: [214, 214, 214] }], path.join(OUT, "rule-branching-4-before.png"));
  for (const item of chosen) {
    if (!item.chosen) continue;
    render([{ positions: item.chosen.positions, indices: before.indices, color: [214, 214, 214] }], path.join(OUT, `rule-branching-4-${item.name}.png`));
  }
  if (passedMesh) render([{ positions: passedMesh.positions, indices: passedMesh.indices, color: [214, 214, 214] }], path.join(OUT, "rule-branching-4-after.png"));
  render(record.tiles.map((tile, index) => ({ ...poseMesh(meshes.find((mesh) => mesh.archetypeId === tile.archetypeId)!, seated.get(tile.instanceId) ?? tile.pose), color: STEP_COLORS[index % STEP_COLORS.length] })), path.join(OUT, "rule-branching-4-rigid.png"));
  if (passedMesh) writeFileSync(path.join(OUT, "rule-branching-4-corrected.mesh.json"), JSON.stringify({ id: "rule-branching-4-local", provenance: "Local separation of the stored refined mesh. The overnight file was not rewritten.", refined: encode(passedMesh) }));
  writeFileSync(path.join(OUT, "rule-local-correction.json"), JSON.stringify({
    provenance: "Original stored refined mesh of on-rule-branching-4. The overnight file is unchanged. Global refinement settings were not used for this pass.",
    before: { penetrations: beforeReport.penetrations, maxPenetration: round(beforeReport.maxPenetration), solid: beforeSolid, minZ: round(minZ(before.positions)) },
    neighborhoods: separated.map((target) => ({
      name: target.name,
      expectedDepth: target.expected,
      triangles: target.pair ? [target.pair.triangle, target.pair.other] : null,
      depth: target.pair ? round(target.pair.depth) : null,
      trials: target.result?.trials.map(({ positions: _positions, ...trial }) => trial) ?? [],
      clearedAlone: chosen.find((item) => item.name === target.name)?.chosen?.operation ?? null,
      remainingAfterChosen: remainingOf(chosen.find((item) => item.name === target.name)?.chosen?.positions),
    })),
    combined: combined ? { penetrations: combined.penetrations, maxPenetration: combined.maxPenetration, maxShift: combined.maxShift, verticesOutside: combined.verticesOutside, remaining: remainingOf(combined.positions) } : null,
    afterSolid,
    contacts: "Stored contacts and the ground lift were not moved. Only refined-surface vertices in a cleared neighborhood move.",
    tileNormalSweep: tileSweep,
    validated,
    reasons,
  }, null, 2));
  console.log("rule correction", validated ? "passed" : reasons.join("; "));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const meshes = loadArchetypeMeshes();
  if (process.argv.includes("--rule")) {
    await correctRule();
    console.log("rule only done");
    return;
  }
  await registerGraph(meshes);
  await correctRule();
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
    id: "troubleshooting-v4",
    prior: "data/skill6/process-archive/diagnostics/troubleshooting-v3",
    graphCollection: "data/skill6/experiments/clustering-graph-budget-v1",
    rule: "rule-local-correction.json",
    unchanged: ["clustering-overnight-v1", "default 210-test share", "CLUSTER_REFINEMENT", "thresholds"],
  }, null, 2));
  console.log("troubleshooting v4 done");
}

void main();
