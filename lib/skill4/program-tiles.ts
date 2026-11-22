import dnaJson from "@/data/skill5/architectural-dna.json";
import { TYPOLOGIES } from "@/lib/catalog";
import { parseArchitecturalDna, type ArchetypeDna } from "@/lib/skill5/architectural-dna";
import { CLIENT_ACTIVITY_SEED, UNIVERSAL_CRITERIA, similarity, type ClientActivity } from "@/lib/skill5/client-compatibility";
import type { TypologyId } from "@/lib/types";

/**
 * Which catalog families a program may draw tiles from.
 * Program ids are the client activities. Tile records stay in `TYPOLOGIES`.
 * Gathering programs that are not named above use Gathering tiles only.
 */
export const PROGRAM_TILE_TYPOLOGIES: Record<string, readonly TypologyId[]> = {
  "public-lobby": ["lobby", "gathering"],
  "private-staff-lobby": ["lobby", "workspace"],
  "architecture-design-studio": ["workspace"],
  "product-design-studio": ["workspace"],
  "prototyping-fabrication-lab": ["workspace"],
  "biological-research-lab": ["workspace"],
  "interdisciplinary-collaboration-hub": ["workspace", "gathering"],
  "public-exhibition-gallery": ["gathering"],
  "indoor-public-gathering": ["gathering"],
  "waterfront-gathering": ["gathering"],
  "public-restaurant": ["gathering"],
  "staff-dining": ["gathering"],
};

export function allowedTypologies(programId: string): readonly TypologyId[] {
  return PROGRAM_TILE_TYPOLOGIES[programId] ?? [];
}

/** Catalog archetypes whose typology is allowed for this program. */
export function eligibleTiles(programId: string) {
  const allowed = new Set(allowedTypologies(programId));
  return TYPOLOGIES.filter((typology) => allowed.has(typology.id)).flatMap((typology) =>
    typology.archetypes.map((archetype) => ({
      id: archetype.id,
      name: archetype.name,
      typologyId: typology.id,
      typologyLabel: typology.label,
    })),
  );
}

export function allowedTypeLabel(programId: string) {
  const labels = allowedTypologies(programId).map((id) => TYPOLOGIES.find((typology) => typology.id === id)?.label ?? id);
  return labels.join(" + ");
}

export const CLUSTER_PROGRAMS = CLIENT_ACTIVITY_SEED.activities.map((activity) => ({
  id: activity.id,
  name: activity.name,
}));

const architecturalDna = parseArchitecturalDna(dnaJson);

export type RankedTile = {
  id: string;
  name: string;
  typologyId: TypologyId;
  typologyLabel: string;
  /** Universal DNA Match, 0–100. Null only when the tile has none of the six shared ratings. */
  score: number | null;
};

const SHARED = new Set<string>(UNIVERSAL_CRITERIA);

/**
 * Universal DNA Match without the same-typology gate.
 * Uses the program's six shared desires and the tile's architectural DNA ratings.
 * A missing rating is left out of the weight. It is not treated as zero.
 * Typology-specific criteria stay out, because those three differ by family and are not one scale.
 */
function universalMatch(profile: ArchetypeDna, activity: ClientActivity): number | null {
  const rows = activity.desires.filter((desire) => SHARED.has(desire.criterionId)).flatMap((desire) => {
    const rating = profile.ratings.find((item) => item.criterionId === desire.criterionId);
    return rating ? [{ weight: desire.weight, similarity: similarity(rating.value, desire.value) }] : [];
  });
  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (weight === 0) return null;
  const raw = rows.reduce((sum, row) => sum + row.weight * row.similarity, 0);
  return Math.round((raw / weight) * 100);
}

/** Eligible tiles on one Universal DNA scale, including tiles from another allowed typology. */
export function rankedEligibleTiles(programId: string): RankedTile[] {
  const tiles = eligibleTiles(programId);
  const activity = CLIENT_ACTIVITY_SEED.activities.find((item) => item.id === programId);
  const order = new Map(tiles.map((tile, index) => [tile.id, index]));
  const scored = tiles.map((tile) => {
    const profile = architecturalDna?.profiles.find((item) => item.archetypeId === tile.id);
    const score = profile && activity ? universalMatch(profile, activity) : null;
    return { ...tile, score };
  });
  return scored.sort((left, right) => {
    if (left.score === right.score) return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0);
    if (left.score === null) return 1;
    if (right.score === null) return -1;
    return right.score - left.score;
  });
}

/** Highest-ranked eligible tile that has an existing Universal DNA Match. */
export function dominantTile(programId: string): RankedTile | null {
  return rankedEligibleTiles(programId).find((tile) => tile.score !== null) ?? null;
}

/** Existing percent, shown on the 0–1 scale used by the cluster readout. */
export function matchLabel(score: number | null) {
  return score === null ? "no score" : (score / 100).toFixed(2);
}
