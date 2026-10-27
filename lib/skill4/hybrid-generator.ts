import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import { CANDIDATE_FIELD_SETTINGS, type HybridCandidate } from "./candidate-field";
import type { FaceFrame, FaceId } from "./contract";
import type { FaceObservation } from "./face-sample";
import { extractFaceProfile, type FaceProfile } from "./face-profile";
import { correspondProfiles, sampleProfileLoop, type CorrespondenceSample, type ProfileCorrespondence } from "./profile-correspondence";
import { loftProfiles, type SomStation } from "./profile-loft";

/**
 * Skill 04 connector contract.
 * Continuous candidate DNA stays on the request. It is not passed to translateArchetype
 * and is not rounded to catalog rankings. It deforms only the intermediate loft rings.
 *
 * There is no trained iteration loop. Resolution comes from the profile sample count,
 * the loft ring count, and several inward parent sections. Those sections describe how
 * each parent widens, shifts, and articulates behind the attachment face. Ring 0 and
 * the last ring stay on the attachment sections. Source meshes are not rewritten.
 *
 * Placement is still unresolved. connectorDepth stays null, and tiles are not moved.
 * The loft span is the distance between the two section centers.
 */
export const HYBRID_GENERATOR_SETTINGS = {
  version: "skill4-hybrid-generator-v2",
  seed: 1,
  geometry: "profile-loft",
  extraction: "cross-section",
  placement: "overlap-pending-depth",
  connectorDepth: null,
  sectionDepth: 0.15,
  parentDepths: [0.15, 0.3, 0.45],
  profileSamples: 32,
  loftSteps: 12,
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
    && settings.connectorDepth === HYBRID_GENERATOR_SETTINGS.connectorDepth
    && sameDepths(settings.parentDepths, HYBRID_GENERATOR_SETTINGS.parentDepths);
}

function sameDepths(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((depth, index) => depth === right[index]);
}

export const pendingHybridGenerator: HybridGenerator = {
  settings: HYBRID_GENERATOR_SETTINGS,
  generate(request) {
    if (!settingsMatch(request.settings)) {
      return failed(request, "invalid", "The generator settings do not match skill4-hybrid-generator-v2.");
    }
    const { sectionDepth, profileSamples, loftSteps } = request.settings;
    if (!Number.isFinite(sectionDepth) || sectionDepth < 0 || !Number.isInteger(profileSamples) || profileSamples < 3 || !Number.isInteger(loftSteps) || loftSteps < 2) {
      return failed(request, "invalid", "The section depth, sample count, or loft steps are not usable.");
    }
    if (request.moduleA.geometry.triangles < 1 || request.moduleB.geometry.triangles < 1) {
      return failed(request, "blocked", "One or both adapted modules have no mesh. Connector geometry was not created.");
    }

    const profileA = cachedProfile(request.moduleA.geometry, request.frameA, sectionDepth);
    const profileB = cachedProfile(request.moduleB.geometry, request.frameB, sectionDepth);
    const profiles = [profileA, profileB];
    if (profiles.some((profile) => profile.status === "invalid")) {
      const faces = profiles.filter((profile) => profile.status === "invalid").map((profile) => profile.face ?? "unknown");
      return failed(request, "invalid", `Face profile ${faces.join(" and ")} is invalid. No connector was created.`);
    }
    if (profiles.some((profile) => profile.status !== "ready")) {
      const faces = profiles.filter((profile) => profile.status !== "ready").map((profile) => profile.face ?? "unknown");
      return failed(request, "empty", `Face profile ${faces.join(" and ")} has no cross-section. No connector was created.`);
    }

    const correspondence = cachedCorrespondence(request.moduleA.geometry, request.moduleB.geometry, request.frameA, request.frameB, sectionDepth, profileSamples);
    if (correspondence.status !== "ready") {
      return failed(request, correspondence.status, correspondence.reason || "Profile correspondence did not produce a connector.");
    }

    const som = somOf(request.candidate);
    const loft = loftProfiles({
      correspondence,
      frameA: request.frameA,
      frameB: request.frameB,
      depthA: sectionDepth,
      depthB: sectionDepth,
      steps: loftSteps,
      deformation: { criteria: request.candidate.criteria, intensity: som.intensity },
      som: {
        weightA: som.weightA,
        weightB: som.weightB,
        intensity: som.intensity,
        sectionsA: parentStations(request.moduleA.geometry, request.frameA, correspondence.alignedA, profileSamples),
        sectionsB: parentStations(request.moduleB.geometry, request.frameB, correspondence.alignedB, profileSamples),
      },
    });
    if (loft.status !== "ready" || !loft.geometry) {
      const status = loft.status === "ready" ? "blocked" : loft.status;
      return failed(request, status, loft.reason || "The loft did not produce a connector.");
    }

    return {
      status: "ready",
      geometry: loft.geometry,
      candidateId: request.candidate.id,
      vertexCount: loft.vertexCount,
      triangleCount: loft.triangleCount,
      reason: "",
    };
  },
};

