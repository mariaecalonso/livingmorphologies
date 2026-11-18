import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  SKILL6_ASSEMBLY_CONTRACT,
  SKILL6_CONTRACT,
  SKILL6_COVERAGE_ALGORITHM,
  SKILL6_PARAMETERS,
  SKILL6_PATCH_DEFAULTS,
  SKILL6_SHIFT_ALGORITHM,
  sizeOfCount,
  type ClusterRecord,
  type ClusterSize,
} from "./contract";
import { CLUSTER_REFINEMENT } from "./refine-mesh";
import { aggregateTranslated } from "./grow";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

export type ClusterCatalog = {
  parameters: typeof SKILL6_PARAMETERS;
  archetypes: {
    archetypeId: string;
    name: string;
    typologyId: string;
    moduleId: string;
    candidateId: number;
    continuationId: string;
    solidVolume: number;
    solidVolumeSource: ArchetypeMesh["solidVolumeSource"];
    cellVoidFraction: number | null;
    cellVoidSource: ArchetypeMesh["cellVoidSource"];
    surfaceArea: number;
    triangles: number;
  }[];
  /** Current assembled clusters only. */
  clusters: ClusterRecord[];
  /** Stored records that are not shown, with the reason. Their files stay where they are. */
  archive: CatalogArchiveEntry[];
  /** Measured mesh readings for current clusters. A reading is dropped when it no longer matches the stored mesh. */
  validation: Record<string, AssemblyValidation>;
  compatibility: {
    testedPairs: number;
    totalPairs: number;
    compatiblePairs: number;
    shiftPoses: number;
    shiftDirections: number;
  };
};

export type CatalogArchiveEntry = {
  id: string;
  store: "assembled-index" | "assembled-history" | "coverage-v2.1" | "legacy-search";
  algorithm: string;
  status: string;
  tiles: number;
  size: ClusterSize | null;
  reason: string;
};

type SolidReading = {
  status: string;
  triangles: number;
  bodies: number;
  cavities: number;
  genus: number;
  volume: number;
  minZ: number;
  /** Pairs deeper than the seating tolerance. These fail validation. */
  penetrations: number;
  /** Pairs that meet, no deeper than the seating tolerance. */
  grazes: number;
  maxPenetration: number;
};

export type AssemblyValidation = {
  meshFile: string;
  refinedTriangles: number;
  lift: number;
  raw: SolidReading;
  refined: SolidReading;
  tiles: { instanceId: string; tiltDegrees: number; mirrored: boolean; minZ: number; maxZ: number }[];
  growth: { instanceId: string; hostInstanceId: string; label: string | null; baseChange: number; topChange: number; rejection: string | null }[];
  seatedTilesMinZ: number;
  refinedToTilesOffset: number;
};

export const CATALOG_TARGETS: { id: string; seed: number; tiles: number; size: ClusterSize }[] = [
  { id: "rule-small-02", seed: 11, tiles: 2, size: "small" },
  { id: "rule-small-04", seed: 29, tiles: 4, size: "small" },
  { id: "rule-small-06", seed: 47, tiles: 6, size: "small" },
  { id: "rule-medium-07", seed: 71, tiles: 7, size: "medium" },
  { id: "rule-medium-09", seed: 97, tiles: 9, size: "medium" },
  { id: "rule-large-11", seed: 113, tiles: 11, size: "large" },
];

export const COVERAGE_REPORT_PATH = path.join(process.cwd(), "data", "skill6", "coverage-v2.1.json");

/** Stored v2.1 clusters. Opening the catalog does not run the search. */
export function readStoredCoverage(): ClusterRecord[] {
  if (!existsSync(COVERAGE_REPORT_PATH)) return [];
  const report = JSON.parse(readFileSync(COVERAGE_REPORT_PATH, "utf8")) as { catalogClusters?: ClusterRecord[] };
  return report.catalogClusters ?? [];
}

export const ASSEMBLY_DIRECTORY = path.join(process.cwd(), "data", "skill6", "assembled");

