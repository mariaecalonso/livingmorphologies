import type { FaceFrame, FaceId, Vec3 } from "./contract";
import type { IsoMesh } from "../scan/isomesh";

/**
 * Cross-section of an IsoMesh on a plane parallel to one registration face.
 * The plane sits inward from that face by `depth`, opposite the outward normal.
 * Each cut is an edge segment in the face's u/v frame. sampleFace is not used.
 * The source mesh is read only.
 */
export const FACE_PROFILE_SETTINGS = {
  version: "skill4-face-profile-v1",
  planeTolerance: 1e-6,
  weldTolerance: 1e-5,
  sample: "triangle-plane-intersection",
  depthDirection: "inward, opposite the outward face normal",
  uv: "dot with the selected face frame u and v, measured from the face origin",
} as const;

export type FaceProfileStatus = "ready" | "empty" | "invalid";

export type ProfilePoint = {
  u: number;
  v: number;
  position: Vec3;
};

export type ProfileSegment = {
  a: ProfilePoint;
  b: ProfilePoint;
};

export type ProfileLoop = {
  closed: boolean;
  points: ProfilePoint[];
};

export type ProfileBounds = {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
};

export type FaceProfile = {
  version: typeof FACE_PROFILE_SETTINGS.version;
  status: FaceProfileStatus;
  face: FaceId | null;
  depth: number;
  frame: FaceFrame | null;
  planeOrigin: Vec3 | null;
  inward: Vec3 | null;
  loops: ProfileLoop[];
  segments: ProfileSegment[];
  bounds: ProfileBounds | null;
};

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 0],
];

type XYZ = [number, number, number];

export function profilePointToWorld(frame: FaceFrame, depth: number, u: number, v: number): Vec3 {
  return {
    x: frame.origin.x + frame.u.x * u + frame.v.x * v - frame.normal.x * depth,
    y: frame.origin.y + frame.u.y * u + frame.v.y * v - frame.normal.y * depth,
    z: frame.origin.z + frame.u.z * u + frame.v.z * v - frame.normal.z * depth,
  };
}

export function extractFaceProfile(mesh: IsoMesh | null, frame: FaceFrame | null, depth: number): FaceProfile {
  if (!frame || !finiteVec(frame.origin) || !finiteVec(frame.normal) || !finiteVec(frame.u) || !finiteVec(frame.v)) {
    return blank("invalid", frame?.id ?? null, depth, frame, null, null);
  }
  if (!unitLength(frame.normal) || !unitLength(frame.u) || !unitLength(frame.v)) {
    return blank("invalid", frame.id, depth, frame, null, null);
  }
  if (!Number.isFinite(depth) || depth < 0) {
    return blank("invalid", frame.id, depth, frame, null, null);
  }
  const inward = scale(frame.normal, -1);
  const planeOrigin = add(frame.origin, scale(inward, depth));
  if (!usableMesh(mesh)) {
    return blank("invalid", frame.id, depth, frame, planeOrigin, inward);
  }

  const raw: Array<{ a: ProfilePoint; b: ProfilePoint }> = [];
  const { positions, indices } = mesh;
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const base = triangle * 3;
    const verts: XYZ[] = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const index = indices[base + corner];
      const start = index * 3;
      if (start < 0 || start + 2 >= positions.length) {
        return blank("invalid", frame.id, depth, frame, planeOrigin, inward);
      }
      const vert: XYZ = [positions[start], positions[start + 1], positions[start + 2]];
      if (!vert.every(Number.isFinite)) {
        return blank("invalid", frame.id, depth, frame, planeOrigin, inward);
      }
      verts.push(vert);
    }
    const cut = triangleCut(verts, frame, planeOrigin);
    if (cut) raw.push(cut);
  }

  const segments = weldSegments(raw);
  if (segments.length === 0) {
    return blank("empty", frame.id, depth, frame, planeOrigin, inward);
  }
  return {
    version: FACE_PROFILE_SETTINGS.version,
    status: "ready",
    face: frame.id,
    depth,
    frame,
    planeOrigin,
    inward,
    loops: chainLoops(segments),
    segments,
    bounds: boundsOf(segments),
  };
}

