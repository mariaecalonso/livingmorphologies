import type { Vec3 } from "./contract";
import type { HybridCriterionValue } from "./candidate-field";

/**
 * Deterministic bend of one loft ring from candidate DNA.
 * The effect is zero at both ends of the connector. Missing criteria are skipped.
 * Values stay continuous on [0, 2] and are not rounded to Low / Medium / High.
 */
export const HYBRID_DEFORMATION_SETTINGS = {
  version: "skill4-hybrid-deformation-v1",
  envelope: "4 * t * (1 - t)",
  dnaRange: [0, 2] as const,
  complexity: "radial ripple sin(3θ), amplitude 0.16",
  proportionality: "stretch section tangent by 0.22 and narrow bitangent by 0.15",
  openness: "uniform radial expansion, amplitude 0.2",
  directionality: "shift along section tangent by 0.4 of the mean radius",
  connectivity: "blend each radius 0.3 of the way toward the mean radius",
  plateArticulation: "shift along section bitangent by 0.3 of the mean radius",
} as const;

const AMPLITUDE = {
  complexity: 0.16,
  proportionality: 0.22,
  proportionalityNarrow: 0.15,
  openness: 0.2,
  directionality: 0.4,
  connectivity: 0.3,
  plateArticulation: 0.3,
} as const;

const CRITERION = {
  complexity: "complexity",
  proportionality: "proportionality",
  openness: "openness",
  directionality: "directionality",
  connectivity: "connectivity",
  plateArticulation: "plate-articulation",
} as const;

export type DeformationDna = {
  criteria: readonly Pick<HybridCriterionValue, "criterionId" | "value">[];
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
  const weight = deformationEnvelope(t);
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
  const proportionality = weight * readCriterion(dna, CRITERION.proportionality);
  const openness = weight * readCriterion(dna, CRITERION.openness) * AMPLITUDE.openness;
  const directionality = weight * readCriterion(dna, CRITERION.directionality) * AMPLITUDE.directionality * meanRadius;
  const connectivity = weight * readCriterion(dna, CRITERION.connectivity) * AMPLITUDE.connectivity;
  const plate = weight * readCriterion(dna, CRITERION.plateArticulation) * AMPLITUDE.plateArticulation * meanRadius;
  const scaleU = 1 + proportionality * AMPLITUDE.proportionality;
  const scaleV = 1 - proportionality * AMPLITUDE.proportionalityNarrow;

  return local.map((point) => {
    let u = point.u;
    let v = point.v;
    const radius = Math.hypot(u, v);
    if (radius > 1e-8) {
      const unitU = u / radius;
      const unitV = v / radius;
      let next = radius + (meanRadius - radius) * connectivity;
      const theta = Math.atan2(v, u);
      next *= 1 + complexity * Math.sin(3 * theta);
      next *= 1 + openness;
      u = unitU * next;
      v = unitV * next;
    }
    u *= scaleU;
    v *= scaleV;
    u += directionality;
    v += plate;
    return add(
      axis,
      add(scale(frame.direction, point.along), add(scale(frame.tangent, u), scale(frame.bitangent, v))),
    );
  });
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
