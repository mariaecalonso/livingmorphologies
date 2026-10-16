import type { HybridCandidate } from "./candidate-field";
import type { FaceFrame, Vec3 } from "./contract";
import type { FaceObservation } from "./face-sample";
import type { FaceProfile, ProfilePoint } from "./face-profile";
import { connectorFrame } from "./hybrid-deformation";
import type { IsoMesh } from "../scan/isomesh";

/**
 * Skill 04 connector as a Physarum-like network, then one implicit volume.
 * Nodes and edges exist before any surface. Radius follows edge strength.
 * Openings are the gaps between branches, not pinches in a single loft.
 */
export const NETWORK_VOLUME_SETTINGS = {
  version: "skill4-network-volume-v1",
  pitch: 0.024,
  minimumRadius: 0.028,
  rows: [20, 28, 40, 60, 80],
} as const;

export type NetworkReport = {
  nodes: number;
  edges: number;
  primary: number;
  secondary: number;
  tertiary: number;
  merges: number;
  pruned: number;
  steps: number;
  minRadius: number;
  maxRadius: number;
  grid: [number, number, number];
};

type Role = "primary" | "secondary" | "tertiary";

type Node = {
  p: Vec3;
  pin: boolean;
  along: number;
};

type Edge = {
  a: number;
  b: number;
  role: Role;
  strength: number;
  alive: boolean;
};

type Frame = NonNullable<ReturnType<typeof connectorFrame>>;

const ROW_PLAN = [
  { steps: 20, extra: 1, tertiary: 0, decay: 0.05, threshold: 0.42 },
  { steps: 28, extra: 2, tertiary: 0, decay: 0.032, threshold: 0.34 },
  { steps: 40, extra: 3, tertiary: 0, decay: 0.024, threshold: 0.28 },
  { steps: 60, extra: 4, tertiary: 1, decay: 0.016, threshold: 0.22 },
  { steps: 80, extra: 5, tertiary: 2, decay: 0.012, threshold: 0.18 },
] as const;