function triangleCut(verts: XYZ[], frame: FaceFrame, planeOrigin: Vec3): { a: ProfilePoint; b: ProfilePoint } | null {
  const distances = verts.map((vert) => signed(vert, planeOrigin, frame.normal));
  const sides = distances.map(sideOf);
  const zeros = sides.reduce((count, side) => count + (side === 0 ? 1 : 0), 0);
  if (zeros === 3) return null;

  if (zeros === 2) {
    const onPlane = [0, 1, 2].filter((index) => sides[index] === 0);
    return pair(pointAt(verts[onPlane[0]], frame), pointAt(verts[onPlane[1]], frame));
  }

  if (zeros === 1) {
    const onPlane = sides.indexOf(0);
    const others = [0, 1, 2].filter((index) => index !== onPlane);
    if (sides[others[0]] === sides[others[1]]) return null;
    const hit = edgePoint(verts[others[0]], verts[others[1]], distances[others[0]], distances[others[1]], frame);
    if (!hit) return null;
    return pair(pointAt(verts[onPlane], frame), hit);
  }

  const hits: ProfilePoint[] = [];
  for (const [from, to] of EDGES) {
    if (sides[from] === sides[to]) continue;
    const hit = edgePoint(verts[from], verts[to], distances[from], distances[to], frame);
    if (hit) hits.push(hit);
  }
  if (hits.length !== 2) return null;
  return pair(hits[0], hits[1]);
}

function edgePoint(a: XYZ, b: XYZ, da: number, db: number, frame: FaceFrame): ProfilePoint | null {
  const denom = da - db;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null;
  const t = da / denom;
  if (!Number.isFinite(t)) return null;
  return pointAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], frame);
}

function pointAt(vert: XYZ, frame: FaceFrame): ProfilePoint {
  const dx = vert[0] - frame.origin.x;
  const dy = vert[1] - frame.origin.y;
  const dz = vert[2] - frame.origin.z;
  return {
    u: dx * frame.u.x + dy * frame.u.y + dz * frame.u.z,
    v: dx * frame.v.x + dy * frame.v.y + dz * frame.v.z,
    position: { x: vert[0], y: vert[1], z: vert[2] },
  };
}

function pair(a: ProfilePoint, b: ProfilePoint) {
  return { a, b };
}

function sideOf(distance: number) {
  if (distance > FACE_PROFILE_SETTINGS.planeTolerance) return 1;
  if (distance < -FACE_PROFILE_SETTINGS.planeTolerance) return -1;
  return 0;
}

function signed(vert: XYZ, planeOrigin: Vec3, normal: Vec3) {
  return (
    (vert[0] - planeOrigin.x) * normal.x +
    (vert[1] - planeOrigin.y) * normal.y +
    (vert[2] - planeOrigin.z) * normal.z
  );
}

function weldSegments(raw: Array<{ a: ProfilePoint; b: ProfilePoint }>): ProfileSegment[] {
  const nodes: ProfilePoint[] = [];
  const parent: number[] = [];
  const find = (index: number) => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a === b) return;
    if (a < b) parent[b] = a;
    else parent[a] = b;
  };
  const intern = (point: ProfilePoint) => {
    const index = nodes.length;
    nodes.push(point);
    parent.push(index);
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (distance(nodes[earlier].position, point.position) <= FACE_PROFILE_SETTINGS.weldTolerance) union(index, earlier);
    }
    return index;
  };

  const ends: Array<[number, number]> = [];
  for (const segment of raw) {
    ends.push([intern(segment.a), intern(segment.b)]);
  }

  const seen = new Set<string>();
  const segments: ProfileSegment[] = [];
  for (const [a, b] of ends) {
    const left = find(a);
    const right = find(b);
    if (left === right) continue;
    const key = left < right ? `${left}:${right}` : `${right}:${left}`;
    if (seen.has(key)) continue;
    seen.add(key);
    segments.push({ a: nodes[left], b: nodes[right] });
  }
  return segments;
}

