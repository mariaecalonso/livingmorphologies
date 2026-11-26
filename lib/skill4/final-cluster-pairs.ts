/** Client-safe Final Clusters pair catalog. No Node or Skill 4 generator imports. */

export type FinalClusterKind = "workspace" | "lobby" | "gathering";

export type FinalClusterPairId =
  | "workspace-workspace"
  | "workspace-lobby"
  | "workspace-gathering"
  | "lobby-lobby"
  | "lobby-gathering"
  | "gathering-gathering"
  | "mixed";

export type FinalClusterPair = {
  id: FinalClusterPairId;
  a: FinalClusterKind;
  b: FinalClusterKind;
  label: string;
};

/** Pair catalog for Final Clusters. Order is fixed. */
export const FINAL_CLUSTER_PAIRS: readonly FinalClusterPair[] = [
  { id: "workspace-workspace", a: "workspace", b: "workspace", label: "Workspace + Workspace" },
  { id: "workspace-lobby", a: "workspace", b: "lobby", label: "Lobby + Workspace" },
  { id: "workspace-gathering", a: "workspace", b: "gathering", label: "Workspace + Gathering" },
  { id: "lobby-lobby", a: "lobby", b: "lobby", label: "Lobby + Lobby" },
  { id: "lobby-gathering", a: "lobby", b: "gathering", label: "Lobby + Gathering" },
  { id: "gathering-gathering", a: "gathering", b: "gathering", label: "Gathering + Gathering" },
  { id: "mixed", a: "lobby", b: "workspace", label: "Mixed Program" },
] as const;

/** Protected v5 clusters occupy indexes 0–14. Indexes 15–18 are appended sizes. */
export const FINAL_CLUSTER_BASE_COUNT = 15;
/** Indexes 0–18 are frozen. Index 19 is the closing cluster in each category. */
export const FINAL_CLUSTERS_PER_PAIR = 20;
export const FINAL_CLUSTER_GENERATOR = "skill4-final-clusters-v5";

/** Three clusters of each size from 2 through 6. */
export const FINAL_CLUSTER_SIZE_SCHEDULE = [2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6] as const;

/** Mixed Program: three 3s, four 4s, four 5s, four 6s. Minimum size is 3. */
export const FINAL_CLUSTER_MIXED_SIZE_SCHEDULE = [3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6] as const;

/** Appended after the protected 15. Two sevens and two eights in every category. */
export const FINAL_CLUSTER_EXTENSION_SCHEDULE = [7, 7, 8, 8] as const;

export function sizeScheduleForPair(sameTypology: boolean, _uniquePoolSize?: number): readonly number[] {
  const base = sameTypology ? FINAL_CLUSTER_SIZE_SCHEDULE : FINAL_CLUSTER_SIZE_SCHEDULE;
  return [...base, ...FINAL_CLUSTER_EXTENSION_SCHEDULE];
}

export function sizeScheduleForId(pairId: FinalClusterPairId): readonly number[] {
  const base = pairId === "mixed" ? FINAL_CLUSTER_MIXED_SIZE_SCHEDULE : FINAL_CLUSTER_SIZE_SCHEDULE;
  return [...base, ...FINAL_CLUSTER_EXTENSION_SCHEDULE];
}

/** Longest allowed collinear run before growth must turn. */
export const FINAL_CLUSTER_MAX_LINE = 3;
/** Tallest allowed vertical stack in one column. */
export const FINAL_CLUSTER_MAX_VERTICAL = 3;

/**
 * One structural brief per catalog slot so the ten clusters do not collapse
 * onto the same organization. Order matches FINAL_CLUSTER_SIZE_SCHEDULE.
 */
/** Realized topology classes. Compact is not one of these. */
export const FINAL_CLUSTER_GROWTH_CHARACTERS = ["linear", "angular", "branching", "vertical"] as const;

export type FinalClusterGrowthCharacter = (typeof FINAL_CLUSTER_GROWTH_CHARACTERS)[number];

/** Automatic soft biases. Compact is assigned. It is not a realized class. */
export const FINAL_CLUSTER_GROWTH_BIASES = ["linear", "angular", "branching", "vertical", "compact"] as const;

export type FinalClusterGrowthBias = (typeof FINAL_CLUSTER_GROWTH_BIASES)[number];

/** @deprecated Use FINAL_CLUSTER_GROWTH_CHARACTERS. Kept so older imports still typecheck. */
export const FINAL_CLUSTER_STRUCTURE_INTENTS = FINAL_CLUSTER_GROWTH_CHARACTERS;

export type FinalClusterStructureIntent = FinalClusterGrowthCharacter;

/** Seated tile pose for catalog thumbs. No hybrid mesh payload. */
export type FinalClusterTilePose = {
  instanceId: string;
  archetypeId: string;
  transform: { x: number; y: number; z: number };
  rotationQuarter: number;
  mirror: null | "x" | "y" | "z";
  rotation?: number[] | null;
};

/** Lightweight card for the Final Clusters board. Full film mesh stays in mesh files. */
export type FinalClusterSummary = {
  id: string;
  pairId: FinalClusterPairId;
  label: string;
  seed: number;
  targetTiles: number;
  tileCount: number;
  names: string[];
  tiles: FinalClusterTilePose[];
  typologyMix: Record<FinalClusterKind, number>;
  /** Assigned soft bias. Index 19 stores this on `intent`; its `character` is the realized primary. */
  assignedBias?: FinalClusterGrowthBias;
  /** Realized primary from the stored tree. One of the four topology classes. */
  realizedPrimary?: FinalClusterGrowthCharacter;
  realizedSecondary?: FinalClusterGrowthCharacter[];
  /** Shortest registration side divided by the longest. */
  balance?: number;
  character?: FinalClusterGrowthCharacter;
  hybridReady: boolean;
  validated: boolean;
  generator: typeof FINAL_CLUSTER_GENERATOR;
};

export type FinalClustersCatalogDocument = {
  contract: "skill4-final-clusters-v1";
  generatedAt: string;
  perPair: number;
  pairs: FinalClusterPairId[];
  clusters: FinalClusterSummary[];
};

export function emptyCatalog(): FinalClustersCatalogDocument {
  return {
    contract: "skill4-final-clusters-v1",
    generatedAt: new Date().toISOString(),
    perPair: FINAL_CLUSTERS_PER_PAIR,
    pairs: FINAL_CLUSTER_PAIRS.map((pair) => pair.id),
    clusters: [],
  };
}

export function kindsForPair(pair: FinalClusterPair): FinalClusterKind[] {
  if (pair.id === "mixed") return ["lobby", "workspace", "gathering"];
  return pair.a === pair.b ? [pair.a] : [pair.a, pair.b];
}
