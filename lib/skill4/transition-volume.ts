import type { HybridCandidate } from "./candidate-field";
import type { Vec3 } from "./contract";
import type { FaceObservation } from "./face-sample";
import { extractFaceProfile, type FaceProfile, type ProfileLoop } from "./face-profile";
import type { IsoMesh } from "../scan/isomesh";
import { blendFaceForms, faceColumnWeight, formFromBins } from "./face-form";

/**
 * The connector silhouette is a morph of the parent sections.
 * Physarum does not draw the outer form. It chooses which matched
 * sectors stay solid, which voids continue, and where a mass may split.
 */

const BINS = 36;
const STATIONS = [0, 0.06, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.94, 1] as const;
const DEEPER = [0.22, 0.34] as const;

type Bin = {
  angle: number;
  position: Vec3;
  radius: number;
  occupancy: number;
};

export type TransitionReport = {
  splits: number;
  voids: number;
  meanRadius: number;
  endDrift: number;
  distinctness: number;
  accepted: boolean;
  reason: string;
};

export function buildTransitionVolume(args: {
  profileA: FaceProfile;
  profileB: FaceProfile;
  loopA: ProfileLoop;
  loopB: ProfileLoop;
  centerA: Vec3;
  centerB: Vec3;
  candidate: HybridCandidate;
  observationA: FaceObservation;
  observationB: FaceObservation;
  meshA?: IsoMesh | null;
  meshB?: IsoMesh | null;
}): { mesh: IsoMesh; stages: IsoMesh[]; report: TransitionReport } | { mesh: null; reason: string } {
  const angles = uniformAngles(BINS);
  const axis = sub(args.centerB, args.centerA);
  const side = perpendicular(axis);
  const lift = normalize(cross(side, axis));
  const plane = { side, lift };
  const faceA = sampleLoop(args.loopA, args.profileA, args.observationA, angles, plane);
  const faceB = sampleLoop(args.loopB, args.profileB, args.observationB, angles, plane);
  if (!faceA || !faceB) return { mesh: null, reason: "A parent section could not be sampled." };
  const memoryA = sectionMemory(args.meshA, args.profileA, args.observationA, angles, faceA, plane);
  const memoryB = sectionMemory(args.meshB, args.profileB, args.observationB, angles, faceB, plane);
  const parentB = clamp01(finite(args.candidate.parentBWeight, 0.5));
  const intensity = clamp01(finite(args.candidate.transformationIntensity, 0.5));
  const morph = args.candidate.morphology ?? { section: 1, curvature: 0, void: 0, branch: 0 };
  const criteria = faceCriteria(args.candidate);
  const emphasis = clamp(finite(args.candidate.visualGain, 1), 1, 2.4);
  const hybrid = blendFaceForms(formFromBins(faceA), formFromBins(faceB), parentB, intensity, criteria, emphasis);
  const matches = correspond(faceA, faceB);
  const splits = splitBins(faceA, faceB, matches, morph.branch, args.candidate.row);
  const bend = length(axis) * (0.025 + intensity * 0.07) * emphasis * (1 - criteria.directionality * 0.45);
  const rings = STATIONS.map((t) => morphRing(t, faceA, faceB, matches, memoryA, memoryB, parentB, intensity, emphasis, morph.curvature, hybrid.radii, splits, side, bend));
  const middle = rings[6];
  const spine = lerp(args.centerA, args.centerB, 0.5);
  const distinctness = middle.reduce((sum, point, index) => sum + length(sub(point, lerp(faceA[index].position, faceB[matches[index]].position, 0.5))), 0) / BINS;
  const voids = middle.filter((point, index) => length(sub(point, spine)) < Math.max(faceA[index].radius, faceB[matches[index]].radius) * 0.45).length;
  const meanRadius = middle.reduce((sum, point) => sum + length(sub(point, lerp(args.centerA, args.centerB, 0.5))), 0) / BINS;
  const endDrift = Math.max(
    ...rings[0].map((point, index) => length(sub(point, faceA[index].position))),
    ...rings[rings.length - 1].map((point, index) => length(sub(point, faceB[matches[index]].position))),
  );
  const finiteRing = rings.every((ring) => ring.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)));
  const accepted = finiteRing && meanRadius > 0.2 && endDrift < 1e-3;
  if (!accepted) return { mesh: null, reason: "The section transition collapsed. No connector was created." };
  const full = loft(rings);
  const stages = [loft([rings[0], rings[rings.length - 1]]), loft(rings.filter((_, index) => index % 2 === 0)), full];
  return {
    mesh: full,
    stages,
    report: {
      splits: splits.filter(Boolean).length,
      voids,
      meanRadius,
      endDrift,
      distinctness,
      accepted: true,
      reason: "",
    },
  };
}

