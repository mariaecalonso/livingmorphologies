import type { IsoMesh } from "../scan/isomesh";
import { isoMeshToBooleanMesh } from "./boolean-adapter";
import { diagnoseTopology } from "./boolean-conditioning";
import type { ModuleHandoff } from "./adapt";

/**
 * Backend preflight for a Skill 03 mesh.
 * The incoming mesh is read only. Cleanup is stored on a derived copy.
 */
export const GEOMETRY_PREFLIGHT_SETTINGS = {
  version: "skill4-geometry-preflight-v1",
  weldTolerance: 1e-6,
} as const;

export type GeometryPreflightReport = {
  status: "ready" | "unresolved" | "invalid";
  originalGeometry: IsoMesh;
  physicalGeometry: IsoMesh | null;
  topologyChanged: boolean;
  removedDuplicateVertices: number;
  removedDuplicateTriangles: number;
  removedDegenerateTriangles: number;
  removedUnusedVertices: number;
  normalsRebuilt: boolean;
  toleranceWelded: boolean;
  orientationRepaired: boolean;
  manifoldReady: boolean;
  kernelStatus: string | null;
  reason: string;
};

const scratch = new ArrayBuffer(4);
const scratchFloat = new Float32Array(scratch);
const scratchBits = new Uint32Array(scratch);
const cache = new Map<string, Promise<GeometryPreflightReport>>();
let computations = 0;

export function geometryPreflightComputations() {
  return computations;
}

function floatBits(value: number) {
  scratchFloat[0] = value;
  return scratchBits[0];
}

function meshFingerprint(mesh: IsoMesh) {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };
  mix(mesh.positions.length);
  mix(mesh.indices.length);
  for (let index = 0; index < mesh.positions.length; index += 1) mix(floatBits(mesh.positions[index]));
  for (let index = 0; index < mesh.indices.length; index += 1) mix(mesh.indices[index]);
  return (hash >>> 0).toString(16);
}

export function geometryPreflightKey(moduleId: string, revision: number, mesh: IsoMesh) {
  return `${moduleId}@${revision}:${meshFingerprint(mesh)}`;
}

function invalid(mesh: IsoMesh, reason: string): GeometryPreflightReport {
  return {
    status: "invalid",
    originalGeometry: mesh,
    physicalGeometry: null,
    topologyChanged: false,
    removedDuplicateVertices: 0,
    removedDuplicateTriangles: 0,
    removedDegenerateTriangles: 0,
    removedUnusedVertices: 0,
    normalsRebuilt: false,
    toleranceWelded: false,
    orientationRepaired: false,
    manifoldReady: false,
    kernelStatus: null,
    reason,
  };
}

function finiteMesh(mesh: IsoMesh) {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return false;
  if (mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) return false;
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 1) {
    if (!Number.isFinite(mesh.positions[index])) return false;
  }
  for (let index = 0; index < mesh.indices.length; index += 1) {
    const vertex = mesh.indices[index];
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) return false;
  }
  return true;
}

function faceArea(positions: Float32Array, a: number, b: number, c: number) {
  const a3 = a * 3;
  const b3 = b * 3;
  const c3 = c * 3;
  const abx = positions[b3] - positions[a3];
  const aby = positions[b3 + 1] - positions[a3 + 1];
  const abz = positions[b3 + 2] - positions[a3 + 2];
  const acx = positions[c3] - positions[a3];
  const acy = positions[c3 + 1] - positions[a3 + 1];
  const acz = positions[c3 + 2] - positions[a3 + 2];
  return Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
}

function recomputeNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
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

function componentOfTriangles(indices: number[]) {
  const triangleCount = indices.length / 3;
  const parent = Array.from({ length: triangleCount }, (_, index) => index);
  const find = (index: number) => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    while (parent[index] !== cursor) {
      const next = parent[index];
      parent[index] = cursor;
      index = next;
    }
    return cursor;
  };
  const edges = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const left = indices[triangle * 3 + edge];
      const right = indices[triangle * 3 + ((edge + 1) % 3)];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const owner = edges.get(key);
      if (owner === undefined) edges.set(key, triangle);
      else {
        const a = find(owner);
        const b = find(triangle);
        if (a !== b) parent[b] = a;
      }
    }
  }
  const roots = new Map<number, number>();
  const ids = new Array<number>(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle);
    let id = roots.get(root);
    if (id === undefined) {
      id = roots.size;
      roots.set(root, id);
    }
    ids[triangle] = id;
  }
  return { ids, count: roots.size };
}