function chainLoops(segments: ProfileSegment[]): ProfileLoop[] {
  const adjacency = new Map<ProfilePoint, number[]>();
  const link = (point: ProfilePoint, index: number) => {
    const list = adjacency.get(point);
    if (list) list.push(index);
    else adjacency.set(point, [index]);
  };
  segments.forEach((segment, index) => {
    link(segment.a, index);
    link(segment.b, index);
  });
  for (const list of adjacency.values()) list.sort((a, b) => a - b);

  const used = new Set<number>();
  const loops: ProfileLoop[] = [];
  const other = (index: number, point: ProfilePoint) => (segments[index].a === point ? segments[index].b : segments[index].a);

  for (let start = 0; start < segments.length; start += 1) {
    if (used.has(start)) continue;
    const local = new Set<number>([start]);
    const points = [segments[start].a, segments[start].b];
    let closed = false;
    const extend = (forward: boolean) => {
      while (points.length <= segments.length + 1) {
        const end = forward ? points[points.length - 1] : points[0];
        const next = (adjacency.get(end) ?? []).find((index) => !local.has(index));
        if (next === undefined) return;
        const nextPoint = other(next, end);
        local.add(next);
        const returns = forward ? nextPoint === points[0] : nextPoint === points[points.length - 1];
        if (returns && points.length > 2) {
          closed = true;
          return;
        }
        if (forward) points.push(nextPoint);
        else points.unshift(nextPoint);
      }
    };
    extend(true);
    if (!closed) extend(false);
    for (const index of local) used.add(index);
    loops.push(canonicalize({ closed, points: closed ? points : orientOpen(points) }));
  }

  loops.sort((a, b) => comparePoints(a.points[0], b.points[0]) || a.points.length - b.points.length);
  return loops;
}

function canonicalize(loop: ProfileLoop): ProfileLoop {
  if (!loop.closed || loop.points.length < 3) return loop;
  let min = 0;
  for (let index = 1; index < loop.points.length; index += 1) {
    if (comparePoints(loop.points[index], loop.points[min]) < 0) min = index;
  }
  const rotated = loop.points.slice(min).concat(loop.points.slice(0, min));
  if (comparePoints(rotated[1], rotated[rotated.length - 1]) > 0) {
    return { closed: true, points: [rotated[0], ...rotated.slice(1).reverse()] };
  }
  return { closed: true, points: rotated };
}

function orientOpen(points: ProfilePoint[]) {
  if (points.length > 1 && comparePoints(points[0], points[points.length - 1]) > 0) return [...points].reverse();
  return points;
}

function comparePoints(a: ProfilePoint, b: ProfilePoint) {
  if (a.u !== b.u) return a.u < b.u ? -1 : 1;
  if (a.v !== b.v) return a.v < b.v ? -1 : 1;
  if (a.position.x !== b.position.x) return a.position.x < b.position.x ? -1 : 1;
  if (a.position.y !== b.position.y) return a.position.y < b.position.y ? -1 : 1;
  if (a.position.z !== b.position.z) return a.position.z < b.position.z ? -1 : 1;
  return 0;
}

function boundsOf(segments: ProfileSegment[]): ProfileBounds {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const segment of segments) {
    for (const point of [segment.a, segment.b]) {
      minU = Math.min(minU, point.u);
      maxU = Math.max(maxU, point.u);
      minV = Math.min(minV, point.v);
      maxV = Math.max(maxV, point.v);
    }
  }
  return { minU, maxU, minV, maxV };
}

function blank(
  status: "empty" | "invalid",
  face: FaceId | null,
  depth: number,
  frame: FaceFrame | null,
  planeOrigin: Vec3 | null,
  inward: Vec3 | null,
): FaceProfile {
  return {
    version: FACE_PROFILE_SETTINGS.version,
    status,
    face,
    depth,
    frame,
    planeOrigin,
    inward,
    loops: [],
    segments: [],
    bounds: null,
  };
}

function usableMesh(mesh: IsoMesh | null): mesh is IsoMesh {
  if (!mesh || !Number.isInteger(mesh.triangles) || mesh.triangles < 1) return false;
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return false;
  if (mesh.indices.length !== mesh.triangles * 3) return false;
  return true;
}

function finiteVec(value: Vec3) {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function unitLength(value: Vec3) {
  return Math.abs(Math.hypot(value.x, value.y, value.z) - 1) < 1e-3;
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