function morphRing(
  t: number,
  faceA: Bin[],
  faceB: Bin[],
  matches: number[],
  memoryA: number[],
  memoryB: number[],
  parentB: number,
  intensity: number,
  emphasis: number,
  curvature: number,
  targetRadii: number[],
  splits: boolean[],
  side: Vec3,
  bend: number,
) {
  const mix = t <= 0.03 ? 0 : t >= 0.97 ? 1 : columnMix(t, parentB, emphasis);
  const adopt = t <= 0.03 || t >= 0.97 ? 0 : coreFreedom(t);
  const center = add(
    lerp(average(faceA.map((bin) => bin.position)), average(faceB.map((bin) => bin.position)), t),
    scale(side, Math.sin(Math.PI * t) * curvature * adopt * intensity * emphasis * bend),
  );
  return faceA.map((bin, index) => {
    const other = faceB[matches[index]];
    const base = lerp(bin.position, other.position, mix);
    const radial = sub(base, center);
    const lerped = Math.max(1e-4, bin.radius * (1 - mix) + other.radius * mix);
    const desired = (targetRadii[index] ?? lerped) / lerped;
    const memory = (memoryA[index] * (1 - mix) + memoryB[matches[index]] * mix) / Math.max(0.2, lerped);
    const notch = splits[index] ? intensity * emphasis * 0.22 : 0;
    const factor = adopt === 0 ? 1 : clamp(1 + (desired - 1) * adopt + memory * adopt * 0.05 - notch, 0.28, 1.75);
    return add(center, scale(radial, factor));
  });
}

function faceCriteria(candidate: HybridCandidate) {
  const read = (id: string) => {
    const found = candidate.criteria.find((item) => item.criterionId === id);
    return found && Number.isFinite(found.value) ? clamp01(found.value / 2) : 0.5;
  };
  return {
    openness: read("openness"),
    connectivity: read("connectivity"),
    directionality: read("directionality"),
    complexity: read("complexity"),
  };
}

function correspond(faceA: Bin[], faceB: Bin[]) {
  return faceA.map((bin, index) => {
    const mass = bin.occupancy > 0.45;
    let best = index;
    let bestCost = 99;
    for (let offset = -1; offset <= 1; offset += 1) {
      const candidate = (index + offset + faceB.length) % faceB.length;
      const same = (faceB[candidate].occupancy > 0.45) === mass;
      const cost = Math.abs(offset) * 2 + (same ? 0 : 5);
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
    }
    return best;
  });
}

function splitBins(faceA: Bin[], faceB: Bin[], matches: number[], branch: number, row: number) {
  if (row < 2 || branch < 0.4) return faceA.map(() => false);
  return faceA.map((bin, index) => {
    const next = (index + 1) % faceA.length;
    const gap = circular(matches[index], matches[next], faceB.length);
    const jump = Math.abs(bin.occupancy - faceA[next].occupancy) + Math.abs(faceB[matches[index]].occupancy - faceB[matches[next]].occupancy);
    return gap > 2 || jump > 0.7;
  });
}

function circular(a: number, b: number, count: number) {
  const delta = Math.abs(a - b);
  return Math.min(delta, count - delta);
}

function perpendicular(axis: Vec3): Vec3 {
  const up = Math.abs(axis.y) < 0.85 * Math.max(1e-6, length(axis)) ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const side = cross(axis, up);
  const span = length(side);
  return span < 1e-6 ? { x: 0, y: 1, z: 0 } : scale(side, 1 / span);
}

function sectionMemory(
  mesh: IsoMesh | null | undefined,
  profile: FaceProfile,
  observation: FaceObservation,
  angles: number[],
  face: Bin[],
  plane: Plane,
) {
  if (!mesh || !profile.frame) return face.map(() => 0);
  const span = Math.max(1e-6, Math.min(profile.frame.extent.u, profile.frame.extent.v));
  const memories = DEEPER.map((fraction) => {
    const cut = extractFaceProfile(mesh, profile.frame, fraction * span);
    const loop = largest(cut);
    return loop ? sampleLoop(loop, cut, observation, angles, plane) : null;
  }).filter((bins): bins is Bin[] => bins !== null);
  if (memories.length === 0) return face.map(() => 0);
  return face.map((bin, index) => memories.reduce((sum, bins) => sum + (bins[index].radius - bin.radius), 0) / memories.length);
}

