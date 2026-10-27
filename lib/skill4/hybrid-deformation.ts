import type { Vec3 } from "./contract";
import type { HybridCriterionValue } from "./candidate-field";

/**
 * Deterministic bend of one loft ring from candidate DNA.
 * The effect is zero at both ends of the connector. Missing criteria are skipped.
 * Values stay continuous on [0, 2] and are not rounded to Low / Medium / High.
 */
export const HYBRID_DEFORMATION_SETTINGS = {
  version: "skill4-hybrid-deformation-v2",
  envelope: "4 * t * (1 - t), multiplied by candidate intensity",
  dnaRange: [0, 2] as const,
  complexity: "radial ripple sin(3θ)+sin(5θ) and a two-cycle longitudinal wave, then mixed back toward the parent radius",
  proportionality: "stretch section tangent by up to 0.38 and narrow bitangent by up to 0.28",
  openness: "uniform radial expansion, amplitude 0.28",
  directionality: "shift along section tangent by 0.42 of the mean radius",
  connectivity: "blend each radius toward the mean and add a two-lobe link",
  plateArticulation: "stepped shift along section bitangent by 0.4 of the mean radius",
  centrality: "pull radii toward the section mean and tighten the core",
  visibility: "thin the section and cut a directional opening",
  collaboration: "draw the section toward a shared side",
  socialProximity: "gather radii into a shared volume",
} as const;

const AMPLITUDE = {
  complexity: 0.24,
  complexityAlong: 0.14,
  proportionality: 0.36,
  proportionalityNarrow: 0.26,
  openness: 0.28,
  directionality: 0.42,
  connectivity: 0.42,
  connectivityLobe: 0.14,
  plateArticulation: 0.4,
  centrality: 0.4,
  visibility: 0.22,
  collaboration: 0.32,
  socialProximity: 0.32,
} as const;

const CRITERION = {
  complexity: "complexity",
  proportionality: "proportionality",
  openness: "openness",
  directionality: "directionality",
  connectivity: "connectivity",
  plateArticulation: "plate-articulation",
  centrality: "centrality",
  visibility: "visibility",
  collaboration: "collaboration",
  socialProximity: "social-proximity",
} as const;

export type DeformationDna = {
  criteria: readonly Pick<HybridCriterionValue, "criterionId" | "value">[];
  /** Row intensity. Omitted DNA stays at 1 so a single criterion test is unchanged. */
  intensity?: number;
};

export type ConnectorFrame = {
  centerA: Vec3;
  centerB: Vec3;
  direction: Vec3;
  tangent: Vec3;
  bitangent: Vec3;
  span: number;
};

export function connectorFrame(centerA: Vec3, centerB: Vec3): ConnectorFrame | null {
  const spanVector = sub(centerB, centerA);
  const span = length(spanVector);
  if (span <= 1e-6) return null;
  const direction = scale(spanVector, 1 / span);
  const helper = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentRaw = cross(helper, direction);
  const tangentLength = length(tangentRaw);
  if (tangentLength <= 1e-8) return null;
  const tangent = scale(tangentRaw, 1 / tangentLength);
  const bitangent = cross(direction, tangent);
  return { centerA, centerB, direction, tangent, bitangent, span };
}

export function deformationEnvelope(t: number) {
  if (!Number.isFinite(t)) return 0;
  const clamped = Math.min(1, Math.max(0, t));
  return 4 * clamped * (1 - clamped);
}

