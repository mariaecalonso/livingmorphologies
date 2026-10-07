import { groupsForArchetype, TYPOLOGIES } from "./catalog";
import type { CriterionInstance, GroupId, Rating, TypologyId } from "./types";

/**
 * Authored architectural intent for one archetype.
 * Built only from groupsForArchetype() and the catalog ratings it joins.
 * Descriptors stay the catalog strings. Ratings stay 0 / 1 / 2.
 */
export type ArchitecturalIntentLevel = "low" | "medium" | "high";

export type ArchitecturalIntentCriterion = {
  id: string;
  label: string;
  rating: Rating;
  level: ArchitecturalIntentLevel;
};

export type ArchitecturalIntentBranch = {
  descriptor: string;
  criteria: ArchitecturalIntentCriterion[];
};

export type ArchitecturalIntentProfile = {
  archetypeId: string;
  typologyId: TypologyId;
  formal: ArchitecturalIntentBranch;
  spatial: ArchitecturalIntentBranch;
  atmospheric: ArchitecturalIntentBranch;
};

const LEVEL_BY_LABEL = {
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;

function authoredLevel(criterion: CriterionInstance): ArchitecturalIntentLevel {
  const level = criterion.definition.levels[criterion.rating];
  if (!level || level.value !== criterion.rating) {
    throw new Error(`rating ${criterion.rating} is not an authored level for ${criterion.id}`);
  }
  const named = LEVEL_BY_LABEL[level.label];
  if (!named) throw new Error(`unexpected rating label for ${criterion.id}`);
  return named;
}

function branchFromGroup(
  group: ReturnType<typeof groupsForArchetype>[number],
  authored: Record<string, Rating>,
): ArchitecturalIntentBranch {
  return {
    descriptor: group.descriptor,
    criteria: group.criteria.map((criterion) => {
      const rating = authored[criterion.id];
      if (rating !== 0 && rating !== 1 && rating !== 2) {
        throw new Error(`missing authored rating for ${criterion.id}`);
      }
      if (criterion.rating !== rating) {
        throw new Error(`criterion ${criterion.id} did not keep its authored rating`);
      }
      return {
        id: criterion.id,
        label: criterion.label,
        rating,
        level: authoredLevel(criterion),
      };
    }),
  };
}

/** Catalog profile for one archetype. Unknown ids throw. */
export function architecturalIntentProfile(archetypeId: string): ArchitecturalIntentProfile {
  const matches = TYPOLOGIES.flatMap((typology) =>
    typology.archetypes
      .filter((archetype) => archetype.id === archetypeId)
      .map((archetype) => ({ typology, archetype })),
  );
  if (matches.length !== 1) {
    throw new Error(`Unknown archetype: ${archetypeId}`);
  }
  const { typology, archetype } = matches[0];
  const groups = groupsForArchetype(typology.id, archetype, archetype.ratings);
  const byId = new Map<GroupId, ArchitecturalIntentBranch>();
  for (const group of groups) {
    if (byId.has(group.id)) throw new Error(`duplicate intent group ${group.id}`);
    byId.set(group.id, branchFromGroup(group, archetype.ratings));
  }
  const formal = byId.get("formal");
  const spatial = byId.get("spatial");
  const atmospheric = byId.get("atmospheric");
  if (!formal || !spatial || !atmospheric) {
    throw new Error(`incomplete architectural intent for ${archetypeId}`);
  }
  return {
    archetypeId: archetype.id,
    typologyId: typology.id,
    formal,
    spatial,
    atmospheric,
  };
}
