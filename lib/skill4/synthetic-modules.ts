import type { IsoMesh } from "../scan/isomesh";
import { booleanDifference, booleanUnion } from "./boolean-adapter";
import { registrationEnvelope, VIEW_SCAN, type Skill4ModuleRecord, type Vec3 } from "./contract";

/**
 * Development-only closed solids.
 * They occupy the existing Skill 04 registration envelope (the 20-cell field
 * mapped into display space). They do not replace the provisional fixtures.
 */
export const SYNTHETIC_TEST_LABEL = "TEST DATA / DEVELOPMENT ONLY";

export const SYNTHETIC_A_COLOR: [number, number, number] = [0.92, 0.45, 0.18];

export const SYNTHETIC_B_COLOR: [number, number, number] = [0.15, 0.72, 0.7];

export function syntheticModuleLabel(moduleId: string) {
  if (moduleId === SYNTHETIC_MODULE_A.moduleId) return "SYNTHETIC MODULE A · TEST DATA";
  if (moduleId === SYNTHETIC_MODULE_B.moduleId) return "SYNTHETIC MODULE B · TEST DATA";
  if (moduleId.startsWith("synthetic-test:")) return "SYNTHETIC MODULE · TEST DATA";
  return null;
}

export function syntheticModuleColor(moduleId: string): [number, number, number] | null {
  if (moduleId === SYNTHETIC_MODULE_A.moduleId) return SYNTHETIC_A_COLOR;
  if (moduleId === SYNTHETIC_MODULE_B.moduleId) return SYNTHETIC_B_COLOR;
  if (moduleId.startsWith("synthetic-test:")) return SYNTHETIC_A_COLOR;
  return null;
}

export const SKILL4_SYNTHETIC_KEY = "lm-skill4-synthetic-test";

export const SYNTHETIC_MODULE_A = {
  archetypeId: "topographic-ground-field",
  moduleId: "synthetic-test:stepped-notch@1",
  kind: "stepped-notch",
} as const;

export const SYNTHETIC_MODULE_B = {
  archetypeId: "linear-gallery",
  moduleId: "synthetic-test:offset-spine@1",
  kind: "offset-spine",
} as const;

const SCAN: Skill4ModuleRecord["scan"] = {
  seed: VIEW_SCAN.seed,
  iso: VIEW_SCAN.iso,
  spacing: VIEW_SCAN.spacing,
  yaw: VIEW_SCAN.yaw,
  slices: 24,
  stepsBetweenSlices: 22,
  stoppedOnConverged: false,
};

function solidBox(min: Vec3, max: Vec3): IsoMesh {
  const { x: x0, y: y0, z: z0 } = min;
  const { x: x1, y: y1, z: z1 } = max;
  const positions = [
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const indices = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function record(archetypeId: string, moduleId: string, geometry: IsoMesh, note: string): Skill4ModuleRecord {
  return {
    contract: "skill4-module-v1",
    moduleId,
    revision: 1,
    archetypeId,
    source: "mock",
    provisional: true,
    selectedFinal: false,
    scan: SCAN,
    registration: registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw),
    geometry,
    provenance: {
      role: "provisional-mock",
      note: `${SYNTHETIC_TEST_LABEL}. ${note}`,
    },
  };
}

async function requireSolid(result: { mesh: IsoMesh | null; reason: string }, label: string) {
  if (!result.mesh) throw new Error(`${label} did not produce a closed solid: ${result.reason}`);
  return result.mesh;
}

/**
 * Module A: registration block with one upper east-north corner removed.
 * Module B: full-width plinth with a tall spine shifted toward east and north.
 */
export async function buildSyntheticTestRecords(): Promise<Skill4ModuleRecord[]> {
  const bounds = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const block = solidBox(bounds.min, bounds.max);
  const notch = solidBox(
    { x: 0.12, y: 0.05, z: -0.08 },
    { x: bounds.max.x + 0.08, y: bounds.max.y + 0.08, z: 0.46 },
  );
  const stepped = await requireSolid(await booleanDifference(block, notch), "stepped notch");
  const plinth = solidBox(
    bounds.min,
    { x: bounds.max.x, y: bounds.min.y + 0.62, z: bounds.max.z },
  );
  const spine = solidBox(
    { x: -0.04, y: bounds.min.y + 0.2, z: -0.22 },
    { x: 0.48, y: bounds.max.y, z: 0.42 },
  );
  const offset = await requireSolid(await booleanUnion(plinth, spine), "offset spine");
  return [
    record(
      SYNTHETIC_MODULE_A.archetypeId,
      SYNTHETIC_MODULE_A.moduleId,
      stepped,
      "Closed stepped solid. A corner notch makes rotation and mirror readable. Not a Skill 03 result.",
    ),
    record(
      SYNTHETIC_MODULE_B.archetypeId,
      SYNTHETIC_MODULE_B.moduleId,
      offset,
      "Closed plinth and offset spine. Visually distinct from the stepped notch. Not a Skill 03 result.",
    ),
  ];
}

let pending: Promise<Skill4ModuleRecord[]> | null = null;

export function loadSyntheticTestRecords() {
  pending ??= buildSyntheticTestRecords();
  return pending;
}
