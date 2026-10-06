import { LOBBY_FIELD_GUIDE, type LobbyArchetypeId } from "../../skill1/lobby-realization";
import { descriptorDistance, DESCRIPTOR_V1_FEATURES } from "./descriptor-v1";
import type {
  DescriptorFeatureNorm,
  DescriptorV1Profile,
  PhenotypeRecord,
  SemanticCandidate,
  SemanticPlan,
  SemanticRun,
} from "./types";

/**
 * Field roles for the similarity audit.
 * A name receives a role only when that archetype's Skill 1 field guide lists it.
 * Placement names are the plan coordinates Skill 1 uses to position the figure.
 * Pose names are mirror, rotation, or approach direction on that same guide.
 * `index` is the realization salt copied onto the plan, not a semantic gene.
 */
const PLACEMENT_NAMES = new Set(["cx", "cy", "originX", "originY"]);
const POSE_NAMES = new Set(["flip", "twist", "axis"]);
const SALT_COPY_NAMES = new Set(["index"]);

export const DESCRIPTOR_FAMILIES = ["topology", "void", "concentration", "directionality", "path", "occupancy"] as const;
export type DescriptorFamily = (typeof DESCRIPTOR_FAMILIES)[number];

export type FieldRole = "family" | "growth" | "placement" | "pose" | "morphological" | "derived" | "unused" | "salt" | "unclassified";

export type FieldDifference = {
  field: string;
  role: FieldRole;
  left: unknown;
  right: unknown;
};

export type PlanComparison = {
  differingFields: FieldDifference[];
  fieldCount: number;
  familyDiffers: boolean;
  growthDiffers: boolean;
  placementOnly: boolean;
  poseOnly: boolean;
  placementOrPoseOnly: boolean;
  morphologyFieldDiffers: boolean;
};

export type CandidateAuditRecord = {
  id: number;
  archetypeId: string;
  generation: number;
  origin: SemanticCandidate["origin"];
  parentId: number | null;
  parentSelectionRole: SemanticCandidate["lineage"]["parentSelectionRole"];
  roles: string[];
  diversityProvenance: SemanticCandidate["current"]["diversity"];
  family: string | null;
  growth: string | null;
  plan: Record<string, unknown>;
  salt: { seed: number; attempt: number; index: number };
  formal: number;
  spatial: number;
  atmospheric: number;
  criterionMatch: Record<string, number>;
  featureVector: Record<string, number | null>;
  normalization: "descriptor-v1 locked G01";
  previewPath: string | null;
  visible: boolean;
  preserved: boolean;
  lineageDepth: number;
  childIds: number[];
  occupancyCellCount: number | null;
};

export type VisiblePair = {
  a: number;
  b: number;
  sameGeneration: boolean;
  directParentChild: boolean;
  sharedImmediateParent: boolean;
  commonAncestor: number | null;
  sameRoleCombination: boolean;
  sameFamily: boolean;
  sameGrowth: boolean | null;
  differingFields: string[];
  fieldRoles: string[];
  placementOnly: boolean;
  poseOnly: boolean;
  placementOrPoseOnly: boolean;
  morphologyFieldDiffers: boolean;
  deltaFormal: number;
  deltaSpatial: number;
  deltaAtmospheric: number;
  fsaEuclidean: number;
  descriptorDistance: number;
  familyDistances: Record<DescriptorFamily, number | null>;
};

export type ReviewPair = VisiblePair & {
  reasons: string[];
  flags: string[];
};

export type DistanceSummary = {
  count: number;
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
};

export type CatalogSimilarityAudit = {
  archetypeId: string;
  completedGenerations: number;
  fieldRoles: Record<string, FieldRole>;
  visibleIds: number[];
  preservedIds: number[];
  candidates: CandidateAuditRecord[];
  pairs: VisiblePair[];
  reviewPairs: ReviewPair[];
  normalization: DescriptorV1Profile;
  summary: AuditSummary;
  limitations: string[];
};

export type AuditSummary = {
  visibleCount: number;
  paretoCount: number;
  diversityTagCount: number;
  diversityRescueCount: number;
  paretoAndTagCount: number;
  semantic: {
    pairCount: number;
    sameFamilyFraction: number | null;
    sameFamilySameGrowthFraction: number | null;
    placementOnlyPairs: number;
    poseOnlyPairs: number;
    placementOrPoseOnlyPairs: number;
    morphologyDifferingPairs: number;
    directParentChildPairs: number;
  };
  descriptor: DistanceSummary;
  nearestNeighbor: DistanceSummary;
  roles: {
    pareto: RoleDistanceSummary;
    diversityTag: RoleDistanceSummary;
    diversityRescue: RoleDistanceSummary;
  };
  lineage: {
    visibleSiblingGroups: number;
    largestVisibleSiblingGroup: number;
    visibleDirectParentChildPairs: number;
  };
  rescueToNearestPareto: DistanceSummary;
  tagToNearestPareto: DistanceSummary;
  reviewPairCount: number;
  reviewLimits: string[];
};

