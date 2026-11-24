/**
 * Milestone 1 assembly input.
 *
 * Skill 6 refined meshes are already in the analysis frame: X and Y horizontal, Z up.
 * Skill 3 stores Y-up meshes; `sourcePointToSkill6` converts them before clustering.
 * This module does not convert axes again and does not rescale a cluster.
 *
 * The temporary building is a fixture. It is not the Herald site building and it is
 * not an official multi-cluster placement. An upstream placement replaces `placements`
 * without changing the loaded cluster geometry.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyStoredClusters, type AssemblyValidation } from "@/lib/skill6/catalog";
import { SKILL6_PARAMETERS, type ClusterRecord } from "@/lib/skill6/contract";

export const ASSEMBLY_CONTRACT = "architectural-interpretation-assembly-v1" as const;

/** 1 Skill 6 unit is 1 foot. The 20-unit module is a registration length, not a story height. */
export const FOOT_PER_SKILL6_UNIT = 1;
export const MODULE_REGISTRATION_FEET = 20;

/**
 * Open interval inserted between cluster bounds along +X.
 * Equal to the module registration so the fixture is legible at that scale.
 * It is not a site offset, a street, or a designed passage.
 */
export const FIXTURE_SEPARATION_FEET = MODULE_REGISTRATION_FEET;

export const IDENTITY_ROTATION: [number, number, number, number, number, number, number, number, number] = [
  1, 0, 0, 0, 1, 0, 0, 0, 1,
];

/**
 * The current Skill 6 catalog at the time this fixture was written.
 * `loadTemporaryBuilding` requires the live catalog to be exactly this set.
 * A later catalog change stops the fixture instead of picking a larger mesh.
 * `assembled-rule-small-04` has more tiles and is archived for penetration.
 */
export const TEMPORARY_CLUSTER_IDS = [
  "assembled-flat-self",
  "assembled-flat-plate",
  "assembled-rule-small-02",
] as const;

export type Vec3 = [number, number, number];

export type ClusterPlacement = {
  clusterId: string;
  /** Column-major. The fixture uses identity. */
  rotation: [number, number, number, number, number, number, number, number, number];
  scale: Vec3;
  translation: Vec3;
};

export type ClusterTileRef = {
  instanceId: string;
  archetypeId: string;
  moduleId: string;
  typologyId: string;
  name: string;
  /** Skill 6 pose before the temporary building translation. */
  pose: ClusterRecord["tiles"][number]["pose"];
};

export type LoadedCluster = {
  id: string;
  meshFile: string;
  /** Refined surface in the stored Skill 6 frame. Not copied into a merged mesh. */
  positions: Float32Array;
  indices: Uint32Array;
  triangles: number;
  tiles: ClusterTileRef[];
  validation: {
    state: "catalog-current" | "synthetic";
    penetrations: number | null;
    maxPenetration: number | null;
    cavities: number | null;
    genus: number | null;
    volume: number | null;
    minZ: number | null;
    grazes: number | null;
    note: string;
  };
};

export type BuildingRequest = {
  contract: typeof ASSEMBLY_CONTRACT;
  id: string;
  role: "temporary-fixture" | "upstream";
  disclaimer: string;
  frame: {
    horizontal: ["X", "Y"];
    vertical: "Z";
    unit: "foot";
    skill6UnitToFoot: number;
    moduleRegistrationFeet: number;
    moduleIsStoryCount: false;
    /** Skill 6 files are already Z-up, so no second axis conversion is applied. */
    axisConversionApplied: false;
    scaleApplied: false;
  };
  placementRule: {
    source: "temporary-fixture" | "upstream";
    description: string;
    separationFeet: number | null;
    order: string[];
    /** Present when each pair has its own measured separation. The control fixture leaves this unset. */
    pairGaps?: { from: string; to: string; feet: number; basis: string }[];
  };
  placements: ClusterPlacement[];
  clusters: LoadedCluster[];
};

const TEMPORARY_DISCLAIMER = "Temporary test assembly of current Skill 6 catalog clusters. Not the official site building. Not an upstream multi-cluster placement. Official placements can replace the translation list without merging or rescaling the source meshes.";

export type CatalogSourceReview = {
  id: string;
  state: "current" | "archived" | "missing";
  tiles: number | null;
  reason: string;
};

let catalogCache: ReturnType<typeof classifyStoredClusters> | null = null;

function catalogSnapshot() {
  catalogCache ??= classifyStoredClusters();
  return catalogCache;
}

/** Reads the Skill 6 catalog classification. Does not select a cluster by tile count or mesh size. */
export function reviewCatalogSource(id: string): CatalogSourceReview {
  const { clusters, archive } = catalogSnapshot();
  const current = clusters.find((record) => record.id === id);
  if (current) {
    return {
      id,
      state: "current",
      tiles: current.tiles.length,
      reason: `Current catalog cluster. Refined penetration is at or under ${SKILL6_PARAMETERS.maxPenetration}. Tile count is not the selection rule.`,
    };
  }
  const archived = archive.find((entry) => entry.id === id && entry.store === "assembled-index");
  if (archived) {
    return { id, state: "archived", tiles: archived.tiles, reason: archived.reason };
  }
  const anyArchive = archive.find((entry) => entry.id === id);
  if (anyArchive) return { id, state: "archived", tiles: anyArchive.tiles, reason: anyArchive.reason };
  return { id, state: "missing", tiles: null, reason: "No stored Skill 6 assembly uses this id." };
}

