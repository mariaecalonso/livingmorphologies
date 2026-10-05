import type { ArchetypeSearchAdapter } from "./adapter";
import type {
  FidelityCalibrationRecord,
  FidelityCriterionRule,
  FidelityDetail,
  FidelityFence,
  SemanticCandidate,
} from "./types";

/**
 * Versioned method constants for `g01-lower-mode-v1`.
 * These decide when a gap or a collapse counts. They are not archetype floors.
 */
export const G01_LOWER_MODE_V1 = {
  gapNoise: 0.05,
  gapSigma: 2.5,
  madConsistency: 1.4826,
  isolateSigma: 8,
  isolateMaxCount: 2,
  isolateMaxFraction: 0.05,
  technicalWarn: 0.7,
  technicalBlock: 0.4,
  passWarn: 0.6,
  passBlock: 0.4,
  familyBlockCount: 3,
  familyWarnCount: 2,
  coverageWarnFraction: 0.5,
  cutFractionBlock: 0.15,
  cutFamilyConcentration: 0.7,
  collapsedRange: 0.02,
  saturatedLow: 0.95,
  saturatedHigh: 0.95,
  collapsedMedianBlock: 0.2,
} as const;

export const DEFERRED_FIDELITY_CRITERIA = [
  "spatial-permanence",
  "modularity",
  "circulation-integration",
  "collaboration",
  "social-proximity",
] as const;

export const QUESTIONABLE_FIDELITY_CRITERIA = ["receptivity"] as const;

const CATEGORIES = ["formal", "spatial", "atmospheric"] as const;
type Category = (typeof CATEGORIES)[number];