export type RoleDistanceSummary = {
  count: number;
  medianNearestNeighbor: number | null;
};

const REVIEW_PARENT_CHILD_CAP = 30;
const REVIEW_PLACEMENT_CAP = 40;
const REVIEW_MISMATCH_CAP = 15;

export function lobbyFieldRoles(archetypeId: string): Map<string, FieldRole> {
  const guide = LOBBY_FIELD_GUIDE.find((item) => item.archetypeId === archetypeId);
  if (!guide) throw new Error(`${archetypeId} has no Lobby field guide for the similarity audit`);
  const roles = new Map<string, FieldRole>();
  const family = primaryFamilyGene(guide.archetypeId);
  for (const name of guide.genes) {
    if (name === family) roles.set(name, "family");
    else if (PLACEMENT_NAMES.has(name)) roles.set(name, "placement");
    else if (POSE_NAMES.has(name)) roles.set(name, "pose");
    else roles.set(name, "morphological");
  }
  if (guide.growthGene) roles.set(guide.growthGene, "growth");
  for (const name of guide.derived) roles.set(name, "derived");
  for (const name of guide.unused) roles.set(name, "unused");
  for (const name of SALT_COPY_NAMES) roles.set(name, "salt");
  return roles;
}

export function compareSemanticPlans(archetypeId: string, left: SemanticPlan, right: SemanticPlan): PlanComparison {
  const roles = lobbyFieldRoles(archetypeId);
  const a = planFields(left);
  const b = planFields(right);
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const differingFields: FieldDifference[] = [];
  for (const field of names) {
    if (sameValue(a[field], b[field])) continue;
    differingFields.push({ field, role: roles.get(field) ?? "unclassified", left: a[field] ?? null, right: b[field] ?? null });
  }
  const independent = differingFields.filter((difference) => difference.role !== "derived" && difference.role !== "unused" && difference.role !== "salt");
  const independentRoles = new Set(independent.map((difference) => difference.role));
  const only = (role: FieldRole) => independent.length > 0 && [...independentRoles].every((item) => item === role);
  return {
    differingFields,
    fieldCount: differingFields.length,
    familyDiffers: differingFields.some((difference) => difference.role === "family"),
    growthDiffers: differingFields.some((difference) => difference.role === "growth"),
    placementOnly: only("placement"),
    poseOnly: only("pose"),
    placementOrPoseOnly: independent.length > 0 && [...independentRoles].every((role) => role === "placement" || role === "pose"),
    morphologyFieldDiffers: independent.some((difference) => difference.role === "family" || difference.role === "growth" || difference.role === "morphological" || difference.role === "unclassified"),
  };
}

export function descriptorFamilyDistances(
  features: readonly DescriptorFeatureNorm[],
  left: { id: number; phenotype: PhenotypeRecord },
  right: { id: number; phenotype: PhenotypeRecord },
): Record<DescriptorFamily, number | null> {
  const distances = {} as Record<DescriptorFamily, number | null>;
  for (const family of DESCRIPTOR_FAMILIES) {
    const members = features.filter((feature) => feature.family === family);
    const distance = descriptorDistance(members)(left, right);
    distances[family] = Number.isFinite(distance) ? distance : null;
  }
  return distances;
}