export function deformRing(points: readonly Vec3[], t: number, dna: DeformationDna, frame: ConnectorFrame): Vec3[] {
  const strength = intensityOf(dna.intensity);
  const weight = deformationEnvelope(t) * strength;
  if (weight === 0 || !hasActiveCriterion(dna)) return points.map(copyVec);

  const axis = lerp(frame.centerA, frame.centerB, Math.min(1, Math.max(0, t)));
  const local = points.map((point) => {
    const delta = sub(point, axis);
    const u = dot(delta, frame.tangent);
    const v = dot(delta, frame.bitangent);
    return { along: dot(delta, frame.direction), u, v };
  });
  const meanRadius = local.reduce((sum, point) => sum + Math.hypot(point.u, point.v), 0) / Math.max(1, local.length);
  const complexity = weight * readCriterion(dna, CRITERION.complexity) * AMPLITUDE.complexity;
  const complexityAlong = weight * readCriterion(dna, CRITERION.complexity) * AMPLITUDE.complexityAlong;
  const proportionality = weight * readCriterion(dna, CRITERION.proportionality);
  const openness = weight * readCriterion(dna, CRITERION.openness) * AMPLITUDE.openness;
  const directionality = weight * readCriterion(dna, CRITERION.directionality) * AMPLITUDE.directionality * meanRadius;
  const connectivity = weight * readCriterion(dna, CRITERION.connectivity) * AMPLITUDE.connectivity;
  const connectivityLobe = weight * readCriterion(dna, CRITERION.connectivity) * AMPLITUDE.connectivityLobe;
  const plate = deformationEnvelope(stepped(t)) * strength * readCriterion(dna, CRITERION.plateArticulation) * AMPLITUDE.plateArticulation * meanRadius;
  const centrality = weight * readCriterion(dna, CRITERION.centrality);
  const visibility = weight * readCriterion(dna, CRITERION.visibility);
  const collaboration = weight * readCriterion(dna, CRITERION.collaboration);
  const proximity = weight * readCriterion(dna, CRITERION.socialProximity);
  const scaleU = 1 + Math.min(0.38, proportionality * AMPLITUDE.proportionality);
  const scaleV = Math.max(0.62, 1 - Math.min(0.28, proportionality * AMPLITUDE.proportionalityNarrow));
  const alongWave = 1 + complexityAlong * Math.sin(4 * Math.PI * Math.min(1, Math.max(0, t)));

  return local.map((point) => {
    let u = point.u;
    let v = point.v;
    const radius = Math.hypot(u, v);
    const radialActive = complexity !== 0 || complexityAlong !== 0 || openness !== 0 || connectivity !== 0 || centrality > 0 || visibility > 0 || collaboration > 0 || proximity > 0;
    if (radius > 1e-8 && radialActive) {
      const unitU = u / radius;
      const unitV = v / radius;
      const theta = Math.atan2(v, u);
      let next = radius + (meanRadius - radius) * connectivity;
      next *= 1 + connectivityLobe * Math.cos(2 * theta);
      next *= 1 + complexity * Math.sin(3 * theta);
      next *= 1 + complexity * 0.55 * Math.sin(5 * theta);
      next *= alongWave;
      next *= 1 + openness;
      if (centrality > 0) {
        next = next * (1 - centrality * AMPLITUDE.centrality) + meanRadius * centrality * AMPLITUDE.centrality;
        next *= 1 - centrality * 0.16;
      }
      if (visibility > 0) {
        const opening = Math.max(0, Math.cos(theta));
        next *= 1 - visibility * AMPLITUDE.visibility * opening * opening;
        next *= 1 - visibility * 0.18;
      }
      if (collaboration > 0) next *= 1 - collaboration * 0.2;
      if (proximity > 0) {
        next = next * (1 - proximity * AMPLITUDE.socialProximity) + meanRadius * proximity * AMPLITUDE.socialProximity;
      }
      next = radius * 0.42 + next * 0.58;
      const ceiling = meanRadius * (1.04 + 0.32 * strength);
      next = Math.min(ceiling, Math.max(meanRadius * 0.2, next));
      u = unitU * next;
      v = unitV * next;
    }
    u *= scaleU;
    v *= scaleV;
    u += directionality;
    if (collaboration > 0) u += (meanRadius * 0.35 - u) * collaboration * AMPLITUDE.collaboration;
    v += plate;
    return add(
      axis,
      add(scale(frame.direction, point.along), add(scale(frame.tangent, u), scale(frame.bitangent, v))),
    );
  });
}

function intensityOf(intensity: number | undefined) {
  if (intensity === undefined || !Number.isFinite(intensity)) return 1;
  return Math.min(1.85, Math.max(0, intensity));
}

function stepped(t: number) {
  const bands = 5;
  const clamped = Math.min(1, Math.max(0, t));
  return Math.round(clamped * bands) / bands;
}

function hasActiveCriterion(dna: DeformationDna) {
  return Object.values(CRITERION).some((id) => readCriterion(dna, id) > 0);
}

function readCriterion(dna: DeformationDna, id: string) {
  const found = dna.criteria.find((criterion) => criterion.criterionId === id);
  if (!found || !Number.isFinite(found.value)) return 0;
  return Math.min(1, Math.max(0, found.value / 2));
}

function copyVec(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}
