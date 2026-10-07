import { TYPOLOGIES } from "../catalog";
import type { GroupId, Rating } from "../types";
import { architecturalIntentFor, type ArchitecturalIntentBranch } from "./architectural-intent";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

const FORBIDDEN = ["kind", "core", "family", "growth", "topology", "recipe", "genome", "params", "behavior", "objectives"];

function catalogArchetype(archetypeId: string) {
  for (const typology of TYPOLOGIES) {
    const archetype = typology.archetypes.find((item) => item.id === archetypeId);
    if (archetype) return { typology, archetype };
  }
  throw new Error(`catalog is missing ${archetypeId}`);
}

function keysOf(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    found.push(key);
    keysOf(child, found);
  }
  return found;
}

function expectBranch(
  branch: ArchitecturalIntentBranch,
  descriptor: string,
  ratings: Record<string, Rating>,
  ids: readonly string[],
) {
  assert(branch.descriptor === descriptor, `descriptor ${branch.descriptor} is not ${descriptor}`);
  assert(branch.criteria.length === ids.length, `expected ${ids.length} criteria`);
  ids.forEach((id, index) => {
    const criterion = branch.criteria[index];
    assert(criterion.id === id, `criterion ${criterion.id} is not ${id}`);
    assert(criterion.rating === ratings[id], `${id} rating ${criterion.rating} is not the catalog rating`);
    const level = criterion.rating === 0 ? "low" : criterion.rating === 1 ? "medium" : "high";
    assert(criterion.level === level, `${id} level does not match its authored rating`);
  });
}

function expectProfile(archetypeId: string, groups: Record<GroupId, readonly string[]>) {
  const { typology, archetype } = catalogArchetype(archetypeId);
  const profile = architecturalIntentFor(archetypeId);
  assert(profile.archetypeId === archetypeId, `${archetypeId} id changed`);
  assert(profile.typologyId === typology.id, `${archetypeId} typology changed`);
  expectBranch(profile.formal, archetype.descriptors.formal, archetype.ratings, groups.formal);
  expectBranch(profile.spatial, archetype.descriptors.spatial, archetype.ratings, groups.spatial);
  expectBranch(profile.atmospheric, archetype.descriptors.atmospheric, archetype.ratings, groups.atmospheric);
  const keys = keysOf(profile);
  for (const forbidden of FORBIDDEN) {
    assert(!keys.includes(forbidden), `${archetypeId} profile includes ${forbidden}`);
  }
  ok(`${archetypeId} ${profile.formal.descriptor} / ${profile.spatial.descriptor} / ${profile.atmospheric.descriptor}`);
}

const lobby = {
  formal: ["complexity", "proportionality", "centrality"],
  spatial: ["openness", "connectivity", "directionality"],
  atmospheric: ["immersive", "visibility", "receptivity"],
} as const;
const workspace = {
  formal: ["complexity", "proportionality", "plate-articulation"],
  spatial: ["openness", "connectivity", "modularity"],
  atmospheric: ["immersive", "visibility", "collaboration"],
} as const;
const gathering = {
  formal: ["complexity", "proportionality", "circulation-integration"],
  spatial: ["openness", "connectivity", "spatial-permanence"],
  atmospheric: ["immersive", "visibility", "social-proximity"],
} as const;

const verticalVoid = architecturalIntentFor("vertical-void");
assert(verticalVoid.formal.descriptor === "Dynamic Core", "Vertical Void formal descriptor");
assert(verticalVoid.spatial.descriptor === "Open Threshold", "Vertical Void spatial descriptor");
assert(verticalVoid.atmospheric.descriptor === "Visual Immersion", "Vertical Void atmospheric descriptor");
expectProfile("vertical-void", lobby);
expectProfile("open-hall", workspace);
expectProfile("void-field", gathering);

assert(
  architecturalIntentFor("vertical-void").formal.criteria.find((item) => item.id === "complexity")?.rating === 2,
  "Vertical Void complexity",
);
assert(
  architecturalIntentFor("vertical-void").formal.criteria.find((item) => item.id === "proportionality")?.rating === 1,
  "Vertical Void proportionality",
);

let rejected = false;
try {
  architecturalIntentFor("not-an-archetype");
} catch {
  rejected = true;
}
assert(rejected, "unknown archetype was accepted");
ok("unknown archetype rejected");
