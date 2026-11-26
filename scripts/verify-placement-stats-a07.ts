/**
 * Lightweight verification for placement assembly statistics against frozen A07.
 * Run: npx tsx scripts/verify-placement-stats-a07.ts
 */
import { readFileSync } from "node:fs";
import { FINAL_CLUSTER_PAIRS } from "../lib/skill4/final-cluster-pairs";
import { centerFinishedMesh, readOccupancyList, type PlacedCluster } from "../lib/skill5/placed-cluster";
import { computePlacementAssemblyStats, placementElevationClass } from "../lib/skill5/placement-assembly-stats";
import { readZoningList } from "../lib/skill5/zoning";

function unpackF32(value: string) {
  const bytes = Buffer.from(value, "base64");
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Float32Array(copy);
}

function meshKey(record: Pick<PlacedCluster, "programId" | "finishedClusterId">) {
  return `${record.programId}:${record.finishedClusterId}`;
}

function loadMesh(programId: string, clusterId: string) {
  const path = `data/skill4/final-clusters/${programId}/${clusterId.replace(":", "__")}.json`;
  const stored = JSON.parse(readFileSync(path, "utf8")) as { mesh?: { positions?: string } };
  if (!stored.mesh?.positions) return null;
  return centerFinishedMesh(unpackF32(stored.mesh.positions));
}

const doc = JSON.parse(readFileSync("data/skill5/cluster-assemblies.json", "utf8")) as {
  selectedAssemblyId: string;
  assemblies: { assemblyId: string; occupancy: unknown; zones: unknown }[];
};
const assembly = doc.assemblies.find((item) => item.assemblyId === "A07");
if (!assembly) throw new Error("A07 not found");
const occupancy = readOccupancyList(assembly.occupancy);
const zones = readZoningList(assembly.zones);

const meshes: Record<string, { positions: Float32Array; indices: Uint32Array } | null> = {};
for (const record of occupancy) {
  const key = meshKey(record);
  if (meshes[key]) continue;
  const positions = loadMesh(record.programId, record.finishedClusterId);
  meshes[key] = positions ? { positions, indices: new Uint32Array(0) } : null;
}

const stats = computePlacementAssemblyStats({
  occupancy,
  zones,
  meshes,
  meshKey,
  mixes: {},
});

console.log({
  selected: doc.selectedAssemblyId,
  clusters: stats.clusterCount,
  zones: `${stats.occupiedZones} / ${stats.zoneCount}`,
  categoryCount: FINAL_CLUSTER_PAIRS.map((p) => stats.categories.find((c) => c.id === p.id)?.count ?? 0),
  hostKind: Object.fromEntries(stats.hostKinds.map((k) => [k.kind, k.count])),
  mirrored: stats.mirroredCount,
  ground: stats.groundCount,
  elevated: stats.elevatedCount,
  pending: stats.pendingElevation,
});

for (const record of occupancy) {
  const zone = zones.find((z) => z.id === record.zoneId);
  const positions = meshes[meshKey(record)]?.positions;
  placementElevationClass(record, zone, positions ?? null);
}