function repairOrientation(indices: number[]) {
  const triangleCount = indices.length / 3;
  const edges = new Map<string, { triangle: number; from: number; to: number }[]>();
  const corners: { from: number; to: number }[][] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const local: { from: number; to: number }[] = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const from = indices[triangle * 3 + edge];
      const to = indices[triangle * 3 + ((edge + 1) % 3)];
      local.push({ from, to });
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const uses = edges.get(key) ?? [];
      uses.push({ triangle, from, to });
      edges.set(key, uses);
    }
    corners.push(local);
  }
  for (const uses of edges.values()) {
    if (uses.length > 2) return { indices, repaired: false };
  }
  const flip = new Array<boolean>(triangleCount).fill(false);
  const seen = new Array<boolean>(triangleCount).fill(false);
  let conflict = false;
  for (let start = 0; start < triangleCount && !conflict; start += 1) {
    if (seen[start]) continue;
    const queue = [start];
    seen[start] = true;
    while (queue.length > 0 && !conflict) {
      const current = queue.shift() ?? start;
      for (const edge of corners[current]) {
        const key = edge.from < edge.to ? `${edge.from}:${edge.to}` : `${edge.to}:${edge.from}`;
        const uses = edges.get(key) ?? [];
        if (uses.length !== 2) continue;
        const mine = uses[0].triangle === current ? uses[0] : uses[1];
        const other = uses[0].triangle === current ? uses[1] : uses[0];
        const aligned = mine.from === other.from && mine.to === other.to;
        const required = aligned ? !flip[current] : flip[current];
        if (!seen[other.triangle]) {
          seen[other.triangle] = true;
          flip[other.triangle] = required;
          queue.push(other.triangle);
        } else if (flip[other.triangle] !== required) conflict = true;
      }
    }
  }
  if (conflict) return { indices, repaired: false };
  const flipped = flip.filter(Boolean).length;
  if (flipped === 0) return { indices, repaired: false };
  const invert = flipped * 2 > triangleCount;
  const next = indices.slice();
  let repaired = false;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (flip[triangle] === invert) continue;
    const offset = triangle * 3;
    const swap = next[offset + 1];
    next[offset + 1] = next[offset + 2];
    next[offset + 2] = swap;
    repaired = true;
  }
  return { indices: next, repaired };
}

function pack(positions: Float32Array, indices: number[]) {
  const used = new Map<number, number>();
  const packed: number[] = [];
  const remapped: number[] = [];
  for (const vertex of indices) {
    let next = used.get(vertex);
    if (next === undefined) {
      next = packed.length / 3;
      used.set(vertex, next);
      packed.push(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]);
    }
    remapped.push(next);
  }
  const packedPositions = Float32Array.from(packed);
  const packedIndices = Uint32Array.from(remapped);
  return {
    positions: packedPositions,
    indices: packedIndices,
    removedUnusedVertices: positions.length / 3 - used.size,
    mesh: {
      positions: packedPositions,
      normals: recomputeNormals(packedPositions, packedIndices),
      indices: packedIndices,
      triangles: packedIndices.length / 3,
    } satisfies IsoMesh,
  };
}