export function auditCatalogSimilarity(run: SemanticRun): CatalogSimilarityAudit {
  const profile = run.descriptorProfile;
  if (!profile || profile.block || !profile.features.length) {
    throw new Error(`${run.archetypeId} has no locked descriptor-v1 profile`);
  }
  const roles = lobbyFieldRoles(run.archetypeId);
  const byId = new Map(run.candidates.map((candidate) => [candidate.id, candidate]));
  const children = new Map<number, number[]>();
  for (const candidate of run.candidates) {
    const parentId = candidate.lineage.parentId;
    if (parentId == null) continue;
    const list = children.get(parentId) ?? [];
    list.push(candidate.id);
    children.set(parentId, list);
  }
  const visible = new Set(run.catalog.entries.map((entry) => entry.representativeId));
  const hidden = run.catalog.entries.flatMap((entry) => entry.hiddenIds);
  const preserved = new Set<number>([...visible, ...hidden]);
  for (const candidate of run.candidates) {
    if (candidate.current.pareto || candidate.current.diversity !== "none" || candidate.current.specialist) preserved.add(candidate.id);
  }
  const relevant = run.candidates.filter((candidate) => preserved.has(candidate.id)).sort((a, b) => a.id - b.id);
  const candidates = relevant.map((candidate) => candidateRecord(run, candidate, roles, visible, preserved, children, byId));
  const visibleCandidates = candidates.filter((candidate) => candidate.visible);
  const distance = descriptorDistance(profile.features);
  const pairs: VisiblePair[] = [];
  for (let i = 0; i < visibleCandidates.length; i += 1) {
    for (let j = i + 1; j < visibleCandidates.length; j += 1) {
      pairs.push(visiblePair(run.archetypeId, visibleCandidates[i], visibleCandidates[j], byId, distance, profile.features));
    }
  }
  const descriptorValues = pairs.map((pair) => pair.descriptorDistance).sort((a, b) => a - b);
  const nearest = nearestNeighborDistances(visibleCandidates.map((candidate) => candidate.id), pairs);
  const review = selectReviewPairs(visibleCandidates, pairs, descriptorValues, nearest);
  const summary = summarize(visibleCandidates, pairs, descriptorValues, nearest, review);
  return {
    archetypeId: run.archetypeId,
    completedGenerations: run.completedGenerations,
    fieldRoles: Object.fromEntries(roles),
    visibleIds: visibleCandidates.map((candidate) => candidate.id),
    preservedIds: [...preserved].sort((a, b) => a - b),
    candidates,
    pairs,
    reviewPairs: review.pairs,
    normalization: profile,
    summary,
    limitations: [
      "The plan field index is the realization salt copied onto the plan. It is recorded on the salt and is not a semantic difference.",
      "Field roles come from that archetype's Lobby field guide. Placement and pose apply only to guide fields Skill 1 uses as coordinates, mirror, rotation, or approach direction.",
      "No duplicate threshold is applied. Quantiles in the review set are selectors for human inspection.",
      "The 20 by 20 occupancy grid stays in the source run. This audit records only its cell count.",
      ...review.limits,
    ],
  };
}

function candidateRecord(
  run: SemanticRun,
  candidate: SemanticCandidate,
  roles: ReadonlyMap<string, FieldRole>,
  visible: ReadonlySet<number>,
  preserved: ReadonlySet<number>,
  children: ReadonlyMap<number, number[]>,
  byId: ReadonlyMap<number, SemanticCandidate>,
): CandidateAuditRecord {
  const fields = planFields(candidate.plan);
  const familyName = [...roles.entries()].find(([, role]) => role === "family")?.[0] ?? null;
  const growthName = [...roles.entries()].find(([, role]) => role === "growth")?.[0] ?? null;
  return {
    id: candidate.id,
    archetypeId: candidate.archetypeId,
    generation: candidate.generation,
    origin: candidate.origin,
    parentId: candidate.lineage.parentId,
    parentSelectionRole: candidate.lineage.parentSelectionRole,
    roles: currentRoles(candidate),
    diversityProvenance: candidate.current.diversity,
    family: familyName ? textValue(fields[familyName]) : null,
    growth: growthName ? textValue(fields[growthName]) : null,
    plan: fields,
    salt: { seed: candidate.state.seed, attempt: candidate.state.attempt, index: candidate.state.index },
    formal: candidate.objectives.formal,
    spatial: candidate.objectives.spatial,
    atmospheric: candidate.objectives.atmospheric,
    criterionMatch: candidate.criterionMatch,
    featureVector: featureVector(candidate.phenotype),
    normalization: "descriptor-v1 locked G01",
    previewPath: previewPath(run.archetypeId, candidate),
    visible: visible.has(candidate.id),
    preserved: preserved.has(candidate.id),
    lineageDepth: lineageDepth(candidate.id, byId),
    childIds: [...(children.get(candidate.id) ?? [])].sort((a, b) => a - b),
    occupancyCellCount: candidate.phenotype.occupancy?.length ?? null,
  };
}

