/**
 * Increased-budget Wide Fan and Widening searches, and a trace of the two
 * refined crossings on the stored Rule Branching 4 mesh.
 * Writes only under troubleshooting-v3. Does not call runGraph, so the
 * default budget split is untouched. Does not rewrite overnight files.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assembleCluster } from "../../../../lib/skill6/assembly";
import { SKILL6_GRAPH_ALGORITHM, SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord, type SearchStats, type Vec3 } from "../../../../lib/skill6/contract";
import { createBoard, placementKey, type Board, type Placement } from "../../../../lib/skill6/engines/board";
import { readShape, shapeSummary } from "../../../../lib/skill6/engines/morphology";
import { loadDockPool, type DockCandidate, type DockPool } from "../../../../lib/skill6/engines/pool";
import { crossingPenetration } from "../../../../lib/skill6/geometry";
import { posedMesh as posedPatch, unionSolids } from "../../../../lib/skill6/patch";
import { crossingReport } from "../../../../lib/skill6/refine-mesh";
import { loadArchetypeMeshes, type ArchetypeMesh } from "../../../../lib/skill6/source";
import { STEP_COLORS, poseMesh, render } from "./measure-geometry-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v3");
const V2 = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "troubleshooting-v2");
const OVERNIGHT = path.join(ROOT, "data", "skill6", "experiments", "clustering-overnight-v1");
const ALLOWANCE = 420;
const PRIOR_ALLOWANCE = 210;
const WIDTH = 8;
const ALLOWED = new Set<string>(SKILL6_GROWTH_DIRECTIONS);

type Mesh = { positions: Float32Array; indices: Uint32Array };
type PlanName = "paired generations" | "widening" | "wide fan";

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function decode(encoded: { positions: string; indices: string } | null): Mesh | null {
  if (!encoded?.positions) return null;
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

function liftMesh(mesh: Mesh, lift: number): Mesh {
  const positions = new Float32Array(mesh.positions);
  for (let index = 2; index < positions.length; index += 3) positions[index] += lift;
  return { positions, indices: mesh.indices };
}

function generation(name: PlanName, tiles: number): number[] {
  const sizes = name === "wide fan" ? () => 3 : name === "paired generations" ? () => 2 : (level: number) => level;
  const list = [0];
  for (let level = 1; list.length < tiles; level += 1) {
    for (let count = 0; count < sizes(level) && list.length < tiles; count += 1) list.push(level);
  }
  return list;
}

function compactPlacement(placement: Placement, tests: number) {
  return {
    tests,
    tiles: placement.tiles.length,
    key: placementKey(placement.tiles),
    sequence: placement.tiles.map((tile) => ({
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      pose: tile.pose,
    })),
  };
}

export function runPlan(board: Board, pool: DockPool, name: PlanName, limit: number, priorKey: string | null) {
  const started = Date.now();
  const jobTiles = 7;
  const planGeneration = generation(name, jobTiles);
  const deepest = planGeneration[planGeneration.length - 1];
  const nextSize = (level: number) => planGeneration.filter((value) => value === level + 1).length;
  const degree = new Map<string, number>();
  for (const candidate of pool.candidates) degree.set(candidate.host, (degree.get(candidate.host) ?? 0) + 1);
  const root = board.seed("open-hall");
  let best: Placement = root;
  let complete: Placement | null = null;
  let deviations = 0;
  let backtracks = 0;
  let planStop: "reached" | "budget" | "candidates" = "candidates";
  let planReason: string | null = null;
  const testsBefore = board.tests;
  const rejectionCounts = new Map<string, number>();
  const rejectionRuns: { reason: string; count: number; tests: number }[] = [];
  const seen = new Set<string>();
  const placements: ReturnType<typeof compactPlacement>[] = [];
  let snapshot: { tests: number; tiles: number; key: string; deviations: number } | null = null;

  const weight = (placement: Placement, node: number, hostSlot: number, candidate: DockCandidate) => {
    const parentTile = placement.tiles[hostSlot];
    const repeats = placement.tiles.filter((tile) => tile.archetypeId === candidate.guest).length;
    const siblings = placement.contacts.filter((contact) => contact.hostId === parentTile.instanceId);
    const sameFace = siblings.some((contact) => contact.searchNote.split(" ")[0] === candidate.direction);
    const level = planGeneration[node];
    const outgoing = degree.get(candidate.guest) ?? 0;
    let score = Math.min(candidate.area, 60) * 0.04 - repeats * 0.8 - (sameFace ? 1.5 : 0);
    if (level < deepest) score += Math.min(outgoing, 12) / 12 * 1.5 - (outgoing < 2 ? 2 : 0);
    score -= siblings.length * 0.6;
    return score;
  };

  const remember = (placement: Placement) => {
    const key = placementKey(placement.tiles);
    if (seen.has(key)) return;
    seen.add(key);
    placements.push(compactPlacement(placement, board.tests - testsBefore));
  };

  const realize = (placement: Placement, node: number, generationOf: number[]): boolean => {
    if (placement.tiles.length > best.tiles.length) best = placement;
    if (node >= jobTiles) {
      complete = placement;
      planStop = "reached";
      return true;
    }
    const level = planGeneration[node];
    const rank = (slots: number[]) => slots
      .flatMap((hostSlot) => pool.forHost(placement.tiles[hostSlot].archetypeId).map((candidate) => ({ hostSlot, candidate, score: weight(placement, node, hostSlot, candidate) })))
      .sort((left, right) => right.score - left.score)
      .slice(0, WIDTH + nextSize(level - 1));
    const planned = generationOf.map((value, slot) => (value === level - 1 ? slot : -1)).filter((slot) => slot >= 0);
    const deeper = generationOf.map((value, slot) => (value >= level ? slot : -1)).filter((slot) => slot >= 0);
    for (const [options, deviated] of [[rank(planned), false], [rank(deeper), true]] as const) {
      for (const option of options) {
        const used = board.tests - testsBefore;
        if (!snapshot && used >= PRIOR_ALLOWANCE) snapshot = { tests: used, tiles: best.tiles.length, key: placementKey(best.tiles), deviations };
        if (used >= limit) {
          planStop = "budget";
          return false;
        }
        const result = board.tryAttach(placement, option.hostSlot, option.candidate);
        if (!result.ok) {
          planReason = result.reason;
          rejectionCounts.set(result.reason, (rejectionCounts.get(result.reason) ?? 0) + 1);
          const last = rejectionRuns.at(-1);
          if (last && last.reason === result.reason) last.count += 1;
          else rejectionRuns.push({ reason: result.reason, count: 1, tests: board.tests - testsBefore });
          continue;
        }
        if (deviated) deviations += 1;
        remember(result.placement);
        if (realize(result.placement, node + 1, [...generationOf, generationOf[option.hostSlot] + 1])) return true;
        backtracks += 1;
      }
    }
    return false;
  };

  realize(root, 1, [0]);
  const done = complete ?? best;
  const used = board.tests - testsBefore;
  if (done.tiles.length >= jobTiles) planStop = "reached";
  const elapsed = Date.now() - started;
  return {
    name,
    allowance: limit,
    priorAllowance: PRIOR_ALLOWANCE,
    tests: used,
    milliseconds: elapsed,
    stop: planStop,
    deviations,
    backtracks,
    lastContactRejection: planReason,
    stopNote: planStop === "budget"
      ? `${name} exhausted its ${limit}-test allowance at ${done.tiles.length} of 7. Last contact rejection, not the reason the plan stopped: ${planReason ?? "none"}.`
      : planStop === "reached"
        ? `${name} placed 7 tiles after ${used} tests.`
        : `${name} had no further accepted candidate at ${done.tiles.length} of 7. Last contact rejection: ${planReason ?? "none"}.`,
    matchesPriorSix: priorKey != null && snapshot?.key === priorKey,
    at210: snapshot,
    priorKey,
    tiles: done.tiles.length,
    seventhTile: done.tiles.length >= 7,
    placement: done,
    placements,
    rejectionCounts: [...rejectionCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count),
    rejectionRuns,
  };
}

function validate(record: ClusterRecord, assembly: Awaited<ReturnType<typeof assembleCluster>>["assembly"], expected: number) {
  const reasons: string[] = [];
  if (record.tiles.length !== expected) reasons.push(`placed ${record.tiles.length}`);
  if (assembly.counts["failed-patch"] > 0) reasons.push(`${assembly.counts["failed-patch"]} failed patches`);
  if (assembly.union.components !== 1) reasons.push(`union bodies ${assembly.union.components}`);
  if (assembly.refined.status !== "NoError") reasons.push(`refined ${assembly.refined.status}`);
  if (assembly.refined.components !== 1) reasons.push(`refined bodies ${assembly.refined.components}`);
  if ((assembly.refined.cavities ?? 0) > 0) reasons.push(`${assembly.refined.cavities} cavities`);
  const penetrations = assembly.refined.parameters.penetrations ?? 0;
  const maxPenetration = assembly.refined.parameters.maxPenetration ?? 0;
  if (penetrations > 0 || maxPenetration > SKILL6_PARAMETERS.maxPenetration) reasons.push(`${penetrations} penetrations, max ${maxPenetration.toFixed(4)}`);
  if (assembly.ground.lift > 0.18) reasons.push(`lift ${assembly.ground.lift.toFixed(3)}`);
  if (assembly.ground.minZAfter < -1e-3) reasons.push("below ground");
  for (const step of assembly.growth) if (step.direction && !ALLOWED.has(step.direction)) reasons.push(`direction ${step.direction}`);
  return reasons;
}

function searchStats(tests: number, tiles: number, milliseconds: number, stop: "reached" | "budget" | "candidates", trace: string): SearchStats {
  const reached = stop === "reached";
  return {
    evaluations: tests,
    acceptedPoses: Math.max(0, tiles - 1),
    backtracks: 0,
    milliseconds,
    exhausted: !reached,
    truncated: stop === "budget",
    untried: 0,
    geometricRejections: Math.max(0, tests - tiles + 1),
    rejectionCounts: { intersection: 0, containment: 0, contact: Math.max(0, tests - tiles + 1) },
    depthLimit: WIDTH,
    stop: reached ? "reached" : stop === "budget" ? "exhausted" : "geometric",
    organization: "branching",
    engine: "graph-based",
    trace,
  };
}

function contactsSvg(record: ClusterRecord, file: string) {
  const seated = record.assembly?.seatedTiles ?? [];
  const poseOf = new Map(seated.map((tile) => [tile.instanceId, tile.pose]));
  const project = (x: number, y: number, z: number) => ({ x: (x - y) * Math.cos(Math.PI / 6), y: -z + (x + y) * Math.sin(Math.PI / 6) });
  const points = record.tiles.map((tile) => {
    const pose = poseOf.get(tile.instanceId) ?? tile.pose;
    const point = project(pose.translation[0], pose.translation[1], pose.translation[2]);
    return { ...point, id: tile.instanceId };
  });
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const fit = 280 / Math.max(maxX - minX, maxY - minY, 1);
  const sx = (value: number) => 40 + (value - minX) * fit;
  const sy = (value: number) => 40 + (value - minY) * fit;
  const edges = record.assembly?.graph.edges ?? [];
  const lines = edges.map((edge) => {
    const host = points.find((point) => point.id === edge.host);
    const guest = points.find((point) => point.id === edge.guest);
    if (!host || !guest) return "";
    return `<line x1="${sx(host.x)}" y1="${sy(host.y)}" x2="${sx(guest.x)}" y2="${sy(guest.y)}" stroke="${edge.primary ? "#49d7de" : "#c77e5f"}" stroke-width="${edge.primary ? 2 : 1}" />`;
  });
  const nodes = points.map((point) => `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="8" fill="#111" stroke="#d6d6d6" /><text x="${sx(point.x) + 10}" y="${sy(point.y) + 4}" fill="#d6d6d6" font-size="12">${point.id}</text>`);
  writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="360" viewBox="0 0 420 360"><rect width="420" height="360" fill="#000"/>${lines.join("")}${nodes.join("")}</svg>`);
}

function draw(record: ClusterRecord, meshes: ArchetypeMesh[], refined: Mesh | null, id: string, extra: { positions: Float32Array; indices: Uint32Array; color: [number, number, number] }[] = []) {
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const seated = new Map(record.assembly?.seatedTiles.map((tile) => [tile.instanceId, tile.pose]) ?? []);
  if (refined) render([{ positions: refined.positions, indices: refined.indices, color: [214, 214, 214] }, ...extra], path.join(OUT, `${id}-refined.png`));
  render(record.tiles.map((tile, index) => ({ ...poseMesh(byId.get(tile.archetypeId)!, seated.get(tile.instanceId) ?? tile.pose), color: STEP_COLORS[index % STEP_COLORS.length] })), path.join(OUT, `${id}-rigid.png`));
  contactsSvg(record, path.join(OUT, `${id}-contacts.svg`));
}

function trianglePoints(mesh: Mesh, triangle: number): [Vec3, Vec3, Vec3] {
  const corner = (offset: number): Vec3 => {
    const vertex = mesh.indices[triangle * 3 + offset] * 3;
    return [mesh.positions[vertex], mesh.positions[vertex + 1], mesh.positions[vertex + 2]];
  };
  return [corner(0), corner(1), corner(2)];
}

function centroidOf(points: Vec3[]): Vec3 {
  return [
    (points[0][0] + points[1][0] + points[2][0]) / 3,
    (points[0][1] + points[1][1] + points[2][1]) / 3,
    (points[0][2] + points[1][2] + points[2][2]) / 3,
  ];
}

function highlight(mesh: Mesh, triangle: number): Mesh {
  const points = trianglePoints(mesh, triangle);
  const positions = new Float32Array(9);
  points.forEach((point, index) => {
    positions[index * 3] = point[0];
    positions[index * 3 + 1] = point[1];
    positions[index * 3 + 2] = point[2];
  });
  return { positions, indices: new Uint32Array([0, 1, 2]) };
}

function nearestSources(points: Vec3[], sources: { name: string; kind: string; positions: Float32Array }[]) {
  const hits: { name: string; kind: string; distance: number }[] = [];
  for (const source of sources) {
    let distance = Infinity;
    for (const point of points) {
      for (let index = 0; index < source.positions.length; index += 3) {
        distance = Math.min(distance, Math.hypot(point[0] - source.positions[index], point[1] - source.positions[index + 1], point[2] - source.positions[index + 2]));
      }
    }
    if (distance <= 0.35) hits.push({ name: source.name, kind: source.kind, distance: round(distance) });
  }
  hits.sort((left, right) => left.distance - right.distance);
  return hits.slice(0, 4);
}

function pairCentroid(mesh: Mesh, triangle: number, other: number): Vec3 {
  const first = centroidOf(trianglePoints(mesh, triangle));
  const second = centroidOf(trianglePoints(mesh, other));
  return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2, (first[2] + second[2]) / 2];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cachePath = path.join(OUT, "pair-checks.json");
  if (!existsSync(cachePath)) copyFileSync(path.join(V2, "pair-checks.json"), cachePath);
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath });
  const overnight = JSON.parse(readFileSync(path.join(OVERNIGHT, "index.json"), "utf8")) as { records: ClusterRecord[] };
  const v2 = JSON.parse(readFileSync(path.join(V2, "graph-plan-poses.json"), "utf8")) as { plans: { id: string; plan: string; sequence: { archetypeId: string; pose: ClusterRecord["tiles"][number]["pose"] }[] }[] };
  const priorKey = (id: string) => {
    const plan = v2.plans.find((item) => item.id === id)!;
    return placementKey(plan.sequence.map((tile, index) => ({ archetypeId: tile.archetypeId, pose: tile.pose, instanceId: `t${index}` } as ClusterRecord["tiles"][number])));
  };
  const chain = overnight.records.find((record) => record.id === "on-graph-branching-7")!;
  const six = JSON.parse(readFileSync(path.join(V2, "graph-six-tile.json"), "utf8")) as { assemblies: { id: string; shape: { branching: number; branchPoints: number }; sixTileAlternative: string }[] };

  console.log("warm cache, then wide fan");
  const previous = JSON.parse(readFileSync(path.join(OUT, "graph-budget-420.json"), "utf8")) as { plans: Record<string, unknown>[] };
  const widening = previous.plans.find((plan) => plan.name === "widening");
  const board = createBoard(meshes);
  runPlan(board, pool, "paired generations", PRIOR_ALLOWANCE, null);
  const warmed = runPlan(board, pool, "widening", PRIOR_ALLOWANCE, priorKey("graph-branching-7-alt2"));
  console.log("warmed widening", warmed.tiles, warmed.matchesPriorSix ? "matches 210" : "210 placement differs");
  const wide = runPlan(board, pool, "wide fan", ALLOWANCE, priorKey("graph-branching-7-alt1"));
  console.log("wide fan", wide.tiles, wide.stop, `${wide.milliseconds}ms`, wide.matchesPriorSix ? "matches 210" : "210 placement differs");
  const plans = [wide];
  const outcomes = [];
  for (const plan of plans) {
    console.log(plan.name, plan.tiles, plan.stop, `${plan.milliseconds}ms`, plan.matchesPriorSix ? "matches 210" : "210 placement differs");
    const id = `graph-branching-7-${plan.name === "wide fan" ? "wide-fan" : "widening"}-420`;
    let assemblyNote: Record<string, unknown> | null = null;
    if (plan.seventhTile || !plan.matchesPriorSix) {
      const record = createBoard(meshes).record(id, 101, plan.placement, "accepted", plan.stopNote, SKILL6_GRAPH_ALGORITHM, searchStats(plan.tests, plan.tiles, plan.milliseconds, plan.stop, plan.stopNote));
      console.log("assemble", id);
      const built = await assembleCluster(record, meshes, `data/skill6/process-archive/diagnostics/troubleshooting-v3/${id}.mesh.json`);
      record.assembly = built.assembly;
      const reasons = validate(record, built.assembly, plan.tiles);
      writeFileSync(path.join(OUT, `${id}.mesh.json`), JSON.stringify({ id, provenance: "Reproduced search with a 420-test allowance. Not the stored overnight winner.", raw: built.meshes.raw ? encode(built.meshes.raw) : null, refined: built.meshes.refined ? encode(built.meshes.refined) : null, patches: built.meshes.patches.map((mesh) => encode(mesh)) }));
      draw(record, meshes, built.meshes.refined, id);
      const shape = shapeSummary(readShape(record.tiles, record.contacts, byId));
      assemblyNote = {
        id,
        provenance: "reproduced search",
        sevenTileStatus: plan.seventhTile ? (reasons.length === 0 ? "validated" : "failed") : "incomplete",
        validationReasons: reasons,
        shape,
        growth: built.assembly.growth,
        graph: built.assembly.graph,
        refined: { penetrations: built.assembly.refined.parameters.penetrations, maxPenetration: built.assembly.refined.parameters.maxPenetration },
        samePlacementAsStoredChain: placementKey(record.tiles) === placementKey(chain.tiles),
      };
    }
    outcomes.push({
      name: plan.name,
      allowance: plan.allowance,
      tests: plan.tests,
      milliseconds: plan.milliseconds,
      stop: plan.stop,
      seventhTile: plan.seventhTile,
      tiles: plan.tiles,
      deviations: plan.deviations,
      backtracks: plan.backtracks,
      stopNote: plan.stopNote,
      lastContactRejection: plan.lastContactRejection,
      matchesPlacementAt210: plan.matchesPriorSix,
      at210: plan.at210,
      samePlacementAsStoredChain: placementKey(plan.placement.tiles) === placementKey(chain.tiles),
      distinctPlacements: plan.placements.length,
      placements: plan.placements,
      rejectionCounts: plan.rejectionCounts,
      rejectionRuns: plan.rejectionRuns,
      assembly: assemblyNote,
      reusedMesh: assemblyNote ? null : `troubleshooting-v2 graph-branching-7-${plan.name === "wide fan" ? "alt1" : "alt2"}`,
    });
  }
  writeFileSync(path.join(OUT, "graph-budget-420.json"), JSON.stringify({
    provenance: "Reproduced Graph search for widening and wide fan only. Each allowance is 420 tests. The default 210 share and the stored chain are unchanged. The placement at 210 tests is checked against troubleshooting-v2.",
    comparedWith: {
      chain: { id: "on-graph-branching-7", tiles: chain.tiles.length, branching: chain.metrics ? undefined : undefined },
      sixTile: six.assemblies.map((item) => ({ id: item.id, sixTileAlternative: item.sixTileAlternative, branching: item.shape.branching, branchPoints: item.shape.branchPoints })),
    },
    plans: [widening, ...outcomes],
    cache: "Wide fan was run after paired generations and widening had each used 210 tests on the same board. That is the cache the original budget split leaves behind. Widening was not repeated.",
  }, null, 2));

  console.log("rule crossings");
  const rule = overnight.records.find((record) => record.id === "on-rule-branching-4")!;
  const storedMesh = JSON.parse(readFileSync(path.join(OVERNIGHT, "on-rule-branching-4.mesh.json"), "utf8")) as { raw: { positions: string; indices: string }; refined: { positions: string; indices: string }; patches: { positions: string; indices: string }[] };
  const raw = decode(storedMesh.raw)!;
  const refined = decode(storedMesh.refined)!;
  const sameIndices = raw.indices.length === refined.indices.length && raw.indices.every((value, index) => value === refined.indices[index]);
  const report = crossingReport(refined);
  const surviving = report.pairs.filter((pair) => pair.depth > SKILL6_PARAMETERS.maxPenetration).sort((left, right) => right.depth - left.depth);
  const lift = rule.assembly?.ground.lift ?? 0;
  const seated = new Map((rule.assembly?.seatedTiles ?? []).map((tile) => [tile.instanceId, tile.pose]));
  const sources = rule.tiles.map((tile) => ({
    name: `${tile.instanceId} ${tile.archetypeId}`,
    kind: "tile",
    positions: poseMesh(byId.get(tile.archetypeId)!, seated.get(tile.instanceId) ?? tile.pose).positions,
  }));
  storedMesh.patches.forEach((encoded, index) => {
    const mesh = decode(encoded);
    if (mesh) sources.push({ name: `patch ${index}`, kind: "patch", positions: mesh.positions });
  });
  const samples = rule.contacts.flatMap((contact) => contact.samples.map((sample) => ({
    id: `${contact.hostId}-${contact.guestId}`,
    host: contact.hostId,
    guest: contact.guestId,
    point: [sample.host[0], sample.host[1], sample.host[2] + lift] as Vec3,
  })));
  const traced = surviving.map((pair, index) => {
    const refinedPoints = trianglePoints(refined, pair.triangle);
    const refinedOther = trianglePoints(refined, pair.other);
    const rawTriangle = sameIndices ? pair.triangle : -1;
    const rawOther = sameIndices ? pair.other : -1;
    const rawDepth = sameIndices ? crossingPenetration(...trianglePoints(raw, rawTriangle), ...trianglePoints(raw, rawOther)) : null;
    const moved = sameIndices ? Math.hypot(...centroidOf(refinedPoints).map((value, axis) => value - centroidOf(trianglePoints(raw, rawTriangle))[axis]) as [number, number, number]) : null;
    const center = pairCentroid(refined, pair.triangle, pair.other);
    let nearestRaw = Infinity;
    let nearestRawDepth = 0;
    let withinShift = 0;
    let maxWithinShift = 0;
    for (const rawPair of crossingReport(raw).pairs) {
      const point = pairCentroid(raw, rawPair.triangle, rawPair.other);
      const distance = Math.hypot(center[0] - point[0], center[1] - point[1], center[2] - point[2]);
      if (distance < nearestRaw) {
        nearestRaw = distance;
        nearestRawDepth = rawPair.depth;
      }
      if (distance <= 1) {
        withinShift += 1;
        maxWithinShift = Math.max(maxWithinShift, rawPair.depth);
      }
    }
    let nearest = samples[0];
    let nearestDistance = Infinity;
    for (const sample of samples) {
      const distance = Math.hypot(center[0] - sample.point[0], center[1] - sample.point[1], center[2] - sample.point[2]);
      if (distance < nearestDistance) {
        nearest = sample;
        nearestDistance = distance;
      }
    }
    const firstSources = nearestSources(sameIndices ? trianglePoints(raw, rawTriangle) : refinedPoints, sources);
    const secondSources = nearestSources(sameIndices ? trianglePoints(raw, rawOther) : refinedOther, sources);
    return {
      index,
      depth: round(pair.depth),
      triangles: [pair.triangle, pair.other],
      centroid: center.map((value) => round(value, 2)),
      indexIdentity: sameIndices,
      rawDepth: rawDepth == null ? null : round(rawDepth),
      existedBeforeRefinement: withinShift > 0,
      aroseDuringRefinement: withinShift === 0,
      nearestRawPenetration: { distance: round(nearestRaw), depth: round(nearestRawDepth), within1: withinShift, maxDepthWithin1: round(maxWithinShift) },
      centroidMove: moved == null ? null : round(moved),
      nearestContact: nearest ? { id: nearest.id, host: nearest.host, guest: nearest.guest, distance: round(nearestDistance) } : null,
      sources: { first: firstSources, second: secondSources },
    };
  });
  const colors: [number, number, number][] = [[73, 215, 222], [199, 126, 95]];
  const extra = traced.flatMap((pair, index) => [pair.triangles[0], pair.triangles[1]].map((triangle) => ({ ...highlight(refined, triangle), color: colors[index] ?? colors[0] })));
  draw(rule, meshes, refined, "on-rule-branching-4-crossings", extra);

  const successes = ["on-rule-compact-5", "on-rule-branching-5", "on-graph-branching-5", "on-wfc-branching-5"]
    .map((id) => overnight.records.find((record) => record.id === id))
    .filter((record): record is ClusterRecord => Boolean(record));
  const compared = [];
  for (const record of successes) {
    const file = path.join(OVERNIGHT, `${record.id}.mesh.json`);
    if (!existsSync(file)) continue;
    const mesh = decode(JSON.parse(readFileSync(file, "utf8")).refined);
    if (!mesh) continue;
    const local = crossingReport(mesh, 0);
    const regions = traced.map((pair) => {
      const contact = record.contacts.find((item) => {
        const host = record.tiles.find((tile) => tile.instanceId === item.hostId);
        const guest = record.tiles.find((tile) => tile.instanceId === item.guestId);
        const sourceHost = rule.tiles.find((tile) => tile.instanceId === pair.nearestContact?.host);
        const sourceGuest = rule.tiles.find((tile) => tile.instanceId === pair.nearestContact?.guest);
        return host?.archetypeId === sourceHost?.archetypeId && guest?.archetypeId === sourceGuest?.archetypeId;
      });
      return {
        defect: pair.depth,
        sameArchetypePair: Boolean(contact),
        contactArea: contact ? round(contact.contactArea, 2) : null,
        rigidCrossing: contact ? round(contact.deepestCrossing) : null,
      };
    });
    const maxNear = local.pairs.reduce((max, pair) => Math.max(max, pair.depth), 0);
    compared.push({
      id: record.id,
      validated: record.status === "accepted",
      refinedPenetrations: record.assembly?.refined.parameters.penetrations ?? null,
      refinedMax: record.assembly?.refined.parameters.maxPenetration ?? null,
      measuredMaxPositiveDepth: round(maxNear),
      archetypePair: regions,
    });
  }
  const tileUnion = await unionSolids(rule.tiles.map((tile) => posedPatch(byId.get(tile.archetypeId)!, tile.pose)));
  const liftedTiles = tileUnion.mesh ? liftMesh(tileUnion.mesh, lift) : null;
  const tileReport = liftedTiles ? crossingReport(liftedTiles) : null;
  writeFileSync(path.join(OUT, "rule-crossing-trace.json"), JSON.stringify({
    provenance: "Original stored mesh and stored poses of on-rule-branching-4. Triangle sources are matched from those poses and the stored patch meshes. The tiles-only union is a reconstruction.",
    id: "on-rule-branching-4",
    sameTriangleIndices: sameIndices,
    rawTriangles: raw.indices.length / 3,
    refinedTriangles: refined.indices.length / 3,
    refinedPenetrations: report.penetrations,
    refinedMax: round(report.maxPenetration),
    pairs: traced,
    tilesOnlyReconstruction: tileReport ? { penetrations: tileReport.penetrations, maxPenetration: round(tileReport.maxPenetration) } : null,
    successfulComparison: compared,
  }, null, 2));
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
    id: "troubleshooting-v3",
    prior: "data/skill6/process-archive/diagnostics/troubleshooting-v2",
    graph: "graph-budget-420.json",
    rule: "rule-crossing-trace.json",
    unchanged: ["ranking", "thresholds", "default budgets", "refinement", "on-graph-branching-7"],
  }, null, 2));
  console.log("troubleshooting v3 done");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
