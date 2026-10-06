import { mulberry32 } from "../../physarum";
import type { ArchetypeSearchAdapter } from "./adapter";
import { mutateSemanticPlan } from "./mutation";
import type { MutationIntent, MutationProfile, RealizationState, SemanticPlan } from "./types";

const PARETO_SIGMA_FRACTION = 0.1;

/**
 * A profile that names fields, or opts into provisional affinity, keeps that
 * explicit list. Production profiles that only set `fieldCount` use gene roles.
 */
export function usesDeclaredFields(profile: MutationProfile | undefined) {
  return Boolean(profile?.fields?.length || profile?.useProvisionalAffinity);
}

/** Refinement genes on this plan that have a Skill 1 span. Placement is never included. */
export function refineGenes(adapter: ArchetypeSearchAdapter, plan: SemanticPlan) {
  return adapter
    .genes()
    .filter((gene) => gene.mutationRole === "refine")
    .map((gene) => gene.name)
    .filter((name) => {
      const span = adapter.span?.(plan, name);
      return span != null && span.high > span.low;
    });
}

/**
 * Growth genes with two or more legal values.
 * The family gene stays at the value generation 1 sampled, so a child keeps that figure.
 */
export function diversityGenes(adapter: ArchetypeSearchAdapter) {
  const names: string[] = [];
  for (const gene of adapter.genes()) {
    if (gene.kind !== "growth" || names.includes(gene.name)) continue;
    if (gene.legal && new Set(gene.legal.map(String)).size >= 2) names.push(gene.name);
  }
  return names;
}

/** One repaired sample. The search rng is not used. */
export function archetypeHasRefineGene(adapter: ArchetypeSearchAdapter) {
  const sampled = adapter.sampleExplorer(mulberry32(0xa11ce));
  const repaired = adapter.repair(sampled.plan);
  return refineGenes(adapter, repaired.ok ? repaired.plan : sampled.plan).length > 0;
}

/**
 * Pareto moves one refinement gene inside its Skill 1 span.
 * Diversity moves a legal growth gene. The family gene is left as sampled.
 * An empty role returns rejected so the caller can turn that slot into an explorer.
 */
export function mutateByPolicy(
  adapter: ArchetypeSearchAdapter,
  plan: SemanticPlan,
  state: RealizationState,
  intent: MutationIntent,
  rng: () => number,
) {
  if (intent === "objective-specific") {
    throw new Error("specialist mutation refuses to guess a gene-to-objective mapping");
  }
  if (intent === "morphological-exploration") {
    const names = diversityGenes(adapter);
    if (!names.length) return { status: "rejected" as const, reasons: ["no growth gene"] };
    const field = names[Math.floor(rng() * names.length)];
    return mutateSemanticPlan(adapter, plan, state, intent, { fields: [field], fieldCount: 1 }, rng);
  }
  const names = refineGenes(adapter, plan);
  if (!names.length) return { status: "rejected" as const, reasons: ["no refinement gene"] };
  const field = names[Math.floor(rng() * names.length)];
  const span = adapter.span?.(plan, field);
  if (!span || span.high <= span.low) return { status: "rejected" as const, reasons: [`${field} has no Skill 1 span`] };
  const gene = adapter.genes().find((item) => item.name === field);
  const continuousSigma = gene?.kind === "continuous" ? PARETO_SIGMA_FRACTION * (span.high - span.low) : undefined;
  return mutateSemanticPlan(
    adapter,
    plan,
    state,
    intent,
    { fields: [field], fieldCount: 1, continuousSigma },
    rng,
  );
}
