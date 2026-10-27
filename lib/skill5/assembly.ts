import { FACE_IDS, registrationEnvelope, VIEW_SCAN, type FaceId } from "@/lib/skill4/contract";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import type { AssemblyArrangement, AssemblyCount } from "@/lib/skill4/assembly-layout";
import type { FaceSelection } from "@/lib/skill4/connections";
import { SKILL5_MODULE_ENVELOPE_FEET, type Skill5GeometryState, type Skill5Program, type Skill5ProgramSource, type Skill5Provenance, type Skill5RigidTransform } from "./contract";
import { SITE_ARCHETYPES } from "./catalog";
import { footprintCorners, MODULE_GROUND_Y, type PlacedModule } from "./placement";

const box = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
const cell = box.max.x - box.min.x;

/** One Skill 4 registration cell maps uniformly onto the 20 ft envelope. */
export const SKILL4_FEET_PER_CELL = SKILL5_MODULE_ENVELOPE_FEET / cell;

export const CONNECTOR_UNAVAILABLE = "Skill 4 does not store connector meshes in the assembly catalog. This connection is kept as a relationship only.";

export const CONNECTOR_INVALIDATED = "A member's relative pose or membership changed. This adjacency is unresolved until Skill 4 regenerates it. No connector mesh is valid.";

export type AssemblyMirror = "x" | "y" | "z" | null;

export type AssemblyMember = {
  instanceId: string;
  tileId: string;
  name: string;
  status: "Validated" | "Review" | "Unavailable";
  geometryState: Skill5GeometryState;
  program: Skill5Program;
  programSource: Skill5ProgramSource;
  provenance: Skill5Provenance;
  catalogModuleId: string;
  meshModuleId: string | null;
  local: { x: number; y: number; z: number; rotationY: number };
  mirror: AssemblyMirror;
};

export type AssemblyConnector = {
  id: string;
  tileAId: string;
  tileBId: string;
  faceA: string;
  faceB: string;
  geometryState: Skill5GeometryState;
  status: "unavailable";
  invalidated: boolean;
  reason: string;
};

export type AssemblyBaseline = {
  assemblyId: string;
  arrangement: string;
  regenerationRequired: boolean;
  members: { tileId: string; local: AssemblyMember["local"] }[];
};

export type AssemblyProposal = {
  assemblyId: string;
  arrangement: string;
  regenerationRequired: boolean;
  sourceRegenerationRequired: boolean;
  moved: { tileId: string; name: string }[];
  added: { tileId: string; name: string; moduleId: string }[];
  removed: { tileId: string }[];
  affected: { id: string; tileAId: string; tileBId: string; faceA: string; faceB: string }[];
};

export type RerunDecision = "pending" | "keep" | "sent";

export type SiteAssembly = {
  placementId: string;
  assemblyId: string;
  parentAssemblyId: string | null;
  name: string;
  arrangement: string;
  tileCount: number;
  regenerationRequired: boolean;
  possibleRerunNeeded: boolean;
  rerunDecision: RerunDecision | null;
  rerunAssemblyId: string | null;
  testData: boolean;
  transform: Skill5RigidTransform;
  baseline: AssemblyBaseline;
  members: AssemblyMember[];
  connectors: AssemblyConnector[];
};

export function cellToFeet(value: number) {
  return value * SKILL4_FEET_PER_CELL;
}

export function composeAssemblyPose(
  group: { x: number; z: number; rotationY: number },
  local: { x: number; z: number; rotationY: number },
) {
  const ry = -group.rotationY;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return {
    x: group.x + local.x * cos + local.z * sin,
    z: group.z - local.x * sin + local.z * cos,
    rotationY: group.rotationY + local.rotationY,
  };
}

export function worldToAssemblyLocal(
  group: { x: number; z: number; rotationY: number },
  world: { x: number; z: number; rotationY: number },
) {
  const ry = -group.rotationY;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const dx = world.x - group.x;
  const dz = world.z - group.z;
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
    rotationY: world.rotationY - group.rotationY,
  };
}

function posesMatch(a: AssemblyMember["local"], b: AssemblyMember["local"]) {
  return Math.abs(a.x - b.x) < 1e-3
    && Math.abs(a.y - b.y) < 1e-3
    && Math.abs(a.z - b.z) < 1e-3
    && Math.abs(a.rotationY - b.rotationY) < 1e-4;
}

