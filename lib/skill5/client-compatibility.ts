import type { Rating, TypologyId } from "@/lib/types";
import type { ArchetypeDna, ArchitecturalDnaDocument, DnaBasis } from "./architectural-dna";
import { approvedRoom, GATHERING_ORDER, LOBBY_ORDER, WORKSPACE_ORDER } from "./ecologic-program-seed";

export const CLIENT_CONTRACT = "skill5-client-compatibility-v1";

export const UNIVERSAL_CRITERIA = ["complexity", "proportionality", "openness", "connectivity", "immersive", "visibility"] as const;

export const SPECIFIC_CRITERIA: Record<TypologyId, readonly string[]> = {
  lobby: ["centrality", "directionality", "receptivity"],
  workspace: ["plate-articulation", "modularity", "collaboration"],
  gathering: ["circulation-integration", "spatial-permanence", "social-proximity"],
};

export const COMPATIBILITY_LIMIT = "This is an architectural DNA match. It does not certify structural, laboratory, acoustic, accessibility, or fire-safety suitability.";

export type ActivitySource = "documented" | "interpretation" | "review";

export type DesireWeight = 1 | 2 | 3;

export type ActivityDesire = {
  criterionId: string;
  value: Rating;
  weight: DesireWeight;
  source: ActivitySource;
  reason: string;
};

export type ClientActivity = {
  id: string;
  name: string;
  spaces: string;
  access: string;
  operations: string;
  contexts: TypologyId[];
  desires: ActivityDesire[];
};

export type ClientCompatibilityDocument = {
  contract: typeof CLIENT_CONTRACT;
  client: string;
  occupancy: { daytime: string; evening: string; note: string };
  activities: ClientActivity[];
};

export type CriterionMatch = {
  criterionId: string;
  scope: "universal" | "specific";
  desired: Rating;
  weight: DesireWeight;
  source: ActivitySource;
  reason: string;
  actual: Rating | null;
  basis: DnaBasis | null;
  /** 1 when the ratings match, 0.5 one step apart, 0 at opposite ends. Null when the tile has no rating. */
  similarity: number | null;
  /** Share of the included weight. Null when this criterion was excluded. */
  share: number | null;
};

export type EvidenceCount = {
  geometry: number;
  review: number;
  manual: number;
};

export type CompatibilityResult = {
  archetypeId: string;
  activityId: string;
  /**
   * Universal DNA Match for a tile and a room of the same typology.
   * Null when the pair is not applicable, or when none of those ratings could be compared.
   * A missing rating is never treated as zero, and a cross-typology pair is never scored as 0%.
   */
  percent: number | null;
  universalPercent: number | null;
  /** Typology-Specific Match. Null when the pair is not applicable, or when none of those three ratings could be compared. */
  specificPercent: number | null;
  /** Counts of the six universal criteria that contributed. Review ratings are included as judgments, not as geometric evidence. */
  universalEvidence: EvidenceCount;
  /** Null when the typology-specific comparison is not applicable. */
  specificEvidence: EvidenceCount | null;
  /** Always 1 when the universal score exists, because that score uses only the six shared criteria. */
  universalWeightShare: number | null;
  /** False when the room's typology is not the tile's typology. That pair is not applicable. */
  applicable: boolean;
  specificApplied: boolean;
  missing: string[];
  review: string[];
  matches: CriterionMatch[];
};
const ACTIVITY_IDS = ["public-lobby", "private-staff-lobby", "architecture-design-studio", "product-design-studio", "prototyping-fabrication-lab", "biological-research-lab", "interdisciplinary-collaboration-hub", "public-exhibition-gallery", "indoor-public-gathering", "waterfront-gathering", "public-restaurant", "staff-dining"] as const;

type DesireSeed = [criterionId: string, value: Rating, weight: DesireWeight, source: ActivitySource, reason: string];

function desire(seed: DesireSeed): ActivityDesire {
  return { criterionId: seed[0], value: seed[1], weight: seed[2], source: seed[3], reason: seed[4] };
}

function activity(input: Omit<ClientActivity, "desires"> & { desires: DesireSeed[] }): ClientActivity {
  return { ...input, desires: input.desires.map(desire) };
}

/**
 * Desired profiles for ecoLogicStudio's twelve approved building spaces.
 * Each rating and priority is the approved pair. The previous Living Morphologies Studio
 * profiles are archived and are not selectable here.
 */