/** Regenerated clusters with patches, union, and refined surface. Opening the catalog does not assemble anything. */
export function readStoredAssemblies(): ClusterRecord[] {
  const file = path.join(ASSEMBLY_DIRECTORY, "index.json");
  if (!existsSync(file)) return [];
  const report = JSON.parse(readFileSync(file, "utf8")) as { clusters?: ClusterRecord[] };
  return report.clusters ?? [];
}

export const ASSEMBLY_VALIDATION_PATH = path.join(ASSEMBLY_DIRECTORY, "validation.json");
export const ASSEMBLY_HISTORY_DIRECTORY = path.join(ASSEMBLY_DIRECTORY, "history");

function readValidation(): Record<string, AssemblyValidation> {
  if (!existsSync(ASSEMBLY_VALIDATION_PATH)) return {};
  return (JSON.parse(readFileSync(ASSEMBLY_VALIDATION_PATH, "utf8")) as { clusters?: Record<string, AssemblyValidation> }).clusters ?? {};
}

/** Records replaced by a later regeneration. Written by assemble-clusters before it replaces an index entry. */
/**
 * Replace one index entry and keep every other entry. The replaced record, and a copy of its mesh, go to the history directory first.
 * The caller writes the new mesh after this returns, so the copy is the previous version.
 */
export function supersedeStoredAssembly(records: readonly ClusterRecord[], replacement: ClusterRecord, stamp: string, root = process.cwd()): ClusterRecord[] {
  const next = records.slice();
  const at = next.findIndex((item) => item.id === replacement.id);
  if (at < 0) {
    next.push(replacement);
    return next;
  }
  const previous = next[at];
  const historyDirectory = path.join(root, "data", "skill6", "assembled", "history");
  mkdirSync(historyDirectory, { recursive: true });
  const historyFile = path.join(historyDirectory, "index.json");
  const history = existsSync(historyFile)
    ? JSON.parse(readFileSync(historyFile, "utf8")) as { entries: { record: ClusterRecord; supersededAt: string }[] }
    : { entries: [] as { record: ClusterRecord; supersededAt: string }[] };
  let archived = previous;
  const mesh = previous.assembly?.meshFile;
  if (mesh && existsSync(path.join(root, mesh))) {
    const archivedMesh = `data/skill6/assembled/history/${previous.id}-${stamp}.mesh.json`;
    copyFileSync(path.join(root, mesh), path.join(root, archivedMesh));
    archived = { ...previous, assembly: { ...previous.assembly!, meshFile: archivedMesh } };
  }
  history.entries.push({ record: archived, supersededAt: stamp });
  writeFileSync(historyFile, JSON.stringify(history, null, 1));
  next[at] = replacement;
  return next;
}

function readHistory(): { record: ClusterRecord; supersededAt: string }[] {
  const file = path.join(ASSEMBLY_HISTORY_DIRECTORY, "index.json");
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { entries?: { record: ClusterRecord; supersededAt: string }[] }).entries ?? [];
}

function samePatchSettings(settings: NonNullable<ClusterRecord["assembly"]>["patchSettings"]): boolean {
  return (Object.keys(SKILL6_PATCH_DEFAULTS) as (keyof typeof SKILL6_PATCH_DEFAULTS)[]).every((key) => settings[key] === SKILL6_PATCH_DEFAULTS[key]);
}

