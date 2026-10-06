import { isLobbyArchetype } from "../../skill1/lobby-realization";
import type { ArchetypeSearchAdapter } from "./adapter";
import { createGatheringAdapter, GATHERING_ARCHETYPE_IDS } from "./gathering-adapter";
import { createLobbyAdapter } from "./lobby-adapter";
import { createWorkspaceAdapter, isWorkspaceArchetype, WORKSPACE_ARCHETYPE_IDS } from "./workspace-adapter";

export { GATHERING_ARCHETYPE_IDS, WORKSPACE_ARCHETYPE_IDS };

const GATHERING = new Set<string>(GATHERING_ARCHETYPE_IDS);

/**
 * One adapter per archetype. Lobby, Gathering, and Workspace share the controller.
 * Workspace uses the Skill 1 planners from origin/main. It has no proportion span yet.
 */
export function createSearchAdapter(archetypeId: string): ArchetypeSearchAdapter {
  if (isLobbyArchetype(archetypeId)) return createLobbyAdapter(archetypeId);
  if (GATHERING.has(archetypeId)) return createGatheringAdapter(archetypeId);
  if (isWorkspaceArchetype(archetypeId)) return createWorkspaceAdapter(archetypeId);
  throw new Error(`${archetypeId} has no semantic search adapter`);
}