export function growHybridVolume(args: {
  profileA: FaceProfile;
  profileB: FaceProfile;
  candidate: HybridCandidate;
  observationA: FaceObservation;
  observationB: FaceObservation;
}): { status: "ready" | "empty" | "blocked"; mesh: IsoMesh | null; reason: string; report: NetworkReport | null } {
  const loopA = largestLoop(args.profileA);
  const loopB = largestLoop(args.profileB);
  if (!loopA || !loopB) return { status: "empty", mesh: null, reason: "A face section has no closed loop.", report: null };
  const centerA = average(loopA.points.map((point) => point.position));
  const centerB = average(loopB.points.map((point) => point.position));
  const frame = connectorFrame(centerA, centerB);
  if (!frame || frame.span < 1e-4) return { status: "blocked", mesh: null, reason: "The two sections do not form a connection span.", report: null };

  const row = Math.min(ROW_PLAN.length - 1, Math.max(0, args.candidate.row));
  const plan = ROW_PLAN[row];
  const parentA = finite(args.candidate.parentAWeight, 0.5);
  const parentB = finite(args.candidate.parentBWeight, 0.5);
  const intensity = clamp01(finite(args.candidate.transformationIntensity, 0.5));
  const openness = criterion(args.candidate, "openness");
  const directionality = criterion(args.candidate, "directionality");
  const complexity = criterion(args.candidate, "complexity");
  const radiusA = loopRadius(loopA, centerA);
  const radiusB = loopRadius(loopB, centerB);
  const sitesA = pickSites(loopA, Math.min(4, plan.extra), args.observationA, args.profileA);
  const sitesB = pickSites(loopB, Math.min(4, plan.extra), args.observationB, args.profileB);

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const primary = addPath(nodes, edges, samplesBetween(centerA, centerB, 5).map((point, index, all) => {
    const t = index / (all.length - 1);
    const wave = Math.sin(Math.PI * t) * frame.span * intensity * 0.04;
    return add(point, add(scale(frame.tangent, wave * (parentB - parentA)), scale(frame.bitangent, wave * (directionality - 0.5))));
  }), "primary", 1);
  const paths: number[][] = [primary];
  let merges = 0;
  let pruned = 0;

  for (let index = 0; index < plan.extra; index += 1) {
    const redundant = plan.extra > 1 && index === plan.extra - 1;
    const heading = (index + 0.5) * ((Math.PI * 2) / plan.extra) + directionality * 0.8;
    const reach = redundant ? 0.22 : 1;
    const start = lerp(sitesA[index % sitesA.length] ?? centerA, centerA, 0.42);
    const end = lerp(sitesB[(index + 1) % sitesB.length] ?? centerB, centerB, 0.42);
    const path = addPath(nodes, edges, samplesBetween(start, end, 5).map((point, pointIndex, all) => {
      if (pointIndex === 0 || pointIndex === all.length - 1) return point;
      return offset(point, frame, heading, reachFor(point, frame, centerA, parentA, parentB, intensity, openness, reach));
    }), "secondary", 0.58 + (plan.extra - index) * 0.06);
    paths.push(path);
  }

  for (let index = 0; index < plan.tertiary; index += 1) {
    const left = paths[1 + (index % Math.max(1, plan.extra))];
    const right = paths[1 + ((index + 1) % Math.max(1, plan.extra))];
    if (!left || !right) continue;
    const a = left[2];
    const b = right[2];
    if (a === undefined || b === undefined) continue;
    edges.push({ a, b, role: "tertiary", strength: 0.36 + complexity * 0.08, alive: true });
  }

  const redundantPath = plan.extra > 1 ? paths[paths.length - 1] : null;
  let merged = false;
  for (let step = 0; step < plan.steps; step += 1) {
    for (const edge of edges) {
      if (!edge.alive || edge.role === "primary") continue;
      const gap = distanceToPath(midpoint(nodes[edge.a].p, nodes[edge.b].p), nodes, primary);
      const useful = gap > 0.12 + intensity * 0.08;
      const close = gap < 0.07;
      const delta = useful ? 0.02 : close ? -plan.decay : -plan.decay * 0.35;
      edge.strength = clamp01(edge.strength + delta);
    }
    for (const path of paths.slice(1)) {
      for (let index = 1; index < path.length - 1; index += 1) {
        const node = nodes[path[index]];
        const edge = edges.find((item) => item.alive && (item.a === path[index] || item.b === path[index]) && item.role !== "primary");
        const strength = edge?.strength ?? 0;
        const axis = pointOnPath(nodes, primary, node.along);
        node.p = lerp(node.p, lerp(axis, node.p, 0.35 + strength * 0.65), 0.18);
      }
    }
    if (!merged && redundantPath && step === Math.floor(plan.steps * 0.55)) {
      const joinAt = redundantPath[2];
      const onto = nearestOnPath(nodes, primary, nodes[joinAt].p);
      for (let index = 3; index < redundantPath.length; index += 1) {
        const node = nodes[redundantPath[index]];
        if (!node.pin) node.p = pointOnPath(nodes, primary, node.along);
      }
      edges.push({ a: joinAt, b: onto, role: "secondary", strength: 0.62, alive: true });
      merges += 1;
      merged = true;
    }
  }

  for (const edge of edges) {
    if (!edge.alive || edge.role === "primary") continue;
    if (edge.strength < plan.threshold) {
      edge.alive = false;
      pruned += 1;
    }
  }
  if (redundantPath && merged) {
    for (const edge of edges) {
      if (!edge.alive) continue;
      const late = redundantPath.slice(3);
      if (late.includes(edge.a) && late.includes(edge.b)) {
        edge.alive = false;
        pruned += 1;
      }
    }
  }

  const live = edges.filter((edge) => edge.alive);
  if (live.length === 0) return { status: "blocked", mesh: null, reason: "The network pruned every route.", report: null };
  const radii = live.map((edge) => edgeRadius(edge, nodes, frame, radiusA, radiusB));
  const minRadius = Math.min(...radii.map((item) => Math.min(item.start, item.end)));
  const maxRadius = Math.max(...radii.map((item) => Math.max(item.start, item.end)));
  const field = implicitMesh(nodes, live, radii, frame);
  if (!field) return { status: "blocked", mesh: null, reason: "The network did not produce a volume.", report: null };
  const used = new Set<number>();
  for (const edge of live) {
    used.add(edge.a);
    used.add(edge.b);
  }
  return {
    status: "ready",
    mesh: field.mesh,
    reason: "",
    report: {
      nodes: used.size,
      edges: live.length,
      primary: live.filter((edge) => edge.role === "primary").length,
      secondary: live.filter((edge) => edge.role === "secondary").length,
      tertiary: live.filter((edge) => edge.role === "tertiary").length,
      merges,
      pruned,
      steps: plan.steps,
      minRadius,
      maxRadius,
      grid: field.grid,
    },
  };
}

