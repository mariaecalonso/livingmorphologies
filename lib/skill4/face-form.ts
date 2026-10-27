import type { FaceFrame } from "./contract";
import type { FaceObservation } from "./face-sample";
import { extractFaceProfile, type FaceProfile, type ProfileLoop } from "./face-profile";
import type { IsoMesh } from "../scan/isomesh";

/**
 * Formal DNA of one selected face, and the 5×5 of face-to-face sections.
 * Tile criteria are not part of this shape. They only nudge the blend.
 */

export const FACE_FORM_BINS = 36;
const DEEPER = [0.22, 0.3, 0.4] as const;
const MIN_FACE_DISTANCE = 0.012;

export type FaceCriteria = {
  openness: number;
  connectivity: number;
  directionality: number;
  complexity: number;
};

export type FaceForm = {
  radii: number[];
  occupancy: number[];
  aspect: number;
  width: number;
  height: number;
  area: number;
  perimeter: number;
  voidRatio: number;
  openingCount: number;
  openingSize: number;
  openingAngle: number;
  massAngle: number;
  massRadius: number;
  direction: number;
  curvature: number;
  convexity: number;
  symmetry: number;
  thickness: number;
  taper: number;
  articulation: number;
  directionalBias: number;
};

export type FaceHybridState = FaceForm & {
  id: string;
  parentBWeight: number;
  transformationIntensity: number;
  similarityA: number;
  similarityB: number;
};

export type FaceFormDiversity = {
  accepted: boolean;
  minimumDistance: number;
  faceDistance: number;
  reason: string;
};

const NEUTRAL: FaceCriteria = { openness: 0.5, connectivity: 0.5, directionality: 0.5, complexity: 0.5 };

export function readFaceForm(mesh: IsoMesh | null, frame: FaceFrame | null, observation: FaceObservation, depthFraction = 0.15): FaceForm | null {
  if (!mesh || !frame) return null;
  const span = Math.max(1e-6, Math.min(frame.extent.u, frame.extent.v));
  const profile = extractFaceProfile(mesh, frame, depthFraction * span);
  const loop = largest(profile);
  if (!loop) return null;
  const bins = sample(loop, profile, observation);
  if (!bins) return null;
  const deeper = DEEPER.map((fraction) => {
    const cut = extractFaceProfile(mesh, frame, fraction * span);
    const inner = largest(cut);
    return inner ? sample(inner, cut, observation) : null;
  }).filter((item): item is Bin[] => item !== null);
  const taper = deeper.length === 0
    ? 0
    : deeper.reduce((sum, cut) => sum + (mean(bins.map((bin) => bin.radius)) - mean(cut.map((bin) => bin.radius))), 0) / deeper.length;
  return measure(bins.map((bin) => bin.radius), bins.map((bin) => bin.occupancy), bins.map((bin) => bin.angle), taper / Math.max(1e-4, mean(bins.map((bin) => bin.radius))));
}

export function faceColumnWeight(parentB: number) {
  const weight = clamp01(parentB);
  if (weight <= 0.1) return 0;
  if (weight <= 0.3) return 0.36;
  if (weight <= 0.6) return 0.5;
  if (weight <= 0.85) return 0.74;
  return 1;
}

