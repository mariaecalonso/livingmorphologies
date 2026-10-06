import type { ModuleIdentity } from "./adapt";
import type { FaceId } from "./contract";
import { FACE_SAMPLE_SETTINGS, sampleFace, unavailableFace, type FaceObservation } from "./face-sample";
import type { ModuleHandoff } from "./adapt";

/**
 * SOM-inspired candidate field.
 * Columns move from archetype A toward archetype B. Rows add a fixed deviation
 * around that blend. This is not a trained self-organizing map.
 * A trained SOM would need a distance metric, a neighborhood function,
 * repeated presentation of input vectors, and weight updates on the lattice.
 *
 * Skill 1 `translateArchetype` reads one archetype's discrete catalog ratings,
 * which are only 0, 1, or 2. Candidate values stay continuous on [0, 2].
 * They are not passed through `paramsFromRatings` or rounded to Low / Medium / High.
 * A later adapter can map a continuous value onto CRITERION_TARGETS explicitly.
 */
export const CANDIDATE_FIELD_SETTINGS = {
  version: "skill4-candidate-field-v1",
  count: 25,
  rows: 5,
  columns: 5,
  order: "row-major, H01 at row 0 column 0",
  columnAxis: "t = column / 4, from archetype A to archetype B",
  rowAxis: "offset = (row - 2) / 2 * 0.25 around the column blend",
  rowAmplitude: 0.25,
  range: [0, 2] as const,
  shared: "equal catalog ratings are copied unchanged",
  oneSided: "a criterion ranked by only one archetype keeps that rating on every candidate",
  som: "SOM-inspired candidate field, not a trained self-organizing map",
} as const;

export type CriterionRole = "shared" | "blended" | "one-sided";

export type HybridCriterionValue = {
  criterionId: string;
  value: number;
  catalogA: number | null;
  catalogB: number | null;
  role: CriterionRole;
  clamped: boolean;
};

export type HybridCandidate = {
  id: string;
  row: number;
  column: number;
  criteria: HybridCriterionValue[];
  generationInput: {
    faceA: FaceObservation;
    faceB: FaceObservation;
    physicalConnection: false;
    note: string;
  };
};

export type CandidateField = {
  signature: string;
  version: typeof CANDIDATE_FIELD_SETTINGS.version;
  faceA: FaceObservation;
  faceB: FaceObservation;
  candidates: HybridCandidate[];
};

const INPUT_NOTE = "Selected face observations are generation inputs. They do not establish a physical connection.";

function ratingsOf(identity: ModuleIdentity | null) {
  const ratings = new Map<string, number>();
  if (!identity) return ratings;
  for (const group of identity.criteria) {
    for (const criterion of group.criteria) ratings.set(criterion.id, criterion.rating);
  }
  return ratings;
}

function blend(catalogA: number, catalogB: number, row: number, column: number) {
  const columns = CANDIDATE_FIELD_SETTINGS.columns - 1;
  const t = column / columns;
  const base = catalogA + (catalogB - catalogA) * t;
  const offset = ((row - 2) / 2) * CANDIDATE_FIELD_SETTINGS.rowAmplitude;
  const raw = base + offset;
  const value = Math.min(CANDIDATE_FIELD_SETTINGS.range[1], Math.max(CANDIDATE_FIELD_SETTINGS.range[0], raw));
  return { value, clamped: value !== raw };
}

export function buildCandidateField(args: {
  signature: string;
  ratingsA: ReadonlyMap<string, number>;
  ratingsB: ReadonlyMap<string, number>;
  faceA: FaceObservation;
  faceB: FaceObservation;
}): CandidateField {
  const ids = [...new Set([...args.ratingsA.keys(), ...args.ratingsB.keys()])].sort();
  const candidates: HybridCandidate[] = [];
  for (let row = 0; row < CANDIDATE_FIELD_SETTINGS.rows; row += 1) {
    for (let column = 0; column < CANDIDATE_FIELD_SETTINGS.columns; column += 1) {
      const index = row * CANDIDATE_FIELD_SETTINGS.columns + column + 1;
      const criteria = ids.map((criterionId) => {
        const catalogA = args.ratingsA.has(criterionId) ? args.ratingsA.get(criterionId)! : null;
        const catalogB = args.ratingsB.has(criterionId) ? args.ratingsB.get(criterionId)! : null;
        if (catalogA !== null && catalogB !== null && catalogA === catalogB) {
          return { criterionId, value: catalogA, catalogA, catalogB, role: "shared" as const, clamped: false };
        }
        if (catalogA !== null && catalogB !== null) {
          const mixed = blend(catalogA, catalogB, row, column);
          return { criterionId, value: mixed.value, catalogA, catalogB, role: "blended" as const, clamped: mixed.clamped };
        }
        const only = catalogA ?? catalogB ?? 0;
        return { criterionId, value: only, catalogA, catalogB, role: "one-sided" as const, clamped: false };
      });
      candidates.push({
        id: `H${String(index).padStart(2, "0")}`,
        row,
        column,
        criteria,
        generationInput: {
          faceA: args.faceA,
          faceB: args.faceB,
          physicalConnection: false,
          note: INPUT_NOTE,
        },
      });
    }
  }
  return {
    signature: args.signature,
    version: CANDIDATE_FIELD_SETTINGS.version,
    faceA: args.faceA,
    faceB: args.faceB,
    candidates,
  };
}

export function generateCandidateField(args: {
  signature: string;
  faceA: FaceId;
  faceB: FaceId;
  moduleA: ModuleHandoff;
  moduleB: ModuleHandoff;
}): { ok: true; field: CandidateField } | { ok: false; reason: string } {
  if (args.moduleA.status !== "ready" || args.moduleB.status !== "ready") {
    const missing = [args.moduleA, args.moduleB]
      .filter((item) => item.status !== "ready")
      .map((item) => item.identity?.name ?? item.archetypeId);
    return { ok: false, reason: `Geometry is unavailable for ${missing.join(" and ")}. Candidate inputs were not generated.` };
  }
  const faceA = sampleFace(args.moduleA.geometry, args.faceA, args.moduleA.faces[args.faceA]);
  const faceB = sampleFace(args.moduleB.geometry, args.faceB, args.moduleB.faces[args.faceB]);
  return {
    ok: true,
    field: buildCandidateField({
      signature: args.signature,
      ratingsA: ratingsOf(args.moduleA.identity),
      ratingsB: ratingsOf(args.moduleB.identity),
      faceA,
      faceB,
    }),
  };
}

export function faceSampleVersion() {
  return FACE_SAMPLE_SETTINGS.version;
}

export { unavailableFace };
