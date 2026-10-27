import type { IsoMesh } from "../scan/isomesh";
import type { Vec3 } from "./contract";

/**
 * The selected gray face is one surface, not a target point.
 * Routes travel on its triangles, avoid openings, and meet the hybrid terminal.
 * The hybrid mesh is not an input and is not changed.
 */
const COVERAGE_FLOOR = 0.42;

export type FaceCoverage = {
  totalArea: number;
  reachedArea: number;
  ratio: number;
  primary: number;
  secondary: number;
  tertiary: number;
  openings: number;
  openingsAvoided: number;
  boundaryRegions: number;
  boundaryReached: number;
  convergence: Vec3;
  terminalDistance: number;
  accepted: boolean;
  reason: string;
};

type Node = { local: Vec3; world: Vec3; normal: Vec3; edges: { to: number; length: number }[] };

export function faceAttachmentField(
  coat: IsoMesh,
  place: (point: Vec3) => Vec3,
  terminal: Vec3,
): { mesh: IsoMesh; report: FaceCoverage } {
  const empty = emptyMesh();
  const blank = blankReport(terminal);
  const count = coat.positions.length / 3;
  if (count < 3 || coat.indices.length < 3) return { mesh: empty, report: blank };
  const nodes = buildNodes(coat, place);
  const loops = boundaryLoops(coat.indices, nodes);
  const outer = loops[0] ?? [];
  const outerSpan = loopLength(outer, nodes);
  const holes = loops.slice(1).filter((loop) => loopLength(loop, nodes) > outerSpan * 0.08);
  const diagonal = faceDiagonal(nodes);
  const separation = Math.max(diagonal * 0.08, 1e-3);
  const seeds = pickSeeds(nodes, outer, holes, separation);
  const source = nearestVertex(nodes, terminal);
  const tree = shortestTree(nodes, source);
  const first = routesFrom(seeds, tree);
  const area = surfaceArea(coat, place);
  let kept = pruneRoutes(first, diagonal);
  let tertiary = localLinks(nodes, seeds, kept, diagonal);
  let coverage = measureCoverage(coat, place, segmentsOf(nodes, kept, tertiary), area, diagonal);
  if (coverage.ratio < COVERAGE_FLOOR) {
    const extra = uncoveredSeeds(coat, place, nodes, coverage.near, seeds, separation);
    const more = pruneRoutes(routesFrom(extra, tree), diagonal);
    kept = pruneRoutes([...kept, ...more], diagonal);
    tertiary = localLinks(nodes, [...seeds, ...extra], kept, diagonal);
    coverage = measureCoverage(coat, place, segmentsOf(nodes, kept, tertiary), area, diagonal);
  }
  const ordered = [...kept].sort((left, right) => right.distance - left.distance);
  const primaryCount = ordered.length === 0 ? 0 : Math.max(1, Math.ceil(ordered.length * 0.4));
  const primary = new Set(ordered.slice(0, primaryCount));
  const routeVertices = new Set(ordered.flatMap((route) => route.vertices));
  const openingsAvoided = holes.filter((loop) => loop.some((index) => routeVertices.has(index) || coverage.reachedVertices.has(index))).length;
  const scale = Math.sqrt(Math.max(area, 1e-4));
  const ribbons: IsoMesh[] = [];
  for (const route of ordered) {
    ribbons.push(routeRibbon(nodes, route.vertices, primary.has(route) ? scale * 0.012 : scale * 0.007));
  }
  for (const link of tertiary) ribbons.push(routeRibbon(nodes, link, scale * 0.004));
  const convergence = nodes[source].world;
  ribbons.push(stub(convergence, terminal, nodes[source].normal, scale * 0.012));
  const boundary = boundaryReach(outer, coverage.reachedVertices);
  const terminalDistance = length(sub(convergence, terminal));
  const accepted = coverage.ratio >= COVERAGE_FLOOR && ordered.length > 0;
  return {
    mesh: joinMeshes(ribbons),
    report: {
      totalArea: round(area),
      reachedArea: round(coverage.reachedArea),
      ratio: round(coverage.ratio),
      primary: primaryCount,
      secondary: Math.max(0, ordered.length - primaryCount),
      tertiary: tertiary.length,
      openings: holes.length,
      openingsAvoided,
      boundaryRegions: boundary.regions,
      boundaryReached: boundary.reached,
      convergence: roundVec(convergence),
      terminalDistance: round(terminalDistance),
      accepted,
      reason: accepted ? "" : "FAIL: INSUFFICIENT FACE COVERAGE",
    },
  };
}

