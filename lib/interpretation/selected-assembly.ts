/**
 * Production Interpretation adapter.
 *
 * Selected Assembly occupancy → one LoadedCluster per occupancy → BuildingRequest
 * with role "upstream". Clusters stay separate. Stored Skill 4 meshes are not rewritten.
 *
 * Local transform (this adapter only):
 * 1. Load the Skill 4 finished mesh in its stored isomesh frame (X east, Y up, Z north).
 * 2. Apply poseFinishedMesh: yaw about site +Y, plan centroid onto transform.x/z,
 *    mesh minY onto transform.y. Yaw is baked because analyzeBuilding only translates.
 * 3. Map posed site coordinates into the existing Interpretation frame with
 *    (x, y, z) → (x, z, y): site Y-up becomes analysis Z-up; site Z-north becomes
 *    analysis Y. Indices are unchanged. Same permutation as Skill 6 sourcePointToSkill6.
 * 4. Placement translation is identity because the posed mesh is already in world.
 *
 * Skill 5 / Skill 3 / Skill 4 / Skill 6 stored geometry is not converted globally.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readDevelopmentCheckpoint } from "@/lib/skill5/development-checkpoint";
import { assemblyRevisionSignature } from "@/lib/skill5/downstream-pipeline";
import { poseFinishedMesh, type ClusterAssemblyRecord, type PlacedCluster } from "@/lib/skill5/placed-cluster";
import {
  ASSEMBLY_CONTRACT,
  FOOT_PER_SKILL6_UNIT,
  IDENTITY_ROTATION,
  MODULE_REGISTRATION_FEET,
  type BuildingRequest,
  type ClusterTileRef,
  type LoadedCluster,
  type OccupancyHandoff,
} from "./building";

export const SELECTED_ASSEMBLY_ADAPTER = "architectural-interpretation-selected-assembly-v1" as const;

const IDENTITY_POSE: ClusterTileRef["pose"] = {
  quarterZ: 0,
  mirrorX: false,
  basis: IDENTITY_ROTATION,
  translation: [0, 0, 0],
};

const UPSTREAM_DISCLAIMER = "Selected Assembly for Development. Each occupancy is a posed Skill 4 finished cluster. Site yaw is baked into the mesh. A local Y-up to Z-up conversion is applied in this adapter only. Stored meshes are not rewritten. Clusters are not merged. This reading does not generate a Current Integrated Architectural Model.";

export class SelectedAssemblyAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectedAssemblyAdapterError";
  }
}

function decodePacked(encoded: { positions?: string; indices?: string }) {
  if (!encoded.positions || !encoded.indices) return null;
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

function finishedMeshFile(programId: string, clusterId: string) {
  if (!programId || !clusterId || programId.includes("..") || clusterId.includes("..") || programId.includes("/") || clusterId.includes("/") || programId.includes("\\") || clusterId.includes("\\")) {
    return null;
  }
  const finished = path.join(process.cwd(), "data", "skill4", "finished", programId, `${clusterId.replaceAll(":", "__")}.json`);
  if (existsSync(finished)) return finished;
  const testIndex = clusterId.match(/:test-(\d+)$/);
  if (!testIndex) return null;
  const test = path.join(process.cwd(), "data", "skill4", "differentiation-test", "meshes", programId, `${programId}__${testIndex[1]}.json`);
  return existsSync(test) ? test : null;
}

/** Reads one Skill 4 finished mesh. Does not write or resample the stored file. */
export function loadFinishedOccupancyMesh(programId: string, clusterId: string) {
  const file = finishedMeshFile(programId, clusterId);
  if (!file) return null;
  const stored = JSON.parse(readFileSync(file, "utf8")) as { mesh?: { positions?: string; indices?: string } };
  const mesh = decodePacked(stored.mesh ?? {});
  if (!mesh) return null;
  return { file, positions: mesh.positions, indices: mesh.indices };
}

/**
 * Skill 5 site (X east, Y up, Z north) → Interpretation analysis (X, Y horizontal, Z up).
 * Local adapter copy of sourcePointToSkill6. Does not rewrite source files.
 */
export function sitePointToAnalysis(x: number, y: number, z: number): [number, number, number] {
  return [x, z, y];
}

export function analysisPositionsFromSite(positions: ArrayLike<number>) {
  const out = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const [x, y, z] = sitePointToAnalysis(positions[index], positions[index + 1], positions[index + 2]);
    out[index] = x;
    out[index + 1] = y;
    out[index + 2] = z;
  }
  return out;
}

