import type { FaceObservation } from "./face-sample";
import type { HybridCandidate, HybridMorphology } from "./candidate-field";

/**
 * Anchored latent field for the 5×5 hybrid matrix.
 * This is not a trained self-organizing map. Column parent weight and row
 * intensity are fixed. Only the free morphology channels may be separated.
 */

export const MIN_FEATURE_DISTANCE = 0.2;
const SEPARATION_ATTEMPTS = 6;
const CONSTANT_STD = 1e-8;

const FACE_FEATURES = [
  "aspect",
  "occupancy",
  "coverage",
  "extentRatio",
  "peakedness",
  "centroidU",
  "centroidV",
  "widthHeight",
  "directionalBias",
] as const;

const FREE_FEATURES = ["section", "curvature", "void", "branch"] as const;

type FreeFeature = (typeof FREE_FEATURES)[number];

export type FaceSummary = Record<(typeof FACE_FEATURES)[number], number>;

export type FeatureScale = {
  min: number[];
  span: number[];
};

export type FeatureDiversity = {
  accepted: boolean;
  minimumDistance: number;
  meanNeighborDistance: number;
  columnOrderValid: boolean;
  rowOrderValid: boolean;
  nearestPairs: Array<{ left: string; right: string; distance: number }>;
  reason: string;
};

const SECTION = { min: 0.55, max: 1.45 };
const CURVATURE = { min: 0, max: 1.35 };
const VOID = { min: 0, max: 1 };
const BRANCH = { min: 0, max: 4 };

export function summarizeFace(face: FaceObservation): FaceSummary {
  const u = finite(face.frame?.extent.u, 1);
  const v = finite(face.frame?.extent.v, 1);
  const safeU = Math.max(u, 1e-6);
  const safeV = Math.max(v, 1e-6);
  const aspect = Math.min(safeU, safeV) / Math.max(safeU, safeV);
  const counts = face.cells.length > 0 ? face.cells : [];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const resolution = Math.max(1, face.resolution || Math.round(Math.sqrt(counts.length)) || 1);
  let peakedness = 0;
  let centroidU = 0.5;
  let centroidV = 0.5;
  if (total > 0) {
    let alongU = 0;
    let alongV = 0;
    for (let index = 0; index < counts.length; index += 1) {
      const share = counts[index] / total;
      peakedness += share * share;
      const column = index % resolution;
      const row = Math.floor(index / resolution);
      alongU += share * ((column + 0.5) / resolution);
      alongV += share * ((row + 0.5) / resolution);
    }
    centroidU = alongU;
    centroidV = alongV;
  }
  return {
    aspect,
    occupancy: clamp01(finite(face.occupancy, 0)),
    coverage: clamp01(finite(face.coverage, 0)),
    extentRatio: safeU / (safeU + safeV),
    peakedness,
    centroidU,
    centroidV,
    widthHeight: Math.min(safeU / safeV, 4) / 4,
    directionalBias: Math.min(1, Math.hypot(centroidU - 0.5, centroidV - 0.5) * 2),
  };
}

export function featureNames(criteriaIds: readonly string[]) {
  return [
    "parentAWeight",
    "transformationIntensity",
    ...criteriaIds.map((id) => `criterion:${id}`),
    ...FACE_FEATURES,
    ...FREE_FEATURES,
  ];
}

export function anchorLatentField(candidates: readonly HybridCandidate[], faceA: FaceObservation, faceB: FaceObservation) {
  const summaryA = summarizeFace(faceA);
  const summaryB = summarizeFace(faceB);
  const criteriaIds = candidates[0]?.criteria.map((item) => item.criterionId) ?? [];
  const names = featureNames(criteriaIds);
  const offsets = candidates.map(() => zeroOffset());
  let next = candidates.map((candidate, index) => withMorphology(candidate, summaryA, summaryB, offsets[index]));
  let scaled = scaleField(next, summaryA, summaryB, names);
  let report = measureDiversity(next, scaled.values, names);
  for (let attempt = 1; attempt <= SEPARATION_ATTEMPTS && report.minimumDistance < MIN_FEATURE_DISTANCE; attempt += 1) {
    const closest = closestPair(next, scaled.values);
    if (!closest) break;
    const later = closest.left > closest.right ? closest.left : closest.right;
    const earlier = later === closest.left ? closest.right : closest.left;
    const signFor = (feature: FreeFeature) => {
      const delta = freeValue(next[later], feature) - freeValue(next[earlier], feature);
      if (Math.abs(delta) > 1e-6) return Math.sign(delta);
      return (later + attempt) % 2 === 0 ? 1 : -1;
    };
    offsets[later] = {
      section: offsets[later].section + 0.05 * signFor("section"),
      curvature: offsets[later].curvature + 0.08 * signFor("curvature"),
      void: offsets[later].void + 0.06 * signFor("void"),
      branch: offsets[later].branch + 0.35 * signFor("branch"),
    };
    next = candidates.map((candidate, index) => withMorphology(candidate, summaryA, summaryB, offsets[index]));
    scaled = scaleField(next, summaryA, summaryB, names);
    report = measureDiversity(next, scaled.values, names);
  }
  const anchored = next.map((candidate, index) => ({
    ...candidate,
    features: scaled.values[index],
  }));
  const readings = parentSimilarities(anchored, names, scaled.scale);
  return { candidates: anchored, featureNames: names, scale: scaled.scale, diversity: report, readings };
}

