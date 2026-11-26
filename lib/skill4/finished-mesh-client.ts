/**
 * Browser cache for finished-cluster mesh payloads.
 * Placement thumbnails and site occupancy share the same files; keep one in-flight fetch per id.
 */

export type PackedFinishedMesh = {
  triangles?: number;
  positions?: string;
  normals?: string;
  indices?: string;
};

export type FinishedClusterMeshFile = {
  mesh?: PackedFinishedMesh | null;
  connections?: { id: string; validatedHybrid: PackedFinishedMesh | null }[];
};

type MeshResponse = FinishedClusterMeshFile | null;

const pending = new Map<string, Promise<PackedFinishedMesh | null>>();

function keyOf(programId: string, clusterId: string) {
  return `${programId}:${clusterId}`;
}

export function fetchFinishedClusterAssembly(programId: string, clusterId: string): Promise<FinishedClusterMeshFile | null> {
  const key = keyOf(programId, clusterId);
  const open = pending.get(key);
  if (open) return open;
  const request = fetch(`/api/skill4/finished-mesh?program=${encodeURIComponent(programId)}&id=${encodeURIComponent(clusterId)}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json() as MeshResponse;
      return body ?? null;
    })
    .catch(() => {
      pending.delete(key);
      return null;
    });
  pending.set(key, request);
  return request;
}

export function fetchFinishedMeshPacked(programId: string, clusterId: string): Promise<PackedFinishedMesh | null> {
  return fetchFinishedClusterAssembly(programId, clusterId).then((body) => body?.mesh ?? null);
}

const ranks = new Map<string, Promise<unknown>>();

export function fetchPlacementRank(programId: string): Promise<unknown> {
  const open = ranks.get(programId);
  if (open) return open;
  const request = fetch(`/api/skill4/finished-catalog?program=${encodeURIComponent(programId)}&view=placement`)
    .then(async (response) => {
      if (!response.ok) throw new Error("unread");
      return response.json();
    })
    .catch((error) => {
      ranks.delete(programId);
      throw error;
    });
  ranks.set(programId, request);
  return request;
}
