import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import type { CandidateField, HybridCandidate } from "./candidate-field";
import { anchorLatentField, type FeatureDiversity } from "./hybrid-features";
import { planFaceHybrids, connectorVisualVector, visualDistance, MIN_VISUAL_DISTANCE } from "./face-form";
import type { FaceId } from "./contract";
import { extractFaceProfile } from "./face-profile";
import { assessProfiles, faceOutline, profilesForCells } from "./face-hybrid-profile";
import {
  catalogDna,
  HYBRID_GENERATOR_SETTINGS,
  pendingHybridGenerator,
  sectionReach,
  type HybridGeneratorStatus,
} from "./hybrid-generator";
import { generateSectionalCandidates, SECTIONAL_GENERATOR_ACTIVE } from "./section-hybrid";

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
  branches: number;
  openings: number;
  /** Network snapshots from the same run. Not a substitute for `geometry`. */
  growth?: IsoMesh[];
  /** Sectional generator only. Absent on the previous face-outline field. */
  sectionReport?: {
    sectionsA: number;
    sectionsB: number;
    nearOpeningsA: number;
    nearOpeningsB: number;
    stations: number;
    correspondence: "YES" | "NO";
    fromA?: string;
    fromB?: string;
    recombined?: string;
    dropped?: string;
  };
  /** The rings passed to the loft for this candidate. Same points the mesh is built from. */
  loftRings?: { x: number; y: number; z: number }[][];
  /** Inner loops carried with those rings. The solid loft does not hollow them. */
  loftOpenings?: { x: number; y: number; z: number }[][][];
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
  if (SECTIONAL_GENERATOR_ACTIVE) {
    return assemble(request.candidateField.signature, generateSectionalCandidates(request));
  }
  const prepared = prepareCandidates(request.candidateField, request);
  if (!prepared.diversity.accepted || !prepared.faceAccepted) {
    const reason = prepared.diversity.accepted ? prepared.faceReason : prepared.diversity.reason;
    return assemble(request.candidateField.signature, prepared.candidates.map((candidate) => failedCandidate(candidate, "blocked", reason)));
  }
  const outlines = outlineSeparation(request);
  if (!outlines.accepted) {
    return assemble(request.candidateField.signature, prepared.candidates.map((candidate) => failedCandidate(candidate, "blocked", outlines.reason)));
  }
  const frameA = request.moduleA.faces[request.faceA];
  const frameB = request.moduleB.faces[request.faceB];
  const catalogA = catalogDna(request.moduleA);
  const catalogB = catalogDna(request.moduleB);
  const candidates = separateVisualNeighbors(request, prepared.candidates.map((candidate) => {
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
        branches: result.branches,
        openings: result.openings,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Candidate generation failed.";
      return failedCandidate(candidate, "invalid", reason);
    }
  }));
  return assemble(request.candidateField.signature, candidates);
}

function outlineSeparation(request: GeneratedHybridFieldRequest) {
  const frameA = request.moduleA.faces[request.faceA];
  const frameB = request.moduleB.faces[request.faceB];
  if (!frameA || !frameB) return { accepted: false, reason: "A selected face has no frame. No connector was created." };
  const outlineA = faceOutline(extractFaceProfile(request.moduleA.geometry, frameA, sectionReach(frameA)));
  const outlineB = faceOutline(extractFaceProfile(request.moduleB.geometry, frameB, sectionReach(frameB)));
  if (!outlineA || !outlineB) return { accepted: false, reason: "A selected face has no outline. No hybrid profile was created." };
  const ids = request.candidateField.candidates.map((candidate) => candidate.id);
  const profiles = profilesForCells(outlineA, outlineB, ids);
  const report = assessProfiles(profiles, outlineA, outlineB);
  return { accepted: report.accepted, reason: report.accepted ? "" : report.reason };
}

function prepareCandidates(field: CandidateField, request?: GeneratedHybridFieldRequest): { candidates: HybridCandidate[]; diversity: FeatureDiversity; faceAccepted: boolean; faceReason: string } {
  const latent = field.diversity && field.candidates.every((candidate) => (candidate.features?.length ?? 0) > 0)
    ? { candidates: field.candidates, diversity: field.diversity }
    : anchorLatentField(field.candidates, field.faceA, field.faceB);
  const faced = request ? applyFacePlan(field, latent.candidates, request) : { candidates: latent.candidates, accepted: field.faceDiversity?.accepted !== false, reason: field.faceDiversity?.reason ?? "" };
  return { candidates: faced.candidates, diversity: latent.diversity, faceAccepted: faced.accepted, faceReason: faced.reason };
}