/** Null when the record is a current, validated assembly. Otherwise the reason it stays in the archive. */
function archiveReason(record: ClusterRecord, reading: AssemblyValidation | null): string | null {
  const assembly = record.assembly;
  if (record.contract !== SKILL6_CONTRACT) return `Cluster contract ${record.contract}; current is ${SKILL6_CONTRACT}.`;
  if (record.algorithm !== SKILL6_COVERAGE_ALGORITHM) return `Placement ${record.algorithm}; current is ${SKILL6_COVERAGE_ALGORITHM}.`;
  if (record.status !== "accepted") return `Unsuccessful search. ${record.reason ?? ""}`.trim();
  if (!assembly) return "Rigid tiles only. No patches, union, or refined surface were built.";
  if (assembly.contract !== SKILL6_ASSEMBLY_CONTRACT) return `Assembly contract ${assembly.contract}; current is ${SKILL6_ASSEMBLY_CONTRACT}.`;
  if (assembly.refined.method !== CLUSTER_REFINEMENT.method) return `Refined with "${assembly.refined.method}"; current is "${CLUSTER_REFINEMENT.method}".`;
  if (!samePatchSettings(assembly.patchSettings)) return "Patch settings differ from the current defaults.";
  if (assembly.counts["failed-patch"] > 0) return `${assembly.counts["failed-patch"]} joint patch failed.`;
  if (assembly.refined.status !== "NoError" || assembly.refined.components !== 1) return `Refined surface is ${assembly.refined.components ?? "no"} solid (${assembly.refined.status}).`;
  if (assembly.refined.minZ < -1e-3) return `Refined surface reaches Z ${assembly.refined.minZ}.`;
  if (!existsSync(path.join(process.cwd(), assembly.meshFile))) return `Mesh file ${assembly.meshFile} is missing.`;
  if (!reading) return "No integrity reading matches this mesh.";
  if (reading.refined.maxPenetration > SKILL6_PARAMETERS.maxPenetration) return `${reading.refined.penetrations} self-intersection${reading.refined.penetrations === 1 ? "" : "s"} deeper than the graze limit ${SKILL6_PARAMETERS.maxPenetration}, deepest ${reading.refined.maxPenetration}.`;
  if (reading.refined.minZ < -1e-3 || reading.seatedTilesMinZ < -1e-3) return "A seated tile or the refined surface passes below Z = 0.";
  const dropped = reading.growth.find((step) => step.rejection);
  if (dropped?.rejection) return dropped.rejection;
  return null;
}

/** Same archetypes in the same poses, rounded to 0.01. */
function configurationKey(record: ClusterRecord): string {
  return record.tiles
    .map((tile) => `${tile.archetypeId}@${[...tile.pose.basis, ...tile.pose.translation].map((value) => value.toFixed(2)).join(",")}`)
    .sort()
    .join("|");
}

/** An unsuccessful search stops short of its target, so it is filed under the band it was asked for. */
function archiveEntry(record: ClusterRecord, store: CatalogArchiveEntry["store"], reason: string): CatalogArchiveEntry {
  const target = CATALOG_TARGETS.find((item) => record.id === item.id || record.id === `assembled-${item.id}` || record.id.startsWith(`${item.id}-`));
  return {
    id: record.id,
    store,
    algorithm: record.algorithm,
    status: record.status,
    tiles: record.tiles.length,
    size: target?.size ?? record.metrics?.size ?? null,
    reason,
  };
}

/** Splits every stored record into the current catalog and the archive. Reads files only. */
export function classifyStoredClusters(): { clusters: ClusterRecord[]; archive: CatalogArchiveEntry[] } {
  const clusters: ClusterRecord[] = [];
  const archive: CatalogArchiveEntry[] = [];
  const shown = new Map<string, string>();
  const readings = readValidation();
  for (const record of readStoredAssemblies()) {
    const reading = readings[record.id];
    const fresh = reading && record.assembly && reading.meshFile === record.assembly.meshFile && reading.refinedTriangles === record.assembly.refined.triangles && reading.lift === record.assembly.ground.lift ? reading : null;
    const reason = archiveReason(record, fresh);
    if (reason) {
      archive.push(archiveEntry(record, "assembled-index", reason));
      continue;
    }
    const key = configurationKey(record);
    const twin = shown.get(key);
    if (twin) {
      archive.push(archiveEntry(record, "assembled-index", `Same tiles and poses as ${twin}.`));
      continue;
    }
    shown.set(key, record.id);
    clusters.push(record);
  }
  for (const entry of readHistory()) {
    archive.push(archiveEntry(entry.record, "assembled-history", `Replaced by a regeneration on ${entry.supersededAt}.`));
  }
  for (const record of readStoredCoverage()) {
    archive.push(archiveEntry(record, "coverage-v2.1", archiveReason(record, null) ?? "Superseded."));
  }
  for (const target of CATALOG_TARGETS) {
    archive.push({
      id: target.id,
      store: "legacy-search",
      algorithm: SKILL6_SHIFT_ALGORITHM,
      status: "not stored",
      tiles: target.tiles,
      size: target.size,
      reason: `Earlier rigid search, seed ${target.seed}. Rebuilt on demand by buildCatalog(); the catalog no longer runs it.`,
    });
  }
  return { clusters, archive };
}