function reachFor(
  point: Vec3,
  frame: Frame,
  centerA: Vec3,
  parentA: number,
  parentB: number,
  intensity: number,
  openness: number,
  reach: number,
) {
  const along = clamp01(dot(sub(point, centerA), frame.direction) / frame.span);
  const bell = spreadEnvelope(along, parentA, parentB);
  return (0.06 + intensity * 0.36 + openness * 0.06) * reach * bell;
}

function spreadEnvelope(t: number, parentA: number, parentB: number) {
  const peak = 0.34 + parentA * 0.28;
  const width = 0.22 + (1 - Math.abs(parentA - parentB)) * 0.08;
  const x = (t - peak) / width;
  return Math.exp(-x * x);
}

function samplesBetween(start: Vec3, end: Vec3, count: number) {
  const points: Vec3[] = [];
  for (let index = 0; index < count; index += 1) points.push(lerp(start, end, index / (count - 1)));
  return points;
}

function offset(point: Vec3, frame: Frame, heading: number, distance: number) {
  if (distance === 0) return point;
  return add(point, add(scale(frame.tangent, Math.cos(heading) * distance), scale(frame.bitangent, Math.sin(heading) * distance)));
}

function addPath(nodes: Node[], edges: Edge[], points: Vec3[], role: Role, strength: number) {
  const ids: number[] = [];
  const origin = points[0];
  const target = points[points.length - 1];
  const span = Math.max(1e-6, length(sub(target, origin)));
  for (let index = 0; index < points.length; index += 1) {
    const id = nodes.length;
    nodes.push({
      p: points[index],
      pin: index === 0 || index === points.length - 1,
      along: length(sub(points[index], origin)) / span,
    });
    if (index > 0) edges.push({ a: ids[index - 1], b: id, role, strength, alive: true });
    ids.push(id);
  }
  return ids;
}

function edgeRadius(edge: Edge, nodes: Node[], frame: Frame, radiusA: number, radiusB: number) {
  const roleScale = edge.role === "primary" ? 0.22 : edge.role === "secondary" ? 0.1 : 0.08;
  const at = (node: Node) => {
    const along = clamp01(dot(sub(node.p, frame.centerA), frame.direction) / frame.span);
    const scale = radiusA * (1 - along) + radiusB * along;
    let radius = clamp(scale * roleScale * (0.55 + edge.strength), NETWORK_VOLUME_SETTINGS.minimumRadius, 0.2);
    if (along < 0.16 || along > 0.84) radius = clamp(radius * 1.85, radius, 0.24);
    return radius;
  };
  const start = at(nodes[edge.a]);
  const end = at(nodes[edge.b]);
  const bridge = length(sub(nodes[edge.a].p, nodes[edge.b].p));
  return {
    start: Math.max(start, edge.role === "primary" ? 0 : Math.min(0.16, bridge * 0.2)),
    end: Math.max(end, edge.role === "primary" ? 0 : Math.min(0.16, bridge * 0.2)),
  };
}