export function blendFaceForms(
  faceA: FaceForm,
  faceB: FaceForm,
  parentBWeight: number,
  intensity: number,
  criteria: FaceCriteria = NEUTRAL,
  emphasis = 1,
): FaceForm {
  const weightB = clamp01(parentBWeight);
  const gain = clamp(emphasis, 1, 2.4);
  const shaped = faceColumnWeight(weightB);
  const weightA = 1 - shaped;
  const departure = clamp01(intensity) * gain;
  const center = Math.abs(shaped - 0.5) < 0.08;
  const matches = correspond(faceA, faceB);
  const angles = faceA.radii.map((_, index) => -Math.PI + ((index + 0.5) * 2 * Math.PI) / Math.max(1, faceA.radii.length));
  const directionPull = faceA.direction * weightA + faceB.direction * shaped;
  const ranked = faceA.radii.map((radiusA, index) => ({
    index,
    gap: Math.abs(radiusA - (faceB.radii[matches[index]] ?? radiusA)),
  })).sort((left, right) => right.gap - left.gap);
  const notchCount = Math.floor(departure * 6);
  const notches = new Set(ranked.slice(0, notchCount).map((item) => item.index));
  const raw = faceA.radii.map((radiusA, index) => {
    const radiusB = faceB.radii[matches[index]] ?? radiusA;
    const occupiedA = faceA.occupancy[index] ?? 0.5;
    const occupiedB = faceB.occupancy[matches[index]] ?? 0.5;
    const voidA = occupiedA < 0.35 || radiusA < faceA.thickness * 0.55;
    const voidB = occupiedB < 0.35 || radiusB < faceB.thickness * 0.55;
    const blended = radiusA * weightA + radiusB * shaped;
    const scale = (faceA.thickness + faceB.thickness) * 0.5;
    const normA = radiusA / Math.max(faceA.thickness, 1e-4);
    const normB = radiusB / Math.max(faceB.thickness, 1e-4);
    const mixed = center
      ? scale * (voidA || voidB ? Math.min(normA, normB) * 0.75 + Math.max(normA, normB) * 0.25 : (normA + normB) * 0.5)
      : blended;
    const lobe = Math.cos((angles[index] ?? 0) - directionPull);
    const redistributed = mixed * (1 + lobe * departure * 0.28 * (1 - criteria.directionality * 0.35));
    const contrast = voidA === voidB ? 0 : Math.min(1, Math.abs(radiusA - radiusB) / Math.max(faceA.thickness, faceB.thickness, 1e-4));
    const voidCut = (voidA || voidB) ? Math.min(0.22, departure * (center ? 0.18 : 0.1)) : 0;
    const negotiate = center ? contrast * departure * 0.08 : 0;
    const criterionVoid = Math.max(0, criteria.openness - 0.5) * departure * 0.05 * (voidA || voidB ? 1 : 0);
    const criterionSplit = Math.max(0, criteria.complexity - 0.5) * departure * 0.04 * (contrast > 0 ? 1 : 0);
    const criterionLink = Math.max(0, criteria.connectivity - 0.5) * 0.05;
    const cut = Math.min(0.34, (notches.has(index) ? 0.32 : 0) + voidCut + negotiate + criterionVoid + criterionSplit - criterionLink);
    return Math.max(1e-4, redistributed * (1 - Math.max(0, cut)));
  });
  const meanBase = mean(raw);
  const articulated = raw.map((radius) => meanBase + (radius - meanBase) * (1 + departure * 0.9));
  const bowed = articulated.map((radius, index) => Math.max(
    1e-4,
    radius + Math.sin((angles[index] ?? 0) - directionPull) * departure * (1 - criteria.directionality * 0.4) * meanBase * (center ? 0.16 : 0.1),
  ));
  const occupancy = faceA.occupancy.map((value, index) => value * weightA + (faceB.occupancy[matches[index]] ?? value) * shaped);
  return measure(bowed, occupancy, angles, faceA.taper * weightA + faceB.taper * shaped);
}

export function planFaceHybrids(args: {
  meshA: IsoMesh | null;
  frameA: FaceFrame | null;
  observationA: FaceObservation;
  meshB: IsoMesh | null;
  frameB: FaceFrame | null;
  observationB: FaceObservation;
  cells: ReadonlyArray<{
    id: string;
    parentBWeight: number;
    transformationIntensity: number;
    criteria: ReadonlyArray<{ criterionId: string; value: number }>;
  }>;
}): { states: FaceHybridState[]; diversity: FaceFormDiversity } | null {
  const faceA = readFaceForm(args.meshA, args.frameA, args.observationA);
  const faceB = readFaceForm(args.meshB, args.frameB, args.observationB);
  if (!faceA || !faceB) return null;
  const states = args.cells.map((cell) => {
    const form = blendFaceForms(faceA, faceB, cell.parentBWeight, cell.transformationIntensity, criteriaOf(cell.criteria));
    return {
      ...form,
      id: cell.id,
      parentBWeight: cell.parentBWeight,
      transformationIntensity: cell.transformationIntensity,
      similarityA: formSimilarity(form, faceA),
      similarityB: formSimilarity(form, faceB),
    };
  });
  return { states, diversity: faceDiversity(faceA, faceB, states) };
}