export function parentSimilarities(candidates: readonly HybridCandidate[], names: readonly string[], scale: FeatureScale) {
  const criteriaIds = names.filter((name) => name.startsWith("criterion:")).map((name) => name.slice("criterion:".length));
  const subspace = names.map((name, index) => ({ name, index })).filter((item) =>
    item.name === "parentAWeight" || item.name.startsWith("criterion:") || (FACE_FEATURES as readonly string[]).includes(item.name),
  ).map((item) => item.index);
  const referenceA = normalizeRaw(referenceRaw(candidates, criteriaIds, "A"), scale);
  const referenceB = normalizeRaw(referenceRaw(candidates, criteriaIds, "B"), scale);
  return candidates.map((candidate, index) => {
    const vector = candidate.features ?? [];
    return {
      id: candidate.id,
      parentA: similarity(vector, referenceA, subspace),
      parentB: similarity(vector, referenceB, subspace),
      transformationIntensity: candidate.transformationIntensity,
      nearest: nearestOf(index, candidates, vector),
    };
  });
}

function withMorphology(
  candidate: HybridCandidate,
  summaryA: FaceSummary,
  summaryB: FaceSummary,
  offset: HybridMorphology,
): HybridCandidate {
  const blend = mixSummary(summaryA, summaryB, candidate.parentBWeight);
  const rowSpan = candidate.row / 4;
  const columnSpan = (candidate.column - 2) / 2;
  const intensity = candidate.transformationIntensity;
  const morphology = {
    section: clamp(
      0.84 + (blend.aspect - 0.7) * 0.4 + columnSpan * 0.1 * (0.4 + intensity) + offset.section,
      SECTION.min,
      SECTION.max,
    ),
    curvature: clamp((0.12 + blend.directionalBias) * rowSpan * 1.2 + offset.curvature, CURVATURE.min, CURVATURE.max),
    void: clamp((0.15 + (1 - blend.occupancy) * 0.7) * rowSpan + offset.void, VOID.min, VOID.max),
    branch: clamp(candidate.row === 0 ? offset.branch : rowSpan * 3 + blend.peakedness * rowSpan + offset.branch, BRANCH.min, BRANCH.max),
  };
  return { ...candidate, morphology };
}

function scaleField(candidates: readonly HybridCandidate[], summaryA: FaceSummary, summaryB: FaceSummary, names: readonly string[]) {
  const raw = candidates.map((candidate) => rawVector(candidate, summaryA, summaryB, names));
  const scale = featureScale(raw);
  return { values: raw.map((vector) => normalizeRaw(vector, scale)), scale };
}

function rawVector(candidate: HybridCandidate, summaryA: FaceSummary, summaryB: FaceSummary, names: readonly string[]) {
  const blend = mixSummary(summaryA, summaryB, candidate.parentBWeight);
  const morphology = candidate.morphology ?? { section: 1, curvature: 0, void: 0, branch: 0 };
  const criteria = new Map(candidate.criteria.map((item) => [item.criterionId, item.value]));
  return names.map((name) => {
    if (name === "parentAWeight") return candidate.parentAWeight;
    if (name === "transformationIntensity") return candidate.transformationIntensity;
    if (name.startsWith("criterion:")) return finite(criteria.get(name.slice("criterion:".length)), 0);
    if ((FREE_FEATURES as readonly string[]).includes(name)) return morphology[name as FreeFeature];
    return blend[name as keyof FaceSummary];
  });
}