export const CLIENT_ACTIVITY_SEED: ClientCompatibilityDocument = {
  contract: CLIENT_CONTRACT,
  client: "ecoLogicStudio",
  occupancy: {
    daytime: "400–500",
    evening: "800",
    note: "Daytime work and evening gathering are project-wide figures from the studio brief. They are not the capacity of one room.",
  },
  activities: [
    activity({
      id: "public-lobby",
      name: "Public Lobby",
      spaces: "Main visitor entrance and organizational node for public programs.",
      access: "Public",
      operations: "Visitors arrive here and move on to the public programs. The room is an entrance, not a measured security or accessibility check.",
      contexts: ["lobby"],
      desires: approvedRoom(LOBBY_ORDER, "2/2, 0/2, 2/3, 2/3, 2/3, 2/2, 1/2, 2/3, 2/3"),
    }),
    activity({
      id: "private-staff-lobby",
      name: "Private Staff Lobby",
      spaces: "Smaller, controlled employee-only entrance.",
      access: "Staff only",
      operations: "Employees enter through a smaller controlled lobby. The ratings do not establish a security checkpoint.",
      contexts: ["lobby"],
      desires: approvedRoom(LOBBY_ORDER, "0/2, 0/2, 1/2, 1/1, 2/3, 2/3, 0/1, 0/2, 1/2"),
    }),
    activity({
      id: "architecture-design-studio",
      name: "Architecture Design Studio",
      spaces: "Dedicated architectural and computational design workspace.",
      access: "Staff",
      operations: "This room is for architectural and computational design work. Equipment and workstation counts are not in the ratings.",
      contexts: ["workspace"],
      desires: approvedRoom(WORKSPACE_ORDER, "1/2, 0/2, 0/2, 1/2, 1/3, 2/2, 0/2, 1/2, 2/3"),
    }),
    activity({
      id: "product-design-studio",
      name: "Product Design Studio",
      spaces: "Dedicated product and furniture design workspace.",
      access: "Staff",
      operations: "This room is for product and furniture design. It uses the same approved architectural requirements as the Architecture Design Studio.",
      contexts: ["workspace"],
      desires: approvedRoom(WORKSPACE_ORDER, "1/2, 0/2, 0/2, 1/2, 1/3, 2/2, 0/2, 1/2, 2/3"),
    }),
    activity({
      id: "prototyping-fabrication-lab",
      name: "Prototyping + Digital Fabrication Lab",
      spaces: "Restricted making, assembly, and testing, with a glazed interface where visitors can observe selected fabrication without entering.",
      access: "Restricted",
      operations: "Making, assembly, and testing stay inside the room. The glazed visitor interface is a program intention, not glass measured on the tile.",
      contexts: ["workspace"],
      desires: approvedRoom(WORKSPACE_ORDER, "0/2, 0/2, 0/2, 1/3, 2/3, 2/2, 0/1, 2/3, 2/2"),
    }),
    activity({
      id: "biological-research-lab",
      name: "Biological Research + Cultivation Lab",
      spaces: "Controlled microalgae cultivation, preparation, observation, and biological research.",
      access: "Restricted",
      operations: "Cultivation, preparation, and observation stay in a controlled room. The ratings do not establish laboratory equipment or environmental control.",
      contexts: ["workspace"],
      desires: approvedRoom(WORKSPACE_ORDER, "1/2, 0/2, 0/2, 0/3, 1/3, 0/2, 0/2, 1/2, 1/2"),
    }),
    activity({
      id: "interdisciplinary-collaboration-hub",
      name: "Interdisciplinary Collaboration Hub",
      spaces: "Shared gathering area between Architecture and Product Design.",
      access: "Staff",
      operations: "Architecture and Product Design meet here. The ratings do not size tables, seats, or the path between the two studios.",
      contexts: ["gathering"],
      desires: approvedRoom(GATHERING_ORDER, "1/1, 1/2, 2/3, 1/3, 2/3, 1/2, 1/2, 1/2, 1/3"),
    }),
    activity({
      id: "public-exhibition-gallery",
      name: "Public Exhibition Gallery",
      spaces: "Exhibits biological research, products, and installations, and is meant to be visually connected to fabrication.",
      access: "Public",
      operations: "The gallery shows biological research, products, and installations. A visual connection to fabrication is a program aim, not an opening measured on the tile.",
      contexts: ["gathering"],
      desires: approvedRoom(GATHERING_ORDER, "2/2, 1/2, 2/3, 1/2, 2/3, 2/2, 2/3, 2/3, 1/2"),
    }),
    activity({
      id: "indoor-public-gathering",
      name: "Indoor Public Gathering",
      spaces: "Main social commons connecting public activities.",
      access: "Public",
      operations: "This is the indoor commons that connects the public activities. Occupancy is a project-wide figure, not a count for this room.",
      contexts: ["gathering"],
      desires: approvedRoom(GATHERING_ORDER, "1/1, 1/2, 2/3, 2/3, 2/3, 2/2, 2/2, 1/3, 1/3"),
    }),
    activity({
      id: "waterfront-gathering",
      name: "Waterfront Gathering",
      spaces: "Connected public gathering extending toward, and potentially over, the bay.",
      access: "Public",
      operations: "The gathering is meant to extend toward and potentially over Biscayne Bay. Visibility inside a tile is not a measured view to the water.",
      contexts: ["gathering"],
      desires: approvedRoom(GATHERING_ORDER, "1/2, 1/2, 2/3, 2/3, 2/3, 2/2, 2/2, 2/3, 1/2"),
    }),
    activity({
      id: "public-restaurant",
      name: "Public Restaurant + Dining",
      spaces: "Public dining connected to the commons and the waterfront.",
      access: "Public",
      operations: "Public dining is meant to connect to the commons and the waterfront. Seating, service, and a view to the bay are not established by the ratings.",
      contexts: ["gathering"],
      desires: approvedRoom(GATHERING_ORDER, "1/1, 1/2, 1/2, 2/2, 2/3, 1/2, 1/2, 1/2, 1/3"),
    }),
    activity({
      id: "staff-dining",
      name: "Staff Dining + Break Area",
      spaces: "Private employee dining, rest, and informal interaction.",
      access: "Staff only",
      operations: "Employees eat, rest, and talk here. The ratings do not size a kitchen, seats, or a private enclosure.",
      contexts: ["gathering"],
      desires: approvedRoom(GATHERING_ORDER, "0/1, 0/1, 0/2, 1/2, 1/3, 0/2, 1/2, 1/2, 1/3"),
    }),
  ],
};

