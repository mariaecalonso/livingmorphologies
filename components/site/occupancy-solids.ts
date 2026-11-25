import type { ClusterAssemblyModel } from "./cluster-assembly-layer";
import { fetchFinishedMeshPacked } from "@/lib/skill4/finished-mesh-client";
import { centerFinishedMesh, type ClusterSitePose, type PlacedCluster } from "@/lib/skill5/placed-cluster";
import type { GumballPose } from "@/lib/skill5/gumball";

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

export async function fetchOccupancyMesh(programId: string, clusterId: string, _signal?: AbortSignal) {
  const packed = await fetchFinishedMeshPacked(programId, clusterId);
  if (!packed?.positions || !packed.indices) return null;
  return {
    positions: centerFinishedMesh(unpackF32(packed.positions)),
    indices: unpackU32(packed.indices),
  };
}

/** Gumball uses radians; ClusterSitePose stores yaw in degrees. */
export function occupancyPoseToGumball(pose: ClusterSitePose): GumballPose {
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    rotationY: pose.rotationY * Math.PI / 180,
    rotationX: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
}

export function gumballToOccupancyPose(pose: GumballPose, mirror: ClusterSitePose["mirror"] = null): ClusterSitePose {
  const degrees = ((pose.rotationY * 180 / Math.PI) % 360 + 360) % 360;
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    rotationY: degrees,
    mirror: mirror ?? null,
  };
}

export function occupancyModel(
  occupancy: readonly PlacedCluster[],
  meshes: Record<string, { positions: Float32Array; indices: Uint32Array } | null>,
  live?: (GumballPose & { id: string }) | null,
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
      const pose = live?.id === record.occupancyId
        ? gumballToOccupancyPose(live, record.transform.mirror)
        : record.transform;
      return [{
        id: record.occupancyId,
        positions: mesh.positions,
        indices: mesh.indices,
        color: "#f5f5f2",
        opacity: 1,
        pose,
      }];
    }),
    voids: [],
    hybrid: null,
    wrap: null,
  };
}
