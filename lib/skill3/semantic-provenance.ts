import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SEMANTIC_RUN_ROOT, loadSemanticRun, semanticRunDirectory } from "@/lib/skill2/semantic/lobby-run";
import type { CrowdingValue, SemanticCandidate, SemanticRun } from "@/lib/skill2/semantic/types";

/**
 * Display projection of one semantic Skill 2 candidate.
 * The run file stays the record. This does not copy the plan or the search.
 */
export type SemanticProvenance = {
  generations: { id: string; status: "done" | "waiting"; front: number | null }[];
  objectives: { formal: number; spatial: number; atmospheric: number } | null;
  candidate: {
    id: number;
    generation: number;
    parentId: number | null;
    technicalValid: boolean;
    pareto: boolean;
    crowding: CrowdingValue | null;
    preview: boolean;
    /** Iteration stored in `z0/<id>.json`, when that metadata file is present. */
    z0Iteration: number | null;
  } | null;
};

export function loadSemanticProvenance(
  archetypeId: string,
  candidateId: number,
  root = SEMANTIC_RUN_ROOT,
): SemanticProvenance | null {
  try {
    const run = loadSemanticRun(archetypeId, root);
    if (!run || run.archetypeId !== archetypeId) return null;
    const selected = run.candidates.find((item) => item.id === candidateId) ?? null;
    return {
      generations: generationFronts(run),
      objectives: selected
        ? {
            formal: selected.objectives.formal,
            spatial: selected.objectives.spatial,
            atmospheric: selected.objectives.atmospheric,
          }
        : null,
      candidate: selected ? candidateProvenance(selected, root) : null,
    };
  } catch {
    return null;
  }
}

/** Serves only the preview path stored on that candidate. */
export function semanticPreviewPath(archetypeId: string, candidateId: number): string | null {
  try {
    const run = loadSemanticRun(archetypeId);
    const selected = run?.candidates.find((item) => item.id === candidateId);
    const file = selected?.preview?.file;
    if (!file || file !== `previews/${candidateId}.png`) return null;
    const path = join(semanticRunDirectory(archetypeId), file);
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

function generationFronts(run: SemanticRun): SemanticProvenance["generations"] {
  const generations: SemanticProvenance["generations"] = [];
  for (let index = 1; index <= run.config.generations; index += 1) {
    const record = run.generations.find((item) => item.generation === index);
    generations.push({
      id: `G${String(index).padStart(2, "0")}`,
      status: record ? "done" : "waiting",
      front: record ? record.paretoIds.length : null,
    });
  }
  return generations;
}

function candidateProvenance(candidate: SemanticCandidate, root: string): NonNullable<SemanticProvenance["candidate"]> {
  return {
    id: candidate.id,
    generation: candidate.generation,
    parentId: candidate.lineage.parentId,
    technicalValid: candidate.technicalValid,
    pareto: candidate.current.pareto,
    crowding: candidate.current.crowding,
    preview: candidate.preview?.file === `previews/${candidate.id}.png`,
    z0Iteration: readSnapshotIteration(candidate.archetypeId, candidate.id, root),
  };
}

function readSnapshotIteration(archetypeId: string, candidateId: number, root: string): number | null {
  const file = join(semanticRunDirectory(archetypeId, root), "z0", `${candidateId}.json`);
  if (!existsSync(file)) return null;
  try {
    const body = JSON.parse(readFileSync(file, "utf8")) as { iteration?: unknown };
    return typeof body.iteration === "number" && Number.isFinite(body.iteration) ? body.iteration : null;
  } catch {
    return null;
  }
}
