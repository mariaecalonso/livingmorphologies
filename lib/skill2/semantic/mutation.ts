import type { ArchetypeSearchAdapter } from "./adapter";
import { semanticIdentity } from "./identity";
import type { FieldChange, MutationIntent, MutationProfile, RealizationState, SemanticPlan } from "./types";

export type MutationAttempt =
  | { status: "rejected"; reasons: string[] }
  | { status: "noop"; plan: SemanticPlan; state: RealizationState; changes: FieldChange[] }
  | {
      status: "changed";
      plan: SemanticPlan;
      state: RealizationState;
      changes: FieldChange[];
      repairedFields: string[];
    };

const INTENT_FIELDS = {
  "local-refinement": "pareto",
  "morphological-exploration": "diversity",
} as const;

export function mutateSemanticPlan(
  adapter: ArchetypeSearchAdapter,
  plan: SemanticPlan,
  state: RealizationState,
  intent: MutationIntent,
  profile: MutationProfile,
  rng: () => number,
): MutationAttempt {
  if (intent === "objective-specific") {
    throw new Error("specialist mutation refuses to guess a gene-to-objective mapping");
  }
  const names = fieldsFor(adapter, intent, profile);
  if (!names.length) return { status: "rejected", reasons: ["no fields"] };
  const chosen = pickFields(names, profile.fieldCount, rng);
  const genes = new Map(adapter.genes().map((gene) => [gene.name, gene]));
  let next = plan;
  const changes: FieldChange[] = [];
  for (const name of chosen) {
    const gene = genes.get(name);
    if (!gene || gene.kind === "derived" || gene.kind === "unused") {
      throw new Error(`field ${name} is not a mutable gene on ${adapter.archetypeId}`);
    }
    const oldValue = adapter.readGene(next, name);
    const requested = requestValue(gene.kind, gene.legal, oldValue, profile, rng);
    next = adapter.writeGene(next, name, requested);
    changes.push({ field: name, oldValue, requestedValue: requested, repairedValue: requested });
  }
  const repaired = adapter.repair(next);
  if (!repaired.ok) return { status: "rejected", reasons: repaired.reasons };
  const finalChanges = changes.map((change) => ({
    ...change,
    repairedValue: adapter.readGene(repaired.plan, change.field),
  }));
  const held = { ...state };
  if (semanticIdentity(repaired.plan, held) === semanticIdentity(plan, state)) {
    return { status: "noop", plan: repaired.plan, state: held, changes: finalChanges };
  }
  return { status: "changed", plan: repaired.plan, state: held, changes: finalChanges, repairedFields: repaired.repairedFields };
}

function fieldsFor(adapter: ArchetypeSearchAdapter, intent: Exclude<MutationIntent, "objective-specific">, profile: MutationProfile) {
  if (profile.fields && profile.fields.length) return [...profile.fields];
  if (profile.useProvisionalAffinity) {
    const affinity = adapter.provisionalAffinity;
    if (!affinity?.provisional) throw new Error(`${adapter.archetypeId} has no provisional mutation affinity`);
    const key = INTENT_FIELDS[intent];
    return [...affinity[key]];
  }
  throw new Error("mutation profile has no fields and did not opt into provisional affinity");
}

function pickFields(names: readonly string[], count: number, rng: () => number) {
  if (count < 1) throw new Error("mutation fieldCount must be at least 1");
  const pool = [...names];
  const chosen: string[] = [];
  while (pool.length && chosen.length < count) {
    const index = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  if (!chosen.length) throw new Error("mutation profile selected no fields");
  return chosen;
}

function requestValue(
  kind: "discrete" | "continuous" | "growth" | "derived" | "unused",
  legal: readonly (string | boolean)[] | undefined,
  oldValue: unknown,
  profile: MutationProfile,
  rng: () => number,
): unknown {
  if (kind === "continuous") {
    if (profile.continuousSigma == null) throw new Error("continuous mutation requires continuousSigma on the profile");
    if (typeof oldValue !== "number") throw new Error("continuous gene is not a number");
    return oldValue + gaussian(rng) * profile.continuousSigma;
  }
  if (!legal || legal.length < 2) throw new Error("discrete mutation requires at least two legal values");
  const others = legal.filter((value) => value !== oldValue);
  if (!others.length) throw new Error("discrete mutation has no alternative legal value");
  return others[Math.floor(rng() * others.length)];
}

function gaussian(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
