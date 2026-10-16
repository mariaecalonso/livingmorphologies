import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { parentWeights, rowTransformationIntensity, type HybridCandidate } from "./candidate-field";
import type { FaceFrame, FaceId } from "./contract";
import type { FaceObservation } from "./face-sample";
import { extractFaceProfile, type FaceProfile, type ProfilePoint } from "./face-profile";
import type { DeformationDna } from "./hybrid-deformation";
import { growHybridVolume } from "./network-volume";

/**
 * Skill 04 connector contract.
 * Continuous candidate DNA stays on the request. It is not passed to translateArchetype
 * and is not rounded to catalog rankings.
 *
 * Each connector is a network of nodes and edges. Edge strength reinforces,
 * merges, or prunes those routes, then one implicit volume is built from the
 * surviving radii. Source meshes are not rewritten.
 * Centroid face samples remain request context. They do not decide the cross-section.
 *
 * Placement maps the volume from the two section frames onto the placed faces.
 * connectorDepth stays null, and tiles are not moved.
 */
export const HYBRID_GENERATOR_SETTINGS = {
  version: "skill4-hybrid-generator-v4",
  seed: 1,
  geometry: "network-volume",
  extraction: "cross-section",
  placement: "overlap-pending-depth",
  connectorDepth: null,
  sectionDepth: 0.15,
  profileSamples: 24,
  loftSteps: 13,
} as const;

export type CatalogDna = {
  archetypeId: string;
  ratings: Record<string, number>;
};

export type HybridGeneratorRequest = {
  moduleA: ReadyModule;
  moduleB: ReadyModule;
  catalogA: CatalogDna;
  catalogB: CatalogDna;
  faceA: FaceId;
  faceB: FaceId;
  frameA: FaceFrame;
  frameB: FaceFrame;
  observationA: FaceObservation;
  observationB: FaceObservation;
  candidate: HybridCandidate;
  settings: typeof HYBRID_GENERATOR_SETTINGS;
};

export type HybridGeneratorStatus = "ready" | "blocked" | "invalid" | "empty";

export type HybridGeneratorResult = {
  status: HybridGeneratorStatus;
  geometry: IsoMesh | null;
  candidateId: string | null;
  vertexCount: number;
  triangleCount: number;
  reason: string;
};

export interface HybridGenerator {
  readonly settings: typeof HYBRID_GENERATOR_SETTINGS;
  generate(request: HybridGeneratorRequest): HybridGeneratorResult;
}

function deformationDna(
  request: HybridGeneratorRequest,
  sectionDepth: number,
  alignedA: readonly { u: number; v: number }[],
  alignedB: readonly { u: number; v: number }[],
): DeformationDna {
  const weights = typeof request.candidate.parentAWeight === "number"
    ? { parentAWeight: request.candidate.parentAWeight, parentBWeight: request.candidate.parentBWeight }
    : parentWeights(request.candidate.column);
  const transformationIntensity = typeof request.candidate.transformationIntensity === "number"
    ? request.candidate.transformationIntensity
    : rowTransformationIntensity(request.candidate.row);
  return {
    criteria: request.candidate.criteria,
    parentAWeight: weights.parentAWeight,
    parentBWeight: weights.parentBWeight,
    transformationIntensity,
    localSectionA: localSection(request.moduleA.geometry, request.frameA, sectionDepth, alignedA),
    localSectionB: localSection(request.moduleB.geometry, request.frameB, sectionDepth, alignedB),
  };
}

const localSectionCache = new WeakMap<IsoMesh, Map<string, { u: number; v: number }[] | null>>();

function localSection(
  geometry: IsoMesh,
  frame: FaceFrame,
  sectionDepth: number,
  contact: readonly { u: number; v: number }[],
) {
  const key = `${frame.id}:${sectionDepth}:${contact.length}`;
  let cached = localSectionCache.get(geometry);
  if (!cached) {
    cached = new Map();
    localSectionCache.set(geometry, cached);
  }
  const hit = cached.get(key);
  if (hit !== undefined) return hit;
  const section = computeLocalSection(geometry, frame, sectionDepth, contact);
  cached.set(key, section);
  return section;
}

function computeLocalSection(
  geometry: IsoMesh,
  frame: FaceFrame,
  sectionDepth: number,
  contact: readonly { u: number; v: number }[],
) {
  const depths = [sectionDepth * 2.4, sectionDepth * 4, sectionDepth * 6];
  let best: { area: number; points: ProfilePoint[] } | null = null;
  for (const depth of depths) {
    const profile = extractFaceProfile(geometry, frame, depth);
    const loop = fullestLoop(profile);
    if (!loop) continue;
    const area = loopArea(loop);
    if (!best || area > best.area) best = { area, points: loop };
  }
  if (!best || contact.length < 3) return null;
  return resampleSection(contact, best.points);
}

function fullestLoop(profile: FaceProfile) {
  const closed = profile.loops.filter((loop) => loop.closed && loop.points.length >= 3);
  if (closed.length === 0) return null;
  return closed.reduce((largest, loop) => (loop.points.length > largest.points.length ? loop : largest)).points;
}

function loopArea(points: readonly ProfilePoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].u * next.v - next.u * points[index].v;
  }
  return Math.abs(area) * 0.5;
}

