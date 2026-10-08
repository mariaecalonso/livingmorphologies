import type { ModuleHandoff } from "./adapt";
import { evaluateBooleanReadiness, PHYSICAL_TILE_REQUIREMENT, type BooleanReadiness } from "./boolean-conditioning";
import { FACE_IDS, SKILL4_MODULE_CONTRACT, type Skill4ModuleRecord } from "./contract";

/**
 * Skill 03 stays unchanged.
 * Design handoff is enough to preview, choose faces, and generate connectors.
 * Physical handoff is an extra check for insertion and boolean assembly.
 * Neither check rewrites the mesh.
 */
export const SKILL4_HANDOFF_CONTRACT = "skill4-handoff-v1" as const;

export const DESIGN_HANDOFF_REQUIREMENT = {
  version: SKILL4_HANDOFF_CONTRACT,
  level: "design",
  record: SKILL4_MODULE_CONTRACT,
  required: [
    "catalog archetype",
    "module id and revision",
    "source mock or skill03",
    "registration envelope for the recorded scan",
    "finite IsoMesh with positions, normals, indices, and at least one triangle",
    "six face frames N S E W T B",
  ],
  uses: [
    "preview",
    "face selection",
    "candidate generation",
    "hybrid generation",
    "SOM exploration",
    "assembly visualization",
  ],
} as const;

export const PHYSICAL_HANDOFF_REQUIREMENT = {
  version: SKILL4_HANDOFF_CONTRACT,
  level: "physical",
  requiresDesignHandoff: true,
  closed: PHYSICAL_TILE_REQUIREMENT.closed,
  oriented: PHYSICAL_TILE_REQUIREMENT.oriented,
  manifold: PHYSICAL_TILE_REQUIREMENT.manifold,
  components: PHYSICAL_TILE_REQUIREMENT.components,
  finiteBuffers: true,
  kernel: "manifold-3d accepts the mesh",
  uses: ["insertion", "boolean difference", "boolean union", "physically joined assembly"],
} as const;

export type DesignHandoffResult = {
  accepted: boolean;
  reason: string;
};

export type PhysicalHandoffResult = {
  accepted: boolean;
  designAccepted: boolean;
  readiness: BooleanReadiness | null;
  reason: string;
};

export function evaluateDesignHandoff(module: ModuleHandoff): DesignHandoffResult {
  if (module.status !== "ready") return { accepted: false, reason: module.reason };
  const mesh = module.geometry;
  if (!mesh || mesh.triangles < 1 || mesh.positions.length < 9 || mesh.indices.length !== mesh.triangles * 3) {
    return { accepted: false, reason: "mesh-missing" };
  }
  if (!FACE_IDS.every((id) => module.faces[id])) return { accepted: false, reason: "faces-missing" };
  return { accepted: true, reason: "" };
}

export async function evaluatePhysicalHandoff(module: ModuleHandoff): Promise<PhysicalHandoffResult> {
  const design = evaluateDesignHandoff(module);
  if (!design.accepted || module.status !== "ready") {
    return { accepted: false, designAccepted: false, readiness: null, reason: design.reason || "design-handoff-required" };
  }
  const readiness = await evaluateBooleanReadiness(module.geometry);
  return {
    accepted: readiness.booleanReady,
    designAccepted: true,
    readiness,
    reason: readiness.booleanReady ? "" : readiness.reason,
  };
}

export type HandoffRecordShape = Pick<
  Skill4ModuleRecord,
  "contract" | "moduleId" | "revision" | "archetypeId" | "source" | "registration" | "geometry" | "provenance"
>;