function visiblePair(
  archetypeId: string,
  left: CandidateAuditRecord,
  right: CandidateAuditRecord,
  byId: ReadonlyMap<number, SemanticCandidate>,
  distance: ReturnType<typeof descriptorDistance>,
  features: readonly DescriptorFeatureNorm[],
): VisiblePair {
  const leftCandidate = byId.get(left.id);
  const rightCandidate = byId.get(right.id);
  if (!leftCandidate || !rightCandidate) throw new Error("visible candidate is missing from the run");
  const comparison = compareSemanticPlans(archetypeId, leftCandidate.plan, rightCandidate.plan);
  const descriptor = distance(
    { id: left.id, phenotype: leftCandidate.phenotype },
    { id: right.id, phenotype: rightCandidate.phenotype },
  );
  const deltaFormal = Math.abs(left.formal - right.formal);
  const deltaSpatial = Math.abs(left.spatial - right.spatial);
  const deltaAtmospheric = Math.abs(left.atmospheric - right.atmospheric);
  const growthComparable = left.growth != null || right.growth != null;
  return {
    a: left.id,
    b: right.id,
    sameGeneration: left.generation === right.generation,
    directParentChild: left.parentId === right.id || right.parentId === left.id,
    sharedImmediateParent: left.parentId != null && left.parentId === right.parentId,
    commonAncestor: commonAncestor(left.id, right.id, byId),
    sameRoleCombination: left.roles.join("|") === right.roles.join("|"),
    sameFamily: left.family != null && left.family === right.family,
    sameGrowth: growthComparable ? left.growth === right.growth : null,
    differingFields: comparison.differingFields.map((difference) => difference.field),
    fieldRoles: comparison.differingFields.map((difference) => `${difference.field}:${difference.role}`),
    placementOnly: comparison.placementOnly,
    poseOnly: comparison.poseOnly,
    placementOrPoseOnly: comparison.placementOrPoseOnly,
    morphologyFieldDiffers: comparison.morphologyFieldDiffers,
    deltaFormal,
    deltaSpatial,
    deltaAtmospheric,
    fsaEuclidean: Math.sqrt(deltaFormal ** 2 + deltaSpatial ** 2 + deltaAtmospheric ** 2),
    descriptorDistance: descriptor,
    familyDistances: descriptorFamilyDistances(features, { id: left.id, phenotype: leftCandidate.phenotype }, { id: right.id, phenotype: rightCandidate.phenotype }),
  };
}

function selectReviewPairs(candidates: readonly CandidateAuditRecord[], pairs: readonly VisiblePair[], descriptorValues: readonly number[], nearest: ReadonlyMap<number, number>) {
  const limits: string[] = [];
  const selected = new Map<string, ReviewPair>();
  const add = (pair: VisiblePair, reason: string) => {
    const key = `${pair.a}-${pair.b}`;
    const existing = selected.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    selected.set(key, { ...pair, reasons: [reason], flags: reviewFlagsForPair(pair, candidates, quantile(descriptorValues, 0.25)) });
  };
  const byCandidate = new Map<number, VisiblePair[]>();
  for (const pair of pairs) {
    for (const id of [pair.a, pair.b]) {
      const list = byCandidate.get(id) ?? [];
      list.push(pair);
      byCandidate.set(id, list);
    }
  }
  for (const candidate of candidates) {
    const ordered = (byCandidate.get(candidate.id) ?? []).slice().sort((left, right) => left.descriptorDistance - right.descriptorDistance || left.a - right.a || left.b - right.b);
    if (ordered[0]) add(ordered[0], "nearest descriptor neighbor");
    if (ordered[1]) add(ordered[1], "second-nearest descriptor neighbor");
  }
  const closest = (predicate: (pair: VisiblePair) => boolean) =>
    pairs.filter(predicate).sort((left, right) => left.descriptorDistance - right.descriptorDistance || left.a - right.a || left.b - right.b)[0];
  const sameGrowth = closest((pair) => pair.sameFamily && pair.sameGrowth === true);
  const differentGrowth = closest((pair) => pair.sameFamily && pair.sameGrowth === false);
  const crossFamily = closest((pair) => !pair.sameFamily);
  if (sameGrowth) add(sameGrowth, "closest same family and same growth");
  if (differentGrowth) add(differentGrowth, "closest same family and different growth");
  if (crossFamily) add(crossFamily, "closest cross-family pair");
  const p10 = quantile(descriptorValues, 0.1);
  const lowParentChild = pairs
    .filter((pair) => pair.directParentChild && Number.isFinite(pair.descriptorDistance) && pair.descriptorDistance <= p10)
    .sort((left, right) => left.descriptorDistance - right.descriptorDistance || left.a - right.a);
  const parentSlice = cap(lowParentChild, REVIEW_PARENT_CHILD_CAP, "parent-child pairs at or below the pairwise descriptor p10", limits);
  for (const pair of parentSlice) add(pair, "parent-child at or below pairwise descriptor p10");
  const placement = cap(
    pairs.filter((pair) => pair.placementOnly).sort((left, right) => left.descriptorDistance - right.descriptorDistance || left.a - right.a),
    REVIEW_PLACEMENT_CAP,
    "placement-only pairs",
    limits,
  );
  for (const pair of placement) add(pair, "placement-only semantic difference");
  const pose = cap(
    pairs.filter((pair) => pair.poseOnly).sort((left, right) => left.descriptorDistance - right.descriptorDistance || left.a - right.a),
    REVIEW_PLACEMENT_CAP,
    "pose-like-only pairs",
    limits,
  );
  for (const pair of pose) add(pair, "pose-like-only semantic difference");
  const fsa = pairs.map((pair) => pair.fsaEuclidean).sort((a, b) => a - b);
  const descriptorP25 = quantile(descriptorValues, 0.25);
  const descriptorP75 = quantile(descriptorValues, 0.75);
  const fsaP25 = quantile(fsa, 0.25);
  const fsaP75 = quantile(fsa, 0.75);
  const lowDescriptorLargeScore = pairs
    .filter((pair) => pair.descriptorDistance <= descriptorP25 && pair.fsaEuclidean >= fsaP75)
    .sort((left, right) => right.fsaEuclidean - left.fsaEuclidean || left.descriptorDistance - right.descriptorDistance);
  for (const pair of lowDescriptorLargeScore.slice(0, REVIEW_MISMATCH_CAP)) add(pair, "low descriptor distance and large F/S/A distance");
  const highDescriptorSmallScore = pairs
    .filter((pair) => pair.descriptorDistance >= descriptorP75 && pair.fsaEuclidean <= fsaP25)
    .sort((left, right) => right.descriptorDistance - left.descriptorDistance || left.fsaEuclidean - right.fsaEuclidean);
  for (const pair of highDescriptorSmallScore.slice(0, REVIEW_MISMATCH_CAP)) add(pair, "high descriptor distance and small F/S/A distance");
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const paretoIds = candidates.filter((candidate) => candidate.roles.includes("pareto")).map((candidate) => candidate.id);
  for (const candidate of candidates.filter((item) => item.diversityProvenance === "rescue")) {
    const pair = closestTo(candidate.id, paretoIds, byCandidate);
    if (pair) add(pair, "diversity rescue closest pareto");
  }
  const preservedIds = candidates.map((candidate) => candidate.id);
  for (const candidate of candidates.filter((item) => item.diversityProvenance === "tag")) {
    const pair = closestTo(candidate.id, preservedIds.filter((id) => id !== candidate.id), byCandidate);
    if (pair) add(pair, "diversity tag nearest preserved neighbor");
  }
  return { pairs: [...selected.values()].sort((left, right) => left.a - right.a || left.b - right.b), limits };
}

