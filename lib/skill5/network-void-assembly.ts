import { readFileSync } from "node:fs";
import type { ClusterSitePose } from "./placed-cluster";
import { placeSolidOnSite, type PositionedSolid } from "./network-constrained-void";

/**
 * Reads one frozen Final Cluster and places its stored Shrink Wrap.
 * That mesh is the individual cluster solid. Parents and connectors stay in the catalog record and are not the occupancy.
 * Nothing is written.
 */
export function loadPositionedCluster(pairId: string, clusterId: string, pose: ClusterSitePose): PositionedSolid & { shrinkWrapTriangles: number } {
  const pair = JSON.parse(readFileSync(`data/skill4/final-clusters-pairs/${pairId}.json`, "utf8")) as {
    clusters: { id: string }[];
  };
  if (!pair.clusters.some((item) => item.id === clusterId)) throw new Error(`cluster ${clusterId} is not in the frozen catalog`);
  const stored = JSON.parse(readFileSync(`data/skill4/final-clusters/${pairId}/${clusterId.replace(":", "__")}.json`, "utf8")) as {
    mesh?: { triangles?: number; positions?: string; indices?: string } | null;
  };
  const mesh = unpack(stored.mesh ?? null);
  if (!mesh) throw new Error(`cluster ${clusterId} has no Shrink Wrap`);
  const solid = placeSolidOnSite(clusterId, mesh, pose);
  return { ...solid, shrinkWrapTriangles: mesh.indices.length / 3 };
}

function unpack(packed: { triangles?: number; positions?: string; indices?: string } | null) {
  if (!packed?.positions || !packed.indices || !(packed.triangles && packed.triangles > 4)) return null;
  const positions = copyFloats(packed.positions);
  const indices = copyIndices(packed.indices);
  if (positions.length < 9 || indices.length < 12) return null;
  return { positions, indices };
}

function copyFloats(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Float32Array(copy);
}

function copyIndices(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Uint32Array(copy);
}
