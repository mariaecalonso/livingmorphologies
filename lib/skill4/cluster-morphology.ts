import type { IsoMesh } from "@/lib/scan/isomesh";
import { analyzeClusterVoid } from "./cluster-void";
import { rankCompatibleFaces } from "./cluster-face-pair";
import type { TileConnection } from "./connections";
import { MORPHOLOGY_PASS, MORPHOLOGY_WEIGHTS, SHAPE_GATES, programMorphologyProfile, type MorphologyProfile } from "./program-morphology";
import { envelopeWidth, type TileInstance } from "./tiles";

export const ONE_MODULE_DEEP_CHAIN = "ONE_MODULE_DEEP_CHAIN";
export const PLAN_SPREAD_TOO_LOW = "PLAN_SPREAD_TOO_LOW";
export const DOMINANT_SPINE = "DOMINANT_SPINE";
export const NO_MEANINGFUL_VOID_DEFINITION = "NO_MEANINGFUL_VOID_DEFINITION";

export type MorphologyReport = {
  score: number;
  pass: boolean;
  flags: string[];
  reasons: string[];
  width: number;
  depth: number;
  height: number;
  verticalLevels: number;
  branchNodes: number;
  meaningfulBranches: number;
  directions: number;
  voidDefinition: number;
  enclosureDirections: number;
  planSpread: number;
  longestPath: number;
  spineShare: number;
  linearity: number;
  enclosure: number;
  direction: number;
  branching: number;
  /** Plan-spread points. Kept so a placement bias can read the same field. */
  compactness: number;
  vertical: number;
  program: number;
};

type Vec3 = { x: number; y: number; z: number };