export function formSimilarity(left: FaceForm, right: FaceForm) {
  return 1 / (1 + formDistance(left, right));
}

export function inspectFaceHybrids(states: readonly FaceHybridState[]) {
  return states.map((state) => ({
    id: state.id,
    similarityA: round(state.similarityA),
    similarityB: round(state.similarityB),
    aspect: round(state.aspect),
    area: round(state.area),
    openingCount: state.openingCount,
    voidRatio: round(state.voidRatio),
    massAngle: round(state.massAngle),
    direction: round(state.direction),
    curvature: round(state.curvature),
    thickness: round(state.thickness),
  }));
}

type Bin = { angle: number; radius: number; occupancy: number; u: number; v: number };

function sample(loop: ProfileLoop, profile: FaceProfile, observation: FaceObservation): Bin[] | null {
  if (loop.points.length < 3) return null;
  const centroidU = loop.points.reduce((sum, point) => sum + point.u, 0) / loop.points.length;
  const centroidV = loop.points.reduce((sum, point) => sum + point.v, 0) / loop.points.length;
  const ranked = loop.points.map((point) => ({
    point,
    angle: Math.atan2(point.v - centroidV, point.u - centroidU),
    radius: Math.hypot(point.u - centroidU, point.v - centroidV),
  }));
  const angles = Array.from({ length: FACE_FORM_BINS }, (_, index) => -Math.PI + ((index + 0.5) * 2 * Math.PI) / FACE_FORM_BINS);
  return angles.map((angle) => {
    let best = ranked[0];
    let bestDelta = Math.PI * 2;
    for (const item of ranked) {
      const delta = Math.abs(Math.atan2(Math.sin(item.angle - angle), Math.cos(item.angle - angle)));
      if (delta < bestDelta) {
        best = item;
        bestDelta = delta;
      }
    }
    return {
      angle,
      radius: best.radius,
      occupancy: cellOccupancy(observation, profile, best.point.u, best.point.v),
      u: best.point.u,
      v: best.point.v,
    };
  });
}

function measure(radii: number[], occupancy: number[], angles: number[], taper: number): FaceForm {
  const points = radii.map((radius, index) => ({ x: Math.cos(angles[index] ?? 0) * radius, y: Math.sin(angles[index] ?? 0) * radius }));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let area = 0;
  let perimeter = 0;
  let turn = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const previous = points[(index - 1 + points.length) % points.length];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    area += point.x * next.y - next.x * point.y;
    perimeter += Math.hypot(next.x - point.x, next.y - point.y);
    const incoming = Math.atan2(point.y - previous.y, point.x - previous.x);
    const outgoing = Math.atan2(next.y - point.y, next.x - point.x);
    turn += Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)));
  }
  area = Math.abs(area) * 0.5;
  const width = Math.max(1e-4, maxX - minX);
  const height = Math.max(1e-4, maxY - minY);
  const thickness = mean(radii);
  const hull = convexArea(points);
  const deep = Math.max(...radii) * 0.42;
  const voids = radii.map((radius, index) => radius < deep || (occupancy[index] ?? 0.5) < 0.35);
  const runs = circularRuns(voids);
  const mass = massMoment(radii, occupancy, angles);
  let mirror = 0;
  for (let index = 0; index < radii.length; index += 1) {
    const reflected = radii[radii.length - 1 - index] ?? radii[index];
    mirror += Math.abs(radii[index] - reflected);
  }
  const xx = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const yy = points.reduce((sum, point) => sum + point.y * point.y, 0);
  const xy = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const direction = 0.5 * Math.atan2(2 * xy, xx - yy);
  return {
    radii,
    occupancy,
    aspect: Math.max(width, height) / Math.min(width, height),
    width,
    height,
    area,
    perimeter,
    voidRatio: voids.filter(Boolean).length / Math.max(1, voids.length),
    openingCount: runs.count,
    openingSize: runs.mean,
    openingAngle: runs.angle,
    massAngle: mass.angle,
    massRadius: mass.radius,
    direction,
    curvature: turn / Math.max(1, points.length),
    convexity: area / Math.max(area, hull),
    symmetry: 1 - mirror / Math.max(1e-4, radii.length * thickness * 2),
    thickness,
    taper,
    articulation: deviation(radii) / Math.max(1e-4, thickness),
    directionalBias: Math.abs(width - height) / Math.max(width, height),
  };
}