function resampleSection(contact: readonly { u: number; v: number }[], deep: readonly ProfilePoint[]) {
  const contactCenter = averageUv(contact);
  const deepCenter = averageUv(deep);
  const polar = deep.map((point) => {
    const u = point.u - deepCenter.u;
    const v = point.v - deepCenter.v;
    return { angle: Math.atan2(v, u), radius: Math.hypot(u, v) };
  }).sort((left, right) => left.angle - right.angle);
  return contact.map((sample) => {
    const angle = Math.atan2(sample.v - contactCenter.v, sample.u - contactCenter.u);
    const radius = radiusAt(polar, angle);
    return { u: Math.cos(angle) * radius, v: Math.sin(angle) * radius };
  });
}

function radiusAt(polar: readonly { angle: number; radius: number }[], angle: number) {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  for (let index = 0; index < polar.length; index += 1) {
    const next = polar[(index + 1) % polar.length];
    const from = polar[index].angle;
    let to = next.angle;
    let target = wrapped;
    if (to <= from) to += Math.PI * 2;
    if (target < from) target += Math.PI * 2;
    if (target < from || target > to) continue;
    const span = to - from;
    const t = span <= 1e-8 ? 0 : (target - from) / span;
    return polar[index].radius + (next.radius - polar[index].radius) * t;
  }
  return polar.reduce((sum, point) => sum + point.radius, 0) / polar.length;
}

function averageUv(points: readonly { u: number; v: number }[]) {
  const sum = points.reduce((acc, point) => ({ u: acc.u + point.u, v: acc.v + point.v }), { u: 0, v: 0 });
  return { u: sum.u / points.length, v: sum.v / points.length };
}

export function catalogDna(module: ReadyModule): CatalogDna {
  const ratings: Record<string, number> = {};
  for (const group of module.identity.criteria) {
    for (const criterion of group.criteria) ratings[criterion.id] = criterion.rating;
  }
  return { archetypeId: module.identity.archetypeId, ratings };
}

function failed(request: HybridGeneratorRequest, status: Exclude<HybridGeneratorStatus, "ready">, reason: string): HybridGeneratorResult {
  return {
    status,
    geometry: null,
    candidateId: request.candidate?.id ?? null,
    vertexCount: 0,
    triangleCount: 0,
    reason,
  };
}

function settingsMatch(settings: HybridGeneratorRequest["settings"]) {
  return settings.version === HYBRID_GENERATOR_SETTINGS.version
    && settings.geometry === HYBRID_GENERATOR_SETTINGS.geometry
    && settings.sectionDepth === HYBRID_GENERATOR_SETTINGS.sectionDepth
    && settings.profileSamples === HYBRID_GENERATOR_SETTINGS.profileSamples
    && settings.loftSteps === HYBRID_GENERATOR_SETTINGS.loftSteps
    && settings.connectorDepth === HYBRID_GENERATOR_SETTINGS.connectorDepth;
}

export const pendingHybridGenerator: HybridGenerator = {
  settings: HYBRID_GENERATOR_SETTINGS,
  generate(request) {
    if (!settingsMatch(request.settings)) {
      return failed(request, "invalid", "The generator settings do not match skill4-hybrid-generator-v4.");
    }
    const { sectionDepth, profileSamples, loftSteps } = request.settings;
    if (!Number.isFinite(sectionDepth) || sectionDepth < 0 || !Number.isInteger(profileSamples) || profileSamples < 3 || !Number.isInteger(loftSteps) || loftSteps < 2) {
      return failed(request, "invalid", "The section depth, sample count, or loft steps are not usable.");
    }
    if (request.moduleA.geometry.triangles < 1 || request.moduleB.geometry.triangles < 1) {
      return failed(request, "blocked", "One or both adapted modules have no mesh. Connector geometry was not created.");
    }

    if (!Array.isArray(request.candidate.criteria)) {
      return failed(request, "invalid", "Candidate criteria are missing. No connector was created.");
    }
    const profileA = extractFaceProfile(request.moduleA.geometry, request.frameA, sectionDepth);
    const profileB = extractFaceProfile(request.moduleB.geometry, request.frameB, sectionDepth);
    const profiles = [profileA, profileB];
    if (profiles.some((profile) => profile.status === "invalid")) {
      const faces = profiles.filter((profile) => profile.status === "invalid").map((profile) => profile.face ?? "unknown");
      return failed(request, "invalid", `Face profile ${faces.join(" and ")} is invalid. No connector was created.`);
    }
    if (profiles.some((profile) => profile.status !== "ready")) {
      const faces = profiles.filter((profile) => profile.status !== "ready").map((profile) => profile.face ?? "unknown");
      return failed(request, "empty", `Face profile ${faces.join(" and ")} has no cross-section. No connector was created.`);
    }

    const volume = growHybridVolume({
      profileA,
      profileB,
      candidate: request.candidate,
      observationA: request.observationA,
      observationB: request.observationB,
    });
    if (volume.status !== "ready" || !volume.mesh) {
      return failed(request, volume.status === "ready" ? "blocked" : volume.status, volume.reason || "The network did not produce a connector.");
    }

    return {
      status: "ready",
      geometry: volume.mesh,
      candidateId: request.candidate.id,
      vertexCount: volume.mesh.positions.length / 3,
      triangleCount: volume.mesh.triangles,
      reason: "",
    };
  },
};
