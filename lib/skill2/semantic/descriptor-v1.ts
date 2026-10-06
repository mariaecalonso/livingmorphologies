import type { MorphologicalMeasurements } from "../types";
import type { DescriptorFeatureNorm, DescriptorV1Profile, MorphologyDistance, PhenotypeRecord, SemanticCandidate } from "./types";

const FAMILIES = ["topology", "void", "concentration", "directionality", "path", "occupancy"] as const;

/**
 * Interpretable morphology features for `descriptor-v1`.
 * Absolute position and absolute rotation are omitted.
 * Each family is averaged so a family with more numbers does not weigh more.
 */
export const DESCRIPTOR_V1_FEATURES: readonly { id: string; family: (typeof FAMILIES)[number] }[] = [
  { id: "topology.connectedComponentCount", family: "topology" },
  { id: "topology.largestComponentFraction", family: "topology" },
  { id: "topology.enclosure", family: "topology" },
  { id: "connection.cycleRank", family: "topology" },
  { id: "connection.branchCount", family: "topology" },
  { id: "connection.skeletonEndpoints", family: "topology" },
  { id: "connection.branching", family: "topology" },
  { id: "void.voidFraction", family: "void" },
  { id: "void.significantVoidCount", family: "void" },
  { id: "void.largestVoidFraction", family: "void" },
  { id: "void.meanSignificantArea", family: "void" },
  { id: "void.meanOpenSpan", family: "void" },
  { id: "void.maxOpenSpan", family: "void" },
  { id: "mass.concentrationCount", family: "concentration" },
  { id: "mass.meanArea", family: "concentration" },
  { id: "mass.meanIntensity", family: "concentration" },
  { id: "mass.scaleHierarchy", family: "concentration" },
  { id: "mass.sizeRegularity", family: "concentration" },
  { id: "mass.spacingRegularity", family: "concentration" },
  { id: "mass.clusteredness", family: "concentration" },
  { id: "mass.meanNearestNeighbor", family: "concentration" },
  { id: "topology.anisotropy", family: "directionality" },
  { id: "activity.spatialSpread", family: "directionality" },
  { id: "topology.boundingBoxFill", family: "directionality" },
  { id: "topology.directionalSurround", family: "directionality" },
  { id: "connection.meanBridgeThickness", family: "path" },
  { id: "connection.meanBridgeLength", family: "path" },
  { id: "proportion.medialRadiusP50", family: "path" },
  { id: "proportion.medialRadiusP90", family: "path" },
  { id: "proportion.connectionThicknessVariation", family: "path" },
  { id: "connection.branchLengthRegularity", family: "path" },
  { id: "activity.meanDensity", family: "occupancy" },
  { id: "activity.densityVariation", family: "occupancy" },
  { id: "activity.peakConcentration", family: "occupancy" },
  { id: "mass.totalMassFraction", family: "occupancy" },
  { id: "occupation.potentialOccupationFraction", family: "occupancy" },
  { id: "occupation.supportContinuity", family: "occupancy" },
];

const ZERO_RANGE = 1e-9;

