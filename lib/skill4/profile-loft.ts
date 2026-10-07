import type { IsoMesh } from "../scan/isomesh";
import type { FaceFrame, Vec3 } from "./contract";
import { profilePointToWorld } from "./face-profile";
import type { CorrespondenceSample, ProfileCorrespondence } from "./profile-correspondence";

/**
 * Open triangle tube from one face profile to another.
 * Ring 0 is profile A and the last ring is profile B.
 * The span is the distance between those reconstructed centers. Ends are not capped.
 * Source profiles, correspondence, and frames are read only.
 */
export const PROFILE_LOFT_SETTINGS = {
  version: "skill4-profile-loft-v1",
  interpolation: "linear between corresponding world points",
  ends: "open",
  minimumSteps: 2,
  centerEpsilon: 1e-6,
} as const;

export type ProfileLoftStatus = "ready" | "blocked" | "invalid" | "empty";

export type ProfileLoftRequest = {
  correspondence: ProfileCorrespondence | null;
  frameA: FaceFrame | null;
  frameB: FaceFrame | null;
  depthA: number;
  depthB: number;
  steps: number;
};

export type ProfileLoft = {
  version: typeof PROFILE_LOFT_SETTINGS.version;
  status: ProfileLoftStatus;
  geometry: IsoMesh | null;
  vertexCount: number;
  triangleCount: number;
  longitudinalSteps: number;
  sampleCount: number;
  span: number | null;
  reason: string;
};

export function loftProfiles(request: ProfileLoftRequest): ProfileLoft {
  const { correspondence, frameA, frameB, depthA, depthB, steps } = request;
  if (!correspondence) return blank("invalid", 0, 0, "The correspondence is missing.");
  if (correspondence.status === "invalid") return blank("invalid", correspondence.sampleCount, 0, correspondence.reason || "The correspondence is invalid.");
  if (correspondence.status === "empty") return blank("empty", correspondence.sampleCount, 0, "The correspondence is empty.");
  if (correspondence.status === "blocked") return blank("blocked", correspondence.sampleCount, 0, correspondence.reason || "The correspondence is blocked.");
  if (!usableFrame(frameA) || !usableFrame(frameB)) return blank("invalid", correspondence.sampleCount, 0, "A face frame is missing or not a unit frame.");
  if (!Number.isFinite(depthA) || depthA < 0 || !Number.isFinite(depthB) || depthB < 0) {
    return blank("invalid", correspondence.sampleCount, 0, "A section depth is not a finite inward distance.");
  }
  if (!Number.isInteger(steps) || steps < PROFILE_LOFT_SETTINGS.minimumSteps) {
    return blank("invalid", correspondence.sampleCount, 0, "A connector needs at least two loft rings.");
  }

  const samplesA = correspondence.alignedA;
  const samplesB = correspondence.alignedB;
  const sampleCount = correspondence.sampleCount;
  if (sampleCount < 3 || samplesA.length !== sampleCount || samplesB.length !== sampleCount) {
    return blank("invalid", sampleCount, steps, "Aligned profiles do not share the requested sample count.");
  }
  if (!samplesA.every(finiteSample) || !samplesB.every(finiteSample)) {
    return blank("invalid", sampleCount, steps, "A correspondence sample is not finite.");
  }

  const ringA = samplesA.map((sample) => profilePointToWorld(frameA, depthA, sample.u, sample.v));
  const ringB = samplesB.map((sample) => profilePointToWorld(frameB, depthB, sample.u, sample.v));
  if (!ringA.every(finiteVec) || !ringB.every(finiteVec)) {
    return blank("invalid", sampleCount, steps, "A reconstructed profile point is not finite.");
  }
  const centerA = centroid(ringA);
  const centerB = centroid(ringB);
  const span = length(sub(centerB, centerA));
  if (span <= PROFILE_LOFT_SETTINGS.centerEpsilon) {
    return blank("blocked", sampleCount, steps, "The profile centers coincide, so the transition direction is undefined.");
  }

  const flip = windingFlip(ringA, ringB, centerA, centerB);
  if (flip === null) return blank("blocked", sampleCount, steps, "The profiles do not form a surface around the transition.");

  const vertexCount = sampleCount * steps;
  const triangleCount = 2 * sampleCount * (steps - 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);
  const direction = scale(sub(centerB, centerA), 1 / span);

  for (let ring = 0; ring < steps; ring += 1) {
    const t = ring / (steps - 1);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const point = lerp(ringA[sample], ringB[sample], t);
      const offset = (ring * sampleCount + sample) * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
    }
  }

  let written = 0;
  for (let ring = 0; ring < steps - 1; ring += 1) {
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const next = (sample + 1) % sampleCount;
      const a = ring * sampleCount + sample;
      const b = ring * sampleCount + next;
      const c = (ring + 1) * sampleCount + next;
      const d = (ring + 1) * sampleCount + sample;
      const quad = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
      for (const index of quad) indices[written++] = index;
      addNormal(normals, positions, a, b, c, flip);
      addNormal(normals, positions, a, c, d, flip);
    }
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const accumulated = { x: normals[offset], y: normals[offset + 1], z: normals[offset + 2] };
    const unit = unitOrRadial(accumulated, positions, offset, centerA, centerB, vertex, sampleCount, steps, direction);
    normals[offset] = unit.x;
    normals[offset + 1] = unit.y;
    normals[offset + 2] = unit.z;
  }

  return {
    version: PROFILE_LOFT_SETTINGS.version,
    status: "ready",
    geometry: { positions, normals, indices, triangles: triangleCount },
    vertexCount,
    triangleCount,
    longitudinalSteps: steps,
    sampleCount,
    span,
    reason: "",
  };
}

