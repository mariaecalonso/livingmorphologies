import selection from "@/data/skill3/final-selection.json";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { solidifiedModuleId } from "@/lib/skill3/solidified-mesh";
import type { Skill5Program } from "./contract";

export type SiteArchetypeStatus = "Validated" | "Review";

export type SiteArchetype = {
  archetypeId: string;
  name: string;
  candidateId: number;
  continuationId: string;
  moduleId: string;
  program: Skill5Program | null;
  status: SiteArchetypeStatus;
};

const PROGRAMS: Skill5Program[] = ["lobby", "workspace", "gathering"];

function isProgram(value: string): value is Skill5Program {
  return value === "lobby" || value === "workspace" || value === "gathering";
}

function isStatus(value: string): value is SiteArchetypeStatus {
  return value === "Validated" || value === "Review";
}

const names = new Map(Object.values(ARCHETYPES).map((entry) => [entry.id, entry.name]));

export const SITE_ARCHETYPES: SiteArchetype[] = selection.selections.flatMap((item) => {
  const moduleId = solidifiedModuleId(item.archetypeId, item.candidateId, item.continuationId);
  if (moduleId !== item.moduleId || !isStatus(item.status)) return [];
  return [{
    archetypeId: item.archetypeId,
    name: names.get(item.archetypeId) ?? item.archetypeId,
    candidateId: item.candidateId,
    continuationId: item.continuationId,
    moduleId,
    program: isProgram(item.category) ? item.category : null,
    status: item.status,
  }];
});

export const SITE_PROGRAMS = PROGRAMS;

export const PROGRAM_LABEL: Record<Skill5Program, string> = {
  lobby: "Lobby",
  workspace: "Workspace",
  gathering: "Gathering",
  unassigned: "Unassigned",
};

export const ASSIGNABLE_PROGRAMS: Skill5Program[] = ["workspace", "lobby", "gathering", "unassigned"];
