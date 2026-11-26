import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { registrationSpan } from "./compact-measures";
import { FINAL_CLUSTER_GROWTH_BIASES, FINAL_CLUSTER_PAIRS, type FinalClusterGrowthBias, type FinalClusterPairId } from "./final-cluster-pairs";
import { readGrowth, type GrowthCharacter } from "./growth-reading";

type StoredTile = {
  instanceId: string;
  archetypeId: string;
  transform: { x: number; y: number; z: number };
  rotationQuarter: number;
  mirror: null | "x" | "y" | "z";
  rotation?: number[] | null;
};
type StoredEdge = { tileAId: string; tileBId: string; selectedMockId?: string; separation?: number };
type StoredCluster = {
  id: string;
  pairId: FinalClusterPairId;
  label: string;
  tileCount: number;
  names: string[];
  tiles: StoredTile[];
  connections?: StoredEdge[];
  intent?: string;
  character?: string;
  validated?: boolean;
};

export type FinalClusterStats = ReturnType<typeof readFinalClusterStats>;

const CHARACTERS: GrowthCharacter[] = ["linear", "angular", "branching", "vertical"];
const BIASES: FinalClusterGrowthBias[] = [...FINAL_CLUSTER_GROWTH_BIASES];

function assignedBiasOf(cluster: StoredCluster): FinalClusterGrowthBias | null {
  const value = cluster.intent ?? cluster.character;
  return BIASES.includes(value as FinalClusterGrowthBias) ? value as FinalClusterGrowthBias : null;
}

function poseKey(cluster: StoredCluster) {
  return cluster.tiles
    .map((tile) => `${tile.archetypeId}@${Math.round(tile.transform.x)}:${Math.round(tile.transform.y)}:${Math.round(tile.transform.z)}:q${tile.rotationQuarter}`)
    .sort()
    .join("|");
}

function nearKey(cluster: StoredCluster, primary: GrowthCharacter) {
  const reading = readGrowth(cluster.tiles, cluster.connections ?? []);
  const bin = (value: number) => Math.round(value / 8);
  const modules = cluster.tiles.map((tile) => tile.archetypeId).sort().join("+");
  return `${cluster.pairId}|${modules}|${primary}|d${reading.maxDegree}|x${bin(reading.extent.x)}|y${bin(reading.extent.y)}|z${bin(reading.extent.z)}`;
}

let statsCache: { stamp: string; value: ReturnType<typeof computeFinalClusterStats> } | null = null;

function statsStamp() {
  const root = path.join(process.cwd(), "data", "skill4", "final-clusters-pairs");
  const files = [
    path.join(process.cwd(), "data", "skill4", "final-clusters-review.json"),
    ...FINAL_CLUSTER_PAIRS.map((pair) => path.join(root, `${pair.id}.json`)),
  ];
  return files.map((file) => (existsSync(file) ? `${file}:${statSync(file).mtimeMs}` : `${file}:0`)).join("|");
}

export function readFinalClusterStats() {
  const stamp = statsStamp();
  if (statsCache?.stamp === stamp) return statsCache.value;
  const value = computeFinalClusterStats();
  statsCache = { stamp, value };
  return value;
}