function referenceRaw(candidates: readonly HybridCandidate[], criteriaIds: readonly string[], side: "A" | "B") {
  const source = candidates[0];
  const criteria = new Map(source?.criteria.map((item) => [item.criterionId, side === "A" ? item.catalogA ?? item.catalogB ?? item.value : item.catalogB ?? item.catalogA ?? item.value]) ?? []);
  const names = featureNames(criteriaIds);
  if (!source) return names.map(() => 0);
  const summary = summarizeStored(candidates, side);
  const holder: HybridCandidate = {
    ...source,
    parentAWeight: side === "A" ? 0.95 : 0.05,
    parentBWeight: side === "A" ? 0.05 : 0.95,
    transformationIntensity: 0,
    criteria: criteriaIds.map((criterionId) => ({
      criterionId,
      value: finite(criteria.get(criterionId), 0),
      catalogA: null,
      catalogB: null,
      role: "shared" as const,
      clamped: false,
    })),
    morphology: { section: 0, curvature: 0, void: 0, branch: 0 },
  };
  return rawVector(holder, summary, summary, names);
}

function summarizeStored(candidates: readonly HybridCandidate[], side: "A" | "B"): FaceSummary {
  const face = side === "A" ? candidates[0]?.generationInput.faceA : candidates[0]?.generationInput.faceB;
  if (!face) {
    return { aspect: 1, occupancy: 0, coverage: 0, extentRatio: 0.5, peakedness: 0, centroidU: 0.5, centroidV: 0.5, widthHeight: 0.25, directionalBias: 0 };
  }
  return summarizeFace(face);
}

function featureScale(raw: readonly (readonly number[])[]): FeatureScale {
  const width = raw[0]?.length ?? 0;
  const min = Array<number>(width).fill(Number.POSITIVE_INFINITY);
  const max = Array<number>(width).fill(Number.NEGATIVE_INFINITY);
  for (const vector of raw) {
    for (let index = 0; index < width; index += 1) {
      const value = vector[index];
      if (!Number.isFinite(value)) continue;
      min[index] = Math.min(min[index], value);
      max[index] = Math.max(max[index], value);
    }
  }
  const span = min.map((start, index) => {
    const end = max[index];
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    const widthOfFeature = end - start;
    return widthOfFeature < CONSTANT_STD ? 0 : widthOfFeature;
  });
  return { min, span };
}

function normalizeRaw(vector: readonly number[], scale: FeatureScale) {
  return vector.map((value, index) => {
    const spread = scale.span[index] ?? 0;
    if (!(spread > 0) || !Number.isFinite(value)) return 0;
    return (value - scale.min[index]) / spread;
  });
}

function measureDiversity(candidates: readonly HybridCandidate[], vectors: readonly (readonly number[])[], names: readonly string[]): FeatureDiversity {
  const pairs = pairDistances(candidates, vectors);
  const minimumDistance = pairs.reduce((best, pair) => Math.min(best, pair.distance), Number.POSITIVE_INFINITY);
  const neighborDistances = neighborDistanceList(candidates, vectors);
  const meanNeighborDistance = neighborDistances.reduce((sum, value) => sum + value, 0) / Math.max(1, neighborDistances.length);
  const columnOrderValid = columnOrder(candidates, vectors, names);
  const rowOrderValid = rowOrder(candidates);
  const finiteMinimum = Number.isFinite(minimumDistance) ? minimumDistance : 0;
  const accepted = finiteMinimum >= MIN_FEATURE_DISTANCE && columnOrderValid && rowOrderValid;
  const reason = accepted
    ? "The 25 feature vectors are distinct and the column and row axes hold."
    : finiteMinimum < MIN_FEATURE_DISTANCE
      ? `Two candidate vectors are closer than ${MIN_FEATURE_DISTANCE}. No mesh field was generated.`
      : !columnOrderValid
        ? "Column order does not progress from Parent A toward Parent B. No mesh field was generated."
        : "Row order does not progress from restrained toward exploratory. No mesh field was generated.";
  return {
    accepted,
    minimumDistance: round(finiteMinimum),
    meanNeighborDistance: round(meanNeighborDistance),
    columnOrderValid,
    rowOrderValid,
    nearestPairs: pairs.sort((left, right) => left.distance - right.distance).slice(0, 3).map((pair) => ({
      left: candidates[pair.left].id,
      right: candidates[pair.right].id,
      distance: round(pair.distance),
    })),
    reason,
  };
}

