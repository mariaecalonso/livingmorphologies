import type { ReadyModule } from "./adapt";
import type { HybridCandidate } from "./candidate-field";
import type { FaceFrame, FaceId } from "./contract";
import type { FaceObservation } from "./face-sample";

/**
 * Skill 04 connector contract.
 * Continuous candidate DNA stays here. It is not passed to translateArchetype,
 * not rounded to catalog rankings, and not run through the Skills 01–03 simulation.
 *
 * The hybrid is a volumetric transition tile with its own depth. It is not a sheet
 * on the shared registration plane, and it is not limited to cells occupied on both sides.
 *
 * Interface extraction, not yet executed:
 * IsoMesh is a triangle surface. The 8×8 centroid grid only observes whether samples
 * fell in the face slab. It does not trace an attachment boundary. The fit for these
 * meshes is a cross-section: intersect each triangle with a plane parallel to the
 * selected face and chain the cut segments into polylines in that face's u/v frame.
 * Triangle clipping against a thick slab would leave surface fragments, not a closed
 * profile. The section depth is unresolved and is not given a default here.
 *
 * Correspondence and volume, not yet executed:
 * Each profile stays in its own face frame, then both are placed in one connector frame.
 * Different profiles are kept. Correspondence is by normalized u/v, including regions
 * present on only one side. A new IsoMesh would loft those profiles across the connector
 * depth. The source position buffers are not rewritten.
 * If both sections are empty, attachment is unsupported and no volume is emitted.
 * If only one section exists, that side is reported disconnected. Continuity is not claimed.
 *
 * Candidate DNA controls, once a depth is chosen:
 * The candidate column sets t from A to B. Along connector depth s, the loft weight is
 * t at the middle and the end sections stay on their source profiles.
 * The candidate row offset scales the intermediate section away from straight u/v
 * correspondence, by at most one quarter of the face extent. Shared catalog ratings
 * do not move the loft. One-sided ratings do not invent a profile for the other module.
 *
 * Placement, unresolved:
 * The envelopes touch, so a connector with depth does not fit in the gap.
 * Tiles are not moved. The open policy is an overlap: the connector occupies a finite
 * depth inside each module's own envelope, measured from the selected face, without
 * editing that module. The depth must be an explicit registration-lattice distance.
 * It is null until chosen. In a 2×2 assembly the same policy applies independently to
 * A-B, A-C, B-D, and C-D. A gap policy would separate every pair and is not assumed.
 *
 * The provisional mocks do not support this. Their selected east and west slabs contain
 * no centroids, so no cross-section is available. Suitable tests need separate Skill 04
 * fixtures whose triangles cross a known section plane. Those fixtures must not replace
 * the provisional mocks.
 */
export const HYBRID_GENERATOR_SETTINGS = {
  version: "skill4-hybrid-generator-v1",
  seed: 1,
  geometry: "pending",
  extraction: "cross-section",
  placement: "overlap-pending-depth",
  connectorDepth: null,
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

export type HybridGeneratorResult = {
  status: "pending" | "blocked";
  geometry: null;
  candidateId: string | null;
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

function blocked(reason: string): HybridGeneratorResult {
  return { status: "blocked", geometry: null, candidateId: null, reason };
}

export const pendingHybridGenerator: HybridGenerator = {
  settings: HYBRID_GENERATOR_SETTINGS,
  generate(request) {
    if (request.settings.version !== HYBRID_GENERATOR_SETTINGS.version || request.settings.geometry !== "pending") {
      return blocked("The generator settings do not match skill4-hybrid-generator-v1.");
    }
    if (request.moduleA.geometry.triangles < 1 || request.moduleB.geometry.triangles < 1) {
      return blocked("One or both adapted modules have no mesh. Connector geometry was not created.");
    }
    const empty = [request.observationA, request.observationB].filter((observation) => observation.status !== "occupied");
    if (empty.length) {
      const names = empty.map((observation) => `${observation.face} ${observation.status}`).join(", ");
      return {
        status: "pending",
        geometry: null,
        candidateId: request.candidate.id,
        reason: `Connector geometry remains pending. No attachment cross-section is available (${names}). The centroid grid is not an attachment boundary, and no transition volume is emitted.`,
      };
    }
    return {
      status: "pending",
      geometry: null,
      candidateId: request.candidate.id,
      reason: "Face samples exist, but attachment still requires cross-section profiles. Connector depth is unresolved, so no transition volume is emitted.",
    };
  },
};