export function reviseAssemblyMembers(assembly: SiteAssembly, members: AssemblyMember[]): SiteAssembly {
  const sourceById = new Map(assembly.baseline.members.map((member) => [member.tileId, member]));
  const currentIds = new Set(members.map((member) => member.tileId));
  const changed = new Set<string>();
  for (const member of members) {
    const prior = sourceById.get(member.tileId);
    if (!prior || !posesMatch(prior.local, member.local)) changed.add(member.tileId);
  }
  for (const prior of assembly.baseline.members) {
    if (!currentIds.has(prior.tileId)) changed.add(prior.tileId);
  }
  const possibleRerunNeeded = changed.size > 0;
  const connectors = assembly.connectors.map((connector) => {
    const affected = changed.has(connector.tileAId) || changed.has(connector.tileBId) || !currentIds.has(connector.tileAId) || !currentIds.has(connector.tileBId);
    if (!affected) {
      return {
        ...connector,
        geometryState: "unavailable" as const,
        status: "unavailable" as const,
        invalidated: false,
        reason: connector.invalidated ? CONNECTOR_UNAVAILABLE : connector.reason,
      };
    }
    return {
      ...connector,
      geometryState: "unavailable" as const,
      status: "unavailable" as const,
      invalidated: true,
      reason: CONNECTOR_INVALIDATED,
    };
  });
  return {
    ...assembly,
    members,
    regenerationRequired: assembly.baseline.regenerationRequired,
    possibleRerunNeeded,
    rerunDecision: possibleRerunNeeded ? "pending" : null,
    connectors,
  };
}

export function keepAssemblyInSkill5(assembly: SiteAssembly): SiteAssembly {
  return { ...assembly, rerunDecision: "keep" };
}

export function markAssemblySent(assembly: SiteAssembly, rerunAssemblyId: string): SiteAssembly {
  return { ...assembly, rerunDecision: "sent", rerunAssemblyId };
}

/** Member arrangement only. A site move or rotation does not change it. */
export function proposalSignature(assembly: SiteAssembly): string {
  return [...assembly.members]
    .sort((a, b) => a.tileId.localeCompare(b.tileId))
    .map((member) => [
      member.tileId,
      member.catalogModuleId,
      member.local.x.toFixed(3),
      member.local.y.toFixed(3),
      member.local.z.toFixed(3),
      member.local.rotationY.toFixed(4),
      member.mirror ?? "",
    ].join(":"))
    .join("|");
}

export function catalogProposalSignature(entry: CatalogEntry): string {
  return [...entry.tiles]
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    .map((tile) => [
      tile.instanceId,
      tile.moduleId,
      cellToFeet(tile.transform.x).toFixed(3),
      cellToFeet(tile.transform.y).toFixed(3),
      cellToFeet(tile.transform.z).toFixed(3),
      (tile.rotationQuarter * Math.PI / 2).toFixed(4),
      tile.mirror ?? "",
    ].join(":"))
    .join("|");
}

/** The rerun record already written for this instance and this member arrangement. */
export function findSentProposal(entries: readonly CatalogEntry[], assembly: SiteAssembly): CatalogEntry | null {
  const signature = proposalSignature(assembly);
  return entries.find((entry) => entry.rerunNeeded === true
    && entry.sourcePlacementId === assembly.placementId
    && entry.parentAssemblyId === assembly.assemblyId
    && catalogProposalSignature(entry) === signature) ?? null;
}

export function earlierProposals(entries: readonly CatalogEntry[], assembly: SiteAssembly): CatalogEntry[] {
  const current = findSentProposal(entries, assembly);
  return entries.filter((entry) => entry.rerunNeeded === true
    && entry.sourcePlacementId === assembly.placementId
    && entry.id !== current?.id);
}

/** Reattach a confirmed rerun without recording another edit. */
export function reconcileSentAssemblies(assemblies: readonly SiteAssembly[], entries: readonly CatalogEntry[]): SiteAssembly[] {
  let changed = false;
  const next = assemblies.map((assembly) => {
    const match = findSentProposal(entries, assembly);
    if (!match || (assembly.rerunDecision === "sent" && assembly.rerunAssemblyId === match.id)) return assembly;
    changed = true;
    return markAssemblySent(assembly, match.id);
  });
  return changed ? next : assemblies as SiteAssembly[];
}

export function feetToCell(value: number) {
  return value / SKILL4_FEET_PER_CELL;
}