function applyFacePlan(field: CandidateField, candidates: HybridCandidate[], request: GeneratedHybridFieldRequest) {
  if (field.faceDiversity && candidates.every((candidate) => candidate.faceHybrid)) {
    return { candidates, accepted: field.faceDiversity.accepted, reason: field.faceDiversity.reason };
  }
  const planned = planFaceHybrids({
    meshA: request.moduleA.geometry,
    frameA: request.moduleA.faces[request.faceA],
    observationA: field.faceA,
    meshB: request.moduleB.geometry,
    frameB: request.moduleB.faces[request.faceB],
    observationB: field.faceB,
    cells: candidates,
  });
  if (!planned) return { candidates, accepted: true, reason: "" };
  const byId = new Map(planned.states.map((state) => [state.id, state]));
  return {
    candidates: candidates.map((candidate) => ({ ...candidate, faceHybrid: byId.get(candidate.id) ?? candidate.faceHybrid })),
    accepted: planned.diversity.accepted,
    reason: planned.diversity.reason,
  };
}

function separateVisualNeighbors(request: GeneratedHybridFieldRequest, built: GeneratedHybridCandidate[]) {
  const next = built.map((item) => ({ ...item }));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const bump = new Set<number>();
    const vectors = next.map((item) => (item.geometry ? connectorVisualVector(item.geometry) : null));
    for (let index = 0; index < next.length; index += 1) {
      const row = Math.floor(index / 5);
      const column = index % 5;
      const neighbors = [column < 4 ? index + 1 : -1, row < 4 ? index + 5 : -1];
      for (const other of neighbors) {
        if (other < 0) continue;
        const left = vectors[index];
        const right = vectors[other];
        if (!left || !right) continue;
        if (visualDistance(left, right) < MIN_VISUAL_DISTANCE) bump.add(Math.max(index, other));
      }
    }
    if (bump.size === 0) break;
    for (const index of bump) {
      const current = next[index];
      if (!current || current.status !== "ready") continue;
      const candidate = { ...current.candidate, visualGain: Math.min(2.4, (current.candidate.visualGain ?? 1) + 0.45) };
      next[index] = generateOne(request, candidate);
    }
  }
  return next;
}

