/**
 * Skill 5 records for later phases.
 * Geometry stays in feet. +X is east, +Y is up, +Z is geographic north.
 * Archetypes and Skill 4 assemblies can be placed on the site.
 * Saved compositions live in data/skill5/configurations.json.
 * Skill 4 does not store connector meshes, so imported connections stay unresolved.
 */

export const SKILL5_SITE_ID = "one-herald-plaza" as const;

export const SKILL5_MODULE_ENVELOPE_FEET = 20;

export type Skill5Vec3 = { x: number; y: number; z: number };

/** Yaw about vertical, radians, from north toward west (right-hand about +Y). */
export type Skill5RigidTransform = {
  position: Skill5Vec3;
  rotationY: number;
};

export type Skill5ComponentKind = "archetype" | "connector";

export type Skill5GeometryState = "available" | "pending" | "unavailable" | "invalid";

export type Skill5Program = "workspace" | "lobby" | "gathering" | "unassigned";

export type Skill5ProgramSource = "suggested" | "assigned";

export type Skill5Provenance = {
  moduleId: string;
  archetypeId: string;
  source: "skill3" | "skill4";
  candidateId: number | null;
  continuationId: string | null;
};

export type Skill5Instance = {
  instanceId: string;
  kind: Skill5ComponentKind;
  provenance: Skill5Provenance;
  transform: Skill5RigidTransform;
  program: Skill5Program | null;
};

export type Skill5AssemblyImport = {
  assemblyId: string;
  parentAssemblyId: string | null;
  instances: Skill5Instance[];
};

export type Skill5Placement = {
  placementId: string;
  assemblyId: string;
  transform: Skill5RigidTransform;
};

export type Skill5Configuration = {
  id: string;
  parentConfigurationId: string | null;
  siteId: typeof SKILL5_SITE_ID;
  placements: Skill5Placement[];
};