function faceId(value: string): FaceId | null {
  return FACE_IDS.includes(value as FaceId) ? value as FaceId : null;
}

function rotationQuarter(yaw: number): 0 | 1 | 2 | 3 {
  const quarter = Math.round(yaw / (Math.PI / 2));
  return ((quarter % 4) + 4) % 4 as 0 | 1 | 2 | 3;
}

function arrangementOf(value: string): AssemblyArrangement {
  return value === "linear" || value === "t" || value === "cross" || value === "grid" ? value : "grid";
}

function countOf(value: number): AssemblyCount {
  return value === 2 || value === 4 || value === 6 || value === 8 ? value : 2;
}

/** A new Skill 4 record for a Skill 5 proposal. Connector generation is not started. */
export function proposalCatalogEntry(assembly: SiteAssembly, id: string, sourceConfigurationId: string | null): CatalogEntry {
  const tiles = assembly.members.map((member) => ({
    instanceId: member.tileId,
    archetypeId: member.provenance.archetypeId,
    name: member.name,
    moduleId: member.catalogModuleId,
    revision: 0,
    transform: {
      x: feetToCell(member.local.x),
      y: feetToCell(member.local.y),
      z: feetToCell(member.local.z),
    },
    rotationQuarter: rotationQuarter(member.local.rotationY),
    mirror: member.mirror,
  }));
  const tileIds = new Set(tiles.map((tile) => tile.instanceId));
  const connections = assembly.connectors.flatMap((connector) => {
    const faceA = faceId(connector.faceA);
    const faceB = faceId(connector.faceB);
    if (!faceA || !faceB || !tileIds.has(connector.tileAId) || !tileIds.has(connector.tileBId)) return [];
    const faceSelection: FaceSelection = "suggested";
    return [{
      id: connector.id,
      tileAId: connector.tileAId,
      tileBId: connector.tileBId,
      faceA,
      faceB,
      faceSelection,
      selectedMockId: "",
      signature: connector.invalidated ? "" : connector.id,
      hadCandidateField: false,
      hadGeneratedField: false,
      candidateField: null,
    }];
  });
  return {
    id,
    tileCount: tiles.length,
    arrangement: arrangementOf(assembly.arrangement),
    count: countOf(assembly.tileCount),
    tiles,
    connections,
    regenerationRequired: false,
    selected: false,
    rerunNeeded: true,
    parentAssemblyId: assembly.assemblyId,
    sourceConfigurationId,
    sourcePlacementId: assembly.placementId,
  };
}

export function assemblyProposal(assembly: SiteAssembly): AssemblyProposal {
  const sourceById = new Map(assembly.baseline.members.map((member) => [member.tileId, member]));
  const currentIds = new Set(assembly.members.map((member) => member.tileId));
  return {
    assemblyId: assembly.baseline.assemblyId,
    arrangement: assembly.baseline.arrangement,
    regenerationRequired: assembly.regenerationRequired,
    sourceRegenerationRequired: assembly.baseline.regenerationRequired,
    moved: assembly.members.flatMap((member) => {
      const prior = sourceById.get(member.tileId);
      return prior && !posesMatch(prior.local, member.local) ? [{ tileId: member.tileId, name: member.name }] : [];
    }),
    added: assembly.members.flatMap((member) => sourceById.has(member.tileId) ? [] : [{ tileId: member.tileId, name: member.name, moduleId: member.provenance.moduleId }]),
    removed: assembly.baseline.members.flatMap((member) => currentIds.has(member.tileId) ? [] : [{ tileId: member.tileId }]),
    affected: assembly.connectors.flatMap((connector) => connector.invalidated ? [{
      id: connector.id,
      tileAId: connector.tileAId,
      tileBId: connector.tileBId,
      faceA: connector.faceA,
      faceB: connector.faceB,
    }] : []),
  };
}

