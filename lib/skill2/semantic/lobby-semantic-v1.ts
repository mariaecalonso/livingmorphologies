import { FIELD_SIZE } from "../../skill1/maps";
import { continuousHallBands, figureOf } from "../../skill1/run-continuous-hall";
import type { HallFamily, HallGrowth } from "../../skill1/run-continuous-hall";
import { verticalVoidAspectBand } from "../../skill1/run-morphology";
import type { ArchetypeSearchAdapter } from "./adapter";
import { deriveDescriptorV1, diversityFromDescriptor } from "./descriptor-v1";
import { mutateSemanticPlan } from "./mutation";
import type { MutationIntent, MutationProfile, RealizationState, SemanticPlan, SemanticRun, SemanticSearchConfig } from "./types";

export const LOBBY_SEMANTIC_V1 = "lobby-semantic-v1" as const;

export const LOBBY_SEMANTIC_V1_ARCHETYPES = [
  "compressed-sequential",
  "linear-gallery",
  "topographic-ground-field",
  "continuous-hall",
  "vertical-void",
] as const;

/** Explicit first-search mix. Not a universal controller default. */
export const LOBBY_SEMANTIC_V1_COMPOSITION = {
  2: { explorers: 70, pareto: 22, diversity: 8, specialist: 0 },
  3: { explorers: 50, pareto: 37, diversity: 13, specialist: 0 },
  4: { explorers: 30, pareto: 52, diversity: 18, specialist: 0 },
} as const;

const PARETO_SIGMA_FRACTION = 0.1;

/**
 * Numeric genes whose legal interval is not in the Skill 1 repair contract.
 * Lobby v1 does not assign them a span.
 */
export const LOBBY_V1_UNSPANNED: Record<(typeof LOBBY_SEMANTIC_V1_ARCHETYPES)[number], readonly string[]> = {
  "vertical-void": ["axis"],
  "compressed-sequential": ["scale", "twist", "openLo"],
  "continuous-hall": ["pinch", "twist"],
  "topographic-ground-field": ["scale", "twist"],
  "linear-gallery": ["scale", "twist"],
};

export type LobbyReadiness = {
  archetypeId: string;
  status: "ready" | "blocked";
  paretoGenes: string[];
  diversityGene: string | null;
  unspanned: readonly string[];
  reasons: string[];
};

export function lobbyParetoSpan(archetypeId: string, plan: SemanticPlan, field: string): { low: number; high: number } | null {
  const body = inner(plan);
  if (field === "cx" || field === "cy" || field === "originX" || field === "originY") {
    return { low: 0, high: FIELD_SIZE - 1 };
  }
  if (archetypeId === "vertical-void" && field === "aspect" && typeof body.core === "string") {
    const band = verticalVoidAspectBand(body.core as Parameters<typeof verticalVoidAspectBand>[0]);
    return { low: band[0], high: band[1] };
  }
  if (archetypeId === "continuous-hall" && (field === "length" || field === "width") && typeof body.family === "string" && typeof body.growth === "string") {
    const figure = figureOf(body.family as HallFamily);
    const bands = continuousHallBands(body.family as HallFamily, body.growth as HallGrowth, figure);
    const band = field === "length" ? bands.length : bands.width;
    return { low: band[0], high: band[1] };
  }
  return null;
}

export function lobbyParetoGenes(adapter: ArchetypeSearchAdapter, plan: SemanticPlan) {
  return adapter
    .genes()
    .filter((gene) => gene.kind === "continuous" && gene.name !== adapter.primaryFamilyGene)
    .map((gene) => gene.name)
    .filter((name) => {
      const span = lobbyParetoSpan(adapter.archetypeId, plan, name);
      return span != null && span.high > span.low;
    });
}