function computeFinalClusterStats() {
  const root = path.join(process.cwd(), "data", "skill4", "final-clusters-pairs");
  const reviewPath = path.join(process.cwd(), "data", "skill4", "final-clusters-review.json");
  const review = existsSync(reviewPath)
    ? JSON.parse(readFileSync(reviewPath, "utf8")) as {
      geometricDiversity?: string;
      nearMatches?: { ids: string[]; status: string; note: string }[];
    }
    : { nearMatches: [] };

  const clusters: StoredCluster[] = [];
  for (const pair of FINAL_CLUSTER_PAIRS) {
    const file = path.join(root, `${pair.id}.json`);
    if (!existsSync(file)) continue;
    const body = JSON.parse(readFileSync(file, "utf8")) as { clusters?: StoredCluster[] };
    clusters.push(...(body.clusters ?? []));
  }

  const sizes = new Map<number, number>();
  const archetypes = new Map<string, number>();
  const realized = new Map<string, number>();
  const assigned = new Map<string, number>();
  const secondary = new Map<string, number>();
  const balances: number[] = [];
  const connectors = new Map<string, number>();
  const byPair = new Map<string, {
    id: FinalClusterPairId;
    label: string;
    count: number;
    validated: number;
    sizes: Record<number, number>;
    realized: Record<string, number>;
    assigned: Record<string, number>;
    balanceMean: number;
    secondary: Record<string, number>;
    connectors: Record<string, number>;
    edges: number;
  }>();
  const exact = new Map<string, string[]>();
  const near = new Map<string, string[]>();
  const distances: number[] = [];
  let edges = 0;
  let validated = 0;

  for (const pair of FINAL_CLUSTER_PAIRS) {
    byPair.set(pair.id, {
      id: pair.id,
      label: pair.label,
      count: 0,
      validated: 0,
      sizes: {},
      realized: {},
      assigned: {},
      balanceMean: 0,
      secondary: {},
      connectors: {},
      edges: 0,
    });
  }

  for (const cluster of clusters) {
    const pair = byPair.get(cluster.pairId);
    if (!pair) continue;
    pair.count += 1;
    if (cluster.validated !== false) {
      validated += 1;
      pair.validated += 1;
    }
    sizes.set(cluster.tileCount, (sizes.get(cluster.tileCount) ?? 0) + 1);
    pair.sizes[cluster.tileCount] = (pair.sizes[cluster.tileCount] ?? 0) + 1;
    const reading = readGrowth(cluster.tiles, cluster.connections ?? []);
    const bias = assignedBiasOf(cluster);
    if (bias) {
      assigned.set(bias, (assigned.get(bias) ?? 0) + 1);
      pair.assigned[bias] = (pair.assigned[bias] ?? 0) + 1;
    }
    const balance = registrationSpan(cluster.tiles).balance;
    balances.push(balance);
    pair.balanceMean = pair.count > 0 ? ((pair.balanceMean * (pair.count - 1)) + balance) / pair.count : balance;
    realized.set(reading.primary, (realized.get(reading.primary) ?? 0) + 1);
    pair.realized[reading.primary] = (pair.realized[reading.primary] ?? 0) + 1;
    for (const trait of reading.secondary) {
      secondary.set(trait, (secondary.get(trait) ?? 0) + 1);
      pair.secondary[trait] = (pair.secondary[trait] ?? 0) + 1;
    }
    for (const tile of cluster.tiles) archetypes.set(tile.archetypeId, (archetypes.get(tile.archetypeId) ?? 0) + 1);
    exact.set(poseKey(cluster), [...(exact.get(poseKey(cluster)) ?? []), cluster.id]);
    const nearId = nearKey(cluster, reading.primary);
    near.set(nearId, [...(near.get(nearId) ?? []), cluster.id]);
    for (const edge of cluster.connections ?? []) {
      edges += 1;
      pair.edges += 1;
      const id = edge.selectedMockId || "none";
      connectors.set(id, (connectors.get(id) ?? 0) + 1);
      pair.connectors[id] = (pair.connectors[id] ?? 0) + 1;
      if (edge.separation) distances.push(edge.separation);
    }
  }

  const exactGroups = [...exact.values()].filter((ids) => ids.length > 1);
  const nearGroups = [...near.values()].filter((ids) => ids.length > 1);
  const accepted = new Set((review.nearMatches ?? []).filter((item) => item.status === "accepted").map((item) => item.ids.slice().sort().join("|")));
  const example = clusters.find((cluster) => cluster.tileCount >= 4 && cluster.tileCount <= 5 && (cluster.connections?.length ?? 0) > 0)
    ?? clusters.find((cluster) => (cluster.connections?.length ?? 0) > 0)
    ?? null;

  return {
    generatedFrom: "data/skill4/final-clusters-pairs",
    clusters: clusters.length,
    validated,
    categories: FINAL_CLUSTER_PAIRS.length,
    perCategory: FINAL_CLUSTER_PAIRS.map((pair) => byPair.get(pair.id)?.count ?? 0),
    archetypeCoverage: archetypes.size,
    archetypeFrequency: [...archetypes.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({
      id,
      name: SITE_ARCHETYPES.find((item) => item.archetypeId === id)?.name ?? id,
      program: SITE_ARCHETYPES.find((item) => item.archetypeId === id)?.program ?? null,
      count,
    })),
    morphologies: SITE_ARCHETYPES.map((item) => ({
      id: item.archetypeId,
      name: item.name,
      program: item.program,
    })),
    instances: [...archetypes.values()].reduce((sum, count) => sum + count, 0),
    edges,
    sizes: [...sizes.entries()].sort((a, b) => a[0] - b[0]).map(([size, count]) => ({ size, count })),
    realized: Object.fromEntries(CHARACTERS.map((key) => [key, realized.get(key) ?? 0])),
    assigned: Object.fromEntries(BIASES.map((key) => [key, assigned.get(key) ?? 0])),
    balance: {
      mean: balances.length ? Math.round((balances.reduce((sum, value) => sum + value, 0) / balances.length) * 1000) / 1000 : 0,
      count: balances.length,
    },
    secondary: Object.fromEntries(CHARACTERS.map((key) => [key, secondary.get(key) ?? 0])),
    categoriesDetail: FINAL_CLUSTER_PAIRS.map((pair) => {
      const detail = byPair.get(pair.id)!;
      return { ...detail, balanceMean: Math.round(detail.balanceMean * 1000) / 1000 };
    }),
    connectors: Object.fromEntries([...connectors.entries()].sort((a, b) => b[1] - a[1])),
    distance: distances.length
      ? {
          count: distances.length,
          min: Math.min(...distances),
          max: Math.max(...distances),
          mean: distances.reduce((sum, value) => sum + value, 0) / distances.length,
        }
      : null,
    exactDuplicateGroups: exactGroups,
    nearMatches: nearGroups.map((ids) => {
      const key = ids.slice().sort().join("|");
      const record = (review.nearMatches ?? []).find((item) => item.ids.slice().sort().join("|") === key);
      return {
        ids,
        accepted: accepted.has(key),
        note: record?.note ?? "",
      };
    }),
    diversityStatus: review.geometricDiversity ?? "",
    example: example
      ? {
          id: example.id,
          pairId: example.pairId,
          label: example.label,
          tileCount: example.tileCount,
          names: example.names,
          tiles: example.tiles,
        }
      : null,
  };
}
