import type { RealizationState, SemanticPlan } from "./types";

export type GeneKind = "discrete" | "continuous" | "growth" | "derived" | "unused";

export type SemanticGene = {
  name: string;
  kind: GeneKind;
  legal?: readonly (string | boolean)[];
};

/**
 * What the evolution loop is allowed to ask an archetype.
 * Field names and repair rules stay inside the adapter.
 */
export type ArchetypeSearchAdapter = {
  id: string;
  archetypeId: string;
  typologyId: string;
  sampleExplorer(rng: () => number): { plan: SemanticPlan; state: RealizationState };
  genes(): readonly SemanticGene[];
  /**
   * Present only when this archetype has declared a provisional split.
   * It is not an objective-to-gene map and not a universal law.
   */
  provisionalAffinity?: {
    provisional: true;
    pareto: readonly string[];
    diversity: readonly string[];
  };
  /** One discrete gene that names the morphology family. Not a universal field. */
  primaryFamilyGene?: string | null;
  repair(
    plan: SemanticPlan,
  ): { ok: true; plan: SemanticPlan; repairedFields: string[] } | { ok: false; reasons: string[] };
  readGene(plan: SemanticPlan, name: string): unknown;
  writeGene(plan: SemanticPlan, name: string, value: unknown): SemanticPlan;
};