let archetypeCache: ClusterCatalog["archetypes"] | null = null;

function archetypeSummaries(): ClusterCatalog["archetypes"] {
  archetypeCache ??= loadArchetypeMeshes().map((mesh) => ({
    archetypeId: mesh.archetypeId,
    name: mesh.name,
    typologyId: mesh.typologyId,
    moduleId: mesh.moduleId,
    candidateId: mesh.candidateId,
    continuationId: mesh.continuationId,
    solidVolume: mesh.solidVolume,
    solidVolumeSource: mesh.solidVolumeSource,
    cellVoidFraction: mesh.cellVoidFraction,
    cellVoidSource: mesh.cellVoidSource,
    surfaceArea: mesh.surfaceArea,
    triangles: mesh.triangles,
  }));
  return archetypeCache;
}

/** Earlier rigid search over CATALOG_TARGETS. Kept so those records can be rebuilt. The catalog does not call it. */
export function buildCatalog(meshes = loadArchetypeMeshes()): ClusterCatalog {
  const translated = loadTranslatedTable();
  const clusters: ClusterRecord[] = [];
  for (const target of CATALOG_TARGETS) {
    let record = aggregateTranslated(meshes, { ...target, compatibility: translated, budget: { evaluations: 420, backtracks: 22 } });
    if (record.status !== "accepted") {
      const retry = aggregateTranslated(meshes, { ...target, seed: target.seed + 1009, compatibility: translated, budget: { evaluations: 420, backtracks: 22 } });
      if (retry.status === "accepted" || retry.tiles.length > record.tiles.length) record = retry;
    }
    if (record.status === "accepted" && record.metrics && sizeOfCount(record.metrics.tileCount) !== target.size) {
      record = { ...record, status: "unsuccessful", reason: "The tile count fell outside its requested category." };
    }
    clusters.push(record);
  }
  return {
    parameters: SKILL6_PARAMETERS,
    archetypes: meshes.map((mesh) => ({
      archetypeId: mesh.archetypeId,
      name: mesh.name,
      typologyId: mesh.typologyId,
      moduleId: mesh.moduleId,
      candidateId: mesh.candidateId,
      continuationId: mesh.continuationId,
      solidVolume: mesh.solidVolume,
      solidVolumeSource: mesh.solidVolumeSource,
      cellVoidFraction: mesh.cellVoidFraction,
      cellVoidSource: mesh.cellVoidSource,
      surfaceArea: mesh.surfaceArea,
      triangles: mesh.triangles,
    })),
    clusters,
    archive: [],
    validation: {},
    compatibility: {
      testedPairs: translated.testedPairs,
      totalPairs: translated.totalPairs,
      compatiblePairs: translated.compatiblePairs,
      shiftPoses: translated.shiftPoses,
      shiftDirections: translated.shiftDirections,
    },
  };
}

/** Current assembled clusters from stored files. Nothing is searched or assembled on open. */
export function getCatalog(): Promise<ClusterCatalog> {
  const translated = loadTranslatedTable();
  const { clusters, archive } = classifyStoredClusters();
  const readings = readValidation();
  const validation: Record<string, AssemblyValidation> = {};
  for (const cluster of clusters) {
    const reading = readings[cluster.id];
    if (reading && reading.meshFile === cluster.assembly?.meshFile && reading.refinedTriangles === cluster.assembly.refined.triangles && reading.lift === cluster.assembly.ground.lift) {
      validation[cluster.id] = reading;
    }
  }
  return Promise.resolve({
    parameters: SKILL6_PARAMETERS,
    archetypes: archetypeSummaries(),
    clusters,
    archive,
    validation,
    compatibility: {
      testedPairs: translated.testedPairs,
      totalPairs: translated.totalPairs,
      compatiblePairs: translated.compatiblePairs,
      shiftPoses: translated.shiftPoses,
      shiftDirections: translated.shiftDirections,
    },
  });
}