function isRating(value: unknown): value is Rating {
  return value === 0 || value === 1 || value === 2;
}

function isWeight(value: unknown): value is DesireWeight {
  return value === 1 || value === 2 || value === 3;
}

function isSource(value: unknown): value is ActivitySource {
  return value === "documented" || value === "interpretation" || value === "review";
}

function isTypology(value: unknown): value is TypologyId {
  return value === "lobby" || value === "workspace" || value === "gathering";
}

function expectedDesires(contexts: readonly TypologyId[]): string[] {
  const specific = contexts.flatMap((context) => [...SPECIFIC_CRITERIA[context]]);
  return [...UNIVERSAL_CRITERIA, ...specific];
}

function readDesire(value: unknown): ActivityDesire | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ActivityDesire>;
  if (typeof record.criterionId !== "string" || !isRating(record.value) || !isWeight(record.weight) || !isSource(record.source)) return null;
  if (typeof record.reason !== "string" || record.reason.trim().length < 12) return null;
  return { criterionId: record.criterionId, value: record.value, weight: record.weight, source: record.source, reason: record.reason.trim() };
}

export function parseClientCompatibility(value: unknown): ClientCompatibilityDocument | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ClientCompatibilityDocument>;
  if (record.contract !== CLIENT_CONTRACT || record.client !== CLIENT_ACTIVITY_SEED.client) return null;
  if (!record.occupancy || record.occupancy.daytime !== "400–500" || record.occupancy.evening !== "800" || typeof record.occupancy.note !== "string") return null;
  if (!Array.isArray(record.activities) || record.activities.length !== ACTIVITY_IDS.length) return null;
  const activities: ClientActivity[] = [];
  for (const id of ACTIVITY_IDS) {
    const found = record.activities.find((item) => item && typeof item === "object" && (item as ClientActivity).id === id) as Partial<ClientActivity> | undefined;
    const seed = CLIENT_ACTIVITY_SEED.activities.find((item) => item.id === id);
    if (!found || !seed || found.name !== seed.name || typeof found.spaces !== "string" || typeof found.access !== "string" || typeof found.operations !== "string") return null;
    if (!Array.isArray(found.contexts) || found.contexts.length !== seed.contexts.length || found.contexts.some((item, index) => item !== seed.contexts[index])) return null;
    if (!found.contexts.every(isTypology)) return null;
    const expected = expectedDesires(found.contexts);
    if (!Array.isArray(found.desires) || found.desires.length !== expected.length) return null;
    const desires: ActivityDesire[] = [];
    for (const criterionId of expected) {
      const desireRecord = readDesire(found.desires.find((item) => item && (item as ActivityDesire).criterionId === criterionId));
      if (!desireRecord) return null;
      desires.push(desireRecord);
    }
    activities.push({ id, name: found.name, spaces: found.spaces, access: found.access, operations: found.operations, contexts: [...found.contexts], desires });
  }
  return { contract: CLIENT_CONTRACT, client: record.client, occupancy: { ...record.occupancy }, activities };
}

export function withDesire(document: ClientCompatibilityDocument, activityId: string, criterionId: string, patch: { value?: Rating; weight?: DesireWeight }): ClientCompatibilityDocument {
  return {
    ...document,
    activities: document.activities.map((item) => {
      if (item.id !== activityId) return item;
      return {
        ...item,
        desires: item.desires.map((desire) => desire.criterionId === criterionId ? { ...desire, ...patch } : desire),
      };
    }),
  };
}

