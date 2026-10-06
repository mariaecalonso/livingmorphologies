import type { SlimeControls } from "../../skill1/slime-controls";
import type { BiologicalTranslation } from "../../skill1/types";
import type { RealizationState, SemanticPlan } from "./types";

export type GeneKind = "discrete" | "continuous" | "growth" | "derived" | "unused";

/**
 * How Skill 2 may use an exposed gene.
 * `refine` is a local Pareto gene. `place` only locates the figure.
 * `explore` is available to Diversity. Datatype does not assign this role.
 */
export type GeneMutationRole = "refine" | "place" | "explore";

export type SemanticGene = {
  name: string;
  kind: GeneKind;
  legal?: readonly (string | boolean)[];
  /** Absent means the gene is exposed but not a mutation gene. */
  mutationRole?: GeneMutationRole;
};

/** Skill 1 drawing handed to the shared scorer. The simulation seed stays outside this record. */
export type SearchRealization =
  | { ok: true; agents: number; slime: SlimeControls; translation: BiologicalTranslation }
  | { ok: false; reasons: string[] };

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
  /** Skill 1 span for a refinement gene. Null means this gene is not refined. */
  span?(plan: SemanticPlan, name: string): { low: number; high: number } | null;
  /** Skill 1 realization for this stored plan. The scorer does not know the typology. */
  realize?(plan: SemanticPlan, state: RealizationState): SearchRealization;
};
