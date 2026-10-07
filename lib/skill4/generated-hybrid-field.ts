import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import type { CandidateField, HybridCandidate } from "./candidate-field";
import type { FaceId } from "./contract";
import {
  catalogDna,
  HYBRID_GENERATOR_SETTINGS,
  pendingHybridGenerator,
  type HybridGeneratorStatus,
} from "./hybrid-generator";

/**
 * One real connector for every candidate on a single connection.
 * Each candidate is sent through pendingHybridGenerator.generate.
 * The connection signature is the one already stored on the CandidateField.
 */
export const GENERATED_HYBRID_FIELD_SETTINGS = {
  version: "skill4-generated-hybrid-field-v1",
  order: "same order as CandidateField.candidates",
} as const;

export type GeneratedHybridFieldStatus = "ready" | "partial" | "blocked" | "empty" | "invalid";

export type GeneratedHybridCandidate = {
  candidateId: string;
  candidate: HybridCandidate;
  status: HybridGeneratorStatus;
  geometry: IsoMesh | null;
  vertexCount: number;
  triangleCount: number;
  reason: string;
};

export type GeneratedHybridField = {
  version: typeof GENERATED_HYBRID_FIELD_SETTINGS.version;
  status: GeneratedHybridFieldStatus;
  connectionSignature: string;
  candidates: GeneratedHybridCandidate[];
  readyCount: number;
  blockedCount: number;
  emptyCount: number;
  invalidCount: number;
};

export type GeneratedHybridFieldRequest = {
  moduleA: ReadyModule;
  moduleB: ReadyModule;
  faceA: FaceId;
  faceB: FaceId;
  candidateField: CandidateField;
  settings: typeof HYBRID_GENERATOR_SETTINGS;
};

export function generateHybridField(request: GeneratedHybridFieldRequest): GeneratedHybridField {
  const frameA = request.moduleA.faces[request.faceA];
  const frameB = request.moduleB.faces[request.faceB];
  const catalogA = catalogDna(request.moduleA);
  const catalogB = catalogDna(request.moduleB);
  const candidates = request.candidateField.candidates.map((candidate) => {
    if (!frameA || !frameB) {
      return failedCandidate(candidate, "invalid", "A selected face has no frame. No connector was created.");
    }
    try {
      const result = pendingHybridGenerator.generate({
        moduleA: request.moduleA,
        moduleB: request.moduleB,
        catalogA,
        catalogB,
        faceA: request.faceA,
        faceB: request.faceB,
        frameA,
        frameB,
        observationA: request.candidateField.faceA,
        observationB: request.candidateField.faceB,
        candidate,
        settings: request.settings,
      });
      return {
        candidateId: candidate.id,
        candidate,
        status: result.status,
        geometry: result.geometry,
        vertexCount: result.vertexCount,
        triangleCount: result.triangleCount,
        reason: result.reason,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Candidate generation failed.";
      return failedCandidate(candidate, "invalid", reason);
    }
  });
  return assemble(request.candidateField.signature, candidates);
}

function failedCandidate(candidate: HybridCandidate, status: Exclude<HybridGeneratorStatus, "ready">, reason: string): GeneratedHybridCandidate {
  return {
    candidateId: candidate.id,
    candidate,
    status,
    geometry: null,
    vertexCount: 0,
    triangleCount: 0,
    reason,
  };
}

function assemble(connectionSignature: string, candidates: GeneratedHybridCandidate[]): GeneratedHybridField {
  const readyCount = candidates.filter((item) => item.status === "ready").length;
  const blockedCount = candidates.filter((item) => item.status === "blocked").length;
  const emptyCount = candidates.filter((item) => item.status === "empty").length;
  const invalidCount = candidates.filter((item) => item.status === "invalid").length;
  return {
    version: GENERATED_HYBRID_FIELD_SETTINGS.version,
    status: fieldStatus(candidates.length, readyCount, blockedCount, emptyCount, invalidCount),
    connectionSignature,
    candidates,
    readyCount,
    blockedCount,
    emptyCount,
    invalidCount,
  };
}

function fieldStatus(
  total: number,
  readyCount: number,
  blockedCount: number,
  emptyCount: number,
  invalidCount: number,
): GeneratedHybridFieldStatus {
  if (total === 0) return "empty";
  if (readyCount === total) return "ready";
  if (readyCount > 0) return "partial";
  if (invalidCount === total) return "invalid";
  if (blockedCount === total) return "blocked";
  if (emptyCount === total) return "empty";
  return "partial";
}
