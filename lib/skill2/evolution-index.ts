import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "../skill1/archetypes";
import type { EvolutionRun } from "./evolution";
import type { Genome } from "./genome";

export type EvolutionCandidateView = {
  key: string;
  archetypeId: string;
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  /** Rank 1 inside this candidate's own generation. Distinct from the global archive. */
  pareto: boolean;
  paretoRank: number;
  archived: boolean;
  image: string | null;
  observed: Record<string, number>;
  parentId: number | null;
  genome: Genome;
};

export type EvolutionGenerationView = {
  id: string;
  index: number;
  status: "done" | "waiting";
  evaluated: number;
  feasible: number;
  pareto: number;
  archived: number;
  /** Unweighted global archive after this generation. Empty when the generation is not saved. */
  archiveIds: number[];
};

export type EvolutionArchetypeView = {
  archetypeId: string;
  name: string;
  typologyId: string;
  completedGenerations: number;
  generationCount: number;
  populationSize: number;
  generations: EvolutionGenerationView[];
  candidates: EvolutionCandidateView[];
  archiveCount: number;
};

export type EvolutionCatalog = {
  archetypes: EvolutionArchetypeView[];
};

const TYPOLOGY_ORDER = ["lobby", "workspace", "gathering"];

export function evolutionDir() {
  return join(process.cwd(), "data", "evolution");
}

export function loadEvolutionCatalog(): EvolutionCatalog {
  const dir = evolutionDir();
  if (!existsSync(dir)) return { archetypes: [] };
  const archetypes = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name))
    .map((entry) => loadArchetype(entry.name))
    .filter((item): item is EvolutionArchetypeView => item !== null)
    .sort(
      (a, b) =>
        TYPOLOGY_ORDER.indexOf(a.typologyId) - TYPOLOGY_ORDER.indexOf(b.typologyId) || a.name.localeCompare(b.name),
    );
  return { archetypes };
}

function loadArchetype(archetypeId: string): EvolutionArchetypeView | null {
  const file = join(evolutionDir(), archetypeId, "run.json");
  if (!existsSync(file)) return null;
  const run = JSON.parse(readFileSync(file, "utf8")) as EvolutionRun;
  if (run.archetypeId !== archetypeId) return null;
  const name = Object.values(ARCHETYPES).find((item) => item.id === archetypeId)?.name ?? archetypeId;
  const generations: EvolutionGenerationView[] = [];
  for (let index = 1; index <= run.config.generations; index += 1) {
    const record = run.generations.find((item) => item.generation === index);
    generations.push({
      id: `G${String(index).padStart(2, "0")}`,
      index,
      status: record ? "done" : "waiting",
      evaluated: record?.evaluated ?? 0,
      feasible: record?.feasible ?? 0,
      pareto: record?.frontIds.length ?? 0,
      archived: record?.archiveIds.length ?? 0,
      archiveIds: record?.archiveIds ?? [],
    });
  }
  const root = join(evolutionDir(), archetypeId);
  const candidates = run.candidates.map((candidate) => {
    const rel = candidate.preview.file;
    const hasImage = candidate.archived && rel.startsWith("archive/") && existsSync(join(root, rel));
    return {
      key: `${archetypeId}:${candidate.id}`,
      archetypeId,
      id: candidate.id,
      generation: candidate.generation,
      formal: candidate.objectives.formal,
      spatial: candidate.objectives.spatial,
      atmospheric: candidate.objectives.atmospheric,
      pareto: candidate.rank === 1,
      paretoRank: candidate.rank,
      archived: candidate.archived,
      image: hasImage ? `/api/evolution/${archetypeId}/${candidate.id}` : null,
      observed: candidate.observed,
      parentId: candidate.parentId,
      genome: candidate.genome,
    };
  });
  return {
    archetypeId,
    name,
    typologyId: run.typologyId,
    completedGenerations: run.completedGenerations,
    generationCount: run.config.generations,
    populationSize: run.config.populationSize,
    generations,
    candidates,
    archiveCount: run.archiveIds.length,
  };
}

export function archiveImagePath(archetypeId: string, id: string) {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || !/^\d+$/.test(id)) return null;
  const path = join(evolutionDir(), archetypeId, "archive", `${id}.png`);
  return existsSync(path) ? path : null;
}