function summarize(
  candidates: readonly CandidateAuditRecord[],
  pairs: readonly VisiblePair[],
  descriptorValues: readonly number[],
  nearest: ReadonlyMap<number, number>,
  review: { pairs: ReviewPair[]; limits: string[] },
): AuditSummary {
  const nearestValues = [...nearest.values()].sort((a, b) => a - b);
  const pareto = candidates.filter((candidate) => candidate.roles.includes("pareto"));
  const tags = candidates.filter((candidate) => candidate.diversityProvenance === "tag");
  const rescues = candidates.filter((candidate) => candidate.diversityProvenance === "rescue");
  const growthPairs = pairs.filter((pair) => pair.sameGrowth != null);
  const siblingSizes = siblingGroupSizes(candidates);
  return {
    visibleCount: candidates.length,
    paretoCount: pareto.length,
    diversityTagCount: tags.length,
    diversityRescueCount: rescues.length,
    paretoAndTagCount: candidates.filter((candidate) => candidate.roles.includes("pareto") && candidate.diversityProvenance === "tag").length,
    semantic: {
      pairCount: pairs.length,
      sameFamilyFraction: pairs.length ? pairs.filter((pair) => pair.sameFamily).length / pairs.length : null,
      sameFamilySameGrowthFraction: growthPairs.length ? growthPairs.filter((pair) => pair.sameFamily && pair.sameGrowth).length / growthPairs.length : null,
      placementOnlyPairs: pairs.filter((pair) => pair.placementOnly).length,
      poseOnlyPairs: pairs.filter((pair) => pair.poseOnly).length,
      placementOrPoseOnlyPairs: pairs.filter((pair) => pair.placementOrPoseOnly).length,
      morphologyDifferingPairs: pairs.filter((pair) => pair.morphologyFieldDiffers).length,
      directParentChildPairs: pairs.filter((pair) => pair.directParentChild).length,
    },
    descriptor: distanceSummary(descriptorValues),
    nearestNeighbor: distanceSummary(nearestValues),
    roles: {
      pareto: roleSummary(pareto, nearest),
      diversityTag: roleSummary(tags, nearest),
      diversityRescue: roleSummary(rescues, nearest),
    },
    lineage: {
      visibleSiblingGroups: siblingSizes.length,
      largestVisibleSiblingGroup: siblingSizes.length ? Math.max(...siblingSizes) : 0,
      visibleDirectParentChildPairs: pairs.filter((pair) => pair.directParentChild).length,
    },
    rescueToNearestPareto: distanceSummary(distancesToRole(rescues, pareto, pairs)),
    tagToNearestPareto: distanceSummary(distancesToRole(tags, pareto, pairs)),
    reviewPairCount: review.pairs.length,
    reviewLimits: review.limits,
  };
}

