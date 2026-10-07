import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { semanticRunDir } from "@/lib/skill2/evolution-index";
import { loadSemanticRun } from "@/lib/skill2/semantic/lobby-run";
import type { SemanticCandidate, SemanticRun } from "@/lib/skill2/semantic/types";
import { loadVerifiedZ0, type Z0Meta } from "@/lib/skill2/semantic/z0-snapshot";
import type { PublishedCandidate, PublishedCatalog } from "@/lib/skill2/semantic/publish-catalog";
import { parseSkill2Selection, type Skill2Selection } from "@/lib/skill2/published-selection";
import { semanticCatalogRoot, semanticPreviewPath } from "@/lib/skill2/published-catalog-view";

export type PublishedHandoff = "verified" | "pending";

/**
 * The drawing on the catalog page. A finished local run supplies its catalog
 * representatives. Otherwise the published catalogue does.
 * Does not write the catalogue or rerun search.
 */
export function readCatalogSelection(archetypeId: string, candidateId: number): Skill2Selection | null {
  const run = finishedLocalRun(archetypeId);
  if (run) return selectionFromRun(run, candidateId);
  return readPublishedSelection(archetypeId, candidateId);
}

/** Verified only when the stored snapshot is this same drawing. */
export function catalogHandoff(archetypeId: string, candidateId: number): PublishedHandoff {
  const selection = readCatalogSelection(archetypeId, candidateId);
  if (!selection) return "pending";
  try {
    const loaded = loadVerifiedZ0(archetypeId, candidateId);
    if (!loaded || !snapshotMatchesSelection(loaded.meta, selection)) return "pending";
    return "verified";
  } catch {
    return "pending";
  }
}

/** Reads one stored catalogue candidate. Does not write the catalogue or rerun search. */
export function readPublishedSelection(archetypeId: string, candidateId: number): Skill2Selection | null {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || !Number.isInteger(candidateId)) return null;
  const file = join(semanticCatalogRoot(), archetypeId, "catalog.json");
  let catalog: PublishedCatalog;
  try {
    catalog = JSON.parse(readFileSync(file, "utf8")) as PublishedCatalog;
  } catch {
    return null;
  }
  if (catalog.archetypeId !== archetypeId) return null;
  const candidate = catalog.candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;
  return selectionFromCandidate(archetypeId, candidate);
}

export function publishedHandoff(archetypeId: string, candidateId: number): PublishedHandoff {
  try {
    return loadVerifiedZ0(archetypeId, candidateId) ? "verified" : "pending";
  } catch {
    return "pending";
  }
}

function finishedLocalRun(archetypeId: string): SemanticRun | null {
  const run = loadSemanticRun(archetypeId);
  if (!run || run.archetypeId !== archetypeId) return null;
  if (run.completedGenerations < run.config.generations) return null;
  if (!run.catalog.entries.length) return null;
  return run;
}

function selectionFromRun(run: SemanticRun, candidateId: number): Skill2Selection | null {
  const visible = run.catalog.entries.some((entry) => entry.representativeId === candidateId);
  if (!visible) return null;
  const candidate = run.candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;
  return selectionFromSemantic(candidate);
}

function selectionFromSemantic(candidate: SemanticCandidate): Skill2Selection | null {
  const previewName = `previews/${candidate.id}.png`;
  const previewFile =
    candidate.preview?.file === previewName && existsSync(join(semanticRunDir(), candidate.archetypeId, previewName))
      ? previewName
      : null;
  return parseSkill2Selection({
    archetypeId: candidate.archetypeId,
    typologyId: candidate.typologyId,
    candidateId: candidate.id,
    objectives: candidate.objectives,
    pareto: candidate.current.pareto,
    specialist: candidate.current.specialist,
    diversity: candidate.current.diversity,
    plan: candidate.plan,
    state: candidate.state,
    previewFile,
  });
}

export function snapshotMatchesSelection(meta: Z0Meta, selection: Skill2Selection) {
  if (meta.identity.archetypeId !== selection.archetypeId || meta.identity.candidateId !== selection.candidateId) return false;
  if (JSON.stringify(meta.identity.genome) !== JSON.stringify(selection.plan)) return false;
  if (meta.replay?.state && JSON.stringify(meta.replay.state) !== JSON.stringify(selection.state)) return false;
  return true;
}

function selectionFromCandidate(archetypeId: string, candidate: PublishedCandidate): Skill2Selection | null {
  const typologyId = Object.values(ARCHETYPES).find((item) => item.id === archetypeId)?.typologyId ?? "";
  const previewFile =
    candidate.preview?.file === `previews/${candidate.id}.png` && semanticPreviewPath(archetypeId, String(candidate.id))
      ? candidate.preview.file
      : null;
  return parseSkill2Selection({
    archetypeId,
    typologyId,
    candidateId: candidate.id,
    objectives: candidate.objectives,
    pareto: candidate.current.pareto,
    specialist: candidate.current.specialist,
    diversity: candidate.current.diversity,
    plan: candidate.plan,
    state: candidate.state,
    previewFile,
  });
}