function buildNodes(coat: IsoMesh, place: (point: Vec3) => Vec3) {
  const count = coat.positions.length / 3;
  const nodes: Node[] = [];
  for (let index = 0; index < count; index += 1) {
    const local = read(coat.positions, index);
    const normal = normalize(read(coat.normals, index));
    nodes.push({ local, world: place(local), normal, edges: [] });
  }
  const seen = new Set<string>();
  for (let index = 0; index < coat.indices.length; index += 3) {
    const corners = [coat.indices[index], coat.indices[index + 1], coat.indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge];
      const b = corners[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const span = length(sub(nodes[a].world, nodes[b].world));
      if (span < 1e-6) continue;
      nodes[a].edges.push({ to: b, length: span });
      nodes[b].edges.push({ to: a, length: span });
    }
  }
  return nodes;
}

function boundaryLoops(indices: Uint32Array, nodes: Node[]) {
  const uses = new Map<string, { a: number; b: number; count: number }>();
  for (let index = 0; index < indices.length; index += 3) {
    const corners = [indices[index], indices[index + 1], indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge];
      const b = corners[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const slot = uses.get(key) ?? { a, b, count: 0 };
      slot.count += 1;
      uses.set(key, slot);
    }
  }
  const neighbors = new Map<number, number[]>();
  for (const edge of uses.values()) {
    if (edge.count !== 1) continue;
    push(neighbors, edge.a, edge.b);
    push(neighbors, edge.b, edge.a);
  }
  const used = new Set<string>();
  const loops: number[][] = [];
  for (const start of neighbors.keys()) {
    const loop: number[] = [];
    let current = start;
    let previous = -1;
    while (neighbors.has(current)) {
      const next = (neighbors.get(current) ?? []).find((candidate) => (
        candidate !== previous && !used.has(`${Math.min(current, candidate)}:${Math.max(current, candidate)}`)
      ));
      if (next === undefined) break;
      used.add(`${Math.min(current, next)}:${Math.max(current, next)}`);
      loop.push(current);
      previous = current;
      current = next;
      if (current === start) break;
      if (loop.length > nodes.length) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops.sort((left, right) => loopLength(right, nodes) - loopLength(left, nodes));
}

function pickSeeds(nodes: Node[], outer: number[], holes: number[][], separation: number) {
  const seeds: number[] = [];
  const consider = (index: number) => {
    if (seeds.some((seed) => length(sub(nodes[seed].world, nodes[index].world)) < separation)) return;
    seeds.push(index);
  };
  const axes = principalAxes(nodes);
  for (const axis of axes) {
    let low = 0;
    let high = 0;
    let lowValue = Infinity;
    let highValue = -Infinity;
    for (let index = 0; index < nodes.length; index += 1) {
      const value = dot(nodes[index].world, axis);
      if (value < lowValue) {
        lowValue = value;
        low = index;
      }
      if (value > highValue) {
        highValue = value;
        high = index;
      }
    }
    consider(low);
    consider(high);
  }
  const curved = nodes.map((node, index) => ({ index, score: curvature(nodes, index) }))
    .sort((left, right) => right.score - left.score);
  for (const item of curved) {
    if (item.score < 0.08 || seeds.length >= 10) break;
    consider(item.index);
  }
  for (const corner of corners(outer, nodes)) consider(corner);
  for (const hole of holes) {
    if (hole.length === 0) continue;
    const center = centroid(hole.map((index) => nodes[index].world));
    let best = hole[0];
    let score = -Infinity;
    for (const index of hole) {
      const value = length(sub(nodes[index].world, center));
      if (value > score) {
        score = value;
        best = index;
      }
    }
    consider(best);
  }
  const bins = new Map<string, { index: number; area: number }>();
  for (let index = 0; index < nodes.length; index += 1) {
    const u = dot(nodes[index].world, axes[0]);
    const v = dot(nodes[index].world, axes[1]);
    const key = `${Math.round(u / separation)}:${Math.round(v / separation)}`;
    const slot = bins.get(key);
    if (!slot) bins.set(key, { index, area: 1 });
    else slot.area += 1;
  }
  const occupied = [...bins.values()].sort((left, right) => right.area - left.area);
  for (const bin of occupied.slice(0, 8)) consider(bin.index);
  return seeds.slice(0, 18);
}

function curvature(nodes: Node[], index: number) {
  const node = nodes[index];
  if (node.edges.length === 0) return 0;
  let sum = 0;
  for (const edge of node.edges) sum += 1 - dot(node.normal, nodes[edge.to].normal);
  return sum / node.edges.length;
}

function corners(loop: number[], nodes: Node[]) {
  const found: number[] = [];
  if (loop.length < 4) return found;
  for (let index = 0; index < loop.length; index += 1) {
    const previous = nodes[loop[(index + loop.length - 1) % loop.length]].world;
    const current = nodes[loop[index]].world;
    const next = nodes[loop[(index + 1) % loop.length]].world;
    const left = normalize(sub(current, previous));
    const right = normalize(sub(next, current));
    if (dot(left, right) < 0.72) found.push(loop[index]);
  }
  return found;
}

function shortestTree(nodes: Node[], source: number) {
  const distance = new Float64Array(nodes.length).fill(Infinity);
  const parent = new Int32Array(nodes.length).fill(-1);
  const used = new Uint8Array(nodes.length);
  distance[source] = 0;
  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1;
    let best = Infinity;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!used[index] && distance[index] < best) {
        best = distance[index];
        current = index;
      }
    }
    if (current < 0) break;
    used[current] = 1;
    for (const edge of nodes[current].edges) {
      const next = distance[current] + edge.length;
      if (next >= distance[edge.to]) continue;
      distance[edge.to] = next;
      parent[edge.to] = current;
    }
  }
  return { distance, parent };
}