function roleSummary(candidates: readonly CandidateAuditRecord[], nearest: ReadonlyMap<number, number>): RoleDistanceSummary {
  const values = candidates.map((candidate) => nearest.get(candidate.id)).filter((value): value is number => value != null).sort((a, b) => a - b);
  return { count: candidates.length, medianNearestNeighbor: values.length ? quantile(values, 0.5) : null };
}

function distancesToRole(sources: readonly CandidateAuditRecord[], targets: readonly CandidateAuditRecord[], pairs: readonly VisiblePair[]) {
  const targetIds = new Set(targets.map((candidate) => candidate.id));
  const distances: number[] = [];
  for (const source of sources) {
    let best = Number.POSITIVE_INFINITY;
    for (const pair of pairs) {
      const other = pair.a === source.id ? pair.b : pair.b === source.id ? pair.a : null;
      if (other == null || !targetIds.has(other)) continue;
      if (pair.descriptorDistance < best) best = pair.descriptorDistance;
    }
    if (Number.isFinite(best)) distances.push(best);
  }
  return distances.sort((a, b) => a - b);
}

function siblingGroupSizes(candidates: readonly CandidateAuditRecord[]) {
  const groups = new Map<number, number>();
  for (const candidate of candidates) {
    if (candidate.parentId == null) continue;
    groups.set(candidate.parentId, (groups.get(candidate.parentId) ?? 0) + 1);
  }
  return [...groups.values()].filter((size) => size >= 2);
}

function nearestNeighborDistances(ids: readonly number[], pairs: readonly VisiblePair[]) {
  const best = new Map<number, number>();
  for (const id of ids) best.set(id, Number.POSITIVE_INFINITY);
  for (const pair of pairs) {
    for (const id of [pair.a, pair.b]) {
      const current = best.get(id) ?? Number.POSITIVE_INFINITY;
      if (pair.descriptorDistance < current) best.set(id, pair.descriptorDistance);
    }
  }
  for (const [id, value] of best) {
    if (!Number.isFinite(value)) best.delete(id);
  }
  return best;
}

function closestTo(id: number, targets: readonly number[], byCandidate: ReadonlyMap<number, VisiblePair[]>) {
  const target = new Set(targets);
  return (byCandidate.get(id) ?? [])
    .filter((pair) => target.has(pair.a === id ? pair.b : pair.a))
    .sort((left, right) => left.descriptorDistance - right.descriptorDistance || left.a - right.a)[0];
}

export function reviewFlagsForPair(pair: VisiblePair, candidates: readonly CandidateAuditRecord[], descriptorP25: number) {
  const flags: string[] = [];
  if (pair.placementOnly) flags.push("placement_only");
  if (pair.sameFamily && pair.sameGrowth === true) flags.push("same_family_same_growth");
  if (pair.descriptorDistance <= descriptorP25) flags.push("close_descriptor");
  if (!pair.sameFamily && pair.descriptorDistance <= descriptorP25) flags.push("cross_family_close");
  if (pair.directParentChild) flags.push("parent_child");
  const left = candidates.find((candidate) => candidate.id === pair.a);
  const right = candidates.find((candidate) => candidate.id === pair.b);
  const diversityVersusPareto =
    left != null &&
    right != null &&
    ((left.diversityProvenance !== "none" && right.roles.includes("pareto")) || (right.diversityProvenance !== "none" && left.roles.includes("pareto")));
  if (diversityVersusPareto) flags.push("diversity_vs_pareto");
  return flags;
}

function cap<T>(items: readonly T[], limit: number, label: string, notes: string[]) {
  if (items.length <= limit) return items;
  notes.push(`${label} included the ${limit} closest of ${items.length}.`);
  return items.slice(0, limit);
}

function distanceSummary(sorted: readonly number[]): DistanceSummary {
  if (!sorted.length) return { count: 0, min: null, p10: null, p25: null, median: null, p75: null, p90: null, max: null };
  return {
    count: sorted.length,
    min: sorted[0],
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1],
  };
}

