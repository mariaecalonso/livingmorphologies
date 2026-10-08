import {
  architecturalIntentProfile,
  type ArchitecturalIntentProfile,
} from "../architectural-intent";

export type { ArchitecturalIntentBranch, ArchitecturalIntentCriterion, ArchitecturalIntentLevel, ArchitecturalIntentProfile } from "../architectural-intent";

/**
 * Read-only architectural intent for a Skill 3 continuation.
 * Does not map descriptors onto simulation behavior.
 */
export function architecturalIntentFor(archetypeId: string): ArchitecturalIntentProfile {
  return architecturalIntentProfile(archetypeId);
}