function windingFlip(ringA: Vec3[], ringB: Vec3[], centerA: Vec3, centerB: Vec3) {
  const axis = lerp(centerA, centerB, 0.5);
  let best = 0;
  let bestDistance = -1;
  for (let index = 0; index < ringA.length; index += 1) {
    const radial = length(sub(ringA[index], centerA));
    if (radial > bestDistance) {
      bestDistance = radial;
      best = index;
    }
  }
  for (let step = 0; step < ringA.length; step += 1) {
    const index = (best + step) % ringA.length;
    const next = (index + 1) % ringA.length;
    const mid = lerp(lerp(ringA[index], ringA[next], 0.5), lerp(ringB[index], ringB[next], 0.5), 0.5);
    const outward = sub(mid, axis);
    if (length(outward) <= PROFILE_LOFT_SETTINGS.centerEpsilon) continue;
    const normal = cross(sub(ringA[next], ringA[index]), sub(ringB[next], ringA[index]));
    if (length(normal) <= PROFILE_LOFT_SETTINGS.centerEpsilon) continue;
    return dot(normal, outward) < 0;
  }
  return null;
}

function addNormal(normals: Float32Array, positions: Float32Array, a: number, b: number, c: number, flip: boolean) {
  const pa = read(positions, a);
  const pb = read(positions, b);
  const pc = read(positions, c);
  const face = flip ? cross(sub(pc, pa), sub(pb, pa)) : cross(sub(pb, pa), sub(pc, pa));
  for (const index of [a, b, c]) {
    const offset = index * 3;
    normals[offset] += face.x;
    normals[offset + 1] += face.y;
    normals[offset + 2] += face.z;
  }
}

function unitOrRadial(
  accumulated: Vec3,
  positions: Float32Array,
  offset: number,
  centerA: Vec3,
  centerB: Vec3,
  vertex: number,
  sampleCount: number,
  steps: number,
  direction: Vec3,
) {
  const unit = normalize(accumulated);
  if (unit) return unit;
  const ring = Math.floor(vertex / sampleCount);
  const axis = lerp(centerA, centerB, ring / (steps - 1));
  const radial = normalize(sub(read(positions, offset / 3), axis));
  if (radial) return radial;
  return perpendicular(direction);
}

function usableFrame(frame: FaceFrame | null): frame is FaceFrame {
  if (!frame) return false;
  return [frame.origin, frame.normal, frame.u, frame.v].every(finiteVec)
    && nearUnit(frame.normal)
    && nearUnit(frame.u)
    && nearUnit(frame.v);
}

function finiteSample(sample: CorrespondenceSample) {
  return Number.isFinite(sample.u) && Number.isFinite(sample.v);
}

function finiteVec(value: Vec3) {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function nearUnit(value: Vec3) {
  return Math.abs(length(value) - 1) < 1e-3;
}

function centroid(points: readonly Vec3[]): Vec3 {
  const sum = points.reduce((acc, point) => add(acc, point), { x: 0, y: 0, z: 0 });
  return scale(sum, 1 / points.length);
}

function read(positions: Float32Array, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
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
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
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

function normalize(value: Vec3): Vec3 | null {
  const magnitude = length(value);
  if (magnitude <= 1e-8) return null;
  return scale(value, 1 / magnitude);
}

function perpendicular(direction: Vec3): Vec3 {
  const ax = Math.abs(direction.x);
  const ay = Math.abs(direction.y);
  const az = Math.abs(direction.z);
  const helper = ax <= ay && ax <= az ? { x: 1, y: 0, z: 0 } : ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  return normalize(cross(direction, helper)) ?? { x: 0, y: 1, z: 0 };
}

function blank(status: Exclude<ProfileLoftStatus, "ready">, sampleCount: number, steps: number, reason: string): ProfileLoft {
  return {
    version: PROFILE_LOFT_SETTINGS.version,
    status,
    geometry: null,
    vertexCount: 0,
    triangleCount: 0,
    longitudinalSteps: steps,
    sampleCount,
    span: null,
    reason,
  };
}
