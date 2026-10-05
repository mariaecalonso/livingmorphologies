import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { visibleIds } from "./catalog";
import { buildSemanticHandoff, lobbyRealizationChecksum } from "./handoff";
import type { SemanticCandidate, SemanticRun } from "./types";

export const PUBLISHED_CATALOG_BUNDLE = "lobby-semantic-catalog-v1" as const;

export type PublishedCatalogStatus = "complete" | "blocked";

export type PublishedCandidate = {
  id: number;
  generation: number;
  origin: SemanticCandidate["origin"];
  plan: SemanticCandidate["plan"];
  state: SemanticCandidate["state"];
  objectives: SemanticCandidate["objectives"];
  criterionMatch: SemanticCandidate["criterionMatch"];
  observed: SemanticCandidate["observed"];
  fidelity: SemanticCandidate["fidelity"];
  current: SemanticCandidate["current"];
  lineage: SemanticCandidate["lineage"];
  preview: { size: number; file: string } | null;
};

/** The file Computer 3 reads. It is not the full local research run. */
export type PublishedCatalog = {
  schemaVersion: 3;
  bundle: typeof PUBLISHED_CATALOG_BUNDLE;
  status: PublishedCatalogStatus;
  archetypeId: string;
  purpose: SemanticRun["purpose"];
  provisional: boolean;
  calibration: SemanticRun["calibration"];
  evaluationSeed: number;
  completedGenerations: number;
  evaluations: number;
  fidelity: {
    method: string | null;
    status: string | null;
    warnings: string[];
    blocks: string[];
  };
  descriptor: {
    method: string | null;
    threshold: number | null;
    block: string | null;
  };
  catalog: SemanticRun["catalog"];
  candidates: PublishedCandidate[];
};

export type CatalogIndex = {
  bundle: typeof PUBLISHED_CATALOG_BUNDLE;
  archetypes: Record<string, { status: PublishedCatalogStatus; fidelity: string | null; warnings: string[]; blocks: string[]; catalogCandidates: number }>;
};

export function publicationProblems(run: SemanticRun, expectEvaluations = 400): string[] {
  const problems: string[] = [];
  if (run.completedGenerations !== 4) problems.push(`completed generations are ${run.completedGenerations}, not 4`);
  if (run.candidates.length !== expectEvaluations) problems.push(`evaluations are ${run.candidates.length}, not ${expectEvaluations}`);
  for (let generation = 1; generation <= 4; generation += 1) {
    const record = run.generations.find((item) => item.generation === generation);
    if (!record) problems.push(`generation ${generation} is missing`);
    else if (record.newCandidateIds.length !== expectEvaluations / 4) problems.push(`generation ${generation} does not have ${expectEvaluations / 4} new evaluations`);
    if (generation === 4 && record && !record.preservationApplied) problems.push("final preservation was not applied");
  }
  if (run.fidelityCalibration?.status === "block") problems.push("fidelity calibration blocked");
  if (!run.fidelityCalibration) problems.push("fidelity profile is missing");
  if (run.descriptorProfile?.block) problems.push(run.descriptorProfile.block);
  if (!run.descriptorProfile?.threshold) problems.push("diversity threshold is missing");
  if (!run.catalog.entries.length) problems.push("combined catalog is empty");
  for (const id of visibleIds(run.catalog)) {
    const candidate = run.candidates.find((item) => item.id === id);
    if (!candidate) problems.push(`catalog candidate ${id} is missing`);
    else if (!candidate.plan?.body || candidate.state.seed == null) problems.push(`catalog candidate ${id} cannot be replayed`);
  }
  return problems;
}

export function buildPublishedCatalog(run: SemanticRun): PublishedCatalog {
  const visible = new Set(visibleIds(run.catalog));
  return {
    schemaVersion: 3,
    bundle: PUBLISHED_CATALOG_BUNDLE,
    status: "complete",
    archetypeId: run.archetypeId,
    purpose: run.purpose,
    provisional: run.provisional,
    calibration: run.calibration,
    evaluationSeed: run.evaluationSeed,
    completedGenerations: run.completedGenerations,
    evaluations: run.candidates.length,
    fidelity: {
      method: run.fidelityCalibration?.method ?? null,
      status: run.fidelityCalibration?.status ?? null,
      warnings: run.fidelityCalibration?.diagnostics.warnings ?? [],
      blocks: run.fidelityCalibration?.diagnostics.blocks ?? [],
    },
    descriptor: {
      method: run.descriptorProfile?.method ?? null,
      threshold: run.descriptorProfile?.threshold?.value ?? null,
      block: run.descriptorProfile?.block ?? null,
    },
    catalog: run.catalog,
    candidates: run.candidates.filter((candidate) => visible.has(candidate.id)).map(publishCandidate),
  };
}