const profileCache = new WeakMap<IsoMesh, Map<string, FaceProfile>>();
const correspondenceCache = new WeakMap<IsoMesh, WeakMap<IsoMesh, Map<string, ProfileCorrespondence>>>();

function somOf(candidate: HybridCandidate) {
  if (candidate.som && Number.isFinite(candidate.som.weightA) && Number.isFinite(candidate.som.intensity)) return candidate.som;
  const weightA = CANDIDATE_FIELD_SETTINGS.parentWeightsA[candidate.column] ?? 0.5;
  const intensity = CANDIDATE_FIELD_SETTINGS.intensities[candidate.row] ?? 0.82;
  const weightB = CANDIDATE_FIELD_SETTINGS.parentWeightsB[candidate.column] ?? 1 - weightA;
  return { weightA, weightB, intensity };
}

function cachedProfile(mesh: IsoMesh, frame: FaceFrame, depth: number) {
  let found = profileCache.get(mesh);
  if (!found) {
    found = new Map();
    profileCache.set(mesh, found);
  }
  const key = `${frame.id}:${depth}:${frame.origin.x}:${frame.origin.y}:${frame.origin.z}`;
  const stored = found.get(key);
  if (stored) return stored;
  const profile = extractFaceProfile(mesh, frame, depth);
  found.set(key, profile);
  return profile;
}

function cachedCorrespondence(
  meshA: IsoMesh,
  meshB: IsoMesh,
  frameA: FaceFrame,
  frameB: FaceFrame,
  depth: number,
  sampleCount: number,
) {
  let byB = correspondenceCache.get(meshA);
  if (!byB) {
    byB = new WeakMap();
    correspondenceCache.set(meshA, byB);
  }
  let found = byB.get(meshB);
  if (!found) {
    found = new Map();
    byB.set(meshB, found);
  }
  const key = `${frameA.id}:${frameB.id}:${depth}:${sampleCount}:${frameA.origin.x}:${frameB.origin.x}:${frameA.origin.y}:${frameB.origin.y}:${frameA.origin.z}:${frameB.origin.z}`;
  const stored = found.get(key);
  if (stored) return stored;
  const correspondence = correspondProfiles(cachedProfile(meshA, frameA, depth), cachedProfile(meshB, frameB, depth), sampleCount);
  found.set(key, correspondence);
  return correspondence;
}

function parentStations(mesh: IsoMesh, frame: FaceFrame, attachment: readonly CorrespondenceSample[], sampleCount: number): SomStation[] {
  const stations: SomStation[] = [attachment.map((sample) => ({ u: sample.u, v: sample.v }))];
  for (const depth of HYBRID_GENERATOR_SETTINGS.parentDepths) {
    if (depth === HYBRID_GENERATOR_SETTINGS.sectionDepth) continue;
    const sampled = sampleProfileLoop(cachedProfile(mesh, frame, depth), sampleCount, attachment);
    stations.push(sampled && stationFits(attachment, sampled) ? sampled : stations[stations.length - 1].map((sample) => ({ u: sample.u, v: sample.v })));
  }
  return stations;
}

function stationFits(attachment: readonly CorrespondenceSample[], sampled: readonly CorrespondenceSample[]) {
  if (sampled.length !== attachment.length) return false;
  let drift = 0;
  let base = 0;
  let area = 0;
  let origin = 0;
  for (let index = 0; index < sampled.length; index += 1) {
    const next = (index + 1) % sampled.length;
    drift += Math.hypot(sampled[index].u - attachment[index].u, sampled[index].v - attachment[index].v);
    base += Math.hypot(attachment[index].u, attachment[index].v);
    area += sampled[index].u * sampled[next].v - sampled[next].u * sampled[index].v;
    origin += attachment[index].u * attachment[next].v - attachment[next].u * attachment[index].v;
  }
  const meanDrift = drift / sampled.length;
  const meanRadius = base / sampled.length;
  if (meanDrift > Math.max(0.12, meanRadius * 0.85)) return false;
  if (Math.abs(origin) > 1e-6 && (Math.abs(area) / Math.abs(origin) < 0.25 || Math.abs(area) / Math.abs(origin) > 3.2)) return false;
  return sampled.every((sample) => Number.isFinite(sample.u) && Number.isFinite(sample.v));
}