const LEVEL_BAND = 0.55;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dot(left: Vec3, right: Vec3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function range(values: readonly number[]) {
  if (values.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

function neighborsOf(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  const neighbors = new Map<string, string[]>(tiles.map((tile) => [tile.instanceId, []]));
  for (const connection of connections) {
    neighbors.get(connection.tileAId)?.push(connection.tileBId);
    neighbors.get(connection.tileBId)?.push(connection.tileAId);
  }
  return neighbors;
}

export function tileDegrees(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  const degree = new Map(tiles.map((tile) => [tile.instanceId, 0]));
  for (const connection of connections) {
    degree.set(connection.tileAId, (degree.get(connection.tileAId) ?? 0) + 1);
    degree.set(connection.tileBId, (degree.get(connection.tileBId) ?? 0) + 1);
  }
  return degree;
}

/** Edges oriented outward from the first tile, so a chain has one direction and a turn has two. */
function outwardDirections(tiles: readonly TileInstance[], connections: readonly TileConnection[]): Vec3[] {
  if (tiles.length === 0) return [];
  const at = new Map(tiles.map((tile) => [tile.instanceId, tile.transform]));
  const neighbors = neighborsOf(tiles, connections);
  const root = [...tiles].sort((left, right) => (left.instanceId < right.instanceId ? -1 : 1))[0];
  const seen = new Set<string>([root.instanceId]);
  const queue = [root.instanceId];
  const vectors: Vec3[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const origin = at.get(id);
    if (!origin) continue;
    for (const next of neighbors.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
      const point = at.get(next);
      if (!point) continue;
      const vector = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
      const span = length(vector);
      if (span < 1e-3) continue;
      vectors.push({ x: vector.x / span, y: vector.y / span, z: vector.z / span });
    }
  }
  return vectors;
}

function countDirections(vectors: readonly Vec3[]) {
  const bins: Vec3[] = [];
  for (const vector of vectors) {
    if (!bins.some((bin) => dot(bin, vector) > 0.62)) bins.push(vector);
  }
  return bins.length;
}

function verticalAvailable(tiles: readonly TileInstance[]) {
  const ids = [...new Set(tiles.map((tile) => tile.archetypeId))];
  for (const left of ids) {
    for (const right of ids) {
      for (const pair of rankCompatibleFaces(left, right)) {
        if (pair.faceA === "T" || pair.faceA === "B" || pair.faceB === "T" || pair.faceB === "B") return true;
      }
    }
  }
  return false;
}

/** Smaller plan principal axis divided by the larger. Plan is X and Z. */
export function planSpreadOf(tiles: readonly TileInstance[]) {
  if (tiles.length < 2) return 1;
  let mx = 0;
  let mz = 0;
  for (const tile of tiles) {
    mx += tile.transform.x;
    mz += tile.transform.z;
  }
  mx /= tiles.length;
  mz /= tiles.length;
  let cxx = 0;
  let czz = 0;
  let cxz = 0;
  for (const tile of tiles) {
    const dx = tile.transform.x - mx;
    const dz = tile.transform.z - mz;
    cxx += dx * dx;
    czz += dz * dz;
    cxz += dx * dz;
  }
  const trace = cxx + czz;
  const gap = Math.sqrt(Math.max(0, (cxx - czz) * (cxx - czz) + 4 * cxz * cxz));
  const major = (trace + gap) / 2;
  const minor = (trace - gap) / 2;
  if (major <= 1e-6) return 1;
  return clamp(Math.sqrt(Math.max(0, minor) / major), 0, 1);
}

function longestPath(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  const neighbors = neighborsOf(tiles, connections);
  let best: string[] = [];
  const visit = (id: string, path: string[], seen: Set<string>) => {
    if (path.length > best.length) best = path.slice();
    for (const next of neighbors.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      path.push(next);
      visit(next, path, seen);
      path.pop();
      seen.delete(next);
    }
  };
  for (const tile of tiles) visit(tile.instanceId, [tile.instanceId], new Set([tile.instanceId]));
  return best;
}

function branchReading(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  const path = longestPath(tiles, connections);
  const onPath = new Set(path);
  const neighbors = neighborsOf(tiles, connections);
  const at = new Map(tiles.map((tile) => [tile.instanceId, tile.transform]));
  let mx = 0;
  let mz = 0;
  for (const id of path) {
    const point = at.get(id);
    if (!point) continue;
    mx += point.x;
    mz += point.z;
  }
  const count = Math.max(1, path.length);
  mx /= count;
  mz /= count;
  let cxx = 0;
  let czz = 0;
  let cxz = 0;
  for (const id of path) {
    const point = at.get(id);
    if (!point) continue;
    const dx = point.x - mx;
    const dz = point.z - mz;
    cxx += dx * dx;
    czz += dz * dz;
    cxz += dx * dz;
  }
  const angle = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const axis = { x: Math.cos(angle), z: Math.sin(angle) };
  let meaningful = 0;
  let maxDepth = 0;
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (onPath.has(tile.instanceId) || seen.has(tile.instanceId)) continue;
    const queue = [tile.instanceId];
    seen.add(tile.instanceId);
    let depth = 0;
    let lateral = 0;
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      const point = at.get(id);
      if (point) {
        const steps = graphDistance(id, onPath, neighbors);
        if (steps > depth) depth = steps;
        const dx = point.x - mx;
        const dz = point.z - mz;
        const along = dx * axis.x + dz * axis.z;
        const side = Math.hypot(dx - along * axis.x, dz - along * axis.z);
        if (side > lateral) lateral = side;
      }
      for (const next of neighbors.get(id) ?? []) {
        if (onPath.has(next) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (depth > maxDepth) maxDepth = depth;
    if (depth >= 2 || lateral >= envelopeWidth() * 0.75) meaningful += 1;
  }
  return {
    path,
    longestPath: path.length,
    spineShare: tiles.length === 0 ? 0 : path.length / tiles.length,
    maxDepth,
    meaningful,
  };
}

function graphDistance(id: string, targets: ReadonlySet<string>, neighbors: ReadonlyMap<string, string[]>) {
  const queue = [id];
  const dist = new Map([[id, 0]]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const steps = dist.get(current) ?? 0;
    for (const next of neighbors.get(current) ?? []) {
      if (dist.has(next)) continue;
      if (targets.has(next)) return steps + 1;
      dist.set(next, steps + 1);
      queue.push(next);
    }
  }
  return 0;
}

export function spineEndIds(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  const path = longestPath(tiles, connections);
  if (path.length < 2) return new Set<string>();
  return new Set([path[0], path[path.length - 1]]);
}

/** How many plan half-axes already hold a tile around the center. Used while a cluster is still growing. */
function approachSides(tiles: readonly TileInstance[]) {
  if (tiles.length === 0) return 0;
  let x = 0;
  let z = 0;
  for (const tile of tiles) {
    x += tile.transform.x;
    z += tile.transform.z;
  }
  x /= tiles.length;
  z /= tiles.length;
  const margin = envelopeWidth() * 0.2;
  let sides = 0;
  for (const [axis, origin] of [["x", x], ["z", z]] as const) {
    let positive = false;
    let negative = false;
    for (const tile of tiles) {
      const delta = tile.transform[axis] - origin;
      if (delta > margin) positive = true;
      if (delta < -margin) negative = true;
    }
    if (positive) sides += 1;
    if (negative) sides += 1;
  }
  return sides;
}

function verticalLevelsOf(tiles: readonly TileInstance[]) {
  const band = envelopeWidth() * LEVEL_BAND;
  return new Set(tiles.map((tile) => Math.round(tile.transform.y / band))).size;
}

function markSolid(solids: readonly IsoMesh[]) {
  const cell = envelopeWidth() * 0.4;
  const occupied = new Set<string>();
  const mark = (x: number, y: number, z: number) => {
    occupied.add(`${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`);
  };
  for (const mesh of solids) {
    const index = mesh.indices;
    const position = mesh.positions;
    const step = Math.max(1, Math.floor(index.length / 3 / 14000));
    for (let triangle = 0; triangle < index.length; triangle += 3 * step) {
      const ia = index[triangle] * 3;
      const ib = index[triangle + 1] * 3;
      const ic = index[triangle + 2] * 3;
      if (ia == null || ib == null || ic == null) continue;
      const ax = position[ia] ?? 0;
      const ay = position[ia + 1] ?? 0;
      const az = position[ia + 2] ?? 0;
      const bx = position[ib] ?? 0;
      const by = position[ib + 1] ?? 0;
      const bz = position[ib + 2] ?? 0;
      const cx = position[ic] ?? 0;
      const cy = position[ic + 1] ?? 0;
      const cz = position[ic + 2] ?? 0;
      mark(ax, ay, az);
      mark(bx, by, bz);
      mark(cx, cy, cz);
      mark((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3);
    }
  }
  return { occupied, cell };
}

function walkHits(origin: Vec3, direction: Vec3, occupied: ReadonlySet<string>, cell: number) {
  const reach = envelopeWidth() * 2.4;
  const steps = Math.ceil(reach / cell);
  for (let step = 2; step <= steps; step += 1) {
    const x = origin.x + direction.x * cell * step;
    const y = origin.y + direction.y * cell * step;
    const z = origin.z + direction.z * cell * step;
    if (occupied.has(`${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`)) return true;
  }
  return false;
}

/** Plan directions, and whether any sampled void region has a solid above or below it. */
function multiSideEnclosure(mesh: IsoMesh, solids: readonly IsoMesh[]) {
  const { occupied, cell } = markSolid(solids);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const count = Math.max(1, mesh.positions.length / 3);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    cx += mesh.positions[index] ?? 0;
    cy += mesh.positions[index + 1] ?? 0;
    cz += mesh.positions[index + 2] ?? 0;
  }
  const centroid = { x: cx / count, y: cy / count, z: cz / count };
  const plan = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ];
  const vertical = [
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
  ];
  let best = 0;
  let verticalHit = false;
  const stride = Math.max(1, Math.floor(count / 28));
  for (let index = 0; index < mesh.positions.length; index += 3 * stride) {
    const sample = {
      x: (mesh.positions[index] ?? 0) * 0.72 + centroid.x * 0.28,
      y: (mesh.positions[index + 1] ?? 0) * 0.72 + centroid.y * 0.28,
      z: (mesh.positions[index + 2] ?? 0) * 0.72 + centroid.z * 0.28,
    };
    let hits = 0;
    for (const direction of plan) if (walkHits(sample, direction, occupied, cell)) hits += 1;
    if (hits > best) best = hits;
    if (!verticalHit) {
      for (const direction of vertical) {
        if (walkHits(sample, direction, occupied, cell)) verticalHit = true;
      }
    }
  }
  return { directions: best, vertical: verticalHit };
}

/**
 * Organization of one cluster. Hard shape gates run before the score.
 * Pass the tile and hybrid meshes after shrinkwrap so the void is the room between solids.
 */
export function evaluateClusterMorphology(
  tiles: readonly TileInstance[],
  connections: readonly TileConnection[],
  programId: string,
  solids: readonly IsoMesh[] | null = null,
): MorphologyReport {
  const profile = programMorphologyProfile(programId);
  const module = envelopeWidth();
  const width = range(tiles.map((tile) => tile.transform.x)) + module;
  const depth = range(tiles.map((tile) => tile.transform.z)) + module;
  const height = range(tiles.map((tile) => tile.transform.y)) + module;
  const major = Math.max(width, depth, height);
  const other = width + depth + height - major;
  const linearity = other <= 1 ? major : major / other;
  const degree = tileDegrees(tiles, connections);
  const branchNodes = [...degree.values()].filter((count) => count >= 3).length;
  const directions = countDirections(outwardDirections(tiles, connections));
  const verticalLevels = verticalLevelsOf(tiles);
  const canStack = verticalAvailable(tiles);
  const planSpread = planSpreadOf(tiles);
  const branches = branchReading(tiles, connections);
  const planMinor = Math.min(width, depth);
  const planMajor = Math.max(width, depth);
  const oneModule = tiles.length >= 4
    && planMinor <= module * SHAPE_GATES.oneModuleDepth
    && planMajor >= planMinor * SHAPE_GATES.oneModuleLongFactor;
  const sectionHeld = verticalLevels >= 2 && approachSides(tiles) >= 2;
  const spreadWaived = profile.narrowIfSection && sectionHeld && !oneModule;
  let enclosureDirections = approachSides(tiles);
  let verticalEnclosure = false;
  let voidMesh = false;
  if (solids && solids.length > 0 && tiles.length >= 2) {
    const report = analyzeClusterVoid(tiles, connections, solids);
    voidMesh = Boolean(report.mesh && report.mesh.triangles > 4);
    if (voidMesh && report.mesh) {
      const surround = multiSideEnclosure(report.mesh, solids);
      enclosureDirections = surround.directions;
      verticalEnclosure = surround.vertical;
    } else {
      enclosureDirections = 0;
    }
  }
  const flags: string[] = [];
  const reasons: string[] = [];
  if (oneModule) {
    flags.push(ONE_MODULE_DEEP_CHAIN);
    reasons.push("One plan dimension stays about one module deep while the other runs long. Height does not repair that.");
  }
  if (tiles.length >= 4 && planSpread < profile.minPlanSpread && !spreadWaived) {
    flags.push(PLAN_SPREAD_TOO_LOW);
    reasons.push("The tile centers still sit close to one line in plan.");
  }
  const stubSpine = branches.maxDepth <= SHAPE_GATES.shallowBranchDepth
    && tiles.length - branches.longestPath <= Math.max(1, Math.floor(tiles.length * 0.34));
  if (tiles.length >= 4 && stubSpine && (branches.spineShare >= SHAPE_GATES.spineShare || planSpread < profile.minPlanSpread)) {
    flags.push(DOMINANT_SPINE);
    reasons.push("Most tiles sit on one path, and the side branches are only one tile deep.");
  }
  const enclosed = voidMesh && enclosureDirections >= profile.minEnclosureDirections;
  if (solids && tiles.length >= 4 && !enclosed) {
    flags.push(NO_MEANINGFUL_VOID_DEFINITION);
    reasons.push("The habitable void is not held by solids from enough plan directions.");
  }
  const enclosurePoints = MORPHOLOGY_WEIGHTS.enclosure * clamp(enclosureDirections / 4 + (verticalEnclosure ? 0.12 : 0), 0, 1);
  const spreadPoints = MORPHOLOGY_WEIGHTS.planSpread * clamp((planSpread - 0.12) / 0.68, 0, 1);
  const branchPoints = MORPHOLOGY_WEIGHTS.branching * clamp(branches.meaningful / Math.max(1, profile.minMeaningfulBranches), 0, 1);
  const directionPoints = MORPHOLOGY_WEIGHTS.direction * clamp((directions - 1) / Math.max(1, profile.minDirections - 1), 0, 1);
  const wantedLevels = profile.vertical === "strong" || profile.vertical === "moderate" ? 2 : 1;
  const heightFit = profile.vertical === "limited"
    ? (verticalLevels <= 2 ? 1 : 0.55)
    : clamp(verticalLevels / wantedLevels, 0, 1);
  const verticalPoints = canStack || profile.vertical === "limited"
    ? MORPHOLOGY_WEIGHTS.vertical * heightFit
    : MORPHOLOGY_WEIGHTS.vertical * 0.45;
  const meetsDirections = directions >= Math.min(profile.minDirections, Math.max(1, tiles.length - 1));
  const meetsHeight = profile.minLevels <= 1 || verticalLevels >= profile.minLevels || !canStack;
  const meetsBranch = branches.meaningful >= Math.min(profile.minMeaningfulBranches, 1);
  const meetsEnclosure = !solids || enclosed;
  const fitCount = [meetsDirections, meetsHeight, meetsBranch, meetsEnclosure].filter(Boolean).length;
  const programPoints = MORPHOLOGY_WEIGHTS.program * (fitCount / 4);
  const scored = flags.length === 0;
  const score = scored
    ? Math.round(enclosurePoints + spreadPoints + branchPoints + directionPoints + verticalPoints + programPoints)
    : 0;
  return {
    score,
    pass: scored && (solids ? score >= MORPHOLOGY_PASS && enclosed : true),
    flags,
    reasons,
    width: Math.round(width),
    depth: Math.round(depth),
    height: Math.round(height),
    verticalLevels,
    branchNodes,
    meaningfulBranches: branches.meaningful,
    directions,
    voidDefinition: Math.round(enclosurePoints),
    enclosureDirections: solids ? enclosureDirections : approachSides(tiles),
    planSpread: Number(planSpread.toFixed(2)),
    longestPath: branches.longestPath,
    spineShare: Number(branches.spineShare.toFixed(2)),
    linearity: Number(linearity.toFixed(2)),
    enclosure: enclosurePoints,
    direction: directionPoints,
    branching: branchPoints,
    compactness: spreadPoints,
    vertical: verticalPoints,
    program: programPoints,
  };
}

/** Preference for one completed attachment. Spine ends and one-module extensions are penalized. */
export function placementBias(
  beforeTiles: readonly TileInstance[],
  beforeConnections: readonly TileConnection[],
  afterTiles: readonly TileInstance[],
  afterConnections: readonly TileConnection[],
  profile: MorphologyProfile,
) {
  const before = tileDegrees(beforeTiles, beforeConnections);
  const after = tileDegrees(afterTiles, afterConnections);
  let hostId = "";
  let hostDegree = 0;
  for (const [id, count] of after) {
    const prior = before.get(id);
    if (prior != null && count > prior) {
      hostId = id;
      hostDegree = prior;
    }
  }
  const beforeOrg = evaluateClusterMorphology(beforeTiles, beforeConnections, profile.programId);
  const afterOrg = evaluateClusterMorphology(afterTiles, afterConnections, profile.programId);
  const module = envelopeWidth();
  let bias = 0.12 + afterOrg.planSpread + afterOrg.branching / MORPHOLOGY_WEIGHTS.branching + afterOrg.vertical / MORPHOLOGY_WEIGHTS.vertical;
  const beforeMinor = Math.min(beforeOrg.width, beforeOrg.depth);
  const afterMinor = Math.min(afterOrg.width, afterOrg.depth);
  const beforeMajor = Math.max(beforeOrg.width, beforeOrg.depth);
  const afterMajor = Math.max(afterOrg.width, afterOrg.depth);
  if (afterMinor <= module * SHAPE_GATES.oneModuleDepth && afterMajor > beforeMajor + 1) bias *= 0.12;
  if (afterOrg.planSpread > beforeOrg.planSpread + 0.04 || afterMinor > beforeMinor + module * 0.2) bias *= 1.65;
  if (afterOrg.meaningfulBranches > beforeOrg.meaningfulBranches) bias *= 1.45;
  if (afterOrg.enclosureDirections > beforeOrg.enclosureDirections) bias *= 1.3;
  if (spineEndIds(beforeTiles, beforeConnections).has(hostId)) bias *= 0.28;
  if (hostDegree <= 1 && beforeTiles.length >= 3) bias *= 0.4;
  if (hostDegree >= 2) bias *= 1.45;
  if (profile.vertical === "strong") {
    const beforeHeight = range(beforeTiles.map((tile) => tile.transform.y));
    const afterHeight = range(afterTiles.map((tile) => tile.transform.y));
    if (afterHeight > beforeHeight + module * 0.35) bias *= 1.25;
  }
  return Math.max(0.04, bias);
}
