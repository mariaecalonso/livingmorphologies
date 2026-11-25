/** Client-safe Final Clusters pair catalog. No Node or Skill 4 generator imports. */

export type FinalClusterKind = "workspace" | "lobby" | "gathering";

export type FinalClusterPairId =
  | "workspace-workspace"
  | "workspace-lobby"
  | "workspace-gathering"
  | "lobby-lobby"
  | "lobby-gathering"
  | "gathering-gathering";

export type FinalClusterPair = {
  id: FinalClusterPairId;
  a: FinalClusterKind;
  b: FinalClusterKind;
  label: string;
};

/** Pair catalog for Final Clusters. Order is fixed. */
export const FINAL_CLUSTER_PAIRS: readonly FinalClusterPair[] = [
  { id: "workspace-workspace", a: "workspace", b: "workspace", label: "Workspace × Workspace" },
  { id: "workspace-lobby", a: "workspace", b: "lobby", label: "Workspace × Lobby" },
  { id: "workspace-gathering", a: "workspace", b: "gathering", label: "Workspace × Gathering" },
  { id: "lobby-lobby", a: "lobby", b: "lobby", label: "Lobby × Lobby" },
  { id: "lobby-gathering", a: "lobby", b: "gathering", label: "Lobby × Gathering" },
  { id: "gathering-gathering", a: "gathering", b: "gathering", label: "Gathering × Gathering" },
] as const;

export const FINAL_CLUSTERS_PER_PAIR = 10;
export const FINAL_CLUSTER_GENERATOR = "skill4-final-clusters-v3";

/**
 * Mixed-pair sizes: required 2 / 4 / 6, then middle exploration.
 * Same-typology pairs use sizeScheduleForPair so uniqueness caps do not
 * collapse most slots onto one count.
 */
export const FINAL_CLUSTER_SIZE_SCHEDULE = [2, 4, 6, 3, 5, 7, 4, 5, 6, 3] as const;

/**
 * Same typology with a full unique pool (~5). Cap at 4 tiles so the ten
 * slots stay fillable; size 5 forces the entire pool and collapses validation.
 * Each size appears at most four times.
 */
export const FINAL_CLUSTER_SAME_TYPE_SIZE_SCHEDULE = [2, 3, 4, 3, 2, 4, 3, 4, 2, 3] as const;

/** Same typology when only 2–3 archetypes can connect. */
export const FINAL_CLUSTER_SMALL_POOL_SIZE_SCHEDULE = [2, 3, 2, 3, 2, 3, 2, 3, 2, 3] as const;

export function sizeScheduleForPair(sameTypology: boolean, uniquePoolSize: number): readonly number[] {
  if (!sameTypology) return FINAL_CLUSTER_SIZE_SCHEDULE;
  if (uniquePoolSize <= 3) return FINAL_CLUSTER_SMALL_POOL_SIZE_SCHEDULE;
  return FINAL_CLUSTER_SAME_TYPE_SIZE_SCHEDULE;
}

/** Longest allowed collinear run before growth must turn. */
export const FINAL_CLUSTER_MAX_LINE = 3;
/** Tallest allowed vertical stack in one column. */
export const FINAL_CLUSTER_MAX_VERTICAL = 3;

/**
 * One structural brief per catalog slot so the ten clusters do not collapse
 * onto the same organization. Order matches FINAL_CLUSTER_SIZE_SCHEDULE.
 */
export const FINAL_CLUSTER_STRUCTURE_INTENTS = [
  "vertical-spine",
  "plan-spread",
  "l-elbow",
  "early-turn",
  "branch-from-seed",
  "branch-tips",
  "horizontal-first",
  "compact",
  "axis-alternate",
  "corner-stack",
] as const;

export type FinalClusterStructureIntent = (typeof FINAL_CLUSTER_STRUCTURE_INTENTS)[number];

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
  return pair.a === pair.b ? [pair.a] : [pair.a, pair.b];
}