type Route = { vertices: number[]; distance: number };

function routesFrom(seeds: number[], tree: { distance: Float64Array; parent: Int32Array }) {
  const routes: Route[] = [];
  for (const seed of seeds) {
    if (!Number.isFinite(tree.distance[seed])) continue;
    const vertices: number[] = [];
    for (let index = seed; index !== -1 && vertices.length <= tree.parent.length; index = tree.parent[index]) vertices.push(index);
    if (vertices.length < 2) continue;
    routes.push({ vertices, distance: tree.distance[seed] });
  }
  return routes;
}

function pruneRoutes(routes: Route[], diagonal: number) {
  const kept: Route[] = [];
  const seen = new Set<number>();
  const ordered = [...routes].sort((left, right) => right.distance - left.distance);
  for (const route of ordered) {
    const fresh = route.vertices.filter((index) => !seen.has(index));
    if (fresh.length < 2) continue;
    const reach = fresh.length / route.vertices.length;
    if (kept.length > 0 && reach < 0.18 && route.distance < diagonal * 0.2) continue;
    kept.push(route);
    for (const index of route.vertices) seen.add(index);
  }
  return kept;
}

function localLinks(
  nodes: Node[],
  seeds: number[],
  kept: Route[],
  diagonal: number,
) {
  const used = new Set<string>();
  for (const route of kept) mark(used, route.vertices);
  const links: number[][] = [];
  const limit = diagonal * 0.38;
  for (let left = 0; left < seeds.length; left += 1) {
    let partner = -1;
    let near = Infinity;
    for (let right = 0; right < seeds.length; right += 1) {
      if (left === right) continue;
      const span = length(sub(nodes[seeds[left]].world, nodes[seeds[right]].world));
      if (span < near) {
        near = span;
        partner = seeds[right];
      }
    }
    if (partner < 0 || near > limit || links.length >= 8) continue;
    const path = pathBetween(nodes, seeds[left], partner, limit);
    if (path.length < 2) continue;
    const overlap = path.filter((_, index) => index < path.length - 1 && used.has(pairKey(path[index], path[index + 1]))).length / (path.length - 1);
    if (overlap > 0.55) continue;
    links.push(path);
    mark(used, path);
  }
  return links;
}

