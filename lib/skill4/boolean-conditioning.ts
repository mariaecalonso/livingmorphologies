import type { IsoMesh } from "../scan/isomesh";
import { isoMeshToBooleanMesh, type BooleanAdapterStatus } from "./boolean-adapter";

/**
 * Derived boolean operands.
 * The stored loft and the source tile stay untouched.
 * Tile conditioning only drops exact duplicates, unused vertices, and zero-area triangles.
 */
export const BOOLEAN_CONDITIONING_SETTINGS = {
  version: "skill4-boolean-conditioning-v1",
  nearWeldReportDistance: 1e-5,
} as const;

export type MeshTopology = {
  vertexCount: number;
  triangleCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  duplicateTriangleCount: number;
  degenerateTriangleCount: number;
  componentCount: number;
  duplicatePositionCount: number;
  weldCandidateCount: number;
  closed: boolean;
};

export type ClosedConnectorResult = {
  status: "ready" | "invalid-input" | "unresolved";
  mesh: IsoMesh | null;
  reason: string;
};

/**
 * Physical interlocking needs a closed, oriented, single-component 2-manifold.
 * An open tile can still be previewed and used to generate connectors.
 * This check does not repair or replace the mesh.
 */
export const PHYSICAL_TILE_REQUIREMENT = {
  version: "skill4-physical-tile-v1",
  closed: true,
  oriented: true,
  manifold: "2-manifold",
  components: 1,
} as const;

export type BooleanReadinessStatus = "ready" | "open" | "non-manifold" | "disconnected" | "invalid";

export type BooleanReadiness = {
  status: BooleanReadinessStatus;
  booleanReady: boolean;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  componentCount: number;
  kernelStatus: string | null;
  reason: string;
};

export function booleanReadinessLabel(status: BooleanReadinessStatus) {
  return status === "ready" ? "READY" : "NOT READY";
}

/** Topology gate. A passing mesh still needs manifold-3d before it is boolean-ready. */
export function inspectBooleanReadiness(mesh: IsoMesh): BooleanReadiness {
  if (!validBooleanMesh(mesh)) {
    return { status: "invalid", booleanReady: false, boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, componentCount: 0, kernelStatus: null, reason: "invalid-mesh" };
  }
  const topology = diagnoseTopology(mesh);
  const counts = {
    boundaryEdgeCount: topology.boundaryEdgeCount,
    nonManifoldEdgeCount: topology.nonManifoldEdgeCount,
    componentCount: topology.componentCount,
    kernelStatus: null,
    booleanReady: false,
  };
  if (topology.nonManifoldEdgeCount > 0) {
    return { ...counts, status: "non-manifold", reason: `non-manifold-edges:${topology.nonManifoldEdgeCount}` };
  }
  if (topology.boundaryEdgeCount > 0) {
    const components = topology.componentCount === 1 ? "" : `;components:${topology.componentCount}`;
    return { ...counts, status: "open", reason: `boundary-edges:${topology.boundaryEdgeCount}${components}` };
  }
  if (topology.componentCount !== 1) {
    return { ...counts, status: "disconnected", reason: `components:${topology.componentCount}` };
  }
  return { ...counts, status: "ready", reason: "kernel-unchecked" };
}

export async function evaluateBooleanReadiness(mesh: IsoMesh): Promise<BooleanReadiness> {
  const inspected = inspectBooleanReadiness(mesh);
  if (inspected.reason !== "kernel-unchecked") return inspected;
  const probe = await isoMeshToBooleanMesh(mesh);
  probe.mesh?.release();
  if (probe.status !== "ready") {
    return { ...inspected, status: "non-manifold", booleanReady: false, kernelStatus: probe.reason || probe.status, reason: probe.reason || probe.status };
  }
  return { ...inspected, booleanReady: true, kernelStatus: "NoError", reason: "" };
}

export type TileConditioningResult = {
  status: "ready" | "unresolved";
  before: MeshTopology;
  after: MeshTopology | null;
  mesh: IsoMesh | null;
  adapterStatus: BooleanAdapterStatus | "not-run";
  reason: string;
  operations: string[];
};

export function diagnoseTopology(mesh: IsoMesh): MeshTopology {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const edges = new Map<string, number>();
  const triangleKeys = new Map<string, number>();
  let degenerateTriangleCount = 0;
  let duplicateTriangleCount = 0;
  const parent = Array.from({ length: triangleCount }, (_, index) => index);
  const edgeOwner = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const corners = [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]];
    if (new Set(corners).size !== 3 || faceArea(mesh.positions, corners) <= 1e-20) degenerateTriangleCount += 1;
    const key = [...corners].sort((left, right) => left - right).join(",");
    const seen = triangleKeys.get(key) ?? 0;
    if (seen > 0) duplicateTriangleCount += 1;
    triangleKeys.set(key, seen + 1);
    for (let edge = 0; edge < 3; edge += 1) {
      const left = corners[edge];
      const right = corners[(edge + 1) % 3];
      const undirected = left < right ? `${left}:${right}` : `${right}:${left}`;
      edges.set(undirected, (edges.get(undirected) ?? 0) + 1);
      const owner = edgeOwner.get(undirected);
      if (owner === undefined) edgeOwner.set(undirected, triangle);
      else union(parent, owner, triangle);
    }
  }
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    else if (count !== 2) nonManifoldEdgeCount += 1;
  }
  const roots = new Set<number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) roots.add(find(parent, triangle));
  const positions = duplicatePositions(mesh.positions, vertexCount);
  return {
    vertexCount,
    triangleCount,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    duplicateTriangleCount,
    degenerateTriangleCount,
    componentCount: triangleCount === 0 ? 0 : roots.size,
    duplicatePositionCount: positions.exact,
    weldCandidateCount: positions.near,
    closed: triangleCount > 0 && boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0,
  };
}