function generateOne(request: GeneratedHybridFieldRequest, candidate: HybridCandidate): GeneratedHybridCandidate {
  const frameA = request.moduleA.faces[request.faceA];
  const frameB = request.moduleB.faces[request.faceB];
  if (!frameA || !frameB) return failedCandidate(candidate, "invalid", "A selected face has no frame. No connector was created.");
  const result = pendingHybridGenerator.generate({
    moduleA: request.moduleA,
    moduleB: request.moduleB,
    catalogA: catalogDna(request.moduleA),
    catalogB: catalogDna(request.moduleB),
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
    branches: result.branches,
    openings: result.openings,
    growth: result.growth,
  };
}

/** Same candidates as generateHybridField, published after each one so the matrix can fill. */
export async function revealHybridField(
  request: GeneratedHybridFieldRequest,
  onField: (field: GeneratedHybridField) => void | Promise<void>,
  cancelled: () => boolean,
) {
  if (SECTIONAL_GENERATOR_ACTIVE) {
    if (!cancelled()) await onField(generateHybridField(request));
    return;
  }
  const prepared = prepareCandidates(request.candidateField, request);
  if (!prepared.diversity.accepted || !prepared.faceAccepted) {
    const reason = prepared.diversity.accepted ? prepared.faceReason : prepared.diversity.reason;
    await onField(assemble(request.candidateField.signature, prepared.candidates.map((candidate) => failedCandidate(candidate, "blocked", reason))));
    return;
  }
  const outlines = outlineSeparation(request);
  if (!outlines.accepted) {
    await onField(assemble(request.candidateField.signature, prepared.candidates.map((candidate) => failedCandidate(candidate, "blocked", outlines.reason))));
    return;
  }
  const frameA = request.moduleA.faces[request.faceA];
  const frameB = request.moduleB.faces[request.faceB];
  const built: GeneratedHybridCandidate[] = [];
  for (const candidate of prepared.candidates) {
    if (cancelled()) return;
    if (!frameA || !frameB) built.push(failedCandidate(candidate, "invalid", "A selected face has no frame. No connector was created."));
    else {
      try {
        built.push(generateOne(request, candidate));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Candidate generation failed.";
        built.push(failedCandidate(candidate, "invalid", reason));
      }
    }
    await onField(assemble(request.candidateField.signature, built));
  }
  if (!cancelled() && frameA && frameB) {
    await onField(assemble(request.candidateField.signature, separateVisualNeighbors(request, built)));
  }
}

export function hybridShapeVector(mesh: IsoMesh, topology: { branches: number; openings: number } = { branches: 0, openings: 0 }) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let volume = 0;
  let area = 0;
  const count = Math.floor(mesh.positions.length / 3);
  const { positions, indices } = mesh;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    cx += x;
    cy += y;
    cz += z;
  }
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const a = indices[triangle * 3] * 3;
    const b = indices[triangle * 3 + 1] * 3;
    const c = indices[triangle * 3 + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    area += Math.hypot(nx, ny, nz) * 0.5;
    volume += positions[a] * nx + positions[a + 1] * ny + positions[a + 2] * nz;
  }
  volume = Math.abs(volume) / 6;
  cx /= Math.max(1, count);
  cy /= Math.max(1, count);
  cz /= Math.max(1, count);
  let xx = 0;
  let yy = 0;
  let zz = 0;
  for (let index = 0; index < positions.length; index += 3) {
    xx += (positions[index] - cx) ** 2;
    yy += (positions[index + 1] - cy) ** 2;
    zz += (positions[index + 2] - cz) ** 2;
  }
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const span = Math.max(sizeX, sizeY, sizeZ, 1e-6);
  const axis = sizeX >= sizeY && sizeX >= sizeZ ? 0 : sizeY >= sizeZ ? 1 : 2;
  const axisMin = axis === 0 ? minX : axis === 1 ? minY : minZ;
  const sectionLow = [[Infinity, Infinity], [Infinity, Infinity], [Infinity, Infinity]];
  const sectionHigh = [[-Infinity, -Infinity], [-Infinity, -Infinity], [-Infinity, -Infinity]];
  for (let index = 0; index < positions.length; index += 3) {
    const point = [positions[index], positions[index + 1], positions[index + 2]];
    const bin = Math.min(2, Math.max(0, Math.floor(((point[axis] - axisMin) / span) * 3)));
    let slot = 0;
    for (let component = 0; component < 3; component += 1) {
      if (component === axis) continue;
      sectionLow[bin][slot] = Math.min(sectionLow[bin][slot], point[component]);
      sectionHigh[bin][slot] = Math.max(sectionHigh[bin][slot], point[component]);
      slot += 1;
    }
  }
  const sectionSpan = (bin: number) => sectionLow[bin][0] === Infinity ? 0 : Math.hypot(sectionHigh[bin][0] - sectionLow[bin][0], sectionHigh[bin][1] - sectionLow[bin][1]) / span;
  return [
    sizeX / span,
    sizeY / span,
    sizeZ / span,
    (cx - (minX + maxX) * 0.5) / span,
    (cy - (minY + maxY) * 0.5) / span,
    (cz - (minZ + maxZ) * 0.5) / span,
    Math.sqrt(xx / Math.max(1, count)) / span,
    Math.sqrt(yy / Math.max(1, count)) / span,
    Math.sqrt(zz / Math.max(1, count)) / span,
    volume / (span * span * span),
    area / (span * span),
    volume / Math.max(area, 1e-6) / span,
    sectionSpan(0),
    sectionSpan(1),
    sectionSpan(2),
    topology.branches,
    topology.openings,
  ];
}

const SHAPE_GROUPS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9],
  [10],
  [11],
  [12, 13, 14],
  [15],
  [16],
] as const;

export function hybridShapeSimilarity(left: readonly number[], right: readonly number[]) {
  let worst = 0;
  for (const group of SHAPE_GROUPS) {
    let difference = 0;
    for (const index of group) {
      const scale = Math.max(Math.abs(left[index]), Math.abs(right[index]), 0.05);
      difference += Math.abs(left[index] - right[index]) / scale;
    }
    worst = Math.max(worst, difference / group.length);
  }
  return 1 - worst;
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
    branches: 0,
    openings: 0,
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