export function blockedCatalogRecord(run: SemanticRun): PublishedCatalog {
  return {
    ...buildPublishedCatalog(run),
    status: "blocked",
    catalog: { dedup: "uncalibrated", redundancyThreshold: null, entries: [] },
    candidates: [],
    fidelity: {
      method: run.fidelityCalibration?.method ?? null,
      status: "block",
      warnings: run.fidelityCalibration?.diagnostics.warnings ?? [],
      blocks: run.fidelityCalibration?.diagnostics.blocks ?? [run.descriptorProfile?.block ?? "blocked"],
    },
  };
}

/** Writes the catalog bundle. Does not copy the full research run or unseen previews. */
export function writePublishedCatalog(catalog: PublishedCatalog, directory: string, previewSourceDir?: string) {
  mkdirSync(directory, { recursive: true });
  const previewDir = join(directory, "previews");
  if (catalog.status === "complete" && previewSourceDir) mkdirSync(previewDir, { recursive: true });
  const candidates = catalog.candidates.map((candidate) => {
    if (catalog.status !== "complete" || !candidate.preview || !previewSourceDir) return { ...candidate, preview: null };
    const source = join(previewSourceDir, `${candidate.id}.png`);
    if (!existsSync(source)) return { ...candidate, preview: null };
    const file = join("previews", `${candidate.id}.png`).replace(/\\/g, "/");
    copyFileSync(source, join(directory, file));
    return { ...candidate, preview: { size: candidate.preview.size, file } };
  });
  const written = { ...catalog, candidates };
  writeFileSync(join(directory, "catalog.json"), JSON.stringify(written));
  return written;
}

export function loadPublishedCatalog(directory: string): PublishedCatalog {
  const catalog = JSON.parse(readFileSync(join(directory, "catalog.json"), "utf8")) as PublishedCatalog;
  if (catalog.status !== "complete" || catalog.bundle !== PUBLISHED_CATALOG_BUNDLE) {
    throw new Error(`${catalog.archetypeId} is not a completed catalog`);
  }
  return catalog;
}

export function replayPublishedCandidate(catalog: PublishedCatalog, candidateId: number) {
  if (catalog.status !== "complete") throw new Error(`${catalog.archetypeId} is not a completed catalog`);
  const candidate = catalog.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`candidate ${candidateId} is not in the published catalog`);
  const run = {
    schemaVersion: 3 as const,
    purpose: catalog.purpose,
    provisional: catalog.provisional,
    calibration: catalog.calibration,
    fidelityProfileId: catalog.fidelity.method,
    archetypeId: catalog.archetypeId,
    typologyId: "lobby",
    adapterId: "lobby",
    config: { populationSize: catalog.evaluations / 4, generations: 4, runSeed: 1, purpose: catalog.purpose, duplicateAttemptBudget: 1 },
    evaluationSeed: catalog.evaluationSeed,
    completedGenerations: catalog.completedGenerations,
    fidelityCalibration: null,
    pendingGeneration: null,
    descriptorProfile: null,
    candidates: catalog.candidates as unknown as SemanticRun["candidates"],
    generations: [],
    catalog: catalog.catalog,
  } satisfies SemanticRun;
  return buildSemanticHandoff(run, candidateId, lobbyRealizationChecksum);
}

function publishCandidate(candidate: SemanticCandidate): PublishedCandidate {
  return {
    id: candidate.id,
    generation: candidate.generation,
    origin: candidate.origin,
    plan: candidate.plan,
    state: candidate.state,
    objectives: candidate.objectives,
    criterionMatch: candidate.criterionMatch,
    observed: candidate.observed,
    fidelity: candidate.fidelity,
    current: candidate.current,
    lineage: candidate.lineage,
    preview: candidate.preview,
  };
}