/** Caps ring 0 and the final ring of an open loft. Positions and side triangles are copied. */
export function closeConnectorLoft(mesh: IsoMesh, sampleCount: number, steps: number): ClosedConnectorResult {
  if (!Number.isInteger(sampleCount) || sampleCount < 3 || !Number.isInteger(steps) || steps < 2) {
    return { status: "invalid-input", mesh: null, reason: "ring-layout" };
  }
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount !== sampleCount * steps || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) {
    return { status: "invalid-input", mesh: null, reason: "loft-size" };
  }
  const startDirection = boundaryDirection(mesh.indices, 0, sampleCount);
  const endDirection = boundaryDirection(mesh.indices, steps - 1, sampleCount);
  if (startDirection === null || endDirection === null) {
    return { status: "unresolved", mesh: null, reason: "end-ring-not-open" };
  }
  const caps = [...capRing(0, sampleCount, startDirection), ...capRing((steps - 1) * sampleCount, sampleCount, endDirection)];
  const indices = new Uint32Array(mesh.indices.length + caps.length);
  indices.set(mesh.indices, 0);
  indices.set(caps, mesh.indices.length);
  const positions = Float32Array.from(mesh.positions);
  const closed: IsoMesh = {
    positions,
    normals: recomputeNormals(positions, indices),
    indices,
    triangles: indices.length / 3,
  };
  const topology = diagnoseTopology(closed);
  if (!topology.closed) return { status: "unresolved", mesh: null, reason: "cap-did-not-close" };
  return { status: "ready", mesh: closed, reason: "" };
}

/**
 * Exact, non-moving cleanup of a derived copy.
 * Nearby-but-not-equal vertices are reported and left in place.
 */
export async function conditionTileCopy(mesh: IsoMesh): Promise<TileConditioningResult> {
  const before = diagnoseTopology(mesh);
  const derived = exactCondition(mesh);
  if (!derived) {
    return {
      status: "unresolved",
      before,
      after: null,
      mesh: null,
      adapterStatus: "not-run",
      reason: "no-safe-conditioning",
      operations: [],
    };
  }
  const after = diagnoseTopology(derived.mesh);
  const probe = await isoMeshToBooleanMesh(derived.mesh);
  probe.mesh?.release();
  const manifold = probe.status === "ready";
  return {
    status: manifold ? "ready" : "unresolved",
    before,
    after,
    mesh: derived.mesh,
    adapterStatus: probe.status,
    reason: manifold ? "" : probe.reason || probe.status,
    operations: derived.operations,
  };
}

function exactCondition(mesh: IsoMesh): { mesh: IsoMesh; operations: string[] } | null {
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount < 3 || mesh.indices.length < 3) return null;
  const canonical = new Array<number>(vertexCount).fill(-1);
  const weld = new Map<string, number>();
  let welded = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const key = `${mesh.positions[vertex * 3]},${mesh.positions[vertex * 3 + 1]},${mesh.positions[vertex * 3 + 2]}`;
    const existing = weld.get(key);
    if (existing === undefined) weld.set(key, vertex);
    else {
      canonical[vertex] = existing;
      welded += 1;
    }
  }
  const resolve = (vertex: number) => (canonical[vertex] >= 0 ? canonical[vertex] : vertex);
  const seen = new Set<string>();
  const kept: number[] = [];
  let droppedDegenerate = 0;
  let droppedDuplicate = 0;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [resolve(mesh.indices[index]), resolve(mesh.indices[index + 1]), resolve(mesh.indices[index + 2])];
    if (new Set(corners).size !== 3 || faceArea(mesh.positions, corners) <= 1e-20) {
      droppedDegenerate += 1;
      continue;
    }
    const key = [...corners].sort((left, right) => left - right).join(",");
    if (seen.has(key)) {
      droppedDuplicate += 1;
      continue;
    }
    seen.add(key);
    kept.push(...corners);
  }
  if (kept.length < 3) return null;
  const used = new Map<number, number>();
  const positions: number[] = [];
  for (const vertex of kept) {
    if (used.has(vertex)) continue;
    used.set(vertex, positions.length / 3);
    positions.push(mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]);
  }
  const unused = vertexCount - used.size - welded;
  const operations: string[] = [];
  if (welded > 0) operations.push("weld-exact-positions");
  if (droppedDegenerate > 0) operations.push("drop-degenerate-triangles");
  if (droppedDuplicate > 0) operations.push("drop-duplicate-triangles");
  if (unused > 0) operations.push("drop-unused-vertices");
  if (operations.length === 0) return null;
  const packed = Float32Array.from(positions);
  const indices = Uint32Array.from(kept, (vertex) => used.get(vertex) ?? 0);
  return {
    operations,
    mesh: {
      positions: packed,
      normals: recomputeNormals(packed, indices),
      indices,
      triangles: indices.length / 3,
    },
  };
}

