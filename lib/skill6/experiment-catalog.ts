import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AssemblyValidation } from "./catalog";
import type { ClusterRecord } from "./contract";

/** Ground-first Small clusters. Separate from the catalog. Opening it does not search or assemble. */
export const SMALL_GROUND_EXPERIMENT = "small-ground-v1";
export const SMALL_GROUND_V2 = "small-ground-v2";
/** Compact, branching, and vertical rankings. Separate from the catalog and the small-ground runs. */
export const ORGANIZATION_EXPERIMENT = "organization-v1";
export const ORGANIZATION_STRATEGIES = ["compact", "branching", "vertical"] as const;
/** Four-engine prototypes. Separate from the catalog and earlier organization runs. */
export const INITIAL_CLUSTERING_LAB = "initial-clustering-lab";
/** Later four-engine runs that can pass two tiles. The two-tile lab is not overwritten. */
export const INITIAL_CLUSTERING_COVERAGE = "initial-clustering-coverage";
/** Refined engines at five, six, and seven tiles on a pair-checked pool. Earlier collections are not overwritten. */
export const CLUSTERING_EXPANSION = "clustering-expansion-v1";
/** Five-tile checkpoint. Compact is reused from Expansion. Branching is generated here. Six and seven are not in this collection. */
export const CLUSTERING_FIVE_TILE = "clustering-five-tile-v1";
/** Exact 2–7 tile batch. Reuses validated meshes. Earlier collections are not overwritten. */
export const CLUSTERING_OVERNIGHT = "clustering-overnight-v1";
/** Widening and wide fan at 420 tests. The overnight chain and the 210-test share stay as written. */
export const CLUSTERING_GRAPH_BUDGET = "clustering-graph-budget-v1";
/** Seven-tile Rule search with a doubled exploration cap. The overnight runs stay as written. */
export const CLUSTERING_RULE_LARGE = "clustering-rule-large-v1";

export const SMALL_GROUND_DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", SMALL_GROUND_EXPERIMENT);

export type ExperimentDiagnostic = {
  id: string;
  targetTiles: number;
  rootId: string;
  seed: number;
  status: ClusterRecord["status"];
  tiles: number;
  reason: string;
};

export type SmallGroundReport = {
  version: string;
  note: string;
  budget: { evaluations: number; backtracks: number; triesPerDepth: number };
  seeds: number[];
  order: "spread";
  attempted: number;
  bySize: Record<string, { attempted: number; rigid: number; assembled: number; validated: number }>;
  validated: ClusterRecord[];
  diagnostics: ExperimentDiagnostic[];
  validation: Record<string, AssemblyValidation>;
  review: { id: string; reading: string; directions: string[]; branchPoints: string[]; minContactArea: number; maxTilt: number }[];
  /** Present on the Initial Clustering Lab. Viewable records include partial and failed assemblies. */
  records?: ClusterRecord[];
  provisional?: string[];
  rows?: LabRunRow[];
};

/** One Initial Clustering Lab run. Achieved tiles can be fewer than the target. */
export type LabRunRow = {
  id: string;
  engine: "rule" | "graph" | "wfc" | "evolve";
  morphology: string;
  targetTiles: number;
  tiles: number;
  status: ClusterRecord["status"];
  stop: string | null;
  /** Target reached and the refined assembly passed. */
  validated: boolean;
  /** The refined assembly passed, whether or not the target was reached. */
  partial: boolean;
  penetrations: number | null;
  maxPenetration: number | null;
  milliseconds: number;
  trace: string;
  reason: string | null;
  /** Expansion runs only. Whole-cluster readings, 0–1. */
  shape?: { compact: number; branching: number; vertical: number; quality: number; balanced: number; depth: number; leaves: number; branchPoints: number; levels: number; directions: string[]; minJointArea: number; groundSeams: number; unique: number };
  lift?: number | null;
  duplicateOf?: string | null;
  attempts?: { candidate: string; tiles: number; passed: boolean; reasons: string[] }[];
};

export function readSmallGroundReport(): SmallGroundReport | null {
  return readExperimentReport(SMALL_GROUND_EXPERIMENT);
}

export function readExperimentReport(id: string): SmallGroundReport | null {
  if (id !== SMALL_GROUND_EXPERIMENT && id !== SMALL_GROUND_V2 && id !== ORGANIZATION_EXPERIMENT && id !== INITIAL_CLUSTERING_LAB && id !== INITIAL_CLUSTERING_COVERAGE && id !== CLUSTERING_EXPANSION && id !== CLUSTERING_FIVE_TILE && id !== CLUSTERING_OVERNIGHT && id !== CLUSTERING_GRAPH_BUDGET && id !== CLUSTERING_RULE_LARGE) return null;
  const file = path.join(process.cwd(), "data", "skill6", "experiments", id, "index.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as SmallGroundReport;
}
