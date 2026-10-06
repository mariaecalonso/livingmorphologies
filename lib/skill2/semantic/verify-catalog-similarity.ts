import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { auditCatalogSimilarity, compareSemanticPlans, descriptorFamilyDistances, lobbyFieldRoles, renderReviewHtml } from "./catalog-similarity";
import { descriptorDistance } from "./descriptor-v1";
import type { DescriptorFeatureNorm, SemanticCandidate, SemanticPlan, SemanticRun } from "./types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const topographicRoles = lobbyFieldRoles("topographic-ground-field");
assert(topographicRoles.get("kind") === "family", "topographic kind is the primary family");
assert(topographicRoles.get("originX") === "placement", "topographic origin is placement");
assert(topographicRoles.get("twist") === "pose", "topographic twist is pose");
assert(topographicRoles.get("scale") === "morphological", "topographic scale is morphological");
assert(topographicRoles.get("axis") == null, "axis is not invented for topographic");
assert(lobbyFieldRoles("vertical-void").get("axis") === "pose", "vertical void axis is pose because the field guide lists it");
assert(lobbyFieldRoles("vertical-void").get("core") === "family", "vertical void core is the primary family");
assert(lobbyFieldRoles("compressed-sequential").get("attractorsOnly") === "derived", "derived fields stay derived");

const placement = compareSemanticPlans("topographic-ground-field", plan("topographic-ground-field", { kind: "basin", growth: "pooled", originX: 1, originY: 2, twist: 0, flip: false, scale: 1, figure: "mound" }), plan("topographic-ground-field", { kind: "basin", growth: "pooled", originX: 4, originY: 2, twist: 0, flip: false, scale: 1, figure: "mound" }));
assert(placement.placementOnly, "an origin change is placement-only");
assert(!placement.morphologyFieldDiffers, "placement-only does not count as a morphology field");
const familyChange = compareSemanticPlans("topographic-ground-field", plan("topographic-ground-field", { kind: "basin", originX: 1 }), plan("topographic-ground-field", { kind: "ridge", originX: 1 }));
assert(familyChange.familyDiffers && familyChange.morphologyFieldDiffers && !familyChange.placementOnly, "a family change is not placement-only");
const pose = compareSemanticPlans("vertical-void", plan("vertical-void", { core: "court", cx: 1, cy: 2, axis: 0, aspect: 1 }), plan("vertical-void", { core: "court", cx: 1, cy: 2, axis: 1, aspect: 1 }));
assert(pose.poseOnly && pose.placementOrPoseOnly && !pose.placementOnly, "axis-only is pose-like");
const saltCopy = compareSemanticPlans("linear-gallery", plan("linear-gallery", { kind: "bar", index: 1, originX: 0 }), plan("linear-gallery", { kind: "bar", index: 9, originX: 0 }));
assert(saltCopy.fieldCount === 1 && !saltCopy.placementOnly && !saltCopy.morphologyFieldDiffers, "copied salt index is not a semantic morphology difference");

const features: DescriptorFeatureNorm[] = [
  { id: "topology.anisotropy", family: "directionality", p10: 0, p90: 10, robustRange: 10, active: true },
];
const left = phenotype(0);
const right = phenotype(5);
const forward = descriptorDistance(features)({ id: 1, phenotype: left }, { id: 2, phenotype: right });
const backward = descriptorDistance(features)({ id: 2, phenotype: right }, { id: 1, phenotype: left });
assert(forward === 0.5 && forward === backward, "descriptor distance uses the locked range and ignores pair order");
assert(descriptorFamilyDistances(features, { id: 1, phenotype: left }, { id: 2, phenotype: right }).directionality === 0.5, "family distance uses the same locked range");

const run = syntheticRun(features);
const before = statSync(resolve("data/semantic-runs/topographic-ground-field/run.json")).mtimeMs;
const audit = auditCatalogSimilarity(run);
assert(audit.pairs.length === 6, "four visible candidates produce six unique pairs");
assert(new Set(audit.pairs.map((pair) => `${pair.a}-${pair.b}`)).size === 6, "a pair is not emitted twice");
assert(audit.pairs.every((pair) => pair.a < pair.b), "pair order is stable");
const parentChild = audit.pairs.find((pair) => pair.a === 2 && pair.b === 4);
assert(parentChild?.directParentChild && parentChild.commonAncestor === 1, "lineage reads the stored parent chain");
const siblings = audit.pairs.find((pair) => pair.a === 2 && pair.b === 3);
assert(siblings?.sharedImmediateParent, "siblings share the stored parent");
assert(audit.pairs.find((pair) => pair.a === 1 && pair.b === 2)?.descriptorDistance === 0.5, "synthetic distance keeps the locked range of 10");
const storedRange = audit.normalization.features[0]?.robustRange;
assert(storedRange === 10, "normalization is the stored profile, not a catalog recomputation");
const html = renderReviewHtml(audit);
assert(html.includes("SAME_NEAR_DUPLICATE") && html.includes("RELATED_MEANINGFULLY_DIFFERENT") && html.includes("CLEARLY_DIFFERENT") && html.includes("UNCERTAIN"), "the review page offers the four human labels");
assert(!/<input[^>]*\schecked/.test(html), "the review page does not prefill a human label");