function pathBetween(nodes: Node[], start: number, goal: number, limit: number) {
  const distance = new Float64Array(nodes.length).fill(Infinity);
  const parent = new Int32Array(nodes.length).fill(-1);
  const used = new Uint8Array(nodes.length);
  distance[start] = 0;
  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1;
    let best = Infinity;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!used[index] && distance[index] < best) {
        best = distance[index];
        current = index;
      }
    }
    if (current < 0 || best > limit) break;
    if (current === goal) break;
    used[current] = 1;
    for (const edge of nodes[current].edges) {
      const next = distance[current] + edge.length;
      if (next >= distance[edge.to] || next > limit) continue;
      distance[edge.to] = next;
      parent[edge.to] = current;
    }
  }
  if (!Number.isFinite(distance[goal])) return [];
  const path: number[] = [];
  for (let index = goal; index !== -1 && path.length <= nodes.length; index = parent[index]) path.push(index);
  return path;
}

function uncoveredSeeds(
  coat: IsoMesh,
  place: (point: Vec3) => Vec3,
  nodes: Node[],
  near: Float64Array,
  seeds: number[],
  separation: number,
) {
  const extra: number[] = [];
  const ranked: { index: number; gap: number }[] = [];
  for (let index = 0; index < coat.indices.length; index += 3) {
    const at = centroid([
      place(read(coat.positions, coat.indices[index])),
      place(read(coat.positions, coat.indices[index + 1])),
      place(read(coat.positions, coat.indices[index + 2])),
    ]);
    const vertex = nearestVertex(nodes, at);
    ranked.push({ index: vertex, gap: near[Math.floor(index / 3)] ?? 0 });
  }
  ranked.sort((left, right) => right.gap - left.gap);
  for (const item of ranked) {
    if (extra.length >= 8) break;
    if (seeds.includes(item.index) || extra.includes(item.index)) continue;
    if ([...seeds, ...extra].some((seed) => length(sub(nodes[seed].world, nodes[item.index].world)) < separation)) continue;
    extra.push(item.index);
  }
  return extra;
}

function measureCoverage(
  coat: IsoMesh,
  place: (point: Vec3) => Vec3,
  segments: { a: Vec3; b: Vec3 }[],
  area: number,
  diagonal: number,
) {
  const reach = Math.max(diagonal * 0.08, Math.sqrt(Math.max(area, 1e-4)) * 0.16);
  const near = new Float64Array(coat.indices.length / 3).fill(Infinity);
  const reachedVertices = new Set<number>();
  let reachedArea = 0;
  for (let index = 0; index < coat.indices.length; index += 3) {
    const corners = [coat.indices[index], coat.indices[index + 1], coat.indices[index + 2]].map((vertex) => place(read(coat.positions, vertex)));
    const at = centroid(corners);
    const width = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
    const triArea = length(width) * 0.5;
    let best = Infinity;
    for (const segment of segments) best = Math.min(best, segmentDistance(at, segment.a, segment.b));
    near[index / 3] = best;
    if (best <= reach) {
      reachedArea += triArea;
      reachedVertices.add(coat.indices[index]);
      reachedVertices.add(coat.indices[index + 1]);
      reachedVertices.add(coat.indices[index + 2]);
    }
  }
  return { reachedArea, ratio: area > 1e-6 ? reachedArea / area : 0, near, reachedVertices, reach };
}