function implicitMesh(
  nodes: Node[],
  edges: Edge[],
  radii: Array<{ start: number; end: number }>,
  frame: Frame,
) {
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  edges.forEach((edge, index) => {
    const radius = Math.max(radii[index].start, radii[index].end) + NETWORK_VOLUME_SETTINGS.pitch * 3;
    for (const node of [nodes[edge.a], nodes[edge.b]]) {
      min = { x: Math.min(min.x, node.p.x - radius), y: Math.min(min.y, node.p.y - radius), z: Math.min(min.z, node.p.z - radius) };
      max = { x: Math.max(max.x, node.p.x + radius), y: Math.max(max.y, node.p.y + radius), z: Math.max(max.z, node.p.z + radius) };
    }
  });
  const pitch = NETWORK_VOLUME_SETTINGS.pitch;
  const nx = Math.min(72, Math.max(8, Math.ceil((max.x - min.x) / pitch)));
  const ny = Math.min(56, Math.max(8, Math.ceil((max.y - min.y) / pitch)));
  const nz = Math.min(56, Math.max(8, Math.ceil((max.z - min.z) / pitch)));
  const origin = min;
  const sizeX = nx * pitch;
  const sizeY = ny * pitch;
  const sizeZ = nz * pitch;
  const sdf = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const corner = (i: number, j: number, k: number) => (k * (ny + 1) + j) * (nx + 1) + i;
  for (let k = 0; k <= nz; k += 1) {
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        const point = { x: origin.x + (i / nx) * sizeX, y: origin.y + (j / ny) * sizeY, z: origin.z + (k / nz) * sizeZ };
        let distance = 1e6;
        for (let edge = 0; edge < edges.length; edge += 1) {
          distance = smoothMin(distance, capsule(point, nodes[edges[edge].a].p, nodes[edges[edge].b].p, radii[edge].start, radii[edge].end), 0.05);
        }
        sdf[corner(i, j, k)] = distance;
      }
    }
  }
  let mesh = surfaceNets(sdf, nx, ny, nz, origin, { x: sizeX, y: sizeY, z: sizeZ });
  for (const delta of [-0.012, -0.024]) {
    if (mesh && irregularEdges(mesh) === 0) break;
    mesh = surfaceNets(shiftField(sdf, delta), nx, ny, nz, origin, { x: sizeX, y: sizeY, z: sizeZ });
  }
  if (!mesh) return null;
  void frame;
  return { mesh, grid: [nx, ny, nz] as [number, number, number] };
}

function shiftField(sdf: Float32Array, delta: number) {
  const shifted = new Float32Array(sdf.length);
  for (let index = 0; index < sdf.length; index += 1) shifted[index] = sdf[index] + delta;
  return shifted;
}

function irregularEdges(mesh: IsoMesh) {
  const counts = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const left = corners[edge];
      const right = corners[(edge + 1) % 3];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let irregular = 0;
  for (const count of counts.values()) if (count !== 2) irregular += 1;
  return irregular;
}

function capsule(point: Vec3, a: Vec3, b: Vec3, radiusA: number, radiusB: number) {
  const ab = sub(b, a);
  const denom = Math.max(1e-8, dot(ab, ab));
  const t = clamp01(dot(sub(point, a), ab) / denom);
  const center = lerp(a, b, t);
  return length(sub(point, center)) - (radiusA + (radiusB - radiusA) * t);
}