const topographicPath = resolve("data/semantic-runs/topographic-ground-field/run.json");
const topographic = JSON.parse(readFileSync(topographicPath, "utf8")) as SemanticRun;
const sample = topographic.candidates.filter((candidate) => topographic.catalog.entries.some((entry) => entry.representativeId === candidate.id)).slice(0, 2);
assert(sample.length === 2, "the stored catalog has two visible candidates to check");
const storedDistance = descriptorDistance(topographic.descriptorProfile!.features)(
  { id: sample[0].id, phenotype: sample[0].phenotype },
  { id: sample[1].id, phenotype: sample[1].phenotype },
);
const reversed = descriptorDistance(topographic.descriptorProfile!.features)(
  { id: sample[1].id, phenotype: sample[1].phenotype },
  { id: sample[0].id, phenotype: sample[0].phenotype },
);
assert(storedDistance === reversed && Number.isFinite(storedDistance), "stored descriptor-v1 distance is symmetric");
assert(statSync(topographicPath).mtimeMs === before, "reading the audit fixtures does not modify the topographic run");
console.log("catalog similarity audit checks passed");

function plan(archetypeId: string, fields: Record<string, unknown>): SemanticPlan {
  return { adapterId: "lobby", archetypeId, body: { archetypeId, plan: fields } };
}

function phenotype(anisotropy: number) {
  return { raw: { topology: { anisotropy } }, occupancy: null };
}

function syntheticRun(profileFeatures: DescriptorFeatureNorm[]): SemanticRun {
  const candidates = [1, 2, 3, 4].map((id) => candidate(id));
  return {
    schemaVersion: 3,
    purpose: "production",
    provisional: true,
    calibration: "calibrated",
    fidelityProfileId: null,
    archetypeId: "topographic-ground-field",
    typologyId: "lobby",
    adapterId: "lobby",
    config: { populationSize: 4, generations: 1, runSeed: 1, purpose: "production", duplicateAttemptBudget: 1, specialists: false },
    evaluationSeed: 1,
    completedGenerations: 1,
    fidelityCalibration: null,
    pendingGeneration: null,
    candidates,
    generations: [],
    catalog: { dedup: "uncalibrated", redundancyThreshold: null, entries: candidates.map((candidate) => ({ representativeId: candidate.id, hiddenIds: [], roleCount: 1 })) },
    descriptorProfile: { method: "descriptor-v1", features: profileFeatures, threshold: { eligibleCount: 4, nearestNeighbor: { min: 0.5, median: 0.5, max: 0.5 }, median: 0.5, mad: 0, sigma: 0, value: 0.5 }, block: null },
  };
}

function candidate(id: number): SemanticCandidate {
  const parentId = id === 1 ? null : id === 4 ? 2 : 1;
  return {
    id,
    archetypeId: "topographic-ground-field",
    typologyId: "lobby",
    generation: id === 4 ? 2 : 1,
    birthIndex: id,
    origin: parentId == null ? "explorer" : "mutant",
    plan: plan("topographic-ground-field", { kind: "basin", growth: "pooled", figure: "mound", originX: id, originY: 0, twist: 0, flip: false, scale: 1 }),
    state: { seed: id, attempt: 0, index: id },
    lineage: { parentId, parentSelectionRole: parentId == null ? null : "pareto", mutationIntent: parentId == null ? null : "local-refinement", changes: [], repairedFields: [] },
    evaluationSeed: 1,
    technicalValid: true,
    failureReason: null,
    objectives: { formal: id, spatial: 0, atmospheric: 0 },
    criterionMatch: { openness: id },
    observed: {},
    criterionCategory: {},
    fidelity: { status: "pass", profileId: null, categories: null, criteria: null, categoryValues: null },
    phenotype: phenotype(id === 1 ? 0 : 5),
    preview: { size: 20, file: `previews/${id}.png` },
    current: {
      pareto: id === 1,
      crowding: null,
      specialist: null,
      diversity: id === 2 ? "tag" : id === 3 ? "rescue" : "none",
    },
  };
}