type Plane = { side: Vec3; lift: Vec3 };

function sampleLoop(loop: ProfileLoop, profile: FaceProfile, observation: FaceObservation, angles: number[], plane: Plane): Bin[] | null {
  if (loop.points.length < 3) return null;
  const projected = loop.points.map((point) => ({
    point,
    u: dot(point.position, plane.side),
    v: dot(point.position, plane.lift),
  }));
  const centroidU = projected.reduce((sum, item) => sum + item.u, 0) / projected.length;
  const centroidV = projected.reduce((sum, item) => sum + item.v, 0) / projected.length;
  const ranked = projected.map((item) => ({
    point: item.point,
    angle: Math.atan2(item.v - centroidV, item.u - centroidU),
    radius: Math.hypot(item.u - centroidU, item.v - centroidV),
  }));
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
      position: best.point.position,
      radius: best.radius,
      occupancy: cellOccupancy(observation, profile, best.point.u, best.point.v),
    };
  });
}

function loft(rings: Vec3[][]): IsoMesh {
  const bins = rings[0].length;
  const positions: number[] = [];
  const indices: number[] = [];
  const indexOf = rings.map((ring) => ring.map((point) => {
    const index = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    return index;
  }));
  for (let station = 0; station < rings.length - 1; station += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      const next = (bin + 1) % bins;
      const a = indexOf[station][bin];
      const b = indexOf[station][next];
      const c = indexOf[station + 1][bin];
      const d = indexOf[station + 1][next];
      indices.push(a, c, d, a, d, b);
    }
  }
  const cap = (ring: number[], reverse: boolean) => {
    const center = positions.length / 3;
    const at = average(ring.map((index) => read(positions, index)));
    positions.push(at.x, at.y, at.z);
    for (let bin = 0; bin < ring.length; bin += 1) {
      const a = ring[bin];
      const b = ring[(bin + 1) % ring.length];
      indices.push(center, ...(reverse ? [a, b] : [b, a]));
    }
  };
  cap(indexOf[0], true);
  cap(indexOf[indexOf.length - 1], false);
  const normals = new Float32Array(positions.length);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = read(positions, indices[triangle]);
    const b = read(positions, indices[triangle + 1]);
    const c = read(positions, indices[triangle + 2]);
    const normal = cross(sub(b, a), sub(c, a));
    addNormal(normals, indices[triangle], normal);
    addNormal(normals, indices[triangle + 1], normal);
    addNormal(normals, indices[triangle + 2], normal);
  }
  for (let index = 0; index < normals.length; index += 3) {
    const span = Math.hypot(normals[index], normals[index + 1], normals[index + 2]);
    if (span < 1e-8) continue;
    normals[index] /= span;
    normals[index + 1] /= span;
    normals[index + 2] /= span;
  }
  return {
    positions: Float32Array.from(positions),
    normals,
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
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

function uniformAngles(count: number) {
  return Array.from({ length: count }, (_, index) => -Math.PI + ((index + 0.5) * 2 * Math.PI) / count);
}

function columnMix(t: number, parentB: number, emphasis: number) {
  const shaped = faceColumnWeight(parentB);
  const center = clamp(0.5 + (0.5 - shaped) * 0.9, 0.08, 0.92);
  return clamp01(1 / (1 + Math.exp(-(t - center) / (0.06 / emphasis))));
}

function coreFreedom(t: number) {
  const enter = clamp01((t - 0.05) / 0.05);
  const leave = clamp01((0.95 - t) / 0.05);
  return clamp01(Math.min(enter * enter * (3 - 2 * enter), leave * leave * (3 - 2 * leave)));
}

function read(positions: number[], index: number): Vec3 {
  return { x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2] };
}

function addNormal(normals: Float32Array, vertex: number, face: Vec3) {
  normals[vertex * 3] += face.x;
  normals[vertex * 3 + 1] += face.y;
  normals[vertex * 3 + 2] += face.z;
}

function average(points: Vec3[]): Vec3 {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
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
  return add(scale(a, 1 - t), scale(b, t));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(value: Vec3): Vec3 {
  const span = length(value);
  return span < 1e-8 ? { x: 0, y: 1, z: 0 } : scale(value, 1 / span);
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