export function assessLobbySemanticV1(adapter: ArchetypeSearchAdapter, sample: { plan: SemanticPlan }): LobbyReadiness {
  const reasons: string[] = [];
  const diversityGene = adapter.primaryFamilyGene ?? null;
  const diversity = diversityGene ? adapter.genes().find((gene) => gene.name === diversityGene) : undefined;
  if (!diversityGene || !diversity?.legal || new Set(diversity.legal.map(String)).size < 2) {
    reasons.push("no usable diversity family gene");
  }
  const paretoGenes = lobbyParetoGenes(adapter, sample.plan);
  if (!paretoGenes.length) reasons.push("no numeric gene with a Skill 1 legal span");
  const repaired = adapter.repair(sample.plan);
  if (!repaired.ok) reasons.push("sample plan does not repair");
  const id = adapter.archetypeId as (typeof LOBBY_SEMANTIC_V1_ARCHETYPES)[number];
  return {
    archetypeId: adapter.archetypeId,
    status: reasons.length ? "blocked" : "ready",
    paretoGenes,
    diversityGene,
    unspanned: LOBBY_V1_UNSPANNED[id] ?? [],
    reasons,
  };
}

export function lobbySemanticV1Config(archetypeId: string, runSeed = 1): SemanticSearchConfig {
  const adapterGenes = LOBBY_SEMANTIC_V1_ARCHETYPES.includes(archetypeId as (typeof LOBBY_SEMANTIC_V1_ARCHETYPES)[number]);
  if (!adapterGenes) throw new Error(`${archetypeId} is outside lobby-semantic-v1`);
  return {
    populationSize: 100,
    generations: 4,
    runSeed,
    purpose: "production",
    duplicateAttemptBudget: 30,
    specialists: false,
    deriveG01Fidelity: true,
    composition: LOBBY_SEMANTIC_V1_COMPOSITION,
    diversityParentSelection: { kind: "provisional-uniform" },
    paretoMutation: { fieldCount: 1 },
    diversityMutation: { fieldCount: 1 },
    catalogDedup: null,
  };
}

/**
 * Lobby v1 operators. Pareto moves one spanned numeric gene.
 * Diversity changes the primary family gene only.
 * Neither rule is a universal Skill 2 law.
 */
export function mutateLobbySemanticV1(
  source: ArchetypeSearchAdapter,
  plan: SemanticPlan,
  state: RealizationState,
  intent: MutationIntent,
  _profile: MutationProfile,
  rng: () => number,
) {
  if (intent === "objective-specific") {
    throw new Error("lobby-semantic-v1 does not run specialist mutation");
  }
  if (intent === "morphological-exploration") {
    const gene = source.primaryFamilyGene;
    if (!gene) throw new Error(`${source.archetypeId} has no diversity family gene`);
    return mutateSemanticPlan(source, plan, state, intent, { fields: [gene], fieldCount: 1 }, rng);
  }
  const names = lobbyParetoGenes(source, plan);
  if (!names.length) throw new Error(`${source.archetypeId} has no spanned numeric gene`);
  const field = names[Math.floor(rng() * names.length)];
  const span = lobbyParetoSpan(source.archetypeId, plan, field);
  if (!span) throw new Error(`${source.archetypeId} lost the span for ${field}`);
  return mutateSemanticPlan(
    source,
    plan,
    state,
    intent,
    { fields: [field], fieldCount: 1, continuousSigma: PARETO_SIGMA_FRACTION * (span.high - span.low) },
    rng,
  );
}

export function installLobbyDescriptorV1(run: SemanticRun): { block?: string } {
  const profile = deriveDescriptorV1(run.candidates);
  run.descriptorProfile = profile;
  if (profile.block || !profile.threshold) return { block: profile.block ?? "descriptor-v1 produced no threshold" };
  const diversity = diversityFromDescriptor(profile);
  if (!diversity) return { block: "descriptor-v1 distance could not be rebuilt" };
  run.config = { ...run.config, diversity, catalogDedup: null, specialists: false };
  return {};
}

function inner(plan: SemanticPlan): Record<string, unknown> {
  const body = plan.body as { plan?: Record<string, unknown> };
  return body.plan ?? (plan.body as Record<string, unknown>);
}