export function deriveDescriptorV1(candidates: readonly SemanticCandidate[]): DescriptorV1Profile {
  const valid = candidates.filter((candidate) => candidate.technicalValid && candidate.generation === 1);
  const features: DescriptorFeatureNorm[] = DESCRIPTOR_V1_FEATURES.map((feature) => {
    const values = valid.map((candidate) => readFeature(candidate.phenotype, feature.id));
    if (!values.length || values.some((value) => value == null || !Number.isFinite(value))) {
      return { ...feature, p10: 0, p90: 0, robustRange: 0, active: false };
    }
    const finite = values.filter((value): value is number => value != null);
    const sorted = [...finite].sort((a, b) => a - b);
    const p10 = percentile(sorted, 0.1);
    const p90 = percentile(sorted, 0.9);
    const robustRange = p90 - p10;
    return { ...feature, p10, p90, robustRange, active: robustRange > ZERO_RANGE };
  });
  const activeFamilies = new Set(features.filter((feature) => feature.active).map((feature) => feature.family));
  if (valid.length < 3 || activeFamilies.size === 0) {
    return {
      method: "descriptor-v1",
      features,
      threshold: null,
      block: valid.length < 3 ? "fewer than three technically valid G01 candidates" : "no descriptor feature has a usable range",
    };
  }
  const eligible = candidates.filter(
    (candidate) => candidate.generation === 1 && candidate.technicalValid && candidate.fidelity.status === "pass",
  );
  if (eligible.length < 3) {
    return { method: "descriptor-v1", features, threshold: null, block: "fewer than three fidelity-passing G01 candidates" };
  }
  const distance = descriptorDistance(features);
  const nearest: number[] = [];
  for (const candidate of eligible) {
    let best = Number.POSITIVE_INFINITY;
    for (const other of eligible) {
      if (other.id === candidate.id) continue;
      const gap = distance(
        { id: candidate.id, phenotype: candidate.phenotype },
        { id: other.id, phenotype: other.phenotype },
      );
      if (!Number.isFinite(gap)) return { method: "descriptor-v1", features, threshold: null, block: "non-finite descriptor distance" };
      if (gap < best) best = gap;
    }
    nearest.push(best);
  }
  if (nearest.every((value) => value === 0)) {
    return { method: "descriptor-v1", features, threshold: null, block: "descriptor distances are degenerate" };
  }
  const sorted = [...nearest].sort((a, b) => a - b);
  const mid = median(sorted);
  const sigma = 1.4826 * median(sorted.map((value) => Math.abs(value - mid)).sort((a, b) => a - b));
  if (!Number.isFinite(mid) || !Number.isFinite(sigma)) {
    return { method: "descriptor-v1", features, threshold: null, block: "diversity threshold is non-finite" };
  }
  return {
    method: "descriptor-v1",
    features,
    threshold: {
      eligibleCount: eligible.length,
      nearestNeighbor: { min: sorted[0], median: mid, max: sorted[sorted.length - 1] },
      median: mid,
      mad: sigma / 1.4826,
      sigma,
      value: mid + sigma,
    },
    block: null,
  };
}

export function descriptorDistance(features: readonly DescriptorFeatureNorm[]): MorphologyDistance {
  const active = features.filter((feature) => feature.active && feature.robustRange > ZERO_RANGE);
  return (left, right) => {
    const familyMeans: number[] = [];
    for (const family of FAMILIES) {
      const members = active.filter((feature) => feature.family === family);
      if (!members.length) continue;
      let sum = 0;
      for (const feature of members) {
        const a = readFeature(left.phenotype, feature.id);
        const b = readFeature(right.phenotype, feature.id);
        if (a == null || b == null) return Number.NaN;
        sum += Math.min(Math.abs(a - b) / feature.robustRange, 1);
      }
      familyMeans.push(sum / members.length);
    }
    if (!familyMeans.length) return Number.NaN;
    return familyMeans.reduce((sum, value) => sum + value, 0) / familyMeans.length;
  };
}

export function diversityFromDescriptor(profile: DescriptorV1Profile) {
  if (!profile.threshold || profile.block) return null;
  return {
    distance: descriptorDistance(profile.features),
    rescueThreshold: profile.threshold.value,
    tagThreshold: profile.threshold.value,
  };
}

function readFeature(phenotype: PhenotypeRecord, id: string) {
  const measurements = measurementsOf(phenotype.raw);
  if (!measurements) return null;
  const [group, field] = id.split(".") as [keyof MorphologicalMeasurements, string];
  const record = measurements[group];
  if (!record || typeof record !== "object" || !(field in record)) return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
}

function measurementsOf(raw: unknown): MorphologicalMeasurements | null {
  if (!raw || typeof raw !== "object") return null;
  if ("measurements" in raw) return (raw as { measurements: MorphologicalMeasurements }).measurements;
  if ("topology" in raw) return raw as MorphologicalMeasurements;
  return null;
}

function percentile(sorted: readonly number[], fraction: number) {
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

function median(sorted: readonly number[]) {
  return percentile(sorted, 0.5);
}