export function deriveG01Fidelity(
  candidates: readonly SemanticCandidate[],
  adapter: Pick<ArchetypeSearchAdapter, "archetypeId" | "primaryFamilyGene" | "genes" | "readGene">,
): FidelityCalibrationRecord {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const reference = candidates.filter((candidate) => candidate.technicalValid);
  const rules = new Map<string, FidelityCriterionRule>();
  const excluded: { id: string; reason: string }[] = [];
  const ids = criterionIds(candidates);

  for (const id of ids) {
    if ((DEFERRED_FIDELITY_CRITERIA as readonly string[]).includes(id)) {
      rules.set(id, emptyRule(false, "deferred"));
      excluded.push({ id, reason: "deferred" });
      continue;
    }
    if ((QUESTIONABLE_FIDELITY_CRITERIA as readonly string[]).includes(id)) {
      rules.set(id, emptyRule(false, "questionable"));
      excluded.push({ id, reason: "questionable" });
      warnings.push(`${id} is not a level-2 fidelity gate`);
      continue;
    }
    const values = reference.map((candidate) => candidate.criterionMatch[id]);
    if (values.some((value) => !Number.isFinite(value))) {
      blocks.push(`${id} has a non-finite match`);
      rules.set(id, emptyRule(false, "non-finite"));
      excluded.push({ id, reason: "non-finite" });
      continue;
    }
    if (collapsed(values)) {
      rules.set(id, emptyRule(false, "collapsed"));
      excluded.push({ id, reason: "collapsed" });
      warnings.push(`${id} collapsed and was removed from the fidelity gate`);
      continue;
    }
    if (saturated(values)) {
      rules.set(id, emptyRule(false, "saturated"));
      excluded.push({ id, reason: "saturated" });
      warnings.push(`${id} is saturated and was removed from the fidelity gate`);
      continue;
    }
    rules.set(id, { ...lowerModeFence(values), gated: true, reason: null });
  }

  const categoryRules = {} as FidelityCalibrationRecord["categoryRules"];
  const categoryValues = new Map<number, Record<Category, number | null>>();
  for (const category of CATEGORIES) {
    const inCategory = ids.filter((id) => categoryOf(candidates, id) === category);
    const excludedHere = inCategory.filter((id) => rules.get(id)?.gated !== true);
    const admitted = inCategory.filter((id) => rules.get(id)?.gated === true);
    const values = reference.map((candidate) => {
      const value = meanOf(candidate, admitted);
      const row = categoryValues.get(candidate.id) ?? { formal: null, spatial: null, atmospheric: null };
      row[category] = value;
      categoryValues.set(candidate.id, row);
      return value;
    });
    if (admitted.length === 0) {
      warnings.push(`${category} fidelity category has no admitted criteria`);
      categoryRules[category] = { ...emptyFence(), admittedCriteria: [], excludedCriteria: excludedHere };
      continue;
    }
    if (values.some((value) => value == null || !Number.isFinite(value))) {
      blocks.push(`${category} fidelity value is missing`);
      categoryRules[category] = { ...emptyFence(), admittedCriteria: admitted, excludedCriteria: excludedHere };
      continue;
    }
    const finite = values.filter((value): value is number => value != null);
    if (collapsed(finite) && median(finite) < G01_LOWER_MODE_V1.collapsedMedianBlock) {
      blocks.push(`${category} fidelity values collapsed at a low median`);
    } else if (collapsed(finite)) {
      warnings.push(`${category} fidelity values have no meaningful variance`);
    }
    categoryRules[category] = { ...lowerModeFence(finite), admittedCriteria: admitted, excludedCriteria: excludedHere };
  }

  const passed = new Set<number>();
  for (const candidate of reference) {
    const detail = detailFrom(candidate, rules, categoryRules, categoryValues.get(candidate.id) ?? null);
    if (detail.status === "pass") passed.add(candidate.id);
  }

  const family = familyReport(reference, passed, adapter);
  warnings.push(...family.warnings);
  blocks.push(...family.blocks);

  const technicalFraction = candidates.length === 0 ? 0 : reference.length / candidates.length;
  if (technicalFraction < G01_LOWER_MODE_V1.technicalBlock) blocks.push("technical validity collapsed");
  else if (technicalFraction < G01_LOWER_MODE_V1.technicalWarn) warnings.push("technical validity is low");

  const passFraction = reference.length === 0 ? 0 : passed.size / reference.length;
  if (reference.length > 0 && passFraction < G01_LOWER_MODE_V1.passBlock) blocks.push("fidelity pass rate is implausibly low");
  else if (reference.length > 0 && passFraction < G01_LOWER_MODE_V1.passWarn) warnings.push("fidelity pass rate is low");

  const cut = reference.filter((candidate) => !passed.has(candidate.id));
  if (reference.length > 0 && cut.length / reference.length >= G01_LOWER_MODE_V1.cutFractionBlock) {
    const counts = countFamilies(cut, adapter);
    const top = Math.max(0, ...Object.values(counts));
    if (top / cut.length >= G01_LOWER_MODE_V1.cutFamilyConcentration) {
      blocks.push("the fidelity cut is concentrated in one semantic family");
    }
  }

  return {
    method: "g01-lower-mode-v1",
    methodConstants: G01_LOWER_MODE_V1,
    status: blocks.length ? "block" : warnings.length ? "warn" : "pass",
    archetypeId: adapter.archetypeId,
    referenceCandidateIds: reference.map((candidate) => candidate.id),
    primaryFamilyGene: adapter.primaryFamilyGene ?? null,
    categoryRules,
    criterionRules: Object.fromEntries(rules),
    excludedCriteria: excluded,
    diagnostics: {
      population: candidates.length,
      technicalValid: reference.length,
      technicalInvalid: candidates.length - reference.length,
      fidelityPass: passed.size,
      fidelityFail: reference.length - passed.size,
      warnings,
      blocks,
    },
    familyCoverage: family.coverage,
  };
}

