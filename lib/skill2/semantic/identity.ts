import type { RealizationState, SemanticPlan } from "./types";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

/** Exact duplicate: same repaired semantic plan and same realization state. */
export function semanticIdentity(plan: SemanticPlan, state: RealizationState) {
  return canonicalJson({ plan, state });
}