function derivePhysicalCopy(mesh: IsoMesh) {
  const sourceCount = mesh.positions.length / 3;
  const canonical = new Array<number>(sourceCount).fill(-1);
  const exact = new Map<string, number>();
  const preliminary = componentOfTriangles(Array.from(mesh.indices));
  const vertexComponent = new Array<number>(sourceCount).fill(-1);
  for (let triangle = 0; triangle < preliminary.ids.length; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = mesh.indices[triangle * 3 + corner];
      if (vertexComponent[vertex] < 0) vertexComponent[vertex] = preliminary.ids[triangle];
    }
  }
  let removedDuplicateVertices = 0;
  for (let vertex = 0; vertex < sourceCount; vertex += 1) {
    const key = `${floatBits(mesh.positions[vertex * 3])}:${floatBits(mesh.positions[vertex * 3 + 1])}:${floatBits(mesh.positions[vertex * 3 + 2])}`;
    const existing = exact.get(key);
    if (existing === undefined) {
      exact.set(key, vertex);
      continue;
    }
    const sameComponent = vertexComponent[vertex] < 0 || vertexComponent[existing] < 0 || vertexComponent[vertex] === vertexComponent[existing];
    if (!sameComponent) continue;
    canonical[vertex] = existing;
    removedDuplicateVertices += 1;
  }
  const resolve = (vertex: number) => (canonical[vertex] >= 0 ? canonical[vertex] : vertex);
  const seen = new Set<string>();
  const kept: number[] = [];
  let removedDegenerateTriangles = 0;
  let removedDuplicateTriangles = 0;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [resolve(mesh.indices[index]), resolve(mesh.indices[index + 1]), resolve(mesh.indices[index + 2])];
    if (new Set(corners).size !== 3 || faceArea(mesh.positions, corners[0], corners[1], corners[2]) <= 1e-20) {
      removedDegenerateTriangles += 1;
      continue;
    }
    const key = [...corners].sort((left, right) => left - right).join(",");
    if (seen.has(key)) {
      removedDuplicateTriangles += 1;
      continue;
    }
    seen.add(key);
    kept.push(...corners);
  }
  if (kept.length < 3) return null;
  const oriented = repairOrientation(kept);
  const packed = pack(mesh.positions, oriented.indices);
  let positions = packed.positions;
  let indices = packed.indices;
  let toleranceWelded = false;
  const welded = toleranceWeld(positions, indices);
  if (welded) {
    positions = welded.positions;
    indices = welded.indices;
    toleranceWelded = true;
  }
  const physical: IsoMesh = {
    positions,
    normals: recomputeNormals(positions, indices),
    indices,
    triangles: indices.length / 3,
  };
  return {
    mesh: physical,
    removedDuplicateVertices,
    removedDuplicateTriangles,
    removedDegenerateTriangles,
    removedUnusedVertices: Math.max(0, packed.removedUnusedVertices - removedDuplicateVertices),
    orientationRepaired: oriented.repaired,
    toleranceWelded,
  };
}

function toleranceWeld(positions: Float32Array, indices: Uint32Array) {
  const tolerance = GEOMETRY_PREFLIGHT_SETTINGS.weldTolerance;
  const components = componentOfTriangles(Array.from(indices));
  const vertexCount = positions.length / 3;
  const vertexComponent = new Array<number>(vertexCount).fill(-1);
  for (let triangle = 0; triangle < components.ids.length; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[triangle * 3 + corner];
      if (vertexComponent[vertex] < 0) vertexComponent[vertex] = components.ids[triangle];
    }
  }
  const cell = tolerance;
  const buckets = new Map<string, number[]>();
  const redirect = new Array<number>(vertexCount).fill(-1);
  let welds = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const ix = Math.round(x / cell);
    const iy = Math.round(y / cell);
    const iz = Math.round(z / cell);
    let match = -1;
    for (let dx = -1; dx <= 1 && match < 0; dx += 1) {
      for (let dy = -1; dy <= 1 && match < 0; dy += 1) {
        for (let dz = -1; dz <= 1 && match < 0; dz += 1) {
          const list = buckets.get(`${ix + dx}:${iy + dy}:${iz + dz}`);
          if (!list) continue;
          for (const other of list) {
            if (vertexComponent[other] !== vertexComponent[vertex]) continue;
            const distance = Math.hypot(positions[other * 3] - x, positions[other * 3 + 1] - y, positions[other * 3 + 2] - z);
            if (distance > 0 && distance <= tolerance) {
              match = other;
              break;
            }
          }
        }
      }
    }
    if (match >= 0) {
      redirect[vertex] = match;
      welds += 1;
      continue;
    }
    const key = `${ix}:${iy}:${iz}`;
    const list = buckets.get(key) ?? [];
    list.push(vertex);
    buckets.set(key, list);
  }
  if (welds === 0) return null;
  const resolve = (vertex: number) => (redirect[vertex] >= 0 ? redirect[vertex] : vertex);
  const beforeAreas: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    beforeAreas.push(faceArea(positions, indices[index], indices[index + 1], indices[index + 2]));
  }
  const next: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const corners = [resolve(indices[index]), resolve(indices[index + 1]), resolve(indices[index + 2])];
    const area = faceArea(positions, corners[0], corners[1], corners[2]);
    if (beforeAreas[index / 3] > 1e-8 && area <= 1e-20) return null;
    if (new Set(corners).size !== 3) return null;
    next.push(...corners);
  }
  const after = componentOfTriangles(next);
  if (after.count !== components.count) return null;
  const packed = pack(positions, next);
  return { positions: packed.positions, indices: packed.indices };
}

