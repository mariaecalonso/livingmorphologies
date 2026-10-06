import type { ContinuationOrigin, NaturalContinuation, NaturalContinuationSet } from "./continuations";

/**
 * Production collection. One selected morphology per archetype.
 * A legacy single-record value is migrated on read.
 */
export const SKILL3_MORPHOLOGY_KEY = "lm-skill3-morphology";

/** Development fixture collection. Never written into the production key. */
export const SKILL3_FIXTURE_MORPHOLOGY_KEY = "lm-skill3-fixture-morphology";

export type SelectedSkill3Morphology = {
  origin: ContinuationOrigin;
  typologyId: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  runKey: string;
  continuationId: string;
  branchIndex: number;
  continuationSeed: number;
  z0Iteration: number;
  parentChecksum: string;
  acceptedIterations: number[];
  rules: {
    horizon: number;
    minGap: number;
    maxGap: number;
    deltaThreshold: number;
    envelope: {
      sizeX: number;
      sizeY: number;
      sizeZ: number;
    };
    morphology: "network";
    transform: "none";
  };
};

const ARCHETYPE_ID = /^[a-z0-9-]+$/;
const CONTINUATION_ID = /^N\d{2}$/;

export function morphologyStorageKey(origin: ContinuationOrigin) {
  return origin === "development-fixture" ? SKILL3_FIXTURE_MORPHOLOGY_KEY : SKILL3_MORPHOLOGY_KEY;
}

export function selectedMorphologyFrom(set: NaturalContinuationSet, continuation: NaturalContinuation): SelectedSkill3Morphology {
  return {
    origin: set.origin,
    typologyId: continuation.typologyId,
    archetypeId: continuation.archetypeId,
    archetypeName: continuation.archetypeName,
    candidateId: continuation.candidateId,
    runKey: continuation.runKey,
    continuationId: continuation.id,
    branchIndex: continuation.index,
    continuationSeed: continuation.continuationSeed,
    z0Iteration: continuation.z0Iteration,
    parentChecksum: continuation.parentChecksum,
    acceptedIterations: [...continuation.acceptedIterations],
    rules: {
      horizon: set.rules.horizon,
      minGap: set.rules.minGap,
      maxGap: set.rules.maxGap,
      deltaThreshold: set.rules.deltaThreshold,
      envelope: { ...set.rules.envelope },
      morphology: set.rules.morphology,
      transform: set.rules.transform,
    },
  };
}

/**
 * Stable identity only. Representative slot and display label are not compared.
 * A differing run key, checksum, seed, or accepted-iteration list is a different morphology.
 */
export function sameSelectedMorphology(stored: SelectedSkill3Morphology, continuation: NaturalContinuation) {
  return stored.archetypeId === continuation.archetypeId
    && stored.candidateId === continuation.candidateId
    && stored.runKey === continuation.runKey
    && stored.continuationId === continuation.id
    && stored.continuationSeed === continuation.continuationSeed
    && stored.parentChecksum === continuation.parentChecksum
    && stored.z0Iteration === continuation.z0Iteration
    && sameIterations(stored.acceptedIterations, continuation.acceptedIterations);
}

export function parseSelectedSkill3Morphology(value: unknown): SelectedSkill3Morphology | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SelectedSkill3Morphology>;
  if (record.origin !== "handoff" && record.origin !== "development-fixture") return null;
  if (!isText(record.typologyId) || !isArchetypeId(record.archetypeId) || !isText(record.archetypeName)) return null;
  if (!isPositiveInteger(record.candidateId) || !isText(record.runKey) || !isContinuationId(record.continuationId)) return null;
  if (!isPositiveInteger(record.branchIndex) || !isInteger(record.continuationSeed)) return null;
  if (!isInteger(record.z0Iteration) || record.z0Iteration < 0 || !isText(record.parentChecksum)) return null;
  const acceptedIterations = integerList(record.acceptedIterations);
  if (!acceptedIterations) return null;
  const rules = parseRules(record.rules);
  if (!rules) return null;
  return {
    origin: record.origin,
    typologyId: record.typologyId,
    archetypeId: record.archetypeId,
    archetypeName: record.archetypeName,
    candidateId: record.candidateId,
    runKey: record.runKey,
    continuationId: record.continuationId,
    branchIndex: record.branchIndex,
    continuationSeed: record.continuationSeed,
    z0Iteration: record.z0Iteration,
    parentChecksum: record.parentChecksum,
    acceptedIterations,
    rules,
  };
}