function segmentsOf(nodes: Node[], routes: Route[], links: number[][]) {
  const segments: { a: Vec3; b: Vec3 }[] = [];
  const pushPath = (vertices: number[]) => {
    for (let index = 0; index < vertices.length - 1; index += 1) {
      segments.push({ a: nodes[vertices[index]].world, b: nodes[vertices[index + 1]].world });
    }
  };
  for (const route of routes) pushPath(route.vertices);
  for (const link of links) pushPath(link);
  return segments;
}

function boundaryReach(loop: number[], reached: Set<number>) {
  if (loop.length < 3) return { regions: 0, reached: 0 };
  const regions = Math.min(8, loop.length);
  let hit = 0;
  for (let region = 0; region < regions; region += 1) {
    const start = Math.floor((region * loop.length) / regions);
    const end = Math.floor(((region + 1) * loop.length) / regions);
    let found = false;
    for (let index = start; index < end; index += 1) found = found || reached.has(loop[index]);
    if (found) hit += 1;
  }
  return { regions, reached: hit };
}

function routeRibbon(nodes: Node[], vertices: number[], width: number) {
  const ribbons: IsoMesh[] = [];
  const span = Math.min(0.16, Math.max(0.012, width));
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const a = nodes[vertices[index]];
    const b = nodes[vertices[index + 1]];
    ribbons.push(ribbon(a.world, b.world, normalize(add(a.normal, b.normal)), span));
  }
  return joinMeshes(ribbons);
}

function stub(surface: Vec3, terminal: Vec3, normal: Vec3, width: number) {
  if (length(sub(surface, terminal)) < 1e-4) return emptyMesh();
  return ribbon(surface, terminal, normal, Math.min(0.16, Math.max(0.012, width)));
}

function ribbon(a: Vec3, b: Vec3, normal: Vec3, width: number): IsoMesh {
  const axis = sub(b, a);
  if (length(axis) < 1e-6) return emptyMesh();
  const direction = normalize(axis);
  const sided = cross(direction, normalize(normal));
  const side = scale(length(sided) < 1e-5 ? unitPerp(direction) : normalize(sided), width);
  const lift = scale(normalize(normal), width * 0.35);
  const corners = [add(a, lift), add(add(a, side), lift), add(b, lift), add(add(b, side), lift)];
  return meshFrom(corners, [0, 1, 3, 0, 3, 2], normalize(normal));
}

function surfaceArea(coat: IsoMesh, place: (point: Vec3) => Vec3) {
  let area = 0;
  for (let index = 0; index < coat.indices.length; index += 3) {
    const a = place(read(coat.positions, coat.indices[index]));
    const b = place(read(coat.positions, coat.indices[index + 1]));
    const c = place(read(coat.positions, coat.indices[index + 2]));
    area += length(cross(sub(b, a), sub(c, a))) * 0.5;
  }
  return area;
}

function principalAxes(nodes: Node[]) {
  const center = centroid(nodes.map((node) => node.world));
  const normal = normalize(nodes.reduce((sum, node) => add(sum, node.normal), { x: 0, y: 0, z: 0 }));
  let tangent = unitPerp(normal);
  let bitangent = normalize(cross(normal, tangent));
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const node of nodes) {
    const u = dot(sub(node.world, center), tangent);
    const v = dot(sub(node.world, center), bitangent);
    xx += u * u;
    xy += u * v;
    yy += v * v;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const major = normalize(add(scale(tangent, Math.cos(angle)), scale(bitangent, Math.sin(angle))));
  const minor = normalize(cross(normal, major));
  return [major, minor];
}

function faceDiagonal(nodes: Node[]) {
  let low = { x: Infinity, y: Infinity, z: Infinity };
  let high = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const node of nodes) {
    low = { x: Math.min(low.x, node.world.x), y: Math.min(low.y, node.world.y), z: Math.min(low.z, node.world.z) };
    high = { x: Math.max(high.x, node.world.x), y: Math.max(high.y, node.world.y), z: Math.max(high.z, node.world.z) };
  }
  return Math.max(length(sub(high, low)), 1e-3);
}