function quantile(sorted: readonly number[], fraction: number) {
  if (!sorted.length) return Number.NaN;
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function currentRoles(candidate: SemanticCandidate) {
  const roles: string[] = [];
  if (candidate.current.pareto) roles.push("pareto");
  if (candidate.current.specialist) roles.push(`specialist-${candidate.current.specialist}`);
  if (candidate.current.diversity === "tag") roles.push("diversity-tag");
  if (candidate.current.diversity === "rescue") roles.push("diversity-rescue");
  return roles;
}

function previewPath(archetypeId: string, candidate: SemanticCandidate) {
  if (candidate.preview?.file) return `data/semantic-runs/${archetypeId}/${candidate.preview.file.replaceAll("\\", "/")}`;
  return null;
}

function featureVector(phenotype: PhenotypeRecord) {
  const vector: Record<string, number | null> = {};
  for (const feature of DESCRIPTOR_V1_FEATURES) vector[feature.id] = readFeature(phenotype, feature.id);
  return vector;
}

function readFeature(phenotype: PhenotypeRecord, id: string) {
  const measurements = measurementsOf(phenotype.raw);
  if (!measurements) return null;
  const [group, field] = id.split(".");
  const record = (measurements as Record<string, unknown>)[group];
  if (!record || typeof record !== "object" || !(field in record)) return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
}

function measurementsOf(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  if ("measurements" in raw) return (raw as { measurements: Record<string, unknown> }).measurements;
  if ("topology" in raw) return raw as Record<string, unknown>;
  return null;
}

export function planFields(plan: SemanticPlan): Record<string, unknown> {
  const body = plan.body;
  if (!body || typeof body !== "object") return {};
  const record = body as { plan?: unknown };
  const inner = record.plan && typeof record.plan === "object" ? (record.plan as Record<string, unknown>) : (body as Record<string, unknown>);
  return inner;
}

function textValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value == null ? null : JSON.stringify(value);
}

function sameValue(left: unknown, right: unknown) {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function primaryFamilyGene(archetypeId: LobbyArchetypeId) {
  if (archetypeId === "vertical-void") return "core";
  if (archetypeId === "continuous-hall") return "family";
  return "kind";
}

function lineageDepth(id: number, byId: ReadonlyMap<number, SemanticCandidate>) {
  let depth = 0;
  let current = byId.get(id);
  const seen = new Set<number>();
  while (current?.lineage.parentId != null && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = byId.get(current.lineage.parentId);
  }
  return depth;
}

function commonAncestor(leftId: number, rightId: number, byId: ReadonlyMap<number, SemanticCandidate>) {
  const ancestors = new Set<number>();
  let current = byId.get(leftId);
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.lineage.parentId == null) break;
    ancestors.add(current.lineage.parentId);
    current = byId.get(current.lineage.parentId);
  }
  current = byId.get(rightId);
  const seenRight = new Set<number>();
  while (current && !seenRight.has(current.id)) {
    seenRight.add(current.id);
    if (current.lineage.parentId == null) break;
    if (ancestors.has(current.lineage.parentId)) return current.lineage.parentId;
    current = byId.get(current.lineage.parentId);
  }
  return null;
}