export function similarity(actual: Rating, desired: Rating): number {
  return 1 - Math.abs(actual - desired) / 2;
}

function percentFrom(matches: readonly CriterionMatch[], scope: CriterionMatch["scope"]): { percent: number | null; weight: number } {
  const rows = matches.filter((match) => match.scope === scope && match.similarity !== null);
  const weight = rows.reduce((sum, match) => sum + match.weight, 0);
  if (weight === 0) return { percent: null, weight: 0 };
  const score = rows.reduce((sum, match) => sum + match.weight * (match.similarity ?? 0), 0);
  return { percent: Math.round((score / weight) * 100), weight };
}

function evidenceOf(matches: readonly CriterionMatch[], scope: CriterionMatch["scope"]): EvidenceCount {
  const rows = matches.filter((match) => match.scope === scope && match.similarity !== null);
  return {
    geometry: rows.filter((match) => match.basis === "geometry").length,
    review: rows.filter((match) => match.basis === "review").length,
    manual: rows.filter((match) => match.basis === "manual").length,
  };
}

function notApplicable(profile: ArchetypeDna, activity: ClientActivity): CompatibilityResult {
  return {
    archetypeId: profile.archetypeId,
    activityId: activity.id,
    percent: null,
    universalPercent: null,
    specificPercent: null,
    universalEvidence: { geometry: 0, review: 0, manual: 0 },
    specificEvidence: null,
    universalWeightShare: null,
    applicable: false,
    specificApplied: false,
    missing: [],
    review: [],
    matches: [],
  };
}

export function compareTile(profile: ArchetypeDna, activity: ClientActivity): CompatibilityResult {
  const specificApplied = activity.contexts.includes(profile.program);
  if (!specificApplied) return notApplicable(profile, activity);
  const applicableSpecific = new Set(SPECIFIC_CRITERIA[profile.program]);
  const considered = activity.desires.filter((desire) => UNIVERSAL_CRITERIA.includes(desire.criterionId as typeof UNIVERSAL_CRITERIA[number]) || applicableSpecific.has(desire.criterionId));
  const draft: CriterionMatch[] = considered.map((desire) => {
    const score = profile.ratings.find((rating) => rating.criterionId === desire.criterionId);
    const actual = score ? score.value : null;
    const scope = UNIVERSAL_CRITERIA.includes(desire.criterionId as typeof UNIVERSAL_CRITERIA[number]) ? "universal" : "specific";
    return {
      criterionId: desire.criterionId,
      scope,
      desired: desire.value,
      weight: desire.weight,
      source: desire.source,
      reason: desire.reason,
      actual,
      basis: score?.basis ?? null,
      similarity: actual === null ? null : similarity(actual, desire.value),
      share: null,
    };
  });
  const universal = percentFrom(draft, "universal");
  const specific = percentFrom(draft, "specific");
  const matches = draft.map((match) => {
    const scopeWeight = match.scope === "universal" ? universal.weight : specific.weight;
    return {
      ...match,
      share: match.similarity === null || scopeWeight === 0 ? null : (match.weight * match.similarity) / scopeWeight,
    };
  });
  return {
    archetypeId: profile.archetypeId,
    activityId: activity.id,
    percent: universal.percent,
    universalPercent: universal.percent,
    specificPercent: specificApplied ? specific.percent : null,
    universalEvidence: evidenceOf(matches, "universal"),
    specificEvidence: specificApplied ? evidenceOf(matches, "specific") : null,
    universalWeightShare: universal.weight === 0 ? null : 1,
    applicable: true,
    specificApplied,
    missing: matches.filter((match) => match.actual === null).map((match) => match.criterionId),
    review: matches.filter((match) => match.basis === "review" && match.similarity !== null).map((match) => match.criterionId),
    matches,
  };
}

export function compareDocument(dna: ArchitecturalDnaDocument, activities: ClientCompatibilityDocument): CompatibilityResult[] {
  return dna.profiles.flatMap((profile) => activities.activities.map((activity) => compareTile(profile, activity)));
}

/** Orders same-typology tiles by Universal DNA Match. A pair that is not applicable is left out of the ranking. */
export function rankForActivity(results: readonly CompatibilityResult[], activityId: string, archetypeIds: readonly string[]): string[] {
  const score = new Map(
    results
      .filter((result) => result.activityId === activityId && result.applicable && result.universalPercent !== null)
      .map((result) => [result.archetypeId, result.universalPercent as number]),
  );
  return archetypeIds.filter((id) => score.has(id)).sort((a, b) => {
    const left = score.get(a) ?? 0;
    const right = score.get(b) ?? 0;
    if (left === right) return archetypeIds.indexOf(a) - archetypeIds.indexOf(b);
    return right - left;
  });
}