export function fidelityDetailFor(
  candidate: Pick<SemanticCandidate, "technicalValid" | "criterionMatch">,
  record: FidelityCalibrationRecord,
): FidelityDetail {
  if (!candidate.technicalValid) {
    return { status: "not-evaluated", profileId: record.method, categories: null, criteria: null, categoryValues: null };
  }
  const categoryValues = {
    formal: meanOf(candidate, record.categoryRules.formal.admittedCriteria),
    spatial: meanOf(candidate, record.categoryRules.spatial.admittedCriteria),
    atmospheric: meanOf(candidate, record.categoryRules.atmospheric.admittedCriteria),
  };
  const categories = {
    formal: passesFence(categoryValues.formal, record.categoryRules.formal),
    spatial: passesFence(categoryValues.spatial, record.categoryRules.spatial),
    atmospheric: passesFence(categoryValues.atmospheric, record.categoryRules.atmospheric),
  };
  const criteria: Record<string, boolean> = {};
  for (const [id, rule] of Object.entries(record.criterionRules)) {
    if (!rule.gated) continue;
    criteria[id] = passesFence(candidate.criterionMatch[id], rule);
  }
  const pass = categories.formal && categories.spatial && categories.atmospheric && Object.values(criteria).every(Boolean);
  return { status: pass ? "pass" : "fail", profileId: record.method, categories, criteria, categoryValues };
}

export function applyG01Fidelity<T extends SemanticCandidate>(candidates: readonly T[], record: FidelityCalibrationRecord): T[] {
  return candidates.map((candidate) => ({ ...candidate, fidelity: fidelityDetailFor(candidate, record) }));
}

function detailFrom(
  candidate: SemanticCandidate,
  rules: ReadonlyMap<string, FidelityCriterionRule>,
  categoryRules: FidelityCalibrationRecord["categoryRules"],
  values: Record<Category, number | null> | null,
): FidelityDetail {
  const categoryValues = values ?? { formal: null, spatial: null, atmospheric: null };
  const categories = {
    formal: passesFence(categoryValues.formal, categoryRules.formal),
    spatial: passesFence(categoryValues.spatial, categoryRules.spatial),
    atmospheric: passesFence(categoryValues.atmospheric, categoryRules.atmospheric),
  };
  const criteria: Record<string, boolean> = {};
  for (const [id, rule] of rules) {
    if (!rule.gated) continue;
    criteria[id] = passesFence(candidate.criterionMatch[id], rule);
  }
  const pass = categories.formal && categories.spatial && categories.atmospheric && Object.values(criteria).every(Boolean);
  return { status: pass ? "pass" : "fail", profileId: "g01-lower-mode-v1", categories, criteria, categoryValues };
}

function passesFence(value: number | null | undefined, fence: FidelityFence) {
  if (fence.floor == null) return true;
  return value != null && Number.isFinite(value) && value >= fence.floor;
}

function meanOf(candidate: Pick<SemanticCandidate, "criterionMatch">, ids: readonly string[]) {
  const values = ids.map((id) => candidate.criterionMatch[id]).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function lowerModeFence(values: readonly number[]): FidelityFence {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return emptyFence();
  const sorted = [...values].sort((a, b) => a - b);
  const mid = median(sorted);
  const body = sorted.filter((value) => value >= mid);
  const sigma = G01_LOWER_MODE_V1.madConsistency * mad(body, mid);
  const width = Math.max(G01_LOWER_MODE_V1.gapNoise, G01_LOWER_MODE_V1.gapSigma * sigma);
  let best: [number, number] | null = null;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const lower = sorted[index];
    const upper = sorted[index + 1];
    if (upper > mid) continue;
    if (upper - lower < width) continue;
    if (!best || upper > best[1]) best = [lower, upper];
  }
  if (best) return { floor: (best[0] + best[1]) / 2, median: mid, sigma, gap: best };
  if (sigma > 0) {
    const isolates = sorted.filter((value) => value < mid - G01_LOWER_MODE_V1.isolateSigma * sigma);
    const allowed = Math.min(G01_LOWER_MODE_V1.isolateMaxCount, Math.floor(sorted.length * G01_LOWER_MODE_V1.isolateMaxFraction));
    if (isolates.length > 0 && isolates.length <= allowed) {
      const highest = Math.max(...isolates);
      const next = sorted.find((value) => value > highest) ?? highest;
      return { floor: (highest + next) / 2, median: mid, sigma, gap: null };
    }
  }
  return { floor: null, median: mid, sigma, gap: null };
}

