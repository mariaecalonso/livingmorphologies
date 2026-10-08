import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import type { HybridCandidate } from "./candidate-field";
import type { FaceFrame, FaceId } from "./contract";
import type { FaceObservation } from "./face-sample";
import { extractFaceProfile } from "./face-profile";
import { correspondProfiles } from "./profile-correspondence";
import { loftProfiles } from "./profile-loft";

/**
 * Skill 04 connector contract.
 * Continuous candidate DNA stays on the request. It is not passed to translateArchetype
 * and is not rounded to catalog rankings. It deforms only the intermediate loft rings.
 *
 * Geometry is a new open IsoMesh: extract a cross-section on each selected face,
 * correspond the largest closed loops, then loft between those reconstructed profiles.
 * Both faces use the same provisional section depth. Source meshes are not rewritten.
 * Centroid face samples remain request context. They do not decide the cross-section.
 *
 * Placement is still unresolved. connectorDepth stays null, and tiles are not moved.
 * The loft span is the distance between the two section centers.
 */
export const HYBRID_GENERATOR_SETTINGS = {
  version: "skill4-hybrid-generator-v1",
  seed: 1,
  geometry: "profile-loft",
  extraction: "cross-section",
  placement: "overlap-pending-depth",
  connectorDepth: null,
  sectionDepth: 0.15,
  profileSamples: 16,
  loftSteps: 5,
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
    && settings.connectorDepth === HYBRID_GENERATOR_SETTINGS.connectorDepth;
}

export const pendingHybridGenerator: HybridGenerator = {
  settings: HYBRID_GENERATOR_SETTINGS,
  generate(request) {
    if (!settingsMatch(request.settings)) {
      return failed(request, "invalid", "The generator settings do not match skill4-hybrid-generator-v1.");
    }
    const { sectionDepth, profileSamples, loftSteps } = request.settings;
    if (!Number.isFinite(sectionDepth) || sectionDepth < 0 || !Number.isInteger(profileSamples) || profileSamples < 3 || !Number.isInteger(loftSteps) || loftSteps < 2) {
      return failed(request, "invalid", "The section depth, sample count, or loft steps are not usable.");
    }
    if (request.moduleA.geometry.triangles < 1 || request.moduleB.geometry.triangles < 1) {
      return failed(request, "blocked", "One or both adapted modules have no mesh. Connector geometry was not created.");
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

    const correspondence = correspondProfiles(profileA, profileB, profileSamples);
    if (correspondence.status !== "ready") {
      return failed(request, correspondence.status, correspondence.reason || "Profile correspondence did not produce a connector.");
    }

    const loft = loftProfiles({
      correspondence,
      frameA: request.frameA,
      frameB: request.frameB,
      depthA: sectionDepth,
      depthB: sectionDepth,
      steps: loftSteps,
      deformation: request.candidate,
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