export type SelectedSkill3Collection = Record<string, SelectedSkill3Morphology>;

/** Every saved morphology for this origin. Keys are archetype ids. */
export function readSelectedSkill3Collection(origin: ContinuationOrigin): SelectedSkill3Collection {
  if (typeof window === "undefined") return {};
  const key = morphologyStorageKey(origin);
  const raw = window.localStorage.getItem(key);
  if (!raw) return {};
  try {
    const { collection, rewrite } = coerceCollection(JSON.parse(raw), origin);
    if (rewrite) persistCollection(key, collection);
    return collection;
  } catch {
    window.localStorage.removeItem(key);
    return {};
  }
}

export function readSelectedSkill3Morphology(origin: ContinuationOrigin, archetypeId: string): SelectedSkill3Morphology | null {
  return readSelectedSkill3Collection(origin)[archetypeId] ?? null;
}

/** Replaces only this archetype. Other archetypes in the same collection stay. */
export function writeSelectedSkill3Morphology(selection: SelectedSkill3Morphology) {
  const parsed = parseSelectedSkill3Morphology(selection);
  if (!parsed || typeof window === "undefined") return;
  const collection = readSelectedSkill3Collection(parsed.origin);
  collection[parsed.archetypeId] = parsed;
  persistCollection(morphologyStorageKey(parsed.origin), collection);
}

/** Removes one archetype. The other origin's collection is left untouched. */
export function clearSelectedSkill3Morphology(origin: ContinuationOrigin, archetypeId: string) {
  if (typeof window === "undefined") return;
  const collection = readSelectedSkill3Collection(origin);
  if (!collection[archetypeId]) return;
  delete collection[archetypeId];
  persistCollection(morphologyStorageKey(origin), collection);
}

function persistCollection(key: string, collection: SelectedSkill3Collection) {
  if (Object.keys(collection).length === 0) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(collection));
}

function coerceCollection(value: unknown, origin: ContinuationOrigin): { collection: SelectedSkill3Collection; rewrite: boolean } {
  const legacy = parseSelectedSkill3Morphology(value);
  if (legacy) {
    if (legacy.origin !== origin) return { collection: {}, rewrite: true };
    return { collection: { [legacy.archetypeId]: legacy }, rewrite: true };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { collection: {}, rewrite: true };
  const collection: SelectedSkill3Collection = {};
  let rewrite = false;
  for (const [id, entry] of Object.entries(value)) {
    const parsed = parseSelectedSkill3Morphology(entry);
    if (!parsed || parsed.origin !== origin || parsed.archetypeId !== id) {
      rewrite = true;
      continue;
    }
    collection[parsed.archetypeId] = parsed;
  }
  return { collection, rewrite };
}

function parseRules(value: unknown): SelectedSkill3Morphology["rules"] | null {
  if (!value || typeof value !== "object") return null;
  const rules = value as Partial<SelectedSkill3Morphology["rules"]>;
  const envelope = rules.envelope;
  if (!envelope || typeof envelope !== "object") return null;
  if (!isPositiveNumber(rules.horizon) || !isPositiveNumber(rules.minGap) || !isPositiveNumber(rules.maxGap)) return null;
  if (!isPositiveNumber(rules.deltaThreshold)) return null;
  if (!isPositiveNumber(envelope.sizeX) || !isPositiveNumber(envelope.sizeY) || !isPositiveNumber(envelope.sizeZ)) return null;
  if (rules.morphology !== "network" || rules.transform !== "none") return null;
  return {
    horizon: rules.horizon,
    minGap: rules.minGap,
    maxGap: rules.maxGap,
    deltaThreshold: rules.deltaThreshold,
    envelope: { sizeX: envelope.sizeX, sizeY: envelope.sizeY, sizeZ: envelope.sizeZ },
    morphology: "network",
    transform: "none",
  };
}

function sameIterations(stored: readonly number[], current: readonly number[]) {
  return stored.length === current.length && stored.every((iteration, index) => iteration === current[index]);
}

function integerList(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const iterations: number[] = [];
  for (const entry of value) {
    if (!isInteger(entry)) return null;
    iterations.push(entry);
  }
  return iterations;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isArchetypeId(value: unknown): value is string {
  return typeof value === "string" && ARCHETYPE_ID.test(value);
}

function isContinuationId(value: unknown): value is string {
  return typeof value === "string" && CONTINUATION_ID.test(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value >= 1;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