function faceDiversity(faceA: FaceForm, faceB: FaceForm, states: readonly FaceHybridState[]): FaceFormDiversity {
  const faceDistance = formDistance(faceA, faceB);
  let minimum = Infinity;
  for (let left = 0; left < states.length; left += 1) {
    for (let right = left + 1; right < states.length; right += 1) {
      minimum = Math.min(minimum, formDistance(states[left], states[right]));
    }
  }
  if (!Number.isFinite(minimum)) minimum = 0;
  if (faceDistance < 0.08) {
    return { accepted: true, minimumDistance: minimum, faceDistance, reason: "The selected faces are already close, so their hybrids stay close." };
  }
  const accepted = minimum >= MIN_FACE_DISTANCE;
  return {
    accepted,
    minimumDistance: minimum,
    faceDistance,
    reason: accepted ? "" : "The face hybrids repeat the same section. No connector was created.",
  };
}

function formDistance(left: FaceForm, right: FaceForm) {
  const scaleL = Math.max(1e-4, left.thickness);
  const scaleR = Math.max(1e-4, right.thickness);
  let shape = 0;
  const count = Math.min(left.radii.length, right.radii.length);
  for (let index = 0; index < count; index += 1) shape += Math.abs(left.radii[index] / scaleL - right.radii[index] / scaleR);
  shape = count === 0 ? 0 : shape / count;
  const angle = Math.abs(Math.atan2(Math.sin(left.direction - right.direction), Math.cos(left.direction - right.direction))) / Math.PI;
  return shape
    + Math.abs(left.aspect - right.aspect) * 0.12
    + Math.abs(left.voidRatio - right.voidRatio) * 0.35
    + Math.abs(left.openingCount - right.openingCount) * 0.05
    + Math.abs(left.curvature - right.curvature) * 0.08
    + angle * 0.08;
}

function correspond(faceA: FaceForm, faceB: FaceForm) {
  return faceA.radii.map((_, index) => {
    const mass = (faceA.occupancy[index] ?? 0.5) > 0.45;
    let best = index;
    let bestCost = 99;
    for (let offset = -1; offset <= 1; offset += 1) {
      const candidate = (index + offset + faceB.radii.length) % faceB.radii.length;
      const same = ((faceB.occupancy[candidate] ?? 0.5) > 0.45) === mass;
      const cost = Math.abs(offset) * 2 + (same ? 0 : 5);
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
    }
    return best;
  });
}

function criteriaOf(criteria: ReadonlyArray<{ criterionId: string; value: number }>): FaceCriteria {
  const read = (id: string) => {
    const found = criteria.find((item) => item.criterionId === id);
    return found && Number.isFinite(found.value) ? clamp01(found.value / 2) : 0.5;
  };
  return {
    openness: read("openness"),
    connectivity: read("connectivity"),
    directionality: read("directionality"),
    complexity: read("complexity"),
  };
}

function cellOccupancy(observation: FaceObservation, profile: FaceProfile, u: number, v: number) {
  const bounds = profile.bounds;
  if (!bounds || observation.normalizedCells.length < 64) return 0.5;
  const width = bounds.maxU - bounds.minU;
  const height = bounds.maxV - bounds.minV;
  if (width <= 1e-6 || height <= 1e-6) return 0.5;
  const x = clamp01((u - bounds.minU) / width);
  const y = clamp01((v - bounds.minV) / height);
  return observation.normalizedCells[Math.min(7, Math.floor(y * 8)) * 8 + Math.min(7, Math.floor(x * 8))] ?? 0;
}

function largest(profile: FaceProfile) {
  const loops = profile.loops.filter((loop) => loop.points.length >= 3);
  if (loops.length === 0) return null;
  return loops.reduce((best, loop) => (loop.points.length > best.points.length ? loop : best));
}

