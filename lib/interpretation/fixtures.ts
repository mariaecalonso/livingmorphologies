/**
 * Temporary assemblies for interpretation tests.
 * The control keeps the 20-foot module gap. The proximity fixture uses measured
 * thickness and measured centroids. Neither writes Skill 6 files.
 */
import { medianInwardThickness } from "./analyze-building";
import {
  ASSEMBLY_CONTRACT,
  boundsOf,
  FIXTURE_SEPARATION_FEET,
  IDENTITY_ROTATION,
  loadTemporaryBuilding,
  TEMPORARY_CLUSTER_IDS,
  loadCatalogCluster,
  type BuildingRequest,
  type ClusterPlacement,
  type Vec3,
} from "./building";

const DISCLAIMER = "Temporary test assembly of current Skill 6 catalog clusters. Not the official site building. Not an upstream multi-cluster placement. Official placements can replace the translation list without merging or rescaling the source meshes.";

export function loadControlBuilding(): BuildingRequest {
  const building = loadTemporaryBuilding();
  return { ...building, id: "temporary-catalog-separated" };
}

function vertexCentroid(positions: ArrayLike<number>): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (let index = 0; index < positions.length; index += 3) {
    x += positions[index];
    y += positions[index + 1];
    z += positions[index + 2];
    count += 1;
  }
  return [x / count, y / count, z / count];
}

/**
 * Identity rotation, unit scale, ground left at stored Z.
 * Later clusters shift in Y so their vertex centroids share the first cluster's Y.
 * The +X bounds gap is the smaller measured inward thickness of the two neighbors.
 * A positive bounds gap means the solids cannot intersect.
 */
export function loadProximityBuilding(): BuildingRequest {
  const clusters = TEMPORARY_CLUSTER_IDS.map((id) => loadCatalogCluster(id));
  const thicknesses = clusters.map((cluster) => medianInwardThickness(cluster.positions, cluster.indices));
  const missing = clusters.find((cluster, index) => thicknesses[index] == null || thicknesses[index]! <= 0);
  if (missing) throw new Error(`${missing.id} has no measured thickness. The proximity fixture will not invent a gap.`);
  const centroids = clusters.map((cluster) => vertexCentroid(cluster.positions));
  const anchorY = centroids[0][1];
  const placements: ClusterPlacement[] = [];
  const pairGaps: NonNullable<BuildingRequest["placementRule"]["pairGaps"]> = [];
  let previousMaxX: number | null = null;
  clusters.forEach((cluster, index) => {
    const bounds = boundsOf(cluster.positions);
    const translationY = anchorY - centroids[index][1];
    let translationX = 0;
    if (previousMaxX != null) {
      const feet = Math.min(thicknesses[index - 1]!, thicknesses[index]!);
      translationX = previousMaxX + feet - bounds.min[0];
      pairGaps.push({
        from: clusters[index - 1].id,
        to: cluster.id,
        feet,
        basis: "Smaller median inward thickness of the two clusters. Positive bounds gap, so the solids stay disjoint.",
      });
    }
    placements.push({
      clusterId: cluster.id,
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
      translation: [translationX, translationY, 0],
    });
    previousMaxX = bounds.max[0] + translationX;
  });
  for (let index = 0; index < clusters.length; index += 1) {
    for (let next = index + 1; next < clusters.length; next += 1) {
      const left = boundsOf(clusters[index].positions);
      const right = boundsOf(clusters[next].positions);
      const leftPlacement = placements[index].translation;
      const rightPlacement = placements[next].translation;
      const separated = left.max[0] + leftPlacement[0] <= right.min[0] + rightPlacement[0] - 1e-4
        || right.max[0] + rightPlacement[0] <= left.min[0] + leftPlacement[0] - 1e-4;
      if (!separated) throw new Error(`${clusters[index].id} and ${clusters[next].id} bounds overlap after the proximity placement.`);
    }
  }
  return {
    contract: ASSEMBLY_CONTRACT,
    id: "temporary-catalog-proximity",
    role: "temporary-fixture",
    disclaimer: DISCLAIMER,
    frame: {
      horizontal: ["X", "Y"],
      vertical: "Z",
      unit: "foot",
      skill6UnitToFoot: 1,
      moduleRegistrationFeet: 20,
      moduleIsStoryCount: false,
      axisConversionApplied: false,
      scaleApplied: false,
    },
    placementRule: {
      source: "temporary-fixture",
      description: "Same clusters and stored orientation as the 20-foot control. Y translations align vertex centroids with the first cluster. Each +X bounds gap equals the smaller measured median thickness of that pair. Z is unmoved, so each stored ground stays at Z = 0. This is not a site placement.",
      separationFeet: null,
      order: [...TEMPORARY_CLUSTER_IDS],
      pairGaps,
    },
    placements,
    clusters,
  };
}

export function controlSeparationFeet(): number {
  return FIXTURE_SEPARATION_FEET;
}