export function importAssembly(entry: CatalogEntry, origin: { x: number; z: number }, placementId: string): SiteAssembly {
  const members: AssemblyMember[] = entry.tiles.map((tile) => {
    const archetype = SITE_ARCHETYPES.find((item) => item.archetypeId === tile.archetypeId) ?? null;
    const sameMesh = archetype?.moduleId === tile.moduleId;
    const provenance: Skill5Provenance = {
      moduleId: tile.moduleId,
      archetypeId: tile.archetypeId,
      source: "skill4",
      candidateId: sameMesh ? archetype.candidateId : null,
      continuationId: sameMesh ? archetype.continuationId : null,
    };
    return {
      instanceId: `${placementId}-${tile.instanceId}`,
      tileId: tile.instanceId,
      name: archetype?.name ?? tile.name,
      status: sameMesh && archetype ? archetype.status : "Unavailable",
      geometryState: sameMesh ? "pending" : archetype ? "invalid" : "unavailable",
      program: archetype?.program ?? "unassigned",
      programSource: "suggested",
      provenance,
      catalogModuleId: tile.moduleId,
      meshModuleId: sameMesh ? tile.moduleId : null,
      local: {
        x: cellToFeet(tile.transform.x),
        y: cellToFeet(tile.transform.y),
        z: cellToFeet(tile.transform.z),
        rotationY: tile.rotationQuarter * Math.PI / 2,
      },
      mirror: tile.mirror,
    };
  });
  return {
    placementId,
    assemblyId: entry.id,
    parentAssemblyId: entry.parentAssemblyId ?? null,
    name: entry.id,
    arrangement: entry.arrangement,
    tileCount: entry.tileCount,
    regenerationRequired: entry.regenerationRequired,
    possibleRerunNeeded: false,
    rerunDecision: null,
    rerunAssemblyId: null,
    testData: entry.testData === true,
    transform: {
      position: { x: origin.x, y: MODULE_GROUND_Y, z: origin.z },
      rotationY: 0,
    },
    baseline: {
      assemblyId: entry.id,
      arrangement: entry.arrangement,
      regenerationRequired: entry.regenerationRequired,
      members: members.map((member) => ({ tileId: member.tileId, local: { ...member.local } })),
    },
    members,
    connectors: entry.connections.map((connection) => ({
      id: connection.id,
      tileAId: connection.tileAId,
      tileBId: connection.tileBId,
      faceA: connection.faceA,
      faceB: connection.faceB,
      geometryState: "unavailable" as const,
      status: "unavailable" as const,
      invalidated: false,
      reason: CONNECTOR_UNAVAILABLE,
    })),
  };
}

export function assemblyWorldModules(assembly: SiteAssembly): PlacedModule[] {
  return assembly.members.flatMap((member) => {
    const pose = composeAssemblyPose({
      x: assembly.transform.position.x,
      z: assembly.transform.position.z,
      rotationY: assembly.transform.rotationY,
    }, {
      x: member.local.x,
      z: member.local.z,
      rotationY: member.local.rotationY,
    });
    return [{
      instanceId: member.instanceId,
      kind: "archetype" as const,
      name: member.name,
      status: member.status === "Unavailable" ? "Unavailable" : member.status,
      geometryState: member.geometryState,
      program: member.program,
      programSource: member.programSource,
      provenance: member.provenance,
      assemblyPlacementId: assembly.placementId,
      mirror: member.mirror,
      transform: {
        position: { x: pose.x, y: MODULE_GROUND_Y + member.local.y, z: pose.z },
        rotationY: pose.rotationY,
      },
    }];
  });
}

export function explodeShifts(assembly: SiteAssembly, distance: number) {
  const shifts: Record<string, { x: number; z: number }> = {};
  if (distance === 0 || assembly.members.length === 0) return shifts;
  let cx = 0;
  let cz = 0;
  for (const member of assembly.members) {
    cx += member.local.x;
    cz += member.local.z;
  }
  cx /= assembly.members.length;
  cz /= assembly.members.length;
  const group = assembly.transform;
  for (const member of assembly.members) {
    const away = composeAssemblyPose(
      { x: 0, z: 0, rotationY: group.rotationY },
      { x: member.local.x - cx, z: member.local.z - cz, rotationY: 0 },
    );
    const length = Math.hypot(away.x, away.z);
    if (length < 1e-4) {
      shifts[member.instanceId] = { x: 0, z: 0 };
      continue;
    }
    shifts[member.instanceId] = { x: away.x / length * distance, z: away.z / length * distance };
  }
  return shifts;
}

export function assemblyFootprint(assembly: SiteAssembly) {
  const corners = assemblyWorldModules(assembly).flatMap((placed) => footprintCorners(placed.transform.position, placed.transform.rotationY));
  if (corners.length === 0) return { width: 0, depth: 0, area: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of corners) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const width = maxX - minX;
  const depth = maxZ - minZ;
  return { width, depth, area: width * depth };
}