function circularRuns(flags: boolean[]) {
  const runs: number[][] = [];
  let current: number[] = [];
  for (let index = 0; index < flags.length; index += 1) {
    if (!flags[index]) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else current.push(index);
  }
  if (current.length > 0) runs.push(current);
  if (runs.length > 1 && flags[0] && flags[flags.length - 1]) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    runs[0] = [...last, ...first];
    runs.pop();
  }
  const useful = runs.filter((run) => run.length >= 2 && run.length < flags.length * 0.45);
  if (useful.length === 0) return { count: 0, mean: 0, angle: 0 };
  const largestRun = useful.reduce((best, run) => (run.length > best.length ? run : best));
  const mid = largestRun[Math.floor(largestRun.length / 2)] ?? 0;
  return {
    count: useful.length,
    mean: useful.reduce((sum, run) => sum + run.length, 0) / useful.length,
    angle: -Math.PI + ((mid + 0.5) * 2 * Math.PI) / flags.length,
  };
}

function massMoment(radii: number[], occupancy: number[], angles: number[]) {
  let x = 0;
  let y = 0;
  let weight = 0;
  for (let index = 0; index < radii.length; index += 1) {
    const share = Math.max(0.05, occupancy[index] ?? 0.5) * radii[index];
    x += Math.cos(angles[index] ?? 0) * share;
    y += Math.sin(angles[index] ?? 0) * share;
    weight += share;
  }
  if (weight <= 1e-6) return { angle: 0, radius: 0 };
  return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) / weight };
}

function convexArea(points: Array<{ x: number; y: number }>) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (origin: { x: number; y: number }, left: { x: number; y: number }, right: { x: number; y: number }) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower: Array<{ x: number; y: number }> = [];
  for (const point of ordered) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const point = ordered[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  let area = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const point = hull[index];
    const next = hull[(index + 1) % hull.length];
    area += point.x * next.y - next.x * point.y;
  }
  return Math.max(1e-6, Math.abs(area) * 0.5);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function deviation(values: number[]) {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formFromBins(bins: ReadonlyArray<{ radius: number; occupancy: number; angle: number }>, taper = 0): FaceForm {
  return measure(bins.map((bin) => bin.radius), bins.map((bin) => bin.occupancy), bins.map((bin) => bin.angle), taper);
}

const VISUAL_BINS = 36;
const VISUAL_STATIONS = [3, 6, 9] as const;
export const MIN_VISUAL_DISTANCE = 0.045;

/** Middle-section reading of a connector. The shared end rings are left out. */
export function connectorVisualVector(mesh: IsoMesh): number[] | null {
  if (mesh.positions.length < 13 * VISUAL_BINS * 3) return null;
  const parts: number[] = [];
  for (const station of VISUAL_STATIONS) {
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (let bin = 0; bin < VISUAL_BINS; bin += 1) {
      const offset = (station * VISUAL_BINS + bin) * 3;
      points.push({ x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] });
    }
    const center = {
      x: mean(points.map((point) => point.x)),
      y: mean(points.map((point) => point.y)),
      z: mean(points.map((point) => point.z)),
    };
    const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z));
    const average = Math.max(1e-4, mean(radii));
    const spans = [spanOf(points, "x"), spanOf(points, "y"), spanOf(points, "z")].sort((a, b) => b - a);
    const voids = radii.map((radius) => radius < average * 0.62);
    parts.push(
      spans[0] / Math.max(1e-4, spans[1]),
      average,
      Math.min(...radii) / average,
      deviation(radii) / average,
      voids.filter(Boolean).length / VISUAL_BINS,
      circularRuns(voids).count,
    );
  }
  return parts;
}

export function visualDistance(left: readonly number[], right: readonly number[]) {
  const count = Math.min(left.length, right.length);
  if (count === 0) return 0;
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    const scale = Math.max(1, Math.abs(left[index] ?? 0), Math.abs(right[index] ?? 0));
    sum += Math.abs((left[index] ?? 0) - (right[index] ?? 0)) / scale;
  }
  return sum / count;
}

function spanOf(points: ReadonlyArray<{ x: number; y: number; z: number }>, axis: "x" | "y" | "z") {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    min = Math.min(min, point[axis]);
    max = Math.max(max, point[axis]);
  }
  return max - min;
}
