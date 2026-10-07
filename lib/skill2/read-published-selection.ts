import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { loadVerifiedZ0 } from "@/lib/skill2/semantic/z0-snapshot";
import type { PublishedCandidate, PublishedCatalog } from "@/lib/skill2/semantic/publish-catalog";
import { parseSkill2Selection, type Skill2Selection } from "@/lib/skill2/published-selection";
import { semanticCatalogRoot, semanticPreviewPath } from "@/lib/skill2/published-catalog-view";

export type PublishedHandoff = "verified" | "pending";

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