function nearestVertex(nodes: Node[], point: Vec3) {
  let best = 0;
  let score = Infinity;
  for (let index = 0; index < nodes.length; index += 1) {
    const span = length(sub(nodes[index].world, point));
    if (span < score) {
      score = span;
      best = index;
    }
  }
  return best;
}

function loopLength(loop: number[], nodes: Node[]) {
  let sum = 0;
  for (let index = 0; index < loop.length; index += 1) {
    sum += length(sub(nodes[loop[index]].world, nodes[loop[(index + 1) % loop.length]].world));
  }
  return sum;
}

function segmentDistance(point: Vec3, a: Vec3, b: Vec3) {
  const axis = sub(b, a);
  const span = dot(axis, axis);
  if (span < 1e-8) return length(sub(point, a));
  const t = Math.min(1, Math.max(0, dot(sub(point, a), axis) / span));
  return length(sub(point, add(a, scale(axis, t))));
}

function mark(used: Set<string>, vertices: number[]) {
  for (let index = 0; index < vertices.length - 1; index += 1) used.add(pairKey(vertices[index], vertices[index + 1]));
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function push(neighbors: Map<number, number[]>, from: number, to: number) {
  const list = neighbors.get(from);
  if (list) list.push(to);
  else neighbors.set(from, [to]);
}

function blankReport(terminal: Vec3): FaceCoverage {
  return {
    totalArea: 0,
    reachedArea: 0,
    ratio: 0,
    primary: 0,
    secondary: 0,
    tertiary: 0,
    openings: 0,
    openingsAvoided: 0,
    boundaryRegions: 0,
    boundaryReached: 0,
    convergence: roundVec(terminal),
    terminalDistance: 0,
    accepted: false,
    reason: "FAIL: INSUFFICIENT FACE COVERAGE",
  };
}

function emptyMesh(): IsoMesh {
  return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangles: 0 };
}

function meshFrom(corners: Vec3[], indices: number[], normal: Vec3): IsoMesh {
  const positions = new Float32Array(corners.length * 3);
  const normals = new Float32Array(positions.length);
  corners.forEach((corner, index) => write(positions, index, corner));
  for (let index = 0; index < normals.length; index += 3) write(normals, index / 3, normal);
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

function joinMeshes(meshes: IsoMesh[]): IsoMesh {
  const ready = meshes.filter((mesh) => mesh.positions.length > 0);
  if (ready.length === 0) return emptyMesh();
  const positions = new Float32Array(ready.reduce((sum, mesh) => sum + mesh.positions.length, 0));
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  let vertex = 0;
  let written = 0;
  for (const mesh of ready) {
    positions.set(mesh.positions, written);
    normals.set(mesh.normals, written);
    mesh.indices.forEach((index) => indices.push(index + vertex));
    vertex += mesh.positions.length / 3;
    written += mesh.positions.length;
  }
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

function centroid(points: Vec3[]) {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
}

function read(values: Float32Array, index: number): Vec3 {
  const offset = index * 3;
  return { x: values[offset], y: values[offset + 1], z: values[offset + 2] };
}

function write(values: Float32Array, index: number, point: Vec3) {
  const offset = index * 3;
  values[offset] = point.x;
  values[offset + 1] = point.y;
  values[offset + 2] = point.z;
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function roundVec(point: Vec3): Vec3 {
  return { x: round(point.x), y: round(point.y), z: round(point.z) };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(point: Vec3, value: number): Vec3 {
  return { x: point.x * value, y: point.y * value, z: point.z * value };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(point: Vec3) {
  return Math.hypot(point.x, point.y, point.z);
}

function normalize(point: Vec3): Vec3 {
  const span = length(point);
  if (span < 1e-8) return { x: 0, y: 0, z: 1 };
  return scale(point, 1 / span);
}

function unitPerp(axis: Vec3): Vec3 {
  const helper = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(axis, helper));
}