export function renderReviewHtml(audit: CatalogSimilarityAudit) {
  const cards = audit.reviewPairs
    .map((pair) => {
      const left = audit.candidates.find((candidate) => candidate.id === pair.a);
      const right = audit.candidates.find((candidate) => candidate.id === pair.b);
      if (!left || !right) return "";
      return `<article class="pair" data-a="${pair.a}" data-b="${pair.b}">
        ${side(left)}
        ${side(right)}
        <div class="meta">
          <p><strong>descriptor-v1</strong> ${formatNumber(pair.descriptorDistance)}</p>
          <p>${familyLine(pair)}</p>
          <p><strong>fields</strong> ${escapeHtml(pair.differingFields.join(", ") || "(none)")}</p>
          <p><strong>placement only</strong> ${pair.placementOnly} · <strong>pose only</strong> ${pair.poseOnly}</p>
          <p><strong>lineage</strong> ${lineageText(pair)}</p>
          <p><strong>ΔF / ΔS / ΔA</strong> ${formatNumber(pair.deltaFormal)} / ${formatNumber(pair.deltaSpatial)} / ${formatNumber(pair.deltaAtmospheric)}</p>
          <p><strong>selected because</strong> ${escapeHtml(pair.reasons.join("; "))}</p>
          <p class="flags">${escapeHtml(pair.flags.join(" ") || "no diagnostic flags")}</p>
          <fieldset>
            <legend>Human label</legend>
            ${labelChoice(pair, "SAME_NEAR_DUPLICATE")}
            ${labelChoice(pair, "RELATED_MEANINGFULLY_DIFFERENT")}
            ${labelChoice(pair, "CLEARLY_DIFFERENT")}
            ${labelChoice(pair, "UNCERTAIN")}
            <label class="note">Note <input type="text" data-note="${pair.a}-${pair.b}" /></label>
          </fieldset>
        </div>
      </article>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(audit.archetypeId)} catalog similarity review</title>
  <style>
    body { margin: 24px; font: 14px/1.4 sans-serif; background: #f6f4ef; color: #1c1c1c; }
    h1 { font-size: 22px; font-weight: 600; }
    article { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: white; padding: 16px; margin: 16px 0; }
    .meta { grid-column: 1 / -1; }
    img { width: min(100%, 360px); background: #111; }
    .flags { color: #555; }
    fieldset { border: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
    .note { flex-basis: 100%; }
    button { margin-right: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(audit.archetypeId)} visible catalog review</h1>
  <p>${audit.summary.visibleCount} visible candidates, ${audit.summary.semantic.pairCount} pairwise comparisons, ${audit.reviewPairs.length} review pairs. Labels stay in this browser until export.</p>
  <p><button type="button" id="export">Export labels JSON</button></p>
  ${cards}
  <script>
    const storageKey = ${JSON.stringify(`lm-catalog-similarity:${audit.archetypeId}`)};
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    for (const [key, value] of Object.entries(saved)) {
      const label = document.querySelector('input[name="' + key + '"][value="' + value.label + '"]');
      if (label) label.checked = true;
      const note = document.querySelector('[data-note="' + key + '"]');
      if (note && value.note) note.value = value.note;
    }
    function readLabels() {
      const labels = {};
      for (const article of document.querySelectorAll("article.pair")) {
        const key = article.dataset.a + "-" + article.dataset.b;
        const chosen = article.querySelector('input[type="radio"]:checked');
        const note = article.querySelector("[data-note]");
        labels[key] = { a: Number(article.dataset.a), b: Number(article.dataset.b), humanLabel: chosen ? chosen.value : "", humanNote: note ? note.value : "" };
      }
      return labels;
    }
    function persist() { localStorage.setItem(storageKey, JSON.stringify(readLabels())); }
    document.body.addEventListener("change", persist);
    document.body.addEventListener("input", persist);
    document.getElementById("export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(Object.values(readLabels()), null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = ${JSON.stringify(`${audit.archetypeId}-human-labels.json`)};
      link.click();
    });
  </script>
</body>
</html>
`;
}

function side(candidate: CandidateAuditRecord) {
  const image = candidate.previewPath ? `<img src="${escapeHtml(previewSrc(candidate.previewPath))}" alt="Candidate ${candidate.id}" />` : "<p>No preview</p>";
  return `<section>
    ${image}
    <p><strong>${candidate.id}</strong> · G${candidate.generation} · ${escapeHtml(candidate.roles.join(", ") || "no role")}</p>
    <p>family ${escapeHtml(candidate.family ?? "none")} · growth ${escapeHtml(candidate.growth ?? "none")}</p>
    <p>F ${formatNumber(candidate.formal)} · S ${formatNumber(candidate.spatial)} · A ${formatNumber(candidate.atmospheric)}</p>
  </section>`;
}

function previewSrc(storedPath: string) {
  const file = storedPath.split("/").pop() ?? "";
  return `../../../semantic-runs/${storedPath.split("/")[2]}/previews/${file}`;
}

function familyLine(pair: VisiblePair) {
  const names: Record<DescriptorFamily, string> = {
    topology: "topology",
    void: "void",
    concentration: "concentration/distribution",
    directionality: "directionality/spread",
    path: "path/thickness",
    occupancy: "occupancy/density",
  };
  return DESCRIPTOR_FAMILIES.map((family) => `${names[family]} ${formatNumber(pair.familyDistances[family])}`).join(" · ");
}

function lineageText(pair: VisiblePair) {
  const parts = [
    pair.directParentChild ? "direct parent-child" : "not parent-child",
    pair.sharedImmediateParent ? "shared parent" : "no shared parent",
    pair.commonAncestor == null ? "no stored common ancestor" : `common ancestor ${pair.commonAncestor}`,
  ];
  return escapeHtml(parts.join("; "));
}

function labelChoice(pair: VisiblePair, label: string) {
  const key = `${pair.a}-${pair.b}`;
  return `<label><input type="radio" name="${key}" value="${label}" /> ${label}</label>`;
}

function formatNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(4);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