function decodeMesh(encoded: { positions?: string; indices?: string }) {
  if (!encoded.positions || !encoded.indices) throw new Error("The refined cluster mesh is missing positions or indices.");
  const positionBytes = Buffer.from(encoded.positions, "base64");
  const indexBytes = Buffer.from(encoded.indices, "base64");
  const positionCopy = new Uint8Array(positionBytes.byteLength);
  const indexCopy = new Uint8Array(indexBytes.byteLength);
  positionCopy.set(positionBytes);
  indexCopy.set(indexBytes);
  return {
    positions: new Float32Array(positionCopy.buffer),
    indices: new Uint32Array(indexCopy.buffer),
  };
}

function validationOf(record: ClusterRecord, reading: AssemblyValidation | undefined): LoadedCluster["validation"] {
  const refined = reading?.refined;
  return {
    state: "catalog-current",
    penetrations: refined?.penetrations ?? null,
    maxPenetration: refined?.maxPenetration ?? null,
    cavities: refined?.cavities ?? null,
    genus: refined?.genus ?? null,
    volume: refined?.volume ?? record.assembly?.refined.volume ?? null,
    minZ: refined?.minZ ?? record.assembly?.refined.minZ ?? null,
    grazes: refined?.grazes ?? null,
    note: refined
      ? `Stored validation: ${refined.penetrations} penetrations, deepest ${refined.maxPenetration}, ${refined.cavities} cavities, genus ${refined.genus}.`
      : "The catalog lists this cluster, but no matching validation reading was attached.",
  };
}

/** Loads one stored refined mesh and its record. Does not translate, rotate, or scale it. */
export function loadCatalogCluster(id: string): LoadedCluster {
  const review = reviewCatalogSource(id);
  if (review.state !== "current") {
    throw new Error(`${id} is ${review.state}. ${review.reason}`);
  }
  const { clusters } = catalogSnapshot();
  const record = clusters.find((item) => item.id === id);
  if (!record?.assembly?.meshFile) throw new Error(`${id} has no assembly mesh.`);
  const stored = JSON.parse(readFileSync(path.join(process.cwd(), record.assembly.meshFile), "utf8")) as {
    refined?: { positions?: string; indices?: string };
  };
  const mesh = decodeMesh(stored.refined ?? {});
  const readings = JSON.parse(readFileSync(path.join(process.cwd(), "data", "skill6", "assembled", "validation.json"), "utf8")) as {
    clusters?: Record<string, AssemblyValidation>;
  };
  return {
    id: record.id,
    meshFile: record.assembly.meshFile,
    positions: mesh.positions,
    indices: mesh.indices,
    triangles: mesh.indices.length / 3,
    tiles: record.tiles.map((tile) => ({
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      moduleId: tile.moduleId,
      typologyId: tile.typologyId,
      name: tile.name,
      pose: tile.pose,
    })),
    validation: validationOf(record, readings.clusters?.[record.id]),
  };
}

export function boundsOf(positions: ArrayLike<number>): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

/**
 * Places clusters in list order along +X.
 * The first keeps its stored coordinates. Each later cluster is translated so the
 * gap between axis-aligned bounds is `FIXTURE_SEPARATION_FEET`. Y and Z are unchanged,
 * which keeps the stored ground (min Z) and the stored plan orientation.
 */
export function fixturePlacements(clusters: readonly { id: string; positions: ArrayLike<number> }[]): ClusterPlacement[] {
  const placements: ClusterPlacement[] = [];
  let previousWorldMaxX: number | null = null;
  for (const cluster of clusters) {
    const bounds = boundsOf(cluster.positions);
    const translationX = previousWorldMaxX == null ? 0 : previousWorldMaxX + FIXTURE_SEPARATION_FEET - bounds.min[0];
    placements.push({
      clusterId: cluster.id,
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
      translation: [translationX, 0, 0],
    });
    previousWorldMaxX = bounds.max[0] + translationX;
  }
  return placements;
}

/** The replaceable temporary building. Throws if the live catalog is no longer exactly these three clusters. */
export function loadTemporaryBuilding(): BuildingRequest {
  const { clusters } = catalogSnapshot();
  const currentIds = clusters.map((record) => record.id).sort();
  const expected = [...TEMPORARY_CLUSTER_IDS].sort();
  if (currentIds.length !== expected.length || currentIds.some((id, index) => id !== expected[index])) {
    throw new Error(`The temporary fixture is pinned to ${expected.join(", ")}. The current catalog is ${currentIds.join(", ") || "empty"}. Refusing to pick a substitute.`);
  }
  const loaded = TEMPORARY_CLUSTER_IDS.map((id) => loadCatalogCluster(id));
  return {
    contract: ASSEMBLY_CONTRACT,
    id: "temporary-catalog-trio",
    role: "temporary-fixture",
    disclaimer: TEMPORARY_DISCLAIMER,
    frame: {
      horizontal: ["X", "Y"],
      vertical: "Z",
      unit: "foot",
      skill6UnitToFoot: FOOT_PER_SKILL6_UNIT,
      moduleRegistrationFeet: MODULE_REGISTRATION_FEET,
      moduleIsStoryCount: false,
      axisConversionApplied: false,
      scaleApplied: false,
    },
    placementRule: {
      source: "temporary-fixture",
      description: "Identity rotation and unit scale. First cluster stays in its stored frame. Each following cluster is translated on +X so axis-aligned bounds are separated by the 20-foot module registration. This gap is a fixture constant, not a site measurement.",
      separationFeet: FIXTURE_SEPARATION_FEET,
      order: [...TEMPORARY_CLUSTER_IDS],
    },
    placements: fixturePlacements(loaded),
    clusters: loaded,
  };
}