function boundaryDirection(indices: Uint32Array, ring: number, sampleCount: number) {
  const start = ring * sampleCount;
  const end = start + sampleCount;
  const count = new Map<string, number>();
  for (let index = 0; index < indices.length; index += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const left = indices[index + edge];
      const right = indices[index + ((edge + 1) % 3)];
      if (left < start || left >= end || right < start || right >= end) continue;
      const key = `${left}:${right}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let forward = 0;
  let backward = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const next = (sample + 1) % sampleCount;
    const ahead = count.get(`${start + sample}:${start + next}`) ?? 0;
    const behind = count.get(`${start + next}:${start + sample}`) ?? 0;
    if (ahead === 1 && behind === 0) forward += 1;
    if (behind === 1 && ahead === 0) backward += 1;
  }
  if (forward === sampleCount && backward === 0) return true;
  if (backward === sampleCount && forward === 0) return false;
  return null;
}

function capRing(base: number, sampleCount: number, boundaryForward: boolean) {
  const triangles: number[] = [];
  for (let sample = 1; sample < sampleCount - 1; sample += 1) {
    triangles.push(
      base,
      base + (boundaryForward ? sample + 1 : sample),
      base + (boundaryForward ? sample : sample + 1),
    );
  }
  return triangles;
}

function duplicatePositions(positions: Float32Array, vertexCount: number) {
  const cell = BOOLEAN_CONDITIONING_SETTINGS.nearWeldReportDistance;
  const buckets = new Map<string, number[]>();
  let exact = 0;
  let near = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const ix = Math.round(x / cell);
    const iy = Math.round(y / cell);
    const iz = Math.round(z / cell);
    let matched = false;
    for (let dx = -1; dx <= 1 && !matched; dx += 1) {
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        for (let dz = -1; dz <= 1 && !matched; dz += 1) {
          const list = buckets.get(`${ix + dx}:${iy + dy}:${iz + dz}`);
          if (!list) continue;
          for (const other of list) {
            const ox = positions[other * 3];
            const oy = positions[other * 3 + 1];
            const oz = positions[other * 3 + 2];
            if (ox === x && oy === y && oz === z) {
              exact += 1;
              matched = true;
              break;
            }
            if (Math.hypot(ox - x, oy - y, oz - z) <= cell) {
              near += 1;
              matched = true;
              break;
            }
          }
        }
      }
    }
    if (!matched) {
      const key = `${ix}:${iy}:${iz}`;
      const list = buckets.get(key) ?? [];
      list.push(vertex);
      buckets.set(key, list);
    }
  }
  return { exact, near };
}

function validBooleanMesh(mesh: IsoMesh) {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return false;
  if (mesh.normals.length !== mesh.positions.length) return false;
  if (mesh.triangles < 1 || mesh.indices.length !== mesh.triangles * 3) return false;
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 1) {
    if (!Number.isFinite(mesh.positions[index]) || !Number.isFinite(mesh.normals[index])) return false;
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (corners.some((corner) => corner < 0 || corner >= vertexCount)) return false;
  }
  return true;
}

function faceArea(positions: Float32Array, corners: number[]) {
  const a = corners[0] * 3;
  const b = corners[1] * 3;
  const c = corners[2] * 3;
  const abx = positions[b] - positions[a];
  const aby = positions[b + 1] - positions[a + 1];
  const abz = positions[b + 2] - positions[a + 2];
  const acx = positions[c] - positions[a];
  const acy = positions[c + 1] - positions[a + 1];
  const acz = positions[c + 2] - positions[a + 2];
  return Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
}

function recomputeNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const area = faceArea(positions, [indices[index], indices[index + 1], indices[index + 2]]);
    if (area <= 1e-20) continue;
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const offset of [a, b, c]) {
      normals[offset] += nx;
      normals[offset + 1] += ny;
      normals[offset + 2] += nz;
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const span = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
    if (span > 1e-8) {
      normals[offset] /= span;
      normals[offset + 1] /= span;
      normals[offset + 2] /= span;
    } else normals[offset + 1] = 1;
  }
  return normals;
}

function union(parent: number[], left: number, right: number) {
  const a = find(parent, left);
  const b = find(parent, right);
  if (a !== b) parent[b] = a;
}

function find(parent: number[], index: number) {
  let cursor = index;
  while (parent[cursor] !== cursor) cursor = parent[cursor];
  while (parent[index] !== cursor) {
    const next = parent[index];
    parent[index] = cursor;
    index = next;
  }
  return cursor;
}