export async function preflightGeometry(mesh: IsoMesh): Promise<GeometryPreflightReport> {
  computations += 1;
  if (!finiteMesh(mesh)) return invalid(mesh, "invalid-mesh");
  const derived = derivePhysicalCopy(mesh);
  if (!derived) return invalid(mesh, "no-derived-copy");
  const topology = diagnoseTopology(derived.mesh);
  const probe = await isoMeshToBooleanMesh(derived.mesh);
  probe.mesh?.release();
  const manifoldReady = probe.status === "ready" && topology.closed && topology.componentCount === 1 && topology.nonManifoldEdgeCount === 0;
  const topologyChanged = derived.removedDuplicateVertices > 0
    || derived.removedDuplicateTriangles > 0
    || derived.removedDegenerateTriangles > 0
    || derived.removedUnusedVertices > 0
    || derived.orientationRepaired
    || derived.toleranceWelded;
  let reason = "";
  if (!manifoldReady) {
    if (topology.boundaryEdgeCount > 0) reason = `boundary-edges:${topology.boundaryEdgeCount}`;
    else if (topology.componentCount !== 1) reason = `components:${topology.componentCount}`;
    else if (topology.nonManifoldEdgeCount > 0) reason = `non-manifold-edges:${topology.nonManifoldEdgeCount}`;
    else reason = probe.reason || probe.status;
  }
  return {
    status: manifoldReady ? "ready" : "unresolved",
    originalGeometry: mesh,
    physicalGeometry: derived.mesh,
    topologyChanged,
    removedDuplicateVertices: derived.removedDuplicateVertices,
    removedDuplicateTriangles: derived.removedDuplicateTriangles,
    removedDegenerateTriangles: derived.removedDegenerateTriangles,
    removedUnusedVertices: derived.removedUnusedVertices,
    normalsRebuilt: true,
    toleranceWelded: derived.toleranceWelded,
    orientationRepaired: derived.orientationRepaired,
    manifoldReady,
    kernelStatus: probe.status === "ready" ? "NoError" : probe.reason || probe.status,
    reason,
  };
}

export function ensureGeometryPreflight(moduleId: string, revision: number, mesh: IsoMesh) {
  const key = geometryPreflightKey(moduleId, revision, mesh);
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = preflightGeometry(mesh);
  cache.set(key, pending);
  return pending;
}

/** Starts preflight for final Skill 03 records. Display geometry is not replaced. */
export function scheduleSkill03Preflight(loaded: ReadonlyMap<string, ModuleHandoff>) {
  for (const handoff of loaded.values()) {
    if (handoff.status !== "ready" || handoff.source !== "skill03" || !handoff.selectedFinal) continue;
    void ensureGeometryPreflight(handoff.moduleId, handoff.revision, handoff.geometry);
  }
}

export async function physicalOperand(handoff: Extract<ModuleHandoff, { status: "ready" }>): Promise<IsoMesh> {
  if (handoff.source !== "skill03" || !handoff.selectedFinal) return handoff.geometry;
  const report = await ensureGeometryPreflight(handoff.moduleId, handoff.revision, handoff.geometry);
  return report.manifoldReady && report.physicalGeometry ? report.physicalGeometry : handoff.geometry;
}