/** Pose in Skill 5, then convert into the Interpretation Z-up frame. Yaw is baked in step 1. */
export function posedAnalysisPositions(positions: ArrayLike<number>, transform: PlacedCluster["transform"]) {
  return analysisPositionsFromSite(poseFinishedMesh(positions, transform));
}

function occupancyHandoff(record: PlacedCluster): OccupancyHandoff {
  return {
    occupancyId: record.occupancyId,
    zoneId: record.zoneId,
    programId: record.programId,
    finishedClusterId: record.finishedClusterId,
    transform: { ...record.transform },
    modules: record.source.modules.map((module) => ({
      moduleId: module.moduleId,
      archetypeId: module.archetypeId,
      candidateId: module.candidateId,
      continuationId: module.continuationId,
    })),
  };
}

function tilesOf(record: PlacedCluster): ClusterTileRef[] {
  const modules = record.source.modules;
  if (modules.length === 0) {
    return [{
      instanceId: `${record.occupancyId}:cluster`,
      archetypeId: record.programId,
      moduleId: record.finishedClusterId,
      typologyId: record.programId,
      name: record.programId,
      pose: IDENTITY_POSE,
    }];
  }
  return modules.map((module, index) => ({
    instanceId: `${record.occupancyId}:m${index}`,
    archetypeId: module.archetypeId,
    moduleId: module.moduleId,
    typologyId: record.programId,
    name: module.archetypeId,
    pose: IDENTITY_POSE,
  }));
}

export function loadOccupancyCluster(record: PlacedCluster): LoadedCluster {
  const loaded = loadFinishedOccupancyMesh(record.programId, record.finishedClusterId);
  if (!loaded) {
    throw new SelectedAssemblyAdapterError(`Finished cluster ${record.finishedClusterId} for ${record.programId} has no stored mesh.`);
  }
  const positions = posedAnalysisPositions(loaded.positions, record.transform);
  const occupancy = occupancyHandoff(record);
  return {
    id: record.occupancyId,
    meshFile: loaded.file,
    positions,
    indices: loaded.indices,
    triangles: loaded.indices.length / 3,
    tiles: tilesOf(record),
    occupancy,
    validation: {
      state: "upstream",
      penetrations: null,
      maxPenetration: null,
      cavities: null,
      genus: null,
      volume: null,
      minZ: null,
      grazes: null,
      note: `Selected Assembly occupancy ${record.occupancyId}. Skill 4 ${record.programId} / ${record.finishedClusterId} posed at site (${record.transform.x}, ${record.transform.y}, ${record.transform.z}, yaw ${record.transform.rotationY}°), then converted locally to Z-up. Stored mesh was not rewritten.`,
    },
  };
}

export function buildingRequestFromAssembly(assembly: ClusterAssemblyRecord): BuildingRequest {
  if (assembly.occupancy.length === 0) {
    throw new SelectedAssemblyAdapterError("The Selected Assembly has no zone occupancy.");
  }
  const clusters = assembly.occupancy.map((record) => loadOccupancyCluster(record));
  const occupancy = clusters.flatMap((cluster) => (cluster.occupancy ? [cluster.occupancy] : []));
  return {
    contract: ASSEMBLY_CONTRACT,
    id: assembly.assemblyId,
    role: "upstream",
    disclaimer: UPSTREAM_DISCLAIMER,
    frame: {
      horizontal: ["X", "Y"],
      vertical: "Z",
      unit: "foot",
      skill6UnitToFoot: FOOT_PER_SKILL6_UNIT,
      moduleRegistrationFeet: MODULE_REGISTRATION_FEET,
      moduleIsStoryCount: false,
      axisConversionApplied: true,
      scaleApplied: false,
    },
    placementRule: {
      source: "upstream",
      description: "Identity translation. Each occupancy mesh already contains its site pose and yaw. Analysis does not apply rotation, so yaw was baked in the adapter. Clusters are not merged.",
      separationFeet: null,
      order: clusters.map((cluster) => cluster.id),
    },
    placements: clusters.map((cluster) => ({
      clusterId: cluster.id,
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
      translation: [0, 0, 0],
    })),
    clusters,
    origin: {
      assemblyId: assembly.assemblyId,
      assemblyRevision: assemblyRevisionSignature(assembly) ?? assembly.assemblyId,
      networkId: assembly.selectedNetworkId,
      occupancy,
    },
  };
}

/** Production source. Null when no assembly is selected. Does not fall back to Skill 6 fixtures. */
export function loadSelectedAssemblyBuilding(): BuildingRequest | null {
  const checkpoint = readDevelopmentCheckpoint();
  if (!checkpoint.selectedAssemblyId || !checkpoint.assembly) return null;
  return buildingRequestFromAssembly(checkpoint.assembly);
}