function smoothMin(a: number, b: number, k: number) {
  if (!Number.isFinite(a)) return b;
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function surfaceNets(sdf: Float32Array, nx: number, ny: number, nz: number, origin: Vec3, size: Vec3): IsoMesh | null {
  const corner = (i: number, j: number, k: number) => (k * (ny + 1) + j) * (nx + 1) + i;
  const cell = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const positions: number[] = [];
  const pointAt = (i: number, j: number, k: number): Vec3 => ({
    x: origin.x + (i / nx) * size.x,
    y: origin.y + (j / ny) * size.y,
    z: origin.z + (k / nz) * size.z,
  });
  const corners = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const cubeEdges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const values = corners.map(([di, dj, dk]) => sdf[corner(i + di, j + dj, k + dk)]);
        const inside = values.some((value) => value <= 0);
        const outside = values.some((value) => value > 0);
        if (!inside || !outside) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (const [a, b] of cubeEdges) {
          const va = values[a];
          const vb = values[b];
          if ((va <= 0) === (vb <= 0)) continue;
          const t = va / (va - vb);
          const pa = corners[a];
          const pb = corners[b];
          sx += i + pa[0] + (pb[0] - pa[0]) * t;
          sy += j + pa[1] + (pb[1] - pa[1]) * t;
          sz += k + pa[2] + (pb[2] - pa[2]) * t;
          count += 1;
        }
        if (count === 0) continue;
        const vertex = pointAt(sx / count, sy / count, sz / count);
        cellVert[cell(i, j, k)] = positions.length / 3;
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }
  }
  if (positions.length < 9) return null;
  const indices: number[] = [];
  const emit = (ids: Array<[number, number, number]>) => {
    const verts = ids.map(([i, j, k]) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : cellVert[cell(i, j, k)]));
    if (verts.some((vertex) => vertex < 0)) return;
    const a = read(positions, verts[0]);
    const b = read(positions, verts[1]);
    const c = read(positions, verts[2]);
    const d = read(positions, verts[3]);
    const normal = cross(sub(c, a), sub(b, a));
    const center = scale(add(add(a, b), add(c, d)), 0.25);
    const gradient = fieldGradient(sdf, nx, ny, nz, origin, size, center);
    const [w, x, y, z] = dot(normal, gradient) >= 0 ? verts : [verts[0], verts[3], verts[2], verts[1]];
    indices.push(w, x, y, w, y, z);
  };
  for (let k = 0; k <= nz; k += 1) {
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        if (i < nx && j > 0 && k > 0 && j < ny && k < nz && (sdf[corner(i, j, k)] <= 0) !== (sdf[corner(i + 1, j, k)] <= 0)) {
          emit([[i, j - 1, k - 1], [i, j, k - 1], [i, j, k], [i, j - 1, k]]);
        }
        if (j < ny && i > 0 && k > 0 && i < nx && k < nz && (sdf[corner(i, j, k)] <= 0) !== (sdf[corner(i, j + 1, k)] <= 0)) {
          emit([[i - 1, j, k - 1], [i, j, k - 1], [i, j, k], [i - 1, j, k]]);
        }
        if (k < nz && i > 0 && j > 0 && i < nx && j < ny && (sdf[corner(i, j, k)] <= 0) !== (sdf[corner(i, j, k + 1)] <= 0)) {
          emit([[i - 1, j - 1, k], [i, j - 1, k], [i, j, k], [i - 1, j, k]]);
        }
      }
    }
  }
  if (indices.length < 3) return null;
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    const face = cross(sub(read(positions, b), read(positions, a)), sub(read(positions, c), read(positions, a)));
    addNormal(normals, a, face);
    addNormal(normals, b, face);
    addNormal(normals, c, face);
  }
  for (let index = 0; index < normals.length; index += 3) {
    const normal = normalize(read(normals, index / 3));
    const unit = normal ?? { x: 0, y: 1, z: 0 };
    normals[index] = unit.x;
    normals[index + 1] = unit.y;
    normals[index + 2] = unit.z;
  }
  return {
    positions: Float32Array.from(positions),
    normals,
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function fieldGradient(sdf: Float32Array, nx: number, ny: number, nz: number, origin: Vec3, size: Vec3, point: Vec3): Vec3 {
  const e = Math.min(size.x / nx, size.y / ny, size.z / nz) * 0.5;
  const sample = (offset: Vec3) => {
    const x = clamp(((point.x + offset.x - origin.x) / size.x) * nx, 0, nx);
    const y = clamp(((point.y + offset.y - origin.y) / size.y) * ny, 0, ny);
    const z = clamp(((point.z + offset.z - origin.z) / size.z) * nz, 0, nz);
    const i = Math.min(nx - 1, Math.floor(x));
    const j = Math.min(ny - 1, Math.floor(y));
    const k = Math.min(nz - 1, Math.floor(z));
    const tx = x - i;
    const ty = y - j;
    const tz = z - k;
    const at = (di: number, dj: number, dk: number) => sdf[((k + dk) * (ny + 1) + (j + dj)) * (nx + 1) + (i + di)];
    const c00 = at(0, 0, 0) * (1 - tx) + at(1, 0, 0) * tx;
    const c10 = at(0, 1, 0) * (1 - tx) + at(1, 1, 0) * tx;
    const c01 = at(0, 0, 1) * (1 - tx) + at(1, 0, 1) * tx;
    const c11 = at(0, 1, 1) * (1 - tx) + at(1, 1, 1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
  return {
    x: sample({ x: e, y: 0, z: 0 }) - sample({ x: -e, y: 0, z: 0 }),
    y: sample({ x: 0, y: e, z: 0 }) - sample({ x: 0, y: -e, z: 0 }),
    z: sample({ x: 0, y: 0, z: e }) - sample({ x: 0, y: 0, z: -e }),
  };
}

function largestLoop(profile: FaceProfile) {
  const loops = profile.loops.filter((loop) => loop.points.length >= 3);
  if (loops.length === 0) return null;
  return loops.reduce((best, loop) => (loop.points.length > best.points.length ? loop : best));
}

function pickSites(loop: { points: ProfilePoint[] }, count: number, observation: FaceObservation, profile: FaceProfile) {
  const points = loop.points;
  const cu = points.reduce((sum, point) => sum + point.u, 0) / points.length;
  const cv = points.reduce((sum, point) => sum + point.v, 0) / points.length;
  const ordered = points.map((point) => ({
    point,
    angle: Math.atan2(point.v - cv, point.u - cu),
    score: occupancy(observation, profile, point.u, point.v),
  })).sort((a, b) => a.angle - b.angle);
  const sites: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const center = Math.floor((index + 0.5) * ordered.length / count) % ordered.length;
    let best = ordered[center];
    for (let offset = -2; offset <= 2; offset += 1) {
      const item = ordered[(center + offset + ordered.length) % ordered.length];
      if (item.score > best.score) best = item;
    }
    sites.push(best.point.position);
  }
  return sites.length > 0 ? sites : [average(points.map((point) => point.position))];
}

function occupancy(observation: FaceObservation, profile: FaceProfile, u: number, v: number) {
  const bounds = profile.bounds;
  if (!bounds || observation.normalizedCells.length < 64) return 0;
  const width = bounds.maxU - bounds.minU;
  const height = bounds.maxV - bounds.minV;
  if (width <= 1e-6 || height <= 1e-6) return 0;
  const x = clamp01((u - bounds.minU) / width);
  const y = clamp01((v - bounds.minV) / height);
  const i = Math.min(7, Math.floor(x * 8));
  const j = Math.min(7, Math.floor(y * 8));
  return observation.normalizedCells[j * 8 + i] ?? 0;
}

function loopRadius(loop: { points: ProfilePoint[] }, center: Vec3) {
  const radius = loop.points.reduce((sum, point) => sum + length(sub(point.position, center)), 0) / loop.points.length;
  return Math.max(0.08, radius);
}

function distanceToPath(point: Vec3, nodes: Node[], path: number[]) {
  let best = Infinity;
  for (let index = 0; index < path.length - 1; index += 1) {
    best = Math.min(best, segmentDistance(point, nodes[path[index]].p, nodes[path[index + 1]].p));
  }
  return best;
}

function segmentDistance(point: Vec3, a: Vec3, b: Vec3) {
  const ab = sub(b, a);
  const denom = Math.max(1e-8, dot(ab, ab));
  const t = clamp01(dot(sub(point, a), ab) / denom);
  return length(sub(point, lerp(a, b, t)));
}

function pointOnPath(nodes: Node[], path: number[], along: number) {
  const target = clamp01(along);
  let best = nodes[path[0]].p;
  let bestGap = Infinity;
  for (const id of path) {
    const gap = Math.abs(nodes[id].along - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = nodes[id].p;
    }
  }
  return best;
}

function nearestOnPath(nodes: Node[], path: number[], point: Vec3) {
  let best = path[0];
  let bestDistance = Infinity;
  for (const id of path) {
    const distance = length(sub(nodes[id].p, point));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

function midpoint(a: Vec3, b: Vec3) {
  return lerp(a, b, 0.5);
}

function criterion(candidate: HybridCandidate, id: string) {
  const found = candidate.criteria?.find((item) => item.criterionId === id);
  if (!found || !Number.isFinite(found.value)) return 0.5;
  return clamp01(found.value / 2);
}

function average(points: Vec3[]): Vec3 {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function addNormal(normals: Float32Array, vertex: number, face: Vec3) {
  const offset = vertex * 3;
  normals[offset] += face.x;
  normals[offset + 1] += face.y;
  normals[offset + 2] += face.z;
}

function read(positions: number[] | Float32Array, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3) {
  const magnitude = length(value);
  if (magnitude <= 1e-8) return null;
  return scale(value, 1 / magnitude);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