function columnOrder(candidates: readonly HybridCandidate[], vectors: readonly (readonly number[])[], names: readonly string[]) {
  const parentIndex = names.indexOf("parentAWeight");
  if (parentIndex < 0) return false;
  for (let row = 0; row < 5; row += 1) {
    const cells = candidates
      .map((candidate, index) => ({ candidate, value: vectors[index]?.[parentIndex] ?? 0 }))
      .filter((item) => item.candidate.row === row)
      .sort((left, right) => left.candidate.column - right.candidate.column);
    for (let index = 1; index < cells.length; index += 1) {
      if (cells[index].value > cells[index - 1].value + 1e-6) return false;
    }
  }
  return true;
}

function rowOrder(candidates: readonly HybridCandidate[]) {
  for (let column = 0; column < 5; column += 1) {
    const cells = candidates.filter((candidate) => candidate.column === column).sort((left, right) => left.row - right.row);
    for (let index = 1; index < cells.length; index += 1) {
      if (!(cells[index].transformationIntensity > cells[index - 1].transformationIntensity)) return false;
    }
  }
  return true;
}

function nearestOf(index: number, candidates: readonly HybridCandidate[], vector: readonly number[]) {
  let nearest = candidates[index === 0 ? 1 : 0]?.id ?? candidates[index].id;
  let distance = Number.POSITIVE_INFINITY;
  for (let other = 0; other < candidates.length; other += 1) {
    if (other === index) continue;
    const span = euclidean(vector, candidates[other].features ?? []);
    if (span < distance) {
      distance = span;
      nearest = candidates[other].id;
    }
  }
  return { id: nearest, distance: round(Number.isFinite(distance) ? distance : 0) };
}

function similarity(vector: readonly number[], reference: readonly number[], subspace: readonly number[]) {
  const distance = Math.sqrt(subspace.reduce((sum, index) => {
    const delta = (vector[index] ?? 0) - (reference[index] ?? 0);
    return sum + delta * delta;
  }, 0));
  return round(1 / (1 + distance));
}

function pairDistances(candidates: readonly HybridCandidate[], vectors: readonly (readonly number[])[]) {
  const pairs: Array<{ left: number; right: number; distance: number }> = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      pairs.push({ left, right, distance: euclidean(vectors[left], vectors[right]) });
    }
  }
  return pairs;
}

function neighborDistanceList(candidates: readonly HybridCandidate[], vectors: readonly (readonly number[])[]) {
  const indexOf = new Map(candidates.map((candidate, index) => [`${candidate.row}:${candidate.column}`, index]));
  const distances: number[] = [];
  for (const candidate of candidates) {
    const here = indexOf.get(`${candidate.row}:${candidate.column}`)!;
    for (const next of [[0, 1], [1, 0]] as const) {
      const other = indexOf.get(`${candidate.row + next[0]}:${candidate.column + next[1]}`);
      if (other === undefined) continue;
      distances.push(euclidean(vectors[here], vectors[other]));
    }
  }
  return distances;
}

function closestPair(candidates: readonly HybridCandidate[], vectors: readonly (readonly number[])[]) {
  return pairDistances(candidates, vectors).sort((left, right) => left.distance - right.distance)[0] ?? null;
}

function freeValue(candidate: HybridCandidate, feature: FreeFeature) {
  return candidate.morphology?.[feature] ?? 0;
}

function mixSummary(left: FaceSummary, right: FaceSummary, parentB: number): FaceSummary {
  const blend = (key: keyof FaceSummary) => left[key] * (1 - parentB) + right[key] * parentB;
  return {
    aspect: blend("aspect"),
    occupancy: blend("occupancy"),
    coverage: blend("coverage"),
    extentRatio: blend("extentRatio"),
    peakedness: blend("peakedness"),
    centroidU: blend("centroidU"),
    centroidV: blend("centroidV"),
    widthHeight: blend("widthHeight"),
    directionalBias: blend("directionalBias"),
  };
}

function zeroOffset(): HybridMorphology {
  return { section: 0, curvature: 0, void: 0, branch: 0 };
}

function euclidean(left: readonly number[], right: readonly number[]) {
  let sum = 0;
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (!Number.isFinite(delta)) return Number.POSITIVE_INFINITY;
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function finite(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