function familyReport(
  reference: readonly SemanticCandidate[],
  passed: ReadonlySet<number>,
  adapter: Pick<ArchetypeSearchAdapter, "primaryFamilyGene" | "genes" | "readGene">,
) {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const gene = adapter.primaryFamilyGene ?? null;
  if (!gene) {
    warnings.push("no primary family gene was declared");
    return { warnings, blocks, coverage: { before: {}, after: {}, unsampled: [], eliminated: [] } };
  }
  const before = countFamilies(reference, adapter);
  const after = countFamilies(reference.filter((candidate) => passed.has(candidate.id)), adapter);
  const legal = uniqueLegal(adapter, gene);
  const unsampled = legal.filter((value) => !before[value]);
  const eliminated = Object.keys(before).filter((value) => before[value] > 0 && !after[value]);
  for (const value of eliminated) {
    if (before[value] >= G01_LOWER_MODE_V1.familyBlockCount) blocks.push(`semantic family ${value} was eliminated`);
    else warnings.push(`semantic family ${value} was eliminated from a small sample`);
  }
  if (legal.length > 0 && Object.keys(before).length < legal.length * G01_LOWER_MODE_V1.coverageWarnFraction) {
    warnings.push("fewer than half of the declared semantic families were sampled");
  }
  return { warnings, blocks, coverage: { before, after, unsampled, eliminated } };
}

function countFamilies(
  candidates: readonly SemanticCandidate[],
  adapter: Pick<ArchetypeSearchAdapter, "primaryFamilyGene" | "readGene">,
) {
  const counts: Record<string, number> = {};
  const gene = adapter.primaryFamilyGene;
  if (!gene) return counts;
  for (const candidate of candidates) {
    const value = adapter.readGene(candidate.plan, gene);
    const key = value == null ? "missing" : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function uniqueLegal(adapter: Pick<ArchetypeSearchAdapter, "genes">, gene: string) {
  const found = adapter.genes().find((item) => item.name === gene);
  return [...new Set((found?.legal ?? []).map((value) => String(value)))];
}

function criterionIds(candidates: readonly SemanticCandidate[]) {
  const ids = new Set<string>();
  for (const candidate of candidates) for (const id of Object.keys(candidate.criterionMatch)) ids.add(id);
  return [...ids];
}

function categoryOf(candidates: readonly SemanticCandidate[], id: string): Category | null {
  for (const candidate of candidates) {
    const category = candidate.criterionCategory[id];
    if (category) return category;
  }
  return null;
}

function collapsed(values: readonly number[]) {
  if (!values.length) return true;
  return Math.max(...values) - Math.min(...values) < G01_LOWER_MODE_V1.collapsedRange;
}

function saturated(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.1) > G01_LOWER_MODE_V1.saturatedLow && percentile(sorted, 0.9) > G01_LOWER_MODE_V1.saturatedHigh;
}

function emptyRule(gated: boolean, reason: string | null): FidelityCriterionRule {
  return { ...emptyFence(), gated, reason };
}

function emptyFence(): FidelityFence {
  return { floor: null, median: null, sigma: null, gap: null };
}

function median(sorted: readonly number[]) {
  const mid = (sorted.length - 1) / 2;
  const low = Math.floor(mid);
  return sorted[low] + (sorted[Math.ceil(mid)] - sorted[low]) * (mid - low);
}

function mad(values: readonly number[], center: number) {
  if (!values.length) return 0;
  return median([...values].map((value) => Math.abs(value - center)).sort((a, b) => a - b));
}

function percentile(sorted: readonly number[], fraction: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
