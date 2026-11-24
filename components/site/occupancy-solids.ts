import type { ClusterAssemblyModel } from "./cluster-assembly-layer";
import { poseFinishedMesh, type PlacedCluster } from "@/lib/skill5/placed-cluster";

type PackedMesh = { positions?: string; indices?: string };

function unpackF32(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Float32Array(bytes.buffer);
}

function unpackU32(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Uint32Array(bytes.buffer);
}

export function occupancyMeshKey(record: Pick<PlacedCluster, "programId" | "finishedClusterId">) {
  return `${record.programId}:${record.finishedClusterId}`;
}

export async function fetchOccupancyMesh(programId: string, clusterId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/skill4/finished-mesh?program=${encodeURIComponent(programId)}&id=${encodeURIComponent(clusterId)}`, { signal, cache: "no-store" });
  const body = await response.json() as { mesh?: PackedMesh | null } | null;
  if (!body?.mesh?.positions || !body.mesh.indices) return null;
  return {
    positions: unpackF32(body.mesh.positions),
    indices: unpackU32(body.mesh.indices),
  };
}

export function occupancyModel(
  occupancy: readonly PlacedCluster[],
  meshes: Record<string, { positions: Float32Array; indices: Uint32Array } | null>,
): ClusterAssemblyModel {
  return {
    zoning: false,
    clusters: true,
    connections: false,
    massing: false,
    branches: [],
    zones: [],
    anchors: [],
    link: null,
    solids: occupancy.flatMap((record) => {
      const mesh = meshes[occupancyMeshKey(record)];
      if (!mesh) return [];
      return [{
        id: record.occupancyId,
        positions: poseFinishedMesh(mesh.positions, record.transform),
        indices: mesh.indices,
        color: "#f5f5f2",
        opacity: 1,
      }];
    }),
    voids: [],
    hybrid: null,
    wrap: null,
  };
}
